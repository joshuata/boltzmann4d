# Display and controls

The program control area, View menu, Simulation menu options and the advanced area's frame rate. Source: manual §I.A, §I.E–I.J, quick start guide, `Molecules and Pressure` worksheet. Rendering details to preserve are in `vendor/boltzmann3d/docs/rendering-baseline.md`.

## Program controls

- **CTRL-1** Clock: simulated time since restart, in ps.
- **CTRL-2** Simulation speed: 1× by default, doubling per step up to 2048×. At high speeds particles move too far per frame to follow; that's expected.
- **CTRL-3** Restart (see `particles.md` PART-14).
- **CTRL-4** Pause / Play toggle. While paused the user can change settings, add particles and inspect plots.
- **CTRL-5** Advance: one frame forward, only while paused.
- **CTRL-6** Reverse (see `simulation.md` SIM-32).
- **CTRL-7** Zoom: default 1 pixel = 1 nm; steps of about 25%; minimum 33%; a typed percentage is allowed. _Web port:_ zoom should also respond to pinch and wheel, and default to fitting the arena in the available space.

## View options

- **VIEW-1** Color scheme: Dark background (black arena) or Light background (white arena, grey walls), with red and blue particles; 3D walls default to gold (right and front) and beige (others); Custom lets the user pick background, wall, divider and particle colours.
- **VIEW-2** Lighting: toggles particle shading in 2D. Always on in 3D.
- **VIEW-3** Display: toggles drawing the arena entirely, so statistics can accumulate faster without rendering.
- **VIEW-4** Color by Speed / Color by KE / Normal coloring: particles coloured on a blue (low) → green → yellow → orange → red (high) scale using the matching plot's min and max; below the minimum is dark blue, above the maximum dark red. _Web port:_ done; the limits follow the plots' Min and Max fields.
- **VIEW-5** Trajectory trace: instead of particles, draw a dot at each particle's centre every frame, in the particle's colour, so spacing shows speed. Dot size 1–20 px (default 2). A Clear action erases the trace.
- **VIEW-6** 3D view angle: the user can tilt the view. The desktop app does this with arrow keys after clicking a ruler. _Web port:_ drag (mouse or touch) to orbit, keep arrow keys, and save the angle in `.set` files.

## Simulation options

One Options dialog sets:

- **OPT-1** Arena width, height and depth (nm). _Web port:_ in the sidebar's Arena size box (see SIM-10).
- **OPT-2** Hole diameter for the divided box with a hole.
- **OPT-3** Pressure averaging time (default 60 ps). _Web port:_ under the pressure readout; it applies at once without restarting.
- **OPT-4** Forget time, as a multiple of the predicted collision time (default 4). _Web port:_ in the statistics box's Statistics options; a change applies at once if the data hasn't been forgotten yet, and is kept by Restart and arena changes.
- **OPT-5** RDF sampling interval, as a multiple of the predicted collision time (default 0.5).
- **OPT-6** Piston speed and the isothermal thermostat's maximum percent energy change per wall collision (default 10%).

Other Simulation menu items: Dimension, Include finite system corrections, Maxwell demon mode, Reaction mode, Set total momentum (see `simulation.md`).

## Advanced area

- **ADV-1** Frame rate readout (frames per second). The desktop target is 30 fps; the web port draws at display rate, so this shows the actual draw rate.
- **ADV-2** Hidden (collapsed) by default.

## Help

- **HELP-1** Links to the manual, quick start guide and project page, plus an About panel with version and licence (GPL-3.0, credits to the original BYU authors). The simulation keeps running while help is open.
