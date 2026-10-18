// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useRovingTabindex } from "./useRovingTabindex";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function List({ extra, initial }: { extra?: boolean; initial?: "first" | "last" }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useRovingTabindex(el, initial);
  return (
    <div ref={setEl}>
      {["a", "b", "c", ...(extra ? ["d"] : [])].map((id) => (
        <div key={id} id={`row-${id}`}>
          <button type="button" id={id} data-roving>
            {id}
          </button>
          <button type="button" id={`${id}-actions`} data-roving-action tabIndex={-1}>
            actions
          </button>
          <button type="button" id={`${id}-more`} data-roving-action tabIndex={-1}>
            more
          </button>
        </div>
      ))}
    </div>
  );
}

async function setup(extra = false, initial?: "first" | "last") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<List extra={extra} initial={initial} />));
  const rerender = (next: boolean) => act(async () => root.render(<List extra={next} />));
  return { host, rerender, done: () => act(async () => root.unmount()) };
}
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
const tabbable = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>("button")].filter((b) => b.tabIndex >= 0).map((b) => b.id);
const focus = (id: string) => act(async () => document.getElementById(id)?.focus());

it("leaves exactly one item tabbable and moves with the arrow keys, Home and End", async () => {
  const { host, done } = await setup();
  expect(tabbable(host)).toEqual(["a"]);
  await focus("a");
  await press("ArrowDown");
  expect(document.activeElement?.id).toBe("b");
  expect(tabbable(host)).toEqual(["b"]);
  await press("End");
  expect(document.activeElement?.id).toBe("c");
  await press("ArrowDown");
  expect(document.activeElement?.id).toBe("c");
  await press("Home");
  expect(document.activeElement?.id).toBe("a");
  await press("ArrowUp");
  expect(document.activeElement?.id).toBe("a");
  await done();
});

it("ArrowRight reaches the item's action; ArrowLeft and Escape return", async () => {
  const { host, done } = await setup();
  await focus("b");
  await press("ArrowRight");
  expect(document.activeElement?.id).toBe("b-actions");
  expect(tabbable(host)).toEqual(["b"]);
  await press("ArrowRight");
  expect(document.activeElement?.id).toBe("b-more");
  await press("ArrowRight");
  expect(document.activeElement?.id).toBe("b-more");
  await press("ArrowLeft");
  expect(document.activeElement?.id).toBe("b-actions");
  await press("ArrowLeft");
  expect(document.activeElement?.id).toBe("b");
  await press("ArrowRight");
  await press("Escape");
  expect(document.activeElement?.id).toBe("b");
  await done();
});

it("does not take Alt+Arrow, which reorders rows", async () => {
  const { done } = await setup();
  await focus("a");
  await press("ArrowDown", { altKey: true });
  expect(document.activeElement?.id).toBe("a");
  await done();
});

it("follows focus from a click and picks up an item that mounts later", async () => {
  const { host, rerender, done } = await setup();
  await focus("c");
  expect(tabbable(host)).toEqual(["c"]);
  await rerender(true);
  expect(tabbable(host)).toEqual(["c"]);
  await focus("c");
  await press("ArrowDown");
  expect(document.activeElement?.id).toBe("d");
  expect(tabbable(host)).toEqual(["d"]);
  await done();
});

it("starts on the last item when asked to", async () => {
  const { host, done } = await setup(false, "last");
  expect(tabbable(host)).toEqual(["c"]);
  await done();
});
