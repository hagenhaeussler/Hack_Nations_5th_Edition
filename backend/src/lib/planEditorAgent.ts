import { randomUUID } from "node:crypto";

import {
  FeedbackLearningError,
  FeedbackLearningService,
  validateWorkflowDAG,
} from "./feedbackLearningService.js";
import type {
  LessonCard,
  PlanChangeEvent,
  PlanEditRequest,
  Project,
  ProjectStatsReport,
  Workflow,
  WorkflowNode,
} from "./projectTypes.js";
import type { QAChatMessage, QAResponse } from "./qaAgent.js";

export type EditorMode = "auto" | "question_only" | "edit_only";
export type EditorIntentType = "question" | "edit" | "mixed" | "ambiguous";
export type PatchOperationType =
  | "update_task_field"
  | "move_task_to_date"
  | "move_task_to_week"
  | "update_task_duration"
  | "update_task_cost"
  | "add_task"
  | "remove_task"
  | "rename_task"
  | "split_task"
  | "merge_tasks"
  | "add_task_note"
  | "update_node_field"
  | "update_edge_field"
  | "add_node"
  | "remove_node"
  | "rename_node"
  | "split_node"
  | "merge_nodes"
  | "add_edge"
  | "remove_edge"
  | "reorder_dependency"
  | "update_duration"
  | "update_budget"
  | "update_start_date"
  | "update_end_date"
  | "move_node_schedule"
  | "add_equipment"
  | "remove_equipment"
  | "add_material"
  | "remove_material"
  | "update_people_required"
  | "add_role"
  | "remove_role"
  | "update_procedure"
  | "add_validation_criteria"
  | "remove_validation_criteria"
  | "update_validation_criteria"
  | "add_risk"
  | "remove_risk"
  | "update_milestone"
  | "add_note"
  | "update_status";
export type PatchTargetType = "task" | "node" | "edge" | "plan" | "schedule" | "report_section";
export type PatchRiskLevel = "low" | "medium" | "high" | "blocked";
export type PatchSafetyStatus =
  | "pending_validation"
  | "valid"
  | "invalid"
  | "blocked";
export type PatchBlastRadius = "tiny" | "small" | "medium" | "large" | "blocked";
export type EditorResponseType =
  | "answer"
  | "proposed_patch"
  | "applied_patch"
  | "clarification_needed"
  | "error";

export interface EditorRequest {
  plan_id: string;
  user_message: string;
  selected_node_id?: string | null;
  selected_edge_id?: string | null;
  chat_history?: QAChatMessage[];
  mode?: EditorMode;
  user_id?: string;
}

export interface EditorIntent {
  intent_id: string;
  intent_type: EditorIntentType;
  confidence: "high" | "medium" | "low";
  summary: string;
  requires_confirmation: boolean;
  edit_operations: PlanPatchOperation[];
  clarifying_question: string | null;
}

export interface PlanPatchOperation {
  operation_id: string;
  operation_type: PatchOperationType;
  target_type: PatchTargetType;
  target_id: string;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  requires_recalculation: Array<"schedule" | "stats_report">;
  risk_level: PatchRiskLevel;
  validation_status: "pending" | "valid" | "invalid" | "blocked";
}

export interface PlanPatch {
  patch_id: string;
  plan_id: string;
  created_at: string;
  created_by: "editor_agent";
  user_message: string;
  summary: string;
  operations: PlanPatchOperation[];
  expected_effects: string[];
  requires_confirmation: boolean;
  safety_status: PatchSafetyStatus;
}

export interface PatchValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  requires_confirmation: boolean;
  estimated_blast_radius: PatchBlastRadius;
  affected_nodes: string[];
  affected_edges: string[];
  affected_report_sections: string[];
  will_recalculate_schedule: boolean;
  will_recalculate_stats: boolean;
}

export interface EditorAgentResponse {
  response_type: EditorResponseType;
  natural_language_response: string;
  intent: EditorIntent;
  proposed_patch: PlanPatch | null;
  validation_result: PatchValidationResult | null;
  updated_plan: Workflow | null;
  updated_stats_report: ProjectStatsReport | null;
  generated_change_events: PlanChangeEvent[];
  generated_lesson_cards: LessonCard[];
  suggested_actions: Array<{ type: string; target_id?: string; label: string }>;
  project?: Project;
  answer?: QAResponse;
}

