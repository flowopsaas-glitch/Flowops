/**
 * CRON MUTEX — Prevents overlapping cron job execution.
 *
 * Usage:
 *   private readonly mutex = new CronMutex('webhook-retries');
 *
 *   @Cron(CronExpression.EVERY_MINUTE)
 *   async processRetries() {
 *     if (!this.mutex.acquire()) return; // Skip if previous run still executing
 *     try { await this.doWork(); }
 *     finally { this.mutex.release(); }
 *   }
 */
export class CronMutex {
  private running = false;
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Try to acquire the lock. Returns false if already held. */
  acquire(): boolean {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  /** Release the lock. */
  release(): void {
    this.running = false;
  }

  /** Whether the cron is currently executing. */
  isRunning(): boolean {
    return this.running;
  }
}
