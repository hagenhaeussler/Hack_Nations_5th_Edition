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

export interface Project {
  id: string;
  hypothesis: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  papers?: Paper[];
  prePlan?: PrePlan;
  workflow?: Workflow;
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
