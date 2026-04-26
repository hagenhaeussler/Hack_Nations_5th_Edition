import { useEffect, useRef, useState } from "react";

import { ProjectsSection } from "@/components/ProjectsSection";
import {
  PromptInput,
  type PromptSubmitPayload,
} from "@/components/PromptInput";
import { SidebarRail } from "@/components/SidebarRail";
import { SimilarPapersPanel } from "@/components/SimilarPapersPanel";
import { sendPrompt } from "@/lib/api";
import { usePersonal } from "@/lib/personalSettingsContext";
import type { Project } from "@/lib/projects";
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

  const heroRef = useRef<HTMLDivElement | null>(null);

  // When the user picks a past project we pre-fill the input and scroll the
  // hero back into view so they can immediately edit and submit.
  useEffect(() => {
    if (draft !== null) {
      heroRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [draft]);

  // When the panel opens, snap the page back to the top so the hero column
  // (which is now the only thing in the document flow) is centered in the
  // viewport regardless of where the user scrolled before submitting.
  useEffect(() => {
    if (hasActiveSearch) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [hasActiveSearch]);

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

  const handleProjectSelect = (project: Project) => {
    setDraft(project.hypothesis);
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-bg-primary text-text-primary">
      <SidebarRail
        onOpenLabSettings={onOpenLabSettings}
        onOpenPersonalSettings={onOpenPersonalSettings}
      />

      {/* Hero. design_guide §5.3.
       *
       *  Idle state: the section is sized to its content so the
       *  past-projects grid sits visually close to the input.
       *  Active-search state: the section locks to the full viewport
       *  height (matching `SimilarPapersPanel`'s `md:w-1/2`) and the
       *  inner column caps at a comfortable width so the input has clear
       *  breathing room from both the sidebar rail on the left and the
       *  panel edge on the right. */}
      <section
        ref={heroRef}
        className={cn(
          "flex flex-col items-center justify-center px-6 sm:px-8",
          "transition-[max-width,margin] duration-[var(--duration-slow)] ease-[var(--ease-default)]",
          hasActiveSearch
            ? "mx-0 ml-0 min-h-screen w-full max-w-none md:mr-[50vw]"
            : "mx-auto w-full max-w-[var(--chat-max-width)]",
        )}
        aria-label="LabPilot landing"
      >
        <div
          className={cn(
            "flex w-full flex-col items-center gap-8 animate-fade-in",
            hasActiveSearch
              ? "mx-auto max-w-[560px] py-16"
              : "pb-10 pt-28 sm:pt-32",
          )}
        >
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

          <div className="w-full">
            <PromptInput
              key={draft ?? "default"}
              initialValue={draft ?? ""}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </section>

      {/* Past projects — discoverable by scrolling. Hidden when the search
       *  panel is open so the focus stays on the conversation. */}
      {!hasActiveSearch && (
        <ProjectsSection onSelect={handleProjectSelect} />
      )}

      {/* Page-edge fade — tight to the bottom of the viewport. The bottom
       *  ~95px stays solid so the sidebar settings buttons (z-20) always
       *  sit on a clean canvas; only the topmost ~50px softly fades the
       *  card above. pointer-events-none so it never blocks clicks. */}
      {!hasActiveSearch && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed bottom-0 left-0 right-0 z-10 h-36",
            "bg-gradient-to-t from-[color:var(--bg-primary)] from-65% to-transparent",
          )}
        />
      )}

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
    <header className="flex w-full flex-col gap-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        Current search
      </p>
      <div className="self-end max-w-[90%] rounded-xl bg-bg-userMessage px-4 py-3 text-[15px] leading-[1.6] text-text-primary">
        {prompt}
      </div>
      <p className="text-[13px] text-text-secondary">
        Reviewing related work on the right. Refine your hypothesis below to
        re-rank the matches.
      </p>
    </header>
  );
}
