# 0014: Set up and run your own gas (roadmap Phase 1, the rest)

What is left of roadmap Phase 1 (`0006-spec-roadmap.md`) after the scenario editor (plans 0008, 0010) took over setting up a scenario: changing the gas while it runs.

Requirements: PART-1–9, 12, 14–16; CTRL-1, 3; SIM-6, 12–16, 30; STAT-25; CTRL-7. Unlocks the direct routes for STORY-14, 16, 17 and 19.

## Design

**Edits rebuild the simulation from its present state.** `Simulation` keeps fixed-size typed arrays, a cell grid sized for the largest particle and an event heap; growing all of that in place would be fragile, and Java's own add-particle path is commented out (`Load.java`), so there is no parity hook either way. Instead:

- `Simulation.currentState()` returns an `InitialState` for the present moment: every particle at the current time, its velocity and displayed kind (reactions recolour), the clock, the piston level, the demon's hole and the gates.
- `InitialState` gains optional `time`, `pistonLevel`, `holeOpen` and per-species `colors`. Absent, everything is as before, so parity is untouched.
- Pure functions in `packages/engine/src/sim/particle-edits.ts` turn one state into the next: `addParticle` (at a point or at random, never overlapping), `removeNewest`, `continueInArena` (a new arena type with the particles where they are, or null when they don't fit) and `census` (counts per kind and side, temperatures).
- The worker builds a new `Simulation` from the edited state. The clock carries on; the statistics and pressure averages start afresh from the edit (their cumulative data belonged to the old gas). A moving piston stops, and the isothermal thermostat is off again.

**Placement is shared** (`packages/engine/src/sim/placement.ts`): `PlacementSpace` answers "does a particle of radius r fit here?" against the box, the divider, drawn walls, the piston and other particles (periodic arenas measure across the edges), in 2D and 3D. The scenario resolver's `Placer` uses it for its divider, wall and particle checks with the same comparisons, so editor scenarios place exactly as before. `randomVelocity`, `velocityFromAngles` and `zeroMomentum` move there too.

**Restart (CTRL-3, PART-14, SIM-6, SIM-30)** re-resolves the scenario (`resolveScenario`'s `zeroMomentum` and `allOnLeft` options): new random positions and directions, the clock at zero, statistics cleared. Each kind keeps its live count (including particles added mid-run) and takes the Particles panel's pending mass, radius and temperature. The randomly given velocities of each group are shifted to zero total momentum and rescaled back to their kinetic energy (SIM-30); particles at given positions keep theirs (a 0 K group stays still). Java only does this in periodic arenas, so the first load of a `.set` file is unchanged.

**Arena switches (SIM-12–16):**

- divided → hole, divided or hole → box, box → periodic, ...: carry on with the particles where they are (SIM-15, 16), as long as they all fit in the new arena.
- → divided always restarts with every particle on the left (SIM-14).
- Any other switch whose particles don't fit (say, a particle on the divider line) restarts too.
- Piston arenas keep their own switch in Arena options.

## Worker protocol

- `addParticle { kind, at?: [x, y, z], temperature }`: at a point (2D taps) or at random.
- `removeParticle { kind }`: the kind's newest.
- `setCount { kind, count, temperature }`: adds at random or removes the newest, in one rebuild.
- `setBoundary { boundary }`: `PERIODIC | REFLECTING | DIVIDED | HOLE`.
- `restart { kinds? }`: the panel's pending mass, radius and temperature per kind.
- New reply `census` (with the pressure readout, a few times a second): the clock, counts per kind, left and right counts per kind in divided arenas (PART-16), and temperatures per kind and overall (PART-12).
- New reply `notice`: a refused add or restart, shown in the panel (not the error overlay).
- `loaded` gets `continued` (an edit of the same run, so the client keeps the user's choices), `paused` (FILE-4: a fresh load follows the scenario's `paused`), `setupKinds` (every scenario kind, for the panel) and `arena.boundary`.
- A kind with no particles (resolve leaves it out) joins as a new species when one is added (`emptySpecies`), so blue can be added to an all-red preset. The reaction switch's species checks are unaffected.
- A switch that restarts places the scenario's explicitly placed particles anew too (`withArenaSize` at the same size), since they may sit on the new divider.

## UI

- `ParticlesPanel.svelte` (collapsible, STAT-25):
  - a kind picker;
  - Number with − and + (PART-1, 8, 9): typing a new number adds at random or removes the newest;
  - Mass, Radius and Temperature fields (PART-2–4), marked "pending" while they differ from the running values (PART-15). Temperature applies to the next add (PART-7) and then stays as the kind's add temperature; mass and radius apply on Restart;
  - the live system temperature (PART-12) and Left #/Right # in divided arenas (PART-16).
- `BoundaryButtons.svelte`: periodic, box, divided, hole (SIM-12–16), saying which switches restart.
- `ClockReadout.svelte`: the simulation clock in ps (CTRL-1).
- Tapping the 2D arena drops a particle of the panel's kind at that point (PART-8), unless it hits a gate or the demon's hole toggle. In 3D a tap adds one at random; a drag that turns the view isn't a tap (`wasDragged` in `rotate-view.ts`).
- CTRL-7: the views already fit the arena to the canvas; nothing to do.

## Simplifications

- PART-10: the Number control edits the selected kind's count, not "blue only".
- PART-7, PART-11: added particles take the kind's running mass and radius. Edits to those wait for Restart, so a kind keeps one mass and radius and the predictions stay right.
- PART-6: Restart keeps each kind and side as the scenario places them, rather than turning everything red.
- EDIT-8 (the editor's drop-particle tool) is a follow-up. The editor has no tool for explicitly placed particles yet, and adding one means a new tool, a hit test and a properties panel.

## Tests (invariants)

These operations have no Java parity hook, so `particle-edits.test.ts` checks invariants:

- no overlaps after adds, at a point or at random, in 2D, 3D, periodic and divided arenas;
- a refused drop on top of another particle;
- an add's kinetic energy is d/2 kT, and an add at 0 K doesn't move;
- removal takes away exactly the removed particle's energy and momentum (PART-9);
- the same seed gives the same result;
- divided → hole and → box keep the clock and the run going (particles cross afterwards);
- energy is conserved after an edit;
- zeroed momentum on restart.

`parity.test.ts` stays green.
