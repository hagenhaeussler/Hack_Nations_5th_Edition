import {
  ArrowUp,
  Check,
  FileSpreadsheet,
  FileText,
  Link2,
  Paperclip,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/lib/useAutoResizeTextarea";
import { cn, formatBytes } from "@/lib/utils";

/**
 * Attachment model
 * ----------------
 * The paperclip button now offers four explicit kinds so the agent can route
 * each artefact correctly downstream (e.g. CSVs into the lab-sheet parser,
 * PDFs into the literature pipeline). Internally we keep file uploads and
 * pasted links in a single ordered list so the chip tray reflects insertion
 * order regardless of mix.
 */
export type AttachmentCategory =
  | "lab-sheet"
  | "paper-pdf"
  | "paper-link"
  | "other-pdf";

export interface FileAttachment {
  id: string;
  kind: "file";
  category: Exclude<AttachmentCategory, "paper-link">;
  file: File;
}

export interface LinkAttachment {
  id: string;
  kind: "link";
  category: "paper-link";
  url: string;
}

export type Attachment = FileAttachment | LinkAttachment;

export interface PromptSubmitPayload {
  text: string;
  attachments: Attachment[];
  /** Convenience: flattened list of binary uploads. */
  files: File[];
}

interface PromptInputProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit?: (payload: PromptSubmitPayload) => void | Promise<void>;
}

const CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  "lab-sheet": "Lab sheet",
  "paper-pdf": "Paper",
  "paper-link": "Paper link",
  "other-pdf": "PDF",
};

const ACCEPT_BY_CATEGORY: Record<
  Exclude<AttachmentCategory, "paper-link">,
  string
> = {
  "lab-sheet": ".csv,.tsv",
  "paper-pdf": ".pdf",
  "other-pdf": ".pdf",
};

export function PromptInput({
  placeholder = "State your research hypothesis…",
  initialValue = "",
  onSubmit,
}: PromptInputProps) {
  const [value, setValue] = useState(initialValue);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks which category triggered the native file picker so we can tag the
  // resulting File(s) on the change event (the input itself is shared).
  const pendingCategoryRef = useRef<
    Exclude<AttachmentCategory, "paper-link"> | null
  >(null);
  const idCounterRef = useRef(0);
  const nextId = () => `att-${++idCounterRef.current}`;

  // Resize once on mount so any pre-filled `initialValue` lays out correctly.
  useEffect(() => {
    if (initialValue) adjustHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !submitting;

  const handleSubmit = async () => {
    if (!canSend) return;
    const payload: PromptSubmitPayload = {
      text: value.trim(),
      attachments,
      files: attachments.flatMap((a) => (a.kind === "file" ? [a.file] : [])),
    };
    setSubmitting(true);
    try {
      await onSubmit?.(payload);
      setValue("");
      setAttachments([]);
      adjustHeight(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const openFilePicker = (
    category: Exclude<AttachmentCategory, "paper-link">,
  ) => {
    if (!fileInputRef.current) return;
    pendingCategoryRef.current = category;
    fileInputRef.current.accept = ACCEPT_BY_CATEGORY[category];
    fileInputRef.current.click();
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) {
      pendingCategoryRef.current = null;
      return;
    }
    const category = pendingCategoryRef.current ?? "other-pdf";
    pendingCategoryRef.current = null;
    setAttachments((prev) => [
      ...prev,
      ...picked.map<FileAttachment>((file) => ({
        id: nextId(),
        kind: "file",
        category,
        file,
      })),
    ]);
  };

  const addLink = (url: string) => {
    setAttachments((prev) => [
      ...prev,
      { id: nextId(), kind: "link", category: "paper-link", url },
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="w-full">
      {/* Input shell */}
      <div
        className={cn(
          "relative rounded-md border border-[color:var(--border-default)] bg-bg-input shadow-sm",
          "transition-shadow duration-[var(--duration-fast)] focus-within:shadow-md",
          "focus-within:ring-1 focus-within:ring-[color:var(--border-strong)]",
        )}
      >
        {/* Attachments tray */}
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2 border-b border-[color:var(--border-default)] px-3 pt-3">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onRemove={() => removeAttachment(att.id)}
              />
            ))}
          </ul>
        )}

        {/* Textarea */}
        <div className="overflow-y-auto">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Research hypothesis"
            className={cn(
              "min-h-[60px] resize-none border-none bg-transparent px-4 pt-3.5 text-[15px] leading-[1.6]",
              "placeholder:text-[15px] placeholder:text-text-tertiary",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
            )}
            style={{ overflow: "hidden" }}
          />
        </div>

        {/* Bottom action row */}
        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <AttachMenu
              onPickFile={openFilePicker}
              onAddLink={addLink}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
                canSend
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "bg-bg-hover text-text-tertiary",
              )}
            >
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachment chip
// ---------------------------------------------------------------------------

interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: () => void;
}

