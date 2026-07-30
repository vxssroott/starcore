// src/integrations/circuit.ts

const states = new Map<string, { failures: number; openUntil: number | null }>();

export function recordFailure(key: string) {
  const now = Date.now();
  const s = states.get(key) ?? { failures: 0, openUntil: null };
  s.failures += 1;
  if (s.failures >= 5) {
    s.openUntil = now + 60_000; // open for 60s
  }
  states.set(key, s);
}

export function recordSuccess(key: string) {
  states.delete(key);
}

export function isOpen(key: string) {
  const s = states.get(key);
  if (!s) return false;
  if (s.openUntil && Date.now() < s.openUntil) return true;
  return false;
}
