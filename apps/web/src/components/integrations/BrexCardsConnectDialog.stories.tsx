import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent } from "storybook/test";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { withPageBehind } from "../../stories/decorators";
import { BrexCardsConnectDialog } from "./BrexCardsConnectDialog";

const meta = {
  title: "Integrations/BrexCardsConnectDialog",
  component: BrexCardsConnectDialog,
  args: { onClose: () => undefined },
  decorators: [withPageBehind()],
} satisfies Meta<typeof BrexCardsConnectDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The owner swaps the token of an existing connection. */
export const Replace: Story = { args: { mode: "replace" } };

/** Brex refuses the token; the dialog keeps the message inline and nothing changes. */
export const TokenRefused: Story = {
  beforeEach: () =>
    mockRpc({
      "brexCards.connect": () => {
        throw new Error("Brex rejected this token");
      },
    }),
  play: async () => {
    await userEvent.type(await screen.findByLabelText("API token"), "tok_demo");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  },
};
