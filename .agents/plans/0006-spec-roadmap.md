# 0006: Roadmap for the feature specs

A phased plan for bringing the requirements in `docs/specs/` into the app. Each phase gets its own detailed `NNNN-*.md` plan when work on it starts; this file says what goes in which phase and why.

## Context

`docs/specs/` lists what the app must do, with requirement IDs and 28 classroom stories (`STORY-*`). Today the app covers part of it: 2D and 3D hard-sphere physics (walls, periodic, divider, hole, the demon gate); in 2D also the conducting divider, the movable piston with its thermostat, pair wells, the attractive wall and red↔blue reactions, turned on from the sidebar's Arena and Wells and reactions boxes; Restart and the demon's open/close toggle; loading bundled presets from a SvelteKit site with 2D/3D menus; play/pause/step, a rate slider and collapsible performance readouts; colour by type, speed or KE (2D and 3D), trace (2D), the demon's closed hole and a scale bar; and the Instantaneous Speed histogram with Red/Blue/Both, checked against kinetic theory (plans 0002, 0003, 0004 steps 1–4, 0005 steps 1–7, 0007). There are no particle controls, pressure, 1D, 3D piston or reactions, reverse, 3D trace, coloured histogram bars, save or export.

The aim is to **enable the learning outcomes, not replicate the desktop app exactly**. Phases are ordered by the classroom stories they unlock, and each one says where it deliberately simplifies the desktop UI.

### Relation to plan 0005 (finish 2D)

Plan 0005 ports the remaining 2D physics modes (thermostat and piston, pair wells, attractive wall and heat reservoir, reactions; all done except the heat reservoir), the 2D rendering baseline (colour modes, trace, palettes, ruler) and some run-time controls (hole toggle, speed, restart). This roadmap doesn't repeat that work. Where a phase below needs one of those, it builds on plan 0005's 2D port and adds what the specs still need: the 3D (and 1D) counterpart, the learning-facing controls and readouts, and the story checks. Where a plan 0005 step and a phase here cover the same control (restart, hole toggle, trace, colour modes), whichever lands first does it and the other cites it.

## Guiding rules

- **Outcome first.** A phase is done when its stories can be run in the web app and give the expected result, not when every desktop control exists. Where a desktop detail doesn't serve a story, we may simplify, rename or drop it; record that in the phase plan and as a _Web port_ note in the spec.
- **Physics stays exact.** Anything that changes the equations (1D, piston, thermostat, reactions, wells) is still checked bit for bit against the Java app with `ParityDump` (fork branch `boltzmann4d-parity-tools`), as AGENTS.md requires. The flexibility is in UI, statistics presentation and workflow, not in the event engine.
- **New runtime operations** with no Java parity hook (adding or removing particles mid-run, switching the arena mid-run, reverse) are tested with invariants: energy and momentum conservation, no overlaps, reproducibility from a seed.
- **Numeric stories become tests.** Where a story gives a number (STORY-4, 8, 10, 14, 26; PRED-14), add a seeded headless long-run Vitest test, fast enough for CI or else opt-in like the benchmarks.
- **UI rules hold:** new data flows worker → `SimulationClient` (`packages/simulator/src/ui/simulation.svelte.ts`) → Svelte props, and every control works on touch and at narrow widths.

## Phases

### Phase 1: Set up and run your own gas

_Done_ (plan 0014, archived; setup itself moved to the scenario editor, plans 0008 and 0010): adding particles at a point or at random, removing the newest, the Particles panel with pending edits, boundary-mode buttons with mid-run arena switches, the clock, Left/Right counts, Restart with new placement and zero momentum, scenarios that load paused. Not done: the editor's drop-particle tool (EDIT-8). Collapsible panels (STAT-25), file loading (FILE-1, 3, 4) and zoom (CTRL-7) are being finished in their own sessions. The core classroom loop.

- **Requirements:** PART-1–9, 12, 14–16; CTRL-1, 3; SIM-6, 12–16, 24 (demon toggle), 30; FILE-1 (user file picker), FILE-3, 4; STAT-25; CTRL-7 (fit-to-view default).
- **Unlocks:** STORY-1, 2, 8, 10, 14, 15, 16, 17, 18, 19, 20, 28 (except Color by KE, Phase 3).
- **Work:**
  - `packages/engine/src/sim`: random placement and velocities on restart (move the placement in `packages/engine/src/io/load.ts`, `loadSpecies`/`randomVelocity`, into `packages/engine/src/sim` so restart and add share it); add a particle at a point or at random without overlap; remove the newest; switch arena type mid-run (divided → hole or undivided keeps running; → divided restarts all on the left); zero total momentum (SIM-30).
  - Worker protocol (`packages/simulator/src/worker/index.ts`): restart, add, drop at a point, remove, set arena, open/close hole, load file text. Replies carry the clock, red/blue and left/right counts, and temperature.
  - UI: a Particles panel (number, mass, radius, temperature for red and blue, with edited values marked pending until restart or add, PART-15), boundary-mode buttons, a demon open/close button, the clock, Restart, Load file, collapsible panels. Tapping the 2D arena drops a blue particle; 3D adds at random.
