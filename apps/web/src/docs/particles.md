---
title: Your own gas
description: Add and remove particles while the gas runs, change their mass, size and temperature, and switch the walls.
order: 1.4
---

The **Particles** box in the sidebar changes the gas in the arena while it runs: add particles, take them away, and change how heavy, big and hot they are. The **Boundaries** buttons under it change the walls. To set up a gas from scratch, with walls you draw yourself, use the [scenario editor](editor).

## Pick a kind

The buttons at the top of the box (**Red**, **Blue**, and any other kinds the simulation has) pick which kind of particle the rest of the box works on. A dot next to a kind's name means it has edited values that aren't applied yet.

## Add and remove particles

- **+** adds one particle of the kind at a random spot where it fits.
- **−** removes the kind's newest particle. The energy it carried goes with it, so the temperature of what's left can change.
- Type a number into **Number of** and press Enter to add or remove several at once.
- **Tap the arena** to drop one particle exactly where you tap. In 3D a tap adds one at a random spot instead. In Maxwell's demon simulations a tap opens and closes the hole, so use **+** there.

A particle can't go on top of another one, a wall or the divider. If there's no room, the box says so and nothing changes. There can be at most 999 particles in all.

Adding or removing particles doesn't restart the clock. The statistics and the pressure readout start collecting again from that moment, because the gas has changed.

## Mass, radius and temperature

Type a new **Mass** (amu), **Radius** (nm) or **Temperature** (K) and it is marked **pending** until it's used:

- **Temperature** applies to the next particles you add. Every new particle gets the same speed, the one whose kinetic energy is the average for that temperature, in a random direction. At 0 K they don't move at all.
- **Mass** and **radius** apply when you press **Restart**. Until then, particles you add have the kind's current mass and radius, so each kind keeps one mass and one size and the predictions stay right.

Below the fields, **Temperature, all** is the temperature of the whole gas, worked out from its total kinetic energy. The line under it shows the picked kind's temperature right now. In a divided box, **Left #** and **Right #** count the particles on each side.

## Restart

**Restart** sets the clock to zero, clears the statistics, and places every particle again at random with a random direction. Each kind keeps the number it has now and takes any pending mass, radius and temperature. The random velocities are adjusted so the gas as a whole doesn't drift (its total momentum is zero) without changing its energy.

## Boundaries

- **Periodic**: no walls. A particle leaving one side comes back in on the opposite side. Not available with drawn walls.
- **Box**: walls all round.
- **Divided**: a wall down the middle. Switching to it restarts with every particle on the left.
- **Hole**: the dividing wall has a hole in it.

Switching from **Divided** to **Hole** or to **Box** keeps the gas running. That's how to start the effusion and mixing experiments: let the gas settle on one side, then open the hole or take the wall away. Other switches also keep running when every particle fits in the new arena, and restart when one doesn't (for example, a particle sitting where the new divider would go).

## Try it

- **Heating and cooling**: run 50 red particles at 300 K, pause, pick **Blue**, set the temperature to 1200 K and add 25. Play: the blue particles cool and the red ones warm until they share a temperature.
- **Entropy**: set a temperature of 0 K and tap two dozen particles into one corner. They stay still. Then set 9999 K and drop one particle in the opposite corner. Its energy spreads to all the others, and they never gather back in the corner by themselves.
- **Effusion**: in a divided box with light and heavy particles on the left, switch to **Hole**. Watch **Right #**: the light particles get through faster.
- **Interdiffusion**: with light particles on the left and heavy ones on the right, switch from **Divided** to **Box** and watch them mix.
