import { CalendarRange, Sparkles } from "lucide-react";
import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { LoadingScreen } from "@/components/LoadingScreen";
import { PaperGraph } from "@/components/PaperGraph";
import { PaperList } from "@/components/PaperList";
import { StatisticsView } from "@/components/statistics/StatisticsView";
import { TimelineGraph } from "@/components/timeline/TimelineGraph";
import { WorkflowNodeDetailPanel } from "@/components/timeline/WorkflowNodeDetailPanel";
import {
  TIMELINE_DAY_WIDTH,
  TIMELINE_TRACK_HEIGHT,
  type WorkflowNodeData,
} from "@/components/timeline/WorkflowNode";
import { generateProject, getProject, updateWorkflowNode } from "@/lib/api";
import type { Paper } from "@/lib/papers";
import {
  STATUS_LABEL,
  type Project,
  type Workflow,
  formatRelativeTime,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type ProjectPageSlug = "graph" | "statistics" | "literature";

function isProjectPageSlug(value: string | undefined): value is ProjectPageSlug {
  return value === "graph" || value === "statistics" || value === "literature";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseWorkflowDate(value: string | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : new Date(time);
}

function formatWorkflowDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addWorkflowDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getWorkflowBaseDate(workflow: Workflow | undefined): Date {
  const dates =
    workflow?.nodes
      .map((node) => parseWorkflowDate(node.data.startDate))
      .filter((date): date is Date => Boolean(date)) ?? [];
  if (dates.length === 0) return new Date();
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function getDayOffset(baseDate: Date, startDate: string | undefined): number {
  const date = parseWorkflowDate(startDate);
  if (!date) return 0;
  return Math.max(0, Math.round((date.getTime() - baseDate.getTime()) / MS_PER_DAY));
}

function snapTrack(y: number): number {
  return Math.round(y / TIMELINE_TRACK_HEIGHT) * TIMELINE_TRACK_HEIGHT;
}

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
  const { id, page } = useParams<{ id: string; page?: string }>();
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

  const handleProjectChange = useCallback((project: Project) => {
    setState({ kind: "ready", project });
  }, []);

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
  const activePage = isProjectPageSlug(page) ? page : null;

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
    if (!activePage) {
      return <Navigate to={`/projects/${project.id}/graph`} replace />;
    }

    return (
      <ProjectWorkspaceView
        project={project}
        page={activePage}
        onGenerate={() => {
          void handleGenerate();
        }}
        onProjectChange={handleProjectChange}
      />
    );
  }

  if (!activePage) {
    return <Navigate to={`/projects/${project.id}/graph`} replace />;
  }

  return (
    <ProjectWorkspaceView
      project={project}
      workflow={project.workflow}
      page={activePage}
      onGenerate={() => {
        void handleGenerate();
      }}
      onProjectChange={handleProjectChange}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Project subpages                                                           */
/* -------------------------------------------------------------------------- */

interface WorkflowViewProps {
  project: Project;
  workflow?: Workflow;
  page: ProjectPageSlug;
  onGenerate: () => void;
  onProjectChange: (project: Project) => void;
}

function ProjectWorkspaceView({
  project,
  workflow,
  page,
  onGenerate,
  onProjectChange,
}: WorkflowViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const workflowBaseDate = useMemo(() => getWorkflowBaseDate(workflow), [workflow]);

  const flowNodes = useMemo<Node<WorkflowNodeData>[]>(
    () =>
      (workflow?.nodes ?? []).map((n, index) => ({
        id: n.id,
        type: "workflow",
        position: {
          x: getDayOffset(workflowBaseDate, n.data.startDate) * TIMELINE_DAY_WIDTH,
          y: snapTrack(n.position.y),
        },
        data: n.data as WorkflowNodeData,
        draggable: index !== 0,
      })),
    [workflow?.nodes, workflowBaseDate],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      (workflow?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    [workflow?.edges],
  );

  const selectedNode = useMemo(
    () => flowNodes.find((n) => n.id === selectedNodeId) ?? null,
    [flowNodes, selectedNodeId],
  );

  const hasGraph = flowNodes.length > 0;

  useEffect(() => {
    if (page !== "graph") setSelectedNodeId(null);
  }, [page]);

  const handleNodeDataChange = useCallback(
    async (nodeId: string, data: WorkflowNodeData) => {
      const next = await updateWorkflowNode(project.id, nodeId, data);
      onProjectChange(next);
    },
    [onProjectChange, project.id],
  );

  const handleNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const firstNodeId = workflow?.nodes[0]?.id;
      if (!workflow || nodeId === firstNodeId) return;

      const snappedX = Math.max(0, Math.round(position.x / TIMELINE_DAY_WIDTH) * TIMELINE_DAY_WIDTH);
      const snappedY = snapTrack(position.y);
      const startDate = formatWorkflowDate(
        addWorkflowDays(workflowBaseDate, Math.round(snappedX / TIMELINE_DAY_WIDTH)),
      );

      void updateWorkflowNode(
        project.id,
        nodeId,
        { startDate },
        { x: snappedX, y: snappedY },
      ).then(onProjectChange);
    },
    [onProjectChange, project.id, workflow, workflowBaseDate],
  );

  return (
    <main className="relative flex h-screen min-h-0 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        right={
          workflow ? null : <BuildTimelineButton onGenerate={onGenerate} />
        }
      />

      {page === "graph" && workflow ? (
        <section className="relative min-h-[560px] flex-1 overflow-hidden bg-bg-primary">
          {hasGraph ? (
            <TimelineGraph
              initialNodes={flowNodes}
              initialEdges={flowEdges}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
              onNodeMove={handleNodeMove}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <p className="max-w-[44ch] text-[13px] leading-[1.55] text-text-tertiary">
                No workflow graph was returned for this project yet.
              </p>
            </div>
          )}
        </section>
      ) : page === "graph" ? (
        <ResearchGraphPage project={project} onGenerate={onGenerate} />
      ) : page === "statistics" ? (
        workflow ? (
          <StatisticsView
            prompt={project.hypothesis}
            papers={project.papers ?? []}
            workflow={workflow}
          />
        ) : (
          <GeneratePlaceholder onGenerate={onGenerate} />
        )
      ) : (
        <LiteratureTab papers={project.papers ?? []} />
      )}

      {page === "graph" && selectedNode ? (
        <WorkflowNodeDetailPanel
          key={selectedNode.id}
          data={selectedNode.data}
          onChange={(data) => handleNodeDataChange(selectedNode.id, data)}
          onClose={() => setSelectedNodeId(null)}
        />
      ) : null}
    </main>
  );
}

function ResearchGraphPage({
  project,
  onGenerate,
}: {
  project: Project;
  onGenerate: () => void;
}) {
  const papers = project.papers ?? [];
  const topSimilarity = papers[0]?.similarity ?? 0;

  return (
    <section className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-5 overflow-y-auto px-8 py-8">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Related work graph
        </p>
        <h2 className="mt-1 font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          {papers.length} papers with similar experiments
        </h2>
        {papers.length > 0 ? (
          <p className="mt-1 text-[12.5px] text-text-secondary">
            Top match: {Math.round(topSimilarity * 100)}% similarity
          </p>
        ) : null}
      </header>

      <div className="rounded-md border border-[color:var(--border-default)] bg-bg-surface p-5 shadow-sm">
        {papers.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-text-tertiary">
            No related papers were returned. You can still build the timeline
            from your hypothesis.
          </p>
        ) : (
          <div className="h-[420px]">
            <PaperGraph prompt={project.hypothesis} papers={papers} />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <BuildTimelineButton onGenerate={onGenerate} />
      </div>
    </section>
  );
}

function GeneratePlaceholder({ onGenerate }: { onGenerate: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center px-8 py-24 text-center">
      <div className="flex max-w-[42ch] flex-col items-center gap-3">
        <h2 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Build the experiment timeline first
        </h2>
        <p className="text-[13px] leading-[1.55] text-text-secondary">
          Statistics are generated from the workflow milestones, effort, and
          related papers.
        </p>
        <BuildTimelineButton onGenerate={onGenerate} />
      </div>
    </section>
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
    <section className="mx-auto w-full max-w-[1080px] flex-1 overflow-y-auto px-8 py-8">
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
  right?: React.ReactNode;
}

function ProjectHeader({ project, right }: ProjectHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-6 border-b border-[color:var(--border-default)]",
        "bg-bg-primary/95 px-8 pb-4 pt-6 backdrop-blur",
      )}
    >
      <div className="min-w-0 flex-1">
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

function BuildTimelineButton({ onGenerate }: { onGenerate: () => void }) {
  return (
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
