import { getPool } from "./db.js";
import type { LessonCard, PlanChangeEvent, PlanVersion } from "./projectTypes.js";

export interface LessonFilters {
  domain?: string;
  experiment_type?: string;
  step_type?: string;
  lab_id?: string;
  status?: LessonCard["status"];
}

export interface LearningRepo {
  savePlanVersion(version: PlanVersion): Promise<PlanVersion>;
  getLatestPlanVersion(planId: string): Promise<PlanVersion | null>;
  listPlanVersions(planId: string): Promise<PlanVersion[]>;
  appendPlanChangeEvent(event: PlanChangeEvent): Promise<PlanChangeEvent>;
  listPlanChangeEvents(planId: string): Promise<PlanChangeEvent[]>;
  saveLessonCard(card: LessonCard): Promise<LessonCard>;
  listLessonCards(filters?: LessonFilters): Promise<LessonCard[]>;
}

class MemoryLearningRepo implements LearningRepo {
  private readonly versions = new Map<string, PlanVersion[]>();
  private readonly events = new Map<string, PlanChangeEvent[]>();
  private readonly lessons = new Map<string, LessonCard>();

  async savePlanVersion(version: PlanVersion): Promise<PlanVersion> {
    const versions = this.versions.get(version.plan_id) ?? [];
    if (versions.some((item) => item.version_id === version.version_id)) {
      throw new Error(`Plan version already exists: ${version.version_id}`);
    }
    this.versions.set(version.plan_id, [...versions, version]);
    return version;
  }

  async getLatestPlanVersion(planId: string): Promise<PlanVersion | null> {
    const versions = this.versions.get(planId) ?? [];
    return [...versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;
  }

  async listPlanVersions(planId: string): Promise<PlanVersion[]> {
    return [...(this.versions.get(planId) ?? [])].sort(
      (a, b) => a.version_number - b.version_number,
    );
  }

  async appendPlanChangeEvent(event: PlanChangeEvent): Promise<PlanChangeEvent> {
    const events = this.events.get(event.plan_id) ?? [];
    if (events.some((item) => item.change_event_id === event.change_event_id)) {
      throw new Error(`Plan change event already exists: ${event.change_event_id}`);
    }
    this.events.set(event.plan_id, [...events, event]);
    return event;
  }

  async listPlanChangeEvents(planId: string): Promise<PlanChangeEvent[]> {
    return [...(this.events.get(planId) ?? [])].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );
  }

  async saveLessonCard(card: LessonCard): Promise<LessonCard> {
    if (this.lessons.has(card.lesson_id)) {
      throw new Error(`Lesson card already exists: ${card.lesson_id}`);
    }
    this.lessons.set(card.lesson_id, card);
    return card;
  }

  async listLessonCards(filters: LessonFilters = {}): Promise<LessonCard[]> {
    return [...this.lessons.values()]
      .filter((card) => matchesLessonFilters(card, filters))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
}

interface PlanVersionRow {
  version_id: string;
  plan_id: string;
  version_number: number;
  version_type: PlanVersion["version_type"];
  created_at: Date;
  created_by: PlanVersion["created_by"];
  graph_snapshot: PlanVersion["graph_snapshot"];
  stats_report_snapshot: PlanVersion["stats_report_snapshot"];
  parent_version_id: string | null;
  change_event_ids: string[];
}

interface PlanChangeEventRow extends Omit<PlanChangeEvent, "timestamp"> {
  timestamp: Date;
}

interface LessonCardRow extends Omit<LessonCard, "created_at" | "updated_at"> {
  created_at: Date;
  updated_at: Date;
}

function rowToPlanVersion(row: PlanVersionRow): PlanVersion {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
  };
}

function rowToPlanChangeEvent(row: PlanChangeEventRow): PlanChangeEvent {
  return {
    ...row,
    timestamp: row.timestamp.toISOString(),
    confidence: Number(row.confidence),
  };
}

