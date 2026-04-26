import { useMemo } from "react";

import type { Paper } from "@/lib/papers";
import { stripPaperMarkup } from "@/lib/paperText";

interface PaperGraphProps {
  papers: Paper[];
  hypothesis?: string;
  selectedPaperId?: string | null;
  onSelect?: (paper: Paper) => void;
}

type PaperRelationKind = "citation" | "related" | "inferred";
type GraphNode = { paper: Paper; x: number; y: number; cluster: number };
type PaperEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  kind: PaperRelationKind;
};

function readableTitle(title: string): string {
  return stripPaperMarkup(title);
}

function paperKey(value: string): string {
  return value.match(/W\d+$/)?.[0] ?? value;
}

function paperTextTokens(paper: Paper): Set<string> {
  const text = `${readableTitle(paper.title)} ${stripPaperMarkup(paper.abstract)}`.toLowerCase();
  const tokens = new Set<string>();
  for (const token of text.split(/[^a-z0-9]+/)) {
    if (token.length >= 5) tokens.add(token);
  }
  return tokens;
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  let score = 0;
  for (const token of left) {
    if (right.has(token)) score += 1;
  }
  return score;
}

/**
 * Dependency-free citation graph for fetched papers.
 * Solid lines are citations among fetched OpenAlex works; dashed lines are
 * OpenAlex related-work links. Node size encodes relevance.
 */
