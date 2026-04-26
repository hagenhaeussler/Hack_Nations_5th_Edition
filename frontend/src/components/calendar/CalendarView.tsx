import {
  CalendarDays,
  Check,
  Clock,
  DollarSign,
  Package,
  ShieldAlert,
  Wrench,
  Users,
} from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { parseDurationDays } from "@/components/timeline/WorkflowNode";
import type { Workflow, WorkflowNode } from "@/lib/projects";
import { cn } from "@/lib/utils";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

/**
 * Width of each day column inside the horizontal timeline. A one-day task card
 * uses this as its natural width; card height follows `CARD_ASPECT_HEIGHT_RATIO`
 * for a portrait tile (width 1, height ~1.41).
 */
const DAY_WIDTH_PX = 240;
const CARD_ASPECT_HEIGHT_RATIO = 1.414;

/** Minimum visible span so empty/short plans still feel like a calendar. */
const MIN_TIMELINE_DAYS = 14;

/** Hard upper bound for resize so a runaway drag can't blow up the grid. */
const MAX_TASK_SPAN_DAYS = 90;

/** Pointer travel (px) before a press is treated as a drag rather than a click. */
const CLICK_DRAG_THRESHOLD = 4;

/** Short GPU-only easing used when a released card settles into its snapped slot. */
const CARD_MOVE_TRANSITION = "transform 140ms ease-out";

/** Default day count for a task, derived from its `timeEstimate` string. */
function durationForTask(task: WorkflowNode): number {
  const days = parseDurationDays(task.data.timeEstimate);
  return Math.min(MAX_TASK_SPAN_DAYS, Math.max(1, Math.round(days)));
}

/** Format an integer day count back into a human `timeEstimate` string. */
function formatDaysAsTimeEstimate(days: number): string {
  const n = Math.max(1, Math.round(days));
  return n === 1 ? "1 day" : `${n} days`;
}

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

/**
 * Resolve the calendar's fixed first day from the timeline-creation timestamp.
 *
 * The first column on the calendar is anchored to the local-calendar date the
 * timeline was created on (rather than the earliest task's start), so the view
 * stays stable as tasks are rescheduled. We normalize to UTC midnight so the
 * column math (which is UTC throughout this file) lines up cleanly.
 *
 * Falls back to today if the timestamp is missing or unparseable.
 */
function getPlanStart(planCreatedAt: string | undefined): Date {
  const fallback = () => {
    const now = new Date();
    return new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
  };
  if (!planCreatedAt) return fallback();
  const created = new Date(planCreatedAt);
  if (Number.isNaN(created.getTime())) return fallback();
  return new Date(
    Date.UTC(created.getFullYear(), created.getMonth(), created.getDate()),
  );
}