interface PatchBuildResult {
  intent: EditorIntent;
  patch: PlanPatch | null;
  validation: PatchValidationResult | null;
}

const QUESTION_TERMS = /\b(why|what|which|how|when|where|explain|show|list|summarize|tell me)\b/i;
const EDIT_TERMS =
  /\b(make|change|update|set|add|remove|delete|move|push|increase|decrease|split|merge|rename|require|needs?|should|happen before|before|after|take|takes)\b/i;
const PROTECTED_TERMS =
  /\b(source paper|paper database|pre-?plan|lesson card database|global inventory|lab inventory database|previous experiment|other project|user account|permission)\b/i;

export function classifyEditorIntent(
  message: string,
  mode: EditorMode = "auto",
): Pick<EditorIntent, "intent_type" | "confidence" | "summary" | "clarifying_question"> {
  const trimmed = message.trim();
  if (mode === "question_only") {
    return {
      intent_type: "question",
      confidence: "high",
      summary: trimmed,
      clarifying_question: null,
    };
  }
  if (mode === "edit_only") {
    return {
      intent_type: EDIT_TERMS.test(trimmed) ? "edit" : "ambiguous",
      confidence: EDIT_TERMS.test(trimmed) ? "high" : "low",
      summary: trimmed,
      clarifying_question: EDIT_TERMS.test(trimmed)
        ? null
        : "What exact change should I make to the current plan?",
    };
  }

  const asksQuestion = QUESTION_TERMS.test(trimmed) || trimmed.endsWith("?");
  const asksEdit = EDIT_TERMS.test(trimmed);
  if (asksQuestion && asksEdit) {
    if (!/\b(i think|should|instead|make|change|update|set|add|remove|move|push|increase|decrease)\b/i.test(trimmed)) {
      return {
        intent_type: "question",
        confidence: "high",
        summary: trimmed,
        clarifying_question: null,
      };
    }
    return {
      intent_type: "mixed",
      confidence: "medium",
      summary: trimmed,
      clarifying_question: null,
    };
  }
  if (asksEdit) {
    return {
      intent_type: "edit",
      confidence: "high",
      summary: trimmed,
      clarifying_question: null,
    };
  }
  if (asksQuestion) {
    return {
      intent_type: "question",
      confidence: "high",
      summary: trimmed,
      clarifying_question: null,
    };
  }
  return {
    intent_type: "ambiguous",
    confidence: "low",
    summary: trimmed,
    clarifying_question: "Do you want me to answer a question or change the current plan?",
  };
}

export function buildEditorPatch(
  project: Project,
  request: EditorRequest,
): PatchBuildResult {
  const classified = classifyEditorIntent(request.user_message, request.mode ?? "auto");
  const emptyIntent = makeIntent(classified, [], classified.clarifying_question);
  if (classified.intent_type === "question" || classified.intent_type === "ambiguous") {
    return { intent: emptyIntent, patch: null, validation: null };
  }
  if (PROTECTED_TERMS.test(request.user_message)) {
    const intent = makeIntent(
      { ...classified, intent_type: "ambiguous", confidence: "low" },
      [],
      "That sounds like it may affect protected data outside the current plan. What current-plan field should I change instead?",
    );
    return { intent, patch: null, validation: null };
  }
  if (!project.workflow) {
    const intent = makeIntent(
      { ...classified, intent_type: "ambiguous", confidence: "low" },
      [],
      "This project does not have an editable plan graph yet.",
    );
    return { intent, patch: null, validation: null };
  }

  const operations = parsePatchOperations(project.workflow, request);
  const clarifyingQuestion =
    operations.length === 0
      ? "I could not identify a safe, specific edit. Which task and field should I change?"
      : null;
  const intent = makeIntent(classified, operations, clarifyingQuestion);
  if (operations.length === 0) return { intent, patch: null, validation: null };

  const patch: PlanPatch = {
    patch_id: `patch_${randomUUID()}`,
    plan_id: request.plan_id,
    created_at: new Date().toISOString(),
    created_by: "editor_agent",
    user_message: request.user_message,
    summary: summarizeOperations(project.workflow, operations),
    operations,
    expected_effects: expectedEffects(operations),
    requires_confirmation: true,
    safety_status: "pending_validation",
  };
  const validation = validatePlanPatch(project.workflow, patch);
  return {
    intent: {
      ...intent,
      requires_confirmation: validation.requires_confirmation,
      edit_operations: operations,
    },
    patch: { ...patch, safety_status: validation.is_valid ? "valid" : "invalid" },
    validation,
  };
}

