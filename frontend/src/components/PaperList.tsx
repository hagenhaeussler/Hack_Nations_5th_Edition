import { ExternalLink } from "lucide-react";

import type { Paper } from "@/lib/papers";
import { similarityLabel } from "@/lib/papers";
import { cn } from "@/lib/utils";

interface PaperListProps {
  papers: Paper[];
}

export function PaperList({ papers }: PaperListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {papers.map((paper) => (
        <li
          key={paper.id}
          className={cn(
            "group rounded-md border border-[color:var(--border-default)] bg-bg-surface p-3.5",
            "transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--border-strong)]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-medium leading-[1.45] text-text-primary">
                {paper.title}
              </h3>
              <p className="mt-1 text-[12px] text-text-secondary">
                {paper.authors.join(", ")} · {paper.venue} · {paper.year}
              </p>
            </div>
            <SimilarityBadge similarity={paper.similarity} />
          </div>

          <p className="mt-2 line-clamp-2 text-[13px] leading-[1.55] text-text-secondary">
            {paper.abstract}
          </p>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <SimilarityBar similarity={paper.similarity} />
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
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
        </li>
      ))}
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
