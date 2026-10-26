import type { MailApproval } from "@rakazo/contracts";

/**
 * Where a finished mail card's message lives in Gmail (the address in /u/ picks the Google account):
 * the sent conversation when the server recorded its id, else the Sent folder or Drafts. A card that
 * has not finished, or names no account, has no place yet. ponytail: a saved draft opens Drafts,
 * because Gmail's compose= parameter takes an id the API does not return.
 */
export function gmailFolderUrl(
  mail: Pick<MailApproval, "account" | "outcome" | "threadId" | "messageId">,
): string | null {
  if (!mail.account || (mail.outcome !== "sent" && mail.outcome !== "saved")) return null;
  const base = `https://mail.google.com/mail/u/${encodeURIComponent(mail.account)}/`;
  if (mail.outcome === "saved") return `${base}#drafts`;
  const id = mail.threadId || mail.messageId;
  return id ? `${base}#all/${encodeURIComponent(id)}` : `${base}#sent`;
}
