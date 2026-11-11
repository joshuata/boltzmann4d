// Test scenes for the statistics tests: gases of chosen groups of particles, placed on a
// jittered grid with every particle of a group at the same speed in a random direction.
import { seededRandom } from '../sim/scenes';
import type { InitialSpecies, InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { BOLTZMANN_CONST } from './formulas';

const AMU_KG = 1.660538782e-27;
const nm = 1e-9;

export interface Group {
  count: number;
  /** amu. */
  mass: number;
  /** nm. */
  radius: number;
  /** K: speeds are all sqrt(2kT/m) in 2D (sqrt(3kT/m) in 3D), in random directions. */
  temperature: number;
  /** Which part of the arena the group starts in. */
  side?: 'left' | 'right';
}

/**
 * A gas of the given groups on a jittered grid, each group a species, in an arena of
 * `size` nm. Deterministic for a seed.
 */
export function gas(
  groups: Group[],
  size: [number, number, number],
  {
    dimension = 2,
    arenaType = ArenaType.REFLECTING_BOUNDARIES as ArenaType,
    seed = 1,
  }: { dimension?: number; arenaType?: ArenaType; seed?: number } = {},
): InitialState {
  const random = seededRandom(seed);
  const [x, y, z] = size.map((s) => s * nm) as [number, number, number];
  const species: InitialSpecies[] = groups.map((g) => {
    const r = g.radius * nm;
    const xMin = g.side === 'right' ? x / 2 + 0.2 * nm : 0;
    const xMax = g.side === 'left' ? x / 2 - 0.2 * nm : x;
    const width = xMax - xMin;
    // A grid with a few more cells than particles, each cell holding at most one.
    const perAxis = Math.ceil(Math.pow(g.count, 1 / dimension)) + 1;
    const cells: number[][] = [];
    for (let i = 0; i < perAxis; i++)
      for (let j = 0; j < perAxis; j++)
        for (let k = 0; k < (dimension === 3 ? perAxis : 1); k++) cells.push([i, j, k]);
    const positions: number[] = [];
    const velocities: number[] = [];
    const speed = Math.sqrt((dimension * BOLTZMANN_CONST * g.temperature) / (g.mass * AMU_KG));
    for (let n = 0; n < g.count; n++) {
      const [i, j, k] = cells.splice(Math.floor(random() * cells.length), 1)[0]!;
      const cx = width / perAxis;
      const cy = y / perAxis;
      const cz = z / perAxis;
      const jitter = () => (random() - 0.5) * 0.2;
      positions.push(
        xMin + (i! + 0.5 + jitter()) * cx,
        (j! + 0.5 + jitter()) * cy,
        dimension === 3 ? (k! + 0.5 + jitter()) * cz : 0,
      );
      if (dimension === 3) {
        const cos = 2 * random() - 1;
        const sin = Math.sqrt(1 - cos * cos);
        const phi = 2 * Math.PI * random();
        velocities.push(speed * sin * Math.cos(phi), speed * sin * Math.sin(phi), speed * cos);
      } else {
        const theta = 2 * Math.PI * random();
        velocities.push(speed * Math.cos(theta), speed * Math.sin(theta), 0);
      }
      if (r * 2 >= Math.min(cx, cy)) throw new Error('particles too large for their grid cells');
    }
    return {
      type: { particleMass: g.mass, particleRadius: r },
      positions: Float64Array.from(positions),
      velocities: Float64Array.from(velocities),
      initialTemperature: g.temperature,
    };
  });
  return {
    dimension: dimension as 2 | 3,
    arenaType,
    arenaXSize: x,
    arenaYSize: y,
    arenaZSize: z,
    species,
  };
}
