# 0005: Finish 2D

Plan 0001 (archived) steps 6–8 for 2D: port every remaining 2D physics mode, its run-time controls, and the 2D rendering baseline. 3D is a separate effort (another session).

_Archived 2026-11-12: steps 1–8 are done. The heat reservoir moved to joshuata/boltzmann4d#34, and 3D trace was done by plan 0013._

## Where 2D stands

- **Ported and parity-checked:** reflecting and periodic arenas, divided arenas, the hole and Maxwell demon gate, `SetTotalMom`. All 15 bundled 2D presets match Java bit for bit. Since then the conducting divider, the piston and thermostat, pair wells and reactions have been ported with their own scenario fixtures, and the attractive wall with Java's bugs fixed (steps 1–5).
- **Not reachable from presets:** no bundled 2D preset uses an unported feature.
  - Java ignores most mode keys in `.set` files: `DummyMain` hard-codes reactions, pair wells, the attractive wall and the heat reservoir to off, and Load drops `demonMode`.
  - `2Dequil.set` says `reaction_mode TRUE`, but Java runs it without reactions. The port now turns them on with the Reactions tab's defaults (step 5).
  - The only modes a `.set` file can turn on are `boundary PISTON` and `divider_thermal_mode CONDUCTING`. Everything else comes from the Simulation Settings dialog.
