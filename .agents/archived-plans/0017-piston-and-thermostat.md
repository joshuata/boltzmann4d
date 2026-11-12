# 0017: Piston and thermostat in 2D and 3D (roadmap Phase 6)

_Done._

Roadmap Phase 6 (`0006-spec-roadmap.md`), tracked in #70.

Requirements: SIM-17, SIM-19–23; OPT-6; PART-13; PRED-15. Unlocks STORY-24, STORY-25 and the piston route through STORY-7.

Plan 0005 step 2 ported `Piston`, `PistonState`, the wall thermostat (`Thermostat` + `WallController`) for 2D, with scripted parity fixtures (`2Dpiston-adiabatic`, `2Dpiston-isothermal`), and a 2D piston panel. What's missing is the 3D piston and what students see while it moves.

## Engine: the 3D piston

- `Particle3D.predPistonCol` and its `PISTON` case in `boundaryCollide` port into `particle-3d.ts` next to their 2D twins: the piston comes down from the top (y), exactly as in 2D (`Piston.getRelevantArenaDim` is the y size in 3D too).
- The thermostat applies in 3D as in 2D: every wall (and stopped piston) reflection scales the normal velocity by `calcModifier`, and every boundary event's change in kinetic energy (`Particle3D.getKE`, `sqrt(0 + vx² + vy² + vz²)` squared) feeds `deltaKE`. `WallController` uses `vy` as the normal for the front and back walls (a Java slip); the 2D `calcModifier` already does that for every side but left and right, so it's kept as is for parity. The divider (BARRIER) doesn't scale in 3D, as in Java.
- `compressionLimitPercent` takes the dimension: diameter³ over x·z in 3D (`Physics.calculateCompressionLimit`).
- `Simulation` drops its "no 3D piston" guard and passes the piston and thermostat to the 3D predictors.
- **Parity:** two scenarios in the fork's `tests/.../scenarios/` (`3Dpiston-adiabatic`, `3Dpiston-isothermal`: 40 particles in the `3Dequil` box with the same scripts as the 2D ones), added to `build.xml`'s `parity-dump`. Regenerating also adds empty `actions` and a resting `piston` to the older 3D preset fixtures; harmless.

## Drawing

The 3D view draws Java's `addPiston3D`: a box two valve radii thick under the face, the full width and depth, with a cylinder shaft up through the middle of the top, in the left wall's gold, lit like the walls. It moves with `frame.pistonY` as in 2D.

## Live readouts

The worker's `timing` message already carries the piston's level and motion each frame. It gains:

- `thermostatActive`: the isothermal thermostat is on and acting (the piston is moving, or `deltaKE` is still above its epsilon) — the SIM-21 "Thermostat active" indicator.
- `reference`: the gas temperature (K) and piston level when the current run of same-mode moves began. An adiabatic move after an adiabatic move keeps the reference; any other move (or a load or particle edit) takes a new one. From it, the prediction (PRED-15) is `T₁ (V₁/V₂)^{2/d}` for adiabatic moves (in `stats/formulas.ts`, `adiabaticTemperature`), and `T₁` for isothermal ones.

The live temperature comes from the census (already posted a few times a second). PART-13 holds already: the Particles panel's Temperature field is what the next particles are added at, not the live value.

## One piston panel

`PistonPanel.svelte` becomes the single place for the piston (SIM-19–23, OPT-6):

- **Level** (SIM-23): the piston's present position as the gas's volume, `V/V₀ = 1 − level`, as a percentage and in nm, and a bar showing it.
- **Target volume** slider (SIM-19), as a fraction of the starting volume, from 100% down to the compression limit, and **Move Piston** / **Stop**.
- **Mode**: Adiabatic, Isothermal or Instantaneous (outwards only, as Java).
- **Readouts**: temperature now, the prediction for the present volume with its reference, and the "Thermostat active" badge in the heading while it acts. PV for Boyle's law (STORY-7, 25) is read off the Wall pressure box, which already predicts from the live temperature.
- **Options** (OPT-6, SIM-22): piston speed (nm/ps) and the thermostat's maximum change per wall collision (%, the `dampFactor`, default 10%). The damp factor reaches the engine through `movePiston` (it's reset to 10% when the thermostat is reset, as Java).

## Steps

1. Fork scenarios + fixtures; bump the submodule.
2. 3D piston in `particle-3d.ts` and `Simulation`; compression limit in 3D; parity and unit tests.
3. 3D drawing.
4. Worker readouts, client state, the panel.
5. Docs (`apps/web/src/docs`), spec Web port notes, roadmap Phase 6 status; archive this plan.
