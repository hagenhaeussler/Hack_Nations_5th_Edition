import { useCallback, useEffect, useState } from "react";

/**
 * Personal settings — the user-level preferences that follow them across the
 * app: profile identity, appearance (theme), and accessibility.
 *
 * Persistence is local-only for now (localStorage). When a user account
 * backend lands, swap the persistence layer here without touching consumers.
 *
 * The hook also owns the side effects that *apply* preferences to the DOM:
 *   - `data-theme="dark"`            — flips the warm-dark color tokens
 *   - `data-reduced-motion="true"`   — short-circuits transitions/animations
 */

export type ThemePreference = "light" | "dark" | "system";

export interface PersonalSettings {
  /** Used to personalize greetings and outputs. Empty = anonymous. */
  displayName: string;
  /** Optional contact email — never sent anywhere yet, just stored. */
  email: string;
  /** Light, dark, or follow OS preference. */
  theme: ThemePreference;
  /** When true, transitions and animations are reduced app-wide. */
  reducedMotion: boolean;
  /** Press Enter to send (default). When false, ⌘/Ctrl+Enter sends. */
  sendOnEnter: boolean;
}

const STORAGE_KEY = "labpilot.personalSettings.v1";

const DEFAULT_SETTINGS: PersonalSettings = {
  displayName: "",
  email: "",
  theme: "system",
  reducedMotion: false,
  sendOnEnter: true,
};

function loadSettings(): PersonalSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PersonalSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Resolve the effective color scheme given a user preference. "system" reads
 * `prefers-color-scheme`; a missing/unknown value falls back to light.
 */
export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  if (resolved === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

function applyReducedMotion(enabled: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute("data-reduced-motion", "true");
  } else {
    root.removeAttribute("data-reduced-motion");
  }
}

export interface UsePersonalSettings {
  settings: PersonalSettings;
  setDisplayName: (name: string) => void;
  setEmail: (email: string) => void;
  setTheme: (theme: ThemePreference) => void;
  setReducedMotion: (enabled: boolean) => void;
  setSendOnEnter: (enabled: boolean) => void;
  resetToDefaults: () => void;
}

export function usePersonalSettings(): UsePersonalSettings {
  const [settings, setSettings] = useState<PersonalSettings>(loadSettings);

  // Persist whenever settings change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Quota / privacy-mode errors are non-fatal — the in-memory copy still
      // drives the current session.
    }
  }, [settings]);

  // Apply theme on change. When following the system, watch the media query
  // so flipping OS dark mode reflects live without a refresh.
  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  // Apply reduced-motion preference.
  useEffect(() => {
    applyReducedMotion(settings.reducedMotion);
  }, [settings.reducedMotion]);

  const setDisplayName = useCallback((displayName: string) => {
    setSettings((s) => ({ ...s, displayName }));
  }, []);

  const setEmail = useCallback((email: string) => {
    setSettings((s) => ({ ...s, email }));
  }, []);

  const setTheme = useCallback((theme: ThemePreference) => {
    setSettings((s) => ({ ...s, theme }));
  }, []);

  const setReducedMotion = useCallback((reducedMotion: boolean) => {
    setSettings((s) => ({ ...s, reducedMotion }));
  }, []);

  const setSendOnEnter = useCallback((sendOnEnter: boolean) => {
    setSettings((s) => ({ ...s, sendOnEnter }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    setDisplayName,
    setEmail,
    setTheme,
    setReducedMotion,
    setSendOnEnter,
    resetToDefaults,
  };
}
