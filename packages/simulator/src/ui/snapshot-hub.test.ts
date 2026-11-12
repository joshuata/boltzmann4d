import { describe, expect, it } from 'vitest';
import type { StateSnapshot } from '@boltzmann4d/engine/sim';
import type { SnapshotMessage } from '../worker';
import { SnapshotHub } from './snapshot-hub';

function message(run: number, time: number, constants = false): SnapshotMessage {
  return {
    run,
    time,
    dimension: 2,
    count: 1,
    positions: new Float64Array(3),
    velocities: new Float64Array(3),
    types: new Uint16Array(1),
    colors: new Uint16Array(1),
    ...(constants ? { masses: Float64Array.of(run), radii: Float64Array.of(1e-9) } : {}),
  };
}

describe('SnapshotHub', () => {
  it('calls every listener once per snapshot, in order, with the run’s constants', () => {
    const errors: string[] = [];
    const hub = new SnapshotHub((e) => errors.push(e));
    const seen: StateSnapshot[] = [];
    const remove = hub.add((s) => seen.push(s));
    // Several snapshots in one task, as when the main thread is busy.
    let latest: StateSnapshot | null = null;
    for (const m of [message(1, 0, true), message(1, 1), message(1, 2), message(2, 0, true)]) {
      latest = hub.receive(m) ?? latest;
    }
    expect(seen.map((s) => [s.run, s.time])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
    ]);
    expect(seen[2]!.masses[0]).toBe(1);
    expect(seen[3]!.masses[0]).toBe(2);
    expect(latest?.time).toBe(0);
    expect(latest?.run).toBe(2);
    remove();
    hub.receive(message(2, 1));
    expect(seen).toHaveLength(4);
    expect(errors).toEqual([]);
  });

  it('keeps going when a listener throws', () => {
    const errors: string[] = [];
    const hub = new SnapshotHub((e) => errors.push(e));
    const times: number[] = [];
    hub.add(() => {
      throw new Error('boom');
    });
    hub.add((s) => times.push(s.time));
    hub.receive(message(1, 0, true));
    hub.receive(message(1, 1));
    expect(times).toEqual([0, 1]);
    expect(errors).toEqual(['Snapshot listener: boom', 'Snapshot listener: boom']);
  });

  it('drops a snapshot whose run’s constants never came', () => {
    const hub = new SnapshotHub(() => {});
    expect(hub.receive(message(3, 0))).toBeNull();
  });
});
