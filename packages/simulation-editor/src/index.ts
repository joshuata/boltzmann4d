// The scenario editor: draws scenarios for the simulator (plan 0010), and keeps the
// scenarios the user saves in this browser (plan 0008).
export { default as SimulationEditor } from './SimulationEditor.svelte';
export { decodeScenarioLink, encodeScenarioLink } from './scenario-link';
export { summarizeScenario } from './summary';
export {
  deleteScenario,
  getDefaultScenario,
  getDefaultScenarioId,
  getScenario,
  isReadable,
  keepOpenedFile,
  listScenarios,
  saveScenario,
  setDefaultScenarioId,
  type SavedScenario,
  type UnreadableScenario,
} from './scenario-store';
