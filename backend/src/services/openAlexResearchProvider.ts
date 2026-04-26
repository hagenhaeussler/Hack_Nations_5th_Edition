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
  is_xpac?: boolean | null;
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
const OPENALEX_USER_AGENT = "LabPilot/0.1 OpenAlex semantic search";
const OPENALEX_RETRY_DELAYS_MS = [1000, 2500];

type OpenAlexSearchMode = "semantic" | "keyword";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function keywordFallbackQuery(hypothesis: string): string {
  const stopWords = new Set([
    "about",
    "across",
    "against",
    "also",
    "under",
    "using",
    "want",
    "whether",
    "which",
    "with",
    "within",
    "should",
    "experiment",
    "prototype",
    "conditions",
    "condition",
    "several",
    "determine",
    "evaluate",
    "generate",
    "measure",
    "compare",
    "previous",
    "matched",
    "relevant",
    "normal",
  ]);
  const tokens = hypothesis
    .match(/[a-zA-Z][a-zA-Z0-9-]{2,}/g)
    ?.map((token) => token.toLowerCase())
    .filter((token) => !stopWords.has(token)) ?? [];
  const query = unique(tokens).slice(0, 16).join(" ");
  return query || cleanSearchText(hypothesis).slice(0, 240);
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
}, mode: OpenAlexSearchMode): string[] {
  if (mode === "semantic") {
    return [cleanSearchText(args.hypothesis)].filter(Boolean);
  }

  return unique([
    keywordFallbackQuery(args.hypothesis),
    ...args.queries,
    args.domain ? `${args.domain} ${keywordFallbackQuery(args.hypothesis)}` : "",
  ]).slice(0, config.openAlex.maxQueries);
}

function buildOpenAlexUrl(search: string, perPage: number, mode: OpenAlexSearchMode): string {
  const url = new URL("/works", OPENALEX_BASE_URL);
  // The OpenAlex web UI's semantic mode maps to `search.semantic`, which works
  // much better for paragraph-length experiment descriptions than keyword search.
  url.searchParams.set(mode === "semantic" ? "search.semantic" : "search", search);
  url.searchParams.set("include_xpac", "true");
  if (mode === "keyword") {
    url.searchParams.set("filter", "has_abstract:true");
  }
  url.searchParams.set("per_page", String(mode === "semantic" ? Math.min(perPage, 50) : perPage));
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
      "is_xpac",
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

async function fetchWorksOnce(
  search: string,
  perPage: number,
  mode: OpenAlexSearchMode,
): Promise<OpenAlexWork[]> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.openAlex.timeoutMs);
  try {
    const response = await fetch(buildOpenAlexUrl(search, perPage, mode), {
      headers: {
        Accept: "application/json",
        "User-Agent": OPENALEX_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenAlex returned ${response.status} ${response.statusText}`);
    }
    const works = asOpenAlexWorks(await response.json());
    logger.info("openalex.semantic_search.completed", {
      searchMode: mode,
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

async function fetchWorks(
  search: string,
  perPage: number,
  mode: OpenAlexSearchMode,
): Promise<OpenAlexWork[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= OPENALEX_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fetchWorksOnce(search, perPage, mode);
    } catch (err) {
      lastError = err;
      if (attempt >= OPENALEX_RETRY_DELAYS_MS.length) break;
      const delayMs = OPENALEX_RETRY_DELAYS_MS[attempt] ?? 0;
      logger.warn("openalex.semantic_search.retrying", {
        searchMode: mode,
        attempt: attempt + 1,
        delayMs,
        reason: err instanceof Error ? err.message : "OpenAlex query failed.",
      });
      await sleep(delayMs);
    }
  }
  throw lastError;
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
  const pdfUrl =
    work.best_oa_location?.pdf_url ??
    work.primary_location?.pdf_url ??
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
      source_kind: "scientific_literature",
      retrieval_role: "semantic_novelty_qc",
      venue,
      doi: work.doi ?? null,
      openalex_url: work.id ?? null,
      pdf_url: pdfUrl,
      type: work.type ?? null,
      cited_by_count: work.cited_by_count ?? 0,
      is_xpac: work.is_xpac ?? null,
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
  const semanticCandidates = queryCandidates(args, "semantic");
  const keywordCandidates = queryCandidates(args, "keyword");
  const perQuery = clamp(maxResults, 5, 50);
  const byId = new Map<string, ResearchSource>();
  let queryFailures = 0;
  let rank = 0;

  logger.info("openalex.research.started", {
    queryCount: semanticCandidates.length,
    keywordFallbackQueryCount: keywordCandidates.length,
    searchMode: "semantic",
    maxResults,
    timeoutMs: config.openAlex.timeoutMs,
  });

  const collectWorks = (works: OpenAlexWork[]) => {
    for (const work of works) {
      const source = workToSource(work, rank);
      rank += 1;
      if (!source || !source.external_id || byId.has(source.external_id)) continue;
      byId.set(source.external_id, source);
      if (byId.size >= maxResults) break;
    }
  };

  for (const query of semanticCandidates) {
    let works: OpenAlexWork[];
    try {
      works = await fetchWorks(query, perQuery, "semantic");
    } catch (err) {
      queryFailures += 1;
      const reason = err instanceof Error ? err.message : "OpenAlex query failed.";
      logger.warn("openalex.semantic_search.failed", { reason });
      continue;
    }
    collectWorks(works);
    if (byId.size >= maxResults) break;
  }

  if (byId.size === 0) {
    logger.warn("openalex.semantic_search.falling_back_to_keyword", {
      queryCount: keywordCandidates.length,
    });
    const keywordPerQuery = clamp(Math.ceil(maxResults / Math.max(keywordCandidates.length, 1)) + 2, 5, 100);
    for (const query of keywordCandidates) {
      let works: OpenAlexWork[];
      try {
        works = await fetchWorks(query, keywordPerQuery, "keyword");
      } catch (err) {
        queryFailures += 1;
        const reason = err instanceof Error ? err.message : "OpenAlex keyword query failed.";
        logger.warn("openalex.keyword_search.failed", { reason });
        continue;
      }
      collectWorks(works);
      if (byId.size >= maxResults) break;
    }
  }

  const sources = keepOnlyFetchedPaperLinks(Array.from(byId.values()));
  logger.info("openalex.research.completed", {
    sourceCount: sources.length,
    queryFailures,
  });
  return sources;
}
