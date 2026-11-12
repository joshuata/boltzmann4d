---
title: Quick start
description: Run a simulation and find your way around the controls.
order: 1
---

Boltzmann 4D simulates a gas of hard spheres. Each particle moves in a straight line until it hits another particle or a wall, and every collision is computed exactly, so the results match kinetic theory.

## Choose a simulation

Pick a simulation from the **2D** or **3D** menu at the top of the page, or from the list on the [home page](../). Each one is a ready-made setup from the original Boltzmann 3D program: an ideal gas at equilibrium, effusion through a hole, Maxwell's demon, a gas mixture, and so on.

## Run it

The simulation starts as soon as it loads, unless it was saved paused. The sidebar groups its controls into boxes; tap a box's heading to fold it away or open it again. The **Run** box at the top always stays open: its clock shows the simulated time in picoseconds (ps), and its buttons control the run:

- **Play / pause** starts and stops the clock.
- **Step** advances one frame while paused.
- **Reverse** flips every particle's velocity, so the motion runs back the way it came. See [Reverse, chaos and trajectories](reverse-and-trace).
- **Restart** sets the clock to zero and places every particle again at random, with fresh random directions. See [Your own gas](particles).
- **Speed** makes simulated time pass faster or slower, in doubling steps from 1× to 2048×. Double-click the slider to go back to 1×.

In 3D, drag the arena (or use the arrow keys) to turn it.

## Look at the particles

The **View** box changes how particles are drawn, without restarting:

- **Colour** shows particles by kind (each kind's colour), by speed or by kinetic energy.
- **Kind markers** draw a ring, dot or other mark on each kind's particles, so kinds can be told apart without colour.
- **Trace paths** leaves a dot at each particle's centre every frame, which shows how fast particles move and how far they travel between collisions. **Dot size** sets how big the dots are, and **Clear trace** erases them.
- The bar in the corner of a 2D arena shows the scale in nanometres.

## Change the arena

The **Arena** box sets the walls (**Boundaries**: periodic, box, divided box or a box with a hole), the arena's size, and the options a boundary takes: a movable piston in a box, a divider that conducts heat, and Maxwell's demon at a hole. Changing one restarts the simulation. A piston gets its own **Piston** box to move it (see [The piston](piston)).

The **Wells and reactions** box turns on attractive wells between particles and an attractive bottom wall (in 2D boxes), and reactions that turn one kind into another (in 2D and 3D). Switching one on restarts with the default settings; change the numbers and press **Apply** to restart with yours. A reaction's energies are set in the **Reactions** box that appears while particles react (see [Reactions and equilibrium](reactions)).

In the Maxwell's demon simulation, click the arena (or the **Open hole** button in the Run box) to open and close the hole. Gates drawn in the [scenario editor](editor) open and close the same way: tap one, or use its button.

## Read the pressure

The **Pressure** box shows how hard the particles push on the walls, for each kind and in total (for each side of a divided box), next to the ideal or real gas prediction. See [Pressure and the gas laws](pressure).

## Read the statistics

The statistics box starts with the speed histogram: how many particles have each speed, next to the Maxwell–Boltzmann prediction for the gas's temperature. Choose **All kinds** or tap the kinds to show (each button names a kind with its colour and marker), and turn on **Cumulative** to average over time instead of showing the current instant. The menu above it offers kinetic energy, velocity components, free paths, collision rates, pressure and more; see [Statistics and distributions](statistics).

## Learn more

To build your own simulation, see the [scenario editor](editor) guide. The [About](about) page lists the original Boltzmann 3D manual and classroom worksheets, which explain the physics and suggest experiments.
