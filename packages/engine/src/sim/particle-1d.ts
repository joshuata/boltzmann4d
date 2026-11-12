// 1D particle motion, event prediction and collisions (port of Particle1D.java).
//
// Particles move along x only; y and vy stay 0. Scope: hard rods in reflecting, periodic
// and divided arenas, with square wells and reactions. The hole is 2D and 3D only (SIM-15;
// Java's 1D treats a holed divider as solid) and the piston isn't ported for 1D yet.
//
// Two Java quirks are kept for parity:
// - Square-well events are predicted in every non-periodic 1D arena, wells on or not. With
//   wells off Java's interaction multiplier is −1, so the "well" is the contact distance:
//   a pair that starts overlapping gets an EXIT_WELL when it separates to contact, which
//   recomputes both velocities with a zero well depth.
// - A pair that can't climb out of its well is recorded as ENTER_WELL (2D and 3D use
//   WELL_REFLECT). It predicts the same way.
//
// Two Java bugs are fixed (joshuata/boltzmann4d#24):
// - Java adds the two well depths in kJ/mol without converting them to amu·m²/s² as 2D
//   and 3D do, so its 1D wells are about 10⁶ times too shallow. The depth comes converted
//   from Simulation here, as in 2D, so there are no parity fixtures with 1D wells.
// - Java's collision works with the raw velocities, which in the reaction branch assumes
//   `this` is the left particle, so a reacting pair whose first particle is on the right
//   passes through itself. This works along the line from i to j (±x) instead, as 2D and
//   3D do. Negating both velocities negates the elastic and well results exactly, so
//   those stay bit-identical to Java.
//
// The arithmetic keeps Java's order of operations, since parity depends on it.
import { Collision, MAX_TIME, MIN_TIME, Wall, type EventInfo } from './event';
import type { Arena, Particles } from './particles';
import { relativeEnergy, type ReactionTable } from './reactions';
import { ArenaType } from './simulation-info';

const NEVER = MAX_TIME;
const { PARTICLE, WALL: WALL_EVENT, BOUNDARY, EOB, BARRIER } = Collision;
const { ENTER_WELL, EXIT_WELL } = Collision;
const { LEFT, RIGHT } = Wall;
const PERIODIC = ArenaType.PERIODIC_BOUNDARIES;
const DIVIDED = ArenaType.DIVIDED_ARENA;
const WITH_HOLE = ArenaType.DIVIDED_ARENA_WITH_HOLE;

/**
 * Pins a newly placed particle to the line (y = 0) and, in periodic arenas, wraps it into
 * the arena and sets its boundary flag (from the Particle1D constructor).
 */
export function initPeriodicFlags1D(p: Particles, i: number, arena: Arena): void {
  p.y[i] = 0.0;
  p.z[i] = 0.0;
  p.vy[i] = 0.0;
  p.vz[i] = 0.0;
  if (arena.type !== PERIODIC) return;
  const radius = p.radius[i]!;
  let x = p.x[i]!;
  let flags = 0;
  if (x < 0) x += arena.xSize;
  if (x < radius) {
    flags |= LEFT;
  } else if (arena.xSize - x < radius) {
    x -= arena.xSize;
    if (x < radius) flags |= LEFT;
  }
  p.x[i] = x;
  p.bFlag[i] = flags;
}

/** Moves a particle along its straight-line path to `time` (no collision checks). */
export function moveToTime1D(p: Particles, i: number, time: number): void {
  const dt = time - p.t0[i]!;
  p.x[i] = p.x[i]! + p.vx[i]! * dt;
  p.t0[i] = time;
  p.cumTime[i] = p.cumTime[i]! + dt;
}

/**
 * When two rods with separation dX and relative velocity dVx at `t0` first touch at centre
 * distance Dc (Particle1D.PredCol): the absolute time, or MAX_TIME if they never do.
 * Already-overlapping rods that approach collide at once.
 */
