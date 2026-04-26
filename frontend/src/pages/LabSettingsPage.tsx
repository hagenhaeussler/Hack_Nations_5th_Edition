import {
  ArrowLeft,
  Beaker,
  ExternalLink,
  FileText,
  Plus,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLabSettings } from "@/lib/useLabSettings";
import type {
  Equipment,
  LabParameter,
  LabSheet,
  UseLabSettings,
} from "@/lib/useLabSettings";
import { cn } from "@/lib/utils";

export function LabSettingsPage() {
  const navigate = useNavigate();
  const lab = useLabSettings();
  const { settings } = lab;
  const goBack = () => navigate(-1);

  return (
    <main className="relative flex min-h-screen flex-col">
      <section
        aria-label="Lab settings"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 pb-24 pt-12 sm:px-8"
      >
        <BackBar onBack={goBack} />

        <LabTitleHeader
          labName={settings.labName}
          onChange={lab.setLabName}
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <Section
            title="Parameters"
            subtitle="Capabilities and access controls that constrain experiment plans."
            icon={<SlidersHorizontal size={14} strokeWidth={1.5} />}
          >
            <ParametersSection lab={lab} />
          </Section>

          <Section
            title="Lab equipment"
            subtitle="Instruments and hardware your lab can run protocols on."
            icon={<Beaker size={14} strokeWidth={1.5} />}
          >
            <EquipmentSection lab={lab} />
          </Section>

          <Section
            title="Lab sheets and documents"
            subtitle="Upload SOPs, reference sheets, and files LabPilot should know about."
            icon={<FileText size={14} strokeWidth={1.5} />}
          >
            <SheetsSection lab={lab} />
          </Section>
        </div>
      </section>

      <footer className="px-8 pb-6 pt-2 text-center text-[12px] text-text-tertiary">
        Lab settings are saved on this device. Cloud sync is on the roadmap.
      </footer>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header & section primitives                                                */
/* -------------------------------------------------------------------------- */

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] text-text-secondary",
        "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
      )}
    >
      <ArrowLeft size={14} strokeWidth={1.5} />
      Back
    </button>
  );
}

interface LabTitleHeaderProps {
  labName: string;
  onChange: (next: string) => void;
}

