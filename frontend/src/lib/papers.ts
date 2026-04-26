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
  provider?: string;
  novelty_relation?: string;
  is_fallback?: boolean;
}

export function similarityLabel(score: number): string {
  if (score >= 0.85) return "Very similar";
  if (score >= 0.7) return "Similar";
  if (score >= 0.55) return "Related";
  return "Loosely related";
}
