// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings[0] }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../lib/user-error", () => ({ errorText: () => "Something went wrong" }));
const api = vi.hoisted(() => ({
  list: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  table: vi.fn(),
  setActionType: vi.fn(),
}));
vi.mock("../lib/rpc", () => ({ rpc: { approvalRules: api } }));

import { ApprovalActionsTable } from "./ApprovalActionsTable";
import { ApprovalRulesSettings } from "./ApprovalRulesSettings";

const TYPES = [
  ["send_email", true],
  ["spend_money", true],
  ["connected_apps_write", true],
  ["calendar_changes", true],
  ["files_and_commands", true],
  ["use_computer", false],
  ["delete_data", false],
  ["message_outside", false],
  ["use_credentials", false],
] as const;
const rows = (botEffects: Record<string, string> = {}) =>
  TYPES.map(([actionType, primary]) => ({
    actionType,
    primary,
    effect: botEffects[actionType] ?? "ask",
    spaceEffect: "ask",
    botEffect: botEffects[actionType] ?? null,
  }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const select = (type: string) =>
  container.querySelector<HTMLSelectElement>(`[data-testid=approval-row-${type}]`);

async function change(el: HTMLSelectElement | null, value: string) {
  await act(async () => {
    if (!el) throw new Error("select missing");
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  api.list.mockResolvedValue([]);
  api.setActionType.mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("shows one select per action type, primary rows first and the rest under More actions", async () => {
  api.table.mockResolvedValue({ rows: rows() });
  await act(async () => root.render(<ApprovalRulesSettings />));
  await act(async () => {});
  expect(container.querySelectorAll("select").length).toBe(9);
  const more = container.querySelector("details");
  expect(more?.contains(select("use_computer"))).toBe(true);
  expect(more?.contains(select("send_email"))).toBe(false);
  expect(api.table).toHaveBeenCalledWith({ botId: undefined });
});

it("saves a changed space row and reloads the table", async () => {
  api.table.mockResolvedValue({ rows: rows() });
  await act(async () => root.render(<ApprovalActionsTable />));
  await act(async () => {});
  await change(select("send_email"), "block");
  expect(api.setActionType).toHaveBeenCalledWith({
    actionType: "send_email",
    botId: undefined,
    effect: "block",
  });
  expect(api.table).toHaveBeenCalledTimes(2);
});

it("for a bot, shows the override and sends null for Same as all bots", async () => {
  api.table.mockResolvedValue({ rows: rows({ send_email: "block" }) });
  await act(async () => root.render(<ApprovalActionsTable botId="bot-1" />));
  await act(async () => {});
  expect(select("send_email")?.value).toBe("block");
  expect(select("spend_money")?.value).toBe("same");
  await change(select("send_email"), "same");
  expect(api.setActionType).toHaveBeenCalledWith({
    actionType: "send_email",
    botId: "bot-1",
    effect: null,
  });
});

it("shows an error when saving fails", async () => {
  api.table.mockResolvedValue({ rows: rows() });
  api.setActionType.mockRejectedValue(new Error("x"));
  await act(async () => root.render(<ApprovalActionsTable />));
  await act(async () => {});
  await change(select("send_email"), "allow");
  expect(container.textContent).toContain("Something went wrong");
});

it("disables Allow for a tool rule that always needs approval", async () => {
  api.table.mockResolvedValue({ rows: rows() });
  api.list.mockResolvedValue([
    {
      id: "r1",
      effect: "require_approval",
      matchKind: "tool",
      matchValue: "create_space",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  await act(async () => root.render(<ApprovalRulesSettings />));
  await act(async () => {});
  const ruleSelect = container.querySelector<HTMLSelectElement>("li select");
  expect(ruleSelect?.value).toBe("ask");
  expect(ruleSelect?.querySelector<HTMLOptionElement>("option[value=allow]")?.disabled).toBe(true);
  expect(ruleSelect?.querySelector<HTMLOptionElement>("option[value=block]")?.disabled).toBe(false);
});
