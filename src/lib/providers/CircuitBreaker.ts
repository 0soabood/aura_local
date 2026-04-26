/**
 * Per-provider circuit breaker.
 *
 * States:
 *   CLOSED  — normal operation, calls pass through
 *   OPEN    — provider tripped; calls fail fast until cooldown expires
 *
 * Trips after `threshold` consecutive failures; auto-resets after `cooldownMs`.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly name: string,
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  get isOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      const remainS = Math.ceil((this.openUntil - Date.now()) / 1000);
      throw new Error(
        `[CircuitBreaker] ${this.name} is OPEN — retry in ${remainS}s`,
      );
    }

    try {
      const result = await fn();
      this.failures = 0; // reset on success
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openUntil = Date.now() + this.cooldownMs;
        this.failures = 0;
        console.warn(
          `[CircuitBreaker] ${this.name} tripped after ${this.threshold} failures — ` +
          `cooling down for ${this.cooldownMs / 1000}s`,
        );
      }
      throw err;
    }
  }

  /** Force-reset for tests or manual recovery */
  reset() {
    this.failures = 0;
    this.openUntil = 0;
  }
}
