// Scenarios the user keeps, stored in this browser (IndexedDB): the ones they save from the
// editor and the files they open. Nothing leaves the browser. Also keeps which one is their
// default (FILE-2), which is an app setting, so it lives in the app-settings store.
import { validateScenario, type Scenario, type ScenarioInput } from '@boltzmann4d/engine/scenario';

export interface SavedScenario {
  id: string;
  name: string;
  scenario: Scenario;
  /** ms since the epoch. */
  savedAt: number;
}

/** A stored entry that no longer validates (e.g. saved by a newer version of the app). */
export interface UnreadableScenario {
  id: string;
  name: string;
  savedAt: number;
  problems: string[];
}

interface StoredScenario {
  id: string;
  name: string;
  scenario: ScenarioInput;
  savedAt: number;
}

const DB_NAME = 'boltzmann4d';
const DB_VERSION = 1;
const SCENARIOS = 'scenarios';
const APP_SETTINGS = 'app-settings';
const DEFAULT_KEY = 'defaultScenarioId';

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCENARIOS))
        db.createObjectStore(SCENARIOS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(APP_SETTINGS)) db.createObjectStore(APP_SETTINGS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Can't open this browser's storage"));
    request.onblocked = () =>
      reject(new Error('Storage is in use by another tab; close it and retry'));
  }).catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

/** Runs one request in a transaction and resolves when the transaction commits. */
async function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage request aborted'));
  });
}

function read(stored: StoredScenario): SavedScenario | UnreadableScenario {
  const result = validateScenario(stored.scenario);
  const { id, name, savedAt } = stored;
  return result.success
    ? { id, name, savedAt, scenario: result.scenario }
    : { id, name, savedAt, problems: result.problems };
}

export const isReadable = (entry: SavedScenario | UnreadableScenario): entry is SavedScenario =>
  'scenario' in entry;

/** Every stored scenario, newest first. */
export async function listScenarios(): Promise<(SavedScenario | UnreadableScenario)[]> {
  const all = await run<StoredScenario[]>(SCENARIOS, 'readonly', (s) => s.getAll());
  return all.map(read).sort((a, b) => b.savedAt - a.savedAt);
}

export async function getScenario(id: string): Promise<SavedScenario | UnreadableScenario | null> {
  const stored = await run<StoredScenario | undefined>(SCENARIOS, 'readonly', (s) => s.get(id));
  return stored ? read(stored) : null;
}

/**
 * Stores a scenario: under `id` when given (replacing that entry), else as a new entry.
 * Returns what was stored.
 */
export async function saveScenario(entry: {
  id?: string;
  name: string;
  scenario: Scenario;
}): Promise<SavedScenario> {
  const saved: SavedScenario = {
    id: entry.id ?? crypto.randomUUID(),
    name: entry.name.trim() || 'Untitled scenario',
    // A plain copy: reactive proxies can't be stored.
    scenario: structuredClone(entry.scenario),
    savedAt: Date.now(),
  };
  await run(SCENARIOS, 'readwrite', (s) => s.put(saved));
  return saved;
}

/**
 * Stores an opened file. Opening the same file again (same name, same content) updates the
 * existing entry instead of adding a copy.
 */
export async function keepOpenedFile(name: string, scenario: Scenario): Promise<SavedScenario> {
  const same = (await listScenarios()).find(
    (e) =>
      isReadable(e) && e.name === name && JSON.stringify(e.scenario) === JSON.stringify(scenario),
  );
  return saveScenario({ id: same?.id, name, scenario });
}

export async function deleteScenario(id: string): Promise<void> {
  await run(SCENARIOS, 'readwrite', (s) => s.delete(id));
  if ((await getDefaultScenarioId()) === id) await setDefaultScenarioId(null);
}

/** The scenario the user made their default, by id (null for the bundled default). */
export async function getDefaultScenarioId(): Promise<string | null> {
  const id = await run<unknown>(APP_SETTINGS, 'readonly', (s) => s.get(DEFAULT_KEY));
  return typeof id === 'string' ? id : null;
}

export async function setDefaultScenarioId(id: string | null): Promise<void> {
  if (id) await run(APP_SETTINGS, 'readwrite', (s) => s.put(id, DEFAULT_KEY));
  else await run(APP_SETTINGS, 'readwrite', (s) => s.delete(DEFAULT_KEY));
}

/** The user's default scenario if they set one and it still loads, else null. */
export async function getDefaultScenario(): Promise<SavedScenario | null> {
  const id = await getDefaultScenarioId();
  const entry = id ? await getScenario(id) : null;
  return entry && isReadable(entry) ? entry : null;
}
