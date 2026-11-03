import type { PrismaClient } from "@rakazo/db";

/**
 * Lowercased subset of `addresses` the user protects: marked important, or saved in Contacts.
 * Reply guards and corrections ask this one function; the safety guards replace its body to add
 * their own rules.
 */
export async function protectedSenders(
  prisma: Pick<PrismaClient, "inboxSenderFeedback" | "contact">,
  scope: { spaceId: string; userId: string },
  addresses: string[],
): Promise<Set<string>> {
  const lower = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (lower.length === 0) return new Set();
  const [marked, contacts] = await Promise.all([
    prisma.inboxSenderFeedback.findMany({
      where: { ...scope, mark: "important", senderAddress: { in: lower } },
      select: { senderAddress: true },
    }),
    prisma.contact.findMany({
      where: {
        ...scope,
        OR: lower.map((address) => ({ email: { equals: address, mode: "insensitive" as const } })),
      },
      select: { email: true },
    }),
  ]);
  return new Set([
    ...marked.map((m) => m.senderAddress),
    ...contacts.flatMap((c) => (c.email ? [c.email.toLowerCase()] : [])),
  ]);
}
