import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { mockRpc } from "../lib/__mocks__/rpc";
import { MeetingDetailPage } from "./MeetingDetail";
import { detail } from "./meetings-fixtures";

const meta = {
  title: "Pages/MeetingDetail",
  component: MeetingDetailPage,
  args: { meetingId: "m2" },
  parameters: { layout: "fullscreen" },
  beforeEach: () => mockRpc({ "meetings.get": detail }),
} satisfies Meta<typeof MeetingDetailPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Digested: Story = {};

export const TranscriptOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText("Transcript"));
  },
};

/** No digest yet: only what the source stored. */
export const NoDigest: Story = {
  beforeEach: () =>
    mockRpc({
      "meetings.get": { ...detail, summary: "", decisions: [], followUps: [], todos: [] },
    }),
};
