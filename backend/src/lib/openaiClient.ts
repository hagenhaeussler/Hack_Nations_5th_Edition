import OpenAI from "openai";
import { Blob } from "node:buffer";
import {
  fetch as undiciFetch,
  File as UndiciFile,
  FormData as UndiciFormData,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from "undici";
import { z, type ZodType } from "zod";

import { config, getMissingServiceMessage } from "./config.js";

export type ModelTier = "high" | "medium" | "small";

type StructuredFailureReason =
  | "missing_openai"
  | "model_error"
  | "invalid_json"
  | "invalid_schema";

export interface StructuredModelOk<T> {
  ok: true;
  data: T;
  raw: unknown;
  model: string;
  warnings: string[];
}

export interface StructuredModelFailure {
  ok: false;
  reason: StructuredFailureReason;
  message: string;
  warnings: string[];
}

export type StructuredModelResult<T> =
  | StructuredModelOk<T>
  | StructuredModelFailure;

export interface TextModelOk {
  ok: true;
  text: string;
  raw: unknown;
  model: string;
  warnings: string[];
}

export interface TextModelFailure {
  ok: false;
  reason: "missing_openai" | "model_error";
  message: string;
  warnings: string[];
}

let client: OpenAI | null = null;

export function isOpenAIEnabled(): boolean {
  return config.openai.enabled;
}

function getClient(): OpenAI | null {
  if (!config.openai.enabled || !config.openai.apiKey) return null;
  ensureFetchGlobals();
  const runtimeFetch = globalThis.fetch ?? (undiciFetch as unknown as typeof globalThis.fetch);
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey, fetch: runtimeFetch });
  return client;
}

function ensureFetchGlobals(): void {
  const scope = globalThis as Record<string, unknown>;
  scope.fetch ??= undiciFetch;
  scope.Headers ??= UndiciHeaders;
  scope.Request ??= UndiciRequest;
  scope.Response ??= UndiciResponse;
  scope.FormData ??= UndiciFormData;
  scope.File ??= UndiciFile;
  scope.Blob ??= Blob;
}

function orderedModels(tier: ModelTier): string[] {
  const tiers: ModelTier[] =
    tier === "high" ? ["high", "medium", "small"] : tier === "medium" ? ["medium", "small"] : ["small"];
  return Array.from(new Set(tiers.map((name) => config.models[name]).filter(Boolean)));
}

function responseText(response: unknown): string {
  const candidate = response as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };
  if (typeof candidate.output_text === "string") return candidate.output_text;
  return (
    candidate.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((text): text is string => typeof text === "string")
      .join("\n")
      .trim() ?? ""
  );
}

function safeTaskName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "labpilot_task";
}

function schemaToJson(schema: ZodType): Record<string, unknown> {
  const zWithJsonSchema = z as unknown as {
    toJSONSchema?: (schema: ZodType, params?: Record<string, unknown>) => unknown;
  };
  const rawSchema = zWithJsonSchema.toJSONSchema
    ? zWithJsonSchema.toJSONSchema(schema)
    : { type: "object", additionalProperties: true };
  return requireAllObjectProperties(rawSchema) as Record<string, unknown>;
}

function requireAllObjectProperties(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(requireAllObjectProperties);

  const objectValue = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(objectValue)) {
    if (key === "default" || key === "propertyNames") continue;
    if (key === "additionalProperties" && child !== false) {
      next[key] = false;
      continue;
    }
    next[key] = requireAllObjectProperties(child);
  }

  if (next.properties && typeof next.properties === "object" && !Array.isArray(next.properties)) {
    next.required = Object.keys(next.properties as Record<string, unknown>);
  }
  if (schemaIncludesObject(next) && !next.properties && next.additionalProperties === false) {
    next.properties = {};
    next.required = [];
  }
  if (schemaIncludesObject(next) && next.properties) {
    next.additionalProperties = false;
  }
  return next;
}

function schemaIncludesObject(schema: Record<string, unknown>): boolean {
  if (schema.type === "object") return true;
  return Array.isArray(schema.type) && schema.type.includes("object");
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error("Model response was not JSON.");
  }
  return JSON.parse(trimmed) as unknown;
}

