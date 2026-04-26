import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  /** Eyebrow label, e.g. "Searching the literature". */
  eyebrow: string;
  /** Main line, e.g. "Reviewing related work". */
  title: string;
  /** Optional supporting copy. */
  detail?: string;
  /** Echoed back to the user so they can see what they asked for. */
  prompt?: string;
  /**
   * Steps cycled through underneath the title — purely cosmetic, gives the
   * 10s wait some texture so it doesn't feel like a frozen screen.
   */
  steps?: string[];
}

/**
 * Calm, full-bleed loading screen used for the ~10s research / generation
 * round-trips.
 *
 * The visual is intentionally quiet: a slow pulse on the brand mark, a
 * single rotating tagline, and a soft progress strip — no spinners, no
 * percentages. The pace matches design_guide.md §7 (slow, warm motion).
 */
export function LoadingScreen({
  eyebrow,
  title,
  detail,
  prompt,
  steps = [],
}: LoadingScreenProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [steps]);

  const activeStep = steps[stepIndex];

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-screen w-full flex-col items-center justify-center px-6 sm:px-8",
      )}
    >
      <div className="flex w-full max-w-[560px] flex-col items-center gap-6 text-center">
        <div
          aria-hidden="true"
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent-subtle)]",
            "animate-pulse-slow",
          )}
        >
          <span className="block h-3 w-3 rounded-full bg-accent" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            {eyebrow}
          </p>
          <h1 className="font-sans text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-text-primary sm:text-[32px]">
            {title}
          </h1>
          {detail ? (
            <p className="max-w-[44ch] text-[14px] leading-[1.55] text-text-secondary">
              {detail}
            </p>
          ) : null}
        </div>

        {prompt ? (
          <blockquote
            className={cn(
              "max-w-full rounded-xl bg-bg-userMessage px-4 py-3 text-left text-[14px] leading-[1.55] text-text-primary",
              "border border-[color:var(--border-default)]",
            )}
          >
            {prompt}
          </blockquote>
        ) : null}

        {/* Soft progress strip — animated stripes, no determinate value. */}
        <div
          className={cn(
            "h-[3px] w-full max-w-[320px] overflow-hidden rounded-full bg-[color:var(--border-default)]",
          )}
        >
          <div className="h-full w-1/3 animate-progress-slide rounded-full bg-accent" />
        </div>

        {activeStep ? (
          <p
            key={activeStep}
            className="animate-fade-in text-[12px] uppercase tracking-[0.06em] text-text-tertiary"
          >
            {activeStep}
          </p>
        ) : null}
      </div>
    </section>
  );
}
