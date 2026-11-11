# Scenario editor

The web app's own scenario editor: the user draws a 2D simulation (walls, shapes, areas that spawn particles), defines particle kinds and reactions, then runs, saves and shares it. _Web port:_ none of this is in the Java app or its manual. It extends the Java app, so where it touches an existing requirement (PART-5, SIM-25–28, FILE-6, VIEW-1) this spec says how. Plan: `.agents/archived-plans/0010-wysiwyg-editor.md`.

Three prefixes keep the IDs citable from tests and plans: **KIND** for particle kinds and colours, **WALL** for the physics of drawn walls, **EDIT** for the editor itself.

## Scope

- **EDIT-1** The editor builds 2D scenarios. 1D and 3D scenarios keep today's box, divider, hole and piston, edited with a form (arena size, boundary, kinds and counts); drawn walls and spawn regions are 2D only for now.
- **EDIT-2** Scenarios built from bundled presets or loaded `.set` files run exactly as they do without the editor. Drawn walls, spawn regions, extra kinds and reaction rules are additions: they never change the physics of a scenario that doesn't use them (`parity.test.ts`).

## Particle kinds

- **KIND-1** A scenario has 1 to 10 particle kinds. Each has a name, a mass (PART-2's range), a radius (PART-3's range) and a colour. Kinds replace red and blue (PART-5): a `.set` file's red and blue become kinds 1 and 2.
- **KIND-2** Names are short (up to 20 characters), unique in the scenario, and default to letters (`A`, `B`, …). Migrated `.set` scenarios name them Red and Blue.
- **KIND-3** A kind can't be removed while a spawn region, wall or reaction uses it; the editor says which ones do.
- **KIND-4** Wherever the app shows red, blue or both today (statistics selectors, legends, readouts, pressures by type), it shows the scenario's kinds instead: all kinds, or any subset the user picks. With the two kinds of a migrated `.set` file this is the same Red / Blue / Both choice as before.
- **KIND-5** Predictions that assume one species or a red/blue mixture (`predictions.md`) generalize to N kinds where the formulas do (mixtures of ideal gases, equipartition). Where a prediction has no N-kind form the app says so rather than showing a wrong number.

## Colours and accessibility

