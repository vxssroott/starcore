// src/integrations/rateLimiter.ts

const buckets = new Map<string, { tokens: number; last: number }>();

export function allow(key: string, rate = 10, per = 1000) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: rate, last: now };
  const elapsed = now - b.last;
  const refill = Math.floor(elapsed / per) * rate;
  b.tokens = Math.min(rate, b.tokens + refill);
  b.last = now;
  if (b.tokens > 0) {
    b.tokens -= 1;
    buckets.set(key, b);
    return true;
  }
  buckets.set(key, b);
  return false;
}
