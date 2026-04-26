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
  prompt,
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
        fallbackHypothesis={prompt}
        onAnalyzeRisks={onAnalyzeRisks}
      />
    );
  }

  return (
    <section className="flex-1 overflow-y-auto bg-bg-primary px-6 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
        <StatsPageHeader hypothesis={prompt} />
        <div
          className={cn(
            "grid gap-4",
            "grid-cols-1 md:grid-cols-2 xl:grid-cols-6",
            "xl:auto-rows-[minmax(140px,auto)]",
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
  fallbackHypothesis,
  onAnalyzeRisks,
}: {
  report: ProjectStatsReport;
  planId: string | null;
  fallbackHypothesis?: string;
  onAnalyzeRisks?: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const peopleCount = report.people_summary.length;
  const taskCounts = useMemo(() => {
    const counts: Record<WorkflowStatus, number> = {
      done: 0,
      active: 0,
      upcoming: 0,
    };
    for (const task of report.task_summary) counts[task.status] += 1;
    return counts;
  }, [report.task_summary]);

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
    <section className="flex-1 overflow-y-auto bg-bg-primary px-6 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
        <StatsPageHeader
          hypothesis={report.hypothesis || fallbackHypothesis}
          error={exportError}
          actions={
            <>
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
            </>
          }
        />

        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            "md:grid-cols-2",
            "xl:grid-cols-6 xl:auto-rows-[minmax(132px,auto)]",
          )}
        >
          <ReportMetricTile
            icon={<CalendarRange size={15} strokeWidth={1.5} />}
            eyebrow="Total time"
            value={formatEstimateValue(report.total_estimated_duration)}
            unit={formatEstimateUnit(report.total_estimated_duration)}
            detail={report.total_estimated_duration.basis}
            className="md:col-span-1 xl:col-span-2"
          />
          <ReportMetricTile
            icon={<Banknote size={15} strokeWidth={1.5} />}
            eyebrow="Total budget"
            value={
              report.total_estimated_budget.value === null
                ? "Unknown"
                : formatUSD(report.total_estimated_budget.value)
            }
            detail={formatBudgetDetail(report)}
            className="md:col-span-1 xl:col-span-2"
          />
          <ReportPeopleTile
            people={report.people_summary}
            count={peopleCount}
            className="md:col-span-2 xl:col-span-2"
          />
          <ReportTasksTile
            tasks={report.task_summary}
            summary={taskCounts}
            className="md:col-span-2 xl:col-span-4 xl:row-span-3"
          />
          <ReportValidationTile
            criteria={report.validation_criteria_summary}
            className="md:col-span-1 xl:col-span-2"
          />
          <ReportResourcesTile
            resources={report.purchase_list}
            className="md:col-span-1 xl:col-span-2"
          />
          <ReportRisksTile
            risks={report.risk_summary}
            className="md:col-span-2 xl:col-span-2"
          />
        </div>
      </div>
    </section>
  );
}

function formatEstimateValue(
  estimate: ProjectStatsReport["total_estimated_duration"],
): string {
  return estimate.value === null ? "Unknown" : String(estimate.value);
}

function formatEstimateUnit(
  estimate: ProjectStatsReport["total_estimated_duration"],
): string | undefined {
  return estimate.value === null ? estimate.unit : estimate.unit;
}

function formatBudgetDetail(report: ProjectStatsReport): string {
  const pricedItems = report.purchase_list
    .filter((item) => typeof item.estimated_price === "number" && item.estimated_price > 0)
    .slice(0, 3);
  if (pricedItems.length === 0) return report.total_estimated_budget.basis;
  return pricedItems
    .map((item) => `${formatUSD(item.estimated_price ?? 0, { compact: true })} ${item.name}`)
    .join(" · ");
}

function ReportMetricTile({
  icon,
  eyebrow,
  value,
  unit,
  detail,
  className,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  unit?: string;
  detail: string;
  className?: string;
}) {
  return (
    <Tile className={cn("min-h-[140px]", className)}>
      <TileHeading icon={icon} eyebrow={eyebrow} />
      <p className="mt-auto font-sans text-[30px] font-light leading-none tracking-[-0.02em] text-text-primary">
        {value}
        {unit ? (
          <span className="ml-1.5 text-[13px] font-normal tracking-normal text-text-secondary">
            {unit}
          </span>
        ) : null}
      </p>
      <p className="mt-2 line-clamp-2 text-[12px] leading-[1.45] text-text-secondary">
        {detail}
      </p>
    </Tile>
  );
}

