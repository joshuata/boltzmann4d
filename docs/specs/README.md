# Feature specs

What boltzmann4d must be able to do, extracted from the Boltzmann 3D user documentation. These describe behaviour, not code: they say what a user (teacher or student) must be able to see and do, and which numbers the app must produce. Plans in `.agents/plans/` say how and when we build it.

## Sources

All linked from [Using Boltzmann 3D](https://boltzmann3d.byu.edu/using-boltzmann-3d):

- _Boltzmann 3D Manual_ (R. B. Shirts et al., revision 12/22/2009, 61 pages): the main source. Section I describes the window and every control; Section II gives classroom experiments; Sections IV–XI give the theory behind the predicted values; Section XII describes the sample files.
- _Quick Start and Troubleshooting Guide_ (2010).
- Two classroom worksheets: _Molecular Motion_ (R. B. Shirts) and _Molecules and Pressure_ (P. Burgmayer, Great Valley High School).

The manual describes the 2009 program; the Java code in `vendor/boltzmann3d` is from 2013 and is the reference where the two disagree (for example, it has energy wells and scales histograms to 80% height). Where a spec knows of a difference it says so.

## Specs

| File | Covers |
| --- | --- |
| [simulation.md](simulation.md) | The physics model, dimensions, arena, boundary modes, piston, divider and hole, Maxwell demon, reaction mode, reverse |
| [particles.md](particles.md) | Number, mass, radius and temperature controls; red and blue particles; adding and removing particles |
| [pressure.md](pressure.md) | Wall and virial pressure, averaging, ideal and real predictions, partial pressures |
| [statistics.md](statistics.md) | The distribution plots, histograms, cumulative and history views, averages and widths |
| [predictions.md](predictions.md) | The theoretical values the app displays: formulas for 1D, 2D, 3D, mixtures, real gases, finite systems, reactions, adiabatic changes |
| [display-and-controls.md](display-and-controls.md) | Clock, speed, zoom, restart / pause / advance / reverse, colouring, trajectory trace, 3D view, options |
| [files-and-output.md](files-and-output.md) | Loading and saving `.set` files, the bundled presets, CSV output |
| [stories.md](stories.md) | Classroom experiments from the manual and worksheets, written as end-to-end acceptance checks |

## Conventions

- Each requirement has an ID (`SIM-3`, `STAT-12`, …) so plans, issues and tests can cite it.
- "Must" is a requirement; "should" is desirable but negotiable; _Web port_ notes say how a desktop behaviour translates to the browser (no window-corner dragging, file dialogs become downloads and file pickers, touch as well as mouse and keyboard).
- Hardware, installation, Java and graphics-driver troubleshooting in the docs don't apply to a web app and are left out.
- Unless stated, units are those the Java app shows: nm, amu, K, ps, kJ/mol, m/s.
