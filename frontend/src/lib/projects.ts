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

export interface Project {
  id: string;
  hypothesis: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  papers?: Paper[];
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
