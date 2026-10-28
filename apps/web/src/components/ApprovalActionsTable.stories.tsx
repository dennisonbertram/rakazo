import type { ApprovalTableRow } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { mockRpc } from "../lib/__mocks__/rpc";
import { ApprovalActionsTable } from "./ApprovalActionsTable";

const defaults: Array<[ApprovalTableRow["actionType"], ApprovalTableRow["effect"], boolean]> = [
  ["send_email", "ask", true],
  ["spend_money", "ask", true],
  ["connected_apps_write", "allow", true],
  ["calendar_changes", "allow", true],
  ["files_and_commands", "allow", true],
  ["use_computer", "allow", false],
  ["delete_data", "allow", false],
  ["message_outside", "allow", false],
  ["use_credentials", "allow", false],
];
const rows = (
  override: Partial<Record<ApprovalTableRow["actionType"], "allow" | "ask" | "block">> = {},
) =>
  defaults.map(([actionType, spaceEffect, primary]) => ({
    actionType,
    primary,
    spaceEffect,
    botEffect: override[actionType] ?? null,
    effect: override[actionType] ?? spaceEffect,
  }));

const meta = {
  title: "Settings/ApprovalActionsTable",
  component: ApprovalActionsTable,
  decorators: [
    (Story) => (
      <div className="w-[480px] max-w-full px-5 sm:px-0">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApprovalActionsTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  beforeEach: () => mockRpc({ "approvalRules.table": { rows: rows() } }),
};

export const MoreActionsOpen: Story = {
  beforeEach: () => mockRpc({ "approvalRules.table": { rows: rows({ send_email: "block" }) } }),
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText("More actions"));
  },
};

export const BotWithOverride: Story = {
  args: { botId: "bot_1" },
  beforeEach: () =>
    mockRpc({
      "approvalRules.table": { rows: rows({ send_email: "block", spend_money: "allow" }) },
    }),
};

export const Saving: Story = {
  beforeEach: () =>
    mockRpc({
      "approvalRules.table": { rows: rows() },
      "approvalRules.setActionType": () => new Promise(() => undefined),
    }),
  play: async ({ canvasElement }) => {
    const select = await within(canvasElement).findByLabelText("Send email");
    await userEvent.selectOptions(select, "block");
  },
};

export const Loading: Story = {
  beforeEach: () => mockRpc({ "approvalRules.table": () => new Promise(() => undefined) }),
};

export const SaveError: Story = {
  beforeEach: () =>
    mockRpc({
      "approvalRules.table": { rows: rows() },
      "approvalRules.setActionType": () => {
        throw new Error("The server did not answer.");
      },
    }),
  play: async ({ canvasElement }) => {
    const select = await within(canvasElement).findByLabelText("Send email");
    await userEvent.selectOptions(select, "allow");
  },
};
