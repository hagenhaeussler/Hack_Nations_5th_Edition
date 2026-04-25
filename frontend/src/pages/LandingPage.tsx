import { useState } from "react";

import {
  PromptInput,
  type PromptSubmitPayload,
} from "@/components/PromptInput";
import { SidebarRail } from "@/components/SidebarRail";
import { SimilarPapersPanel } from "@/components/SimilarPapersPanel";
import { SuggestionChips } from "@/components/SuggestionChips";
import { sendPrompt } from "@/lib/api";
import { usePersonal } from "@/lib/personalSettingsContext";
import { cn } from "@/lib/utils";

interface LandingPageProps {
  /** Current active search prompt — when set, the panel is open. */
  activePrompt: string | null;
  /** Called when the user submits a new prompt. */
  onSearch: (prompt: string) => void;
  /** Closes the panel and clears the active search. */
  onArchive: () => void;
  /** Routes to the timeline page, carrying the prompt across. */
  onOpenTimeline: (prompt: string) => void;
  /** Routes to the lab settings page. */
  onOpenLabSettings: () => void;
  /** Routes to the personal settings page. */
  onOpenPersonalSettings: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function LandingPage({
  activePrompt,
  onSearch,
  onArchive,
  onOpenTimeline,
  onOpenLabSettings,
  onOpenPersonalSettings,
}: LandingPageProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const hasActiveSearch = activePrompt !== null;
  const { settings } = usePersonal();
  const greeting = getGreeting();
  const firstName = settings.displayName.trim().split(/\s+/)[0] ?? "";
  const greetingLine = firstName
    ? `${greeting}, ${firstName}.`
    : `${greeting}.`;

  const handleSubmit = async ({ text, attachments }: PromptSubmitPayload) => {
    if (text.trim().length === 0) return;

    // Open the panel optimistically — design_guide §10.3 prefers responsive
    // motion over waiting on the network.
    onSearch(text.trim());

    try {
      await sendPrompt({ text, attachments });
    } catch (err) {
      // Quiet failure for the landing page; a future toast will surface this.
      console.error("Failed to send prompt", err);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-bg-primary text-text-primary">
      <SidebarRail
        onOpenLabSettings={onOpenLabSettings}
        onOpenPersonalSettings={onOpenPersonalSettings}
      />

      {/* Centered chat column — design_guide §5.3.
       *  When the similar-papers panel is open the column shrinks to the
       *  left half (design_guide §8.6 split view). */}
      <section
        className={cn(
          "flex flex-1 flex-col items-center justify-center px-6 sm:px-8",
          "transition-[max-width,margin] duration-[var(--duration-slow)] ease-[var(--ease-default)]",
          hasActiveSearch
            ? "mx-0 ml-0 w-full max-w-none lg:mr-[50vw]"
            : "mx-auto w-full max-w-[var(--chat-max-width)]",
        )}
        aria-label="LabPilot landing"
      >
        <div className="flex w-full flex-col items-center gap-8 pb-24 pt-32 animate-fade-in">
          {hasActiveSearch ? (
            <ActiveSearchHeader prompt={activePrompt} />
          ) : (
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
          )}

          <div
            className={cn(
              "w-full",
              hasActiveSearch && "mx-auto max-w-[var(--chat-max-width)]",
            )}
          >
            <PromptInput
              key={draft ?? "default"}
              initialValue={draft ?? ""}
              onSubmit={handleSubmit}
            />
          </div>

          {!hasActiveSearch ? (
            <SuggestionChips onPick={(prompt) => setDraft(prompt)} />
          ) : null}
        </div>
      </section>

      {hasActiveSearch ? (
        <SimilarPapersPanel
          prompt={activePrompt}
          onArchive={onArchive}
          onOpenTimeline={() => onOpenTimeline(activePrompt)}
        />
      ) : null}
    </main>
  );
}

interface ActiveSearchHeaderProps {
  prompt: string;
}

function ActiveSearchHeader({ prompt }: ActiveSearchHeaderProps) {
  return (
    <header className="flex w-full max-w-[var(--chat-max-width)] flex-col gap-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        Current search
      </p>
      <div className="self-end max-w-[85%] rounded-xl bg-bg-userMessage px-4 py-3 text-[15px] leading-[1.6] text-text-primary">
        {prompt}
      </div>
      <p className="text-[13px] text-text-secondary">
        Reviewing related work on the right. Refine your hypothesis below to
        re-rank the matches.
      </p>
    </header>
  );
}
