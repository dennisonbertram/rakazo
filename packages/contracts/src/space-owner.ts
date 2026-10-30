/** Better Auth stores multiple roles comma-joined, so "owner,admin" is an owner. */
export function isSpaceOwnerRole(role: string | null | undefined): boolean {
  return role?.split(",").some((r) => r.trim() === "owner") ?? false;
}
