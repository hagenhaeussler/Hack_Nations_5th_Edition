import { randomUUID } from "node:crypto";

import type { LearningRepo, LessonFilters } from "./learningRepo.js";
import type { ProjectsRepo } from "./projectsRepo.js";
import {
  PLAN_CHANGE_TYPES,
  type FinalExperimentPlan,
  type FinalPlanCitation,
  type FinalPlanResource,
  type LessonCard,
  type LessonType,
  type PlanChangeEvent,
  type PlanChangeTargetType,
  type PlanChangeType,
  type PlanEditRequest,
  type PlanVersion,
  type Project,
  type ProjectStatsReport,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from "./projectTypes.js";

const DAY_WIDTH = 36;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const LEARNING_RELEVANT_CHANGE_TYPES = new Set<PlanChangeType>([
  "duration_changed",
  "budget_changed",
  "equipment_added",
  "material_added",
  "people_required_changed",
  "task_moved",
  "task_date_changed",
  "task_added",
  "task_removed",
  "schedule_shifted",
  "validation_criteria_changed",
  "risk_added",
  "procedure_changed",
]);

const LESSON_TYPE_BY_CHANGE: Partial<Record<PlanChangeType, LessonType>> = {
  duration_changed: "timeline_adjustment",
  budget_changed: "cost_adjustment",
  equipment_added: "equipment_requirement",
  material_added: "material_requirement",
  people_required_changed: "people_requirement",
  task_moved: "scheduling_constraint",
  task_date_changed: "timeline_adjustment",
  task_added: "procedure_correction",
  task_removed: "procedure_correction",
  schedule_shifted: "scheduling_constraint",
  validation_criteria_changed: "validation_rule",
  risk_added: "risk_pattern",
  procedure_changed: "procedure_correction",
};

interface NormalizedEdit {
  input: PlanEditRequest;
  changeType: PlanChangeType;
  targetType: PlanChangeTargetType;
  targetId: string;
  fieldChanged: string;
  workflowField: keyof WorkflowNode["data"] | null;
  oldValue: unknown;
  newValue: unknown;
  workflowValue: unknown;
}

export interface ApplyPlanEditResult {
  project: Project;
  change_event: PlanChangeEvent;
  updated_plan: Workflow;
  updated_stats_report: ProjectStatsReport;
  generated_lesson_cards: LessonCard[];
}

export interface ApplyBatchPlanEditResult {
  project: Project;
  change_events: PlanChangeEvent[];
  updated_plan: Workflow;
  updated_stats_report: ProjectStatsReport;
  generated_lesson_cards: LessonCard[];
}

export interface RelevantLessonQuery extends LessonFilters {
  hypothesis?: string;
  text?: string;
  limit?: number;
}

export class FeedbackLearningError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export class FeedbackLearningService {
  constructor(
    private readonly projectsRepo: ProjectsRepo,
    private readonly learningRepo: LearningRepo,
  ) {}

  async initializeCreatorPlanVersion(project: Project): Promise<PlanVersion | null> {
    const graph = getProjectGraph(project);
    if (!graph) return null;
    const existing = await this.learningRepo.listPlanVersions(project.id);
    const creatorVersion = existing.find(
      (version) => version.version_type === "creator_generated",
    );
    if (creatorVersion) return creatorVersion;

    const version: PlanVersion = {
      version_id: `ver_${randomUUID()}`,
      plan_id: project.id,
      version_number: existing.length + 1,
      version_type: "creator_generated",
      created_at: new Date().toISOString(),
      created_by: "creator_agent",
      graph_snapshot: graph,
      stats_report_snapshot: project.workflow
        ? buildStatsReport(project, project.workflow, [])
        : getFinalPlanStats(graph),
      parent_version_id: null,
      change_event_ids: [],
    };
    return this.learningRepo.savePlanVersion(version);
  }

  async applyPlanEdit(
    planId: string,
    input: PlanEditRequest,
  ): Promise<ApplyPlanEditResult> {
    const project = await this.projectsRepo.get(planId);
    if (!project) throw new FeedbackLearningError("Project not found.", 404);
    if (!project.workflow) {
      throw new FeedbackLearningError("Project has no editable workflow.");
    }

    const beforeVersion = await this.ensureCurrentVersion(project);
    const normalized = normalizePlanEdit(project.workflow, input);
    let nextWorkflow = applyNormalizedEdit(project.workflow, normalized);

    const validation = validateWorkflowDAG(nextWorkflow);
    if (!validation.valid) {
      throw new FeedbackLearningError(validation.errors.join(" "));
    }

    if (shouldRecalculateSchedule(normalized)) {
      nextWorkflow = recalculateWorkflowSchedule(nextWorkflow);
    }
    validateScheduleEdit(project.workflow, nextWorkflow, normalized);

    const nextStats = buildStatsReport(project, nextWorkflow, []);
    const changeEventId = `chg_${randomUUID()}`;
    const afterVersion: PlanVersion = {
      version_id: `ver_${randomUUID()}`,
      plan_id: project.id,
      version_number: beforeVersion.version_number + 1,
      version_type: "user_edited",
      created_at: new Date().toISOString(),
      created_by: "user",
      graph_snapshot: nextWorkflow,
      stats_report_snapshot: nextStats,
      parent_version_id: beforeVersion.version_id,
      change_event_ids: [changeEventId],
    };

    const shouldCreateLesson = LEARNING_RELEVANT_CHANGE_TYPES.has(
      normalized.changeType,
    );
    const event: PlanChangeEvent = {
      change_event_id: changeEventId,
      plan_id: project.id,
      plan_version_id_before: beforeVersion.version_id,
      plan_version_id_after: afterVersion.version_id,
      user_id: input.user_id ?? null,
      timestamp: new Date().toISOString(),
      change_source: input.change_source,
      change_type: normalized.changeType,
      target_type: normalized.targetType,
      target_id: normalized.targetId,
      field_changed: normalized.fieldChanged,
      old_value: normalized.oldValue,
      new_value: normalized.newValue,
      raw_user_comment: input.raw_user_comment ?? null,
      structured_reason: input.structured_reason ?? null,
      confidence: clampConfidence(input.confidence ?? 0.75),
      should_create_lesson: shouldCreateLesson,
      lesson_status: shouldCreateLesson ? "not_processed" : "ignored",
      metadata: input.metadata ?? {},
    };

    await this.learningRepo.savePlanVersion(afterVersion);
    await this.learningRepo.appendPlanChangeEvent(event);
    const generatedLessons = await this.generateAndSaveLessonCards(
      project,
      nextWorkflow,
      event,
    );
    const savedProject = await this.projectsRepo.attachWorkflow(project.id, nextWorkflow);
    if (!savedProject) {
      throw new FeedbackLearningError("Project disappeared mid-update.", 500);
    }

    const updatedStats = buildStatsReport(
      savedProject,
      nextWorkflow,
      generatedLessons,
    );

    return {
      project: savedProject,
      change_event: {
        ...event,
        lesson_status:
          generatedLessons.length > 0
            ? "processed"
            : shouldCreateLesson
              ? "needs_review"
              : "ignored",
      },
      updated_plan: nextWorkflow,
      updated_stats_report: updatedStats,
      generated_lesson_cards: generatedLessons,
    };
  }

  async applyPlanEdits(
    planId: string,
    edits: PlanEditRequest[],
  ): Promise<ApplyBatchPlanEditResult> {
    if (edits.length === 0) {
      throw new FeedbackLearningError("At least one edit is required.");
    }
    const results: ApplyPlanEditResult[] = [];
    for (const edit of edits) {
      results.push(await this.applyPlanEdit(planId, edit));
    }
    const last = results[results.length - 1];
    if (!last) throw new FeedbackLearningError("No edits were applied.");
    return {
      project: last.project,
      change_events: results.map((result) => result.change_event),
      updated_plan: last.updated_plan,
      updated_stats_report: last.updated_stats_report,
      generated_lesson_cards: results.flatMap(
        (result) => result.generated_lesson_cards,
      ),
    };
  }

  async listPlanVersions(planId: string): Promise<PlanVersion[]> {
    return this.learningRepo.listPlanVersions(planId);
  }

  async listPlanChangeEvents(planId: string): Promise<PlanChangeEvent[]> {
    return this.learningRepo.listPlanChangeEvents(planId);
  }

  async listLessons(filters?: LessonFilters): Promise<LessonCard[]> {
    return this.learningRepo.listLessonCards(filters);
  }

  async getRelevantLessons(query: RelevantLessonQuery): Promise<LessonCard[]> {
    const cards = await this.learningRepo.listLessonCards({
      status: query.status ?? "active",
      domain: query.domain,
      experiment_type: query.experiment_type,
      step_type: query.step_type,
      lab_id: query.lab_id,
    });
    const text = [query.hypothesis, query.text].filter(Boolean).join(" ");
    return cards
      .map((card) => ({ card, score: scoreLesson(card, query, text) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 10)
      .map(({ card }) => card);
  }

  private async ensureCurrentVersion(project: Project): Promise<PlanVersion> {
    const latest = await this.learningRepo.getLatestPlanVersion(project.id);
    if (latest) return latest;
    const initialized = await this.initializeCreatorPlanVersion(project);
    if (!initialized) {
      throw new FeedbackLearningError("Project has no plan snapshot to version.");
    }
    return initialized;
  }

  private async generateAndSaveLessonCards(
    project: Project,
    workflow: Workflow,
    event: PlanChangeEvent,
  ): Promise<LessonCard[]> {
    const card = generateLessonCard(project, workflow, event);
    if (!card) return [];
    const existing = await this.learningRepo.listLessonCards({
      domain: card.domain ?? undefined,
      experiment_type: card.experiment_type ?? undefined,
      step_type: card.step_type ?? undefined,
      lab_id:
        typeof card.applicability_conditions.lab_id === "string"
          ? card.applicability_conditions.lab_id
          : undefined,
    });
    const withConflictStatus = hasLessonConflict(card, existing)
      ? { ...card, status: "needs_review" as const }
      : card;
    return [await this.learningRepo.saveLessonCard(withConflictStatus)];
  }
}

export function validateWorkflowDAG(
  workflow: Workflow,
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = workflow.nodes.map((node) => node.id);
  const nodeIdSet = new Set(nodeIds);
  if (nodeIds.length !== nodeIdSet.size) errors.push("Workflow node IDs must be unique.");

  const edgeIds = workflow.edges.map((edge) => edge.id);
  if (edgeIds.length !== new Set(edgeIds).size) {
    errors.push("Workflow edge IDs must be unique.");
  }

  const childrenFromEdges = new Map<string, Set<string>>();
  const parentsFromEdges = new Map<string, Set<string>>();
  for (const nodeId of nodeIds) {
    childrenFromEdges.set(nodeId, new Set());
    parentsFromEdges.set(nodeId, new Set());
  }

  for (const edge of workflow.edges) {
    if (!nodeIdSet.has(edge.source)) {
      errors.push(`Edge ${edge.id} references missing source node ${edge.source}.`);
    }
    if (!nodeIdSet.has(edge.target)) {
      errors.push(`Edge ${edge.id} references missing target node ${edge.target}.`);
    }
    if (edge.source === edge.target) {
      errors.push(`Edge ${edge.id} cannot point a node to itself.`);
    }
    childrenFromEdges.get(edge.source)?.add(edge.target);
    parentsFromEdges.get(edge.target)?.add(edge.source);
  }

  for (const node of workflow.nodes) {
    for (const parentId of node.data.parentIds) {
      if (!nodeIdSet.has(parentId)) {
        errors.push(`Node ${node.id} references missing parent ${parentId}.`);
      }
    }
    for (const childId of node.data.childrenIds) {
      if (!nodeIdSet.has(childId)) {
        errors.push(`Node ${node.id} references missing child ${childId}.`);
      }
    }
    if (!sameStringSet(node.data.parentIds, parentsFromEdges.get(node.id) ?? new Set())) {
      errors.push(`Node ${node.id} parentIds do not match the edge list.`);
    }
    if (!sameStringSet(node.data.childrenIds, childrenFromEdges.get(node.id) ?? new Set())) {
      errors.push(`Node ${node.id} childrenIds do not match the edge list.`);
    }
  }

  if (hasCycle(workflow)) errors.push("Dependency edit would create a cycle.");

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function getProjectGraph(project: Project): Workflow | FinalExperimentPlan | null {
  return project.finalPlan ?? project.workflow ?? null;
}

function getFinalPlanStats(
  graph: Workflow | FinalExperimentPlan,
): ProjectStatsReport | null {
  return "stats_report" in graph ? graph.stats_report : null;
}

function normalizePlanEdit(workflow: Workflow, input: PlanEditRequest): NormalizedEdit {
  if (!input.target_id || !input.field_changed) {
    throw new FeedbackLearningError("`target_id` and `field_changed` are required.");
  }
  const changeType = inferChangeType(input, workflow);
  const fieldChanged = input.field_changed;
  const workflowField = workflowFieldFor(fieldChanged);
  const targetType = input.target_type;

    if (targetType === "edge") {
    return normalizeEdgeEdit(workflow, input, changeType);
  }
    if (targetType !== "node" && targetType !== "task") {
      throw new FeedbackLearningError("MVP edits currently support task targets.");
  }

  const node = workflow.nodes.find((item) => item.id === input.target_id);
  if (!node) throw new FeedbackLearningError("Target node does not exist.", 404);
  if (!workflowField) {
    throw new FeedbackLearningError(`Field is not editable on workflow nodes: ${fieldChanged}`);
  }

  const oldValue =
    input.old_value !== undefined
      ? input.old_value
      : eventValueForWorkflowField(workflowField, node.data[workflowField]);
  const workflowValue = workflowValueFor(workflowField, input.new_value);
  validateWorkflowValue(workflowField, workflowValue);
  return {
    input,
    changeType,
    targetType: targetType === "node" ? "task" : targetType,
    targetId: input.target_id,
    fieldChanged,
    workflowField,
    oldValue,
    newValue: input.new_value,
    workflowValue,
  };
}

function normalizeEdgeEdit(
  workflow: Workflow,
  input: PlanEditRequest,
  changeType: PlanChangeType,
): NormalizedEdit {
  const edge = workflow.edges.find((item) => item.id === input.target_id);
  const edgeValue = edgeToEventValue(edge);
  const nextEdge = edgeInputValue(input.new_value);
  if (
    (changeType === "dependency_added" || changeType === "dependency_reordered") &&
    !nextEdge
  ) {
    throw new FeedbackLearningError("Dependency edits require source and target node ids.");
  }
  return {
    input,
    changeType,
    targetType: "edge",
    targetId: input.target_id,
    fieldChanged: input.field_changed,
    workflowField: null,
    oldValue: input.old_value ?? edgeValue,
    newValue: input.new_value,
    workflowValue: nextEdge,
  };
}

function inferChangeType(input: PlanEditRequest, workflow: Workflow): PlanChangeType {
  if (input.change_type && PLAN_CHANGE_TYPES.includes(input.change_type)) {
    return input.change_type;
  }
  const field = input.field_changed;
  if (input.target_type === "edge") return "general_comment_added";
  if (["estimated_duration", "timeEstimate"].includes(field)) return "duration_changed";
  if (["estimated_price", "budget", "price"].includes(field)) return "budget_changed";
  if (["people_required", "people"].includes(field)) return "people_required_changed";
  if (["procedure", "detailed_procedure"].includes(field)) return "procedure_changed";
  if (["validation_criteria", "validationCriteria"].includes(field)) {
    return "validation_criteria_changed";
  }
  if (["scheduled_date", "start_date", "startDate"].includes(field)) return "task_date_changed";
  if (["task_status", "status"].includes(field)) return "task_status_changed";
  if (["step_name", "stepName"].includes(field)) return "task_renamed";
  if (["parent_ids", "parentIds", "children_ids", "childrenIds"].includes(field)) {
    return "general_comment_added";
  }
  if (["equipment_required", "equipment"].includes(field)) {
    return listGrew(workflow, input, "equipment") ? "equipment_added" : "equipment_removed";
  }
  if (["materials_required", "materials"].includes(field)) {
    return listGrew(workflow, input, "materials") ? "material_added" : "material_removed";
  }
  if (["citationsToPaper", "source_citations"].includes(field)) {
    return listGrew(workflow, input, "citationsToPaper")
      ? "citation_added"
      : "citation_removed";
  }
  return "general_comment_added";
}

function workflowFieldFor(
  field: string,
): keyof WorkflowNode["data"] | null {
  switch (field) {
    case "estimated_duration":
    case "timeEstimate":
      return "timeEstimate";
    case "estimated_price":
    case "budget":
    case "price":
      return "price";
    case "equipment_required":
    case "equipment":
      return "equipment";
    case "materials_required":
    case "materials":
      return "materials";
    case "people_required":
    case "people":
      return "people";
    case "procedure":
    case "detailed_procedure":
      return "procedure";
    case "validation_criteria":
    case "validationCriteria":
      return "validationCriteria";
    case "step_name":
    case "stepName":
      return "stepName";
    case "start_date":
    case "scheduled_date":
    case "startDate":
      return "startDate";
    case "task_status":
    case "status":
      return "status";
    case "citationsToPaper":
    case "source_citations":
      return "citationsToPaper";
    default:
      return null;
  }
}

function applyNormalizedEdit(workflow: Workflow, edit: NormalizedEdit): Workflow {
  if (edit.targetType === "edge") return workflow;
  const node = workflow.nodes.find((item) => item.id === edit.targetId);
  if (!node || !edit.workflowField) return workflow;
  const workflowField = edit.workflowField;

  const nodes = workflow.nodes.map((item) =>
    item.id === edit.targetId
      ? {
          ...item,
          data: {
            ...item.data,
            [workflowField]: edit.workflowValue,
          },
        }
      : item,
  );
  return normalizeWorkflowRelationships({ nodes, edges: [] });
}

function applyEdgeEdit(workflow: Workflow, edit: NormalizedEdit): Workflow {
  const nextEdge = edit.workflowValue as { source: string; target: string } | null;
  const existingEdge =
    workflow.edges.find((edge) => edge.id === edit.targetId) ??
    edgeInputValue(edit.oldValue);

  if (edit.changeType === "dependency_removed") {
    if (!existingEdge) throw new FeedbackLearningError("Dependency to remove was not found.");
    return removeWorkflowEdge(workflow, existingEdge.source, existingEdge.target);
  }
  if (edit.changeType === "dependency_reordered" && existingEdge) {
    const removed = removeWorkflowEdge(workflow, existingEdge.source, existingEdge.target);
    if (!nextEdge) return removed;
    return addWorkflowEdge(removed, nextEdge.source, nextEdge.target);
  }
  if (!nextEdge) throw new FeedbackLearningError("Dependency edit is missing the new edge.");
  return addWorkflowEdge(workflow, nextEdge.source, nextEdge.target);
}

function addWorkflowEdge(workflow: Workflow, source: string, target: string): Workflow {
  ensureNodesExist(workflow, [source, target]);
  if (source === target) throw new FeedbackLearningError("A dependency cannot target itself.");
  const edgeId = `e:${source}-${target}`;
  if (workflow.edges.some((edge) => edge.source === source && edge.target === target)) {
    return workflow;
  }
  const nodes = workflow.nodes.map((node) => {
    if (node.id === source) {
      return {
        ...node,
        data: { ...node.data, childrenIds: unique([...node.data.childrenIds, target]) },
      };
    }
    if (node.id === target) {
      return {
        ...node,
        data: { ...node.data, parentIds: unique([...node.data.parentIds, source]) },
      };
    }
    return node;
  });
  return normalizeWorkflowRelationships({
    nodes,
    edges: [...workflow.edges, { id: edgeId, source, target }],
  });
}

function removeWorkflowEdge(workflow: Workflow, source: string, target: string): Workflow {
  const nodes = workflow.nodes.map((node) => {
    if (node.id === source) {
      return {
        ...node,
        data: {
          ...node.data,
          childrenIds: node.data.childrenIds.filter((id) => id !== target),
        },
      };
    }
    if (node.id === target) {
      return {
        ...node,
        data: {
          ...node.data,
          parentIds: node.data.parentIds.filter((id) => id !== source),
        },
      };
    }
    return node;
  });
  return normalizeWorkflowRelationships({
    nodes,
    edges: workflow.edges.filter(
      (edge) => !(edge.source === source && edge.target === target),
    ),
  });
}

function normalizeWorkflowRelationships(workflow: Workflow): Workflow {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const edges = workflow.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  const parentIds = new Map<string, string[]>();
  const childIds = new Map<string, string[]>();
  for (const node of workflow.nodes) {
    parentIds.set(node.id, []);
    childIds.set(node.id, []);
  }
  for (const edge of edges) {
    childIds.get(edge.source)?.push(edge.target);
    parentIds.get(edge.target)?.push(edge.source);
  }
  return {
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        parentIds: unique(parentIds.get(node.id) ?? []),
        childrenIds: unique(childIds.get(node.id) ?? []),
      },
    })),
    edges: uniqueEdges(edges),
  };
}

