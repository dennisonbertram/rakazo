import { describe, expect, it } from "vitest";
import { commandForLayer, redact } from "./proof.js";

describe("proof harness", () => {
  it("keeps layers independently runnable", () => {
    expect(commandForLayer("api").args).toContain("--suite=api");
    expect(commandForLayer("worker").args).toContain("--suite=worker");
    expect(commandForLayer("web").args.join(" ")).toContain("bot-crud.spec.ts");
    expect(commandForLayer("desktop").args).toContain("test:e2e");
  });

  it("redacts credential-shaped values from proof logs", () => {
    expect(redact("token=abc123 Bearer xyz")).toBe("token=[redacted] Bearer [redacted]");
  });
});
