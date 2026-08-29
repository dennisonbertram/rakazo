import {
  parseSendBlueInbound,
  type SendBlueInboundMessage,
  type SendBlueOutboundStatus,
} from "@rakazo/adapters";
import { timingSafeStringEqual } from "@rakazo/core";
import type { Hono } from "hono";
import { readBoundedBody, WEBHOOK_MAX_BODY_BYTES } from "./webhook.js";

export const PHONE_WEBHOOK_PATH = "/api/v1/phone/webhook";

export type PhoneWebhookDeps = {
  signingSecret: string;
  handle: (event: SendBlueInboundMessage) => Promise<void>;
  handleStatus?: (event: SendBlueOutboundStatus) => Promise<void>;
};

/**
 * SendBlue's account-wide inbound webhook. Verification is the vendor's
 * static shared secret (no HMAC available), compared in constant time;
 * replay safety comes from the `phone:{message_handle}` client nonce
 * downstream. Mounted only when the phone surface is enabled.
 */
export function mountPhoneWebhookRoutes(app: Hono, deps: PhoneWebhookDeps) {
  app.post(PHONE_WEBHOOK_PATH, async (c) => {
    // Uniform 401: missing and wrong secrets are indistinguishable.
    if (!timingSafeStringEqual(c.req.header("sb-signing-secret"), deps.signingSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const raw = await readBoundedBody(c.req.raw, WEBHOOK_MAX_BODY_BYTES);
    if (raw === null) {
      return c.json({ error: "Payload too large" }, 413);
    }

    let payload: unknown = null;
    try {
      payload = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    const event = parseSendBlueInbound(payload);
    // Always 200: SendBlue retries 3x on 5xx, and non-message events
    // (call logs, typing indicators) are not actionable here.
    if (event?.type === "message") {
      await deps.handle(event);
    } else if (event?.type === "status") {
      await deps.handleStatus?.(event);
    }
    return c.json({ ok: true });
  });
}
