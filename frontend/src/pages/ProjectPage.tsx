import { CalendarRange, GitBranch, ListChecks, MessageCircle, ShieldAlert, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { LoadingScreen } from "@/components/LoadingScreen";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PaperGraph } from "@/components/PaperGraph";
import { PaperList } from "@/components/PaperList";
import { RiskAnalyzerModal } from "@/components/risk/RiskAnalyzerModal";
import { StatisticsView } from "@/components/statistics/StatisticsView";
import {
  PlanQASidebar,
  type PlanQAMessage,
} from "@/components/timeline/PlanQASidebar";
import { WorkflowNodeDetailPanel } from "@/components/timeline/WorkflowNodeDetailPanel";
import type { WorkflowNodeData } from "@/components/timeline/WorkflowNode";
import {
  applyPlanEdit,
  applyPlanEdits,
  generateProject,
  getProject,
  type PlanQASuggestedAction,
} from "@/lib/api";
import type { Paper } from "@/lib/papers";
import {
  STATUS_LABEL,
  type PlanEditRequest,
  type PrePlan,
  type Project,
  type Workflow,
  formatRelativeTime,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type ProjectPageSlug = "calendar" | "statistics" | "literature";

function isProjectPageSlug(value: string | undefined): value is ProjectPageSlug {
  return value === "calendar" || value === "statistics" || value === "literature";
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * `/projects/:id` — single-project workspace.
 *
 * The view is driven by `project.status`:
 *   - `research-ready`: literature panel with a CTA to generate the calendar.
 *   - `ready`: tabbed calendar / statistics / literature view.
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
        title="Drafting your calendar"
        detail="Placing scheduled tasks into day buckets for the experiment calendar."
        prompt={project.hypothesis}
        steps={[
          "Drafting scheduled task cards",
          "Grouping work into week and day buckets",
          "Estimating effort, resources, and budget",
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
      return <Navigate to={`/projects/${project.id}/calendar`} replace />;
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
    return <Navigate to={`/projects/${project.id}/calendar`} replace />;
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
  const navigate = useNavigate();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [learningNotice, setLearningNotice] = useState<string | null>(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [qaMessagesByPlan, setQaMessagesByPlan] = useState<Record<string, PlanQAMessage[]>>({});
  const planId = project.finalPlan?.plan_id ?? null;
  const qaMessages = planId ? (qaMessagesByPlan[planId] ?? []) : [];
  const nodeLabels = useMemo(
    () =>
      Object.fromEntries(
        (workflow?.nodes ?? []).map((node) => [node.id, node.data.stepName]),
      ),
    [workflow?.nodes],
  );

  const selectedNode = useMemo(
    () => (workflow?.nodes ?? []).find((n) => n.id === selectedNodeId) ?? null,
    [workflow?.nodes, selectedNodeId],
  );

  const hasCalendar = (workflow?.nodes ?? []).length > 0;

  useEffect(() => {
    if (page !== "calendar") setSelectedNodeId(null);
  }, [page]);

  useEffect(() => {
    if (page !== "calendar") setQaOpen(false);
  }, [page]);

  useEffect(() => {
    if (!learningNotice) return;
    const timeout = window.setTimeout(() => setLearningNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [learningNotice]);

  const handleNodeDataChange = useCallback(
    async (nodeId: string, data: WorkflowNodeData) => {
      const current = workflow?.nodes.find((node) => node.id === nodeId);
      if (!current) return;
      const currentData = current.data as Record<string, unknown>;
      const edits = (Object.entries(data) as Array<[keyof WorkflowNodeData, unknown]>)
        .filter(([field, value]) => !sameJsonValue(currentData[String(field)], value))
        .map(([field, value]): PlanEditRequest => ({
          change_source: "frontend_calendar_edit",
          target_type: "task",
          target_id: nodeId,
          field_changed: String(field),
          old_value: currentData[String(field)],
          new_value: value,
          metadata: { ui_context: "calendar_task_detail_panel" },
        }));
      if (edits.length === 0) return;
      const result = await applyPlanEdits(project.id, edits);
      onProjectChange(result.project);
      if (result.generated_lesson_cards.length > 0) {
        setLearningNotice("Learning saved: Future similar experiments will use this correction.");
      }
    },
    [onProjectChange, project.id, workflow?.nodes],
  );

  const handleTaskMove = useCallback(
    (taskId: string, startDate: string) => {
      if (!workflow) return;
      const current = workflow.nodes.find((node) => node.id === taskId);
      if (!current || current.data.startDate === startDate) return;

      void applyPlanEdit(project.id, {
        change_source: "frontend_calendar_edit",
        target_type: "task",
        target_id: taskId,
        field_changed: "startDate",
        old_value: current.data.startDate,
        new_value: startDate,
        change_type: "task_moved",
        metadata: {
          ui_context: "week_calendar_move",
        },
      }).then((result) => {
        onProjectChange(result.project);
        if (result.generated_lesson_cards.length > 0) {
          setLearningNotice("Learning saved: Future similar experiments will use this schedule correction.");
        }
      });
    },
    [onProjectChange, project.id, workflow],
  );

  const handleQAMessagesChange = useCallback(
    (messages: PlanQAMessage[]) => {
      if (!planId) return;
      setQaMessagesByPlan((current) => ({
        ...current,
        [planId]: messages,
      }));
    },
    [planId],
  );

  const handleQAAction = useCallback(
    (action: PlanQASuggestedAction) => {
      if (
        (action.type === "open_node" || action.type === "highlight_node") &&
        action.target_id
      ) {
        setSelectedNodeId(action.target_id);
        navigate(`/projects/${project.id}/calendar`);
        return;
      }
      if (
        action.type === "open_report_section" ||
        action.type === "open_purchase_list" ||
        action.type === "open_risk_summary"
      ) {
        navigate(`/projects/${project.id}/statistics`);
        return;
      }
      if (action.type === "open_citation") {
        navigate(`/projects/${project.id}/literature`);
      }
    },
    [navigate, project.id],
  );

  const handleRiskHighlight = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setRiskOpen(false);
      navigate(`/projects/${project.id}/calendar`);
    },
    [navigate, project.id],
  );

  return (
    <main className="relative flex h-screen min-h-0 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        right={
          workflow ? null : <BuildTimelineButton onGenerate={onGenerate} />
        }
      />

      <SetupWarningBanner warnings={project.setup_warnings} mode={project.generation_mode} />

      {learningNotice ? (
        <div className="pointer-events-none absolute right-6 top-24 z-20 rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3 py-2 text-[12px] font-medium text-text-primary shadow-md">
          {learningNotice}
        </div>
      ) : null}

      {page === "calendar" && workflow ? (
        <section className="relative min-h-[560px] flex-1 overflow-hidden bg-bg-primary">
          {hasCalendar ? (
            <div className="flex h-full min-h-[560px]">
              <div className="relative min-w-0 flex-1">
                <CalendarView
                  workflow={workflow}
                  selectedTaskId={selectedNodeId}
                  onTaskSelect={setSelectedNodeId}
                  onTaskMove={handleTaskMove}
                  headerActions={
                    planId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setRiskOpen(true)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-3 py-1.5",
                            "text-[13px] font-medium text-text-secondary shadow-sm transition-colors hover:bg-bg-hover hover:text-text-primary",
                          )}
                        >
                          <ShieldAlert size={14} strokeWidth={1.75} />
                          Analyze Risks
                        </button>
                        <button
                          type="button"
                          onClick={() => setQaOpen(true)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm",
                            "border border-[color:var(--border-default)] bg-bg-surface px-3 py-1.5",
                            "text-[13px] font-medium text-text-secondary shadow-sm transition-colors",
                            "hover:bg-bg-hover hover:text-text-primary",
                            qaOpen && "hidden lg:inline-flex",
                          )}
                        >
                          <MessageCircle size={14} strokeWidth={1.75} />
                          Ask about this plan
                        </button>
                      </>
                    ) : null
                  }
                />
              </div>
              {qaOpen && planId ? (
                <PlanQASidebar
                  planId={planId}
                  selectedNodeId={selectedNodeId}
                  messages={qaMessages}
                  onMessagesChange={handleQAMessagesChange}
                  onClose={() => setQaOpen(false)}
                  onAction={handleQAAction}
                  onProjectChange={onProjectChange}
                  onLearningSaved={() => {
                    setLearningNotice("Plan updated and learning saved.");
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <p className="max-w-[44ch] text-[13px] leading-[1.55] text-text-tertiary">
                No scheduled tasks were returned for this project yet.
              </p>
            </div>
          )}
        </section>
      ) : page === "calendar" ? (
        <ResearchGraphPage project={project} onGenerate={onGenerate} />
      ) : page === "statistics" ? (
        workflow ? (
          <StatisticsView
            prompt={project.hypothesis}
            papers={project.papers ?? []}
            workflow={workflow}
            finalPlan={project.finalPlan}
            onAnalyzeRisks={planId ? () => setRiskOpen(true) : undefined}
          />
        ) : (
          <GeneratePlaceholder onGenerate={onGenerate} />
        )
      ) : (
        <LiteratureTab papers={project.papers ?? []} />
      )}

      {page === "calendar" && selectedNode && !qaOpen ? (
        <WorkflowNodeDetailPanel
          key={selectedNode.id}
          data={selectedNode.data as WorkflowNodeData}
          onChange={(data) => handleNodeDataChange(selectedNode.id, data)}
          onClose={() => setSelectedNodeId(null)}
        />
      ) : null}

      <RiskAnalyzerModal
        open={riskOpen}
        planId={planId}
        nodeLabels={nodeLabels}
        onClose={() => setRiskOpen(false)}
        onHighlightStep={handleRiskHighlight}
      />
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
          Related work map
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

      {project.prePlan ? <PrePlanCard prePlan={project.prePlan} /> : null}

      <div className="rounded-md border border-[color:var(--border-default)] bg-bg-surface p-5 shadow-sm">
        {papers.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-text-tertiary">
            No related papers were returned. You can still build the calendar
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

function PrePlanCard({ prePlan }: { prePlan: PrePlan }) {
  const nodes = prePlan.dag.nodes;
  const resourcePreview = [
    ...prePlan.global_resources.equipment.slice(0, 3),
    ...prePlan.global_resources.materials.slice(0, 3),
  ].slice(0, 5);

  return (
    <section className="rounded-md border border-[color:var(--border-default)] bg-bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch size={14} strokeWidth={1.5} className="text-text-tertiary" />
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Procedure task template
            </p>
            <ConfidenceBadge
              confidence={prePlan.experiment_summary.reconstruction_confidence}
            />
          </div>
          <h3 className="mt-1 font-sans text-[17px] font-medium tracking-[-0.01em] text-text-primary">
            {prePlan.experiment_summary.title}
          </h3>
          <p className="mt-1 max-w-[78ch] text-[13px] leading-[1.55] text-text-secondary">
            {prePlan.summary}
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-2 text-center">
          <Metric label="Steps" value={String(nodes.length)} />
          <Metric label="Templates" value={String(nodes.length)} />
          <Metric label="Sources" value={String(prePlan.source_documents.length)} />
        </dl>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3">
          <div className="mb-2 flex items-center gap-2">
            <ListChecks size={14} strokeWidth={1.5} className="text-text-tertiary" />
            <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Reconstructed steps
            </h4>
          </div>
          <ol className="flex flex-col gap-2">
            {nodes.slice(0, 5).map((node) => (
              <li key={node.node_id} className="text-[13px] leading-[1.5]">
                <span className="font-medium text-text-primary">
                  {node.step_name}
                </span>
                <span className="text-text-secondary"> · {node.step_purpose}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-md border border-[color:var(--border-default)] bg-bg-primary p-3">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Resources and gaps
          </h4>
          {resourcePreview.length > 0 ? (
            <p className="mt-2 text-[13px] leading-[1.55] text-text-secondary">
              {resourcePreview.join(", ")}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-text-tertiary">
              No concrete resources were extracted.
            </p>
          )}
          {prePlan.open_questions.length > 0 ? (
            <p className="mt-3 line-clamp-3 text-[12.5px] leading-[1.55] text-text-tertiary">
              Open question: {prePlan.open_questions[0]}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ConfidenceBadge({ confidence }: { confidence: PrePlan["experiment_summary"]["reconstruction_confidence"] }) {
  return (
    <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-text-secondary">
      {confidence} confidence
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-16 rounded-sm border border-[color:var(--border-default)] bg-bg-primary px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-medium text-text-primary">
        {value}
      </dd>
    </div>
  );
}

function GeneratePlaceholder({ onGenerate }: { onGenerate: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center px-8 py-24 text-center">
      <div className="flex max-w-[42ch] flex-col items-center gap-3">
        <h2 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Build the experiment calendar first
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

function SetupWarningBanner({
  warnings,
  mode,
}: {
  warnings?: string[];
  mode?: Project["generation_mode"];
}) {
  const visibleWarnings = (warnings ?? []).filter(Boolean).slice(0, 2);
  if (visibleWarnings.length === 0) return null;
  const label =
    mode === "openai"
      ? "Connected mode"
      : mode === "partial"
        ? "Partial mode"
        : "Demo mode";
  return (
    <div className="border-b border-[color:var(--border-default)] bg-accent-subtle px-8 py-2 text-[12px] leading-[1.45] text-text-secondary">
      <span className="font-medium text-text-primary">{label}:</span>{" "}
      {visibleWarnings.join(" ")}
    </div>
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
      Build experiment calendar
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
