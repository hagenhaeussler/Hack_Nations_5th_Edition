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
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo } from "react";

import "@xyflow/react/dist/style.css";

import { WorkflowNode, type WorkflowNodeData } from "./WorkflowNode";

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

function getReadableViewport(nodes: Node<WorkflowNodeData>[]): Viewport {
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const zoom = nodes.length > 8 ? 0.68 : 0.85;

  return {
    x: 72 - minX * zoom,
    y: 260 - minY * zoom,
    zoom,
  };
}

/**
 * Pannable / zoomable DAG canvas built on @xyflow/react.
 *
 * The provider wrapper is required so that the inner graph picks up the
 * correct viewport sizing when nested inside a flexbox layout (e.g.
 * `ProjectPage`'s workflow view).
 *
 * The graph is fully controlled: callers pass the nodes + edges to render
 * (they live on the persisted `Project` record) and the selected node id.
 * The custom `WorkflowNode` component renders a terracotta ring around the
 * selected node.
 */
interface TimelineGraphProps {
  initialNodes: Node<WorkflowNodeData>[];
  initialEdges: Edge[];
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
}

export function TimelineGraph({
  initialNodes,
  initialEdges,
  selectedNodeId = null,
  onNodeSelect,
}: TimelineGraphProps) {
  return (
    <div className="h-full min-h-[560px] w-full">
      <ReactFlowProvider>
        <TimelineGraphInner
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
        />
      </ReactFlowProvider>
    </div>
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
  const { setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<WorkflowNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const readableViewport = useMemo(
    () => getReadableViewport(initialNodes),
    [initialNodes],
  );

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);

    const frame = window.requestAnimationFrame(() => {
      void setViewport(readableViewport, { duration: 250 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    initialEdges,
    initialNodes,
    readableViewport,
    setEdges,
    setNodes,
    setViewport,
  ]);

  const handleInit = useCallback(
    (instance: ReactFlowInstance<Node<WorkflowNodeData>, Edge>) => {
      void instance.setViewport(readableViewport, { duration: 250 });
    },
    [readableViewport],
  );

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
      onInit={handleInit}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      defaultViewport={readableViewport}
      minZoom={0.25}
      maxZoom={1.75}
      proOptions={{ hideAttribution: true }}
      panOnDrag
      panOnScroll
      zoomOnScroll
      selectionOnDrag={false}
      nodesConnectable={false}
      className="h-full w-full bg-bg-primary"
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
