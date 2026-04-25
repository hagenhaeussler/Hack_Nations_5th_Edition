import { createContext, useContext, type ReactNode } from "react";

import {
  usePersonalSettings,
  type UsePersonalSettings,
} from "@/lib/usePersonalSettings";

/**
 * App-wide personal settings.
 *
 * The hook owns the side effects that paint the chosen theme onto the DOM,
 * so it must be instantiated exactly once at the root. Consumers use
 * `usePersonal()` to read & mutate; `usePersonalSettings()` directly should
 * not be called inside the tree.
 */
const PersonalSettingsContext = createContext<UsePersonalSettings | null>(null);

interface PersonalSettingsProviderProps {
  children: ReactNode;
}

export function PersonalSettingsProvider({
  children,
}: PersonalSettingsProviderProps) {
  const value = usePersonalSettings();
  return (
    <PersonalSettingsContext.Provider value={value}>
      {children}
    </PersonalSettingsContext.Provider>
  );
}

export function usePersonal(): UsePersonalSettings {
  const ctx = useContext(PersonalSettingsContext);
  if (!ctx) {
    throw new Error(
      "usePersonal must be used inside <PersonalSettingsProvider>",
    );
  }
  return ctx;
}
