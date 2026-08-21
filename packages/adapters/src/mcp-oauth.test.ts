import { auth, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { describe, expect, it } from "vitest";
import { PendingProvider } from "./mcp-oauth.js";

describe("MCP OAuth", () => {
  it("redirects a pre-registered Brex client to the Brex authorization endpoint without dynamic registration", async () => {
    const endpoint = "https://api.brex.com/mcp";
    const provider = new PendingProvider(
      "http://localhost:5173/mcp/oauth/callback",
      "state-123",
      { client_id: "brex-client-id", client_secret: "brex-client-secret" },
    );
    provider.saveDiscoveryState({
      authorizationServerUrl: "https://accounts-api.brex.com/oauth2/default",
      resourceMetadata: { resource: endpoint, authorization_servers: ["https://accounts-api.brex.com/oauth2/default"] },
      authorizationServerMetadata: {
        authorization_endpoint: "https://accounts-api.brex.com/oauth2/default/v1/authorize",
        token_endpoint: "https://accounts-api.brex.com/oauth2/default/v1/token",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
      },
    } as OAuthDiscoveryState);

    await expect(auth(provider, { serverUrl: endpoint })).resolves.toBe("REDIRECT");
    expect(provider.authorizationUrl?.origin).toBe("https://accounts-api.brex.com");
    expect(provider.authorizationUrl?.pathname).toBe("/oauth2/default/v1/authorize");
    expect(provider.authorizationUrl?.searchParams.get("client_id")).toBe("brex-client-id");
    expect(provider.authorizationUrl?.searchParams.get("redirect_uri")).toBe("http://localhost:5173/mcp/oauth/callback");
    expect(provider.authorizationUrl?.searchParams.get("state")).toBe("state-123");
    expect(provider.authorizationUrl?.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
