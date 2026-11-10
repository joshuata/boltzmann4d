// Loads a `.set` file: converts it to a JSON scenario (../scenario/set-convert.ts), then
// resolves that into a ResolvedScenario (../scenario/resolve.ts). JSON scenario files take
// the same path from the validation step on, so both formats run identically.
import { resolveScenario, type ResolveOptions, type ResolvedScenario } from '../scenario/resolve';
import { setFileToScenario } from '../scenario/set-convert';

export type {
  AbscissaLimits,
  CustomColors,
  Dimension,
  ParticleSpecies,
  ResolvedScenario,
  StatKinds,
} from '../scenario/resolve';
export { calculateTotalKE } from '../scenario/resolve';

export interface LoadResult {
  scenario: ResolvedScenario;
  /** Header version, e.g. `V2.43`. */
  version: string;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
}

export type LoadOptions = ResolveOptions;

export function loadSetFile(text: string, options: LoadOptions = {}): LoadResult {
  const { scenario, version, warnings } = setFileToScenario(text);
  return { scenario: resolveScenario(scenario, options), version, warnings };
}
