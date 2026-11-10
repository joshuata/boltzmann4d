# 0002: Event-driven physics, 2D first

Plan 0001, migration step 2 (with step 4, the parity harness, pulled in alongside). Replace the stub in `src/sim/physics.ts` with a port of boltzmann3d's event-driven hard-sphere engine, starting with 2D reflecting and periodic arenas, built so it can be benchmarked and profiled from day one.

## Goals

1. **Same physics.** Event times, collision outcomes and positions match the Java app to within a set tolerance for the same initial state (parity tests).
2. **Measurable.** Every part of the engine can be benchmarked and profiled headless, without the worker, renderer or statistics.
3. **Ready to grow.** 1D, 3D, dividers, holes, the piston, wells, reactions and the thermostat (plan 0001 step 8) slot in without restructuring.

## Java sources

In `vendor/boltzmann3d/src/edu/byu/chem/boltzmann/model/physics/`, about 3,500 of the package's 7,200 lines matter for this plan:

| Java | Role | Notes |
| --- | --- | --- |
| `Physics.java` (1,121) | Event loop: `advanceToTime`, `PerformEvent`, `CalUpdate` | Also owns statistics, piston, thermostat and divider logic; only the core loop is in scope. |
| `Calendar.java` (454) | Triangular pair-event matrix with a per-row minimum | Not a heap: `FindMinimum` scans dirty rows. Ties go to the lowest row and column (strict `<`), which parity depends on. |
| `Particle.java`, `Particle2D.java` (1,470) | Lazy motion (`moveToTime`), pair and boundary prediction, collision response | 2D only in this plan. |
| `EventInfo`, `Collision`, `LastCollisions`, `PartState`, `FrameInfo`, `ArenaInfo`, `Wall`, `PhysicsFormulas` | Supporting types | Port what the 2D core uses. |

The physics itself uses no randomness. Given an initial state, a run is fully deterministic, which makes parity testing and benchmarking straightforward.

## Design

### Engine API (`src/sim`)

- `Simulation` (the port of `Physics`) is created from an initial state: arena description plus particle positions, velocities, masses, radii and types (`SimulationSettings.species` from `src/io` maps onto this directly).
- Synchronous, deterministic stepping:
  - `advanceToTime(t)`: process every event up to `t`, then move all particles to `t`. This is what frames use.
  - `step()`: process exactly one event. For tests, parity dumps and micro-benchmarks.
  - `snapshot(into?)`: write positions, velocities and types into caller-owned typed arrays (no per-frame allocation in the hot path; the worker transfers copies).
- No timers, no `Math.random`, no DOM, no logging in the engine. Time is simulation time only.

### Data layout

- Particle state as **structure-of-arrays typed arrays** (`x`, `y`, `vx`, `vy`, per-particle local time `t0`, `radius`, `mass`, `type`) instead of one object per particle. Faster to iterate, cheap to snapshot and transfer, and easy to inspect in a profiler. Per-dimension behaviour lives in functions (`predictPair2D`, `predictBoundary2D`, `collide2D`, ...) rather than subclasses.
- The event calendar stores its matrix in flat typed arrays (time, type, side per pair) with the same row-minimum scheme and tie-breaking as `Calendar.java`.
- Hot paths read imported constants and functions through module-level local copies (`const { PARTICLE } = Collision`, `const predictPair = predictPair2D`). Vitest's module runner turns imported bindings into getter calls, which made the calendar benchmark about 8× slower and would skew every benchmark.
- Floating-point operations keep the Java order of evaluation in prediction and collision code, since parity depends on it. Elsewhere, refactor freely.

### Hooks instead of coupling

- Statistics, the piston and the thermostat are reached through small interfaces passed in at construction (e.g. an `onEvent(event)` listener for statistics). Plan 0001 step 5 plugs statistics in; with no listener, the engine runs bare, so benchmarks can compare "physics only" against "physics plus statistics".

### Instrumentation

- Always-on integer counters on the simulation: events processed by type, pair predictions, boundary predictions, calendar row rescans. Cheap enough to leave in production; they explain _why_ a preset is slow, not just _that_ it is.
- The worker reports wall-clock time per frame (`performance.now()` around `advanceToTime`) alongside the frame, so the app can show physics cost live later.

## Benchmarking and profiling

