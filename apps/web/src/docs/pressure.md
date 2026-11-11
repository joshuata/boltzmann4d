---
title: Pressure and the gas laws
description: Read the pressure, compare it with the ideal and real gas predictions, and try the gas-law experiments.
order: 1.5
---

The **Pressure** box in the sidebar shows how hard the gas pushes on the walls, next to what theory predicts. Use it to check Boyle's, Charles' and Amontons' laws, partial pressures, and where a real gas stops being ideal.

## What it measures

Each time a particle bounces off the left or right wall, it gives the wall a push. The readout adds up these pushes over the **averaging time** and divides by that time and by the wall's size. It is in µN/m in 2D (force per length of wall) and MPa in 3D.

- In a plain box, the readout is the average of the left and right walls.
- In a divided box (with or without a hole), the **Left side** and **Right side** are shown separately: the left wall for the left side and the right wall for the right side, each with its own prediction.
- With **periodic boundaries** there are no walls, so the box shows the **virial pressure** instead. It is worked out from every collision since the start, so it settles down more smoothly.
- With more than one kind of particle, each kind's **partial pressure** is shown with the total. The partial pressures always add up to the total.
- Walls you draw in the [scenario editor](editor) aren't counted, and the predictions treat the arena as an empty box.

## Warming up

Right after a simulation starts (or restarts) the readout hasn't collected a full averaging time yet, so it is marked **Warming up** and averaged over the time so far. Readings are noisy until then.

Set the **Averaging time** under the readout (60 ps unless the simulation says otherwise). A longer time gives a steadier number but takes longer to warm up and to follow changes; changing it doesn't restart the simulation.

## Ideal or Real

The **Ideal** and **Real** buttons choose which prediction is shown next to the measurement:

- **Ideal** is the ideal gas law, PA = NkT in 2D or PV = NkT in 3D, using the space the particles' centres can reach.
- **Real** corrects it for the size of the particles (the hard-disk or hard-sphere virial expansion). Bigger or more crowded particles push harder than the ideal law says.

Both use each kind's current temperature and number on each side, so a hot side and a cold side, or a gas a piston has squeezed, are each predicted correctly.

## Change the arena size

**Arena size** sets the width and height (and depth in 3D) in nanometres. **Apply** restarts the simulation in the new arena with the particles placed again at random, at the same speeds, on the same side of a divider.

## Experiments

- **Boyle's law**: note the pressure, then halve the width. With the same particles at the same temperature, pressure × area stays the same, so the pressure doubles. A longer averaging time, such as 200 ps, makes this easier to see.
- **Amontons' law**: open _Hot and cold_ from the 2D menu. Each side has its own temperature, and the hotter side's pressure is higher in proportion to its temperature.
- **Pressure and number**: open _Pressure and particle number_. The right side has half as many particles as the left, and about half the pressure.
- **Partial pressures**: open a mixture. The kinds' pressures add up to the total.
- **A real gas**: in the [scenario editor](editor), give the particles a larger radius or add more of them. The measured pressure climbs above the Ideal prediction and follows the Real one. Changing the mass or the temperature at the same crowding doesn't change how far apart the two are.
