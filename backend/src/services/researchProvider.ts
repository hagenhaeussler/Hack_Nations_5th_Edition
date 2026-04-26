import { config, getMissingServiceMessage } from "../lib/config.js";
import {
  ResearchSourceSchema,
  type ResearchSource,
} from "../schemas/agentSchemas.js";
import { fallbackResearchSources } from "../agents/fallbackAgents.js";

export interface ResearchProviderResult {
  sources: ResearchSource[];
  warnings: string[];
  mode: "external" | "fallback";
}

export async function searchExternalResearch(args: {
  hypothesis: string;
  domain: string;
  queries: string[];
}): Promise<ResearchProviderResult> {
  if (!config.researchApi.enabled || !config.researchApi.url || !config.researchApi.apiKey) {
    return {
      sources: fallbackResearchSources(args.hypothesis, args.domain),
      warnings: [getMissingServiceMessage("researchApi")],
      mode: "fallback",
    };
  }

  try {
    const response = await fetch(config.researchApi.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.researchApi.apiKey}`,
      },
      body: JSON.stringify({
        hypothesis: args.hypothesis,
        domain: args.domain,
        queries: args.queries,
      }),
    });
    if (!response.ok) {
      throw new Error(`Research API returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as unknown;
    const sourcesValue =
      payload && typeof payload === "object" && "sources" in payload
        ? (payload as { sources?: unknown }).sources
        : null;
    const parsed = ResearchSourceSchema.array().safeParse(sourcesValue);
    if (!parsed.success) {
      throw new Error("Research API returned invalid normalized sources.");
    }
    return {
      sources: parsed.data.map((source) => ({ ...source, is_fallback: false })),
      warnings: [],
      mode: "external",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research API request failed.";
    return {
      sources: fallbackResearchSources(args.hypothesis, args.domain),
      warnings: [`${message} ${getMissingServiceMessage("researchApi")}`],
      mode: "fallback",
    };
  }
}
