// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));
const shared = vi.hoisted(() => ({ openSharedArtifact: vi.fn() }));
vi.mock("../lib/shared-artifact", () => shared);

import { SharedArtifactPage } from "./SharedArtifact";

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
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});

const render = async () => {
  await act(async () => root.render(<SharedArtifactPage />));
  await act(async () => undefined);
};

it("shows shared HTML in an isolated frame: scripts allowed, no allow-same-origin", async () => {
  window.location.hash = "#tok";
  shared.openSharedArtifact.mockResolvedValue({
    name: "Dash.html",
    mimeType: "text/html",
    contentBase64: btoa("<h1>Hi</h1>"),
  });
  await render();
  expect(shared.openSharedArtifact).toHaveBeenCalledWith("tok");
  const frame = container.querySelector("iframe");
  expect(frame).not.toBeNull();
  const sandbox = frame?.getAttribute("sandbox") ?? "";
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  expect(container.textContent).toContain("Shared from Praci");
});

it("says one sentence when the link is refused or missing", async () => {
  window.location.hash = "#nope";
  shared.openSharedArtifact.mockRejectedValue(new Error("gone"));
  await render();
  expect(container.textContent).toBe("This link is not available.");
  expect(container.querySelector("iframe")).toBeNull();
});

it("treats an address with no token as a dead link without asking the server", async () => {
  window.location.hash = "";
  await render();
  expect(container.textContent).toBe("This link is not available.");
  expect(shared.openSharedArtifact).not.toHaveBeenCalled();
});
