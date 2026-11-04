import { describe, expect, it } from "vitest";
import { toggleAgentAccess } from "./router.js";

const bot = (id: string, extra: Partial<{ audience: string; firewall: boolean }> = {}) => ({
  id,
  audience: "internal",
  firewall: false,
  ...extra,
});
const conn = (allAgents: boolean, ids: string[] = [], agentBotId: string | null = null) => ({
  allAgents,
  agentBotId,
  botAccess: ids.map((botId) => ({ botId })),
});

describe("toggleAgentAccess", () => {
  const bots = [bot("a"), bot("b"), bot("c")];

  it("turning one off under all agents lists exactly the others", () => {
    const next = toggleAgentAccess(conn(true), bots, "b", false);
    expect(next.allAgents).toBe(false);
    expect([...next.botIds].sort()).toEqual(["a", "c"]);
  });

  it("does not grant a firewalled or external agent when leaving all agents", () => {
    const withRestricted = [
      ...bots,
      bot("fw", { firewall: true }),
      bot("ext", { audience: "external" }),
    ];
    const next = toggleAgentAccess(conn(true), withRestricted, "b", false);
    expect(next.allAgents).toBe(false);
    expect([...next.botIds].sort()).toEqual(["a", "c"]);
  });

  it("turning a firewalled agent on adds an explicit grant even under all agents", () => {
    const withFw = [...bots, bot("fw", { firewall: true })];
    const next = toggleAgentAccess(conn(true), withFw, "fw", true);
    expect(next).toEqual({ allAgents: true, botIds: ["fw"] });
  });

  it("turning a firewalled agent off removes only its grant", () => {
    const withFw = [...bots, bot("fw", { firewall: true })];
    const next = toggleAgentAccess(conn(true, ["fw"]), withFw, "fw", false);
    expect(next).toEqual({ allAgents: true, botIds: [] });
  });

  it("the connection's own agent cannot be turned off", () => {
    const next = toggleAgentAccess(conn(false, ["a", "b"], "a"), bots, "a", false);
    expect([...next.botIds].sort()).toEqual(["a", "b"]);
  });

  it("an unknown agent is refused", () => {
    expect(() => toggleAgentAccess(conn(false), bots, "zzz", true)).toThrow();
  });
});
