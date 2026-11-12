// The pressure readout (PRES-1–8): measured pressure and its Ideal and Real predictions,
// per particle kind and, in divided arenas, for the left and right sides. Ports the
// measurement in Java's Pressure, WallPressureTracker and VirialPressureTracker.
//
// The meter only observes: Simulation calls beforeEvent and afterEvent around every event
// (SimulationOptions.onEvent / afterEvent), and the meter reads the particles involved
// without changing anything, so the simulation runs exactly as it would without it.
//
// - Walls (every arena but periodic): each hit on the box's left or right wall transfers
//   m (|vₓ before| + |vₓ after|) — Java's 2 m |vₓ|, also right when a thermostat changes the
//   speed — divided by the area the particle's centre can reach on that wall. Hits are
//   kept for the averaging time T_avg, and the reading is their sum over the time covered.
//   An undivided box reads the average of its two walls; a divided one (with or without a
//   hole) reads its left wall for the left side and its right wall for the right side.
// - Periodic arenas have no walls, so the meter uses the virial theorem over every
//   collision since the start (PRES-5): P d V = 2⟨KE⟩ + (1/t) Σ μ r₁₂·Δv₁₂.
// - Drawn walls (segment-walls.ts) don't count: they have any shape and orientation, so
//   the readout keeps measuring the box's left and right walls, as Java did, and the
//   predictions use the box's volume.
// - Kinds are the colour each particle shows (reactions recolour), as in the statistics.
//   Every quantity is kept per kind and totals are sums, so partial pressures add up.
import { Collision, Wall, type EventInfo } from '../sim/event';
import type { Simulation } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { effectiveVolume, realGasPressureFactor, realGasX } from './formulas';
import type { StatsContext } from './stats-context';

/** kg per amu (Units, as the rest of the engine converts it). */
const AMU_KG = 1.660538782e-27;
const { PARTICLE, ENTER_WELL, EXIT_WELL, WALL } = Collision;
const isPairType = (type: number) => type === PARTICLE || type === ENTER_WELL || type === EXIT_WELL;

/** Java's default averaging time, 60 ps (PRES-2). */
export const DEFAULT_PRESSURE_AVERAGING_TIME = 60e-12;

/** How the pressure is measured: momentum given to the walls, or the virial (periodic). */
export type PressureMethod = 'wall' | 'virial';

/** Which part of the arena a reading is for. */
export type PressureRegion = 'arena' | 'left' | 'right';

/** One region's pressures, per kind (index = kind), in the reading's unit. */
export interface PressureRegionReading {
  region: PressureRegion;
  /** Measured; NaN before any time has passed. */
  measured: number[];
  /** N k T / V_eff, from the kind's particles in this region and their kinetic energy. */
  ideal: number[];
  /**
   * The ideal prediction × the hard-disk / hard-sphere factor 1 + x Q(x) (PRED-8); in 1D
   * the exact hard-rod pressure N k T / L_net (PRED-10).
   */
  real: number[];
}

export interface PressureReading {
  method: PressureMethod;
  /** pN (a force) in 1D, µN/m in 2D, MPa in 3D (PRES-3). */
  unit: string;
  /** Simulation time of the reading, s. */
  time: number;
  /** The averaging time, s. */
  averagingTime: number;
  /** How much of it the reading covers so far, s. */
  covered: number;
  /** True until a whole averaging time has passed (PRES-2). */
  warmingUp: boolean;
  /** One region (the arena), or the left and right sides of a divided arena (PRES-4). */
  regions: PressureRegionReading[];
}

/** SI pressure (N in 1D, N/m in 2D, Pa in 3D) → the displayed unit. */
const DISPLAY = {
  1: { unit: 'pN', scale: 1e12 },
  2: { unit: 'µN/m', scale: 1e6 },
  3: { unit: 'MPa', scale: 1e-6 },
} as const;

export class PressureMeter {
  readonly method: PressureMethod;
  readonly kindCount: number;
  readonly divided: boolean;
  private readonly simulation: Simulation;
  private averagingTime: number;
  /** Time covered by the window as of `coveredAt` (it grows until it reaches T_avg). */
  private coveredBase = 0;
  private coveredAt: number;
  private readonly startTime: number;

  // Wall hits in time order: slot = side (0 left, 1 right) × kindCount + kind.
  private readonly hits = new HitQueue();
  /** |vₓ| of the particle just before the wall hit in progress. */
  private speedBefore = 0;

  // Virial (periodic arenas).
  /** Per kind: Σ ½ μ r₁₂·Δv₁₂ over collisions involving it, kg·m²/s. */
  private readonly virial: Float64Array;
  /** Per kind: current kinetic energy (J), its time integral (J·s), and the time it is at. */
  private readonly kineticEnergy: Float64Array;
  private readonly kineticIntegral: Float64Array;
  private kineticAt: number;
  /** Velocities of the two particles just before the pair event in progress. */
  private readonly before = new Float64Array(6);

