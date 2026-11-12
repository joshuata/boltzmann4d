// What students watch while particles react (SIM-28, STORY-26, 27, 33): each kind's count
// now, its time-averaged count and width, when each count was first reached, and the
// predicted equilibrium (PRED-12).
//
// The meter only observes: Simulation calls beforeEvent and afterEvent around every event
// (SimulationOptions.onEvent / afterEvent). Only the two particles of an event can react,
// so the counts are kept exactly by comparing their kinds before and after, and a reading
// never recounts the particles.
import type { EventInfo } from '../sim/event';
import type { ReactionRule } from '../sim/reactions';
import type { Simulation } from '../sim/simulation';
import { ArenaType } from '../sim/simulation-info';
import { convert } from '../utils/units';
import { reactionEquilibrium } from './formulas';

/** The predicted equilibrium of the one rule `X + X ⇌ Y + Y` (PRED-12). */
export interface ReactionPrediction {
  /** The product kind Y (a species index). */
  product: number;
  /** Predicted average number of Y and its width. */
  average: number;
  width: number;
}

export interface ReactionReading {
  /** Simulation time of the reading, s. */
  time: number;
  /** Per kind (species index), how many particles show it now. */
  counts: number[];
  /** Per kind, the count averaged over time since `averagingSince` (NaN before any time). */
  averages: number[];
  /** Per kind, the width sqrt(⟨n²⟩ − ⟨n⟩²) of that average. */
  widths: number[];
  /** When the averages started (the run's start or the last reset), s. */
  averagingSince: number;
  /**
   * Per kind, the time (s) its count first reached each value: `firstReached[k][n]` is
   * when kind k first had n particles (or more). Values it hasn't reached are left out.
   */
  firstReached: number[][];
  /** The prediction, or null with `noPrediction` saying why. */
  prediction: ReactionPrediction | null;
  noPrediction?: string;
}

export class ReactionMeter {
  private readonly simulation: Simulation;
  private readonly kinds: number;
  private readonly counts: Float64Array;
  /** Per kind, Σ n·dt and Σ n²·dt since `since`, up to `lastChange`. */
  private readonly sum: Float64Array;
  private readonly squares: Float64Array;
  private readonly reached: number[][];
  private since: number;
  private lastChange: number;
  private before1 = -1;
  private before2 = -1;
  /** The rule a prediction is made for, or why there's none. */
  private readonly predicted: { reactant: number; product: number; deltaE: number } | string;
  private readonly oddProducts: boolean;

  constructor(simulation: Simulation, rules: readonly ReactionRule[], kinds: number) {
    this.simulation = simulation;
    this.kinds = kinds;
    this.counts = new Float64Array(kinds);
    for (const c of simulation.particles.color) this.counts[c] = this.counts[c]! + 1;
    this.sum = new Float64Array(kinds);
    this.squares = new Float64Array(kinds);
    this.since = this.lastChange = simulation.time;
    this.reached = Array.from(this.counts, (n) => new Array<number>(n + 1).fill(simulation.time));
    this.predicted = predictable(simulation, rules, this.counts);
    this.oddProducts =
      typeof this.predicted !== 'string' && this.counts[this.predicted.product]! % 2 === 1;
  }

  /** Every event, just before it is performed. */
  beforeEvent(event: Readonly<EventInfo>): void {
    const color = this.simulation.particles.color;
    this.before1 = color[event.part1] ?? -1;
    this.before2 = color[event.part2] ?? -1;
  }

  /** Every event, just after it is performed: counts what its particles turned into. */
  afterEvent(event: Readonly<EventInfo>): void {
    const color = this.simulation.particles.color;
    const after1 = color[event.part1] ?? -1;
    const after2 = color[event.part2] ?? -1;
    if (after1 === this.before1 && after2 === this.before2) return;
    this.accumulate(event.time);
    this.recolor(this.before1, after1, event.time);
    // The same particle on both sides (a wall event) changes once.
    if (event.part2 !== event.part1) this.recolor(this.before2, after2, event.time);
  }

