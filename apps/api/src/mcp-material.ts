import type { McpServerConfigInput } from "@rakazo/contracts";

/** Shape of the encrypted MCP credential blob. `oauth` holds SDK OAuth state
 * (tokens, client registration, PKCE verifier) managed by McpOAuthBroker. */
export type McpSecretMaterial = {
  secret?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: Record<string, unknown>;
};

export type McpMaterialUpdate =
  | { action: "keep" }
  | { action: "store"; material: McpSecretMaterial };

/** Compute the next encrypted credential blob for an MCP server update.
 *
 * - "keep": the update carries no credential data; leave the stored blob as is.
 * - "store": rewrite the blob. An empty material means credentials were
 *   cleared entirely — the caller should delete the secret row and null the
 *   server's secretId instead of storing an empty object.
 *
 * env/headers use full-replace semantics (the update payload is the complete
 * set), matching the create handler. OAuth state is never touched here except
 * that clearCredential preserves it so a connected server stays connected. */
export function buildMcpUpdateMaterial(
  existing: McpSecretMaterial,
  config: McpServerConfigInput,
): McpMaterialUpdate {
  const clearing = config.clearCredential === true;
  if (clearing) {
    return { action: "store", material: existing.oauth ? { oauth: existing.oauth } : {} };
  }
  const secret = "secret" in config && config.secret ? config.secret : undefined;
  const env = "env" in config ? config.env : undefined;
  const headers = "headers" in config ? config.headers : undefined;
  const existingHasMaterial = Boolean(
    existing.secret ||
      (existing.env && Object.keys(existing.env).length > 0) ||
      (existing.headers && Object.keys(existing.headers).length > 0) ||
      existing.oauth,
  );
  const suppliesMaterial = Boolean(
    secret || (env && Object.keys(env).length > 0) || (headers && Object.keys(headers).length > 0),
  );
  if (!existingHasMaterial && !suppliesMaterial) return { action: "keep" };
  return {
    action: "store",
    material: {
      ...existing,
      ...(secret ? { secret } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(headers !== undefined ? { headers } : {}),
    },
  };
}
