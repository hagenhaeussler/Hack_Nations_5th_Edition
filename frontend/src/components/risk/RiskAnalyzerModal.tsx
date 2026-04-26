import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { analyzePlanRisks } from "@/lib/api";
import type {
  AnalyzedRisk,
  RiskAnalysisResult,
  RiskCategory,
  RiskSeverity,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

interface RiskAnalyzerModalProps {
  open: boolean;
  planId: string | null;
  nodeLabels: Record<string, string>;
  onClose: () => void;
  onHighlightStep?: (nodeId: string) => void;
}

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  timeline_risk: "Timeline",
  budget_risk: "Budget",
  equipment_risk: "Equipment",
  material_risk: "Materials",
  people_risk: "People",
  scheduling_risk: "Scheduling",
  validation_risk: "Validation",
  procedure_risk: "Procedure",
  citation_support_risk: "Citation",
  uncertainty_risk: "Uncertainty",
  lab_inventory_risk: "Inventory",
  previous_experiment_risk: "Previous experiments",
  learning_memory_risk: "Learning memory",
};

function severityClass(severity: RiskSeverity): string {
  switch (severity) {
    case "critical":
      return "border-red-200 bg-red-50/70 text-red-700";
    case "high":
      return "border-orange-200 bg-orange-50/70 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50/70 text-amber-700";
    case "low":
      return "border-emerald-200 bg-emerald-50/70 text-emerald-700";
  }
}

function severityDotClass(severity: RiskSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-emerald-500";
  }
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function affectedStepLabel(risk: AnalyzedRisk, nodeLabels: Record<string, string>): string {
  if (risk.affected_nodes.length === 0) return "No specific task";
  return risk.affected_nodes
    .map((nodeId) => nodeLabels[nodeId] ?? nodeId)
    .slice(0, 4)
    .join(", ");
}

