import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { BrexPage } from "./BrexPage";
import { overviewFixture } from "./fixtures";

const meta = {
  title: "Brex/Page",
  component: BrexPage,
  parameters: { initialEntries: ["/app/brex"] },
} satisfies Meta<typeof BrexPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  beforeEach: () => mockRpc({ "brexCards.overview": overviewFixture }),
};

export const SectionPlaceholder: Story = {
  parameters: { initialEntries: ["/app/brex/spending"] },
  beforeEach: () => mockRpc({ "brexCards.overview": overviewFixture }),
};

export const NotConnected: Story = {
  beforeEach: () =>
    mockRpc({
      "brexCards.overview": () =>
        Promise.reject(
          Object.assign(new Error("Brex cards are not connected"), { code: "NOT_FOUND" }),
        ),
    }),
};
