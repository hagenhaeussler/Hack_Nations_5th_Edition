import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Beaker,
  BookOpen,
  Check,
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
  X,
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

const ARRAY_FIELDS = [
  ["people", "People"],
  ["equipment", "Equipment"],
  ["materials", "Materials"],
  ["experts", "Experts"],
  ["citationsToPaper", "Citations to paper"],
  ["validationCriteria", "Validation criteria"],
] as const;

const RESOURCE_FIELDS = ARRAY_FIELDS.slice(0, 3);
const EXPERT_FIELDS = [["experts", "Experts"]] as const;
const EVIDENCE_FIELDS = [
  ["citationsToPaper", "Citations to paper"],
  ["validationCriteria", "Validation criteria"],
] as const;
const GRAPH_ID_FIELDS = [
  ["parentIds", "Parent IDs"],
  ["childrenIds", "Children IDs"],
] as const;

interface WorkflowNodeDetailPanelProps {
  data: WorkflowNodeData;
  onChange: (data: WorkflowNodeData) => void | Promise<void>;
  onClose: () => void;
}

interface Draft {
  id: string;
  stepName: string;
  people: string;
  equipment: string;
  materials: string;
  timeEstimate: string;
  price: string;
  experts: string;
  citationsToPaper: string;
  procedure: string;
  validationCriteria: string;
  startDate: string;
  parentIds: string;
  childrenIds: string;
  status?: WorkflowStatus;
  icon?: WorkflowIconKey;
}

