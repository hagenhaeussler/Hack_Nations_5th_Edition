import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useMemo } from "react";

import "@xyflow/react/dist/style.css";

import { WorkflowNode, type WorkflowNodeData } from "./WorkflowNode";
import {
  EXAMPLE_EDGES,
  EXAMPLE_NODES,
} from "./exampleWorkflow";

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
};

/** Default visual treatment for every edge in the DAG. */
const DEFAULT_EDGE_OPTIONS = {
  type: "smoothstep" as const,
  animated: false,
  style: {
    stroke: "var(--border-strong)",
    strokeWidth: 1.25,
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "var(--border-strong)",
    width: 14,
    height: 14,
  },
} satisfies Partial<Edge>;

/**
 * Pannable / zoomable DAG canvas built on @xyflow/react.
 *
 * The provider wrapper is required so that consumers nested inside a layout
 * (like `TimelinePage`) get correct viewport sizing. The graph defaults to the
 * exemplary "prepare a basic experiment" workflow but accepts overrides for
 * future hypothesis-specific timelines.
 *
 * Selection is fully controlled by the parent: the parent passes
 * `selectedNodeId` and is notified via `onNodeSelect` when the user clicks a
 * node or the empty pane (clears selection). Selected nodes get a terracotta
 * ring rendered by `WorkflowNode`.
 */
interface TimelineGraphProps {
  initialNodes?: Node<WorkflowNodeData>[];
  initialEdges?: Edge[];
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
}

export function TimelineGraph({
  initialNodes = EXAMPLE_NODES,
  initialEdges = EXAMPLE_EDGES,
  selectedNodeId = null,
  onNodeSelect,
}: TimelineGraphProps) {
  return (
    <ReactFlowProvider>
      <TimelineGraphInner
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        selectedNodeId={selectedNodeId}
        onNodeSelect={onNodeSelect}
      />
    </ReactFlowProvider>
  );
}

interface TimelineGraphInnerProps {
  initialNodes: Node<WorkflowNodeData>[];
  initialEdges: Edge[];
  selectedNodeId: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
}

function TimelineGraphInner({
  initialNodes,
  initialEdges,
  selectedNodeId,
  onNodeSelect,
}: TimelineGraphInnerProps) {
  const [nodes, _setNodes, onNodesChange] =
    useNodesState<Node<WorkflowNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  // Project the externally-controlled selection into the node `selected` flag
  // so the custom node component can render the ring.
  const styledNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.selected === (node.id === selectedNodeId)
          ? node
          : { ...node, selected: node.id === selectedNodeId },
      ),
    [nodes, selectedNodeId],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      fitView
      fitViewOptions={{ padding: 0.16, minZoom: 0.25, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.75}
      proOptions={{ hideAttribution: true }}
      panOnDrag
      panOnScroll
      zoomOnScroll
      selectionOnDrag={false}
      nodesConnectable={false}
      className="bg-bg-primary"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.4}
        color="var(--border-default)"
      />
      <Controls
        showInteractive={false}
        className="!rounded-md !border !border-[color:var(--border-default)] !bg-bg-surface !shadow-sm"
      />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(28, 25, 23, 0.06)"
        nodeStrokeColor="var(--border-strong)"
        nodeColor="var(--bg-surface)"
        nodeBorderRadius={6}
        className="!rounded-md !border !border-[color:var(--border-default)] !bg-bg-surface !shadow-sm"
      />
    </ReactFlow>
  );
}
