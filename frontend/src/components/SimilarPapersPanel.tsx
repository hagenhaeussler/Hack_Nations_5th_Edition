import { Archive, CalendarRange, List, Network } from "lucide-react";
import { useMemo, useState } from "react";

import { PaperGraph } from "@/components/PaperGraph";
import { PaperList } from "@/components/PaperList";
import { getSimilarPapers } from "@/lib/papers";
import { cn } from "@/lib/utils";

type View = "graph" | "list";

interface SimilarPapersPanelProps {
  prompt: string;
  onArchive: () => void;
  onOpenTimeline: () => void;
}

/**
 * Right-side panel that slides in after the user submits a prompt.
 * Per design_guide §8.6 the artifact panel takes ~50% of the screen
 * on desktop and falls back to a full overlay on smaller widths.
 *
 * Two views:
 *   - graph: SVG network of similar papers around the hypothesis
 *   - list:  scrollable cards with similarity bars
 *
 * Footer hosts:
 *   - "Build timeline" → routes to the (not-yet-built) timeline page
 *   - "Archive search" → clears the active search and returns to landing
 */
export function SimilarPapersPanel({
  prompt,
  onArchive,
  onOpenTimeline,
}: SimilarPapersPanelProps) {
  const [view, setView] = useState<View>("graph");

  const papers = useMemo(() => getSimilarPapers(prompt), [prompt]);
  const topSimilarity = papers[0]?.similarity ?? 0;

  return (
    <aside
      aria-label="Similar papers"
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-[color:var(--border-default)]",
        "bg-bg-surface shadow-lg lg:w-1/2",
        "animate-slide-in-right",
      )}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border-default)] px-6 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
            Related work
          </p>
          <h2 className="mt-0.5 text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-text-primary">
            {papers.length} papers with similar experiments
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            Top match: {Math.round(topSimilarity * 100)}% similarity
          </p>
        </div>

        <ViewToggle view={view} onChange={setView} />
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {view === "graph" ? (
          <PaperGraph prompt={prompt} papers={papers} />
        ) : (
          <PaperList papers={papers} />
        )}
      </div>

      {/* Footer actions */}
      <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--border-default)] px-6 py-4">
        <button
          type="button"
          onClick={onArchive}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--border-default)] bg-transparent",
            "px-3 py-1.5 text-[13px] text-text-secondary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          <Archive size={14} strokeWidth={1.5} />
          Archive search
        </button>

        <button
          type="button"
          onClick={onOpenTimeline}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white",
            "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
          )}
        >
          <CalendarRange size={14} strokeWidth={1.75} />
          Build experiment timeline
        </button>
      </footer>
    </aside>
  );
}

interface ViewToggleProps {
  view: View;
  onChange: (next: View) => void;
}

function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-[color:var(--border-default)] bg-bg-surface p-0.5",
      )}
    >
      <ToggleButton
        active={view === "graph"}
        onClick={() => onChange("graph")}
        icon={<Network size={13} strokeWidth={1.5} />}
        label="Graph"
      />
      <ToggleButton
        active={view === "list"}
        onClick={() => onChange("list")}
        icon={<List size={13} strokeWidth={1.5} />}
        label="List"
      />
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ToggleButton({ active, onClick, icon, label }: ToggleButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium",
        "transition-colors duration-[var(--duration-fast)]",
        active
          ? "bg-bg-hover text-text-primary"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