  /**
   * `kindCount`: how many kinds the readout shows (the scenario's species). `averagingTime`
   * in seconds. Build it right after the simulation, before it has run.
   */
  constructor(
    simulation: Simulation,
    kindCount: number,
    averagingTime = DEFAULT_PRESSURE_AVERAGING_TIME,
  ) {
    this.simulation = simulation;
    this.kindCount = kindCount;
    const type = simulation.arena.type;
    this.method = type === ArenaType.PERIODIC_BOUNDARIES ? 'virial' : 'wall';
    this.divided = type === ArenaType.DIVIDED_ARENA || type === ArenaType.DIVIDED_ARENA_WITH_HOLE;
    this.averagingTime = positiveOr(averagingTime, DEFAULT_PRESSURE_AVERAGING_TIME);
    this.startTime = simulation.time;
    this.coveredAt = simulation.time;
    this.kineticAt = simulation.time;
    this.virial = new Float64Array(kindCount);
    this.kineticEnergy = new Float64Array(kindCount);
    this.kineticIntegral = new Float64Array(kindCount);
    const p = simulation.particles;
    for (let i = 0; i < p.count; i++) {
      const kind = p.color[i]!;
      if (kind < kindCount) this.kineticEnergy[kind]! += this.particleKE(i);
    }
  }

  /** Changes T_avg (s). The reading stays warming up until the new T_avg has passed. */
  setAveragingTime(seconds: number): void {
    const now = this.simulation.time;
    this.coveredBase = Math.min(seconds, this.covered(now));
    this.coveredAt = now;
    this.averagingTime = positiveOr(seconds, this.averagingTime);
  }

  /** Every event, just before it is performed (SimulationOptions.onEvent). */
  beforeEvent(event: Readonly<EventInfo>): void {
    const p = this.simulation.particles;
    if (this.method === 'wall') {
      if (event.type === WALL && isSideWall(event.side)) {
        this.speedBefore = Math.abs(p.vx[event.part1]!);
      }
      return;
    }
    // Periodic arenas: only pair events change velocities.
    if (!isPairType(event.type)) return;
    this.integrateKinetic(event.time);
    const a = event.part1;
    const b = event.part2;
    const v = this.before;
    v[0] = p.vx[a]!;
    v[1] = p.vy[a]!;
    v[2] = p.vz[a]!;
    v[3] = p.vx[b]!;
    v[4] = p.vy[b]!;
    v[5] = p.vz[b]!;
    this.addKinetic(a, -1);
    this.addKinetic(b, -1);
  }

  /** Every event, just after it is performed (SimulationOptions.afterEvent). */
  afterEvent(event: Readonly<EventInfo>): void {
    const p = this.simulation.particles;
    if (this.method === 'wall') {
      if (event.type !== WALL || !isSideWall(event.side)) return;
      const i = event.part1;
      const kind = p.color[i]!;
      if (kind >= this.kindCount) return;
      const momentum = p.mass[i]! * AMU_KG * (this.speedBefore + Math.abs(p.vx[i]!));
      const side = event.side === Wall.LEFT ? 0 : 1;
      this.hits.push(
        event.time,
        side * this.kindCount + kind,
        momentum / this.wallArea(p.radius[i]!, event.time),
      );
      this.hits.dropBefore(event.time - this.averagingTime);
      return;
    }
    if (!isPairType(event.type)) return;
    const a = event.part1;
    const b = event.part2;
    const arena = this.simulation.arena;
    const v = this.before;
    // r₁₂ by the nearest image: colliding particles are far closer than half the box.
    const dx = nearestImage(p.x[b]! - p.x[a]!, arena.xSize);
    const dy = nearestImage(p.y[b]! - p.y[a]!, arena.ySize);
    const dz = this.simulation.dimension === 3 ? nearestImage(p.z[b]! - p.z[a]!, arena.zSize) : 0;
    const dvx = p.vx[b]! - p.vx[a]! - (v[3]! - v[0]!);
    const dvy = p.vy[b]! - p.vy[a]! - (v[4]! - v[1]!);
    const dvz = p.vz[b]! - p.vz[a]! - (v[5]! - v[2]!);
    const ma = p.mass[a]!;
    const mb = p.mass[b]!;
    const reducedMass = ((ma * mb) / (ma + mb)) * AMU_KG;
    // Half to each particle's kind, as Java adds μ r₁₂·v₁₂ once per particle.
    const half = 0.5 * reducedMass * (dx * dvx + dy * dvy + dz * dvz);
    const kindA = p.color[a]!;
    const kindB = p.color[b]!;
    if (kindA < this.kindCount) this.virial[kindA]! += half;
    if (kindB < this.kindCount) this.virial[kindB]! += half;
    this.addKinetic(a, 1);
    this.addKinetic(b, 1);
  }

