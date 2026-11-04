// @vitest-environment jsdom

import type { Bot } from "@rakazo/contracts";
import { inboxAgentSpawnKey, mailThreadAgentSpawnKey } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  connections: {
    list: vi.fn(),
    effectiveAccess: vi.fn(),
    access: vi.fn(),
    setAccess: vi.fn(),
  },
  mcp: {
    servers: { list: vi.fn() },
    assignments: { list: vi.fn(), replace: vi.fn() },
  },
  bots: { list: vi.fn() },
}));
vi.mock("../../lib/rpc", () => ({ rpc }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { BotAccessSection } from "./BotAccessSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= () =>
  ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

const bot = (id: string, name: string, spawnKey: string | null = null) =>
  ({ id, name, color: "#000", spawnKey, archivedAt: null }) as unknown as Bot;
const conn = (id: string, name: string, account: string, agentBotId: string | null = null) => ({
  id,
  displayName: name,
  account,
  status: "connected",
  agentBotId,
});

const ada = bot("ada", "Ada");
const bea = bot("bea", "Bea");
const inbox = bot("inbox", "Inbox agent", inboxAgentSpawnKey("u1"));

beforeEach(() => {
  vi.clearAllMocks();
  rpc.bots.list.mockResolvedValue([ada, bea, inbox]);
  rpc.mcp.servers.list.mockResolvedValue([]);
  rpc.mcp.assignments.list.mockResolvedValue([]);
  rpc.connections.access.mockResolvedValue({
    allAgents: false,
    botIds: ["bea"],
    agentShared: true,
  });
  rpc.connections.setAccess.mockResolvedValue(undefined);
  rpc.mcp.assignments.replace.mockResolvedValue(undefined);
});

async function mount(agent: Bot) {
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () => createRoot(container).render(<BotAccessSection bot={agent} />));
  await act(async () => undefined);
  const sw = (label: string) =>
    container.querySelector<HTMLElement>(`[aria-label^="${label}"]`) as HTMLElement;
  return { container, sw };
}

it("lists the accounts the agent can reach with address and the real state", async () => {
  rpc.connections.list.mockResolvedValue([
    conn("c1", "Gmail", "ann@example.com"),
    conn("c2", "Gmail", "bob@example.com"),
  ]);
  rpc.connections.effectiveAccess.mockResolvedValue({
    c1: { shared: "some", botIds: ["ada"] },
    c2: { shared: "some", botIds: ["bea"] },
  });
  const { container, sw } = await mount(ada);
  expect(container.textContent).toContain("ann@example.com");
  expect(container.textContent).toContain("bob@example.com");
  expect(sw("Ada can use Gmail ann@example.com").getAttribute("aria-checked")).toBe("true");
  expect(sw("Ada can use Gmail bob@example.com").getAttribute("aria-checked")).toBe("false");
});

it("a toggle saves through the same setAccess endpoint as the integration page", async () => {
  rpc.connections.list.mockResolvedValue([conn("c2", "Gmail", "bob@example.com")]);
  rpc.connections.effectiveAccess.mockResolvedValue({ c2: { shared: "some", botIds: ["bea"] } });
  const { sw } = await mount(ada);
  await act(async () => sw("Ada can use Gmail bob@example.com").click());
  expect(rpc.connections.setAccess).toHaveBeenCalledWith({
    connectionId: "c2",
    allAgents: false,
    botIds: ["bea", "ada"],
  });
});

it("an agent's own connection is on and locked; a private one cannot be turned on", async () => {
  rpc.connections.list.mockResolvedValue([
    conn("c1", "Mercury", "", "ada"),
    conn("c2", "Brex", "", "bea"),
  ]);
  rpc.connections.effectiveAccess.mockResolvedValue({
    c1: { shared: "some", botIds: ["ada"] },
    c2: { shared: "some", botIds: ["bea"] },
  });
  rpc.connections.access.mockResolvedValue({ allAgents: true, botIds: [], agentShared: false });
  const { sw } = await mount(ada);
  const own = sw("Ada can use Mercury");
  expect(own.getAttribute("aria-checked")).toBe("true");
  expect(own.hasAttribute("data-disabled") || own.getAttribute("aria-disabled") === "true").toBe(
    true,
  );
  const other = sw("Ada can use Brex");
  expect(
    other.hasAttribute("data-disabled") || other.getAttribute("aria-disabled") === "true",
  ).toBe(true);
});

it("an email chat shows the Inbox agent's mail account on and locked", async () => {
  const chat = bot("chat", "Re: hi", mailThreadAgentSpawnKey("c1", "t1"));
  rpc.bots.list.mockResolvedValue([ada, inbox, chat]);
  rpc.connections.list.mockResolvedValue([conn("c1", "Gmail", "ann@example.com", "inbox")]);
  rpc.connections.effectiveAccess.mockResolvedValue({ c1: { shared: "some", botIds: ["chat"] } });
  const { sw } = await mount(chat);
  const row = sw("Re: hi can use Gmail");
  expect(row.getAttribute("aria-checked")).toBe("true");
  expect(row.hasAttribute("data-disabled") || row.getAttribute("aria-disabled") === "true").toBe(
    true,
  );
});

it("a server toggle assigns it to this agent only, keeping its other servers", async () => {
  rpc.connections.list.mockResolvedValue([]);
  rpc.connections.effectiveAccess.mockResolvedValue({});
  rpc.mcp.servers.list.mockResolvedValue([
    { id: "s1", name: "Docs", enabled: true, agentBotId: null, agentExclusive: false },
  ]);
  rpc.mcp.assignments.list.mockResolvedValue([
    { serverId: "s0", allowAllTools: false, allowedTools: ["x"] },
  ]);
  const { sw } = await mount(ada);
  await act(async () => sw("Ada can use Docs").click());
  expect(rpc.mcp.assignments.replace).toHaveBeenCalledWith({
    botId: "ada",
    assignments: [
      { serverId: "s0", allowAllTools: false, allowedTools: ["x"] },
      { serverId: "s1", allowAllTools: true, allowedTools: [] },
    ],
  });
});

it("shows search only above 8 rows and renders nothing with no accounts", async () => {
  rpc.connections.list.mockResolvedValue([]);
  rpc.connections.effectiveAccess.mockResolvedValue({});
  const empty = await mount(ada);
  expect(empty.container.textContent).toBe("");

  rpc.connections.list.mockResolvedValue(
    Array.from({ length: 9 }, (_, i) => conn(`c${i}`, `App${i}`, `u${i}@example.com`)),
  );
  const nine = await mount(ada);
  expect(nine.container.querySelector('input[type="search"]')).not.toBeNull();
});
