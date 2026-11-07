import { t } from "@lingui/core/macro";
import { scannerAgentSpawnKey } from "@rakazo/contracts";

export function findScannerAgent<T extends { spawnKey: string | null }>(
  bots: readonly T[],
  userId?: string | null,
): T | undefined {
  return userId ? bots.find((bot) => bot.spawnKey === scannerAgentSpawnKey(userId)) : undefined;
}

export const scannerAgentSuggestions = () => [
  t`What did I scan recently?`,
  t`Name and type my latest scan`,
];
