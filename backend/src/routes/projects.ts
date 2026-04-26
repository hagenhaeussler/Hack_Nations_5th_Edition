import { Router, type Request, type Response } from "express";

import { env } from "../env.js";
import { getSimilarPapers } from "../lib/papers.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";
import { generateWorkflow } from "../lib/workflow.js";

const router: Router = Router();
const repo = getProjectsRepo();

/** Sleep helper — simulates the real research / generation latency. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Express 5 types route params as `string | string[]`; collapse to a single. */
function paramId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
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

/**
 * GET /api/projects — list all projects, most-recently-updated first.
 */
router.get("/", async (_req: Request, res: Response) => {
  const projects = await repo.list();
  res.json({ ok: true, projects });
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
  res.json({ ok: true, project });
});

/**
 * POST /api/projects/research
 *
 * Body: `{ "hypothesis": string }`
 *
 * Creates a project, simulates the literature-search latency, then attaches
 * the mock paper set. The frontend should redirect to a loading screen the
 * moment it gets the project id back, and poll / await this response before
 * routing to the research view. We intentionally hold the response open for
 * `MOCK_LATENCY_MS` so the loading screen has something to wait on.
 */
router.post("/research", async (req: Request, res: Response) => {
  const hypothesis =
    typeof req.body?.hypothesis === "string" ? req.body.hypothesis.trim() : "";

  if (hypothesis.length === 0) {
    res.status(400).json({ ok: false, error: "`hypothesis` is required." });
    return;
  }

  const project = await repo.create({
    hypothesis,
    title: titleFromHypothesis(hypothesis),
  });

  await sleep(env.mockLatencyMs);

  const papers = getSimilarPapers(hypothesis);
  const updated = await repo.attachPapers(project.id, papers);
  if (!updated) {
    res
      .status(500)
      .json({ ok: false, error: "Project disappeared mid-research." });
    return;
  }

  res.status(201).json({ ok: true, project: updated });
});

/**
 * POST /api/projects/:id/generate
 *
 * Simulates the workflow-generation latency, then attaches the mock workflow.
 * Idempotent: regenerating a ready project replaces its workflow.
 */
router.post("/:id/generate", async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "Missing project id." });
    return;
  }

  const existing = await repo.get(id);
  if (!existing) {
    res.status(404).json({ ok: false, error: "Project not found." });
    return;
  }

  await repo.setStatus(id, "generating");

  await sleep(env.mockLatencyMs);

  const workflow = generateWorkflow(existing.hypothesis);
  const updated = await repo.attachWorkflow(id, workflow);
  if (!updated) {
    res
      .status(500)
      .json({ ok: false, error: "Project disappeared mid-generation." });
    return;
  }

  res.status(200).json({ ok: true, project: updated });
});

export default router;
