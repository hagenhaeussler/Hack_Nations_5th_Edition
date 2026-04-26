import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";

import { env } from "../env.js";
import { runCreatorPlanAgents, runResearchAgents } from "../agents/agentOrchestrator.js";
import { getSetupWarnings } from "../lib/config.js";
import { FeedbackLearningError, FeedbackLearningService } from "../lib/feedbackLearningService.js";
import { getLearningRepo } from "../lib/learningRepo.js";
import {
  generatePrePlan,
  type PrePlanInputDocument,
} from "../lib/prePlanMaker.js";
import { logger } from "../lib/logger.js";
import type { PlanEditRequest, WorkflowNode } from "../lib/projectTypes.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";
import { upload } from "../lib/uploads.js";

const router: Router = Router();
const repo = getProjectsRepo();
const feedbackLearning = new FeedbackLearningService(repo, getLearningRepo());
const isDevelopment = process.env.NODE_ENV !== "production";

/** Sleep helper — simulates the real research / generation latency. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Express 5 types route params as `string | string[]`; collapse to a single. */
function paramId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function stringFields(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
}

function sourceTypeFromCategory(
  category: string | undefined,
): PrePlanInputDocument["sourceType"] {
  switch (category) {
    case "paper-link":
      return "paper_link";
    case "lab-sheet":
      return "lab_context";
    case "paper-pdf":
    case "other-pdf":
      return "uploaded_file";
    default:
      return "unknown";
  }
}

function sourceDocumentsFromRequest(req: Request): PrePlanInputDocument[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fileCategories = stringFields(req.body?.fileCategories);
  const links = stringFields(req.body?.links);
  const linkCategories = stringFields(req.body?.linkCategories);

  const uploaded = files.map<PrePlanInputDocument>((file, index) => ({
    id: `upload_${String(index + 1).padStart(3, "0")}`,
    title: file.originalname,
    sourceType: sourceTypeFromCategory(fileCategories[index]),
    fileName: file.originalname,
  }));

  const linked = links.map<PrePlanInputDocument>((url, index) => ({
    id: `link_${String(index + 1).padStart(3, "0")}`,
    title: url,
    sourceType: sourceTypeFromCategory(linkCategories[index] ?? "paper-link"),
    url,
  }));

  return [...uploaded, ...linked];
}

/**
 * Derives a short, human-friendly title from the user's hypothesis.
 * Trims to ~64 chars on a word boundary; if the prompt is one long line we
 * just hard-truncate. The title is purely for sidebar / list display — the
 * full prompt is preserved as `hypothesis`.
 */
function titleFromHypothesis(hypothesis: string): string {
  const cleaned = hypothesis.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 64) return cleaned;
  const cut = cleaned.slice(0, 64);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 32 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function editsFromNodePatch(
  current: WorkflowNode,
  patch: Partial<WorkflowNode["data"]>,
  position?: WorkflowNode["position"],
): PlanEditRequest[] {
  return (Object.entries(patch) as Array<[keyof WorkflowNode["data"], unknown]>)
    .filter(([field, value]) => !sameJsonValue(current.data[field], value))
    .map(([field, value]) => ({
      change_source: "frontend_graph_edit",
      target_type: "node",
      target_id: current.id,
      field_changed: String(field),
      old_value: current.data[field],
      new_value: value,
      metadata: position ? { position } : {},
    }));
}

