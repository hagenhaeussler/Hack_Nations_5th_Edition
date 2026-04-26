import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  BENCHMARK_SCORE_KEYS,
  submitBenchmarkEvaluation,
  type BenchmarkEvaluation,
  type BenchmarkScoreKey,
  type BenchmarkScores,
} from "@/lib/api";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

const CATEGORY_COPY: Record<BenchmarkScoreKey, { label: string; description: string }> = {
  timing_estimate_accuracy: {
    label: "Timing Estimate Accuracy",
    description: "How accurate are the time and duration estimates for the proposed tasks?",
  },
  sequential_scheduling_logic: {
    label: "Sequential Scheduling Logic",
    description: "How accurate is the order and placement of tasks in the calendar schedule?",
  },
  procedure_correctness: {
    label: "Procedure Correctness",
    description: "How scientifically correct and executable are the proposed procedures?",
  },
  budget_estimate_accuracy: {
    label: "Budget Estimate Accuracy",
    description: "How accurate is the estimated cost and budget breakdown?",
  },
  equipment_personnel_accuracy: {
    label: "Equipment and Personnel Estimate Accuracy",
    description: "How accurate are the required equipment, materials, and people estimates?",
  },
  citation_quality: {
    label: "Citation Quality",
    description: "How relevant and trustworthy are the citations and literature support?",
  },
  validation_criteria_quality: {
    label: "Validation Criteria Quality",
    description: "How appropriate are the success criteria and validation checkpoints?",
  },
};

function defaultScores(): BenchmarkScores {
  return Object.fromEntries(BENCHMARK_SCORE_KEYS.map((key) => [key, 75])) as BenchmarkScores;
}

function averageScore(scores: BenchmarkScores): number {
  const total = BENCHMARK_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0);
  return Math.round((total / BENCHMARK_SCORE_KEYS.length) * 10) / 10;
}

interface BenchmarkEvaluationModalProps {
  open: boolean;
  project: Project;
  planId: string | null;
  onClose: () => void;
  onSaved: (evaluation: BenchmarkEvaluation) => void;
}

export function BenchmarkEvaluationModal({
  open,
  project,
  planId,
  onClose,
  onSaved,
}: BenchmarkEvaluationModalProps) {
  const [scores, setScores] = useState<BenchmarkScores>(() => defaultScores());
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overall = useMemo(() => averageScore(scores), [scores]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setScores(defaultScores());
    setFeedback("");
    setError(null);
  }, [open]);

  if (!open || !planId) return null;

  const updateScore = (key: BenchmarkScoreKey, value: number) => {
    setScores((current) => ({
      ...current,
      [key]: Math.max(0, Math.min(100, value)),
    }));
  };

  const submit = async () => {
    setError(null);
    for (const key of BENCHMARK_SCORE_KEYS) {
      const value = scores[key];
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError("All scores must be numbers between 0 and 100.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await submitBenchmarkEvaluation(planId, {
        project_id: project.id,
        plan_id: planId,
        scores,
        written_feedback: feedback,
        metadata: { source_view: "calendar_view" },
      });
      onSaved(result.evaluation);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save evaluation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="benchmark-evaluation-title"
        className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-[color:var(--border-default)] bg-bg-primary shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border-default)] px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Benchmark evaluation
            </p>
            <h2 id="benchmark-evaluation-title" className="mt-1 text-[20px] font-medium text-text-primary">
              Evaluate Creator Agent Plan
            </h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              Rate how well the generated plan matches the researcher&apos;s expectations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evaluation modal"
            className="rounded-sm p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.7} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-[color:var(--border-default)] bg-bg-surface px-4 py-3">
            <p className="text-[12px] text-text-secondary">Overall Benchmark Score</p>
            <p className="mt-1 text-[24px] font-medium text-text-primary">{overall.toFixed(1)} / 100</p>
          </div>

          <div className="flex flex-col gap-4">
            {BENCHMARK_SCORE_KEYS.map((key) => {
              const copy = CATEGORY_COPY[key];
              return (
                <label key={key} className="block rounded-md border border-[color:var(--border-default)] bg-bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[13px] font-medium text-text-primary">{copy.label}</span>
                      <p className="mt-1 text-[12px] leading-[1.45] text-text-secondary">
                        {copy.description}
                      </p>
                    </div>
                    <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[12px] font-medium text-text-primary">
                      {scores[key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={scores[key]}
                    onChange={(event) => updateScore(key, Number(event.target.value))}
                    className="mt-3 w-full accent-[color:var(--accent)]"
                  />
                </label>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="text-[13px] font-medium text-text-primary">Researcher Feedback</span>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value.slice(0, 5000))}
              placeholder="What did the plan do well? What was wrong, missing, unrealistic, or especially useful?"
              className={cn(
                "mt-2 min-h-[120px] w-full resize-y rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3 py-2",
                "text-[13px] leading-[1.5] text-text-primary outline-none transition-colors placeholder:text-text-tertiary",
                "focus:border-[color:var(--accent)]",
              )}
            />
          </label>
          {error ? <p className="mt-3 text-[12px] font-medium text-red-600">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--border-default)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-[color:var(--border-default)] px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void submit();
            }}
            disabled={submitting}
            className="rounded-sm bg-accent px-3 py-1.5 text-[13px] font-medium text-white shadow-sm disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Submit Evaluation"}
          </button>
        </footer>
      </section>
    </div>
  );
}
