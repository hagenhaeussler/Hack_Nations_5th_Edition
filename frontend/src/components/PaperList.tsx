import { ExternalLink } from "lucide-react";

import type { Paper } from "@/lib/papers";
import { buildPaperRelevanceExplanation, similarityLabel } from "@/lib/papers";
import { cn } from "@/lib/utils";

interface PaperListProps {
  papers: Paper[];
  /**
   * The hypothesis the papers are scored against. When provided, each row
   * surfaces a one-line "why this matters" explanation instead of falling
   * back to a generic abstract excerpt.
   */
  hypothesis?: string;
  /** Currently highlighted paper (controlled by the parent). */
  selectedPaperId?: string | null;
  /** Single click → select. Used by the parent to drive a graph or panel. */
  onSelect?: (paper: Paper) => void;
  /**
   * Affordance for opening a deeper detail surface (e.g. a side drawer).
   * Renders an explicit "Details" button when supplied.
   */
  onOpenDetails?: (paper: Paper) => void;
}

export function PaperList({
  papers,
  hypothesis,
  selectedPaperId,
  onSelect,
  onOpenDetails,
}: PaperListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {papers.map((paper) => {
        const isSelected = selectedPaperId === paper.id;
        const isInteractive = Boolean(onSelect || onOpenDetails);
        const explanation = hypothesis
          ? buildPaperRelevanceExplanation(paper, hypothesis)
          : null;

        return (
          <li
            key={paper.id}
            className={cn(
              "group rounded-md border bg-bg-surface p-3.5",
              "transition-colors duration-[var(--duration-fast)]",
              isSelected
                ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]/40"
                : "border-[color:var(--border-default)] hover:border-[color:var(--border-strong)]",
              isInteractive ? "cursor-pointer" : null,
            )}
            onClick={() => {
              if (onSelect) onSelect(paper);
              else if (onOpenDetails) onOpenDetails(paper);
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-medium leading-[1.45] text-text-primary">
                  {paper.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
                  <span>{paper.authors.join(", ")} · {paper.venue} · {paper.year}</span>
                  {paper.is_fallback ? (
                    <span className="rounded-full border border-[color:var(--border-default)] bg-accent-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-accent">
                      Demo source
                    </span>
                  ) : null}
                </div>
              </div>
              <SimilarityBadge similarity={paper.similarity} />
            </div>

            {explanation ? (
              <p className="mt-2 text-[12.5px] leading-[1.55] text-text-secondary">
                {explanation}
              </p>
            ) : (
              <p className="mt-2 line-clamp-2 text-[13px] leading-[1.55] text-text-secondary">
                {paper.abstract}
              </p>
            )}

            <div className="mt-2.5 flex items-center justify-between gap-3">
              <SimilarityBar similarity={paper.similarity} />
              <div className="flex items-center gap-3">
                {onOpenDetails ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetails(paper);
                    }}
                    className="text-[12px] font-medium text-accent transition-colors hover:text-accent-hover"
                  >
                    Details
                  </button>
                ) : null}
                {paper.url ? (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "inline-flex items-center gap-1 text-[12px] text-text-secondary",
                      "transition-colors hover:text-text-primary",
                    )}
                  >
                    <span>Open</span>
                    <ExternalLink size={12} strokeWidth={1.5} />
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SimilarityBadge({ similarity }: { similarity: number }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em]",
        "bg-accent-subtle text-accent",
      )}
      title={similarityLabel(similarity)}
    >
      {Math.round(similarity * 100)}%
    </span>
  );
}

function SimilarityBar({ similarity }: { similarity: number }) {
  const pct = Math.round(similarity * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 w-28 overflow-hidden rounded-full bg-[color:var(--border-default)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Similarity ${pct} percent`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-slow)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
        {similarityLabel(similarity)}
      </span>
    </div>
  );
}