- **Simplify:** PART-10 (number locked while Red is selected) becomes a number control that always edits the blue count, labelled as such.

### Phase 2: Pressure and the gas laws

_Done_ (plan 0011, archived): wall and virial pressure per kind and per side, Ideal/Real predictions, averaging time and arena size. PRES-9's history plots wait for Phase 3; 1D pressure waits for 1D physics.

- **Requirements:** PRES-1–9; PRED-8, 9 (pressure part); OPT-1, 3; SIM-10, 18.
- **Unlocks:** STORY-7, 9, 11, 12, 13.
- **Work:** wall momentum transfer through `Simulation.onEvent` (port `WallPressure`/`Pressure`), virial pressure for periodic arenas (`VirialPressure`), partial pressures per type, left and right when divided; ideal and real predictions in `packages/engine/src/stats/formulas.ts`; an Ideal/Real toggle; an Options panel with arena size (restarts) and averaging time; a pressure readout marked as warming up for the first `T_avg`.
- **Simplify:** pressure history plots come with Phase 3's history view; this phase shows numbers.

### Phase 3: Complete statistics

_Done_ (plan 0012, archived): every plot but the RDF with its predictions, Ideal/Real and finite-system corrections (Java bug 2 fixed), axis limits, history (including pressure and counts), forget time, heat-coloured bars. Not done: + and − stepping (optional), saving edited limits to a file. Finishes plan 0004 step 5.

- **Requirements:** STAT-1, 3–5, 7–17, 19–23; PRED-1–7, 11; VIEW-4; OPT-4.
- **Unlocks:** STORY-3, 4, 5, 6; history plots for STORY-7–13.
- **Work:** the remaining statistics (velocity components, kinetic energy, free path, time per collision, collision rate, the per-particle averages) behind a plot picker; the Width toggle; editable axis limits that clear only that plot's cumulative data; a history view; the forget-time option; finite-system corrections (with Java bug 2 fixed, see plan 0004); the histogram bar colours matching Color by Speed / KE (particle colouring is done in 2D and 3D, plan 0005 step 6).
- **Simplify:** history may cover the last 150 summaries rather than frames; per-particle-average plots show a note instead of offering a cumulative view (STAT-18); stepping plots with + and − is optional.

### Phase 4: Chaos, reversibility and trajectories

_Done_ (plan 0013, archived): `Simulation.reverse()` (velocities and a moving piston) with a Reverse button, the `2Dequal` divergence test, speed in doubling steps up to 2048×, the trace in 3D (dot sprites in box coordinates) and a Clear trace button. A Dot size control followed with joshuata/boltzmann4d#42.

- **Requirements:** SIM-4, 32; CTRL-2 (doubling steps), CTRL-6; VIEW-5.
- **Unlocks:** STORY-21, 22; the trace for STORY-15 and `2Dliquid`.
- **Work:** `reverse()` in `Simulation` (flip velocities, re-predict); trace in 3D (dot sprites) and a Clear control (2D trace with `trace_point_size` is done, plan 0005 step 6); a `2Dequal` test that the halves match and then diverge around 95–120 ps.

### Phase 5: 1D

_Done_ (plan 0017, archived): `sim/particle-1d.ts` with five 1D parity fixtures (box, mixture, periodic, divided, conducting divider); a lane view in `view-2d.ts`; the Arena panel's Dimension buttons, which restart; 1D collision rates over L_net and pressure in pN with the exact hard-rod Real prediction; two 1D presets for STORY-23. Bug 4 was already fixed by plan 0004. Two more Java 1D bugs fixed (well depth units, reactions passing through), listed in `docs/physics-differences.md`. Not done: a 1D piston (Java has one on the right wall).

- **Requirements:** SIM-7, 8; PRED-1, 3 (1D columns), PRED-10; PRES-3 (pN).
- **Unlocks:** STORY-23; the 1D row of STORY-4.
- **Work:** port `Particle1D.java` to `packages/engine/src/sim/particle-1d.ts` with parity fixtures (extend `ParityDump` with 1D scenes); a 1D view in `view-2d.ts`; a Dimension control that restarts; fix Java bug 4 (`avgRelativeVelocity` in 1D).

### Phase 6: Piston and thermostat

_Not started._

