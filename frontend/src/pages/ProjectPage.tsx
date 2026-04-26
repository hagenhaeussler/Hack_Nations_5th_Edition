import { CalendarRange, ExternalLink, MessageCircle, ShieldAlert, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { LoadingScreen } from "@/components/LoadingScreen";
import { BenchmarkEvaluationModal } from "@/components/benchmark/BenchmarkEvaluationModal";
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
  type BenchmarkEvaluation,
  type PlanQASuggestedAction,
} from "@/lib/api";
import { buildPaperRelevanceExplanation, similarityLabel, type Paper } from "@/lib/papers";
import {
  STATUS_LABEL,
  type PlanEditRequest,
  type Project,
  type Workflow,
  formatRelativeTime,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type ProjectPageSlug = "calendar" | "statistics" | "literature";
type LiteratureViewMode = "graph" | "papers";

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
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [literatureViewMode, setLiteratureViewMode] = useState<LiteratureViewMode>("papers");
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
  const showsLiteratureWorkspace = page === "literature" || (page === "calendar" && !workflow);

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

  const handleEvaluationSaved = useCallback((_evaluation: BenchmarkEvaluation) => {
    setLearningNotice("Evaluation saved. This feedback will help improve future Creator Agent plans.");
  }, []);

  return (
    <main className="relative flex h-screen min-h-0 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        right={
          showsLiteratureWorkspace ? (
            <ViewModeToggle
              viewMode={literatureViewMode}
              onToggle={() =>
                setLiteratureViewMode((mode) => (mode === "papers" ? "graph" : "papers"))
              }
            />
          ) : undefined
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
                          onClick={() => setEvaluationOpen(true)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--border-default)] bg-bg-surface px-3 py-1.5",
                            "text-[13px] font-medium text-text-secondary shadow-sm transition-colors hover:bg-bg-hover hover:text-text-primary",
                          )}
                        >
                          <Star size={14} strokeWidth={1.75} />
                          Evaluate Plan
                        </button>
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
        <ResearchGraphPage
          project={project}
          viewMode={literatureViewMode}
          onGenerate={onGenerate}
        />
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
        <LiteratureTab project={project} viewMode={literatureViewMode} />
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
      <BenchmarkEvaluationModal
        open={evaluationOpen}
        project={project}
        planId={planId}
        onClose={() => setEvaluationOpen(false)}
        onSaved={handleEvaluationSaved}
      />
    </main>
  );
}

function ResearchGraphPage({
  project,
  viewMode,
  onGenerate,
}: {
  project: Project;
  viewMode: LiteratureViewMode;
  onGenerate: () => void;
}) {
  const papers = useMemo(
    () => [...(project.papers ?? [])].sort((left, right) => right.similarity - left.similarity),
    [project.papers],
  );
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const topSimilarity = papers[0]?.similarity ?? 0;

  return (
    <ResearchLiteratureView
      hypothesis={project.hypothesis}
      papers={papers}
      viewMode={viewMode}
      selectedPaperId={selectedPaperId}
      topSimilarity={topSimilarity}
      onSelectPaper={(paper) =>
        setSelectedPaperId((current) => (current === paper.id ? null : paper.id))
      }
      action={<BuildTimelineButton onGenerate={onGenerate} large />}
    />
  );
}

