// 2D particle motion, event prediction and collisions (port of Particle2D.java).
//
// Scope: hard spheres in reflecting, periodic, divided and holed arenas (Maxwell's demon
// gate), and the movable piston with its wall thermostat. Square wells and the attractive
// wall come in later steps; the conducting divider lives in Simulation.
//
// The arithmetic in prediction and collision code keeps Java's order of operations,
// since parity with the Java app depends on bit-identical results. `!` on typed-array
// reads is deliberate: indices are always in range and it adds no runtime check.
import { Collision, MAX_TIME, MIN_TIME, Wall, type EventInfo } from './event';
import type { AttractiveWall } from './attractive-wall';
import type { Arena, Particles } from './particles';
import type { Piston } from './piston';
import { relativeEnergy, type ReactionTable } from './reactions';
import { ArenaType } from './simulation-info';
import { particleKE2D, type Thermostat } from './thermostat';

// Local copies of imported constants for the hot paths (see plan 0002).
const NEVER = MAX_TIME;
const { PARTICLE, WALL: WALL_EVENT, BOUNDARY, EOB, BARRIER, EDGE, PISTON } = Collision;
const { ENTER_WELL, EXIT_WELL, WELL_REFLECT, ENTER_GRAVITY_WELL, EXIT_GRAVITY_WELL } = Collision;
const { LEFT, RIGHT, BOTTOM, TOP } = Wall;
const PERIODIC = ArenaType.PERIODIC_BOUNDARIES;
const DIVIDED = ArenaType.DIVIDED_ARENA;
const WITH_HOLE = ArenaType.DIVIDED_ARENA_WITH_HOLE;
const PISTON_ARENA = ArenaType.MOVABLE_PISTON;

/**
 * Periodic arenas: wraps a newly placed particle into the arena and sets its boundary
 * flags (from the Particle2D constructor). A particle overlapping the right or top edge
 * is moved to the matching position below zero, so overlapping particles always sit on
 * the low side.
 */
export function initPeriodicFlags2D(p: Particles, i: number, arena: Arena): void {
  if (arena.type !== PERIODIC) return;
  const radius = p.radius[i]!;
  let x = p.x[i]!;
  let y = p.y[i]!;
  let flags = 0;
  if (x < 0) x += arena.xSize;
  if (y < 0) y += arena.ySize;
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
  p.x[i] = x;
  p.y[i] = y;
  p.bFlag[i] = flags;
}

/** Moves a particle along its straight-line path to `time` (no collision checks). */
export function moveToTime2D(p: Particles, i: number, time: number): void {
  const dt = time - p.t0[i]!;
  p.x[i] = p.x[i]! + p.vx[i]! * dt;
  p.y[i] = p.y[i]! + p.vy[i]! * dt;
  p.t0[i] = time;
  p.cumTime[i] = p.cumTime[i]! + dt;
}

/**
 * When two discs with relative position (dX, dY) and relative velocity (dVx, dVy) at time
 * `t0` first touch at centre distance Dc: their absolute collision time, or MAX_TIME if
 * they never do. Already-overlapping discs that approach collide at once.
 */
export function predCol2D(
  dX: number,
  dY: number,
  dVx: number,
  dVy: number,
  Dc: number,
  t0: number,
): number {
  const B = dX * dVx + dY * dVy;
  if (B >= 0) return NEVER; // not approaching
  const A = dVx * dVx + dVy * dVy;
  const C = dX * dX + dY * dY - Dc * Dc;
  const rad = B * B - A * C;
  if (rad < 0) return NEVER; // they pass each other
  const dt = -(B + Math.sqrt(rad)) / A;
  return dt >= 0 ? t0 + dt : t0;
}

