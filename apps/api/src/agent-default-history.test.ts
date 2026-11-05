import { createHash } from "node:crypto";
import { COMPANY_AGENT_INSTRUCTIONS, investorsAgentSpawnKey } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { AGENT_DEFAULT_HASHES, isPastDefault } from "./agent-default-history.js";
import { upgradeBuiltInAgentInstructions } from "./agent-instruction-upgrades.js";
import { CARTA_AGENT_INSTRUCTIONS } from "./carta-agent.js";
import { DATA_ROOM_AGENT_INSTRUCTIONS } from "./data-room-agent.js";
import { FINANCE_AGENT_INSTRUCTIONS } from "./finance-agent.js";
import { GTM_AGENT_INSTRUCTIONS } from "./gtm-agent.js";
import { INBOX_AGENT_INSTRUCTIONS } from "./inbox-agent.js";
import {
  INVESTORS_AGENT_INSTRUCTIONS,
  PREVIOUS_INVESTORS_AGENT_INSTRUCTIONS,
} from "./investors-agent.js";
import { INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE } from "./investors-old-default.fixture.js";
import { LEGAL_AGENT_INSTRUCTIONS } from "./legal-agent.js";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const DEFAULTS: Record<string, string> = {
  carta: CARTA_AGENT_INSTRUCTIONS,
  company: COMPANY_AGENT_INSTRUCTIONS,
  "data-room": DATA_ROOM_AGENT_INSTRUCTIONS,
  finance: FINANCE_AGENT_INSTRUCTIONS,
  gtm: GTM_AGENT_INSTRUCTIONS,
  inbox: INBOX_AGENT_INSTRUCTIONS,
  investors: INVESTORS_AGENT_INSTRUCTIONS,
  legal: LEGAL_AGENT_INSTRUCTIONS,
};

describe("agent default history", () => {
  it.each(Object.entries(DEFAULTS))(
    "%s: the current default is recorded, and an edit of it is not an old default",
    (kind, text) => {
      // Fails when a default changes without moving the old hash into `past` in agent-default-history.ts.
      expect(AGENT_DEFAULT_HASHES[kind]?.current).toBe(sha256(text));
      expect(AGENT_DEFAULT_HASHES[kind]?.past).not.toContain(sha256(text));
      expect(isPastDefault(kind, text)).toBe(false);
      expect(isPastDefault(kind, `${text} Always answer in French.`)).toBe(false);
    },
  );

  it("knows the Investors default that says it cannot change a stage", () => {
    expect(INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE).toContain("saying which source you used");
    expect(INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE).toContain("cannot change a stage");
    // The old sentence-removal list missed it; the hash list does not.
    expect(PREVIOUS_INVESTORS_AGENT_INSTRUCTIONS.has(INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE)).toBe(
      false,
    );
    expect(isPastDefault("investors", INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE)).toBe(true);
  });
});

describe("upgradeBuiltInAgentInstructions", () => {
  it("upgrades an Investors agent holding an old default and leaves an edited one alone", async () => {
    const edited = `${INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE} Mine.`;
    const rows = [
      { id: "old", instructions: INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE },
      { id: "edited", instructions: edited },
    ];
    const findMany = vi.fn(async ({ where }: { where: { spawnKey: { startsWith: string } } }) =>
      where.spawnKey.startsWith === investorsAgentSpawnKey("") ? rows : [],
    );
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const counts = await upgradeBuiltInAgentInstructions({
      bot: { findMany, updateMany },
    } as never);
    expect(counts.investors).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "old", instructions: INVESTORS_DEFAULT_WITH_SOURCE_SENTENCE },
      data: { instructions: INVESTORS_AGENT_INSTRUCTIONS },
    });
  });
});
