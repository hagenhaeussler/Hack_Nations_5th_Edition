import { Router, type Request, type Response } from "express";

import { getBenchmarkRepo } from "../lib/benchmarkRepo.js";

const router: Router = Router();
const benchmarkRepo = getBenchmarkRepo();

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function limitFromQuery(value: unknown): number {
  if (typeof value !== "string") return 10;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 50)) : 10;
}

router.get("/evaluations", async (_req: Request, res: Response) => {
  const evaluations = await benchmarkRepo.listEvaluations();
  res.status(200).json({ ok: true, evaluations });
});

router.get("/evaluations/:evaluation_id", async (req: Request, res: Response) => {
  const evaluationId = optionalString(req.params.evaluation_id);
  if (!evaluationId) {
    res.status(400).json({ ok: false, error: "Missing evaluation id." });
    return;
  }
  const evaluation = await benchmarkRepo.getEvaluation(evaluationId);
  if (!evaluation) {
    res.status(404).json({ ok: false, error: "Benchmark evaluation not found." });
    return;
  }
  res.status(200).json({ ok: true, evaluation });
});

router.get("/summary", async (_req: Request, res: Response) => {
  const summary = await benchmarkRepo.getSummary();
  res.status(200).json({ ok: true, ...summary, summary });
});

router.get("/insights/relevant", async (req: Request, res: Response) => {
  const insights = await benchmarkRepo.getRelevantInsights({
    domain: optionalString(req.query.domain),
    experiment_type: optionalString(req.query.experiment_type),
    project_id: optionalString(req.query.project_id),
    query: optionalString(req.query.query),
    limit: limitFromQuery(req.query.limit),
  });
  res.status(200).json({ ok: true, insights });
});

export default router;