- **Benchmarks:** Vitest's built-in `bench` (`*.bench.ts` next to the code), run with `mise run bench`. Not part of `pnpm test` or CI, since timing on shared runners is noise.
  - Micro: one pair prediction, one boundary prediction, one calendar update and minimum search.
  - Macro: events per second and simulated seconds per wall-clock second, from fixed initial states: `2Dmixture` (60 particles, reflecting), `2Dbrownian` (200, periodic; the largest preset), and a synthetic 1,000-particle scene, since per-event cost grows with the particle count. With and without a statistics listener once one exists.
- **Profiling:** a small CLI, `scripts/profile.ts` (run with tsx), that loads a preset or a synthetic scene, runs it headless, and prints throughput and counters. `mise run profile 2Dbrownian --frames 1e5` runs it under `node --cpu-prof`, writing a `.cpuprofile` to `profiles/` to open in Chrome DevTools or speedscope.
- **Baseline:** record benchmark numbers in this plan when the port lands, so later optimisation (spatial cells, a real heap for large N) has something to beat without changing results.

## Parity harness (plan 0001 step 4, pulled forward)

- A small headless Java runner added to boltzmann3d (now `vendor/boltzmann3d`) that loads a preset, fixes the initial state (positions and velocities written out, since random placement differs between Java and JS), runs N events and dumps the event sequence (time, type, particles) plus final positions and velocities as JSON.
- Dumps are committed as fixtures under `src/sim/parity/`. Vitest replays the same initial state through the TS engine and compares event-by-event within a tolerance.
- Start with `2Dmixture` (reflecting) and `2Dequil` (check boundaries) plus one periodic preset; add presets as features land.

## Steps

1. Benchmark and profile scaffolding against the existing stub (`mise run bench`, `mise run profile`), so the harness exists before the real engine. _Done._
2. Port the calendar with unit tests (ordering, tie-breaking, dirty-row rescans) and micro-benchmarks. _Done: `src/sim/event-calendar.ts` (later replaced by plan 0003's per-particle heap and removed). One event cycle (take the next event, re-predict two particles, find the new minimum) with random predictions: about 600k/s at 60 particles, 117k/s at 200, 23k/s at 1,000 (Apple Silicon, Node 24)._
3. Port 2D motion, pair prediction and collision response, and reflecting-wall prediction and response. _Done: `src/sim/particles.ts` (typed-array store) and `src/sim/particle-2d.ts`, covering reflecting walls and periodic boundaries with images. Re-predicting one particle against 199 others: about 290k/s (reflecting) and 270k/s (periodic); one collision response: about 23M/s._
4. Port the event loop (`advanceToTime`, `step`, `CalUpdate`, last-collision tracking) and wire it into the worker in place of the stub; the app renders a loaded preset (default: `default.set`). _Done: `src/sim/simulation.ts`; the worker runs `default.set` and sends a scene message (arena, radii, colours) before frames. Last-collision tracking is skipped: it only matters for wells. The engine matches a lazy-motion brute-force search bit for bit over 2,000 events (reflecting and periodic). Throughput: about 345k events/s (2Dmixture, 60), 99k/s (2Dbrownian, 200), 17k/s (1,000 synthetic). The profiler shows the calendar scanning about 2.4 entries per pair prediction, the first thing to look at when optimising._
5. Java parity runner and fixtures; parity tests green for reflecting presets. _Done: `ParityDump` and `PhysicsBenchmark` on the `boltzmann4d-parity-tools` branch of joshuata/boltzmann3d (a fork of byu-chem/boltzmann3d); fixtures for all 15 2D presets in `src/sim/parity/`. The 11 reflecting and periodic presets match Java bit for bit (every event and the final state, at least 2,000 events each); the 4 divider and hole presets are skipped until those arenas are ported._
6. Periodic boundaries (including `SetTotalMom`) with parity fixtures. _Done with step 4; covered by the periodic fixtures (2Dbrownian, 2Ddiffuse, 2Dliquid)._
7. Record benchmark baselines (`benchmarks/README.md`, Java app and web engine up to 20,000 particles); then move this plan to `.agents/archived-plans/`. _Done; the engine then moved to plan 0003's cell grid._

Out of scope here: 1D and 3D, dividers and holes, piston, wells, reactions, thermostat, time reversal, statistics (each a later plan or plan 0001 step).

## Decisions

- **Parity runner:** add it to the boltzmann3d repository, on its own branch there; fixtures are committed here. (Agreed 2026-11-09.)
- **Data layout:** structure-of-arrays typed arrays, with per-dimension behaviour in functions. (Agreed 2026-11-09.)
