import {
  Atom,
  GitCompare,
  TrendingUp,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface Suggestion {
  icon: LucideIcon;
  label: string;
  /** Hypothesis stem — the user fills the bracketed slots. */
  prompt: string;
}

/**
 * Common hypothesis archetypes in experimental biology. Each chip seeds the
 * input with a stem the researcher can complete instead of writing one from
 * scratch.
 */
const SUGGESTIONS: Suggestion[] = [
  {
    icon: Workflow,
    label: "Causal",
    prompt: "We hypothesise that [factor] causes [outcome] in [model system].",
  },
  {
    icon: Atom,
    label: "Mechanism",
    prompt:
      "We hypothesise that [factor] regulates [outcome] through [mechanism] in [model system].",
  },
  {
    icon: GitCompare,
    label: "Comparison",
    prompt:
      "We hypothesise that [condition A] and [condition B] differ in [readout] under [context].",
  },
  {
    icon: TrendingUp,
    label: "Dose–response",
    prompt:
      "We hypothesise that [compound] dose-dependently modulates [readout] in [preparation].",
  },
];

interface SuggestionChipsProps {
  onPick?: (prompt: string) => void;
}

export function SuggestionChips({ onPick }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick?.(prompt)}
          className={cn(
            "group flex items-center gap-2 rounded-full border border-[color:var(--border-default)]",
            "bg-bg-surface px-3.5 py-1.5 text-[13px] text-text-secondary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          <Icon
            size={14}
            strokeWidth={1.5}
            className="text-text-tertiary group-hover:text-accent"
          />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
