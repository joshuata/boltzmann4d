// 3D particle motion, event prediction and collisions (port of Particle3D.java).
//
// Scope: hard spheres in reflecting, periodic, divided and holed arenas (insulating
// divider; Maxwell's demon gate), and the movable piston with its wall thermostat, the
// same as particle-2d.ts. Square wells, the attractive wall and the conducting divider
// come in later steps.
//
// As in particle-2d.ts, prediction and collision code keeps Java's order of operations,
// since parity with the Java app depends on bit-identical results.
import { Collision, MAX_TIME, Wall, type EventInfo } from './event';
import type { Arena, Particles } from './particles';
import type { Piston } from './piston';
import { relativeEnergy, type ReactionTable } from './reactions';
import { ArenaType } from './simulation-info';
import { particleKE3D, type Thermostat } from './thermostat';

// Local copies of imported constants for the hot paths (see plan 0002).
const NEVER = MAX_TIME;
const { PARTICLE, WALL: WALL_EVENT, BOUNDARY, EOB, BARRIER, EDGE, PISTON } = Collision;
const { LEFT, RIGHT, BOTTOM, TOP, BACK, FRONT } = Wall;
const PERIODIC = ArenaType.PERIODIC_BOUNDARIES;
const DIVIDED = ArenaType.DIVIDED_ARENA;
const WITH_HOLE = ArenaType.DIVIDED_ARENA_WITH_HOLE;
const PISTON_ARENA = ArenaType.MOVABLE_PISTON;

/**
 * Periodic arenas: wraps a newly placed particle into the arena and sets its boundary
 * flags (from the Particle3D constructor). A particle overlapping a high edge is moved to
 * the matching position below zero, so overlapping particles always sit on the low side.
 */
export function initPeriodicFlags3D(p: Particles, i: number, arena: Arena): void {
  if (arena.type !== PERIODIC) return;
  const radius = p.radius[i]!;
  let x = p.x[i]!;
  let y = p.y[i]!;
  let z = p.z[i]!;
  let flags = 0;
  if (x < 0) x += arena.xSize;
  if (y < 0) y += arena.ySize;
  if (z < 0) z += arena.zSize;
  if (x < radius) {
    flags |= LEFT;
  } else if (arena.xSize - x < radius) {
    x -= arena.xSize;
    if (x < radius) flags |= LEFT;
  }
  if (y < radius) {
    flags |= BOTTOM;
  } else if (arena.ySize - y < radius) {
    y -= arena.ySize;
    if (y < radius) flags |= BOTTOM;
  }
  if (z < radius) {
    flags |= BACK;
  } else if (arena.zSize - z < radius) {
    z -= arena.zSize;
    if (z < radius) flags |= BACK;
  }
  p.x[i] = x;
  p.y[i] = y;
  p.z[i] = z;
  p.bFlag[i] = flags;
}

/** Moves a particle along its straight-line path to `time` (no collision checks). */
export function moveToTime3D(p: Particles, i: number, time: number): void {
  const dt = time - p.t0[i]!;
  p.x[i] = p.x[i]! + p.vx[i]! * dt;
  p.y[i] = p.y[i]! + p.vy[i]! * dt;
  p.z[i] = p.z[i]! + p.vz[i]! * dt;
  p.t0[i] = time;
  p.cumTime[i] = p.cumTime[i]! + dt;
}

/**
 * When two spheres with relative position (dX, dY, dZ) and relative velocity
 * (dVx, dVy, dVz) at time `t0` first touch at centre distance Dc: their absolute collision
 * time, or MAX_TIME if they never do. Already-overlapping spheres that approach collide
 * at once.
 *
 * (Java returns the calling particle's own t0 in that last case, which is either `t0`
 * or, when it is earlier, a "predicted in the past" error; this returns `t0`.)
 */
export function predCol3D(
  dX: number,
  dY: number,
  dZ: number,
  dVx: number,
  dVy: number,
  dVz: number,
  Dc: number,
  t0: number,
): number {
  const B = dX * dVx + dY * dVy + dZ * dVz;
  if (B >= 0) return NEVER; // not approaching
  const A = dVx * dVx + dVy * dVy + dVz * dVz;
  const C = dX * dX + dY * dY + dZ * dZ - Dc * Dc;
  const rad = B * B - A * C;
  if (rad < 0) return NEVER; // they pass each other
  const dt = -(B + Math.sqrt(rad)) / A;
  return dt >= 0 ? t0 + dt : t0;
}

