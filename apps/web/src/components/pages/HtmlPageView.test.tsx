// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  data: vi.fn(),
  refresh: vi.fn(),
  sources: vi.fn(),
  viewer: vi.fn(),
}));
vi.mock("../../lib/rpc", () => ({
  rpc: {
    pages: { get: mocks.get, data: mocks.data, refresh: mocks.refresh, sources: mocks.sources },
  },
}));
vi.mock("../SandboxedHtmlViewer", () => ({
  SandboxedHtmlViewer: (props: { html: string; data?: unknown }) => {
    mocks.viewer(props);
    return null;
  },
}));

import { HtmlPageView } from "./HtmlPageView";

const page = (revision: number) => ({
  id: "p1",
  botId: "b",
  title: "T",
  kind: "html",
  content: `r${revision}`,
  revision,
});
const data = (revision: number) => ({
  kind: "html",
  pageId: "p1",
  revision,
  sources: { A: { status: "ok", rev: revision } },
});

it("gives the frame data only for the page revision it shows", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.sources.mockResolvedValue([]);
  const container = document.createElement("div");
  const root = createRoot(container);
  const show = (changeTick: number) =>
    act(async () => {
      root.render(
        <HtmlPageView
          botId="b"
          pageId="p1"
          title="T"
          changeTick={changeTick}
          dataTick={0}
          refreshTick={0}
        />,
      );
    });
  mocks.get.mockResolvedValue(page(1));
  mocks.data.mockResolvedValue(data(1));
  await show(0);
  expect(mocks.viewer.mock.lastCall?.[0]).toMatchObject({ html: "r1", data: data(1).sources });

  // The page moved to revision 2 but the data fetched is still revision 1: no data, never the old one.
  mocks.viewer.mockClear();
  mocks.get.mockResolvedValue(page(2));
  mocks.data.mockResolvedValue(data(1));
  await show(1);
  expect(
    mocks.viewer.mock.calls.every(([props]) => props.html !== "r2" || props.data === undefined),
  ).toBe(true);
  expect(mocks.viewer.mock.lastCall?.[0]).toMatchObject({ html: "r2", data: undefined });

  // Data for another page is refused too.
  mocks.data.mockResolvedValue({ ...data(2), pageId: "other" });
  await show(2);
  expect(mocks.viewer.mock.lastCall?.[0].data).toBeUndefined();

  mocks.data.mockResolvedValue(data(2));
  await show(3);
  expect(mocks.viewer.mock.lastCall?.[0]).toMatchObject({ html: "r2", data: data(2).sources });
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
