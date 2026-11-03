const CARD_RUN = /\b\d(?:[ -]?\d){12,18}\b/g;
const LABELLED_SECRET = /(\b(?:password|passcode|pin)\s*[:=]\s*)\S+/gi;

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Removes what a background model call should never see in a mail snippet: Luhn-valid card numbers
 * (13 to 19 digits, spaces or dashes allowed) and the value after "password:", "passcode:" or
 * "PIN:". One-time codes stay: they expire in minutes and are what marks security mail.
 */
export function redactForModel(text: string): string {
  return text
    .replace(CARD_RUN, (run) => (luhnValid(run.replace(/\D/g, "")) ? "[card]" : run))
    .replace(LABELLED_SECRET, "$1[secret]");
}
