import { describe, expect, it } from "vitest";
import { generateToken, hashToken, PAT_PREFIX } from "./mcp-connections.js";

describe("personal access tokens", () => {
  it("has the praci_pat_ format with at least 256 random bits", () => {
    const { token } = generateToken();
    expect(token).toMatch(/^praci_pat_[A-Za-z0-9_-]{43,}$/);
    expect(Buffer.from(token.slice(PAT_PREFIX.length), "base64url")).toHaveLength(32);
  });

  it("stores a sha256 hash and a short prefix, never the token", () => {
    const { token, tokenHash, tokenPrefix } = generateToken();
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(token.startsWith(tokenPrefix)).toBe(true);
    expect(tokenPrefix).toHaveLength(PAT_PREFIX.length + 4);
  });

  it("is different every time", () => {
    expect(generateToken().token).not.toBe(generateToken().token);
  });
});
