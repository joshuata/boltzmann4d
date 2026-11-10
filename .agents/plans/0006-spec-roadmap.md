# 0006: Roadmap for the feature specs

A phased plan for bringing the requirements in `docs/specs/` into the app. Each phase gets its own detailed `NNNN-*.md` plan when work on it starts; this file says what goes in which phase and why.

## Context

`docs/specs/` lists what the app must do, with requirement IDs and 28 classroom scenarios (`SCN-*`). Today the app covers part of it: 2D and 3D hard-sphere physics (walls, periodic, divider, hole, the demon gate without a UI toggle), loading bundled presets, play/pause/step, a rate slider, and the Instantaneous Speed histogram with Red/Blue/Both (plans 0002–0005, and 0004 steps 1–3). There are no particle controls, restart, pressure, 1D, piston, reactions, reverse, trace, colouring, save or export.

The aim is to **enable the learning outcomes, not replicate the desktop app exactly**. Phases are ordered by the classroom scenarios they unlock, and each one says where it deliberately simplifies the desktop UI.

## Guiding rules

- **Outcome first.** A phase is done when its scenarios can be run in the web app and give the expected result, not when every desktop control exists. Where a desktop detail doesn't serve a scenario, we may simplify, rename or drop it; record that in the phase plan and as a _Web port_ note in the spec.
- **Physics stays exact.** Anything that changes the equations (1D, piston, thermostat, reactions, wells) is still checked bit for bit against the Java app with `ParityDump` (fork branch `boltzmann4d-parity-tools`), as AGENTS.md requires. The flexibility is in UI, statistics presentation and workflow, not in the event engine.
- **New runtime operations** with no Java parity hook (adding or removing particles mid-run, switching the arena mid-run, reverse) are tested with invariants: energy and momentum conservation, no overlaps, reproducibility from a seed.
- **Numeric scenarios become tests.** Where a scenario gives a number (SCN-4, 8, 10, 14, 26; PRED-14), add a seeded headless long-run Vitest test, fast enough for CI or else opt-in like the benchmarks.
- **UI rules hold:** new data flows worker → `SimulationClient` (`src/ui/simulation.svelte.ts`) → Svelte props, and every control works on touch and at narrow widths.

## Phases

### Phase 1: Set up and run your own gas

_Not started._ The core classroom loop.

- **Requirements:** PART-1–9, 12, 14–16; CTRL-1, 3; SIM-6, 12–16, 24 (demon toggle), 30; FILE-1 (user file picker), FILE-3, 4; STAT-25; CTRL-7 (fit-to-view default).
- **Unlocks:** SCN-1, 2, 8, 10, 14, 15, 16, 17, 18, 19, 20, 28 (except Color by KE, Phase 3).
- **Work:**
  - `src/sim`: random placement and velocities on restart (move the placement in `src/io/load.ts`, `loadSpecies`/`randomVelocity`, into `src/sim` so restart and add share it); add a particle at a point or at random without overlap; remove the newest; switch arena type mid-run (divided → hole or undivided keeps running; → divided restarts all on the left); zero total momentum (SIM-30).
  - Worker protocol (`src/worker/index.ts`): restart, add, drop at a point, remove, set arena, open/close hole, load file text. Replies carry the clock, red/blue and left/right counts, and temperature.
  - UI: a Particles panel (number, mass, radius, temperature for red and blue, with edited values marked pending until restart or add, PART-15), boundary-mode buttons, a demon open/close button, the clock, Restart, Load file, collapsible panels. Tapping the 2D arena drops a blue particle; 3D adds at random.
- **Simplify:** PART-10 (number locked while Red is selected) becomes a number control that always edits the blue count, labelled as such.

### Phase 2: Pressure and the gas laws

_Not started._

- **Requirements:** PRES-1–9; PRED-8, 9 (pressure part); OPT-1, 3; SIM-10, 18.
- **Unlocks:** SCN-7, 9, 11, 12, 13.
- **Work:** wall momentum transfer through `Simulation.onEvent` (port `WallPressure`/`Pressure`), virial pressure for periodic arenas (`VirialPressure`), partial pressures per type, left and right when divided; ideal and real predictions in `src/stats/formulas.ts`; an Ideal/Real toggle; an Options panel with arena size (restarts) and averaging time; a pressure readout marked as warming up for the first `T_avg`.
- **Simplify:** pressure history plots come with Phase 3's history view; this phase shows numbers.

### Phase 3: Complete statistics

_Not started._ Finishes plan 0004 steps 4–5.

- **Requirements:** STAT-1, 3–5, 7–17, 19–23; PRED-1–7, 11; VIEW-4; OPT-4.
- **Unlocks:** SCN-3, 4, 5, 6; history plots for SCN-7–13.
- **Work:** the remaining statistics (velocity components, kinetic energy, free path, time per collision, collision rate, the per-particle averages) behind a plot picker; the Width toggle; editable axis limits that clear only that plot's cumulative data; a history view; the forget-time option; finite-system corrections (with Java bug 2 fixed, see plan 0004); Color by Speed / KE for particles and the matching bar colours; plan 0004's distribution and parity tests.
- **Simplify:** history may cover the last 150 summaries rather than frames; per-particle-average plots show a note instead of offering a cumulative view (STAT-18); stepping plots with + and − is optional.

