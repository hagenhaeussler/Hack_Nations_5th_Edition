import { Router, type Request, type Response } from "express";

import { randomUUID } from "node:crypto";

import { buildEditorPatchWithOpenAI } from "../agents/openaiAgents.js";
import { fallbackEditorPatch } from "../agents/fallbackAgents.js";
import { runQAAgent } from "../agents/agentOrchestrator.js";
import {
  BenchmarkValidationError,
  getBenchmarkRepo,
  validateBenchmarkScores,
} from "../lib/benchmarkRepo.js";
import type { BenchmarkEvaluationContext } from "../lib/benchmarkTypes.js";
import { getSetupWarnings } from "../lib/config.js";
import { FeedbackLearningService } from "../lib/feedbackLearningService.js";
import { getLearningRepo } from "../lib/learningRepo.js";
import {
  applyEditorPatch,
  buildEditorPatch,
  responseFromPatch,
  validatePlanPatch,
  type EditorMode,
  type PlanPatch,
  type PatchOperationType,
  type PatchTargetType,
} from "../lib/planEditorAgent.js";
import { validateSafePlanPatch } from "../lib/patchValidation.js";
import { createReportPdf } from "../lib/reportPdf.js";
import { analyzeProjectRisks, type RiskAnalyzerOptions } from "../lib/riskAnalyzerAgent.js";
import { answerPlanQuestion, getCurrentPlan, type QAChatMessage } from "../lib/qaAgent.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";

const router: Router = Router();
const projectsRepo = getProjectsRepo();
const learningRepo = getLearningRepo();
const feedbackLearning = new FeedbackLearningService(projectsRepo, learningRepo);
const benchmarkRepo = getBenchmarkRepo();

function paramId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function chatHistoryFromBody(value: unknown): QAChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is QAChatMessage => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<QAChatMessage>;
      return (
        (candidate.role === "user" ||
          candidate.role === "assistant" ||
          candidate.role === "system") &&
        typeof candidate.content === "string"
      );
    })
    .slice(-12)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 4000),
    }));
}

function editorMode(value: unknown): EditorMode {
  return value === "question_only" || value === "edit_only" ? value : "auto";
}