export async function callStructuredModel<T>(args: {
  taskName: string;
  instructions: string;
  input: unknown;
  schema: ZodType<T>;
  modelTier?: ModelTier;
  maxTokens?: number;
  temperature?: number;
}): Promise<StructuredModelResult<T>> {
  const openai = getClient();
  if (!openai) {
    return {
      ok: false,
      reason: "missing_openai",
      message: getMissingServiceMessage("openai"),
      warnings: [getMissingServiceMessage("openai")],
    };
  }

  const warnings: string[] = [];
  const input =
    typeof args.input === "string" ? args.input : JSON.stringify(args.input, null, 2);
  const jsonSchema = schemaToJson(args.schema);

  let lastFailure: StructuredModelFailure | null = null;
  for (const model of orderedModels(args.modelTier ?? "medium")) {
    for (const attempt of [0, 1]) {
      try {
        const response = await openai.responses.create({
          model,
          instructions:
            attempt === 0
              ? args.instructions
              : `${args.instructions}\n\nReturn only schema-valid JSON. Do not include markdown, comments, or prose outside the JSON object.`,
          input,
          max_output_tokens: args.maxTokens ?? 3000,
          text: {
            format: {
              type: "json_schema",
              name: safeTaskName(args.taskName),
              schema: jsonSchema,
            },
          },
        } as never);
        const text = responseText(response);
        let parsed: unknown;
        try {
          parsed = parseJson(text);
        } catch (err) {
          lastFailure = {
            ok: false,
            reason: "invalid_json",
            message: err instanceof Error ? err.message : "OpenAI returned invalid JSON.",
            warnings: ["OpenAI returned invalid structured output. Used local fallback."],
          };
          continue;
        }
        const validation = args.schema.safeParse(parsed);
        if (!validation.success) {
          lastFailure = {
            ok: false,
            reason: "invalid_schema",
            message: validation.error.message,
            warnings: ["OpenAI returned invalid structured output. Used local fallback."],
          };
          continue;
        }
        return { ok: true, data: validation.data, raw: response, model, warnings };
      } catch (err) {
        const message = err instanceof Error ? err.message : "OpenAI model call failed.";
        warnings.push(`OpenAI model "${model}" failed: ${message}`);
        lastFailure = {
          ok: false,
          reason: "model_error",
          message,
          warnings: [...warnings],
        };
        break;
      }
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      reason: "model_error",
      message: "OpenAI model call failed.",
      warnings: [...warnings, "OpenAI call failed. Used local fallback."],
    }
  );
}

export async function callTextModel(args: {
  taskName: string;
  instructions: string;
  input: unknown;
  modelTier?: ModelTier;
  maxTokens?: number;
  temperature?: number;
}): Promise<TextModelOk | TextModelFailure> {
  const openai = getClient();
  if (!openai) {
    return {
      ok: false,
      reason: "missing_openai",
      message: getMissingServiceMessage("openai"),
      warnings: [getMissingServiceMessage("openai")],
    };
  }
  const input =
    typeof args.input === "string" ? args.input : JSON.stringify(args.input, null, 2);
  const warnings: string[] = [];
  for (const model of orderedModels(args.modelTier ?? "small")) {
    try {
      const response = await openai.responses.create({
        model,
        instructions: args.instructions,
        input,
        max_output_tokens: args.maxTokens ?? 1200,
      } as never);
      return { ok: true, text: responseText(response), raw: response, model, warnings };
    } catch (err) {
      const message = err instanceof Error ? err.message : "OpenAI text call failed.";
      warnings.push(`OpenAI model "${model}" failed: ${message}`);
    }
  }
  return {
    ok: false,
    reason: "model_error",
    message: "OpenAI text call failed.",
    warnings,
  };
}

export async function createEmbedding(input: string): Promise<number[]> {
  const openai = getClient();
  if (!openai) throw new Error(getMissingServiceMessage("embeddings"));
  const response = await openai.embeddings.create({
    model: config.models.embedding,
    input,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("OpenAI embedding response was empty.");
  return embedding;
}

export async function createEmbeddingOrNull(input: string): Promise<{
  embedding: number[] | null;
  warnings: string[];
}> {
  if (!config.openai.enabled) {
    return { embedding: null, warnings: [getMissingServiceMessage("embeddings")] };
  }
  try {
    return { embedding: await createEmbedding(input), warnings: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding call failed.";
    return {
      embedding: null,
      warnings: [`${message} ${getMissingServiceMessage("embeddings")}`],
    };
  }
}
