# Files and output

Saved demonstrations and data export. Source: manual §I.E, §I.G, §XII, quick start guide. `.set` parsing lives in `src/io`.

## Loading

- **FILE-1** Load opens a `.set` file and applies it. _Web port:_ a file picker for the user's own files, plus a list of the bundled presets.
- **FILE-2** `default.set` is loaded at startup (50 2D particles, 2 amu, 1 nm, 300 K). _Web port:_ the user should be able to make their own default (e.g. stored in the browser).
- **FILE-3** A file saved without positions gets random positions and velocities on load; in a divided arena red goes on the left and blue on the right.
- **FILE-4** A file may load paused (`2Deffuse`, `2Dentropy` do), so the teacher can start it.

## Saving

- **FILE-5** Save offers two levels:
  - **Basic**: red and blue temperature, number, radius and mass; every plot's min and max; boundary mode; piston settings; which plot is shown first; colour scheme; lighting; dimension and 3D view angle; hole diameter; arena size; pressure averaging time; forget time.
  - **Complete**: all of that plus every particle's position and velocity, so the same run can be replayed exactly (and, for example, red and blue can both start on the left of a divided arena).
- **FILE-6** Saved files must load in the Java app and Java-saved files must load here (same `.set` format). _Web port:_ save downloads the file.

## Bundled presets

- **FILE-7** These ship with the app and must load and behave as described:

| Preset | Contents | Purpose |
| --- | --- | --- |
| `default` | 50 particles, 2 amu, 1 nm, 300 K, 2D | Room-temperature H₂ |
| `2Dhyd100`, `3Dhyd100` | 50 × 2 amu, 0.7 nm, 100 K | H₂ speed distribution, cold |
| `2Dhyd1000`, `3Dhyd1000` | same at 1000 K | H₂, hot |
| `2Doxy100`, `3Doxy100` | 50 × 32 amu, 1.1 nm, 100 K | O₂, cold |
| `2Doxy1000`, `3Doxy1000` | same at 1000 K | O₂, hot |
| `2Dmixture`, `3Dmixture` | 30 red (2 amu, 0.7 nm) + 30 blue (32 amu, 1.1 nm) | Different speeds, same energy distribution |
| `2Ddiffuse`, `3Ddiffuse` | 100 red + 1 identical blue, 2 nm, periodic | Diffusion of a tagged particle |
| `2Deffuse`, `3Deffuse` | mixture as above, all left of a divided box with a hole; loads paused | Graham's law |
| `2Dhotcold`, `3Dhotcold` | 30 red at 1200 K left, 30 identical blue at 300 K right, divided | Pressure vs temperature, thermal equilibration |
| `2Dbrownian`, `3Dbrownian` | 1 red (200 amu, 5 nm) + 200 blue (1 amu, 0.2 nm), periodic | Brownian motion |
| `2Dentropy`, `3Dentropy` | 24 motionless blue (2 amu, 1.4 nm) in the lower left + 1 fast blue (9999 K) upper right; loads paused | Entropy increase |
| `2Dpresnum`, `3Dpresnum` | 40 red left, 20 blue right, 2 amu, 1 nm, divided | Pressure ∝ number |
| `2Dequal` | 20 + 20 particles with mirrored initial states in a divided box | Chaos: halves diverge by about 95–120 ps |
| `2Dliquid` | 47 particles of 6 nm + 1 blue, periodic, trajectory trace on | Diffusion in a dense fluid |
| `2Dequil`, `3Dequil` | 50 red, 1 nm, 2 amu, reaction mode, default activation energies | Equilibrium (13.3 / 14.1 blue predicted) |
| `ideal_gas_module` | used by the Java ideal-gas module | — |

## Data export

- **OUT-1** Write averages: the user picks which averages to record, a file name and a time interval; values are written as CSV at that interval from when they confirm until they turn it off or change the system. _Web port:_ collect in memory and download as CSV when stopped.
- **OUT-2** Cumulative distributions: from the same dialog, the user picks distributions; they start accumulating on confirm and are written as CSV when output stops or the system changes.
- **OUT-3** Write positions: every particle's coordinates and momenta as CSV at a chosen interval, for correlation-function analysis.
- **OUT-4** CSV must open cleanly in spreadsheet programs (header row, one record per line, SI-labelled units).
