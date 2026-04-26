/**
 * Thin client for the LabPilot backend.
 *
 * In dev, requests are proxied through Vite's `/api` rewrite to
 * `http://localhost:4000`. The two long-running calls (`startResearch`,
 * `generateProject`) intentionally await the full backend latency — the UI
 * shows a loading screen while the promise is in flight.
 */

import type { Attachment } from "@/components/PromptInput";
import type {
  FinalPlanConfidence,
  FinalExperimentPlan,
  LessonCard,
  PlanEditRequest,
  Project,
  ProjectStatsReport,
  RiskAnalysisResult,
  WorkflowNode,
} from "@/lib/projects";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function apiPath(path: string): string {
  return `${API_BASE_URL}${path}`;
}

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

  const res = await fetch(apiPath("/api/chat"), { method: "POST", body: form });
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
type ApiErr = {
  ok: false;
  error: string;
  request_id?: string;
  stage?: string;
  project_id?: string;
  details?: unknown;
};
type ApiResponse<T> = ApiOk<T> | ApiErr;

interface ParsedApiResponse<T> {
  payload: ApiResponse<T> | null;
  rawText: string;
}

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

  const res = await fetch(apiPath(path), { ...init, headers, body });
  const { payload, rawText } = await parseApiResponse<T>(res);

  if (!res.ok || !payload) {
    const message =
      payload && payload.ok === false
        ? formatApiError(payload, res.statusText)
        : formatHttpError(res, rawText);
    throw new Error(message || `Backend error: ${res.status}`);
  }
  if (payload.ok === false) {
    throw new Error(formatApiError(payload, `Backend error: ${res.status}`));
  }
  return payload;
}

async function parseApiResponse<T>(res: Response): Promise<ParsedApiResponse<T>> {
  const rawText = await res.text();
  if (!rawText.trim()) return { payload: null, rawText };
  try {
    return { payload: JSON.parse(rawText) as ApiResponse<T>, rawText };
  } catch {
    return { payload: null, rawText };
  }
}

function formatHttpError(res: Response, rawText: string): string {
  const body = rawText.trim();
  const pieces = [`Backend error ${res.status}: ${res.statusText || "Request failed"}`];
  if (body) pieces.push(body.slice(0, 240));
  return pieces.join(" | ");
}

function formatApiError(payload: ApiErr, fallback: string): string {
  const pieces = [payload.error || fallback];
  if (payload.stage) pieces.push(`stage: ${payload.stage}`);
  if (payload.request_id) pieces.push(`request: ${payload.request_id}`);
  if (payload.details && typeof payload.details === "object" && "message" in payload.details) {
    const detailMessage = String((payload.details as { message?: unknown }).message ?? "");
    if (detailMessage && !pieces[0]?.includes(detailMessage)) pieces.push(`detail: ${detailMessage}`);
  }
  return pieces.join(" | ");
}

/**
 * Kicks off the literature search for a hypothesis.
 *
 * The backend creates the project synchronously, holds the response open for
 * the configured mock latency, then returns the populated project with
 * `status: "research-ready"`. Callers should render a loading screen for the
 * duration.
 */
export async function startResearch(
  hypothesis: string,
  attachments: Attachment[] = [],
): Promise<Project> {
  if (attachments.length > 0) {
    const form = new FormData();
    form.append("hypothesis", hypothesis);
    for (const attachment of attachments) {
      if (attachment.kind === "file") {
        form.append("files", attachment.file, attachment.file.name);
        form.append("fileCategories", attachment.category);
      } else {
        form.append("links", attachment.url);
        form.append("linkCategories", attachment.category);
      }
    }

    const res = await fetch(apiPath("/api/projects/research"), {
      method: "POST",
      body: form,
    });
    const { payload, rawText } = await parseApiResponse<{ project: Project }>(res);

    if (!res.ok || !payload) {
      const message =
        payload && payload.ok === false
          ? formatApiError(payload, res.statusText)
          : formatHttpError(res, rawText);
      throw new Error(message || `Backend error: ${res.status}`);
    }
    if (payload.ok === false) {
      throw new Error(formatApiError(payload, `Backend error: ${res.status}`));
    }
    return payload.project;
  }

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

export interface ApplyPlanEditResponse {
  project: Project;
  generated_lesson_cards: LessonCard[];
}

export async function applyPlanEdit(
  projectId: string,
  edit: PlanEditRequest,
): Promise<ApplyPlanEditResponse> {
  return jsonRequest<ApplyPlanEditResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/edits`,
    { method: "POST", body: edit },
  );
}

export async function applyPlanEdits(
  projectId: string,
  edits: PlanEditRequest[],
): Promise<ApplyPlanEditResponse> {
  return jsonRequest<ApplyPlanEditResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/batch-edits`,
    { method: "POST", body: { edits } },
  );
}

export async function getFinalPlan(planId: string): Promise<FinalExperimentPlan> {
  const res = await jsonRequest<{ plan: FinalExperimentPlan }>(
    `/api/plans/${encodeURIComponent(planId)}`,
  );
  return res.plan;
}

export async function getPlanStats(planId: string): Promise<ProjectStatsReport> {
  const res = await jsonRequest<{ stats: ProjectStatsReport }>(
    `/api/plans/${encodeURIComponent(planId)}/stats`,
  );
  return res.stats;
}

