import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { ResearchSource } from "../schemas/agentSchemas.js";

interface OpenAlexLocation {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: {
    display_name?: string | null;
  } | null;
}

interface OpenAlexWork {
  id?: string | null;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  authorships?: Array<{
    author?: {
      display_name?: string | null;
    } | null;
  }>;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  cited_by_count?: number | null;
  referenced_works?: string[];
  related_works?: string[];
  open_access?: {
    is_oa?: boolean;
    oa_status?: string | null;
  } | null;
  type?: string | null;
}

interface OpenAlexListResponse {
  results?: unknown;
}

const OPENALEX_BASE_URL = "https://api.openalex.org";
const MAX_ABSTRACT_CHARS = 2400;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeOpenAlexWorkId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/W\d+$/);
  return match?.[0] ?? null;
}

function reconstructAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      if (Number.isInteger(position)) {
        words.push({ word, position });
      }
    }
  }
  return words
    .sort((left, right) => left.position - right.position)
    .map(({ word }) => word)
    .join(" ");
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const cut = value.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 400 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

function asOpenAlexWorks(payload: unknown): OpenAlexWork[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as OpenAlexListResponse).results;
  return Array.isArray(results) ? (results as OpenAlexWork[]) : [];
}

function queryCandidates(args: {
  hypothesis: string;
  domain: string;
  queries: string[];
}): string[] {
  return unique([
    args.hypothesis,
    ...args.queries,
    args.domain ? `${args.domain} ${args.hypothesis}` : "",
  ]).slice(0, config.openAlex.maxQueries);
}

function buildOpenAlexUrl(search: string, perPage: number): string {
  const url = new URL("/works", OPENALEX_BASE_URL);
  // OpenAlex ranks `/works?search=` by text relevance across titles,
  // abstracts, and indexed full text. Keep every provider query on this path.
  url.searchParams.set("search", search);
  url.searchParams.set("filter", "has_abstract:true");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set(
    "select",
    [
      "id",
      "doi",
      "display_name",
      "title",
      "publication_year",
      "authorships",
      "primary_location",
      "best_oa_location",
      "abstract_inverted_index",
      "cited_by_count",
      "referenced_works",
      "related_works",
      "open_access",
      "type",
    ].join(","),
  );
  if (config.openAlex.apiKey) {
    url.searchParams.set("api_key", config.openAlex.apiKey);
  }
  if (config.openAlex.mailto) {
    url.searchParams.set("mailto", config.openAlex.mailto);
  }
  return url.toString();
}

async function fetchWorks(search: string, perPage: number): Promise<OpenAlexWork[]> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.openAlex.timeoutMs);
  try {
    const response = await fetch(buildOpenAlexUrl(search, perPage), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenAlex returned ${response.status} ${response.statusText}`);
    }
    const works = asOpenAlexWorks(await response.json());
    logger.info("openalex.semantic_search.completed", {
      queryLength: search.length,
      perPage,
      resultCount: works.length,
      durationMs: Date.now() - startedAt,
    });
    return works;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`OpenAlex semantic search timed out after ${config.openAlex.timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function relevanceFor(rank: number, citedByCount: number | null | undefined): number {
  const rankScore = 0.92 - rank * 0.018;
  const citationBoost = Math.log10(Math.max(0, citedByCount ?? 0) + 1) * 0.025;
  return clamp(rankScore + citationBoost, 0.52, 0.98);
}

function workToSource(work: OpenAlexWork, rank: number): ResearchSource | null {
  const openAlexId = normalizeOpenAlexWorkId(work.id);
  const title = work.display_name ?? work.title ?? "";
  const abstract = truncateText(reconstructAbstract(work.abstract_inverted_index), MAX_ABSTRACT_CHARS);
  if (!openAlexId || !title || !abstract) return null;

  const authors = unique(
    (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name ?? "")
      .slice(0, 8),
  );
  const venue =
    work.primary_location?.source?.display_name ??
    work.best_oa_location?.source?.display_name ??
    "OpenAlex";
  const url =
    work.primary_location?.landing_page_url ??
    work.best_oa_location?.landing_page_url ??
    work.best_oa_location?.pdf_url ??
    work.id ??
    null;
  const referencedOpenAlexIds = unique(
    (work.referenced_works ?? [])
      .map(normalizeOpenAlexWorkId)
      .filter((id): id is string => Boolean(id)),
  );
  const relatedOpenAlexIds = unique(
    (work.related_works ?? [])
      .map(normalizeOpenAlexWorkId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    title,
    abstract,
    url,
    year: work.publication_year ?? null,
    authors: authors.length > 0 ? authors : ["Unknown authors"],
    external_id: openAlexId,
    metadata: {
      provider: "OpenAlex",
      venue,
      doi: work.doi ?? null,
      openalex_url: work.id ?? null,
      type: work.type ?? null,
      cited_by_count: work.cited_by_count ?? 0,
      is_open_access: work.open_access?.is_oa ?? null,
      oa_status: work.open_access?.oa_status ?? null,
      referenced_openalex_ids: referencedOpenAlexIds,
      related_openalex_ids: relatedOpenAlexIds,
    },
    relevance_score: relevanceFor(rank, work.cited_by_count),
    is_fallback: false,
  };
}

function filterFetchedIds(value: unknown, fetchedIds: Set<string>): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && fetchedIds.has(id))
    : [];
}

function keepOnlyFetchedPaperLinks(sources: ResearchSource[]): ResearchSource[] {
  const fetchedIds = new Set(
    sources
      .map((source) => source.external_id)
      .filter((id): id is string => Boolean(id)),
  );
  return sources.map((source) => {
    const referenced = filterFetchedIds(source.metadata.referenced_openalex_ids, fetchedIds);
    const related = filterFetchedIds(source.metadata.related_openalex_ids, fetchedIds);
    return {
      ...source,
      metadata: {
        ...source.metadata,
        referenced_openalex_ids: referenced,
        related_openalex_ids: related,
      },
    };
  });
}

export async function searchOpenAlexResearch(args: {
  hypothesis: string;
  domain: string;
  queries: string[];
}): Promise<ResearchSource[]> {
  const maxResults = config.openAlex.maxResults;
  const candidates = queryCandidates(args);
  const perQuery = clamp(Math.ceil(maxResults / Math.max(candidates.length, 1)) + 2, 5, 100);
  const byId = new Map<string, ResearchSource>();
  let rank = 0;

  logger.info("openalex.research.started", {
    queryCount: candidates.length,
    maxResults,
    timeoutMs: config.openAlex.timeoutMs,
  });

  const settled = await Promise.allSettled(
    candidates.map(async (query) => ({
      query,
      works: await fetchWorks(query, perQuery),
    })),
  );

  for (const result of settled) {
    if (result.status === "rejected") {
      const reason = result.reason instanceof Error ? result.reason.message : "OpenAlex query failed.";
      logger.warn("openalex.semantic_search.failed", { reason });
      continue;
    }
    const { works } = result.value;
    for (const work of works) {
      const source = workToSource(work, rank);
      rank += 1;
      if (!source || !source.external_id || byId.has(source.external_id)) continue;
      byId.set(source.external_id, source);
      if (byId.size >= maxResults) break;
    }
    if (byId.size >= maxResults) break;
  }

  const sources = keepOnlyFetchedPaperLinks(Array.from(byId.values()));
  logger.info("openalex.research.completed", {
    sourceCount: sources.length,
    queryFailures: settled.filter((result) => result.status === "rejected").length,
  });
  return sources;
}
