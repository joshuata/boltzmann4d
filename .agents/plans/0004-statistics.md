# 0004: Statistics and charts

Plan 0001 step 5 (and the chart part of step 7): port the Java app's statistics, its theoretical predictions (`Formulas`), and the histogram/history display, starting with the speed distribution against Maxwell–Boltzmann theory.

## What the Java app does

From a survey of `vendor/boltzmann3d/src/edu/byu/chem/boltzmann/model/statistics/` and `Physics.java` (about 8,800 lines):

- **Statistics:** 14 statistics (`StatisticID`). Instantaneous Speed is the only one recorded by default; the others are opted into in the Sim Settings dialog. Each is kept for every non-empty subset of particle types ("Red", "Blue", "Red & Blue").
- **Hooks:**
  - Every event reaches the statistics just _before_ it is performed (`updateStatistics`), so they see pre-collision velocities.
  - Every frame end calls `notifyOfSimulationTime`.
  - About once per wall-clock second, the UI samples the "current" values from the latest frame (`useFrameForCurrentCalculations`).
- **Two views per statistic:**
  - _Current_: the frame being shown, one sample per particle, in 15 bins.
  - _Cumulative_: each value weighted by how long a particle held it since its last particle–particle collision, in 30 bins.
  - Per-particle averages (Average Speed, Collision Rate, …) use per-particle accumulators instead.
- **Forget:** a single clear of cumulative data once simulated time exceeds `forgetTime` (default 4) × the predicted collision lifetime. There's no rolling decay.
- **Display:**
  - The histogram is stacked bars per particle type, with the theoretical curve drawn over it.
  - Bars and curve are each scaled so their own maximum reaches 80% of the height, so it's a shape comparison, not a density.
  - Orange markers show the predicted average ± width, and green markers the measured average ± width.
  - A history mode plots the last 300 sampled averages.

### Open: which temperature the predictions use

Java predicts each species' distribution from its _initial_ temperature. Species that can exchange energy settle at a shared temperature, and the prediction doesn't follow. In a test with the heavy species started 4× hotter, both species settled near 750 K, but the predictions stayed at 300 K and 1,200 K (predicted mean speeds 21–59% off). This affects the hot/cold presets (once the divider conducts heat) and the effusion presets (gas mixes through the hole). It also affects any run with a thermostat or piston that changes the energy.

### Java behaviour this port won't reproduce exactly

- **Not reproducible in Java either.** Current values are sampled at wall-clock times. Several sums iterate `HashMap`s keyed by objects with identity hash codes (`Particle`, `ParticleType`), so their floating-point order changes between runs. Bit-identical parity like the physics' isn't possible.
- **Bugs:**
  1. `alignHistogramBinRangesAcrossGroups` converts the shared range to base units while values arrive in display units. This empties the Kinetic Energy, Average Energy, Path, Average Path and Time/Collision histograms, and squashes Collision Rate into bin 0.
  2. `correctedRMSVel` throws on periodic arenas, so RMS Velocity with finite-system corrections crashes there.
  3. `Path` and `TimePerCollision` ignore the unit asked for in `getPredictionForAverage`.
  4. `avgRelativeVelocity` uses the 2D formula for 1D.
- **Methodology quirks** (arguably physics choices, not bugs):
  - Time weighting spans back to the last _particle_ collision and ignores wall bounces in between. That's wrong for X/Y/Z velocity components.
  - Per-particle averages divide by the total particle count across all types, and ignore the forget.

## Approach

- **Engine side** (`src/stats`, pure TS, runs in the physics worker):
  - Statistics subscribe through `Simulation`'s `onEvent` hook and a new per-frame hook.
  - They read particle state from the `Particles` arrays: pre-collision velocity at the event, plus per-particle time of last particle collision.
  - Typed arrays throughout, and the per-type-subset structure kept.
  - Benchmarked with and without statistics: plan 0002's requirement that the engine stays measurable applies.
- **Deterministic sampling:** current values are sampled at simulation-time boundaries (every N frames), not wall-clock, so tests are reproducible.
- **Worker → UI:** about once a second the physics worker sends a compact summary message: bins, averages, widths, predictions and curve points, for the selected statistic and type subset only. The main thread never sees per-particle data.
- **Charts:** a chart library rather than hand-written Canvas2D, in Svelte components on the main thread (see decisions).
- **Checking correctness:**
  - _Formulas_: unit tests against closed forms and known values (e.g. 2D mean speed `sqrt(π k T / (2 m))`).
  - _Distributions_: in long runs, the cumulative speed histogram must match the Maxwell–Boltzmann curve, by a goodness-of-fit test on a seeded large gas.
  - _Physics_: theory the measurements must satisfy, such as equipartition in mixtures and the finite-system corrections for small N.
  - No Java parity for statistics (decided 2026-11-09): Java's statistics have too many bugs to serve as a reference, so correctness is checked against theory instead.

## Steps

1. `Formulas` and `StatUtils` predictions (averages, widths, distributions, collision rate and lifetime, gamma helpers), with tests. _Done (#19)._
2. Statistics core: per-particle last-collision times, weighted trackers, histogram bins, the forget, type subsets, hooked into `Simulation`. Instantaneous Speed first. _Done for Instantaneous Speed: `src/stats/statistics.ts` and friends; a 200,000-event run matches the Maxwell–Boltzmann distribution to within 1% per bin._
3. Worker → UI summary messages; speed histogram chart with the theoretical curve and markers in the sidebar; type-subset and cumulative/current toggles. _Done: summaries every 27 frames (and after each step while paused); `src/charts/SpeedHistogram.svelte` (LayerChart) in `src/ui/StatisticsPanel.svelte`. The chart's x axis spans the bins' shared range rather than each subset's own range, so subsets are directly comparable; the curve still covers the subset's own range, as in Java._
4. Correctness tests against theory; benchmarks with statistics on. _Done: `src/stats/correctness.test.ts` checks a two-species mixture (each species and the mix against Maxwell–Boltzmann, equipartition), species starting at different temperatures settling to one, per-frame current samples against the theory, and 4-particle periodic and reflecting runs matching the finite-system corrections to 0.5% (the ideal-gas values are 3–4% off). `src/stats/statistics.bench.ts`: statistics cost about 4% of event throughput from 60 to 10,000 particles, and a summary takes under 0.3 ms._
5. The remaining statistics (velocity components, kinetic energy, path, time per collision, the per-particle averages, collision rate, pressure) and the history plot, behind a statistic picker.

## Decisions (agreed 2026-11-09)

- **Chart library:** LayerChart (Svelte-native components, Svelte 5, actively maintained), on the main thread.
- **Java bugs 1–4:** fixed in the port, each with a code comment describing Java's behaviour. Parity tests compare only values the bugs don't touch.
- **Methodology quirks** (time weighting across wall bounces, per-particle averages over all types): kept as in Java for now, so numbers match the original; revisiting is joshuata/boltzmann4d#18.
