---
title: Reactions and equilibrium
description: Watch Type A turn into Type B, compare the counts with the predicted equilibrium, and time how fast products form.
order: 1.65
---

In reaction mode two particles can turn into two others when they collide hard enough. The **Equilibration** simulations (2D and 3D) start with reactions on. In any simulation with a single kind of particle, tick **Reactions** in the sidebar's **Arena** box to turn them on.

## How a reaction works

Two Type A particles that collide with enough energy along the line between their centres become two Type B particles of the same size. The energy needed is the forward activation energy E<sub>f</sub>. The pair loses ΔE = E<sub>f</sub> − E<sub>r</sub> of kinetic energy, which each Type B particle stores half of. Two Type B particles colliding harder than the reverse activation energy E<sub>r</sub> turn back into Type A and get ΔE back. The defaults are E<sub>f</sub> = 8 and E<sub>r</sub> = 4 kJ/mol.

Turning reactions on switches the statistics plot to **Number of particles**, which follows each kind's count over time.

## The Reactions box

While particles react, the sidebar has a **Reactions** box.

- **Now** is how many particles of each kind there are at this moment.
- **Average ± width** is each count averaged over time, with how far it typically strays from that average. The averages start with the run. Once the counts have settled, press **Reset average** so the early, unsettled part doesn't count.
- **Predicted** is the equilibrium number of Type B particles and its width, worked out from the total energy by counting the ways the energy can be shared out between motion and reaction (the microcanonical partition function). It needn't be a whole number. It covers one reaction of the form A + A ⇌ B + B with the reverse reaction on, in a box with walls and without attractive wells. Otherwise the box says why there is no prediction.
- **Time to reach** gives the time at which a kind first reached the number you type, for kinetics experiments: for example the time for 10 Type B particles to form.

Adding or removing particles starts the readouts again from that moment.

## The energy diagram

For the sidebar's A ⇌ B reaction, the box also shows an energy diagram. Type A sits at zero, the barrier at E<sub>f</sub> and Type B at ΔE. Drag the barrier or the Type B level (or select one and use the arrow keys, with Shift for bigger steps), or type the two energies into the fields below it. **Suppress the reverse reaction** stops Type B turning back into Type A, so every reaction goes one way. **Apply** starts the simulation over with the new energies.

## Things to try

- **Equilibrium.** Run **Equilibration (2D)** at a high speed. The Type B count rises and then fluctuates around the prediction, about 13.4 out of 50. Press **Reset average** once it has settled and watch the average close in on the prediction.
- **Only ΔE matters.** Raise E<sub>f</sub> while keeping E<sub>r</sub>, so ΔE grows: fewer Type B particles at equilibrium. Raise both energies by the same amount: the equilibrium stays the same, but it takes longer to get there.
- **Rates.** Use 100–200 particles at 300 K, set both energies to 10 kJ/mol and suppress the reverse reaction. Read the time for 10 Type B particles to form, then change one thing and compare. Doubling the number of particles should make it about four times shorter. Doubling the mass should make it about 1.4 times longer.
- **Chains.** In the [simulation editor](editor), rules such as A + A → B + B and B + B → C + C each add a row to the Reactions box, so you can follow a chain of reactions. The prediction covers only a single A ⇌ B reaction.

## Differences from Boltzmann 3D

- Reactions also run in 3D. The desktop program never ran them there. **Equilibration (3D)** predicts about 16.4 Type B particles: it starts at about 382 K, while the manual's 14.1 is for 300 K.
- The energies are set on the diagram in the sidebar rather than in a separate dialog.
