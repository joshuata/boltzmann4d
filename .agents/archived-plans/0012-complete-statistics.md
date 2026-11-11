# 0012: Complete statistics (roadmap Phase 3)

Finishes plan 0004 step 5. Requirements: STAT-1, 3–5, 7–17, 19–23; PRED-1–7, 11; VIEW-4; OPT-4. Unlocks STORY-3, 4, 5, 6 and the history plots for STORY-7–13 (pressure from plan 0011 is offered in history).

## Engine (`packages/engine/src/stats`)

- **One recorder per statistic, kept per type** (`distribution.ts`). The old `InstantaneousSpeed` kept a copy of its histograms for every type subset. Now each statistic keeps one histogram row and one `WeightedValueTracker` per type, and any subset (Red, Blue, Both, or KIND-4's picked kinds) is composed from those rows when summarised. All subsets share one bin range (as before), so the chart's axis is the same for every subset.
- **Statistic definitions** (`statistic-ids.ts`, `predictions.ts`): id, label, unit, how values are weighted, whether the shown average is the mean or the RMS, the default axis range, and a prediction (average, width, density) for a set of types. Values are kept in display units (m/s, kJ/mol, nm, ps, 1/ps) throughout, so Java bug 1 (bins in base units, values in display units) can't happen.
  - Time-weighted (STAT-16): Instantaneous Speed, RMS Velocity (the average shown is `sqrt(<v²>)`), X/Y/Z Velocity, Kinetic Energy. Cumulative: each value weighted by the time since that particle's previous particle collision. Current: every particle in the latest frame.
  - Count-weighted: Free Path (speed × time between particle collisions) and Time per Collision. Cumulative: one value per particle per collision. Current: each particle's last completed interval (STAT-1 says "between the last two particle–particle collisions"; Java used the interval still in progress).
  - Per-particle averages: Average Speed, Average RMS Velocity, Average Kinetic Energy, Average Path, Collision Rate. Per-particle sums since restart, including the interval still in progress when sampled (Java dropped it). The histogram is one value per particle. They aren't cleared by the forget (as in Java). Cumulative shows the same data, and the UI says so (STAT-18).
  - Number of Particles: counts per kind, history only (STAT-22), offered with reactions.
- **Predictions** (PRED-1–7), at each kind's measured temperature (#23):
  - speed, RMS, components, KE: Maxwell–Boltzmann and Boltzmann densities, mixed by count (PRED-7);
  - path and time: exponentials with `λ = v̄ / rate` and `τ = 1 / rate`, where the per-kind collision rate already includes the other kinds (PRED-6). The mixture uses Java's form, which weights each kind by its collision rate, because cumulative paths are counted per collision;
  - collision rate: a Gaussian at `1/τ` with width `sqrt(rate / t)` (PRED-5);
  - per-particle averages: Gaussians with Java's widths (0.76, 1.41 and 1.14 × the average / `sqrt(rate t)`).
  - Ideal/Real (PRED-9, STAT-14) applies to the path, time and rate predictions. It uses the same toggle as the pressure panel.
- **Finite-system corrections** (PRED-11): the option switches every velocity and energy prediction to the corrected formulas (`correctedAverageVelocity`, `correctedRmsVelocity`, `correctedVelocityWidth`, `correctedKE`, `correctedKEWidth`, and Shirts et al.'s corrected densities). Java bug 2 is fixed: RMS Velocity with corrections works on periodic arenas (`correctedRmsVelocity` follows from `correctedKE`). The corrected densities take the total energy from the measured temperatures, not the initial kinetic energy, so they stay consistent with #23.
- **Axis limits** (STAT-8–11): `setRange(id, min, max)` applies STAT-9's fix-ups and rebins that statistic's histograms, which clears only its cumulative data (STAT-10). The scenario's `abscissaLimits` set the starting ranges (the union across the subsets listed in the file). Saving edited limits back to a file is left to the save flow.
- **Forget** (STAT-17, OPT-4): `setForgetMultiplier`. The forget is still a single clear at `multiplier × τ`.
- **History** (STAT-20–22): every current sample (about once a second) also stores each type's running sums for every statistic, in a ring of the last 150 samples, so the history of any subset can be composed and switching plots keeps the history.
- **Colour limits** (VIEW-4, STAT-7): Color by Speed and Color by KE use the Instantaneous Speed and Kinetic Energy plots' min and max (one axis shared by every set of kinds). Below the minimum is dark blue and above the maximum is dark red. The worker sends new limits to the renderer when they change.

## Worker and client

- ToWorker: `statistic` (which plot to summarise), `statLimits`, `statOptions` (finite, realGas), `forgetMultiplier`. `load` also carries the user's forget multiplier, as it does the averaging time. Limits reset on load (arena changes move the predicted ranges) and survive Restart.
- The summary carries only the selected statistic (with all its subsets), the plots available, the history, the counts history and the colour limits. `loaded` carries the scenario's stat settings (plot, cumulative, width, history).
- `SimulationClient` keeps the last 150 pressure readings for the pressure history, since readings already arrive every 250 ms.

## UI (`packages/simulator`)

- `StatisticsPanel.svelte`: a plot picker (a native `<select>` styled like the editor's, which works with touch; it lists the statistics plus pressure), the kind picker, Cumulative / Width / History toggles, and the chart. Below the chart: min and max fields, then the Measured and Predicted readouts (averages, or widths with Width on). Statistics options (finite-system corrections, forget multiplier, and Ideal/Real for path, time and rate) sit in a collapsible section.
- `charts/DistributionHistogram.svelte` (replaces `SpeedHistogram`): bars coloured by the particle colour scale when Color by Speed / KE matches the plot (STAT-7). `charts/HistoryChart.svelte`: the measured line; the predicted line as red solid with dotted ± ½ width; a range of four predicted widths, or 0 to twice the prediction for pressure (STAT-21); one line per kind for counts.
- Stepping plots with + and −: skipped (optional per the roadmap). STAT-19's 22% redraw rule isn't needed, because curves are recomputed with each summary.

## Tests

- Unit tests for each statistic's recording and predictions (closed forms), STAT-9 fix-ups, range changes clearing only that plot, history composition.
- Seeded headless story checks: STORY-4 (cumulative RMS / average ≈ 1.128 in 2D and 1.085 in 3D), STORY-20 (KE averages of 10 and 100 amu kinds match), Average Speed width narrowing (STORY-6), free path and collision time against the predictions, finite corrections on periodic arenas for RMS Velocity (bug 2).

## Status

_Done 2026-11-10; archived._ Engine in `packages/engine/src/stats` (`statistic-ids.ts`, `predictions.ts`, `recorder.ts`, `history.ts`, `statistics.ts`); UI in `StatisticsPanel.svelte`, `charts/DistributionHistogram.svelte` and `charts/HistoryChart.svelte`; user docs in `apps/web/src/docs/statistics.md`. Tests: `predictions.test.ts`, `plots.test.ts`, `stories.test.ts`, plus the updated `statistics.test.ts` and `correctness.test.ts`.

Deviations found while building:

- The UI uses a native `<select>` for the plot picker, like the View box and the editor.
- The per-particle averages of a set of kinds average over that set's particles; Java divided by every particle (one of #18's methodology quirks, which made Red's and Blue's values wrong in mixtures).
- Not done: + and − stepping (optional), saving edited limits back to a file (STAT-11), the RDF (STAT-2, 24; not in this phase).