function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const Icon =
    attachment.kind === "link"
      ? Link2
      : attachment.category === "lab-sheet"
        ? FileSpreadsheet
        : FileText;

  const primary =
    attachment.kind === "link" ? attachment.url : attachment.file.name;
  const secondary =
    attachment.kind === "link"
      ? CATEGORY_LABEL[attachment.category]
      : `${CATEGORY_LABEL[attachment.category]} · ${formatBytes(attachment.file.size)}`;

  const label =
    attachment.kind === "link"
      ? `Remove link ${attachment.url}`
      : `Remove ${attachment.file.name}`;

  return (
    <li
      className={cn(
        "group flex max-w-[300px] items-center gap-2 rounded-sm border border-[color:var(--border-default)]",
        "bg-bg-surface px-2 py-1.5 text-[12px] text-text-primary",
        "animate-fade-up",
      )}
    >
      <Icon
        size={14}
        strokeWidth={1.5}
        className="shrink-0 text-text-secondary"
      />
      <span className="truncate" title={primary}>
        {primary}
      </span>
      <span className="shrink-0 text-text-tertiary">{secondary}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className={cn(
          "ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
          "transition-colors hover:bg-bg-hover hover:text-text-primary",
        )}
      >
        <X size={12} strokeWidth={1.75} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Attach menu (paperclip dropdown)
// ---------------------------------------------------------------------------

interface AttachMenuProps {
  onPickFile: (category: Exclude<AttachmentCategory, "paper-link">) => void;
  onAddLink: (url: string) => void;
}

type MenuView = "menu" | "link";

function AttachMenu({ onPickFile, onAddLink }: AttachMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("menu");
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const linkInputId = useId();

  // Close on outside click & Escape — design_guide §8.2 popover behaviour.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    // Defer the view reset so the closing animation doesn't flicker.
    setTimeout(() => {
      setView("menu");
      setLinkValue("");
      setLinkError(null);
    }, 150);
  };

  const handlePickFile = (
    category: Exclude<AttachmentCategory, "paper-link">,
  ) => {
    onPickFile(category);
    close();
  };

  const handleConfirmLink = () => {
    const trimmed = linkValue.trim();
    if (trimmed.length === 0) {
      setLinkError("Please paste a link.");
      return;
    }
    try {
      // Allow URLs without an explicit protocol — normalise to https://.
      const normalised =
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      // Validate by constructing a URL.
      new URL(normalised);
      onAddLink(normalised);
      close();
    } catch {
      setLinkError("That doesn't look like a valid URL.");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Attach files"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "group flex h-8 items-center gap-1 rounded-sm px-2 text-text-secondary",
          "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          open && "bg-bg-hover text-text-primary",
        )}
      >
        <Paperclip size={16} strokeWidth={1.5} />
        <span className="hidden text-[12px] group-hover:inline">Attach</span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-[calc(100%+6px)] left-0 z-20 w-[260px]",
            "rounded-md border border-[color:var(--border-default)] bg-bg-surface p-1.5",
            "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
            "animate-fade-up",
          )}
        >
          {view === "menu" ? (
            <ul className="flex flex-col">
              <MenuItem
                icon={<FileSpreadsheet size={15} strokeWidth={1.5} />}
                label="Lab sheet"
                hint=".csv"
                onClick={() => handlePickFile("lab-sheet")}
              />
              <MenuItem
                icon={<FileText size={15} strokeWidth={1.5} />}
                label="Paper"
                hint=".pdf"
                onClick={() => handlePickFile("paper-pdf")}
              />
              <MenuItem
                icon={<Link2 size={15} strokeWidth={1.5} />}
                label="Paper from link"
                hint="URL"
                onClick={() => setView("link")}
              />
              <MenuItem
                icon={<FileText size={15} strokeWidth={1.5} />}
                label="Other PDF"
                hint=".pdf"
                onClick={() => handlePickFile("other-pdf")}
              />
            </ul>
          ) : (
            <div className="flex flex-col gap-2 p-1.5">
              <label
                htmlFor={linkInputId}
                className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary"
              >
                Paper link
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={linkInputId}
                  autoFocus
                  type="url"
                  inputMode="url"
                  value={linkValue}
                  onChange={(e) => {
                    setLinkValue(e.target.value);
                    if (linkError) setLinkError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmLink();
                    }
                  }}
                  placeholder="https://arxiv.org/abs/…"
                  className={cn(
                    "min-w-0 flex-1 rounded-sm border border-[color:var(--border-default)] bg-bg-input",
                    "px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary",
                    "focus:outline-none focus:ring-1 focus:ring-[color:var(--border-strong)]",
                  )}
                />
                <button
                  type="button"
                  onClick={handleConfirmLink}
                  aria-label="Add link"
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
                    "bg-accent text-white transition-colors hover:bg-accent-hover",
                  )}
                >
                  <Check size={14} strokeWidth={2} />
                </button>
              </div>
              {linkError ? (
                <p className="text-[11px] text-[color:var(--status-error,#B5471F)]">
                  {linkError}
                </p>
              ) : (
                <p className="text-[11px] text-text-tertiary">
                  Paste a URL — arXiv, DOI, or publisher page.
                </p>
              )}
              <button
                type="button"
                onClick={() => setView("menu")}
                className={cn(
                  "self-start text-[11px] uppercase tracking-[0.06em] text-text-tertiary",
                  "transition-colors hover:text-text-primary",
                )}
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}

function MenuItem({ icon, label, hint, onClick }: MenuItemProps) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5",
          "text-left text-[13px] text-text-primary",
          "transition-colors hover:bg-bg-hover",
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary">
          {icon}
        </span>
        <span className="flex-1 truncate">{label}</span>
        {hint ? (
          <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
            {hint}
          </span>
        ) : null}
      </button>
    </li>
  );
}
