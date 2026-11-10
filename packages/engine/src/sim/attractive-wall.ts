// The attractive wall (Energy Wells tab): a square well along the bottom wall. A particle
// whose centre comes within `width` of the bottom gains `energy` of kinetic energy, and
// pays it back to leave. (Java's optional heat reservoir on that wall is deferred to
// joshuata/boltzmann4d#34: its rule can't bring the gas to the reservoir temperature.)
//
// Java's version has bugs, fixed here (joshuata/boltzmann4d#24): it changed the normal
// speed by sqrt(2E/m) instead of the kinetic energy by E (so energy wasn't conserved), let
// particles jump back in x on crossing, and let particles leave without the energy to.

/** amu·m²/s² per J. */
const AMU_KG = 1.660538782e-27;

export interface AttractiveWallOptions {
  /** Height of the well above the bottom wall, m (Java's default: 10 nm). */
  width: number;
  /** Depth, kJ/mol (Java's default: 2.5). */
  depth: number;
}

export interface AttractiveWall {
  width: number;
  /** Depth per particle, amu·m²/s². */
  energy: number;
}

export function createAttractiveWall(options: AttractiveWallOptions): AttractiveWall {
  // kJ/mol → J per particle → amu·m²/s², as Java's Units.convert does.
  const joules = (options.depth * (1.0e3 / 6.02214179e23)) / 1.0;
  return {
    width: options.width,
    energy: joules / AMU_KG,
  };
}
