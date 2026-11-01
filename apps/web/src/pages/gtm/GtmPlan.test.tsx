// @vitest-environment jsdom
import type { ScratchpadItem } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));
const update = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../../lib/rpc", () => ({ rpc: { scratchpad: { update } } }));

import { toDatetimeLocalValue } from "../../lib/datetime-local";
import { item, overview } from "./fixtures";
import { GtmItem } from "./GtmPlan";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const iso = "2026-11-03T15:31:42.338Z";

async function mount(post: ScratchpadItem) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<GtmItem item={post} overview={overview} onChange={() => {}} />),
  );
  return {
    container,
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
const click = (el: Element) => act(async () => (el as HTMLElement).click());
const button = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLElement;
const timeInput = (c: HTMLElement) =>
  c.querySelector<HTMLInputElement>('input[id^="gtm-scheduled-for-"]') as HTMLInputElement;

it("edits the time with a datetime-local field and sends it only when changed", async () => {
  update.mockClear();
  const { container, done } = await mount({ ...item, scheduledFor: iso });
  await click(button(container, "Edit"));
  const input = timeInput(container);
  expect(input.type).toBe("datetime-local");
  expect(input.value).toBe(toDatetimeLocalValue(new Date(iso)));
  expect(container.textContent).toContain("Scheduled time");
  expect(container.textContent).not.toContain("ISO");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      "2026-11-04T09:00",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")?.requestSubmit());
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ scheduledFor: new Date("2026-11-04T09:00").toISOString() }),
  );
  await done();
});

it("leaves the stored time alone when Save is pressed without changing it", async () => {
  update.mockClear();
  const { container, done } = await mount({ ...item, scheduledFor: iso });
  await click(button(container, "Edit"));
  await act(async () => container.querySelector("form")?.requestSubmit());
  expect(update).toHaveBeenCalledTimes(1);
  expect((update.mock.calls[0] as unknown[])[0]).not.toHaveProperty("scheduledFor");
  await done();
});

it("shows a queued post without the raw Zernio id", async () => {
  const { container, done } = await mount({
    ...item,
    status: "open",
    approvedAt: iso,
    approvedBy: "user",
    proof: "zernio:post_mock_1",
  });
  expect(container.textContent).toContain("Queued in Zernio");
  expect(container.textContent).not.toContain("post_mock_1");
  await done();
});