export function validatePlanPatch(
  workflow: Workflow,
  patch: PlanPatch,
): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const affectedNodes = new Set<string>();
  const affectedEdges = new Set<string>();
  const affectedReportSections = new Set<string>();
  let willRecalculateSchedule = false;
  let willRecalculateStats = false;
  let maxRisk: PatchRiskLevel = "low";
  let nextWorkflow = workflow;

  for (const operation of patch.operations) {
    if (operation.risk_level === "blocked") maxRisk = "blocked";
    else if (operation.risk_level === "high" && maxRisk !== "blocked") maxRisk = "high";
    else if (operation.risk_level === "medium" && maxRisk === "low") maxRisk = "medium";

    if (operation.target_type === "node" || operation.target_type === "task") {
      affectedNodes.add(operation.target_id);
      if (!workflow.nodes.some((node) => node.id === operation.target_id)) {
        errors.push(`Target task does not exist: ${operation.target_id}.`);
      }
    }
    if (operation.target_type === "edge") {
      affectedEdges.add(operation.target_id);
    }
    if (operation.requires_recalculation.includes("schedule")) {
      willRecalculateSchedule = true;
    }
    if (operation.requires_recalculation.includes("stats_report")) {
      willRecalculateStats = true;
    }
    for (const section of reportSectionsFor(operation)) affectedReportSections.add(section);

    try {
      nextWorkflow = previewWorkflowOperation(nextWorkflow, operation);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Patch operation failed.");
    }
  }

  const dagValidation = validateWorkflowDAG(nextWorkflow);
  if (dagValidation.valid === false) errors.push(...dagValidation.errors);

  const blastRadius = estimateBlastRadius(
    maxRisk,
    affectedNodes.size,
    affectedEdges.size,
    willRecalculateSchedule,
  );
  if (blastRadius === "large") {
    warnings.push("This patch affects a broad part of the schedule and should be reviewed carefully.");
  }

  return {
    is_valid: errors.length === 0 && blastRadius !== "blocked",
    errors,
    warnings,
    requires_confirmation:
      patch.requires_confirmation ||
      willRecalculateSchedule ||
      affectedEdges.size > 0 ||
      blastRadius !== "tiny",
    estimated_blast_radius: errors.length > 0 && maxRisk === "blocked" ? "blocked" : blastRadius,
    affected_nodes: [...affectedNodes],
    affected_edges: [...affectedEdges],
    affected_report_sections: [...affectedReportSections],
    will_recalculate_schedule: willRecalculateSchedule,
    will_recalculate_stats: willRecalculateStats,
  };
}

export async function applyEditorPatch(
  project: Project,
  patch: PlanPatch,
  feedbackLearning: FeedbackLearningService,
  userId?: string,
): Promise<EditorAgentResponse> {
  if (!project.workflow) throw new FeedbackLearningError("Project has no editable workflow.");
  const validation = validatePlanPatch(project.workflow, patch);
  if (!validation.is_valid) {
    return responseFromPatch(
      "error",
      "I could not apply that patch because it failed validation.",
      makeIntent(
        {
          intent_type: "edit",
          confidence: "medium",
          summary: patch.summary,
          clarifying_question: null,
        },
        patch.operations,
        null,
      ),
      patch,
      validation,
    );
  }

  const edits = patch.operations.map((operation) =>
    operationToPlanEdit(operation, patch.user_message, userId),
  );
  const result = await feedbackLearning.applyPlanEdits(project.id, edits);
  return {
    response_type: "applied_patch",
    natural_language_response: result.generated_lesson_cards.length > 0
      ? "Done. I updated the plan and saved this correction as a learning signal for future similar experiments."
      : "Done. I updated the current plan.",
    intent: makeIntent(
      {
        intent_type: "edit",
        confidence: "high",
        summary: patch.summary,
        clarifying_question: null,
      },
      patch.operations,
      null,
    ),
    proposed_patch: { ...patch, safety_status: "valid" },
    validation_result: validation,
    updated_plan: result.updated_plan,
    updated_stats_report: result.updated_stats_report,
    generated_change_events: result.change_events,
    generated_lesson_cards: result.generated_lesson_cards,
    suggested_actions: [],
    project: result.project,
  };
}