- **Deterministic:** the physics never uses `Math.random` or the wall clock, the thermostat included. The heat reservoir is deferred (#34) because a correct thermal wall needs a seeded random generator. Only run-time controls arrive at wall-clock moments: piston moves, hole toggles, speed changes and pause truncating a frame. Parity tests script them at frame boundaries.

## Physics modes (steps 1–5)

All done except the heat reservoir; the table records what each one ported.

| Feature | Java (under `model/physics`) | Turned on by | Depends on |
| --- | --- | --- | --- |
| Conducting divider | `Physics.PerformEvent` barrier branch, `findIncomingParticleOnOppositeSide` (~85 lines) | `.set` `divider_thermal_mode CONDUCTING`, arena settings | — |
| Movable piston | `Piston.java`, `Particle2D.predPistonCol` and its collide branch, `Physics.AdjustPistonLevel`, the `PISTON_ALL` re-predict (~475 lines) | `.set` `boundary PISTON`; run-time piston panel (adiabatic / isothermal / instantaneous, speed, stop) | Thermostat (isothermal) |
| Wall thermostat | `Thermostat`, `WallController`, the `velAdjust` hooks in `boundaryCollide` (~320 lines) | Isothermal piston moves only | — |
| Pair energy wells | `predColEnterWell` / `predColExitWell`, the well collide branches, `LastCollisions` (~300 lines) | Settings dialog, Energy Wells tab | Cells ≥ well diameter; sparse per-pair last event |
| Attractive wall and heat reservoir | `predBoundaryCol` y-branch, gravity-well collide, `PhysicsFormulas.calculateVelocityChange` (~120 lines) | Settings dialog, Energy Wells tab; run-time reservoir temperature | — |
| Red↔blue reactions | `Particle2D.collideWith` reaction branch, `ReactionRelationship` (~90 lines) | Settings dialog, Reactions tab | Per-particle colour in engine, statistics and renderer |

Rendering for 2D (`vendor/boltzmann3d/docs/rendering-baseline.md`), all done in step 6 unless noted:

- **Colour modes:** Normal, Speed and KE. The hue comes from speed or KE against 2.5× the predicted average. Frames need velocities.
- **Trace mode** with `trace_point_size`, cleared on load, restart and resize.
- **Piston drawing:** valve slab and shaft, positioned within the frame. _Step 2._
- **Maxwell demon closed state**, drawn as a solid divider.
- **Palettes:** `color_scheme` DARK, LIGHT and CUSTOM. _Not needed: Java never reads `color_scheme`._
- **Particle colours that change** during a run (reactions). _Step 5._
- **Scale ruler** in nm. _A scale bar replaces the Swing rulers._

Run-time controls: the piston panel (step 2) and simulation speed (`ThreadController` paces by wall-clock time, scaled by `simulation_speed` and the rate slider) are done, and so are the hole toggle (a button or a click on the arena) and Restart (step 7).

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
2. **Thermostat, then piston:** engine, scripted parity fixtures (adiabatic, isothermal, instantaneous, stop), worker messages, piston panel and piston drawing. _Done: `packages/engine/src/sim/piston.ts` and `packages/engine/src/sim/thermostat.ts`; `2Dpiston-adiabatic` and `2Dpiston-isothermal` scenario fixtures (scripted moves and a stop, about 900 piston hits each) match bit for bit. The instantaneous move re-predicts (#24) and only pulls the piston out, as Java's panel allows. Boundary events are now cached per particle as Java predicted them, so lazily re-predicted pairs don't re-predict against a piston that has moved since. The sidebar gets an Arena box (movable piston on reflecting presets, conducting divider on divided ones) and a Piston panel; the piston is drawn as Java draws it._
3. **Pair energy wells:** engine (cell size, sparse last-event map) and parity fixture. _Done: `predictPair2D` predicts entering and leaving a pair's well (non-periodic arenas, as in Java) from the pair's last event, kept in a sparse map; `collide2D` performs entering, leaving and bouncing off the well's edge (WELL_REFLECT). Cells cover the largest well. `2Dwells` and `2Dwells-mixture` scenario fixtures (wells set through ParityDump's `wells` directive) match bit for bit; kinetic plus well energy is conserved to 1e-9, also with deep wells. The Arena box offers attractive wells (radius multiple, depth per species)._
4. **Attractive wall and heat reservoir:** engine with the bugs fixed, conservation tests, reservoir temperature control. _Attractive wall done, with Java's bugs fixed: crossing the well's top changes the kinetic energy by the depth (Java changed the speed), x keeps moving, and particles without the energy to leave bounce back. Kinetic plus well energy is conserved to 1e-9, and a dilute gas fills the well by the Boltzmann factor (within 2.5%). The heat reservoir is deferred to joshuata/boltzmann4d#34: Java's rule settles the gas near half the reservoir temperature, and a correct thermal wall needs a seeded random generator in `packages/engine/src/sim`._
5. **Reactions:** per-particle colour in the engine, frames and renderer, plus a parity fixture. _Done: `Particles.color` (the colour shown; type, mass and radius stay), reactions in `collide2D`, frames carry colours and the 2D view recolours, statistics bin by colour. `2Dreactions` and `2Dreactions-suppressed` scenario fixtures (ParityDump's `reactions` directive) match bit for bit, final colours included. Kinetic plus chemical energy is conserved to 1e-9 and the equilibrium [blue]/[red] matches exp(−ΔE/2kT) within 2.5%, so Java's model is sound. The Arena box offers reactions on one-species 2D presets; `reaction_mode TRUE` (2Dequil) now turns them on with the tab's defaults (8 and 4 kJ/mol), where Java ignored it. Statistics still weight predictions by the starting counts per colour._
6. **Rendering baseline:** colour modes, trace, demon closed state, palettes, scale ruler. _Done: colour by type, speed or kinetic energy (hue 0.7 → 0 up to 2.5 × the predicted average, as Java's colourers; 2D and 3D); trace mode in 2D (marks accumulated in an off-screen target, cleared on resize, restart or turning it off; `2Dliquid` starts with it on); the demon's hole drawn closed while it is; Java's grey piston; a scale bar over the 2D arena in place of the Swing rulers. Palettes aren't needed: Java never reads `color_scheme` and always uses one palette. A View box in the sidebar picks the colour mode and trace. 3D trace is still to do._
7. **Run-time controls:** hole toggle, simulation speed, restart. _Done: simulation speed is wall-clock frame pacing in `packages/simulator/src/worker/thread-controller.ts`, with the rate slider on top (#30). Restart rebuilds the running simulation from the same starting state (Java's reset; unlike Java it zeroes a periodic arena's momentum again, so the run repeats exactly). The Arena box offers Maxwell's demon on arenas with a hole; the hole opens and closes with a button or a click on the 2D arena, from the next frame, as in Java._
8. **Settings:** the parts of the Simulation Settings dialog that turn these modes on (arena, wells, reactions), as Svelte components. _Done (joshuata/boltzmann4d#42): every sidebar setting is in a collapsible panel, apart from the always-open Run box built from shadcn-svelte components. **Run** (`RunPanel.svelte`, always open at the top) has the clock, play/pause, step, reverse, restart, the hole and gate toggles and the speed. **View** has colour, kind markers, trace and its dot size (`trace_point_size`). **Arena** (`ArenaPanel.svelte`) has the boundaries, the movable piston, conducting divider and demon, and the size. **Wells and reactions** (`InteractionsPanel.svelte`) has pair wells, the attractive wall and reactions, each with Apply. **Piston** (`PistonPanel.svelte`) has the run-time piston controls. The heat reservoir waits on #34; the rest of Java's settings dialog (particles, statistics) is covered by the Particles and Statistics panels and the editor (plan 0008)._
