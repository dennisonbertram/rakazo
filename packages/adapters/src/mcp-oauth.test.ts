import { auth, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { describe, expect, it } from "vitest";
import { PendingProvider } from "./mcp-oauth.js";

describe("MCP OAuth", () => {
  it("dynamically registers then redirects when no client credentials were supplied", async () => {
    const endpoint = "https://mcp.example.test/mcp";
    const provider = new PendingProvider("http://localhost:5173/mcp/oauth/callback", "state-456");
    provider.saveDiscoveryState({
      authorizationServerUrl: "https://auth.example.test",
      resourceMetadata: { resource: endpoint, authorization_servers: ["https://auth.example.test"] },
      authorizationServerMetadata: {
        authorization_endpoint: "https://auth.example.test/authorize",
        token_endpoint: "https://auth.example.test/token",
        registration_endpoint: "https://auth.example.test/register",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
      },
    } as OAuthDiscoveryState);
    let registrationBody: Record<string, unknown> | undefined;

    await expect(auth(provider, {
      serverUrl: endpoint,
      fetchFn: async (_url, init) => {
        registrationBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          client_id: "registered-client-id",
          redirect_uris: ["http://localhost:5173/mcp/oauth/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    })).resolves.toBe("REDIRECT");

    expect(registrationBody).toMatchObject({ client_name: "Rakazo", application_type: "native" });
    expect(provider.authorizationUrl?.searchParams.get("client_id")).toBe("registered-client-id");
  });

  it("redirects a pre-registered Brex client to the Brex authorization endpoint without dynamic registration", async () => {
    const endpoint = "https://api.brex.com/mcp";
    const provider = new PendingProvider(
      "http://localhost:5173/mcp/oauth/callback",
      "state-123",
      { client_id: "brex-client-id", client_secret: "brex-client-secret" },
    );
    expect((provider.clientMetadata as Record<string, unknown>).application_type).toBe("native");
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
