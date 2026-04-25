import {
  Banknote,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo } from "react";

import type { WorkflowStatus } from "@/components/timeline/WorkflowNode";
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
  /** Hypothesis from the landing page — used to seed the experts list. */
  prompt?: string;
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
export function StatisticsView({ prompt }: StatisticsViewProps) {
  const time = useMemo(() => getProjectTime(), []);
  const budget = useMemo(() => getProjectBudget(), []);
  const team = useMemo(() => getTeam(), []);
  const tasks = useMemo(() => getProjectTasks(), []);
  const validation = useMemo(() => getValidationCriteria(), []);
  const experts = useMemo(
    () => getDomainExperts(prompt ?? "labpilot", 5),
    [prompt],
  );

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
