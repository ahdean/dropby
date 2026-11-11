/**
 * US phone numbers (the only country supported for now).
 *
 * `normalizeUsPhone` accepts whatever a person types, "(202) 555-0123",
 * "202.555.0123", "+1 202 555 0123", and returns the E.164 form Supabase
 * expects ("+12025550123"), or null if it is not a valid US number.
 */

const E164_US = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  const e164 = `+1${national}`;
  // Area codes and exchanges never start with 0 or 1.
  return E164_US.test(e164) ? e164 : null;
}

export function isValidUsPhone(input: string): boolean {
  return normalizeUsPhone(input) !== null;
}

/** "+12025550123" → "(202) 555-0123". Anything else is returned unchanged. */
export function formatUsPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return e164;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** Format progressively while the person is typing: "2025" → "(202) 5". */
export function formatUsPhoneInput(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