export function predCol1D(dX: number, dVx: number, Dc: number, t0: number): number {
  const B = dX * dVx;
  if (B >= 0) return NEVER; // not approaching
  const A = dVx * dVx;
  const C = dX * dX - Dc * Dc;
  const radical = B * B - A * C;
  if (radical < 0) return NEVER;
  const dt = -(B + Math.sqrt(radical)) / A;
  return dt >= 0 ? t0 + dt : t0;
}

/** When two approaching rods' centres first come within `wellRadius` (PredColEnterWell). */
function predEnterWell1D(dX: number, dVx: number, wellRadius: number, t0: number): number {
  const B = dX * dVx;
  if (B >= 0) return NEVER;
  const A = dVx * dVx;
  const C = dX * dX - wellRadius * wellRadius;
  const rad = B * B - A * C;
  if (rad < 0) return NEVER;
  const dt = -(B + Math.sqrt(rad)) / A;
  return dt >= 0 ? t0 + dt : NEVER;
}

/** When two rods' centres next move apart to `wellRadius` (PredColExitWell): the later root. */
function predExitWell1D(dX: number, dVx: number, wellRadius: number, t0: number): number {
  const B = dX * dVx;
  const A = dVx * dVx;
  const C = dX * dX - wellRadius * wellRadius;
  const rad = B * B - A * C;
  let dt = -(B + Math.sqrt(rad)) / A;
  const dt2 = -(B - Math.sqrt(rad)) / A;
  if (dt2 > dt) dt = dt2;
  return dt >= 0 ? t0 + dt : NEVER;
}

/**
 * Predicts the next event between particles i and j (Particle1D.predCol). `wellMultiplier`
 * is Java's radiusOfInteractionMultiplier: the wells' radius over the contact distance, or
 * −1 with wells off (see the file comment); 0 skips them. In periodic arenas `side` is
 * Wall.LEFT when the hit is with j's image across the boundary.
 */
export function predictPair1D(
  p: Particles,
  i: number,
  j: number,
  arena: Arena,
  out: EventInfo,
  wellMultiplier = 0,
  lastType: number = PARTICLE,
  lastTime: number = MIN_TIME,
): EventInfo {
  const ti = p.t0[i]!;
  const tj = p.t0[j]!;
  let currTime: number;
  let dX: number;
  if (ti > tj) {
    currTime = ti;
    dX = p.x[i]! - (p.x[j]! + p.vx[j]! * (currTime - tj));
  } else {
    currTime = tj;
    dX = p.x[i]! + p.vx[i]! * (currTime - ti) - p.x[j]!;
  }
  const dVx = p.vx[i]! - p.vx[j]!;
  const Dc = p.radius[i]! + p.radius[j]!;

  out.type = PARTICLE;
  out.time = predCol1D(dX, dVx, Dc, currTime);
  out.side = 0;

  if (arena.type !== PERIODIC) {
    if (wellMultiplier !== 0) {
      const wellRadius = Dc * wellMultiplier;
      const enter = predEnterWell1D(dX, dVx, wellRadius, currTime);
      const exit = predExitWell1D(dX, dVx, wellRadius, currTime);
      if (enter < out.time && lastType !== ENTER_WELL) {
        if (lastTime !== enter) {
          out.type = ENTER_WELL;
          out.time = enter;
        }
      } else if (exit < out.time && lastType !== EXIT_WELL) {
        if (lastTime !== exit) {
          out.type = EXIT_WELL;
          out.time = exit;
        }
      }
    }
  } else if (((p.bFlag[i]! & LEFT) ^ (p.bFlag[j]! & LEFT)) === LEFT) {
    // Exactly one of the two overlaps the boundary: also check j's image across it.
    const xAdj = (p.bFlag[i]! & LEFT) === LEFT ? arena.xSize : -arena.xSize;
    const t = predCol1D(dX + xAdj, dVx, Dc, currTime);
    if (t < out.time) {
      out.time = t;
      out.side = LEFT;
    }
  }

  if (out.time < currTime) throw new Error('Particle-particle collision predicted in the past');
  return out;
}