export function responseFromPatch(
  responseType: EditorResponseType,
  text: string,
  intent: EditorIntent,
  patch: PlanPatch | null,
  validation: PatchValidationResult | null,
): EditorAgentResponse {
  return {
    response_type: responseType,
    natural_language_response: text,
    intent,
    proposed_patch: patch,
    validation_result: validation,
    updated_plan: null,
    updated_stats_report: null,
    generated_change_events: [],
    generated_lesson_cards: [],
    suggested_actions: [],
  };
}

function makeIntent(
  classified: Pick<
    EditorIntent,
    "intent_type" | "confidence" | "summary" | "clarifying_question"
  >,
  operations: PlanPatchOperation[],
  clarifyingQuestion: string | null,
): EditorIntent {
  return {
    intent_id: `intent_${randomUUID()}`,
    intent_type: classified.intent_type,
    confidence: classified.confidence,
    summary: classified.summary,
    requires_confirmation: operations.length > 0,
    edit_operations: operations,
    clarifying_question: clarifyingQuestion,
  };
}

function parsePatchOperations(
  workflow: Workflow,
  request: EditorRequest,
): PlanPatchOperation[] {
  const message = request.user_message;
  const lower = message.toLowerCase();
  const operations: PlanPatchOperation[] = [];

  if (/delete everything|remove everything|fix everything|replan|rewrite entire/i.test(message)) {
    return [
      operation({
        operation_type: "add_note",
        target_type: "plan",
        target_id: request.plan_id,
        field_path: "blocked_request",
        old_value: null,
        new_value: message,
        reason: "Request is too broad or destructive for targeted editing.",
        requires_recalculation: [],
        risk_level: "blocked",
      }),
    ];
  }

  const pushMatch = lower.match(/push everything after (.+?) back by (\d+)\s*days?/);
  if (pushMatch?.[1] && pushMatch[2]) {
    const anchor = resolveNode(workflow, pushMatch[1], request.selected_node_id ?? null);
    if (!anchor.node || anchor.ambiguous) return [];
    const downstream = downstreamNodes(workflow, anchor.node.id);
    const days = Number(pushMatch[2]);
    for (const node of downstream) {
      operations.push(moveNodeOperation(node, addDaysLabel(node.data.startDate, days), message, "medium"));
    }
    return operations;
  }

  const dependencyOps = parseDependencyOperations(workflow, request);
  if (dependencyOps.length > 0) return dependencyOps;

  const target = resolveTargetNode(workflow, request);
  if (!target) return [];

  const duration = extractDuration(message);
  if (duration) {
    operations.push(
      operation({
        operation_type: "update_task_duration",
        target_type: "task",
        target_id: target.id,
        field_path: "estimated_duration",
        old_value: durationValue(target.data.timeEstimate),
        new_value: duration,
        reason: `User requested changing duration for ${target.data.stepName}.`,
        requires_recalculation: ["schedule", "stats_report"],
        risk_level: "low",
      }),
    );
  }

  const budget = extractBudget(message);
  if (budget !== null) {
    operations.push(
      operation({
        operation_type: "update_task_cost",
        target_type: "task",
        target_id: target.id,
        field_path: "estimated_price",
        old_value: { value: parseMoney(target.data.price), currency: "USD" },
        new_value: { value: budget, currency: "USD" },
        reason: `User requested changing budget for ${target.data.stepName}.`,
        requires_recalculation: ["stats_report"],
        risk_level: budget >= 10_000 ? "medium" : "low",
      }),
    );
  }

  const equipment = extractAddedItem(message, "equipment");
  if (equipment) {
    operations.push(listAddOperation(target, "add_equipment", "equipment_required", equipment, message));
  }

  const material = extractAddedItem(message, "material");
  if (material) {
    operations.push(listAddOperation(target, "add_material", "materials_required", material, message));
  }

  if (/lab assistant|assistant|technician|person|people|staff/i.test(message)) {
    const role = /lab assistant/i.test(message) ? "Lab assistant" : "Additional staff";
    operations.push(listAddOperation(target, "update_people_required", "people_required", role, message));
  }

  const validation = extractValidation(message);
  if (validation) {
    operations.push(listAddOperation(target, "add_validation_criteria", "validation_criteria", validation, message));
  }

  const risk = extractRisk(message);
  if (risk) {
    operations.push(
      operation({
        operation_type: "add_risk",
        target_type: "task",
        target_id: target.id,
        field_path: "risks",
        old_value: target.data.procedure,
        new_value: `${target.data.procedure}\n\nRisk: ${risk}`,
        reason: `User requested adding a risk to ${target.data.stepName}.`,
        requires_recalculation: ["stats_report"],
        risk_level: "low",
      }),
    );
  }

  const date = extractDate(message, target.data.startDate);
  if (date) operations.push(moveNodeOperation(target, date, message, "medium"));

  return dedupeOperations(operations);
}

