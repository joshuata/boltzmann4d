# Physics and statistics differences from the Java app

boltzmann4d aims for the same physics as [boltzmann3d](https://github.com/byu-chem/boltzmann3d), checked bit for bit by the parity fixtures in `packages/engine/src/sim/parity/`. Where Java is wrong or missing something, the port follows real physics instead, and every such place is listed here.

**Keep this list complete.** Any change that makes the port's results differ from Java's adds an entry: what Java does, what the port does, why, the files, the issue or PR, and how it's tested (a parity fixture can't cover it, so name the test that checks it against theory or invariants).

Not listed: UI differences, pure refactors, and settings Java read but ignored that the port merely keeps (`resolve.ts` header).

## How results are checked

- **Physics:** 35 parity fixtures (2D and 3D presets plus scripted scenes: conducting divider, adiabatic and isothermal pistons in 2D and 3D, wells, reactions) replay Java's recorded starting state and must reproduce its events and final state bit for bit. They record Java's starting state, so placement changes never touch them. Every difference below either stays out of the fixtures' scenes or doesn't change the events.
- **Statistics, predictions and pressure:** no Java parity at all (plan 0004). Java's sums iterate identity-hashed maps and sample at wall-clock times, so they aren't reproducible even in Java, and it has too many bugs to serve as a reference. They are checked against kinetic theory instead (`packages/engine/src/stats/correctness.test.ts` and the other `stats/*.test.ts`).

## Physics: Java bugs fixed

### Attractive wall energy (#24, PR #35)

- **Java:** crossing the edge of the bottom wall's well changes the normal _speed_ by √(2E/m), so energy isn't conserved. It also updates `t0` without advancing x, so the particle jumps back in x, and a particle can leave the well without the energy to climb out.
- **Port:** the kinetic energy changes by exactly E; x keeps moving; a particle without enough normal kinetic energy reflects back into the well.
- **Files:** `packages/engine/src/sim/attractive-wall.ts`, `sim/particle-2d.ts` (`ENTER_GRAVITY_WELL`/`EXIT_GRAVITY_WELL`).
- **Tested:** `sim/attractive-wall.test.ts` conserves kinetic + well energy to 1e-9 and checks the Boltzmann factor exp(E/kT) in the well.

### Instantaneous piston moves re-predict (#24, PR #28)

- **Java:** `Physics.AdjustPistonLevel` sets the new level without a calendar update, so particles already heading for the old position bounce there once more.
- **Port:** re-predicts every boundary event. As in Java, this mode only pulls the piston out.
- **Files:** `packages/engine/src/sim/simulation.ts` (piston level).
- **Tested:** the piston fixtures avoid instantaneous moves; `sim/piston.test.ts`.

### Thermostat damping can be set (#70)

- **Java:** the piston window's "Damp factor" spinner (10%) is never read; the thermostat's damp factor is always 0.1.
- **Port:** the Piston box's Thermostat damping field sets it for isothermal moves (OPT-6). At the default of 10% results are Java's, bit for bit.
- **Files:** `packages/engine/src/sim/simulation.ts` (`movePiston`), `sim/thermostat.ts`, `packages/simulator/src/ui/PistonPanel.svelte`.
- **Tested:** the isothermal piston fixtures run at the default; other values only change how fast `deltaKE` is taken back.

### Heat reservoir not ported (#34, open)

- **Java:** `PhysicsFormulas.calculateVelocityChange` subtracts a speed where it means an energy, and even fixed, its deterministic nudge settles the gas near half the reservoir temperature.
- **Port:** no reservoir yet. #34 proposes a seeded stochastic thermal wall.

### Pause doesn't cut the frame (#24)

- **Java:** `stopProcessingCurrentFrame` truncates the frame at the wall-clock moment pause is pressed.
- **Port:** frames always run to their end, so a run doesn't depend on when the user paused.

### Well bookkeeping measured in the plane (#24)

- **Java:** `Physics.initializeLastCollisions` measures whether pairs start inside a well in 3D, and its loader gives 2D particles a random z.
- **Port:** measures 2D pairs in the plane. Only the potential-energy bookkeeping changes; events are bit-identical.
- **Files:** `packages/engine/src/sim/simulation.ts`.

## Physics: loading, placement and restarts

### Random placement rejects overlaps (#10, PRs #61, #86)

