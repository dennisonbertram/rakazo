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

/** A chunk failed, so part of the recording is missing. */
export const Partial: Story = {
  beforeEach: () => mockRpc({ "meetings.get": { ...detail, provider: "praci", partial: true } }),
};

/** Just stored: the transcript is there, the summary is on its way. */
export const Summarizing: Story = {
  beforeEach: () =>
    mockRpc({
      "meetings.get": {
        ...detail,
        provider: "praci",
        endedAt: new Date().toISOString(),
        summary: "",
        decisions: [],
        followUps: [],
        todos: [],
      },
    }),
};
