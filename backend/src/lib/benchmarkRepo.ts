import { randomUUID } from "node:crypto";

import { getMissingServiceMessage } from "./config.js";
import { getPool } from "./db.js";
import { createEmbeddingOrNull } from "./openaiClient.js";
import {
  BENCHMARK_SCORE_KEYS,
  type BenchmarkEvaluation,
  type BenchmarkEvaluationContext,
  type BenchmarkInsight,
  type BenchmarkScores,
  type BenchmarkScoreKey,
  type BenchmarkSummary,
  type RelevantBenchmarkInsightsQuery,
  type StructuredBenchmarkInsight,
} from "./benchmarkTypes.js";

export class BenchmarkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkValidationError";
  }
}

export interface SaveBenchmarkEvaluationInput {
  context: BenchmarkEvaluationContext;
  scores: BenchmarkScores;
  written_feedback?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SaveBenchmarkEvaluationResult {
  evaluation: BenchmarkEvaluation;
  insight: BenchmarkInsight | null;
  warnings: string[];
}

export interface BenchmarkRepo {
  saveEvaluation(input: SaveBenchmarkEvaluationInput): Promise<SaveBenchmarkEvaluationResult>;
  listEvaluations(): Promise<BenchmarkEvaluation[]>;
  getEvaluation(id: string): Promise<BenchmarkEvaluation | null>;
  getSummary(): Promise<BenchmarkSummary>;
  getRelevantInsights(query: RelevantBenchmarkInsightsQuery): Promise<BenchmarkInsight[]>;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function validateBenchmarkScores(value: unknown): BenchmarkScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BenchmarkValidationError("Benchmark scores are required.");
  }
  const record = value as Record<string, unknown>;
  const scores = {} as BenchmarkScores;
  for (const key of BENCHMARK_SCORE_KEYS) {
    const raw = record[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new BenchmarkValidationError(`Score "${key}" must be a number between 0 and 100.`);
    }
    if (raw < 0 || raw > 100) {
      throw new BenchmarkValidationError(`Score "${key}" must be between 0 and 100.`);
    }
    scores[key] = raw;
  }
  return scores;
}

export function calculateOverallScore(scores: BenchmarkScores): number {
  const total = BENCHMARK_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0);
  return roundOne(total / BENCHMARK_SCORE_KEYS.length);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function categoryAverages(evaluations: BenchmarkEvaluation[]): BenchmarkScores | null {
  if (evaluations.length === 0) return null;
  const result = {} as BenchmarkScores;
  for (const key of BENCHMARK_SCORE_KEYS) {
    result[key] = average(evaluations.map((evaluation) => evaluation.scores[key])) ?? 0;
  }
  return result;
}

function summaryFromEvaluations(evaluations: BenchmarkEvaluation[]): BenchmarkSummary {
  const ordered = [...evaluations].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  );
  const first = ordered[0]?.overall_score ?? null;
  const latest = ordered.at(-1)?.overall_score ?? null;
  const averages = categoryAverages(ordered);
  const categoryEntries = averages
    ? BENCHMARK_SCORE_KEYS.map((key) => [key, averages[key]] as const)
    : [];
  const best = categoryEntries.length
    ? categoryEntries.reduce((winner, current) => (current[1] > winner[1] ? current : winner))[0]
    : null;
  const weakest = categoryEntries.length
    ? categoryEntries.reduce((winner, current) => (current[1] < winner[1] ? current : winner))[0]
    : null;
  return {
    total_evaluations: ordered.length,
    average_score: average(ordered.map((evaluation) => evaluation.overall_score)),
    latest_score: latest,
    first_score: first,
    improvement: first !== null && latest !== null ? roundOne(latest - first) : null,
    best_category: best,
    weakest_category: weakest,
    category_averages: averages,
  };
}

function trimFeedback(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed.slice(0, 5000) : null;
}

function tagsFromFeedback(feedback: string, scores: BenchmarkScores): string[] {
  const text = feedback.toLowerCase();
  const tags = new Set<string>();
  if (/budget|cost|price|reagent/.test(text)) tags.add("budget");
  if (/time|duration|longer|shorter|estimate/.test(text)) tags.add("timing");
  if (/equipment|microscope|material|personnel|people|staff/.test(text)) tags.add("resources");
  if (/citation|paper|source|literature/.test(text)) tags.add("citations");
  if (/validation|criteria|success|checkpoint/.test(text)) tags.add("validation");
  if (/order|sequence|schedule|calendar|procurement/.test(text)) tags.add("scheduling");
  if (/procedure|method|protocol|scientific/.test(text)) tags.add("procedure");
  for (const key of BENCHMARK_SCORE_KEYS) {
    if (scores[key] < 70) tags.add(tagForScoreKey(key));
  }
  return [...tags];
}

