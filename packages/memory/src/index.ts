import type {
  AdapterContext,
  MemoryCommitRequest,
  MemoryExportRequest,
  MemoryReadRequest,
  MemoryRevision,
  MemorySearchRequest,
  MemorySearchResult,
  MemorySnapshot,
  MemoryStore,
  PortableFile,
} from "@rakazo/adapter-kit";
import { MEMORY_REVISION_CONFLICT_ERROR, memoryStrength } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { Prisma, withTransactionRetry } from "@rakazo/db";

export class MarkdownMemoryStore implements MemoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  describe() {
    return {
      id: "markdown",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { search: true, revisions: true, markdownPortable: true },
    };
  }

  async read(request: MemoryReadRequest, context: AdapterContext): Promise<MemorySnapshot> {
    const documents = await this.prisma.memoryDocument.findMany({
      where: {
        spaceId: context.spaceId,
        userId: context.userId,
        scope: request.scope,
        ...(request.botId ? { botId: request.botId } : {}),
        ...(request.path ? { path: request.path } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { path: "asc" }],
    });
    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        path: doc.path,
        content: doc.content,
        revision: doc.revision,
        updatedAt: doc.updatedAt.toISOString(),
        kind: doc.kind,
        useCount: doc.useCount,
        lastUsedAt: doc.lastUsedAt?.toISOString(),
        pinned: doc.pinned,
      })),
    };
  }

  async recordUse(documentIds: string[], context: AdapterContext): Promise<void> {
    if (documentIds.length === 0) return;
    await this.prisma.memoryDocument.updateMany({
      where: { id: { in: documentIds }, spaceId: context.spaceId, userId: context.userId },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  async search(
    request: MemorySearchRequest,
    context: AdapterContext,
  ): Promise<MemorySearchResult[]> {
    const documents = await this.prisma.memoryDocument.findMany({
      where: {
        spaceId: context.spaceId,
        userId: context.userId,
        scope: request.scope === "all" ? { in: ["bot", "user"] } : request.scope,
        ...(request.botId ? { botId: request.botId } : {}),
      },
    });
    const q = request.query.toLowerCase();
    // Search never hides a faded memory; it only ranks it lower (match is 1, so score = strength).
    const now = new Date();
    return documents
      .filter((doc) => doc.content.toLowerCase().includes(q) || doc.path.toLowerCase().includes(q))
      .map((doc) => ({
        path: doc.path,
        snippet: snippet(doc.content, q),
        score: memoryStrength(doc, now),
      }))
      .sort((a, b) => b.score - a.score);
  }

  async commit(request: MemoryCommitRequest, context: AdapterContext): Promise<MemoryRevision> {
    // A save replaces the current content and appends its history atomically.
    // Conflicts retry the whole transaction so revision numbers use fresh state.
    return withTransactionRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.memoryDocument.findFirst({
            where: {
              spaceId: context.spaceId,
              userId: context.userId,
              scope: request.scope,
              botId: request.botId ?? null,
              path: request.path,
            },
          });
          if (request.expectedRevision !== undefined) {
            const live = existing?.revision ?? 0;
            if (live !== request.expectedRevision) throw new Error(MEMORY_REVISION_CONFLICT_ERROR);
          }
          const doc = existing
            ? await tx.memoryDocument.update({
                where: { id: existing.id },
                data: {
                  content: request.content,
                  revision: existing.revision + 1,
                  ...(request.kind ? { kind: request.kind } : {}),
                  ...(request.byOwner ? { pinned: true } : {}),
                },
              })
            : await tx.memoryDocument.create({
                data: {
                  spaceId: context.spaceId,
                  userId: context.userId,
                  botId: request.botId,
                  scope: request.scope,
                  path: request.path,
                  content: request.content,
                  ...(request.kind ? { kind: request.kind } : {}),
                  ...(request.byOwner ? { pinned: true } : {}),
                },
              });
          await tx.memoryRevision.create({
            data: {
              documentId: doc.id,
              revision: doc.revision,
              content: request.content,
              sourceRunId: request.sourceRunId,
              sourceThreadId: request.sourceThreadId,
            },
          });
          return { id: doc.id, path: doc.path, revision: doc.revision, content: doc.content };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async *exportMarkdown(
    request: MemoryExportRequest,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    const snapshot = await this.read(
      { scope: request.scope === "all" ? "user" : request.scope, botId: request.botId },
      context,
    );
    for (const doc of snapshot.documents) {
      yield { path: doc.path, content: new TextEncoder().encode(doc.content) };
    }
  }

  async importMarkdown(
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<MemoryRevision> {
    let last: MemoryRevision | undefined;
    for await (const file of files) {
      last = await this.commit(
        {
          scope: "user",
          path: file.path,
          content: new TextDecoder().decode(file.content),
        },
        context,
      );
    }
    if (!last) throw new Error("No memory files to import");
    return last;
  }
}

function snippet(content: string, q: string): string {
  const idx = content.toLowerCase().indexOf(q);
  if (idx < 0) return content.slice(0, 140);
  return content.slice(Math.max(0, idx - 40), idx + q.length + 80);
}
