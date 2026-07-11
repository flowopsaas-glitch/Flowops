/**
 * World-class password strength validation.
 *
 * Requirements (NIST 800-63B inspired, adapted for SA market):
 *   - Minimum 8 characters
 *   - At least 1 uppercase letter
 *   - At least 1 lowercase letter
 *   - At least 1 number
 *   - At least 1 special character
 *   - Not a commonly breached password
 *   - Not the same as the email address
 *
 * Returns { valid: boolean, errors: string[] }
 */

// Top 50 most common passwords (immediately rejected)
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  'qwerty', 'abc123', 'monkey', '1234567', 'letmein', 'trustno1',
  'dragon', 'baseball', 'iloveyou', 'master', 'sunshine', 'ashley',
  'michael', 'football', 'shadow', '123123', '654321', 'passw0rd',
  'welcome', 'welcome1', 'admin', 'admin123', 'login', 'login123',
  'changeme', 'test123', 'guest', 'qwerty123', 'password1!',
  'flowops', 'flowops123', 'courier', 'courier123', 'logistics',
  'delivery', 'driver', 'dispatch', 'waybill', 'parcel',
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

export function validatePasswordStrength(
  password: string,
  email?: string,
): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This password is too common. Please choose a more unique password');
  }

  // Check if password contains the email
  if (email) {
    const emailLocal = email.split('@')[0]?.toLowerCase();
    if (emailLocal && emailLocal.length > 3 && password.toLowerCase().includes(emailLocal)) {
      errors.push('Password should not contain your email address');
    }
  }

  // Calculate strength
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 16) score++;

  const strength: PasswordValidationResult['strength'] =
    score <= 2 ? 'weak' : score <= 3 ? 'fair' : score <= 4 ? 'good' : 'strong';

  return {
    valid: errors.length === 0,
    errors,
    strength,
  };
}
