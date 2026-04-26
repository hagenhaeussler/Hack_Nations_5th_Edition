import type { PlanPatch } from "./planEditorAgent.js";
import type { Workflow } from "./projectTypes.js";

export interface SafePatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  blast_radius: "tiny" | "small" | "medium" | "large" | "blocked";
}

const BLOCKED_FIELDS = [
  "source",
  "papers",
  "lesson",
  "inventory",
  "previous_experiment",
  "novelty",
  "hypothesis",
];

export function validateSafePlanPatch(
  workflow: Workflow,
  patch: PlanPatch,
): SafePatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const edgeIds = new Set(workflow.edges.map((edge) => edge.id));

  if (patch.operations.length === 0) {
    warnings.push("Patch contains no operations.");
  }
  if (patch.operations.length > 6) {
    errors.push("Patch touches too many operations for a safe preview.");
  }
  const removeNodeOps = patch.operations.filter((op) => op.operation_type === "remove_node");
  if (removeNodeOps.length > 1) {
    errors.push("Patch deletes multiple nodes; explicit separate confirmation is required.");
  }

  for (const operation of patch.operations) {
    const fieldPath = operation.field_path.toLowerCase();
    if (BLOCKED_FIELDS.some((blocked) => fieldPath.includes(blocked))) {
      errors.push(`Patch attempts to change protected field "${operation.field_path}".`);
    }
    if (operation.target_type === "node" && !nodeIds.has(operation.target_id)) {
      errors.push(`Patch references missing node "${operation.target_id}".`);
    }
    if (operation.target_type === "edge" && !edgeIds.has(operation.target_id)) {
      errors.push(`Patch references missing edge "${operation.target_id}".`);
    }
    if (operation.operation_type === "remove_node") {
      const hasDependents = workflow.edges.some((edge) => edge.source === operation.target_id);
      if (hasDependents) {
        errors.push(`Patch deletes node "${operation.target_id}" while dependent nodes still exist.`);
      }
    }
  }

  const affectedTargets = new Set(patch.operations.map((op) => `${op.target_type}:${op.target_id}`));
  const blast_radius =
    errors.length > 0
      ? "blocked"
      : affectedTargets.size <= 1
        ? "tiny"
        : affectedTargets.size <= 3
          ? "small"
          : affectedTargets.size <= 6
            ? "medium"
            : "large";

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blast_radius,
  };
}
