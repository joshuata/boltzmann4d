// Event-driven hard-sphere simulation, ported from boltzmann3d model/physics.
// Must stay free of DOM/Three.js imports so it can run in a Worker and in Vitest.

export type Dimension = 1 | 2 | 3;

/** Snapshot of particle state handed to the renderer (mirrors RenderFrame.java). */
export interface RenderFrame {
  dimension: Dimension;
  time: number;
  /** Flat positions, `dimension` components per particle. */
  positions: Float64Array;
  /** Per-particle type index into the particle-type table. */
  types: Uint16Array;
}
