// Where scenarios come from: the bundled presets, and files the user opens (FILE-1).
import { loadDefaultSetFileText, loadPresetText } from '../io/presets';
import { SetFileError } from '../io/set-file';
import { parseScenarioJson, ScenarioError, type Scenario } from './schema';
import { setFileToScenario } from './set-convert';

/** A bundled preset as a scenario; `default` (or no name) is the scenario the Java app opens with. */
export async function loadPresetScenario(name = 'default'): Promise<Scenario> {
  const text = name === 'default' ? await loadDefaultSetFileText() : await loadPresetText(name);
  return setFileToScenario(text).scenario;
}

export interface ScenarioFile {
  scenario: Scenario;
  format: 'json' | 'set';
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
}

/**
 * Reads a scenario file the user picked: Boltzmann 4D JSON, or a Boltzmann 3D `.set` file.
 * The format follows the extension, or the content when the extension is neither. Throws a
 * ScenarioError listing every problem found.
 */
export function readScenarioFile(fileName: string, text: string): ScenarioFile {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();
  const isJson = extension === 'json' || (extension !== 'set' && text.trimStart().startsWith('{'));
  if (isJson) return { scenario: parseScenarioJson(text), format: 'json', warnings: [] };
  try {
    const { scenario, warnings } = setFileToScenario(text);
    return { scenario, format: 'set', warnings };
  } catch (error) {
    if (error instanceof SetFileError) throw new ScenarioError(error.message.split('\n'));
    throw error;
  }
}
