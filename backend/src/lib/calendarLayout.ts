import type {
  CalendarLayout,
  FinalPlanCalendarPosition,
  FinalPlanNode,
  ScheduledTask,
} from "./projectTypes.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 36;
const TRACK_HEIGHT = 160;
const MIN_TASK_WIDTH = 180;

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : new Date(time);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
}

function durationDays(node: FinalPlanNode): number {
  const value = node.estimated_duration.value;
  const unit = node.estimated_duration.unit.toLowerCase();
  if (value === null) return 1;
  if (unit.includes("hour")) return Math.max(1, Math.ceil(value / 24));
  if (unit.includes("week")) return Math.max(1, Math.ceil(value * 7));
  if (unit.includes("month")) return Math.max(1, Math.ceil(value * 30));
  return Math.max(1, Math.ceil(value));
}

function durationHours(node: FinalPlanNode): number | null {
  const value = node.estimated_duration.value;
  if (value === null) return null;
  const unit = node.estimated_duration.unit.toLowerCase();
  if (unit.includes("hour")) return value;
  if (unit.includes("week")) return value * 7 * 24;
  if (unit.includes("month")) return value * 30 * 24;
  return value * 24;
}

function firstTaskDate(nodes: FinalPlanNode[]): string | null {
  return nodes
    .map((node) => node.start.date)
    .filter((date): date is string => Boolean(parseIsoDate(date)))
    .sort()[0] ?? null;
}

export function planStartDateForTasks(nodes: FinalPlanNode[], fallback = new Date()): string {
  const fromTask = firstTaskDate(nodes);
  if (fromTask) return fromTask;
  return formatIsoDate(
    new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate())),
  );
}

export function recalculatePlanDates(nodes: FinalPlanNode[]): { startDate: string | null; endDate: string | null; totalDays: number } {
  if (nodes.length === 0) return { startDate: null, endDate: null, totalDays: 0 };
  const start = nodes.reduce(
    (min, node) => Math.min(min, node.start.relative_day),
    Number.POSITIVE_INFINITY,
  );
  const end = nodes.reduce(
    (max, node) => Math.max(max, node.end.relative_day),
    0,
  );
  const base = parseIsoDate(firstTaskDate(nodes)) ?? new Date();
  return {
    startDate: formatIsoDate(addDays(base, Number.isFinite(start) ? start : 0)),
    endDate: formatIsoDate(addDays(base, end)),
    totalDays: Math.max(1, end - (Number.isFinite(start) ? start : 0)),
  };
}

export function buildCalendarLayout(
  nodes: FinalPlanNode[],
  planStartDate = planStartDateForTasks(nodes),
): CalendarLayout {
  const base = parseIsoDate(planStartDate) ?? new Date();
  const maxEnd = Math.max(1, ...nodes.map((node) => node.end.relative_day));
  const totalWeeks = Math.max(1, Math.ceil(maxEnd / 7));
  const positions: Record<string, FinalPlanCalendarPosition> = Object.fromEntries(
    nodes.map((node) => {
      const startDay = Math.max(0, node.start.relative_day);
      const duration = Math.max(1, node.end.relative_day - node.start.relative_day);
      return [
        node.node_id,
        {
          week_index: Math.floor(startDay / 7),
          day_index: startDay % 7,
          x: startDay * DAY_WIDTH,
          y: (node.calendar_position?.lane ?? 0) * TRACK_HEIGHT,
          width: Math.max(MIN_TASK_WIDTH, duration * DAY_WIDTH),
          lane: node.calendar_position?.lane ?? 0,
        },
      ];
    }),
  );

  const dayGroups = Array.from({ length: Math.max(7, totalWeeks * 7) }, (_, dayIndex) => {
    const date = addDays(base, dayIndex);
    const taskIds = nodes
      .filter((node) => node.start.relative_day === dayIndex)
      .map((node) => node.node_id);
    return {
      date: formatIsoDate(date),
      day_index: dayIndex,
      label: `Day ${dayIndex + 1}`,
      weekday: weekday(date),
      task_ids: taskIds,
      node_ids: taskIds,
    };
  });

  const weekGroups = Array.from({ length: totalWeeks }, (_, weekIndex) => {
    const startDay = weekIndex * 7;
    const endDay = startDay + 6;
    return {
      week_index: weekIndex,
      start_date: formatIsoDate(addDays(base, startDay)),
      end_date: formatIsoDate(addDays(base, endDay)),
      days: dayGroups.slice(startDay, startDay + 7),
    };
  });

  const planEndDate = formatIsoDate(addDays(base, maxEnd));
  return {
    plan_start_date: formatIsoDate(base),
    plan_end_date: planEndDate,
    timeline_start_date: formatIsoDate(base),
    timeline_end_date: planEndDate,
    total_days: maxEnd,
    total_weeks: totalWeeks,
    weeks: weekGroups,
    week_groups: weekGroups,
    day_groups: dayGroups,
    task_positions: positions,
    node_positions: positions,
    critical_path_node_ids: [],
  };
}

