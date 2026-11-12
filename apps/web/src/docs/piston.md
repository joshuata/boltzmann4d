---
title: The piston
description: Compress and expand the gas adiabatically or isothermally, and compare its temperature with the prediction.
order: 1.75
---

The piston turns the top wall of a box into a plate you can push in and pull out, in 2D and 3D. Turn it on with **Movable piston** in the **Arena** box (it needs the plain box, without drawn walls). A **Piston** box then appears in the sidebar.

## Moving the piston

The bar at the top of the Piston box shows where the piston is, as the gas's volume `V` compared with the volume of the whole box `V₀`. The thin line on it marks the target.

1. Pick a **Target** volume with the slider. It goes from the whole box down to the smallest volume the particles still fit in.
2. Pick a **Mode**:
   - **Adiabatic**: no heat flows. Each particle that hits the moving piston bounces off it faster (compression) or slower (expansion), so the gas heats up or cools down.
   - **Isothermal**: the walls act as a thermostat that holds the temperature. **Thermostat active** shows in the heading while it's working.
   - **Instantaneous**: the piston jumps straight out to the target (a free expansion). It can only pull out, since jumping in could land on particles.
3. Press **Move Piston**. The piston moves at the **Speed** you set (nm/ps). **Stop** halts it where it is.

Press Move Piston again with a larger target to expand the gas back.

## Temperature and the prediction

**Temperature now** is the whole gas's temperature from its kinetic energy. The Particles box's Temperature field stays at the value new particles are added at, so you can compare the two.

**Predicted** is what theory expects for a slow piston, starting **From** the temperature and volume when you began this run of moves:

- adiabatic: `T = T₁ (V₁/V)^{2/d}`, where `d` is the dimension (so `T₁ V₁/V` in 2D and `T₁ (V₁/V)^{2/3}` in 3D);
- isothermal and instantaneous: `T = T₁`.

An adiabatic move after another adiabatic one keeps the same starting point, so you can compress and then expand back and compare the final temperature with the first. Changing mode, or adding or removing particles, starts a new one.

Things to try:

- Compress adiabatically to half the volume, then expand back. The final temperature is close to the start, but usually a little above it. A slower piston and more particles bring it closer.
- Do the same isothermally: the temperature stays put, and the pressure doubles when the volume halves (`PV` stays constant, Boyle's law). Watch the Wall pressure box.
- Try a fast piston, or a very dilute gas. The gas ends up hotter than predicted. A fast piston does extra work on the particles it hits. In a dilute gas the particles hardly collide, so the energy the piston adds stays in the up-and-down motion instead of being shared among all directions, which the prediction assumes.

## Options

- **Speed** (nm/ps): how fast the piston moves. 1 nm/ps is 1000 m/s; compare it with the particles' speeds in the Statistics box.
- **Thermostat damping** (%): how much of the excess energy the isothermal thermostat takes back at each wall bounce when it has more to correct than that bounce carries (10% by default). Higher values hold the temperature more tightly.
