import pg from "pg";

import { env } from "../env.js";

const { Pool } = pg;

/**
 * Postgres connection pool, lazily constructed.
 *
 * `null` when no DATABASE_URL is configured — callers must handle the
 * fallback path. We keep the pool as a module singleton so transient repo
 * lookups don't churn TCP sockets.
 */
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (pool) return pool;
  if (!env.databaseUrl) return null;
  pool = new Pool({ connectionString: env.databaseUrl });
  pool.on("error", (err) => {
    console.error("[labpilot] postgres pool error", err);
  });
  return pool;
}

/**
 * Idempotent schema bootstrap. Runs on backend boot when DATABASE_URL is set;
 * safe against existing databases (Supabase included). Keep this in plain SQL
 * so it can be eyeballed and copy-pasted into a Supabase migration later.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projects (
    id           text        PRIMARY KEY,
    hypothesis   text        NOT NULL,
    title        text        NOT NULL,
    status       text        NOT NULL,
    papers       jsonb,
    pre_plan     jsonb,
    workflow     jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS pre_plan jsonb;

  CREATE INDEX IF NOT EXISTS projects_updated_at_idx
    ON projects (updated_at DESC);
`;

export async function ensureSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(SCHEMA_SQL);
}
