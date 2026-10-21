import type { ScratchpadCategory, ScratchpadChannel } from "@rakazo/contracts";
import {
  ScratchpadCategorySchema,
  ScratchpadChannelSchema,
  ScratchpadDateTimeSchema,
} from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "@rakazo/db";

const SCRATCHPAD_STATUSES = ["open", "parked", "done"] as const;
type ScratchpadStatus = (typeof SCRATCHPAD_STATUSES)[number];
type Scope = { spaceId: string; userId: string; botId: string };
type ScratchpadClient = PrismaClient | Prisma.TransactionClient;

const OPEN_SCRATCHPAD_STATUSES: ScratchpadStatus[] = ["open", "parked"];
const GATED_CATEGORIES = new Set<ScratchpadCategory>([
  "public_post",
  "create_account",
  "outbound_email",
]);
const DRAFT_ONLY_CHANNELS = new Set<ScratchpadChannel>(["reddit", "hn", "producthunt"]);
const TITLE_MAX = 200;
const NOTES_MAX = 4_000;
const TARGET_MAX = 200;
const PROOF_MAX = 2_000;
const EFFECT_KEY = /^[^:\s]{1,200}:[^:\s]{1,200}:[a-f0-9]{64}(?::[1-9]\d*)?$/;

export type ScratchpadToolDeps = {
  prisma: PrismaClient;
};

