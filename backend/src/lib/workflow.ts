import type { Paper, PrePlan, PrePlanNode, Workflow, WorkflowNode } from "./projectTypes.js";

const DAY_WIDTH = 220;
const TRACK_HEIGHT = 220;
const TRACK_Y = {
  main: 0,
  upperBranch: -TRACK_HEIGHT,
  lowerBranch: TRACK_HEIGHT,
  lowerBranch2: TRACK_HEIGHT * 2,
} as const;

type Track = keyof typeof TRACK_Y;

type WorkflowNodeData = WorkflowNode["data"];
type WorkflowNodeDraft = Omit<WorkflowNode, "data"> & {
  data: Omit<WorkflowNodeData, "childrenIds">;
};

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function citationLabels(papers: Paper[]): string[] {
  return papers.slice(0, 4).map((paper) =>
    paper.url ? `${paper.title} (${paper.url})` : paper.title,
  );
}

function expertLabels(papers: Paper[]): string[] {
  const names = papers.flatMap((paper) => paper.authors).slice(0, 6);
  return names.length > 0
    ? Array.from(new Set(names))
    : ["Principal investigator", "Senior bench scientist"];
}

function makeNode(input: {
  id: string;
  stepName: string;
  offsetDays: number;
  track: Track;
  people: string[];
  equipment: string[];
  materials: string[];
  personnelRequirement: string;
  timeEstimate: string;
  price: string;
  experts: string[];
  citationsToPaper: string[];
  procedure: string;
  validationCriteria: string[];
  startDate: string;
  parentIds?: string[];
  status?: WorkflowNodeData["status"];
  icon?: string;
}): WorkflowNodeDraft {
  return {
    id: input.id,
    position: {
      x: input.offsetDays * DAY_WIDTH,
      y: TRACK_Y[input.track],
    },
    data: {
      id: input.id,
      stepName: input.stepName,
      people: input.people,
      equipment: input.equipment,
      materials: input.materials,
      personnelRequirement: input.personnelRequirement,
      timeEstimate: input.timeEstimate,
      price: input.price,
      experts: input.experts,
      citationsToPaper: input.citationsToPaper,
      procedure: input.procedure,
      validationCriteria: input.validationCriteria,
      startDate: input.startDate,
      startDay: input.offsetDays,
      parentIds: input.parentIds ?? [],
      status: input.status,
      icon: input.icon,
    },
  };
}

function finishWorkflow(nodes: WorkflowNodeDraft[]): Workflow {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    for (const parentId of node.data.parentIds) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(node.id);
      childrenByParent.set(parentId, children);
    }
  }

  const finishedNodes: WorkflowNode[] = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      childrenIds: childrenByParent.get(node.id) ?? [],
    },
  }));

  return {
    nodes: finishedNodes,
    edges: finishedNodes.flatMap((node) =>
      node.data.childrenIds.map((childId) => ({
        id: `e:${node.id}-${childId}`,
        source: node.id,
        target: childId,
      })),
    ),
  };
}


function compactList(values: string[], fallback: string): string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : [fallback];
}

function durationLabel(step: PrePlanNode): string {
  const { value, unit } = step.estimated_duration;
  return value !== null ? `${value} ${unit}` : `Unknown ${unit}`;
}

function durationDaysFromLabel(timeEstimate: string | undefined): number {
  if (!timeEstimate) return 1;
  const normalized = timeEstimate.toLowerCase();
  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const amount = numbers.length > 0 ? Math.max(...numbers) : 1;
  if (normalized.includes("week")) return Math.max(Math.ceil(amount * 7), 1);
  if (normalized.includes("month")) return Math.max(Math.ceil(amount * 30), 1);
  if (normalized.includes("hour")) return 1;
  return Math.max(Math.ceil(amount), 1);
}

function personnelRequirementLabel(step: PrePlanNode): string {
  const count = step.people_required.count;
  const roles = step.people_required.roles.filter(Boolean);
  if (count !== null && roles.length > 0) {
    return `${count} ${count === 1 ? "person" : "people"}: ${roles.join(", ")}`;
  }
  if (count !== null) return `${count} ${count === 1 ? "person" : "people"}`;
  if (roles.length > 0) return roles.join(", ");
  return "Personnel TBD";
}

