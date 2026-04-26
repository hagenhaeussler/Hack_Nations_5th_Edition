import { ArrowUpRight, FileText } from "lucide-react";

import type { Paper } from "@/lib/papers";
import { buildPaperRelevanceExplanation, similarityLabel } from "@/lib/papers";
import { renderPaperText } from "@/lib/paperText";
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
   * Opens a deeper detail surface (e.g. a side drawer). Card clicks prefer
   * this handler; the external "Open" link remains a separate target.
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
    <ul className="flex flex-col gap-3">
      {papers.map((paper) => {
        const isSelected = selectedPaperId === paper.id;
        const isInteractive = Boolean(onSelect || onOpenDetails);
        const explanation = hypothesis
          ? buildPaperRelevanceExplanation(paper, hypothesis)
          : null;

        return (
          <li
            key={paper.id}
            data-paper-card="true"
            className={cn(
              "group rounded-lg border bg-bg-surface p-4 shadow-sm",
              "transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)]",
              isSelected
                ? "border-[color:var(--accent-hover)] ring-1 ring-[color:var(--accent-subtle)]"
                : "border-[color:var(--border-default)] hover:border-[color:var(--accent-hover)]",
              isInteractive ? "cursor-pointer" : null,
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (onOpenDetails) onOpenDetails(paper);
              else if (onSelect) onSelect(paper);
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--border-default)] bg-bg-primary text-text-tertiary">
                <FileText size={16} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] leading-none text-text-tertiary">
                  <span>{paper.year}</span>
                  {paper.venue ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{paper.venue}</span>
                    </>
                  ) : null}
                  {paper.is_fallback ? <DemoSourceBadge /> : null}
                </div>
                <h3 className="mt-1.5 text-[15px] font-semibold leading-[1.35] tracking-[-0.01em] text-text-primary">
                  {renderPaperText(paper.title)}
                </h3>
                <p className="mt-1 truncate text-[12px] leading-[1.4] text-text-secondary">
                  {paper.authors.length > 0 ? paper.authors.join(", ") : "Unknown authors"}
                </p>
              </div>
            </div>

            {explanation ? (
              <p className="mt-3 text-[13px] leading-[1.6] text-text-secondary">
                {explanation}
              </p>
            ) : (
              <p className="mt-3 line-clamp-3 text-[13px] leading-[1.6] text-text-secondary">
                {renderPaperText(paper.abstract)}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--border-default)] pt-3">
              <SimilarityBar similarity={paper.similarity} />
              {paper.url ? (
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-1.5 text-[12px] text-text-secondary",
                    "transition-colors hover:bg-bg-hover hover:text-text-primary",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35",
                  )}
                >
                  <span>Open</span>
                  <ArrowUpRight size={13} strokeWidth={1.5} />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DemoSourceBadge() {
  return (
    <span className="rounded-full border border-[color:var(--border-default)] bg-bg-primary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
      Demo source
    </span>
  );
}

function SimilarityBar({ similarity }: { similarity: number }) {
  const pct = Math.round(similarity * 100);
  return (
    <div className="min-w-0 flex flex-1 items-center gap-2">
      <span className="w-8 shrink-0 text-[12px] font-medium tabular-nums text-text-primary">
        {pct}%
      </span>
      <div
        className="h-1.5 w-28 overflow-hidden rounded-full bg-[color:var(--border-default)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Similarity ${pct} percent`}
      >
        <div
          className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-[var(--duration-slow)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="truncate text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
        {similarityLabel(similarity)}
      </span>
    </div>
  );
}
