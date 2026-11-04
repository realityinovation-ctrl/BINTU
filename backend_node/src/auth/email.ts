/** NFKC, case folding, and removal of every whitespace character. */

export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

export function isUsableEmail(value: string): boolean {
  const email = normalizeEmail(value);
  const at = email.indexOf("@");
  return at > 0 && at < email.length - 1 && !email.includes("@", at + 1);
}
