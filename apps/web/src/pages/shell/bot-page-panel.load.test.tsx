// @vitest-environment jsdom
import type { BotPage } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../lib/rpc", () => ({ rpc: { pages: mocks } }));
vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import type { PageRemoteUpdate } from "./bot-page-panel";
import { BotPagePanel } from "./bot-page-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

it("reports a never-written page and renders its first remote save without a reload", async () => {
  const onPageChange = vi.fn();
  mocks.list.mockResolvedValue([]);
  mocks.get.mockResolvedValue(null);
  await act(async () => {
    root.render(<BotPagePanel botId="bot_demo" remote={null} onPageChange={onPageChange} />);
  });
  expect(onPageChange).toHaveBeenCalledWith(null);
  expect(container.querySelector('[role="textbox"]')).toBeNull();

  const page: BotPage = {
    id: "page_1",
    kind: "blocks",
    botId: "bot_demo",
    title: "Demo",
    content: "# Created by agent",
    revision: 1,
    updatedBy: "bot",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  mocks.list.mockResolvedValue([
    { id: "page_1", title: "Demo", revision: 1, updatedAt: page.updatedAt },
  ]);
  mocks.get.mockResolvedValue(page);
  await act(async () => {
    root.render(
      <BotPagePanel
        botId="bot_demo"
        remote={{ revision: 1, updatedBy: "bot", seq: 1 }}
        onPageChange={onPageChange}
      />,
    );
  });
  expect(onPageChange).toHaveBeenLastCalledWith(page);
  expect(container.querySelector('[role="textbox"]')?.textContent).toContain("Created by agent");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("keeps a failed initial load visible instead of reporting a missing page", async () => {
  const onPageChange = vi.fn();
  mocks.list.mockResolvedValue([]);
  mocks.get.mockRejectedValue(new Error("Could not load the page."));
  await act(async () => {
    root.render(<BotPagePanel botId="bot_demo" remote={null} onPageChange={onPageChange} />);
  });
  expect(onPageChange).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not load the page.");
});

const summary = (id: string, title: string, revision = 1) => ({
  id,
  title,
  kind: "blocks" as const,
  revision,
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const pageOf = (id: string, title: string, content: string, revision = 1): BotPage => ({
  ...summary(id, title, revision),
  botId: "bot_demo",
  content,
  updatedBy: "bot",
});

it("shows page titles as tabs, switches pages, and reloads only the page an event names", async () => {
  mocks.list.mockResolvedValue([summary("p1", "Cash"), summary("p2", "Burn")]);
  mocks.get.mockImplementation(async ({ pageId }: { pageId?: string }) =>
    pageId === "p2" ? pageOf("p2", "Burn", "Burn text") : pageOf("p1", "Cash", "Cash text"),
  );
  const render = (remote: PageRemoteUpdate | null) =>
    act(async () => {
      root.render(<BotPagePanel botId="bot_demo" remote={remote} />);
    });
  await render(null);
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Cash", "Burn"]);
  expect(container.querySelector('[role="textbox"]')?.textContent).toContain("Cash text");
  expect(mocks.get).toHaveBeenLastCalledWith({ botId: "bot_demo", pageId: "p1" });

  await act(async () => {
    (tabs[1] as HTMLElement).click();
  });
  expect(mocks.get).toHaveBeenLastCalledWith({ botId: "bot_demo", pageId: "p2" });
  expect(container.querySelector('[role="textbox"]')?.textContent).toContain("Burn text");

  // An event for the page that is not open does not refetch; one for the open page does.
  mocks.get.mockClear();
  mocks.get.mockResolvedValue(pageOf("p2", "Burn", "Burn text v2", 2));
  await render({ pageId: "p1", revision: 2, updatedBy: "bot", seq: 1 });
  expect(mocks.get).not.toHaveBeenCalled();
  await render({ pageId: "p2", revision: 2, updatedBy: "bot", seq: 2 });
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.get).toHaveBeenLastCalledWith({ botId: "bot_demo", pageId: "p2" });
  expect(container.querySelector('[role="textbox"]')?.textContent).toContain("Burn text v2");
});

it("has no tab row for one page and creates a new page from the New page button", async () => {
  mocks.list.mockResolvedValue([summary("p1", "Cash")]);
  mocks.get.mockResolvedValue(pageOf("p1", "Cash", "Cash text"));
  await act(async () => {
    root.render(<BotPagePanel botId="bot_demo" remote={null} />);
  });
  expect(container.querySelector('[role="tab"]')).toBeNull();
  mocks.create.mockResolvedValue(pageOf("p2", "New page", ""));
  mocks.list.mockResolvedValue([summary("p1", "Cash"), summary("p2", "New page")]);
  await act(async () => {
    (container.querySelector('[aria-label="New page"]') as HTMLElement).click();
  });
  expect(mocks.create).toHaveBeenCalledWith({ botId: "bot_demo", title: "New page" });
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
  const title = container.querySelector('input[aria-label="Page title"]') as HTMLInputElement;
  expect(title).not.toBeNull();
  // The default title is selected, so typing a name replaces it.
  expect(document.activeElement).toBe(title);
  expect([title.selectionStart, title.selectionEnd]).toEqual([0, "New page".length]);
});

it("pins one page: no tabs or new button, reports its title, and reports a missing page", async () => {
  mocks.list.mockResolvedValue([summary("p1", "Cash"), summary("p2", "Burn")]);
  mocks.get.mockResolvedValue(pageOf("p2", "Burn", "Burn text"));
  const onTitle = vi.fn();
  const onMissing = vi.fn();
  await act(async () => {
    root.render(
      <BotPagePanel
        botId="bot_demo"
        remote={null}
        fixedPageId="p2"
        onTitle={onTitle}
        onMissing={onMissing}
      />,
    );
  });
  expect(container.querySelector('[role="tab"]')).toBeNull();
  expect(container.querySelector('[aria-label="New page"]')).toBeNull();
  expect(mocks.get).toHaveBeenLastCalledWith({ botId: "bot_demo", pageId: "p2" });
  expect(onTitle).toHaveBeenCalledWith("Burn");
  expect(onMissing).not.toHaveBeenCalled();

  await act(async () => {
    root.render(
      <BotPagePanel botId="bot_demo" remote={null} fixedPageId="gone" onMissing={onMissing} />,
    );
  });
  expect(onMissing).toHaveBeenCalled();
});