function edgesFromNodes(nodes: WorkflowNode[]): WorkflowEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return uniqueEdges(
    nodes.flatMap((node) =>
      node.data.childrenIds
        .filter((childId) => nodeIds.has(childId))
        .map((childId) => ({
          id: `e:${node.id}-${childId}`,
          source: node.id,
          target: childId,
        })),
    ),
  );
}

void applyEdgeEdit;
void edgesFromNodes;

function validateWorkflowValue(
  field: keyof WorkflowNode["data"],
  value: unknown,
): void {
  if (
    [
      "people",
      "equipment",
      "materials",
      "experts",
      "citationsToPaper",
      "validationCriteria",
    ].includes(field)
  ) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new FeedbackLearningError(`${field} must be an array of strings.`);
    }
    return;
  }
  if (field === "status") {
    if (!["done", "active", "upcoming"].includes(String(value))) {
      throw new FeedbackLearningError("status must be done, active, or upcoming.");
    }
    return;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FeedbackLearningError(`${field} must be a non-empty string.`);
  }
  if (field === "timeEstimate" && parseDurationDays(value) <= 0) {
    throw new FeedbackLearningError("Duration must be a positive number.");
  }
  if (field === "price" && parseCurrency(value) < 0) {
    throw new FeedbackLearningError("Budget must be a valid non-negative number.");
  }
  if (field === "startDate" && !parseIsoDate(value)) {
    throw new FeedbackLearningError("startDate must be an ISO date string.");
  }
}

