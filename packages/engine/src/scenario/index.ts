// The web app's JSON scenario format: schema and validation, `.set` conversion, colour
// palettes, and resolution into the simulation's starting state.
export {
  SCENARIO_FORMAT,
  BOUNDARIES,
  DEFAULT_REACTION,
  ScenarioError,
  type Boundary,
} from './format';
export {
  SCENARIO_VERSION,
  MAXIMUM_WALL_TEMPERATURE,
  WALL_KINDS,
  ScenarioSchema,
  validateScenario,
  parseScenario,
  parseScenarioJson,
  stringifyScenario,
  type Kind,
  type Population,
  type Reaction,
  type RegionShape,
  type Scenario,
  type ScenarioInput,
  type SpawnRegion,
  type ValidationResult,
  type Wall,
  type WallKind,
  type WallStyle,
} from './schema';
export { ScenarioV1Schema, type ScenarioV1, type ScenarioV1Input } from './schema-v1';
export { migrateV1, KIND_A, KIND_B, KIND_A_NAME, KIND_B_NAME } from './migrate';
export {
  setFileToScenario,
  scenarioToSetFile,
  setFileCompatibility,
  SET_FILE_VERSION,
  type SetConversion,
} from './set-convert';
export {
  PALETTES,
  PALETTE_IDS,
  DEFAULT_PALETTE,
  LARGE_PALETTE,
  MARKERS,
  MAX_KINDS,
  ARENA_BACKGROUNDS,
  findColorProblems,
  paletteColor,
  type ColorProblem,
  type Marker,
  type Palette,
  type PaletteId,
} from './palettes';
export {
  resolveScenario,
  calculateTotalKE,
  parseHexColor,
  type ResolveOptions,
  type ResolvedScenario,
  type ResolvedWall,
  type ParticleSpecies,
} from './resolve';
export { loadPresetScenario, readScenarioFile, type ScenarioFile } from './sources';
export {
  ARENA_SIZE_LIMITS,
  SPECIES_LIMITS,
  describeSpecies,
  scenarioProblems,
  withArenaSize,
  withSpecies,
  type SpeciesSetup,
  type SpeciesSummary,
} from './edit';
export {
  contrastRatio,
  DEFAULT_WALL_STYLES,
  relativeLuminance,
  wallStyle,
  type ResolvedWallStyle,
  type WallKindType,
} from './wall-styles';
