// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mirrors ContactDialog: no <DialogTrigger>, the dialog is mounted open while a state is set.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <input id="inside" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

async function closeVia(how: "escape" | "close") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  const opener = host.querySelector<HTMLButtonElement>("#opener");
  if (!opener) throw new Error("no opener");
  opener.focus();
  await act(async () => opener.click());
  await act(async () => new Promise((r) => setTimeout(r, 50)));
  expect(document.activeElement?.id).toBe("inside");
  await act(async () => {
    if (how === "escape") {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    } else {
      document.querySelector<HTMLButtonElement>("[data-slot=dialog-close]")?.click();
    }
  });
  await act(async () => new Promise((r) => setTimeout(r, 50)));
  const active = document.activeElement;
  await act(async () => root.unmount());
  host.remove();
  return active;
}

it("returns focus to the opener after Escape on a dialog mounted open without a trigger", async () => {
  expect((await closeVia("escape"))?.id).toBe("opener");
});

it("returns focus to the opener after the Close button", async () => {
  expect((await closeVia("close"))?.id).toBe("opener");
});
