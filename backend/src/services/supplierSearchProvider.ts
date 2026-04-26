import { config, getMissingServiceMessage } from "../lib/config.js";
import type {
  FinalExperimentPlan,
  FinalPlanConfidence,
  FinalPlanResource,
  ProcurementReport,
  ProcurementResourceItem,
  Project,
  ResourceTaskReference,
  SupplierCandidate,
  SupplierDirectoryEntry,
} from "../lib/projectTypes.js";
import { logger } from "../lib/logger.js";

type ResourceCategory = ProcurementResourceItem["category"];
type SupplierResultType = SupplierCandidate["result_type"];

const SUPPLIERS: SupplierDirectoryEntry[] = [
  {
    supplier_id: "thermo_fisher",
    name: "Thermo Fisher",
    homepage_url: "https://www.thermofisher.com",
    resource_url:
      "https://www.thermofisher.com/us/en/home/technical-resources/application-notes.html",
    focus: "Application notes, protocols, and product workflows",
  },
  {
    supplier_id: "sigma_aldrich",
    name: "Sigma-Aldrich",
    homepage_url: "https://www.sigmaaldrich.com",
    resource_url: "https://www.sigmaaldrich.com/US/en/technical-documents",
    focus: "Technical bulletins, protocols, and product documents",
  },
  {
    supplier_id: "promega",
    name: "Promega",
    homepage_url: "https://www.promega.com",
    resource_url: "https://www.promega.com/resources/protocols",
    focus: "Protocols and technical manuals",
  },
  {
    supplier_id: "qiagen",
    name: "Qiagen",
    homepage_url: "https://www.qiagen.com",
    resource_url: "https://www.qiagen.com/us/resources/resourcedetail?id=protocols",
    focus: "Protocols, kit workflows, and resource documents",
  },
  {
    supplier_id: "idt",
    name: "IDT",
    homepage_url: "https://www.idtdna.com",
    resource_url: "https://www.idtdna.com/pages/tools",
    focus: "Primer design, qPCR tools, and oligo resources",
  },
];

const SUPPLIER_DOMAINS = [
  "thermofisher.com",
  "sigmaaldrich.com",
  "promega.com",
  "qiagen.com",
  "idtdna.com",
];

const reportCache = new Map<string, ProcurementReport>();

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 52) || "resource"
  );
}

function resourceKey(resource: FinalPlanResource): string {
  return [
    normalizeName(resource.name),
    normalizeName(resource.quantity ?? ""),
    normalizeName(resource.unit ?? ""),
  ].join("|");
}

function resourceMatches(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

function dedupeResources(resources: FinalPlanResource[]): FinalPlanResource[] {
  const seen = new Set<string>();
  const output: FinalPlanResource[] = [];
  for (const resource of resources) {
    if (!resource.name?.trim()) continue;
    const key = resourceKey(resource);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(resource);
  }
  return output;
}

function resourcesFromPlan(plan: FinalExperimentPlan): FinalPlanResource[] {
  const fromReport = plan.stats_report.purchase_list ?? [];
  const fromTasks =
    plan.tasks?.flatMap((task) => [
      ...(task.items_to_buy ?? []),
      ...task.materials_required.filter((item) => item.availability !== "available"),
      ...task.equipment_required.filter((item) => item.availability !== "available"),
    ]) ?? [];
  const fromNodes = plan.nodes.flatMap((node) => [
    ...node.materials_to_buy,
    ...node.materials_required.filter((item) => item.availability !== "available"),
    ...node.equipment_required.filter((item) => item.availability !== "available"),
  ]);
  return dedupeResources([...fromReport, ...fromTasks, ...fromNodes]);
}

function sourceTasksForResource(
  plan: FinalExperimentPlan,
  resource: FinalPlanResource,
): ResourceTaskReference[] {
  const tasks = plan.tasks ?? [];
  return tasks
    .filter((task) => {
      const taskResources = [
        ...task.items_to_buy,
        ...task.materials_required,
        ...task.equipment_required,
      ];
      return taskResources.some((item) => resourceMatches(item.name, resource.name));
    })
    .slice(0, 6)
    .map((task) => ({
      task_id: task.task_id,
      title: task.title,
      scheduled_date: task.scheduled_date,
    }));
}

function supplierFromUrl(url: string): SupplierDirectoryEntry | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (
      SUPPLIERS.find((supplier) =>
        host.includes(new URL(supplier.homepage_url).hostname.replace(/^www\./, "")),
      ) ?? null
    );
  } catch {
    return null;
  }
}