export async function downloadPlanReportPdf(planId: string): Promise<void> {
  const res = await fetch(
    apiPath(`/api/plans/${encodeURIComponent(planId)}/report/pdf`),
    { headers: { Accept: "application/pdf" } },
  );
  if (!res.ok) {
    throw new Error(res.statusText || `Backend error: ${res.status}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `labpilot_project_report_${planId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function analyzePlanRisks(planId: string): Promise<RiskAnalysisResult> {
  const res = await jsonRequest<{ analysis: RiskAnalysisResult }>(
    `/api/plans/${encodeURIComponent(planId)}/risk-analysis`,
    {
      method: "POST",
      body: {
        include_lessons: true,
        include_previous_experiments: true,
        include_citations: true,
      },
    },
  );
  return res.analysis;
}

// ---------------------------------------------------------------------------
// Plan Question-Answer Agent
// ---------------------------------------------------------------------------

export interface PlanQAChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PlanQAUsedContext {
  plan_id: string;
  task_ids?: string[];
  node_ids: string[];
  edge_ids: string[];
  citation_ids: string[];
  lesson_ids: string[];
  source_types: string[];
}

export interface PlanQASuggestedAction {
  type:
    | "open_node"
    | "highlight_node"
    | "highlight_edge"
    | "open_report_section"
    | "open_citation"
    | "suggest_plan_edit"
    | "open_purchase_list"
    | "open_risk_summary";
  target_id?: string;
  label: string;
}

export interface PlanQARequest {
  question: string;
  selected_node_id?: string | null;
  selected_edge_id?: string | null;
  chat_history?: PlanQAChatMessage[];
  options?: {
    include_sources?: boolean;
    include_suggested_actions?: boolean;
  };
}

export interface PlanQAResponse {
  answer: string;
  used_context: PlanQAUsedContext;
  suggested_actions: PlanQASuggestedAction[];
  confidence: FinalPlanConfidence;
}

export async function askPlanQuestion(
  planId: string,
  request: PlanQARequest,
): Promise<PlanQAResponse> {
  return jsonRequest<PlanQAResponse>(
    `/api/plans/${encodeURIComponent(planId)}/qa`,
    { method: "POST", body: request },
  );
}

export type EditorResponseType =
  | "answer"
  | "proposed_patch"
  | "applied_patch"
  | "clarification_needed"
  | "error";

export interface PlanPatchOperation {
  operation_id: string;
  operation_type: string;
  target_type: "node" | "edge" | "plan" | "schedule" | "report_section";
  target_id: string;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  requires_recalculation: Array<"schedule" | "stats_report">;
  risk_level: "low" | "medium" | "high" | "blocked";
  validation_status: "pending" | "valid" | "invalid" | "blocked";
}

export interface PlanPatch {
  patch_id: string;
  plan_id: string;
  created_at: string;
  created_by: "editor_agent";
  user_message: string;
  summary: string;
  operations: PlanPatchOperation[];
  expected_effects: string[];
  requires_confirmation: boolean;
  safety_status: "pending_validation" | "valid" | "invalid" | "blocked";
}

export interface PatchValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  requires_confirmation: boolean;
  estimated_blast_radius: "tiny" | "small" | "medium" | "large" | "blocked";
  affected_nodes: string[];
  affected_edges: string[];
  affected_report_sections: string[];
  will_recalculate_schedule: boolean;
  will_recalculate_stats: boolean;
}

export interface EditorIntent {
  intent_id: string;
  intent_type: "question" | "edit" | "mixed" | "ambiguous";
  confidence: FinalPlanConfidence;
  summary: string;
  requires_confirmation: boolean;
  edit_operations: PlanPatchOperation[];
  clarifying_question: string | null;
}

export interface EditorAgentResponse {
  response_type: EditorResponseType;
  natural_language_response: string;
  intent: EditorIntent;
  proposed_patch: PlanPatch | null;
  validation_result: PatchValidationResult | null;
  updated_plan: unknown | null;
  updated_stats_report: ProjectStatsReport | null;
  generated_change_events: unknown[];
  generated_lesson_cards: LessonCard[];
  suggested_actions: PlanQASuggestedAction[];
  project?: Project;
  answer?: PlanQAResponse;
}

export interface PlanEditorRequest {
  message: string;
  selected_node_id?: string | null;
  selected_edge_id?: string | null;
  chat_history?: PlanQAChatMessage[];
  mode?: "auto" | "question_only" | "edit_only";
}

export async function askPlanEditor(
  planId: string,
  request: PlanEditorRequest,
): Promise<EditorAgentResponse> {
  return jsonRequest<EditorAgentResponse>(
    `/api/plans/${encodeURIComponent(planId)}/editor`,
    { method: "POST", body: request },
  );
}

export async function applyPlanEditorPatch(
  planId: string,
  patch: PlanPatch,
): Promise<EditorAgentResponse> {
  return jsonRequest<EditorAgentResponse>(
    `/api/plans/${encodeURIComponent(planId)}/editor/apply-patch`,
    { method: "POST", body: { confirmed: true, patch } },
  );
}
