// @vitest-environment jsdom

import type { Contact, ContactDetail } from "@rakazo/contracts";
import { NotificationToaster, notificationToastManager } from "@rakazo/ui-web";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: text, i18n: { locale: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/inbox/InboxMessageDialog", () => ({
  InboxMessageDialog: ({ messageId }: { messageId: string | null }) =>
    messageId ? <div data-testid="message">{messageId}</div> : null,
}));
const rpcMock = vi.hoisted(() => ({
  detail: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  linked: vi.fn(async () => ({ portal: false, documents: [] })),
}));
const detail = rpcMock.detail;
vi.mock("../lib/rpc", () => ({
  rpc: {
    contacts: {
      detail: rpcMock.detail,
      list: rpcMock.list,
      save: rpcMock.save,
      delete: rpcMock.remove,
      linked: rpcMock.linked,
    },
  },
}));

import { ContactDetailPage } from "./ContactDetail";
import { ContactsPage } from "./Contacts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contact: Contact = {
  id: "c1",
  name: "Ada Example",
  email: "ada@example.test",
  organization: "Acme Corp",
  kind: "investor",
  notes: null,
  addedBy: null,
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
};
const empty: ContactDetail = { contact, mail: [], meetings: [], documents: [], safes: [] };

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const Detail = () => <ContactDetailPage id={useParams().id ?? ""} />;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === label);
const click = (el: Element | undefined) =>
  act(async () => (el as HTMLElement | undefined)?.click());
const flush = () => act(async () => {});
const typeInto = (input: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const show = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/app/contacts/c1?q=ada"]}>
        <Routes>
          <Route path="/app/contacts" element={<ContactsPage />} />
          <Route path="/app/contacts/:id" element={<Detail />} />
        </Routes>
        <NotificationToaster onOpen={() => {}} />
      </MemoryRouter>,
    ),
  );
};

beforeEach(() => {
  rpcMock.list.mockResolvedValue([]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => notificationToastManager.close());
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

it("shows the details and hides every empty section", async () => {
  detail.mockResolvedValue(empty);
  await show();
  expect(container.textContent).toContain("Ada Example");
  expect(container.textContent).toContain("ada@example.test");
  expect(container.textContent).toContain("Acme Corp");
  for (const heading of ["Emails", "Meetings", "Documents", "SAFEs"])
    expect(container.textContent).not.toContain(heading);
});

it("shows the sections that have rows, and opens a mail", async () => {
  detail.mockResolvedValue({
    ...empty,
    mail: [
      {
        id: "m1",
        subject: "Intro",
        from: "Ada",
        snippet: "Hello",
        receivedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    meetings: [{ id: "g1", title: "Kickoff", startedAt: "2026-10-21T00:00:00.000Z" }],
    documents: [{ id: "d1", name: "terms.pdf" }],
    safes: [{ id: "s1", amountCents: 5_000_000, status: "signed" }],
  });
  await show();
  for (const word of ["Emails", "Intro", "Meetings", "Kickoff", "terms.pdf", "$50,000", "Signed"])
    expect(container.textContent).toContain(word);
  await act(async () => (container.querySelector("section button") as HTMLElement).click());
  expect(document.querySelector("[data-testid=message]")?.textContent).toBe("m1");
});

it("shows an error with Try again", async () => {
  detail.mockRejectedValue(new Error("Contact not found"));
  await show();
  expect(container.querySelector("[role=alert]")?.textContent).toContain("Contact not found");
});

const cy: Contact = { ...contact, id: "c2", name: "Cy", email: "cy@example.test" };
const edit = async () => click(button("Edit"));

it("deletes with an Undo that restores, then focuses the restored row on the list", async () => {
  detail.mockResolvedValue({ ...empty, contact: { ...contact, kind: "other" } });
  rpcMock.remove.mockResolvedValue({ ok: true });
  rpcMock.save.mockResolvedValue({ ...contact, id: "c9" });
  await show();
  await edit();
  await click(button("Delete"));
  expect(document.body.textContent).toContain("Deleted Ada Example");
  // Back on the list.
  expect(container.textContent).toContain("Contacts");
  rpcMock.list.mockResolvedValue([{ ...contact, id: "c9" }]);
  await click(button("Undo"));
  await flush();
  expect(rpcMock.save).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Ada Example", kind: "other" }),
  );
  expect(document.body.textContent).toContain("Restored Ada Example");
  expect(document.activeElement?.textContent).toBe("Ada Example");
  expect(document.activeElement?.closest("tr")?.getAttribute("data-contact-id")).toBe("c9");
});

it("sends null when Notes is cleared, and names the agent that added the contact", async () => {
  const ada = { ...contact, notes: "Old note", addedBy: { id: "b1", name: "Chief" } };
  detail.mockResolvedValue({ ...empty, contact: ada });
  rpcMock.save.mockResolvedValue(ada);
  await show();
  expect(container.textContent).toContain("Chief");
  await edit();
  await typeInto(document.getElementById("contact-notes") as HTMLTextAreaElement, "");
  await click(button("Save"));
  expect(rpcMock.save).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", notes: null }));
});

it("offers the other contact on a duplicate email, and clears the error when the email changes", async () => {
  detail.mockResolvedValue(empty);
  rpcMock.list.mockResolvedValue([contact, cy]);
  rpcMock.save.mockRejectedValue(new Error("Another contact already has this email."));
  await show();
  await edit();
  await typeInto(document.getElementById("contact-email") as HTMLInputElement, "cy@example.test");
  await click(button("Save"));
  expect(document.body.textContent).toContain("Another contact already has this email.");
  expect(button("Open Cy")).toBeDefined();
  await typeInto(document.getElementById("contact-email") as HTMLInputElement, "cy2@example.test");
  expect(document.body.textContent).not.toContain("Another contact already has this email.");
});

it("marks the Email invalid and focuses it when another contact has it", async () => {
  detail.mockResolvedValue(empty);
  rpcMock.list.mockResolvedValue([contact, cy]);
  rpcMock.save.mockRejectedValue(new Error("Another contact already has this email."));
  await show();
  await edit();
  const email = document.getElementById("contact-email") as HTMLInputElement;
  await typeInto(email, "cy@example.test");
  await click(button("Save"));
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(email.getAttribute("aria-describedby") ?? "")?.textContent,
  ).toContain("Another contact already has this email.");
  expect(document.activeElement).toBe(email);
});