function fullEditorMessage(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const SUPPORTED_OPERATION_TYPES = new Set<PatchOperationType>([
  "update_node_field",
  "update_edge_field",
  "add_node",
  "remove_node",
  "rename_node",
  "split_node",
  "merge_nodes",
  "add_edge",
  "remove_edge",
  "reorder_dependency",
  "update_duration",
  "update_budget",
  "update_start_date",
  "update_end_date",
  "move_node_schedule",
  "add_equipment",
  "remove_equipment",
  "add_material",
  "remove_material",
  "update_people_required",
  "add_role",
  "remove_role",
  "update_procedure",
  "add_validation_criteria",
  "remove_validation_criteria",
  "update_validation_criteria",
  "add_risk",
  "remove_risk",
  "update_milestone",
  "add_note",
  "update_status",
]);

function toPatchOperationType(value: string): PatchOperationType {
  return SUPPORTED_OPERATION_TYPES.has(value as PatchOperationType)
    ? (value as PatchOperationType)
    : "update_node_field";
}

function toPatchTargetType(value: string): PatchTargetType {
  return value === "node" ||
    value === "edge" ||
    value === "plan" ||
    value === "schedule" ||
    value === "report_section"
    ? value
    : "node";
}

function planPatchFromDraft(
  planId: string,
  message: string,
  draft: Awaited<ReturnType<typeof buildEditorPatchWithOpenAI>>["data"],
): PlanPatch {
  return {
    patch_id: `patch_${randomUUID()}`,
    plan_id: planId,
    created_at: new Date().toISOString(),
    created_by: "editor_agent",
    user_message: message,
    summary: draft.intent_summary,
    operations: draft.operations.map((operation) => ({
      operation_id: `op_${randomUUID()}`,
      operation_type: toPatchOperationType(operation.operation_type),
      target_type: toPatchTargetType(operation.target_type),
      target_id: operation.target_id,
      field_path: operation.field_path,
      old_value: operation.old_value ?? null,
      new_value: operation.new_value,
      reason: operation.reason,
      requires_recalculation: operation.requires_recalculation,
      risk_level: operation.risk_level,
      validation_status: "pending",
    })),
    expected_effects: draft.expected_effects,
    requires_confirmation: draft.requires_confirmation,
    safety_status: "pending_validation",
  };
}

async function answerQuestionForPlan(
  planId: string,
  body: Record<string, unknown>,
  question: string,
) {
  const project = await projectsRepo.getByPlanId(planId);
  if (!project) return null;
  const lessons = await learningRepo.listLessonCards();
  return answerPlanQuestion({
    project,
    question,
    selected_node_id: optionalString(body.selected_node_id),
    selected_edge_id: optionalString(body.selected_edge_id),
    chat_history: chatHistoryFromBody(body.chat_history),
    options:
      body.options && typeof body.options === "object"
        ? body.options
        : undefined,
    lessons,
  });
}

async function getPlanProject(planId: string, res: Response) {
  const project = await projectsRepo.getByPlanId(planId);
  if (!project?.finalPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return null;
  }
  return project;
}

function benchmarkContextForProject(planId: string, project: NonNullable<Awaited<ReturnType<typeof projectsRepo.getByPlanId>>>): BenchmarkEvaluationContext {
  const currentPlan = getCurrentPlan(project);
  return {
    project_id: project.id,
    plan_id: planId,
    project_title: project.title,
    plan_title: currentPlan?.experiment_title ?? project.finalPlan?.experiment_title ?? "Untitled calendar plan",
    hypothesis: project.hypothesis,
    domain: currentPlan?.domain ?? project.finalPlan?.domain ?? null,
    experiment_type: currentPlan?.experiment_type ?? project.finalPlan?.experiment_type ?? null,
    generation_mode: project.generation_mode ?? null,
    model_name: null,
  };
}

router.get("/:plan_id", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  const project = await getPlanProject(planId, res);
  if (!project?.finalPlan) return;
  res.json({ ok: true, plan: getCurrentPlan(project), projectId: project.id, warnings: project.setup_warnings ?? getSetupWarnings() });
});

router.get("/:plan_id/stats", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  const project = await getPlanProject(planId, res);
  if (!project?.finalPlan) return;
  res.json({ ok: true, stats: getCurrentPlan(project)?.stats_report, warnings: project.setup_warnings ?? getSetupWarnings() });
});

router.get("/:plan_id/calendar", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  const project = await getPlanProject(planId, res);
  if (!project?.finalPlan) return;
  const currentPlan = getCurrentPlan(project);
  if (!currentPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }
  res.json({
    ok: true,
    plan_id: currentPlan.plan_id,
    plan: currentPlan,
    tasks: currentPlan.tasks ?? [],
    calendar_layout: currentPlan.calendar_layout,
    stats: currentPlan.stats_report,
    warnings: project.setup_warnings ?? getSetupWarnings(),
  });
});

router.get("/:plan_id/graph", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  const project = await getPlanProject(planId, res);
  if (!project?.finalPlan) return;
  const currentPlan = getCurrentPlan(project);
  if (!currentPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }
  res.json({
    ok: true,
    deprecation_warning: "The graph endpoint is deprecated. Use /api/plans/:plan_id/calendar.",
    nodes: currentPlan.nodes,
    edges: [],
    tasks: currentPlan.tasks ?? [],
    calendar_layout: currentPlan.calendar_layout,
    warnings: project.setup_warnings ?? getSetupWarnings(),
  });
});

