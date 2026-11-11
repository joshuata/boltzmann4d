---
title: Statistics and distributions
description: Compare speeds, energies, free paths and collision rates with kinetic theory, as histograms or over time.
order: 1.6
---

The statistics box at the bottom of the sidebar plots what the particles are doing next to what kinetic theory predicts. Pick a plot from the menu at its top.

## The plots

| Plot | What each particle contributes | Unit |
| --- | --- | --- |
| Instantaneous speed | its speed | m/s |
| RMS velocity | its speed; the average shown is the root-mean-square speed | m/s |
| X, Y, Z velocity | one component of its velocity (Y in 2D and 3D, Z in 3D) | m/s |
| Kinetic energy | ½ m v² | kJ/mol |
| Free path | the distance it travelled between two collisions with other particles | nm |
| Time per collision | the time between two collisions with other particles | ps |
| Average speed, average RMS velocity, average kinetic energy | its own average since the start | m/s, kJ/mol |
| Average path | its total distance ÷ its number of collisions | nm |
| Collision rate | its collisions per picosecond since the start | 1/ps |
| Number of particles | how many of each kind there are (simulations with reactions) | — |
| Wall pressure or virial pressure | the pressure from the Pressure box, over time | µN/m or MPa |

Bounces off the walls don't count as collisions.

## Reading a histogram

- The bars show how many particles have values in each range. Each colour is a particle kind, stacked.
- The white curve is the predicted distribution. Bars and curve are each stretched to the same height, so compare their **shapes**.
- The **green** lines mark the measured average and one width either side; the **orange** lines mark the predicted ones. The numbers are below the plot.
- **Width** switches the numbers to the width of the distribution, the root-mean-square spread about the average.
- With **Color by speed** or **Color by kinetic energy** (in the View box) and the matching plot, the bars take the same colours as the particles.

Predictions use the temperature each kind actually has in the data shown, so they follow the gas as it heats or cools.

## Current, cumulative and history

- Normally the plot shows the **current** frame: every particle as it is now, in 15 bars.
- **Cumulative** shows everything since the data was last cleared, in 30 bars. Speeds and energies are weighted by how long each particle kept them, and paths and times count once per collision. Cumulative plots match the predictions much more closely than single frames do.
- The first few collision times are dropped once, so the equal speeds that many simulations start with don't skew the cumulative plot. The note under the plot says when.
- **History** plots the measured average over the most recent 150 updates. The red line is the prediction and the dotted red lines are half a predicted width either side. For pressures, the range runs from 0 to twice the prediction.

The **average** plots (average speed, average kinetic energy, average path, collision rate) have one value per particle already averaged over the whole run, so they have no cumulative view. Watch them narrow as the run goes on: each particle samples more and more speeds.

## Kinds

With more than one kind, the kind buttons choose which particles the plot covers. **All kinds** shows the mixture, with the predictions mixed in proportion to the number of each kind.

## Axis limits

Type a new **Min** or **Max** under the plot to zoom in. This clears that plot's cumulative data, so it starts collecting again over the new range. If the maximum ends up below the minimum, it is moved just above it, and the other way round. The speed and kinetic energy limits also set the ends of the **Color by speed** and **Color by kinetic energy** scales: violet at the minimum and red at the maximum, darker beyond.

## Statistics options

Open **Statistics options** under the plot for:

- **Finite-system corrections.** A small simulation has a fixed total energy, so its distributions differ slightly from the ideal-gas ones, by about 1% at 100 particles. Turn this on to predict for exactly as many particles as are running.
- **Forget early data after N collision times.** When the cumulative data is cleared, as a multiple of the predicted time between collisions (default 4).
- **Ideal / Real** for the free path, time and collision rate predictions. Real allows for the space the particles take up, which shortens the free path. The same choice applies to the pressure prediction.

## Try it

- **Cumulative beats current.** Run any simulation at high speed for a nanosecond, then turn on Cumulative. The speed and kinetic energy histograms now follow the curves closely.
- **RMS versus average.** Compare the RMS velocity and Instantaneous speed averages. RMS is about 13% higher in 2D and 8.5% higher in 3D.
- **Mass doesn't matter for energy.** In the _Hydrogen / oxygen mixture_ simulation, compare Red and Blue: their speeds differ, but their kinetic energy distributions and averages match.
- **Free paths.** Compare Free path with Ideal and Real in a dense gas: the measured path is shorter than the ideal prediction.
