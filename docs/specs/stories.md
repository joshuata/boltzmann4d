# Stories

The classroom experiments the documentation walks through, written as end-to-end checks. Each must be doable in the web app with the controls in the other specs, and should give the expected outcome. They suit manual QA, demo scripts and (where the outcome is numeric) automated long-run tests. Source: manual §II, the quick start guide and both worksheets.

Where an outcome is statistical, "matches" means within normal fluctuations for the particle count (roughly 1/sqrt(N)).

## Distributions

- **STORY-1 Speed distribution develops.** Restart with the Instantaneous Speed plot. Start: one bar (all speeds equal). After a few collision times: the histogram has the Maxwell–Boltzmann shape. Repeat with `2D/3Dhyd100`, `hyd1000`, `oxy100`, `oxy1000`: averages match predictions; O₂ is slower than H₂ by about 4×.
- **STORY-2 More particles, smaller fluctuations.** Compare 50 and 450 particles (shrinking radius or enlarging the arena to fit). Fluctuations about the curve drop by about 3×.
- **STORY-3 Cumulative beats instantaneous.** Run 500 ps–1 ns at high speed, then switch to Cumulative: the kinetic-energy and speed histograms match the curves more closely than the current view.
- **STORY-4 RMS vs average speed.** RMS exceeds average by about 25% (1D), 13% (2D), 8.5% (3D). _Web port:_ 1D runs since plan 0017 (`1Dheavy`, or the Dimension buttons).
- **STORY-5 Dimension changes the shape.** Switch a single-species run from 2D to 3D with RMS Velocity shown: the 3D curve starts flatter (∝ v²) at low speed.
- **STORY-6 Ergodicity.** Follow one slow and one fast particle (low speed setting, Color by Speed): each changes speed over time. Average Speed and Average KE distributions narrow as the run continues.

## Gas laws and pressure

- **STORY-7 Boyle's law.** 2D, 50 particles, 0.5 nm, 300 K, T_avg = 200 ps. Change the arena size (or do an isothermal piston compression in steps): PA stays constant within fluctuations.
- **STORY-8 Amontons' law.** Divided box: 30 particles at 300 K left, drop 30 identical particles at 1200 K right (or load `hotcold`, which has the hot side on the left): the hot side's pressure ≈ 4× the cold side's. Pressure extrapolates to zero at 0 K.
- **STORY-9 Charles' law.** 50–100 particles, 0.5 nm, 300 K; restart at 150 K; halve one arena dimension in Options: pressure returns to the original value.
- **STORY-10 Pressure ∝ number.** Divided box with N red left, drop N/2 blue right (`presnum`): right pressure ≈ half the left.
- **STORY-11 Non-ideality.** Raise radius or number: measured pressure exceeds the Ideal prediction and tracks the Real prediction. Mass and temperature at fixed density don't change the ratio.
- **STORY-12 Variables and pressure (worksheet).** From 50 particles, 1 nm, 2 amu, 300 K: doubling N or T roughly doubles pressure; doubling mass leaves it unchanged; halving radius lowers it slightly (less non-ideality). Switching the boundary icon between box and divided box shows the volume–pressure relation.
- **STORY-13 Partial pressures.** Mixture: Red and Blue pressures add up to Both.

## Effusion, diffusion, entropy

- **STORY-14 Effusion / Graham's law.** Divided box, red light and blue heavy on the left, then switch to the hole (`effuse`, which loads paused). Light particles escape faster, by about sqrt(m_heavy / m_light) (4× for 2 vs 32 amu) while few have escaped.
- **STORY-15 Tagged diffusion.** 50–100 red plus one identical blue dropped by click (`diffuse`), trajectory trace on: the blue wanders the whole arena; its cumulative speed distribution, average speed, path and collision rate match the reds'.
- **STORY-16 Interdiffusion.** Light red left, heavy blue right, divided; switch to the undivided box: light particles cross faster.
- **STORY-17 Entropy.** At 0 K, click to place 24 particles of 1 nm in the lower-left corner (they stay still); set 9999 K and drop one particle top right (`entropy`, loads paused). The energy spreads to all particles and positions randomise; the reverse never happens on its own.
- **STORY-18 Brownian motion.** One 200 amu, 20 nm red particle (5 nm in the preset), then 200 blue at 0.2 nm, 2 amu (`brownian`): the red staggers randomly; at 100 amu it moves more.
- **STORY-19 Heating and cooling.** 50 red at 300 K; pause; add 20–30 identical blue at 1200 K; play: blue cools and red warms to a common temperature within a few collision times. Same with a divided box whose barrier is then removed.
- **STORY-20 Energy is independent of mass and radius.** 30–50 heavy large red (100 amu, 0.8 nm) plus 30–50 light small blue (10 amu, 0.4 nm) (`mixture`): Red vs Blue speeds differ, kinetic-energy distributions and averages match.

