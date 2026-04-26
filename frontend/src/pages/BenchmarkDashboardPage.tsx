import { BarChart3, CalendarRange, ExternalLink, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  BENCHMARK_SCORE_KEYS,
  getBenchmarkSummary,
  listBenchmarkEvaluations,
  type BenchmarkEvaluation,
  type BenchmarkScoreKey,
  type BenchmarkSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<BenchmarkScoreKey, string> = {
  timing_estimate_accuracy: "Timing Estimate Accuracy",
  sequential_scheduling_logic: "Sequential Scheduling Logic",
  procedure_correctness: "Procedure Correctness",
  budget_estimate_accuracy: "Budget Estimate Accuracy",
  equipment_personnel_accuracy: "Equipment/Personnel Accuracy",
  citation_quality: "Citation Quality",
  validation_criteria_quality: "Validation Criteria Quality",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function strongestCategory(evaluation: BenchmarkEvaluation): BenchmarkScoreKey {
  return BENCHMARK_SCORE_KEYS.reduce((best, key) =>
    evaluation.scores[key] > evaluation.scores[best] ? key : best,
  );
}

function weakestCategory(evaluation: BenchmarkEvaluation): BenchmarkScoreKey {
  return BENCHMARK_SCORE_KEYS.reduce((weakest, key) =>
    evaluation.scores[key] < evaluation.scores[weakest] ? key : weakest,
  );
}

export function BenchmarkDashboardPage() {
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<BenchmarkEvaluation[]>([]);
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listBenchmarkEvaluations(), getBenchmarkSummary()])
      .then(([nextEvaluations, nextSummary]) => {
        if (cancelled) return;
        setEvaluations(nextEvaluations);
        setSummary(nextSummary);
        setSelectedId(nextEvaluations.at(-1)?.id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load benchmark dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => evaluations.find((evaluation) => evaluation.id === selectedId) ?? evaluations.at(-1) ?? null,
    [evaluations, selectedId],
  );

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-bg-primary">
      <header className="border-b border-[color:var(--border-default)] bg-bg-primary/95 px-8 pb-5 pt-7">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          <BarChart3 size={14} strokeWidth={1.6} />
          Agent Benchmark
        </p>
        <h1 className="mt-2 font-sans text-[28px] font-medium tracking-[-0.02em] text-text-primary">
          Agent Benchmark
        </h1>
        <p className="mt-1 max-w-[64ch] text-[13px] leading-[1.55] text-text-secondary">
          Researcher evaluations of Creator Agent plan quality over time.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <p className="text-[13px] text-text-secondary">Loading benchmark evaluations...</p>
        ) : error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        ) : evaluations.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="flex min-w-0 flex-col gap-5">
              <SummaryCards summary={summary} />
              <ScoreChart
                evaluations={evaluations}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
              <CategoryBreakdown summary={summary} />
            </section>
            <EvaluationDetail
              evaluation={selected}
              onOpenCalendar={(evaluation) => {
                if (evaluation.project_id) navigate(`/projects/${evaluation.project_id}/calendar`);
              }}
              onOpenReport={(evaluation) => {
                if (evaluation.project_id) navigate(`/projects/${evaluation.project_id}/statistics`);
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-[color:var(--border-default)] bg-bg-surface px-6 text-center">
      <div className="max-w-[42ch]">
        <h2 className="text-[18px] font-medium text-text-primary">No benchmark evaluations yet.</h2>
        <p className="mt-2 text-[13px] leading-[1.55] text-text-secondary">
          Generate a plan and evaluate it from the Calendar View.
        </p>
      </div>
    </section>
  );
}

function SummaryCards({ summary }: { summary: BenchmarkSummary | null }) {
  const cards = [
    { label: "Total evaluations", value: summary?.total_evaluations ?? 0 },
    { label: "Average score", value: summary?.average_score !== null ? `${summary?.average_score ?? 0}` : "N/A" },
    { label: "Latest score", value: summary?.latest_score !== null ? `${summary?.latest_score ?? 0}` : "N/A" },
    {
      label: "Improvement",
      value: summary?.improvement !== null && summary?.improvement !== undefined ? `${summary.improvement > 0 ? "+" : ""}${summary.improvement}` : "N/A",
    },
    { label: "Best category", value: summary?.best_category ? CATEGORY_LABELS[summary.best_category] : "N/A" },
    { label: "Weakest category", value: summary?.weakest_category ? CATEGORY_LABELS[summary.weakest_category] : "N/A" },
  ];
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-md border border-[color:var(--border-default)] bg-bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            {card.label}
          </p>
          <p className="mt-2 text-[20px] font-medium text-text-primary">{card.value}</p>
        </div>
      ))}
    </section>
  );
}

