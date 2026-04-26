import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { LoadingScreen } from "@/components/LoadingScreen";
import {
  PromptInput,
  type PromptSubmitPayload,
} from "@/components/PromptInput";
import { startResearch } from "@/lib/api";
import { usePersonal } from "@/lib/personalSettingsContext";
import { cn } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * `/` — landing screen.
 *
 * Two visual states:
 *   1. Idle: greeting + prompt.
 *   2. Researching: full-screen {@link LoadingScreen} while
 *      `startResearch()` is in flight (~10s). On success the user is taken
 *      to `/projects/:id`; on failure we drop back to idle with the prompt
 *      still typed in.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const { settings } = usePersonal();

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const greeting = getGreeting();
  const firstName = settings.displayName.trim().split(/\s+/)[0] ?? "";
  const greetingLine = firstName
    ? `${greeting}, ${firstName}.`
    : `${greeting}.`;

  const handleSubmit = async ({ text }: PromptSubmitPayload) => {
    const hypothesis = text.trim();
    if (hypothesis.length === 0) return;

    setError(null);
    setPendingPrompt(hypothesis);

    try {
      const project = await startResearch(hypothesis);
      navigate(`/projects/${project.id}/graph`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setPendingPrompt(null);
    }
  };

  if (pendingPrompt) {
    return (
      <LoadingScreen
        eyebrow="Reviewing the literature"
        title="Reading the field for you"
        detail="Surfacing related work — this usually takes about ten seconds."
        prompt={pendingPrompt}
        steps={[
          "Searching related abstracts",
          "Scoring similarity to your hypothesis",
          "Ranking the most useful matches",
        ]}
      />
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <section
        className={cn(
          "mx-auto flex w-full max-w-[var(--chat-max-width)] flex-col items-center justify-center px-6 sm:px-8",
        )}
        aria-label="LabPilot landing"
      >
        <div className="flex w-full flex-col items-center gap-8 pb-10 pt-28 animate-fade-in sm:pt-32">
          <header className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-sans text-[34px] font-medium leading-[1.15] tracking-[-0.01em] text-text-primary sm:text-[40px]">
              {greetingLine} What's your hypothesis?
            </h1>
            <p className="max-w-[52ch] text-[15px] leading-[1.6] text-text-secondary">
              Describe what you want to test. LabPilot will surface related
              work, design experiments, draft a timeline, and estimate the
              budget.
            </p>
          </header>

          {error ? (
            <div
              role="alert"
              className={cn(
                "w-full max-w-[560px] rounded-md border border-[color:var(--border-default)]",
                "bg-bg-surface px-3.5 py-2.5 text-[13px] text-text-secondary",
              )}
            >
              <span className="font-medium text-text-primary">
                Couldn't start research:
              </span>{" "}
              {error}
            </div>
          ) : null}

          <div className="w-full">
            <PromptInput onSubmit={handleSubmit} />
          </div>
        </div>
      </section>
    </main>
  );
}
