// @vitest-environment jsdom

import { mailThreadAgentSpawnKey } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
const access = vi.hoisted(() => vi.fn());
const setAccess = vi.hoisted(() => vi.fn());
vi.mock("../../lib/rpc", () => ({
  rpc: { connections: { access, setAccess, setExclusive: vi.fn() } },
}));

import { OmiAgent } from "./OmiPage";
import type { IntegrationsData } from "./useIntegrations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= () =>
  ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;

const bots = [
  { id: "omi", name: "Omi agent", color: "#000", spawnKey: null },
  { id: "ada", name: "Ada", color: "#000", spawnKey: null },
  { id: "e1", name: "One", color: "#000", spawnKey: mailThreadAgentSpawnKey("c", "t1") },
  { id: "e2", name: "Two", color: "#000", spawnKey: mailThreadAgentSpawnKey("c", "t2") },
];

async function show(initial: { allAgents: boolean; botIds: string[] }) {
  access.mockResolvedValue(initial);
  setAccess.mockImplementation(async (input: { allAgents: boolean; botIds: string[] }) => input);
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <OmiAgent
          connectionId="c1"
          agentBotId="omi"
          data={{ bots } as unknown as IntegrationsData}
        />
      </MemoryRouter>,
    ),
  );
  return container;
}

it("Email chats off in Omi revokes every chat, not only the last one", async () => {
  const container = await show({ allAgents: true, botIds: [] });
  await act(async () =>
    container.querySelector<HTMLElement>('[aria-label="Email chats can use Omi"]')?.click(),
  );
  const last = setAccess.mock.calls.at(-1)?.[0];
  expect(last).toEqual({ connectionId: "c1", allAgents: false, botIds: ["omi", "ada"] });
});

it("All and None each save once, and None keeps the Omi agent", async () => {
  setAccess.mockClear();
  const container = await show({ allAgents: false, botIds: ["omi", "ada"] });
  const press = (name: string) =>
    act(async () =>
      [...container.querySelectorAll("button")].find((b) => b.textContent === name)?.click(),
    );
  await press("All");
  expect(setAccess.mock.calls).toEqual([[{ connectionId: "c1", allAgents: true, botIds: [] }]]);
  setAccess.mockClear();
  await press("None");
  expect(setAccess.mock.calls).toEqual([
    [{ connectionId: "c1", allAgents: false, botIds: ["omi"] }],
  ]);
});
