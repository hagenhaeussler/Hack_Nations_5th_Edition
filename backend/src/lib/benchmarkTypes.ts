export const BENCHMARK_SCORE_KEYS = [
  "timing_estimate_accuracy",
  "sequential_scheduling_logic",
  "procedure_correctness",
  "budget_estimate_accuracy",
  "equipment_personnel_accuracy",
  "citation_quality",
  "validation_criteria_quality",
] as const;

export type BenchmarkScoreKey = (typeof BENCHMARK_SCORE_KEYS)[number];

export type BenchmarkScores = Record<BenchmarkScoreKey, number>;

export interface StructuredBenchmarkInsight {
  summary: string;
  positive_feedback: string[];
  negative_feedback: string[];
  recommended_creator_agent_adjustments: string[];
  category_tags: string[];
  applies_to: string;
  confidence: number;
}

export interface BenchmarkEvaluation {
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
  overall_score: number;
  scores: BenchmarkScores;
  written_feedback: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BenchmarkInsight {
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
  confidence: number | null;
  created_at: string;
}

export interface BenchmarkSummary {
  total_evaluations: number;
  average_score: number | null;
  latest_score: number | null;
  first_score: number | null;
  improvement: number | null;
  best_category: BenchmarkScoreKey | null;
  weakest_category: BenchmarkScoreKey | null;
  category_averages: BenchmarkScores | null;
}

export interface SubmitBenchmarkEvaluationInput {
  project_id?: string | null;
  plan_id: string;
  scores: BenchmarkScores;
  written_feedback?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkEvaluationContext {
  project_id: string | null;
  plan_id: string | null;
  project_title: string;
  plan_title: string;
  hypothesis: string;
  domain: string | null;
  experiment_type: string | null;
  generation_mode: string | null;
  model_name: string | null;
}

export interface RelevantBenchmarkInsightsQuery {
  domain?: string | null;
  experiment_type?: string | null;
  project_id?: string | null;
  query?: string | null;
  limit?: number;
}
