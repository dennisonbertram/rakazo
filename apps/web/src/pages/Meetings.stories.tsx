import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { mockRpc } from "../lib/__mocks__/rpc";
import { MeetingsPage } from "./Meetings";
import { meetings } from "./meetings-fixtures";

const meta = {
  title: "Pages/Meetings",
  component: MeetingsPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MeetingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  beforeEach: () => mockRpc({ "meetings.list": { items: meetings, nextCursor: null } }),
};

export const Phone: Story = {
  beforeEach: () => mockRpc({ "meetings.list": { items: meetings, nextCursor: null } }),
  globals: { viewport: { value: "mobile1" } },
};

export const Empty: Story = {
  beforeEach: () => mockRpc({ "meetings.list": { items: [], nextCursor: null } }),
};

export const Searched: Story = {
  beforeEach: () => mockRpc({ "meetings.list": { items: meetings, nextCursor: null } }),
  play: async ({ canvasElement }) => {
    await userEvent.type(await within(canvasElement).findByRole("searchbox"), "sync");
  },
};

export const NoMatches: Story = {
  beforeEach: () => mockRpc({ "meetings.list": { items: meetings, nextCursor: null } }),
  play: async ({ canvasElement }) => {
    await userEvent.type(await within(canvasElement).findByRole("searchbox"), "zzz");
  },
};
