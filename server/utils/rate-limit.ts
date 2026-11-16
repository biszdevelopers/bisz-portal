type Window = {
  count: number;
  resetAt: number;
};

/**
 * Fixed-window limiter for single-process deployments.
 *
 * shortcut: this limiter is process-local; move to a shared store before
 * running more than one portal instance.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly maxKeys = 10_000;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()) {
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterMs: 0 };
    }
    if (existing.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, existing.resetAt - now),
      };
    }
    existing.count += 1;
    return {
      allowed: true,
      remaining: this.limit - existing.count,
      retryAfterMs: 0,
    };
  }

  prune(now = Date.now()) {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    if (this.windows.size <= this.maxKeys) return;
    for (const key of this.windows.keys()) {
      this.windows.delete(key);
      if (this.windows.size <= this.maxKeys) break;
    }
  }
}

export const rateLimits = {
  auth: new FixedWindowLimiter(60, 60_000),
  comments: new FixedWindowLimiter(30, 60_000),
  search: new FixedWindowLimiter(60, 60_000),
  push: new FixedWindowLimiter(10, 60_000),
  mutations: new FixedWindowLimiter(120, 60_000),
};

