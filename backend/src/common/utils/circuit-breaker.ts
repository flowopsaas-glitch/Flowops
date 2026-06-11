export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly name: string,
    private readonly failureThreshold = 3,
    private readonly resetTimeoutMs = 30000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit [${this.name}] is OPEN - failing fast`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() { return this.state; }
  getFailures() { return this.failures; }
}

export const groqBreaker = new CircuitBreaker('groq', 3, 30000);
export const cloudflareBreaker = new CircuitBreaker('cloudflare-ai', 3, 30000);
export const sendgridBreaker = new CircuitBreaker('sendgrid', 5, 60000);
export const whatsappBreaker = new CircuitBreaker('whatsapp', 5, 60000);
export const neutrinoBreaker = new CircuitBreaker('neutrino', 3, 30000);
export const maptilerBreaker = new CircuitBreaker('maptiler', 3, 30000);
