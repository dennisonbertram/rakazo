// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sources: vi.fn() }));
vi.mock("../../lib/rpc", () => ({ rpc: { pages: { sources: mocks.sources } } }));

import { PageSourcesDialog } from "./PageSourcesDialog";

i18n.loadAndActivate({ locale: "en", messages: {} });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const source = (overrides: Record<string, unknown>) => ({
  id: "s1",
  pageId: "p1",
  name: "Cash",
  kind: "praci",
  call: { tool: "finance_overview", args: {} },
  schedule: "1h",
  status: "active",
  lastRefreshAt: "2026-01-01T09:00:00.000Z",
  lastError: null,
  ...overrides,
});

function mount(pageId: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (id: string) =>
    act(async () => {
      root.render(
        <I18nProvider i18n={i18n}>
          <PageSourcesDialog
            botId="b"
            pageId={id}
            open
            onOpenChange={() => {}}
            onChanged={() => {}}
          />
        </I18nProvider>,
      );
    });
  return { render: () => render(pageId), rerender: render };
}

it("labels an auto-paused source with an error as paused, not failed", async () => {
  mocks.sources.mockResolvedValue([source({ status: "paused", lastError: "Request timed out" })]);
  await mount("p1").render();
  const text = document.body.textContent ?? "";
  expect(text).toContain("paused");
  expect(text).not.toContain("failed");
});

it("shows the error under a failed row", async () => {
  mocks.sources.mockResolvedValue([source({ lastError: "Request timed out" })]);
  await mount("p1").render();
  const line = document.body.querySelector('[title="Request timed out"]');
  expect(line?.textContent).toBe("Request timed out");
  expect(document.body.textContent).toContain("failed");
});

it("shows the loading skeleton before the request resolves", async () => {
  mocks.sources.mockReturnValue(new Promise(() => {}));
  await mount("p1").render();
  expect(document.body.querySelector('[role="status"]')).not.toBeNull();
});

it("does not show the previous page's rows after the page changes", async () => {
  mocks.sources.mockResolvedValueOnce([source({ name: "Old page source" })]);
  const view = mount("p1");
  await view.render();
  expect(document.body.textContent).toContain("Old page source");
  mocks.sources.mockReturnValue(new Promise(() => {}));
  await view.rerender("p2");
  expect(document.body.textContent).not.toContain("Old page source");
});