function parseDependencyOperations(
  workflow: Workflow,
  request: EditorRequest,
): PlanPatchOperation[] {
  const message = request.user_message;
  if (/remove .*depend|remove .*edge|delete .*depend/i.test(message)) {
    const edge = request.selected_edge_id
      ? workflow.edges.find((item) => item.id === request.selected_edge_id)
      : null;
    if (!edge) return [];
    return [
      operation({
        operation_type: "remove_edge",
        target_type: "edge",
        target_id: edge.id,
        field_path: "dependency",
        old_value: { source: edge.source, target: edge.target },
        new_value: null,
        reason: "User requested removing the selected dependency.",
        requires_recalculation: ["schedule"],
        risk_level: "medium",
      }),
    ];
  }

  const beforeMatch = message.match(/(.+?)\s+(?:must\s+)?(?:happen\s+)?before\s+(.+)/i);
  if (beforeMatch?.[1] && beforeMatch[2]) {
    const source = resolveNode(workflow, beforeMatch[1], null);
    const target = resolveNode(workflow, beforeMatch[2], request.selected_node_id ?? null);
    if (!source.node || !target.node || source.ambiguous || target.ambiguous) return [];
    return [addEdgeOperation(source.node.id, target.node.id, message)];
  }

  const afterMatch = message.match(/(?:move\s+)?(.+?)\s+after\s+(.+)/i);
  if (afterMatch?.[1] && afterMatch[2]) {
    const target = resolveNode(workflow, afterMatch[1], request.selected_node_id ?? null);
    const source = resolveNode(workflow, afterMatch[2], null);
    if (!source.node || !target.node || source.ambiguous || target.ambiguous) return [];
    return [addEdgeOperation(source.node.id, target.node.id, message)];
  }

  return [];
}

function operation(input: Omit<PlanPatchOperation, "operation_id" | "validation_status">): PlanPatchOperation {
  return {
    operation_id: `op_${randomUUID()}`,
    validation_status: "pending",
    ...input,
  };
}

function addEdgeOperation(source: string, target: string, _message: string): PlanPatchOperation {
  return operation({
    operation_type: "add_edge",
    target_type: "edge",
    target_id: `e:${source}-${target}`,
    field_path: "dependency",
    old_value: null,
    new_value: { source, target },
    reason: `User requested dependency ${source} -> ${target}.`,
    requires_recalculation: ["schedule"],
    risk_level: "medium",
  });
}

function moveNodeOperation(
  node: WorkflowNode,
  startDate: string,
  message: string,
  riskLevel: PatchRiskLevel,
): PlanPatchOperation {
  return operation({
    operation_type: "move_task_to_date",
    target_type: "task",
    target_id: node.id,
    field_path: "startDate",
    old_value: node.data.startDate,
    new_value: startDate,
    reason: `User requested schedule change: ${message}`,
    requires_recalculation: ["schedule", "stats_report"],
    risk_level: riskLevel,
  });
}

function listAddOperation(
  node: WorkflowNode,
  type: "add_equipment" | "add_material" | "update_people_required" | "add_validation_criteria",
  fieldPath: "equipment_required" | "materials_required" | "people_required" | "validation_criteria",
  item: string,
  message: string,
): PlanPatchOperation {
  const current = listForField(node, fieldPath);
  const next = current.some((value) => normalize(value) === normalize(item))
    ? current
    : [...current, item];
  return operation({
    operation_type: type,
    target_type: "task",
    target_id: node.id,
    field_path: fieldPath,
    old_value: current,
    new_value: next,
    reason: `User requested "${item}" for ${node.data.stepName}: ${message}`,
    requires_recalculation: ["stats_report"],
    risk_level: "low",
  });
}