function workflowValueFor(
  field: keyof WorkflowNode["data"],
  value: unknown,
): unknown {
  if (
    [
      "people",
      "equipment",
      "materials",
      "experts",
      "citationsToPaper",
      "validationCriteria",
    ].includes(field)
  ) {
    return stringArrayValue(value);
  }
  if (field === "timeEstimate") return durationLabel(value);
  if (field === "price") return priceLabel(value);
  if (field === "status") return String(value);
  return String(value).trim();
}

function eventValueForWorkflowField(
  field: keyof WorkflowNode["data"],
  value: unknown,
): unknown {
  if (field === "timeEstimate" && typeof value === "string") {
    return durationObject(value);
  }
  if (field === "price" && typeof value === "string") {
    return { value: parseCurrency(value), currency: "USD" };
  }
  return value;
}

function shouldRecalculateSchedule(edit: NormalizedEdit): boolean {
  return [
    "duration_changed",
    "task_moved",
    "task_date_changed",
    "task_added",
    "task_removed",
    "schedule_changed",
    "start_date_changed",
    "end_date_changed",
  ].includes(edit.changeType);
}

function recalculateWorkflowSchedule(workflow: Workflow): Workflow {
  const ordered = topologicalWorkflowNodes(workflow);
  const base = getWorkflowBaseDate(workflow);
  const startDays = new Map<string, number>();
  const durations = new Map<string, number>();

  for (const node of ordered) {
    const existingStart = Math.max(0, dayOffset(base, node.data.startDate));
    const parentEnd = Math.max(
      0,
      0,
    );
    const startDay = Math.max(existingStart, parentEnd);
    startDays.set(node.id, startDay);
    durations.set(node.id, parseDurationDays(node.data.timeEstimate));
  }

  return {
    edges: workflow.edges,
    nodes: workflow.nodes.map((node) => {
      const startDay = startDays.get(node.id) ?? dayOffset(base, node.data.startDate);
      return {
        ...node,
        position: {
          ...node.position,
          x: startDay * DAY_WIDTH,
        },
        data: {
          ...node.data,
          startDate: formatIsoDate(addDays(base, startDay)),
        },
      };
    }),
  };
}

