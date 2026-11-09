// Partial port of model/statistics/Formulas.java: the pieces the settings loader needs.
// The rest of Formulas comes with the statistics port (plan 0001, step 5).

/** Boltzmann constant in J/K. */
export const BOLTZMANN_CONST = 1.3806504e-23;
/** Gas constant in kJ/(mol·K). */
export const GAS_CONSTANT = 0.008314472;

/** Speed in m/s for a kinetic energy in J and a mass in kg. */
export function speed(kineticEnergy: number, mass: number): number {
  return Math.sqrt((2.0 * kineticEnergy) / mass);
}

/** Average kinetic energy in J for the given temperature (K) and degrees of freedom. */
export function avgKineticEnergy(temperature: number, dimension: number): number {
  return (dimension * BOLTZMANN_CONST * temperature) / 2.0;
}
