// The editor's state: the scenario being edited with its undo history (EDIT-15), the
// selection, the drawing tool and snapping, and the problems found as the user edits
// (EDIT-16). Components read it and call its methods; every change to the scenario goes
// through edit(), so it can be undone.
import {
  resolveScenario,
  ScenarioError,
  scenarioProblems,
  validateScenario,
  type Scenario,
} from '@boltzmann4d/engine/scenario';
import { seededRandom } from '@boltzmann4d/engine/sim/scenes';
import { blankScenario, problemTarget, type SelectionKey } from './scenario-ops';

export type Tool =
  'select' | 'segment' | 'rectangle' | 'polygon' | 'region-rectangle' | 'region-polygon';

/** Edits with the same key this close together are one undo step (typing, nudging). */
const MERGE_MS = 800;
/** Most undo steps kept. */
const HISTORY = 200;

export interface Problem {
  message: string;
  /** The shape it's about, if any. */
  target: SelectionKey | null;
}

export class EditorState {
  scenario = $state.raw<Scenario>(blankScenario());
  /** File name for downloads and the run, without extension. */
  name = $state('New scenario');
  selection = $state.raw<SelectionKey[]>([]);
  tool = $state<Tool>('select');
  snapping = $state(true);
  /** Something for screen readers to say (selection changes, refusals; EDIT-22). */
  announcement = $state('');

  #past = $state.raw<Scenario[]>([]);
  #future = $state.raw<Scenario[]>([]);
  #lastKey: string | null = null;
  #lastAt = 0;

  /** Problems from the schema, at once. */
  readonly validation = $derived(validateScenario(this.scenario));
  /** Problems placing the particles, a moment after the scenario stops changing. */
  placementProblems = $state.raw<string[]>([]);
  readonly problems: Problem[] = $derived.by(() => {
    const messages = this.validation.success
      ? [...scenarioProblems(this.validation.scenario), ...this.placementProblems]
      : this.validation.problems;
    return messages.map((message) => ({
      message,
      target: problemTarget(this.scenario, message),
    }));
  });
  /** The scenario, when it can run (EDIT-16: one with problems can't). */
  readonly runnable: Scenario | null = $derived(
    this.validation.success && this.problems.length === 0 ? this.validation.scenario : null,
  );

  get canUndo() {
    return this.#past.length > 0;
  }
  get canRedo() {
    return this.#future.length > 0;
  }

  /** Starts editing a scenario afresh (EDIT-17): no history, nothing selected. */
  open(scenario: Scenario, name: string): void {
    this.scenario = scenario;
    this.name = name;
    this.selection = [];
    this.#past = [];
    this.#future = [];
    this.#lastKey = null;
    this.announcement = `Opened ${name}`;
  }

  /**
   * Replaces the scenario, as one undo step. Edits with the same `mergeKey` in quick
   * succession (each keystroke in a field, each nudge) merge into one step.
   */
  edit(next: Scenario, mergeKey?: string): void {
    if (next === this.scenario) return;
    const now = Date.now();
    const merge =
      mergeKey !== undefined && mergeKey === this.#lastKey && now - this.#lastAt < MERGE_MS;
    if (!merge) this.#past = [...this.#past.slice(-(HISTORY - 1)), this.scenario];
    this.#future = [];
    this.#lastKey = mergeKey ?? null;
    this.#lastAt = now;
    this.scenario = next;
    // Shapes that no longer exist can't stay selected.
    const keep = this.selection.filter((key) => this.#exists(key));
    if (keep.length !== this.selection.length) this.selection = keep;
  }

  /**
   * A gesture (dragging a shape or a point): `begin` saves the scenario for undo once, and
   * `update` then changes it without adding steps.
   */
  beginGesture(): void {
    this.#past = [...this.#past.slice(-(HISTORY - 1)), this.scenario];
    this.#future = [];
    this.#lastKey = null;
  }
  updateGesture(next: Scenario): void {
    this.scenario = next;
  }
  /** Ends a gesture that changed nothing: drops its undo step. */
  cancelGesture(unchanged: boolean): void {
    if (unchanged) this.#past = this.#past.slice(0, -1);
  }

  undo(): void {
    const previous = this.#past.at(-1);
    if (!previous) return;
    this.#past = this.#past.slice(0, -1);
    this.#future = [...this.#future, this.scenario];
    this.scenario = previous;
    this.#lastKey = null;
    this.selection = this.selection.filter((key) => this.#exists(key));
    this.announcement = 'Undone';
  }

  redo(): void {
    const next = this.#future.at(-1);
    if (!next) return;
    this.#future = this.#future.slice(0, -1);
    this.#past = [...this.#past, this.scenario];
    this.scenario = next;
    this.#lastKey = null;
    this.selection = this.selection.filter((key) => this.#exists(key));
    this.announcement = 'Redone';
  }

  select(keys: SelectionKey[], add = false): void {
    const next = add
      ? [...this.selection, ...keys.filter((key) => !this.selection.includes(key))]
      : keys;
    this.selection = next;
    this.announcement = next.length === 0 ? 'Nothing selected' : `${next.length} selected`;
  }

  toggle(key: SelectionKey): void {
    this.selection = this.selection.includes(key)
      ? this.selection.filter((k) => k !== key)
      : [...this.selection, key];
  }

  /**
   * Checks particle placement (EDIT-6) by resolving the scenario: regions too full, and wall
   * kinds the simulation can't run yet. Called a moment after edits stop.
   */
  checkPlacement(): void {
    if (!this.validation.success) {
      this.placementProblems = [];
      return;
    }
    try {
      resolveScenario(this.validation.scenario, { random: seededRandom(1) });
      this.placementProblems = [];
    } catch (error) {
      this.placementProblems =
        error instanceof ScenarioError
          ? error.problems
          : [error instanceof Error ? error.message : String(error)];
    }
  }

  #exists(key: SelectionKey): boolean {
    const at = key.indexOf(':');
    const id = key.slice(at + 1);
    return key.startsWith('wall:')
      ? this.scenario.walls.some((w) => w.id === id)
      : this.scenario.spawnRegions.some((r) => r.id === id);
  }
}
