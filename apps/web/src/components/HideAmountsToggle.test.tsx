// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text }));

import { resetHideAmountsMemory, setHideAmounts } from "../lib/hide-amounts-preference";
import { HideAmountsButton, HideAmountsMenuItem, hideMoneyTooltip } from "./HideAmountsToggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  resetHideAmountsMemory();
});

it("describes the current state in the menu row, and its helper wraps inside the menu", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<HideAmountsMenuItem />));
  const row = host.querySelector("[data-testid=hide-amounts-menu-item]") as HTMLElement;
  expect(row.textContent).toContain("Hide money");
  expect(row.textContent).toContain("Hides dollar amounts and what is computed from them");
  // The Button base is nowrap; a long helper would run out of a ~290px menu.
  expect(row.className).toContain("whitespace-normal");

  act(() => setHideAmounts(true));
  expect(row.textContent).toContain("Show money");
  expect(row.textContent).toContain("Dollar amounts and what is computed from them are hidden");
  expect(row.textContent).not.toContain("Hides dollar amounts");
  act(() => root.unmount());
});

it("labels the header button in words, with the same width classes in both states", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<HideAmountsButton />));
  const btn = host.querySelector("[data-testid=hide-amounts-toggle]") as HTMLElement;
  expect(btn.textContent).toBe("Hide money");
  expect(btn.getAttribute("aria-label")).toBe("Hide money");
  expect(btn.getAttribute("aria-pressed")).toBe("false");
  const widthClasses = () => btn.querySelector("span")?.className;
  const off = widthClasses();
  expect(off).toContain("min-w-");
  act(() => setHideAmounts(true));
  expect(btn.textContent).toBe("Money hidden");
  expect(btn.getAttribute("aria-label")).toBe("Show money");
  expect(btn.getAttribute("aria-pressed")).toBe("true");
  expect(widthClasses()).toBe(off);
  act(() => root.unmount());
});

it("states the scope in the tooltip without claiming percentages are hidden", () => {
  for (const hidden of [false, true]) {
    const text = hideMoneyTooltip(hidden);
    expect(text).toContain("dollar amounts");
    expect(text).toContain("Ownership percentages and share counts stay visible.");
    expect(text).not.toMatch(/hides?[^.]*percentages/i);
  }
  expect(hideMoneyTooltip(true).startsWith("Money is hidden. ")).toBe(true);
});