type ScratchpadRow = {
  id: string;
  spaceId?: string;
  userId?: string;
  botId: string;
  title: string;
  status: string;
  notes: string;
  category?: string | null;
  channel?: string | null;
  target?: string | null;
  scheduledFor?: Date | null;
  proof?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function categoryValue(value: unknown): ScratchpadCategory | null {
  const parsed = ScratchpadCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function channelValue(value: unknown): ScratchpadChannel | null {
  const parsed = ScratchpadChannelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function approvedByValue(value: unknown): "user" | "policy" | null {
  return value === "user" || value === "policy" ? value : null;
}

export function mapScratchpadItem(row: ScratchpadRow) {
  return {
    id: row.id,
    botId: row.botId,
    title: row.title,
    status: coerceScratchpadStatus(row.status),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    category: categoryValue(row.category),
    channel: channelValue(row.channel),
    target: row.target ?? null,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    proof: row.proof ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: approvedByValue(row.approvedBy),
  };
}

export function isScratchpadStatus(value: unknown): value is ScratchpadStatus {
  return typeof value === "string" && (SCRATCHPAD_STATUSES as readonly string[]).includes(value);
}

function coerceScratchpadStatus(value: unknown): ScratchpadStatus {
  return isScratchpadStatus(value) ? value : "open";
}

function isGated(
  category: ScratchpadCategory | null,
): category is "public_post" | "create_account" | "outbound_email" {
  return category !== null && GATED_CATEGORIES.has(category);
}

function parseAbsoluteDateTime(value: unknown): Date | null {
  const parsed = ScratchpadDateTimeSchema.safeParse(value);
  return parsed.success ? new Date(parsed.data) : null;
}

function isEffectKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && EFFECT_KEY.test(value);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > PROOF_MAX) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isEmailProof(value: unknown, itemId: string): value is string {
  return typeof value === "string" && value === `gmail:${itemId}`;
}

function isDurableProof(value: unknown): value is string {
  return (
    isHttpUrl(value) ||
    (typeof value === "string" && /^zernio:\S+$/.test(value)) ||
    (typeof value === "string" && /^gmail:\S+$/.test(value))
  );
}

function isValidActorProof(
  category: ScratchpadCategory | null,
  proof: unknown,
  itemId: string,
  founder: boolean,
): boolean {
  if ((category === "public_post" || category === "create_account") && isHttpUrl(proof)) {
    return true;
  }
  if (founder && category === "outbound_email" && isEmailProof(proof, itemId)) return true;
  return false;
}

function updatedAtAfter(existing: ScratchpadRow, now: Date): Date {
  return new Date(Math.max(now.getTime(), existing.updatedAt.getTime() + 1));
}

function renderedVersion(value: unknown): Date | null {
  return parseAbsoluteDateTime(value);
}

function scopeOf(input: Scope): Scope {
  return { spaceId: input.spaceId, userId: input.userId, botId: input.botId };
}

async function lockScope(tx: ScratchpadClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function listScratchpadItems(
  deps: ScratchpadToolDeps,
  input: Scope & {
    status?: ScratchpadStatus;
    includeDone?: boolean;
  },
) {
  const statusFilter = input.status
    ? { status: input.status }
    : input.includeDone
      ? {}
      : { status: { in: OPEN_SCRATCHPAD_STATUSES } };
  const rows = await deps.prisma.scratchpadItem.findMany({
    where: {
      ...scopeOf(input),
      ...statusFilter,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => mapScratchpadItem(row as ScratchpadRow));
}

export async function addScratchpadItemFromTool(
  deps: ScratchpadToolDeps,
  input: Scope & {
    title: string;
    status?: string;
    notes?: string;
    category?: string;
    channel?: string;
    target?: string;
    scheduledFor?: string;
  },
) {
  if ((input as typeof input & { proof?: unknown }).proof !== undefined) {
    return { error: "proof can only be recorded after an item is created." };
  }
  const title = input.title.trim();
  if (!title) return { error: "title is required." };
  if (title.length > TITLE_MAX) return { error: `title must be at most ${TITLE_MAX} characters.` };
  const notes = (input.notes ?? "").trim();
  if (notes.length > NOTES_MAX) return { error: `notes must be at most ${NOTES_MAX} characters.` };

  let category: ScratchpadCategory | null = null;
  if (input.category !== undefined) {
    category = categoryValue(input.category);
    if (!category) return { error: "category is invalid." };
  }
  let channel: ScratchpadChannel | null = null;
  if (input.channel !== undefined) {
    channel = channelValue(input.channel);
    if (!channel) return { error: "channel is invalid." };
  }
  const target = input.target?.trim();
  if (target !== undefined && target.length > TARGET_MAX) {
    return { error: `target must be at most ${TARGET_MAX} characters.` };
  }
  const scheduledFor =
    input.scheduledFor === undefined ? undefined : parseAbsoluteDateTime(input.scheduledFor);
  if (input.scheduledFor !== undefined && !scheduledFor) {
    return { error: "scheduledFor must be an absolute ISO datetime." };
  }
  if (isGated(category) && channel && DRAFT_ONLY_CHANNELS.has(channel)) {
    return { error: "This channel is draft-only for gated items." };
  }

  let status: ScratchpadStatus = isGated(category) ? "parked" : "open";
  if (input.status !== undefined) {
    if (!isScratchpadStatus(input.status)) {
      return { error: "status must be open, parked, or done." };
    }
    if (isGated(category) && input.status !== "parked") {
      return { error: "Gated items must be created parked." };
    }
    status = input.status;
  }

  const data = {
    ...scopeOf(input),
    title,
    status,
    notes,
    ...(category ? { category } : {}),
    ...(channel ? { channel } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
  };
  const create = (client: ScratchpadClient) =>
    client.scratchpadItem.create({ data }) as Promise<ScratchpadRow>;

  if (category === "goal" && status !== "done") {
    return deps.prisma.$transaction(async (tx) => {
      await lockScope(tx, `scratchpad:goal:${input.spaceId}:${input.userId}:${input.botId}`);
      const existing = await tx.scratchpadItem.findFirst({
        where: { ...scopeOf(input), category: "goal", status: { not: "done" } },
      });
      if (existing) return { error: "A non-done goal already exists for this bot." };
      return { item: mapScratchpadItem(await create(tx)) };
    });
  }
  return { item: mapScratchpadItem(await create(deps.prisma)) };
}

type ScratchpadUpdateInput = Scope & {
  itemId: string;
  title?: string;
  status?: string;
  notes?: string;
  target?: string;
  scheduledFor?: string;
  proof?: string;
};

type FounderScratchpadUpdateInput = ScratchpadUpdateInput & {
  updatedAt?: string;
  reapprove?: boolean;
};

function contentEdit(data: Record<string, unknown>): boolean {
  return ["title", "notes", "target", "scheduledFor"].some((key) => key in data);
}

async function scopedItem(
  client: ScratchpadClient,
  input: Scope & { itemId: string },
): Promise<ScratchpadRow | null> {
  const itemId = input.itemId.trim();
  if (!itemId) return null;
  return (await client.scratchpadItem.findFirst({
    where: { id: itemId, ...scopeOf(input) },
  })) as ScratchpadRow | null;
}

async function applyScratchpadUpdate(
  client: ScratchpadClient,
  existing: ScratchpadRow,
  scope: Scope,
  data: Record<string, unknown>,
  now: Date,
  conflictResult: boolean,
  guardUpdatedAt?: Date,
) {
  const updatedAt = updatedAtAfter(existing, now);
  const result = await client.scratchpadItem.updateMany({
    where: {
      id: existing.id,
      ...scopeOf(scope),
      status: existing.status,
      updatedAt: guardUpdatedAt ?? existing.updatedAt,
      approvedAt: existing.approvedAt ?? null,
      approvedBy: existing.approvedBy ?? null,
      proof: existing.proof ?? null,
    },
    data: { ...data, updatedAt },
  });
  if (result.count !== 1) {
    return conflictResult
      ? { conflict: true as const }
      : { error: "Scratchpad item changed; retry." };
  }
  return { item: mapScratchpadItem({ ...existing, ...data, updatedAt }) };
}

async function updateScratchpadItem(
  deps: ScratchpadToolDeps & { now?: () => Date },
  input: FounderScratchpadUpdateInput,
  founder: boolean,
) {
  const itemId = input.itemId.trim();
  if (!itemId) return { error: "itemId is required." };

  const raw = input as FounderScratchpadUpdateInput & { category?: unknown; channel?: unknown };
  if (raw.category !== undefined || raw.channel !== undefined) {
    return { error: "category and channel can only be set when the item is created." };
  }
  if (input.status !== undefined && !isScratchpadStatus(input.status)) {
    return { error: "status must be open, parked, or done." };
  }

  const existing = await scopedItem(deps.prisma, { ...input, itemId });
  if (!existing) return { error: "Scratchpad item not found." };
  const category = categoryValue(existing.category);
  const gated = isGated(category);
  const data: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { error: "title cannot be empty." };
    if (title.length > TITLE_MAX)
      return { error: `title must be at most ${TITLE_MAX} characters.` };
    data.title = title;
  }
  if (input.notes !== undefined) {
    const notes = input.notes.trim();
    if (notes.length > NOTES_MAX)
      return { error: `notes must be at most ${NOTES_MAX} characters.` };
    data.notes = notes;
  }
  if (input.target !== undefined) {
    const target = input.target.trim();
    if (target.length > TARGET_MAX)
      return { error: `target must be at most ${TARGET_MAX} characters.` };
    data.target = target;
  }
  if (input.scheduledFor !== undefined) {
    const scheduledFor = parseAbsoluteDateTime(input.scheduledFor);
    if (!scheduledFor) return { error: "scheduledFor must be an absolute ISO datetime." };
    data.scheduledFor = scheduledFor;
  }
  if (input.proof !== undefined) {
    if (typeof input.proof !== "string" || input.proof.length > PROOF_MAX) {
      return { error: `proof must be at most ${PROOF_MAX} characters.` };
    }
    if (input.proof !== (existing.proof ?? null)) {
      if (
        !isValidActorProof(category, input.proof, existing.id, founder) ||
        (existing.proof !== null && isDurableProof(existing.proof)) ||
        (existing.proof !== null && existing.proof !== input.proof)
      ) {
        return { error: "proof must be valid and cannot replace existing proof." };
      }
      data.proof = input.proof;
    }
  }
  if (input.status !== undefined) data.status = input.status;

  const contentWasEdited = contentEdit(data);
  if (founder && input.reapprove) {
    if (
      !gated ||
      !isEffectKey(existing.proof) ||
      (existing.status !== "parked" && existing.status !== "open") ||
      !renderedVersion(input.updatedAt) ||
      contentWasEdited ||
      (input.status !== undefined && input.status !== "open") ||
      input.proof !== undefined
    ) {
      return { error: "Re-approve requires the current version of an uncertain post stamp." };
    }
    return applyScratchpadUpdate(
      deps.prisma,
      existing,
      input,
      {
        status: "open",
        proof: null,
        approvedAt: deps.now?.() ?? new Date(),
        approvedBy: "user",
      },
      deps.now?.() ?? new Date(),
      true,
      renderedVersion(input.updatedAt) ?? undefined,
    );
  }

  if (!founder && gated && input.status === "open") {
    return { error: "Agents cannot open gated items." };
  }
  if (
    gated &&
    input.status === "open" &&
    founder &&
    !(existing.status === "open" && existing.approvedAt && contentWasEdited)
  ) {
    if (
      existing.status !== "parked" ||
      existing.approvedAt !== null ||
      isEffectKey(existing.proof) ||
      !renderedVersion(input.updatedAt) ||
      contentWasEdited ||
      data.proof !== undefined
    ) {
      return { error: "Approval requires the current parked, unapproved version." };
    }
    return applyScratchpadUpdate(
      deps.prisma,
      existing,
      input,
      {
        status: "open",
        approvedAt: deps.now?.() ?? new Date(),
        approvedBy: "user",
      },
      deps.now?.() ?? new Date(),
      true,
      renderedVersion(input.updatedAt) ?? undefined,
    );
  }

  if (gated && input.status === "done") {
    const proof = data.proof ?? existing.proof;
    const hasCompletionProof =
      category === "outbound_email" ? isEmailProof(proof, existing.id) : isHttpUrl(proof);
    if (!hasCompletionProof) {
      return { error: "A valid proof is required to complete this item." };
    }
    if (!founder && (existing.status !== "open" || !existing.approvedAt)) {
      return { error: "A gated item must be approved and open before an agent can complete it." };
    }
  }

  if (gated && existing.status === "open" && existing.approvedAt && input.status === "parked") {
    const onlyReasonNote =
      Object.keys(data).every((key) => key === "status" || key === "notes") &&
      (founder || input.status === "parked");
    if (!founder && contentWasEdited && !onlyReasonNote) {
      return { error: "Approved item content is frozen until it is re-parked." };
    }
    data.status = "parked";
    data.approvedAt = null;
    data.approvedBy = null;
  } else if (gated && !founder && existing.approvedAt && contentWasEdited) {
    return { error: "Approved item content is frozen until it is re-parked." };
  }
  if (gated && founder && existing.approvedAt && contentWasEdited) {
    if (input.status === "done") {
      return { error: "Edit the approved item before completing it." };
    }
    data.status = "parked";
    data.approvedAt = null;
    data.approvedBy = null;
  }
  if (gated && !founder && existing.status === "done" && input.status === "open") {
    return { error: "Completed gated items cannot be reopened by an agent." };
  }
  if (Object.keys(data).length === 0) {
    return { error: "Provide title, status, notes, target, scheduledFor, and/or proof to update." };
  }

  const reopenGoal =
    category === "goal" &&
    existing.status === "done" &&
    (data.status === "open" || data.status === "parked");
  if (reopenGoal) {
    return deps.prisma.$transaction(async (tx) => {
      await lockScope(tx, `scratchpad:goal:${input.spaceId}:${input.userId}:${input.botId}`);
      const otherGoal = await tx.scratchpadItem.findFirst({
        where: {
          ...scopeOf(input),
          category: "goal",
          status: { not: "done" },
          id: { not: existing.id },
        },
      });
      if (otherGoal) return { error: "A non-done goal already exists for this bot." };
      return applyScratchpadUpdate(tx, existing, input, data, deps.now?.() ?? new Date(), founder);
    });
  }
  return applyScratchpadUpdate(
    deps.prisma,
    existing,
    input,
    data,
    deps.now?.() ?? new Date(),
    founder,
  );
}

export function updateScratchpadItemFromTool(
  deps: ScratchpadToolDeps & { now?: () => Date },
  input: ScratchpadUpdateInput,
) {
  return updateScratchpadItem(deps, input, false);
}

export function updateScratchpadItemFromUser(
  deps: ScratchpadToolDeps & { now?: () => Date },
  input: FounderScratchpadUpdateInput,
) {
  return updateScratchpadItem(deps, input, true);
}

export async function completeScratchpadItemFromTool(
  deps: ScratchpadToolDeps & { now?: () => Date },
  input: Scope & { itemId: string; proof?: string },
) {
  return updateScratchpadItemFromTool(deps, { ...input, status: "done" });
}

async function removeScratchpadItem(deps: ScratchpadToolDeps, input: Scope & { itemId: string }) {
  const existing = await scopedItem(deps.prisma, input);
  if (!existing) return { error: "Scratchpad item not found." };
  const result = await deps.prisma.scratchpadItem.deleteMany({
    where: { ...scopeOf(input), id: existing.id },
  });
  if (result.count !== 1) return { error: "Scratchpad item changed; retry." };
  return { ok: true as const, itemId: existing.id, title: existing.title };
}

export function removeScratchpadItemFromTool(
  deps: ScratchpadToolDeps,
  input: Scope & { itemId: string },
) {
  return removeScratchpadItem(deps, input);
}

export function removeScratchpadItemFromUser(
  deps: ScratchpadToolDeps,
  input: Scope & { itemId: string },
) {
  return removeScratchpadItem(deps, input);
}

export async function listScratchpadItemsFromTool(
  deps: ScratchpadToolDeps,
  input: Scope & { includeDone?: boolean },
) {
  const items = await listScratchpadItems(deps, {
    ...scopeOf(input),
    includeDone: input.includeDone,
  });
  return { items };
}

export async function hasApprovedOpenSignup(deps: ScratchpadToolDeps, scope: Scope) {
  return Boolean(
    await deps.prisma.scratchpadItem.findFirst({
      where: {
        ...scopeOf(scope),
        category: "create_account",
        status: "open",
        approvedAt: { not: null },
      },
    }),
  );
}

export async function hasApprovedOpenPost(deps: ScratchpadToolDeps, scope: Scope) {
  return Boolean(
    await deps.prisma.scratchpadItem.findFirst({
      where: {
        ...scopeOf(scope),
        category: "public_post",
        status: "open",
        approvedAt: { not: null },
      },
    }),
  );
}

export async function findWorkableOpenItem(
  deps: ScratchpadToolDeps,
  scope: Scope,
  now: () => Date = () => new Date(),
) {
  const rows = await deps.prisma.scratchpadItem.findMany({
    where: { ...scopeOf(scope), status: "open" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return (
    rows.find(
      (row) =>
        !(
          row.category === "public_post" &&
          typeof row.proof === "string" &&
          row.proof.startsWith("zernio:") &&
          row.scheduledFor &&
          row.scheduledFor.getTime() > now().getTime()
        ),
    ) ?? null
  );
}

type ConsumeApprovedPostInput = Scope & {
  text: string;
  scheduledFor: string;
  target: string;
  effectKey: string;
  now?: () => Date;
};

export async function consumeApprovedPost(
  deps: ScratchpadToolDeps,
  input: ConsumeApprovedPostInput,
): Promise<{ count: 0 } | { count: 1; item: ReturnType<typeof mapScratchpadItem> }> {
  if (typeof input.text !== "string" || typeof input.target !== "string") {
    return { count: 0 };
  }
  const text = input.text.trim();
  const scheduledFor = parseAbsoluteDateTime(input.scheduledFor);
  const target = input.target;
  const now = input.now?.() ?? new Date();
  if (
    !text ||
    text.length > NOTES_MAX ||
    target.length === 0 ||
    target.length > TARGET_MAX ||
    !scheduledFor ||
    !Number.isFinite(now.getTime()) ||
    scheduledFor.getTime() < now.getTime() + 10 * 60_000 ||
    !isEffectKey(input.effectKey)
  ) {
    return { count: 0 };
  }

  return deps.prisma.$transaction(async (tx) => {
    await lockScope(tx, `scratchpad:consume:${input.spaceId}:${input.userId}:${input.botId}`);
    const tuple = {
      ...scopeOf(input),
      category: "public_post",
      status: "open",
      approvedAt: { not: null },
      notes: text,
      scheduledFor,
      target,
    };
    const replay = (await tx.scratchpadItem.findFirst({
      where: { ...tuple, proof: input.effectKey },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as ScratchpadRow | null;
    if (replay) return { count: 1 as const, item: mapScratchpadItem(replay) };

    const candidate = (await tx.scratchpadItem.findFirst({
      where: { ...tuple, proof: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as ScratchpadRow | null;
    if (!candidate) return { count: 0 as const };

    const consumedAt = updatedAtAfter(candidate, now);
    const result = await tx.scratchpadItem.updateMany({
      where: {
        id: candidate.id,
        ...scopeOf(input),
        category: "public_post",
        status: "open",
        updatedAt: candidate.updatedAt,
        approvedAt: candidate.approvedAt,
        approvedBy: candidate.approvedBy,
        proof: null,
        notes: text,
        scheduledFor,
        target,
      },
      data: { proof: input.effectKey, updatedAt: consumedAt },
    });
    if (result.count !== 1) return { count: 0 as const };
    return {
      count: 1 as const,
      item: mapScratchpadItem({ ...candidate, proof: input.effectKey, updatedAt: consumedAt }),
    };
  });
}

export async function clearPostStamp(
  deps: ScratchpadToolDeps,
  input: Scope & { itemId: string; effectKey: string },
): Promise<boolean> {
  if (!isEffectKey(input.effectKey)) return false;
  const result = await deps.prisma.scratchpadItem.updateMany({
    where: {
      ...scopeOf(input),
      id: input.itemId,
      proof: input.effectKey,
    },
    data: { proof: null },
  });
  return result.count === 1;
}