function confidenceFromScore(score: number | null): FinalPlanConfidence {
  if (score === null) return "low";
  if (score >= 0.72) return "high";
  if (score >= 0.42) return "medium";
  return "low";
}

function classifyResource(resource: FinalPlanResource): ResourceCategory {
  const text = normalizeName(`${resource.name} ${resource.reason ?? ""}`);
  if (/\b(antibody|antibodies|anti-|igg|elisa)\b/.test(text)) return "antibody";
  if (/\b(kit|assay|master mix|extraction|isolation)\b/.test(text)) return "kit";
  if (/\b(primer|probe|oligo|qpcr|pcr)\b/.test(text)) return "primer";
  if (/\b(tube|plate|tip|well|filter|paper|membrane|substrate|plasticware)\b/.test(text)) {
    return "consumable";
  }
  if (/\b(microscope|reader|instrument|cycler|centrifuge|incubator|pipette)\b/.test(text)) {
    return "equipment";
  }
  if (/\b(sequencing|analysis|service|synthesis)\b/.test(text)) return "service";
  if (/\b(buffer|reagent|enzyme|media|medium|solution|chemical|dye)\b/.test(text)) {
    return "reagent";
  }
  return "other";
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url) || url.toLowerCase().includes("/pdf/");
}

function resultTypeFromUrl(url: string, title: string): SupplierResultType {
  const text = normalizeName(`${url} ${title}`);
  if (text.includes("primerquest") || text.includes("oligoanalyzer") || text.includes("/tools")) {
    return "tool";
  }
  if (text.includes("/product") || text.includes("/catalog") || text.includes("/shop")) {
    return "product";
  }
  if (text.includes("protocol")) return "protocol";
  if (isPdfUrl(url) || text.includes("technical") || text.includes("bulletin") || text.includes("manual")) {
    return "technical_document";
  }
  return "search";
}

function extractPrice(text: string): number | null {
  const match = text.match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match?.[1]) return null;
  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function candidatePurchaseRank(candidate: SupplierCandidate): number {
  let rank = candidate.score ?? 0;
  if (candidate.result_type === "product") rank += 2.5;
  if (candidate.result_type === "tool") rank += 1.8;
  if (candidate.result_type === "search") rank += 1.2;
  if (candidate.result_type === "protocol") rank += 0.4;
  if (candidate.result_type === "technical_document") rank -= 0.8;
  if (candidate.is_pdf) rank -= 2;
  if (candidate.estimated_price !== null) rank += 1.4;
  return rank;
}

function sortSupplierCandidates(candidates: SupplierCandidate[]): SupplierCandidate[] {
  return [...candidates].sort((left, right) => candidatePurchaseRank(right) - candidatePurchaseRank(left));
}

function isProperSourcingCandidate(candidate: SupplierCandidate): boolean {
  if (candidate.is_pdf) return false;
  return candidate.result_type === "product" || candidate.result_type === "tool";
}

function supplierNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host
      .split(".")
      .slice(0, -1)
      .join(" ")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Market source";
  }
}

function fallbackCandidates(_resource: FinalPlanResource): SupplierCandidate[] {
  return [];
}

