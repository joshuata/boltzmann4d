// Always-on integer counters the engine bumps in its hot paths. They are cheap enough to
// leave in production builds and explain where time goes: events by type, predictions,
// calendar rescans. Benchmarks and the profile CLI print them; the UI may show them later.

export type Counters = Record<string, number>;

/** A counters object whose keys are fixed up front, so the hot path never adds properties. */
export function createCounters<K extends string>(...names: K[]): Record<K, number> {
  return Object.fromEntries(names.map((name) => [name, 0])) as Record<K, number>;
}

export function resetCounters(counters: Counters): void {
  for (const name of Object.keys(counters)) counters[name] = 0;
}
