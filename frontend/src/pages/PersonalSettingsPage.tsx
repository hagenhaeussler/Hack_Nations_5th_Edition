import {
  ArrowLeft,
  Keyboard,
  Mail,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { usePersonal } from "@/lib/personalSettingsContext";
import {
  resolveTheme,
  type ThemePreference,
} from "@/lib/usePersonalSettings";
import { cn } from "@/lib/utils";

/**
 * `/personal-settings` — user-level preferences (name, email, theme,
 * accessibility, composer behaviour).
 *
 * Renders inside {@link AppShell}, which provides the global sidebar — no
 * page-level navigation chrome here. The "Back" affordance simply walks the
 * router history one step so it works whether the user came from the landing
 * page, a project, or a deep link.
 */
export function PersonalSettingsPage() {
  const navigate = useNavigate();
  const personal = usePersonal();
  const { settings } = personal;

  return (
    <main className="relative flex min-h-screen flex-col bg-bg-primary text-text-primary">
      <section
        aria-label="Personal settings"
        className="mx-auto flex w-full max-w-[var(--chat-max-width)] flex-1 flex-col gap-8 px-6 pb-24 pt-12 sm:px-8"
      >
        <BackBar onBack={() => navigate(-1)} />

        <PersonalHeader
          displayName={settings.displayName}
          onChange={personal.setDisplayName}
        />

        <Section
          title="Profile"
          subtitle="How LabPilot refers to you in greetings, plans, and exports."
          icon={<UserRound size={14} strokeWidth={1.5} />}
        >
          <FieldRow
            label="Email"
            description="Optional. Used only to label exports — never sent anywhere."
            icon={<Mail size={14} strokeWidth={1.5} />}
          >
            <input
              type="email"
              value={settings.email}
              onChange={(e) => personal.setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-label="Email"
              className={cn(
                "w-full rounded-md border border-[color:var(--border-default)] bg-bg-input px-3 py-2 text-[14px] text-text-primary",
                "placeholder:text-text-tertiary",
                "transition-colors duration-[var(--duration-fast)]",
                "focus:border-[color:var(--border-strong)] focus:outline-none focus-visible:outline-none",
              )}
            />
          </FieldRow>
        </Section>

        <Section
          title="Appearance"
          subtitle="Theme and motion. Both apply instantly across the app."
          icon={<Palette size={14} strokeWidth={1.5} />}
        >
          <div className="flex flex-col gap-4">
            <FieldRow label="Theme">
              <ThemePicker
                value={settings.theme}
                onChange={personal.setTheme}
              />
            </FieldRow>
            <ToggleRow
              label="Reduced motion"
              description="Minimize transitions and animations across the app."
              enabled={settings.reducedMotion}
              onChange={personal.setReducedMotion}
            />
          </div>
        </Section>

        <Section
          title="Composer"
          subtitle="How the prompt input behaves when you're typing."
          icon={<Keyboard size={14} strokeWidth={1.5} />}
        >
          <ToggleRow
            label="Send on Enter"
            description="When off, Enter inserts a newline; ⌘ + Enter sends."
            enabled={settings.sendOnEnter}
            onChange={personal.setSendOnEnter}
          />
        </Section>

        <ResetRow onReset={personal.resetToDefaults} />
      </section>

      <footer className="px-8 pb-6 pt-2 text-center text-[12px] text-text-tertiary">
        Personal settings are saved on this device. Cloud sync is on the
        roadmap.
      </footer>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header & layout primitives                                                */
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

interface PersonalHeaderProps {
  displayName: string;
  onChange: (next: string) => void;
}

function PersonalHeader({ displayName, onChange }: PersonalHeaderProps) {
  return (
    <header className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
        Display name
      </p>
      <input
        type="text"
        value={displayName}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your name"
        aria-label="Display name"
        autoComplete="name"
        className={cn(
          "w-full border-0 bg-transparent p-0 font-sans text-[34px] font-medium leading-[1.15] tracking-[-0.01em] text-text-primary",
          "placeholder:text-text-tertiary",
          "focus:outline-none focus-visible:outline-none",
          "sm:text-[40px]",
        )}
      />
      <p className="text-[13px] text-text-secondary">
        Used to personalize greetings on the landing page and labels on
        exported plans.
      </p>
    </header>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
}

function Section({ title, subtitle, icon, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-4 border-b border-[color:var(--border-default)] pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center text-text-tertiary">
            {icon}
          </span>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className="hidden max-w-[44ch] text-right text-[12px] text-text-secondary sm:block">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div>{children}</div>
    </section>
  );
}

interface FieldRowProps {
  label: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}

function FieldRow({ label, description, icon, children }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {icon ? (
          <span className="flex h-4 w-4 items-center justify-center text-text-tertiary">
            {icon}
          </span>
        ) : null}
        <span className="text-[12px] font-medium text-text-secondary">
          {label}
        </span>
      </div>
      {children}
      {description ? (
        <p className="text-[12px] text-text-tertiary">{description}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Theme picker                                                               */
/* -------------------------------------------------------------------------- */

interface ThemeOption {
  id: ThemePreference;
  label: string;
  icon: ReactNode;
  description: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    label: "Light",
    icon: <Sun size={16} strokeWidth={1.5} />,
    description: "Warm cream canvas.",
  },
  {
    id: "dark",
    label: "Dark",
    icon: <Moon size={16} strokeWidth={1.5} />,
    description: "Quiet warm midnight.",
  },
  {
    id: "system",
    label: "System",
    icon: <Monitor size={16} strokeWidth={1.5} />,
    description: "Match your device.",
  },
];

interface ThemePickerProps {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}

function ThemePicker({ value, onChange }: ThemePickerProps) {
  const resolved = value === "system" ? resolveTheme("system") : null;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {THEME_OPTIONS.map((opt) => {
        const isActive = value === opt.id;
        const subline =
          opt.id === "system" && resolved
            ? `Match your device · currently ${resolved}`
            : opt.description;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-md border px-3.5 py-3 text-left",
              "transition-colors duration-[var(--duration-fast)]",
              isActive
                ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
                : "border-[color:var(--border-default)] bg-bg-surface hover:bg-bg-hover",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center",
                  isActive ? "text-accent" : "text-text-secondary",
                )}
              >
                {opt.icon}
              </span>
              <span className="text-[14px] font-medium text-text-primary">
                {opt.label}
              </span>
            </div>
            <p className="text-[12px] text-text-secondary">{subline}</p>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toggle row                                                                  */
/* -------------------------------------------------------------------------- */

interface ToggleRowProps {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, description, enabled, onChange }: ToggleRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 rounded-md border border-[color:var(--border-default)]",
        "bg-bg-surface px-3.5 py-3",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] text-text-primary">{label}</span>
        {description ? (
          <span className="text-[12px] text-text-secondary">{description}</span>
        ) : null}
      </div>
      <Toggle
        enabled={enabled}
        onChange={() => onChange(!enabled)}
        ariaLabel={label}
      />
    </label>
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
/*  Reset                                                                       */
/* -------------------------------------------------------------------------- */

function ResetRow({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex items-center justify-end pt-2">
      <button
        type="button"
        onClick={onReset}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] text-text-tertiary",
          "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
        )}
      >
        <RotateCcw size={12} strokeWidth={1.5} />
        Reset to defaults
      </button>
    </div>
  );
}