  /**
   * The reading at `time` (default: the simulation's time, after advanceToTime), with
   * predictions from where the particles are now.
   */
  read(time = this.simulation.time): PressureReading {
    const sim = this.simulation;
    const { unit, scale } = DISPLAY[sim.dimension];
    const covered = this.covered(time);
    const regions: PressureRegion[] = this.divided ? ['left', 'right'] : ['arena'];
    const measured = this.method === 'wall' ? this.wallPressures(time, covered) : null;
    const virial = this.method === 'virial' ? this.virialPressures(time) : null;
    const predictions = this.predictions();
    return {
      method: this.method,
      unit,
      time,
      averagingTime: this.averagingTime,
      covered,
      warmingUp: covered < this.averagingTime,
      regions: regions.map((region, r) => {
        let values: Float64Array;
        if (virial) values = virial;
        else if (this.divided) values = measured![r]!;
        // Undivided: the average of the two walls (WallPressureTracker.getAverage).
        else values = measured![0]!.map((left, k) => 0.5 * (left + measured![1]![k]!));
        return {
          region,
          measured: Array.from(values, (v) => v * scale),
          ideal: Array.from(predictions[r]!.ideal, (v) => v * scale),
          real: Array.from(predictions[r]!.real, (v) => v * scale),
        };
      }),
    };
  }

  /** Time the window covers at `time`: the time since the start, up to T_avg. */
  private covered(time: number): number {
    return Math.min(this.averagingTime, this.coveredBase + Math.max(0, time - this.coveredAt));
  }

  /** Per side (left, right), per kind: Σ momentum / area over the window, ÷ its length. */
  private wallPressures(time: number, covered: number): Float64Array[] {
    const k = this.kindCount;
    const sums = new Float64Array(2 * k);
    this.hits.dropBefore(time - this.averagingTime);
    this.hits.sumSince(time - covered, time, sums);
    const per = covered > 0 ? 1 / covered : NaN;
    return [0, 1].map((side) => sums.subarray(side * k, side * k + k).map((s) => s * per));
  }

  /** Per kind: (2⟨KE⟩ + Σ½μ r·Δv / t) / (d V), since the start. */
  private virialPressures(time: number): Float64Array {
    const sim = this.simulation;
    const arena = sim.arena;
    const d = sim.dimension;
    const volume = arena.xSize * (d > 1 ? arena.ySize : 1) * (d === 3 ? arena.zSize : 1);
    const elapsed = time - this.startTime;
    return this.kineticEnergy.map((ke, kind) => {
      if (elapsed <= 0) return (2 * ke) / (d * volume);
      const integral = this.kineticIntegral[kind]! + ke * Math.max(0, time - this.kineticAt);
      return (2 * (integral / elapsed) + this.virial[kind]! / elapsed) / (d * volume);
    });
  }

  /**
   * Per region: each kind's Ideal and Real prediction, N k T / V_eff with N and T those of
   * its particles in that region now (so a hot and a cold side, or a compressed piston
   * arena, are each predicted right), times 1 + x Q(x) for Real.
   */
  private predictions(): { ideal: Float64Array; real: Float64Array }[] {
    const sim = this.simulation;
    const p = sim.particles;
    const arena = sim.arena;
    const d = sim.dimension;
    const k = this.kindCount;
    const regionCount = this.divided ? 2 : 1;
    const count = new Float64Array(regionCount * k);
    const energy = new Float64Array(regionCount * k);
    const radius = new Float64Array(regionCount * k);
    const middle = arena.xSize / 2;
    for (let i = 0; i < p.count; i++) {
      const kind = p.color[i]!;
      if (kind >= k) continue;
      const slot = (this.divided && p.x[i]! > middle ? k : 0) + kind;
      count[slot]!++;
      energy[slot]! += this.particleKE(i);
      radius[slot]! += p.radius[i]!;
    }
    const periodic = this.method === 'virial';
    const height = sim.piston ? sim.piston.positionAtTime(sim.time) : arena.ySize;
    // The space each region gives a particle's centre (Formulas.effectiveVolume): a side of
    // a divided arena reaches from its outer wall to the divider's face.
    const length = this.divided ? arena.barrierLeftX : arena.xSize;
    const results: { ideal: Float64Array; real: Float64Array }[] = [];
    for (let r = 0; r < regionCount; r++) {
      const ctx: StatsContext = {
        dimension: d,
        arenaType: periodic ? ArenaType.PERIODIC_BOUNDARIES : ArenaType.REFLECTING_BOUNDARIES,
        arenaXSize: length,
        arenaYSize: height,
        arenaZSize: arena.zSize,
        types: Array.from({ length: k }, (_, kind) => {
          const n = count[r * k + kind]!;
          return {
            mass: 0,
            radius: n > 0 ? radius[r * k + kind]! / n : 0,
            count: n,
            initialTemperature: 0,
          };
        }),
        totalParticles: 0,
        totalMass: 0,
        totalInitialKE: 0,
        minParticleMass: 0,
      };
      const ideal = new Float64Array(k);
      const real = new Float64Array(k);
      // 1D: hard rods on a line have an exact equation of state, P L_net = N k T (PRED-10).
      let free = length;
      for (let kind = 0; kind < k; kind++) free -= 2 * radius[r * k + kind]!;
      for (let kind = 0; kind < k; kind++) {
        const t = ctx.types[kind]!;
        if (t.count === 0) continue;
        // N k T = 2 KE / d, so this needs no temperature of its own.
        const volume = effectiveVolume(ctx, t.radius);
        ideal[kind] = volume > 0 ? (2 * energy[r * k + kind]!) / (d * volume) : Infinity;
        real[kind] =
          d === 1
            ? free > 0
              ? (2 * energy[r * k + kind]!) / free
              : Infinity
            : ideal[kind]! * realGasPressureFactor(realGasX(ctx, kind), d);
      }
      results.push({ ideal, real });
    }
    return results;
  }

