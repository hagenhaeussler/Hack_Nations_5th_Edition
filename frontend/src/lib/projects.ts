/**
 * Project domain types — mirror of `backend/src/lib/projectTypes.ts`.
 *
 * Kept intentionally narrow so swapping the data source is mechanical.
 * All read paths now go through `lib/api.ts`; no sample data lives here
 * anymore.
 */

import type { Paper } from "@/lib/papers";

export type ProjectStatus =
  | "researching"
  | "research-ready"
  | "generating"
  | "ready";

export interface WorkflowNode {
  id: string;
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

export interface PlanEditRequest {
  change_source: PlanChangeSource;
  target_type: PlanChangeTargetType;
  target_id: string;
  field_changed: string;
  new_value: unknown;
  old_value?: unknown;
  change_type?: string;
  raw_user_comment?: string;
  metadata?: Record<string, unknown>;
}

export interface LessonCard {
  lesson_id: string;
  lesson_title: string;
  lesson_summary: string;
  status: "active" | "candidate" | "needs_review" | "rejected" | "archived";
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

export interface PrePlanNode {
  node_id: string;
  step_name: string;
  step_purpose: string;
  people_required: {
    count: number | null;
    roles: string[];
  };
  equipment_required: Array<{
    name: string;
    required: boolean;
    availability_assumption: string;
  }>;
  materials_required: Array<{
    name: string;
    quantity: string;
    unit: string;
  }>;
  estimated_duration: {
    value: number | null;
    unit: string;
    confidence: PrePlanConfidence;
    basis: string;
  };
  estimated_price: {
    value: number | null;
    currency: "USD";
    confidence: PrePlanConfidence;
    basis: string;
  };
  items_to_buy: Array<{
    name: string;
    reason: string;
    estimated_price: number | null;
  }>;
  domain_experts: Array<{
    name: string;
    affiliation: string;
    reason_relevant: string;
    source: string;
  }>;
  source_citations: Array<{
    document_id: string;
    location: string;
    quote_or_evidence: string;
  }>;
  procedure: string;
  validation_criteria: string[];
  start: {
    type: "relative" | "absolute" | "unknown";
    value: string | null;
    date: string | null;
  };
  parent_ids: string[];
  child_ids: string[];
  uncertainties: string[];
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
    edges: Array<{
      from: string;
      to: string;
      dependency_type: "must_finish_before_start";
      reason: string;
    }>;
  };
  global_resources: {
    people: string[];
    equipment: string[];
    materials: string[];
    items_to_buy: string[];
    estimated_total_cost: {
      value: number | null;
      currency: "USD";
      confidence: PrePlanConfidence;
      basis: string;
    };
    estimated_total_duration: {
      value: number | null;
      unit: string;
      confidence: PrePlanConfidence;
      basis: string;
    };
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

export type SupplierId =
  | "thermo_fisher"
  | "sigma_aldrich"
  | "promega"
  | "qiagen"
  | "idt"
  | "market_estimate";

export interface SupplierDirectoryEntry {
  supplier_id: SupplierId;
  name: string;
  homepage_url: string;
  resource_url: string;
  focus: string;
}

export interface SupplierCandidate {
  candidate_id: string;
  supplier_id: SupplierId;
  supplier_name: string;
  title: string;
  url: string;
  snippet: string;
  result_type: "product" | "tool" | "protocol" | "technical_document" | "search";
  is_pdf: boolean;
  is_verified_supplier: boolean;
  estimated_price: number | null;
  confidence: FinalPlanConfidence;
  score: number | null;
}

export type ResourceDecisionStatus =
  | "needs_review"
  | "buy"
  | "substitute"
  | "already_available";

export interface ResourceTaskReference {
  task_id: string;
  title: string;
  scheduled_date: string | null;
}

export interface ProcurementResourceItem extends FinalPlanResource {
  resource_id: string;
  category: "reagent" | "antibody" | "kit" | "primer" | "consumable" | "equipment" | "service" | "other";
  decision_status: ResourceDecisionStatus;
  decision_prompt: string;
  source_tasks: ResourceTaskReference[];
  supplier_candidates: SupplierCandidate[];
  recommended_supplier: SupplierCandidate | null;
  estimated_unit_price: number | null;
  price_basis: string;
}

export interface ProcurementReport {
  project_id: string;
  plan_id: string;
  generated_at: string;
  mode: "tavily" | "fallback";
  warnings: string[];
  suppliers: SupplierDirectoryEntry[];
  resources: ProcurementResourceItem[];
  decisions_required: Array<{
    resource_id: string;
    question: string;
  }>;
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
  domain_experts: Array<{
    name: string;
    affiliation: string;
    reason_relevant: string;
    source: string;
  }>;
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
  domain_experts: FinalPlanNode["domain_experts"];
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

export interface DayGroup {
  date: string | null;
  day_index: number;
  label?: string;
  weekday?: string;
  task_ids?: string[];
  node_ids: string[];
}

export interface WeekGroup {
  week_index: number;
  start_date: string | null;
  end_date: string | null;
  days: DayGroup[];
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
  domain_expert_summary: FinalPlanNode["domain_experts"];
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

export interface Project {
  id: string;
  hypothesis: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  papers?: Paper[];
  prePlan?: PrePlan;
  finalPlan?: FinalExperimentPlan;
  workflow?: Workflow;
  setup_warnings?: string[];
  generation_mode?: "openai" | "fallback" | "partial";
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  researching: "Researching",
  "research-ready": "Research ready",
  generating: "Generating",
  ready: "Ready",
};

/**
 * Compact, locale-light relative time formatting (e.g. "3 h ago", "2 d ago").
 * Stays under 6 characters so it fits in card metadata rows.
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs)) return "—";
  const diffMin = Math.round(diffMs / (60 * 1000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) return `${diffDay} d ago`;
  const diffWk = Math.round(diffDay / 7);
  if (diffWk < 8) return `${diffWk} w ago`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo} mo ago`;
}
