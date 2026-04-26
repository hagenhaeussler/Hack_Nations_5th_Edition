import { Router, type Request, type Response } from "express";

import { env } from "../env.js";
import { getSimilarPapers } from "../lib/papers.js";
import {
  generatePrePlan,
  type PrePlanInputDocument,
} from "../lib/prePlanMaker.js";
import { getProjectsRepo } from "../lib/projectsRepo.js";
import { upload } from "../lib/uploads.js";
import type { Workflow, WorkflowNode } from "../lib/projectTypes.js";
import { generateWorkflow } from "../lib/workflow.js";

const router: Router = Router();
const repo = getProjectsRepo();
const DAY_WIDTH = 220;
const TRACK_HEIGHT = 220;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function parseWorkflowDate(value: string | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ? null : new Date(time);
}

function formatWorkflowDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addWorkflowDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function durationDays(timeEstimate: string | undefined): number {
  if (!timeEstimate) return 1;
  const normalized = timeEstimate.toLowerCase();
  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const amount = numbers.length > 0 ? Math.max(...numbers) : 1;
  if (normalized.includes("week")) return Math.max(Math.ceil(amount * 7), 1);
  if (normalized.includes("month")) return Math.max(Math.ceil(amount * 30), 1);
  if (normalized.includes("hour")) return 1;
  return Math.max(Math.ceil(amount), 1);
}

function workflowBaseDate(nodes: WorkflowNode[]): Date {
  const dates = nodes
    .map((node) => parseWorkflowDate(node.data.startDate))
    .filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return new Date();
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function dayOffset(baseDate: Date, startDate: string | undefined): number {
  const date = parseWorkflowDate(startDate);
  if (!date) return 0;
  return Math.max(0, Math.round((date.getTime() - baseDate.getTime()) / MS_PER_DAY));
}

function nodeStartDay(node: WorkflowNode | undefined, baseDate: Date): number {
  if (
    typeof node?.data.startDay === "number" &&
    Number.isFinite(node.data.startDay)
  ) {
    return Math.max(0, Math.round(node.data.startDay));
  }
  return dayOffset(baseDate, node?.data.startDate);
}

function createsCycle(
  adjacency: Map<string, Set<string>>,
  source: string,
  target: string,
): boolean {
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const childId of adjacency.get(current) ?? []) stack.push(childId);
  }
  return false;
}

function normalizeRelationships(nodes: WorkflowNode[]): WorkflowNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>(
    nodes.map((node) => [node.id, new Set<string>()]),
  );

  for (const node of nodes) {
    for (const childId of asStringArray(node.data.childrenIds)) {
      if (childId === node.id || !nodeIds.has(childId)) continue;
      if (createsCycle(adjacency, node.id, childId)) continue;
      adjacency.get(node.id)?.add(childId);
    }
  }

  const parentsByChild = new Map<string, string[]>(
    nodes.map((node) => [node.id, []]),
  );
  const childrenByParent = new Map<string, string[]>(
    nodes.map((node) => [node.id, []]),
  );

  for (const [source, children] of adjacency) {
    for (const target of children) {
      childrenByParent.get(source)?.push(target);
      parentsByChild.get(target)?.push(source);
    }
  }

  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      parentIds: parentsByChild.get(node.id) ?? [],
      childrenIds: childrenByParent.get(node.id) ?? [],
    },
  }));
}

function topologicalNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const node of nodes) {
    for (const childId of asStringArray(node.data.childrenIds)) {
      indegree.set(childId, (indegree.get(childId) ?? 0) + 1);
    }
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const ordered: WorkflowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodesById.get(id);
    if (!node) continue;
    ordered.push(node);
    for (const childId of asStringArray(node.data.childrenIds)) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }

  return ordered.length === nodes.length ? ordered : nodes;
}

function enforceDependencySchedule(nodes: WorkflowNode[]): WorkflowNode[] {
  const baseDate = workflowBaseDate(nodes);
  const scheduledById = new Map(nodes.map((node) => [node.id, { ...node }]));
  const firstNodeId = nodes[0]?.id;

  for (const node of topologicalNodes(nodes)) {
    const current = scheduledById.get(node.id);
    if (!current) continue;

    const dependencyStartDay = asStringArray(current.data.parentIds).reduce(
      (required, parentId) => {
        const parent = scheduledById.get(parentId);
        const parentEndDay =
          nodeStartDay(parent, baseDate) + durationDays(parent?.data.timeEstimate);
        return Math.max(required, parentEndDay);
      },
      0,
    );
    const currentStartDay =
      current.id === firstNodeId
        ? 0
        : Math.max(nodeStartDay(current, baseDate), dependencyStartDay);

    scheduledById.set(node.id, {
      ...current,
      data: {
        ...current.data,
        startDay: currentStartDay,
        startDate: formatWorkflowDate(addWorkflowDays(baseDate, currentStartDay)),
      },
    });
  }

  const nextNodes = nodes.map((node) => scheduledById.get(node.id) ?? node);
  return nextNodes.map((node) => ({
    ...node,
    position: {
      x: nodeStartDay(node, baseDate) * DAY_WIDTH,
      y: Math.round(node.position.y / TRACK_HEIGHT) * TRACK_HEIGHT,
    },
  }));
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

  const normalizedNodes = enforceDependencySchedule(normalizeRelationships(nodes));

  const edges = normalizedNodes.flatMap((node) =>
    node.data.childrenIds
      .filter((childId) => nodeIds.has(childId))
      .map((childId) => ({
        id: `e:${node.id}-${childId}`,
        source: node.id,
        target: childId,
      })),
  );

  return { nodes: normalizedNodes, edges };
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

  const workflow = generateWorkflow(
    existing.hypothesis,
    existing.prePlan,
    existing.papers ?? [],
  );
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
