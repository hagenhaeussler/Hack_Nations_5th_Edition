import { CalendarDays, Check, CircleDashed, Clock, X } from "lucide-react";
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

import type {
  WorkflowIconKey,
  WorkflowNodeData,
  WorkflowStatus,
} from "./WorkflowNode";

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

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  done: "Completed",
  active: "In progress",
  upcoming: "Upcoming",
};

interface WorkflowNodeDetailPanelProps {
  data: WorkflowNodeData;
  onClose: () => void;
}

/**
 * Right-side detail panel for a workflow node.
 * Width: ~1/3 of viewport on desktop, full overlay on narrow screens.
 * Slides in from the right; closes via the header X or by clicking the
 * canvas pane (handled by the parent).
 */
export function WorkflowNodeDetailPanel({
  data,
  onClose,
}: WorkflowNodeDetailPanelProps) {
  const Icon = ICON_MAP[data.icon] ?? Beaker;

  return (
    <aside
      role="complementary"
      aria-label={`${data.title} details`}
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-full flex-col",
        "border-l border-[color:var(--border-default)] bg-bg-surface shadow-lg",
        "lg:w-1/3",
        "animate-slide-in-right",
      )}
    >
      <PanelHeader data={data} icon={Icon} onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Meta data={data} />

        {data.description && (
          <Section title="Overview">
            <p className="text-[14px] leading-[1.65] text-text-secondary">
              {data.description}
            </p>
          </Section>
        )}

        {data.deliverables && data.deliverables.length > 0 && (
          <Section title="Deliverables">
            <ul className="flex flex-col gap-1.5">
              {data.deliverables.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[13.5px] leading-[1.55] text-text-primary"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-text-tertiary"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.checklist && data.checklist.length > 0 && (
          <Section title="Checklist">
            <ul className="flex flex-col gap-1.5">
              {data.checklist.map((item) => (
                <ChecklistRow key={item} label={item} status={data.status} />
              ))}
            </ul>
          </Section>
        )}

        {!data.description &&
          !data.deliverables?.length &&
          !data.checklist?.length && (
            <p className="text-[13.5px] leading-[1.6] text-text-tertiary">
              No additional details captured for this step yet.
            </p>
          )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--border-default)] px-6 py-3">
        <span className="text-[11.5px] text-text-tertiary">
          Step ID:{" "}
          <span className="font-mono text-text-secondary">
            {data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "rounded-sm border border-[color:var(--border-default)] px-3 py-1.5 text-[13px] text-text-secondary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          Close
        </button>
      </footer>
    </aside>
  );
}

interface PanelHeaderProps {
  data: WorkflowNodeData;
  icon: LucideIcon;
  onClose: () => void;
}

function PanelHeader({ data, icon: Icon, onClose }: PanelHeaderProps) {
  return (
    <header className="flex items-start gap-3 border-b border-[color:var(--border-default)] px-6 py-5">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
          data.status === "active"
            ? "bg-[color:var(--accent-subtle)] text-accent"
            : "bg-bg-hover text-text-secondary",
        )}
      >
        <Icon size={18} strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <StatusDot status={data.status} />
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
            {STATUS_LABEL[data.status]}
          </span>
        </div>
        <h2 className="mt-1 text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-text-primary">
          {data.title}
        </h2>
        {data.detail && (
          <p className="mt-1 text-[13px] leading-[1.55] text-text-secondary">
            {data.detail}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
          "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
        )}
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </header>
  );
}

function Meta({ data }: { data: WorkflowNodeData }) {
  if (!data.schedule && !data.effort) return null;
  return (
    <dl className="mb-5 grid grid-cols-2 gap-3 rounded-md border border-[color:var(--border-default)] bg-bg-primary px-4 py-3">
      {data.schedule && (
        <MetaItem
          icon={<CalendarDays size={13} strokeWidth={1.5} />}
          label="Schedule"
          value={data.schedule}
        />
      )}
      {data.effort && (
        <MetaItem
          icon={<Clock size={13} strokeWidth={1.5} />}
          label="Effort"
          value={data.effort}
        />
      )}
    </dl>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        <span className="text-text-tertiary">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] text-text-primary">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ChecklistRow({
  label,
  status,
}: {
  label: string;
  status: WorkflowStatus;
}) {
  // Visual hint only — checking off items is not yet persisted.
  const checked = status === "done";
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
          checked
            ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-accent"
            : "border-[color:var(--border-strong)] text-transparent",
        )}
      >
        {checked ? (
          <Check size={11} strokeWidth={2} />
        ) : (
          <CircleDashed size={11} strokeWidth={1.5} className="opacity-0" />
        )}
      </span>
      <span
        className={cn(
          "text-[13.5px] leading-[1.55]",
          checked
            ? "text-text-tertiary line-through"
            : "text-text-primary",
        )}
      >
        {label}
      </span>
    </li>
  );
}

function StatusDot({ status }: { status: WorkflowStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-1.5 w-1.5 rounded-full",
        status === "done" && "bg-text-tertiary",
        status === "active" && "bg-accent",
        status === "upcoming" && "border border-[color:var(--border-strong)]",
      )}
    />
  );
}