### Phase 4: Chaos, reversibility and trajectories

_Not started._

- **Requirements:** SIM-4, 32; CTRL-2 (doubling steps), CTRL-6; VIEW-5.
- **Unlocks:** SCN-21, 22; the trace for SCN-15 and `2Dliquid`.
- **Work:** `reverse()` in `Simulation` (flip velocities, re-predict); trace mode in `src/render` (an accumulating render target in 2D, dot sprites in 3D) with dot size and Clear; a `2Dequal` test that the halves match and then diverge around 95–120 ps.

### Phase 5: 1D

_Not started._

- **Requirements:** SIM-7, 8; PRED-1, 3 (1D columns), PRED-10; PRES-3 (pN).
- **Unlocks:** SCN-23; the 1D row of SCN-4.
- **Work:** port `Particle1D.java` to `src/sim/particle-1d.ts` with parity fixtures (extend `ParityDump` with 1D scenes); a 1D view in `view-2d.ts`; a Dimension control that restarts; fix Java bug 4 (`avgRelativeVelocity` in 1D).

### Phase 6: Piston and thermostat

_Not started._

- **Requirements:** SIM-17, 19–23; OPT-6; PART-13; PRED-15.
- **Unlocks:** SCN-24, 25; the piston route through SCN-7.
- **Work:** port `Piston`, `PistonState`, `Thermostat*` and `WallController` with parity fixtures for piston runs; draw the piston in 2D and 3D; a target-volume slider and Move Piston; adiabatic or isothermal; the live piston temperature, a "Thermostat active" indicator and the adiabatic prediction.
- **Simplify:** one piston panel holds the level control (SIM-23) and the Options entries.

### Phase 7: Reactions

_Not started._

- **Requirements:** SIM-25–29; PRED-12–14; the Number of Particles plot (STAT-1).
- **Unlocks:** SCN-26, 27.
- **Work:** port the red ⇌ blue reaction events from `Particle2D`/`Particle3D` and `Physics`, with parity fixtures for `2Dequil` and `3Dequil`; the partition-function prediction in `formulas.ts`, tested against 13.3 and 14.1; an energy diagram with editable `E_f` and `E_r` and "suppress reverse"; the counts history as reaction mode's default plot.
- **Simplify:** the diagram can be a plain SVG with draggable levels and number fields; it needn't match the Java dialog.

### Phase 8: Save, share and export

_Not started._

- **Requirements:** FILE-2, 5, 6; OUT-1–4; VIEW-6 (save the view angle); STAT-11.
- **Work:** a `.set` writer in `src/io` (basic and complete) with round-trip tests over every preset and Java-saved files; save as a download; a custom default kept in `localStorage`; a CSV recorder for averages, cumulative distributions and positions, collected in the worker and downloaded when stopped.
- **Simplify:** one Export dialog; no streaming to disk.

### Phase 9: Extras and polish

_Not started._ Each item is optional; schedule by demand.

- RDF plot and sampling (STAT-1 RDF, STAT-2, 24; OPT-5), useful for discussing `2Dliquid`.
- Energy wells (SIM-33) and the conducting divider: in the Java code, but no scenario uses them.
- View options: light scheme, custom colours, lighting toggle, display off for fast accumulation (VIEW-1–3).
- Non-zero total momentum on periodic arenas (SIM-31).
- Help and About with links and licence credits (HELP-1); a collapsible advanced area for the fps readouts (ADV-1, 2).
- A warning for mixed blue masses or radii (PART-11).

## Scenario → phase

| Scenario | Phase           |     | Scenario | Phase              |
| -------- | --------------- | --- | -------- | ------------------ |
| SCN-1    | 1               |     | SCN-15   | 1 (trace: 4)       |
| SCN-2    | 1               |     | SCN-16   | 1                  |
| SCN-3    | 3               |     | SCN-17   | 1                  |
| SCN-4    | 3 (1D: 5)       |     | SCN-18   | 1                  |
| SCN-5    | 3               |     | SCN-19   | 1                  |
| SCN-6    | 3               |     | SCN-20   | 1                  |
| SCN-7    | 2 (piston: 6)   |     | SCN-21   | 4                  |
| SCN-8    | 1 (pressure: 2) |     | SCN-22   | 4                  |
| SCN-9    | 2               |     | SCN-23   | 5                  |
| SCN-10   | 1 (pressure: 2) |     | SCN-24   | 6                  |
| SCN-11   | 2               |     | SCN-25   | 6                  |
| SCN-12   | 2               |     | SCN-26   | 7                  |
| SCN-13   | 2               |     | SCN-27   | 7                  |
| SCN-14   | 1               |     | SCN-28   | 1 (Color by KE: 3) |

## Ordering rationale

- Phases 1–3 deliver most of the manual's and worksheets' experiments on the existing 2D/3D engine with no new physics.
- Phases 4–7 each add one physics capability with its own parity work; they can be reordered or run in parallel.
- Phase 8 helps teachers share setups but no scenario depends on it, so it follows the experiments. Loading a user's own file is pulled into Phase 1 because the parser already exists.
