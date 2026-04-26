import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkValidationError,
  calculateOverallScore,
  getBenchmarkRepo,
  validateBenchmarkScores,
} from "./benchmarkRepo.js";
import type { BenchmarkEvaluationContext, BenchmarkScores } from "./benchmarkTypes.js";

const scores: BenchmarkScores = {
  timing_estimate_accuracy: 80,
  sequential_scheduling_logic: 70,
  procedure_correctness: 90,
  budget_estimate_accuracy: 60,
  equipment_personnel_accuracy: 75,
  citation_quality: 65,
  validation_criteria_quality: 85,
};

const context: BenchmarkEvaluationContext = {
  project_id: "project_001",
  plan_id: "plan_001",
  project_title: "Benchmark project",
  plan_title: "Benchmark calendar plan",
  hypothesis: "Test whether buffer improves organoid assay signal.",
  domain: "biology",
  experiment_type: "cell_assay",
  generation_mode: "fallback",
  model_name: null,
};

test("calculates overall benchmark average", () => {
  assert.equal(calculateOverallScore(scores), 75);
});

test("rejects scores below 0 and above 100", () => {
  assert.throws(
    () => validateBenchmarkScores({ ...scores, budget_estimate_accuracy: -1 }),
    BenchmarkValidationError,
  );
  assert.throws(
    () => validateBenchmarkScores({ ...scores, budget_estimate_accuracy: 101 }),
    BenchmarkValidationError,
  );
});

test("saves written feedback as benchmark insight in fallback storage", async () => {
  const repo = getBenchmarkRepo();
  const result = await repo.saveEvaluation({
    context,
    scores,
    written_feedback:
      "The budget estimate was too low and material procurement should happen earlier in the schedule.",
    metadata: { source_view: "calendar_view" },
  });

  assert.equal(result.evaluation.overall_score, 75);
  assert.equal(result.evaluation.project_title, context.project_title);
  assert.ok(result.insight);
  assert.ok(result.insight?.category_tags.includes("budget"));
  assert.ok(result.insight?.category_tags.includes("scheduling"));
  assert.ok(result.warnings.some((warning) => /memory|embedding|database/i.test(warning)));
});

test("returns evaluations ordered by date and summary stats", async () => {
  const repo = getBenchmarkRepo();
  await repo.saveEvaluation({
    context: { ...context, plan_id: "plan_002" },
    scores: { ...scores, timing_estimate_accuracy: 100 },
    written_feedback: "Validation criteria were useful.",
  });

  const evaluations = await repo.listEvaluations();
  assert.ok(evaluations.length >= 2);
  assert.ok(Date.parse(evaluations[0]!.created_at) <= Date.parse(evaluations.at(-1)!.created_at));

  const summary = await repo.getSummary();
  assert.ok(summary.total_evaluations >= 2);
  assert.notEqual(summary.average_score, null);
  assert.notEqual(summary.best_category, null);
  assert.notEqual(summary.weakest_category, null);
});

test("retrieves relevant benchmark insights for Creator Agent context", async () => {
  const repo = getBenchmarkRepo();
  const insights = await repo.getRelevantInsights({
    domain: "biology",
    experiment_type: "cell_assay",
    query: "budget material procurement schedule",
    limit: 5,
  });
  assert.ok(insights.length > 0);
  assert.ok(insights[0]?.insight_text.toLowerCase().includes("budget"));
});
