/**
 * Domain types for projects.
 *
 * These shapes are the wire contract for /api/projects/* and live in their
 * own file so both the repo (Postgres / memory) and the route handlers can
 * import them without circular deps.
 *
 * The frontend mirrors this shape in `frontend/src/lib/projects.ts`. Keep
 * the two in sync when fields are added.
 */

export type ProjectStatus =
  | "researching" // research call in flight
  | "research-ready" // papers attached, waiting on user to generate
  | "generating" // generate call in flight
  | "ready"; // workflow attached

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  /** 0–1 cosine-style similarity to the user's prompt. */
  similarity: number;
  abstract: string;
  url?: string;
  provider?: string;
  novelty_relation?: string;
  is_fallback?: boolean;
}

export interface WorkflowNode {
  id: string;
  /** Pixel-space coordinate the frontend hands directly to React Flow. */
  position: { x: number; y: number };
  data: {
    id: string;
    stepName: string;
    people: string[];
    equipment: string[];
    materials: string[];
    timeEstimate: string;
    price: string;
    experts: string[];
    citationsToPaper: string[];
    procedure: string;
    validationCriteria: string[];
    startDate: string;
    parentIds: string[];
    childrenIds: string[];
    /** UI presentation metadata. */
    status?: "done" | "active" | "upcoming";
    icon?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type PrePlanConfidence = "high" | "medium" | "low";

export interface PrePlanSourceDocument {
  document_id: string;
  title: string;
  authors: string[];
  year: number | "unknown";
  source_type:
    | "paper"
    | "protocol"
    | "lab_note"
    | "lab_context"
    | "uploaded_file"
    | "paper_link"
    | "unknown";
  file_name?: string;
  url?: string;
  citation: string;
}

export interface PrePlanQuantity {
  name: string;
  quantity: string;
  unit: string;
}

export interface PrePlanEquipment {
  name: string;
  required: boolean;
  availability_assumption: string;
}

export interface PrePlanDuration {
  value: number | null;
  unit: string;
  confidence: PrePlanConfidence;
  basis: string;
}

export interface PrePlanPrice {
  value: number | null;
  currency: "USD";
  confidence: PrePlanConfidence;
  basis: string;
}

export interface PrePlanCitation {
  document_id: string;
  location: string;
  quote_or_evidence: string;
}

export interface PrePlanDomainExpert {
  name: string;
  affiliation: string;
  reason_relevant: string;
  source: string;
}

export interface PrePlanStart {
  type: "relative" | "absolute" | "unknown";
  value: string | null;
  date: string | null;
}

export interface PrePlanNode {
  node_id: string;
  step_name: string;
  step_purpose: string;
  people_required: {
    count: number | null;
    roles: string[];
  };
  equipment_required: PrePlanEquipment[];
  materials_required: PrePlanQuantity[];
  estimated_duration: PrePlanDuration;
  estimated_price: PrePlanPrice;
  items_to_buy: Array<{
    name: string;
    reason: string;
    estimated_price: number | null;
  }>;
  domain_experts: PrePlanDomainExpert[];
  source_citations: PrePlanCitation[];
  procedure: string;
  validation_criteria: string[];
  start: PrePlanStart;
  parent_ids: string[];
  child_ids: string[];
  uncertainties: string[];
}

export interface PrePlanEdge {
  from: string;
  to: string;
  dependency_type: "must_finish_before_start";
  reason: string;
}

export interface PrePlan {
  pre_plan_id: string;
  source_documents: PrePlanSourceDocument[];
  experiment_summary: {
    title: string;
    goal: string;
    domain: string;
    experiment_type: string;
    main_method: string;
    reconstruction_confidence: PrePlanConfidence;
  };
  dag: {
    nodes: PrePlanNode[];
    edges: PrePlanEdge[];
  };
  global_resources: {
    people: string[];
    equipment: string[];
    materials: string[];
    items_to_buy: string[];
    estimated_total_cost: PrePlanPrice;
    estimated_total_duration: PrePlanDuration;
  };
  open_questions: string[];
  agent_notes: string[];
  summary: string;
}

export type FinalPlanConfidence = "high" | "medium" | "low";
export type ResourceAvailability = "available" | "missing" | "unknown";
export type FinalPlanNodeStatus = "done" | "active" | "upcoming";

export interface FinalPlanEstimate {
  value: number | null;
  unit: string;
  confidence: FinalPlanConfidence;
  basis: string;
}

export interface FinalPlanPrice {
  value: number | null;
  currency: "USD";
  confidence: FinalPlanConfidence;
  basis: string;
}

export interface FinalPlanResource {
  name: string;
  quantity?: string;
  unit?: string;
  availability: ResourceAvailability;
  reason?: string;
  estimated_price?: number | null;
}

export interface FinalPlanCitation {
  document_id: string;
  location: string;
  quote_or_evidence: string;
  source_preplan_id?: string;
}

export interface FinalPlanRisk {
  risk_id: string;
  description: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
  source: string;
}

export interface FinalPlanCalendarPosition {
  week_index: number;
  day_index: number;
  x: number;
  y: number;
  width: number;
  lane: number;
}

export interface FinalPlanNode {
  node_id: string;
  step_name: string;
  step_purpose: string;
  detailed_procedure: string;
  people_required: {
    count: number | null;
    roles: string[];
  };
  assigned_people_if_known: string[];
  equipment_required: FinalPlanResource[];
  equipment_available: string[];
  equipment_missing: string[];
  materials_required: FinalPlanResource[];
  materials_available: string[];
  materials_to_buy: FinalPlanResource[];
  estimated_duration: FinalPlanEstimate;
  estimated_price: FinalPlanPrice;
  domain_experts: PrePlanDomainExpert[];
  source_citations: FinalPlanCitation[];
  source_preplan_node_ids: string[];
  related_lesson_ids: string[];
  validation_criteria: string[];
  milestone: string | null;
  risks: FinalPlanRisk[];
  uncertainty_notes: string[];
  start: {
    type: "relative" | "absolute";
    relative_day: number;
    date: string | null;
  };
  end: {
    type: "relative" | "absolute";
    relative_day: number;
    date: string | null;
  };
  calendar_position: FinalPlanCalendarPosition;
  parent_ids: string[];
  child_ids: string[];
  status: FinalPlanNodeStatus;
}

export interface ScheduledTask {
  task_id: string;
  task_key: string;
  title: string;
  description: string;
  step_type: string;
  procedure: string;
  scheduled_date: string | null;
  day_offset: number;
  week_index: number;
  day_index: number;
  duration_hours: number | null;
  duration_days?: number | null;
  estimated_cost: number | null;
  people_required: string[];
  equipment_required: FinalPlanResource[];
  materials_required: FinalPlanResource[];
  missing_resources: string[];
  items_to_buy: FinalPlanResource[];
  validation_criteria: string[];
  milestone: string | null;
  risks: FinalPlanRisk[];
  status: FinalPlanNodeStatus;
  citations: FinalPlanCitation[];
  domain_experts: PrePlanDomainExpert[];
  source_references: string[];
  related_lesson_ids: string[];
  uncertainty_notes: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FinalPlanEdge {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  dependency_type: "must_finish_before_start" | "can_overlap_after_start";
  reason: string;
  is_critical_path_dependency: boolean;
  confidence: FinalPlanConfidence;
}

export interface WeekGroup {
  week_index: number;
  start_date: string | null;
  end_date: string | null;
  days: DayGroup[];
}

export interface DayGroup {
  date: string | null;
  day_index: number;
  label?: string;
  weekday?: string;
  task_ids?: string[];
  node_ids: string[];
}

export interface CalendarLayout {
  plan_start_date?: string | null;
  plan_end_date?: string | null;
  timeline_start_date: string | null;
  timeline_end_date: string | null;
  total_days: number;
  total_weeks: number;
  weeks?: WeekGroup[];
  week_groups: WeekGroup[];
  day_groups: DayGroup[];
  task_positions?: Record<string, FinalPlanCalendarPosition>;
  node_positions: Record<string, FinalPlanCalendarPosition>;
  critical_path_node_ids: string[];
}

export interface ProjectStatsReport {
  report_id: string;
  plan_id: string;
  hypothesis: string;
  experiment_goal: string;
  summary: string;
  total_estimated_duration: FinalPlanEstimate;
  total_estimated_budget: FinalPlanPrice;
  people_summary: string[];
  equipment_summary: {
    required: string[];
    available: string[];
    missing: string[];
    unknown: string[];
  };
  materials_summary: {
    required: string[];
    available: string[];
    missing: string[];
    unknown: string[];
  };
  purchase_list: FinalPlanResource[];
  task_summary: Array<{
    node_id: string;
    step_name: string;
    start_day: number;
    end_day: number;
    status: FinalPlanNodeStatus;
  }>;
  validation_criteria_summary: string[];
  milestone_summary: Array<{
    node_id: string;
    milestone: string;
  }>;
  risk_summary: FinalPlanRisk[];
  domain_expert_summary: PrePlanDomainExpert[];
  citation_summary: FinalPlanCitation[];
  learning_memory_summary: string[];
  open_questions: string[];
  confidence_summary: string;
}

export interface FinalExperimentPlan {
  plan_id: string;
  user_input_id: string;
  hypothesis: string;
  experiment_title: string;
  experiment_goal: string;
  domain: string;
  experiment_type: string;
  created_at: string;
  updated_at: string;
  source_preplan_ids: string[];
  source_document_ids: string[];
  source_lesson_ids: string[];
  source_previous_experiment_ids: string[];
  plan_type?: "calendar";
  plan_start_date?: string | null;
  plan_end_date?: string | null;
  tasks?: ScheduledTask[];
  nodes: FinalPlanNode[];
  edges: FinalPlanEdge[];
  calendar_layout: CalendarLayout;
  stats_report: ProjectStatsReport;
  confidence: FinalPlanConfidence;
  open_questions: string[];
  agent_notes: string[];
  creator_explanation: string;
}

export type RiskCategory =
  | "timeline_risk"
  | "budget_risk"
  | "equipment_risk"
  | "material_risk"
  | "people_risk"
  | "dependency_risk"
  | "scheduling_risk"
  | "validation_risk"
  | "procedure_risk"
  | "citation_support_risk"
  | "uncertainty_risk"
  | "lab_inventory_risk"
  | "previous_experiment_risk"
  | "learning_memory_risk";

export type RiskSeverity = "critical" | "high" | "medium" | "low";
export type RiskProbability = "high" | "medium" | "low" | "unknown";
export type RiskImpact = "high" | "medium" | "low";

export interface RiskSourceContext {
  node_ids: string[];
  lesson_ids: string[];
  citation_ids: string[];
  report_sections: string[];
}

export interface AnalyzedRisk {
  risk_id: string;
  title: string;
  severity: RiskSeverity;
  probability: RiskProbability;
  impact: RiskImpact;
  risk_score: number;
  category: RiskCategory;
  affected_nodes: string[];
  affected_edges: string[];
  affected_resources: string[];
  explanation: string;
  evidence: string[];
  possible_consequences: string[];
  suggested_mitigation: string[];
  confidence: FinalPlanConfidence;
  source_context: RiskSourceContext;
}

export interface RiskAnalysisResult {
  analysis_id: string;
  plan_id: string;
  created_at: string;
  overall_risk_level: RiskSeverity;
  summary: string;
  top_risks: AnalyzedRisk[];
  risk_counts: Record<RiskSeverity, number>;
  affected_nodes_ranked: Array<{
    node_id: string;
    risk_score: number;
    risk_count: number;
  }>;
  recommended_next_actions: string[];
}

export type PlanVersionType =
  | "creator_generated"
  | "user_edited"
  | "system_revised";

export type PlanVersionCreatedBy = "creator_agent" | "user" | "system";

export interface PlanVersion {
  version_id: string;
  plan_id: string;
  version_number: number;
  version_type: PlanVersionType;
  created_at: string;
  created_by: PlanVersionCreatedBy;
  graph_snapshot: Workflow | FinalExperimentPlan;
  stats_report_snapshot: ProjectStatsReport | null;
  parent_version_id: string | null;
  change_event_ids: string[];
}

export const PLAN_CHANGE_TYPES = [
  "duration_changed",
  "budget_changed",
  "equipment_added",
  "equipment_removed",
  "material_added",
  "material_removed",
  "people_required_changed",
  "role_added",
  "role_removed",
  "task_moved",
  "task_date_changed",
  "task_added",
  "task_removed",
  "task_split",
  "task_merged",
  "task_renamed",
  "schedule_shifted",
  "calendar_week_changed",
  "dependency_added",
  "dependency_removed",
  "dependency_reordered",
  "node_added",
  "node_removed",
  "node_renamed",
  "procedure_changed",
  "validation_criteria_changed",
  "milestone_changed",
  "risk_added",
  "risk_removed",
  "schedule_changed",
  "start_date_changed",
  "end_date_changed",
  "task_status_changed",
  "citation_added",
  "citation_removed",
  "general_comment_added",
] as const;

export type PlanChangeType = (typeof PLAN_CHANGE_TYPES)[number];

export type PlanChangeSource =
  | "frontend_calendar_edit"
  | "frontend_graph_edit"
  | "stats_report_edit"
  | "chat_feedback"
  | "system_suggestion_acceptance";

export type PlanChangeTargetType =
  | "task"
  | "node"
  | "edge"
  | "plan"
  | "schedule"
  | "resource"
  | "validation_criteria"
  | "risk"
  | "budget"
  | "people"
  | "equipment"
  | "material";

export type PlanChangeLessonStatus =
  | "not_processed"
  | "processed"
  | "ignored"
  | "needs_review";

export interface PlanChangeEvent {
  change_event_id: string;
  plan_id: string;
  plan_version_id_before: string;
  plan_version_id_after: string;
  user_id: string | null;
  timestamp: string;
  change_source: PlanChangeSource;
  change_type: PlanChangeType;
  target_type: PlanChangeTargetType;
  target_id: string;
  field_changed: string;
  old_value: unknown;
  new_value: unknown;
  raw_user_comment: string | null;
  structured_reason: string | null;
  confidence: number;
  should_create_lesson: boolean;
  lesson_status: PlanChangeLessonStatus;
  metadata: Record<string, unknown>;
}

export type LessonType =
  | "timeline_adjustment"
  | "cost_adjustment"
  | "equipment_requirement"
  | "material_requirement"
  | "people_requirement"
  | "dependency_rule"
  | "procedure_correction"
  | "validation_rule"
  | "risk_pattern"
  | "scheduling_constraint"
  | "lab_specific_constraint"
  | "domain_specific_rule"
  | "citation_correction"
  | "general_planning_preference";

export type LessonScope =
  | "plan_specific"
  | "lab_specific"
  | "domain_specific"
  | "experiment_type_specific"
  | "global_candidate";

export type LessonStatus =
  | "active"
  | "candidate"
  | "needs_review"
  | "rejected"
  | "archived";

export interface LessonCard {
  lesson_id: string;
  source_change_event_ids: string[];
  source_plan_id: string;
  source_node_ids: string[];
  lesson_type: LessonType;
  lesson_title: string;
  lesson_summary: string;
  domain: string | null;
  experiment_type: string | null;
  step_type: string | null;
  applicability_conditions: Record<string, unknown>;
  original_agent_assumption: string;
  scientist_correction: string;
  recommended_future_adjustment: string;
  affected_fields: string[];
  confidence: number;
  scope: LessonScope;
  status: LessonStatus;
  created_at: string;
  updated_at: string;
  created_by: "feedback_learning_service" | "feedback_learning_agent";
  related_citations: string[];
  embedding_text: string;
}

export interface PlanEditRequest {
  change_source: PlanChangeSource;
  target_type: PlanChangeTargetType;
  target_id: string;
  field_changed: string;
  new_value: unknown;
  old_value?: unknown;
  user_id?: string;
  change_type?: PlanChangeType;
  raw_user_comment?: string;
  structured_reason?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface Project {
  id: string;
  /** Original user prompt (the hypothesis). */
  hypothesis: string;
  /** Short, human-friendly title derived from the hypothesis. */
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  /** Populated once `research-ready`. */
  papers?: Paper[];
  /** Populated once the Pre-Plan Maker reconstructs related procedures. */
  prePlan?: PrePlan;
  /** Populated once the Creator Agent creates the final executable plan. */
  finalPlan?: FinalExperimentPlan;
  /** Populated once `ready`. */
  workflow?: Workflow;
  setup_warnings?: string[];
  generation_mode?: "openai" | "fallback" | "partial";
}
