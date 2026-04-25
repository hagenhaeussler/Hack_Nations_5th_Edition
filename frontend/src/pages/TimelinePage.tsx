import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { EXAMPLE_NODES } from "@/components/timeline/exampleWorkflow";
import { TimelineGraph } from "@/components/timeline/TimelineGraph";
import { WorkflowNodeDetailPanel } from "@/components/timeline/WorkflowNodeDetailPanel";
import {
  WorkspaceSidebar,
  type WorkspaceSection,
} from "@/components/WorkspaceSidebar";
import { cn } from "@/lib/utils";

interface TimelinePageProps {
  /** Hypothesis carried over from the landing page, optional. */
  prompt?: string;
  /** Returns the user to the search/landing view. */
  onBack: () => void;
  /** Optional — opens the lab-settings page when the sidebar entry is clicked. */
  onOpenLabSettings?: () => void;
  onOpenPersonalSettings?: () => void;
  onOpenHome?: () => void;
}

/**
 * Timeline view: shows an experiment-preparation DAG on a freely pannable
 * dotted grid. Sidebar carries the workspace nav (Graph / Statistics /
 * Literature) plus the lab/personal settings, per design_guide.md §5.2.
 *
 * Clicking a node opens the right-side detail panel (~1/3 of the viewport).
 */
export function TimelinePage({
  prompt,
  onBack,
  onOpenLabSettings,
  onOpenPersonalSettings,
  onOpenHome,
}: TimelinePageProps) {
  const [active, setActive] = useState<WorkspaceSection>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => EXAMPLE_NODES.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId],
  );

  return (
    <main className="relative flex min-h-screen w-full bg-bg-primary text-text-primary">
      <WorkspaceSidebar
        active={active}
        onSelect={(section) => {
          setActive(section);
          if (section !== "graph") setSelectedNodeId(null);
        }}
        onOpenLabSettings={onOpenLabSettings}
        onOpenPersonalSettings={onOpenPersonalSettings}
        onOpenHome={onOpenHome ?? onBack}
      />

      <div
        className="flex min-h-screen flex-1 flex-col"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <PageHeader prompt={prompt} onBack={onBack} />

        {active === "graph" ? (
          <section className="relative flex-1">
            <TimelineGraph
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
            />
          </section>
        ) : (
          <ComingSoonSection section={active} />
        )}
      </div>

      {active === "graph" && selectedNode && (
        <WorkflowNodeDetailPanel
          key={selectedNode.id}
          data={selectedNode.data}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </main>
  );
}

interface PageHeaderProps {
  prompt?: string;
  onBack: () => void;
}

function PageHeader({ prompt, onBack }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-6 border-b border-[color:var(--border-default)]",
        "bg-bg-primary/95 px-8 pb-4 pt-6 backdrop-blur",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="font-sans text-[20px] font-medium tracking-[-0.01em] text-text-primary">
            Experiment timeline
          </h1>
          <span className="rounded-full bg-[color:var(--accent-subtle)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-accent">
            Example workflow
          </span>
        </div>
        {prompt ? (
          <div className="mt-2 max-w-[640px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Hypothesis
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.55] text-text-primary">
              {prompt}
            </p>
          </div>
        ) : (
          <p className="mt-2 max-w-[640px] text-[13px] leading-[1.55] text-text-secondary">
            A reference workflow for preparing a basic experiment. Drag the
            background to pan; scroll or use the controls to zoom. Click any
            step to see its details.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-[color:var(--border-default)]",
          "px-3 py-1.5 text-[13px] text-text-secondary",
          "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
        )}
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to search
      </button>
    </header>
  );
}

function ComingSoonSection({ section }: { section: WorkspaceSection }) {
  const labels: Record<WorkspaceSection, string> = {
    graph: "Graph",
    statistics: "Statistics",
    literature: "Literature",
  };
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        Coming soon
      </p>
      <h2 className="font-sans text-[24px] font-medium tracking-[-0.01em] text-text-primary">
        {labels[section]}
      </h2>
      <p className="max-w-[48ch] text-[13px] leading-[1.6] text-text-secondary">
        This section is on the roadmap. The graph view is the live timeline
        for your experiment.
      </p>
    </section>
  );
}
