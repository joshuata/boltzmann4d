---
title: Quick start
description: Run a simulation and find your way around the controls.
order: 1
---

Boltzmann 4D simulates a gas of hard spheres. Each particle moves in a straight line until it hits another particle or a wall, and every collision is computed exactly, so the results match kinetic theory.

## Choose a simulation

Pick a simulation from the **2D** or **3D** menu at the top of the page, or from the list on the [home page](../). Each one is a ready-made setup from the original Boltzmann 3D program: an ideal gas at equilibrium, effusion through a hole, Maxwell's demon, a gas mixture, and so on.

## Run it

The simulation starts as soon as it loads. The buttons in the sidebar control it:

- **Play / pause** starts and stops the clock.
- **Step** advances one frame while paused.
- **Restart** starts again from the same starting positions and speeds.
- **Speed** makes simulated time pass faster or slower. Double-click the slider to go back to 1×.

In 3D, drag the arena (or use the arrow keys) to turn it.

## Look at the particles

- **Colour** shows particles by kind (each kind's colour), by speed or by kinetic energy.
- **Kind markers** draw a ring, dot or other mark on each kind's particles, so kinds can be told apart without colour.
- **Trace paths** (2D) leaves a mark wherever particles have been, which shows how far they travel between collisions.
- The bar in the corner of a 2D arena shows the scale in nanometres.

## Change the arena

Some simulations offer extra arena options in the sidebar, such as a movable piston, a divider or a hole. In the Maxwell's demon simulation, click the arena (or the **Open hole** button) to open and close the hole. Gates drawn in the [scenario editor](editor) open and close the same way: tap one, or use its button.

## Read the statistics

The speed histogram shows how many particles have each speed, next to the Maxwell–Boltzmann prediction for the gas's temperature. Choose **All kinds** or tap the kinds to show (each button names a kind with its colour and marker), and turn on **Cumulative** to average over time instead of showing the current instant.

## Learn more

To build your own simulation, see the [scenario editor](editor) guide. The [About](about) page lists the original Boltzmann 3D manual and classroom worksheets, which explain the physics and suggest experiments.
