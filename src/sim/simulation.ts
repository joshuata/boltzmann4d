// The event-driven simulation (port of the core of Physics.java): owns the particles and
// the event calendar, performs events in time order, and re-predicts what each event
// changed.
//
// Scope (plan 0002): 2D hard spheres in reflecting and periodic arenas. The calendar
// update order in calUpdate() follows Physics.CalUpdate exactly, because with tied event
// times the calendar's choice depends on the order of updates.
import { createCounters } from './counters';
import { CalendarUpdate, Collision, MAX_TIME, createEvent, type EventInfo } from './event';
import { EventCalendar } from './event-calendar';
import type { Dimension, RenderFrame } from './index';
import {
  boundaryCollide2D,
  collide2D,
  initPeriodicFlags2D,
  moveToTime2D,
  predictBoundary2D,
  predictPair2D,
} from './particle-2d';
import { Particles, type Arena } from './particles';
import { ArenaType } from './simulation-info';

// Local copies for the hot paths (see plan 0002).
const predictPair = predictPair2D;
const predictBoundary = predictBoundary2D;
const collide = collide2D;
const boundaryCollide = boundaryCollide2D;
const moveToTime = moveToTime2D;
const NEVER = MAX_TIME;
const PARTICLE = Collision.PARTICLE;
const { BOUNDARY, EOB, WALL } = Collision;
const { PARTICLE_1, PARTICLE_2, PARTICLE_ALL, BOUNDARY_ALL, EVERYTHING } = CalendarUpdate;

/** Simulation time per displayed frame, in seconds (Physics.DEFAULT_FRAME_DURATION). */
export const DEFAULT_FRAME_DURATION = 0.404706830433 * 1e-12;

/** amu·m²/s² → J (Units.Energy.AMU_JOULE), applied as Java's Units.convert does. */
const AMU_JOULE = 1.660538782e-27;

/** One kind of particle and where its particles start. Matches io's ParticleSpecies. */
export interface InitialSpecies {
  type: { particleMass: number; particleRadius: number };
  /** x, y, z per particle, meters. */
  positions: Float64Array;
  /** x, y, z per particle, m/s. */
  velocities: Float64Array;
}

/** Everything the simulation starts from. io's SimulationSettings satisfies this. */
export interface InitialState {
  dimension: Dimension;
  arenaType: ArenaType;
  /** Meters. */
  arenaXSize: number;
  arenaYSize: number;
  arenaZSize: number;
  species: readonly InitialSpecies[];
}

export interface SimulationOptions {
  /** Simulation seconds per frame; defaults to DEFAULT_FRAME_DURATION. */
  frameDuration?: number;
  /** Called with each event just before it is performed (where statistics plug in). */
  onEvent?: (event: Readonly<EventInfo>) => void;
}

export class Simulation {
  readonly dimension: Dimension;
  readonly arena: Arena;
  readonly particles: Particles;
  readonly calendar: EventCalendar;

  /**
   * Work done so far. `events` counts every event performed; the others break it down
   * or count predictions (pair and boundary).
   */
  readonly counters = createCounters(
    'events',
    'particleCollisions',
    'wallCollisions',
    'boundaryCrossings',
    'pairPredictions',
    'boundaryPredictions',
  );

  /** Simulation time (s) every particle has been moved to by the last advanceToTime(). */
  time = 0;
  frameDuration: number;

  private readonly onEvent: SimulationOptions['onEvent'];
  private readonly event = createEvent();
  private readonly action = createEvent();
  private readonly prediction = createEvent();
  private firstRun = true;
  private currentFrame: RenderFrame | null = null;

  constructor(init: InitialState, options: SimulationOptions = {}) {
    if (init.dimension !== 2) {
      throw new Error(`${init.dimension}D simulation is not supported yet`);
    }
    if (
      init.arenaType !== ArenaType.REFLECTING_BOUNDARIES &&
      init.arenaType !== ArenaType.PERIODIC_BOUNDARIES
    ) {
      throw new Error(`Arena type ${init.arenaType} is not supported yet`);
    }
    this.dimension = init.dimension;
    this.arena = {
      type: init.arenaType,
      xSize: init.arenaXSize,
      ySize: init.arenaYSize,
      zSize: init.arenaZSize,
    };
    this.frameDuration = options.frameDuration ?? DEFAULT_FRAME_DURATION;
    this.onEvent = options.onEvent;

    // Particles in species order, as Physics does with SimulationInfo's particle types.
    const count = init.species.reduce((n, s) => n + s.positions.length / 3, 0);
    const p = new Particles(count);
    let i = 0;
    init.species.forEach((species, typeIndex) => {
      for (let k = 0; k < species.positions.length / 3; k++, i++) {
        p.x[i] = species.positions[3 * k]!;
        p.y[i] = species.positions[3 * k + 1]!;
        p.z[i] = species.positions[3 * k + 2]!;
        p.vx[i] = species.velocities[3 * k]!;
        p.vy[i] = species.velocities[3 * k + 1]!;
        p.vz[i] = species.velocities[3 * k + 2]!;
        p.radius[i] = species.type.particleRadius;
        p.mass[i] = species.type.particleMass;
        p.type[i] = typeIndex;
        initPeriodicFlags2D(p, i, this.arena);
      }
    });
    this.particles = p;

    this.calendar = new EventCalendar(count);
    this.calUpdate(this.setAction(EVERYTHING));
    if (this.arena.type === ArenaType.PERIODIC_BOUNDARIES) this.setTotalMomentum(0, 0);
  }

