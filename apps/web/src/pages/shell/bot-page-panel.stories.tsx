import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { BotPagePanel } from "./bot-page-panel";

const chart = {
  name: "Weekly sample",
  spec: { marks: [{ type: "line", options: { x: "week", y: "value" } }] },
  data: [
    { week: 1, value: 4 },
    { week: 2, value: 7 },
    { week: 3, value: 5 },
    { week: 4, value: 9 },
  ],
};

const content = `# Weekly notes

Sample intro text.

- First item
- Second item

\`\`\`chart
${JSON.stringify(chart)}
\`\`\`

After the chart.`;

const page = (revision: number, text = content) => ({
  id: "page_cash",
  botId: "bot_demo",
  title: "Cash",
  content: text,
  revision,
  updatedBy: "bot" as const,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const summary = (id: string, title: string) => ({
  id,
  title,
  revision: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const meta = {
  title: "Shell/Bot page panel",
  component: BotPagePanel,
  parameters: {
    layout: "padded",
    docs: { description: { component: "Also shows: ChartView" } },
  },
  args: { botId: "bot_demo", remote: null },
  decorators: [
    (Story) => (
      <div className="w-[384px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BotPagePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithChart: Story = {
  beforeEach: () => mockRpc({ "pages.list": [summary("page_cash", "Cash")], "pages.get": page(1) }),
};

export const TextOnly: Story = {
  beforeEach: () =>
    mockRpc({
      "pages.list": [summary("page_cash", "Cash")],
      "pages.get": page(1, "# Notes\n\nJust a short page."),
    }),
};

export const Empty: Story = {
  beforeEach: () =>
    mockRpc({ "pages.list": [summary("page_cash", "Cash")], "pages.get": page(1, "") }),
};

export const NeverWritten: Story = {
  beforeEach: () => mockRpc({ "pages.list": [], "pages.get": null }),
};

export const LoadError: Story = {
  beforeEach: () =>
    mockRpc({
      "pages.list": [],
      "pages.get": () => {
        throw new Error("Could not load the page.");
      },
    }),
};

export const OnePage: Story = {
  beforeEach: () => mockRpc({ "pages.list": [summary("page_cash", "Cash")], "pages.get": page(1) }),
};

/** The full-width sidebar page: one page, no switcher or new button. */
export const FixedPage: Story = {
  args: { fixedPageId: "page_burn" },
  beforeEach: () =>
    mockRpc({
      "pages.list": [summary("page_cash", "Cash"), summary("page_burn", "Burn")],
      "pages.get": { ...page(1, "# Burn\n\nMonthly burn."), id: "page_burn", title: "Burn" },
    }),
};

export const SeveralPages: Story = {
  beforeEach: () =>
    mockRpc({
      "pages.list": [
        summary("page_cash", "Cash"),
        summary("page_burn", "Burn"),
        summary("page_pipeline", "Pipeline"),
      ],
      "pages.get": (input: unknown) => {
        const { pageId } = input as { pageId?: string };
        return pageId === "page_burn"
          ? { ...page(1, "# Burn\n\nMonthly burn."), id: "page_burn", title: "Burn" }
          : page(1);
      },
    }),
};

/** Opens the title field the way "New page" and the Rename menu item do. */
export const RenameOpen: Story = {
  beforeEach: () =>
    mockRpc({
      "pages.list": [summary("page_cash", "Cash"), summary("page_burn", "Burn")],
      "pages.get": page(1),
    }),
  play: async ({ canvasElement }) => {
    const menu = await within(canvasElement).findByRole("button", { name: "Page options" });
    await userEvent.click(menu);
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Rename" }));
  },
};

const fence = (kind: string, value: unknown) => `\`\`\`${kind}\n${JSON.stringify(value)}\n\`\`\``;
const liveContent = [
  "# Cash",
  fence("metric", { label: "Cash", source: "cash", path: "/cash", format: "usd" }),
  fence("metric", { label: "Burn / mo", source: "cash", path: "/burn", format: "usd" }),
  fence("chart", {
    name: "Cash over time",
    spec: { marks: [{ type: "line", options: { x: "at", y: "value" } }] },
    data: [],
    source: "cash",
    path: "/cash",
    over: "history",
  }),
  fence("table", {
    name: "Largest vendors",
    source: "spend",
    path: "/vendors",
    limit: 50,
    columns: [
      { key: "name", label: "Vendor" },
      { key: "total", label: "Total", format: "usd" },
    ],
  }),
].join("\n\n");

const at = "2026-01-01T09:00:00.000Z";
const history = [
  { at: "Dec 1", value: 410000 },
  { at: "Dec 15", value: 392000 },
  { at: "Jan 1", value: 371000 },
];
const vendors = [
  { name: "Northwind Cloud", total: 18200 },
  { name: "Example Payroll", total: 12400.5 },
  { name: "Sample Legal", total: 3100 },
];
const liveData = (blocks: unknown[]) => ({ pageId: "page_cash", revision: 1, blocks });
const liveBlocks = [
  { status: "ok", fetchedAt: at, text: "$371K" },
  { status: "ok", fetchedAt: at, text: "$86K" },
  { status: "ok", fetchedAt: at, rows: history },
  { status: "ok", fetchedAt: at, rows: vendors },
];
const sources = [
  {
    id: "src_1",
    pageId: "page_cash",
    name: "cash",
    kind: "praci",
    call: { tool: "finance_overview", args: {} },
    schedule: "1h",
    status: "active",
    lastRefreshAt: at,
    lastError: null,
  },
];
const liveMocks = (blocks: unknown[]) => ({
  "pages.list": [summary("page_cash", "Cash")],
  "pages.get": page(1, liveContent),
  "pages.data": liveData(blocks),
  "pages.sources": sources,
  "pages.refresh": liveData(liveBlocks),
});

/** Two numbers, a chart over stored snapshots and a table, all read from saved sources. */
export const LivePage: Story = { beforeEach: () => mockRpc(liveMocks(liveBlocks)) };

/** The first number's source failed: it keeps its last value and shows a warning dot. */
export const LivePageSourceFailed: Story = {
  beforeEach: () =>
    mockRpc(
      liveMocks([
        { ...liveBlocks[0], status: "failed", error: "Request timed out" },
        ...liveBlocks.slice(1),
      ]),
    ),
};

/** Blocks wait for the owner's approval of their source. */
export const LivePagePending: Story = {
  beforeEach: () =>
    mockRpc(
      liveMocks([
        { status: "pending", fetchedAt: null },
        { status: "pending", fetchedAt: null },
        { status: "pending", fetchedAt: null },
        { status: "pending", fetchedAt: null },
      ]),
    ),
};

/** The Refresh item reruns the sources and shows the returned data. */
export const LivePageRefresh: Story = {
  beforeEach: () => mockRpc(liveMocks(liveBlocks)),
  play: async ({ canvasElement }) => {
    const menu = await within(canvasElement).findByRole("button", { name: "Page options" });
    await userEvent.click(menu);
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Refresh" }));
  },
};

/** The Sources item opens the list of the page's sources. */
export const LivePageSources: Story = {
  beforeEach: () => mockRpc(liveMocks(liveBlocks)),
  play: async ({ canvasElement }) => {
    const menu = await within(canvasElement).findByRole("button", { name: "Page options" });
    await userEvent.click(menu);
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "Sources" }));
  },
};