function validateScheduleEdit(
  previous: Workflow,
  next: Workflow,
  edit: NormalizedEdit,
): void {
  if (edit.changeType !== "start_date_changed") return;
  const previousNode = previous.nodes.find((node) => node.id === edit.targetId);
  const nextNode = next.nodes.find((node) => node.id === edit.targetId);
  if (!previousNode || !nextNode) return;
  const requestedStart = parseIsoDate(String(edit.workflowValue));
  if (!requestedStart) return;
  for (const parentId of previousNode.data.parentIds) {
    const parent = previous.nodes.find((node) => node.id === parentId);
    if (!parent) continue;
    const parentStart = parseIsoDate(parent.data.startDate);
    if (!parentStart) continue;
    const parentEnd = addDays(parentStart, parseDurationDays(parent.data.timeEstimate));
    if (requestedStart.getTime() < parentEnd.getTime()) {
      throw new FeedbackLearningError(
        `Start date violates dependency ${parent.id} -> ${nextNode.id}.`,
      );
    }
  }
}

function buildStatsReport(
  project: Project,
  workflow: Workflow,
  lessons: LessonCard[],
): ProjectStatsReport {
  const baseDate = getWorkflowBaseDate(workflow);
  const taskSummary = workflow.nodes.map((node) => {
    const startDay = dayOffset(baseDate, node.data.startDate);
    return {
      node_id: node.id,
      step_name: node.data.stepName,
      start_day: startDay,
      end_day: startDay + parseDurationDays(node.data.timeEstimate),
      status: node.data.status ?? "upcoming",
    };
  });
  const totalDays =
    taskSummary.length > 0
      ? Math.max(...taskSummary.map((task) => task.end_day)) -
        Math.min(...taskSummary.map((task) => task.start_day))
      : 0;
  const equipment = unique(workflow.nodes.flatMap((node) => node.data.equipment));
  const materials = unique(workflow.nodes.flatMap((node) => node.data.materials));
  const citations = workflow.nodes.flatMap<FinalPlanCitation>((node) =>
    node.data.citationsToPaper.map((citation) => ({
      document_id: citation,
      location: node.id,
      quote_or_evidence: citation,
    })),
  );

  return {
    report_id: `stats_${project.id}`,
    plan_id: project.id,
    hypothesis: project.hypothesis,
    experiment_goal: project.prePlan?.experiment_summary.goal ?? project.hypothesis,
    summary: `Current edited calendar plan has ${workflow.nodes.length} scheduled tasks.`,
    total_estimated_duration: {
      value: totalDays,
      unit: "days",
      confidence: "medium",
      basis: "Recalculated from edited workflow start dates and durations.",
    },
    total_estimated_budget: {
      value: workflow.nodes.reduce(
        (sum, node) => sum + parseCurrency(node.data.price),
        0,
      ),
      currency: "USD",
      confidence: "medium",
      basis: "Summed from edited workflow node prices.",
    },
    people_summary: unique(workflow.nodes.flatMap((node) => node.data.people)),
    equipment_summary: {
      required: equipment,
      available: [],
      missing: [],
      unknown: equipment,
    },
    materials_summary: {
      required: materials,
      available: [],
      missing: [],
      unknown: materials,
    },
    purchase_list: materials.map<FinalPlanResource>((name) => ({
      name,
      availability: "unknown",
    })),
    task_summary: taskSummary,
    validation_criteria_summary: unique(
      workflow.nodes.flatMap((node) => node.data.validationCriteria),
    ),
    milestone_summary: [],
    risk_summary: [],
    domain_expert_summary: project.prePlan?.dag.nodes.flatMap(
      (node) => node.domain_experts,
    ) ?? [],
    citation_summary: citations,
    learning_memory_summary: lessons.map((lesson) => lesson.lesson_summary),
    open_questions: project.prePlan?.open_questions ?? [],
    confidence_summary:
      lessons.length > 0
        ? "Updated with scientist feedback and stored learning records."
        : "Derived from the current editable workflow.",
  };
}