function priceLabel(step: PrePlanNode): string {
  const { value, currency } = step.estimated_price;
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function iconForStep(step: PrePlanNode): string {
  const text = `${step.step_name} ${step.step_purpose}`.toLowerCase();
  if (/literature|source|paper|review/.test(text)) return "book";
  if (/order|buy|reagent|material|purchase/.test(text)) return "package";
  if (/control|approval|validate|quality|qc/.test(text)) return "shield";
  if (/analy|sequence|data|statistic/.test(text)) return "flask";
  if (/protocol|design|select|prepare/.test(text)) return "clipboard";
  if (/image|measure|microscope|assay/.test(text)) return "microscope";
  return "beaker";
}

function topologicalPrePlanNodes(prePlan: PrePlan): PrePlanNode[] {
  const nodesById = new Map(prePlan.dag.nodes.map((node) => [node.node_id, node]));
  const indegree = new Map(prePlan.dag.nodes.map((node) => [node.node_id, 0]));
  const children = new Map<string, string[]>(
    prePlan.dag.nodes.map((node) => [node.node_id, []]),
  );

  for (const edge of prePlan.dag.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    children.get(edge.from)?.push(edge.to);
  }

  const queue = prePlan.dag.nodes
    .filter((node) => (indegree.get(node.node_id) ?? 0) === 0)
    .map((node) => node.node_id);
  const ordered: PrePlanNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodesById.get(id);
    if (!node) continue;
    ordered.push(node);

    for (const childId of children.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }

  return ordered.length === prePlan.dag.nodes.length
    ? ordered
    : prePlan.dag.nodes;
}

function mainPrePlanPath(prePlan: PrePlan, orderedNodes: PrePlanNode[]): Set<string> {
  const nodeIds = new Set(orderedNodes.map((node) => node.node_id));
  const children = new Map<string, string[]>(
    orderedNodes.map((node) => [node.node_id, []]),
  );
  const parents = new Map<string, string[]>(
    orderedNodes.map((node) => [node.node_id, []]),
  );

  for (const edge of prePlan.dag.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    children.get(edge.from)?.push(edge.to);
    parents.get(edge.to)?.push(edge.from);
  }

  const nodesById = new Map(orderedNodes.map((node) => [node.node_id, node]));
  const scoreMemo = new Map<string, number>();
  const score = (id: string, visiting = new Set<string>()): number => {
    const cached = scoreMemo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = nodesById.get(id);
    const own = durationDaysFromLabel(node ? durationLabel(node) : undefined);
    const downstream = Math.max(
      0,
      ...((children.get(id) ?? []).map((childId) => score(childId, visiting))),
    );
    visiting.delete(id);
    const total = own + downstream;
    scoreMemo.set(id, total);
    return total;
  };

  const root =
    orderedNodes.find((node) => (parents.get(node.node_id) ?? []).length === 0)
      ?.node_id ?? orderedNodes[0]?.node_id;
  const path = new Set<string>();
  let current = root;
  while (current && !path.has(current)) {
    path.add(current);
    const next = (children.get(current) ?? [])
      .slice()
      .sort((a, b) => score(b) - score(a))[0];
    current = next;
  }
  return path;
}

function branchTrackY(index: number): number {
  const tracks = [
    TRACK_Y.lowerBranch,
    TRACK_Y.upperBranch,
    TRACK_Y.lowerBranch2,
  ];
  return tracks[index % tracks.length] ?? TRACK_Y.lowerBranch;
}

function workflowFromPrePlan(
  prePlan: PrePlan,
  papers: Paper[],
  startDate: Date,
): Workflow {
  const orderedNodes = topologicalPrePlanNodes(prePlan);
  const nodeIds = new Set(orderedNodes.map((node) => node.node_id));
  const fallbackCitations = citationLabels(papers);
  const fallbackExperts = expertLabels(papers);
  const mainPath = mainPrePlanPath(prePlan, orderedNodes);
  const startDayById = new Map<string, number>();
  const durationDaysById = new Map<string, number>();
  const base = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  ));
  let branchIndex = 0;

  return finishWorkflow(
    orderedNodes.map((node, index): WorkflowNodeDraft => {
      const parentIds = node.parent_ids.filter((id) => nodeIds.has(id));
      const earliestStartDay = Math.max(
        0,
        ...parentIds.map((parentId) => {
          const parentStartDay = startDayById.get(parentId) ?? 0;
          const parentDuration = durationDaysById.get(parentId) ?? 1;
          return parentStartDay + parentDuration;
        }),
      );
      const duration = durationDaysFromLabel(durationLabel(node));
      startDayById.set(node.node_id, earliestStartDay);
      durationDaysById.set(node.node_id, duration);
      const evidence = node.source_citations.map((citation) =>
        citation.quote_or_evidence
          ? `${citation.document_id}: ${citation.quote_or_evidence}`
          : `${citation.document_id}, ${citation.location}`,
      );
      const experts = node.domain_experts.map((expert) =>
        expert.affiliation && expert.affiliation !== "unknown"
          ? `${expert.name}, ${expert.affiliation}`
          : expert.name,
      );
      const isMainPath = mainPath.has(node.node_id);
      const y = isMainPath ? TRACK_Y.main : branchTrackY(branchIndex++);

      return {
        id: node.node_id,
        position: {
          x: earliestStartDay * DAY_WIDTH,
          y,
        },
        data: {
          id: node.node_id,
          stepName: node.step_name,
          people: compactList(node.people_required.roles, "Research team"),
          equipment: compactList(
            node.equipment_required.map((item) => item.name),
            "Equipment to be confirmed",
          ),
          materials: compactList(
            node.materials_required.map((item) => item.name),
            "Materials to be confirmed",
          ),
          personnelRequirement: personnelRequirementLabel(node),
          timeEstimate: durationLabel(node),
          price: priceLabel(node),
          experts: compactList([...experts, ...fallbackExperts], "Domain expert"),
          citationsToPaper: compactList(
            [...evidence, ...fallbackCitations],
            "Source citation unavailable",
          ),
          procedure: node.procedure || node.step_purpose,
          validationCriteria: compactList(
            node.validation_criteria,
            "Validation criteria to be confirmed",
          ),
          startDate: formatIsoDate(addDays(base, earliestStartDay)),
          startDay: earliestStartDay,
          parentIds,
          status: index === 0 ? "active" : "upcoming",
          icon: iconForStep(node),
        },
      };
    }),
  );
}

