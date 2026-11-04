// @vitest-environment jsdom
import type { Contact, Safe } from "@rakazo/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SafeRows } from "../cap-table/SafeRows";
import { Pipeline } from "./Pipeline";
import { SafeList } from "./SafeList";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let el: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  el = document.createElement("div");
  document.body.append(el);
});
afterEach(() => {
  el.remove();
  vi.unstubAllGlobals();
});

const render = (node: React.ReactNode) =>
  act(async () => createRoot(el).render(<MemoryRouter>{node}</MemoryRouter>));

const prospect = (n: number) =>
  ({ id: `c${n}`, name: `Prospect ${n}`, stage: "meeting", kind: "investor" }) as Contact;
const safe = (n: number) =>
  ({
    id: `s${n}`,
    source: "native",
    contactId: null,
    roundId: null,
    investorName: `Investor ${n}`,
    amountCents: 1_000_000,
    valuationType: "post_money_cap",
    capCents: 100_000_000,
    status: "funded",
    createdAt: "2026-10-20T00:00:00.000Z",
  }) as unknown as Safe;
const five = [1, 2, 3, 4, 5];

it("shows 3 prospects per stage on a phone, expands in place, and keeps a saved one in view", async () => {
  await render(<Pipeline prospects={five.map(prospect)} onEdit={() => {}} onMove={() => {}} />);
  expect(el.querySelectorAll("[data-contact-id]").length).toBe(3);
  const button = [...el.querySelectorAll("button")].find((b) => b.textContent === "See all (5)");
  await act(async () => button?.click());
  expect(el.querySelectorAll("[data-contact-id]").length).toBe(5);
});

it("shows 3 SAFEs on a phone and expands the rest in place", async () => {
  await render(
    <SafeList
      round={null}
      safes={five.map(safe)}
      onOpen={() => {}}
      onMark={() => {}}
      onCancel={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(el.querySelectorAll("[data-safe-id]").length).toBe(3);
  const button = [...el.querySelectorAll("button")].find((b) => b.textContent === "See all (5)");
  await act(async () => button?.click());
  expect(el.querySelectorAll("[data-safe-id]").length).toBe(5);
});

it("links the cap table's SAFE rows to the Fundraising page past 3", async () => {
  await render(<SafeRows safes={five.map(safe)} />);
  expect(el.querySelectorAll("li").length).toBe(3);
  const link = [...el.querySelectorAll("a")].find((a) => a.textContent === "See all (5)");
  expect(link?.getAttribute("href")).toBe("/app/fundraising");
});

it("opens a stage when the just-saved prospect would be hidden", async () => {
  await render(
    <Pipeline prospects={five.map(prospect)} savedId="c5" onEdit={() => {}} onMove={() => {}} />,
  );
  expect(el.querySelectorAll("[data-contact-id]").length).toBe(5);
});
