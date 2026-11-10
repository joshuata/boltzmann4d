// Event types and records (from Collision.java, Wall.java and EventInfo.java).

/** Event types. Values match Collision.java so parity dumps compare directly. */
export const Collision = {
  /** Particle–particle collision. */
  PARTICLE: 0,
  /** Reflecting wall. */
  WALL: 1,
  /** Periodic boundaries: entering the overlap region. */
  BOUNDARY: 2,
  /** Periodic boundaries: leaving the overlap region ("end of boundary"). */
  EOB: 3,
  /** Dividing wall. */
  BARRIER: 4,
  /** Edge of the hole in a dividing wall. */
  EDGE: 5,
  PISTON: 6,
  ENTER_WELL: 7,
  EXIT_WELL: 8,
  ENTER_GRAVITY_WELL: 9,
  EXIT_GRAVITY_WELL: 10,
  WELL_REFLECT: 18,
} as const;
export type CollisionType = (typeof Collision)[keyof typeof Collision];

/**
 * What the calendar must re-predict after an event. Kept apart from CollisionType
 * (and numbered from 11, as in Java) so the two can't be confused.
 */
export const CalendarUpdate = {
  /** Re-predict one particle (part1). */
  PARTICLE_1: 17,
  /** Re-predict two particles (part1 and part2). */
  PARTICLE_2: 11,
  PARTICLE_ALL: 12,
  BOUNDARY_ALL: 13,
  EVERYTHING: 14,
  RESORT: 15,
  PISTON_ALL: 16,
} as const;
export type CalendarUpdateType = (typeof CalendarUpdate)[keyof typeof CalendarUpdate];

/**
 * Which side of a boundary an event involves. Powers of two so that periodic boundaries
 * can combine them as flags (e.g. LEFT | BOTTOM for a corner image).
 */
export const Wall = {
  LEFT: 1,
  RIGHT: 2,
  BOTTOM: 4,
  TOP: 8,
  BACK: 16,
  FRONT: 32,
} as const;

/** "Never": the time of an event that won't happen. */
export const MAX_TIME = Number.MAX_VALUE;
/** The smallest positive time, used as "just now" for last-collision records. */
export const MIN_TIME = Number.MIN_VALUE;

/**
 * One event. For boundary events part2 is unused and `side` says which boundary; for
 * particle events in periodic arenas `side` says which periodic image is involved.
 * Mutable so the hot path can reuse one instance instead of allocating.
 */
export interface EventInfo {
  type: CollisionType | CalendarUpdateType | -1;
  time: number;
  part1: number;
  part2: number;
  side: number;
}

export function createEvent(
  type: EventInfo['type'] = CalendarUpdate.EVERYTHING,
  time = 0,
  part1 = 0,
  part2 = 0,
  side = 0,
): EventInfo {
  return { type, time, part1, part2, side };
}

export function copyEvent(from: EventInfo, into: EventInfo): EventInfo {
  into.type = from.type;
  into.time = from.time;
  into.part1 = from.part1;
  into.part2 = from.part2;
  into.side = from.side;
  return into;
}
