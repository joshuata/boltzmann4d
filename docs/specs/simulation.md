# Simulation

The physical model and the arena configurations. Source: manual §I.A, §I.D (boundary modes, piston), §I.I (simulation menu), §III (FAQ), §VI, §VIII.

## Physical model

- **SIM-1** Particles are hard spheres (disks in 2D, rods on a line in 1D) with no forces between them except at contact. Between collisions they move in straight lines at constant velocity.
- **SIM-2** Two particles collide when their centres are exactly the sum of their radii apart. A particle hits a wall when its centre is one radius from the wall. Collisions are perfectly elastic: total momentum and kinetic energy are conserved, and nothing else is assumed.
- **SIM-3** Motion is computed exactly from event to event (no fixed time step), so energy is conserved to round-off. In a long single-species run, kinetic energy must drift by no more than about 1e-13 relative over several microseconds of simulated time.
- **SIM-4** The motion is chaotic: tiny differences in initial conditions grow exponentially. The app must not hide this (for example by snapping or re-normalising positions); the `2Dequal` preset relies on round-off making two identical halves diverge after roughly 90–120 ps. _Web port:_ done; `reverse.test.ts` checks that `2Dequal`'s halves differ only by round-off at first, grow apart exponentially, are a radius apart by 80–100 ps (about 88 ps) and unrelated by 120 ps (about 103 ps).
- **SIM-5** Simulated time is shown in ps. At the default speed the clock advances roughly 1 ps per wall-clock second.
- **SIM-6** On restart, every particle gets a random position (no overlaps) and a random direction, all with the same speed `v = sqrt(d R T / M)` (d = dimension), so every particle starts with the average kinetic energy `d R T / 2` per mole. Temperature is defined throughout as `T = 2 <KE> / (d R)`. _Web port:_ done for Restart and for added particles (`speedForTemperature` in `sim/placement.ts`).

## Dimensions

- **SIM-7** Simulations run in 1D, 2D or 3D, chosen from a Dimension control. 2D is the default.
- **SIM-8** 1D confines particles to a horizontal line across the arena. Particles keep their order and only collide with their neighbours; equal masses just swap velocities, so a single-mass 1D gas does not relax to Maxwell–Boltzmann (adding even one particle of a different mass makes it relax). The app must reproduce this, not "fix" it.
- **SIM-9** 3D draws with perspective and shading (particles shrink with distance). The user can tilt the view (see `display-and-controls.md`).

## Arena

- **SIM-10** The arena is a box measured in nm with an adjustable width and height (and depth in 3D), set numerically in Options. _Web port:_ the desktop app also resizes by dragging the window corner; the web app must let the arena size be set numerically and should adapt the view to the screen without changing the physical size. _Web port:_ the Size fields in the sidebar's Arena box apply a new size by restarting with every particle placed anew at random, at its own speed and on its kind's side of a divider; drawn walls and spawn regions stretch with the arena.
- **SIM-11** Axis rulers label the arena size in nm.

## Boundary modes

Five modes, chosen with icons in the particle area. Default: Box with Walls.

- **SIM-12** **Periodic boundaries**: no walls; a particle leaving one side re-enters on the opposite side with the same velocity, in every dimension in use (left/right only in 1D). Divider, hole and piston are not available in this mode. _Web port:_ the Boundaries buttons switch modes mid-run; periodic is off with drawn walls (WALL-3).
- **SIM-13** **Box with walls**: particles reflect off all walls.
- **SIM-14** **Divided box with walls**: a wall splits the arena into two equal halves. Switching to this mode restarts with all particles on the left. Left and right particle counts are shown. _Web port:_ done: the switch restarts with every particle (of every kind) placed at random on the left.
- **SIM-15** **Divided box with a hole** (2D and 3D only): the divider has an opening between the halves, for effusion and mixing. The hole diameter is set in Options. Switching from a divided box to the hole must not restart the simulation (the effusion experiments open the hole on a running gas). _Web port:_ done: `continueInArena` keeps the particles, velocities and clock.
- **SIM-16** Switching from a divided box back to an undivided box removes the barrier without restarting, so the two halves can mix (diffusion and hot/cold experiments). _Web port:_ done, as SIM-15. Other switches carry on too when every particle fits the new arena, and restart otherwise.
- **SIM-17** **Piston**: one wall is a movable piston (see below).
- **SIM-18** When the arena is divided, predictions are still computed as if it were not, except pressure predictions, which use the left and right counts. _Web port:_ and each side's current temperature (see PRES-4).

## Piston