function tagForScoreKey(key: BenchmarkScoreKey): string {
  switch (key) {
    case "timing_estimate_accuracy":
      return "timing";
    case "sequential_scheduling_logic":
      return "scheduling";
    case "procedure_correctness":
      return "procedure";
    case "budget_estimate_accuracy":
      return "budget";
    case "equipment_personnel_accuracy":
      return "resources";
    case "citation_quality":
      return "citations";
    case "validation_criteria_quality":
      return "validation";
  }
}

function weakestScoreKeys(scores: BenchmarkScores): BenchmarkScoreKey[] {
  const min = Math.min(...BENCHMARK_SCORE_KEYS.map((key) => scores[key]));
  return BENCHMARK_SCORE_KEYS.filter((key) => scores[key] === min);
}

function buildStructuredInsight(
  feedback: string,
  scores: BenchmarkScores,
): StructuredBenchmarkInsight {
  const tags = tagsFromFeedback(feedback, scores);
  const weakCategories = weakestScoreKeys(scores).map(tagForScoreKey);
  const adjustments = [...new Set([...tags, ...weakCategories])].map((tag) => {
    switch (tag) {
      case "budget":
        return "Make budget uncertainty explicit and check material or reagent costs before presenting estimates.";
      case "timing":
        return "Use conservative duration estimates and call out low-confidence timing assumptions.";
      case "resources":
        return "Confirm equipment, materials, and personnel requirements for each scheduled task.";
      case "citations":
        return "Use more specific, trustworthy literature support and mark demo sources clearly.";
      case "validation":
        return "Include measurable success criteria and validation checkpoints for scheduled tasks.";
      case "scheduling":
        return "Place procurement, preparation, and setup tasks before dependent experimental work.";
      case "procedure":
        return "Increase procedure detail and distinguish executable steps from assumptions.";
      default:
        return "Apply researcher benchmark feedback conservatively when relevant to the current experiment.";
    }
  });
  return {
    summary: feedback.slice(0, 500),
    positive_feedback: /strong|useful|good|helpful|accurate/.test(feedback.toLowerCase())
      ? [feedback.slice(0, 240)]
      : [],
    negative_feedback: /wrong|missing|low|unrealistic|too|weak|bad/.test(feedback.toLowerCase())
      ? [feedback.slice(0, 240)]
      : [],
    recommended_creator_agent_adjustments: adjustments,
    category_tags: tags,
    applies_to: "future similar calendar-based experiment plans",
    confidence: feedback.trim().length > 20 ? 0.75 : 0.45,
  };
}

async function makeInsight(
  evaluation: BenchmarkEvaluation,
): Promise<{ insight: BenchmarkInsight | null; warnings: string[] }> {
  const feedback = trimFeedback(evaluation.written_feedback);
  if (!feedback) return { insight: null, warnings: [] };
  const structured = buildStructuredInsight(feedback, evaluation.scores);
  const embedding = await createEmbeddingOrNull(
    `${evaluation.domain ?? ""} ${evaluation.experiment_type ?? ""} ${feedback}`,
  );
  return {
    insight: {
      id: randomUUID(),
      evaluation_id: evaluation.id,
      project_id: evaluation.project_id,
      plan_id: evaluation.plan_id,
      domain: evaluation.domain,
      experiment_type: evaluation.experiment_type,
      insight_text: feedback,
      structured_insight: structured,
      category_tags: structured.category_tags,
      applies_to: structured.applies_to,
      confidence: structured.confidence,
      created_at: evaluation.created_at,
    },
    warnings: embedding.warnings,
  };
}

function matchesInsight(insight: BenchmarkInsight, query: RelevantBenchmarkInsightsQuery): number {
  let score = 0;
  if (query.domain && insight.domain?.toLowerCase() === query.domain.toLowerCase()) score += 4;
  if (
    query.experiment_type &&
    insight.experiment_type?.toLowerCase() === query.experiment_type.toLowerCase()
  ) {
    score += 4;
  }
  if (query.project_id && insight.project_id === query.project_id) score += 2;
  const terms = (query.query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 3);
  for (const term of terms) {
    if (insight.insight_text.toLowerCase().includes(term)) score += 1;
  }
  return score;
}

class MemoryBenchmarkRepo implements BenchmarkRepo {
  private readonly evaluations: BenchmarkEvaluation[] = [];
  private readonly insights: BenchmarkInsight[] = [];

