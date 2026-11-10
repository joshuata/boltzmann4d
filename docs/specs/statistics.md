# Statistics

The distribution graph area at the top of the sidebar. Source: manual §I.C, §III (histogram scaling), quick start guide. Implementation is tracked in plan 0004.

## Plot picker

- **STAT-1** A dropdown picks one plot. Which plots are offered depends on dimension, boundary mode and reaction mode (table below). The user can step through the list with the + and − keys.

| Plot | Quantity per particle | Available |
| --- | --- | --- |
| Instantaneous Speed | speed (in 1D, absolute x velocity) | always; the default |
| Average Speed | distance travelled ÷ time since restart | always |
| RMS Velocity | histogram of speed; average shown is `sqrt(<v²>)` | always |
| Average RMS Velocity | `sqrt` of each particle's time-averaged `v²` | always |
| Kinetic Energy | `m v² / 2` | always |
| Average Kinetic Energy | time-weighted average KE per particle | always |
| Free Path | distance between the last two particle–particle collisions (wall hits don't count) | always |
| Average Path | total distance ÷ number of particle collisions | always |
| Time per Collision | time between the last two particle–particle collisions | always |
| Collision Rate | particle collisions per unit time since restart (each collision counts for both particles) | always |
| Radial Distribution Function | pair density at distance r relative to a uniform fluid, nearest periodic image only | periodic only |
| X / Y / Z Velocity | velocity component | Y in 2D and 3D, Z in 3D |
| Number of Particles | red and blue counts over the last 150 frames | reaction mode; becomes the default plot there |
| Wall Pressure (Left / Right) | see `pressure.md` | walls present; history only |
| Virial Pressure | see `pressure.md` | periodic only; history only |

- **STAT-2** RDF: with red and blue, Red shows red–red, Blue shows blue–blue, Both shows red–blue. The default maximum abscissa is half the smallest arena dimension.

## Histogram

- **STAT-3** The current (instantaneous) view bins the frame shown into 15 bars. The cumulative view uses 30.
- **STAT-4** A black curve shows the predicted distribution for the plot (where one exists).
- **STAT-5** Green vertical lines mark the measured average and average ± one width; orange lines mark the predicted average and ± one predicted width. The values are also shown as numbers.
- **STAT-6** Bars and curve are each scaled so their maximum fills the plot height (the manual says full height; the 2013 Java app uses 80%, which we follow). It's a shape comparison, not a density.
- **STAT-7** With Color by Speed and the Instantaneous Speed plot, or Color by KE and the Kinetic Energy plot, bars are coloured with the same colours as the particles in that range.

## Axis limits

- **STAT-8** Each plot has its own abscissa minimum and maximum, shown in editable fields below the plot.
- **STAT-9** If a typed maximum is below the minimum, it becomes 110% of the minimum; a minimum above the maximum becomes 90% of the maximum.
- **STAT-10** Changing a plot's limits clears that plot's cumulative data only.
- **STAT-11** The limits are saved in `.set` files.

## Averages and widths

- **STAT-12** Two numeric readouts below the plot: Predicted and Average (measured). In cumulative view they are for the cumulative distribution; otherwise for the current one.
- **STAT-13** A Width toggle switches both readouts (and their marker lines) to the root-mean-square width `sqrt(<q²> − <q>²)`.
- **STAT-14** Predictions are for an infinite system unless finite system corrections are on; path, collision time, collision rate and pressure predictions also depend on Ideal / Real (see `predictions.md`).

## Cumulative view

- **STAT-15** A Cumulative toggle shows every recorded value since the data was last cleared, rather than the current frame. It updates at every collision.
- **STAT-16** Velocity and energy values are weighted by how long each was held; path, time, collision rate and RDF are weighted by count.
- **STAT-17** Cumulative data is cleared by Restart, by changing that plot's limits, and once automatically at the forget time (default 4 × the predicted collision time after restart, multiplier set in Options), so the initial equal-speed state doesn't skew it.
- **STAT-18** Cumulative views of the per-particle averages (average speed, average RMS velocity, average KE, average path, collision rate) aren't meaningful; the app may still compute them but should not invite their use.
- **STAT-19** The collision rate prediction curve is a Gaussian whose width shrinks with time; it is redrawn whenever the width has changed by 22%, not every frame.

## History view

- **STAT-20** A History toggle plots the measured value over the most recent 150 frames.
- **STAT-21** The predicted value is a red line with dotted red lines at ± half the predicted width; the vertical range is four predicted widths. For pressures the width is taken to be the pressure itself, so the range is 0 to twice the prediction.
- **STAT-22** Plots with no distribution (pressures, number of particles) always show history.

## Particle subsets

- **STAT-23** Red, Blue and Both buttons choose which particles the plot, readouts and pressure cover. Both shows number-weighted averages and predictions. With only red particles, Blue is empty.

## RDF sampling

- **STAT-24** RDF samples pair distances every half predicted collision time by default (multiplier set in Options). An "Exhaustive RDF" option samples at that interval even when it slows the run, for accurate exported values.

## Panels

- **STAT-25** The statistics, particle, pressure and advanced areas can each be collapsed and expanded. _Web port:_ this must work on narrow and touch screens (AGENTS.md UI rules).