function sendLearningError(res: Response, err: unknown): void {
  if (err instanceof FeedbackLearningError) {
    res.status(err.statusCode).json({ ok: false, error: err.message });
    return;
  }
  logger.error("feedback_learning.error", {
    message: errorMessage(err),
    stack: errorStack(err),
  });
  res.status(500).json({
    ok: false,
    error: err instanceof Error ? err.message : "Unknown feedback learning error",
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function sendRouteError(
  res: Response,
  err: unknown,
  context: {
    route: string;
    stage: string;
    requestId: string;
    projectId?: string;
  },
): void {
  const message = errorMessage(err);
  logger.error("route.error", {
    ...context,
    message,
    stack: errorStack(err),
  });
  res.status(500).json({
    ok: false,
    error: `Failed during ${context.stage}: ${message}`,
    request_id: context.requestId,
    stage: context.stage,
    project_id: context.projectId,
    details: isDevelopment
      ? {
          route: context.route,
          message,
          stack: errorStack(err),
        }
      : undefined,
  });
}

/**
 * GET /api/projects — list all projects, most-recently-updated first.
 */
router.get("/", async (_req: Request, res: Response) => {
  const projects = await repo.list();
  res.json({ ok: true, projects, warnings: getSetupWarnings() });
});

/**
 * GET /api/projects/:id — fetch a single project.
 */
router.get("/:id", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }
  const project = await repo.get(id);
  if (!project) {
    res.status(404).json({ ok: false, error: "Project not found." });
    return;
  }
  res.json({ ok: true, project, warnings: project.setup_warnings ?? getSetupWarnings() });
});

/**
 * POST /api/projects/research
 *
 * Body:
 *   JSON: `{ "hypothesis": string }`
 *   multipart: `hypothesis`, `files`, `fileCategories`, `links`, `linkCategories`
 *
 * Creates a project, runs semantic literature search, then attaches the paper
 * set and a pre-plan procedure template. `MOCK_LATENCY_MS` can add a local demo
 * delay, but defaults to 0 so real AI/search work does not hit proxy timeouts.
 */
router.post("/research", upload.array("files", 10), async (req: Request, res: Response) => {
  const requestId = randomUUID();
  const hypothesis =
    typeof req.body?.hypothesis === "string" ? req.body.hypothesis.trim() : "";

  if (hypothesis.length === 0) {
    res.status(400).json({ ok: false, error: "`hypothesis` is required." });
    return;
  }

  let projectId: string | undefined;
  let stage = "creating project";
  const startedAt = Date.now();
  let stageStartedAt = startedAt;
  const finishStage = (nextStage: string, extra: Record<string, unknown> = {}) => {
    logger.info("research.stage.completed", {
      requestId,
      projectId,
      stage,
      durationMs: elapsedMs(stageStartedAt),
      totalMs: elapsedMs(startedAt),
      ...extra,
    });
    stage = nextStage;
    stageStartedAt = Date.now();
  };
  try {
    logger.info("research.request.started", {
      requestId,
      hypothesisLength: hypothesis.length,
      attachmentCount: Array.isArray(req.files) ? req.files.length : 0,
    });
    const project = await repo.create({
      hypothesis,
      title: titleFromHypothesis(hypothesis),
    });
    projectId = project.id;

    finishStage("waiting for research latency", { mockLatencyMs: env.mockLatencyMs });
    if (env.mockLatencyMs > 0) {
      await sleep(env.mockLatencyMs);
    }

    finishStage("running research agents");
    const research = await runResearchAgents(hypothesis);
    const papers = research.papers;

    finishStage("building pre-plan procedure template", {
      mode: research.mode,
      paperCount: papers.length,
      warningCount: research.warnings.length,
    });
    const prePlan = generatePrePlan({
      hypothesis,
      papers,
      documents: sourceDocumentsFromRequest(req),
    });
    prePlan.agent_notes = [
      ...prePlan.agent_notes,
      `Research mode: ${research.mode}.`,
      ...research.warnings,
    ];

    finishStage("saving research results");
    const updated = await repo.attachResearchResults(
      project.id,
      papers,
      prePlan,
      research.warnings,
      research.mode,
    );
    if (!updated) {
      res
        .status(500)
        .json({
          ok: false,
          error: "Project disappeared mid-research.",
          request_id: requestId,
          stage,
          project_id: project.id,
        });
      return;
    }

    logger.info("research.request.completed", {
      requestId,
      projectId: updated.id,
      mode: research.mode,
      paperCount: papers.length,
      warningCount: research.warnings.length,
      durationMs: elapsedMs(startedAt),
    });
    res.status(201).json({
      ok: true,
      project: updated,
      project_id: updated.id,
      extraction: research.extraction,
      sources: research.sources,
      novelty: research.novelty,
      warnings: research.warnings,
      mode: research.mode,
      request_id: requestId,
    });
  } catch (err) {
    sendRouteError(res, err, {
      route: "POST /api/projects/research",
      stage,
      requestId,
      projectId,
    });
  }
});

/**
 * POST /api/projects/:id/generate
 *
 * Simulates the calendar-plan generation latency, then attaches the scheduled task plan.
 * Idempotent: regenerating a ready project replaces its calendar plan.
 */
router.post("/:id/generate", async (req: Request, res: Response) => {
  const requestId = randomUUID();
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }

  let stage = "loading project";
  try {
    const existing = await repo.get(id);
    if (!existing) {
      res.status(404).json({ ok: false, error: "Project not found.", request_id: requestId, stage });
      return;
    }

    logger.info("generation.request.started", { requestId, projectId: id });
    stage = "marking project generating";
    await repo.setStatus(id, "generating");

    stage = "waiting for generation latency";
    await sleep(env.mockLatencyMs);

    stage = "loading relevant lessons";
    const relevantLessons = await feedbackLearning.getRelevantLessons({
      hypothesis: existing.hypothesis,
      domain: existing.prePlan?.experiment_summary.domain,
      experiment_type: existing.prePlan?.experiment_summary.experiment_type,
      limit: 10,
    });

    stage = "running creator calendar agent";
    const generated = await runCreatorPlanAgents({
      project: existing,
      prePlan: existing.prePlan ?? null,
      lessons: relevantLessons,
      labContext: req.body?.labContext,
    });

    stage = "saving generated calendar plan";
    const updated = await repo.attachFinalPlan(
      id,
      generated.plan,
      generated.workflow,
      generated.warnings,
      generated.generation_mode,
    );
    if (!updated) {
      res
        .status(500)
        .json({
          ok: false,
          error: "Project disappeared mid-generation.",
          request_id: requestId,
          stage,
          project_id: id,
        });
      return;
    }

    stage = "initializing plan version";
    await feedbackLearning.initializeCreatorPlanVersion(updated);

    logger.info("generation.request.completed", {
      requestId,
      projectId: id,
      planId: generated.plan.plan_id,
      taskCount: generated.plan.tasks?.length ?? generated.plan.nodes.length,
      mode: generated.generation_mode,
      warningCount: generated.warnings.length,
    });
    res.status(200).json({
      ok: true,
      project: updated,
      plan_id: generated.plan.plan_id,
      plan: generated.plan,
      tasks: generated.plan.tasks ?? [],
      calendar_layout: generated.plan.calendar_layout,
      stats: generated.stats,
      warnings: generated.warnings,
      generation_mode: generated.generation_mode,
      request_id: requestId,
    });
  } catch (err) {
    sendRouteError(res, err, {
      route: "POST /api/projects/:id/generate",
      stage,
      requestId,
      projectId: id,
    });
  }
});

