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
}

export interface WorkflowNode {
  id: string;
  /** Pixel-space coordinate the frontend hands directly to React Flow. */
  position: { x: number; y: number };
  data: {
    title: string;
    schedule?: string;
    detail?: string;
    status: "done" | "active" | "upcoming";
    icon: string;
    description?: string;
    effort?: string;
    deliverables?: string[];
    checklist?: string[];
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
  /** Populated once `ready`. */
  workflow?: Workflow;
}