/**
 * Predicts the next collision between particles i and j (Particle3D.predCol, hard
 * spheres). Writes the absolute time and, in periodic arenas, which image of j is hit
 * (`side`: a combination of Wall.LEFT, Wall.BOTTOM and Wall.BACK for the x, y and z
 * images) into `out`, and sets `out.type` to PARTICLE. Leaves part1/part2 to the caller.
 */
export function predictPair3D(
  p: Particles,
  i: number,
  j: number,
  arena: Arena,
  out: EventInfo,
): EventInfo {
  const ti = p.t0[i]!;
  const tj = p.t0[j]!;
  let currTime: number;
  let dX: number;
  let dY: number;
  let dZ: number;
  // Compare the two at the later of their t0s, so the prediction is never in the past.
  if (ti > tj) {
    currTime = ti;
    const dt = currTime - tj;
    dX = p.x[i]! - (p.x[j]! + p.vx[j]! * dt);
    dY = p.y[i]! - (p.y[j]! + p.vy[j]! * dt);
    dZ = p.z[i]! - (p.z[j]! + p.vz[j]! * dt);
  } else {
    currTime = tj;
    const dt = currTime - ti;
    dX = p.x[i]! + p.vx[i]! * dt - p.x[j]!;
    dY = p.y[i]! + p.vy[i]! * dt - p.y[j]!;
    dZ = p.z[i]! + p.vz[i]! * dt - p.z[j]!;
  }
  const dVx = p.vx[i]! - p.vx[j]!;
  const dVy = p.vy[i]! - p.vy[j]!;
  const dVz = p.vz[i]! - p.vz[j]!;
  const Dc = p.radius[i]! + p.radius[j]!;

  out.type = PARTICLE;
  out.time = predCol3D(dX, dY, dZ, dVx, dVy, dVz, Dc, currTime);
  out.side = 0;

  if (arena.type === PERIODIC) {
    // Check j's images across any boundary that exactly one of the two overlaps; the
    // soonest wins, ties going to the earlier image (normal, x, y, z, xy, xz, yz, xyz).
    const fi = p.bFlag[i]!;
    const fj = p.bFlag[j]!;
    const checkX = ((fi & LEFT) ^ (fj & LEFT)) === LEFT;
    const checkY = ((fi & BOTTOM) ^ (fj & BOTTOM)) === BOTTOM;
    const checkZ = ((fi & BACK) ^ (fj & BACK)) === BACK;
    if (checkX || checkY || checkZ) {
      const xAdj = checkX ? ((fi & LEFT) === LEFT ? arena.xSize : -arena.xSize) : 0;
      const yAdj = checkY ? ((fi & BOTTOM) === BOTTOM ? arena.ySize : -arena.ySize) : 0;
      const zAdj = checkZ ? ((fi & BACK) === BACK ? arena.zSize : -arena.zSize) : 0;
      const image = (sx: boolean, sy: boolean, sz: boolean, side: number) => {
        const t = predCol3D(
          sx ? dX + xAdj : dX,
          sy ? dY + yAdj : dY,
          sz ? dZ + zAdj : dZ,
          dVx,
          dVy,
          dVz,
          Dc,
          currTime,
        );
        if (t < out.time) {
          out.time = t;
          out.side = side;
        }
      };
      if (checkX) image(true, false, false, LEFT);
      if (checkY) image(false, true, false, BOTTOM);
      if (checkZ) image(false, false, true, BACK);
      if (checkX && checkY) image(true, true, false, LEFT | BOTTOM);
      if (checkX && checkZ) image(true, false, true, LEFT | BACK);
      if (checkY && checkZ) image(false, true, true, BOTTOM | BACK);
      if (checkX && checkY && checkZ) image(true, true, true, LEFT | BOTTOM | BACK);
    }
  }

  if (out.time < currTime) throw new Error('Particle-particle collision predicted in the past');
  return out;
}

/**
 * One axis of a boundary prediction: a wall in a reflecting arena, or entering
 * (BOUNDARY) or leaving (EOB) the overlap region of a periodic one. Writes into `out`
 * only if strictly sooner than what it holds (Java keeps the first of equal candidates).
 * A velocity component of zero yields a BOUNDARY event at MAX_TIME, as in Java.
 */