function buildQuery(resource: FinalPlanResource): string {
  const reason = resource.reason ? ` ${resource.reason}` : "";
  return [
    resource.name,
    resource.quantity,
    resource.unit,
    reason,
    "buy product page catalog number price supplier order",
    "-pdf protocol application note technical bulletin",
  ]
    .filter(Boolean)
    .join(" ");
}

function reportCacheKey(project: Project, plan: FinalExperimentPlan): string {
  return [
    project.id,
    project.updatedAt,
    plan.updated_at,
    config.tavily.enabled ? "tavily" : "fallback",
    config.tavily.maxResults,
    "procurement-v2",
  ].join(":");
}

async function searchTavily(resource: FinalPlanResource): Promise<SupplierCandidate[]> {
  if (!config.tavily.apiKey) return fallbackCandidates(resource);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.tavily.timeoutMs);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.tavily.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: config.tavily.apiKey,
        query: buildQuery(resource),
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
        max_results: config.tavily.maxResults,
        include_domains: SUPPLIER_DOMAINS,
      }),
    });
    if (!response.ok) {
      throw new Error(`Tavily returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as TavilyResponse;
    return (payload.results ?? [])
      .map((result, index): SupplierCandidate | null => {
        if (!result.url) return null;
        const supplier = supplierFromUrl(result.url);
        if (!supplier) return null;
        const score = typeof result.score === "number" ? result.score : null;
        const rawTitle = result.title?.trim() || `${supplier.name} result for ${resource.name}`;
        const title = rawTitle.replace(/^\[pdf\]\s*/i, "");
        const snippet = result.content?.trim().slice(0, 420) || supplier.focus;
        return {
          candidate_id: `${slug(resource.name)}-${index + 1}`,
          supplier_id: supplier.supplier_id,
          supplier_name: supplier.name,
          title,
          url: result.url,
          snippet,
          result_type: resultTypeFromUrl(result.url, title),
          is_pdf: isPdfUrl(result.url) || /^\[?pdf\]?/i.test(rawTitle),
          is_verified_supplier: true,
          estimated_price: extractPrice(`${title} ${snippet}`),
          confidence: confidenceFromScore(score),
          score,
        };
      })
      .filter((candidate): candidate is SupplierCandidate => candidate !== null)
      .sort((left, right) => candidatePurchaseRank(right) - candidatePurchaseRank(left));
  } finally {
    clearTimeout(timeout);
  }
}

async function searchMarketPrice(resource: FinalPlanResource): Promise<SupplierCandidate[]> {
  if (!config.tavily.apiKey) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.tavily.timeoutMs);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.tavily.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: config.tavily.apiKey,
        query: `${resource.name} ${resource.quantity ?? ""} ${resource.unit ?? ""} buy product price catalog quote -pdf`,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
        max_results: 4,
        exclude_domains: SUPPLIER_DOMAINS,
      }),
    });
    if (!response.ok) {
      throw new Error(`Tavily returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as TavilyResponse;
    return (payload.results ?? [])
      .map((result, index): SupplierCandidate | null => {
        if (!result.url) return null;
        const score = typeof result.score === "number" ? result.score : null;
        const rawTitle = result.title?.trim() || `Market result for ${resource.name}`;
        const title = rawTitle.replace(/^\[pdf\]\s*/i, "");
        const snippet = result.content?.trim().slice(0, 420) || "Unverified market source.";
        const isPdf = isPdfUrl(result.url) || /^\[?pdf\]?/i.test(rawTitle);
        const price = extractPrice(`${title} ${snippet}`);
        if (isPdf || price === null) return null;
        return {
          candidate_id: `${slug(resource.name)}-market-${index + 1}`,
          supplier_id: "market_estimate",
          supplier_name: supplierNameFromUrl(result.url),
          title,
          url: result.url,
          snippet,
          result_type: resultTypeFromUrl(result.url, title),
          is_pdf: false,
          is_verified_supplier: false,
          estimated_price: price,
          confidence: confidenceFromScore(score),
          score,
        };
      })
      .filter((candidate): candidate is SupplierCandidate => candidate !== null)
      .sort((left, right) => candidatePurchaseRank(right) - candidatePurchaseRank(left));
  } finally {
    clearTimeout(timeout);
  }
}

