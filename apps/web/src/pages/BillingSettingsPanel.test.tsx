// @vitest-environment jsdom

import type { BillingStatus } from "@rakazo/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("../lib/rpc", () => ({ rpc: { billing: { status: api.status, portal: vi.fn() } } }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (s: TemplateStringsArray, ...v: unknown[]) => String.raw(s, ...v),
    i18n: { locale: "en" },
  }),
  Trans: ({ children }: { children: string }) => children,
  Plural: ({ value, other }: { value: number; other: string }) => other.replace("#", String(value)),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: BillingStatus = {
  access: true,
  canManage: true,
  trialAvailable: false,
  trialDays: 14,
  state: "active",
  price: { amount: 2000, currency: "usd", interval: "month", intervalCount: 1 },
  seats: 1,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  hasCustomer: true,
};

async function panelText(status: BillingStatus) {
  api.status.mockResolvedValue(status);
  const { BillingSettingsPanel } = await import("./BillingSettingsPanel");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<BillingSettingsPanel />);
  });
  return container.textContent ?? "";
}

it("shows the total for several seats", async () => {
  const text = await panelText({ ...base, seats: 3 });
  expect(text).toContain("$60");
  expect(text).toContain("3 seats");
});

it("shows the unit price for one seat", async () => {
  const text = await panelText(base);
  expect(text).toContain("$20");
  expect(text).not.toContain("seat");
});