- **Requirements:** SIM-17, 19–23; OPT-6; PART-13; PRED-15.
- **Unlocks:** STORY-24, 25; the piston route through STORY-7.
- **Work:** plan 0005 step 2 ported `Piston`, `PistonState`, `Thermostat*` and `WallController` for 2D with scripted parity fixtures, plus a 2D piston panel (adiabatic, isothermal, instantaneous, stop); this phase adds the 3D piston (with fixtures) and draws it in 3D; a target-volume slider and Move Piston; adiabatic or isothermal; the live piston temperature, a "Thermostat active" indicator and the adiabatic prediction.
- **Simplify:** one piston panel holds the level control (SIM-23) and the Options entries.

### Phase 7: Reactions

_Done_ (plan 0016, archived): the Reactions box with live counts, time averages and widths, the partition-function prediction (13.4 and 14.1 at 300 K), Time to reach, and the energy diagram; Number of Particles as reaction mode's plot; reactions in 3D, so `3Dequil` reacts. No 3D parity fixtures: the Java app has no 3D reactions to compare with.

- **Requirements:** SIM-25–29; PRED-12–14; the Number of Particles plot (STAT-1).
- **Unlocks:** STORY-26, 27.
- **Work:** plan 0005 step 5 ported 2D reactions (scripted `2Dreactions` fixtures, since Java's preset loader runs `2Dequil`/`3Dequil` without reactions), and `reaction_mode TRUE` now turns them on for `2Dequil`; this phase adds them to `Particle3D` with scripted `ParityDump` fixtures and does the same for `3Dequil`; the partition-function prediction in `formulas.ts`, tested against 13.3 and 14.1; an energy diagram with editable `E_f` and `E_r` and "suppress reverse"; the counts history as reaction mode's default plot.
- **Simplify:** the diagram can be a plain SVG with draggable levels and number fields; it needn't match the Java dialog.

### Phase 8: Save, share and export

_Not started._

- **Requirements:** FILE-2, 5, 6; OUT-1–4; VIEW-6 (save the view angle); STAT-11.
- **Work:** a `.set` writer in `packages/engine/src/io` (basic and complete) with round-trip tests over every preset and Java-saved files; save as a download; a custom default kept in `localStorage`; a CSV recorder for averages, cumulative distributions and positions, collected in the worker and downloaded when stopped.
- **Simplify:** one Export dialog; no streaming to disk.
- **See also:** plan 0008 (simulation editor) adds a JSON settings format next to `.set` and shares this writer.

### Phase 9: Extras and polish

_Not started._ Each item is optional; schedule by demand.

- RDF plot and sampling (STAT-1 RDF, STAT-2, 24; OPT-5), useful for discussing `2Dliquid`.
- Energy wells (SIM-33), the attractive wall and heat reservoir in 3D, and the 3D conducting divider: in the Java code, but no story uses them (2D is plan 0005 steps 1, 3 and 4; the 2D heat reservoir waits on #34).
- View options: light scheme, custom colours, lighting toggle, display off for fast accumulation (VIEW-1–3).
- Non-zero total momentum on periodic arenas (SIM-31).
- Help and About with links and licence credits (HELP-1). The collapsible advanced area for the fps readouts (ADV-1, 2) is done: the sidebar's performance readouts collapse and sit last.
- A warning for mixed blue masses or radii (PART-11).

## Story → phase

| Story    | Phase           |     | Story    | Phase              |
| -------- | --------------- | --- | -------- | ------------------ |
| STORY-1  | 1               |     | STORY-15 | 1 (trace: 4)       |
| STORY-2  | 1               |     | STORY-16 | 1                  |
| STORY-3  | 3               |     | STORY-17 | 1                  |
| STORY-4  | 3 (1D: 5)       |     | STORY-18 | 1                  |
| STORY-5  | 3               |     | STORY-19 | 1                  |
| STORY-6  | 3               |     | STORY-20 | 1                  |
| STORY-7  | 2 (piston: 6)   |     | STORY-21 | 4                  |
| STORY-8  | 1 (pressure: 2) |     | STORY-22 | 4                  |
| STORY-9  | 2               |     | STORY-23 | 5                  |
| STORY-10 | 1 (pressure: 2) |     | STORY-24 | 6                  |
| STORY-11 | 2               |     | STORY-25 | 6                  |
| STORY-12 | 2               |     | STORY-26 | 7                  |
| STORY-13 | 2               |     | STORY-27 | 7                  |
| STORY-14 | 1               |     | STORY-28 | 1 (Color by KE: 3) |

## Ordering rationale

- Phases 1–3 deliver most of the manual's and worksheets' experiments on the existing 2D/3D engine with no new physics.
- Phases 4–7 each add one physics capability with its own parity work; they can be reordered or run in parallel.
- Phase 8 helps teachers share setups but no story depends on it, so it follows the experiments. Loading a user's own file is pulled into Phase 1 because the parser already exists.
