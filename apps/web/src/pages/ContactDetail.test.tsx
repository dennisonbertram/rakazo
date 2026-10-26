// @vitest-environment jsdom

import type { Contact, ContactDetail } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
const detail = vi.hoisted(() => vi.fn());
vi.mock("../lib/rpc", () => ({ rpc: { contacts: { detail } } }));

import { ContactDetailPage } from "./ContactDetail";

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
const show = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/app/contacts/c1?q=ada"]}>
        <ContactDetailPage id="c1" />
      </MemoryRouter>,
    ),
  );
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
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
