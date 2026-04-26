import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
  PackageSearch,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getProjectResources } from "@/lib/api";
import { formatUSD } from "@/lib/projectStats";
import type {
  ProcurementReport,
  ProcurementResourceItem,
  Project,
  ResourceDecisionStatus,
  SupplierCandidate,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

interface ResourcesViewProps {
  project: Project;
}

type StatusFilter = "all" | ResourceDecisionStatus;
type AddedSuppliers = Record<string, SupplierCandidate[]>;

const DECISION_OPTIONS: Array<{ status: ResourceDecisionStatus; label: string }> = [
  { status: "needs_review", label: "Review" },
  { status: "buy", label: "Buy" },
  { status: "substitute", label: "Substitute" },
  { status: "already_available", label: "Available" },
];

const CATEGORY_LABELS: Record<ProcurementResourceItem["category"], string> = {
  reagent: "Reagents",
  antibody: "Antibodies",
  kit: "Kits",
  primer: "Primers",
  consumable: "Consumables",
  equipment: "Equipment",
  service: "Services",
  other: "Other",
};

export function ResourcesView({ project }: ResourcesViewProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; report: ProcurementReport }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [decisions, setDecisions] = useState<Record<string, ResourceDecisionStatus>>({});

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getProjectResources(project.id)
      .then((report) => {
        if (cancelled) return;
        setState({ kind: "ready", report });
        setDecisions((current) => {
          const next = { ...current };
          for (const resource of report.resources) {
            next[resource.resource_id] ??= resource.decision_status;
          }
          return next;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not load resources.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  if (!project.finalPlan) {
    return (
      <section className="flex flex-1 items-center justify-center px-8 py-24 text-center">
        <p className="max-w-[44ch] text-[13px] leading-[1.55] text-text-tertiary">
          Build the experiment calendar first to generate the resource purchase list.
        </p>
      </section>
    );
  }

  if (state.kind === "loading") {
    return (
      <section className="flex flex-1 items-center justify-center bg-bg-primary">
        <div className="flex items-center gap-2 rounded-md border border-[color:var(--border-default)] bg-bg-surface px-4 py-3 text-[13px] text-text-secondary shadow-sm">
          <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
          Finding supplier pages and price hints
        </div>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="flex flex-1 items-center justify-center px-8 py-24 text-center">
        <div className="max-w-[48ch] rounded-md border border-[color:var(--border-default)] bg-bg-surface p-5 shadow-sm">
          <AlertCircle className="mx-auto text-accent" size={20} strokeWidth={1.75} />
          <h2 className="mt-3 font-sans text-[18px] font-medium text-text-primary">
            Could not load resources
          </h2>
          <p className="mt-2 text-[13px] leading-[1.55] text-text-secondary">
            {state.message}
          </p>
        </div>
      </section>
    );
  }

  return (
    <ResourcesReportView
      report={state.report}
      decisions={decisions}
      onDecisionChange={(resourceId, status) =>
        setDecisions((current) => ({ ...current, [resourceId]: status }))
      }
    />
  );
}

function ResourcesReportView({
  report,
  decisions,
  onDecisionChange,
}: {
  report: ProcurementReport;
  decisions: Record<string, ResourceDecisionStatus>;
  onDecisionChange: (resourceId: string, status: ResourceDecisionStatus) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ProcurementResourceItem["category"]>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addedSuppliers, setAddedSuppliers] = useState<AddedSuppliers>({});

  const categories = useMemo(
    () => Array.from(new Set(report.resources.map((resource) => resource.category))).sort(),
    [report.resources],
  );

  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return report.resources.filter((resource) => {
      const decision = decisions[resource.resource_id] ?? resource.decision_status;
      if (category !== "all" && resource.category !== category) return false;
      if (status !== "all" && decision !== status) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        resource.name,
        resource.reason,
        resource.category,
        resource.recommended_supplier?.supplier_name,
        resource.recommended_supplier?.title,
        ...resource.source_tasks.map((task) => task.title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [category, decisions, query, report.resources, status]);

  const totals = useMemo(() => {
    const sourceable = filteredResources.filter(
      (resource) => (decisions[resource.resource_id] ?? resource.decision_status) !== "already_available",
    );
    const knownCost = sourceable.reduce(
      (sum, resource) => sum + (displayPrice(resource, addedSuppliers[resource.resource_id]) ?? 0),
      0,
    );
    const review = filteredResources.filter(
      (resource) => (decisions[resource.resource_id] ?? resource.decision_status) === "needs_review",
    ).length;
    return { knownCost, review, sourceable: sourceable.length };
  }, [addedSuppliers, decisions, filteredResources]);

  return (
    <section className="flex-1 overflow-y-auto bg-bg-primary px-6 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <header className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Sourcing
              </p>
              <h1 className="mt-1 font-sans text-[24px] font-medium tracking-[-0.02em] text-text-primary">
                Resources to source
              </h1>
              <p className="mt-2 max-w-[74ch] text-[13px] leading-[1.55] text-text-secondary">
                Procurement view with recommended supplier links, source type, task context, and
                price hints where Tavily found them. PDFs are kept as evidence but product/tool pages
                are prioritized.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right">
              <Metric label="To source" value={String(totals.sourceable)} />
              <Metric label="Review" value={String(totals.review)} />
              <Metric label="Known cost" value={formatUSD(totals.knownCost, { compact: true })} />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3">
            <FilterBar
              query={query}
              category={category}
              status={status}
              categories={categories}
              visibleCount={filteredResources.length}
              onQueryChange={setQuery}
              onCategoryChange={setCategory}
              onStatusChange={setStatus}
              onExport={() => exportSourcingPdf(report, filteredResources, decisions, addedSuppliers)}
            />

            {report.warnings.length > 0 ? (
              <div className="rounded-md border border-[color:var(--border-default)] bg-bg-surface px-4 py-3 text-[12.5px] leading-[1.5] text-text-secondary">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
                  <p>{report.warnings[0]}</p>
                </div>
              </div>
            ) : null}

            {filteredResources.length > 0 ? (
              filteredResources.map((resource) => (
                <ResourceRow
                  key={resource.resource_id}
                  resource={resource}
                  decision={decisions[resource.resource_id] ?? resource.decision_status}
                  onDecisionChange={(next) => onDecisionChange(resource.resource_id, next)}
                  expanded={Boolean(expanded[resource.resource_id])}
                  onToggle={() =>
                    setExpanded((current) => ({
                      ...current,
                      [resource.resource_id]: !current[resource.resource_id],
                    }))
                  }
                  addedSuppliers={addedSuppliers[resource.resource_id] ?? []}
                  onAddSupplier={(supplier) =>
                    setAddedSuppliers((current) => ({
                      ...current,
                      [resource.resource_id]: [
                        supplier,
                        ...(current[resource.resource_id] ?? []),
                      ],
                    }))
                  }
                />
              ))
            ) : (
              <EmptyResources />
            )}
          </div>
          <SupplierPanel report={report} />
        </div>
      </div>
    </section>
  );
}

function FilterBar({
  query,
  category,
  status,
  categories,
  visibleCount,
  onQueryChange,
  onCategoryChange,
  onStatusChange,
  onExport,
}: {
  query: string;
  category: "all" | ProcurementResourceItem["category"];
  status: StatusFilter;
  categories: ProcurementResourceItem["category"][];
  visibleCount: number;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: "all" | ProcurementResourceItem["category"]) => void;
  onStatusChange: (value: StatusFilter) => void;
  onExport: () => void;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-3 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search resources</span>
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search item, supplier, or task"
            className="h-9 w-full rounded-sm border border-[color:var(--border-default)] bg-bg-primary pl-8 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-[color:var(--accent)]/55"
          />
        </label>
        <select
          value={category}
          onChange={(event) =>
            onCategoryChange(event.target.value as "all" | ProcurementResourceItem["category"])
          }
          className="h-9 rounded-sm border border-[color:var(--border-default)] bg-bg-primary px-3 text-[13px] text-text-secondary outline-none focus:border-[color:var(--accent)]/55"
        >
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {CATEGORY_LABELS[item]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
          className="h-9 rounded-sm border border-[color:var(--border-default)] bg-bg-primary px-3 text-[13px] text-text-secondary outline-none focus:border-[color:var(--accent)]/55"
        >
          <option value="all">All decisions</option>
          {DECISION_OPTIONS.map((option) => (
            <option key={option.status} value={option.status}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onExport}
          disabled={visibleCount === 0}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-accent px-3 text-[13px] font-medium text-white shadow-sm",
            "transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-55",
          )}
        >
          <Download size={14} strokeWidth={1.75} />
          Export PDF
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-text-tertiary">
        Showing {visibleCount} matching resource{visibleCount === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

function ResourceRow({
  resource,
  decision,
  onDecisionChange,
  expanded,
  onToggle,
  addedSuppliers,
  onAddSupplier,
}: {
  resource: ProcurementResourceItem;
  decision: ResourceDecisionStatus;
  onDecisionChange: (status: ResourceDecisionStatus) => void;
  expanded: boolean;
  onToggle: () => void;
  addedSuppliers: SupplierCandidate[];
  onAddSupplier: (supplier: SupplierCandidate) => void;
}) {
  const recommended =
    addedSuppliers[0] ?? resource.recommended_supplier ?? resource.supplier_candidates[0] ?? null;
  const quantity = [resource.quantity, resource.unit].filter(Boolean).join(" ") || "Verify";
  const itemPrice = displayPrice(resource, addedSuppliers);
  return (
    <article className="rounded-md border border-[color:var(--border-default)] bg-bg-surface shadow-sm">
      <div className="grid items-center gap-3 px-4 py-3 lg:grid-cols-[minmax(220px,1.5fr)_110px_110px_minmax(160px,1fr)_116px_34px]">
        <div className="min-w-0">
          <h2 className="truncate font-sans text-[15px] font-medium text-text-primary">
            {resource.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-accent">
              {CATEGORY_LABELS[resource.category]}
            </span>
            <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-secondary">
              {resource.availability}
            </span>
            {recommended && !recommended.is_verified_supplier ? (
              <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                market estimate
              </span>
            ) : null}
            {addedSuppliers.length > 0 ? (
              <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-secondary">
                added supplier
              </span>
            ) : null}
          </div>
        </div>

        <QuoteCell label="Qty" value={quantity} />
        <QuoteCell
          label="Price"
          value={itemPrice !== null ? formatUSD(itemPrice) : "Quote needed"}
        />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary">Supplier</p>
          {recommended ? (
            <a
              href={recommended.url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[12.5px] font-medium text-accent hover:text-accent-hover"
            >
              <span className="truncate">{recommended.supplier_name}</span>
              <ExternalLink size={11} strokeWidth={1.75} className="shrink-0" />
            </a>
          ) : (
            <p className="mt-0.5 text-[12.5px] font-medium text-text-primary">Needs supplier</p>
          )}
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
            {recommended ? formatResultType(recommended.result_type) : "No proper source found"}
          </p>
        </div>

        <DecisionSelector decision={decision} onChange={onDecisionChange} compact />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <ChevronDown
            size={15}
            strokeWidth={1.75}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-[color:var(--border-default)] px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <DetailBlock title="Quote Notes">
              <p>
                {resource.price_basis}
                {recommended?.snippet ? ` · ${recommended.snippet}` : ""}
              </p>
              {resource.reason ? <p className="mt-1">{resource.reason}</p> : null}
            </DetailBlock>
            <DetailBlock title="Pinned Tasks">
              {resource.source_tasks.length > 0 ? (
                <ul className="space-y-1">
                  {resource.source_tasks.slice(0, 5).map((task) => (
                    <li key={task.task_id}>
                      {task.title}
                      {task.scheduled_date ? ` · ${task.scheduled_date}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No linked task context.</p>
              )}
            </DetailBlock>
          </div>
          <AddSupplierForm resourceId={resource.resource_id} onAddSupplier={onAddSupplier} />
          {resource.supplier_candidates.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {resource.supplier_candidates.slice(1, 4).map((candidate) => (
                <a
                  key={candidate.candidate_id}
                  href={candidate.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-bg-primary px-2 py-0.5 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                >
                  {candidate.supplier_name}
                  <span className="text-text-tertiary">{formatResultType(candidate.result_type)}</span>
                  <ExternalLink size={10} strokeWidth={1.75} />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function QuoteCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary">{label}</p>
      <p className="mt-0.5 truncate text-[12.5px] font-medium text-text-primary">{value}</p>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3 text-[12px] leading-[1.5] text-text-secondary">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {title}
      </p>
      {children}
    </div>
  );
}

function AddSupplierForm({
  resourceId,
  onAddSupplier,
}: {
  resourceId: string;
  onAddSupplier: (supplier: SupplierCandidate) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");

  function handleAdd() {
    const supplierName = name.trim();
    const supplierUrl = url.trim();
    if (!supplierName || !supplierUrl) return;
    const parsedPrice = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
    onAddSupplier({
      candidate_id: `${resourceId}-added-${Date.now()}`,
      supplier_id: "market_estimate",
      supplier_name: supplierName,
      title: supplierName,
      url: supplierUrl,
      snippet: "Added manually to this sourcing quote.",
      result_type: "product",
      is_pdf: false,
      is_verified_supplier: false,
      estimated_price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
      confidence: "medium",
      score: null,
    });
    setName("");
    setUrl("");
    setPrice("");
  }

  return (
    <div className="mt-3 rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        Add supplier
      </p>
      <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_1.4fr_100px_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Supplier name"
          className="h-8 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-2 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-[color:var(--accent)]/55"
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Direct product/quote URL"
          className="h-8 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-2 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-[color:var(--accent)]/55"
        />
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="Price"
          className="h-8 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-2 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-[color:var(--accent)]/55"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim() || !url.trim()}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={12} strokeWidth={1.75} />
          Add
        </button>
      </div>
    </div>
  );
}

function DecisionSelector({
  decision,
  onChange,
  compact = false,
}: {
  decision: ResourceDecisionStatus;
  onChange: (status: ResourceDecisionStatus) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex shrink-0 flex-wrap gap-1.5", compact ? "lg:justify-start" : "lg:justify-end")}>
      {DECISION_OPTIONS.map((option) => (
        <button
          key={option.status}
          type="button"
          onClick={() => onChange(option.status)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
            decision === option.status
              ? "border-[color:var(--accent)] bg-accent-subtle text-accent"
              : "border-[color:var(--border-default)] bg-bg-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          {option.status === "buy" ? <ShoppingCart size={12} strokeWidth={1.75} /> : null}
          {option.status === "already_available" ? (
            <CheckCircle2 size={12} strokeWidth={1.75} />
          ) : null}
          {option.status === "needs_review" || option.status === "substitute" ? (
            <PackageSearch size={12} strokeWidth={1.75} />
          ) : null}
          {compact && option.status !== decision ? null : option.label}
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--border-default)] bg-bg-primary px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-[0.08em] text-text-tertiary">{label}</p>
      <p className="mt-0.5 font-sans text-[18px] font-medium text-text-primary">{value}</p>
    </div>
  );
}

function SupplierPanel({ report }: { report: ProcurementReport }) {
  return (
    <aside className="h-fit rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        Supplier sources
      </p>
      <h2 className="mt-1 font-sans text-[17px] font-medium text-text-primary">
        {report.mode === "tavily" ? "Live Tavily matching" : "Fallback search links"}
      </h2>
      <p className="mt-2 text-[12px] leading-[1.5] text-text-secondary">
        Product and tool pages are ranked above PDFs. Technical documents remain useful evidence,
        but they should not be the final purchase link.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {report.suppliers.map((supplier) => (
          <a
            key={supplier.supplier_id}
            href={supplier.resource_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-medium text-text-primary">{supplier.name}</p>
              <ExternalLink size={12} strokeWidth={1.75} className="text-text-tertiary" />
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-text-secondary">
              {supplier.focus}
            </p>
          </a>
        ))}
      </div>
    </aside>
  );
}

function EmptyResources() {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--border-default)] bg-bg-surface px-5 py-12 text-center">
      <PackageSearch className="mx-auto text-text-tertiary" size={22} strokeWidth={1.75} />
      <p className="mt-3 text-[13px] text-text-secondary">
        No resources match the current filters.
      </p>
    </div>
  );
}

function formatResultType(type: ProcurementResourceItem["supplier_candidates"][number]["result_type"]): string {
  switch (type) {
    case "product":
      return "Product page";
    case "tool":
      return "Design tool";
    case "protocol":
      return "Protocol";
    case "technical_document":
      return "Technical doc";
    case "search":
      return "Search link";
  }
}

function displayPrice(
  resource: ProcurementResourceItem,
  addedSuppliers: SupplierCandidate[] = [],
): number | null {
  return (
    addedSuppliers.find((supplier) => supplier.estimated_price !== null)?.estimated_price ??
    resource.estimated_unit_price ??
    null
  );
}

function displaySupplier(
  resource: ProcurementResourceItem,
  addedSuppliers: SupplierCandidate[] = [],
): SupplierCandidate | null {
  return addedSuppliers[0] ?? resource.recommended_supplier ?? resource.supplier_candidates[0] ?? null;
}

function exportSourcingPdf(
  report: ProcurementReport,
  resources: ProcurementResourceItem[],
  decisions: Record<string, ResourceDecisionStatus>,
  addedSuppliers: AddedSuppliers,
): void {
  const sourceable = resources.filter(
    (resource) => (decisions[resource.resource_id] ?? resource.decision_status) !== "already_available",
  );
  const rows = sourceable.length > 0 ? sourceable : resources;
  const total = rows.reduce(
    (sum, resource) => sum + (displayPrice(resource, addedSuppliers[resource.resource_id]) ?? 0),
    0,
  );
  const html = `<!doctype html>
<html>
<head>
  <title>LabPilot sourcing list</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #FAF9F6; color: #1A1A1A; margin: 32px; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    p { color: #6B6460; font-size: 12px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; background: #fff; border: 1px solid #E5E0D8; }
    th, td { border-bottom: 1px solid #E5E0D8; padding: 10px; text-align: left; vertical-align: top; font-size: 12px; }
    th { color: #9C9490; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; }
    a { color: #C96442; text-decoration: none; }
    .meta { display: flex; gap: 16px; margin-top: 12px; }
    .pill { border: 1px solid #E5E0D8; border-radius: 999px; padding: 4px 8px; color: #6B6460; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Resources to source</h1>
  <p>Generated from LabPilot plan ${escapeHtml(report.plan_id)} on ${new Date().toLocaleDateString()}.</p>
  <div class="meta">
    <span class="pill">${rows.length} item${rows.length === 1 ? "" : "s"}</span>
    <span class="pill">Known cost ${escapeHtml(formatUSD(total))}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Category</th>
        <th>Qty</th>
        <th>Decision</th>
        <th>Price</th>
        <th>Supplier link</th>
        <th>Tasks</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((resource) => {
          const decision = decisions[resource.resource_id] ?? resource.decision_status;
          const supplier = displaySupplier(resource, addedSuppliers[resource.resource_id]);
          const quantity = [resource.quantity, resource.unit].filter(Boolean).join(" ") || "Verify";
          const price = displayPrice(resource, addedSuppliers[resource.resource_id]);
          return `<tr>
            <td><strong>${escapeHtml(resource.name)}</strong><br><span>${escapeHtml(resource.price_basis)}</span></td>
            <td>${escapeHtml(CATEGORY_LABELS[resource.category])}</td>
            <td>${escapeHtml(quantity)}</td>
            <td>${escapeHtml(decisionLabel(decision))}</td>
            <td>${price !== null ? escapeHtml(formatUSD(price)) : "Quote needed"}</td>
            <td>${supplier ? `<a href="${escapeAttribute(supplier.url)}">${escapeHtml(supplier.supplier_name)}</a><br>${escapeHtml(formatResultType(supplier.result_type))}` : "No match"}</td>
            <td>${escapeHtml(resource.source_tasks.map((task) => task.title).join(", ") || "Unlinked")}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
  const popup = window.open("", "_blank", "width=980,height=720");
  if (!popup) return;
  popup.opener = null;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function decisionLabel(status: ResourceDecisionStatus): string {
  return DECISION_OPTIONS.find((option) => option.status === status)?.label ?? status;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
