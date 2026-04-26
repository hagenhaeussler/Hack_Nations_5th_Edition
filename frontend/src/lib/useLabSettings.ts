import { useCallback, useEffect, useState } from "react";

/**
 * Lab settings — equipment, lab sheets/documents, and capability parameters.
 *
 * Persistence is local-only for now (localStorage). When the backend grows a
 * `/api/lab` endpoint, swap the persistence layer here without touching the
 * page component.
 */

export interface Equipment {
  id: string;
  name: string;
  /** Free-form notes — manufacturer, asset tag, etc. */
  notes?: string;
}

export interface LabSheet {
  id: string;
  name: string;
  /** Optional reference (URL or filename) — UI surfaces this as a hint. */
  reference?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
}

export interface LabParameter {
  id: string;
  name: string;
  enabled: boolean;
}

export interface LabSettings {
  labName: string;
  equipment: Equipment[];
  sheets: LabSheet[];
  parameters: LabParameter[];
}

const STORAGE_KEY = "labpilot.labSettings.v1";

const DEFAULT_SETTINGS: LabSettings = {
  labName: "My Lab",
  equipment: [],
  sheets: [],
  parameters: [
    { id: "param-compute", name: "Access to compute", enabled: false },
    { id: "param-animals", name: "Animal facility", enabled: false },
    { id: "param-bsl2", name: "BSL-2 biosafety hood", enabled: false },
    { id: "param-confocal", name: "Confocal microscope", enabled: false },
  ],
};

function loadSettings(): LabSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LabSettings>;
    return {
      labName: parsed.labName ?? DEFAULT_SETTINGS.labName,
      equipment: parsed.equipment ?? [],
      sheets: parsed.sheets ?? [],
      parameters: parsed.parameters ?? DEFAULT_SETTINGS.parameters,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseLabSettings {
  settings: LabSettings;
  setLabName: (name: string) => void;
  addEquipment: (input: { name: string; notes?: string }) => void;
  removeEquipment: (id: string) => void;
  addSheet: (input: {
    name: string;
    reference?: string;
    fileSize?: number;
    mimeType?: string;
    uploadedAt?: string;
  }) => void;
  removeSheet: (id: string) => void;
  addParameter: (name: string) => void;
  toggleParameter: (id: string) => void;
  removeParameter: (id: string) => void;
}

export function useLabSettings(): UseLabSettings {
  const [settings, setSettings] = useState<LabSettings>(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Swallow quota / privacy-mode errors silently — the in-memory copy
      // still works for the current session.
    }
  }, [settings]);

  const setLabName = useCallback((labName: string) => {
    setSettings((s) => ({ ...s, labName }));
  }, []);

  const addEquipment = useCallback(
    ({ name, notes }: { name: string; notes?: string }) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setSettings((s) => ({
        ...s,
        equipment: [
          ...s.equipment,
          { id: makeId("eq"), name: trimmed, notes: notes?.trim() || undefined },
        ],
      }));
    },
    [],
  );

  const removeEquipment = useCallback((id: string) => {
    setSettings((s) => ({
      ...s,
      equipment: s.equipment.filter((e) => e.id !== id),
    }));
  }, []);

  const addSheet = useCallback(
    ({
      name,
      reference,
      fileSize,
      mimeType,
      uploadedAt,
    }: {
      name: string;
      reference?: string;
      fileSize?: number;
      mimeType?: string;
      uploadedAt?: string;
    }) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setSettings((s) => ({
        ...s,
        sheets: [
          ...s.sheets,
          {
            id: makeId("sh"),
            name: trimmed,
            reference: reference?.trim() || undefined,
            fileSize,
            mimeType: mimeType?.trim() || undefined,
            uploadedAt,
          },
        ],
      }));
    },
    [],
  );

  const removeSheet = useCallback((id: string) => {
    setSettings((s) => ({
      ...s,
      sheets: s.sheets.filter((sheet) => sheet.id !== id),
    }));
  }, []);

  const addParameter = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSettings((s) => ({
      ...s,
      parameters: [
        ...s.parameters,
        { id: makeId("param"), name: trimmed, enabled: true },
      ],
    }));
  }, []);

  const toggleParameter = useCallback((id: string) => {
    setSettings((s) => ({
      ...s,
      parameters: s.parameters.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p,
      ),
    }));
  }, []);

  const removeParameter = useCallback((id: string) => {
    setSettings((s) => ({
      ...s,
      parameters: s.parameters.filter((p) => p.id !== id),
    }));
  }, []);

  return {
    settings,
    setLabName,
    addEquipment,
    removeEquipment,
    addSheet,
    removeSheet,
    addParameter,
    toggleParameter,
    removeParameter,
  };
}
