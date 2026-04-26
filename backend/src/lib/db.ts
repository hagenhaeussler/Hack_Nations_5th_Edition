import pg from "pg";

import { env } from "../env.js";
import { getMissingServiceMessage } from "./config.js";

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
    description  text        NOT NULL DEFAULT '',
    status       text        NOT NULL,
    papers       jsonb,
    pre_plan     jsonb,
    final_plan   jsonb,
    workflow     jsonb,
    setup_warnings jsonb      NOT NULL DEFAULT '[]'::jsonb,
    generation_mode text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS pre_plan jsonb;

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS final_plan jsonb;

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS final_plan jsonb;

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS setup_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

  ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS generation_mode text;

  CREATE INDEX IF NOT EXISTS projects_updated_at_idx
    ON projects (updated_at DESC);

  CREATE TABLE IF NOT EXISTS plan_versions (
    version_id             text        PRIMARY KEY,
    plan_id                text        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number         integer     NOT NULL,
    version_type           text        NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             text        NOT NULL,
    graph_snapshot         jsonb       NOT NULL,
    stats_report_snapshot  jsonb,
    parent_version_id      text,
    change_event_ids       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE (plan_id, version_number)
  );

  CREATE INDEX IF NOT EXISTS plan_versions_plan_id_idx
    ON plan_versions (plan_id, version_number DESC);

  CREATE TABLE IF NOT EXISTS plan_change_events (
    change_event_id        text        PRIMARY KEY,
    plan_id                text        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_version_id_before text        NOT NULL,
    plan_version_id_after  text        NOT NULL,
    user_id                text,
    timestamp              timestamptz NOT NULL,
    change_source          text        NOT NULL,
    change_type            text        NOT NULL,
    target_type            text        NOT NULL,
    target_id              text        NOT NULL,
    field_changed          text        NOT NULL,
    old_value              jsonb,
    new_value              jsonb,
    raw_user_comment       text,
    structured_reason      text,
    confidence             numeric     NOT NULL,
    should_create_lesson   boolean     NOT NULL,
    lesson_status          text        NOT NULL,
    metadata               jsonb       NOT NULL DEFAULT '{}'::jsonb
  );

  CREATE INDEX IF NOT EXISTS plan_change_events_plan_id_idx
    ON plan_change_events (plan_id, timestamp DESC);

  CREATE TABLE IF NOT EXISTS lesson_cards (
    lesson_id                     text        PRIMARY KEY,
    source_change_event_ids       jsonb       NOT NULL,
    source_plan_id                text        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_node_ids               jsonb       NOT NULL,
    lesson_type                   text        NOT NULL,
    lesson_title                  text        NOT NULL,
    lesson_summary                text        NOT NULL,
    domain                        text,
    experiment_type               text,
    step_type                     text,
    applicability_conditions      jsonb       NOT NULL,
    original_agent_assumption     text        NOT NULL,
    scientist_correction          text        NOT NULL,
    recommended_future_adjustment text        NOT NULL,
    affected_fields               jsonb       NOT NULL,
    confidence                    numeric     NOT NULL,
    scope                         text        NOT NULL,
    status                        text        NOT NULL,
    created_at                    timestamptz NOT NULL,
    updated_at                    timestamptz NOT NULL,
    created_by                    text        NOT NULL,
    related_citations             jsonb       NOT NULL,
    embedding_text                text        NOT NULL
  );

  CREATE INDEX IF NOT EXISTS lesson_cards_relevance_idx
    ON lesson_cards (status, domain, experiment_type, step_type);
`;

export async function ensureSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(SCHEMA_SQL);
}

export function getDatabaseWarnings(): string[] {
  return getPool() ? [] : [getMissingServiceMessage("database")];
}