- **SIM-19** In piston mode the user picks a target volume with a slider (as a fraction of the initial volume) and presses Move Piston; the piston moves at a set rate until it reaches that volume. Moving the slider to a larger volume and pressing again expands the gas.
- **SIM-20** Adiabatic mode: no heat exchange. A moving piston changes the speed of each particle that hits it (in the heavy-piston limit the particle's normal velocity becomes `2V − v`, where V is the piston velocity), so compression heats the gas and expansion cools it. The piston area shows the current temperature; the particle-area temperature keeps the starting value for comparison.
- **SIM-21** Isothermal mode: each wall collision during piston motion adds or removes kinetic energy to hold the temperature, limited to a maximum percent change per collision (default 10%, set in Options). While this thermostat is acting, the UI shows a "Thermostat active" indicator.
- **SIM-22** The piston speed (or travel time) is set in Options.
- **SIM-23** The piston level control in the program control area shows and sets the piston position.

## Maxwell demon

- **SIM-24** A Maxwell Demon mode, available with the divided box (with or without hole), lets the user open and close the hole repeatedly and quickly (clicking either divider icon, or a dedicated control) to let fast particles through one way. A particle that overlaps the wall edge as the hole closes keeps moving as if it were still open. _Web port:_ the toggle must be quick to hit on touch screens.

## Reaction mode

_Web port:_ the editor generalizes reaction mode to a table of rules between any kinds (KIND-13–15, `editor.md`); the mode described here is the single rule Type A + Type A → Type B + Type B (red to blue).

- **SIM-25** Reaction mode (from the Simulation menu) turns red and blue into reactant and product. It requires a single particle type at the start (the Java app refuses otherwise). _Web port:_ reactions run in 3D too (plan 0015), so `3Dequil` reacts; the Java app only ran them in 2D. The sidebar's Wells and reactions box switches them on; the scenario editor's rules (KIND-13) generalize them to any kinds.
- **SIM-26** Two red particles whose relative kinetic energy along their line of centres exceeds the forward activation energy `E_f` become two blue particles of the same size, and their relative kinetic energy along the line of centres drops by `ΔE = E_f − E_r`. Two blue particles above the reverse activation energy `E_r` become red and gain `ΔE`. Defaults: `E_f` = 8 kJ/mol, `E_r` = 4 kJ/mol.
- **SIM-27** The user can edit both activation energies on an energy diagram, and can suppress the reverse reaction (blue → red) for kinetics experiments. _Web port:_ done (plan 0015): the sidebar's Reactions box draws the diagram as an SVG with the barrier and product level draggable (or moved with the arrow keys), number fields for both energies, Suppress the reverse reaction, and Apply, which starts the run over.
- **SIM-28** The energy diagram shows the current red and blue counts, the time-averaged blue count and its width, and the predicted equilibrium count and width (see `predictions.md`). _Web port:_ done (plan 0015, `ReactionMeter` in `packages/engine/src/stats/reaction-meter.ts`): the Reactions box lists every kind's count now and its time average ± width, kept exactly event by event, with Reset average to start the averages again, and the first time each count was reached (Time to reach, STORY-27). It works for any number of kinds and rules (STORY-33); the prediction only for the single rule A + A ⇌ B + B.
- **SIM-29** Entering reaction mode switches the plot to Number of Particles (see `statistics.md`). The temperature field in the particle area stops tracking the actual temperature once the run starts, since reactions change the kinetic energy. _Web port:_ the plot switch is done (plan 0015): turning reactions on picks Number of Particles, every reload of a reaction run keeps it until the user picks another plot, and turning them off goes back to Instantaneous Speed. The Particles panel shows each kind's present temperature anyway, so it needs no special case.

## Total momentum

- **SIM-30** By default, after random velocities are assigned, the total momentum is set to zero by shifting and rescaling velocities while keeping the total kinetic energy. _Web port:_ done on Restart, per randomly placed group, keeping its kinetic energy; particles at given positions keep their velocities (so a 0 K group stays still). The first run of a `.set` file keeps Java's velocities, which only zeroes periodic arenas (as the engine still does).
- **SIM-31** With periodic boundaries the user can set a non-zero total momentum along any axis to study a drifting gas.

## Reverse

- **SIM-32** Reverse flips the velocity of every particle. The clock keeps running forward and the motion retraces itself as closely as round-off allows (until chaos takes over). _Web port:_ done (`Simulation.reverse()`; the Java app's button was never wired up). A moving piston heads back to where its move started, so adiabatic piston runs retrace too. The isothermal thermostat, a conducting divider and a reaction with its reverse suppressed aren't reversible, so there the velocities flip but the motion won't retrace.

## Beyond the manual

The 2013 Java source has features the 2009 manual doesn't describe. They are in scope because they're in the reference app:

- **SIM-33** Energy wells: an attractive square well around particles, with a depth (kJ/mol) and width (nm).
- **SIM-34** Anything else found in `vendor/boltzmann3d` that the manual doesn't mention gets a requirement here when it's ported.
