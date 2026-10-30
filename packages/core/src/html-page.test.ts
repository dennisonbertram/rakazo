import { describe, expect, it } from "vitest";
import { htmlPageDeclaration } from "./html-page.js";

const meta = (name: string, content: string) => `<meta name="${name}" content="${content}">`;

describe("htmlPageDeclaration", () => {
  it("reads sources and history", () => {
    const d = htmlPageDeclaration(
      `<head>${meta("praci-sources", "Overview, Revenue")}${meta("praci-history", "Revenue")}</head>`,
    );
    expect(d).toEqual({ sources: ["Overview", "Revenue"], history: ["Revenue"] });
  });
  it("accepts any attribute order, quote style and case", () => {
    const d = htmlPageDeclaration(`<META CONTENT='A b' NAME=praci-sources><Meta Content="A b" name="PRACI-SOURCES">`);
    expect(d.sources).toEqual(["A b"]);
  });
  it("first tag wins and duplicate names collapse", () => {
    const d = htmlPageDeclaration(`${meta("praci-sources", "A, a, B")}${meta("praci-sources", "C")}`);
    expect(d.sources).toEqual(["A", "B"]);
  });
  it("ignores tags in comments, scripts, styles and templates", () => {
    const html = `<!-- ${meta("praci-sources", "Hidden")} --><script>var x='${meta("praci-sources", "Hidden")}'</script><style>${meta("praci-sources", "Hidden")}</style><template>${meta("praci-sources", "Hidden")}</template><!-- unterminated ${meta("praci-sources", "Hidden")}`;
    expect(htmlPageDeclaration(html)).toEqual({ sources: [], history: [] });
  });
  it("reads only the start of the document", () => {
    const html = `${" ".repeat(20_001)}${meta("praci-sources", "Late")}`;
    expect(htmlPageDeclaration(html).sources).toEqual([]);
  });
  it("allows > inside a quoted value but not a name that fails the source rules", () => {
    const d = htmlPageDeclaration(`<meta name="praci-sources" content="A>B, Good">`);
    expect(d.sources).toEqual(["Good"]);
    expect(d.error).toContain("invalid source name");
  });
  it("reports history that is not a declared source, too many sources and very long values", () => {
    expect(htmlPageDeclaration(`${meta("praci-sources", "A")}${meta("praci-history", "B")}`).error).toContain("does not list");
    const many = Array.from({ length: 21 }, (_, i) => `S${i}`).join(",");
    const tooMany = htmlPageDeclaration(meta("praci-sources", many));
    expect(tooMany.error).toContain("more than 20");
    expect(tooMany.sources).toHaveLength(20);
    expect(htmlPageDeclaration(meta("praci-sources", "A".repeat(3000))).error).toContain("longer than");
  });
  it("stays fast on hostile input", () => {
    const start = Date.now();
    htmlPageDeclaration(`<meta "`.repeat(2500));
    htmlPageDeclaration(`<meta ${"a='".repeat(6000)}`);
    expect(Date.now() - start).toBeLessThan(1500);
  });
});
