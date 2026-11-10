import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import { seededRandom } from './scenes';
import { Simulation, type InitialState } from './simulation';
import { ArenaType } from './simulation-info';

async function withWells(
  preset: string,
  radiusMultiplier: number,
  depths: number[],
): Promise<InitialState> {
  const { scenario } = loadSetFile(await loadPresetText(preset), { random: seededRandom(4) });
  return { ...scenario, wells: { radiusMultiplier, depths } };
}

/** Runs `events` events, then moves everyone to the last event's time. */
function run(sim: Simulation, events: number): void {
  let last = 0;
  for (let k = 0; k < events; k++) last = sim.step()!.time;
  sim.advanceToTime(last);
}

describe('square wells', () => {
  it.each([
    ['default', 2.0, [2.0]],
    ['2Dmixture', 1.5, [4.0, 1.0]],
    ['2Dmixture', 3.0, [8.0, 8.0]], // deep: pairs often can't climb out
  ] as const)('%s, λ = %f: kinetic + well energy is conserved', async (preset, lambda, depths) => {
    const sim = new Simulation(await withWells(preset, lambda, [...depths]));
    const total = sim.kineticEnergy() + sim.potentialEnergy();
    run(sim, 20_000);
    const after = sim.kineticEnergy() + sim.potentialEnergy();
    expect(after / total).toBeCloseTo(1, 9);
    expect(sim.pairsInWells().length).toBeGreaterThan(0);
  });

  it("tracks exactly the pairs that are inside each other's well", async () => {
    const lambda = 2.0;
    const sim = new Simulation(await withWells('default', lambda, [2.0]));
    run(sim, 20_000);
    const p = sim.particles;
    const inside = new Set(sim.pairsInWells().map(([a, b]) => `${a},${b}`));
    for (let a = 0; a < p.count; a++) {
      for (let b = a + 1; b < p.count; b++) {
        const d = Math.hypot(p.x[a]! - p.x[b]!, p.y[a]! - p.y[b]!);
        const well = lambda * (p.radius[a]! + p.radius[b]!);
        // Away from the well's edge (round-off), the bookkeeping must agree with distance.
        if (d < well * (1 - 1e-9)) expect(inside.has(`${a},${b}`), `${a},${b} inside`).toBe(true);
        if (d > well * (1 + 1e-9)) expect(inside.has(`${a},${b}`), `${a},${b} outside`).toBe(false);
      }
    }
  });

  it('deeper wells heat the gas as pairs bind', async () => {
    const shallow = new Simulation(await withWells('default', 2.0, [0.5]));
    const deep = new Simulation(await withWells('default', 2.0, [5.0]));
    const start = shallow.kineticEnergy();
    run(shallow, 30_000);
    run(deep, 30_000);
    expect(deep.kineticEnergy()).toBeGreaterThan(shallow.kineticEnergy());
    expect(deep.kineticEnergy()).toBeGreaterThan(start);
  });

  it('are ignored on periodic arenas, as in Java', async () => {
    const init = { ...(await withWells('default', 2.0, [5.0])) };
    const periodic = new Simulation({ ...init, arenaType: ArenaType.PERIODIC_BOUNDARIES });
    run(periodic, 5_000);
    expect(periodic.pairsInWells()).toEqual([]);
    expect(periodic.potentialEnergy()).toBe(0);
  });
});