export function PaperGraph({ papers, hypothesis, selectedPaperId, onSelect }: PaperGraphProps) {
  const layout = useMemo(() => {
    const centerX = 360;
    const centerY = 280;
    const sorted = [...papers].sort((left, right) => right.similarity - left.similarity);
    const innerCount = Math.min(8, sorted.length);
    const outerCount = Math.max(sorted.length - innerCount, 0);

    return sorted.map<GraphNode>((paper, idx) => {
      const isInner = idx < innerCount;
      const ringIndex = isInner ? idx : idx - innerCount;
      const ringSize = isInner ? innerCount : outerCount;
      const angleOffset = isInner ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / Math.max(ringSize, 1);
      const angle = (ringIndex / Math.max(ringSize, 1)) * Math.PI * 2 + angleOffset;
      const ring = isInner ? 150 : 235;
      return {
        paper,
        x: centerX + Math.cos(angle) * ring,
        y: centerY + Math.sin(angle) * ring,
        cluster: isInner ? 1 : 2,
      };
    });
  }, [papers]);

  const paperEdges = useMemo(() => {
    const nodesById = new Map<string, GraphNode>();
    for (const node of layout) {
      nodesById.set(node.paper.id, node);
      nodesById.set(paperKey(node.paper.id), node);
    }
    const seen = new Set<string>();
    const edges: PaperEdge[] = [];
    const parent = new Map(layout.map((node) => [node.paper.id, node.paper.id]));
    const tokenCache = new Map(layout.map((node) => [node.paper.id, paperTextTokens(node.paper)]));

    const find = (id: string): string => {
      const current = parent.get(id);
      if (!current || current === id) return id;
      const root = find(current);
      parent.set(id, root);
      return root;
    };

    const union = (left: string, right: string) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };

    const addEdge = (sourceId: string, targetId: string, kind: PaperRelationKind) => {
      if (sourceId === targetId) return;
      const source = nodesById.get(sourceId) ?? nodesById.get(paperKey(sourceId));
      const target = nodesById.get(targetId) ?? nodesById.get(paperKey(targetId));
      if (!source || !target) return;
      if (source.paper.id === target.paper.id) return;
      const key =
        kind === "citation"
          ? `${kind}:${source.paper.id}:${target.paper.id}`
          : `${kind}:${[source.paper.id, target.paper.id].sort().join(":")}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({
        id: key,
        sourceId: source.paper.id,
        targetId: target.paper.id,
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        kind,
      });
      union(source.paper.id, target.paper.id);
    };

    for (const { paper } of layout) {
      for (const targetId of paper.referencedPaperIds ?? []) {
        addEdge(paper.id, targetId, "citation");
      }
      for (const targetId of paper.relatedPaperIds ?? []) {
        addEdge(paper.id, targetId, "related");
      }
    }

    // OpenAlex only links nodes when one fetched paper cites or is explicitly
    // related to another fetched paper. Many result sets have valid papers but
    // sparse direct links, so connect remaining components with a visibly
    // inferred shared-topic edge instead of leaving isolated islands.
    const root = layout[0]?.paper.id;
    if (root) {
      for (let index = 1; index < layout.length; index += 1) {
        const node = layout[index]!;
        if (find(node.paper.id) === find(root)) continue;

        const nodeTokens = tokenCache.get(node.paper.id) ?? new Set<string>();
        let bestTarget = layout[0]!;
        let bestScore = -1;
        for (let targetIndex = 0; targetIndex < index; targetIndex += 1) {
          const candidate = layout[targetIndex]!;
          if (find(candidate.paper.id) !== find(root)) continue;
          const candidateTokens = tokenCache.get(candidate.paper.id) ?? new Set<string>();
          const score = overlapScore(nodeTokens, candidateTokens);
          if (score > bestScore) {
            bestScore = score;
            bestTarget = candidate;
          }
        }
        addEdge(bestTarget.paper.id, node.paper.id, "inferred");
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <svg
          viewBox="0 0 720 560"
          className="min-h-0 w-full flex-1"
          role="img"
          aria-label="Citation graph of fetched papers"
        >
          {paperEdges.map((edge) => {
            const isSelected =
              selectedPaperId === edge.sourceId || selectedPaperId === edge.targetId;
            const isInferred = edge.kind === "inferred";
            const strokeOpacity = isSelected ? 0.98 : isInferred ? 0.5 : 0.86;
            const strokeWidth = isSelected ? 2.5 : isInferred ? 1.6 : 1.9;
            return (
              <line
                key={edge.id}
                x1={edge.sourceX}
                y1={edge.sourceY}
                x2={edge.targetX}
                y2={edge.targetY}
                stroke={isSelected ? "var(--accent)" : "var(--border-strong)"}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                strokeDasharray={isInferred ? "2 6" : undefined}
              >
                <title>
                  {isInferred ? "Inferred shared-topic link" : "Direct literature link"}
                </title>
              </line>
            );
          })}

          {paperEdges.length === 0 ? (
            <text x={360} y={530} textAnchor="middle" fontSize={12} fill="var(--text-tertiary)">
              Add more papers to build literature links.
            </text>
          ) : null}

          <g>
            <title>{hypothesis ? `Hypothesis: ${hypothesis}` : "Hypothesis"}</title>
            <circle
              cx={360}
              cy={280}
              r={27}
              fill="var(--bg-surface)"
              stroke="var(--text-primary)"
              strokeWidth={1.5}
            />
            <text
              x={360}
              y={284}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--text-primary)"
            >
              H
            </text>
          </g>

          {layout.map(({ paper, x, y, cluster }, index) => {
            const isSelected = selectedPaperId === paper.id;
            const isConnected = connectedIds.has(paper.id);
            const radius = 15 + paper.similarity * 12;
            const dimmed = selectedPaperId && !isSelected && !isConnected;
            return (
              <g
                key={paper.id}
                className="cursor-pointer"
                opacity={dimmed ? 0.35 : 1}
                onClick={(e) => {
                  e.stopPropagation();
                  selectPaper(paper);
                }}
              >
                <title>{`${index + 1}. ${readableTitle(paper.title)}`}</title>
                <circle cx={x} cy={y} r={radius + 12} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={
                    isSelected
                      ? "var(--accent)"
                      : cluster === 1
                        ? "var(--accent-subtle)"
                        : "var(--bg-surface)"
                  }
                  stroke={isSelected || isConnected ? "var(--accent)" : "var(--border-strong)"}
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
              </g>
            );
          })}
        </svg>

        <div className="absolute -bottom-2 -left-2 flex flex-wrap items-center gap-5 rounded-sm border-2 border-dotted border-[color:var(--border-default)] bg-bg-surface px-4 py-2 text-[12px] font-medium text-text-primary">
          <span className="inline-flex items-center gap-2">
            <span className="h-[2px] w-12 bg-[color:var(--border-strong)]" />
            direct literature link
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-[2px] w-12 border-t-2 border-dotted border-[color:var(--border-strong)] opacity-70" />
            shared topic
          </span>
          <span className="text-[12px] font-normal text-text-tertiary">
            {paperEdges.length} graph link{paperEdges.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
