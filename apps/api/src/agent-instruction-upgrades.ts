import {
  cartaAgentSpawnKey,
  COMPANY_AGENT_INSTRUCTIONS,
  companyAgentSpawnKey,
  dataRoomAgentSpawnKey,
  financeAgentSpawnKey,
  gtmAgentSpawnKey,
  inboxAgentSpawnKey,
  investorsAgentSpawnKey,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
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

/**
 * Every built-in agent kind with a current default and a list of earlier defaults. Add a kind here
 * when it gets a PREVIOUS list. Integration agents are not listed: they have no previous-default list.
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
    previous: [PREVIOUS_CARTA_AGENT_INSTRUCTIONS],
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
];

/**
 * Upgrades every active built-in agent, in every space, whose instructions still equal an earlier
 * default. One UPDATE per kind matches on the stored text, so an edited agent is never touched and
 * several API processes running this at once are harmless. Returns the count per kind.
 */
export async function upgradeBuiltInAgentInstructions(
  prisma: Pick<PrismaClient, "bot">,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { kind, spawnKey, current, previous } of BUILT_IN_AGENTS) {
    const { count } = await prisma.bot.updateMany({
      where: {
        archivedAt: null,
        spawnKey: { startsWith: spawnKey("") },
        instructions: { in: previous.filter((text) => text !== current) },
      },
      data: { instructions: current },
    });
    counts[kind] = count;
  }
  return counts;
}
