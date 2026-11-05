import { describe, expect, it } from "vitest";
import { resolveDuplicateEffectGate } from "./approval-effect.js";
import {
  approvedMailOutcome,
  isCardMailSend,
  mailApprovalAgentNote,
  mailSendRefusal,
} from "./mail-approval-recovery.js";

describe("approvedMailOutcome", () => {
  it("is sent or saved when the tool succeeded", () => {
    expect(approvedMailOutcome("mail_send", { ok: true })).toEqual({ outcome: "sent" });
    expect(approvedMailOutcome("mail_draft", { ok: true, draftId: "d1" })).toEqual({
      outcome: "saved",
    });
  });

  it("is not sent, with the reason, when the tool failed before sending", () => {
    expect(approvedMailOutcome("mail_send", { error: "No connected mail account" })).toEqual({
      outcome: "failed",
      error: "No connected mail account",
    });
  });

  it("is unknown when the send may have gone out", () => {
    expect(
      approvedMailOutcome("mail_send", {
        error: "The send may or may not have gone out. Check the Sent folder before trying again.",
      }),
    ).toEqual({ outcome: "unknown" });
  });
});

describe("mailSendRefusal", () => {
  const reply = {
    to: ["Sam <sam@example.test>"],
    subject: "Re: Tuesday",
    body: "Hi Sam",
    replyToId: "m1",
  };
  const effect = (status: string, result: unknown, request: unknown = reply, runId = "r1") => ({
    runId,
    status,
    request,
    result,
  });

  it("allows a first send", () => {
    expect(mailSendRefusal(reply, [], "r1")).toBeUndefined();
  });

  it("refuses a second card after the user edited and sent the reply themselves", () => {
    const sent = effect("denied", { note: mailApprovalAgentNote(true, "sent"), outcome: "sent" });
    const again = { ...reply, body: "Hi Sam, 10am works. Best, Alex" };
    expect(mailSendRefusal(again, [sent], "r1")).toMatch(/already sent/);
  });

  it("refuses any repeat of a card send stored as completed or uncertain", () => {
    const sent = effect("completed", {
      ok: true,
      note: mailApprovalAgentNote(true, "sent"),
      outcome: "sent",
    });
    const again = { ...reply, body: "Hi Sam, 10am works. Best, Alex" };
    expect(mailSendRefusal(again, [sent], "r1")).toMatch(/already sent/);
    const unknown = effect("uncertain", { error: "n", outcome: "unknown", uncertain: true });
    expect(mailSendRefusal(again, [unknown], "r1")).toMatch(/may not have gone out/);
  });

  it("names who the email went to and from which account, and reads as sent", () => {
    const note = mailApprovalAgentNote(true, "sent", false, {
      to: ["pat@example.test", "robin@example.test"],
      from: "me@example.test",
    });
    expect(note).toContain(
      "This email was sent to pat@example.test, robin@example.test from me@example.test.",
    );
    expect(note).toContain("Do not send it again.");
    expect(note).not.toMatch(/deni|declin|discard/i);
    expect(
      resolveDuplicateEffectGate({ status: "completed", result: { ok: true, note } }, "mail_send"),
    ).toEqual({ action: "return", result: { ok: true, note } });
  });

  it("tells a card send from a real denial, so one does not stop a different email", () => {
    expect(isCardMailSend({ note: "x", outcome: "sent" })).toBe(true);
    expect(isCardMailSend({ note: "x", outcome: "failed" })).toBe(true);
    expect(isCardMailSend({ note: mailApprovalAgentNote(true) })).toBe(true);
    expect(isCardMailSend({ note: mailApprovalAgentNote(true, undefined, false) })).toBe(true);
    expect(isCardMailSend({ note: mailApprovalAgentNote(false) })).toBe(true);
    expect(isCardMailSend(null)).toBe(false);
    expect(isCardMailSend({ note: "Skipped by the user." })).toBe(false);
  });

  it("refuses while the user's own send is still in flight", () => {
    const claimed = effect("denied", { note: mailApprovalAgentNote(true) });
    expect(mailSendRefusal(reply, [claimed], "r1")).toMatch(/may not have gone out/);
  });

  it("refuses after an approved send went out, matching a new message by people and subject", () => {
    const newMail = { to: ["robin@example.test"], subject: "Pricing", body: "Hi" };
    const sent = effect("completed", { ok: true }, newMail);
    expect(mailSendRefusal({ ...newMail, subject: "Re: pricing" }, [sent], "r1")).toMatch(
      /already sent/,
    );
  });

  it("allows a retry after a failed send, and a different reply", () => {
    expect(mailSendRefusal(reply, [effect("completed", { error: "boom" })], "r1")).toBeUndefined();
    expect(
      mailSendRefusal({ ...reply, replyToId: "m2" }, [effect("completed", { ok: true })], "r1"),
    ).toBeUndefined();
  });

  it("refuses a discarded email again in the same run, but not after the user speaks again", () => {
    const discarded = effect("denied", { error: "denied" });
    expect(mailSendRefusal(reply, [discarded], "r1")).toMatch(/discarded/);
    expect(mailSendRefusal(reply, [discarded], "r2")).toBeUndefined();
  });

  it("allows a correction email with different text, and a follow-up in a later run", () => {
    const sent = effect("completed", { ok: true });
    expect(mailSendRefusal({ ...reply, body: "Correction: 11am" }, [sent], "r1")).toBeUndefined();
    expect(mailSendRefusal(reply, [sent], "r2")).toBeUndefined();
  });

  it("reports an in-flight or uncertain send as uncertain, never as sent", () => {
    for (const status of ["executing", "uncertain"]) {
      const refusal = mailSendRefusal(reply, [effect(status, {})], "r1");
      expect(refusal).toMatch(/may not have been sent/);
      expect(refusal).not.toMatch(/tell the user it was sent/);
    }
    const unknown = effect("denied", {
      note: mailApprovalAgentNote(true, "unknown"),
      outcome: "unknown",
    });
    expect(mailSendRefusal(reply, [unknown], "r1")).toMatch(/may not have gone out/);
  });

  it("refuses a placeholder signature", () => {
    expect(mailSendRefusal({ ...reply, body: "Thanks,\n[Your Name]" }, [], "r1")).toMatch(
      /\[Your Name\]/,
    );
  });
});