/**
 * Predicts particle i's next boundary event (Particle1D.predBoundaryCol): a wall, entering
 * (BOUNDARY) or leaving (EOB) a periodic arena's overlap region, or the divider (BARRIER),
 * which wins only if strictly sooner than the wall. At rest: a MAX_TIME event.
 */
export function predictBoundary1D(
  p: Particles,
  i: number,
  arena: Arena,
  out: EventInfo,
): EventInfo {
  const t0 = p.t0[i]!;
  const x = p.x[i]!;
  const xVel = p.vx[i]!;
  const radius = p.radius[i]!;
  let colTime: number;

  if (arena.type === PERIODIC) {
    out.type = xVel === 0 || (p.bFlag[i]! & LEFT) !== LEFT ? BOUNDARY : EOB;
    if (xVel === 0) {
      out.time = NEVER;
      out.side = 0;
    } else if (out.type === EOB) {
      if (xVel < 0) {
        out.side = LEFT;
        colTime = (x + radius) / -xVel;
      } else {
        out.side = RIGHT;
        colTime = (radius - x) / xVel;
      }
      out.time = t0 + colTime;
    } else {
      if (xVel < 0) {
        out.side = LEFT;
        colTime = (radius - x) / xVel;
      } else {
        out.side = RIGHT;
        colTime = (arena.xSize - radius - x) / xVel;
      }
      out.time = t0 + colTime;
    }
  } else if (xVel === 0) {
    out.type = WALL_EVENT;
    out.time = NEVER;
    out.side = 0;
  } else {
    if (xVel < 0) {
      out.side = LEFT;
      colTime = (radius - x) / xVel;
    } else {
      out.side = RIGHT;
      colTime = (arena.xSize - radius - x) / xVel;
    }
    out.type = WALL_EVENT;
    out.time = t0 + colTime;
    if (arena.type === DIVIDED || arena.type === WITH_HOLE) {
      let side = -1;
      if (x <= arena.barrierLeftX - radius && xVel > 0) {
        side = LEFT;
        colTime = (arena.barrierLeftX - radius - x) / xVel;
      } else if (x >= arena.barrierRightX + radius && xVel < 0) {
        side = RIGHT;
        colTime = (arena.barrierRightX + radius - x) / xVel;
      }
      if (side !== -1 && t0 + colTime < out.time) {
        out.type = BARRIER;
        out.side = side;
        out.time = t0 + colTime;
      }
    }
  }

  if (out.time < t0) throw new Error('Boundary collision predicted in the past');
  return out;
}

/**
 * Collision between particles `i` (the event's part1) and `j` at `event.time`
 * (Particle1D.collideWith): elastic, a square-well event, or a reaction. Returns the event
 * performed: an EXIT_WELL without the energy to leave comes back as ENTER_WELL, as in
 * Java's 1D.
 */
