// The movable piston (Piston.java): a horizontal wall that comes down from the top of the
// arena. Its `level` is the fraction of the arena height it has pushed in (0 = at the top),
// and it moves at a constant speed towards a target level. Its state only changes at frame
// ends (moveToTime) and when it's told to move, so predictions made at any time in a frame
// see the same piston.
//
// The arithmetic follows Java's exactly, since particle predictions against the piston
// must match bit for bit (src/sim/parity.test.ts).

export const PistonMode = {
  /** No heat exchange: particles bouncing off the moving piston gain or lose energy. */
  ADIABATIC: 'ADIABATIC',
  /** The walls act as a thermostat that holds the starting kinetic energy. */
  ISOTHERMAL: 'ISOTHERMAL',
  /** Jump straight to the target level. */
  INSTANTANEOUS: 'INSTANTANEOUS',
} as const;
export type PistonMode = (typeof PistonMode)[keyof typeof PistonMode];

/** Default piston speed, m/s (Piston.speed). */
export const DEFAULT_PISTON_SPEED = 200.0;

export class Piston {
  /** Fraction of the arena height pushed in, as of `t0`. */
  curLevel: number;
  targetLevel: number;
  /** Time `curLevel` refers to: the last frame end (or the start). */
  t0: number;
  /** m/s. */
  speed = DEFAULT_PISTON_SPEED;
  /** Arena height, m: the piston moves along y in 2D (getRelevantArenaDim). */
  readonly arenaSize: number;

  constructor(time: number, curLevel: number, arenaSize: number) {
    this.curLevel = curLevel;
    this.targetLevel = curLevel;
    this.t0 = time;
    this.arenaSize = arenaSize;
  }

  isStopped(): boolean {
    return this.curLevel === this.targetLevel;
  }

  isMoving(time: number): boolean {
    return !this.isStopped() && time < this.stopTime();
  }

  /** Change of level per second, towards the target. */
  levelVelocity(): number {
    return ((this.targetLevel < this.curLevel ? -1.0 : 1.0) * this.speed) / this.arenaSize;
  }

  /** Velocity along y, m/s (negative while pushing in). */
  velocity(): number {
    return -1.0 * this.levelVelocity() * this.arenaSize;
  }

  /** y of the piston face as of t0, m. */
  position(): number {
    return (1.0 - this.curLevel) * this.arenaSize;
  }

  stopPosition(): number {
    return (1.0 - this.targetLevel) * this.arenaSize;
  }

  stopTime(): number {
    return this.t0 + Math.abs((this.targetLevel - this.curLevel) / this.levelVelocity());
  }

  positionAtTime(t: number): number {
    return this.isMoving(t)
      ? this.position() + this.velocity() * (t - this.t0)
      : this.stopPosition();
  }

  velocityAtTime(t: number): number {
    return this.isMoving(t) ? this.velocity() : 0.0;
  }

  /** Advances the piston to `time` (a frame end). */
  moveToTime(time: number): void {
    if (this.isMoving(time)) {
      this.curLevel = this.curLevel + (time - this.t0) * this.levelVelocity();
    } else if (this.isMoving(this.t0) && !this.isMoving(time)) {
      this.curLevel = this.targetLevel;
    }
    this.t0 = time;
  }

  /** Whether the piston is drawn: inside the arena and pushed in at all. */
  isVisible(): boolean {
    return !(this.position() >= this.arenaSize || this.curLevel <= 0.0);
  }
}

/**
 * The highest level the piston may be pushed to, as a percentage of the arena height
 * (Physics.calculateCompressionLimit, 2D): the particles, taken as squares of their
 * diameter, must fit below it, with two of the largest diameters to spare.
 */
export function compressionLimitPercent(
  arenaXSize: number,
  arenaYSize: number,
  species: readonly { radius: number; count: number }[],
): number {
  let totalParticleVolume = 0.0;
  let biggestDiameter = 0.0;
  for (const { radius, count } of species) {
    const diameter = 2.0 * radius;
    if (diameter > biggestDiameter) biggestDiameter = diameter;
    totalParticleVolume += diameter * diameter * count;
  }
  let minimumLength = totalParticleVolume / arenaXSize;
  minimumLength += 2.0 * biggestDiameter;
  if (minimumLength > arenaYSize) minimumLength = arenaYSize;
  return (100.0 * minimumLength) / arenaYSize;
}
