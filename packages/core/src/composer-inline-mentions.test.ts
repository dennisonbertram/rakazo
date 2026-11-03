import { describe, expect, it } from "vitest";

import {
  findMentionQueryAtCaret,
  findMentionRanges,
  insertInlineMention,
  mentionDeletionAtCaret,
  pruneMentions,
} from "./composer-inline-mentions.js";
import { serializeComposerPrompt } from "./composer-slash.js";

const inv = { kind: "bot", id: "b1", name: "Investors agent" } as const;
const ada = { kind: "bot", id: "b2", name: "Ada" } as const;

describe("findMentionQueryAtCaret", () => {
  it("finds the query before the caret mid-sentence", () => {
    const text = "share with @inv and put it";
    expect(findMentionQueryAtCaret(text, "share with @inv".length)).toEqual({
      start: 11,
      query: "inv",
    });
  });
  it("works at the start and for a bare @", () => {
    expect(findMentionQueryAtCaret("@", 1)).toEqual({ start: 0, query: "" });
  });
  it("ignores an @ inside a word or after the caret", () => {
    expect(findMentionQueryAtCaret("mail me@x", 9)).toBeNull();
    expect(findMentionQueryAtCaret("hi @ada", 2)).toBeNull();
  });
});

describe("insertInlineMention", () => {
  it("replaces the query at the caret and moves the caret after the name", () => {
    const text = "share with @inv and put it";
    const out = insertInlineMention(text, "share with @inv".length, inv);
    expect(out.text).toBe("share with @Investors agent and put it");
    expect(out.caret).toBe("share with @Investors agent ".length);
  });
  it("adds a space at the end of the text", () => {
    const out = insertInlineMention("hi @a", 5, ada);
    expect(out.text).toBe("hi @Ada ");
    expect(out.caret).toBe(out.text.length);
  });
  it("works at the start", () => {
    expect(insertInlineMention("@a rest", 2, ada).text).toBe("@Ada rest");
  });
});

describe("findMentionRanges and pruneMentions", () => {
  it("finds two mentions in order", () => {
    const text = "@Ada ask @Investors agent now";
    const ranges = findMentionRanges(text, [inv, ada]);
    expect(ranges.map((r) => [r.start, r.end, r.mention.name])).toEqual([
      [0, 4, "Ada"],
      [9, 25, "Investors agent"],
    ]);
  });
  it("drops a mention whose text was edited", () => {
    expect(pruneMentions("with @Investors agen now", [inv, ada])).toEqual([]);
    expect(pruneMentions("with @Investors agent now", [inv, ada])).toEqual([inv]);
  });
});

describe("mentionDeletionAtCaret", () => {
  it("removes the whole mention when the caret is at its end", () => {
    const text = "with @Investors agent and";
    const caret = "with @Investors agent".length;
    expect(mentionDeletionAtCaret(text, caret, [inv])).toEqual({
      text: "with  and",
      caret: 5,
    });
  });
  it("does nothing elsewhere", () => {
    expect(mentionDeletionAtCaret("with @Ada and", 3, [ada])).toBeNull();
  });
});

describe("serializeComposerPrompt with inline mentions", () => {
  it("does not prefix a mention already in the text", () => {
    expect(serializeComposerPrompt("share with @Investors agent and go", null, [inv])).toBe(
      "share with @Investors agent and go",
    );
  });
  it("still prefixes a mention that is not in the text", () => {
    expect(serializeComposerPrompt("go", null, [ada])).toBe("@Ada go");
  });
});
