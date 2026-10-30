import type { PageSource } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { withPageBehind } from "../../stories/decorators";
import { PageSourcesDialog } from "./PageSourcesDialog";

const source = (overrides: Partial<PageSource>): PageSource => ({
  id: "src_1",
  pageId: "page_cash",
  name: "Cash",
  kind: "praci",
  call: { tool: "finance_overview", args: {} },
  schedule: "1h",
  status: "active",
  lastRefreshAt: "2026-01-01T09:00:00.000Z",
  lastError: null,
  ...overrides,
});

const meta = {
  title: "Pages/Sources dialog",
  component: PageSourcesDialog,
  decorators: [withPageBehind("Page")],
  args: {
    botId: "bot_demo",
    pageId: "page_cash",
    open: true,
    onOpenChange: () => {},
    onChanged: () => {},
  },
} satisfies Meta<typeof PageSourcesDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Sources: Story = {
  beforeEach: () =>
    mockRpc({
      "pages.sources": [
        source({}),
        source({
          id: "src_2",
          name: "Vendors",
          call: { tool: "finance_transactions", args: {} },
          schedule: "1d",
          lastError: "Request timed out",
        }),
        source({ id: "src_3", name: "Revenue", status: "pending", lastRefreshAt: null }),
        source({ id: "src_4", name: "Pipeline", status: "paused", schedule: "1w" }),
      ],
    }),
};
export const NoSources: Story = { beforeEach: () => mockRpc({ "pages.sources": [] }) };
