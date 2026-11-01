import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../lib/__mocks__/rpc";
import { MeetingRecordingSettings } from "./MeetingRecordingSettings";

const meta = {
  title: "Settings/MeetingRecordingSettings",
  component: MeetingRecordingSettings,
  decorators: [
    (Story) => (
      <div className="max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MeetingRecordingSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

const space = (policy: string, canSet = true) => ({
  current: { id: "s1" },
  spaces: [{ id: "s1", meetingRecording: policy, canSetMeetingRecording: canSet }],
});

export const Remind: Story = { beforeEach: () => mockRpc({ "spaces.list": space("remind") }) };
export const Confirm: Story = { beforeEach: () => mockRpc({ "spaces.list": space("confirm") }) };
export const Off: Story = { beforeEach: () => mockRpc({ "spaces.list": space("off") }) };

/** Members see nothing: only owners and admins change the policy. */
export const Member: Story = {
  beforeEach: () => mockRpc({ "spaces.list": space("remind", false) }),
};
