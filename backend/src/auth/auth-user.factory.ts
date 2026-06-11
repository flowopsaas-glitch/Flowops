import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * Generates a strong, user-friendly password.
 * Used for AI-generated passwords on signup.
 */
export function generatePassword(length = 16): string {
  const charset =
    'ABCDEFGHJKLMNPQRSTUVWXYZ' + // no confusing O/I
    'abcdefghijkmnopqrstuvwxyz' +
    '23456789' +                  // no 0/1
    '!@#$%^&*_-+=';

  const bytes = randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }

  return password;
}

/**
 * Hashes a plain-text password using bcryptjs.
 */
export async function hashPassword(
  plainPassword: string,
  saltRounds = 12,
): Promise<string> {
  return bcrypt.hash(plainPassword, saltRounds);
}

/**
 * Compares a plain password to a stored bcrypt hash.
 */
export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}
