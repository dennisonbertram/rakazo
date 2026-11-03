import type { AdapterContext, MailAccount, MailProvider } from "@rakazo/adapter-kit";
import { firewallDraftIsFree, isSupportScopedQuery, supportScopeQuery } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { accountName, findAccount, inferMailAccount } from "./mail-tools.js";

/** What a firewalled agent's mail call needs from its run. */
export type FirewallMailDeps = {
  prisma: PrismaClient;
  mail: Pick<MailProvider, "getMessage" | "listLabels">;
  context: AdapterContext;
  owner: { spaceId: string; userId: string };
  botId: string;
  /** Accounts this run can see (already limited to connections granted to the agent). */
  accounts: MailAccount[];
  /** The agent's grant on each visible connection, read fresh. */
  rows: {
    id: string;
    allAgents: boolean;
    botAccess: { botId: string; supportLabel?: string | null }[];
  }[];
};

export type FirewallMailDecision = { free: true; args: Record<string, unknown> } | { free: false };

const FREE = (args: Record<string, unknown>): FirewallMailDecision => ({ free: true, args });
const ASK: FirewallMailDecision = { free: false };

/** The support label on the agent's grant for an account; null means the whole connection. */
const labelOf = (deps: FirewallMailDeps, account: MailAccount): string | null =>
  deps.rows.find((row) => row.id === account.id)?.botAccess.find((a) => a.botId === deps.botId)
    ?.supportLabel ?? null;

async function messageHasLabel(
  deps: FirewallMailDeps,
  account: MailAccount,
  id: string,
  label: string,
): Promise<boolean> {
  try {
    const labels = await deps.mail.listLabels(account, deps.context);
    const wanted = labels.find((l) => l.name.toLowerCase() === label.toLowerCase());
    if (!wanted) return false;
    const message = await deps.mail.getMessage(account, id, deps.context);
    return message.labelIds.includes(wanted.id);
  } catch {
    return false;
  }
}

/** The searchId's stored queries, each held inside its account's label. */
async function searchStaysInScope(deps: FirewallMailDeps, searchId: unknown): Promise<boolean> {
  if (typeof searchId !== "string" || !searchId) return true;
  const search = await deps.prisma.mailSearch.findFirst({
    where: { id: searchId, ...deps.owner, botId: deps.botId },
    select: { summary: true },
  });
  if (!search) return true;
  const perQuery = (search.summary as { perQuery?: { account?: unknown; q?: unknown }[] } | null)
    ?.perQuery;
  return (perQuery ?? []).every((entry) => {
    const account = deps.accounts.find((a) => accountName(a) === entry.account);
    const label = account ? labelOf(deps, account) : null;
    return !label || (typeof entry.q === "string" && isSupportScopedQuery(label, entry.q));
  });
}

async function accountFor(deps: FirewallMailDeps, args: Record<string, unknown>) {
  if (typeof args.account === "string" && args.account.trim()) {
    return findAccount(deps.accounts, args.account);
  }
  return inferMailAccount(deps.prisma, deps.owner, deps.accounts, args);
}

/**
 * The support scope, per call. An account whose grant names a label may be read only inside that
 * label: a search is held inside it, a message must carry it, and anything that cannot be shown to
 * stay inside it (an overview of the whole inbox, a grep of a search made outside it) asks.
 */
