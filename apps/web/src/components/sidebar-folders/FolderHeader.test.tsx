// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((text, part, i) => `${text}${part}${i < values.length ? values[i] : ""}`, ""),
  }),
}));
vi.mock("../sidebar-glance", () => ({ StatusMark: () => null }));

import { FolderHeader } from "./FolderHeader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps the rename open with an error when another folder has the name", async () => {
  const onRename = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () =>
    createRoot(container).render(
      <FolderHeader
        id="f1"
        name="Untitled folder"
        count={0}
        collapsed={false}
        editing
        takenNames={["Apps"]}
        onToggle={() => undefined}
        onStartRename={() => undefined}
        onRename={onRename}
        onCancelRename={() => undefined}
        onDelete={() => undefined}
      />,
    ),
  );
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Apps");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(onRename).not.toHaveBeenCalled();
  expect(container.querySelector("[role=alert]")?.textContent).toBe(
    "A folder with that name already exists",
  );
});

it("pins the header while its folder is open, not when collapsed", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (collapsed: boolean) =>
    act(async () =>
      root.render(
        <FolderHeader
          id="f1"
          name="Tool Agents"
          count={4}
          collapsed={collapsed}
          editing={false}
          onToggle={() => undefined}
          onStartRename={() => undefined}
          onRename={() => undefined}
          onCancelRename={() => undefined}
          onDelete={() => undefined}
        />,
      ),
    );
  await render(false);
  const header = container.querySelector("[data-sidebar-folder]")!;
  expect(header.classList.contains("sticky")).toBe(true);
  expect(header.classList.contains("bg-sidebar")).toBe(true);
  await render(true);
  expect(header.classList.contains("sticky")).toBe(false);
});

async function openDeleteMenu(count: number, onDelete: () => void) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () =>
    createRoot(container).render(
      <FolderHeader
        id="f1"
        name="Apps"
        count={count}
        collapsed={false}
        editing={false}
        onToggle={() => undefined}
        onStartRename={() => undefined}
        onRename={() => undefined}
        onCancelRename={() => undefined}
        onDelete={onDelete}
      />,
    ),
  );
  const trigger = container.querySelector<HTMLElement>("[data-roster-actions]")!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    trigger.click();
  });
  const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((el) =>
    el.textContent?.includes("Delete folder"),
  )!;
  await act(async () => item.click());
  return container;
}

const dialogButton = (label: string) =>
  [...document.querySelectorAll<HTMLElement>("[role=alertdialog] button")].find(
    (el) => el.textContent === label,
  );

it("asks before deleting a folder that has chats", async () => {
  const onDelete = vi.fn();
  await openDeleteMenu(2, onDelete);
  const dialog = document.querySelector("[role=alertdialog]")!;
  expect(dialog.textContent).toContain("Delete Apps?");
  expect(dialog.textContent).toContain("Its chats stay in the sidebar.");
  expect(onDelete).not.toHaveBeenCalled();
  await act(async () => dialogButton("Delete folder")!.click());
  expect(onDelete).toHaveBeenCalledTimes(1);
});

it("keeps the folder when the delete is cancelled", async () => {
  const onDelete = vi.fn();
  await openDeleteMenu(2, onDelete);
  await act(async () => dialogButton("Cancel")!.click());
  expect(onDelete).not.toHaveBeenCalled();
});

it("deletes an empty folder at once", async () => {
  const onDelete = vi.fn();
  await openDeleteMenu(0, onDelete);
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(document.querySelector("[role=alertdialog]")).toBeNull();
});
