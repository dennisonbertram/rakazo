// @vitest-environment jsdom
import type { FundraiseRound, Safe } from "@rakazo/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { SafeList } from "./SafeList";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
}));

const safe = (id: string, extra: Partial<Safe>): Safe => ({
  id,
  source: "mercury",
  contactId: null,
  roundId: null,
  investorName: `Investor ${id}`,
  investorEmail: null,
  amountCents: 5_000_000,
  valuationType: "post_money_cap",
  capCents: null,
  discountPercent: null,
  mfn: false,
  proRata: false,
  governingState: null,
  investmentDate: null,
  expiresAt: null,
  canceledAt: null,
  sentAt: null,
  signedByOwnerAt: null,
  signedByInvestorAt: null,
  paidAt: "2026-10-12T00:00:00.000Z",
  documentUrl: null,
  status: "funded",
  createdAt: "2026-10-20T00:00:00.000Z",
  ...extra,
});
const round: FundraiseRound = {
  id: "r1",
  name: "Seed",
  targetCents: 200_000_000,
  capCents: 1_000_000_000,
  closedAt: null,
};

it("says Not in the round only on active SAFEs outside it", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div");
  await act(async () => {
    createRoot(el).render(
      <MemoryRouter>
        <SafeList
          round={round}
          safes={[
            safe("out", {}),
            safe("in", { roundId: "r1" }),
            safe("gone", { status: "canceled", canceledAt: "2026-10-13T00:00:00.000Z" }),
          ]}
          onOpen={() => {}}
          onMark={() => {}}
          onCancel={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>,
    );
  });
  const sub = (id: string) =>
    el.querySelector(`[data-safe-id="${id}"] button span:last-child`)?.textContent;
  expect(sub("out")).toContain("Not in Seed");
  expect(sub("in")).not.toContain("Not in");
  expect(sub("gone")).not.toContain("Not in");
});