function predictAxis(
  pos: number,
  vel: number,
  radius: number,
  size: number,
  t0: number,
  periodic: boolean,
  overlapping: boolean,
  low: number,
  high: number,
  out: EventInfo,
  first: boolean,
): void {
  let type: number;
  let side: number;
  let time: number;
  if (vel === 0) {
    type = BOUNDARY;
    side = 0;
    time = NEVER;
  } else if (periodic && overlapping) {
    // overlapping the boundary: when does it stop overlapping?
    let colTime: number;
    if (vel < 0) {
      side = low;
      colTime = (pos + radius) / -vel;
    } else {
      side = high;
      colTime = (radius - pos) / vel;
    }
    type = EOB;
    time = t0 + colTime;
  } else {
    let colTime: number;
    if (vel < 0) {
      side = low;
      colTime = (radius - pos) / vel;
    } else {
      side = high;
      colTime = (size - radius - pos) / vel;
    }
    type = periodic ? BOUNDARY : WALL_EVENT;
    time = t0 + colTime;
  }
  if (first || time < out.time) {
    out.type = type as EventInfo['type'];
    out.side = side;
    out.time = time;
  }
}

/**
 * Predicts particle i's next boundary event (Particle3D.predBoundaryCol): a wall in a
 * reflecting arena, or entering (BOUNDARY) or leaving (EOB) the overlap region of a
 * periodic one; in divided arenas also the divider (BARRIER) and the spheres lining its
 * hole (EDGE, `side` = edge index). Candidates are checked in Java's order (x, y, z,
 * barrier, edges) and the first wins ties. `holeOpen` only matters for Maxwell's demon.
 * Piston arenas add the piston after the walls, as in 2D.
 */
export function predictBoundary3D(
  p: Particles,
  i: number,
  arena: Arena,
  out: EventInfo,
  holeOpen = false,
  piston: Piston | null = null,
): EventInfo {
  const t0 = p.t0[i]!;
  const x = p.x[i]!;
  const y = p.y[i]!;
  const z = p.z[i]!;
  const xVel = p.vx[i]!;
  const yVel = p.vy[i]!;
  const zVel = p.vz[i]!;
  const radius = p.radius[i]!;
  const periodic = arena.type === PERIODIC;
  const flags = p.bFlag[i]!;

  predictAxis(x, xVel, radius, arena.xSize, t0, periodic, (flags & LEFT) === LEFT, LEFT, RIGHT, out, true); // prettier-ignore
  predictAxis(y, yVel, radius, arena.ySize, t0, periodic, (flags & BOTTOM) === BOTTOM, BOTTOM, TOP, out, false); // prettier-ignore
  predictAxis(z, zVel, radius, arena.zSize, t0, periodic, (flags & BACK) === BACK, BACK, FRONT, out, false); // prettier-ignore

  const type = arena.type;
  if (type === PISTON_ARENA && piston) {
    const t = predictPiston3D(t0, y, yVel, radius, piston);
    if (t < out.time) {
      out.type = PISTON;
      out.side = BOTTOM;
      out.time = t;
    }
  } else if (type === DIVIDED || type === WITH_HOLE) {
    // Approaching the divider from either side?
    let side = -1;
    let colTime = 0;
    const barrierLeftX = arena.barrierLeftX;
    const barrierRightX = arena.barrierRightX;
    if (x <= barrierLeftX - radius && xVel > 0) {
      side = LEFT;
      colTime = (barrierLeftX - radius - x) / xVel;
    } else if (x >= barrierRightX + radius && xVel < 0) {
      side = RIGHT;
      colTime = (barrierRightX + radius - x) / xVel;
    }

    if (type === WITH_HOLE && (!arena.maxwellDemonMode || holeOpen)) {
      // The barrier only where it isn't the hole, then the ring of edge spheres.
      if (side !== -1) {
        const yPos = y + yVel * colTime - 0.5 * arena.ySize;
        const zPos = z + zVel * colTime - 0.5 * arena.zSize;
        if (yPos * yPos + zPos * zPos > arena.holeRadiusSquared && t0 + colTime < out.time) {
          out.type = BARRIER;
          out.side = side;
          out.time = t0 + colTime;
        }
      }
      const Dc = radius + arena.edgeRadius;
      const edgeX = arena.edgeX;
      const edgeY = arena.edgeY;
      const edgeZ = arena.edgeZ;
      for (let edge = 0; edge < edgeY.length; edge++) {
        const t = predCol3D(x - edgeX, y - edgeY[edge]!, z - edgeZ[edge]!, xVel, yVel, zVel, Dc, t0); // prettier-ignore
        if (t < out.time) {
          out.type = EDGE;
          out.side = edge;
          out.time = t;
        }
      }
    } else if (side !== -1 && t0 + colTime < out.time) {
      // No hole (or the demon has it closed): the divider is solid.
      out.type = BARRIER;
      out.side = side;
      out.time = t0 + colTime;
    }
  }

  if (out.time < t0) throw new Error('Boundary collision predicted in the past');
  return out;
}

