# 0003: Cell grid and per-particle events

Make the engine scale with N instead of N². Plan 0002's benchmarks show the cost: at 1,000 particles about 91% of the time goes to re-predicting each collided particle against every other particle and storing those predictions in an N²/2 event table. A calendar tournament tree (tried, dropped) only sped up the remaining ~3%.

## Approach

The standard event-driven hard-sphere design (Alder–Wainwright cells, Rapaport-style per-particle events):

- **Cell grid.** Square cells at least as wide as the largest contact distance between any two particles. A particle can only collide with particles in its own or the 8 neighbouring cells (wrapping in periodic arenas). Grids with fewer than 3 cells per side fall back to one cell, which is the current all-pairs behaviour.
- **Cell crossings** are internal events: when a particle's extrapolated path leaves its cell, it moves to the new cell and is predicted against the particles in the newly adjacent cells. A crossing doesn't touch the particle's position, velocity or `t0`.
- **One next event per particle** (its soonest wall, pair or crossing event) instead of a slot per pair. Memory is O(N).
- **Indexed binary heap** over particles, keyed by their next event, for O(log N) next-event and update.
- **Lazy invalidation.** Each particle has a collision counter. When a particle's event changes its velocity, the counter increments. A popped event whose partner's counter has moved since prediction is stale; the particle is re-predicted instead.

Per event the cost becomes O(neighbours × log N), so a frame costs about O(N log N).

## Parity

The parity tests stay bit-identical. That holds because:

- A pair prediction depends only on the two particles' states (position, velocity, `t0`), which change only at real events. Crossings are bookkeeping and don't touch them, so a pair predicted later, at a crossing, gets exactly the same bits as Java's earlier prediction of the same pair.
- Java's table also holds predictions for distant pairs, but a distant pair can't collide without both particles first entering adjacent cells, which triggers the same prediction here.
- **Ties** (equal event times) do occur in the presets: up to 80 per 20,000 events in `2Ddiffuse`, from particles Java placed overlapping, which then re-collide immediately. The heap breaks ties with Java's order: the boundary row first, then by the pair's higher index (Java's row), then its lower index (column). Crossings come last at equal times; they don't change physics. Java's history-dependent within-row rule (an update only replaces a row's cached minimum when strictly earlier) can't be reproduced exactly without the table. If a fixture ever disagrees because of it, keep the current engine as a reference for that case rather than weakening the parity test.

## What the implementation needed beyond the plan

- **Java's frame moves round positions.** At each frame end Java moves every particle to the frame time (`moveToTime`), but keeps the pair predictions it already made from the pre-move positions. This engine predicts pairs lazily, so it rebuilds the state Java used: each particle's state right after its last event, moved through only the frame boundaries before the pair's latest event (`predictionState`). Without this, times differed in the last bits and the event sequences diverged within a few events.
- **Periodic wraps need counting.** A particle's stored position is only refreshed at events and frame moves, so it can be any distance behind its cell. Guessing the side of the box from the stored position looped forever on long flights; each particle now counts the wraps its crossings make (`wrapX`/`wrapY`), reset whenever its position is refreshed.
- **Ties** behaved as planned: the heap's Java order reproduces every fixture (11 presets, including the ones with equal-time events; see issue #10), and the brute-force equivalence test matches over 2,000 events.

## Benchmarks

Re-run `mise run web:bench`, extended to 50,000 and 100,000 particles, plus `mise run bench:report`. Record the 60 fps particle count again.

## Steps

1. Cell grid and neighbour iteration (reflecting and periodic), with tests. _Done: `src/sim/cell-grid.ts`._
2. Per-particle next events, indexed heap and lazy invalidation, replacing `EventCalendar` in `Simulation`; the counters stay meaningful (events, predictions, crossings, stale pops). _Done: `src/sim/event-heap.ts`, `src/sim/simulation.ts`; `EventCalendar` removed._
3. Parity fixtures and the brute-force equivalence test green. _Done: bit-identical on all 11 supported presets._
4. Benchmarks and README updated; plan archived. _Done: 198k events/s at 100,000 particles (31 MB); about 60,000–70,000 particles at 60 frames/s. See `benchmarks/README.md`._