export function groupTasksByDate(tasks: ScheduledTask[]): Map<string, ScheduledTask[]> {
  const groups = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    const key = task.scheduled_date ?? `day_${task.day_offset}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return groups;
}

export function getWeekRange(planStartDate: string, weekIndex: number): { start_date: string; end_date: string } {
  const base = parseIsoDate(planStartDate) ?? new Date();
  const start = addDays(base, weekIndex * 7);
  return { start_date: formatIsoDate(start), end_date: formatIsoDate(addDays(start, 6)) };
}

export function scheduledTaskFromFinalNode(node: FinalPlanNode, now = new Date().toISOString()): ScheduledTask {
  return {
    task_id: node.node_id,
    task_key: node.node_id,
    title: node.step_name,
    description: node.step_purpose,
    step_type: "experiment_task",
    procedure: node.detailed_procedure,
    scheduled_date: node.start.date,
    day_offset: node.start.relative_day,
    week_index: Math.floor(node.start.relative_day / 7),
    day_index: node.start.relative_day % 7,
    duration_hours: durationHours(node),
    duration_days: durationDays(node),
    estimated_cost: node.estimated_price.value,
    people_required: node.people_required.roles,
    equipment_required: node.equipment_required,
    materials_required: node.materials_required,
    missing_resources: [...node.equipment_missing, ...node.materials_to_buy.map((item) => item.name)],
    items_to_buy: node.materials_to_buy,
    validation_criteria: node.validation_criteria,
    milestone: node.milestone,
    risks: node.risks,
    status: node.status,
    citations: node.source_citations,
    domain_experts: node.domain_experts,
    source_references: node.source_preplan_node_ids,
    related_lesson_ids: node.related_lesson_ids,
    uncertainty_notes: node.uncertainty_notes,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

export function tasksFromPlanNodes(nodes: FinalPlanNode[], now?: string): ScheduledTask[] {
  return nodes.map((node) => scheduledTaskFromFinalNode(node, now));
}

export function moveTaskToDate(nodes: FinalPlanNode[], taskId: string, newDate: string): FinalPlanNode[] {
  const baseDate = parseIsoDate(planStartDateForTasks(nodes)) ?? new Date();
  const targetDate = parseIsoDate(newDate);
  if (!targetDate) return nodes;
  const dayOffset = Math.max(0, Math.round((targetDate.getTime() - baseDate.getTime()) / MS_PER_DAY));
  return nodes.map((node) => {
    if (node.node_id !== taskId) return node;
    const days = durationDays(node);
    return {
      ...node,
      start: { type: "absolute", relative_day: dayOffset, date: newDate },
      end: { type: "absolute", relative_day: dayOffset + days, date: formatIsoDate(addDays(targetDate, days)) },
      calendar_position: {
        ...node.calendar_position,
        week_index: Math.floor(dayOffset / 7),
        day_index: dayOffset % 7,
        x: dayOffset * DAY_WIDTH,
      },
    };
  });
}
