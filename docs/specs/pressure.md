# Pressure

The pressure area above the arena. Source: manual §I.B, §I.C (pressure graphs), §V, quick start guide.

## Measured pressure

- **PRES-1** Each collision with the left or right wall transfers momentum `2 m |v_x|`. These are summed over the averaging time `T_avg` and divided by it to give the displayed average ("Avg."). _Web port:_ a hit transfers `m (|v_x before| + |v_x after|)`, which is `2 m |v_x|` for a plain bounce and stays right when the piston's thermostat changes the speed; each hit is divided by the length (2D) or area (3D) of wall the particle's centre can reach, as in Java (`packages/engine/src/stats/pressure.ts`).
- **PRES-2** `T_avg` defaults to 60 ps and is set in Options. Readings in the first `T_avg` after a restart are not yet meaningful; the UI should mark them as warming up. _Web port:_ the readout says "Warming up" and averages over the time so far; lengthening `T_avg` warms it up again, as Java's tracker does. The averaging time is set under the readout, not in an Options dialog.
- **PRES-3** Units depend on dimension: pN (force) in 1D, µN/m (force per length) in 2D, MPa in 3D.
- **PRES-4** With an undivided box, one measured value and one prediction are shown. With a divided box, left and right are shown separately, each with its own prediction based on that side's particle count. _Web port:_ undivided, the reading is the mean of the left and right walls (Java's `WallPressureTracker`); divided, with or without a hole, the left side reads the left wall and the right side the right wall. Predictions use each side's count and its current kinetic temperature (Java used the initial temperature), so the hot and cold sides of STORY-8 are each predicted right. Drawn walls (`docs/specs/walls.md`) aren't measured and the predictions ignore them: the readout keeps measuring the box's left and right walls.
- **PRES-5** With periodic boundaries there are no walls; the box shows the virial pressure instead, computed from the virial theorem using all collisions since restart (so it fluctuates less than wall pressure). _Web port:_ `P d V = 2⟨KE⟩ + (1/t) Σ μ r₁₂·Δv₁₂`, with `⟨KE⟩` averaged over time per kind rather than Java's starting energy, so partial virial pressures work and reactions are allowed for. Each collision's term is split equally between the two particles' kinds.

## Predicted pressure

- **PRES-6** An Ideal / Real choice sets how pressures (and some other predictions, see `predictions.md`) are predicted:
  - Ideal: `PV = nRT` (3D), `PA = nRT` (2D), `PL = nRT` (1D), ignoring particle size.
  - Real: the hard-sphere virial expansion, correcting for particle size.
  - _Web port:_ Real multiplies each kind's ideal pressure by `1 + x Q(x)` (PRED-8). 1D pressure waits for the 1D physics. The choice is a toggle on the readout and only changes which prediction is shown.
- **PRES-7** With "Include finite system corrections" on, predictions also apply the finite-system corrections. _Web port:_ Java applies none of them to pressure apart from what `realGasX` always includes (`N − 1` and the edge-corrected `B₂`); the web app does the same, so this option will not change the pressure readout.

## Partial pressures

- **PRES-8** With red and blue present, selecting Red or Blue in the statistics area shows that type's partial pressure (its share of the wall momentum transfer); Both shows the total. Partial pressures must add up to the total. _Web port:_ the readout lists every kind present with the total rather than switching with the statistics' kind picker; kinds are the colour each particle shows, as in the statistics. Partial pressures add up exactly (`pressure.test.ts`).

## Pressure graphs

- **PRES-9** The plot menu offers Wall Pressure (Left and Right when divided) and Virial Pressure. These have no distribution, so they always show as history. Wall pressure graphs exist only when there are walls. _Web port:_ waits for Phase 3's history view; Phase 2 shows numbers.
