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
  /** Populated once `ready`. */
  workflow?: Workflow;
}
