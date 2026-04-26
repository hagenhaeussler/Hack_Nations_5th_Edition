import { useState } from "react";
import { ExternalLink } from "lucide-react";

import type { Paper } from "@/lib/papers";
import { buildPaperRelevanceExplanation, similarityLabel } from "@/lib/papers";
import { cn } from "@/lib/utils";

interface PaperListProps {
  hypothesis: string;
  papers: Paper[];
  selectedPaperId?: string | null;
  onSelect?: (paper: Paper) => void;
  onOpenDetails?: (paper: Paper) => void;
}

export function PaperList({
  hypothesis,
  papers,
  selectedPaperId,
  onSelect,
  onOpenDetails,
}: PaperListProps) {
  return (
    <ul className="flex flex-col gap-1.5">
      {papers.map((paper, index) => {
        const isSelected = selectedPaperId === paper.id;
        return (
        <li
          key={paper.id}
          className={cn(
            "group rounded-md border bg-bg-surface px-3 py-2.5",
            "transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--border-strong)]",
            isSelected
              ? "border-[color:var(--accent)] shadow-sm"
              : "border-[color:var(--border-default)]",
          )}
        >
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => onSelect?.(paper)}
          >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[13.5px] font-medium leading-[1.4] text-text-primary">
                <span className="mr-2 text-[11px] text-text-tertiary">{index + 1}.</span>
                {paper.title}
              </h3>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">
                <span className="truncate">
                  {paper.authors.slice(0, 3).join(", ")}
                  {paper.authors.length > 3 ? " et al." : ""} · {paper.venue} · {paper.year}
                </span>
                {paper.is_fallback ? (
                  <span className="shrink-0 rounded-full border border-[color:var(--border-default)] bg-accent-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-accent">
                    Demo source
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SimilarityBadge similarity={paper.similarity} />
              <span className="text-[11px] text-text-tertiary">
                {isSelected ? "Hide" : "Details"}
              </span>
            </div>
          </div>
          </button>

          {isSelected ? (
            <PaperInlineDetail
              paper={paper}
              hypothesis={hypothesis}
              onOpenDetails={onOpenDetails}
            />
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}

function PaperInlineDetail({
  paper,
  hypothesis,
  onOpenDetails,
}: {
  paper: Paper;
  hypothesis: string;
  onOpenDetails?: (paper: Paper) => void;
}) {
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const graphLinkCount =
    (paper.referencedPaperIds?.length ?? 0) + (paper.relatedPaperIds?.length ?? 0);
  const relevanceExplanation = buildPaperRelevanceExplanation(paper, hypothesis);

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3 lg:grid-cols-[1fr_220px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-accent">
            {Math.round(paper.similarity * 100)}% relevance
          </span>
          {graphLinkCount > 0 ? (
            <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-secondary">
              {graphLinkCount} graph link{graphLinkCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="mt-3 rounded-md bg-bg-surface px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Why this matches the input hypothesis
          </p>
          <p className="mt-1 text-[13px] leading-[1.55] text-text-secondary">
            {relevanceExplanation}
          </p>
          {paper.novelty_relation ? (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-text-tertiary">
              {paper.novelty_relation}
            </p>
          ) : null}
        </div>
        <div className="mt-3">
          <SimilarityBar similarity={paper.similarity} />
        </div>
        <p className="mt-2 max-h-36 overflow-y-auto pr-2 text-[13px] leading-[1.6] text-text-secondary">
          {paper.abstract}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onOpenDetails?.(paper)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
          >
            Open full details
          </button>
          {paper.url ? (
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
            >
              Open source page
              <ExternalLink size={12} strokeWidth={1.5} />
            </a>
          ) : null}
          {paper.pdfUrl ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowPdfPreview((current) => !current);
              }}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
            >
              {showPdfPreview ? "Hide PDF preview" : "Preview PDF"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-[180px] overflow-hidden rounded-md border border-[color:var(--border-default)] bg-bg-surface">
        {paper.pdfUrl && showPdfPreview ? (
          <iframe
            title={`PDF preview for ${paper.title}`}
            src={paper.pdfUrl}
            className="h-full min-h-[180px] w-full"
          />
        ) : paper.pdfUrl ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-[12px] font-medium text-text-secondary">
              PDF preview available
            </p>
            <button
              type="button"
              onClick={() => setShowPdfPreview(true)}
              className="mt-1 rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent-hover"
            >
              Load preview
            </button>
          </div>
        ) : (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-[12px] font-medium text-text-secondary">
              No direct PDF preview
            </p>
            <p className="text-[11px] leading-[1.45] text-text-tertiary">
              OpenAlex did not return an embeddable PDF for this paper.
            </p>
          </div>
        )}
      </div>
    </div>
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