/**
 * Returns the seed workflow attached by the generation endpoint.
 *
 * The generator still uses deterministic seed steps, but the node payload now
 * matches the MVP workflow model: resources, cost, experts, citations,
 * procedure, validation, dates, and graph relationship IDs.
 */
export function generateWorkflow(
  _prompt: string,
  prePlanOrPapers?: PrePlan | Paper[],
  papers: Paper[] = [],
  startDate = new Date(),
): Workflow {
  const prePlan = Array.isArray(prePlanOrPapers) ? undefined : prePlanOrPapers;
  const sourcePapers = Array.isArray(prePlanOrPapers) ? prePlanOrPapers : papers;

  if (prePlan && prePlan.dag.nodes.length > 0) {
    return workflowFromPrePlan(prePlan, sourcePapers, startDate);
  }

  const base = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  ));
  const citations = citationLabels(sourcePapers);
  const experts = expertLabels(sourcePapers);
  const d = (offsetDays: number) => formatIsoDate(addDays(base, offsetDays));

  return finishWorkflow([
    makeNode({
      id: "hypothesis",
      stepName: "Frame the hypothesis",
      offsetDays: 0,
      track: "main",
      people: ["Principal investigator"],
      equipment: ["Project notebook"],
      materials: ["Original research question"],
      personnelRequirement: "1 person: Principal investigator",
      timeEstimate: "1 day",
      price: "$0",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Write the factor, model system, expected outcome, and success metric in one falsifiable statement.",
      validationCriteria: [
        "Hypothesis identifies the independent variable",
        "Outcome and expected direction are explicit",
      ],
      startDate: d(0),
      status: "done",
      icon: "lightbulb",
    }),
    makeNode({
      id: "literature",
      stepName: "Literature review",
      offsetDays: 1,
      track: "main",
      people: ["Graduate researcher", "Principal investigator"],
      equipment: ["Reference manager", "Paper database access"],
      materials: ["Search keywords", "Related work exports"],
      personnelRequirement: "2 people: Graduate researcher, Principal investigator",
      timeEstimate: "5 days",
      price: "$250",
      experts: experts.slice(0, 4),
      citationsToPaper: citations,
      procedure:
        "Screen related papers, extract protocols and limitations, and write a short gap analysis.",
      validationCriteria: [
        "At least 10 relevant papers reviewed",
        "Protocol constraints and unresolved gaps are summarized",
      ],
      startDate: d(1),
      parentIds: ["hypothesis"],
      status: "done",
      icon: "book",
    }),
    makeNode({
      id: "design",
      stepName: "Experimental design",
      offsetDays: 6,
      track: "main",
      people: ["Principal investigator", "Postdoctoral fellow", "Statistician"],
      equipment: ["Power analysis worksheet"],
      materials: ["Assay options", "Control matrix"],
      personnelRequirement: "3 people: Principal investigator, postdoctoral fellow, statistician",
      timeEstimate: "5 days",
      price: "$600",
      experts: experts.slice(0, 3),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Choose assays, controls, sample size, randomization, and the primary analysis plan.",
      validationCriteria: [
        "Primary readout and controls are documented",
        "Sample size rationale is recorded",
      ],
      startDate: d(6),
      parentIds: ["literature"],
      status: "active",
      icon: "clipboard",
    }),
    makeNode({
      id: "reagents",
      stepName: "Order reagents and consumables",
      offsetDays: 11,
      track: "lowerBranch",
      people: ["Lab manager", "Research assistant"],
      equipment: ["Procurement system", "Cold storage"],
      materials: ["Antibodies", "Primers", "Media", "Plasticware"],
      personnelRequirement: "2 people: Lab manager, research assistant",
      timeEstimate: "7 days",
      price: "$11,400",
      experts: ["Lab manager", ...experts.slice(0, 1)],
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Create an itemized order list, confirm catalog numbers, place orders, and track lead times.",
      validationCriteria: [
        "All critical reagents have vendor and lot information",
        "Expected arrival dates are recorded",
      ],
      startDate: d(11),
      parentIds: ["design"],
      status: "upcoming",
      icon: "package",
    }),
    makeNode({
      id: "protocol",
      stepName: "Draft the protocol",
      offsetDays: 11,
      track: "lowerBranch2",
      people: ["Postdoctoral fellow", "Lead experimentalist"],
      equipment: ["SOP template", "Bench layout"],
      materials: ["Experimental design memo", "Safety requirements"],
      personnelRequirement: "2 people: Postdoctoral fellow, lead experimentalist",
      timeEstimate: "4 days",
      price: "$1,200",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Translate the design into a step-by-step SOP with timings, volumes, safety notes, and review owners.",
      validationCriteria: [
        "Each procedure step has timing and acceptance notes",
        "PI or senior scientist review is complete",
      ],
      startDate: d(11),
      parentIds: ["design"],
      status: "upcoming",
      icon: "pencil",
    }),
    makeNode({
      id: "controls",
      stepName: "Plan controls and approvals",
      offsetDays: 11,
      track: "upperBranch",
      people: ["Principal investigator", "Compliance reviewer"],
      equipment: ["Approval portal"],
      materials: ["Control samples", "Ethics forms"],
      personnelRequirement: "2 people: Principal investigator, compliance reviewer",
      timeEstimate: "5 days",
      price: "$980",
      experts: ["Compliance reviewer", ...experts.slice(0, 1)],
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Define positive, negative, and vehicle controls, then submit required IRB/IACUC or biosafety paperwork.",
      validationCriteria: [
        "Control matrix rules out major confounds",
        "Required approvals are submitted or confirmed unnecessary",
      ],
      startDate: d(11),
      parentIds: ["design"],
      status: "upcoming",
      icon: "shield",
    }),
    makeNode({
      id: "pilot",
      stepName: "Pilot run",
      offsetDays: 18,
      track: "main",
      people: ["Lead experimentalist", "Research assistant"],
      equipment: ["Bench setup", "Plate reader or microscope"],
      materials: ["Pilot aliquots", "Prepared controls"],
      personnelRequirement: "2 people: Lead experimentalist, research assistant",
      timeEstimate: "3 days",
      price: "$2,400",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Run the SOP at reduced scale, time each step, capture failure modes, and confirm the readout is in range.",
      validationCriteria: [
        "Readout signal is measurable and within dynamic range",
        "Protocol issues are captured in an issue log",
      ],
      startDate: d(18),
      parentIds: ["reagents", "protocol", "controls"],
      status: "upcoming",
      icon: "beaker",
    }),
    makeNode({
      id: "refine",
      stepName: "Refine the protocol",
      offsetDays: 21,
      track: "main",
      people: ["Postdoctoral fellow", "Lead experimentalist"],
      equipment: ["Versioned SOP"],
      materials: ["Pilot issue log", "Pilot data"],
      personnelRequirement: "2 people: Postdoctoral fellow, lead experimentalist",
      timeEstimate: "3 days",
      price: "$900",
      experts: experts.slice(0, 2),
      citationsToPaper: citations.slice(0, 2),
      procedure:
        "Resolve pilot issues, adjust timings or concentrations, and freeze the SOP version for the main run.",
      validationCriteria: [
        "Every pilot issue has a disposition",
        "Final SOP version is tagged and shared",
      ],
      startDate: d(21),
      parentIds: ["pilot"],
      status: "upcoming",
      icon: "clipboard-check",
    }),
    makeNode({
      id: "main",
      stepName: "Main experiment",
      offsetDays: 24,
      track: "main",
      people: ["Lead experimentalist", "Research assistant"],
      equipment: ["Final assay setup", "Data capture workstation"],
      materials: ["Full reagent set", "Experimental samples", "Controls"],
      personnelRequirement: "2 people: Lead experimentalist, research assistant",
      timeEstimate: "15 days",
      price: "$9,800",
      experts: experts.slice(0, 3),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Execute the frozen SOP across planned replicates, log metadata, and back up raw data daily.",
      validationCriteria: [
        "Planned replicate count is complete",
        "Metadata and raw files pass daily completeness checks",
      ],
      startDate: d(24),
      parentIds: ["refine"],
      status: "upcoming",
      icon: "microscope",
    }),
    makeNode({
      id: "analysis",
      stepName: "Data analysis",
      offsetDays: 39,
      track: "main",
      people: ["Bioinformatician", "Statistician"],
      equipment: ["Analysis workstation", "Versioned notebook"],
      materials: ["Raw data", "Analysis plan"],
      personnelRequirement: "2 people: Bioinformatician, statistician",
      timeEstimate: "5 days",
      price: "$3,200",
      experts: experts.slice(0, 3),
      citationsToPaper: citations.slice(0, 3),
      procedure:
        "Clean the data, run the pre-specified tests, estimate effect sizes, and generate figures reproducibly.",
      validationCriteria: [
        "Analysis follows the pre-specified plan",
        "Effect sizes and confidence intervals are reported",
      ],
      startDate: d(39),
      parentIds: ["main"],
      status: "upcoming",
      icon: "flask",
    }),
    makeNode({
      id: "manuscript",
      stepName: "Manuscript draft",
      offsetDays: 44,
      track: "main",
      people: ["Principal investigator", "First author"],
      equipment: ["Manuscript workspace", "Figure export pipeline"],
      materials: ["Final figures", "Methods SOP", "Analysis outputs"],
      personnelRequirement: "2 people: Principal investigator, first author",
      timeEstimate: "7 days",
      price: "$1,500",
      experts: experts.slice(0, 4),
      citationsToPaper: citations,
      procedure:
        "Draft methods and results from the finalized SOP and figures, then circulate for internal review.",
      validationCriteria: [
        "Methods are reproducible from the SOP",
        "All claims cite supporting results or literature",
      ],
      startDate: d(44),
      parentIds: ["analysis"],
      status: "upcoming",
      icon: "filetext",
    }),
  ]);
}
