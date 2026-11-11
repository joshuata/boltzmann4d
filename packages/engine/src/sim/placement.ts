// Placing particles: random directions and where a particle fits without overlapping
// anything. Shared by the scenario resolver (scenario/resolve.ts, placement when a scenario
// starts) and the mid-run edits (particle-edits.ts, adding particles to a running gas).
import { avgKineticEnergy, speed as speedFromEnergy } from '../stats/formulas';
import { convert } from '../utils/units';
import { distanceToSegment } from './segment-walls';
import { ARENA_DIVIDER_RADIUS, ArenaType } from './simulation-info';

/** theta is the azimuth, phi the polar angle; 1D keeps only the sign of cos(theta). */
export function velocityFromAngles(
  speed: number,
  theta: number,
  phi: number,
  dimension: 1 | 2 | 3,
): number[] {
  if (dimension === 1) return [Math.cos(theta) < 0.0 ? -speed : speed, 0, 0];
  if (dimension === 2) return [Math.cos(theta) * speed, Math.sin(theta) * speed, 0];
  return [
    Math.sin(phi) * Math.cos(theta) * speed,
    Math.sin(phi) * Math.sin(theta) * speed,
    Math.cos(phi) * speed,
  ];
}

/** A uniformly random direction (uniform on the sphere in 3D) at `speed`. Draws two numbers. */
export function randomVelocity(
  speed: number,
  dimension: 1 | 2 | 3,
  random: () => number,
): number[] {
  const theta = random() * 2.0 * Math.PI;
  const phi = Math.acos(1 - 2 * random());
  return velocityFromAngles(speed, theta, phi, dimension);
}

/**
 * The speed every particle of a kind starts with at `temperature` (SIM-6): the one whose
 * kinetic energy is the average d/2 kT. m/s, for a mass in amu.
 */
export function speedForTemperature(temperature: number, massAmu: number, dimension: number) {
  if (!(temperature > 0)) return 0;
  return speedFromEnergy(avgKineticEnergy(temperature, dimension), convert('amu', 'kg', massAmu));
}

/**
 * SIM-30: shifts a group's velocities (x, y, z each) so their total momentum is zero, then
 * rescales them back to their original kinetic energy (Physics.SetTotalMom with zero
 * momentum). `masses` gives each velocity's mass (any unit). Fewer than two velocities, or
 * none moving, are left alone.
 */
export function zeroMomentum(velocities: number[][], masses: readonly number[]): void {
  const n = velocities.length;
  if (n < 2) return;
  const total = [0, 0, 0];
  let energy = 0;
  for (let k = 0; k < n; k++) {
    const v = velocities[k]!;
    const m = masses[k]!;
    for (let axis = 0; axis < 3; axis++) {
      total[axis]! += m * (v[axis] ?? 0);
      energy += 0.5 * m * (v[axis] ?? 0) ** 2;
    }
  }
  if (!(energy > 0)) return;
  let shifted = 0;
  for (let k = 0; k < n; k++) {
    const v = velocities[k]!;
    const m = masses[k]!;
    for (let axis = 0; axis < 3; axis++) {
      v[axis] = (v[axis] ?? 0) - total[axis]! / n / m;
      shifted += 0.5 * m * v[axis]! ** 2;
    }
  }
  if (!(shifted > 0)) return;
  const f = Math.sqrt(energy / shifted);
  for (const v of velocities) for (let axis = 0; axis < 3; axis++) v[axis] = (v[axis] ?? 0) * f;
}

/** The arena a PlacementSpace places into (SI units). */
export interface PlacementArena {
  dimension: 2 | 3;
  arenaType: ArenaType;
  /** Meters. */
  xSize: number;
  ySize: number;
  zSize: number;
  /** Arenas with a hole: its diameter, m. */
  holeDiameter?: number;
  /** Piston arenas: the piston's height, m (particles must stay below it). */
  pistonY?: number;
  /** Drawn walls (2D): segments as x1, y1, x2, y2, m. */
  segments?: readonly number[];
}

/**
 * Where a particle can go: inside the arena's walls, clear of the divider (or through its
 * hole), drawn walls and the piston, and not overlapping any particle added so far. Periodic
 * arenas have no walls, and overlaps are measured across their edges too.
 */
export class PlacementSpace {
  /** Particles so far: x, y, z, radius (m). */
  private readonly placed: number[] = [];
  private readonly periodic: boolean;
  private readonly dividerX: number | null;
  private readonly holeRadius: number;

