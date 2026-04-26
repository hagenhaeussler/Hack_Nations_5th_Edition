import type { FinalExperimentPlan, FinalPlanEdge, FinalPlanNode } from "./projectTypes.js";

export interface DagValidationResult {
  ok: boolean;
  errors: string[];
  topologicalOrder: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function validateDag(
  nodes: Pick<FinalPlanNode, "node_id" | "step_name" | "step_purpose" | "parent_ids" | "child_ids">[],
  edges: Pick<FinalPlanEdge, "edge_id" | "from_node_id" | "to_node_id">[],
): DagValidationResult {
  const errors: string[] = [];
  const ids = nodes.map((node) => node.node_id);
  const nodeIds = new Set(ids);

  for (const id of ids) {
    if (!id) errors.push("Every node must have a node_id.");
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) {
      errors.push(`Duplicate node_id "${id}".`);
    }
  }

  for (const node of nodes) {
    if (!node.step_name?.trim()) {
      errors.push(`Node "${node.node_id}" is missing step_name.`);
    }
    if (!node.step_purpose?.trim()) {
      errors.push(`Node "${node.node_id}" is missing step_purpose.`);
    }

    for (const parentId of unique(node.parent_ids ?? [])) {
      if (!nodeIds.has(parentId)) {
        errors.push(`Node "${node.node_id}" references missing parent "${parentId}".`);
      }
    }
    for (const childId of unique(node.child_ids ?? [])) {
      if (!nodeIds.has(childId)) {
        errors.push(`Node "${node.node_id}" references missing child "${childId}".`);
      }
    }
  }

  const outgoing = new Map<string, string[]>(nodes.map((node) => [node.node_id, []]));
  const indegree = new Map<string, number>(nodes.map((node) => [node.node_id, 0]));

  for (const edge of edges) {
    if (!edge.edge_id) errors.push("Every edge must have an edge_id.");
    if (!nodeIds.has(edge.from_node_id)) {
      errors.push(`Edge "${edge.edge_id}" references missing from_node_id "${edge.from_node_id}".`);
      continue;
    }
    if (!nodeIds.has(edge.to_node_id)) {
      errors.push(`Edge "${edge.edge_id}" references missing to_node_id "${edge.to_node_id}".`);
      continue;
    }
    outgoing.get(edge.from_node_id)?.push(edge.to_node_id);
    indegree.set(edge.to_node_id, (indegree.get(edge.to_node_id) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.node_id) ?? 0) === 0)
    .map((node) => node.node_id);
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    topologicalOrder.push(id);
    for (const childId of outgoing.get(id) ?? []) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) queue.push(childId);
    }
  }

  if (topologicalOrder.length !== nodes.length) {
    errors.push("Graph contains a cycle.");
  }

  return { ok: errors.length === 0, errors, topologicalOrder };
}

export function validateFinalExperimentPlan(plan: FinalExperimentPlan): DagValidationResult {
  const result = validateDag(plan.nodes, plan.edges);
  const errors = [...result.errors];

  const report = plan.stats_report;
  if (report.plan_id !== plan.plan_id) {
    errors.push("Stats report plan_id does not match final plan plan_id.");
  }
  if (plan.calendar_layout.total_days < 1) {
    errors.push("Calendar layout must cover at least one day.");
  }
  if (plan.calendar_layout.total_weeks < 1) {
    errors.push("Calendar layout must cover at least one week.");
  }

  const nodeIds = new Set(plan.nodes.map((node) => node.node_id));
  for (const id of plan.calendar_layout.critical_path_node_ids) {
    if (!nodeIds.has(id)) errors.push(`Critical path references missing node "${id}".`);
  }

  return {
    ok: errors.length === 0,
    errors,
    topologicalOrder: result.topologicalOrder,
  };
}
