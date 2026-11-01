import type { ActionApprovalRule } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../lib/__mocks__/rpc";
import { ApprovalRulesSettings } from "./ApprovalRulesSettings";

const rules: ActionApprovalRule[] = [
  {
    id: "rule_1",
    effect: "require_approval",
    matchKind: "category",
    matchValue: "email",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rule_2",
    effect: "always_allow",
    matchKind: "connector",
    matchValue: "Sample connector",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rule_3",
    effect: "require_approval",
    matchKind: "tool",
    matchValue: "mcp__brex__lock_card",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rule_4",
    effect: "always_allow",
    matchKind: "category",
    matchValue: "calendar",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const tableRows = [
  "send_email",
  "spend_money",
  "connected_apps_write",
  "calendar_changes",
  "files_and_commands",
  "use_computer",
  "delete_data",
  "message_outside",
  "use_credentials",
].map((actionType, index) => ({
  actionType,
  primary: index < 5,
  effect: actionType === "send_email" || actionType === "spend_money" ? "ask" : "allow",
  spaceEffect: actionType === "send_email" || actionType === "spend_money" ? "ask" : "allow",
  botEffect: null,
}));

const meta = {
  title: "Settings/ApprovalRulesSettings",
  component: ApprovalRulesSettings,
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApprovalRulesSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithRules: Story = {
  beforeEach: () =>
    mockRpc({
      "approvalRules.table": { rows: tableRows },
      "approvalRules.list": rules,
      "approvalRules.set": (input: unknown) => ({
        id: "rule_new",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...(input as object),
      }),
      "approvalRules.remove": {},
    }),
};

export const NoRules: Story = {
  beforeEach: () =>
    mockRpc({
      "approvalRules.table": { rows: tableRows },
      "approvalRules.list": [],
    }),
};

export const Loading: Story = {
  beforeEach: () => mockRpc({ "approvalRules.list": () => new Promise(() => undefined) }),
};

export const LoadError: Story = {
  beforeEach: () =>
    mockRpc({
      "approvalRules.list": () => {
        throw new Error("The server did not answer.");
      },
    }),
};