async function candidatesForResource(
  resource: FinalPlanResource,
  warnings: string[],
): Promise<SupplierCandidate[]> {
  if (!config.tavily.enabled) return fallbackCandidates(resource);
  try {
    const verifiedCandidates = (await searchTavily(resource)).filter(isProperSourcingCandidate);
    if (
      verifiedCandidates.length > 0 &&
      verifiedCandidates.some((candidate) => candidate.estimated_price !== null)
    ) {
      return sortSupplierCandidates(verifiedCandidates);
    }
    const marketCandidates = await searchMarketPrice(resource);
    return sortSupplierCandidates([...verifiedCandidates, ...marketCandidates]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tavily supplier search failed.";
    logger.warn("supplier_search.tavily_failed", { resource: resource.name, message });
    warnings.push(`${resource.name}: ${message}`);
    return fallbackCandidates(resource);
  }
}

export async function buildProcurementReport(project: Project): Promise<ProcurementReport> {
  if (!project.finalPlan) {
    throw new Error("Project does not have a generated plan.");
  }
  const plan = project.finalPlan;
  const cacheKey = reportCacheKey(project, plan);
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  if (!config.tavily.enabled) warnings.push(getMissingServiceMessage("tavily"));

  const allResources = resourcesFromPlan(plan);
  const searchable = allResources.slice(0, config.tavily.maxResources);
  if (allResources.length > searchable.length) {
    console.log(`Supplier matching was limited to the first ${searchable.length} resources for this MVP.`);
  }

  const candidatesByKey = new Map<string, SupplierCandidate[]>();
  await Promise.all(
    searchable.map(async (resource) => {
      candidatesByKey.set(resourceKey(resource), await candidatesForResource(resource, warnings));
    }),
  );

  const resources: ProcurementResourceItem[] = allResources.map((resource, index) => {
    const supplierCandidates = sortSupplierCandidates(
      candidatesByKey.get(resourceKey(resource)) ?? fallbackCandidates(resource),
    );
    const recommendedSupplier = supplierCandidates[0] ?? null;
    const estimatedUnitPrice =
      resource.estimated_price ?? recommendedSupplier?.estimated_price ?? null;
    return {
      ...resource,
      resource_id: `resource_${String(index + 1).padStart(3, "0")}_${slug(resource.name)}`,
      category: classifyResource(resource),
      decision_status: "needs_review",
      decision_prompt:
        resource.availability === "available"
          ? "Confirm this is already available in the lab inventory."
          : "Select a supplier, confirm price, and decide whether to buy or substitute.",
      source_tasks: sourceTasksForResource(plan, resource),
      supplier_candidates: supplierCandidates,
      recommended_supplier: recommendedSupplier,
      estimated_unit_price: estimatedUnitPrice,
      price_basis:
        resource.estimated_price !== undefined && resource.estimated_price !== null
          ? "Plan estimate"
          : recommendedSupplier?.estimated_price !== null && recommendedSupplier?.estimated_price !== undefined
            ? `Detected from ${recommendedSupplier.supplier_name} result`
            : "Price not found in supplier snippets",
    };
  });

  const report: ProcurementReport = {
    project_id: project.id,
    plan_id: plan.plan_id,
    generated_at: new Date().toISOString(),
    mode: config.tavily.enabled ? "tavily" : "fallback",
    warnings,
    suppliers: SUPPLIERS,
    resources,
    decisions_required: resources.map((resource) => ({
      resource_id: resource.resource_id,
      question: resource.decision_prompt,
    })),
  };
  reportCache.set(cacheKey, report);
  return report;
}
