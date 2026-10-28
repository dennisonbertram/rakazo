import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it } from "vitest";
import { pickedSpace, pickKey } from "./mcp.js";

/** Just the verification lookup `pickedSpace` makes, over rows kept in memory. */
function store(rows: Array<{ identifier: string; value: string; expiresAt: Date }>) {
  return {
    verification: {
      findFirst: async ({ where }: { where: { identifier: string; expiresAt: { gt: Date } } }) =>
        rows.find((r) => r.identifier === where.identifier && r.expiresAt > where.expiresAt.gt) ??
        null,
    },
  } as unknown as PrismaClient;
}

describe("pickedSpace", () => {
  const live = new Date(Date.now() + 60_000);

  it("gives a Space only to the client that picked it, in the same session", async () => {
    const prisma = store([
      { identifier: pickKey("s1", "client-a"), value: "space-1", expiresAt: live },
    ]);
    expect(await pickedSpace(prisma, "s1", "client-a")).toBe("space-1");
    expect(await pickedSpace(prisma, "s1", "client-b")).toBeUndefined();
    expect(await pickedSpace(prisma, "s2", "client-a")).toBeUndefined();
  });

  it("ignores an expired pick and a request without a client", async () => {
    const prisma = store([
      {
        identifier: pickKey("s1", "client-a"),
        value: "space-1",
        expiresAt: new Date(Date.now() - 1),
      },
    ]);
    expect(await pickedSpace(prisma, "s1", "client-a")).toBeUndefined();
    expect(await pickedSpace(prisma, "s1", undefined)).toBeUndefined();
  });
});
