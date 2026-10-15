import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * Validate email format server-side.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  // Standard email format validation regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed) && trimmed.length <= 254;
}

/**
 * Validate password requirements server-side:
 * Minimum 8 characters, contains at least one letter and one number.
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required." };
  }
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain both letters and numbers." };
  }
  return { valid: true };
}

/**
 * Hash password with bcrypt cost >= 12.
 * Plaintext and hash are never stored or logged in plaintext.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify plaintext password against stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Dummy hash used for constant-time uniform response timing
 * when a user is not found in the database.
 */
const DUMMY_HASH = "$2a$12$e80MvQn4L6qA5g5K2V8M2.eE1I4v5Qv9l6n7p8q9r0s1t2u3v4w5x";

export async function dummyVerify(password: string): Promise<boolean> {
  try {
    await bcrypt.compare(password, DUMMY_HASH);
  } catch {
    // ignore
  }
  return false;
}