function rowToLessonCard(row: LessonCardRow): LessonCard {
  return {
    ...row,
    confidence: Number(row.confidence),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function matchesLessonFilters(card: LessonCard, filters: LessonFilters): boolean {
  if (filters.status && card.status !== filters.status) return false;
  if (filters.domain && card.domain !== filters.domain) return false;
  if (filters.experiment_type && card.experiment_type !== filters.experiment_type) {
    return false;
  }
  if (filters.step_type && card.step_type !== filters.step_type) return false;
  if (
    filters.lab_id &&
    card.applicability_conditions.lab_id !== filters.lab_id
  ) {
    return false;
  }
  return true;
}

class PostgresLearningRepo implements LearningRepo {
  async savePlanVersion(version: PlanVersion): Promise<PlanVersion> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    await pool.query(
      `INSERT INTO plan_versions (
         version_id, plan_id, version_number, version_type, created_at,
         created_by, graph_snapshot, stats_report_snapshot, parent_version_id,
         change_event_ids
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)`,
      [
        version.version_id,
        version.plan_id,
        version.version_number,
        version.version_type,
        version.created_at,
        version.created_by,
        JSON.stringify(version.graph_snapshot),
        JSON.stringify(version.stats_report_snapshot),
        version.parent_version_id,
        JSON.stringify(version.change_event_ids),
      ],
    );
    return version;
  }

  async getLatestPlanVersion(planId: string): Promise<PlanVersion | null> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    const result = await pool.query<PlanVersionRow>(
      `SELECT version_id, plan_id, version_number, version_type, created_at,
              created_by, graph_snapshot, stats_report_snapshot,
              parent_version_id, change_event_ids
         FROM plan_versions
        WHERE plan_id = $1
        ORDER BY version_number DESC
        LIMIT 1`,
      [planId],
    );
    return result.rows[0] ? rowToPlanVersion(result.rows[0]) : null;
  }

  async listPlanVersions(planId: string): Promise<PlanVersion[]> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    const result = await pool.query<PlanVersionRow>(
      `SELECT version_id, plan_id, version_number, version_type, created_at,
              created_by, graph_snapshot, stats_report_snapshot,
              parent_version_id, change_event_ids
         FROM plan_versions
        WHERE plan_id = $1
        ORDER BY version_number ASC`,
      [planId],
    );
    return result.rows.map(rowToPlanVersion);
  }

  async appendPlanChangeEvent(event: PlanChangeEvent): Promise<PlanChangeEvent> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    await pool.query(
      `INSERT INTO plan_change_events (
         change_event_id, plan_id, plan_version_id_before,
         plan_version_id_after, user_id, timestamp, change_source, change_type,
         target_type, target_id, field_changed, old_value, new_value,
         raw_user_comment, structured_reason, confidence, should_create_lesson,
         lesson_status, metadata
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
         $14, $15, $16, $17, $18, $19::jsonb
       )`,
      [
        event.change_event_id,
        event.plan_id,
        event.plan_version_id_before,
        event.plan_version_id_after,
        event.user_id,
        event.timestamp,
        event.change_source,
        event.change_type,
        event.target_type,
        event.target_id,
        event.field_changed,
        JSON.stringify(event.old_value),
        JSON.stringify(event.new_value),
        event.raw_user_comment,
        event.structured_reason,
        event.confidence,
        event.should_create_lesson,
        event.lesson_status,
        JSON.stringify(event.metadata),
      ],
    );
    return event;
  }

  async listPlanChangeEvents(planId: string): Promise<PlanChangeEvent[]> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    const result = await pool.query<PlanChangeEventRow>(
      `SELECT change_event_id, plan_id, plan_version_id_before,
              plan_version_id_after, user_id, timestamp, change_source,
              change_type, target_type, target_id, field_changed, old_value,
              new_value, raw_user_comment, structured_reason, confidence,
              should_create_lesson, lesson_status, metadata
         FROM plan_change_events
        WHERE plan_id = $1
        ORDER BY timestamp ASC`,
      [planId],
    );
    return result.rows.map(rowToPlanChangeEvent);
  }

  async saveLessonCard(card: LessonCard): Promise<LessonCard> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    await pool.query(
      `INSERT INTO lesson_cards (
         lesson_id, source_change_event_ids, source_plan_id, source_node_ids,
         lesson_type, lesson_title, lesson_summary, domain, experiment_type,
         step_type, applicability_conditions, original_agent_assumption,
         scientist_correction, recommended_future_adjustment, affected_fields,
         confidence, scope, status, created_at, updated_at, created_by,
         related_citations, embedding_text
       )
       VALUES (
         $1, $2::jsonb, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11::jsonb,
         $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20, $21,
         $22::jsonb, $23
       )`,
      [
        card.lesson_id,
        JSON.stringify(card.source_change_event_ids),
        card.source_plan_id,
        JSON.stringify(card.source_node_ids),
        card.lesson_type,
        card.lesson_title,
        card.lesson_summary,
        card.domain,
        card.experiment_type,
        card.step_type,
        JSON.stringify(card.applicability_conditions),
        card.original_agent_assumption,
        card.scientist_correction,
        card.recommended_future_adjustment,
        JSON.stringify(card.affected_fields),
        card.confidence,
        card.scope,
        card.status,
        card.created_at,
        card.updated_at,
        card.created_by,
        JSON.stringify(card.related_citations),
        card.embedding_text,
      ],
    );
    return card;
  }

  async listLessonCards(filters: LessonFilters = {}): Promise<LessonCard[]> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresLearningRepo used without a pool");
    const clauses: string[] = [];
    const values: string[] = [];
    const addClause = (sql: string, value: string): void => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };

    if (filters.status) addClause("status = ?", filters.status);
    if (filters.domain) addClause("domain = ?", filters.domain);
    if (filters.experiment_type) {
      addClause("experiment_type = ?", filters.experiment_type);
    }
    if (filters.step_type) addClause("step_type = ?", filters.step_type);
    if (filters.lab_id) {
      addClause("applicability_conditions->>'lab_id' = ?", filters.lab_id);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await pool.query<LessonCardRow>(
      `SELECT lesson_id, source_change_event_ids, source_plan_id,
              source_node_ids, lesson_type, lesson_title, lesson_summary,
              domain, experiment_type, step_type, applicability_conditions,
              original_agent_assumption, scientist_correction,
              recommended_future_adjustment, affected_fields, confidence,
              scope, status, created_at, updated_at, created_by,
              related_citations, embedding_text
         FROM lesson_cards
         ${where}
        ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map(rowToLessonCard);
  }
}

let singleton: LearningRepo | null = null;

export function createMemoryLearningRepo(): LearningRepo {
  return new MemoryLearningRepo();
}

export function getLearningRepo(): LearningRepo {
  if (singleton) return singleton;
  singleton = getPool() ? new PostgresLearningRepo() : new MemoryLearningRepo();
  return singleton;
}
