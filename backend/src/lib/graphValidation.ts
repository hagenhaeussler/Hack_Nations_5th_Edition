import type { ExperimentPlan, PlanTask } from "../schemas/agentSchemas.js";
import type { FinalExperimentPlan } from "./projectTypes.js";
import { validateCalendarPlan } from "./calendarValidation.js";

export interface GraphValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function validateTaskSchedule(tasks: PlanTask[]): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const keys = tasks.map((task) => task.task_key);
  const keySet = new Set(keys);

  for (const task of tasks) {
    if (!task.task_key.trim()) errors.push("Every task must have task_key.");
    if (!task.title.trim()) errors.push(`Task "${task.task_key}" is missing title.`);
    if (keys.indexOf(task.task_key) !== keys.lastIndexOf(task.task_key)) {
      errors.push(`Duplicate task_key "${task.task_key}".`);
    }
    if (task.day_offset < 0) errors.push(`Task "${task.task_key}" has negative day_offset.`);
    if (!(task.duration_hours > 0)) {
      errors.push(`Task "${task.task_key}" must have positive duration_hours.`);
    }
    if (task.estimated_cost !== null && task.estimated_cost < 0) {
      errors.push(`Task "${task.task_key}" has negative estimated_cost.`);
    }
  }
  if (keys.length !== keySet.size) {
    warnings.push("Duplicate task keys will be rejected before saving.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateExperimentPlanGraph(plan: ExperimentPlan): GraphValidationResult {
  return validateTaskSchedule(plan.tasks);
}

export function validateFinalPlanGraph(plan: FinalExperimentPlan): GraphValidationResult {
  const result = validateCalendarPlan(plan);
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: [],
  };
}