router.get("/:plan_id/report/pdf", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }

  const project = await getPlanProject(planId, res);
  if (!project?.finalPlan) return;
  const currentPlan = getCurrentPlan(project);
  if (!currentPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }

  const pdf = createReportPdf(currentPlan);
  const filename = `labpilot_project_report_${planId.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(pdf);
});

router.post("/:plan_id/evaluations", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }

  const project = await projectsRepo.getByPlanId(planId);
  if (!project?.finalPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }

  try {
    const scores = validateBenchmarkScores(req.body?.scores);
    const writtenFeedback =
      typeof req.body?.written_feedback === "string"
        ? req.body.written_feedback.slice(0, 5000)
        : null;
    const metadata =
      req.body?.metadata && typeof req.body.metadata === "object"
        ? (req.body.metadata as Record<string, unknown>)
        : {};
    const result = await benchmarkRepo.saveEvaluation({
      context: benchmarkContextForProject(planId, project),
      scores,
      written_feedback: writtenFeedback,
      metadata: {
        source_view: "calendar_view",
        ...metadata,
      },
    });
    res.status(201).json({
      ok: true,
      success: true,
      evaluation: result.evaluation,
      insight: result.insight,
      warnings: result.warnings,
    });
  } catch (err) {
    if (err instanceof BenchmarkValidationError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:plan_id/risk-analysis", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }

  const project = await projectsRepo.getByPlanId(planId);
  if (!project) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }
  const currentPlan = getCurrentPlan(project);
  if (!currentPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }

  const options: RiskAnalyzerOptions =
    req.body && typeof req.body === "object" ? req.body : {};
  const lessons =
    options.include_lessons === false ? [] : await learningRepo.listLessonCards();
  const analysis = analyzeProjectRisks({
    plan: currentPlan,
    lessons,
    options,
  });
  res.status(200).json({ ok: true, analysis, warnings: getSetupWarnings() });
});

/**
 * POST /api/plans/:plan_id/qa
 *
 * Answers grounded questions about the current experiment plan. The route
 * resolves the owning project by final plan id and merges current workflow
 * edits into the rich final-plan context before answering.
 */
router.post("/:plan_id/qa", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";

  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  if (question.length === 0) {
    res.status(400).json({ ok: false, error: "`question` is required." });
    return;
  }

  const project = await projectsRepo.getByPlanId(planId);
  if (!project) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }

  const lessons = await learningRepo.listLessonCards();
  const currentPlan = getCurrentPlan(project);
  if (!currentPlan) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }
  const response = await runQAAgent({
    question,
    plan: currentPlan,
    context: {
      selected_node_id: optionalString(req.body?.selected_node_id),
      selected_edge_id: optionalString(req.body?.selected_edge_id),
      chat_history: chatHistoryFromBody(req.body?.chat_history),
      options:
        req.body?.options && typeof req.body.options === "object"
          ? req.body.options
          : undefined,
      lessons,
    },
  });

  res.status(200).json({ ok: true, ...response.data, warnings: response.warnings, mode: response.mode });
});

router.post("/:plan_id/editor", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  const message = fullEditorMessage(req.body?.message ?? req.body?.user_message);
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  if (message.length === 0) {
    res.status(400).json({ ok: false, error: "`message` is required." });
    return;
  }

  const project = await projectsRepo.getByPlanId(planId);
  if (!project) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }

  const build = buildEditorPatch(project, {
    plan_id: planId,
    user_message: message,
    selected_node_id: optionalString(req.body?.selected_node_id),
    selected_edge_id: optionalString(req.body?.selected_edge_id),
    chat_history: chatHistoryFromBody(req.body?.chat_history),
    mode: editorMode(req.body?.mode),
    user_id: optionalString(req.body?.user_id) ?? undefined,
  });

  if (build.intent.intent_type === "question") {
    const answer = await answerQuestionForPlan(planId, req.body ?? {}, message);
    if (!answer) {
      res.status(404).json({ ok: false, error: "Plan not found." });
      return;
    }
    res.status(200).json({
      ok: true,
      warnings: getSetupWarnings(),
      response_type: "answer",
      natural_language_response: answer.answer,
      intent: build.intent,
      proposed_patch: null,
      validation_result: null,
      updated_plan: null,
      updated_stats_report: null,
      generated_change_events: [],
      generated_lesson_cards: [],
      suggested_actions: answer.suggested_actions,
      answer,
    });
    return;
  }

  if (build.intent.clarifying_question || !build.patch) {
    res.status(200).json({
      ok: true,
      warnings: getSetupWarnings(),
      ...responseFromPatch(
        "clarification_needed",
        build.intent.clarifying_question ??
          "I need a little more detail before changing the current plan.",
        build.intent,
        null,
        build.validation,
      ),
    });
    return;
  }

  const currentPlan = getCurrentPlan(project);
  const llmDraft = currentPlan
    ? await buildEditorPatchWithOpenAI({
        instruction: message,
        plan: currentPlan,
        context: {
          selected_node_id: optionalString(req.body?.selected_node_id),
          selected_edge_id: optionalString(req.body?.selected_edge_id),
          chat_history: chatHistoryFromBody(req.body?.chat_history),
        },
        fallbackFn: () => fallbackEditorPatch(message),
      })
    : null;

  const patch =
    llmDraft?.mode === "openai" && llmDraft.data.operations.length > 0
      ? planPatchFromDraft(planId, message, llmDraft.data)
      : build.patch;
  const validation = project.workflow ? validatePlanPatch(project.workflow, patch) : build.validation;
  const safeValidation = project.workflow ? validateSafePlanPatch(project.workflow, patch) : null;
  if (safeValidation && !safeValidation.valid && validation) {
    validation.errors = [...validation.errors, ...safeValidation.errors];
    validation.warnings = [...validation.warnings, ...safeValidation.warnings];
    validation.estimated_blast_radius = safeValidation.blast_radius;
  }

  const prefix =
    build.intent.intent_type === "mixed"
      ? "I can answer briefly and propose a targeted edit. "
      : "";
  const valid = validation?.is_valid ?? false;
  res.status(200).json({
    ok: true,
    warnings: Array.from(new Set([...(llmDraft?.warnings ?? []), ...getSetupWarnings()])),
    mode: llmDraft?.mode ?? "fallback",
    ...responseFromPatch(
      valid ? "proposed_patch" : "error",
      valid
        ? `${prefix}I found the target and prepared a small patch: ${patch.summary}. Confirm to apply it.`
        : `I prepared a patch, but it is not safe to apply yet: ${validation?.errors.join(" ")}`,
      build.intent,
      patch,
      validation,
    ),
  });
});

router.post("/:plan_id/editor/validate-patch", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  const patch = req.body?.patch as PlanPatch | undefined;
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  if (!patch) {
    res.status(400).json({ ok: false, error: "`patch` is required." });
    return;
  }
  const project = await projectsRepo.getByPlanId(planId);
  if (!project?.workflow) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }
  const validation = validatePlanPatch(project.workflow, patch);
  const safeValidation = validateSafePlanPatch(project.workflow, patch);
  validation.errors = [...validation.errors, ...safeValidation.errors];
  validation.warnings = [...validation.warnings, ...safeValidation.warnings];
  validation.is_valid = validation.is_valid && safeValidation.valid;
  validation.estimated_blast_radius = safeValidation.blast_radius;
  res.status(200).json({
    ok: true,
    validation_result: validation,
    warnings: getSetupWarnings(),
    blast_radius: safeValidation.blast_radius,
  });
});

router.post("/:plan_id/editor/apply-patch", async (req: Request, res: Response) => {
  const planId = paramId(req.params.plan_id);
  const patch = req.body?.patch as PlanPatch | undefined;
  if (!planId) {
    res.status(400).json({ ok: false, error: "Missing plan id." });
    return;
  }
  if (!req.body?.confirmed) {
    res.status(400).json({ ok: false, error: "Patch application requires confirmation." });
    return;
  }
  if (!patch) {
    res.status(400).json({ ok: false, error: "`patch` is required." });
    return;
  }

  const project = await projectsRepo.getByPlanId(planId);
  if (!project) {
    res.status(404).json({ ok: false, error: "Plan not found." });
    return;
  }
  if (project.workflow) {
    const safeValidation = validateSafePlanPatch(project.workflow, patch);
    if (!safeValidation.valid) {
      res.status(400).json({
        ok: false,
        error: safeValidation.errors.join(" "),
        warnings: safeValidation.warnings,
      });
      return;
    }
  }

  const response = await applyEditorPatch(
    project,
    patch,
    feedbackLearning,
    optionalString(req.body?.user_id) ?? undefined,
  );
  res.status(response.response_type === "error" ? 400 : 200).json({
    ok: response.response_type !== "error",
    success: response.response_type === "applied_patch",
    warnings: getSetupWarnings(),
    ...response,
  });
});

export default router;
