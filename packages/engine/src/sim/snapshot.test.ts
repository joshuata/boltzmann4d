import { describe, expect, it } from 'vitest';
import { Statistics } from '../stats/statistics';
import { statsContext } from '../stats/stats-context';
import { Collision } from './event';
import { syntheticGas } from './scenes';
import { Simulation, type InitialState } from './simulation';
import {
  EventRecorder,
  FreePathAccumulator,
  mergeBatches,
  replay,
  REVERSAL,
  speedsOf,
  type StateSnapshot,
} from './snapshot';

/** A simulation whose afterEvent feeds a recorder (as the worker chains it). */
function recording(init: InitialState, cap?: number) {
  const recorder = new EventRecorder(cap, 16);
  let stats: Statistics | null = null;
  const sim = new Simulation(init, {
    onEvent: (e) => stats?.notifyOfEvent(e),
    afterEvent: (e) => recorder.record(e, sim.particles),
  });
  stats = new Statistics(statsContext(init), sim.particles, { forgetMultiplier: 1e12 });
  return { sim, recorder, stats };
}

/** Frames until the batch holds at least `events` events. */
function advance(sim: Simulation, recorder: EventRecorder, events: number): StateSnapshot {
  while (recorder.count < events && !recorder.overflowed) sim.advanceToNextFrame();
  return { ...sim.stateSnapshot(0), events: recorder.take() };
}

describe('state snapshots and event batches', () => {
  it('replays a batch from one snapshot to the next', () => {
    const { sim, recorder } = recording(syntheticGas({ count: 60, seed: 3 }));
    sim.advanceToNextFrame();
    const a = sim.stateSnapshot(0);
    recorder.clear();
    const b = advance(sim, recorder, 2000);
    expect(b.events!.overflowed).toBe(false);
    expect(b.events!.count).toBeGreaterThanOrEqual(2000);

    const replayed = replay(a, b.events!, b.time);
    expect(Array.from(replayed.velocities)).toEqual(Array.from(b.velocities));
    expect(Array.from(replayed.colors)).toEqual(Array.from(b.colors));
    const size = sim.arena.xSize;
    for (let i = 0; i < b.positions.length; i++) {
      expect(Math.abs(replayed.positions[i]! - b.positions[i]!)).toBeLessThan(1e-9 * size);
    }
  });

  it('replays a reversal', () => {
    const { sim, recorder } = recording(syntheticGas({ count: 30, seed: 5 }));
    sim.advanceToNextFrame();
    const a = sim.stateSnapshot(0);
    recorder.clear();
    for (let f = 0; f < 20; f++) sim.advanceToNextFrame();
    sim.reverse();
    recorder.recordReversal(sim.time);
    for (let f = 0; f < 20; f++) sim.advanceToNextFrame();
    const b = { ...sim.stateSnapshot(0), events: recorder.take() };
    expect(b.events.type).toContain(REVERSAL);
    expect(Array.from(replay(a, b.events, b.time).velocities)).toEqual(Array.from(b.velocities));
  });

  it('caps a batch and says it overflowed', () => {
    const { sim, recorder } = recording(syntheticGas({ count: 60 }), 100);
    while (!recorder.overflowed) sim.advanceToNextFrame();
    expect(recorder.full).toBe(true);
    const batch = recorder.take();
    expect(batch.count).toBe(100);
    expect(batch.overflowed).toBe(true);
    expect(batch.time.length).toBe(100);
    expect(batch.v1.length).toBe(300);
    // Taking empties it.
    expect(recorder.count).toBe(0);
    expect(recorder.overflowed).toBe(false);
  });

  it('merges batches in order', () => {
    const { sim, recorder } = recording(syntheticGas({ count: 40 }));
    const first = advance(sim, recorder, 50).events!;
    const second = advance(sim, recorder, 50).events!;
    const merged = mergeBatches(first, second);
    expect(merged.count).toBe(first.count + second.count);
    expect(Array.from(merged.time)).toEqual([...first.time, ...second.time]);
    expect(Array.from(merged.v2.subarray(3 * first.count))).toEqual(Array.from(second.v2));
    for (let k = 1; k < merged.count; k++) {
      expect(merged.time[k]).toBeGreaterThanOrEqual(merged.time[k - 1]!);
    }
  });

  it('counts the same particle collisions as the statistics', () => {
    const { sim, recorder, stats } = recording(syntheticGas({ count: 50, seed: 2 }));
    const b = advance(sim, recorder, 3000);
    const collisions = b.events!.type.filter((t) => t === Collision.PARTICLE).length;
    expect(collisions).toBe(sim.counters.particleCollisions);
    // Each particle collision completes a path for both particles.
    const sums = new Float64Array(3);
    let paths = 0;
    for (const tracker of stats.recorder('PATH').cumulativeByType) {
      tracker.writeSums(sums, 0);
      paths += sums[0]!;
    }
    expect(paths).toBe(2 * collisions);
  });

  it('accumulates free paths that match the built-in Path Length', () => {
    const { sim, recorder, stats } = recording(syntheticGas({ count: 50, seed: 7 }));
    const acc = new FreePathAccumulator();
    sim.advanceToNextFrame(); // the first frame shows the starting state
    acc.add({ ...sim.stateSnapshot(1), events: recorder.take() });
    for (let s = 0; s < 5; s++) acc.add({ ...advance(sim, recorder, 500), run: 1 });

    const sums = new Float64Array(3);
    let weight = 0;
    let sum = 0;
    for (const tracker of stats.recorder('PATH').cumulativeByType) {
      tracker.writeSums(sums, 0);
      weight += sums[0]!;
      sum += sums[1]!;
    }
    expect(acc.count).toBe(weight);
    expect(acc.mean / 1e-9).toBeCloseTo(sum / weight, 9);
  });

  it('starts over on a new run', () => {
    const { sim, recorder } = recording(syntheticGas({ count: 30 }));
    const acc = new FreePathAccumulator();
    sim.advanceToNextFrame();
    acc.add({ ...sim.stateSnapshot(1), events: recorder.take() });
    acc.add({ ...advance(sim, recorder, 300), run: 1 });
    expect(acc.count).toBeGreaterThan(0);
    acc.add({ ...advance(sim, recorder, 300), run: 2 });
    expect(acc.count).toBe(0);
  });

  it('leaves the physics unchanged', () => {
    const init = syntheticGas({ count: 60, seed: 11 });
    const plain = new Simulation(init);
    const { sim } = recording(init);
    for (let f = 0; f < 200; f++) {
      plain.advanceToNextFrame();
      sim.advanceToNextFrame();
      sim.stateSnapshot(0);
    }
    expect(sim.time).toBe(plain.time);
    expect(Array.from(sim.particles.x)).toEqual(Array.from(plain.particles.x));
    expect(Array.from(sim.particles.vy)).toEqual(Array.from(plain.particles.vy));
    expect(sim.counters.events).toBe(plain.counters.events);
  });

  it('gives speeds', () => {
    const { sim } = recording(syntheticGas({ count: 10 }));
    const s = sim.stateSnapshot(0);
    const p = sim.particles;
    expect(Array.from(speedsOf(s))).toEqual(
      Array.from({ length: p.count }, (_, k) => Math.hypot(p.vx[k]!, p.vy[k]!, p.vz[k]!)),
    );
  });
});
