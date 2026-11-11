# 0011: Pressure and the gas laws

_Done._ Roadmap Phase 2 (`0006-spec-roadmap.md`).

- **Requirements:** PRES-1–8 (PRES-9's history plot waits for Phase 3), PRED-8, PRED-9 (pressure part), OPT-1, OPT-3, SIM-10, SIM-18.
- **Unlocks:** STORY-7, 9, 11, 12, 13 and the pressure parts of STORY-8 and 10.
- **Java reference:** `model/statistics/Pressure.java`, `utils/WallPressureTracker.java`, `utils/VirialPressureTracker.java` (the live code; `WallPressure` and `VirialPressure` are older versions of the same), `Formulas.pressure`, `effectiveVolume`, `realGasX`, `realGasQx`.

## Design

- **Observation only.** `Simulation` has an `afterEvent` hook next to `onEvent`, called by `perform()` once the event is done, with the particles involved in their new state. `PressureMeter` (`packages/engine/src/stats/pressure.ts`) takes both: it reads velocities before and positions and velocities after, and never writes, so event order and results are unchanged. `parity.test.ts` stays green, and `pressure.test.ts` checks that a run records the same events and final state with and without a meter.
- **Wall pressure (PRES-1, PRES-4).** A hit on the box's left or right wall transfers `m (|vₓ before| + |vₓ after|)` (Java's `2 m |vₓ|` for a plain bounce, and still right when the piston's thermostat scales the bounce), divided by the wall the particle's centre can reach: `H − 2r` in 2D, `(H − 2r)(D − 2r)` in 3D, with `H` the piston's height at the hit in piston arenas. Undivided: the mean of the two walls, as `WallPressureTracker.getAverage`. Divided, with or without a hole: the left side reads the left wall and the right side the right wall. Divider and hole-edge hits aren't counted.
- **Drawn walls** don't contribute: they have any shape and orientation, so there is no single "side" they push on. The readout measures the box's left and right walls (as Java did, which had no drawn walls) and predictions use the box's volume. The readout says so when a scenario has drawn walls; documented in the user guide and in `pressure.md`'s PRES-4 note.
- **Averaging (PRES-2, OPT-3).** Hits are kept in a ring buffer for `T_avg` (the scenario's `pressureAveragingTime`, default 60 ps). The reading is their sum over the time covered, which grows from 0 to `T_avg`; until it gets there the reading is marked as warming up. Lengthening `T_avg` warms it up again, from what it already covers (Java's `setAveragingTime`). Shortening applies at once.
- **Virial pressure (PRES-5).** Periodic arenas: `P = (2⟨KE⟩ + Σ μ r₁₂·Δv₁₂ / t) / (d V)` over every pair event since the start. `Δv₁₂` comes from the velocities before and after, so it holds for any pair event; r₁₂ by the nearest image. Unlike Java, `⟨KE⟩` is the time average per kind instead of the starting energy, so partial pressures work; each collision's term is split equally between the two particles' kinds, as Java's tracker adds it once per particle.
- **Partial pressures (PRES-8).** Everything is kept per kind (the colour a particle shows, as in the statistics), and totals are sums, so partial pressures add up exactly. The readout lists every kind present in a region with a total, rather than following the statistics' kind picker.
- **Predictions (PRES-6, PRED-8, SIM-18).** Per region and kind, Ideal is `N k T / V_eff = 2 KE / (d V_eff)` from the kind's particles there now, with `V_eff` from `Formulas.effectiveVolume` for that region (a divided side reaches from its wall to the divider's face; the piston's current height). Java used the initial temperature and total counts; current values predict the hot/cold box and a compressed piston correctly. Real multiplies by `realGasPressureFactor(x) = 1 + x Q(x)` with `x = realGasX` for that region's counts. PRES-7: Java applies no finite-system correction to pressure beyond what `realGasX` always includes; neither do we.
- **Units (PRES-3).** µN/m in 2D, MPa in 3D. 1D waits for the 1D physics.
- **Arena size (OPT-1, SIM-10).** `withArenaSize` (`packages/engine/src/scenario/edit.ts`) gives the scenario a new size: drawn walls and spawn regions stretch, and every particle is placed anew at random at its own speed (placed particles become one-particle random blocks, since stretching their positions could make them overlap). Random placement keeps each kind on its side of a divider (FILE-3). `scenarioProblems` must pass, or the worker reports the error and keeps the running simulation.

## Work done

1. Engine: `afterEvent` in `Simulation`; `PressureMeter`; `realGasPressureFactor` in `formulas.ts`; `withArenaSize`.
2. Tests (`packages/engine/src/stats/pressure.test.ts`, under a second in all): one particle bouncing (exact value and prediction), warm-up and averaging-time changes, observation only (wall and periodic), only side walls count; seeded gases: dilute ideal gas `PA ≈ NkT` within 5% and equal partial pressures for equal numbers, partial pressures sum to an independent tally of every hit, STORY-8 (300 K vs 1200 K sides, ratio 3.4–4.6), STORY-10 (`2Dpresnum`, right/left 0.4–0.6), periodic virial pressure within 5% of Real at a density where Real is 30% above Ideal, 3D `PV ≈ NkT`. `edit.test.ts` covers `withArenaSize`.
3. Worker: a meter with each simulation (`build`), a `pressure` reading every 250 ms and on each step, `pressureAveragingTime` messages, `ArenaOptions.size`, and the scenario's averaging time and prediction mode in `loaded`. The user's averaging time survives Restart and arena changes, not a new scenario.
4. UI: `SimulationClient.pressure`, `pressureAveragingTime`, `pressurePrediction`; `PressurePanel.svelte` (per-kind and total, per side, Ideal/Real toggle, warming-up marker, averaging time) and `ArenaSize.svelte`, both built from `@boltzmann4d/ui`.
5. Docs: `apps/web/src/docs/pressure.md`, a pointer in the quick start, _Web port_ notes in `docs/specs/pressure.md`, `simulation.md`, `display-and-controls.md`, `predictions.md`, and the roadmap status.

## Left for later

- PRES-9: wall and virial pressure history plots, with Phase 3's history view.
- 1D pressure (pN, and PRED-10's exact 1D equation of state), with the 1D physics.
- The 3D piston arena (not in the engine yet); the meter already handles its walls' height.
