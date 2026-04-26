/**
 * Thin client for the LabPilot backend.
 *
 * In dev, requests are proxied through Vite's `/api` rewrite to
 * `http://localhost:4000`. The two long-running calls (`startResearch`,
 * `generateProject`) intentionally await the full backend latency — the UI
 * shows a loading screen while the promise is in flight.
 */

import type { Attachment } from "@/components/PromptInput";
import type { Project, WorkflowNode } from "@/lib/projects";

// ---------------------------------------------------------------------------
// Chat (legacy stub — left in place for backwards compatibility)
// ---------------------------------------------------------------------------

export interface SendPromptArgs {
  text: string;
  attachments?: Attachment[];
  files?: File[];
}

export interface SendPromptResponse {
  ok: boolean;
  conversationId?: string;
  message?: string;
  attachments?: { id: string; name: string; size: number }[];
}

export async function sendPrompt({
  text,
  attachments,
  files,
}: SendPromptArgs): Promise<SendPromptResponse> {
  const form = new FormData();
  form.append("text", text);

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.kind === "file") {
        form.append("files", att.file, att.file.name);
        form.append("fileCategories", att.category);
      } else {
        form.append("links", att.url);
        form.append("linkCategories", att.category);
      }
    }
  } else if (files) {
    for (const file of files) form.append("files", file, file.name);
  }

  const res = await fetch("/api/chat", { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SendPromptResponse;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** Shape of every successful response: `{ ok: true, ...payload }`. */
type ApiOk<T> = T & { ok: true };
type ApiErr = { ok: false; error: string };
type ApiResponse<T> = ApiOk<T> | ApiErr;

interface JsonRequestInit extends Omit<RequestInit, "body"> {
  /** When set, serialised as JSON and sent with `Content-Type: application/json`. */
  body?: unknown;
}

/**
 * Tiny JSON helper.
 *
 * Sends `init.body` as JSON when present, parses the response, and throws an
 * `Error` with the server-provided message on failure. The generic `T` is
 * the shape of the success payload _excluding_ the `ok: true` flag — e.g.
 * `T = { project: Project }` for `{ ok: true, project: ... }`.
 */
async function jsonRequest<T>(path: string, init?: JsonRequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  let body: BodyInit | undefined;
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  const res = await fetch(path, { ...init, headers, body });
  const payload = (await res
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !payload) {
    const message =
      payload && payload.ok === false ? payload.error : res.statusText;
    throw new Error(message || `Backend error: ${res.status}`);
  }
  if (payload.ok === false) {
    throw new Error(payload.error || `Backend error: ${res.status}`);
  }
  return payload;
}

/**
 * Kicks off the literature search for a hypothesis.
 *
 * The backend creates the project synchronously, holds the response open for
 * the configured mock latency (~10s), then returns the populated project with
 * `status: "research-ready"`. Callers should render a loading screen for the
 * duration.
 */
export async function startResearch(hypothesis: string): Promise<Project> {
  const res = await jsonRequest<{ project: Project }>("/api/projects/research", {
    method: "POST",
    body: { hypothesis },
  });
  return res.project;
}

/**
 * Generates the experiment workflow for an already-researched project.
 *
 * Like `startResearch`, the backend holds the response for the mock latency
 * and returns the project with `status: "ready"` and a populated `workflow`.
 */
export async function generateProject(id: string): Promise<Project> {
  const res = await jsonRequest<{ project: Project }>(
    `/api/projects/${encodeURIComponent(id)}/generate`,
    { method: "POST", body: {} },
  );
  return res.project;
}

export async function listProjects(): Promise<Project[]> {
  const res = await jsonRequest<{ projects: Project[] }>("/api/projects");
  return res.projects;
}

export async function getProject(id: string): Promise<Project> {
  const res = await jsonRequest<{ project: Project }>(
    `/api/projects/${encodeURIComponent(id)}`,
  );
  return res.project;
}

export async function updateWorkflowNode(
  projectId: string,
  nodeId: string,
  data: Partial<WorkflowNode["data"]>,
  position?: WorkflowNode["position"],
): Promise<Project> {
  const res = await jsonRequest<{ project: Project }>(
    `/api/projects/${encodeURIComponent(projectId)}/workflow/nodes/${encodeURIComponent(nodeId)}`,
    { method: "PATCH", body: { data, position } },
  );
  return res.project;
}
