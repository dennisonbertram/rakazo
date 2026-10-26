import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { mockRpc } from "../lib/__mocks__/rpc";
import { BotTodos } from "./BotTodos";

const day = 86_400_000;

const meta = {
  component: BotTodos,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="w-96">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof BotTodos>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An undated item, one due soon and one overdue (its date is red). */
export const Default: Story = {
  beforeEach: () =>
    mockRpc({
      "scratchpad.waitingOnYou": [
        {
          id: "i1",
          botId: "bot_ada",
          botName: "Ada",
          title: "Sign the sample vendor form",
          waitingOn: "you",
          dueAt: null,
        },
        {
          id: "i2",
          botId: "bot_ben",
          botName: "Ben",
          title: "Review the sample budget",
          waitingOn: "you",
          dueAt: new Date(Date.now() + 2 * day).toISOString(),
        },
        {
          id: "i3",
          botId: "bot_ben",
          botName: "Ben",
          title: "Reply to the sample landlord",
          waitingOn: null,
          dueAt: new Date(Date.now() - 3 * day).toISOString(),
        },
      ],
      "scratchpad.update": {},
    }),
};

/** Nothing waiting: the component renders nothing. */
export const Empty: Story = { beforeEach: () => mockRpc({ "scratchpad.waitingOnYou": [] }) };
