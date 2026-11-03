import type { ComposerMention } from "./composer-mentions.js";

type Named = Pick<ComposerMention, "name">;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The `@query` that ends at the caret, or null. Works mid-sentence. */
export function findMentionQueryAtCaret(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const match = /(?:^|\s)@([\w-]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: caret - query.length - 1, query };
}

/** Replaces the `@query` at the caret with `@Name ` (no extra space when one follows). */
export function insertInlineMention(
  text: string,
  caret: number,
  mention: Named,
): { text: string; caret: number } {
  const found = findMentionQueryAtCaret(text, caret);
  const start = found?.start ?? caret;
  const token = `@${mention.name}`;
  const rest = text.slice(caret);
  const gap = /^\s/.test(rest) ? "" : " ";
  return {
    text: `${text.slice(0, start)}${token}${gap}${rest}`,
    caret: start + token.length + 1,
  };
}

export type MentionRange<T extends Named> = { start: number; end: number; mention: T };

/** Where each mention's `@Name` token sits in the text, in order, without overlaps. */
export function findMentionRanges<T extends Named>(
  text: string,
  mentions: readonly T[],
): MentionRange<T>[] {
  const all: MentionRange<T>[] = [];
  for (const mention of mentions) {
    const name = mention.name.trim();
    if (!name) continue;
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_-])@${escapeRegExp(name)}(?![\\p{L}\\p{N}_-])`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      const start = match.index + (match[1] ?? "").length;
      all.push({ start, end: start + name.length + 1, mention });
    }
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const ranges: MentionRange<T>[] = [];
  for (const range of all) {
    if (range.start >= (ranges.at(-1)?.end ?? 0)) ranges.push(range);
  }
  return ranges;
}

/** Keeps only the mentions whose token is still in the text. */
export function pruneMentions<T extends Named>(text: string, mentions: readonly T[]): T[] {
  const present = new Set(findMentionRanges(text, mentions).map((range) => range.mention));
  return mentions.filter((mention) => present.has(mention));
}

/** Backspace with the caret at the end of (or inside) a mention removes the whole token. */
export function mentionDeletionAtCaret(
  text: string,
  caret: number,
  mentions: readonly Named[],
): { text: string; caret: number } | null {
  const range = findMentionRanges(text, mentions).find((r) => caret > r.start && caret <= r.end);
  if (!range) return null;
  return { text: text.slice(0, range.start) + text.slice(range.end), caret: range.start };
}