  constructor(readonly arena: PlacementArena) {
    const type = arena.arenaType;
    this.periodic = type === ArenaType.PERIODIC_BOUNDARIES;
    this.dividerX =
      type === ArenaType.DIVIDED_ARENA || type === ArenaType.DIVIDED_ARENA_WITH_HOLE
        ? arena.xSize / 2
        : null;
    this.holeRadius =
      type === ArenaType.DIVIDED_ARENA_WITH_HOLE ? (arena.holeDiameter ?? 0) / 2 : 0;
  }

  /** Counts a particle as there (whether or not it fits). */
  add(x: number, y: number, z: number, radius: number): void {
    this.placed.push(x, y, z, radius);
  }

  /** Whether a particle of `radius` fits at (x, y, z); z is ignored in 2D. */
  fits(x: number, y: number, z: number, radius: number): boolean {
    return (
      this.insideWalls(x, y, z, radius) &&
      this.clearOfDivider(x, y, z, radius) &&
      this.clearOfSegments(x, y, radius) &&
      this.clearOfParticles(x, y, z, radius)
    );
  }

  /** Inside the box walls (and below the piston), by at least one radius. */
  insideWalls(x: number, y: number, z: number, radius: number): boolean {
    const a = this.arena;
    if (this.periodic) return true;
    if (x < radius || x > a.xSize - radius || y < radius || y > a.ySize - radius) return false;
    if (a.pistonY !== undefined && y > a.pistonY - radius) return false;
    return a.dimension === 2 || (z >= radius && z <= a.zSize - radius);
  }

  /** Clear of a divider, or wholly inside its hole. */
  clearOfDivider(x: number, y: number, z: number, radius: number): boolean {
    if (this.dividerX === null) return true;
    if (!(Math.abs(x - this.dividerX) < ARENA_DIVIDER_RADIUS + radius)) return true;
    if (this.holeRadius <= 0) return false;
    const a = this.arena;
    const dy = y - a.ySize / 2;
    const dz = a.dimension === 3 ? z - a.zSize / 2 : 0;
    return Math.sqrt(dy * dy + dz * dz) + radius <= this.holeRadius;
  }

  /** Clear of every drawn wall by at least one radius. */
  clearOfSegments(x: number, y: number, radius: number): boolean {
    const s = this.arena.segments;
    if (!s) return true;
    for (let k = 0; k < s.length; k += 4) {
      if (distanceToSegment(x, y, s[k]!, s[k + 1]!, s[k + 2]!, s[k + 3]!) < radius) return false;
    }
    return true;
  }

  /** Not overlapping any particle added so far. */
  clearOfParticles(x: number, y: number, z: number, radius: number): boolean {
    const p = this.placed;
    const a = this.arena;
    const is3D = a.dimension === 3;
    for (let k = 0; k < p.length; k += 4) {
      const reach = radius + p[k + 3]!;
      let dx = x - p[k]!;
      let dy = y - p[k + 1]!;
      let dz = is3D ? z - p[k + 2]! : 0;
      if (this.periodic) {
        dx -= a.xSize * Math.round(dx / a.xSize);
        dy -= a.ySize * Math.round(dy / a.ySize);
        if (is3D) dz -= a.zSize * Math.round(dz / a.zSize);
      }
      if (dx * dx + dy * dy + dz * dz < reach * reach) return false;
    }
    return true;
  }

  /**
   * A random spot where a particle of `radius` fits, within x in [xMin, xMax] (default the
   * whole width), uniformly over the free space; null after `attempts` misses. Draws two
   * numbers per attempt in 2D, three in 3D.
   */
  randomSpot(
    radius: number,
    random: () => number,
    { xMin = 0, xMax = this.arena.xSize, attempts = PLACEMENT_ATTEMPTS } = {},
  ): [number, number, number] | null {
    const a = this.arena;
    const inset = this.periodic ? 0 : radius;
    const yMax = Math.min(a.ySize, a.pistonY ?? a.ySize);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const x = random() * (xMax - xMin - 2 * inset) + xMin + inset;
      const y = random() * (yMax - 2 * inset) + inset;
      const z = a.dimension === 3 ? random() * (a.zSize - 2 * inset) + inset : 0;
      if (this.fits(x, y, z, radius)) return [x, y, z];
    }
    return null;
  }
}

/** Attempts at a random spot per particle before the space counts as full (EDIT-6). */
export const PLACEMENT_ATTEMPTS = 2000;
