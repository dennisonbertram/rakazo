// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ActionItems } from "./ActionItems";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("collapses to a count on a phone until the toggle is pressed", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  await act(async () =>
    createRoot(el).render(
      <ActionItems
        drafts={[
          {
            id: "u1",
            subject: "Example update",
            createdAt: "2026-10-01T09:00:00.000Z",
          } as never,
        ]}
        onOpen={() => {}}
      />,
    ),
  );
  const list = el.querySelector("ul") as HTMLElement;
  const toggle = el.querySelector("button[aria-expanded]") as HTMLElement;
  expect(list.className).toContain("max-sm:hidden");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await act(async () => toggle.click());
  expect(list.className).not.toContain("max-sm:hidden");
});