/**
 * POST /api/projects/:id/edits
 *
 * Applies one structured calendar task edit, stores an immutable PlanChangeEvent,
 * updates the current workflow, and returns generated lesson cards.
 */
router.post("/:id/edits", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }
  if (!isRecord(req.body)) {
    res.status(400).json({ ok: false, error: "Edit body is required." });
    return;
  }

  try {
    const result = await feedbackLearning.applyPlanEdit(
      id,
      req.body as unknown as PlanEditRequest,
    );
    res.status(200).json({
      ok: true,
      success: true,
      project: result.project,
      change_event: result.change_event,
      updated_plan: result.updated_plan,
      updated_stats_report: result.updated_stats_report,
      generated_lesson_cards: result.generated_lesson_cards,
    });
  } catch (err) {
    sendLearningError(res, err);
  }
});

/**
 * POST /api/projects/:id/batch-edits
 *
 * Applies multiple structured edits through the same immutable event pipeline.
 */
router.post("/:id/batch-edits", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }
  const edits = Array.isArray(req.body?.edits) ? req.body.edits : null;
  if (!edits) {
    res.status(400).json({ ok: false, error: "`edits` array is required." });
    return;
  }

  try {
    const result = await feedbackLearning.applyPlanEdits(
      id,
      edits as PlanEditRequest[],
    );
    res.status(200).json({
      ok: true,
      success: true,
      project: result.project,
      change_events: result.change_events,
      updated_plan: result.updated_plan,
      updated_stats_report: result.updated_stats_report,
      generated_lesson_cards: result.generated_lesson_cards,
    });
  } catch (err) {
    sendLearningError(res, err);
  }
});

router.get("/:id/change-log", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }
  const change_events = await feedbackLearning.listPlanChangeEvents(id);
  res.status(200).json({ ok: true, change_events });
});

router.get("/:id/versions", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }
  const versions = await feedbackLearning.listPlanVersions(id);
  res.status(200).json({ ok: true, versions });
});

/**
 * PATCH /api/projects/:id/workflow/nodes/:nodeId
 *
 * Body: `{ "data": Partial<WorkflowNode["data"]>, "position"?: { x, y } }`
 *
 * Updates the rich workflow node payload and keeps parent/child relationship
 * fields plus React Flow edges in sync.
 */
router.patch("/:id/workflow/nodes/:nodeId", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  const nodeId = paramId(req.params.nodeId);
  if (!id || !nodeId) {
    res.status(400).json({ ok: false, error: "Missing project or node id." });
    return;
  }

  const existing = await repo.get(id);
  if (!existing) {
    res.status(404).json({ ok: false, error: "Project not found." });
    return;
  }
  if (!existing.workflow) {
    res.status(400).json({ ok: false, error: "Project has no workflow." });
    return;
  }
  if (!existing.workflow.nodes.some((node) => node.id === nodeId)) {
    res.status(404).json({ ok: false, error: "Workflow node not found." });
    return;
  }

  const data =
    req.body && typeof req.body.data === "object" && req.body.data !== null
      ? (req.body.data as Partial<WorkflowNode["data"]>)
      : null;
  if (!data) {
    res.status(400).json({ ok: false, error: "`data` patch is required." });
    return;
  }

  const position =
    req.body &&
    typeof req.body.position?.x === "number" &&
    typeof req.body.position?.y === "number"
      ? (req.body.position as WorkflowNode["position"])
      : undefined;

  const currentNode = existing.workflow.nodes.find((node) => node.id === nodeId);
  if (!currentNode) {
    res.status(404).json({ ok: false, error: "Workflow node not found." });
    return;
  }

  const edits = editsFromNodePatch(currentNode, data, position);
  if (edits.length === 0) {
    res.status(200).json({ ok: true, project: existing });
    return;
  }

  try {
    const result = await feedbackLearning.applyPlanEdits(id, edits);
    res.status(200).json({
      ok: true,
      project: result.project,
      change_events: result.change_events,
      generated_lesson_cards: result.generated_lesson_cards,
    });
  } catch (err) {
    sendLearningError(res, err);
  }
});

export default router;
