import { config, getMissingServiceMessage } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import {
  ResearchSourceSchema,
  type ResearchSource,
} from "../schemas/agentSchemas.js";
import { fallbackResearchSources } from "../agents/fallbackAgents.js";
import { searchOpenAlexResearch } from "./openAlexResearchProvider.js";

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
  if (!config.researchApi.enabled) {
    return {
      sources: fallbackResearchSources(args.hypothesis, args.domain),
      warnings: [getMissingServiceMessage("researchApi")],
      mode: "fallback",
    };
  }

  const warnings: string[] = [];
  if (config.openAlex.enabled) {
    try {
      logger.info("research_provider.openalex.started", {
        queryCount: args.queries.length,
        domain: args.domain,
      });
      const sources = await searchOpenAlexResearch(args);
      if (sources.length > 0) {
        logger.info("research_provider.openalex.completed", { sourceCount: sources.length });
        return {
          sources,
          warnings,
          mode: "external",
        };
      }
      warnings.push("OpenAlex returned no matching papers with abstracts.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "OpenAlex request failed.";
      logger.warn("research_provider.openalex.failed", { message });
      warnings.push(message);
    }

    return {
      sources: fallbackResearchSources(args.hypothesis, args.domain),
      warnings: [
        ...warnings,
        "OpenAlex semantic search was unavailable, so LabPilot used demo research sources.",
      ],
      mode: "fallback",
    };
  }

  if (!config.researchApi.url || !config.researchApi.apiKey) {
    return {
      sources: fallbackResearchSources(args.hypothesis, args.domain),
      warnings: [
        ...warnings,
        getMissingServiceMessage("researchApi"),
      ],
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
      sources: parsed.data.map((source: ResearchSource) => ({
        ...source,
        metadata: {
          source_kind: "external_research_or_protocol",
          retrieval_role: "protocol_grounding_or_novelty_qc",
          ...source.metadata,
        },
        is_fallback: false,
      })),
      warnings,
      mode: "external",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research API request failed.";
    return {
      sources: fallbackResearchSources(args.hypothesis, args.domain),
      warnings: [...warnings, `${message} ${getMissingServiceMessage("researchApi")}`],
      mode: "fallback",
    };
  }
}