function generateLessonCard(
  project: Project,
  workflow: Workflow,
  event: PlanChangeEvent,
): LessonCard | null {
  if (!event.should_create_lesson) return null;
  const lessonType = LESSON_TYPE_BY_CHANGE[event.change_type];
  if (!lessonType) return null;
  const node = workflow.nodes.find((item) => item.id === event.target_id);
  const stepName = node?.data.stepName ?? event.target_id;
  const stepType = stepTypeFromNode(node);
  const domain = project.prePlan?.experiment_summary.domain ?? null;
  const experimentType = project.prePlan?.experiment_summary.experiment_type ?? null;
  const labId =
    typeof event.metadata.lab_id === "string" ? event.metadata.lab_id : null;
  const scope = labId
    ? "lab_specific"
    : experimentType
      ? "experiment_type_specific"
      : domain
        ? "domain_specific"
        : "plan_specific";
  const title = lessonTitle(event.change_type, stepName);
  const original = `${stepName}: ${formatValue(event.old_value)}.`;
  const correction = `${stepName}: ${formatValue(event.new_value)}.`;
  const reason = event.raw_user_comment ? ` Reason: ${event.raw_user_comment}` : "";
  const summary = `The scientist corrected ${event.field_changed} on "${stepName}" from ${formatValue(event.old_value)} to ${formatValue(event.new_value)}.${reason}`;
  const recommendation = lessonRecommendation(event.change_type, stepName);

  return {
    lesson_id: `lesson_${randomUUID()}`,
    source_change_event_ids: [event.change_event_id],
    source_plan_id: project.id,
    source_node_ids: node ? [node.id] : [],
    lesson_type: lessonType,
    lesson_title: title,
    lesson_summary: summary,
    domain,
    experiment_type: experimentType,
    step_type: stepType,
    applicability_conditions: {
      lab_id: labId,
      domain,
      experiment_type: experimentType,
      step_type: stepType,
      similarity_required: "medium",
      source: event.change_source,
    },
    original_agent_assumption: original,
    scientist_correction: correction,
    recommended_future_adjustment: recommendation,
    affected_fields: [event.field_changed],
    confidence: event.confidence,
    scope,
    status: event.raw_user_comment ? "active" : "candidate",
    created_at: event.timestamp,
    updated_at: event.timestamp,
    created_by: "feedback_learning_service",
    related_citations: node?.data.citationsToPaper ?? [],
    embedding_text: [
      title,
      summary,
      recommendation,
      domain,
      experimentType,
      stepType,
      event.raw_user_comment,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function hasLessonConflict(card: LessonCard, existing: LessonCard[]): boolean {
  return existing.some(
    (item) =>
      item.lesson_id !== card.lesson_id &&
      item.status !== "rejected" &&
      item.lesson_type === card.lesson_type &&
      item.step_type === card.step_type &&
      item.recommended_future_adjustment !== card.recommended_future_adjustment,
  );
}

function lessonTitle(changeType: PlanChangeType, stepName: string): string {
  switch (changeType) {
    case "duration_changed":
      return `Adjust duration for ${stepName}`;
    case "budget_changed":
      return `Adjust budget for ${stepName}`;
    case "equipment_added":
      return `Require added equipment for ${stepName}`;
    case "material_added":
      return `Require added material for ${stepName}`;
    case "people_required_changed":
      return `Adjust staffing for ${stepName}`;
    case "dependency_added":
    case "dependency_reordered":
      return `Use corrected dependency for ${stepName}`;
    case "validation_criteria_changed":
      return `Apply validation rule for ${stepName}`;
    case "risk_added":
      return `Track risk pattern for ${stepName}`;
    case "procedure_changed":
      return `Use corrected procedure for ${stepName}`;
    default:
      return `Apply scientist correction for ${stepName}`;
  }
}

function lessonRecommendation(changeType: PlanChangeType, stepName: string): string {
  switch (changeType) {
    case "duration_changed":
      return `For similar future plans, estimate "${stepName}" using the corrected duration unless stronger context says otherwise.`;
    case "budget_changed":
      return `For similar future plans, use the corrected budget for "${stepName}" and flag cost assumptions for review.`;
    case "equipment_added":
      return `For similar future plans, include the added equipment when planning "${stepName}".`;
    case "material_added":
      return `For similar future plans, include the added material when planning "${stepName}".`;
    case "people_required_changed":
      return `For similar future plans, adjust staffing for "${stepName}" to match the scientist correction.`;
    case "dependency_added":
    case "dependency_reordered":
      return `For similar future plans, preserve the corrected dependency ordering around "${stepName}".`;
    case "validation_criteria_changed":
      return `For similar future plans, apply the corrected validation criteria to "${stepName}".`;
    case "risk_added":
      return `For similar future plans, include this risk pattern and mitigation planning for "${stepName}".`;
    case "procedure_changed":
      return `For similar future plans, follow the corrected procedure guidance for "${stepName}".`;
    default:
      return `For similar future plans, consider this scientist correction for "${stepName}".`;
  }
}

function scoreLesson(
  card: LessonCard,
  query: RelevantLessonQuery,
  text: string,
): number {
  let score = 0;
  if (query.domain && card.domain === query.domain) score += 3;
  if (query.experiment_type && card.experiment_type === query.experiment_type) {
    score += 4;
  }
  if (query.step_type && card.step_type === query.step_type) score += 4;
  if (
    query.lab_id &&
    card.applicability_conditions.lab_id === query.lab_id
  ) {
    score += 5;
  }
  score += textOverlapScore(text, card.embedding_text);
  return score;
}

function textOverlapScore(query: string, target: string): number {
  const words = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
  if (words.size === 0) return 1;
  const targetWords = new Set(
    target
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
  return [...words].filter((word) => targetWords.has(word)).length;
}

function topologicalWorkflowNodes(workflow: Workflow): WorkflowNode[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const children = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of workflow.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }
  const queue = workflow.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const ordered: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    const node = byId.get(id);
    if (node) ordered.push(node);
    for (const childId of children.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }
  return ordered.length === workflow.nodes.length ? ordered : workflow.nodes;
}

function hasCycle(workflow: Workflow): boolean {
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const children = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of workflow.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }
  const queue = workflow.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    visited += 1;
    for (const childId of children.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }
  return visited !== workflow.nodes.length;
}

function sameStringSet(values: string[], set: Set<string>): boolean {
  return values.length === set.size && values.every((value) => set.has(value));
}

function ensureNodesExist(workflow: Workflow, ids: string[]): void {
  const existing = new Set(workflow.nodes.map((node) => node.id));
  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new FeedbackLearningError(`Dependency references missing node: ${missing.join(", ")}.`);
  }
}

function edgeInputValue(value: unknown): { source: string; target: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const source = record.source ?? record.from_node_id ?? record.from;
  const target = record.target ?? record.to_node_id ?? record.to;
  if (typeof source === "string" && typeof target === "string") {
    return { source, target };
  }
  return null;
}

function edgeToEventValue(edge: WorkflowEdge | undefined): unknown {
  return edge ? { id: edge.id, source: edge.source, target: edge.target } : null;
}

function listGrew(
  workflow: Workflow,
  input: PlanEditRequest,
  field: keyof WorkflowNode["data"],
): boolean {
  const node = workflow.nodes.find((item) => item.id === input.target_id);
  const oldLength = Array.isArray(node?.data[field]) ? node.data[field].length : 0;
  const next = Array.isArray(input.new_value) ? input.new_value : [];
  return next.length >= oldLength;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return unique(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
  const seen = new Set<string>();
  const result: WorkflowEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...edge, id: edge.id || `e:${edge.source}-${edge.target}` });
  }
  return result;
}

