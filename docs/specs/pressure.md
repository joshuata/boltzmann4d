# Pressure

The pressure area above the arena. Source: manual §I.B, §I.C (pressure graphs), §V, quick start guide.

## Measured pressure

- **PRES-1** Each collision with the left or right wall transfers momentum `2 m |v_x|`. These are summed over the averaging time `T_avg` and divided by it to give the displayed average ("Avg.").
- **PRES-2** `T_avg` defaults to 60 ps and is set in Options. Readings in the first `T_avg` after a restart are not yet meaningful; the UI should mark them as warming up.
- **PRES-3** Units depend on dimension: pN (force) in 1D, µN/m (force per length) in 2D, MPa in 3D.
- **PRES-4** With an undivided box, one measured value and one prediction are shown. With a divided box, left and right are shown separately, each with its own prediction based on that side's particle count.
- **PRES-5** With periodic boundaries there are no walls; the box shows the virial pressure instead, computed from the virial theorem using all collisions since restart (so it fluctuates less than wall pressure).

## Predicted pressure

- **PRES-6** An Ideal / Real choice sets how pressures (and some other predictions, see `predictions.md`) are predicted:
  - Ideal: `PV = nRT` (3D), `PA = nRT` (2D), `PL = nRT` (1D), ignoring particle size.
  - Real: the hard-sphere virial expansion, correcting for particle size.
- **PRES-7** With "Include finite system corrections" on, predictions also apply the finite-system corrections.

## Partial pressures

- **PRES-8** With red and blue present, selecting Red or Blue in the statistics area shows that type's partial pressure (its share of the wall momentum transfer); Both shows the total. Partial pressures must add up to the total.

## Pressure graphs

- **PRES-9** The plot menu offers Wall Pressure (Left and Right when divided) and Virial Pressure. These have no distribution, so they always show as history. Wall pressure graphs exist only when there are walls.
