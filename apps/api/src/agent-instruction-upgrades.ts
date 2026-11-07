import {
  COMPANY_AGENT_INSTRUCTIONS,
  cartaAgentSpawnKey,
  companyAgentSpawnKey,
  dataRoomAgentSpawnKey,
  financeAgentSpawnKey,
  gtmAgentSpawnKey,
  inboxAgentSpawnKey,
  investorsAgentSpawnKey,
  legalAgentSpawnKey,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { isPastDefault } from "./agent-default-history.js";
import { CARTA_AGENT_INSTRUCTIONS, PREVIOUS_CARTA_AGENT_INSTRUCTIONS } from "./carta-agent.js";
import { PREVIOUS_COMPANY_AGENT_INSTRUCTIONS } from "./company-agent.js";
import {
  DATA_ROOM_AGENT_INSTRUCTIONS,
  PREVIOUS_DATA_ROOM_AGENT_INSTRUCTIONS,
} from "./data-room-agent.js";
import {
  FINANCE_AGENT_INSTRUCTIONS,
  PREVIOUS_FINANCE_AGENT_INSTRUCTIONS,
} from "./finance-agent.js";
import { GTM_AGENT_INSTRUCTIONS, PREVIOUS_GTM_AGENT_INSTRUCTIONS } from "./gtm-agent.js";
import { INBOX_AGENT_INSTRUCTIONS, PREVIOUS_INBOX_AGENT_INSTRUCTIONS } from "./inbox-agent.js";
import {
  INVESTORS_AGENT_INSTRUCTIONS,
  PREVIOUS_INVESTORS_AGENT_INSTRUCTIONS,
} from "./investors-agent.js";
import { LEGAL_AGENT_INSTRUCTIONS, PREVIOUS_LEGAL_AGENT_INSTRUCTIONS } from "./legal-agent.js";

/**
 * Every built-in agent kind with a current default and a list of earlier defaults. Integration and mail-thread
 * agents are not listed: their text is built per connection or per thread.
 */
const BUILT_IN_AGENTS = [
  {
    kind: "inbox",
    spawnKey: inboxAgentSpawnKey,
    current: INBOX_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_INBOX_AGENT_INSTRUCTIONS,
  },
  {
    kind: "carta",
    spawnKey: cartaAgentSpawnKey,
    current: CARTA_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_CARTA_AGENT_INSTRUCTIONS,
  },
  {
    kind: "company",
    spawnKey: companyAgentSpawnKey,
    current: COMPANY_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_COMPANY_AGENT_INSTRUCTIONS,
  },
  {
    kind: "data-room",
    spawnKey: dataRoomAgentSpawnKey,
    current: DATA_ROOM_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_DATA_ROOM_AGENT_INSTRUCTIONS,
  },
  {
    kind: "finance",
    spawnKey: financeAgentSpawnKey,
    current: FINANCE_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_FINANCE_AGENT_INSTRUCTIONS,
  },
  {
    kind: "gtm",
    spawnKey: gtmAgentSpawnKey,
    current: GTM_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_GTM_AGENT_INSTRUCTIONS,
  },
  {
    kind: "investors",
    spawnKey: investorsAgentSpawnKey,
    current: INVESTORS_AGENT_INSTRUCTIONS,
    previous: [...PREVIOUS_INVESTORS_AGENT_INSTRUCTIONS],
  },
  {
    kind: "legal",
    spawnKey: legalAgentSpawnKey,
    current: LEGAL_AGENT_INSTRUCTIONS,
    previous: PREVIOUS_LEGAL_AGENT_INSTRUCTIONS,
  },
];

/**
 * Upgrades every active built-in agent, in every space, whose instructions still equal an earlier
 * default: one of the previous lists, or any default recorded by hash in agent-default-history.ts.
 * Each row is replaced only while its stored text is still the text that was read, so an edited
 * agent is never touched and several API processes running this at once are harmless. Returns the
 * count per kind.
 */
export async function upgradeBuiltInAgentInstructions(
  prisma: Pick<PrismaClient, "bot">,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { kind, spawnKey, current, previous } of BUILT_IN_AGENTS) {
    counts[kind] = 0;
    const bots = await prisma.bot.findMany({
      where: {
        archivedAt: null,
        spawnKey: { startsWith: spawnKey("") },
        instructions: { not: current },
      },
      select: { id: true, instructions: true },
    });
    for (const bot of bots) {
      if (!previous.includes(bot.instructions) && !isPastDefault(kind, bot.instructions)) continue;
      const { count } = await prisma.bot.updateMany({
        where: { id: bot.id, instructions: bot.instructions },
        data: { instructions: current },
      });
      counts[kind] += count;
    }
  }
  return counts;
}