function LabTitleHeader({ labName, onChange }: LabTitleHeaderProps) {
  return (
    <header className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        Lab name
      </p>
      <input
        type="text"
        value={labName}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Untitled lab"
        aria-label="Lab name"
        className={cn(
          "w-full border-0 bg-transparent p-0 font-sans text-[34px] font-medium leading-[1.15] tracking-[-0.01em] text-text-primary",
          "placeholder:text-text-tertiary",
          "focus:outline-none focus-visible:outline-none",
          "sm:text-[40px]",
        )}
      />
      <p className="text-[13px] text-text-secondary">
        This name is used to title experiment plans and protocols generated for
        you.
      </p>
    </header>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, subtitle, icon, children }: SectionProps) {
  return (
    <section className="flex h-full min-h-[420px] flex-col gap-4 rounded-xl border border-[color:var(--border-default)] bg-bg-surface/80 p-4 shadow-sm">
      <header className="flex flex-col gap-2 border-b border-[color:var(--border-default)] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center text-text-tertiary">
            {icon}
          </span>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className="text-[12px] leading-5 text-text-secondary">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Equipment                                                                   */
/* -------------------------------------------------------------------------- */

function EquipmentSection({ lab }: { lab: UseLabSettings }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    lab.addEquipment({ name, notes });
    setName("");
    setNotes("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {lab.settings.equipment.length === 0 ? (
        <EmptyHint>No equipment yet. Add the instruments your lab can use.</EmptyHint>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {lab.settings.equipment.map((item) => (
            <EquipmentRow
              key={item.id}
              item={item}
              onRemove={() => lab.removeEquipment(item.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <FieldInput
          value={name}
          onChange={setName}
          placeholder="Equipment name (e.g. Confocal microscope)"
          onSubmit={submit}
        />
        <FieldInput
          value={notes}
          onChange={setNotes}
          placeholder="Notes — optional"
          onSubmit={submit}
        />
        <AddButton onClick={submit} disabled={!name.trim()} label="Add equipment" />
      </div>
    </div>
  );
}

function EquipmentRow({
  item,
  onRemove,
}: {
  item: Equipment;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-text-primary">{item.name}</p>
        {item.notes ? (
          <p className="truncate text-[12px] text-text-secondary">{item.notes}</p>
        ) : null}
      </div>
      <RemoveButton onClick={onRemove} label={`Remove ${item.name}`} />
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Lab sheets                                                                 */
/* -------------------------------------------------------------------------- */

function SheetsSection({ lab }: { lab: UseLabSettings }) {
  const uploadDocuments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    files.forEach((file) => {
      lab.addSheet({
        name: file.name,
        reference: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      });
    });
    event.currentTarget.value = "";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {lab.settings.sheets.length === 0 ? (
        <EmptyHint>
          No documents yet. Upload SOPs, lab sheets, or reference protocols you
          want LabPilot to assume.
        </EmptyHint>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {lab.settings.sheets.map((sheet) => (
            <SheetRow
              key={sheet.id}
              sheet={sheet}
              onRemove={() => lab.removeSheet(sheet.id)}
            />
          ))}
        </ul>
      )}

      <label className="mt-auto flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[color:var(--border-default)] bg-bg-input px-4 py-5 text-center transition-colors duration-[var(--duration-fast)] hover:border-[color:var(--border-strong)] hover:bg-bg-hover">
        <input
          type="file"
          multiple
          className="sr-only"
          onChange={uploadDocuments}
        />
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <Upload size={18} strokeWidth={1.75} />
        </span>
        <span className="text-[13px] font-medium text-text-primary">
          Upload lab documents
        </span>
        <span className="max-w-[28ch] text-[12px] leading-5 text-text-secondary">
          Choose SOPs, lab sheets, PDFs, spreadsheets, images, or notes.
        </span>
      </label>
    </div>
  );
}

function SheetRow({
  sheet,
  onRemove,
}: {
  sheet: LabSheet;
  onRemove: () => void;
}) {
  const isUrl = sheet.reference?.startsWith("http");
  const documentMeta = [
    typeof sheet.fileSize === "number" ? formatFileSize(sheet.fileSize) : undefined,
    sheet.mimeType,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-hover text-text-tertiary">
        <FileText size={15} strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-text-primary">{sheet.name}</p>
        {documentMeta ? (
          <p className="truncate text-[12px] text-text-secondary">
            {documentMeta}
          </p>
        ) : sheet.reference ? (
          isUrl ? (
            <a
              href={sheet.reference}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
            >
              <span className="truncate max-w-[28ch]">{sheet.reference}</span>
              <ExternalLink size={11} strokeWidth={1.5} />
            </a>
          ) : (
            <p className="truncate text-[12px] text-text-secondary">
              {sheet.reference}
            </p>
          )
        ) : null}
      </div>
      <RemoveButton onClick={onRemove} label={`Remove ${sheet.name}`} />
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Parameters                                                                 */
/* -------------------------------------------------------------------------- */

function ParametersSection({ lab }: { lab: UseLabSettings }) {
  const [name, setName] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    lab.addParameter(name);
    setName("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {lab.settings.parameters.map((param) => (
          <ParameterRow
            key={param.id}
            param={param}
            onToggle={() => lab.toggleParameter(param.id)}
            onRemove={() => lab.removeParameter(param.id)}
          />
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        <FieldInput
          value={name}
          onChange={setName}
          placeholder="Parameter name (e.g. Access to compute)"
          onSubmit={submit}
        />
        <AddButton onClick={submit} disabled={!name.trim()} label="Add parameter" />
      </div>
    </div>
  );
}

function ParameterRow({
  param,
  onToggle,
  onRemove,
}: {
  param: LabParameter;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border-default)] bg-bg-surface px-3.5 py-2.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <Toggle enabled={param.enabled} onChange={onToggle} ariaLabel={param.name} />
        <span className="truncate text-[14px] text-text-primary">{param.name}</span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em]",
            param.enabled
              ? "bg-accent-subtle text-accent"
              : "bg-bg-hover text-text-tertiary",
          )}
        >
          {param.enabled ? "Available" : "Off"}
        </span>
      </label>
      <RemoveButton onClick={onRemove} label={`Remove ${param.name}`} />
    </li>
  );
}

interface ToggleProps {
  enabled: boolean;
  onChange: () => void;
  ariaLabel: string;
}

function Toggle({ enabled, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
        onChange();
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-[var(--duration-fast)]",
        enabled ? "bg-accent" : "bg-[color:var(--border-strong)]",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-fast)]",
          enabled ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared atoms                                                                */
/* -------------------------------------------------------------------------- */

interface FieldInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  onSubmit: () => void;
}

function FieldInput({ value, onChange, placeholder, onSubmit }: FieldInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit();
        }
      }}
      placeholder={placeholder}
      className={cn(
        "flex-1 rounded-md border border-[color:var(--border-default)] bg-bg-input px-3 py-2 text-[14px] text-text-primary",
        "placeholder:text-text-tertiary",
        "transition-colors duration-[var(--duration-fast)]",
        "focus:border-[color:var(--border-strong)] focus:outline-none focus-visible:outline-none",
      )}
    />
  );
}

function AddButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium",
        "transition-colors duration-[var(--duration-fast)]",
        disabled
          ? "cursor-not-allowed bg-bg-hover text-text-tertiary"
          : "bg-accent text-white hover:bg-accent-hover",
      )}
    >
      <Plus size={14} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function RemoveButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
        "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
      )}
    >
      <X size={14} strokeWidth={1.75} />
    </button>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[color:var(--border-default)] bg-bg-surface px-3.5 py-3 text-[13px] text-text-tertiary">
      {children}
    </p>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
