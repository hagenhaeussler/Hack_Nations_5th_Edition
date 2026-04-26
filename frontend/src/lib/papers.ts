/**
 * Paper domain types — mirror of `backend/src/lib/projectTypes.ts`.
 *
 * Papers are now retrieved from the backend (`/api/projects/:id`) as part of
 * the project record. We keep only the types here plus a tiny similarity
 * label helper used by the graph + list views.
 */

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  /** 0–1 cosine-style similarity to the user's prompt. */
  similarity: number;
  abstract: string;
  url?: string;
  pdfUrl?: string;
  provider?: string;
  novelty_relation?: string;
  is_fallback?: boolean;
  referencedPaperIds?: string[];
  relatedPaperIds?: string[];
}

export function similarityLabel(score: number): string {
  if (score >= 0.85) return "Very similar";
  if (score >= 0.7) return "Similar";
  if (score >= 0.55) return "Related";
  return "Loosely related";
}

const RELEVANCE_STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "and",
  "between",
  "from",
  "into",
  "that",
  "the",
  "their",
  "this",
  "through",
  "using",
  "with",
  "would",
]);

function extractKeywords(value: string): string[] {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !RELEVANCE_STOP_WORDS.has(word));
  return [...new Set(words)];
}

export function buildPaperRelevanceExplanation(paper: Paper, hypothesis: string): string {
  const promptKeywords = extractKeywords(hypothesis);
  const paperText = `${paper.title} ${paper.abstract}`;
  const paperKeywords = new Set(extractKeywords(paperText));
  const sharedKeywords = promptKeywords
    .filter((keyword) => paperKeywords.has(keyword))
    .slice(0, 5);
  const similarity = Math.round(paper.similarity * 100);
  const relation = similarityLabel(paper.similarity).toLowerCase();

  if (sharedKeywords.length > 0) {
    return `This paper is ${relation} to the input hypothesis with ${similarity}% semantic relevance, especially around ${sharedKeywords.join(", ")}.`;
  }

  return `This paper is ${relation} to the input hypothesis with ${similarity}% semantic relevance based on the semantic search over its title and abstract.`;
}