/**
 * When a sphere at height y (at t0) moving at yVel first touches the piston's underside
 * (Particle3D.predPistonCol): only y matters. If the piston is moving now but will have
 * stopped by then, and the particle is heading up, it's predicted again against the
 * stopped piston.
 */
function predictPiston3D(
  t0: number,
  y: number,
  yVel: number,
  radius: number,
  piston: Piston,
): number {
  let colTime = predCol3D(
    0.0,
    y - piston.positionAtTime(t0),
    0.0,
    0.0,
    yVel - piston.velocityAtTime(t0),
    0.0,
    radius,
    t0,
  );
  if (piston.isMoving(t0) && !piston.isMoving(colTime) && yVel > 0) {
    colTime = predCol3D(0.0, y - piston.stopPosition(), 0.0, 0.0, yVel, 0.0, radius, t0);
  }
  return colTime;
}

/**
 * Unit vectors B and C completing the unit vector A to an orthonormal basis, with B
 * along the part of (dVx, dVy, dVz) across A (Particle3D.collideWith/EdgeCollide). When
 * that part is tiny, B is built from the axis least aligned with A instead. Writes
 * [Bx, By, Bz, Cx, Cy, Cz] into `basis`.
 */
function completeBasis(
  Ax: number,
  Ay: number,
  Az: number,
  dVx: number,
  dVy: number,
  dVz: number,
  basis: Float64Array,
): void {
  let Dot = dVx * Ax + dVy * Ay + dVz * Az;
  let Tx = dVx - Ax * Dot;
  let Ty = dVy - Ay * Dot;
  let Tz = dVz - Az * Dot;
  let Norm = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz);
  if (Norm < 1e-10) {
    dVx = dVy = dVz = 0;
    Tx = Math.abs(Ax);
    Ty = Math.abs(Ay);
    Tz = Math.abs(Az);
    if (Tx <= Ty && Tx <= Tz) dVx = 1;
    else if (Ty <= Tx && Ty <= Tz) dVy = 1;
    else dVz = 1;
    Dot = dVx * Ax + dVy * Ay + dVz * Az;
    Tx = dVx - Ax * Dot;
    Ty = dVy - Ay * Dot;
    Tz = dVz - Az * Dot;
    Norm = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz);
  }
  const Bx = Tx / Norm;
  const By = Ty / Norm;
  const Bz = Tz / Norm;
  basis[0] = Bx;
  basis[1] = By;
  basis[2] = Bz;
  basis[3] = Ay * Bz - Az * By;
  basis[4] = Az * Bx - Ax * Bz;
  basis[5] = Ax * By - Ay * Bx;
}
const basis = new Float64Array(6);

/**
 * Elastic collision between particles `i` (Java's `this`, the event's part1) and `j`,
 * at `event.time` (Particle3D.collideWith, hard spheres). In periodic arenas,
 * `event.side` says which image of j is hit.
 */
