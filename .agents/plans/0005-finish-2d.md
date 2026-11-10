# 0005: Finish 2D

Plan 0001 steps 6–8 for 2D: port every remaining 2D physics mode, its run-time controls, and the 2D rendering baseline. 3D is a separate effort (another session).

## Where 2D stands

- **Ported and parity-checked:** reflecting and periodic arenas, divided arenas, the hole and Maxwell demon gate, `SetTotalMom`. All 15 bundled 2D presets match Java bit for bit.
- **Not reachable from presets:** no bundled 2D preset uses an unported feature.
  - Java ignores most mode keys in `.set` files: `DummyMain` hard-codes reactions, pair wells, the attractive wall and the heat reservoir to off, and Load drops `demonMode`.
  - `2Dequil.set` says `reaction_mode TRUE`, but Java runs it without reactions. Keep that for parity.
  - The only modes a `.set` file can turn on are `boundary PISTON` and `divider_thermal_mode CONDUCTING`. Everything else comes from the Simulation Settings dialog.
- **Deterministic:** the physics never uses `Math.random` or the wall clock, the thermostat and heat reservoir included. Only run-time controls arrive at wall-clock moments: piston moves, hole toggles, speed changes and pause truncating a frame. Parity tests script them at frame boundaries.

## What's left

| Feature | Java (under `model/physics`) | Turned on by | Depends on |
| --- | --- | --- | --- |
| Conducting divider | `Physics.PerformEvent` barrier branch, `findIncomingParticleOnOppositeSide` (~85 lines) | `.set` `divider_thermal_mode CONDUCTING`, arena settings | — |
| Movable piston | `Piston.java`, `Particle2D.predPistonCol` and its collide branch, `Physics.AdjustPistonLevel`, the `PISTON_ALL` re-predict (~475 lines) | `.set` `boundary PISTON`; run-time piston panel (adiabatic / isothermal / instantaneous, speed, stop) | Thermostat (isothermal) |
| Wall thermostat | `Thermostat`, `WallController`, the `velAdjust` hooks in `boundaryCollide` (~320 lines) | Isothermal piston moves only | — |
| Pair energy wells | `predColEnterWell` / `predColExitWell`, the well collide branches, `LastCollisions` (~300 lines) | Settings dialog, Energy Wells tab | Cells ≥ well diameter; sparse per-pair last event |
| Attractive wall and heat reservoir | `predBoundaryCol` y-branch, gravity-well collide, `PhysicsFormulas.calculateVelocityChange` (~120 lines) | Settings dialog, Energy Wells tab; run-time reservoir temperature | — |
| Red↔blue reactions | `Particle2D.collideWith` reaction branch, `ReactionRelationship` (~90 lines) | Settings dialog, Reactions tab | Per-particle colour in engine, statistics and renderer |

Rendering still missing for 2D (`vendor/boltzmann3d/docs/rendering-baseline.md`):

- **Colour modes:** Normal, Speed and KE. The hue comes from speed or KE against 2.5× the predicted average. Frames need velocities.
- **Trace mode** with `trace_point_size`, cleared on load, restart and resize.
- **Piston drawing:** valve slab and shaft, positioned within the frame.
- **Maxwell demon closed state**, drawn as a solid divider.
- **Palettes:** `color_scheme` DARK, LIGHT and CUSTOM.
- **Particle colours that change** during a run (reactions).
- **Scale ruler** in nm.

Run-time controls still missing: hole toggle (click the arena), piston panel, simulation speed (`simulation_speed` is loaded but unused), restart.

## Java behaviour to decide on

- **Instantaneous piston moves** set the level without re-predicting, so particles already headed for the old position bounce there once. Java only allows expansion in this mode.
- **Attractive wall:**
  - On entering or leaving the well, x isn't advanced although `t0` is, so particles jump back in x.
  - Speed is subtracted linearly, so energy isn't conserved.
  - Leaving has no "not enough energy" check.
- **Pair wells** are silently ignored on periodic arenas.
- **Conducting divider:** it moves every particle to the event time at each barrier hit (`findIncomingParticleOnOppositeSide`). That's an O(N) scan which also shifts later prediction arithmetic. For parity the port must treat it like an extra frame move.
- **Pause:** it truncates the current frame at the current event (`stopProcessingCurrentFrame`), which TS treats as a no-op.

Decision (2026-11-09): replicate Java where its behaviour is defensible, and prove it with parity fixtures. Fix clear bugs (the attractive wall's x jump, lost energy and missing exit check, and the instantaneous piston's missing re-predict), each with a comment describing Java's behaviour. Test the fixes against conservation laws instead of parity. Every fix and every questionable item is tracked in joshuata/boltzmann4d#24.

## Approach

- **Parity tooling:** extend the fork's `ParityDump` with scenarios that a `.set` file can't express:
  - settings set directly on `SimulationInfo` (wells, wall, reactions),
  - scripted actions at given frames (piston moves and stops, hole toggles).
  - Fixtures go in `packages/engine/src/sim/parity/` next to the preset ones.
- **Engine:** everything stays in `packages/engine/src/sim`, pure and synchronous.
  - New state goes in typed arrays: per-particle colour, per-type well depth, and a sparse per-pair last well event.
  - The piston and thermostat become small classes owned by `Simulation`.
- **Run-time controls:** new worker messages, exposed through `SimulationClient` methods per the AGENTS.md UI rules. The sidebar gets Svelte controls that work at phone width.
- **Benchmarks:** each mode gets a scene in `simulation.bench.ts`, so its cost is measured.

## Steps

1. **Conducting divider:** engine, `.set` support, parity fixture. _Done: bit-identical with Java on `2Dhotcold-conducting` (330 divider hits in 2,001 events); a test shows the two sides reach one temperature while an insulating divider keeps them apart. Each hit moves every particle (as Java does), which `Simulation` replays as an extra entry in `frameTimes`._
2. **Thermostat, then piston:** engine, scripted parity fixtures (adiabatic, isothermal, instantaneous, stop), worker messages, piston panel and piston drawing.
3. **Pair energy wells:** engine (cell size, sparse last-event map) and parity fixture.
4. **Attractive wall and heat reservoir:** engine with the bugs fixed, conservation tests, reservoir temperature control.
5. **Reactions:** per-particle colour in the engine, frames and renderer, plus a parity fixture.
6. **Rendering baseline:** colour modes, trace, demon closed state, palettes, scale ruler.
7. **Run-time controls:** hole toggle, simulation speed, restart. Frame pacing is being reworked separately (wall-clock time), so this builds on that.
8. **Settings:** the parts of the Simulation Settings dialog that turn these modes on (arena, wells, reactions), as Svelte components.
