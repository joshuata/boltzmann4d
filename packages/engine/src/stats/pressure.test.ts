import { describe, expect, it } from 'vitest';
import { loadPresetScenario, resolveScenario } from '../scenario';
import { Collision } from '../sim/event';
import { seededRandom } from '../sim/scenes';
import { Simulation, type InitialSpecies, type InitialState } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { BOLTZMANN_CONST } from './formulas';
import { PressureMeter, type PressureReading } from './pressure';

const AMU_KG = 1.660538782e-27;
const nm = 1e-9;
const ps = 1e-12;

interface Group {
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
function gas(
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
      expect(r * 2).toBeLessThan(Math.min(cx, cy));
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

/** A simulation with a meter attached through both event hooks. */
function metered(init: InitialState, averagingTime?: number) {
  let meter: PressureMeter | null = null;
  const simulation = new Simulation(init, {
    onEvent: (e) => meter?.beforeEvent(e),
    afterEvent: (e) => meter?.afterEvent(e),
  });
  meter = new PressureMeter(simulation, init.species.length, averagingTime);
  return { simulation, meter };
}

/** Runs `warmup`, then averages readings taken every `every` seconds for `duration`. */
function averageReadings(
  simulation: Simulation,
  meter: PressureMeter,
  { warmup, duration, every }: { warmup: number; duration: number; every: number },
): PressureReading {
  simulation.advanceToTime(simulation.time + warmup);
  const readings: PressureReading[] = [];
  const end = simulation.time + duration;
  while (simulation.time < end - every / 2) {
    simulation.advanceToTime(simulation.time + every);
    readings.push(meter.read());
  }
  const mean = (pick: (r: PressureReading) => number[]) =>
    pick(readings[0]!).map(
      (_, k) => readings.reduce((s, r) => s + pick(r)[k]!, 0) / readings.length,
    );
  const first = readings[0]!;
  return {
    ...first,
    regions: first.regions.map((region, r) => ({
      region: region.region,
      measured: mean((x) => x.regions[r]!.measured),
      ideal: mean((x) => x.regions[r]!.ideal),
      real: mean((x) => x.regions[r]!.real),
    })),
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('PressureMeter', () => {
  it('measures one particle bouncing between the side walls exactly', () => {
    // 2 amu at 1000 m/s along x in a 10 × 10 nm box: a round trip every 2 (L − 2r) / v.
    const r = 0.5 * nm;
    const init: InitialState = {
      dimension: 2,
      arenaType: ArenaType.REFLECTING_BOUNDARIES,
      arenaXSize: 10 * nm,
      arenaYSize: 10 * nm,
      arenaZSize: 0,
      species: [
        {
          type: { particleMass: 2, particleRadius: r },
          positions: Float64Array.of(5 * nm, 5 * nm, 0),
          velocities: Float64Array.of(1000, 0, 0),
        },
      ],
    };
    const roundTrip = (2 * (10 * nm - 2 * r)) / 1000;
    const { simulation, meter } = metered(init, 10 * roundTrip);
    expect(meter.read().warmingUp).toBe(true);
    expect(meter.read().regions[0]!.measured[0]).toBeNaN();
    // After 10 round trips from the middle, each wall has been hit 10 times.
    simulation.advanceToTime(10 * roundTrip);
    const reading = meter.read();
    expect(reading.method).toBe('wall');
    expect(reading.unit).toBe('µN/m');
    expect(reading.warmingUp).toBe(false);
    // Each wall: 10 hits × 2 m v / (H − 2r), over the averaging time; the arena reads their mean.
    const perWall = (10 * 2 * 2 * AMU_KG * 1000) / (10 * nm - 2 * r) / (10 * roundTrip);
    expect(reading.regions[0]!.measured[0]).toBeCloseTo(perWall * 1e6, 6);
    // The prediction for one particle: 2 KE / (d A_eff) = m v² / A_eff.
    const ideal = (2 * AMU_KG * 1000 ** 2) / (10 * nm - 2 * r) ** 2 / 2;
    expect(reading.regions[0]!.ideal[0]).toBeCloseTo(ideal * 1e6, 6);
    // Alone, nothing to correct for.
    expect(reading.regions[0]!.real[0]).toBeCloseTo(reading.regions[0]!.ideal[0]!, 9);
  });

  it('warms up for one averaging time, including after it is lengthened', () => {
    const { simulation, meter } = metered(
      gas([{ count: 20, mass: 2, radius: 0.5, temperature: 300 }], [30, 30, 0]),
      20 * ps,
    );
    simulation.advanceToTime(10 * ps);
    expect(meter.read()).toMatchObject({ warmingUp: true, covered: 10 * ps });
    simulation.advanceToTime(25 * ps);
    expect(meter.read()).toMatchObject({ warmingUp: false });
    expect(meter.read().covered).toBeCloseTo(20 * ps, 20);
    meter.setAveragingTime(40 * ps);
    expect(meter.read().warmingUp).toBe(true);
    simulation.advanceToTime(35 * ps);
    expect(meter.read().covered).toBeCloseTo(30 * ps, 20);
    simulation.advanceToTime(46 * ps);
    expect(meter.read().warmingUp).toBe(false);
    // Shortening it takes effect at once.
    meter.setAveragingTime(10 * ps);
    expect(meter.read()).toMatchObject({ warmingUp: false, covered: 10 * ps });
  });

  it('only observes: events and final state are the same with and without it', () => {
    for (const arenaType of [ArenaType.REFLECTING_BOUNDARIES, ArenaType.PERIODIC_BOUNDARIES]) {
      const init = gas(
        [
          { count: 30, mass: 2, radius: 0.5, temperature: 300 },
          { count: 20, mass: 32, radius: 0.8, temperature: 300 },
        ],
        [40, 40, 0],
        { arenaType },
      );
      const record = (withMeter: boolean) => {
        const events: number[] = [];
        let meter: PressureMeter | null = null;
        const sim = new Simulation(init, {
          onEvent: (e) => {
            events.push(e.type, e.time, e.part1, e.part2);
            meter?.beforeEvent(e);
          },
          afterEvent: (e) => meter?.afterEvent(e),
        });
        if (withMeter) meter = new PressureMeter(sim, 2);
        sim.advanceToTime(50 * ps);
        meter?.read();
        return { events, x: Array.from(sim.particles.x), vx: Array.from(sim.particles.vx) };
      };
      expect(record(true)).toEqual(record(false));
    }
  });

  it('only counts hits on the left and right walls', () => {
    const init = gas([{ count: 10, mass: 2, radius: 0.5, temperature: 300 }], [20, 20, 0]);
    const { simulation, meter } = metered(init);
    let sideHits = 0;
    const counting = new Simulation(init, {
      afterEvent: (e) => {
        if (e.type === Collision.WALL && (e.side === 1 || e.side === 2)) sideHits++;
      },
    });
    counting.advanceToTime(30 * ps);
    simulation.advanceToTime(30 * ps);
    expect(sideHits).toBeGreaterThan(0);
    expect(meter.read().regions[0]!.measured[0]).toBeGreaterThan(0);
  });
});

// Seeded runs of whole gases: long enough to average out the noise, short enough for CI.
describe('PressureMeter on gases', () => {
  it('dilute ideal gas: P A ≈ N k T, and the partial pressures add up', () => {
    const init = gas(
      [
        { count: 40, mass: 2, radius: 0.2, temperature: 300 },
        { count: 40, mass: 32, radius: 0.2, temperature: 300 },
      ],
      [100, 100, 0],
      { seed: 3 },
    );
    const { simulation, meter } = metered(init, 200 * ps);
    const reading = averageReadings(simulation, meter, {
      warmup: 200 * ps,
      duration: 4000 * ps,
      every: 50 * ps,
    });
    const [arena] = reading.regions;
    // N k T / A for 80 particles at 300 K in 100 × 100 nm, in µN/m.
    const nkt = ((80 * BOLTZMANN_CONST * 300) / (100 * nm) ** 2) * 1e6;
    expect(sum(arena!.measured) / nkt).toBeCloseTo(1, 1);
    expect(sum(arena!.measured) / sum(arena!.ideal)).toBeCloseTo(1, 1);
    // Equal numbers at the same temperature: equal partial pressures, whatever the mass.
    expect(arena!.measured[0]! / arena!.measured[1]!).toBeCloseTo(1, 0);
  });

  it('STORY-13: partial pressures add up to the pressure of every hit', () => {
    const init = gas(
      [
        { count: 30, mass: 2, radius: 0.5, temperature: 300 },
        { count: 30, mass: 32, radius: 0.8, temperature: 300 },
      ],
      [50, 50, 0],
    );
    // Tally every side-wall hit independently of kinds.
    let meter: PressureMeter | null = null;
    let before = 0;
    let total = 0;
    const simulation = new Simulation(init, {
      onEvent: (e) => {
        meter?.beforeEvent(e);
        if (e.type === Collision.WALL && (e.side === 1 || e.side === 2))
          before = Math.abs(simulation.particles.vx[e.part1]!);
      },
      afterEvent: (e) => {
        meter?.afterEvent(e);
        if (e.type !== Collision.WALL || (e.side !== 1 && e.side !== 2)) return;
        const p = simulation.particles;
        const i = e.part1;
        total +=
          (p.mass[i]! * AMU_KG * (before + Math.abs(p.vx[i]!))) / (50 * nm - 2 * p.radius[i]!);
      },
    });
    meter = new PressureMeter(simulation, 2, 1000 * ps);
    simulation.advanceToTime(100 * ps);
    const measured = meter.read().regions[0]!.measured;
    expect(measured.every((p) => p > 0)).toBe(true);
    // The arena reads the mean of its two walls, over the 100 ps so far.
    expect(sum(measured) / ((total / 2 / (100 * ps)) * 1e6)).toBeCloseTo(1, 12);
  });

  it('STORY-8: the 1200 K side pushes about 4× as hard as the 300 K side', () => {
    const init = gas(
      [
        { count: 30, mass: 2, radius: 0.5, temperature: 300, side: 'left' },
        { count: 30, mass: 2, radius: 0.5, temperature: 1200, side: 'right' },
      ],
      [70, 50, 0],
      { arenaType: ArenaType.DIVIDED_ARENA, seed: 2 },
    );
    const { simulation, meter } = metered(init, 200 * ps);
    const reading = averageReadings(simulation, meter, {
      warmup: 100 * ps,
      duration: 3000 * ps,
      every: 50 * ps,
    });
    const [left, right] = reading.regions;
    expect(left!.region).toBe('left');
    expect(sum(right!.measured) / sum(left!.measured)).toBeGreaterThan(3.4);
    expect(sum(right!.measured) / sum(left!.measured)).toBeLessThan(4.6);
    // Each side's prediction follows its own temperature.
    expect(sum(right!.ideal) / sum(left!.ideal)).toBeCloseTo(4, 0);
    expect(sum(left!.measured) / sum(left!.real)).toBeCloseTo(1, 1);
  });

  it('STORY-10 (2Dpresnum): the right side reads about half the left', async () => {
    const init = resolveScenario(await loadPresetScenario('2Dpresnum'), {
      random: seededRandom(4),
    });
    const { simulation, meter } = metered(init, 1000 * ps);
    const reading = averageReadings(simulation, meter, {
      warmup: 100 * ps,
      duration: 3000 * ps,
      every: 100 * ps,
    });
    const [left, right] = reading.regions;
    const ratio = sum(right!.measured) / sum(left!.measured);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
    expect(sum(right!.measured) / sum(right!.real)).toBeCloseTo(1, 1);
  });

  it('periodic arenas read the virial pressure, which tracks the Real prediction', () => {
    // A dense gas, so the Real prediction differs clearly from the Ideal one.
    const init = gas([{ count: 100, mass: 2, radius: 1, temperature: 300 }], [40, 40, 0], {
      arenaType: ArenaType.PERIODIC_BOUNDARIES,
      seed: 5,
    });
    const { simulation, meter } = metered(init, 60 * ps);
    simulation.advanceToTime(1500 * ps);
    const reading = meter.read();
    expect(reading.method).toBe('virial');
    const [arena] = reading.regions;
    const real = sum(arena!.real);
    const ideal = sum(arena!.ideal);
    expect(real / ideal).toBeGreaterThan(1.3);
    expect(sum(arena!.measured) / real).toBeCloseTo(1, 1);
  });

  it('3D: P V ≈ N k T in MPa', () => {
    const init = gas([{ count: 60, mass: 4, radius: 0.2, temperature: 300 }], [20, 20, 20], {
      dimension: 3,
      seed: 6,
    });
    const { simulation, meter } = metered(init, 100 * ps);
    const reading = averageReadings(simulation, meter, {
      warmup: 50 * ps,
      duration: 2000 * ps,
      every: 50 * ps,
    });
    expect(reading.unit).toBe('MPa');
    const [arena] = reading.regions;
    expect(arena!.measured[0]! / arena!.ideal[0]!).toBeCloseTo(1, 1);
  });
});
