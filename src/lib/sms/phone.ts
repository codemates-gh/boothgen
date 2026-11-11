// Phone numbers for texting. US and Canada numbers may be typed with or without +1 and with any
// punctuation: "202-999-6431", "(202) 999 6431", "1 202 999 6431" and "+12029996431" all become +12029996431.
// Numbers starting with + are taken as international E.164.
const E164 = /^\+[1-9]\d{6,14}$/;
const NANP = /^[2-9]\d{2}[2-9]\d{6}$/; // area code and exchange can't start with 0 or 1

export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    const n = '+' + digits;
    if (!E164.test(n)) return null;
    return n.startsWith('+1') && !NANP.test(n.slice(2)) ? null : n;
  }
  if (digits.length === 10 && NANP.test(digits)) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1') && NANP.test(digits.slice(1))) return '+' + digits;
  return null;
}

export const PHONE_HINT = 'Enter a US or Canada number like 202-555-0123, or an international number starting with +';
