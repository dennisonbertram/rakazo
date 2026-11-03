import { describe, expect, it } from "vitest";
import { redactForModel } from "./redact-for-model.js";

describe("redactForModel", () => {
  it("replaces Luhn-valid card numbers, with or without separators", () => {
    expect(redactForModel("Card 4111111111111111 expires soon")).toBe("Card [card] expires soon");
    expect(redactForModel("Use 4111 1111 1111 1111.")).toBe("Use [card].");
    expect(redactForModel("4111-1111-1111-1111")).toBe("[card]");
    expect(redactForModel("amex 378282246310005")).toBe("amex [card]");
  });

  it("keeps digit runs that are not card numbers", () => {
    expect(redactForModel("Order 4111111111111112 shipped")).toContain("4111111111111112");
    expect(redactForModel("Order #123456789012 ships Tuesday")).toContain("123456789012");
    expect(redactForModel("Call 415 555 0132 or 2026-11-03")).toBe(
      "Call 415 555 0132 or 2026-11-03",
    );
  });

  it("replaces the value after a password, passcode or PIN label", () => {
    expect(redactForModel("Your password: hunter2 is set")).toBe("Your password: [secret] is set");
    expect(redactForModel("Passcode = 884213x")).toBe("Passcode = [secret]");
    expect(redactForModel("PIN: 4821")).toBe("PIN: [secret]");
    expect(redactForModel("password is reset")).toBe("password is reset");
  });

  it("keeps one-time codes", () => {
    expect(redactForModel("Your verification code is 482913")).toBe(
      "Your verification code is 482913",
    );
  });
});
