/**
 * Thin client for the LabPilot backend.
 * In dev, requests go through Vite's `/api` proxy → http://localhost:4000.
 */

import type { Attachment } from "@/components/PromptInput";

export interface SendPromptArgs {
  text: string;
  /**
   * Structured list of attachments — preferred. Each file is sent under the
   * `files` part with a parallel `fileCategories` part; each link is sent
   * under `links` with a parallel `linkCategories` part. The backend can
   * iterate the parallel arrays to know how to route each artefact.
   */
  attachments?: Attachment[];
  /** Back-compat: bare files with no category metadata. */
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

  const res = await fetch("/api/chat", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as SendPromptResponse;
}
