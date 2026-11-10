// Particle state as structure-of-arrays (plan 0002): one typed array per field, indexed by
// particle. Replaces Java's Particle / Particle1D / Particle2D / Particle3D objects; the
// per-dimension behaviour lives in functions (particle-2d.ts, ...).
//
// Motion is lazy, as in Java: each particle's position is exact at its own time t0, and
// is only moved forward when an event involves it or a frame needs every particle.
import { ARENA_DIVIDER_RADIUS, ArenaType } from './simulation-info';

/** The arena as the physics sees it (SI units: meters). */
export interface Arena {
  type: ArenaType;
  xSize: number;
  ySize: number;
  zSize: number;
  /** Divided arenas: the divider's faces (centre ± ARENA_DIVIDER_RADIUS). */
  barrierLeftX: number;
  barrierRightX: number;
  /** Arenas with a hole: the hole's diameter, and the two edge discs that line it. */
  holeDiameter: number;
  edgeX: number;
  edgeY: readonly [number, number];
  edgeRadius: number;
  /** Maxwell's demon: the hole only lets particles through while it's open. */
  maxwellDemonMode: boolean;
}

/** Fills in the divider and hole geometry the way Java's ArenaInfo and Particle2D do. */
export function createArena(
  type: ArenaType,
  xSize: number,
  ySize: number,
  zSize: number,
  holeDiameter = -1,
  maxwellDemonMode = false,
): Arena {
  const dividerRadius = ARENA_DIVIDER_RADIUS;
  const hasHole = type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  // ArenaInfo.holeRadius: the edge discs sit just outside the hole.
  const holeRadius = 0.5 * holeDiameter + dividerRadius;
  return {
    type,
    xSize,
    ySize,
    zSize,
    barrierLeftX: 0.5 * xSize - dividerRadius,
    barrierRightX: 0.5 * xSize + dividerRadius,
    holeDiameter: hasHole ? holeDiameter : -1,
    edgeX: 0.5 * xSize,
    edgeY: [0.5 * ySize + holeRadius, 0.5 * ySize - holeRadius],
    edgeRadius: dividerRadius,
    maxwellDemonMode: hasHole && maxwellDemonMode,
  };
}

export class Particles {
  readonly count: number;
  /** Position in meters at time t0. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Velocity in m/s. */
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly vz: Float64Array;
  /** Simulation time (s) at which this particle's position was last set. */
  readonly t0: Float64Array;
  /** Time since this particle's last particle–particle collision (for statistics). */
  readonly cumTime: Float64Array;
  /** Radius in meters. */
  readonly radius: Float64Array;
  /** Mass in amu. */
  readonly mass: Float64Array;
  /** Index into the particle-type table. */
  readonly type: Uint16Array;
  /**
   * Periodic boundaries only: Wall.LEFT / Wall.BOTTOM / Wall.BACK set while the particle
   * overlaps that boundary (it is then kept on the low side, with x in [-radius, radius)).
   */
  readonly bFlag: Uint8Array;

  constructor(count: number) {
    this.count = count;
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.z = new Float64Array(count);
    this.vx = new Float64Array(count);
    this.vy = new Float64Array(count);
    this.vz = new Float64Array(count);
    this.t0 = new Float64Array(count);
    this.cumTime = new Float64Array(count);
    this.radius = new Float64Array(count);
    this.mass = new Float64Array(count);
    this.type = new Uint16Array(count);
    this.bFlag = new Uint8Array(count);
  }
}
