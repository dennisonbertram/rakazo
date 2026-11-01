import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecordingPill } from "./RecordingPill";

const meta = {
  title: "Meetings/RecordingPill",
  component: RecordingPill,
  args: { onStop: () => undefined },
  decorators: [
    (Story) => (
      <div className="flex justify-center p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecordingPill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Recording: Story = {
  args: { state: { kind: "recording", title: "Pricing review with Dana", elapsedMs: 754_000 } },
};

export const NoCallAudio: Story = {
  args: {
    state: {
      kind: "recording",
      title: "Pricing review with Dana",
      elapsedMs: 754_000,
      noCallAudio: true,
    },
  },
};

export const Offline: Story = {
  args: {
    state: {
      kind: "recording",
      title: "Pricing review with Dana",
      elapsedMs: 754_000,
      offline: true,
    },
  },
};

export const Transcribing: Story = { args: { state: { kind: "transcribing" } } };

export const LongRecording: Story = {
  args: {
    state: {
      kind: "recording",
      title: "Quarterly planning with the whole leadership team and the board",
      elapsedMs: 3_725_000,
    },
  },
  globals: { viewport: { value: "mobile1" } },
};