function ScoreChart({
  evaluations,
  selectedId,
  onSelect,
}: {
  evaluations: BenchmarkEvaluation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium text-text-primary">Benchmark Score Over Time</h2>
          <p className="mt-1 text-[12px] text-text-secondary">X-axis is chronological trial order. Y-axis is 0 to 100.</p>
        </div>
        <TrendingUp size={18} className="text-text-tertiary" />
      </div>
      <div className="flex h-[280px] items-end gap-2 border-l border-b border-[color:var(--border-default)] px-3 pt-4">
        {evaluations.map((evaluation, index) => {
          const selected = evaluation.id === selectedId;
          return (
            <button
              key={evaluation.id}
              type="button"
              onClick={() => onSelect(evaluation.id)}
              title={`${evaluation.project_title} | ${evaluation.plan_title} | ${formatDate(evaluation.created_at)} | ${evaluation.overall_score}/100 | Strongest: ${CATEGORY_LABELS[strongestCategory(evaluation)]} | Weakest: ${CATEGORY_LABELS[weakestCategory(evaluation)]}`}
              className="group flex min-w-[44px] flex-1 flex-col items-center gap-2"
            >
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  selected ? "bg-accent" : "bg-[color:var(--border-strong)] group-hover:bg-accent",
                )}
                style={{ height: `${Math.max(4, evaluation.overall_score)}%` }}
              />
              <span className="text-[10px] text-text-tertiary">T{index + 1}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CategoryBreakdown({ summary }: { summary: BenchmarkSummary | null }) {
  if (!summary?.category_averages) return null;
  return (
    <section className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-5">
      <h2 className="text-[18px] font-medium text-text-primary">Category Breakdown</h2>
      <div className="mt-4 overflow-hidden rounded-md border border-[color:var(--border-default)]">
        {BENCHMARK_SCORE_KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_72px] border-b border-[color:var(--border-default)] px-3 py-2 last:border-b-0">
            <span className="text-[13px] text-text-secondary">{CATEGORY_LABELS[key]}</span>
            <span className="text-right text-[13px] font-medium text-text-primary">
              {summary.category_averages?.[key].toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EvaluationDetail({
  evaluation,
  onOpenCalendar,
  onOpenReport,
}: {
  evaluation: BenchmarkEvaluation | null;
  onOpenCalendar: (evaluation: BenchmarkEvaluation) => void;
  onOpenReport: (evaluation: BenchmarkEvaluation) => void;
}) {
  if (!evaluation) return null;
  return (
    <aside className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        Evaluation detail
      </p>
      <h2 className="mt-2 text-[20px] font-medium text-text-primary">{evaluation.overall_score} / 100</h2>
      <p className="mt-2 text-[13px] font-medium text-text-primary">{evaluation.project_title}</p>
      <p className="mt-1 text-[12px] text-text-secondary">{evaluation.plan_title}</p>
      <p className="mt-1 text-[12px] text-text-tertiary">{formatDate(evaluation.created_at)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!evaluation.project_id}
          onClick={() => onOpenCalendar(evaluation)}
          className="inline-flex items-center gap-1 rounded-sm border border-[color:var(--border-default)] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <CalendarRange size={13} /> Open Calendar Plan
        </button>
        <button
          type="button"
          disabled={!evaluation.project_id}
          onClick={() => onOpenReport(evaluation)}
          className="inline-flex items-center gap-1 rounded-sm border border-[color:var(--border-default)] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <ExternalLink size={13} /> Open Plan Report
        </button>
      </div>
      <div className="mt-5 space-y-2">
        {BENCHMARK_SCORE_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-text-secondary">{CATEGORY_LABELS[key]}</span>
            <span className="font-medium text-text-primary">{evaluation.scores[key]}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Researcher feedback
        </p>
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.55] text-text-secondary">
          {evaluation.written_feedback || "No written feedback submitted."}
        </p>
      </div>
      <p className="mt-4 text-[12px] text-text-tertiary">
        Mode: {evaluation.generation_mode ?? "unknown"} · Model: {evaluation.model_name ?? "not recorded"}
      </p>
    </aside>
  );
}
