import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface LoadingStep {
  label: string;
  progress?: number;
}

interface LoadingScreenProps {
  /** Eyebrow label, e.g. "Searching the literature". */
  eyebrow: string;
  /** Main line, e.g. "Reviewing related work". */
  title: string;
  /** Optional supporting copy. */
  detail?: string;
  /** Echoed back to the user so they can see what they asked for. */
  prompt?: string;
  /** Operational milestones shown while the background request is in flight. */
  steps?: Array<string | LoadingStep>;
  /** Expected duration for the API round-trip; the bar caps until the response resolves. */
  estimatedDurationMs?: number;
  /** Label for the determinate progress region. */
  progressLabel?: string;
  /** Simple visual treatment for the waiting animation. */
  visual?: "bubbles" | "papers" | "timeline";
}

/**
 * Full-bleed loading screen used for long research / generation round-trips.
 *
 * The progress value is an estimate derived from elapsed time because the
 * current API returns a single response. It advances confidently, then holds
 * near completion while the request finishes.
 */
export function LoadingScreen({
  eyebrow,
  title,
  detail,
  prompt,
  steps = [],
  estimatedDurationMs = 10000,
  progressLabel = "Estimated progress",
  visual = "bubbles",
}: LoadingScreenProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 180);
    return () => window.clearInterval(id);
  }, []);

  const normalizedSteps = useMemo<LoadingStep[]>(
    () =>
      steps.map((step, index) =>
        typeof step === "string"
          ? {
              label: step,
              progress:
                steps.length > 1
                  ? Math.round((index / (steps.length - 1)) * 86) + 7
                  : 40,
            }
          : step,
      ),
    [steps],
  );

  const duration = Math.max(estimatedDurationMs, 1200);
  const rawRatio = Math.min(elapsedMs / duration, 1);
  const easedRatio = 1 - Math.pow(1 - rawRatio, 3);
  const progress = Math.min(96, Math.round(6 + easedRatio * 90));
  const activeStepIndex = normalizedSteps.length
    ? normalizedSteps.reduce((activeIndex, step, index) => {
        const threshold =
          step.progress ??
          Math.round((index / Math.max(normalizedSteps.length - 1, 1)) * 86) +
            7;
        return progress >= threshold ? index : activeIndex;
      }, 0)
    : -1;
  const activeStep =
    activeStepIndex >= 0 ? normalizedSteps[activeStepIndex] : undefined;
  const visibleSteps =
    normalizedSteps.length > 0
      ? normalizedSteps
      : [{ label: "Preparing", progress: 20 }];
  const visiblePaperCount = Math.min(7, Math.max(2, Math.ceil(progress / 17)));
  const visibleTimelineCount = Math.min(
    5,
    Math.max(2, Math.ceil(progress / 22)),
  );

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 py-10 sm:px-8",
        "bg-[radial-gradient(circle_at_top,var(--accent-subtle),transparent_36%)]",
      )}
    >
      <div className="flex w-full max-w-[560px] flex-col items-center gap-6 text-center">
        {visual === "papers" ? (
          <div aria-hidden="true" className="relative h-32 w-56">
            <div className="absolute bottom-1 left-1/2 h-3 w-40 -translate-x-1/2 rounded-full bg-[color:var(--border-default)] opacity-60 blur-sm" />
            {Array.from({ length: visiblePaperCount }).map((_, index) => {
              const tilt = [-3, 2, -1, 3, -2, 1, 0][index] ?? 0;
              return (
                <div
                  key={index}
                  className="absolute left-1/2 h-20 w-36 -translate-x-1/2 animate-paper-add rounded-lg border border-[color:var(--border-default)] bg-bg-surface shadow-sm"
                  style={{
                    bottom: `${index * 7 + 8}px`,
                    transform: `translateX(-50%) rotate(${tilt}deg)`,
                  }}
                >
                  <span className="absolute left-4 top-4 h-1.5 w-20 rounded-full bg-[color:var(--border-default)]" />
                  <span className="absolute left-4 top-8 h-1.5 w-28 rounded-full bg-[color:var(--border-default)] opacity-80" />
                  <span className="absolute left-4 top-12 h-1.5 w-16 rounded-full bg-accent opacity-60" />
                </div>
              );
            })}
          </div>
        ) : visual === "timeline" ? (
          <div aria-hidden="true" className="relative h-32 w-64">
            <div className="absolute left-5 right-5 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[color:var(--border-default)]" />
            <div
              className="absolute left-5 top-1/2 h-2 -translate-y-1/2 rounded-full bg-accent transition-[width] duration-300 ease-out-soft"
              style={{ width: `calc((100% - 40px) * ${progress / 100})` }}
            />
            {Array.from({ length: visibleTimelineCount }).map((_, index) => {
              const left = 8 + index * 20;
              const isLast = index === visibleTimelineCount - 1;
              return (
                <div
                  key={index}
                  className="absolute top-1/2 animate-timeline-pop"
                  style={{ left: `${left}%`, animationDelay: `${index * 140}ms` }}
                >
                  <span
                    className={cn(
                      "absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--border-default)] bg-bg-surface shadow-sm",
                      isLast && "h-5 w-5 bg-[color:var(--accent-subtle)]",
                    )}
                  >
                    {isLast ? (
                      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "absolute left-1/2 h-9 w-12 -translate-x-1/2 rounded-lg border border-[color:var(--border-default)] bg-bg-surface shadow-sm",
                      index % 2 === 0 ? "-top-14" : "top-5",
                    )}
                  >
                    <span className="absolute left-2 top-2 h-1.5 w-8 rounded-full bg-[color:var(--border-default)]" />
                    <span className="absolute left-2 top-5 h-1.5 w-5 rounded-full bg-accent opacity-60" />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div aria-hidden="true" className="relative h-28 w-56">
            {visibleSteps.slice(0, 5).map((step, index) => {
              const isActive = step.label === activeStep?.label;
              const x = 14 + index * 40;
              const y = index % 2 === 0 ? 42 : 18;
              return (
                <span
                  key={step.label}
                  className={cn(
                    "absolute rounded-full border border-[color:var(--border-default)] bg-bg-surface shadow-sm",
                    "animate-bubble-pop",
                    isActive
                      ? "h-12 w-12 bg-[color:var(--accent-subtle)]"
                      : "h-8 w-8 opacity-70",
                  )}
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    animationDelay: `${index * 280}ms`,
                  }}
                >
                  {isActive ? (
                    <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
                  ) : null}
                </span>
              );
            })}
            <span className="absolute bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-accent" />
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            {eyebrow}
          </p>
          <h1 className="font-sans text-[30px] font-medium leading-[1.12] tracking-[-0.02em] text-text-primary sm:text-[36px]">
            {title}
          </h1>
          {detail ? (
            <p className="max-w-[40ch] text-[14px] leading-[1.55] text-text-secondary">
              {detail}
            </p>
          ) : null}
        </div>

        {/* {prompt ? (
          <blockquote
            className={cn(
              "max-h-24 w-full overflow-hidden rounded-2xl bg-bg-userMessage px-4 py-3 text-left text-[13px] leading-[1.5] text-text-primary",
              "border border-[color:var(--border-default)]",
            )}
          >
            {prompt}
          </blockquote>
        ) : null} */}

        <div className="w-full max-w-[360px]">
          <div
            role="progressbar"
            aria-label={progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--border-default)]"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out-soft"
              style={{ width: `${progress}%` }}
            />
          </div>
          {activeStep ? (
            <p
              key={activeStep.label}
              className="mt-3 animate-fade-up text-[13px] font-medium text-text-secondary"
            >
              Now: <span className="text-text-primary">{activeStep.label}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
