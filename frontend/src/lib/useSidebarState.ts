import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "labpilot:sidebar:collapsed";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Persisted boolean for whether the global app sidebar is collapsed.
 *
 * Lives in localStorage so toggling survives reloads. Returned tuple mirrors
 * `useState`'s shape — the second element is a stable toggle function rather
 * than a setter, since callers always swap the value.
 */
export function useSidebarState(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* localStorage may be unavailable in private contexts; silently ignore. */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  return [collapsed, toggle];
}
