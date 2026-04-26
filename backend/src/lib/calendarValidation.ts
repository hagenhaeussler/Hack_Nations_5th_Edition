import type { CalendarLayout, FinalExperimentPlan, FinalPlanNode } from "./projectTypes.js";

const VALID_STATUSES = new Set(["done", "active", "upcoming"]);

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : time;
}

function taskDurationHours(node: FinalPlanNode): number | null {
  const value = node.estimated_duration.value;
  if (value === null) return null;
  const unit = node.estimated_duration.unit.toLowerCase();
  if (unit.includes("hour")) return value;
  if (unit.includes("week")) return value * 7 * 24;
  if (unit.includes("month")) return value * 30 * 24;
  return value * 24;
}

function taskIdsInLayout(layout: CalendarLayout): string[] {
  return layout.day_groups.flatMap((day) => day.task_ids ?? day.node_ids);
}

export function validateScheduledTasks(tasks: FinalPlanNode[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const task of tasks) {
    if (!task.node_id.trim()) errors.push("Every task must have a task key.");
    if (!task.step_name.trim()) errors.push(`Task ${task.node_id || "(missing id)"} must have a title.`);
    if (keys.has(task.node_id)) errors.push(`Task key must be unique: ${task.node_id}.`);
    keys.add(task.node_id);

    if (task.start.relative_day < 0) errors.push(`Task ${task.node_id} has a negative day offset.`);
    if (task.calendar_position.week_index !== Math.floor(task.start.relative_day / 7)) {
      errors.push(`Task ${task.node_id} has an incoherent week index.`);
    }
    if (task.calendar_position.day_index !== task.start.relative_day % 7) {
      errors.push(`Task ${task.node_id} has an incoherent day index.`);
    }
    const duration = taskDurationHours(task);
    if (duration !== null && duration <= 0) errors.push(`Task ${task.node_id} must have a positive duration.`);
    if (task.estimated_price.value !== null && task.estimated_price.value < 0) {
      errors.push(`Task ${task.node_id} has a negative estimated cost.`);
    }
    if (!VALID_STATUSES.has(task.status)) errors.push(`Task ${task.node_id} has an invalid status.`);
    if (task.start.date && parseDate(task.start.date) === null) errors.push(`Task ${task.node_id} has an invalid scheduled date.`);
    if (task.end.date && parseDate(task.end.date) === null) errors.push(`Task ${task.node_id} has an invalid end date.`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateCalendarLayout(tasks: FinalPlanNode[], layout: CalendarLayout): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const planStart = layout.plan_start_date ?? layout.timeline_start_date;
  const planEnd = layout.plan_end_date ?? layout.timeline_end_date;
  const startTime = parseDate(planStart);
  const endTime = parseDate(planEnd);
  if (startTime === null) errors.push("Calendar layout must include a valid plan_start_date.");
  if (endTime === null) errors.push("Calendar layout must include a valid plan_end_date.");
  if (startTime !== null && endTime !== null && endTime < startTime) {
    errors.push("Calendar layout end date cannot be before start date.");
  }

  const taskIds = tasks.map((task) => task.node_id);
  const layoutIds = taskIdsInLayout(layout);
  for (const taskId of taskIds) {
    const count = layoutIds.filter((id) => id === taskId).length;
    if (count !== 1) errors.push(`Task ${taskId} must appear in exactly one day bucket.`);
  }
  for (const layoutId of layoutIds) {
    if (!taskIds.includes(layoutId)) errors.push(`Calendar layout references unknown task ${layoutId}.`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateCalendarPlan(plan: FinalExperimentPlan): { ok: boolean; errors: string[] } {
  const taskResult = validateScheduledTasks(plan.nodes);
  const layoutResult = validateCalendarLayout(plan.nodes, plan.calendar_layout);
  const errors = [...taskResult.errors, ...layoutResult.errors];
  return { ok: errors.length === 0, errors };
}
