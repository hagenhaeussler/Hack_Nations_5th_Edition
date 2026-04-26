import { Router, type Request, type Response } from "express";

import { env } from "../env.js";
import { getSimilarPapers } from "../lib/papers.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";
import type { Workflow, WorkflowNode } from "../lib/projectTypes.js";
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function patchWorkflowNode(
  workflow: Workflow,
  nodeId: string,
  patch: Partial<WorkflowNode["data"]>,
  position?: WorkflowNode["position"],
): Workflow {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  if (!nodeIds.has(nodeId)) return workflow;

  const current = workflow.nodes.find((node) => node.id === nodeId)!;
  const parentIds = patch.parentIds
    ? uniqueIds(
        asStringArray(patch.parentIds).filter(
          (id) => id !== nodeId && nodeIds.has(id),
        ),
      )
    : asStringArray(current.data.parentIds);
  const childrenIds = patch.childrenIds
    ? uniqueIds(
        asStringArray(patch.childrenIds).filter(
          (id) => id !== nodeId && nodeIds.has(id),
        ),
      )
    : asStringArray(current.data.childrenIds);

  const nodes = workflow.nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        position: position ?? node.position,
        data: {
          ...node.data,
          ...patch,
          parentIds,
          childrenIds,
        },
      };
    }

    const nextParentIds = new Set(asStringArray(node.data.parentIds));
    const nextChildrenIds = new Set(asStringArray(node.data.childrenIds));

    if (parentIds.includes(node.id)) nextChildrenIds.add(nodeId);
    else nextChildrenIds.delete(nodeId);

    if (childrenIds.includes(node.id)) nextParentIds.add(nodeId);
    else nextParentIds.delete(nodeId);

    return {
      ...node,
      data: {
        ...node.data,
        parentIds: Array.from(nextParentIds),
        childrenIds: Array.from(nextChildrenIds),
      },
    };
  });

  const edges = nodes.flatMap((node) =>
    node.data.childrenIds
      .filter((childId) => nodeIds.has(childId))
      .map((childId) => ({
        id: `e:${node.id}-${childId}`,
        source: node.id,
        target: childId,
      })),
  );

  return { nodes, edges };
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

  const workflow = generateWorkflow(existing.hypothesis, existing.papers ?? []);
  const updated = await repo.attachWorkflow(id, workflow);
  if (!updated) {
    res
      .status(500)
      .json({ ok: false, error: "Project disappeared mid-generation." });
    return;
  }

  res.status(200).json({ ok: true, project: updated });
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

  const workflow = patchWorkflowNode(existing.workflow, nodeId, data, position);
  const updated = await repo.attachWorkflow(id, workflow);
  if (!updated) {
    res.status(500).json({ ok: false, error: "Project disappeared mid-update." });
    return;
  }

  res.status(200).json({ ok: true, project: updated });
});

export default router;