- **Java:** `Load.java` and `SimSettingsController.randomlyPlaceParticles` draw each position once and never check for overlaps, so particles can start inside each other.
- **Port:** redraws an overlapping spot (up to 2,000 attempts). A spot that fits first time uses the same three draws as Java.
- **Files:** `packages/engine/src/scenario/resolve.ts`.
- **Tested:** `scenario/random-placement.test.ts`.

### Presets placed at random (PR #60)

- **Java:** `default`, `2Dpresnum` and `3Dpresnum` were saved with fixed positions.
- **Port:** rewritten as RandomlyPlaced blocks with the same counts and speeds.
- **Files:** `packages/engine/src/io/presets.ts`.

### Restart zeroes momentum and places anew (PR #41, plan 0014, SIM-30)

- **Java:** `Physics.reset()` restores the starting state without `SetTotalMom`; it zeroes momentum only when loading a periodic arena.
- **Port:** Restart re-resolves the scenario, shifting each randomly placed group's velocities to zero total momentum and rescaling to keep its kinetic energy, in every arena. The first load of a `.set` file keeps Java's velocities.
- **Files:** `packages/engine/src/scenario/resolve.ts`.

### Settings Java ignored that change the physics

- `maxwell_demon_mode` is honoured; Java parsed it and dropped it (`scenario/resolve.ts`).
- `reaction_mode TRUE` turns reactions on (8 and 4 kJ/mol, the tab's defaults) when Java's own conditions hold (2D, one type); Java's loader ignored it, so `2Dequil` ran without reactions (`scenario/migrate.ts`, PR #38).

## Physics: web-port additions

These have no Java counterpart, so they can't change any Java result, but they are physics the port adds.

- **Time reversal** (plan 0013): Java has `Particle.reverse()` but never calls it. The port flips every velocity and sends a moving piston back (`sim/simulation.ts`, tested in `sim/reverse.test.ts`).
- **Reactions in 3D**, **up to 10 kinds** and **general rules A + B → C + D** (plan 0010, PR #58). Java's single red↔blue rule keeps its exact code path (`sim/reactions.ts`, covered by the reaction fixtures).
- **Drawn walls** (plan 0010, PR #58): reflecting, thermal (deterministic: normal speed √(2kT/m)), semipermeable, gate and attractive segments. They lose ties against Java's events. Spawn regions and wall-aware placement replace Java's placement when walls or regions are present (`sim/segment-walls.ts`, `scenario/resolve.ts`, tested in `sim/segment-walls.test.ts`).
- **Adding and removing particles mid-run** and **arena switches that carry on** (plan 0014): Java's add-particle path is commented out (`sim/particle-edits.ts`, `sim/placement.ts`).

## Statistics

### Time weighting follows every change of velocity (#18)

- **Java:** `ParticleStateAnalyzer` credits a particle's velocity just before each particle–particle collision with the whole time since its previous one. Wall bounces in between are ignored, which is wrong for the X/Y/Z velocity components (their sign flips at walls) and for speed and kinetic energy whenever a wall changes the speed (piston, thermostat, attractive wall). A particle that never meets another is never recorded.
- **Port:** each velocity is credited for exactly as long as the particle held it: up to every event that involves the particle (collisions, walls, dividers, pistons, wells, drawn walls) and up to a time reversal. Periodic boundary crossings are skipped, since they don't change velocities. The measured temperatures that predictions use (#23) come from the same data.
- **Files:** `packages/engine/src/stats/statistics.ts` (`recordVelocity`, `velocitiesWillChange`), `packages/simulator/src/worker/sim.worker.ts` (reverse).
- **Tested:** `stats/statistics.test.ts`: particles bouncing between walls without meeting count for the whole run at ± their speed; a reversal credits the old velocities up to it; over an attractive wall, the time-weighted ⟨v²⟩ equals Σv² integrated exactly event by event (to 1e-9).

### Free paths include wall bounces (#18)

- **Java:** the free path is the speed just before the collision × the time since the previous one.
- **Port:** the distance actually travelled since the previous particle collision, summed over every stretch of constant velocity. The two agree unless a wall changed the speed in between.
- **Files:** `packages/engine/src/stats/statistics.ts` (`recordCollision`).

### Per-particle averages (plan 0012, #18)

- **Java:** `IndividualParticleStatisticTracker` divides Average Speed, Average RMS Velocity, Average Energy, Average Path and Collision Rate by the total particle count across all types, even for one type; it counts particles that haven't collided yet as zero, divides only completed intervals by the full simulated time (biasing low), and never forgets.
- **Port:** one value per particle of the chosen kinds, including the stretch still in progress, divided by the time since the forget (since the start until then). The forget clears them along with the other cumulative data, after crediting every particle's velocity up to the forget time.
- **Files:** `packages/engine/src/stats/statistics.ts` (`sampleCurrent`, `forget`); spec STAT-17, STAT-18.
- **Tested:** `stats/statistics.test.ts` (per-particle averages restart at the forget).

### Histogram and unit bugs (plan 0004 bugs 1 and 3)

- **Java:** `alignHistogramBinRangesAcrossGroups` converts the shared range to base units while values arrive in display units, emptying the Kinetic Energy, Average Energy, Path, Average Path and Time/Collision histograms and squashing Collision Rate into bin 0. `Path` and `TimePerCollision` ignore the unit asked for in `getPredictionForAverage`.
- **Port:** every value and range is in display units (`stats/recorder.ts`, `stats/statistics.ts`).

### Statistic subsets

- Sets of kinds are enumerated in a fixed bitmask order rather than Java's `HashSet` order; above three kinds, only each kind alone and all together are tracked (`stats/formulas.ts`, `statisticSubsets`).

## Predictions

- **Measured temperatures** (#23, PR #29): Java predicts each type at its initial temperature. The port predicts each kind at the temperature measured from the data shown (time-weighted ⟨v²⟩ for cumulative, the frame's for current), falling back to the initial temperature before there's data. Axis ranges still come from the initial temperatures (`stats/predictions.ts`, `stats/statistics.ts`; tested in `stats/correctness.test.ts`).
- **Normalised densities:** a mixture's curve weights its kinds correctly (`stats/predictions.ts`).
- **Finite-system densities** take the total energy from the measured temperatures and use Γ ratios via log-gamma; Java's plain Γ ratio overflows to NaN above about 60 particles (`stats/predictions.ts`).
- **RMS Velocity with finite-system corrections on periodic arenas** gives √(2·KE/m); Java's `correctedRMSVel` throws (plan 0004 bug 2; `stats/formulas.ts`).
- **1D mean relative speed** uses the 1D formula; Java used the 2D one (plan 0004 bug 4; `stats/formulas.ts`). There is no 1D physics yet.
- **Free Path and Time per Collision for a set of kinds** weight each kind by its collision rate, not just its count (PRED-7; `stats/predictions.ts`).

## Pressure

- **Wall momentum per hit** (plan 0011, PRES-1): Java uses 2m|vₓ|; the port uses m(|vₓ before| + |vₓ after|), the same for a plain bounce and right when the thermostat changes the speed (`stats/pressure.ts`).
- **Virial pressure** (plan 0011, PRES-5): Java uses the starting energy; the port averages ⟨KE⟩ over time per kind, so partial pressures work and reactions are accounted for. Each collision's virial term is split equally between its two kinds (`stats/pressure.ts`).
- **Pressure predictions** use each side's current temperature; Java used the initial one (PRES-4, `stats/pressure.ts`).
- **Drawn walls** aren't measured; the readout keeps measuring the box's left and right walls and predicts with the box's volume (`stats/pressure.ts`).

## Java quirks kept on purpose

These look questionable but are reproduced so the parity fixtures stay bit for bit. Changing any of them moves it to the sections above.

- **Square-well depth halved:** entering a pair well changes the kinetic energy by E/2 (`sim/particle-2d.ts`, `sim/simulation.ts`).
- **Pair wells ignored on periodic arenas** (`sim/simulation.ts`, `sim/particle-2d.ts`).
- **Conducting divider** moves every particle and scans all of them to find its partner (`sim/simulation.ts`).
- **Thermostat heuristic:** `WallController`'s velocity scaling, not a heat bath, also applied at a stopped piston and, in 2D only, the divider; the front and back walls in 3D use the y velocity as their normal (`sim/thermostat.ts`, `sim/particle-3d.ts`, #24).
- **Piston moves are retroactive** (they start from the last frame's end), and a piston at rest can tie or race with the top wall.
- **Reactions recolour particles but keep their type:** mass and radius stay, and statistics and pressure bin by colour.

## Platform noise

The 3D hole's edge spheres come from `Math.sin`/`Math.cos`, which can differ in the last bit between the JVM and V8. The parity test uses Java's recorded ring; the app computes its own (`sim/parity/README.md`). This isn't a deliberate difference.