function previewWorkflowOperation(workflow: Workflow, operation: PlanPatchOperation): Workflow {
  if (operation.risk_level === "blocked") {
    throw new Error("This request is blocked because it is too broad or outside the current plan.");
  }
  if (operation.operation_type === "add_edge" || operation.operation_type === "remove_edge") return workflow;
  if (operation.target_type !== "node" && operation.target_type !== "task") return workflow;
  const field = workflowFieldForPatch(operation);
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.id === operation.target_id
        ? { ...node, data: { ...node.data, [field]: workflowValueForPatch(operation) } }
        : node,
    ),
  };
}

function operationToPlanEdit(
  operation: PlanPatchOperation,
  userMessage: string,
  userId: string | undefined,
): PlanEditRequest {
  const edge = operation.target_type === "edge"
    ? edgeValue(operation.new_value) ?? edgeValue(operation.old_value)
    : null;
  return {
    change_source: "chat_feedback",
    target_type: operation.target_type === "edge" ? "edge" : "task",
    target_id: operation.target_id,
    field_changed: fieldChangedForPatch(operation),
    old_value: operation.old_value,
    new_value: operation.target_type === "edge" ? edge : operation.new_value,
    change_type: changeTypeForPatch(operation),
    raw_user_comment: userMessage,
    structured_reason: operation.reason,
    user_id: userId,
    metadata: {
      editor_agent_operation_id: operation.operation_id,
      editor_agent_operation_type: operation.operation_type,
      risk_level: operation.risk_level,
    },
  };
}

function fieldChangedForPatch(operation: PlanPatchOperation): string {
  if (operation.operation_type === "update_duration" || operation.operation_type === "update_task_duration") return "estimated_duration";
  if (operation.operation_type === "update_budget" || operation.operation_type === "update_task_cost") return "estimated_price";
  if (operation.operation_type === "add_equipment") return "equipment_required";
  if (operation.operation_type === "add_material") return "materials_required";
  if (operation.operation_type === "update_people_required") return "people_required";
  if (operation.operation_type === "add_validation_criteria") return "validation_criteria";
  if (operation.operation_type === "add_risk") return "procedure";
  if (operation.operation_type === "move_node_schedule" || operation.operation_type === "move_task_to_date") return "startDate";
  return operation.field_path;
}

function changeTypeForPatch(operation: PlanPatchOperation): PlanEditRequest["change_type"] {
  switch (operation.operation_type) {
    case "update_duration":
    case "update_task_duration":
      return "duration_changed";
    case "update_budget":
    case "update_task_cost":
      return "budget_changed";
    case "add_equipment":
      return "equipment_added";
    case "add_material":
      return "material_added";
    case "update_people_required":
      return "people_required_changed";
    case "add_edge":
      return "dependency_added";
    case "remove_edge":
      return "dependency_removed";
    case "add_validation_criteria":
      return "validation_criteria_changed";
    case "add_risk":
      return "risk_added";
    case "move_node_schedule":
    case "move_task_to_date":
      return "task_moved";
    default:
      return "general_comment_added";
  }
}

function workflowFieldForPatch(operation: PlanPatchOperation): keyof WorkflowNode["data"] {
  switch (operation.operation_type) {
    case "update_duration":
    case "update_task_duration":
      return "timeEstimate";
    case "update_budget":
    case "update_task_cost":
      return "price";
    case "add_equipment":
      return "equipment";
    case "add_material":
      return "materials";
    case "update_people_required":
      return "people";
    case "add_validation_criteria":
      return "validationCriteria";
    case "add_risk":
      return "procedure";
    case "move_node_schedule":
    case "move_task_to_date":
      return "startDate";
    default:
      return "procedure";
  }
}

function workflowValueForPatch(operation: PlanPatchOperation): unknown {
  if (operation.operation_type === "update_duration" || operation.operation_type === "update_task_duration") return durationLabel(operation.new_value);
  if (operation.operation_type === "update_budget" || operation.operation_type === "update_task_cost") return moneyLabel(operation.new_value);
  return operation.new_value;
}