  /** The part of a side wall a particle's centre can reach (WallPressureTracker). */
  private wallArea(radius: number, time: number): number {
    const sim = this.simulation;
    const height = sim.piston ? sim.piston.positionAtTime(time) : sim.arena.ySize;
    if (sim.dimension === 1) return 1; // a force: momentum per time
    const area = height - 2 * radius;
    return sim.dimension === 3 ? area * (sim.arena.zSize - 2 * radius) : area;
  }

  private integrateKinetic(time: number): void {
    const dt = time - this.kineticAt;
    if (dt > 0) {
      for (let kind = 0; kind < this.kindCount; kind++)
        this.kineticIntegral[kind]! += this.kineticEnergy[kind]! * dt;
    }
    this.kineticAt = time;
  }

  private addKinetic(i: number, sign: 1 | -1): void {
    const kind = this.simulation.particles.color[i]!;
    if (kind < this.kindCount) this.kineticEnergy[kind]! += sign * this.particleKE(i);
  }

  /** 0.5 m v² in J. */
  private particleKE(i: number): number {
    const p = this.simulation.particles;
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    const vz = p.vz[i]!;
    return 0.5 * p.mass[i]! * AMU_KG * (vx * vx + vy * vy + vz * vz);
  }
}

const isSideWall = (side: number) => side === Wall.LEFT || side === Wall.RIGHT;

const positiveOr = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/** A separation along a periodic axis, folded to the nearest image. */
function nearestImage(delta: number, size: number): number {
  return delta - size * Math.round(delta / size);
}

/** Wall hits in time order (a growable ring buffer): time, slot and value. */
class HitQueue {
  private time = new Float64Array(256);
  private slot = new Int32Array(256);
  private value = new Float64Array(256);
  private head = 0;
  private length = 0;

  push(time: number, slot: number, value: number): void {
    if (this.length === this.time.length) this.grow();
    const at = (this.head + this.length) % this.time.length;
    this.time[at] = time;
    this.slot[at] = slot;
    this.value[at] = value;
    this.length++;
  }

  /** Forgets hits before `time`. */
  dropBefore(time: number): void {
    const capacity = this.time.length;
    while (this.length > 0 && this.time[this.head]! < time) {
      this.head = (this.head + 1) % capacity;
      this.length--;
    }
  }

  /** Adds the values of hits in [from, to] to `sums` by slot. */
  sumSince(from: number, to: number, sums: Float64Array): void {
    const capacity = this.time.length;
    for (let n = 0; n < this.length; n++) {
      const at = (this.head + n) % capacity;
      const t = this.time[at]!;
      if (t >= from && t <= to) sums[this.slot[at]!]! += this.value[at]!;
    }
  }

  private grow(): void {
    const capacity = this.time.length;
    const time = new Float64Array(capacity * 2);
    const slot = new Int32Array(capacity * 2);
    const value = new Float64Array(capacity * 2);
    for (let n = 0; n < this.length; n++) {
      const at = (this.head + n) % capacity;
      time[n] = this.time[at]!;
      slot[n] = this.slot[at]!;
      value[n] = this.value[at]!;
    }
    this.time = time;
    this.slot = slot;
    this.value = value;
    this.head = 0;
  }
}
