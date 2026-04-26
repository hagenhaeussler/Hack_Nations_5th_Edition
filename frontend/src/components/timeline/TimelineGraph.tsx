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
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import "@xyflow/react/dist/style.css";

import {
  TIMELINE_DAY_WIDTH,
  TIMELINE_TRACK_HEIGHT,
  WorkflowNode,
  getWorkflowNodeWidth,
  type WorkflowNodeData,
} from "./WorkflowNode";

const AXIS_HEIGHT = 88;
const APPROX_NODE_HEIGHT = 132;

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
  onNodeMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeConnect?: (sourceId: string, targetId: string) => void;
}

export function TimelineGraph({
  initialNodes,
  initialEdges,
  selectedNodeId = null,
  onNodeSelect,
  onNodeMove,
  onNodeConnect,
}: TimelineGraphProps) {
  return (
    <div className="h-full min-h-[560px] w-full">
      <ReactFlowProvider>
        <TimelineGraphInner
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
          onNodeMove={onNodeMove}
          onNodeConnect={onNodeConnect}
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
  onNodeMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeConnect?: (sourceId: string, targetId: string) => void;
}

function TimelineGraphInner({
  initialNodes,
  initialEdges,
  selectedNodeId,
  onNodeSelect,
  onNodeMove,
  onNodeConnect,
}: TimelineGraphInnerProps) {
  const { fitView, setViewport } = useReactFlow();
  const viewport = useViewport();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<WorkflowNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const axisDayCount = useMemo(() => {
    const lastDay = Math.max(
      0,
      ...initialNodes.map((node) => {
        const nodeWidth = getWorkflowNodeWidth(node.data);
        return Math.ceil((node.position.x + nodeWidth) / TIMELINE_DAY_WIDTH);
      },
      ),
    );
    return lastDay + 8;
  }, [initialNodes]);

  const translateExtent = useMemo(() => {
    if (initialNodes.length === 0) {
      return [
        [-TIMELINE_DAY_WIDTH, -TIMELINE_TRACK_HEIGHT],
        [TIMELINE_DAY_WIDTH, TIMELINE_TRACK_HEIGHT],
      ] as [[number, number], [number, number]];
    }

    const minX = Math.min(...initialNodes.map((node) => node.position.x));
    const minY = Math.min(...initialNodes.map((node) => node.position.y));
    const maxX = Math.max(
      ...initialNodes.map(
        (node) => node.position.x + getWorkflowNodeWidth(node.data),
      ),
    );
    const maxY = Math.max(...initialNodes.map((node) => node.position.y));

    return [
      [minX - TIMELINE_DAY_WIDTH, minY - TIMELINE_TRACK_HEIGHT],
      [
        maxX + TIMELINE_DAY_WIDTH,
        maxY + TIMELINE_TRACK_HEIGHT + APPROX_NODE_HEIGHT,
      ],
    ] as [[number, number], [number, number]];
  }, [initialNodes]);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);

    let fitFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      fitFrame = window.requestAnimationFrame(() => {
        void fitView({ duration: 250, maxZoom: 1.2, padding: 0.1 });
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(fitFrame);
    };
  }, [
    initialEdges,
    initialNodes,
    fitView,
    setEdges,
    setNodes,
  ]);

  const handleInit = useCallback(
    (instance: ReactFlowInstance<Node<WorkflowNodeData>, Edge>) => {
      window.requestAnimationFrame(() => {
        void instance.fitView({ duration: 250, maxZoom: 1.2, padding: 0.1 });
      });
    },
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setEdges((eds) => addEdge(connection, eds));
      onNodeConnect?.(connection.source, connection.target);
    },
    [onNodeConnect, setEdges],
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

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
      onNodeMove?.(node.id, node.position);
    },
    [onNodeMove],
  );

  const handleMoveEnd = useCallback((_: unknown, nextViewport?: Viewport) => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;

    const activeViewport = nextViewport ?? viewport;
    const { width, height } = container.getBoundingClientRect();
    const usableHeight = Math.max(0, height - AXIS_HEIGHT);
    const z = activeViewport.zoom;
    const hasVisibleNode = nodes.some((node) => {
      const nodeWidth = getWorkflowNodeWidth(node.data);
      const x = node.position.x * z + activeViewport.x;
      const y = node.position.y * z + activeViewport.y;
      return (
        x >= 0 &&
        y >= 0 &&
        x + nodeWidth * z <= width &&
        y + APPROX_NODE_HEIGHT * z <= usableHeight
      );
    });
    if (hasVisibleNode) return;

    const centerX = width / 2;
    const centerY = usableHeight / 2;
    const nearest = nodes
      .slice()
      .sort((a, b) => {
        const aWidth = getWorkflowNodeWidth(a.data);
        const bWidth = getWorkflowNodeWidth(b.data);
        const ax =
          a.position.x * z + activeViewport.x + (aWidth * z) / 2;
        const ay =
          a.position.y * z + activeViewport.y + (APPROX_NODE_HEIGHT * z) / 2;
        const bx =
          b.position.x * z + activeViewport.x + (bWidth * z) / 2;
        const by =
          b.position.y * z + activeViewport.y + (APPROX_NODE_HEIGHT * z) / 2;
        return (
          Math.hypot(ax - centerX, ay - centerY) -
          Math.hypot(bx - centerX, by - centerY)
        );
      })[0];
    if (!nearest) return;
    const nearestWidth = getWorkflowNodeWidth(nearest.data);

    void setViewport(
      {
        x: centerX - (nearest.position.x + nearestWidth / 2) * z,
        y: centerY - (nearest.position.y + APPROX_NODE_HEIGHT / 2) * z,
        zoom: z,
      },
      { duration: 180 },
    );
  }, [nodes, setViewport, viewport]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
        onMoveEnd={handleMoveEnd}
        onInit={handleInit}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        fitView
        fitViewOptions={{ maxZoom: 1.2, padding: 0.1 }}
        minZoom={0.08}
        maxZoom={1.75}
        translateExtent={translateExtent}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        panOnScroll
        zoomOnScroll
        selectionOnDrag={false}
        nodesConnectable
        snapToGrid
        snapGrid={[TIMELINE_DAY_WIDTH, TIMELINE_TRACK_HEIGHT]}
        className="h-full w-full bg-bg-primary"
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={[TIMELINE_DAY_WIDTH, TIMELINE_TRACK_HEIGHT]}
          size={1}
          color="var(--border-default)"
        />
        <Controls
          showInteractive={false}
          className="!rounded-md !border !border-[color:var(--border-default)] !bg-bg-surface !shadow-sm"
        />
        <MiniMap
          pannable
          zoomable
          position="top-right"
          maskColor="rgba(28, 25, 23, 0.06)"
          nodeStrokeColor="var(--border-strong)"
          nodeColor="var(--bg-surface)"
          nodeBorderRadius={6}
          className="!rounded-md !border !border-[color:var(--border-default)] !bg-bg-surface !shadow-sm"
        />
      </ReactFlow>
      <TimelineAxis dayCount={axisDayCount} viewport={viewport} />
    </div>
  );
}

function TimelineAxis({
  dayCount,
  viewport,
}: {
  dayCount: number;
  viewport: Viewport;
}) {
  const zoom = viewport.zoom;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 h-20 overflow-hidden rounded-md border border-[color:var(--border-default)] bg-bg-surface/95 px-4 py-3 shadow-sm backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Workflow timeline
        </span>
        <span className="text-[11px] text-text-tertiary">
          day number from first task
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-6 border-t border-[color:var(--border-strong)]" />
      <span className="absolute bottom-2 left-4 text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        Start
      </span>
      <div className="absolute bottom-4 left-0 right-0">
        {Array.from({ length: dayCount }).map((_, day) => (
          <div
            key={day}
            className="absolute flex -translate-x-1/2 flex-col items-center gap-1"
            style={{
              left: viewport.x + day * TIMELINE_DAY_WIDTH * zoom,
            }}
          >
            <span className="h-3 border-l border-[color:var(--border-strong)]" />
            {day % 5 === 0 ? (
              <span className="text-[11px] font-medium text-text-secondary">
                {day}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
