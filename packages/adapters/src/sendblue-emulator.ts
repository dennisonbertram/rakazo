interface SentMessage {
  kind: "dm" | "group";
  to?: string;
  groupId?: string;
  body: string;
  handle: string;
}

interface RegisteredGroup {
  name: string | null;
  participants: string[];
}

export interface EmulatorInboundInput {
  fromNumber: string;
  content: string;
  groupId?: string;
  participants?: string[];
  handle?: string;
  mediaUrl?: string;
}

/**
 * Deterministic SendBlue boundary emulator: serves the vendor API over an
 * injected fetch, records outbound sends, and builds signed inbound webhook
 * requests for end-to-end journeys.
 */
export class SendBlueEmulator {
  readonly signingSecret = "test-signing-secret";
  readonly phoneNumber = "+15550009999";
  readonly sent: SentMessage[] = [];
  readonly typingIndicators: string[] = [];
  private handleCounter = 0;
  private readonly groups = new Map<string, RegisteredGroup>();

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname !== "api.sendblue.com") {
      throw new Error(`SendBlue emulator received unexpected URL ${url}`);
    }
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/send-message" && method === "POST") {
      const body = parseBody(init?.body);
      const handle = this.nextHandle();
      this.sent.push({
        kind: "dm",
        to: String(body.number ?? ""),
        body: String(body.content ?? ""),
        handle,
      });
      return Response.json({ message_handle: handle });
    }
    if (url.pathname === "/api/send-typing-indicator" && method === "POST") {
      const body = parseBody(init?.body);
      if (typeof body.number !== "string" || !body.number) {
        return Response.json({ status: "ERROR", message: "number is required" }, { status: 400 });
      }
      this.typingIndicators.push(body.number);
      return Response.json({ status: "SENT" });
    }
    if (url.pathname === "/api/send-group-message" && method === "POST") {
      const body = parseBody(init?.body);
      const handle = this.nextHandle();
      this.sent.push({
        kind: "group",
        groupId: String(body.group_id ?? ""),
        body: String(body.content ?? ""),
        handle,
      });
      return Response.json({ message_handle: handle });
    }
    const groupMatch = url.pathname.match(/^\/api\/v2\/groups\/([^/]+)$/);
    if (groupMatch && method === "GET") {
      const groupId = decodeURIComponent(groupMatch[1]!);
      const group = this.groups.get(groupId);
      if (!group) {
        return Response.json({ status: "ERROR", message: "Group not found" }, { status: 404 });
      }
      return Response.json({
        group_id: groupId,
        group_display_name: group.name,
        participants: group.participants,
      });
    }
    throw new Error(`SendBlue emulator received unexpected request ${method} ${url.pathname}`);
  };

  private nextHandle(): string {
    this.handleCounter += 1;
    return `emulated-handle-${this.handleCounter}`;
  }

  registerGroup(groupId: string, group: RegisteredGroup): void {
    this.groups.set(groupId, group);
  }

  /** A webhook request exactly as SendBlue would deliver it (static secret header). */
  buildInboundRequest(input: EmulatorInboundInput): Request {
    return new Request("https://rakazo.test/api/v1/phone/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sb-signing-secret": this.signingSecret,
      },
      body: JSON.stringify({
        content: input.content,
        is_outbound: false,
        status: "RECEIVED",
        message_handle: input.handle ?? this.nextHandle(),
        from_number: input.fromNumber,
        sendblue_number: this.phoneNumber,
        media_url: input.mediaUrl ?? "",
        group_id: input.groupId ?? "",
        participants: input.participants ?? [input.fromNumber, this.phoneNumber],
        group_display_name: null,
      }),
    });
  }
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== "string" || !body) return {};
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
