import { getMissingServiceMessage } from "../lib/config.js";
import { createEmbeddingOrNull } from "../lib/openaiClient.js";

export interface TextChunk {
  chunk_text: string;
  chunk_index: number;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
}

function splitText(text: string, maxLength = 1200): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const chunks: string[] = [];
  for (let index = 0; index < cleaned.length; index += maxLength) {
    chunks.push(cleaned.slice(index, index + maxLength));
  }
  return chunks;
}

export async function chunkAndEmbedText(
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<{ chunks: TextChunk[]; warnings: string[] }> {
  const warnings: string[] = [];
  const chunks: TextChunk[] = [];
  for (const [index, chunk] of splitText(text).entries()) {
    const embeddingResult = await createEmbeddingOrNull(chunk);
    warnings.push(...embeddingResult.warnings);
    chunks.push({
      chunk_text: chunk,
      chunk_index: index,
      embedding: embeddingResult.embedding,
      metadata,
    });
  }
  if (chunks.length > 0 && chunks.every((chunk) => !chunk.embedding)) {
    warnings.push(getMissingServiceMessage("embeddings"));
  }
  return { chunks, warnings: Array.from(new Set(warnings)) };
}

export function keywordRank<T extends { text: string }>(
  query: string,
  candidates: T[],
  limit: number,
): T[] {
  const terms = new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 3),
  );
  return candidates
    .map((candidate) => {
      const text = candidate.text.toLowerCase();
      let score = 0;
      for (const term of terms) if (text.includes(term)) score += 1;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.candidate);
}