- **KIND-6** Kinds take their colours from a palette chosen for the scenario. The palettes are Okabe–Ito (7 colours: Okabe and Ito's eight without black, which vanishes on the dark arena), Muted (10: Paul Tol's muted scheme without its pale grey, plus a violet), Tol Bright (7) and Classic (5: Java's red and blue, then its green, yellow and purple). A palette with fewer colours than kinds can't be chosen.
- **KIND-7** New scenarios use Okabe–Ito, and switch to Muted when an 8th kind is added unless the user chose a palette. Scenarios migrated from `.set` use Classic and start with markers off (KIND-9), so presets look as they did (VIEW-1).
- **KIND-8** Every palette except Classic must keep its colours distinguishable for viewers with protanopia, deuteranopia or tritanopia, against each other and against the light and dark arena backgrounds. This is checked by a test: under normal vision and each simulated dichromacy (Machado et al. 2009), every pair of colours differs by at least 8 CIEDE2000 units and every colour by at least 15 from black and from white. The editor marks Classic as not colour-blind safe.
- **KIND-9** Colour is never the only way to tell kinds apart: each kind also has a marker (filled disk, ring, disk with a centre dot, cross, …) drawn on its particles in 2D, in legends and on charts. Markers can be turned off in the display settings; new scenarios start with them on, scenarios from `.set` files with them off (KIND-7). Kinds are named in every legend.
- **KIND-10** The user can override a kind's colour. The editor warns when an override is hard to tell apart from another kind's colour or from the background, using the same check as KIND-8, but allows it.
- **KIND-11** The editor previews the chosen palette as each of the three colour-vision deficiencies see it.
- **KIND-12** Colour-by-speed and colour-by-KE (VIEW-4) are unchanged: they override kind colours as they do today. Markers stay visible in those modes, so kinds can still be told apart.

## Spawn regions

- **EDIT-3** A spawn region is a rectangle or polygon drawn in the arena. It holds one or more fill rows: a kind, a count, and a temperature (PART-4's range) or a speed in m/s. When the scenario starts, each row's particles are placed uniformly at random inside the region, not overlapping each other, other particles or walls, with random directions (SIM-6).
- **EDIT-4** Regions may overlap; their particles then share the overlap. Regions don't stop particles: once the run starts, particles move anywhere the walls allow.
- **EDIT-5** With no regions drawn, the whole arena is the region (as in `.set` files, FILE-3).
- **EDIT-6** If a region's particles can't all be placed without overlap, the editor says which region and how many fit, rather than silently lowering the count (unlike PART-1). The total over all regions is at most 999 particles (PART-1).
- **EDIT-7** A run starts the same way every time from the same scenario and seed; Restart draws new positions (PART-14).
- **EDIT-8** The user can also drop single particles at a point, with a kind, speed and optional direction (the `.set` format's explicitly placed particles). _Web port:_ not built yet (follow-up). In a running simulation the Particles panel drops particles by tapping (PART-8).

## Drawn walls

- **WALL-1** A drawn wall is a polyline: a line segment, a rectangle, or a polygon (open or closed). It has zero thickness: a particle hits it when its centre is one radius from the line (SIM-2), and hits a wall's end or corner when its centre is one radius from the point.
- **WALL-2** Collisions with drawn walls are computed exactly from event to event, like every other collision (SIM-3): against reflecting walls, kinetic energy is conserved to round-off, and reversing (SIM-32) retraces the motion. A particle never passes through a wall it should reflect from, including at corners and where walls meet or cross.
- **WALL-3** Drawn walls sit inside the arena's box walls. For now they need a non-periodic boundary (SIM-13–16) and can't be combined with the piston (SIM-17); the editor says so when the user tries.
- **WALL-4** Each wall has one kind:
  - **Reflecting**: elastic, specular reflection about the wall (or, at an end or corner, about the line from the point to the particle's centre).
  - **Thermal**: a wall held at a temperature (0–9999 K). A particle leaving it has the normal speed √(2kT/m), the average for particles hitting a wall from a gas at that temperature, so energy in and out balance exactly at T and the gas near it heats or cools toward it. (Deterministic rather than a random draw, so runs stay reproducible, SIM-1.)
  - **Semipermeable**: kinds the user picks pass through as if it weren't there; other kinds reflect. The user can't pick every kind (that would be no wall).
  - **Gate**: a reflecting wall the user opens and closes while the simulation runs, by tapping it in the arena or from the sidebar, like the Maxwell demon's hole (SIM-24). It starts open or closed as the scenario says.
  - **Attractive**: a reflecting wall with a square well along it, with a depth (kJ/mol) and width (nm), like the attractive wall the Java app has on the top wall: a particle entering the well gains its depth in kinetic energy, and leaves only if it has enough.
- **WALL-5** A wall's style (colour, line thickness, dashed or solid) is display only and doesn't change its physics. Each kind of wall has a default style so kinds are recognisable at a glance, without relying on colour alone (for example, gates dashed, thermal walls in a temperature colour with a label). Default wall colours must have at least 3:1 contrast with both arena backgrounds.
- **WALL-6** The arena's divider and hole (SIM-14–16) and the demon (SIM-24) stay as they are. A drawn wall doesn't replace them.

## Reactions

- **KIND-13** Reactions are a table of rules. Each rule names two reactant kinds and two product kinds (`A + A → B + B`, `A + B → C + C`, …), a forward and a reverse activation energy, and whether the reverse reaction is suppressed. A pair colliding with more than the forward activation energy along their line of centres becomes the products and loses `E_f − E_r` (SIM-26); the products colliding above the reverse energy turn back, unless suppressed. A particle that reacts keeps its own mass and radius and changes only its kind (its colour, marker and which statistics count it), as in SIM-26: a change of radius could make particles overlap. The editor warns when a product kind's mass or radius differs from its reactant's, since the product kind's own values then only apply to particles spawned as that kind.
- **KIND-14** Each pair of kinds has at most one reaction, counting a rule's products as the reactants of its reverse: with `A + A → B + B` in the table, the editor refuses a second rule for `A + A` or for `B + B` (unless the first rule's reverse is suppressed and the new rule is the only one for `B + B`), and says which rule conflicts.
- **KIND-15** The Java app's reaction mode (SIM-25–29) is the single rule Red + Red → Blue + Blue, and behaves exactly as it does today. The energy diagram, counts and predictions of SIM-28 are shown when the scenario has that one rule; other rule tables show live counts per kind.

## Editing

- **EDIT-9** The arena is shown to scale in nm with a grid and rulers (SIM-11). The user can pan and zoom (scroll wheel, pinch, two-finger drag, and keyboard).
- **EDIT-10** Tools: select, line segment, rectangle, polygon, spawn region (rectangle or polygon), and drop particle. Segments and rectangles are drawn by dragging; polygons by clicking (tapping) points, closed by clicking the first point or pressing Enter, and finished open by double-clicking or pressing Enter on the last point. Escape cancels the shape being drawn.
- **EDIT-11** While drawing or moving, points snap to the grid, to other walls' points and to 15° angles. Snapping can be turned off in the toolbar and held off with a modifier key.
- **EDIT-12** Select picks a wall, region or particle by clicking or tapping it, several with shift-click or a drag rectangle. Selected shapes move by dragging or with the arrow keys; each point has a handle to drag. Delete or Backspace removes the selection.
- **EDIT-13** An inspector shows the selection's settings and edits them: for walls their kind, the kind's settings and the style; for regions their fill rows; with nothing selected, the arena (size, boundary) and the scenario (name, palette). With several items selected it edits the settings they share.
- **EDIT-14** A kinds panel lists the kinds with their colour, marker, name, mass and radius, and adds, removes and edits them. A reactions panel edits the rule table.
- **EDIT-15** Every edit can be undone and redone (buttons and the usual keyboard shortcuts), back to when the scenario was opened.
- **EDIT-16** The editor validates as the user edits: overlapping placements, walls outside the arena, too many particles, missing settings. Each problem says what is wrong and selects the shape it concerns when clicked. A scenario with problems can be saved but not run.
- **EDIT-17** The user starts from a blank arena, any bundled preset, or a saved scenario.

## Running, saving and sharing

- **EDIT-18** Run opens the simulator with the scenario as it is now; the user can come back to the editor and keep editing.
- **EDIT-19** Save stores the scenario by name in the browser (plan 0008, FILE-2). Download saves a `.json` scenario file.
- **EDIT-20** A scenario can also be downloaded as `.set` when the Java app can represent it (box arena, no drawn walls or spawn regions, at most two kinds, no rules other than Red + Red → Blue + Blue). Otherwise the editor says what stops it, and offers `.json` (FILE-6 holds for every scenario that came from `.set`).

## Devices and accessibility

- **EDIT-21** The editor works with mouse, touch and keyboard alone. Every tool and every action has a keyboard path; the canvas, toolbar and panels are reachable by Tab, and shapes can be selected and moved with the keyboard.
- **EDIT-22** Shapes are named for screen readers (for example "Thermal wall, 300 K, 4 points"), and changes to the selection are announced.
- **EDIT-23** The layout works on phones, tablets and desktops: at narrow widths the toolbar stays visible and the inspector and panels move to a bottom sheet.
