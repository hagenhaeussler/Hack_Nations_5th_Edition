import { randomUUID } from "node:crypto";

import { getPool } from "./db.js";
import type {
  Paper,
  Project,
  ProjectStatus,
  Workflow,
} from "./projectTypes.js";

/**
 * Storage-agnostic repository for projects.
 *
 * Two implementations are provided:
 *   - `PostgresProjectsRepo`: backed by the `projects` table created by
 *     `ensureSchema()`. Used when DATABASE_URL is configured.
 *   - `MemoryProjectsRepo`: an ephemeral in-process Map. Used as a graceful
 *     fallback so the dev server still works without a database — useful
 *     in early MVP iterations and CI smoke tests.
 *
 * Both implementations preserve the same insertion order semantics
 * (most-recently-updated first on `list`).
 */
export interface ProjectsRepo {
  create(input: { hypothesis: string; title: string }): Promise<Project>;
  attachPapers(id: string, papers: Paper[]): Promise<Project | null>;
  attachWorkflow(id: string, workflow: Workflow): Promise<Project | null>;
  setStatus(id: string, status: ProjectStatus): Promise<Project | null>;
  get(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

class MemoryProjectsRepo implements ProjectsRepo {
  private readonly store = new Map<string, Project>();

  async create({ hypothesis, title }: {
    hypothesis: string;
    title: string;
  }): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      hypothesis,
      title,
      status: "researching",
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(project.id, project);
    return project;
  }

  async attachPapers(id: string, papers: Paper[]): Promise<Project | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const next: Project = {
      ...existing,
      papers,
      status: "research-ready",
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, next);
    return next;
  }

  async attachWorkflow(
    id: string,
    workflow: Workflow,
  ): Promise<Project | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const next: Project = {
      ...existing,
      workflow,
      status: "ready",
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, next);
    return next;
  }

  async setStatus(
    id: string,
    status: ProjectStatus,
  ): Promise<Project | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const next: Project = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, next);
    return next;
  }

  async get(id: string): Promise<Project | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<Project[]> {
    return [...this.store.values()].sort((a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }
}

// ---------------------------------------------------------------------------
// Postgres implementation
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  hypothesis: string;
  title: string;
  status: ProjectStatus;
  papers: Paper[] | null;
  workflow: Workflow | null;
  created_at: Date;
  updated_at: Date;
}

function rowToProject(row: ProjectRow): Project {
  const project: Project = {
    id: row.id,
    hypothesis: row.hypothesis,
    title: row.title,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
  if (row.papers) project.papers = row.papers;
  if (row.workflow) project.workflow = row.workflow;
  return project;
}

class PostgresProjectsRepo implements ProjectsRepo {
  async create({ hypothesis, title }: {
    hypothesis: string;
    title: string;
  }): Promise<Project> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresProjectsRepo used without a pool");
    const id = randomUUID();
    const result = await pool.query<ProjectRow>(
      `INSERT INTO projects (id, hypothesis, title, status)
       VALUES ($1, $2, $3, 'researching')
       RETURNING id, hypothesis, title, status, papers, workflow,
                 created_at, updated_at`,
      [id, hypothesis, title],
    );
    return rowToProject(result.rows[0]!);
  }

  async attachPapers(id: string, papers: Paper[]): Promise<Project | null> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresProjectsRepo used without a pool");
    const result = await pool.query<ProjectRow>(
      `UPDATE projects
          SET papers     = $2::jsonb,
              status     = 'research-ready',
              updated_at = now()
        WHERE id = $1
        RETURNING id, hypothesis, title, status, papers, workflow,
                  created_at, updated_at`,
      [id, JSON.stringify(papers)],
    );
    return result.rows[0] ? rowToProject(result.rows[0]) : null;
  }

  async attachWorkflow(
    id: string,
    workflow: Workflow,
  ): Promise<Project | null> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresProjectsRepo used without a pool");
    const result = await pool.query<ProjectRow>(
      `UPDATE projects
          SET workflow   = $2::jsonb,
              status     = 'ready',
              updated_at = now()
        WHERE id = $1
        RETURNING id, hypothesis, title, status, papers, workflow,
                  created_at, updated_at`,
      [id, JSON.stringify(workflow)],
    );
    return result.rows[0] ? rowToProject(result.rows[0]) : null;
  }

  async setStatus(
    id: string,
    status: ProjectStatus,
  ): Promise<Project | null> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresProjectsRepo used without a pool");
    const result = await pool.query<ProjectRow>(
      `UPDATE projects
          SET status     = $2,
              updated_at = now()
        WHERE id = $1
        RETURNING id, hypothesis, title, status, papers, workflow,
                  created_at, updated_at`,
      [id, status],
    );
    return result.rows[0] ? rowToProject(result.rows[0]) : null;
  }

  async get(id: string): Promise<Project | null> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresProjectsRepo used without a pool");
    const result = await pool.query<ProjectRow>(
      `SELECT id, hypothesis, title, status, papers, workflow,
              created_at, updated_at
         FROM projects
        WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? rowToProject(result.rows[0]) : null;
  }

  async list(): Promise<Project[]> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresProjectsRepo used without a pool");
    const result = await pool.query<ProjectRow>(
      `SELECT id, hypothesis, title, status, papers, workflow,
              created_at, updated_at
         FROM projects
        ORDER BY updated_at DESC`,
    );
    return result.rows.map(rowToProject);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let singleton: ProjectsRepo | null = null;

export function getProjectsRepo(): ProjectsRepo {
  if (singleton) return singleton;
  singleton = getPool() ? new PostgresProjectsRepo() : new MemoryProjectsRepo();
  return singleton;
}
