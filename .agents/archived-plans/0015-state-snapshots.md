# 0015: State snapshots and event batches for custom statistics

_Done._ Tracked in joshuata/boltzmann4d#84. No dependencies.

## Goal

`SimulationClient` and `<Simulator>` expose a frame-synchronized state snapshot at a configurable rate, optionally with every event since the previous snapshot. Widgets and library users can then compute their own statistics on the main thread, including event-driven ones (free path, time per collision, time-weighted cumulative data) like the built-in plots of STAT-1 in `docs/specs/statistics.md`.

## Decisions

- **Snapshots plus event batches, not snapshots alone.** `Statistics.notifyOfEvent` needs every collision. A snapshot every N ms misses them, so snapshots by themselves only support instantaneous quantities. A previous snapshot plus every event's post-event velocities reconstructs every trajectory, because motion is ballistic between events.
- **Built-in statistics stay in the worker.** `Statistics` and `PressureMeter` are parity-checked and on the hot path. This API is additive, and porting a built-in statistic onto it is a later step.
- **Off by default, free when off.** The recorder is only chained into `afterEvent` while events are requested, and no snapshot messages are sent while the interval is `null`.
- **Two delivery paths.** `bind:snapshot` gives the latest value reactively. `onsnapshot` / `addSnapshotListener` is called synchronously once per snapshot, so accumulating consumers never lose a batch to Svelte coalescing updates.
- **`run` counter.** It bumps on load, restart and mid-run edits (which rebuild the simulation and can reorder particles), so accumulating consumers know to reset. Masses and radii are sent once per run and cached by the client, so every snapshot it hands out is complete.

## Steps