function ReportTasksTile({
  tasks,
  summary,
  className,
}: {
  tasks: ProjectStatsReport["task_summary"];
  summary: Record<WorkflowStatus, number>;
  className?: string;
}) {
  return (
    <Tile className={cn("min-h-[300px] sm:min-h-[340px]", className)}>
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
        <div className="hidden items-center gap-3 text-[11px] text-text-secondary sm:flex">
          <SummaryDot status="done" label={`${summary.done} done`} />
          <SummaryDot status="active" label={`${summary.active} active`} />
          <SummaryDot status="upcoming" label={`${summary.upcoming} upcoming`} />
        </div>
      </header>

      {tasks.length > 0 ? (
        <ol className="-mx-2 flex flex-1 flex-col">
          {tasks.map((task, idx) => (
            <li
              key={task.node_id}
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
                {task.step_name}
              </span>
              <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                {formatReportSchedule(task.start_day, task.end_day)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">No scheduled tasks supplied.</p>
      )}
    </Tile>
  );
}

function ReportPeopleTile({
  people,
  count,
  className,
}: {
  people: string[];
  count: number;
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeading
        icon={<Users size={15} strokeWidth={1.5} />}
        eyebrow="People involved"
        title={`${count} contributor${count === 1 ? "" : "s"}`}
      />
      {people.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-2.5">
          {people.slice(0, 6).map((person) => {
            const { title, detail } = splitSummaryItem(person);
            return (
              <li key={person} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    "border border-[color:var(--border-default)] bg-bg-hover",
                    "text-[10.5px] font-medium tracking-[0.04em] text-text-secondary",
                  )}
                >
                  {initialsFromText(title)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-primary">
                    {title}
                  </p>
                  {detail ? (
                    <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-[1.4] text-text-secondary">
                      {detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">No people supplied.</p>
      )}
    </Tile>
  );
}

function ReportValidationTile({
  criteria,
  className,
}: {
  criteria: ProjectStatsReport["validation_criteria_summary"];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeading
        icon={<CheckCircle2 size={15} strokeWidth={1.5} />}
        eyebrow="Validation criteria"
        title="What 'confirmed' means"
      />
      {criteria.length > 0 ? (
        <ol className="mt-1 flex flex-col gap-2">
          {criteria.slice(0, 5).map((criterion, idx) => (
            <li key={criterion} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                  "bg-bg-hover text-[9.5px] font-medium tabular-nums text-text-secondary",
                )}
              >
                {idx + 1}
              </span>
              <p className="line-clamp-2 text-[12.5px] font-medium leading-[1.45] text-text-primary">
                {criterion}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">No validation criteria supplied.</p>
      )}
    </Tile>
  );
}

function ReportResourcesTile({
  resources,
  className,
}: {
  resources: ProjectStatsReport["purchase_list"];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeading
        icon={<ClipboardList size={15} strokeWidth={1.5} />}
        eyebrow="Resources"
        title={`${resources.length} to buy or verify`}
      />
      {resources.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-2">
          {resources.slice(0, 5).map((resource) => (
            <li key={`${resource.name}-${resource.availability}`} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12.5px] font-medium text-text-primary">
                  {resource.name}
                </p>
                <span className="shrink-0 rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-secondary">
                  {formatAvailability(resource.availability)}
                </span>
              </div>
              {resource.reason ? (
                <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-[1.4] text-text-secondary">
                  {resource.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">No purchase items supplied.</p>
      )}
    </Tile>
  );
}

function ReportRisksTile({
  risks,
  className,
}: {
  risks: ProjectStatsReport["risk_summary"];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeading
        icon={<ShieldAlert size={15} strokeWidth={1.5} />}
        eyebrow="Risks"
        title={`${risks.length} flagged`}
      />
      {risks.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-2">
          {risks.slice(0, 4).map((risk) => (
            <li key={risk.risk_id} className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-accent">
                  {risk.severity}
                </span>
                <p className="min-w-0 truncate text-[12.5px] font-medium text-text-primary">
                  {risk.description}
                </p>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-[1.4] text-text-secondary">
                {risk.mitigation}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">No risks flagged.</p>
      )}
    </Tile>
  );
}

function StatsPageHeader({
  hypothesis,
  actions,
  error,
}: {
  hypothesis?: string;
  actions?: React.ReactNode;
  error?: string | null;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--border-default)] pb-5">
      <div className="min-w-0">
        <h1 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Project statistics
        </h1>
        <p className="mt-4 text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Hypothesis
        </p>
        <p className="mt-1 max-w-[78ch] text-[13px] leading-[1.55] text-text-primary">
          {hypothesis?.trim() || "No hypothesis provided."}
        </p>
        {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

function formatReportSchedule(startDay: number, endDay: number): string {
  if (startDay <= 0) return "Day 0";
  const startWeek = Math.floor(startDay / 7) + 1;
  const endWeek = Math.floor(Math.max(endDay, startDay) / 7) + 1;
  return startWeek === endWeek ? `Week ${startWeek}` : `Week ${startWeek}-${endWeek}`;
}

function formatAvailability(value: string): string {
  return value.replace(/_/g, " ");
}

function splitSummaryItem(item: string): { title: string; detail: string } {
  const [title, ...rest] = item.split(/\s(?:·|-)\s|:\s/);
  return {
    title: title.trim() || item,
    detail: rest.join(" · ").trim(),
  };
}

function initialsFromText(value: string): string {
  const words = value
    .replace(/\bdr\.?\b/gi, "")
    .match(/[A-Za-z]+/g);
  if (!words || words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
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
        "flex flex-col rounded-xl border border-[color:var(--border-default)] bg-bg-surface",
        "p-5 shadow-sm",
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
    <Tile className="md:col-span-1 xl:col-span-2 xl:row-span-1">
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
    <Tile className="md:col-span-1 xl:col-span-2 xl:row-span-1">
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
    <Tile className="md:col-span-2 xl:col-span-2 xl:row-span-2">
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
    <Tile className="md:col-span-2 xl:col-span-4 xl:row-span-3">
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
    <Tile className="md:col-span-1 xl:col-span-2 xl:row-span-1">
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
    <Tile className="md:col-span-1 xl:col-span-2 xl:row-span-1">
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
