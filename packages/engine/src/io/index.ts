// Settings files (.set): parsing, loading into SimulationSettings, and the bundled presets.
export { parseSetFile, parseNumber, SetFileError, SetGroup, type SetFile } from './set-file';
export {
  loadSettings,
  calculateTotalKE,
  type AbscissaLimits,
  type CustomColors,
  type LoadOptions,
  type LoadResult,
  type ParticleSpecies,
  type SimulationSettings,
} from './load';
export { presetNames, loadPresetText, loadDefaultSettingsText } from './presets';
