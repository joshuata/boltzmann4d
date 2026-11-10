# 0010: WYSIWYG scenario editor, drawn walls and particle kinds

_In progress: steps 1 (spec), 2 (schema v2 and palettes), 3 (N kinds and reaction rules), 4 (reflecting walls and spawn regions in the engine) and 5 (drawing walls and kinds in the simulator) are done; next is step 6._ Replaces plan 0008 step 4's form editor (on `/editor`, which already runs, saves and downloads scenarios) and builds on plan 0008 steps 2 and 3 (the worker loads a scenario; `/upload` opens files), all done. The form editor was ported to scenario version 2 in step 2 and keeps working until step 6 replaces it.

## Goal

Teachers and students build a simulation by drawing it. In a 2D canvas they click and drag to create walls and shapes, select a wall to change its kind, settings and style, draw areas that spawn particles and set how many and of which kind, and define up to 10 particle kinds coloured from a palette that is safe for colour-blind viewers by default. They run it, save it and share it as a file (plan 0008's decisions on storage and sharing still hold).

## Decisions (agreed 2026-11-10)

- **2D now, 3D later.** Drawn walls exist in 2D only. 1D and 3D keep today's box, divider and hole, edited with a form. The schema leaves room for 3D (walls carry a `dimensions`-independent 2D outline that a later plan can extrude), but nothing 3D is built here.
- **Shapes:** line segments, rectangles and polygons (closed or open polylines). Rectangles and polygons are stored as polylines of segments; there are no curved walls.
- **Wall kinds:** reflecting, thermal (fixed temperature), semipermeable (passes some kinds, reflects the rest), gate (opens and closes at run time, like the demon's hole), and attractive (a square well along the wall). Attractive comes last (step 7) because it is the most work.
- **Up to 10 particle kinds,** each with a name, mass, radius and colour. Colours come from a palette; the default palette is colour-blind safe.
- **Reactions are a rule table:** rules like `A + A → B + B` with forward and reverse activation energies and an optional suppressed reverse. Today's red↔blue reaction is exactly one rule, so presets behave identically.
- **The physics of existing scenarios doesn't change.** The box, the divider, the hole, the piston and the red↔blue reaction keep their current code paths, and `parity.test.ts` stays green. Drawn walls are additional interior walls with their own event types.

## Design

### Scenario schema, version 2

Version 2 of the scenario format (`packages/engine/src/scenario/schema.ts`). Version 1 files still load: a migration turns them into version 2 (`RED`/`BLUE` groups become kinds 0 and 1 with the Classic palette, so presets look the same).

- `kinds`: 1–10 entries `{ id, name, mass, radius, color? }`. `color` is optional; without it the kind takes its index's colour from `display.palette`.
- `spawnRegions`: `{ id, shape: rect | polygon, fill: [{ kind, count, temperature | speed }] }`. The whole arena is an implicit region, which is how version 1 random blocks migrate. Explicitly placed particles stay (`{ kind, position, speed, angle? }`).
- `walls`: `{ id, points: [x, y][], closed, kind, style }` with `kind` one of `reflecting`, `thermal { temperature }`, `semipermeable { passes: kindId[] }`, `gate { open }`, `attractive { depth, width }` and `style { color?, thickness, dash }` (style is display only; `thickness` is not a physical width, walls have zero width physically and particles bounce one radius from the line).
- `reactions`: `[{ reactants: [kindId, kindId], products: [kindId, kindId], forward, reverse, suppressReverse }]`.
- `display.palette`: a palette name (see below), plus the existing colour scheme fields.
- Statistics' `color: RED | BLUE | BOTH` becomes `kinds: 'all' | kindId[]`.
- A `.set` compatibility check: a scenario exports to `.set` only when it has the box arena, no drawn walls or spawn regions, at most two kinds and at most the one red↔blue reaction. Otherwise the editor says why it can't, and offers JSON (FILE-6 still holds for scenarios that came from `.set`).

### Palettes and colour-blind safety

A palette module in the engine (pure data, used by the renderer and the editor):

- **Okabe–Ito** (7 colours, without black; the default for new scenarios), **Muted** (Tol's muted without pale grey, plus a violet: 10, the default once a scenario has more than 7 kinds), **Tol Bright** (7), and **Classic** (Java's red and blue first, then the remaining `DefaultParticleInfo` colours; used by migrated presets so they look unchanged).
- Colour is never the only cue: each kind also gets a **marker** in 2D (filled disk, ring, disk with a dot, cross, …), shown in the arena, the legend and the charts, so kinds stay distinguishable in greyscale and with more kinds than any palette separates well. Markers can be turned off in display settings.
- A test checks every palette: simulate protanopia, deuteranopia and tritanopia (Machado et al. 2009 matrices), and require a minimum pairwise CIEDE2000 distance between the colours of the first _n_ kinds and against the light and dark arena backgrounds. Classic is exempt from the CVD check (it exists for fidelity) and the editor marks it as not colour-blind safe.
- Users can override a kind's colour; the editor warns when an override falls below the same distance threshold against another kind.

### Engine

- **N kinds.** `Particles` already has `type` and `color` (Uint16). Reactions move from the hard-coded `color 0/1` test in `particle-2d.ts` (and 3D) to a rule lookup keyed by the unordered reactant pair. With the single red↔blue rule the code takes the same branches with the same arithmetic, which parity proves. Statistics and predictions (`packages/engine/src/stats`) group by kind instead of red/blue.
- **Segment walls (2D).** Two new event types: a particle reaching a segment's face (linear in time: the signed distance to the line reaches the radius, within the segment's extent) and a particle reaching a segment endpoint (quadratic: a disk against a point, like a collision with an infinitely heavy zero-radius particle). The endpoint event handles corners and wall ends, so polygons need no special corner case. Reflection is specular about the face normal or the line of centres. Walls are checked from the cell grid: each wall registers in the cells it crosses (padded by the largest radius), so prediction stays local (plan 0003).
- **Wall kinds.** Thermal walls reflect with a velocity drawn from the wall temperature (the existing thermostat's rule). Semipermeable walls predict no event for kinds they pass. Gates are walls whose events are skipped while open; toggling one re-predicts the particles in its cells (as the demon toggle does). Attractive walls add a crossing event for a line offset by the well width, as `attractive-wall.ts` does for the top wall.
- **Spawn regions.** `resolve.ts` places each region's particles uniformly inside its shape, not overlapping other particles or walls, with the seeded random generator, so a scenario resolves to the same start every time for a given seed.
- **Limits for this plan:** drawn walls need a non-periodic arena (periodic ghosts and walls together come later), and no drawn walls with the piston.
- Every new event type gets conservation tests (energy and momentum against fixed walls to round-off, SIM-3), time-reversal tests (SIM-32), a corner/end test, and a benchmark next to `simulation.bench.ts`.

### Simulator

- The 2D view draws walls with their style (colour, thickness, dash; gates drawn open/closed) and particles with their kind's colour and marker.
- The sidebar's red/blue/both selector becomes a kind picker (all or a subset), with a legend that shows each kind's name, colour and marker. Gates can be toggled from the sidebar and by tapping them in the arena.

### Editor (`packages/simulation-editor`)

- A Svelte component drawing the arena as **SVG**: walls and regions are SVG elements, so hit-testing, focus and touch come for free and there is no hand-built canvas drawing (AGENTS.md UI rules). Coordinates are in nm with a grid.
- **Tools:** select (click, drag to move, handles to move points, marquee or shift-click to multi-select), segment (drag), rectangle (drag), polygon (click points, close on the first point or Enter), spawn region (rectangle or polygon), and pan/zoom (wheel, pinch, two-finger drag). Snapping to the grid, to other endpoints and to 15° angles, toggled with a modifier key and a toolbar switch.
- **Inspector** for the selection: wall kind and its settings, style; region fill rows (kind, count, temperature); arena size and boundary. Multi-selection edits shared fields.
- **Kinds panel:** add, remove (refused while a region, wall or reaction uses the kind, with the reason), rename, mass, radius, colour override; palette picker with previews under the CVD simulations. **Reactions panel:** the rule table.
- Undo/redo of every edit (a command history over the scenario JSON), Delete/Backspace, arrow-key nudging, Escape to cancel a drawing. Every tool has a keyboard path and works with touch; the layout works at narrow widths (inspector becomes a bottom sheet).
- Live validation through `validateScenario`, with problems linked to the shape they concern. Start from a blank arena or any preset. Run (opens the simulator with the scenario), save to IndexedDB, download `.json` (and `.set` when compatible).

## Work

Each step is one PR. Steps 2–4 are engine work; step 6 replaces the form editor in `packages/simulation-editor`.

1. **Spec (done).** `docs/specs/editor.md` with requirement IDs: `KIND-*` (kinds, palettes, reaction rules), `WALL-*` (drawn-wall physics) and `EDIT-*` (the editor), plus STORY-29–34 in `stories.md` (a chamber, osmosis, effusion through a gate, heat conduction, chained reactions, a colour-blind check). `particles.md` and `simulation.md` note where kinds and rules extend PART-5 and SIM-25–29.
2. **Schema v2 and palettes (done).** The version 2 schema, the v1 → v2 migration, the `.set` compatibility check, the palette module and its CVD test. Round-trip tests over every bundled preset (`.set → v1 → v2 → .set`).
3. **N kinds and reaction rules in the engine (done).** `sim/reactions.ts` compiles the rules into a table looked up by the colliding pair's colours, used by `collide2D` and `collide3D` (3D reactions are new; Java has none). The Java rule takes the same branches and arithmetic, so parity (including the two reaction fixtures) is unchanged. Rules have an `enabled` flag: `.set` files with `reaction_mode TRUE` get an enabled rule only where the app always ran it (2D, no blue particles at the start, SIM-25), so 3Dequil still doesn't react but round-trips. `ResolvedScenario` has `reactions` (species indices), species carry their `kindId`, a kind with no particles is kept when a rule uses it (replacing the worker's "Reacted" copy for `.set` files), and `statColor`/red–blue limits became `statKinds` and per-species limits. Statistics keep every type subset up to three kinds, and above that each kind alone plus all together (a picker for arbitrary subsets is step 5). Tests: rule table lookup and conflicts, A + B → C + C, chained rules, 3D, energy conservation with chemical energy.
4. **Segment walls and spawn regions (reflecting walls only, done).** `sim/segment-walls.ts`: one `DRAWN_WALL` event type covering faces and end points (the earliest over all segments and end points is exactly the first contact, so corners and crossings need nothing special), specular reflection, and each segment and end point registered in the grid cells within one radius of it, so a particle only checks its own cell's walls. Wall events are predicted from the particle's present state and lose ties with the box's walls; the piston and periodic arenas are refused (WALL-3), and so are particles that start on a wall. `resolve.ts` places randomly placed particles in scenarios with walls or spawn regions by rejection sampling: inside the region (or the arena, or its side of a divider), clear of walls, the divider and earlier particles, and says how many fit when they don't (EDIT-6); scenarios without either keep Java's placement exactly. Other wall kinds are still refused. The simulator runs such scenarios but doesn't draw the walls yet (step 5), and hides the piston switch when there are walls. Tests: face and end-point bounces, near misses, a triangle's corners, crossing walls, energy conservation, time reversal over short runs (hard-disc collisions amplify round-off exponentially, so long runs can't retrace), placement inside regions and polygons, seeds, and a full region. Benchmarks: `simulation.bench.ts` has the default box with and without drawn walls; walls cost no measurable speed (about 1M events/s either way).
5. **Simulator (done).** The 2D view draws drawn walls as lines of a fixed pixel width (Three's `Line2`), in their style or their kind's default (`scenario/wall-styles.ts`: one colour, width and dash per kind, each with 3:1 contrast on black and white, WALL-5), and each kind's marker over its particles in a colour contrasting with the disc (`render/markers.ts`, shared with the sidebar's SVG swatches; markers stay on in the speed and energy colour modes, KIND-12). The View box has a Kind markers switch (KIND-9); scenarios from `.set` files, presets included, start with markers off so they look as they did (KIND-7, agreed 2026-11-10), and new scenarios with them on. The statistics' subset dropdown became a kind picker (All kinds, or toggle any kinds), which is also the legend; any subset is composed in the worker from the all-kinds data (per-kind running sums), so it has the whole history (KIND-4). Checked in the app with a four-kind scenario with regions and walls, a 2D preset and a 3D preset. Gate toggling moves to step 7 with the gate wall kind.
6. **Editor, drawing.** SVG canvas, select/segment/rectangle/polygon/region tools, snapping, pan/zoom, inspector for geometry and reflecting walls, kinds panel, undo/redo, validation, run, save and download.
7. **Wall kinds.** Thermal, semipermeable and gate in the engine (with tests), the simulator (gate toggling) and the inspector; then attractive walls. Reactions panel in the editor.
8. **Docs.** A user guide page in `apps/web/src/docs/` for the editor.

Later (not in this plan): 3D walls by extrusion, drawn walls in periodic arenas, walls with the piston, curved walls.

## Open questions

- Should drawn walls be allowed to replace the legacy divider (drawing a vertical wall with a hole), or does the divider stay its own arena mode? Keeping it separate is what keeps parity simple.
- Do the Left #/Right # counts (PART-16) generalize to "particles per closed region", and should the editor let users mark regions to count?
- Per-kind temperature is set per spawn fill row; is a per-kind default temperature also wanted?