  async saveEvaluation(input: SaveBenchmarkEvaluationInput): Promise<SaveBenchmarkEvaluationResult> {
    const scores = validateBenchmarkScores(input.scores);
    const now = new Date().toISOString();
    const evaluation: BenchmarkEvaluation = {
      id: randomUUID(),
      trial_id: `trial_${String(this.evaluations.length + 1).padStart(3, "0")}`,
      project_id: input.context.project_id,
      plan_id: input.context.plan_id,
      project_title: input.context.project_title,
      plan_title: input.context.plan_title,
      hypothesis: input.context.hypothesis,
      domain: input.context.domain,
      experiment_type: input.context.experiment_type,
      generation_mode: input.context.generation_mode,
      model_name: input.context.model_name,
      overall_score: calculateOverallScore(scores),
      scores,
      written_feedback: trimFeedback(input.written_feedback),
      metadata: input.metadata ?? {},
      created_at: now,
    };
    const insightResult = await makeInsight(evaluation);
    this.evaluations.push(evaluation);
    if (insightResult.insight) this.insights.push(insightResult.insight);
    return {
      evaluation,
      insight: insightResult.insight,
      warnings: [
        getMissingServiceMessage("database").replace(
          "Using in-memory fallback.",
          "Benchmark evaluation saved in memory only and will reset on server restart.",
        ),
        ...insightResult.warnings,
      ],
    };
  }

  async listEvaluations(): Promise<BenchmarkEvaluation[]> {
    return [...this.evaluations].sort(
      (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
    );
  }

  async getEvaluation(id: string): Promise<BenchmarkEvaluation | null> {
    return this.evaluations.find((evaluation) => evaluation.id === id) ?? null;
  }

  async getSummary(): Promise<BenchmarkSummary> {
    return summaryFromEvaluations(await this.listEvaluations());
  }

  async getRelevantInsights(query: RelevantBenchmarkInsightsQuery): Promise<BenchmarkInsight[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 10, 50));
    return [...this.insights]
      .map((insight) => ({ insight, score: matchesInsight(insight, query) }))
      .sort((left, right) => right.score - left.score || Date.parse(right.insight.created_at) - Date.parse(left.insight.created_at))
      .slice(0, limit)
      .map((item) => item.insight);
  }
}

