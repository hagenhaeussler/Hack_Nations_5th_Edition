import {
  ArrowLeft,
  CalendarRange,
  List,
  Network,
  Sparkles,
} from "lucide-react";
import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LoadingScreen } from "@/components/LoadingScreen";
import { PaperGraph } from "@/components/PaperGraph";
import { PaperList } from "@/components/PaperList";
import { StatisticsView } from "@/components/statistics/StatisticsView";
import { TimelineGraph } from "@/components/timeline/TimelineGraph";
import { WorkflowNodeDetailPanel } from "@/components/timeline/WorkflowNodeDetailPanel";
import type { WorkflowNodeData } from "@/components/timeline/WorkflowNode";
import { generateProject, getProject } from "@/lib/api";
import type { Paper } from "@/lib/papers";
import {
  STATUS_LABEL,
  type Project,
  type Workflow,
  formatRelativeTime,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type Tab = "graph" | "statistics" | "literature";

/**
 * `/projects/:id` — single-project workspace.
 *
 * The view is driven by `project.status`:
 *   - `research-ready`: literature panel with a CTA to generate the workflow.
 *   - `ready`: tabbed graph / statistics / literature view.
 *   - `researching` / `generating`: loading screen (rare — only when a stale
 *     status is fetched mid-flight; the normal loading lives at the call
 *     site).
 *
 * The `/api/projects/:id/generate` round-trip takes ~10s; while it's in
 * flight we show a {@link LoadingScreen} and then swap into the workflow
 * view in place — no extra navigation step, so back/forward stays clean.
 */
export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; project: Project }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState({ kind: "loading" });
    getProject(id)
      .then((project) => {
        if (!cancelled) setState({ kind: "ready", project });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleGenerate = useCallback(async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const next = await generateProject(id);
      setState({ kind: "ready", project: next });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ kind: "error", message });
    } finally {
      setGenerating(false);
    }
  }, [id]);

  if (state.kind === "loading") {
    return (
      <LoadingScreen
        eyebrow="Loading"
        title="Opening project"
        detail="Fetching the latest snapshot of this project."
      />
    );
  }

  if (state.kind === "error") {
    return (
      <ErrorView
        message={state.message}
        onBack={() => navigate("/projects")}
      />
    );
  }

  const { project } = state;

  if (generating || project.status === "generating") {
    return (
      <LoadingScreen
        eyebrow="Designing the experiment"
        title="Drafting your timeline"
        detail="Mapping milestones, dependencies, and prep work for the experiment."
        prompt={project.hypothesis}
        steps={[
          "Sequencing the experimental steps",
          "Slotting in pilot and refinement runs",
          "Estimating effort per milestone",
        ]}
      />
    );
  }

  if (project.status === "researching") {
    return (
      <LoadingScreen
        eyebrow="Reviewing the literature"
        title="Reading the field"
        detail="Surfacing related work for your hypothesis."
        prompt={project.hypothesis}
      />
    );
  }

  if (project.status === "research-ready" || !project.workflow) {
    return (
      <ResearchView
        project={project}
        onGenerate={() => {
          void handleGenerate();
        }}
        onBack={() => navigate("/")}
      />
    );
  }

  return (
    <WorkflowView
      project={project}
      workflow={project.workflow}
      onBack={() => navigate("/projects")}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Research view (status: research-ready)                                    */
/* -------------------------------------------------------------------------- */

interface ResearchViewProps {
  project: Project;
  onGenerate: () => void;
  onBack: () => void;
}

function ResearchView({ project, onGenerate, onBack }: ResearchViewProps) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const papers = project.papers ?? [];
  const topSimilarity = papers[0]?.similarity ?? 0;

  return (
    <main className="flex min-h-screen flex-col">
      <ProjectHeader
        project={project}
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={onGenerate}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white",
              "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
            )}
          >
            <CalendarRange size={14} strokeWidth={1.75} />
            Build experiment timeline
          </button>
        }
      />

      <section className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-5 px-8 py-8">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Related work
            </p>
            <h2 className="mt-1 font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
              {papers.length} papers with similar experiments
            </h2>
            {papers.length > 0 ? (
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Top match: {Math.round(topSimilarity * 100)}% similarity
              </p>
            ) : null}
          </div>
          <ViewToggle view={view} onChange={setView} />
        </header>

        <div className="rounded-md border border-[color:var(--border-default)] bg-bg-surface p-5 shadow-sm">
          {papers.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-text-tertiary">
              No related papers were returned. You can still build the timeline
              from your hypothesis above.
            </p>
          ) : view === "graph" ? (
            <div className="h-[420px]">
              <PaperGraph prompt={project.hypothesis} papers={papers} />
            </div>
          ) : (
            <PaperList papers={papers} />
          )}
        </div>
      </section>
    </main>
  );
}