function resolveTargetNode(workflow: Workflow, request: EditorRequest): WorkflowNode | null {
  const selected = request.selected_node_id
    ? workflow.nodes.find((node) => node.id === request.selected_node_id)
    : null;
  if (selected && /\b(this|selected|step|task|node)\b/i.test(request.user_message)) {
    return selected;
  }
  const resolved = resolveNode(workflow, request.user_message, request.selected_node_id ?? null);
  return resolved.ambiguous ? null : resolved.node;
}

function resolveNode(
  workflow: Workflow,
  text: string,
  fallbackId: string | null,
): { node: WorkflowNode | null; ambiguous: boolean } {
  const normalizedText = normalize(text);
  const scored = workflow.nodes
    .map((node) => {
      const name = normalize(node.data.stepName);
      const id = normalize(node.id);
      const tokens = name.split(" ").filter((token) => token.length > 2);
      const score =
        (normalizedText.includes(name) ? 10 : 0) +
        (normalizedText.includes(id) ? 8 : 0) +
        tokens.filter((token) => normalizedText.includes(token)).length;
      return { node, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 && fallbackId) {
    return {
      node: workflow.nodes.find((node) => node.id === fallbackId) ?? null,
      ambiguous: false,
    };
  }
  if (scored.length === 0) return { node: null, ambiguous: false };
  if (scored.length > 1 && scored[0]?.score === scored[1]?.score) {
    return { node: null, ambiguous: true };
  }
  return { node: scored[0]?.node ?? null, ambiguous: false };
}

function extractDuration(message: string): { value: number; unit: string } | null {
  const match = message.match(/(?:take|takes|duration|for|to)\s+(\d+(?:\.\d+)?)\s*(day|days|week|weeks|hour|hours)/i);
  if (!match?.[1] || !match[2]) return null;
  return { value: Number(match[1]), unit: match[2].toLowerCase() };
}

function extractBudget(message: string): number | null {
  if (!/\b(budget|cost|price|\$)\b/i.test(message)) return null;
  const match = message.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)(k)?/i);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return match[2] ? value * 1000 : value;
}

function extractAddedItem(message: string, kind: "equipment" | "material"): string | null {
  const patterns =
    kind === "equipment"
      ? [
          /add\s+(.+?)\s+as\s+required\s+equipment/i,
          /add\s+(.+?)\s+to\s+.+equipment/i,
          /(?:need|needs|require|requires)\s+(.+?)(?:\s+as\s+equipment|$)/i,
        ]
      : [
          /add\s+(.+?)\s+as\s+required\s+material/i,
          /add\s+(.+?)\s+to\s+.+materials?/i,
          /(?:need|needs|require|requires)\s+(.+?)(?:\s+as\s+material|$)/i,
        ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const item = cleanupItem(match?.[1] ?? "");
    if (item && (kind === "equipment" ? /equipment|microscope|reader|incubator|machine|instrument/i.test(message) : /material|reagent|media|stain|buffer|antibody/i.test(message))) {
      return item;
    }
  }
  return null;
}

function extractValidation(message: string): string | null {
  const match = message.match(/add\s+(?:a\s+)?validation(?: checkpoint| criteria)?\s*(?:after [^.]+)?(?:\:|that)?\s*(.*)/i);
  if (!match) return null;
  const text = cleanupItem(match[1] || "Validation checkpoint required");
  return text || "Validation checkpoint required";
}

function extractRisk(message: string): string | null {
  const match = message.match(/add\s+(?:a\s+)?risk\s+(?:that\s+)?(.+)/i);
  return cleanupItem(match?.[1] ?? "") || null;
}

function extractDate(message: string, currentStart: string): string | null {
  if (/next week/i.test(message)) return addDaysLabel(currentStart, 7);
  const match = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match?.[1] ?? null;
}

function summarizeOperations(workflow: Workflow, operations: PlanPatchOperation[]): string {
  return operations
    .map((operation) => {
      const nodeName =
        workflow.nodes.find((node) => node.id === operation.target_id)?.data.stepName ??
        operation.target_id;
      return `${operation.operation_type.replace(/_/g, " ")} on ${nodeName}`;
    })
    .join("; ");
}

function expectedEffects(operations: PlanPatchOperation[]): string[] {
  const effects = operations.map((operation) => {
    if (operation.requires_recalculation.includes("schedule")) {
      return "The schedule and downstream graph layout may update.";
    }
    if (operation.requires_recalculation.includes("stats_report")) {
      return "The project stats report will be recalculated.";
    }
    return "The current plan graph will be updated.";
  });
  return Array.from(new Set(effects));
}

