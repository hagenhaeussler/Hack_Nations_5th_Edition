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
  /** Direct link to a PDF, used by the detail drawer's preview. */
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

/**
 * Build a short, human-readable explanation of why `paper` is relevant to
 * `hypothesis`. We don't have a model handy on the client, so this stitches
 * together the strongest non-obvious signal we already have: a couple of
 * overlap keywords between the hypothesis and the abstract/title. The numeric
 * score is already displayed elsewhere, so repeating it here adds noise.
 */
export function buildPaperRelevanceExplanation(
  paper: Paper,
  hypothesis: string,
): string {
  const overlap = sharedKeywords(hypothesis, paper.abstract, paper.title);
  return overlap.length
    ? `It overlaps your hypothesis on ${formatList(overlap)}.`
    : "";
}

function sharedKeywords(
  hypothesis: string,
  ...corpora: string[]
): string[] {
  const hypothesisTokens = tokenize(hypothesis);
  if (hypothesisTokens.size === 0) return [];

  const corpusTokens = new Set<string>();
  for (const text of corpora) {
    for (const token of tokenize(text)) corpusTokens.add(token);
  }

  const shared: string[] = [];
  for (const token of hypothesisTokens) {
    if (corpusTokens.has(token)) shared.push(token);
    if (shared.length >= 3) break;
  }
  return shared;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "onto", "than",
  "then", "have", "has", "had", "are", "was", "were", "but", "not", "all",
  "any", "can", "may", "use", "uses", "used", "via", "per", "such", "their",
  "they", "them", "our", "your", "you", "how", "why", "what", "when", "where",
  "which", "who", "whom", "whose", "about", "above", "below", "after", "before",
  "between", "during", "without", "within", "while", "also", "more", "most",
  "much", "many", "some", "few", "one", "two", "three",
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return `"${items[0]}"`;
  if (items.length === 2) return `"${items[0]}" and "${items[1]}"`;
  return `"${items.slice(0, -1).join('", "')}", and "${items[items.length - 1]}"`;
}
