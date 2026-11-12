// The wall thermostat (Thermostat.java with WallController.java), used by the isothermal
// piston in 2D and 3D: it tracks how much kinetic energy boundary events have added (`deltaKE`, J) and
// scales the normal velocity of later wall bounces to take it back out.
//
// This is a heuristic, not a heat bath (see joshuata/boltzmann4d#24); it's ported as is so
// isothermal runs match Java bit for bit.
import { Collision, Wall } from './event';
import type { Particles } from './particles';

/** amu·m²/s² → J, applied as Java's Units.convert does. */
const AMU_JOULE = 1.660538782e-27;
/** |deltaKE| below this (1 amu·m²/s² in J) counts as nothing to correct. */
export const THERMOSTAT_EPSILON = (1.0 * AMU_JOULE) / 1.0;
const MIN_GAMMA2 = 0.5;
const MAX_GAMMA2 = 1.5;

export class Thermostat {
  enabled = false;
  /** Kinetic energy (J) added by boundary events and not yet taken back. */
  deltaKE = 0.0;
  dampFactor = 0.1;

  reset(enabled: boolean): void {
    this.dampFactor = 0.1;
    this.deltaKE = 0.0;
    this.enabled = enabled;
  }

  isActive(): boolean {
    return this.enabled && Math.abs(this.deltaKE) > THERMOSTAT_EPSILON;
  }

  adjustKE(ke: number): void {
    this.deltaKE = this.deltaKE + ke;
  }

  /**
   * Factor for particle i's normal velocity at this boundary event (WallController):
   * sqrt(γ²) with γ² = 1 − ΔKE / KE⊥, damped when ΔKE ≥ KE⊥, clipped to [0.5, 1.5].
   */
  calcModifier(type: number, side: number, p: Particles, i: number): number {
    if (!this.isActive()) return 1.0;
    let normal = 0.0;
    if (type === Collision.WALL) {
      // WallController takes vy for the front and back walls too (a Java slip, kept for parity).
      normal = side === Wall.LEFT || side === Wall.RIGHT ? p.vx[i]! : p.vy[i]!;
    } else if (type === Collision.PISTON) {
      normal = p.vy[i]!;
    }
    const energy = 0.5 * p.mass[i]! * normal * normal;
    const normalKE = (energy * AMU_JOULE) / 1.0;
    let gammaSquared =
      this.deltaKE < normalKE
        ? 1.0 - this.deltaKE / normalKE
        : 1.0 - (this.dampFactor * this.deltaKE) / normalKE;
    if (gammaSquared < MIN_GAMMA2) gammaSquared = MIN_GAMMA2;
    else if (gammaSquared > MAX_GAMMA2) gammaSquared = MAX_GAMMA2;
    return Math.sqrt(gammaSquared);
  }
}

/** Particle2D.getKE: 0.5·m·|v|² in amu·m²/s², converted to joules. */
export function particleKE2D(p: Particles, i: number): number {
  const vx = p.vx[i]!;
  const vy = p.vy[i]!;
  const speed = Math.sqrt(0.0 + vx * vx + vy * vy);
  const energy = 0.5 * p.mass[i]! * speed * speed;
  return (energy * AMU_JOULE) / 1.0;
}

/** Particle3D.getKE: 0.5·m·|v|² in amu·m²/s², converted to joules. */
export function particleKE3D(p: Particles, i: number): number {
  const vx = p.vx[i]!;
  const vy = p.vy[i]!;
  const vz = p.vz[i]!;
  const speed = Math.sqrt(0.0 + vx * vx + vy * vy + vz * vz);
  const energy = 0.5 * p.mass[i]! * speed * speed;
  return (energy * AMU_JOULE) / 1.0;
}
