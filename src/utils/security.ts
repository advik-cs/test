import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a candidate plaintext password with a bcrypt hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hashes a national ID or Aadhaar number for data privacy.
 * Never stores plaintext identity numbers in the database.
 * Normalizes by removing whitespace, hyphens, and dots, then retains only the last 4 digits.
 */
export function hashIdentity(identityNumber: string): {
  hash: string;
  last4: string;
} {
  // Strip whitespace, hyphens, and dots to normalize formatting variations (e.g. 1234 5678 9012 vs 123456789012)
  const cleaned = identityNumber.replace(/[\s\-.]/g, '').trim();
  const last4 = cleaned.length >= 4 ? cleaned.slice(-4) : cleaned.padStart(4, '0');
  const hash = bcrypt.hashSync(cleaned, SALT_ROUNDS);
  return { hash, last4 };
}

/**
 * Compares an identity number against the stored hash, testing both normalized and raw variants
 */
export function compareIdentity(identityNumber: string, hash: string): boolean {
  const cleaned = identityNumber.replace(/[\s\-.]/g, '').trim();
  return bcrypt.compareSync(cleaned, hash) || bcrypt.compareSync(identityNumber.trim(), hash);
}
