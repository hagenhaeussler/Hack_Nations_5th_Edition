import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Beaker,
  BookOpen,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  Lightbulb,
  Microscope,
  Package,
  PencilLine,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type WorkflowStatus = "done" | "active" | "upcoming";

export type WorkflowIconKey =
  | "lightbulb"
  | "book"
  | "clipboard"
  | "package"
  | "pencil"
  | "shield"
  | "beaker"
  | "microscope"
  | "flask"
  | "filetext"
  | "check"
  | "clipboard-check";

export interface WorkflowNodeData extends Record<string, unknown> {
  id: string;
  stepName: string;
  people: string[];
  equipment: string[];
  materials: string[];
  timeEstimate: string;
  price: string;
  experts: string[];
  citationsToPaper: string[];
  procedure: string;
  validationCriteria: string[];
  startDate: string;
  parentIds: string[];
  childrenIds: string[];
  status?: WorkflowStatus;
  icon?: WorkflowIconKey;
}

export const TIMELINE_DAY_WIDTH = 36;
export const TIMELINE_TRACK_HEIGHT = 160;
export const TIMELINE_MIN_NODE_WIDTH = 180;

export function parseDurationDays(timeEstimate: string | undefined): number {
  if (!timeEstimate) return 1;
  const normalized = timeEstimate.toLowerCase();
  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const amount = numbers.length > 0 ? Math.max(...numbers) : 1;
  if (normalized.includes("week")) return amount * 7;
  if (normalized.includes("month")) return amount * 30;
  if (normalized.includes("hour")) return Math.max(amount / 24, 0.25);
  return amount;
}

export function getWorkflowNodeWidth(data: WorkflowNodeData): number {
  const legacy = data as WorkflowNodeData & { effort?: string };
  const days = parseDurationDays(data.timeEstimate ?? legacy.effort);
  return Math.max(TIMELINE_MIN_NODE_WIDTH, Math.round(days * TIMELINE_DAY_WIDTH));
}

const ICON_MAP: Record<WorkflowIconKey, LucideIcon> = {
  lightbulb: Lightbulb,
  book: BookOpen,
  clipboard: ClipboardList,
  package: Package,
  pencil: PencilLine,
  shield: ShieldCheck,
  beaker: Beaker,
  microscope: Microscope,
  flask: FlaskConical,
  filetext: FileText,
  check: CheckCheck,
  "clipboard-check": ClipboardCheck,
};

/**
 * One step in the experiment-preparation DAG. Visually a small card with:
 *   – a status dot (done / active / upcoming),
 *   – an icon describing the kind of step,
 *   – the step title + an optional schedule label and short detail.
 *
 * Styling follows design_guide.md: warm cream surface, soft border, terracotta
 * accent reserved for the currently-active step.
 */
export function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const legacyData = nodeData as WorkflowNodeData & {
    title?: string;
    effort?: string;
    schedule?: string;
  };
  const status = nodeData.status ?? "upcoming";
  const icon = nodeData.icon ?? "beaker";
  const Icon = ICON_MAP[icon] ?? Beaker;
  const width = getWorkflowNodeWidth(nodeData);
  const stepName = nodeData.stepName ?? legacyData.title ?? "Untitled step";
  const startDate = nodeData.startDate ?? legacyData.schedule;
  const timeEstimate = nodeData.timeEstimate ?? legacyData.effort ?? "1 day";
  const price = nodeData.price ?? "$0";

  return (
    <div
      style={{ width }}
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-md border bg-bg-surface px-3 py-2.5 shadow-sm",
        "transition-shadow duration-[var(--duration-fast)] hover:shadow-md",
        status === "active"
          ? "border-[color:var(--accent)]"
          : "border-[color:var(--border-default)]",
        selected && "ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--bg-primary)]",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-[color:var(--border-strong)] !bg-bg-surface"
      />

      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
          status === "active"
            ? "bg-[color:var(--accent-subtle)] text-accent"
            : status === "done"
              ? "bg-bg-hover text-text-secondary"
              : "bg-bg-hover text-text-tertiary",
        )}
      >
        <Icon size={15} strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <StatusDot status={status} />
          {startDate && (
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              {startDate}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] font-medium text-text-primary">
          {stepName}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.45] text-text-secondary">
          {timeEstimate} · {price}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-[color:var(--border-strong)] !bg-bg-surface"
      />
    </div>
  );
}

function StatusDot({ status }: { status: WorkflowStatus }) {
  return (
    <span
      aria-label={status}
      className={cn(
        "block h-1.5 w-1.5 rounded-full",
        status === "done" && "bg-text-tertiary",
        status === "active" && "bg-accent",
        status === "upcoming" && "border border-[color:var(--border-strong)]",
      )}
    />
  );
}
