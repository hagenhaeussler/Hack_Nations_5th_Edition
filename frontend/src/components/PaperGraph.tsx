import { useMemo } from "react";

import type { Paper } from "@/lib/papers";
import { cn } from "@/lib/utils";

interface PaperGraphProps {
  papers: Paper[];
  selectedPaperId?: string | null;
  onSelect?: (paper: Paper) => void;
}

type PaperRelationKind = "citation" | "related";
type GraphNode = { paper: Paper; x: number; y: number; cluster: number };

/**
 * Dependency-free citation graph for fetched papers.
 * Solid lines are citations among fetched OpenAlex works; dashed lines are
 * OpenAlex related-work links. Node size encodes relevance.
 */
export function PaperGraph({ papers, selectedPaperId, onSelect }: PaperGraphProps) {
  const layout = useMemo(() => {
    const centerX = 340;
    const centerY = 250;
    const radius = 190;
    const sorted = [...papers].sort((left, right) => right.similarity - left.similarity);

    return sorted.map<GraphNode>((paper, idx) => {
      if (idx === 0) {
        return { paper, x: centerX, y: centerY, cluster: 0 };
      }
      const angle = ((idx - 1) / Math.max(sorted.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
      const ring = idx <= 6 ? radius * 0.62 : radius;
      const jitter = (idx % 3) * 18;
      return {
        paper,
        x: centerX + Math.cos(angle) * (ring + jitter),
        y: centerY + Math.sin(angle) * (ring + jitter),
        cluster: idx <= 6 ? 1 : 2,
      };
    });
  }, [papers]);

  const paperEdges = useMemo(() => {
    const nodesById = new Map(layout.map((node) => [node.paper.id, node]));
    const seen = new Set<string>();
    const edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      kind: PaperRelationKind;
    }> = [];

    const addEdge = (sourceId: string, targetId: string, kind: PaperRelationKind) => {
      if (sourceId === targetId) return;
      const source = nodesById.get(sourceId);
      const target = nodesById.get(targetId);
      if (!source || !target) return;
      const key =
        kind === "related"
          ? `${kind}:${[sourceId, targetId].sort().join(":")}`
          : `${kind}:${sourceId}:${targetId}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({
        id: key,
        sourceId,
        targetId,
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        kind,
      });
    };

    for (const { paper } of layout) {
      for (const targetId of paper.referencedPaperIds ?? []) {
        addEdge(paper.id, targetId, "citation");
      }
      for (const targetId of paper.relatedPaperIds ?? []) {
        addEdge(paper.id, targetId, "related");
      }
    }

    return edges;
  }, [layout]);

  const connectedIds = useMemo(() => {
    if (!selectedPaperId) return new Set<string>();
    return new Set(
      paperEdges
        .filter((edge) => edge.sourceId === selectedPaperId || edge.targetId === selectedPaperId)
        .flatMap((edge) => [edge.sourceId, edge.targetId]),
    );
  }, [paperEdges, selectedPaperId]);

  const selectPaper = (paper: Paper) => {
    onSelect?.(paper);
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <svg
        viewBox="0 0 680 500"
        className="min-h-0 w-full flex-1"
        role="img"
        aria-label="Citation graph of fetched papers"
      >
        <defs>
          <marker
            id="citation-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--border-strong)" opacity="0.75" />
          </marker>
        </defs>

        {paperEdges.map((edge) => {
          const isSelected =
            selectedPaperId === edge.sourceId || selectedPaperId === edge.targetId;
          return (
            <line
              key={edge.id}
              x1={edge.sourceX}
              y1={edge.sourceY}
              x2={edge.targetX}
              y2={edge.targetY}
              stroke={isSelected ? "var(--accent)" : "var(--border-strong)"}
              strokeOpacity={isSelected ? 0.85 : 0.45}
              strokeWidth={isSelected ? 1.75 : 1}
              strokeDasharray={edge.kind === "related" ? "4 5" : undefined}
              markerEnd={edge.kind === "citation" ? "url(#citation-arrow)" : undefined}
            />
          );
        })}

        {paperEdges.length === 0 ? (
          <text x={340} y={470} textAnchor="middle" fontSize={12} fill="var(--text-tertiary)">
            No citation links found among the fetched papers yet.
          </text>
        ) : null}

        {layout.map(({ paper, x, y, cluster }, index) => {
          const isSelected = selectedPaperId === paper.id;
          const isConnected = connectedIds.has(paper.id);
          const radius = 15 + paper.similarity * 12;
          const dimmed = selectedPaperId && !isSelected && !isConnected;
          return (
            <g
              key={paper.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                selectPaper(paper);
              }}
            >
              <circle cx={x} cy={y} r={radius + 10} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={radius}
                fill={isSelected ? "var(--accent)" : cluster === 0 ? "var(--accent-subtle)" : "var(--bg-surface)"}
                stroke={isSelected || isConnected ? "var(--accent)" : "var(--border-strong)"}
                strokeOpacity={dimmed ? 0.35 : 1}
                strokeWidth={isSelected ? 2 : 1.25}
              />
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={isSelected ? "white" : "var(--text-primary)"}
              >
                {index + 1}
              </text>
              <foreignObject x={x - 72} y={y + radius + 6} width={144} height={42} opacity={dimmed ? 0.35 : 1}>
                <div className="line-clamp-2 text-center text-[10px] leading-[1.25] text-text-secondary">
                  {paper.title}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary">
        <span className={cn("inline-flex items-center gap-1.5")}>
          <span className="h-px w-8 bg-[color:var(--border-strong)]" />
          cites fetched paper
        </span>
        <span className={cn("inline-flex items-center gap-1.5")}>
          <span className="h-px w-8 border-t border-dashed border-[color:var(--border-strong)]" />
          related work
        </span>
        <span>{paperEdges.length} graph link{paperEdges.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
