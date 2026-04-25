import { useMemo, useState } from "react";

import type { Paper } from "@/lib/papers";
import { similarityLabel } from "@/lib/papers";
import { cn } from "@/lib/utils";

interface PaperGraphProps {
  /** Reserved for future use; the prompt currently isn't rendered in the SVG. */
  prompt: string;
  papers: Paper[];
  onSelect?: (paper: Paper) => void;
}

/**
 * A small, dependency-free network diagram.
 *
 * Layout:
 * - The user's prompt sits at the centre as an unlabelled accent node.
 * - Each paper orbits the centre on a circle whose radius is inversely
 *   proportional to its similarity (more similar → closer in).
 * - Edge opacity + width also encode similarity.
 *
 * Interaction:
 * - Click a paper node to select it. Selection highlights its edge and
 *   surfaces details in the readout below. Click the same node (or a blank
 *   area of the SVG) to deselect.
 *
 * The viewBox is fixed (480 × 400) and the SVG scales with its container,
 * so this works whether the panel is half-screen or full-screen.
 */
export function PaperGraph({ prompt: _prompt, papers, onSelect }: PaperGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const centerX = 240;
    const centerY = 200;
    const innerRadius = 70;
    const outerRadius = 160;

    return papers.map((paper, idx) => {
      const angle =
        (idx / Math.max(papers.length, 1)) * Math.PI * 2 - Math.PI / 2;
      // Higher similarity → smaller radius (closer to centre).
      const radius =
        outerRadius - (paper.similarity - 0.45) * (outerRadius - innerRadius) * 2;
      const x = centerX + Math.cos(angle) * Math.max(innerRadius, Math.min(outerRadius, radius));
      const y = centerY + Math.sin(angle) * Math.max(innerRadius, Math.min(outerRadius, radius));
      return { paper, x, y };
    });
  }, [papers]);

  const selected = selectedId
    ? layout.find((n) => n.paper.id === selectedId)?.paper ?? null
    : null;

  const togglePaper = (paper: Paper) => {
    setSelectedId((curr) => (curr === paper.id ? null : paper.id));
    onSelect?.(paper);
  };

  return (
    <div className="flex h-full flex-col">
      <svg
        viewBox="0 0 480 400"
        className="h-full w-full"
        role="img"
        aria-label="Graph of papers similar to your prompt"
        onClick={(e) => {
          // Click on the SVG background (not on a node) deselects.
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {/* Concentric similarity rings — purely visual scaffolding. */}
        {[0.55, 0.7, 0.85].map((band) => {
          const r = 160 - (band - 0.45) * (160 - 70) * 2;
          return (
            <circle
              key={band}
              cx={240}
              cy={200}
              r={Math.max(70, Math.min(160, r))}
              fill="none"
              stroke="var(--border-default)"
              strokeDasharray="2 5"
              opacity={0.45}
            />
          );
        })}

        {/* Edges */}
        {layout.map(({ paper, x, y }) => {
          const isSelected = selectedId === paper.id;
          return (
            <line
              key={`edge-${paper.id}`}
              x1={240}
              y1={200}
              x2={x}
              y2={y}
              stroke={isSelected ? "var(--accent)" : "var(--border-strong)"}
              strokeOpacity={
                isSelected ? 0.9 : 0.25 + paper.similarity * 0.55
              }
              strokeWidth={isSelected ? 1.5 : 0.5 + paper.similarity * 1.2}
            />
          );
        })}

        {/* Centre node — the hypothesis (unlabelled). */}
        <circle
          cx={240}
          cy={200}
          r={14}
          fill="var(--accent)"
          stroke="var(--accent)"
          strokeWidth={1.25}
        />
        <circle
          cx={240}
          cy={200}
          r={22}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.35}
          strokeWidth={1}
        />

        {/* Paper nodes */}
        {layout.map(({ paper, x, y }) => {
          const isSelected = selectedId === paper.id;
          const radius = 8 + paper.similarity * 8;
          return (
            <g
              key={paper.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                togglePaper(paper);
              }}
            >
              {/* hit target */}
              <circle cx={x} cy={y} r={radius + 8} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={radius}
                fill={isSelected ? "var(--accent)" : "var(--bg-surface)"}
                stroke={isSelected ? "var(--accent)" : "var(--border-strong)"}
                strokeWidth={1.25}
              />
              <text
                x={x}
                y={y + radius + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-secondary)"
              >
                {Math.round(paper.similarity * 100)}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Selected-paper readout — empty until a node is clicked. */}
      <div className="mt-3 min-h-[64px] rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3 pt-2.5 pb-4">
        {selected ? (
          <div className="flex flex-col gap-1 animate-fade-in">
            <p className="line-clamp-2 text-[13px] font-medium leading-[1.4] text-text-primary">
              {selected.title}
            </p>
            <p className="text-[12px] text-text-secondary">
              {selected.authors[0]}
              {selected.authors.length > 1 ? " et al." : ""} · {selected.venue} ·{" "}
              {selected.year}
            </p>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em]",
                  "bg-accent-subtle text-accent",
                )}
              >
                {Math.round(selected.similarity * 100)}% ·{" "}
                {similarityLabel(selected.similarity)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[12px] leading-[1.5] text-text-tertiary">
            Click a paper to see details. Distance to centre encodes similarity.
          </p>
        )}
      </div>
    </div>
  );
}
