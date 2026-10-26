import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../lib/__mocks__/rpc";
import { ContactDetailPage } from "./ContactDetail";

const contact = {
  id: "c1",
  name: "Ada Example",
  email: "ada@example.test",
  organization: "Acme Corp",
  kind: "investor" as const,
  notes: "Met at a demo day.",
  stage: "diligence" as const,
  checkSizeCents: 25_000_000,
  nextStep: "Send the data room link",
  addedBy: null,
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
};

const meta = {
  title: "Pages/ContactDetail",
  component: ContactDetailPage,
  args: { id: "c1" },
} satisfies Meta<typeof ContactDetailPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  beforeEach: () =>
    mockRpc({
      "contacts.detail": {
        contact,
        mail: [
          {
            id: "m1",
            subject: "Intro to Example Co",
            from: "Ada Example",
            snippet: "Thanks for the deck, a few questions.",
            receivedAt: "2026-10-20T10:00:00.000Z",
          },
        ],
        meetings: [{ id: "g1", title: "Partner meeting", startedAt: "2026-10-18T15:00:00.000Z" }],
        documents: [{ id: "d1", name: "Pitch deck.pdf" }],
        safes: [{ id: "s1", amountCents: 25_000_000, status: "signed" }],
      },
    }),
};

export const DetailsOnly: Story = {
  beforeEach: () =>
    mockRpc({
      "contacts.detail": { contact, mail: [], meetings: [], documents: [], safes: [] },
    }),
};
