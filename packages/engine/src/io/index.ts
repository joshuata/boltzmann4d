// .set files: parsing, loading into a ResolvedScenario, and the bundled presets.
export { parseSetFile, parseNumber, SetFileError, SetGroup, type SetFile } from './set-file';
export {
  loadSetFile,
  calculateTotalKE,
  type AbscissaLimits,
  type CustomColors,
  type LoadOptions,
  type LoadResult,
  type ParticleSpecies,
  type ResolvedScenario,
} from './load';
export { presetNames, loadPresetText, loadDefaultSetFileText } from './presets';
