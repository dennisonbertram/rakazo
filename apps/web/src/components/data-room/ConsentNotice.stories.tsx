import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { ConsentNotice } from "./ConsentNotice";

const meta = {
  title: "DataRoom/ConsentNotice",
  component: ConsentNotice,
  args: { onAllowed: () => undefined },
} satisfies Meta<typeof ConsentNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsConsent: Story = {
  beforeEach: () =>
    mockRpc({
      "dataRoom.consent": {
        key: "k",
        version: "v",
        allowed: false,
        disclosure:
          "The full text of your documents and, for images, the page images are sent to the providers below to read, file and search them.",
        recipients: [{ name: "Acme AI", detail: "Reads and files documents" }],
      },
    }),
};
