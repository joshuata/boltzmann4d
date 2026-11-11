---
title: Reverse, chaos and trajectories
description: Run the motion backwards, watch round-off grow into chaos, and trace the particles' paths.
order: 1.7
---

The particles in Boltzmann 4D move exactly as Newton's laws say: in straight lines between collisions, with every collision computed exactly. Those laws work just as well backwards. These tools let you see that, and see why it doesn't make the gas run backwards on its own.

## Reverse

The **Reverse** button (next to Restart) flips the velocity of every particle at once. The clock keeps counting forward, but each particle now retraces the path it came along, bouncing off the same particles and walls in the opposite order.

Try it:

1. Load any simulation and let it run for a few seconds.
2. Turn on **Trace paths** and press **Clear trace**, then let it run a few seconds more.
3. Press **Reverse**. The particles run back along their traced paths, towards where they were when you cleared the trace.

Reverse works while running or paused. Pressing it twice gives back exactly the motion you had.

### Why it only works for a while

The computer rounds every number to about 16 significant digits. After reversal, each particle is off by a tiny fraction of a nanometre, and each collision magnifies that error several times over. After enough collisions the error is as big as a particle and the motion no longer retraces itself. In a typical gas this takes a few tens of picoseconds, so reverse soon after the moment you want to come back to.

A moving piston reverses too: it heads back towards where it started. The thermostat (isothermal piston moves), a divider that conducts heat, and a reaction with its reverse suppressed don't run backwards, so reversing there won't retrace the motion.

## Chaos: the Equal masses simulation

Load **2D → Equal masses**. The two halves of the box hold identical copies of the same 20 particles, separated by a solid divider. At first they move in perfect step.

The copies' starting positions differ only in the last digits the computer keeps. Each collision magnifies that difference, roughly tenfold every few picoseconds. Around 90–95 ps the halves visibly differ, and by about 120 ps they look unrelated. That's chaos: the motion is completely determined, yet a tiny difference in the start soon changes everything.

## Trace paths

**Trace paths** (in the View box) leaves a dot at each particle's centre every frame, in the particle's colour. Where the dots are far apart the particle was fast; where they bunch up it was slow. Straight runs between bends show the free paths between collisions.

- **Clear trace** erases the dots so far and keeps tracing.
- In 3D the dots stay where they were in the box, so you can turn the box to look at the paths from any side.
- The trace starts afresh when you restart or load a simulation. The dot size comes from the simulation's settings (2 pixels by default).

The **Liquid** simulation starts with tracing on, so you can follow the blue particle as it wanders through the dense fluid.

## Speed

The **Speed** slider goes up and down in doubling steps, from ⅛× to 2048×. At high speeds particles jump too far between frames to follow by eye, and a large simulation may not keep up; statistics still collect correctly.
