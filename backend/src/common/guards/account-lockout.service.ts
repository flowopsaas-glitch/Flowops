import { Injectable, Logger } from '@nestjs/common';

/**
 * Account lockout protection — prevents brute-force attacks.
 *
 * After N failed login attempts within a time window, the account is
 * temporarily locked. Uses an in-memory store (Redis-backed in production
 * would be ideal, but this works for single-instance VPS deployments).
 *
 * Configuration:
 *   MAX_ATTEMPTS = 5 failed attempts
 *   LOCKOUT_DURATION = 15 minutes
 *   WINDOW = 15 minutes (attempts older than this are forgotten)
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  // In-memory store: email → { attempts: timestamp[], lockedUntil?: Date }
  private store = new Map<string, { attempts: number[]; lockedUntil?: number }>();

  /**
   * Check if an account is currently locked.
   * Returns { locked: boolean, remainingSeconds?: number, message?: string }
   */
  isLocked(email: string): { locked: boolean; remainingSeconds?: number; message?: string } {
    const key = email.toLowerCase().trim();
    const entry = this.store.get(key);

    if (!entry?.lockedUntil) return { locked: false };

    const now = Date.now();
    if (now < entry.lockedUntil) {
      const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return {
        locked: true,
        remainingSeconds,
        message: `Account temporarily locked due to too many failed login attempts. Try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
      };
    }

    // Lockout expired — clear it
    this.store.delete(key);
    return { locked: false };
  }

  /**
   * Record a failed login attempt.
   * Returns true if the account is now locked.
   */
  recordFailure(email: string): boolean {
    const key = email.toLowerCase().trim();
    const now = Date.now();
    const windowStart = now - AccountLockoutService.WINDOW_MS;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { attempts: [] };
      this.store.set(key, entry);
    }

    // Remove attempts older than the window
    entry.attempts = entry.attempts.filter(t => t > windowStart);

    // Add current attempt
    entry.attempts.push(now);

    // Check if we've exceeded the threshold
    if (entry.attempts.length >= AccountLockoutService.MAX_ATTEMPTS) {
      entry.lockedUntil = now + AccountLockoutService.LOCKOUT_DURATION_MS;
      this.logger.warn(
        `Account locked: ${key} — ${entry.attempts.length} failed attempts in ${AccountLockoutService.WINDOW_MS / 60000}min window`,
      );
      return true;
    }

    return false;
  }

  /**
   * Clear lockout on successful login.
   */
  recordSuccess(email: string): void {
    this.store.delete(email.toLowerCase().trim());
  }

  /**
   * Get the number of remaining attempts before lockout.
   */
  remainingAttempts(email: string): number {
    const key = email.toLowerCase().trim();
    const entry = this.store.get(key);
    if (!entry) return AccountLockoutService.MAX_ATTEMPTS;

    const now = Date.now();
    const windowStart = now - AccountLockoutService.WINDOW_MS;
    const recentAttempts = entry.attempts.filter(t => t > windowStart).length;

    return Math.max(0, AccountLockoutService.MAX_ATTEMPTS - recentAttempts);
  }

  /**
   * Periodic cleanup of expired entries (call from a cron or interval).
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - AccountLockoutService.WINDOW_MS;

    for (const [key, entry] of this.store.entries()) {
      // Remove if lockout expired and no recent attempts
      if (entry.lockedUntil && entry.lockedUntil < now) {
        this.store.delete(key);
        continue;
      }
      // Remove if all attempts are old
      entry.attempts = entry.attempts.filter(t => t > windowStart);
      if (entry.attempts.length === 0 && !entry.lockedUntil) {
        this.store.delete(key);
      }
    }
  }
}
