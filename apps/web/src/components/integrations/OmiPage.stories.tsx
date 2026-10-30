import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { OmiView } from "./OmiPage";
import { OmiSegments } from "./OmiSegments";
import { mockSegments } from "./omi-fixtures";

const connected = {
  connectionId: "conn_omi",
  pendingUploads: 0,
  recordings: 4,
  agentBotId: "bot_omi",
};

const meta = {
  title: "Integrations/OmiPage",
  component: OmiView,
  parameters: { layout: "fullscreen" },
  args: {
    status: null,
    sync: { kind: "idle" },
    onSync: fn(),
    onDisconnect: fn(),
    onDeleteAll: fn(),
    onOpenVoiceSettings: fn(),
  },
  beforeEach: () => mockRpc({ "omi.segments.list": mockSegments }),
} satisfies Meta<typeof OmiView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const UnsupportedBrowser: Story = { args: { sync: { kind: "unsupported" } } };
export const NotConnected: Story = {};
export const Connecting: Story = { args: { sync: { kind: "connecting" } } };
export const Downloading: Story = {
  args: { status: connected, sync: { kind: "downloading", done: 14, total: 38 } },
  render: (args) => (
    <OmiView {...args}>
      <OmiSegments />
    </OmiView>
  ),
};
export const Synced: Story = {
  args: { status: connected, sync: { kind: "synced", at: Date.now() - 2 * 60_000 } },
  render: (args) => (
    <OmiView {...args}>
      <OmiSegments />
    </OmiView>
  ),
};
export const Reconnect: Story = { args: { status: connected, sync: { kind: "reconnect" } } };
export const Paused: Story = {
  args: { status: connected, sync: { kind: "paused", done: 14, total: 38 } },
};
export const FirmwareTooOld: Story = { args: { status: null, sync: { kind: "old_firmware" } } };
export const CouldNotReach: Story = { args: { status: connected, sync: { kind: "failed" } } };
export const NoTranscriptionKey: Story = {
  args: { status: connected, sync: { kind: "synced", at: Date.now() - 60_000 }, noKey: true },
};