function dayOffset(start: Date, date: Date): number {
  return Math.round((date.getTime() - start.getTime()) / MS_PER_DAY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

interface PlacedTask {
  task: WorkflowNode;
  /** 1-based start column on the absolute timeline (1..totalDays). */
  startCol: number;
  /** Number of day columns the card covers (>= 1). */
  span: number;
  /** 1-based grid row, assigned to avoid overlaps. */
  row: number;
}

/**
 * Place every task onto the absolute timeline (column index runs from `1` for
 * the plan start through `totalDays`) and pack them into as few rows as
 * possible. Tasks that begin before the plan start are clipped to start on
 * day 1; tasks that extend past the end of the timeline are clipped to fit.
 */
function placeTasksOnTimeline(
  workflow: Workflow | undefined,
  planStart: Date,
  totalDays: number,
  durations: Record<string, number>,
  startDates: Record<string, string>,
): PlacedTask[] {
  type Candidate = { task: WorkflowNode; startCol: number; span: number };
  const candidates: Candidate[] = [];

  for (const task of workflow?.nodes ?? []) {
    const parsed = parseDate(startDates[task.id] ?? task.data.startDate);
    if (!parsed) continue;

    const rawStartCol = dayOffset(planStart, parsed) + 1;
    const duration = Math.max(1, durations[task.id] ?? durationForTask(task));
    const rawEndColExclusive = rawStartCol + duration;

    if (rawEndColExclusive <= 1) continue;
    if (rawStartCol > totalDays) continue;

    const startCol = clamp(rawStartCol, 1, totalDays);
    const endColExclusive = clamp(rawEndColExclusive, startCol + 1, totalDays + 1);
    const span = Math.max(1, endColExclusive - startCol);

    candidates.push({ task, startCol, span });
  }

  candidates.sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  const rowNextFree: number[] = [];
  const placed: PlacedTask[] = [];
  for (const c of candidates) {
    let row = 0;
    for (let r = 0; r < rowNextFree.length; r++) {
      if (rowNextFree[r]! <= c.startCol) {
        row = r + 1;
        rowNextFree[r] = c.startCol + c.span;
        break;
      }
    }
    if (row === 0) {
      rowNextFree.push(c.startCol + c.span);
      row = rowNextFree.length;
    }
    placed.push({ task: c.task, startCol: c.startCol, span: c.span, row });
  }
  return placed;
}

/**
 * Live preview for resize drags. Card movement is intentionally handled
 * imperatively on the dragged DOM node so pointer movement never rerenders the
 * calendar grid.
 */
type DragPreview = { kind: "resize"; taskId: string; startCol: number; span: number };

interface CalendarViewProps {
  workflow?: Workflow;
  /**
   * ISO timestamp of when this timeline was created. The calendar's first day
   * is anchored to this date — tasks are positioned relative to it rather than
   * to the earliest task's `startDate`, so the view stays stable as tasks are
   * rescheduled.
   */
  planCreatedAt: string;
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string | null) => void;
  onTaskMove: (taskId: string, nextDate: string) => void;
  /**
   * Persist a duration change for `taskId`. The new value is a `timeEstimate`
   * string in human form (e.g. `"3 days"`). Optional — without it the calendar
   * still supports resize but only as an in-session visual override.
   */
  onTaskDurationChange?: (taskId: string, timeEstimate: string) => void;
  onTaskStatusChange?: (
    taskId: string,
    status: NonNullable<WorkflowNode["data"]["status"]>,
  ) => void;
  headerActions?: ReactNode;
}

export function CalendarView({
  workflow,
  planCreatedAt,
  selectedTaskId,
  onTaskSelect,
  onTaskMove,
  onTaskDurationChange,
  onTaskStatusChange,
  headerActions,
}: CalendarViewProps) {
  const planStart = useMemo(() => getPlanStart(planCreatedAt), [planCreatedAt]);

  // Optimistic local override for in-flight duration edits. Cleared via the
  // reconciliation effect below once the persisted workflow catches up. This
  // keeps the resized card visible across the API round-trip and avoids the
  // brief snap-back that would otherwise happen on drop.
  const [taskDurations, setTaskDurations] = useState<Record<string, number>>({});
  const [taskStartDates, setTaskStartDates] = useState<Record<string, string>>({});
  const [taskStatuses, setTaskStatuses] = useState<
    Record<string, NonNullable<WorkflowNode["data"]["status"]>>
  >({});
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  // Drop optimistic overrides whose persisted value now matches (i.e. the API
  // write has completed and flowed back as props).
  useEffect(() => {
    setTaskDurations((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [taskId, days] of Object.entries(current)) {
        const node = workflow?.nodes.find((n) => n.id === taskId);
        if (!node) {
          changed = true;
          continue;
        }
        if (durationForTask(node) === days) {
          changed = true;
          continue;
        }
        next[taskId] = days;
      }
      return changed ? next : current;
    });

    setTaskStartDates((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [taskId, startDate] of Object.entries(current)) {
        const node = workflow?.nodes.find((n) => n.id === taskId);
        if (!node) {
          changed = true;
          continue;
        }
        if (node.data.startDate === startDate) {
          changed = true;
          continue;
        }
        next[taskId] = startDate;
      }
      return changed ? next : current;
    });
  }, [workflow]);

  useEffect(() => {
    setTaskStatuses((current) => {
      let changed = false;
      const next: Record<string, NonNullable<WorkflowNode["data"]["status"]>> = {};
      for (const [taskId, status] of Object.entries(current)) {
        const node = workflow?.nodes.find((n) => n.id === taskId);
        if (!node) {
          changed = true;
          continue;
        }
        if ((node.data.status ?? "upcoming") === status) {
          changed = true;
          continue;
        }
        next[taskId] = status;
      }
      return changed ? next : current;
    });
  }, [workflow]);

  // Total days the timeline spans — covers every task with their overrides,
  // padded out to a round number of weeks so the week-boundary cues land
  // naturally at the right edge.
  const totalDays = useMemo(() => {
    let farthest = (workflow?.nodes ?? []).reduce((max, node) => {
      const parsed = parseDate(taskStartDates[node.id] ?? node.data.startDate);
      if (!parsed) return max;
      const dur = Math.max(1, taskDurations[node.id] ?? durationForTask(node));
      return Math.max(max, dayOffset(planStart, parsed) + dur);
    }, MIN_TIMELINE_DAYS);
    // While the user is actively resizing past the current end, pad the grid
    // out live so the card stays inside the rendered columns mid-drag.
    if (dragPreview?.kind === "resize") {
      farthest = Math.max(farthest, dragPreview.startCol + dragPreview.span - 1);
    }
    return Math.max(MIN_TIMELINE_DAYS, Math.ceil(farthest / DAYS_PER_WEEK) * DAYS_PER_WEEK);
  }, [dragPreview, planStart, taskDurations, taskStartDates, workflow?.nodes]);

  const timelineDays = useMemo(
    () => Array.from({ length: totalDays }, (_, index) => addDays(planStart, index)),
    [planStart, totalDays],
  );

  const placedTasks = useMemo(
    () => placeTasksOnTimeline(workflow, planStart, totalDays, taskDurations, taskStartDates),
    [workflow, planStart, totalDays, taskDurations, taskStartDates],
  );

  const gridRef = useRef<HTMLDivElement | null>(null);

  const measureTaskRects = useCallback(() => {
    const rects = new Map<string, DOMRect>();
    gridRef.current
      ?.querySelectorAll<HTMLElement>("[data-calendar-task-id]")
      .forEach((element) => {
        const taskId = element.dataset.calendarTaskId;
        if (taskId) rects.set(taskId, element.getBoundingClientRect());
      });
    return rects;
  }, []);

  const animateStackingChanges = useCallback(
    (previousRects: Map<string, DOMRect>, excludedTaskId: string) => {
      gridRef.current
        ?.querySelectorAll<HTMLElement>("[data-calendar-task-id]")
        .forEach((element) => {
          const taskId = element.dataset.calendarTaskId;
          if (!taskId || taskId === excludedTaskId) return;

          const previous = previousRects.get(taskId);
          if (!previous) return;

          const current = element.getBoundingClientRect();
          const dx = previous.left - current.left;
          const dy = previous.top - current.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

          element.animate(
            [
              { transform: `translate3d(${dx}px, ${dy}px, 0)` },
              { transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 140,
              easing: "ease-out",
            },
          );
        });
    },
    [],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, placed: PlacedTask, edge: "left" | "right") => {
      event.preventDefault();
      event.stopPropagation();
      if (!gridRef.current) return;

      const handle = event.currentTarget;
      const colWidth = DAY_WIDTH_PX;
      const initialStartCol = placed.startCol;
      const initialSpan = placed.span;
      const initialEndColInclusive = initialStartCol + initialSpan - 1;
      const startX = event.clientX;

      let preview: Extract<DragPreview, { kind: "resize" }> = {
        kind: "resize",
        taskId: placed.task.id,
        startCol: initialStartCol,
        span: initialSpan,
      };
      setDragPreview(preview);
      handle.setPointerCapture(event.pointerId);
      let frame = 0;

      const publishPreview = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          setDragPreview(preview);
        });
      };

      const handleMove = (ev: PointerEvent) => {
        const colDelta = Math.round((ev.clientX - startX) / colWidth);
        if (edge === "right") {
          // Allow growing well past the rendered timeline — the parent will
          // recompute `totalDays` once the duration is persisted, padding the
          // grid out so the card stays in view.
          const maxEndCol = initialStartCol + MAX_TASK_SPAN_DAYS - 1;
          const newEndColInclusive = clamp(
            initialEndColInclusive + colDelta,
            initialStartCol,
            maxEndCol,
          );
          preview = {
            kind: "resize",
            taskId: placed.task.id,
            startCol: initialStartCol,
            span: newEndColInclusive - initialStartCol + 1,
          };
        } else {
          // Left edge: keep the right edge pinned and slide the start. We
          // intentionally clamp the start to day 1 so the underlying plan
          // start (which drives the whole grid) never moves during a drag.
          const newStartCol = clamp(
            initialStartCol + colDelta,
            1,
            initialEndColInclusive,
          );
          preview = {
            kind: "resize",
            taskId: placed.task.id,
            startCol: newStartCol,
            span: initialEndColInclusive - newStartCol + 1,
          };
        }
        publishPreview();
      };

      const handleUp = () => {
        handle.removeEventListener("pointermove", handleMove);
        handle.removeEventListener("pointerup", handleUp);
        handle.removeEventListener("pointercancel", handleUp);
        if (frame) window.cancelAnimationFrame(frame);
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          // ignore — pointer may already have been released
        }

        const { startCol, span } = preview;
        setDragPreview(null);
        const previousRects = measureTaskRects();
        const durationChanged = span !== initialSpan;
        const newStartDate =
          edge === "left" && startCol !== initialStartCol
            ? formatDate(addDays(planStart, startCol - 1))
            : null;
        const startDateChanged =
          Boolean(newStartDate) && placed.task.data.startDate !== newStartDate;

        // Apply the optimistic local span immediately so the card stays its
        // new size while the API round-trip resolves.
        if (durationChanged || startDateChanged) {
          flushSync(() => {
            if (durationChanged) {
              setTaskDurations((prev) => ({ ...prev, [placed.task.id]: span }));
            }
            if (startDateChanged && newStartDate) {
              setTaskStartDates((prev) => ({ ...prev, [placed.task.id]: newStartDate }));
            }
          });
          animateStackingChanges(previousRects, placed.task.id);
        }

        if (durationChanged) {
          onTaskDurationChange?.(
            placed.task.id,
            formatDaysAsTimeEstimate(span),
          );
        }
        if (startDateChanged && newStartDate) {
          onTaskMove(placed.task.id, newStartDate);
        }
      };

      handle.addEventListener("pointermove", handleMove);
      handle.addEventListener("pointerup", handleUp);
      handle.addEventListener("pointercancel", handleUp);
    },
    [animateStackingChanges, measureTaskRects, onTaskDurationChange, onTaskMove, planStart],
  );

  /**
   * Pointer-down on the card body. Below the click/drag threshold the gesture
   * is treated as a tap (selects the task); past the threshold the card follows
   * the pointer using direct DOM transforms and only snaps to the nearest day
   * column on release. This keeps pointer movement off React's render path.
   */
  const startMove = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      placed: PlacedTask,
      startCol: number,
      span: number,
    ) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const card = handle.parentElement;
      if (!card) return;

      const colWidth = DAY_WIDTH_PX;
      const initialStartCol = startCol;
      const initialSpan = span;
      const startX = event.clientX;
      const startY = event.clientY;
      let didMove = false;
      let frame = 0;
      let currentX = 0;
      let currentY = 0;
      let committed = false;

      // Pixel range the card can be translated within without leaving the
      // rendered timeline. We clamp `translateX` rather than the snapped
      // column so the card glides under the pointer continuously, instead of
      // snapping a full day at a time as `gridColumn` would force.
      const maxStart = Math.max(1, totalDays - initialSpan + 1);
      const minTranslate = (1 - initialStartCol) * colWidth;
      const maxTranslate = (maxStart - initialStartCol) * colWidth;

      const resetCardStyles = () => {
        card.style.transform = "";
        card.style.transition = "";
        card.style.willChange = "";
        card.style.zIndex = "";
        card.style.boxShadow = "";
      };

      const paintCard = (x: number, y: number, scale = true) => {
        card.style.transform = `translate3d(${x}px, ${y}px, 0)${scale ? " scale(1.01)" : ""}`;
      };

      const schedulePaint = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          paintCard(currentX, currentY);
        });
      };

      handle.setPointerCapture(event.pointerId);

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!didMove && Math.hypot(dx, dy) < CLICK_DRAG_THRESHOLD) return;
        if (!didMove) {
          didMove = true;
          card.style.transition = "none";
          card.style.willChange = "transform";
          card.style.zIndex = "20";
          card.style.boxShadow = "var(--shadow-lg)";
        }
        currentX = clamp(dx, minTranslate, maxTranslate);
        currentY = dy;
        schedulePaint();
      };

      const handleUp = () => {
        handle.removeEventListener("pointermove", handleMove);
        handle.removeEventListener("pointerup", handleUp);
        handle.removeEventListener("pointercancel", handleUp);
        if (frame) window.cancelAnimationFrame(frame);
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          // ignore — pointer may already have been released
        }

        const finalCol = clamp(
          initialStartCol + Math.round(currentX / colWidth),
          1,
          maxStart,
        );

        if (!didMove || finalCol === initialStartCol) {
          if (!didMove) {
            resetCardStyles();
            onTaskSelect(placed.task.id);
            return;
          }

          card.style.transition = CARD_MOVE_TRANSITION;
          paintCard(0, 0, false);
          window.setTimeout(resetCardStyles, 160);
          return;
        }

        const snappedX = (finalCol - initialStartCol) * colWidth;
        const newStartDate = formatDate(addDays(planStart, finalCol - 1));

        const commitSnappedPosition = () => {
          if (committed) return;
          committed = true;
          card.removeEventListener("transitionend", commitSnappedPosition);
          const previousRects = measureTaskRects();

          // Move the grid slot and clear the transform in one synchronous pass
          // so the card is already visually at the new position when React
          // takes over again.
          flushSync(() => {
            setTaskStartDates((prev) => ({ ...prev, [placed.task.id]: newStartDate }));
          });
          resetCardStyles();
          animateStackingChanges(previousRects, placed.task.id);
          if (placed.task.data.startDate !== newStartDate) {
            onTaskMove(placed.task.id, newStartDate);
          }
        };

        card.style.transition = CARD_MOVE_TRANSITION;
        paintCard(snappedX, 0);
        card.addEventListener("transitionend", commitSnappedPosition, { once: true });
        window.setTimeout(commitSnappedPosition, 180);
      };

      handle.addEventListener("pointermove", handleMove);
      handle.addEventListener("pointerup", handleUp);
      handle.addEventListener("pointercancel", handleUp);
    },
    [animateStackingChanges, measureTaskRects, onTaskMove, onTaskSelect, planStart, totalDays],
  );

  const gridTemplateColumns = `repeat(${totalDays}, ${DAY_WIDTH_PX}px)`;
  const trackMinWidth = totalDays * DAY_WIDTH_PX;

  // Live "today" indicator (Google-Calendar-style vertical line). Snapped to
  // the start of the current day rather than tracking the hour/minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const nowOffsetDays = useMemo(() => {
    // Use the local-calendar date to match `planStart` (which is anchored to
    // the local creation date and then normalized to UTC midnight).
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((todayUtc - planStart.getTime()) / MS_PER_DAY);
  }, [now, planStart]);

  const showsNowLine = nowOffsetDays >= 0 && nowOffsetDays < totalDays;
  const nowLineLeft = nowOffsetDays * DAY_WIDTH_PX;

  return (
    <section className="flex h-full min-h-[560px] flex-col bg-bg-primary">
      {headerActions ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[color:var(--border-default)] bg-bg-surface px-5 py-3">
          {headerActions}
        </div>
      ) : null}

      {/* Single 2-axis scroller: the day-name strip is sticky on top, and the
          body grid pans horizontally beneath it. No prev/next pagination —
          the scroll position itself is the navigation. */}
      <div className="relative flex-1 overflow-auto">
        <div className="relative" style={{ minWidth: trackMinWidth }}>
          {showsNowLine ? (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-30"
              style={{ left: nowLineLeft }}
              aria-hidden="true"
            >
              <div className="h-full w-px bg-blue-500/90 shadow-[0_0_0_0.5px_rgba(59,130,246,0.35)]" />
              <div className="absolute -left-[3px] top-0 h-[7px] w-[7px] rounded-full bg-blue-500" />
            </div>
          ) : null}
          <div
            className="sticky top-0 z-[2] grid border-b border-[color:var(--border-default)] bg-bg-surface"
            style={{ gridTemplateColumns }}
          >
            {timelineDays.map((day, index) => {
              const isWeekStart = index > 0 && index % DAYS_PER_WEEK === 0;
              const isWeekEnd = (index + 1) % DAYS_PER_WEEK === 0;
              return (
                <div
                  key={`hdr-${formatDate(day)}`}
                  className={cn(
                    "px-3 py-3",
                    !isWeekEnd &&
                      "border-r border-r-[color:var(--border-default)] [border-right-style:dashed]",
                    isWeekStart &&
                      "border-l border-l-[color:var(--border-strong)] [border-left-style:solid]",
                  )}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Day {index + 1}
                  </p>
                  <h3 className="mt-1 text-[15px] font-medium text-text-primary">
                    {weekday(day)}{" "}
                    <span className="text-text-secondary">{monthDay(day)}</span>
                  </h3>
                </div>
              );
            })}
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute inset-0 grid"
              style={{ gridTemplateColumns }}
              aria-hidden="true"
            >
              {timelineDays.map((day, index) => {
                const isWeekStart = index > 0 && index % DAYS_PER_WEEK === 0;
                const isWeekEnd = (index + 1) % DAYS_PER_WEEK === 0;
                return (
                  <div
                    key={`bg-${formatDate(day)}`}
                    className={cn(
                      !isWeekEnd &&
                        "border-r border-r-[color:var(--border-default)] [border-right-style:dashed]",
                      isWeekStart &&
                        "border-l border-l-[color:var(--border-strong)] [border-left-style:solid]",
                    )}
                  />
                );
              })}
            </div>

            <div
              ref={gridRef}
              className="relative grid min-h-[420px] auto-rows-min gap-y-2 px-1 py-2"
              style={{ gridTemplateColumns }}
            >
              {placedTasks.length === 0 ? (
                <div
                  className="sticky left-0 mx-2 rounded-md border border-dashed border-[color:var(--border-default)] px-3 py-8 text-center text-[12px] text-text-tertiary"
                  style={{ gridColumn: "1 / span 7", width: `${DAY_WIDTH_PX * 7 - 16}px` }}
                >
                  No tasks scheduled yet.
                </div>
              ) : (
                placedTasks.map((placed) => {
                  const override =
                    dragPreview && dragPreview.taskId === placed.task.id ? dragPreview : null;
                  // Resize drags rewrite the grid placement. Move drags are
                  // handled directly on the dragged card DOM node to keep the
                  // rest of the calendar out of the pointer-move render loop.
                  const startCol =
                    override?.kind === "resize" ? override.startCol : placed.startCol;
                  const span =
                    override?.kind === "resize" ? override.span : placed.span;
                  const startDate = formatDate(addDays(planStart, startCol - 1));
                  return (
                    <TaskCard
                      key={placed.task.id}
                      task={placed.task}
                      selected={selectedTaskId === placed.task.id}
                      isResizing={override?.kind === "resize"}
                      completed={(taskStatuses[placed.task.id] ?? placed.task.data.status) === "done"}
                      span={span}
                      startDate={startDate}
                      onCompletedChange={(completed) => {
                        const status = completed ? "done" : "upcoming";
                        setTaskStatuses((prev) => ({
                          ...prev,
                          [placed.task.id]: status,
                        }));
                        onTaskStatusChange?.(placed.task.id, status);
                      }}
                      onMoveStart={(ev) => startMove(ev, placed, startCol, span)}
                      onResizeStart={(edge, ev) =>
                        startResize(ev, { ...placed, startCol, span }, edge)
                      }
                      style={{
                        gridColumn: `${startCol} / span ${span}`,
                        gridRowStart: placed.row,
                      }}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface TaskCardProps {
  task: WorkflowNode;
  selected: boolean;
  isResizing: boolean;
  completed: boolean;
  span: number;
  startDate: string;
  onCompletedChange: (completed: boolean) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (edge: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
}

function TaskCard({
  task,
  selected,
  isResizing,
  completed,
  span,
  startDate,
  onCompletedChange,
  onMoveStart,
  onResizeStart,
  style,
}: TaskCardProps) {
  const warning = hasResourceWarning(task);
  const risky = hasRisk(task);
  const peopleLabel =
    task.data.people.length > 0
      ? `${task.data.people.slice(0, 2).join(", ")}${
          task.data.people.length > 2 ? ` +${task.data.people.length - 2}` : ""
        }`
      : "No people assigned";
  const equipmentCount = task.data.equipment.length;
  const materialCount = task.data.materials.length;
  const validationCount = task.data.validationCriteria.length;

  return (
    <article
      data-calendar-task-id={task.id}
      style={{ ...style, aspectRatio: `1 / ${CARD_ASPECT_HEIGHT_RATIO}` }}
      className={cn(
        "relative ml-1 mr-3 flex min-h-0 flex-col overflow-hidden rounded-md border bg-bg-surface shadow-sm transition-[box-shadow,border-color]",
        selected
          ? "border-[color:var(--accent)]"
          : "border-[color:var(--border-default)] hover:border-[color:var(--accent)]",
        isResizing && "ring-1 ring-[color:var(--accent)]/40",
      )}
    >
      <button
        type="button"
        aria-label={`Resize start of ${task.data.stepName}`}
        onPointerDown={(event) => onResizeStart("left", event)}
        className={cn(
          "absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize touch-none",
          "rounded-l-md bg-transparent transition-colors",
          "hover:bg-[color:var(--accent)]/30",
          isResizing && "bg-[color:var(--accent)]/40",
        )}
      />
      <button
        type="button"
        aria-label={`Resize end of ${task.data.stepName}`}
        onPointerDown={(event) => onResizeStart("right", event)}
        className={cn(
          "absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize touch-none",
          "rounded-r-md bg-transparent transition-colors",
          "hover:bg-[color:var(--accent)]/30",
          isResizing && "bg-[color:var(--accent)]/40",
        )}
      />

      <button
        type="button"
        aria-label={
          completed
            ? `Mark ${task.data.stepName} incomplete`
            : `Mark ${task.data.stepName} complete`
        }
        aria-pressed={completed}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onCompletedChange(!completed);
        }}
        className={cn(
          "absolute right-3 top-3 z-20 flex h-5 w-5 items-center justify-center rounded-sm border transition-colors",
          completed
            ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
            : "border-[color:var(--border-strong)] bg-bg-surface text-transparent hover:border-[color:var(--accent)]",
        )}
      >
        <Check size={13} strokeWidth={2.4} />
      </button>

      <div
        role="button"
        tabIndex={0}
        aria-label={`${task.data.stepName}, drag to reschedule`}
        onPointerDown={onMoveStart}
        className={cn(
          "flex h-full w-full select-none flex-col px-3 py-3 text-left",
          "touch-none",
          "cursor-grab active:cursor-grabbing",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40",
        )}
      >
        <div>
          <h4 className="pr-7 text-[13px] font-semibold leading-[1.3] text-text-primary line-clamp-2">
            {task.data.stepName}
          </h4>
        </div>

        <p className="mt-2 min-h-0 flex-1 rounded-md bg-bg-primary/60 px-2 py-2 text-[12px] leading-[1.45] text-text-secondary line-clamp-[8]">
          {task.data.procedure || "No procedure supplied."}
        </p>

        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10.5px] leading-[1.25] text-text-tertiary">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-sm bg-bg-hover/70 px-1.5 py-1">
            <CalendarDays size={11} strokeWidth={1.6} />
            <span className="truncate">
              {span === 1 ? "1 day" : `${span} days`} · {startDate}
            </span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 rounded-sm bg-bg-hover/70 px-1.5 py-1">
            <Clock size={11} strokeWidth={1.6} />
            <span className="truncate">{task.data.timeEstimate}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 rounded-sm bg-bg-hover/70 px-1.5 py-1">
            <DollarSign size={11} strokeWidth={1.6} />
            <span className="truncate">{task.data.price}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 rounded-sm bg-bg-hover/70 px-1.5 py-1">
            <Users size={11} strokeWidth={1.6} />
            <span className="truncate">{peopleLabel}</span>
          </span>
        </div>

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-[1.2]">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-bg-hover px-2 py-0.5 font-medium text-text-tertiary"
            title={`${equipmentCount} equipment`}
          >
            <Wrench size={11} strokeWidth={1.6} />
            {equipmentCount}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-bg-hover px-2 py-0.5 font-medium text-text-tertiary"
            title={`${materialCount} materials`}
          >
            <Package size={11} strokeWidth={1.6} />
            {materialCount}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-bg-hover px-2 py-0.5 font-medium text-text-tertiary"
            title={`${validationCount} validation checks`}
          >
            <Check size={11} strokeWidth={1.8} />
            {validationCount}
          </span>
          {warning ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
              Resource check
            </span>
          ) : null}
          {risky ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-700">
              <ShieldAlert size={11} strokeWidth={1.6} />
              Risk
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
