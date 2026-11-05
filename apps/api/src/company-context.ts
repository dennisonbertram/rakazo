import { ORPCError } from "@orpc/server";
import type { MemoryStore } from "@rakazo/adapter-kit";
import { MEMORY_REVISION_CONFLICT_ERROR } from "@rakazo/adapter-kit";
import type { CompanyContextRevision, CompanyContextSection } from "@rakazo/contracts";
import {
  COMPANY_SECTION_MAX_COUNT,
  companySectionContent,
  companySectionError,
  companySlug,
  parseCompanySection,
} from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";

type Deps = { prisma: PrismaClient; memory: MemoryStore };
type Actor = { spaceId: string; userId: string };

const own = (actor: Actor) => ({
  spaceId: actor.spaceId,
  userId: actor.userId,
  scope: "company",
  botId: null,
});

const contextOf = (actor: Actor) => ({
  operationId: "company-context",
  traceId: "company-context",
  spaceId: actor.spaceId,
  userId: actor.userId,
  signal: new AbortController().signal,
});

function toSection(doc: {
  id: string;
  path: string;
  content: string;
  revision: number;
  updatedAt?: string | Date;
}): CompanyContextSection {
  const { title, body, summary } = parseCompanySection(doc.content);
  return {
    id: doc.id,
    slug: doc.path,
    title,
    summary,
    text: body,
    revision: doc.revision,
    updatedAt: new Date(doc.updatedAt ?? Date.now()).toISOString(),
  };
}

const bad = (message: string) => new ORPCError("BAD_REQUEST", { message });
const changed = () =>
  new ORPCError("CONFLICT", { message: "This section changed since it was opened" });

async function commit(
  deps: Deps,
  actor: Actor,
  path: string,
  content: string,
  expectedRevision: number | undefined,
  taken?: string,
) {
  try {
    return await deps.memory.commit(
      { scope: "company", path, content, expectedRevision },
      contextOf(actor),
    );
  } catch (error) {
    if (error instanceof Error && error.message === MEMORY_REVISION_CONFLICT_ERROR)
      throw taken ? new ORPCError("CONFLICT", { message: taken }) : changed();
    throw error;
  }
}

async function ownDoc(deps: Deps, actor: Actor, id: string) {
  const doc = await deps.prisma.memoryDocument.findFirst({ where: { id, ...own(actor) } });
  if (!doc) throw new IsolationError();
  return doc;
}

export async function listCompanyContext(deps: Deps, actor: Actor) {
  const snapshot = await deps.memory.read({ scope: "company" }, contextOf(actor));
  return snapshot.documents
    .map(toSection)
    .sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug));
}

export async function saveCompanyContext(
  deps: Deps,
  actor: Actor,
  input: { id?: string; title: string; text: string; expectedRevision?: number },
) {
  const invalid = companySectionError(input.title, input.text);
  if (invalid) throw bad(invalid);
  const content = companySectionContent(input.title, input.text);
  if (!input.id) {
    // The lock makes the count and the insert one step per user, so two creates cannot both pass.
    return deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`company-context:${actor.spaceId}:${actor.userId}`}))`;
      const count = await tx.memoryDocument.count({ where: own(actor) });
      if (count >= COMPANY_SECTION_MAX_COUNT) throw bad("The page is full.");
      const saved = await commit(
        deps,
        actor,
        companySlug(input.title),
        content,
        0,
        "That name is taken.",
      );
      return toSection({ ...saved, updatedAt: new Date() });
    });
  }
  // An update without the revision it started from would overwrite a newer save.
  if (input.expectedRevision === undefined) throw bad("Reload the page and try again.");
  const doc = await ownDoc(deps, actor, input.id);
  const saved = await commit(deps, actor, doc.path, content, input.expectedRevision);
  return toSection({ ...saved, updatedAt: new Date() });
}

export async function companyContextHistory(
  deps: Deps,
  actor: Actor,
  id: string,
): Promise<CompanyContextRevision[]> {
  const doc = await ownDoc(deps, actor, id);
  const rows = await deps.prisma.memoryRevision.findMany({
    where: { documentId: doc.id },
    orderBy: { revision: "desc" },
  });
  return rows.map((row) => {
    const { title, body } = parseCompanySection(row.content);
    return {
      revision: row.revision,
      title,
      text: body,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function restoreCompanyContext(
  deps: Deps,
  actor: Actor,
  input: { id: string; revision: number; expectedRevision: number },
) {
  const doc = await ownDoc(deps, actor, input.id);
  const old = await deps.prisma.memoryRevision.findFirst({
    where: { documentId: doc.id, revision: input.revision },
  });
  if (!old) throw new IsolationError();
  const saved = await commit(deps, actor, doc.path, old.content, input.expectedRevision);
  return toSection({ ...saved, updatedAt: new Date() });
}

export async function removeCompanyContext(
  deps: Deps,
  actor: Actor,
  input: { id: string; revision: number },
) {
  // Revisions go with the document (ON DELETE CASCADE).
  const { count } = await deps.prisma.memoryDocument.deleteMany({
    where: { id: input.id, ...own(actor), revision: input.revision },
  });
  if (count === 0) {
    await ownDoc(deps, actor, input.id);
    throw changed();
  }
  return { ok: true as const };
}
