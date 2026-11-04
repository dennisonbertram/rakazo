import type { Bot } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRpc } from "../../lib/__mocks__/rpc";
import { mockBots } from "../../stories/fixtures";
import { BotAccessSection } from "./BotAccessSection";

const bot = mockBots[0] as Bot;
const connection = (
  id: string,
  name: string,
  account: string,
  agentBotId: string | null = null,
) => ({
  id,
  displayName: name,
  account,
  status: "connected",
  agentBotId,
});

const few = [
  connection("c1", "Gmail", "ann@example.com"),
  connection("c2", "Gmail", "ops@example.com"),
  connection("c3", "Mercury", "", bot.id),
];
const many = Array.from({ length: 10 }, (_, i) =>
  connection(`m${i}`, `App ${String.fromCharCode(65 + i)}`, `user${i}@example.com`),
);

const loaded = (rows: ReturnType<typeof connection>[]) => ({
  "connections.list": rows,
  "connections.effectiveAccess": Object.fromEntries(
    rows.map((row, i) => [row.id, { shared: "some", botIds: i % 2 === 0 ? [bot.id] : [] }]),
  ),
  "connections.access": { allAgents: true, botIds: [], agentShared: true },
  "connections.setAccess": null,
  "mcp.servers.list": [],
  "mcp.assignments.list": [],
  "bots.list": mockBots,
});

const meta = {
  title: "Shell/BotAccessSection",
  component: BotAccessSection,
  args: { bot },
  decorators: [
    (Story) => (
      <div className="w-full max-w-96 px-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BotAccessSection>;
export default meta;

/** The agent's own connection (Mercury) is on and cannot be turned off. */
export const Few: StoryObj<typeof meta> = { beforeEach: () => mockRpc(loaded(few)) };

/** Above 8 rows a search box appears. */
export const WithSearch: StoryObj<typeof meta> = { beforeEach: () => mockRpc(loaded(many)) };
