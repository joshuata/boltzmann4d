// Event-driven hard-sphere simulation, ported from boltzmann3d model/physics.
// Must stay free of DOM/Three.js imports so it can run in a Worker and in Vitest.

export type Dimension = 1 | 2 | 3;

/** What the renderer needs once per simulation: arena and per-particle constants. */
export interface SceneInfo {
  dimension: Dimension;
  /** Arena size in meters. */
  arenaXSize: number;
  arenaYSize: number;
  arenaZSize: number;
  /** Per particle, meters. */
  radii: Float64Array;
  /** Per particle, index into typeColors. */
  types: Uint16Array;
  /** Per particle type, 0xRRGGBB. */
  typeColors: number[];
  /** Divided arenas: the divider's faces, and the hole's edge discs if it has one. */
  divider?: {
    leftX: number;
    rightX: number;
    /** Centres of the two edge discs lining the hole (top, bottom); absent without a hole. */
    edgeY?: readonly [number, number];
    edgeRadius: number;
  };
}

/** Snapshot of particle state handed to the renderer (mirrors RenderFrame.java). */
export interface RenderFrame {
  dimension: Dimension;
  time: number;
  /** Flat positions in meters, `dimension` components per particle. */
  positions: Float64Array;
  /** Per-particle type index into the particle-type table. */
  types: Uint16Array;
}

export {
  DEFAULT_FRAME_DURATION,
  Simulation,
  snapSubtract,
  type InitialSpecies,
  type InitialState,
  type SimulationOptions,
} from './simulation';

export { createCounters, resetCounters, type Counters } from './counters';
export {
  CalendarUpdate,
  Collision,
  MAX_TIME,
  MIN_TIME,
  Wall,
  copyEvent,
  createEvent,
  type EventInfo,
} from './event';
export { CellGrid } from './cell-grid';
export { EventHeap } from './event-heap';
export { Particles, type Arena } from './particles';
export {
  boundaryCollide2D,
  collide2D,
  initPeriodicFlags2D,
  moveToTime2D,
  predCol2D,
  predictBoundary2D,
  predictPair2D,
} from './particle-2d';
