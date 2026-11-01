// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: String.raw }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { McpActionCard } from "./McpActionCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("says how far Always allow reaches", () => {
  const container = document.createElement("div");
  document.body.append(container);
  act(() =>
    createRoot(container).render(
      <McpActionCard
        action={
          {
            id: "a1",
            connectionLabel: "Claude",
            tool: "send_note",
            args: {},
          } as never
        }
        busy={false}
        onDecide={() => undefined}
      />,
    ),
  );
  expect(container.textContent).toContain("Always allow this");
  expect(container.textContent).toContain("Won't ask again anywhere in this space.");
});
