# 0013: Chaos, reversibility and trajectories (roadmap Phase 4)

Requirements: SIM-4, SIM-32; CTRL-2 (doubling steps), CTRL-6; VIEW-5. Unlocks STORY-21 and STORY-22, and the trace for STORY-15 and `2Dliquid`.

## Reference

The Java app has `Particle*.reverse()` (negate the velocity), but nothing calls it: the Time Reverse toggle in `MainGuiFullView` is created disabled and never wired up. So this port defines Reverse itself, following SIM-32: flip every velocity, keep the clock running forward, and let the motion retrace itself.

## Engine (`packages/engine/src/sim/simulation.ts`)

`Simulation.reverse()`:

1. Bring every particle to one time. After `advanceToTime()` (the worker's frames) they already are; after `step()` the clock is moved to the latest particle time first.
2. Negate every particle's velocity.
3. The piston: if it is moving, send it back to the level its current move started from (the simulation remembers that level in `movePiston`). The reversed piston then retraces its path, and adiabatic bounces off it reverse exactly.
4. Treat the moment as an event for every particle: record its state (so `predictionState` starts from here), drop its cached boundary prediction, and re-predict every particle's events.

State that doesn't need flipping:

- Square wells (`lastPairType`, inside or outside each pair's well) and attractive walls (`inWallWell`, drawn-wall wells) describe positions, which reversal keeps. A pair inside its well heading out after reversal is predicted to exit (or reflect), as it should be.
- The cell grid, wraps and the hole or gates are positions too.

Not reversible, and documented as such: the isothermal thermostat (it rescales energies), the conducting divider (it swaps energy with the nearest incoming particle), and the reaction with "suppress reverse". Reverse still flips the velocities there; the motion just won't retrace.

Parity: `reverse()` has no Java counterpart, so it adds nothing to the fixtures; it doesn't change any code path that runs without it. `parity.test.ts` must stay green.

## Worker, client and UI

- `ToWorker` gets `{ type: 'reverse' }`; the worker calls `running.reverse()` between frames and shows the current frame if paused.
- `SimulationClient.reverse()` sends it. A Reverse button (lucide `Rewind` icon) sits with Play, Step and Restart (CTRL-6). It works while running or paused.
- **CTRL-2:** the rate slider moves in doubling steps, ⅛× to 2048× (1× default), instead of the free 0.1×–10× slider. Above a few hundred × the worker can't keep up in real time; it then simulates as fast as it can, which the spec allows ("that's expected").

## Trace (VIEW-5)

- **3D:** a `THREE.Points` cloud of round dot sprites in box coordinates, so the trace turns with the box. Each frame adds a dot per particle at its centre in its current colour, into a ring buffer (old dots are overwritten once it's full, about a minute at 200 particles). Dot size in pixels (`sizeAttenuation: false`), like 2D. Periodic arenas trace the primary image.
- **Clear:** a Clear trace button under the Trace checkbox (both 2D and 3D). It goes `SimulationClient.clearTrace()` → render worker `clearTrace` → `View.clearTrace()`.
- The trace keeps going through Reverse (the clock runs forward), so students see the path retraced; it still resets on Restart and loads (time goes back).
- `ViewOptions` loses `canTrace`: trace works in every dimension.

## Tests

- `simulation.test.ts`, Reverse (SIM-32):
  - 2D and 3D gases, reflecting and periodic: run forward for a short time, `reverse()`, run the same time again; every particle is back at its start (to a tolerance that grows with chaos) with its velocity negated.
  - Energy and momentum are conserved across `reverse()` and the run back; momentum flips sign.
  - Reversing twice restores the original velocities exactly.
  - After `step()` (particles at different times) reverse still retraces.
  - Piston: a moving piston goes back to where its move started.
- `2Dequal` (SIM-4, STORY-21): the left and right halves are mirror copies. Their difference stays at round-off for a while, grows past a visible amount (0.1 nm) at around 95 ps, and the halves are unrelated (difference comparable to the arena) by around 120 ps.
- `thread-controller` is unchanged. Render code is checked in the browser preview.

## Docs

- Spec _Web port_ notes for SIM-4, SIM-32, CTRL-2, CTRL-6 and VIEW-5; Phase 4 status line in the roadmap.
- A user doc page `apps/web/src/docs/reverse-and-trace.md`: Reverse, chaos with `2Dequal`, trace and Clear, speed steps.