## Chaos and reversibility

- **STORY-21 Chaos.** Load `2Dequal`: the halves move identically, then visibly differ by about 95 ps and are unrelated by about 120 ps.
- **STORY-22 Reverse.** Run a while, press Reverse: the motion retraces back toward the start, for a time limited by chaos.
- **STORY-23 1D doesn't thermalize.** 1D, one species: the speed histogram keeps its initial shape. Add one particle of a different mass: it relaxes to Maxwell–Boltzmann. _Web port:_ the `1Dequalmass` and `1Dheavy` presets (1D menu); `sim/particle-1d.test.ts` checks both halves.

## Piston

- **STORY-24 Adiabatic compression.** Piston mode, adiabatic, compress: temperature rises toward `T₁ (V₁/V₂)^{2/d}`. Expand back: the final temperature is close to but usually slightly above the start; slower pistons and more particles bring it closer.
- **STORY-25 Isothermal compression.** Same in isothermal mode: "Thermostat active" shows while the piston moves, temperature stays put, PV stays constant.

## Reactions

- **STORY-26 Equilibrium.** Reaction mode with defaults (`equil`): blue count rises and fluctuates about the prediction (13.3 in 2D, 14.1 in 3D for 50 particles). Raising ΔE lowers the blue count; changing both activation energies by the same amount changes only how fast equilibrium arrives.
- **STORY-27 Bimolecular kinetics.** 100–200 particles at 300 K, both activation energies 10 kJ/mol, reverse reaction suppressed. Time for 10 blue to form: doubling N quarters it; doubling radius quarters it in 3D and halves it in 2D; doubling mass multiplies it by sqrt(2); ln(time) is linear in 1/T.

## Maxwell demon

- **STORY-28** Divided box with particles on the left, demon mode, Color by KE: by opening and closing the hole by hand the user can reach an average energy on the right well above the left.

## Built in the editor

_Web port only:_ experiments the editor (`editor.md`) makes possible. They aren't in the manual.

- **STORY-29 Draw a chamber.** From a blank arena, draw a closed rectangle in the middle, a spawn region inside it with 40 particles of kind A at 300 K, and run: the particles stay inside the rectangle, its corners included, and the speed histogram relaxes to Maxwell–Boltzmann. Kinetic energy is constant to round-off (WALL-2).
- **STORY-30 Osmosis.** Split the arena with a semipermeable wall that passes small kind A and stops large kind B. Spawn A on both sides and B on the left only: A crosses both ways. At equilibrium the left side holds more particles in total and has the higher pressure (the difference is the osmotic pressure), while A has about the same number density on both sides when the gas is dilute.
- **STORY-31 Effusion through a gate.** Two chambers joined by a gate, 60 light and 60 heavy particles in the left one, gate closed. Open the gate: light particles escape faster, by about sqrt(m_heavy / m_light), as in STORY-14. Close it again: the counts on each side stop changing except by fluctuation.
- **STORY-32 Heat conduction.** A channel between a thermal wall at 600 K on the left and one at 200 K on the right, filled with 100 particles: the left end warms, the right end cools, and a steady temperature gradient forms along the channel (Color by KE shows it).
- **STORY-33 Chained reactions.** Three kinds of equal mass and radius, rules A + A → B + B and B + B → C + C, both with the reverse suppressed: A falls, B rises then falls, and C rises, as for consecutive reactions.
- **STORY-34 Colour-blind check.** Build a scenario with 8 kinds on the default palette. In the editor's colour-vision previews and in a greyscale screenshot of the running simulation, every kind can be told apart by colour or marker, and the legend names each one (KIND-8, KIND-9).