interface EvaluationRow {
  id: string;
  trial_id: string;
  project_id: string | null;
  plan_id: string | null;
  project_title: string;
  plan_title: string;
  hypothesis: string;
  domain: string | null;
  experiment_type: string | null;
  generation_mode: string | null;
  model_name: string | null;
  overall_score: string | number;
  scores_json: BenchmarkScores;
  written_feedback: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

interface InsightRow {
  id: string;
  evaluation_id: string;
  project_id: string | null;
  plan_id: string | null;
  domain: string | null;
  experiment_type: string | null;
  insight_text: string;
  structured_insight: StructuredBenchmarkInsight;
  category_tags: string[];
  applies_to: string | null;
  confidence: string | number | null;
  created_at: Date;
}

function rowToEvaluation(row: EvaluationRow): BenchmarkEvaluation {
  return {
    id: row.id,
    trial_id: row.trial_id,
    project_id: row.project_id,
    plan_id: row.plan_id,
    project_title: row.project_title,
    plan_title: row.plan_title,
    hypothesis: row.hypothesis,
    domain: row.domain,
    experiment_type: row.experiment_type,
    generation_mode: row.generation_mode,
    model_name: row.model_name,
    overall_score: Number(row.overall_score),
    scores: row.scores_json,
    written_feedback: row.written_feedback,
    metadata: row.metadata,
    created_at: row.created_at.toISOString(),
  };
}

function rowToInsight(row: InsightRow): BenchmarkInsight {
  return {
    id: row.id,
    evaluation_id: row.evaluation_id,
    project_id: row.project_id,
    plan_id: row.plan_id,
    domain: row.domain,
    experiment_type: row.experiment_type,
    insight_text: row.insight_text,
    structured_insight: row.structured_insight,
    category_tags: row.category_tags,
    applies_to: row.applies_to,
    confidence: row.confidence === null ? null : Number(row.confidence),
    created_at: row.created_at.toISOString(),
  };
}

class PostgresBenchmarkRepo implements BenchmarkRepo {
  async saveEvaluation(input: SaveBenchmarkEvaluationInput): Promise<SaveBenchmarkEvaluationResult> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresBenchmarkRepo used without a pool");
    const scores = validateBenchmarkScores(input.scores);
    const id = randomUUID();
    const totalResult = await pool.query<{ count: string }>("SELECT count(*) FROM benchmark_evaluations");
    const trialId = `trial_${String(Number(totalResult.rows[0]?.count ?? 0) + 1).padStart(3, "0")}`;
    const evaluationResult = await pool.query<EvaluationRow>(
      `INSERT INTO benchmark_evaluations (
          id, trial_id, project_id, plan_id, project_title, plan_title, hypothesis,
          domain, experiment_type, generation_mode, model_name, overall_score,
          timing_estimate_accuracy, sequential_scheduling_logic, procedure_correctness,
          budget_estimate_accuracy, equipment_personnel_accuracy, citation_quality,
          validation_criteria_quality, written_feedback, scores_json, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22::jsonb)
        RETURNING id, trial_id, project_id, plan_id, project_title, plan_title, hypothesis,
          domain, experiment_type, generation_mode, model_name, overall_score,
          scores_json, written_feedback, metadata, created_at`,
      [
        id,
        trialId,
        input.context.project_id,
        input.context.plan_id,
        input.context.project_title,
        input.context.plan_title,
        input.context.hypothesis,
        input.context.domain,
        input.context.experiment_type,
        input.context.generation_mode,
        input.context.model_name,
        calculateOverallScore(scores),
        scores.timing_estimate_accuracy,
        scores.sequential_scheduling_logic,
        scores.procedure_correctness,
        scores.budget_estimate_accuracy,
        scores.equipment_personnel_accuracy,
        scores.citation_quality,
        scores.validation_criteria_quality,
        trimFeedback(input.written_feedback),
        JSON.stringify(scores),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const evaluation = rowToEvaluation(evaluationResult.rows[0]!);
    const insightResult = await makeInsight(evaluation);
    if (insightResult.insight) {
      await pool.query(
        `INSERT INTO benchmark_insights (
          id, evaluation_id, project_id, plan_id, domain, experiment_type,
          insight_text, structured_insight, category_tags, applies_to, confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
        [
          insightResult.insight.id,
          insightResult.insight.evaluation_id,
          insightResult.insight.project_id,
          insightResult.insight.plan_id,
          insightResult.insight.domain,
          insightResult.insight.experiment_type,
          insightResult.insight.insight_text,
          JSON.stringify(insightResult.insight.structured_insight),
          JSON.stringify(insightResult.insight.category_tags),
          insightResult.insight.applies_to,
          insightResult.insight.confidence,
        ],
      );
    }
    return { evaluation, insight: insightResult.insight, warnings: insightResult.warnings };
  }

  async listEvaluations(): Promise<BenchmarkEvaluation[]> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresBenchmarkRepo used without a pool");
    const result = await pool.query<EvaluationRow>(
      `SELECT id, trial_id, project_id, plan_id, project_title, plan_title, hypothesis,
              domain, experiment_type, generation_mode, model_name, overall_score,
              scores_json, written_feedback, metadata, created_at
         FROM benchmark_evaluations
        ORDER BY created_at ASC`,
    );
    return result.rows.map(rowToEvaluation);
  }

  async getEvaluation(id: string): Promise<BenchmarkEvaluation | null> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresBenchmarkRepo used without a pool");
    const result = await pool.query<EvaluationRow>(
      `SELECT id, trial_id, project_id, plan_id, project_title, plan_title, hypothesis,
              domain, experiment_type, generation_mode, model_name, overall_score,
              scores_json, written_feedback, metadata, created_at
         FROM benchmark_evaluations
        WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? rowToEvaluation(result.rows[0]) : null;
  }

  async getSummary(): Promise<BenchmarkSummary> {
    return summaryFromEvaluations(await this.listEvaluations());
  }

  async getRelevantInsights(query: RelevantBenchmarkInsightsQuery): Promise<BenchmarkInsight[]> {
    const pool = getPool();
    if (!pool) throw new Error("PostgresBenchmarkRepo used without a pool");
    const result = await pool.query<InsightRow>(
      `SELECT id, evaluation_id, project_id, plan_id, domain, experiment_type,
              insight_text, structured_insight, category_tags, applies_to, confidence, created_at
         FROM benchmark_insights
        WHERE ($1::text IS NULL OR lower(coalesce(domain, '')) = lower($1::text))
          AND ($2::text IS NULL OR lower(coalesce(experiment_type, '')) = lower($2::text))
        ORDER BY created_at DESC
        LIMIT $3`,
      [query.domain ?? null, query.experiment_type ?? null, Math.max(1, Math.min(query.limit ?? 10, 50))],
    );
    return result.rows
      .map(rowToInsight)
      .map((insight) => ({ insight, score: matchesInsight(insight, query) }))
      .sort((left, right) => right.score - left.score || Date.parse(right.insight.created_at) - Date.parse(left.insight.created_at))
      .map((item) => item.insight);
  }
}

let singleton: BenchmarkRepo | null = null;

export function getBenchmarkRepo(): BenchmarkRepo {
  if (singleton) return singleton;
  singleton = getPool() ? new PostgresBenchmarkRepo() : new MemoryBenchmarkRepo();
  return singleton;
}
