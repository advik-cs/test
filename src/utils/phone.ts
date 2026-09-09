/**
 * Phone Number Normalization and Validation Utilities
 * Ensures robust handling of mobile numbers entered with spaces, hyphens,
 * optional leading zeroes, or missing country code (+91 default for Indian numbers).
 */

/**
 * Normalizes an input mobile number by:
 * 1. Removing whitespace, dashes, dots, and parentheses
 * 2. Prefixing default country code (+91) if 10 digits starting with 6-9
 * 3. Stripping leading trunk zero (e.g. 09876543201 -> +919876543201)
 * 4. Handling missing '+' if country code is present (e.g. 919876543201 -> +919876543201)
 */
export function normalizeMobileNumber(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Strip all whitespace, hyphens, brackets, dots
  let cleaned = input.replace(/[\s\-().]/g, '').trim();

  // If starts with 0 and followed by 10 digits starting with 6-9 (Indian mobile trunk prefix)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned.slice(1)}`;
  }

  // If exactly 10 digits starting with 6-9 (standard Indian mobile without country code)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // If starts with 91 and 10 digits (missing leading +)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // If starts with + and digits, keep as is
  if (/^\+\d{10,15}$/.test(cleaned)) {
    return cleaned;
  }

  return cleaned;
}

/**
 * Generates an array of potential database lookup candidates for a given mobile number
 * to handle any format differences between user entry and seeded records.
 */
export function getMobileLookupVariants(input: string): string[] {
  const normalized = normalizeMobileNumber(input);
  const raw = input.trim();
  const variants = new Set<string>();

  if (normalized) variants.add(normalized);
  if (raw) variants.add(raw);

  // If normalized has +91, also check 10-digit raw and 91-prefixed
  if (normalized.startsWith('+91') && normalized.length === 13) {
    const tenDigit = normalized.slice(3);
    variants.add(tenDigit);
    variants.add(`0${tenDigit}`);
    variants.add(`91${tenDigit}`);
  }

  return Array.from(variants);
}