export function RiskAnalyzerModal({
  open,
  planId,
  nodeLabels,
  onClose,
  onHighlightStep,
}: RiskAnalyzerModalProps) {
  const [analysis, setAnalysis] = useState<RiskAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !planId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAnalysis(null);

    analyzePlanRisks(planId)
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Risk analysis failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Risk Analyzer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[1px]"
    >
      <section className="flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-lg border border-[color:var(--border-default)] bg-bg-surface shadow-lg">
        <header className="flex items-start gap-4 border-b border-[color:var(--border-default)] px-6 py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--border-default)] bg-bg-primary text-text-secondary">
            <ShieldAlert size={18} strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Plan review
            </p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-text-primary">
              Risk Analyzer
            </h2>
            <p className="mt-1 max-w-[70ch] text-[13px] leading-[1.6] text-text-secondary">
              {analysis
                ? analysis.summary
                : "Analyzing project risks across the current plan, resources, lessons, and report."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Risk Analyzer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35"
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-primary px-6 py-5">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--border-default)] bg-bg-surface">
                <Loader2 size={20} strokeWidth={1.6} className="animate-spin text-text-secondary" />
              </span>
              <p className="mt-4 text-[14px] font-medium text-text-primary">
                Analyzing project risks...
              </p>
              <p className="mt-1 max-w-[46ch] text-[13px] leading-[1.6] text-text-secondary">
                Checking missing resources, critical-path blockers, validation gaps,
                uncertainty, and lesson-card warnings.
              </p>
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-bg-surface p-4 text-red-700">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <AlertTriangle size={16} strokeWidth={1.7} />
                Risk analysis failed
              </div>
              <p className="mt-2 text-[12.5px] leading-[1.5]">{error}</p>
            </div>
          ) : analysis ? (
            <RiskAnalysisContent
              analysis={analysis}
              nodeLabels={nodeLabels}
              onHighlightStep={onHighlightStep}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RiskAnalysisContent({
  analysis,
  nodeLabels,
  onHighlightStep,
}: {
  analysis: RiskAnalysisResult;
  nodeLabels: Record<string, string>;
  onHighlightStep?: (nodeId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Overall risk
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  severityDotClass(analysis.overall_risk_level),
                )}
                aria-hidden="true"
              />
              <p className="text-[15px] font-semibold text-text-primary">
                {capitalise(analysis.overall_risk_level)}
              </p>
            </div>
          </div>
          <p className="max-w-[58ch] text-[13px] leading-[1.6] text-text-secondary">
            {analysis.summary}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(["critical", "high", "medium", "low"] as const).map((severity) => (
          <div
            key={severity}
            className="rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn("h-1.5 w-1.5 rounded-full", severityDotClass(severity))}
                aria-hidden="true"
              />
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
                {capitalise(severity)}
              </p>
            </div>
            <p className="mt-1 text-[20px] font-light leading-none text-text-primary">
              {analysis.risk_counts[severity]}
            </p>
          </div>
        ))}
      </div>

      {analysis.top_risks.length === 0 ? (
        <p className="rounded-md border border-[color:var(--border-default)] bg-bg-surface p-4 text-[13px] leading-[1.6] text-text-secondary">
          No major risks were detected from the current plan context.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {analysis.top_risks.map((risk, index) => (
            <RiskCard
              key={risk.risk_id}
              risk={risk}
              rank={index + 1}
              nodeLabels={nodeLabels}
              onHighlightStep={onHighlightStep}
            />
          ))}
        </ol>
      )}

      {analysis.recommended_next_actions.length > 0 ? (
        <footer className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
            Recommended next actions
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {analysis.recommended_next_actions.map((action) => (
              <li key={action} className="flex gap-2 text-[13px] leading-[1.6] text-text-secondary">
                <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-tertiary)]" />
                {action}
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </div>
  );
}

function RiskCard({
  risk,
  rank,
  nodeLabels,
  onHighlightStep,
}: {
  risk: AnalyzedRisk;
  rank: number;
  nodeLabels: Record<string, string>;
  onHighlightStep?: (nodeId: string) => void;
}) {
  const firstNode = risk.affected_nodes[0];
  return (
    <li className="rounded-lg border border-[color:var(--border-default)] bg-bg-surface p-4 shadow-sm">
      <article>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              #{rank} · {CATEGORY_LABELS[risk.category]}
            </p>
            <h3 className="mt-1 text-[15px] font-semibold leading-[1.4] tracking-[-0.01em] text-text-primary">
              {risk.title}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] font-medium",
                severityClass(risk.severity),
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", severityDotClass(risk.severity))}
                  aria-hidden="true"
                />
                {capitalise(risk.severity)}
              </span>
            </span>
            <span className="rounded-full border border-[color:var(--border-default)] bg-bg-surface px-2 py-1 text-[11px] font-medium text-text-secondary">
              Score {risk.risk_score}
            </span>
          </div>
        </header>

        <div className="mt-3 grid gap-3 text-[13px] leading-[1.6] text-text-secondary md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p>{risk.explanation}</p>
            <p className="mt-3 text-[12px] leading-[1.5] text-text-tertiary">
              Affected steps: {affectedStepLabel(risk, nodeLabels)}
            </p>
            <p className="mt-1 text-[12px] leading-[1.5] text-text-tertiary">
              Probability: {risk.probability} · Impact: {risk.impact} · Confidence: {risk.confidence}
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Mitigation
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {risk.suggested_mitigation.slice(0, 3).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-tertiary)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <details className="mt-3 rounded-md border border-[color:var(--border-default)] bg-bg-primary px-3 py-2 text-[12.5px] text-text-secondary">
          <summary className="cursor-pointer select-none text-text-tertiary transition-colors hover:text-text-primary">
            Evidence and consequences
          </summary>
          <div className="mt-3 grid gap-3 border-t border-[color:var(--border-default)] pt-3 md:grid-cols-2">
            <div>
              <p className="font-medium text-text-primary">Evidence</p>
              <ul className="mt-1.5 flex flex-col gap-1.5 leading-[1.5]">
                {risk.evidence.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-tertiary)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-text-primary">Possible consequences</p>
              <ul className="mt-1.5 flex flex-col gap-1.5 leading-[1.5]">
                {risk.possible_consequences.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-tertiary)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        {firstNode && onHighlightStep ? (
          <button
            type="button"
            onClick={() => onHighlightStep(firstNode)}
            className="mt-3 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35"
          >
            Highlight step
          </button>
        ) : null}
      </article>
    </li>
  );
}
