import type { ThreadGoal } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { GoalBlockView, GoalLine, GoalNotice } from "./goal";

const goal: ThreadGoal = {
  id: "goal-1",
  text: "Find three suppliers for ceramic mugs and list their prices in the work list",
  status: "active",
  stopReason: null,
  lastReason: null,
  continuations: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
};

const meta = {
  title: "Shell/Goal",
  component: GoalLine,
  args: { goal, waiting: false, onClear: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GoalLine>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Working: Story = {};
export const Paused: Story = { args: { goal: { ...goal, status: "paused" } } };
export const WaitingOnYou: Story = { args: { waiting: true } };
export const LongText: Story = {
  args: { goal: { ...goal, text: `${goal.text}. ${goal.text}. ${goal.text}.` } },
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole("button", { expanded: false });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  },
};
export const Clear: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Clear goal" }));
    await expect(args.onClear).toHaveBeenCalled();
  },
};

export const BlockMet: Story = {
  render: () => (
    <GoalBlockView
      block={{ kind: "goal", outcome: "met", reason: "Three suppliers found.", text: "Goal met." }}
    />
  ),
};
export const BlockBlocked: Story = {
  render: () => (
    <GoalBlockView
      block={{
        kind: "goal",
        outcome: "blocked",
        reason: "Sign in to the supplier portal, then send a message.",
        text: "Goal blocked.",
      }}
    />
  ),
};
export const BlockStopped: Story = {
  render: () => (
    <GoalBlockView
      block={{ kind: "goal", outcome: "stopped", reason: "After 25 runs.", text: "Goal stopped." }}
    />
  ),
};

export const Notice: Story = {
  render: () => <GoalNotice message="No goal set." onDismiss={fn()} />,
};
