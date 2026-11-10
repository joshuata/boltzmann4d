// Port of utils/data/ParticleType.java.

/** Colors from fullapplication/view/simulationsettings/DefaultParticleInfo.java, as 0xRRGGBB. */
export const DefaultParticleInfo = {
  RED: 0xff3333,
  BLUE: 0x105cbf,
  GREEN: 0x7ae819,
  YELLOW: 0xffff00,
  PURPLE: 0x8e81bc,
} as const;

export class ParticleType {
  readonly displayName: string;
  /** Mass in AMU. */
  readonly particleMass: number;
  /**
   * Radius in meters (usually on the order of 1.0E-9). Not readonly: SimSettingsController
   * shrinks particle types when none would fit in the arena.
   */
  particleRadius: number;
  /** Default color as 0xRRGGBB. */
  readonly defaultColor: number;

  constructor(mass: number, radius: number, defaultColor: number, displayName: string) {
    this.particleMass = mass;
    this.particleRadius = radius;
    this.defaultColor = defaultColor;
    this.displayName = displayName;
  }

  toString(): string {
    return this.displayName;
  }
}
