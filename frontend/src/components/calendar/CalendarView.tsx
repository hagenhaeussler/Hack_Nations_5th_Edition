import { CalendarDays, ChevronLeft, ChevronRight, Clock, DollarSign, ShieldAlert, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type { Workflow, WorkflowNode } from "@/lib/projects";
import { cn } from "@/lib/utils";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : new Date(time);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
}

function monthDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function getPlanStart(workflow: Workflow | undefined): Date {
  const dates =
    workflow?.nodes
      .map((node) => parseDate(node.data.startDate))
      .filter((date): date is Date => Boolean(date)) ?? [];
  if (dates.length === 0) return new Date();
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function dayOffset(start: Date, date: Date): number {
  return Math.max(0, Math.round((date.getTime() - start.getTime()) / MS_PER_DAY));
}

function hasResourceWarning(node: WorkflowNode): boolean {
  const text = [...node.data.equipment, ...node.data.materials, node.data.procedure]
    .join(" ")
    .toLowerCase();
  return /missing|unknown|confirm|to be confirmed|to buy/.test(text);
}

function hasRisk(node: WorkflowNode): boolean {
  return /risk|delay|uncertain|warning|missing/.test(node.data.procedure.toLowerCase());
}

interface CalendarViewProps {
  workflow?: Workflow;
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string | null) => void;
  onTaskMove: (taskId: string, nextDate: string) => void;
  headerActions?: ReactNode;
}

export function CalendarView({
  workflow,
  selectedTaskId,
  onTaskSelect,
  onTaskMove,
  headerActions,
}: CalendarViewProps) {
  const planStart = useMemo(() => getPlanStart(workflow), [workflow]);
  const [weekIndex, setWeekIndex] = useState(0);
  const weekStart = useMemo(() => addDays(planStart, weekIndex * 7), [planStart, weekIndex]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const tasksByDate = useMemo(() => {
    const groups = new Map<string, WorkflowNode[]>();
    for (const node of workflow?.nodes ?? []) {
      const parsed = parseDate(node.data.startDate) ?? planStart;
      const key = formatDate(parsed);
      groups.set(key, [...(groups.get(key) ?? []), node]);
    }
    return groups;
  }, [planStart, workflow?.nodes]);
  const totalWeeks = Math.max(
    1,
    Math.ceil(
      ((workflow?.nodes ?? []).reduce((max, node) => {
        const parsed = parseDate(node.data.startDate);
        return parsed ? Math.max(max, dayOffset(planStart, parsed) + 1) : max;
      }, 7)) / 7,
    ),
  );

  return (
    <section className="flex h-full min-h-[560px] flex-col bg-bg-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-default)] bg-bg-surface px-5 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            <CalendarDays size={14} strokeWidth={1.6} />
            Experiment Calendar
          </p>
          <h2 className="mt-1 text-[18px] font-medium tracking-[-0.01em] text-text-primary">
            Week {weekIndex + 1}: {monthDay(weekDays[0]!)} to {monthDay(weekDays[6]!)}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerActions}
          <button
            type="button"
            onClick={() => setWeekIndex((current) => Math.max(0, current - 1))}
            disabled={weekIndex === 0}
            className="inline-flex items-center gap-1 rounded-sm border border-[color:var(--border-default)] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary disabled:opacity-40"
          >
            <ChevronLeft size={14} strokeWidth={1.7} />
            Previous
          </button>
          <button
            type="button"
            onClick={() => setWeekIndex(0)}
            className="rounded-sm border border-[color:var(--border-default)] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => setWeekIndex((current) => Math.min(totalWeeks - 1, current + 1))}
            disabled={weekIndex >= totalWeeks - 1}
            className="inline-flex items-center gap-1 rounded-sm border border-[color:var(--border-default)] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary disabled:opacity-40"
          >
            Next
            <ChevronRight size={14} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-auto lg:grid-cols-7">
        {weekDays.map((day, index) => {
          const dateKey = formatDate(day);
          const tasks = tasksByDate.get(dateKey) ?? [];
          return (
            <DayColumn
              key={dateKey}
              date={day}
              dayNumber={weekIndex * 7 + index + 1}
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onTaskSelect={onTaskSelect}
              onTaskMove={onTaskMove}
            />
          );
        })}
      </div>
    </section>
  );
}

function DayColumn({
  date,
  dayNumber,
  tasks,
  selectedTaskId,
  onTaskSelect,
  onTaskMove,
}: {
  date: Date;
  dayNumber: number;
  tasks: WorkflowNode[];
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string | null) => void;
  onTaskMove: (taskId: string, nextDate: string) => void;
}) {
  return (
    <section className="min-h-[520px] border-r border-[color:var(--border-default)] bg-bg-primary/80 last:border-r-0">
      <header className="sticky top-0 z-[1] border-b border-[color:var(--border-default)] bg-bg-surface px-3 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Day {dayNumber}
        </p>
        <h3 className="mt-1 text-[15px] font-medium text-text-primary">
          {weekday(date)} <span className="text-text-secondary">{monthDay(date)}</span>
        </h3>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--border-default)] px-3 py-8 text-center text-[12px] text-text-tertiary">
            No tasks scheduled.
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              onSelect={() => onTaskSelect(task.id)}
              onMovePrevious={() => onTaskMove(task.id, formatDate(addDays(date, -1)))}
              onMoveNext={() => onTaskMove(task.id, formatDate(addDays(date, 1)))}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  selected,
  onSelect,
  onMovePrevious,
  onMoveNext,
}: {
  task: WorkflowNode;
  selected: boolean;
  onSelect: () => void;
  onMovePrevious: () => void;
  onMoveNext: () => void;
}) {
  const warning = hasResourceWarning(task);
  const risky = hasRisk(task);
  return (
    <article
      className={cn(
        "rounded-md border bg-bg-surface p-3 shadow-sm transition-colors",
        selected ? "border-[color:var(--accent)]" : "border-[color:var(--border-default)] hover:border-[color:var(--accent)]",
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-[13px] font-medium leading-[1.35] text-text-primary">
            {task.data.stepName}
          </h4>
          <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">
            {task.data.status ?? "upcoming"}
          </span>
        </div>
        <p className="mt-1 line-clamp-3 text-[12px] leading-[1.45] text-text-secondary">
          {task.data.procedure || "No procedure supplied."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} strokeWidth={1.6} />
            {task.data.timeEstimate}
          </span>
          <span className="inline-flex items-center gap-1">
            <DollarSign size={12} strokeWidth={1.6} />
            {task.data.price}
          </span>
          {task.data.people.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Users size={12} strokeWidth={1.6} />
              {task.data.people.slice(0, 2).join(", ")}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {warning ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10.5px] font-medium text-yellow-700">
              Resource check
            </span>
          ) : null}
          {risky ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10.5px] font-medium text-red-700">
              <ShieldAlert size={11} strokeWidth={1.6} />
              Risk
            </span>
          ) : null}
        </div>
      </button>
      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={onMovePrevious}
          className="rounded-sm border border-[color:var(--border-default)] px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-bg-hover"
        >
          Move -1d
        </button>
        <button
          type="button"
          onClick={onMoveNext}
          className="rounded-sm border border-[color:var(--border-default)] px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-bg-hover"
        >
          Move +1d
        </button>
      </div>
    </article>
  );
}
