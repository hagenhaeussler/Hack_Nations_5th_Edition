import {
  Banknote,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { WorkflowStatus } from "@/components/timeline/WorkflowNode";
import { downloadPlanReportPdf, getPlanStats } from "@/lib/api";
import type { Paper } from "@/lib/papers";
import type { FinalExperimentPlan, ProjectStatsReport, Workflow } from "@/lib/projects";
import {
  formatUSD,
  getDomainExperts,
  getProjectBudget,
  getProjectTasks,
  getProjectTime,
  getTeam,
  getValidationCriteria,
  type DomainExpert,
} from "@/lib/projectStats";
import { cn } from "@/lib/utils";

interface StatisticsViewProps {
  /** Hypothesis from the landing page — kept for context only. */
  prompt?: string;
  /** Papers attached to the project; powers the experts tile. */
  papers: Paper[];
  /** Workflow attached to the project; powers the time + tasks tiles. */
  workflow: Workflow;
  /** Creator Agent output, when available, powers the structured report view. */
  finalPlan?: FinalExperimentPlan;
  onAnalyzeRisks?: () => void;
}

/**
 * Project dashboard rendered as a bento grid.
 *
 * Layout (desktop, ≥ lg):
 *   ┌───────┬───────┬─────────┐
 *   │ Time  │ Budget│         │
 *   ├───────┴───────┤ People  │
 *   │               │         │
 *   │  All tasks    ├─────────┤
 *   │  (largest)    │ Validat.│
 *   │               ├─────────┤
 *   │               │ Experts │
 *   └───────────────┴─────────┘
 *
 * On narrower viewports the grid collapses to a single column and the tiles
 * stack in the same priority order. Card styling follows design_guide.md
 * §8 — warm cream surface, soft border, terracotta used only for accents.
 */
export function StatisticsView({
  prompt: _prompt,
  papers,
  workflow,
  finalPlan,
  onAnalyzeRisks,
}: StatisticsViewProps) {
  const [currentReport, setCurrentReport] = useState<ProjectStatsReport | null>(
    finalPlan?.stats_report ?? null,
  );
  const planId = finalPlan?.plan_id ?? null;
  const time = useMemo(() => getProjectTime(workflow), [workflow]);
  const budget = useMemo(() => getProjectBudget(), []);
  const team = useMemo(() => getTeam(), []);
  const tasks = useMemo(() => getProjectTasks(workflow), [workflow]);
  const validation = useMemo(() => getValidationCriteria(), []);
  const experts = useMemo(() => getDomainExperts(papers, 5), [papers]);

  useEffect(() => {
    if (!planId || !finalPlan) {
      setCurrentReport(null);
      return;
    }
    let cancelled = false;
    setCurrentReport(finalPlan.stats_report);
    getPlanStats(planId)
      .then((stats) => {
        if (!cancelled) setCurrentReport(stats);
      })
      .catch(() => {
        if (!cancelled) setCurrentReport(finalPlan.stats_report);
      });
    return () => {
      cancelled = true;
    };
  }, [finalPlan, planId]);

  if (finalPlan && currentReport) {
    return (
      <CreatorStatsView
        report={currentReport}
        planId={planId}
        onAnalyzeRisks={onAnalyzeRisks}
      />
    );
  }

  return (
    <section className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto w-full max-w-[1180px]">
        <div
          className={cn(
            "grid gap-4",
            "grid-cols-1 lg:grid-cols-6",
            "lg:auto-rows-[minmax(140px,auto)]",
          )}
        >
          <TimeTile
            totalWeeks={time.totalWeeks}
            startLabel={time.startLabel}
            endLabel={time.endLabel}
            taskCount={time.taskCount}
          />
          <BudgetTile total={budget.total} lines={budget.lines} />
          <PeopleTile team={team} />
          <TasksTile tasks={tasks} />
          <ValidationTile criteria={validation} />
          <ExpertsTile experts={experts} />
        </div>
      </div>
    </section>
  );
}

function CreatorStatsView({
  report,
  planId,
  onAnalyzeRisks,
}: {
  report: ProjectStatsReport;
  planId: string | null;
  onAnalyzeRisks?: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExportPdf() {
    if (!planId || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadPlanReportPdf(planId);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <header className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Creator Agent report
              </p>
              <h2 className="mt-1 font-sans text-[24px] font-medium tracking-[-0.01em] text-text-primary">
                {report.experiment_goal}
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {onAnalyzeRisks ? (
                <button
                  type="button"
                  onClick={onAnalyzeRisks}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-3 py-1.5",
                    "text-[13px] font-medium text-text-secondary shadow-sm transition-colors hover:bg-bg-hover hover:text-text-primary",
                  )}
                >
                  <ShieldAlert size={14} strokeWidth={1.75} />
                  Analyze Risks
                </button>
              ) : null}
              <button
                type="button"
                disabled={!planId || exporting}
                onClick={() => {
                  void handleExportPdf();
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[13px] font-medium text-white",
                  "shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-55",
                )}
              >
                {exporting ? (
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                ) : (
                  <Download size={14} strokeWidth={1.75} />
                )}
                {exporting ? "Exporting..." : "Export PDF"}
              </button>
            </div>
          </div>
          <p className="mt-2 max-w-[82ch] text-[13px] leading-[1.6] text-text-secondary">
            {report.summary}
          </p>
          {exportError ? (
            <p className="mt-2 text-[12px] text-red-700">{exportError}</p>
          ) : null}
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          <ReportMetricTile
            icon={<CalendarRange size={15} strokeWidth={1.5} />}
            eyebrow="Total time"
            value={formatEstimate(report.total_estimated_duration)}
            detail={report.total_estimated_duration.basis}
            className="lg:col-span-2"
          />
          <ReportMetricTile
            icon={<Banknote size={15} strokeWidth={1.5} />}
            eyebrow="Budget"
            value={
              report.total_estimated_budget.value === null
                ? "Unknown"
                : formatUSD(report.total_estimated_budget.value)
            }
            detail={report.total_estimated_budget.basis}
            className="lg:col-span-2"
          />
          <ReportListTile
            icon={<Users size={15} strokeWidth={1.5} />}
            eyebrow="People"
            title={`${report.people_summary.length} roles`}
            items={report.people_summary}
            className="lg:col-span-2"
          />
          <ReportListTile
            icon={<ClipboardList size={15} strokeWidth={1.5} />}
            eyebrow="Tasks"
            title={`${report.task_summary.length} scheduled tasks`}
            items={report.task_summary.map(
              (task) => `${task.step_name} · day ${task.start_day}`,
            )}
            className="lg:col-span-3"
          />
          <ReportListTile
            icon={<CheckCircle2 size={15} strokeWidth={1.5} />}
            eyebrow="Validation"
            title={`${report.validation_criteria_summary.length} criteria`}
            items={report.validation_criteria_summary}
            className="lg:col-span-3"
          />
          <ReportListTile
            icon={<BeakerIcon />}
            eyebrow="Resources to buy or verify"
            title={`${report.purchase_list.length} items`}
            items={report.purchase_list.map(
              (item) => `${item.name} · ${item.availability}`,
            )}
            className="lg:col-span-2"
          />
          <ReportListTile
            icon={<ShieldIcon />}
            eyebrow="Risks"
            title={`${report.risk_summary.length} flagged`}
            items={report.risk_summary.map(
              (risk) => `${risk.severity}: ${risk.description}`,
            )}
            className="lg:col-span-2"
          />
          <ReportListTile
            icon={<Sparkles size={15} strokeWidth={1.5} />}
            eyebrow="Learnings and citations"
            title="Influence summary"
            items={[
              ...report.learning_memory_summary,
              ...report.citation_summary
                .slice(0, 3)
                .map((citation) => `${citation.document_id}: ${citation.location}`),
            ]}
            className="lg:col-span-2"
          />
        </div>
      </div>
    </section>
  );
}

function formatEstimate(estimate: ProjectStatsReport["total_estimated_duration"]): string {
  return estimate.value === null ? `Unknown ${estimate.unit}` : `${estimate.value} ${estimate.unit}`;
}

function BeakerIcon() {
  return <ClipboardList size={15} strokeWidth={1.5} />;
}

function ShieldIcon() {
  return <CheckCircle2 size={15} strokeWidth={1.5} />;
}

function ReportMetricTile({
  icon,
  eyebrow,
  value,
  detail,
  className,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeading icon={icon} eyebrow={eyebrow} />
      <p className="mt-auto font-sans text-[30px] font-light leading-none tracking-[-0.02em] text-text-primary">
        {value}
      </p>
      <p className="mt-2 line-clamp-2 text-[12px] leading-[1.45] text-text-secondary">
        {detail}
      </p>
    </Tile>
  );
}

function ReportListTile({
  icon,
  eyebrow,
  title,
  items,
  className,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  items: string[];
  className?: string;
}) {
  const topItems = items.slice(0, 6);
  return (
    <Tile className={className}>
      <TileHeading icon={icon} eyebrow={eyebrow} title={title} />
      {topItems.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1.5">
          {topItems.map((item) => (
            <li
              key={item}
              className="line-clamp-2 text-[12.5px] leading-[1.5] text-text-secondary"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">None supplied.</p>
      )}
    </Tile>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tile primitives                                                           */
/* -------------------------------------------------------------------------- */

interface TileProps {
  className?: string;
  children: React.ReactNode;
}

function Tile({ className, children }: TileProps) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-lg border border-[color:var(--border-default)] bg-bg-surface",
        "p-5 shadow-sm transition-shadow duration-[var(--duration-fast)] hover:shadow-md",
        className,
      )}
    >
      {children}
    </article>
  );
}

interface TileHeadingProps {
  icon: React.ReactNode;
  eyebrow: string;
  title?: string;
}

function TileHeading({ icon, eyebrow, title }: TileHeadingProps) {
  return (
    <header className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-bg-hover text-text-secondary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          {eyebrow}
        </p>
        {title ? (
          <p className="mt-0.5 truncate text-[13px] font-medium text-text-primary">
            {title}
          </p>
        ) : null}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tiles                                                                     */
/* -------------------------------------------------------------------------- */

interface TimeTileProps {
  totalWeeks: number;
  startLabel: string;
  endLabel: string;
  taskCount: number;
}

function TimeTile({
  totalWeeks,
  startLabel,
  endLabel,
  taskCount,
}: TimeTileProps) {
  return (
    <Tile className="lg:col-span-2 lg:row-span-1">
      <TileHeading
        icon={<CalendarRange size={15} strokeWidth={1.5} />}
        eyebrow="Total time"
      />
      <div className="mt-auto">
        <p className="font-sans text-[34px] font-light leading-none tracking-[-0.02em] text-text-primary">
          {totalWeeks}
          <span className="ml-1.5 text-[14px] font-normal tracking-normal text-text-secondary">
            weeks
          </span>
        </p>
        <p className="mt-2 text-[12px] leading-[1.4] text-text-secondary">
          {startLabel} → {endLabel} · {taskCount} milestones
        </p>
      </div>
    </Tile>
  );
}

interface BudgetTileProps {
  total: number;
  lines: ReturnType<typeof getProjectBudget>["lines"];
}

function BudgetTile({ total, lines }: BudgetTileProps) {
  const top = lines.slice(0, 3);
  return (
    <Tile className="lg:col-span-2 lg:row-span-1">
      <TileHeading
        icon={<Banknote size={15} strokeWidth={1.5} />}
        eyebrow="Total budget"
      />
      <div className="mt-auto">
        <p className="font-sans text-[34px] font-light leading-none tracking-[-0.02em] text-text-primary">
          {formatUSD(total)}
        </p>
        <p className="mt-2 text-[12px] leading-[1.4] text-text-secondary">
          {top
            .map((l) => `${formatUSD(l.amount, { compact: true })} ${l.label.split(" ")[0].toLowerCase()}`)
            .join(" · ")}
        </p>
      </div>
    </Tile>
  );
}

interface PeopleTileProps {
  team: ReturnType<typeof getTeam>;
}

function PeopleTile({ team }: PeopleTileProps) {
  return (
    <Tile className="lg:col-span-2 lg:row-span-2">
      <TileHeading
        icon={<Users size={15} strokeWidth={1.5} />}
        eyebrow="People involved"
        title={`${team.length} contributors`}
      />
      <ul className="mt-1 flex flex-col gap-2.5">
        {team.map((member) => (
          <li key={member.name} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                "border border-[color:var(--border-default)] bg-bg-hover",
                "text-[10.5px] font-medium tracking-[0.04em] text-text-secondary",
              )}
            >
              {member.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-text-primary">
                {member.name}
              </p>
              <p className="mt-0.5 truncate text-[11.5px] leading-[1.4] text-text-secondary">
                {member.role} · {member.focus}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

interface TasksTileProps {
  tasks: ReturnType<typeof getProjectTasks>;
}

function TasksTile({ tasks }: TasksTileProps) {
  const summary = useMemo(() => {
    const counts: Record<WorkflowStatus, number> = {
      done: 0,
      active: 0,
      upcoming: 0,
    };
    for (const t of tasks) counts[t.status] += 1;
    return counts;
  }, [tasks]);

  return (
    <Tile className="lg:col-span-4 lg:row-span-3">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-bg-hover text-text-secondary">
            <ClipboardList size={15} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              All tasks
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-text-primary">
              {tasks.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-secondary">
          <SummaryDot status="done" label={`${summary.done} done`} />
          <SummaryDot status="active" label={`${summary.active} active`} />
          <SummaryDot
            status="upcoming"
            label={`${summary.upcoming} upcoming`}
          />
        </div>
      </header>

      <ol className="-mx-2 flex flex-1 flex-col">
        {tasks.map((task, idx) => (
          <li
            key={task.id}
            className={cn(
              "flex items-center gap-3 rounded-sm px-2 py-2",
              "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover",
              idx !== 0 && "border-t border-[color:var(--border-default)]",
            )}
          >
            <span className="w-6 shrink-0 text-[11px] font-medium tabular-nums text-text-tertiary">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <StatusDot status={task.status} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
              {task.title}
            </span>
            {task.schedule ? (
              <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                {task.schedule}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Tile>
  );
}

function SummaryDot({
  status,
  label,
}: {
  status: WorkflowStatus;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} />
      <span>{label}</span>
    </span>
  );
}

function StatusDot({ status }: { status: WorkflowStatus }) {
  return (
    <span
      aria-label={status}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        status === "done" && "bg-text-tertiary",
        status === "active" && "bg-accent",
        status === "upcoming" &&
          "border border-[color:var(--border-strong)] bg-transparent",
      )}
    />
  );
}

interface ValidationTileProps {
  criteria: ReturnType<typeof getValidationCriteria>;
}

function ValidationTile({ criteria }: ValidationTileProps) {
  return (
    <Tile className="lg:col-span-2 lg:row-span-1">
      <TileHeading
        icon={<CheckCircle2 size={15} strokeWidth={1.5} />}
        eyebrow="Validation criteria"
        title="What 'confirmed' means"
      />
      <ol className="mt-1 flex flex-col gap-2">
        {criteria.map((c, idx) => (
          <li key={c.label} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                "bg-bg-hover text-[9.5px] font-medium tabular-nums text-text-secondary",
              )}
            >
              {idx + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium leading-[1.4] text-text-primary">
                {c.label}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-[1.45] text-text-secondary">
                {c.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Tile>
  );
}

interface ExpertsTileProps {
  experts: DomainExpert[];
}

function ExpertsTile({ experts }: ExpertsTileProps) {
  return (
    <Tile className="lg:col-span-2 lg:row-span-1">
      <TileHeading
        icon={<Sparkles size={15} strokeWidth={1.5} />}
        eyebrow="Domain experts"
        title="Authors of related work"
      />
      <ul className="mt-1 flex flex-col gap-2.5">
        {experts.map((expert) => (
          <li key={expert.name} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                "border border-[color:var(--border-default)] bg-bg-hover",
                "text-[10.5px] font-medium tracking-[0.04em] text-text-secondary",
              )}
            >
              {expert.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-text-primary">
                  {expert.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.04em]",
                    "bg-accent-subtle text-accent",
                  )}
                  title={`${expert.paperCount} matching paper${expert.paperCount === 1 ? "" : "s"}`}
                >
                  {expert.paperCount}×
                </span>
              </p>
              <p
                className="mt-0.5 line-clamp-1 text-[11.5px] leading-[1.4] text-text-secondary"
                title={expert.topPaperTitle}
              >
                {expert.topVenue} · {expert.topPaperTitle}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
