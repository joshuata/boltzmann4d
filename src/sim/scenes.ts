// Synthetic starting states for tests, benchmarks and profiling: a gas on a jittered grid
// (so nothing starts overlapping) with random directions, deterministic for a given seed.
import type { InitialState } from './simulation';
import { ArenaType } from './simulation-info';

/** Small seeded PRNG (mulberry32) so runs are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticGasOptions {
  count: number;
  arenaType?: ArenaType;
  seed?: number;
  /** Fraction of the arena area covered by particles; default 0.1. */
  packing?: number;
}

/** `count` particles of two species (2 and 32 amu, 0.5 and 0.8 nm) at about 300 K speeds. */
export function syntheticGas({
  count,
  arenaType = ArenaType.REFLECTING_BOUNDARIES,
  seed = 1,
  packing = 0.1,
}: SyntheticGasOptions): InitialState {
  const random = seededRandom(seed);
  const types = [
    { particleMass: 2, particleRadius: 0.5e-9, speed: 1579 },
    { particleMass: 32, particleRadius: 0.8e-9, speed: 395 },
  ];
  const meanArea = Math.PI * ((0.5e-9 + 0.8e-9) / 2) ** 2;
  const side = Math.sqrt((count * meanArea) / packing);
  const cols = Math.ceil(Math.sqrt(count));
  const cell = side / cols;
  const positions = types.map(() => [] as number[]);
  const velocities = types.map(() => [] as number[]);
  for (let k = 0; k < count; k++) {
    const t = k % 2;
    const type = types[t]!;
    const jitter = (cell - 2 * type.particleRadius) * 0.4;
    positions[t]!.push(
      ((k % cols) + 0.5) * cell + (random() - 0.5) * jitter,
      (Math.floor(k / cols) + 0.5) * cell + (random() - 0.5) * jitter,
      0,
    );
    const theta = random() * 2 * Math.PI;
    velocities[t]!.push(Math.cos(theta) * type.speed, Math.sin(theta) * type.speed, 0);
  }
  return {
    dimension: 2,
    arenaType,
    arenaXSize: side,
    arenaYSize: side,
    arenaZSize: 0,
    species: types.map((type, t) => ({
      type,
      positions: Float64Array.from(positions[t]!),
      velocities: Float64Array.from(velocities[t]!),
    })),
  };
}
