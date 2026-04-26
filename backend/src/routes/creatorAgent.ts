import { Router, type Request, type Response } from "express";

import { runCreatorPlanAgents } from "../agents/agentOrchestrator.js";
import type { LabInventoryInput, LessonCardInput } from "../lib/creatorAgent.js";
import { FeedbackLearningService } from "../lib/feedbackLearningService.js";
import { getLearningRepo } from "../lib/learningRepo.js";
import type { PrePlan, Project } from "../lib/projectTypes.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";

const router: Router = Router();
const repo = getProjectsRepo();
const feedbackLearning = new FeedbackLearningService(repo, getLearningRepo());

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asPrePlans(value: unknown): PrePlan[] {
  return Array.isArray(value) ? (value as PrePlan[]) : [];
}

/**
 * POST /api/creator-agent/run
 *
 * Body can reference an existing project (`projectId`) or provide raw context:
 * `{ hypothesis, prePlans, labInventory, previousExperiments, lessonCards }`.
 * Existing-project runs are persisted back onto the project.
 */
router.post("/run", async (req: Request, res: Response) => {
  const projectId = stringOrNull(req.body?.projectId);
  const existing = projectId ? await repo.get(projectId) : null;

  if (projectId && !existing) {
    res.status(404).json({ ok: false, error: "Project not found." });
    return;
  }

  const hypothesis = existing?.hypothesis ?? stringOrNull(req.body?.hypothesis);
  if (!hypothesis) {
    res.status(400).json({ ok: false, error: "`hypothesis` or `projectId` is required." });
    return;
  }

  const prePlans = existing?.prePlan
    ? [existing.prePlan]
    : asPrePlans(req.body?.prePlans);
  const relevantLessons = await feedbackLearning.getRelevantLessons({
    hypothesis,
    domain: prePlans[0]?.experiment_summary.domain,
    experiment_type: prePlans[0]?.experiment_summary.experiment_type,
    limit: 10,
  });
  const lessonCards = [
    ...(Array.isArray(req.body?.lessonCards)
      ? (req.body.lessonCards as LessonCardInput[])
      : []),
    ...relevantLessons.map((lesson): LessonCardInput => ({
      lesson_id: lesson.lesson_id,
      title: lesson.lesson_title,
      summary: lesson.lesson_summary,
      keywords: [
        lesson.domain,
        lesson.experiment_type,
        lesson.step_type,
        ...lesson.affected_fields,
      ].filter((value): value is string => Boolean(value)),
    })),
  ];
  void lessonCards;
  const projectForRun: Project = existing ?? {
    id: "raw_creator_agent_input",
    hypothesis,
    title: hypothesis.slice(0, 72),
    status: "generating",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prePlan: prePlans[0],
  };
  const generated = await runCreatorPlanAgents({
    project: projectForRun,
    prePlan: prePlans[0] ?? null,
    lessons: relevantLessons,
    labContext: {
      labInventory: req.body?.labInventory as LabInventoryInput | undefined,
      labProtocols: Array.isArray(req.body?.labProtocols)
        ? (req.body.labProtocols as string[])
        : undefined,
      previousExperiments: req.body?.previousExperiments,
    },
  });

  if (existing) {
    const updated = await repo.attachFinalPlan(
      existing.id,
      generated.plan,
      generated.workflow,
      generated.warnings,
      generated.generation_mode,
    );
    if (!updated) {
      res.status(500).json({ ok: false, error: "Project disappeared mid-generation." });
      return;
    }
    await feedbackLearning.initializeCreatorPlanVersion(updated);
    res.status(200).json({
      ok: true,
      project: updated,
      finalPlan: generated.plan,
      warnings: generated.warnings,
      generation_mode: generated.generation_mode,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    finalPlan: generated.plan,
    workflow: generated.workflow,
    warnings: generated.warnings,
    generation_mode: generated.generation_mode,
  });
});

export default router;