/** When two approaching particles' centres first come within `wellRadius` (PredColEnterWell). */
function predEnterWell2D(
  dX: number,
  dY: number,
  dVx: number,
  dVy: number,
  wellRadius: number,
  t0: number,
): number {
  const B = dX * dVx + dY * dVy;
  if (B >= 0) return NEVER;
  const A = dVx * dVx + dVy * dVy;
  const C = dX * dX + dY * dY - wellRadius * wellRadius;
  const rad = B * B - A * C;
  if (rad < 0) return NEVER;
  const dt = -(B + Math.sqrt(rad)) / A;
  return dt >= 0 ? t0 + dt : NEVER;
}

/**
 * When two particles' centres next move apart to `wellRadius` (PredColExitWell): the
 * later root. Never if they don't (no real root gives NaN, which fails the test).
 */
function predExitWell2D(
  dX: number,
  dY: number,
  dVx: number,
  dVy: number,
  wellRadius: number,
  t0: number,
): number {
  const B = dX * dVx + dY * dVy;
  const A = dVx * dVx + dVy * dVy;
  const C = dX * dX + dY * dY - wellRadius * wellRadius;
  const rad = B * B - A * C;
  let dt = -(B + Math.sqrt(rad)) / A;
  const dt2 = -(B - Math.sqrt(rad)) / A;
  if (dt2 > dt) dt = dt2;
  return dt >= 0 ? t0 + dt : NEVER;
}

/**
 * Predicts the next collision between particles i and j (Particle2D.predCol, hard
 * spheres). Writes the absolute time and, in periodic arenas, which image of j is hit
 * (`side`: Wall.LEFT for the x image, Wall.BOTTOM for the y image, both for the corner)
 * into `out`, and sets `out.type` to PARTICLE. Leaves part1/part2 to the caller.
 */
