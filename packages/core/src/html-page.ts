import { PAGE_SOURCES_MAX_PER_PAGE, PageSourceNameSchema } from "@rakazo/contracts";

/**
 * An HTML page says which of its page's sources it reads with two meta tags in the head:
 *   <meta name="praci-sources" content="Overview, Revenue">
 *   <meta name="praci-history" content="Revenue">
 * This is a small strict reader, not an HTML parser: the document is never executed or fully parsed.
 * Only the first HTML_META_SCAN_CHARS are read. Comments, <script>, <style>, <textarea>, <template>
 * and <title> content is removed first, so a tag inside them declares nothing. If a name appears in
 * more than one tag, the first tag wins. Names are matched to sources case-insensitively.
 */
export const HTML_META_SCAN_CHARS = 20_000;
const CONTENT_MAX_CHARS = 2_000;

const STRIPPED = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|template|title)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
// A tag whose quoted attribute values may contain ">".
const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function metaAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of tag.slice(5).matchAll(ATTRIBUTE)) {
    const key = (match[1] ?? "").toLowerCase();
    if (!attrs.has(key)) attrs.set(key, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function declared(html: string, wanted: string): string | null {
  const head = html.slice(0, HTML_META_SCAN_CHARS).replace(STRIPPED, "");
  for (const tag of head.match(META_TAG) ?? []) {
    const attrs = metaAttributes(tag);
    if (attrs.get("name")?.trim().toLowerCase() === wanted) return attrs.get("content") ?? "";
  }
  return null;
}

export interface HtmlPageDeclaration {
  /** Source names the page reads, as written, without duplicates. */
  sources: string[];
  /** The subset of `sources` the page also wants history for. */
  history: string[];
  /** Why the declaration is not valid; the page is refused when set. Names that were valid are still returned. */
  error?: string;
}

function names(content: string | null, label: string, errors: string[]): string[] {
  if (content === null || content.trim() === "") return [];
  if (content.length > CONTENT_MAX_CHARS) {
    errors.push(`${label} is longer than ${CONTENT_MAX_CHARS} characters.`);
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of content.split(",")) {
    const parsed = PageSourceNameSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${label} has an invalid source name "${raw.trim().slice(0, 40)}".`);
      continue;
    }
    const key = parsed.data.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed.data);
  }
  return out;
}

export function htmlPageDeclaration(html: string): HtmlPageDeclaration {
  const errors: string[] = [];
  const sources = names(declared(html, "praci-sources"), "praci-sources", errors);
  const history = names(declared(html, "praci-history"), "praci-history", errors);
  if (sources.length > PAGE_SOURCES_MAX_PER_PAGE)
    errors.push(`praci-sources names more than ${PAGE_SOURCES_MAX_PER_PAGE} sources.`);
  const known = new Set(sources.map((name) => name.toLowerCase()));
  for (const name of history)
    if (!known.has(name.toLowerCase()))
      errors.push(`praci-history names "${name}", which praci-sources does not list.`);
  return {
    sources: sources.slice(0, PAGE_SOURCES_MAX_PER_PAGE),
    history: history.filter((name) => known.has(name.toLowerCase())),
    ...(errors.length ? { error: errors[0] } : {}),
  };
}
