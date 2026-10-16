import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../lib/__mocks__/rpc";
import { folders, items } from "../stories/fixtures/data-room";
import { DataRoomPage } from "./DataRoom";

const load = (list: typeof items) =>
  mockRpc({
    "dataRoom.folders": folders,
    "dataRoom.items.list": { items: list, nextCursor: null },
    "dataRoom.item": (input: unknown) =>
      items.find((item) => item.id === (input as { id: string }).id) ?? items[0],
  });

const meta = {
  title: "DataRoom/DataRoomPage",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-[640px]">
        <Story />
      </div>
    ),
  ],
  render: () => <DataRoomPage />,
} satisfies Meta;
export default meta;
type Story = StoryObj;

export const WithItems: Story = { beforeEach: () => load(items) };
export const Empty: Story = { beforeEach: () => load([]) };
export const NeedsConsent: Story = {
  beforeEach: () => {
    load(items);
    mockRpc({
      "dataRoom.consent": {
        key: "k",
        version: "v",
        allowed: false,
        disclosure:
          "The full text of your documents and, for images, the page images are sent to the providers below to read, file and search them.",
        recipients: [{ name: "Acme AI", detail: "Reads and files documents" }],
      },
      "dataRoom.consentGrant": null,
    });
  },
};
