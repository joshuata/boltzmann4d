// Parity with the Java app (plan 0002). Each fixture in ./parity was written by
// boltzmann3d's ParityDump (`ant parity-dump`, see src/sim/parity/README.md): the exact
// initial state Java loaded, every event Java performed over whole frames, and the final
// state. The TypeScript engine must reproduce them bit for bit.
import { describe, expect, it } from 'vitest';
import { Simulation, type InitialState } from './simulation';
import type { PistonMode } from './piston';
import { ArenaType } from './simulation-info';

interface ParityFixture {
  preset: string;
  generator: string;
  dimension: 1 | 2 | 3;
  arenaType: ArenaType;
  arenaXSize: number;
  arenaYSize: number;
  arenaZSize: number;
  holeDiameter: number;
  maxwellDemonMode: boolean;
  dividerThermalMode: 'INSULATING' | 'CONDUCTING';
  species: {
    name: string;
    mass: number;
    radius: number;
    positions: number[];
    velocities: number[];
  }[];
  /** Square-well scenarios. */
  wells?: { radiusMultiplier: number; depths: number[] };
  frameDuration: number;
  frames: number;
  /** Run-time actions, applied just before the given frame (scenario fixtures). */
  actions?: ([number, 'movePiston', number, PistonMode, number] | [number, 'stopPiston'])[];
  /** Piston and thermostat state at the end. */
  piston?: { curLevel: number; targetLevel: number; deltaKE: number; thermostatEnabled: boolean };
  time: number;
  /** [type, time, part1, part2, side] per event, in order. */
  events: [number, number, number, number, number][];
  final: { x: number[]; y: number[]; vx: number[]; vy: number[] };
}

const fixtures = import.meta.glob<ParityFixture>('./parity/*.json', { import: 'default' });
const SUPPORTED = new Set<string>([
  ArenaType.REFLECTING_BOUNDARIES,
  ArenaType.PERIODIC_BOUNDARIES,
  ArenaType.DIVIDED_ARENA,
  ArenaType.DIVIDED_ARENA_WITH_HOLE,
  ArenaType.MOVABLE_PISTON,
]);

function initialState(f: ParityFixture): InitialState {
  return {
    dimension: f.dimension,
    arenaType: f.arenaType,
    arenaXSize: f.arenaXSize,
    arenaYSize: f.arenaYSize,
    arenaZSize: f.arenaZSize,
    holeDiameter: f.holeDiameter,
    maxwellDemonMode: f.maxwellDemonMode,
    dividerThermalMode: f.dividerThermalMode,
    wells: f.wells,
    species: f.species.map((s) => ({
      type: { particleMass: s.mass, particleRadius: s.radius },
      positions: Float64Array.from(s.positions),
      velocities: Float64Array.from(s.velocities),
    })),
  };
}

describe('parity with the Java app', () => {
  const entries = Object.entries(fixtures).sort(([a], [b]) => a.localeCompare(b));
  expect(entries.length).toBeGreaterThan(0);

  for (const [path, load] of entries) {
    const name = path.replace(/^.*\//, '').replace(/\.json$/, '');

    it(name, async (context) => {
      const f = await load();
      if (!SUPPORTED.has(f.arenaType) || f.dimension !== 2) {
        context.skip(`${f.dimension}D ${f.arenaType} is not ported yet`);
      }
      const events: number[][] = [];
      const sim = new Simulation(initialState(f), {
        frameDuration: f.frameDuration,
        onEvent: (e) => events.push([e.type, e.time, e.part1, e.part2, e.side]),
      });
      sim.advanceToNextFrame(); // the first call only creates the first frame, as in Java
      for (let i = 0; i < f.frames; i++) {
        for (const action of f.actions ?? []) {
          if (action[0] !== i) continue;
          if (action[1] === 'movePiston') sim.movePiston(action[2], action[3], action[4]);
          else sim.stopPiston();
        }
        sim.advanceToNextFrame();
      }

      expect(events.length).toBe(f.events.length);
      // Compare event by event so a failure names the first divergence.
      for (let i = 0; i < f.events.length; i++) {
        expect(events[i], `event ${i}`).toEqual(f.events[i]);
      }
      expect(sim.time).toBe(f.time);
      const p = sim.particles;
      expect(Array.from(p.x)).toEqual(f.final.x);
      expect(Array.from(p.y)).toEqual(f.final.y);
      expect(Array.from(p.vx)).toEqual(f.final.vx);
      expect(Array.from(p.vy)).toEqual(f.final.vy);
      if (sim.piston && f.piston) {
        expect(sim.piston.curLevel).toBe(f.piston.curLevel);
        expect(sim.piston.targetLevel).toBe(f.piston.targetLevel);
        expect(sim.thermostat.deltaKE).toBe(f.piston.deltaKE);
        expect(sim.thermostat.enabled).toBe(f.piston.thermostatEnabled);
      }
    });
  }
});
