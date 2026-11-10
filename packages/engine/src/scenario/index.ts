// The web app's JSON scenario format: schema and validation, `.set` conversion, and
// resolution into the simulation's starting state.
export {
  SCENARIO_FORMAT,
  SCENARIO_VERSION,
  BOUNDARIES,
  ScenarioSchema,
  ScenarioError,
  validateScenario,
  parseScenario,
  parseScenarioJson,
  stringifyScenario,
  type Boundary,
  type ParticleColor,
  type ParticleGroup,
  type Scenario,
  type ScenarioInput,
  type ValidationResult,
} from './schema';
export {
  setFileToScenario,
  scenarioToSetFile,
  SET_FILE_VERSION,
  type SetConversion,
} from './set-convert';
export {
  resolveScenario,
  calculateTotalKE,
  type ResolveOptions,
  type ResolvedScenario,
  type ParticleSpecies,
} from './resolve';
export { loadPresetScenario, readScenarioFile, type ScenarioFile } from './sources';