export function collide1D(
  p: Particles,
  i: number,
  j: number,
  event: EventInfo,
  arena: Arena,
  wellEnergy = 0.0,
  reactions: ReactionTable | null = null,
): number {
  const time = event.time;
  const dt1 = time - p.t0[i]!;
  const dt2 = time - p.t0[j]!;
  const x1 = p.x[i]! + p.vx[i]! * dt1;
  const x2 = p.x[j]! + p.vx[j]! * dt2;
  p.x[i] = x1;
  p.x[j] = x2;

  // The line of centres, from i to j: +1 or −1 (see the file comment).
  let dX = x2 - x1;
  if (arena.type === PERIODIC && (event.side & LEFT) === LEFT) {
    if ((p.bFlag[i]! & LEFT) === LEFT) dX -= arena.xSize;
    else dX += arena.xSize;
  }
  const A = dX < 0 ? -1 : 1;
  const V1a = p.vx[i]! * A;
  const V2a = p.vx[j]! * A;

  const mass = p.mass[i]!;
  const targetMass = p.mass[j]!;
  let type = event.type as number;
  let nV1a: number;
  let nV2a: number;

  let deltaE = 0;
  if (reactions && type === PARTICLE) {
    deltaE = reactions.react(p, i, j, relativeEnergy(mass, targetMass, V1a, V2a));
  }

  if (deltaE !== 0) {
    const reducedMass = (mass * targetMass) / (mass + targetMass);
    const relativeVelocity = V1a - V2a;
    const rootVal = Math.sqrt(relativeVelocity * relativeVelocity - (2 * deltaE) / reducedMass);
    const t = mass * V1a + targetMass * V2a;
    nV1a = (t - targetMass * rootVal) / (mass + targetMass);
    nV2a = (t + mass * rootVal) / (mass + targetMass);
  } else if (type === PARTICLE) {
    nV1a = (2 * targetMass * V2a + (mass - targetMass) * V1a) / (mass + targetMass);
    nV2a = (2 * mass * V1a + (targetMass - mass) * V2a) / (mass + targetMass);
  } else {
    // Square well: the relative speed becomes sqrt(Δv² ± E/μ), keeping the momentum (as
    // in 2D, E/μ rather than 2E/μ; joshuata/boltzmann4d#24).
    const combinedMass = mass + targetMass;
    const reducedMass = (mass * targetMass) / combinedMass;
    const momentumTotal = mass * V1a + targetMass * V2a;
    const velocityDifference = V2a - V1a;
    const underRadical =
      type === ENTER_WELL
        ? velocityDifference * velocityDifference + wellEnergy / reducedMass
        : velocityDifference * velocityDifference - wellEnergy / reducedMass;
    if (type === EXIT_WELL && underRadical < 0.0) {
      // Not enough energy to climb out: bounce off the well's edge and stay inside.
      nV1a = (2 * targetMass * V2a + (mass - targetMass) * V1a) / combinedMass;
      nV2a = (2 * mass * V1a + (targetMass - mass) * V2a) / combinedMass;
      type = ENTER_WELL;
    } else {
      const rootFactor = Math.sqrt(underRadical);
      let rootFactor1 = rootFactor;
      let rootFactor2 = rootFactor;
      if (V1a < V2a) rootFactor1 = -rootFactor1;
      else rootFactor2 = -rootFactor2;
      nV1a = (momentumTotal + targetMass * rootFactor1) / combinedMass;
      nV2a = (momentumTotal + mass * rootFactor2) / combinedMass;
    }
  }

  p.vx[i] = nV1a * A;
  p.vx[j] = nV2a * A;
  p.cumTime[i] = 0;
  p.cumTime[j] = 0;
  p.t0[i] = time;
  p.t0[j] = time;
  return type;
}

/**
 * Performs particle i's boundary event (Particle1D.boundaryCollide): reflection off a wall
 * or the divider, or entering or leaving a periodic overlap region (which moves the
 * particle to the matching position on the other side and updates its flag).
 */
export function boundaryCollide1D(p: Particles, i: number, event: EventInfo, arena: Arena): void {
  const dt = event.time - p.t0[i]!;
  p.cumTime[i] = p.cumTime[i]! + dt;
  p.t0[i] = event.time;
  const radius = p.radius[i]!;

  switch (event.type) {
    case WALL_EVENT:
      p.x[i] = event.side === LEFT ? radius : arena.xSize - radius;
      p.vx[i] = -p.vx[i]!;
      break;
    case BARRIER:
      p.x[i] = event.side === LEFT ? arena.barrierLeftX - radius : arena.barrierRightX + radius;
      p.vx[i] = -p.vx[i]!;
      break;
    case BOUNDARY:
      p.x[i] = event.side === LEFT ? radius : -radius;
      p.bFlag[i] = p.bFlag[i]! | LEFT;
      break;
    case EOB:
      p.x[i] = event.side === LEFT ? arena.xSize - radius : radius;
      p.bFlag[i] = p.bFlag[i]! & ~LEFT;
      break;
    default:
      throw new Error(`Unsupported boundary event type ${event.type} in 1D`);
  }
}