function joinLines(items: string[]): string {
  return items.join("\n");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dataToDraft(data: WorkflowNodeData): Draft {
  const legacy = data as WorkflowNodeData & {
    title?: string;
    effort?: string;
    schedule?: string;
    description?: string;
    checklist?: string[];
  };
  return {
    ...data,
    id: data.id ?? "",
    stepName: data.stepName ?? legacy.title ?? "Untitled step",
    timeEstimate: data.timeEstimate ?? legacy.effort ?? "1 day",
    price: data.price ?? "$0",
    procedure: data.procedure ?? legacy.description ?? "",
    startDate: data.startDate ?? legacy.schedule ?? "",
    status: data.status ?? "upcoming",
    icon: data.icon ?? "beaker",
    people: joinLines(data.people ?? []),
    equipment: joinLines(data.equipment ?? []),
    materials: joinLines(data.materials ?? []),
    experts: joinLines(data.experts ?? []),
    citationsToPaper: joinLines(data.citationsToPaper ?? []),
    validationCriteria: joinLines(data.validationCriteria ?? legacy.checklist ?? []),
    parentIds: joinLines(data.parentIds ?? []),
    childrenIds: joinLines(data.childrenIds ?? []),
  };
}

function draftToData(draft: Draft): WorkflowNodeData {
  return {
    ...draft,
    status: draft.status ?? "upcoming",
    icon: draft.icon ?? "beaker",
    people: splitLines(draft.people),
    equipment: splitLines(draft.equipment),
    materials: splitLines(draft.materials),
    experts: splitLines(draft.experts),
    citationsToPaper: splitLines(draft.citationsToPaper),
    validationCriteria: splitLines(draft.validationCriteria),
    parentIds: splitLines(draft.parentIds),
    childrenIds: splitLines(draft.childrenIds),
  };
}

export function WorkflowNodeDetailPanel({
  data,
  onChange,
  onClose,
}: WorkflowNodeDetailPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const [draft, setDraft] = useState<Draft>(() => dataToDraft(data));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const status = draft.status ?? "upcoming";
  const icon = draft.icon ?? "beaker";
  const Icon = ICON_MAP[icon] ?? Beaker;

  const closeWithAnimation = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsVisible(false);
    closeTimeoutRef.current = window.setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setDraft(dataToDraft(data));
    setDirty(false);
  }, [data]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeWithAnimation();
    }

    function handlePointerDown(event: PointerEvent) {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node)) return;
      if (!panel.contains(event.target)) closeWithAnimation();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeWithAnimation]);

  const serializedDraft = useMemo(() => JSON.stringify(draft), [draft]);

  function updateField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onChange(draftToData(JSON.parse(serializedDraft) as Draft));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={`${draft.stepName} details`}
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-full flex-col",
        "border-l border-[color:var(--border-default)] bg-bg-surface shadow-lg",
        "lg:w-1/3",
        "transform-gpu transition-transform duration-300 ease-in-out",
        isVisible ? "translate-x-0" : "translate-x-full",
      )}
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--border-default)] px-6 py-5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
            status === "active"
              ? "bg-[color:var(--accent-subtle)] text-accent"
              : "bg-bg-hover text-text-secondary",
          )}
        >
          <Icon size={18} strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-text-primary">
            {draft.stepName || "Untitled step"}
          </h2>
        </div>

        <button
          type="button"
          onClick={closeWithAnimation}
          aria-label="Close details"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Section title="Basics">
          <TextField
            label="Title"
            value={draft.stepName}
            onChange={(value) => updateField("stepName", value)}
          />
          <TextField
            label="ID"
            value={draft.id}
            onChange={(value) => updateField("id", value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Start date"
              type="date"
              value={draft.startDate}
              onChange={(value) => updateField("startDate", value)}
            />
            <TextField
              label="Time estimate"
              value={draft.timeEstimate}
              onChange={(value) => updateField("timeEstimate", value)}
            />
          </div>
          <TextField
            label="Price"
            value={draft.price}
            onChange={(value) => updateField("price", value)}
          />
        </Section>

        <Section title="Procedure">
          <TextAreaField
            label="Procedure"
            hideLabel
            minRows={5}
            value={draft.procedure}
            onChange={(value) => updateField("procedure", value)}
          />
        </Section>

        <Section title="Resources">
          {RESOURCE_FIELDS.map(([field, label]) => (
            <TextAreaField
              key={field}
              label={label}
              value={draft[field]}
              onChange={(value) => updateField(field, value)}
            />
          ))}
        </Section>

        <Section title="Experts">
          {EXPERT_FIELDS.map(([field, label]) => (
            <TextAreaField
              key={field}
              label={label}
              hideLabel
              value={draft[field]}
              onChange={(value) => updateField(field, value)}
            />
          ))}
        </Section>

        <Section title="Evidence">
          {EVIDENCE_FIELDS.map(([field, label]) => (
            <TextAreaField
              key={field}
              label={label}
              value={draft[field]}
              onChange={(value) => updateField(field, value)}
            />
          ))}
        </Section>

        <Section title="Graph IDs">
          {GRAPH_ID_FIELDS.map(([field, label]) => (
            <TextAreaField
              key={field}
              label={label}
              value={draft[field]}
              onChange={(value) => updateField(field, value)}
            />
          ))}
        </Section>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--border-default)] px-6 py-3">
        <span className="text-[11.5px] text-text-tertiary">
          One item per line for list fields.
        </span>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={!dirty || saving}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-[13px] font-medium text-white",
            "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Check size={14} strokeWidth={1.75} />
          {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
        </button>
      </footer>
    </aside>
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
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "text";
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cn(
          "rounded-sm border border-[color:var(--border-default)] bg-bg-primary px-3 py-2",
          "text-[13px] text-text-primary outline-none transition-colors",
          "focus:border-[color:var(--accent)]",
        )}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  minRows = 3,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  hideLabel?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </span>
      <textarea
        aria-label={hideLabel ? label : undefined}
        value={value}
        rows={minRows}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cn(
          "resize-y rounded-sm border border-[color:var(--border-default)] bg-bg-primary px-3 py-2",
          "text-[13px] leading-[1.5] text-text-primary outline-none transition-colors",
          "focus:border-[color:var(--accent)]",
        )}
      />
    </label>
  );
}

