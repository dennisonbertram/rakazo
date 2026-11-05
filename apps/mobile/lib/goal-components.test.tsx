// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalCard } from "../components/goal-card";
import { GoalLine } from "../components/goal-line";

vi.mock("react-native", () => {
  const Surface = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return { View: Surface, Text: Surface };
});
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    accessibilityLabel,
    onPress,
  }: {
    accessibilityLabel: string;
    onPress: () => void;
  }) =>
    createElement("button", { type: "button", "aria-label": accessibilityLabel, onClick: onPress }),
}));
vi.mock("./appearance", () => ({
  mobileTokens: () => ({ foreground: "f", mutedForeground: "m", border: "b", card: "c" }),
}));
vi.mock("./i18n", () => ({ t: (text: string) => text }));

describe("goal components", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("shows the goal text, no status while working, and clears on tap", () => {
    const onClear = vi.fn();
    act(() =>
      root.render(<GoalLine goal={{ text: "Find suppliers", status: null }} onClear={onClear} />),
    );
    expect(container.textContent).toBe("Find suppliers");
    act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Clear goal"]')!.click(),
    );
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("adds the status word when the goal is not working", () => {
    act(() =>
      root.render(
        <GoalLine goal={{ text: "Find suppliers", status: "Waiting on you" }} onClear={vi.fn()} />,
      ),
    );
    expect(container.textContent).toBe("Find suppliersWaiting on you");
  });

  it.each([
    ["met", "Goal met"],
    ["blocked", "Goal blocked"],
    ["stopped", "Goal stopped"],
  ] as const)("renders a %s outcome with its reason", (outcome, title) => {
    act(() =>
      root.render(
        <GoalCard
          block={{
            kind: "goal",
            outcome,
            reason: "After 25 runs.",
            text: `${title}. After 25 runs.`,
          }}
        />,
      ),
    );
    expect(container.textContent).toBe(`${title}After 25 runs.`);
  });
});
