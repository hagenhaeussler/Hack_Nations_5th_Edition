import { Router, type Request, type Response } from "express";

import { FeedbackLearningService } from "../lib/feedbackLearningService.js";
import { getLearningRepo } from "../lib/learningRepo.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";
import type { LessonCard } from "../lib/projectTypes.js";

const router: Router = Router();
const feedbackLearning = new FeedbackLearningService(
  getProjectsRepo(),
  getLearningRepo(),
);

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function lessonStatus(value: unknown): LessonCard["status"] | undefined {
  const status = queryString(value);
  return status &&
    ["active", "candidate", "needs_review", "rejected", "archived"].includes(status)
    ? (status as LessonCard["status"])
    : undefined;
}

router.get("/", async (req: Request, res: Response) => {
  const lessons = await feedbackLearning.listLessons({
    domain: queryString(req.query.domain),
    experiment_type: queryString(req.query.experiment_type),
    step_type: queryString(req.query.step_type),
    lab_id: queryString(req.query.lab_id),
    status: lessonStatus(req.query.status),
  });
  res.status(200).json({ ok: true, lessons });
});

router.get("/relevant", async (req: Request, res: Response) => {
  const limitValue = Number(queryString(req.query.limit) ?? "10");
  const lessons = await feedbackLearning.getRelevantLessons({
    hypothesis: queryString(req.query.hypothesis),
    text: queryString(req.query.text),
    domain: queryString(req.query.domain),
    experiment_type: queryString(req.query.experiment_type),
    step_type: queryString(req.query.step_type),
    lab_id: queryString(req.query.lab_id),
    status: lessonStatus(req.query.status),
    limit: Number.isFinite(limitValue) ? limitValue : 10,
  });
  res.status(200).json({ ok: true, lessons });
});

export default router;
