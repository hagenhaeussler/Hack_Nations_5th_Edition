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
  Users,
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
  personnelRequirement: string;
  timeEstimate: string;
  price: string;
  experts: string[];
  citationsToPaper: string[];
  procedure: string;
  validationCriteria: string[];
  startDate: string;
  startDay: number;
  parentIds: string[];
  childrenIds: string[];
  status?: WorkflowStatus;
  icon?: WorkflowIconKey;
}

export const TIMELINE_DAY_WIDTH = 220;
export const TIMELINE_TRACK_HEIGHT = 220;
export const TIMELINE_NODE_WIDTH = 204;

export function parseDurationDays(timeEstimate: string | undefined): number {
  if (!timeEstimate) return 1;
  const normalized = timeEstimate.toLowerCase();
  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const amount = numbers.length > 0 ? Math.max(...numbers) : 1;
  if (normalized.includes("week")) return amount * 7;
  if (normalized.includes("month")) return amount * 30;
  if (normalized.includes("hour")) return 1;
  return Math.max(amount, 1);
}

export function getWorkflowNodeWidth(data: WorkflowNodeData): number {
  const legacy = data as WorkflowNodeData & { effort?: string };
  const days = Math.max(1, Math.ceil(parseDurationDays(data.timeEstimate ?? legacy.effort)));
  return Math.max(TIMELINE_NODE_WIDTH, days * TIMELINE_DAY_WIDTH - 24);
}

function getPersonnelRequirement(data: WorkflowNodeData): string {
  if (data.personnelRequirement?.trim()) return data.personnelRequirement;
  const count = data.people?.length ?? 0;
  if (count === 0) return "Personnel TBD";
  return `${count} ${count === 1 ? "person" : "people"}`;
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
  const startDay = Number.isFinite(nodeData.startDay) ? nodeData.startDay : 0;
  const timeEstimate = nodeData.timeEstimate ?? legacyData.effort ?? "1 day";
  const price = nodeData.price ?? "$0";
  const personnelRequirement = getPersonnelRequirement(nodeData);

  return (
    <div
      style={{ width }}
      className={cn(
        "group relative flex min-h-[128px] cursor-pointer items-start gap-3.5 rounded-md border bg-bg-surface px-4 py-4 shadow-sm",
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
        className="!h-3 !w-3 !border-[color:var(--border-strong)] !bg-bg-surface"
      />

      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
          status === "active"
            ? "bg-[color:var(--accent-subtle)] text-accent"
            : status === "done"
              ? "bg-bg-hover text-text-secondary"
              : "bg-bg-hover text-text-tertiary",
        )}
      >
        <Icon size={18} strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <StatusDot status={status} />
          {Number.isFinite(startDay) && (
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Day {startDay}
            </span>
          )}
        </div>
        <p className="mt-1.5 truncate text-[15px] font-medium text-text-primary">
          {stepName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-[1.4] text-text-secondary">
          <span className="truncate">{timeEstimate}</span>
          <span className="truncate font-medium text-text-primary">{price}</span>
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <Users size={12} strokeWidth={1.6} className="shrink-0 text-text-tertiary" />
            {personnelRequirement}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-[color:var(--border-strong)] !bg-bg-surface"
      />
    </div>
  );
}

function StatusDot({ status }: { status: WorkflowStatus }) {
  return (
    <span
      aria-label={status}
      className={cn(
        "block h-2 w-2 rounded-full",
        status === "done" && "bg-text-tertiary",
        status === "active" && "bg-accent",
        status === "upcoming" && "border border-[color:var(--border-strong)]",
      )}
    />
  );
}