export function predictPair2D(
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
  let dY: number;
  // Compare the two at the later of their t0s, so the prediction is never in the past.
  if (ti > tj) {
    currTime = ti;
    dX = p.x[i]! - (p.x[j]! + p.vx[j]! * (currTime - tj));
    dY = p.y[i]! - (p.y[j]! + p.vy[j]! * (currTime - tj));
  } else {
    currTime = tj;
    dX = p.x[i]! + p.vx[i]! * (currTime - ti) - p.x[j]!;
    dY = p.y[i]! + p.vy[i]! * (currTime - ti) - p.y[j]!;
  }
  const dVx = p.vx[i]! - p.vx[j]!;
  const dVy = p.vy[i]! - p.vy[j]!;
  const Dc = p.radius[i]! + p.radius[j]!;

  out.type = PARTICLE;
  out.time = predCol2D(dX, dY, dVx, dVy, Dc, currTime);
  out.side = 0;

  if (arena.type !== PERIODIC) {
    // Square wells (non-periodic arenas only, as in Java): entering or leaving the pair's
    // well of radius λ·(r1 + r2), if sooner than touching and allowed by the pair's last
    // event, and never at the very time of that event.
    if (wellMultiplier > 0) {
      const wellRadius = Dc * wellMultiplier;
      const enter = predEnterWell2D(dX, dY, dVx, dVy, wellRadius, currTime);
      const exit = predExitWell2D(dX, dY, dVx, dVy, wellRadius, currTime);
      if (enter < out.time && lastType !== ENTER_WELL && lastType !== WELL_REFLECT) {
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
  } else {
    // Check j's images across any boundary that exactly one of the two overlaps; the
    // soonest wins, ties going to the earlier image (normal, x, y, corner).
    const fi = p.bFlag[i]!;
    const fj = p.bFlag[j]!;
    const checkX = ((fi & LEFT) ^ (fj & LEFT)) === LEFT;
    const checkY = ((fi & BOTTOM) ^ (fj & BOTTOM)) === BOTTOM;
    let xAdj = 0;
    let yAdj = 0;
    if (checkX) {
      xAdj = (fi & LEFT) === LEFT ? arena.xSize : -arena.xSize;
      const t = predCol2D(dX + xAdj, dY, dVx, dVy, Dc, currTime);
      if (t < out.time) {
        out.time = t;
        out.side = LEFT;
      }
    }
    if (checkY) {
      yAdj = (fi & BOTTOM) === BOTTOM ? arena.ySize : -arena.ySize;
      const t = predCol2D(dX, dY + yAdj, dVx, dVy, Dc, currTime);
      if (t < out.time) {
        out.time = t;
        out.side = BOTTOM;
      }
    }
    if (checkX && checkY) {
      const t = predCol2D(dX + xAdj, dY + yAdj, dVx, dVy, Dc, currTime);
      if (t < out.time) {
        out.time = t;
        out.side = LEFT | BOTTOM;
      }
    }
  }

  if (out.time < currTime) throw new Error('Particle-particle collision predicted in the past');
  return out;
}

/**
 * Predicts particle i's next boundary event (Particle2D.predBoundaryCol): a wall in a
 * reflecting arena, or entering (BOUNDARY) or leaving (EOB) the overlap region of a
 * periodic one; in divided arenas also the divider (BARRIER) and the edges of its hole
 * (EDGE, `side` = edge index). Candidates are checked in Java's order (x wall, y wall,
 * edges, barrier) and the first wins ties. A velocity component of zero yields a
 * BOUNDARY event at MAX_TIME, as in Java. `holeOpen` only matters for Maxwell's demon.
 * Piston arenas add the piston after the walls (the top wall is still predicted, and wins
 * a tie with a piston at rest at the top).
 */
export function predictBoundary2D(
  p: Particles,
  i: number,
  arena: Arena,
  out: EventInfo,
  holeOpen = false,
  piston: Piston | null = null,
  wall: AttractiveWall | null = null,
): EventInfo {
  const t0 = p.t0[i]!;
  const x = p.x[i]!;
  const y = p.y[i]!;
  const xVel = p.vx[i]!;
  const yVel = p.vy[i]!;
  const radius = p.radius[i]!;
  const periodic = arena.type === PERIODIC;
  const flags = p.bFlag[i]!;
  let colTime = 0;

  // x direction
  if (xVel === 0) {
    out.type = BOUNDARY;
    out.time = NEVER;
    out.side = 0;
  } else if (periodic && (flags & LEFT) === LEFT) {
    // overlapping the x boundary: when does it stop overlapping?
    if (xVel < 0) {
      out.side = LEFT;
      colTime = (x + radius) / -xVel;
    } else {
      out.side = RIGHT;
      colTime = (radius - x) / xVel;
    }
    out.type = EOB;
    out.time = t0 + colTime;
  } else {
    if (xVel < 0) {
      out.side = LEFT;
      colTime = (radius - x) / xVel;
    } else {
      out.side = RIGHT;
      colTime = (arena.xSize - radius - x) / xVel;
    }
    out.type = periodic ? BOUNDARY : WALL_EVENT;
    out.time = t0 + colTime;
  }

  // y direction: replaces the x event only if strictly sooner
  let yType: number;
  let ySide: number;
  let yTime: number;
  if (yVel === 0) {
    yType = BOUNDARY;
    ySide = 0;
    yTime = NEVER;
  } else if (periodic && (flags & BOTTOM) === BOTTOM) {
    if (yVel < 0) {
      ySide = BOTTOM;
      colTime = (y + radius) / -yVel;
    } else {
      ySide = TOP;
      colTime = (radius - y) / yVel;
    }
    yType = EOB;
    yTime = t0 + colTime;
  } else {
    if (yVel < 0) {
      ySide = BOTTOM;
      colTime = (radius - y) / yVel;
    } else {
      ySide = TOP;
      colTime = (arena.ySize - radius - y) / yVel;
    }
    yType = periodic ? BOUNDARY : WALL_EVENT;
    // The attractive wall: crossing the top of its well comes before the wall itself.
    if (wall && !periodic) {
      const wellColTime = (wall.width - y) / yVel;
      if (wellColTime > 0) {
        colTime = wellColTime;
        yType = yVel < 0 ? ENTER_GRAVITY_WELL : EXIT_GRAVITY_WELL;
      }
    }
    yTime = t0 + colTime;
  }
  if (yTime < out.time) {
    out.type = yType as EventInfo['type'];
    out.side = ySide;
    out.time = yTime;
  }

  const type = arena.type;
  if (type === PISTON_ARENA && piston) {
    const t = predictPiston2D(t0, y, yVel, radius, piston);
    if (t < out.time) {
      out.type = PISTON;
      out.side = BOTTOM;
      out.time = t;
    }
  } else if (type === DIVIDED || type === WITH_HOLE) {
    // Approaching the divider from either side? (`colTime` still holds the y wall's
    // relative time otherwise, as in Java; it's only used when `side` is set.)
    let side = -1;
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
      // The hole's two edge discs, then the barrier only where it isn't the hole.
      const Dc = radius + arena.edgeRadius;
      for (let edge = 0; edge < 2; edge++) {
        const t = predCol2D(x - arena.edgeX, y - arena.edgeY[edge]!, xVel, yVel, Dc, t0);
        if (t < out.time) {
          out.type = EDGE;
          out.side = edge;
          out.time = t;
        }
      }
      if (side !== -1) {
        const holeRad2 = (arena.holeDiameter / 2.0) * (arena.holeDiameter / 2.0);
        const yPos = y + yVel * colTime - 0.5 * arena.ySize;
        if (yPos * yPos >= holeRad2 && t0 + colTime < out.time) {
          out.type = BARRIER;
          out.side = side;
          out.time = t0 + colTime;
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
 * When a particle at height y (at t0) moving at yVel first touches the piston's underside
 * (Particle2D.predPistonCol). If the piston is moving now but will have stopped by then,
 * and the particle is heading up, it's predicted again against the stopped piston.
 */
function predictPiston2D(
  t0: number,
  y: number,
  yVel: number,
  radius: number,
  piston: Piston,
): number {
  let colTime = predCol2D(
    0.0,
    y - piston.positionAtTime(t0),
    0.0,
    yVel - piston.velocityAtTime(t0),
    radius,
    t0,
  );
  if (piston.isMoving(t0) && !piston.isMoving(colTime) && yVel > 0) {
    colTime = predCol2D(0.0, y - piston.stopPosition(), 0.0, yVel, radius, t0);
  }
  return colTime;
}

/**
 * Elastic collision between particles `i` (Java's `this`, the event's part1) and `j`,
 * at `event.time` (Particle2D.collideWith, hard spheres). In periodic arenas,
 * `event.side` says which image of j is hit.
 */
export function collide2D(
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
  const y1 = p.y[i]! + p.vy[i]! * dt1;
  const x2 = p.x[j]! + p.vx[j]! * dt2;
  const y2 = p.y[j]! + p.vy[j]! * dt2;
  p.x[i] = x1;
  p.y[i] = y1;
  p.x[j] = x2;
  p.y[j] = y2;

  let dX = x2 - x1;
  let dY = y2 - y1;
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
  }

  // Work in coordinates along (A) and across (B) the line between the centres; only the
  // A components change. The actual centre distance is used rather than r1 + r2 to avoid
  // amplifying round-off.
  const realDc = Math.sqrt(dX * dX + dY * dY);
  const Ax = dX / realDc;
  const Ay = dY / realDc;
  const Bx = -Ay;
  const By = Ax;

  const xVel = p.vx[i]!;
  const yVel = p.vy[i]!;
  const targetXVel = p.vx[j]!;
  const targetYVel = p.vy[j]!;
  const V1a = xVel * Ax + yVel * Ay;
  const V1b = xVel * Bx + yVel * By;
  const V2a = targetXVel * Ax + targetYVel * Ay;
  const V2b = targetXVel * Bx + targetYVel * By;

  const mass = p.mass[i]!;
  const targetMass = p.mass[j]!;
  let type = event.type as number;
  let nV1a: number;
  let nV2a: number;

  // Reactions (collideWith, generalized to a rule table; see reactions.ts): a pair
  // colliding with more than its rule's activation energy along the line of centres
  // becomes the rule's products, and the relative speed then changes so the kinetic energy
  // changes by −ΔE.
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
    // Square well (Particle2D.collideWith, from Dr. Shirts' notes): the relative speed
    // along the line of centres becomes sqrt(Δv² ± E/μ), keeping the momentum. Note E/μ,
    // not 2E/μ: the kinetic energy changes by E/2, the mean of the two types' depths
    // (joshuata/boltzmann4d#24).
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
      type = WELL_REFLECT;
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

  p.vx[i] = nV1a * Ax + V1b * Bx;
  p.vy[i] = nV1a * Ay + V1b * By;
  p.vx[j] = nV2a * Ax + V2b * Bx;
  p.vy[j] = nV2a * Ay + V2b * By;

  p.cumTime[i] = 0;
  p.cumTime[j] = 0;
  p.t0[i] = time;
  p.t0[j] = time;
  return type;
}

/**
 * Performs particle i's boundary event (Particle2D.boundaryCollide): reflection off a
 * wall, the divider or the piston, or entering/leaving a periodic overlap region (which
 * moves the particle to the matching position on the other side and updates its flags).
 *
 * With an active thermostat, reflections off walls, the divider and a stopped piston
 * scale the normal velocity, and the thermostat tracks every boundary event's change in
 * kinetic energy. A moving piston reflects in its own frame: v' = 2·v_piston − v.
 */
export function boundaryCollide2D(
  p: Particles,
  i: number,
  event: EventInfo,
  arena: Arena,
  piston: Piston | null = null,
  thermostat: Thermostat | null = null,
  wall: AttractiveWall | null = null,
): void {
  const dt = event.time - p.t0[i]!;
  p.cumTime[i] = p.cumTime[i]! + dt;
  p.t0[i] = event.time;
  const radius = p.radius[i]!;
  const tracking = thermostat !== null && thermostat.enabled;
  const oldKE = tracking ? particleKE2D(p, i) : 0.0;
  // 1.0 unless the thermostat is active; x · 1.0 is exact, so plain bounces are unchanged.
  const velAdjust = tracking ? thermostat.calcModifier(event.type, event.side, p, i) : 1.0;

  switch (event.type) {
    case WALL_EVENT:
      switch (event.side) {
        case LEFT:
          p.x[i] = radius;
          p.y[i] = p.y[i]! + p.vy[i]! * dt;
          p.vx[i] = -p.vx[i]! * velAdjust;
          break;
        case RIGHT:
          p.x[i] = arena.xSize - radius;
          p.y[i] = p.y[i]! + p.vy[i]! * dt;
          p.vx[i] = -p.vx[i]! * velAdjust;
          break;
        case BOTTOM:
          p.y[i] = radius;
          p.x[i] = p.x[i]! + p.vx[i]! * dt;
          p.vy[i] = -p.vy[i]! * velAdjust;
          keepOutOfDivider(p, i, arena, radius);
          break;
        case TOP:
          p.y[i] = arena.ySize - radius;
          p.x[i] = p.x[i]! + p.vx[i]! * dt;
          p.vy[i] = -p.vy[i]! * velAdjust;
          keepOutOfDivider(p, i, arena, radius);
          break;
      }
      break;
    case BARRIER:
      if (event.side === LEFT) {
        p.x[i] = arena.barrierLeftX - radius;
        p.y[i] = p.y[i]! + p.vy[i]! * dt;
        p.vx[i] = -p.vx[i]! * velAdjust;
      } else if (event.side === RIGHT) {
        p.x[i] = arena.barrierRightX + radius;
        p.y[i] = p.y[i]! + p.vy[i]! * dt;
        p.vx[i] = -p.vx[i]! * velAdjust;
      }
      break;
    case PISTON:
      p.y[i] = p.y[i]! + p.vy[i]! * dt;
      p.x[i] = p.x[i]! + p.vx[i]! * dt;
      if (piston!.isMoving(event.time)) {
        p.vy[i] = 2.0 * piston!.velocity() - p.vy[i]!;
      } else {
        p.vy[i] = -p.vy[i]! * velAdjust;
      }
      break;
    case ENTER_GRAVITY_WELL:
    case EXIT_GRAVITY_WELL: {
      // Crossing the top of the attractive wall's well: falling in gains its energy;
      // climbing out costs it, and without enough the particle bounces back down.
      p.x[i] = p.x[i]! + p.vx[i]! * dt;
      p.y[i] = wall!.width;
      const vy = p.vy[i]!;
      const delta = (2 * wall!.energy) / p.mass[i]!;
      if (event.type === ENTER_GRAVITY_WELL) {
        p.vy[i] = -Math.sqrt(vy * vy + delta);
      } else {
        const remaining = vy * vy - delta;
        p.vy[i] = remaining >= 0 ? Math.sqrt(remaining) : -vy;
      }
      break;
    }
    case EDGE:
      p.x[i] = p.x[i]! + p.vx[i]! * dt;
      p.y[i] = p.y[i]! + p.vy[i]! * dt;
      edgeCollide(p, i, arena.xSize / 2.0, arena.edgeY[event.side]!);
      break;
    case BOUNDARY:
      switch (event.side) {
        case LEFT:
          p.x[i] = radius;
          p.y[i] = p.y[i]! + p.vy[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! | LEFT;
          break;
        case RIGHT:
          p.x[i] = -radius;
          p.y[i] = p.y[i]! + p.vy[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! | LEFT;
          break;
        case BOTTOM:
          p.y[i] = radius;
          p.x[i] = p.x[i]! + p.vx[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! | BOTTOM;
          break;
        case TOP:
          p.y[i] = -radius;
          p.x[i] = p.x[i]! + p.vx[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! | BOTTOM;
          break;
      }
      break;
    case EOB:
      switch (event.side) {
        case LEFT:
          p.x[i] = arena.xSize - radius;
          p.y[i] = p.y[i]! + p.vy[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! & ~LEFT;
          break;
        case RIGHT:
          p.x[i] = radius;
          p.y[i] = p.y[i]! + p.vy[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! & ~LEFT;
          break;
        case BOTTOM:
          p.y[i] = arena.ySize - radius;
          p.x[i] = p.x[i]! + p.vx[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! & ~BOTTOM;
          break;
        case TOP:
          p.y[i] = radius;
          p.x[i] = p.x[i]! + p.vx[i]! * dt;
          p.bFlag[i] = p.bFlag[i]! & ~BOTTOM;
          break;
      }
      break;
    default:
      throw new Error(`Unsupported boundary event type ${event.type} in 2D`);
  }

  if (tracking) {
    const deltaKE = particleKE2D(p, i) - oldKE;
    if (deltaKE !== 0.0) thermostat.adjustKE(deltaKE);
  }
}

/**
 * After a top or bottom wall bounce in a divided arena, round-off can leave a particle
 * that hit the corner overlapping the divider; push it back out (Particle2D).
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
 * Bounce off an edge disc of infinite mass at (edgeX, edgeY): reverse the velocity
 * component along the line between the centres (Particle2D.EdgeCollide).
 */
function edgeCollide(p: Particles, i: number, edgeX: number, edgeY: number): void {
  const dX = edgeX - p.x[i]!;
  const dY = edgeY - p.y[i]!;
  const realDc = Math.sqrt(dX * dX + dY * dY);
  const Ax = dX / realDc;
  const Ay = dY / realDc;
  const Bx = -Ay;
  const By = Ax;
  const xVel = p.vx[i]!;
  const yVel = p.vy[i]!;
  const V1a = xVel * Ax + yVel * Ay;
  const V1b = xVel * Bx + yVel * By;
  const nV1a = -V1a;
  p.vx[i] = nV1a * Ax + V1b * Bx;
  p.vy[i] = nV1a * Ay + V1b * By;
}
