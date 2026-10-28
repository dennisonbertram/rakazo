import type { McpPendingAction } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { McpActionCard } from "./McpActionCard";

export const contactAction: McpPendingAction = {
  id: "a1",
  tool: "contacts_add",
  args: { name: "Wendy Whitfield", email: "wendy@example.com", kind: "investor" },
  connectionLabel: "Claude",
  createdAt: "2026-10-27T09:30:00.000Z",
};

const meta = {
  title: "Settings/Connection approval card",
  component: McpActionCard,
  args: { action: contactAction, busy: false, onDecide: fn() },
  decorators: [
    (Story) => (
      <div className="w-[480px] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof McpActionCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Waiting: Story = {};

export const Busy: Story = { args: { busy: true } };

export const LongText: Story = {
  args: {
    action: {
      ...contactAction,
      tool: "scratchpad_add",
      args: {
        botId: "bot-1",
        title: "Follow up with the auditors about the revised engagement letter and fee schedule",
        notes: "A long note ".repeat(30),
        dueAt: "2026-11-02",
      },
    },
  },
};

export const NoDetails: Story = { args: { action: { ...contactAction, args: {} } } };
