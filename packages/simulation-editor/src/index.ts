// The simulation editor: builds scenarios for the simulator (plan 0008), and the scenarios
// the user keeps in this browser.
export { default as SimulationEditor } from './SimulationEditor.svelte';
export { summarizeScenario } from './form';
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
