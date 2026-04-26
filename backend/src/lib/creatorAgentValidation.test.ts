import assert from "node:assert/strict";
import test from "node:test";

import { validateDag } from "./creatorAgentValidation.js";

const node = (id: string, parentIds: string[] = [], childIds: string[] = []) => ({
  node_id: id,
  step_name: `Step ${id}`,
  step_purpose: `Purpose ${id}`,
  parent_ids: parentIds,
  child_ids: childIds,
});

test("validateDag accepts an acyclic graph", () => {
  const result = validateDag(
    [node("a", [], ["b"]), node("b", ["a"], ["c"]), node("c", ["b"])],
    [
      { edge_id: "e-a-b", from_node_id: "a", to_node_id: "b" },
      { edge_id: "e-b-c", from_node_id: "b", to_node_id: "c" },
    ],
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.topologicalOrder, ["a", "b", "c"]);
});

test("validateDag rejects missing edge references", () => {
  const result = validateDag(
    [node("a")],
    [{ edge_id: "e-a-missing", from_node_id: "a", to_node_id: "missing" }],
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing to_node_id/);
});

test("validateDag rejects cycles", () => {
  const result = validateDag(
    [node("a", ["b"], ["b"]), node("b", ["a"], ["a"])],
    [
      { edge_id: "e-a-b", from_node_id: "a", to_node_id: "b" },
      { edge_id: "e-b-a", from_node_id: "b", to_node_id: "a" },
    ],
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /cycle/);
});