function ResearchLiteratureView({
  hypothesis,
  papers,
  viewMode,
  selectedPaperId,
  topSimilarity,
  onSelectPaper,
  action,
}: {
  hypothesis: string;
  papers: Paper[];
  viewMode: LiteratureViewMode;
  selectedPaperId: string | null;
  topSimilarity: number;
  onSelectPaper: (paper: Paper) => void;
  action?: React.ReactNode;
}) {
  const [detailPaper, setDetailPaper] = useState<Paper | null>(null);

  const openPaperDetails = (paper: Paper) => {
    if (selectedPaperId !== paper.id) onSelectPaper(paper);
    setDetailPaper(paper);
  };

  if (papers.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center px-8 py-24 text-center">
        <div className="flex max-w-[44ch] flex-col items-center gap-3">
          <p className="text-[13px] leading-[1.55] text-text-tertiary">
            No related papers were returned. You can still build the calendar
            from your hypothesis.
          </p>
          {action}
        </div>
      </section>
    );
  }

  return (
    <section className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-bg-primary">
      {viewMode === "graph" ? (
        <div className="flex min-h-0 flex-col overflow-hidden p-4">
          <div className="h-full min-h-0 rounded-md border border-[color:var(--border-default)] bg-bg-surface p-4 shadow-sm">
            <PaperGraph
              papers={papers}
              selectedPaperId={selectedPaperId}
              onSelect={openPaperDetails}
            />
          </div>
        </div>
      ) : null}

      {viewMode === "papers" ? (
      <aside className="flex min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <header className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Fetched papers
              </p>
              <h3 className="mt-1 font-sans text-[18px] font-medium text-text-primary">
                Relevance ranked
              </h3>
            </div>
            <span className="text-[12px] text-text-tertiary">
              {papers.length} result{papers.length === 1 ? "" : "s"}
            </span>
          </header>
          <p className="mb-4 text-[12.5px] text-text-secondary">
            Ordered by semantic relevance. Top match: {Math.round(topSimilarity * 100)}%.
          </p>
          <PaperList
            hypothesis={hypothesis}
            papers={papers}
            selectedPaperId={selectedPaperId}
            onSelect={onSelectPaper}
            onOpenDetails={openPaperDetails}
          />
        </div>
      </aside>
      ) : null}

      {detailPaper ? (
        <PaperDetailDrawer
          paper={detailPaper}
          hypothesis={hypothesis}
          onClose={() => setDetailPaper(null)}
        />
      ) : null}

      {action ? (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
          <div className="pointer-events-auto rounded-full bg-bg-surface/95 p-2 shadow-lg ring-1 ring-[color:var(--border-default)] backdrop-blur">
            {action}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ViewModeToggle({
  viewMode,
  onToggle,
}: {
  viewMode: LiteratureViewMode;
  onToggle: () => void;
}) {
  const nextLabel = viewMode === "papers" ? "Switch to citation graph" : "Switch to paper list";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center rounded-full border border-[color:var(--border-default)] bg-bg-surface px-4 py-2 text-[12px] font-medium text-text-primary shadow-sm hover:bg-bg-hover"
      aria-label={nextLabel}
    >
      {nextLabel}
    </button>
  );
}

function PaperDetailDrawer({
  paper,
  hypothesis,
  onClose,
}: {
  paper: Paper;
  hypothesis: string;
  onClose: () => void;
}) {
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const graphLinkCount =
    (paper.referencedPaperIds?.length ?? 0) + (paper.relatedPaperIds?.length ?? 0);
  const relevanceExplanation = buildPaperRelevanceExplanation(paper, hypothesis);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-[color:var(--border-default)] bg-bg-primary shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border-default)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Paper details
          </p>
          <h3 className="mt-1 line-clamp-3 font-sans text-[18px] font-medium leading-[1.25] text-text-primary">
            {paper.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          aria-label="Close paper details"
        >
          <X size={17} strokeWidth={1.75} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-accent">
            {Math.round(paper.similarity * 100)}% relevance
          </span>
          <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-secondary">
            {similarityLabel(paper.similarity)}
          </span>
          {graphLinkCount > 0 ? (
            <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-text-secondary">
              {graphLinkCount} graph link{graphLinkCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <section className="mt-4 rounded-md border border-[color:var(--border-default)] bg-bg-surface p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Why it matters for this hypothesis
          </p>
          <p className="mt-1 text-[13px] leading-[1.6] text-text-secondary">
            {relevanceExplanation}
          </p>
          {paper.novelty_relation ? (
            <p className="mt-2 text-[13px] leading-[1.6] text-text-secondary">
              {paper.novelty_relation}
            </p>
          ) : null}
        </section>

        <section className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Source
          </p>
          <p className="mt-1 text-[13px] leading-[1.55] text-text-secondary">
            {paper.authors.join(", ")} · {paper.venue} · {paper.year}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
              >
                Open source page
                <ExternalLink size={12} strokeWidth={1.5} />
              </a>
            ) : null}
            {paper.pdfUrl ? (
              <button
                type="button"
                onClick={() => setShowPdfPreview((current) => !current)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
              >
                {showPdfPreview ? "Hide PDF preview" : "Preview PDF"}
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Abstract
          </p>
          <p className="mt-1 text-[13px] leading-[1.65] text-text-secondary">
            {paper.abstract}
          </p>
        </section>

        {paper.pdfUrl && showPdfPreview ? (
          <section className="mt-4 overflow-hidden rounded-md border border-[color:var(--border-default)] bg-bg-surface">
            <iframe
              title={`PDF preview for ${paper.title}`}
              src={paper.pdfUrl}
              className="h-[420px] w-full"
            />
          </section>
        ) : null}
      </div>
    </aside>
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

function LiteratureTab({
  project,
  viewMode,
}: {
  project: Project;
  viewMode: LiteratureViewMode;
}) {
  const papers = useMemo(
    () => [...(project.papers ?? [])].sort((left, right) => right.similarity - left.similarity),
    [project.papers],
  );
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
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
    <ResearchLiteratureView
      hypothesis={project.hypothesis}
      papers={papers}
      viewMode={viewMode}
      selectedPaperId={selectedPaperId}
      topSimilarity={papers[0]?.similarity ?? 0}
      onSelectPaper={(paper) =>
        setSelectedPaperId((current) => (current === paper.id ? null : paper.id))
      }
    />
  );
}

function SetupWarningBanner({
  warnings,
  mode,
}: {
  warnings?: string[];
  mode?: Project["generation_mode"];
}) {
  const [dismissed, setDismissed] = useState(false);
  const visibleWarnings = (warnings ?? []).filter(Boolean).slice(0, 2);
  if (dismissed || visibleWarnings.length === 0) return null;
  const label =
    mode === "openai"
      ? "Connected mode"
      : mode === "partial"
        ? "Partial mode"
        : "Demo mode";
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-default)] bg-accent-subtle px-8 py-2 text-[12px] leading-[1.45] text-text-secondary">
      <p>
        <span className="font-medium text-text-primary">{label}:</span>{" "}
        {visibleWarnings.join(" ")}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-full p-0.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
        aria-label="Dismiss setup warning"
      >
        <X size={14} strokeWidth={1.75} />
      </button>
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
          <h1 className="line-clamp-1 max-w-[760px] font-sans text-[22px] font-medium tracking-[-0.01em] text-text-primary">
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
        {project.description ? (
          <p className="mt-1 line-clamp-1 max-w-[760px] text-[12.5px] leading-[1.4] text-text-secondary">
            {project.description}
          </p>
        ) : null}
      </div>

      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

function BuildTimelineButton({ onGenerate, large = false }: { onGenerate: () => void; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onGenerate}
      className={cn(
        "inline-flex items-center gap-1.5 bg-accent font-medium text-white shadow-sm",
        "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
        large
          ? "rounded-full px-6 py-3 text-[15px]"
          : "rounded-sm px-3.5 py-1.5 text-[13px]",
      )}
    >
      <CalendarRange size={large ? 18 : 14} strokeWidth={1.75} />
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
