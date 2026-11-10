---
title: Scenario editor
description: Draw your own simulation, with walls, spawn regions, particle kinds and reactions.
order: 2
---

The [scenario editor](../editor) lets you build a simulation by drawing it: walls and shapes inside the arena, areas where particles start, and the kinds of particles that fill them. Run it, change it, and download it to share.

## Start

Use **Start from** at the top to begin with a blank 2D arena, any of the ready-made simulations, or a file on your computer (a Boltzmann 4D `.json` file or a Boltzmann 3D `.set` file).

With nothing selected, the panel on the right shows the **Arena**: its size, whether it has walls, a divider or a hole, and what fills the whole arena. Walls and spawn regions are drawn in 2D; 1D and 3D simulations use the box, divider and hole.

## Draw

Pick a tool from the toolbar above the arena, or press its key:

| Tool | Key | How |
| --- | --- | --- |
| Select and move | V | Click a shape to select it. Shift-click or drag a box to select several. |
| Wall: line segment | L | Drag from one end to the other. |
| Wall: rectangle | R | Drag from one corner to the opposite one. |
| Wall: polygon | P | Click each corner. Click the first one to close it, or double-click (or press Enter) to leave it open. |
| Spawn region: rectangle | S | Drag from one corner to the opposite one. |
| Spawn region: polygon | G | Click each corner, then click the first one (or press Enter). |

Press Escape to cancel a shape you're drawing.

While you draw or move, points **snap** to the grid, to other walls' points and to 15° angles. Turn snapping off with the magnet button, or hold Alt (Option on a Mac) to turn it off for a moment.

To **change** a shape, select it: drag it to move it, drag the white handle on a point to move that point, or use the arrow keys (Shift moves five grid steps). Delete or Backspace removes it.

To **look around**, scroll to zoom, drag with the middle mouse button or with the space bar held, or pinch and drag with two fingers. Press 0 to fit the arena again.

Undo and redo every change with the arrow buttons in the toolbar, or Ctrl+Z and Ctrl+Shift+Z (⌘Z and ⌘⇧Z on a Mac).

## Walls

A wall has no thickness: a particle bounces off when its edge touches the line. Select a wall to choose its **kind**:

- **Reflecting**: particles bounce off without losing energy.
- **Thermal**: held at a temperature. Particles leave it at that temperature, so the gas near it heats up or cools down.
- **Semipermeable**: tick the kinds that pass through; the others bounce off. Try it for osmosis or for separating a mixture.
- **Gate**: a wall you open and close while the simulation runs, by tapping it or with its button in the sidebar. Choose whether it starts open.
- **Attractive**: a wall with a well along it. Particles that come within the well's width speed up by its depth, and need that much energy to get away again, so they tend to stick near the wall.

Each kind has its own look (gates are dashed), and you can change a wall's colour, line width and dashes. Walls can't be combined with periodic boundaries or the piston yet.

## Spawn regions

A spawn region is an area where particles start. Select one to name it and to set what fills it: rows of a particle kind, a count and a temperature. Particles start inside it at random, clear of walls and of each other, and then move anywhere the walls allow.

Particles that aren't in a region fill the whole arena: set those in the Arena panel, with nothing selected.

## Particle kinds

The **Particle kinds** panel lists up to ten kinds, each with a name, mass, radius and colour. Colours come from the palette chosen in the Arena panel; the default palette is easy to tell apart for people with colour-blindness. Each kind also has a marker (a ring, a dot, a cross and so on) so kinds can be told apart without colour. If you choose your own colour, the editor warns you when it's hard to tell from another kind's.

A kind can't be removed while a region, wall or reaction uses it; the editor says which.

## Reactions

In the **Reactions** panel, a rule like A + A → B + B turns two colliding particles into two others when they hit each other harder than the forward energy. The products turn back above the reverse energy, unless you tick **No reverse**. Particles keep their own size and mass when they react: only their kind (colour, marker and statistics) changes.

## Problems

As you edit, the editor checks the scenario. Anything that stops it from running is listed at the top of the panel, such as a wall outside the arena or a region with more particles than fit in it. Click a problem to select the shape it's about.

## Run and share

- **Run** starts the simulation with the scenario as it is now. **Back to the editor** returns to where you were.
- **.json** downloads the scenario as a Boltzmann 4D file, which you can open again here or send to someone else to open on the [Upload](../upload) page.
- **.set** downloads a file for the Boltzmann 3D desktop program, when the scenario fits it: no drawn walls or spawn regions, at most two kinds, and no reactions other than red turning blue.

On a phone, the arena stays at the top of the screen and the panels scroll underneath it.
