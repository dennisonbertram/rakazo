import type { RakazoDesktop, RakazoDesktopScanner, ScannerState } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { mockRpc } from "../lib/__mocks__/rpc";
import { items } from "../stories/fixtures/data-room";
import { ScannerPage } from "./Scanner";

function load(kind?: ScannerState["kind"], empty = false) {
  const previous = window.rakazoDesktop;
  const listeners = new Set<(state: ScannerState) => void>();
  let state: ScannerState = {
    kind: kind ?? "ready",
    autoScan: true,
    folder: ["Scans"],
    ...(kind === "error"
      ? { error: "Paper jam. Clear the feeder and retry the whole batch." }
      : {}),
  };
  const update = (patch: Partial<ScannerState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const scanner: RakazoDesktopScanner = {
    state: async () => state,
    onState: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scan: async () => update({ kind: "scanning" }),
    cancel: async () => update({ kind: "ready" }),
    setAutoScan: async (autoScan) => update({ autoScan }),
    setFolder: async (folder) => update({ folder }),
    setScope: async () => undefined,
    pending: async () => [],
    confirm: async () => ({ ok: true }),
    onDocument: () => () => undefined,
  };
  window.rakazoDesktop = kind ? ({ platform: "linux", scanner } as RakazoDesktop) : undefined;
  mockRpc({
    "dataRoom.folders": [
      { id: "scans", name: "Scans", parentId: null, createdAt: "2026-01-01T00:00:00Z" },
    ],
    "dataRoom.imports": [],
    "dataRoom.processing": { reading: 0, indexing: 0, tagging: 0, failed: 0, current: null },
    "dataRoom.facetValues": { types: ["Contract"], parties: [], sources: ["scan"], hasDates: true },
    "dataRoom.items.list": {
      items: empty
        ? []
        : items.slice(0, 2).map((item) => ({ ...item, source: "scan", folderId: "scans" })),
      nextCursor: null,
    },
  });
  return () => {
    window.rakazoDesktop = previous;
  };
}

const meta = {
  title: "Pages/Scanner",
  component: ScannerPage,
  parameters: { layout: "fullscreen", initialEntries: ["/app/scanner"] },
  decorators: [
    (Story) => (
      <div className="flex h-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScannerPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { beforeEach: () => load("ready") };
export const Empty: Story = { beforeEach: () => load("ready", true) };
export const Scanning: Story = { beforeEach: () => load("scanning") };
export const PaperJam: Story = { beforeEach: () => load("error") };
export const MissingSane: Story = { beforeEach: () => load("sane-missing") };
export const NoDevice: Story = { beforeEach: () => load("not-found") };
export const Busy: Story = { beforeEach: () => load("busy") };
export const Browser: Story = {
  beforeEach: () => load(),
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole("button", { name: "Scan" })).not.toBeInTheDocument();
  },
};
export const Phone: Story = {
  beforeEach: () => load(),
  globals: { viewport: { value: "mobile1" } },
};
export const ScanAndCancel: Story = {
  beforeEach: () => load("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Scan" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Cancel scan" }));
    await expect(canvas.findByRole("button", { name: "Scan" })).resolves.toBeEnabled();
  },
};
