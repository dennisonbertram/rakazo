import type { MailApproval } from "@rakazo/contracts";

/**
 * Where a finished mail card's message lives in Gmail: the Sent folder or Drafts of its account
 * (the address in /u/ picks the Google account). A card that has not finished, or names no account,
 * has no place yet. ponytail: the card records no message or draft id, so this opens the folder.
 */
export function gmailFolderUrl(mail: Pick<MailApproval, "account" | "outcome">): string | null {
  if (!mail.account || (mail.outcome !== "sent" && mail.outcome !== "saved")) return null;
  const folder = mail.outcome === "sent" ? "sent" : "drafts";
  return `https://mail.google.com/mail/u/${encodeURIComponent(mail.account)}/#${folder}`;
}