export function collide3D(
  p: Particles,
  i: number,
  j: number,
  event: EventInfo,
  arena: Arena,
  _wellEnergy = 0.0, // no wells in 3D yet; keeps collide2D's signature
  reactions: ReactionTable | null = null,
): void {
  const time = event.time;
  const dt1 = time - p.t0[i]!;
  const dt2 = time - p.t0[j]!;
  const x1 = p.x[i]! + p.vx[i]! * dt1;
  const y1 = p.y[i]! + p.vy[i]! * dt1;
  const z1 = p.z[i]! + p.vz[i]! * dt1;
  const x2 = p.x[j]! + p.vx[j]! * dt2;
  const y2 = p.y[j]! + p.vy[j]! * dt2;
  const z2 = p.z[j]! + p.vz[j]! * dt2;
  p.x[i] = x1;
  p.y[i] = y1;
  p.z[i] = z1;
  p.x[j] = x2;
  p.y[j] = y2;
  p.z[j] = z2;

  let dX = x2 - x1;
  let dY = y2 - y1;
  let dZ = z2 - z1;
  if (arena.type === PERIODIC) {
    const fi = p.bFlag[i]!;
    if ((event.side & LEFT) === LEFT) {
      if ((fi & LEFT) === LEFT) dX -= arena.xSize;
      else dX += arena.xSize;
    }
    if ((event.side & BOTTOM) === BOTTOM) {
      if ((fi & BOTTOM) === BOTTOM) dY -= arena.ySize;
      else dY += arena.ySize;
    }
    if ((event.side & BACK) === BACK) {
      if ((fi & BACK) === BACK) dZ -= arena.zSize;
      else dZ += arena.zSize;
    }
  }

  // Work in an orthonormal basis A (along the line between the centres), B and C; only
  // the A components change. The actual centre distance is used rather than r1 + r2 to
  // avoid amplifying round-off.
  const realDc = Math.sqrt(dX * dX + dY * dY + dZ * dZ);
  const Ax = dX / realDc;
  const Ay = dY / realDc;
  const Az = dZ / realDc;

  const xVel = p.vx[i]!;
  const yVel = p.vy[i]!;
  const zVel = p.vz[i]!;
  const targetXVel = p.vx[j]!;
  const targetYVel = p.vy[j]!;
  const targetZVel = p.vz[j]!;
  completeBasis(Ax, Ay, Az, targetXVel - xVel, targetYVel - yVel, targetZVel - zVel, basis);
  const Bx = basis[0]!;
  const By = basis[1]!;
  const Bz = basis[2]!;
  const Cx = basis[3]!;
  const Cy = basis[4]!;
  const Cz = basis[5]!;

  const V1a = xVel * Ax + yVel * Ay + zVel * Az;
  const V1b = xVel * Bx + yVel * By + zVel * Bz;
  const V1c = xVel * Cx + yVel * Cy + zVel * Cz;
  const V2a = targetXVel * Ax + targetYVel * Ay + targetZVel * Az;
  const V2b = targetXVel * Bx + targetYVel * By + targetZVel * Bz;
  const V2c = targetXVel * Cx + targetYVel * Cy + targetZVel * Cz;

  const mass = p.mass[i]!;
  const targetMass = p.mass[j]!;
  // Reactions (a web-port addition: Java has none in 3D), as in collide2D.
  const deltaE = reactions
    ? reactions.react(p, i, j, relativeEnergy(mass, targetMass, V1a, V2a))
    : 0;
  let nV1a: number;
  let nV2a: number;
  if (deltaE !== 0) {
    const reducedMass = (mass * targetMass) / (mass + targetMass);
    const relativeVelocity = V1a - V2a;
    const rootVal = Math.sqrt(relativeVelocity * relativeVelocity - (2 * deltaE) / reducedMass);
    const t = mass * V1a + targetMass * V2a;
    nV1a = (t - targetMass * rootVal) / (mass + targetMass);
    nV2a = (t + mass * rootVal) / (mass + targetMass);
  } else {
    nV1a = (2 * targetMass * V2a + (mass - targetMass) * V1a) / (mass + targetMass);
    nV2a = (2 * mass * V1a + (targetMass - mass) * V2a) / (mass + targetMass);
  }

  p.vx[i] = Ax * nV1a + Bx * V1b + Cx * V1c;
  p.vy[i] = Ay * nV1a + By * V1b + Cy * V1c;
  p.vz[i] = Az * nV1a + Bz * V1b + Cz * V1c;
  p.vx[j] = Ax * nV2a + Bx * V2b + Cx * V2c;
  p.vy[j] = Ay * nV2a + By * V2b + Cy * V2c;
  p.vz[j] = Az * nV2a + Bz * V2b + Cz * V2c;

  p.cumTime[i] = 0;
  p.cumTime[j] = 0;
  p.t0[i] = time;
  p.t0[j] = time;
}

