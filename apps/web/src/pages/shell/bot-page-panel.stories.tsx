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
