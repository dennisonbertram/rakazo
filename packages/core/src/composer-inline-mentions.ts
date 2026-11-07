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

/** Replaces the `@query` at the caret with `@Name` and a space unless whitespace already follows. */
export function insertInlineMention(
  text: string,
  caret: number,
  mention: Named,
): { text: string; caret: number; start: number; end: number } {
  const found = findMentionQueryAtCaret(text, caret);
  const start = found?.start ?? caret;
  const token = `@${mention.name}`;
  const rest = text.slice(caret);
  const gap = /^\s/.test(rest) ? "" : " ";
  return {
    text: `${text.slice(0, start)}${token}${gap}${rest}`,
    caret: start + token.length + gap.length,
    start,
    end: start + token.length,
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

/** One picked mention and where its `@Name` token sits. Identity stays with the occurrence. */
export type MentionSpan<T extends Named> = { mention: T; start: number; end: number };

/** Moves spans through an edit that replaced [from, oldEnd) with text `delta` longer; spans touching the edit are dropped. */
export function mapSpans<T extends Named>(
  spans: readonly MentionSpan<T>[],
  from: number,
  oldEnd: number,
  delta: number,
): MentionSpan<T>[] {
  const out: MentionSpan<T>[] = [];
  for (const span of spans) {
    if (span.end <= from) out.push(span);
    else if (span.start >= oldEnd) {
      out.push({ ...span, start: span.start + delta, end: span.end + delta });
    }
  }
  return out;
}

/** Maps spans through a text change, found as the changed middle between the common prefix and suffix. */
export function shiftSpans<T extends Named>(
  spans: readonly MentionSpan<T>[],
  oldText: string,
  newText: string,
): MentionSpan<T>[] {
  if (oldText === newText || spans.length === 0) return [...spans];
  const max = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }
  return mapSpans(spans, prefix, oldText.length - suffix, newText.length - oldText.length);
}

/** The spans whose token is still exactly `@Name` in the text. */
export function liveSpans<T extends Named>(
  text: string,
  spans: readonly MentionSpan<T>[],
): MentionSpan<T>[] {
  return spans.filter(
    (s) =>
      text.slice(s.start, s.end) === `@${s.mention.name}` &&
      !/^[\p{L}\p{N}_-]/u.test(text.slice(s.end, s.end + 1)),
  );
}

/** Backspace with the caret at the end of (or inside) a mention removes that whole token. */
export function mentionDeletionAtCaret<T extends Named>(
  text: string,
  caret: number,
  spans: readonly MentionSpan<T>[],
): { text: string; caret: number; spans: MentionSpan<T>[] } | null {
  const hit = liveSpans(text, spans).find((s) => caret > s.start && caret <= s.end);
  if (!hit) return null;
  return {
    text: text.slice(0, hit.start) + text.slice(hit.end),
    caret: hit.start,
    spans: mapSpans(
      spans.filter((s) => s !== hit),
      hit.start,
      hit.end,
      hit.start - hit.end,
    ),
  };
}