interface ViewToggleProps {
  view: "graph" | "list";
  onChange: (next: "graph" | "list") => void;
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

/* -------------------------------------------------------------------------- */
/*  Workflow view (status: ready)                                             */
/* -------------------------------------------------------------------------- */

interface WorkflowViewProps {
  project: Project;
  workflow: Workflow;
  onBack: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "statistics", label: "Statistics" },
  { id: "literature", label: "Literature" },
];

function WorkflowView({ project, workflow, onBack }: WorkflowViewProps) {
  const [tab, setTab] = useState<Tab>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const flowNodes = useMemo<Node<WorkflowNodeData>[]>(
    () =>
      workflow.nodes.map((n) => ({
        id: n.id,
        type: "workflow",
        position: n.position,
        data: n.data as WorkflowNodeData,
      })),
    [workflow.nodes],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    [workflow.edges],
  );

  const selectedNode = useMemo(
    () => flowNodes.find((n) => n.id === selectedNodeId) ?? null,
    [flowNodes, selectedNodeId],
  );

  const hasGraph = flowNodes.length > 0;

  return (
    <main className="relative flex h-screen min-h-0 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        onBack={onBack}
        right={
          <nav
            role="tablist"
            aria-label="Project view"
            className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--border-default)] bg-bg-surface p-0.5"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  if (t.id !== "graph") setSelectedNodeId(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium",
                  "transition-colors duration-[var(--duration-fast)]",
                  tab === t.id
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        }
      />

      {tab === "graph" ? (
        <section className="relative min-h-[560px] flex-1 overflow-hidden bg-bg-primary">
          {hasGraph ? (
            <TimelineGraph
              initialNodes={flowNodes}
              initialEdges={flowEdges}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <p className="max-w-[44ch] text-[13px] leading-[1.55] text-text-tertiary">
                No workflow graph was returned for this project yet.
              </p>
            </div>
          )}
        </section>
      ) : tab === "statistics" ? (
        <StatisticsView
          prompt={project.hypothesis}
          papers={project.papers ?? []}
          workflow={workflow}
        />
      ) : (
        <LiteratureTab papers={project.papers ?? []} />
      )}

      {tab === "graph" && selectedNode ? (
        <WorkflowNodeDetailPanel
          key={selectedNode.id}
          data={selectedNode.data}
          onClose={() => setSelectedNodeId(null)}
        />
      ) : null}
    </main>
  );
}

function LiteratureTab({ papers }: { papers: Paper[] }) {
  if (papers.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center px-8 py-24 text-center">
        <p className="max-w-[44ch] text-[13px] leading-[1.55] text-text-tertiary">
          No literature was attached to this project.
        </p>
      </section>
    );
  }
  return (
    <section className="mx-auto w-full max-w-[1080px] flex-1 px-8 py-8">
      <header className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Literature
        </p>
        <h2 className="mt-1 font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          {papers.length} related papers
        </h2>
      </header>
      <PaperList papers={papers} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared chrome                                                              */
/* -------------------------------------------------------------------------- */

interface ProjectHeaderProps {
  project: Project;
  onBack: () => void;
  right?: React.ReactNode;
}

function ProjectHeader({ project, onBack, right }: ProjectHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-6 border-b border-[color:var(--border-default)]",
        "bg-bg-primary/95 px-8 pb-4 pt-6 backdrop-blur",
      )}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "mb-2 inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] text-text-secondary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          Back
        </button>
        <div className="flex items-center gap-2">
          <h1 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
            {project.title}
          </h1>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em]",
              project.status === "ready"
                ? "bg-[color:var(--accent-subtle)] text-accent"
                : "bg-bg-hover text-text-secondary",
            )}
          >
            {STATUS_LABEL[project.status]}
          </span>
          <span className="text-[11.5px] text-text-tertiary">
            · {formatRelativeTime(project.updatedAt)}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 max-w-[640px] text-[13px] leading-[1.55] text-text-primary">
          <Sparkles
            size={12}
            strokeWidth={1.5}
            className="mr-1 inline align-baseline text-text-tertiary"
          />
          {project.hypothesis}
        </p>
      </div>

      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

function ErrorView({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
        Couldn't open this project
      </h1>
      <p className="max-w-[44ch] text-[13px] text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onBack}
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--border-default)] px-3 py-1.5 text-[13px] text-text-secondary",
          "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
        )}
      >
        Back to projects
      </button>
    </main>
  );
}