/**
 * Performs particle i's boundary event (Particle3D.boundaryCollide): reflection off a
 * wall, the divider or an edge sphere, or entering/leaving a periodic overlap region
 * (which moves the particle to the matching position on the other side and updates its
 * flags).
 *
 * With an active thermostat, reflections off the walls and a stopped piston scale the
 * normal velocity (the divider doesn't, unlike 2D, as in Java), and the thermostat tracks
 * every boundary event's change in kinetic energy. A moving piston reflects in its own
 * frame: v' = 2·v_piston − v.
 */
export function boundaryCollide3D(
  p: Particles,
  i: number,
  event: EventInfo,
  arena: Arena,
  piston: Piston | null = null,
  thermostat: Thermostat | null = null,
): void {
  const dt = event.time - p.t0[i]!;
  p.cumTime[i] = p.cumTime[i]! + dt;
  p.t0[i] = event.time;
  const radius = p.radius[i]!;
  const tracking = thermostat !== null && thermostat.enabled;
  const oldKE = tracking ? particleKE3D(p, i) : 0.0;
  // 1.0 unless the thermostat is active; x · 1.0 is exact, so plain bounces are unchanged.
  const velAdjust = tracking ? thermostat.calcModifier(event.type, event.side, p, i) : 1.0;
  // Move along the two axes the event doesn't set.
  const moveYZ = () => {
    p.y[i] = p.y[i]! + p.vy[i]! * dt;
    p.z[i] = p.z[i]! + p.vz[i]! * dt;
  };
  const moveXZ = () => {
    p.x[i] = p.x[i]! + p.vx[i]! * dt;
    p.z[i] = p.z[i]! + p.vz[i]! * dt;
  };
  const moveXY = () => {
    p.x[i] = p.x[i]! + p.vx[i]! * dt;
    p.y[i] = p.y[i]! + p.vy[i]! * dt;
  };

  switch (event.type) {
    case WALL_EVENT:
      switch (event.side) {
        case LEFT:
          p.x[i] = radius;
          moveYZ();
          p.vx[i] = -p.vx[i]! * velAdjust;
          break;
        case RIGHT:
          p.x[i] = arena.xSize - radius;
          moveYZ();
          p.vx[i] = -p.vx[i]! * velAdjust;
          break;
        case BOTTOM:
          p.y[i] = radius;
          moveXZ();
          p.vy[i] = -p.vy[i]! * velAdjust;
          keepOutOfDivider(p, i, arena, radius);
          break;
        case TOP:
          p.y[i] = arena.ySize - radius;
          moveXZ();
          p.vy[i] = -p.vy[i]! * velAdjust;
          keepOutOfDivider(p, i, arena, radius);
          break;
        case BACK:
          p.z[i] = radius;
          moveXY();
          p.vz[i] = -p.vz[i]! * velAdjust;
          keepOutOfDivider(p, i, arena, radius);
          break;
        case FRONT:
          p.z[i] = arena.zSize - radius;
          moveXY();
          p.vz[i] = -p.vz[i]! * velAdjust;
          keepOutOfDivider(p, i, arena, radius);
          break;
      }
      break;
    case BARRIER:
      if (event.side === LEFT) {
        p.x[i] = arena.barrierLeftX - radius;
        moveYZ();
        p.vx[i] = -p.vx[i]!;
      } else if (event.side === RIGHT) {
        p.x[i] = arena.barrierRightX + radius;
        moveYZ();
        p.vx[i] = -p.vx[i]!;
      }
      break;
    case PISTON:
      p.y[i] = p.y[i]! + p.vy[i]! * dt;
      p.x[i] = p.x[i]! + p.vx[i]! * dt;
      p.z[i] = p.z[i]! + p.vz[i]! * dt;
      if (piston!.isMoving(event.time)) {
        p.vy[i] = 2.0 * piston!.velocity() - p.vy[i]!;
      } else {
        p.vy[i] = -p.vy[i]! * velAdjust;
      }
      break;
    case EDGE:
      p.x[i] = p.x[i]! + p.vx[i]! * dt;
      moveYZ();
      edgeCollide(p, i, arena.edgeX, arena.edgeY[event.side]!, arena.edgeZ[event.side]!);
      break;
    case BOUNDARY:
      switch (event.side) {
        case LEFT:
          p.x[i] = radius;
          moveYZ();
          p.bFlag[i] = p.bFlag[i]! | LEFT;
          break;
        case RIGHT:
          p.x[i] = -radius;
          moveYZ();
          p.bFlag[i] = p.bFlag[i]! | LEFT;
          break;
        case BOTTOM:
          p.y[i] = radius;
          moveXZ();
          p.bFlag[i] = p.bFlag[i]! | BOTTOM;
          break;
        case TOP:
          p.y[i] = -radius;
          moveXZ();
          p.bFlag[i] = p.bFlag[i]! | BOTTOM;
          break;
        case BACK:
          p.z[i] = radius;
          moveXY();
          p.bFlag[i] = p.bFlag[i]! | BACK;
          break;
        case FRONT:
          p.z[i] = -radius;
          moveXY();
          p.bFlag[i] = p.bFlag[i]! | BACK;
          break;
      }
      break;
    case EOB:
      switch (event.side) {
        case LEFT:
          p.x[i] = arena.xSize - radius;
          moveYZ();
          p.bFlag[i] = p.bFlag[i]! & ~LEFT;
          break;
        case RIGHT:
          p.x[i] = radius;
          moveYZ();
          p.bFlag[i] = p.bFlag[i]! & ~LEFT;
          break;
        case BOTTOM:
          p.y[i] = arena.ySize - radius;
          moveXZ();
          p.bFlag[i] = p.bFlag[i]! & ~BOTTOM;
          break;
        case TOP:
          p.y[i] = radius;
          moveXZ();
          p.bFlag[i] = p.bFlag[i]! & ~BOTTOM;
          break;
        case BACK:
          p.z[i] = arena.zSize - radius;
          moveXY();
          p.bFlag[i] = p.bFlag[i]! & ~BACK;
          break;
        case FRONT:
          p.z[i] = radius;
          moveXY();
          p.bFlag[i] = p.bFlag[i]! & ~BACK;
          break;
      }
      break;
    default:
      throw new Error(`Unsupported boundary event type ${event.type} in 3D`);
  }

  if (tracking) {
    const deltaKE = particleKE3D(p, i) - oldKE;
    if (deltaKE !== 0.0) thermostat.adjustKE(deltaKE);
  }
}

