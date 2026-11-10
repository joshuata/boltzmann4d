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
  /**
   * Arenas with a hole: the hole's diameter, and the fixed edge particles that line it
   * (two discs in 2D, a ring of spheres around the x axis in 3D), all at x = edgeX.
   */
  holeDiameter: number;
  /** 3D: the square of the hole's radius out to the edge spheres' centres (ArenaInfo). */
  holeRadiusSquared: number;
  edgeX: number;
  edgeY: Float64Array;
  edgeZ: Float64Array;
  edgeRadius: number;
  /** Maxwell's demon: the hole only lets particles through while it's open. */
  maxwellDemonMode: boolean;
}

/** Fills in the divider and hole geometry the way Java's ArenaInfo does. */
export function createArena(
  type: ArenaType,
  xSize: number,
  ySize: number,
  zSize: number,
  holeDiameter = -1,
  maxwellDemonMode = false,
  dimension: 2 | 3 = 2,
): Arena {
  const dividerRadius = ARENA_DIVIDER_RADIUS;
  const hasHole = type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
  // ArenaInfo.holeRadius: the edge particles sit just outside the hole.
  const holeRadius = 0.5 * holeDiameter + dividerRadius;
  let edgeY: Float64Array;
  let edgeZ: Float64Array;
  if (dimension === 2) {
    edgeY = Float64Array.of(0.5 * ySize + holeRadius, 0.5 * ySize - holeRadius);
    edgeZ = new Float64Array(2);
  } else {
    // A ring of spheres about one diameter apart; the angle accumulates as in Java.
    const count = Math.max(0, Math.round((4 * Math.PI * holeRadius) / dividerRadius));
    edgeY = new Float64Array(count);
    edgeZ = new Float64Array(count);
    const angStep = (2 * Math.PI) / count;
    let ang = 0;
    for (let i = 0; i < count; i++) {
      edgeY[i] = holeRadius * Math.cos(ang) + 0.5 * ySize;
      edgeZ[i] = holeRadius * Math.sin(ang) + 0.5 * zSize;
      ang += angStep;
    }
  }
  return {
    type,
    xSize,
    ySize,
    zSize,
    barrierLeftX: 0.5 * xSize - dividerRadius,
    barrierRightX: 0.5 * xSize + dividerRadius,
    holeDiameter: hasHole ? holeDiameter : -1,
    holeRadiusSquared: holeRadius * holeRadius,
    edgeX: 0.5 * xSize,
    edgeY,
    edgeZ,
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