  /** Starts the time averages again from `time` (s), e.g. once the gas has equilibrated. */
  resetAverages(time: number): void {
    this.sum.fill(0);
    this.squares.fill(0);
    this.since = this.lastChange = time;
  }

  /** The readout at simulation time `time` (s; no earlier than the last event). */
  read(time: number = this.simulation.time): ReactionReading {
    const span = time - this.since;
    const pending = time - this.lastChange;
    const averages: number[] = [];
    const widths: number[] = [];
    for (let k = 0; k < this.kinds; k++) {
      const n = this.counts[k]!;
      const average = (this.sum[k]! + n * pending) / span;
      const square = (this.squares[k]! + n * n * pending) / span;
      averages.push(span > 0 ? average : NaN);
      widths.push(span > 0 ? Math.sqrt(Math.max(0, square - average * average)) : NaN);
    }
    const reading: ReactionReading = {
      time,
      counts: Array.from(this.counts),
      averages,
      widths,
      averagingSince: this.since,
      firstReached: this.reached.map((times) => [...times]),
      prediction: null,
    };
    if (typeof this.predicted === 'string') {
      reading.noPrediction = this.predicted;
      return reading;
    }
    const { reactant, product, deltaE } = this.predicted;
    const n = this.counts[reactant]! + this.counts[product]!;
    if (n !== this.simulation.particles.count) {
      reading.noPrediction = 'Only particles that take part in the reaction can be present.';
      return reading;
    }
    // The total energy with the reactant as zero: each product stores ΔE/2.
    const energy = this.simulation.kineticEnergy() + (this.counts[product]! * deltaE) / 2;
    const { average, width } = reactionEquilibrium(
      n,
      this.simulation.dimension,
      energy,
      deltaE,
      this.oddProducts,
    );
    reading.prediction = { product, average, width };
    return reading;
  }

  /** Adds the time since the last change to the running sums. */
  private accumulate(time: number): void {
    const dt = time - this.lastChange;
    for (let k = 0; k < this.kinds; k++) {
      const n = this.counts[k]!;
      this.sum[k] = this.sum[k]! + n * dt;
      this.squares[k] = this.squares[k]! + n * n * dt;
    }
    this.lastChange = time;
  }

  private recolor(from: number, to: number, time: number): void {
    if (from === to || from < 0 || to < 0) return;
    this.counts[from] = this.counts[from]! - 1;
    const n = (this.counts[to] = this.counts[to]! + 1);
    const times = this.reached[to]!;
    while (times.length <= n) times.push(time);
  }
}

/**
 * The rule the partition-function prediction applies to (PRED-12): exactly one rule
 * X + X ⇌ Y + Y with the reverse allowed, in a box with hard walls (the energy must be
 * fixed and only kinetic, so no wells, and no periodic arena, whose fixed momentum takes
 * away degrees of freedom). Otherwise says why there's none.
 */
function predictable(
  simulation: Simulation,
  rules: readonly ReactionRule[],
  counts: Float64Array,
): { reactant: number; product: number; deltaE: number } | string {
  const [rule, ...others] = rules;
  if (!rule) return 'No reaction is running.';
  const [x, x2] = rule.reactants;
  const [y, y2] = rule.products;
  if (others.length > 0 || x !== x2 || y !== y2 || x === y) {
    return 'The prediction is for a single reaction of the form A + A ⇌ B + B.';
  }
  if (rule.suppressReverse) return 'With the reverse reaction off, every A ends up as B.';
  if (simulation.arena.type === ArenaType.PERIODIC_BOUNDARIES) {
    return 'The prediction assumes walls; periodic boundaries also fix the total momentum.';
  }
  if (simulation.hasWells || simulation.wall) {
    return 'The prediction assumes hard spheres; square wells store energy too.';
  }
  if (counts.some((n, k) => n > 0 && k !== x && k !== y)) {
    return 'Only particles that take part in the reaction can be present.';
  }
  return { reactant: x, product: y, deltaE: convert('kJ/mol', 'J', rule.forward - rule.reverse) };
}
