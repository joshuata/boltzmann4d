// The web app's JSON settings format: schema and validation, `.set` conversion, and
// resolution into the simulation's starting state.
export {
  SETTINGS_FORMAT,
  SETTINGS_VERSION,
  BOUNDARIES,
  SettingsSchema,
  SettingsError,
  validateSettings,
  parseSettings,
  parseSettingsJson,
  stringifySettings,
  type Boundary,
  type ParticleColor,
  type ParticleGroup,
  type Settings,
  type SettingsInput,
  type ValidationResult,
} from './schema';
export { setToSettings, settingsToSet, SET_FILE_VERSION, type SetConversion } from './set-convert';
export {
  resolveSettings,
  calculateTotalKE,
  type ResolveOptions,
  type SimulationSettings,
  type ParticleSpecies,
} from './resolve';