function reportSectionsFor(operation: PlanPatchOperation): string[] {
  switch (operation.operation_type) {
    case "add_equipment":
      return ["equipment_summary"];
    case "add_material":
      return ["materials_summary", "purchase_list"];
    case "update_people_required":
      return ["people_summary"];
    case "update_budget":
      return ["total_estimated_budget"];
    case "update_duration":
    case "move_node_schedule":
    case "add_edge":
    case "remove_edge":
      return ["total_estimated_duration", "task_summary"];
    case "add_validation_criteria":
      return ["validation_criteria_summary"];
    case "add_risk":
      return ["risk_summary"];
    default:
      return [];
  }
}

function estimateBlastRadius(
  risk: PatchRiskLevel,
  nodeCount: number,
  edgeCount: number,
  schedule: boolean,
): PatchBlastRadius {
  if (risk === "blocked") return "blocked";
  if (risk === "high" || nodeCount > 8) return "large";
  if (risk === "medium" || schedule || edgeCount > 0 || nodeCount > 2) return "medium";
  if (nodeCount === 1) return "small";
  return "tiny";
}

function addPreviewEdge(workflow: Workflow, source: string, target: string): Workflow {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    throw new Error("Dependency references a missing node.");
  }
  const edge = { id: `e:${source}-${target}`, source, target };
  return normalizeWorkflow({
    nodes: workflow.nodes,
    edges: workflow.edges.some((item) => item.source === source && item.target === target)
      ? workflow.edges
      : [...workflow.edges, edge],
  });
}

function removePreviewEdge(workflow: Workflow, source: string, target: string): Workflow {
  return normalizeWorkflow({
    nodes: workflow.nodes,
    edges: workflow.edges.filter(
      (edge) => !(edge.source === source && edge.target === target),
    ),
  });
}

void addPreviewEdge;
void removePreviewEdge;

function normalizeWorkflow(workflow: Workflow): Workflow {
  const parents = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]));
  const children = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of workflow.edges) {
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
  }
  return {
    edges: workflow.edges,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        parentIds: parents.get(node.id) ?? [],
        childrenIds: children.get(node.id) ?? [],
      },
    })),
  };
}

function downstreamNodes(workflow: Workflow, nodeId: string): WorkflowNode[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const result: WorkflowNode[] = [];
  const queue = workflow.edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => edge.target);
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) result.push(node);
    queue.push(...workflow.edges.filter((edge) => edge.source === id).map((edge) => edge.target));
  }
  return result;
}

function dedupeOperations(operations: PlanPatchOperation[]): PlanPatchOperation[] {
  const seen = new Set<string>();
  return operations.filter((operation) => {
    const key = `${operation.operation_type}:${operation.target_id}:${operation.field_path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function listForField(
  node: WorkflowNode,
  field: "equipment_required" | "materials_required" | "people_required" | "validation_criteria",
): string[] {
  if (field === "equipment_required") return node.data.equipment;
  if (field === "materials_required") return node.data.materials;
  if (field === "people_required") return node.data.people;
  return node.data.validationCriteria;
}

function edgeValue(value: unknown): { source: string; target: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.source === "string" && typeof record.target === "string") {
    return { source: record.source, target: record.target };
  }
  return null;
}

function durationValue(label: string): { value: number; unit: string } {
  const match = label.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
  return {
    value: match?.[1] ? Number(match[1]) : 1,
    unit: match?.[2]?.toLowerCase() ?? "days",
  };
}

function durationLabel(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  return `${record.value ?? 1} ${record.unit ?? "days"}`;
}

function moneyLabel(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const amount = Number((value as Record<string, unknown>).value ?? 0);
  return `$${amount.toLocaleString("en-US")}`;
}

function parseMoney(label: string): number {
  const match = label.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function addDaysLabel(startDate: string, days: number): string {
  const dayMatch = startDate.match(/day\s*(\d+)/i);
  if (dayMatch?.[1]) return `Day ${Number(dayMatch[1]) + days}`;
  const parsed = Date.parse(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return startDate;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function cleanupItem(value: string): string {
  return value
    .replace(/\b(to|for|in|on|the|this|selected|step|task|node)\b/gi, " ")
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
