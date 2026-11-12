import { describe, expect, it } from 'vitest';
import { loadPresetText, loadSetFile } from '../io';
import type { ReactionRule } from '../sim/reactions';
import { seededRandom, syntheticGas } from '../sim/scenes';
import { Simulation, type InitialSpecies, type InitialState } from '../sim/simulation';
import { ReactionMeter } from './reaction-meter';

const empty = new Float64Array(0);
const emptyCopy = (s: InitialSpecies): InitialSpecies => ({
  ...s,
  positions: empty,
  velocities: empty,
});

/** A simulation with a meter watching it. */
function metered(init: InitialState): { sim: Simulation; meter: ReactionMeter } {
  let meter: ReactionMeter | null = null;
  const sim = new Simulation(init, {
    onEvent: (event) => meter?.beforeEvent(event),
    afterEvent: (event) => meter?.afterEvent(event),
  });
  meter = new ReactionMeter(sim, init.reactions ?? [], init.species.length);
  return { sim, meter };
}

function run(sim: Simulation, events: number): void {
  let last = sim.time;
  for (let k = 0; k < events; k++) last = sim.step()!.time;
  sim.advanceToTime(last);
}

function recount(sim: Simulation, kinds: number): number[] {
  const n = new Array<number>(kinds).fill(0);
  for (const c of sim.particles.color) n[c]!++;
  return n;
}

async function preset(name: string, seed: number): Promise<InitialState> {
  return loadSetFile(await loadPresetText(name), { random: seededRandom(seed) }).scenario;
}

describe('ReactionMeter', () => {
  it('keeps the counts, and when each was first reached, without recounting', async () => {
    const { sim, meter } = metered(await preset('2Dequil', 3));
    const first = meter.read();
    expect(first.counts).toEqual([50, 0]);
    expect(first.averages.every(Number.isNaN)).toBe(true);
    for (let k = 0; k < 20; k++) {
      run(sim, 2_000);
      expect(meter.read().counts).toEqual(recount(sim, 2));
    }
    const { firstReached, counts, time } = meter.read();
    const reached = firstReached[1]!;
    expect(reached.length).toBeGreaterThan(counts[1]!);
    expect(reached[0]).toBe(0);
    // Two products form at once, so 1 and 2 are reached together, and later counts later.
    expect(reached[1]).toBeGreaterThan(0);
    expect(reached[2]).toBe(reached[1]);
    for (let n = 1; n < reached.length; n++)
      expect(reached[n]).toBeGreaterThanOrEqual(reached[n - 1]!);
    expect(reached.at(-1)).toBeLessThanOrEqual(time);
  });

  it('averages counts over time and starts again when reset', async () => {
    const { sim, meter } = metered(await preset('2Dequil', 4));
    run(sim, 20_000);
    const reading = meter.read();
    // Every particle is A or B, at every moment.
    expect(reading.averages[0]! + reading.averages[1]!).toBeCloseTo(50, 9);
    expect(reading.widths[0]).toBeCloseTo(reading.widths[1]!, 6);
    meter.resetAverages(sim.time);
    expect(meter.read().averagingSince).toBe(sim.time);
    expect(meter.read().averages.every(Number.isNaN)).toBe(true);
    run(sim, 100);
    expect(meter.read().averages[1]).toBeGreaterThan(0);
  });

  it.each([
    ['2Dequil', 13.37],
    ['3Dequil', 16.35], // the preset runs at 382 K (see predictions.md, PRED-14)
  ])(
    '%s: the long-run average comes close to the prediction (STORY-26)',
    async (name, predicted) => {
      const init = await preset(name, 11);
      expect(init.reactions).toHaveLength(1);
      const { sim, meter } = metered(init);
      const { prediction } = meter.read();
      expect(prediction?.product).toBe(1);
      expect(prediction?.average).toBeCloseTo(predicted, 1);
      run(sim, 150_000); // equilibrate
      meter.resetAverages(sim.time);
      run(sim, 1_500_000);
      const reading = meter.read();
      // Energy is conserved, so the prediction stays put.
      expect(reading.prediction!.average).toBeCloseTo(prediction!.average, 6);
      // A long average: within a tenth of a width (the fluctuations are about 3).
      expect(Math.abs(reading.averages[1]! - prediction!.average)).toBeLessThan(
        0.15 * prediction!.width + 0.3,
      );
      expect(reading.widths[1]! / prediction!.width).toBeCloseTo(1, 0.6);
    },
    60_000,
  );

  it('counts chained A → B → C rules, without a prediction (STORY-33)', () => {
    const gas = syntheticGas({ count: 120, seed: 5, packing: 0.12 });
    const a = gas.species[0]!;
    const rules: ReactionRule[] = [
      { reactants: [0, 0], products: [1, 1], forward: 1, reverse: 1, suppressReverse: true },
      { reactants: [1, 1], products: [2, 2], forward: 1, reverse: 1, suppressReverse: true },
    ];
    const { sim, meter } = metered({
      ...gas,
      species: [a, emptyCopy(a), emptyCopy(a)],
      reactions: rules,
    });
    const n = sim.particles.count;
    expect(meter.read().prediction).toBeNull();
    expect(meter.read().noPrediction).toMatch(/single reaction/);
    let peakB = 0;
    for (let k = 0; k < 60; k++) {
      run(sim, 2_000);
      const { counts } = meter.read();
      expect(counts).toEqual(recount(sim, 3));
      peakB = Math.max(peakB, counts[1]!);
    }
    const { counts } = meter.read();
    // A falls, B rises and then falls, C rises.
    expect(counts[0]).toBeLessThan(n / 10);
    expect(peakB).toBeGreaterThan(counts[1]!);
    expect(counts[2]).toBeGreaterThan(n / 2);
  });

  it('gives no prediction with the reverse reaction suppressed', async () => {
    const init = await preset('2Dequil', 3);
    const rule = { ...init.reactions![0]!, suppressReverse: true };
    const { meter } = metered({ ...init, reactions: [rule] });
    expect(meter.read().prediction).toBeNull();
    expect(meter.read().noPrediction).toMatch(/reverse/);
  });
});