/**
 * After a bounce off a wall parallel to the x axis in a divided arena, round-off can
 * leave a particle that hit the corner overlapping the divider; push it back out.
 */
function keepOutOfDivider(p: Particles, i: number, arena: Arena, radius: number): void {
  if (arena.type !== DIVIDED && arena.type !== WITH_HOLE) return;
  const x = p.x[i]!;
  const xVel = p.vx[i]!;
  const inside = x >= arena.barrierLeftX - radius && x <= arena.barrierRightX + radius;
  if (xVel > 0 && inside) {
    p.x[i] = arena.barrierLeftX - radius;
    p.vx[i] = -xVel;
  } else if (xVel < 0 && inside) {
    p.x[i] = arena.barrierRightX + radius;
    p.vx[i] = -xVel;
  }
}

/**
 * Bounce off an edge sphere of infinite mass at (edgeX, edgeY, edgeZ): reverse the
 * velocity component along the line between the centres (Particle3D.EdgeCollide).
 */
function edgeCollide(p: Particles, i: number, edgeX: number, edgeY: number, edgeZ: number): void {
  const dX = edgeX - p.x[i]!;
  const dY = edgeY - p.y[i]!;
  const dZ = edgeZ - p.z[i]!;
  const realDc = Math.sqrt(dX * dX + dY * dY + dZ * dZ);
  const Ax = dX / realDc;
  const Ay = dY / realDc;
  const Az = dZ / realDc;
  const xVel = p.vx[i]!;
  const yVel = p.vy[i]!;
  const zVel = p.vz[i]!;
  completeBasis(Ax, Ay, Az, xVel, yVel, zVel, basis);
  const Bx = basis[0]!;
  const By = basis[1]!;
  const Bz = basis[2]!;
  const Cx = basis[3]!;
  const Cy = basis[4]!;
  const Cz = basis[5]!;
  const V1a = xVel * Ax + yVel * Ay + zVel * Az;
  const V1b = xVel * Bx + yVel * By + zVel * Bz;
  const V1c = xVel * Cx + yVel * Cy + zVel * Cz;
  const nV1a = -V1a;
  p.vx[i] = Ax * nV1a + Bx * V1b + Cx * V1c;
  p.vy[i] = Ay * nV1a + By * V1b + Cy * V1c;
  p.vz[i] = Az * nV1a + Bz * V1b + Cz * V1c;
}
