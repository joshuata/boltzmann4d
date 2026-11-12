# Particles

The particle information area: what goes into the arena. Source: manual §I.C (Red, Blue and Both), §I.D, §I.F (Restart), quick start guide.

## Controls

Each value has a text field plus increase and decrease buttons. Typed values outside the range are clamped.

| ID | Control | Range | Notes |
| --- | --- | --- | --- |
| **PART-1** | Number of particles | 0–999 total | If the particles can't all be placed at random without overlapping, the number is lowered automatically. _Web port:_ the Particles panel's Number adds as many as fit and says how many did. |
| **PART-2** | Mass | 0–999 amu | — |
| **PART-3** | Radius | 0.2–20 nm | — |
| **PART-4** | Temperature | 0–9999 K | 0 K gives motionless particles. |

## Red and blue

- **PART-5** There are two particle types, red and blue (type 1 and type 2), each with its own mass, radius and starting temperature. _Web port:_ scenarios built in the editor can have up to 10 kinds (KIND-1, `editor.md`); red and blue are the first two, named Type A and Type B.
- **PART-6** Restart creates the number of particles shown, all red, with the mass, radius and temperature shown. In a divided arena they all start on the left. _Web port:_ simplified: Restart keeps each kind and its count, placed as the scenario places it (in a divided box, the first kind on the left and the rest on the right). Switching to the divided box (SIM-14) puts every particle on the left.
- **PART-7** Particles added after a restart are blue, and take the mass, radius and temperature shown at the moment they are added. The user sets those values first, then adds. _Web port:_ done for any kind, picked in the Particles panel. An added particle takes the panel's temperature, but the kind's running mass and radius; new mass and radius wait for Restart (see PART-11).
- **PART-8** Ways to add blue particles: raise the number (by typing or with +), or click (tap) a point in the arena to drop one particle there. A dropped particle must not overlap others. _Web port:_ done: + adds one at random, typing a number adds or removes several, and tapping the 2D arena drops one there (refused, with a note, if it would overlap). In 3D a tap adds one at random. In Maxwell's demon mode a tap still toggles the hole (SIM-24).
- **PART-9** Lowering the number removes the most recently created particles first. Removing particles changes the temperature of those left, by whatever kinetic energy the removed ones had. _Web port:_ done: − and lowering the number remove the selected kind's newest particles, with their energy.
- **PART-10** The number can't be changed while the Red view is selected (new particles are always blue); the UI must make this clear rather than silently ignore input. _Web port:_ simplified: the Number control always edits the kind picked in the Particles panel, which is named in its label.
- **PART-11** Several blue masses or radii can be added, but predictions are only correct when all blue particles share one mass and radius. The app should warn or note this. _Web port:_ avoided rather than warned about: added particles keep their kind's mass and radius, so every kind has one of each.

## Temperature field

- **PART-12** When blue particles are added at a different temperature, the app recomputes the temperature of the whole system from the total kinetic energy and updates the field. _Web port:_ the panel shows the live temperature of the whole gas and of the picked kind, from their kinetic energy. The Temperature field holds the value the next additions use.
- **PART-13** In piston mode and reaction mode the field keeps the starting value; the piston area shows the live temperature instead. _Web port:_ done: the Temperature field is always what new particles are added at, and the Piston box shows "Temperature now".

## Restart

- **PART-14** Restart applies the current number, mass, radius and temperature: new random positions and directions, clock to zero, every cumulative distribution cleared. _Web port:_ done. Restart also applies the panel's pending values and zeroes the random velocities' total momentum (SIM-30).
- **PART-15** To change the mass, radius or temperature of all particles, the user edits the value and restarts. The UI should make it visible that edited values are pending until restart or until particles are added. _Web port:_ done: edited fields are outlined and labelled "pending", and the kind button shows a dot, until the next add (temperature) or Restart (all three).

## Divided arena counts

- **PART-16** With a divided arena, Left # and Right # show how many particles are on each side, live. _Web port:_ done, in the Particles panel.
