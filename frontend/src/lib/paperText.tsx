import type { ReactNode } from "react";

const ITALIC_TAG_RE = /<\/?i\s*>/gi;

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

export function stripPaperMarkup(value: string): string {
  return decodeHtmlEntities(value)
    .replace(ITALIC_TAG_RE, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render paper text with minimal scholarly markup support.
 *
 * Some providers return species names wrapped in literal `<i>` tags. We do not
 * inject the returned HTML; instead we strip those tags and wrap only the tagged
 * text in a React `<i>` element.
 */
export function renderPaperText(value: string): ReactNode {
  const decoded = decodeHtmlEntities(value);
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let italic = false;
  let key = 0;

  for (const match of decoded.matchAll(ITALIC_TAG_RE)) {
    const tag = match[0];
    const index = match.index ?? 0;
    appendText(parts, decoded.slice(lastIndex, index), italic, key++);
    italic = !tag.startsWith("</");
    lastIndex = index + tag.length;
  }

  appendText(parts, decoded.slice(lastIndex), italic, key++);
  return parts.length === 1 ? parts[0] : parts;
}

function appendText(parts: ReactNode[], text: string, italic: boolean, key: number) {
  const cleaned = text.replace(/<[^>]+>/g, "");
  if (!cleaned) return;
  parts.push(italic ? <i key={key}>{cleaned}</i> : cleaned);
}