  /** Time of the next event, or MAX_TIME if nothing will ever happen. */
  nextEventTime(): number {
    return this.calendar.nextEventTime();
  }

  /**
   * Performs the next event, if there is one, and returns it (valid until the next call).
   * Particles not involved keep their own t0; call advanceToTime() for a consistent state.
   */
  step(): Readonly<EventInfo> | null {
    if (this.calendar.nextEventTime() === NEVER) return null;
    return this.performNextEvent();
  }

  /**
   * Performs every event up to and including `maxTime`, then moves every particle to
   * `maxTime` (Physics.advanceToTime).
   */
  advanceToTime(maxTime: number): void {
    const calendar = this.calendar;
    while (calendar.nextEventTime() <= maxTime) this.performNextEvent();
    const p = this.particles;
    for (let i = 0; i < p.count; i++) moveToTime(p, i, maxTime);
    this.time = maxTime;
  }

  /** Frame API used by the worker's ThreadController (Physics.advanceToNextFrame). */
  advanceToNextFrame(): void {
    if (this.firstRun) {
      this.firstRun = false;
    } else {
      this.advanceToTime(this.time + this.frameDuration);
    }
    this.currentFrame = this.snapshot();
  }

  getCurrentFrame(): RenderFrame {
    if (!this.currentFrame) throw new Error('advanceToNextFrame() has not been called yet');
    return this.currentFrame;
  }

  stopProcessingCurrentFrame(): void {
    // Frames run synchronously inside the worker, so a pause can't arrive mid-frame.
  }