function durationLabel(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "number" && typeof record.unit === "string") {
      return `${record.value} ${record.unit}`;
    }
  }
  return String(value).trim();
}

function priceLabel(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return `$${value.toLocaleString("en-US")}`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "number") {
      return `$${record.value.toLocaleString("en-US")}`;
    }
  }
  return String(value).trim();
}

function durationObject(label: string): { value: number; unit: string } {
  const normalized = label.toLowerCase();
  const amount = parseDurationDays(label);
  const unit = normalized.includes("week")
    ? "weeks"
    : normalized.includes("month")
      ? "months"
      : normalized.includes("hour")
        ? "hours"
        : "days";
  return { value: amount, unit };
}

function parseDurationDays(label: string | undefined): number {
  if (!label) return 1;
  const normalized = label.toLowerCase();
  const matches = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const amount = matches.length > 0 ? Math.max(...matches) : 1;
  if (normalized.includes("week")) return Math.ceil(amount * 7);
  if (normalized.includes("month")) return Math.ceil(amount * 30);
  if (normalized.includes("hour")) return Math.max(Math.ceil(amount / 24), 1);
  return Math.ceil(amount);
}

function parseCurrency(label: string | undefined): number {
  if (!label) return 0;
  const normalized = label.toLowerCase().replace(/,/g, "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return 0;
  return normalized.includes("k") ? amount * 1000 : amount;
}

function getWorkflowBaseDate(workflow: Workflow): Date {
  const times = workflow.nodes
    .map((node) => parseIsoDate(node.data.startDate)?.getTime() ?? null)
    .filter((time): time is number => time !== null);
  return times.length > 0 ? new Date(Math.min(...times)) : new Date();
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : new Date(time);
}

function dayOffset(base: Date, value: string | undefined): number {
  const date = parseIsoDate(value);
  if (!date) return 0;
  return Math.max(0, Math.round((date.getTime() - base.getTime()) / MS_PER_DAY));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function stepTypeFromNode(node: WorkflowNode | undefined): string | null {
  if (!node) return null;
  return node.data.stepName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.max(0, Math.min(1, value));
}
