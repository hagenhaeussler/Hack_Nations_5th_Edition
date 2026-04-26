import { Router, type Request, type Response } from "express";

import { env } from "../env.js";
import { getSimilarPapers } from "../lib/papers.js";
import {
  generatePrePlan,
  type PrePlanInputDocument,
} from "../lib/prePlanMaker.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";
import { upload } from "../lib/uploads.js";
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
 * Body:
 *   JSON: `{ "hypothesis": string }`
 *   multipart: `hypothesis`, `files`, `fileCategories`, `links`, `linkCategories`
 *
 * Creates a project, simulates the literature-search latency, then attaches
 * the mock paper set and a Pre-Plan Maker DAG. The frontend should redirect
 * to a loading screen the moment it gets the project id back, and poll / await
 * this response before routing to the research view. We intentionally hold the
 * response open for `MOCK_LATENCY_MS` so the loading screen has something to
 * wait on.
 */
router.post("/research", upload.array("files", 10), async (req: Request, res: Response) => {
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
  const prePlan = generatePrePlan({
    hypothesis,
    papers,
    documents: sourceDocumentsFromRequest(req),
  });
  const updated = await repo.attachResearchResults(project.id, papers, prePlan);
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

  const workflow = generateWorkflow(existing.hypothesis, existing.prePlan);
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