export async function firewallMailReadDecision(
  name: string,
  args: Record<string, unknown>,
  deps: FirewallMailDeps,
): Promise<FirewallMailDecision> {
  const scoped = deps.accounts.filter((account) => labelOf(deps, account));
  if (scoped.length === 0) return FREE(args);
  if (name === "inbox_overview") return ASK;
  if (name === "mail_grep")
    return (await searchStaysInScope(deps, args.searchId)) ? FREE(args) : ASK;
  if (name === "mail_search") {
    if (typeof args.continueFrom === "string" && args.continueFrom) {
      return (await searchStaysInScope(deps, args.continueFrom)) ? FREE(args) : ASK;
    }
    const named = typeof args.account === "string" && args.account.trim();
    const targets = named ? [await accountFor(deps, args)] : deps.accounts;
    if (targets.some((account) => !account)) return FREE(args);
    const labels = new Set(targets.map((account) => labelOf(deps, account!)));
    if (labels.size === 1 && !labels.has(null) && Array.isArray(args.queries)) {
      const [label] = [...labels] as [string];
      return FREE({
        ...args,
        queries: args.queries.map((query) =>
          typeof query === "string" && query.trim()
            ? supportScopeQuery(label, query.trim())
            : query,
        ),
      });
    }
    return labels.size === 1 && labels.has(null) ? FREE(args) : ASK;
  }
  if (name === "mail_get") {
    const account = await accountFor(deps, args);
    if (!account) return FREE(args);
    const label = labelOf(deps, account);
    if (!label) return FREE(args);
    return typeof args.id === "string" && (await messageHasLabel(deps, account, args.id, label))
      ? FREE(args)
      : ASK;
  }
  if (name === "show_emails") {
    const ids = (Array.isArray(args.emails) ? args.emails : [])
      .map((email) => (email as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === "string");
    const cached = await deps.prisma.cachedMailMessage.findMany({
      where: {
        ...deps.owner,
        providerMessageId: { in: ids },
        connectionId: { in: deps.accounts.map((account) => account.id) },
      },
      select: { providerMessageId: true, connectionId: true },
    });
    for (const id of ids) {
      const row = cached.find((entry) => entry.providerMessageId === id);
      const account = deps.accounts.find((a) => a.id === row?.connectionId);
      if (!account) return ASK;
      const label = labelOf(deps, account);
      if (label && !(await messageHasLabel(deps, account, id, label))) return ASK;
    }
    return FREE(args);
  }
  return FREE(args);
}

/**
 * A draft is free when everyone it goes to already took part in the thread it answers and it has
 * no link. The thread is read from synced mail; a reply to a message that is not synced asks.
 */
export async function firewallDraftIsWithinThread(
  args: Record<string, unknown>,
  deps: Pick<FirewallMailDeps, "prisma" | "owner" | "accounts">,
): Promise<boolean> {
  const replyTo = typeof args.replyToId === "string" ? args.replyToId.trim() : "";
  if (!replyTo) return false;
  const account = await inferMailAccount(deps.prisma, deps.owner, deps.accounts, args).catch(
    () => undefined,
  );
  if (!account) return false;
  const row = await deps.prisma.cachedMailMessage.findFirst({
    where: { ...deps.owner, providerMessageId: replyTo, connectionId: account.id },
    select: { threadId: true, connectionId: true },
  });
  if (!row) return false;
  const messages = await deps.prisma.cachedMailMessage.findMany({
    where: { ...deps.owner, connectionId: row.connectionId, threadId: row.threadId },
    select: { fromAddress: true, toAddresses: true, ccAddresses: true },
  });
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return firewallDraftIsFree({
    to: strings(args.to),
    cc: strings(args.cc),
    bcc: strings(args.bcc),
    body: typeof args.body === "string" ? args.body : "",
    participants: messages.flatMap((m) => [
      ...(m.fromAddress ? [m.fromAddress] : []),
      ...(m.toAddresses ?? []),
      ...(m.ccAddresses ?? []),
    ]),
  });
}

/** mail_modify is free only on a connection this agent alone holds a grant on. */
export async function firewallModifyIsSoleGrant(
  args: Record<string, unknown>,
  deps: Pick<FirewallMailDeps, "prisma" | "owner" | "accounts" | "rows" | "botId">,
): Promise<boolean> {
  const account = await accountFor(deps as FirewallMailDeps, args);
  const row = deps.rows.find((candidate) => candidate.id === account?.id);
  if (!account || !row || row.allAgents || !row.botAccess.some((a) => a.botId === deps.botId)) {
    return false;
  }
  const others = await deps.prisma.botConnectionAccess.count({
    where: { connectionId: row.id, botId: { not: deps.botId } },
  });
  return others === 0;
}
