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
  /** Periodic boundaries: discs crossing an edge also show on the opposite side. */
  periodic: boolean;
  /** Per particle, meters. */
  radii: Float64Array;
  /** Per particle, index into typeColors. */
  types: Uint16Array;
  /** Per particle type, 0xRRGGBB. */
  typeColors: number[];
  /**
   * Per particle type, the marker drawn on its discs in 2D (KIND-9: `disk`, `ring`, `dot`,
   * …; see scenario/palettes.ts). Absent when markers are turned off.
   */
  typeMarkers?: string[];
  /** Drawn walls (2D): x, y pairs in meters, and how to draw them (WALL-5). */
  walls?: {
    points: Float64Array;
    closed: boolean;
    /** 0xRRGGBB. */
    color: number;
    /** Screen pixels. */
    lineWidth: number;
    dash: 'solid' | 'dashed';
    /** Gates are drawn faint while open (frames say which are). */
    gate?: boolean;
    /** Attractive walls: the well's width each side, meters. */
    well?: number;
  }[];
  /** Divided arenas: the divider's faces, and the hole's edge particles if it has one. */
  divider?: {
    leftX: number;
    rightX: number;
    /**
     * Centres of the edge particles lining the hole, all at x = (leftX + rightX) / 2: the
     * two discs (top, bottom) in 2D, a ring in 3D. Absent without a hole.
     */
    edgeY?: Float64Array;
    edgeZ?: Float64Array;
    edgeRadius: number;
    /** The hole's diameter in meters; absent without a hole. */
    holeDiameter?: number;
    /** Maxwell's demon: the hole opens and closes (frames say which). */
    demon?: boolean;
  };
  /** Piston arenas: the piston's valve and shaft radii, meters (its height comes per frame). */
  piston?: { valveRadius: number; shaftRadius: number };
  /** 3D: the starting view rotation about the x and y axes, in degrees. */
  viewingAngles?: readonly [number, number];
  /** Per particle, amu (for the kinetic-energy colour mode). */
  masses?: Float64Array;
  /**
   * Colour modes: the speed (m/s) and kinetic energy (kJ/mol) that map to the end of the
   * hue scale, 2.5 × the predicted averages over all types (MainGuiFullView).
   */
  colorLimits?: { speed: number; energy: number };
  /** The settings file's view: colour mode and trace. */
  colorMode?: ColorMode;
  trace?: { enabled: boolean; pointSize: number };
}

/** How particles are coloured: by type, or by speed or kinetic energy on a hue scale. */
export type ColorMode = 'NORMAL' | 'SPEED' | 'KE';

/** Snapshot of particle state handed to the renderer (mirrors RenderFrame.java). */
export interface RenderFrame {
  dimension: Dimension;
  time: number;
  /** Flat positions in meters, `dimension` components per particle. */
  positions: Float64Array;
  /** Per-particle type index into the particle-type table. */
  types: Uint16Array;
  /** Per-particle speed, m/s (for the speed and kinetic-energy colour modes). */
  speeds: Float32Array;
  /** Maxwell's demon: whether the hole is open this frame. */
  holeOpen?: boolean;
  /** Piston arenas: y of the piston's underside, meters. */
  pistonY?: number;
  /** Scenes with drawn walls: the indices of the gates open this frame (WALL-4). */
  openGates?: number[];
}

export {
  DEFAULT_FRAME_DURATION,
  Simulation,
  snapSubtract,
  type InitialSpecies,
  type InitialState,
  type SimulationOptions,
} from './simulation';

export { compressionLimitPercent, DEFAULT_PISTON_SPEED, Piston, PistonMode } from './piston';
export { Thermostat } from './thermostat';
export { javaReaction, ReactionTable, type ReactionRule } from './reactions';
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
  boundaryCollide3D,
  collide3D,
  initPeriodicFlags3D,
  moveToTime3D,
  predCol3D,
  predictBoundary3D,
  predictPair3D,
} from './particle-3d';
export {
  boundaryCollide2D,
  collide2D,
  initPeriodicFlags2D,
  moveToTime2D,
  predCol2D,
  predictBoundary2D,
  predictPair2D,
} from './particle-2d';