  /** Current positions (dimension-strided, meters) and types, in fresh transferable arrays. */
  snapshot(): RenderFrame {
    const p = this.particles;
    const positions = new Float64Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      positions[2 * i] = p.x[i]!;
      positions[2 * i + 1] = p.y[i]!;
    }
    return { dimension: this.dimension, time: this.time, positions, types: p.type.slice() };
  }

  /** Total kinetic energy in joules (sum of Particle2D.getKE). */
  kineticEnergy(): number {
    let total = 0;
    for (let i = 0; i < this.particles.count; i++) total += this.particleKE(i);
    return total;
  }

  private performNextEvent(): Readonly<EventInfo> {
    const calendar = this.calendar;
    calendar.nextEvent(this.event);
    const event = this.event;
    this.onEvent?.(event);
    this.counters.events++;

    const p = this.particles;
    const action = this.action;
    if (event.type === PARTICLE) {
      moveToTime(p, event.part1, event.time);
      moveToTime(p, event.part2, event.time);
      collide(p, event.part1, event.part2, event, this.arena);
      this.counters.particleCollisions++;
      action.type = PARTICLE_2;
      action.part1 = event.part1;
      action.part2 = event.part2;
    } else {
      boundaryCollide(p, event.part1, event, this.arena);
      if (event.type === WALL) this.counters.wallCollisions++;
      else if (event.type === BOUNDARY || event.type === EOB) this.counters.boundaryCrossings++;
      action.type = PARTICLE_1;
      action.part1 = event.part1;
      action.part2 = event.part2;
    }
    this.calUpdate(action);
    return event;
  }

  /**
   * Re-predicts the events an action affected and finds the new minimum
   * (Physics.CalUpdate). The order of calendar updates matches Java exactly.
   */
  private calUpdate(action: EventInfo): void {
    const calendar = this.calendar;
    const p = this.particles;
    const arena = this.arena;
    const n = p.count;
    const out = this.prediction;
    const counters = this.counters;
    calendar.markForUpdate(action);

    switch (action.type) {
      case PARTICLE_2: {
        const a = action.part1;
        const b = action.part2;
        for (let i = 0; i < n; i++) {
          if (i !== a) {
            predictPair(p, a, i, arena, out);
            calendar.update(out.type, a, i, out.side, out.time);
          }
          if (i !== b) {
            predictPair(p, b, i, arena, out);
            calendar.update(out.type, b, i, out.side, out.time);
          }
        }
        counters.pairPredictions += 2 * (n - 1);
        // Periodic arenas: a and b may meet again through another image.
        if (arena.type === ArenaType.PERIODIC_BOUNDARIES) {
          predictPair(p, a, b, arena, out);
          calendar.update(PARTICLE, a, b, out.side, out.time);
          counters.pairPredictions++;
        }
        predictBoundary(p, a, arena, out);
        calendar.update(out.type, a, 0, out.side, out.time);
        predictBoundary(p, b, arena, out);
        calendar.update(out.type, b, 0, out.side, out.time);
        counters.boundaryPredictions += 2;
        break;
      }
      case PARTICLE_1: {
        const a = action.part1;
        for (let i = 0; i < n; i++) {
          if (i !== a) {
            predictPair(p, a, i, arena, out);
            calendar.update(out.type, a, i, out.side, out.time);
          }
        }
        counters.pairPredictions += n - 1;
        predictBoundary(p, a, arena, out);
        calendar.update(out.type, a, 0, out.side, out.time);
        counters.boundaryPredictions++;
        break;
      }
      case PARTICLE_ALL:
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < i; j++) {
            predictPair(p, i, j, arena, out);
            calendar.update(out.type, i, j, out.side, out.time);
          }
        }
        counters.pairPredictions += (n * (n - 1)) / 2;
        break;
      case BOUNDARY_ALL:
        for (let i = 0; i < n; i++) {
          predictBoundary(p, i, arena, out);
          calendar.update(out.type, i, 0, out.side, out.time);
        }
        counters.boundaryPredictions += n;
        break;
      case EVERYTHING:
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < i; j++) {
            predictPair(p, i, j, arena, out);
            calendar.update(out.type, i, j, out.side, out.time);
          }
          predictBoundary(p, i, arena, out);
          calendar.update(out.type, i, 0, out.side, out.time);
        }
        counters.pairPredictions += (n * (n - 1)) / 2;
        counters.boundaryPredictions += n;
        break;
    }
    calendar.findMinimum();
  }

  /**
   * Periodic arenas: shifts every velocity so total momentum is (xMom, yMom), then rescales
   * to restore the original kinetic energy, and re-predicts everything (SetTotalMom).
   */
  private setTotalMomentum(xMom: number, yMom: number): void {
    const p = this.particles;
    const n = p.count;
    if (n < 2) return;
    let origKE = 0;
    let currX = 0;
    let currY = 0;
    for (let i = 0; i < n; i++) {
      origKE += this.particleKE(i);
      currX += p.vx[i]! * p.mass[i]!;
      currY += p.vy[i]! * p.mass[i]!;
    }
    if (!(origKE > 0.0)) return;
    const xAdj = (currX - xMom) / n;
    const yAdj = (currY - yMom) / n;
    let currKE = 0;
    for (let i = 0; i < n; i++) {
      const mass = p.mass[i]!;
      p.vx[i] = snapSubtract(p.vx[i]!, xAdj / mass);
      p.vy[i] = snapSubtract(p.vy[i]!, yAdj / mass);
      currKE += this.particleKE(i);
    }
    if (currKE > 0.0) {
      const f = Math.sqrt(origKE / currKE);
      for (let i = 0; i < n; i++) {
        p.vx[i] = p.vx[i]! * f;
        p.vy[i] = p.vy[i]! * f;
      }
    }
    this.calUpdate(this.setAction(EVERYTHING));
  }

  /** Particle2D.getKE: 0.5·m·|v|² in amu·m²/s², converted to joules. */
  private particleKE(i: number): number {
    const p = this.particles;
    const vx = p.vx[i]!;
    const vy = p.vy[i]!;
    const speed = Math.sqrt(0.0 + vx * vx + vy * vy);
    const energy = 0.5 * p.mass[i]! * speed * speed;
    return (energy * AMU_JOULE) / 1.0;
  }

  private setAction(type: EventInfo['type']): EventInfo {
    const action = this.action;
    action.type = type;
    action.time = 0;
    action.part1 = action.part2 = action.side = 0;
    return action;
  }
}

/**
 * value1 - value2, snapped to 0 when the difference is within about 1e-14 of the larger
 * operand (Particle.snapSubtract), so cancelling momenta land on exactly zero.
 */
export function snapSubtract(value1: number, value2: number): number {
  const max = Math.max(Math.abs(value1), Math.abs(value2));
  const diff = value1 - value2;
  const relativeError = Math.abs(diff) / max;
  if (relativeError < 1.0e-14 && relativeError !== 0.0) return 0.0;
  return diff;
}
