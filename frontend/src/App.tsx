import { useState } from "react";

import { LabSettingsPage } from "@/pages/LabSettingsPage";
import { LandingPage } from "@/pages/LandingPage";
import { PersonalSettingsPage } from "@/pages/PersonalSettingsPage";
import { TimelinePage } from "@/pages/TimelinePage";

type View =
  | { name: "landing" }
  | { name: "timeline"; prompt: string }
  | { name: "lab-settings" }
  | { name: "personal-settings" };

export default function App() {
  // Lightweight in-memory router. The active search prompt persists across
  // landing → timeline navigation so the timeline stub can quote it back.
  const [view, setView] = useState<View>({ name: "landing" });
  const [activePrompt, setActivePrompt] = useState<string | null>(null);

  const goLanding = () => setView({ name: "landing" });
  const goLabSettings = () => setView({ name: "lab-settings" });
  const goPersonalSettings = () => setView({ name: "personal-settings" });

  if (view.name === "timeline") {
    return (
      <TimelinePage
        prompt={view.prompt}
        onBack={goLanding}
        onOpenLabSettings={goLabSettings}
        onOpenPersonalSettings={goPersonalSettings}
      />
    );
  }

  if (view.name === "lab-settings") {
    return (
      <LabSettingsPage
        onBack={goLanding}
        onOpenPersonalSettings={goPersonalSettings}
      />
    );
  }

  if (view.name === "personal-settings") {
    return (
      <PersonalSettingsPage
        onBack={goLanding}
        onOpenLabSettings={goLabSettings}
      />
    );
  }

  return (
    <LandingPage
      activePrompt={activePrompt}
      onSearch={(prompt) => setActivePrompt(prompt)}
      onArchive={() => setActivePrompt(null)}
      onOpenTimeline={(prompt) => setView({ name: "timeline", prompt })}
      onOpenLabSettings={goLabSettings}
      onOpenPersonalSettings={goPersonalSettings}
    />
  );
}
