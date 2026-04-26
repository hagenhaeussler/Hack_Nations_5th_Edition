import type {
  CalendarLayout,
  FinalPlanCalendarPosition,
  FinalPlanEdge,
  FinalPlanNode,
} from "./projectTypes.js";
import { buildCalendarLayout } from "./calendarLayout.js";

const DAY_WIDTH = 36;
const TRACK_HEIGHT = 160;
const MIN_NODE_WIDTH = 180;

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDurationDays(node: FinalPlanNode): number {
  const { value, unit } = node.estimated_duration;
  if (value === null) return 1;
  const normalized = unit.toLowerCase();
  if (normalized.includes("week")) return Math.max(1, Math.ceil(value * 7));
  if (normalized.includes("month")) return Math.max(1, Math.ceil(value * 30));
  if (normalized.includes("hour")) return Math.max(1, Math.ceil(value / 24));
  return Math.max(1, Math.ceil(value));
}

function trackForNode(node: FinalPlanNode): number {
  const text = `${node.step_name} ${node.step_purpose}`.toLowerCase();
  if (/hypothesis|goal|control|approval|validate|risk/.test(text)) return 0;
  if (/literature|source|review|design|protocol|select/.test(text)) return 1;
  if (/order|buy|reagent|material|prepare|sample|cell/.test(text)) return 2;
  if (/analy|sequence|data|statistic|result|report/.test(text)) return 4;
  return 3;
}

export function applyCalendarSchedule(
  nodes: FinalPlanNode[],
  edges: FinalPlanEdge[],
  timelineStart = new Date(),
): { nodes: FinalPlanNode[]; edges: FinalPlanEdge[]; calendarLayout: CalendarLayout } {
  const base = new Date(Date.UTC(
    timelineStart.getUTCFullYear(),
    timelineStart.getUTCMonth(),
    timelineStart.getUTCDate(),
  ));

  const nextNodes = nodes
    .slice()
    .sort((a, b) => a.start.relative_day - b.start.relative_day)
    .map((node, index): FinalPlanNode => {
    const duration = parseDurationDays(node);
    const start = Math.max(0, node.start.relative_day);
    const end = Math.max(start + duration, node.end.relative_day || start + duration);
    const lane = trackForNode(node);
    const position: FinalPlanCalendarPosition = {
      week_index: Math.floor(start / 7),
      day_index: start % 7,
      x: start * DAY_WIDTH,
      y: lane * TRACK_HEIGHT,
      width: Math.max(MIN_NODE_WIDTH, duration * DAY_WIDTH),
      lane,
    };

    return {
      ...node,
      start: {
        type: "absolute",
        relative_day: start,
        date: formatIsoDate(addDays(base, start)),
      },
      end: {
        type: "absolute",
        relative_day: end,
        date: formatIsoDate(addDays(base, end)),
      },
      calendar_position: position,
      status: index === 0 && node.status === "upcoming" ? "active" : node.status,
    };
  });

  return {
    nodes: nextNodes,
    edges: edges.map((edge) => ({ ...edge, is_critical_path_dependency: false })),
    calendarLayout: buildCalendarLayout(nextNodes, formatIsoDate(base)),
  };
}