1. **Engine types and recorder.** Add `packages/engine/src/sim/snapshot.ts`, exported from `packages/engine/src/sim/index.ts`:
   - `StateSnapshot`: `run`, `time`, `dimension`, `count`, `positions` and `velocities` (3 per particle), `types`, `colors`, `masses`, `radii`, and an optional `events`.
   - `EventBatch`: `count`, `overflowed`, `time`, `type` (`Collision.*`), `part1`, `part2` (−1 when absent), and `v1` and `v2` (post-event velocities, 3 per event, NaN when absent).
   - `EventRecorder`: growable struct-of-arrays with a cap. `record(event, particles)`, and `take()` hands out the buffers for transfer.
   - `mergeBatches`, `speedsOf`, `kineticEnergiesOf`, and `FreePathAccumulator` (records each particle's free path between `PARTICLE` events and resets on a `run` change).
   - Add a read-only `Simulation` method that synchronizes and fills a snapshot at a frame boundary, reusing what `currentState()` does in `packages/engine/src/sim/simulation.ts` and the `Particles` arrays (`x/y/z`, `vx/vy/vz`, `type`, `color`, `mass`, `radius`).
   - No DOM, no timers.
2. **Worker protocol.** In `packages/simulator/src/worker/index.ts`, add `ToWorker` `{ type: 'snapshots', intervalMs: number | null, events: boolean, eventCap?: number }` and `FromWorker` `{ type: 'snapshot', snapshot: StateSnapshot }`.
3. **Worker.** In `packages/simulator/src/worker/sim.worker.ts`:
   - `build()` chains `recorder.record` into `afterEvent` only when events are on, and toggling rebuilds the hook for the running simulation.
   - `start()` bumps `run`. Its frame callback posts a snapshot when `now - lastSnapshot >= intervalMs` or while paused/stepping, following the `PRESSURE_INTERVAL_MS` / `SUMMARY_INTERVAL_MS` pattern, with buffers transferred.
4. **Client.** In `packages/simulator/src/ui/simulation.svelte.ts`:
   - Add `snapshot = $state.raw<StateSnapshot | null>(null)`, `snapshotInterval`, `snapshotEvents`, `setSnapshotOptions(intervalMs, events)` and `addSnapshotListener(fn): () => void` (a `Set`).
   - In the `snapshot` case, fill in the cached masses and radii, call the listeners in order (catching a throwing listener and reporting it to `error`), then assign `snapshot`.
   - Resend the options after each load.
5. **Component.** In `packages/simulator/src/Simulator.svelte`, add props `snapshotInterval`, `snapshotEvents`, `snapshot = $bindable(null)`, `client = $bindable(null)` and `onsnapshot`, wired with `$effect`s (the listener effect returns its remover). Export `SimulationClient` and the snapshot types from `packages/simulator/src/index.ts`.
6. **Proofs of concept and docs.**
   - A speed histogram in `packages/simulator/src/charts/` that takes a `snapshot` prop and bins with `HistogramBins` (`packages/engine/src/stats/histogram-bins.ts`).
   - A free-path readout built on `onsnapshot` + `FreePathAccumulator`.
   - Both stay out of the default sidebar, or sit behind a dev flag.
   - Add a line to the AGENTS.md UI rules on custom statistics via `bind:snapshot` / `onsnapshot`.

## Testing

- `snapshot.test.ts` (Node, headless `Simulation`):
  - Replaying a batch from snapshot A reproduces snapshot B's velocities exactly and its positions within float tolerance.
  - The overflow cap sets `overflowed`.
  - `mergeBatches` keeps order.
  - The `PARTICLE` event count matches `Statistics`' collision count over the same window.
  - `FreePathAccumulator`'s mean matches the cumulative `PATH` mean.
- Client test with a fake worker that posts several `snapshot` messages in one task: listeners see every one in order, `snapshot` ends on the last, and a throwing listener doesn't stop the others.
- `mise run test:parity` stays green with recording on and off.
- `mise run bench` with and without events: no regression when off, and the overhead when on is recorded.
- In the browser (`pnpm dev`, desktop and phone widths):
  - The PoC histogram tracks the built-in instantaneous-speed plot.
  - Changing `snapshotInterval` changes the update rate, and `null` stops the messages.
  - Restart and Add particle reset on a `run` change.
- `pnpm build && pnpm test && pnpm lint`.

## Outcome

- Engine: `packages/engine/src/sim/snapshot.ts` (`StateSnapshot`, `EventBatch`, `EventRecorder`, `mergeBatches`, `replay`, `speedsOf`, `kineticEnergiesOf`, `FreePathAccumulator`) and `Simulation.stateSnapshot(run)`. Batches also carry post-event colours (`c1`, `c2`), since reactions recolour particles. Reverse is recorded as a `REVERSAL` entry, so replays stay exact across it.
- Worker: `snapshots` / `snapshot` messages. The recorder hangs off a module variable that `afterEvent` checks, so with events off the only cost is one null check per event. Turning the stream on (or changing it) posts a baseline snapshot without events straight away, so the next batch follows on from a state the consumer has.
- Client: the dispatch lives in `packages/simulator/src/ui/snapshot-hub.ts` (testable without a canvas); `SimulationClient` exposes `snapshot`, `setSnapshotOptions` and `addSnapshotListener`. Options are kept by the worker across loads, so the client doesn't resend them.
- Component: `snapshotInterval`, `snapshotEvents`, `bind:snapshot`, `bind:client`, `onsnapshot`; `@boltzmann4d/simulator` exports `SimulationClient`, `SnapshotSpeedHistogram` and the snapshot helpers.
- Proofs of concept: `/examples/snapshots` (not linked from the navbar) shows `SnapshotSpeedHistogram` on `bind:snapshot` and a mean free path on `onsnapshot`. The speed mean matches the built-in plot. `FreePathAccumulator` matches the built-in cumulative path mean to 9 digits in `snapshot.test.ts`; on the page they differ by the built-in forget time.
- Cost: recording every event costs about 4% (50 particles) and 1% (1000 particles) in events per second under Node; `simulation.bench.ts` has recorded variants.

## Open questions (resolved)

- Event cap: 200k per batch (`DEFAULT_EVENT_CAP`). The worker posts an early snapshot as soon as the recorder is full, so overflow only happens if one frame has more events than the cap. `FreePathAccumulator` restarts its paths from a snapshot whose batch overflowed.
- Buffers stay `Float64Array`, so replays are exact.
- The PoC histogram is a documented example (the `/examples/snapshots` page), not part of the default sidebar.
