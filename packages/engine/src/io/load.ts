// Loads a `.set` file: converts it to JSON settings (../settings/set-convert.ts), then
// resolves those into SimulationSettings (../settings/resolve.ts). JSON settings files take
// the same path from the validation step on, so both formats run identically.
import { resolveSettings, type ResolveOptions, type SimulationSettings } from '../settings/resolve';
import { setToSettings } from '../settings/set-convert';

export type {
  AbscissaLimits,
  CustomColors,
  Dimension,
  ParticleSpecies,
  SimulationSettings,
  StatColor,
} from '../settings/resolve';
export { calculateTotalKE } from '../settings/resolve';

export interface LoadResult {
  settings: SimulationSettings;
  /** Header version, e.g. `V2.43`. */
  version: string;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
}

export type LoadOptions = ResolveOptions;

export function loadSettings(text: string, options: LoadOptions = {}): LoadResult {
  const { settings, version, warnings } = setToSettings(text);
  return { settings: resolveSettings(settings, options), version, warnings };
}
