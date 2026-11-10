import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPresetScenario } from '@boltzmann4d/engine/scenario';
import {
  deleteScenario,
  getDefaultScenario,
  getDefaultScenarioId,
  getScenario,
  isReadable,
  keepOpenedFile,
  listScenarios,
  saveScenario,
  setDefaultScenarioId,
} from './scenario-store';

beforeEach(async () => {
  for (const entry of await listScenarios()) await deleteScenario(entry.id);
});

describe('scenario store', () => {
  it('saves, lists newest first, updates in place and deletes', async () => {
    const hot = await loadPresetScenario('2Dhotcold');
    const mix = await loadPresetScenario('2Dmixture');
    const a = await saveScenario({ name: 'Hot', scenario: hot });
    await new Promise((r) => setTimeout(r, 2));
    const b = await saveScenario({ name: '  ', scenario: mix });
    expect(b.name).toBe('Untitled scenario');
    expect((await listScenarios()).map((e) => e.id)).toEqual([b.id, a.id]);
    const got = await getScenario(a.id);
    expect(got && isReadable(got) && got.scenario).toStrictEqual(hot);

    await saveScenario({ id: a.id, name: 'Hotter', scenario: hot });
    expect((await listScenarios()).map((e) => e.name)).toEqual(['Hotter', 'Untitled scenario']);
    await deleteScenario(b.id);
    expect((await listScenarios()).map((e) => e.id)).toEqual([a.id]);
  });

  it('keeps one entry per opened file with the same content', async () => {
    const hot = await loadPresetScenario('2Dhotcold');
    const first = await keepOpenedFile('hot.set', hot);
    const again = await keepOpenedFile('hot.set', hot);
    expect(again.id).toBe(first.id);
    const changed = await keepOpenedFile('hot.set', { ...hot, run: { ...hot.run, paused: true } });
    expect(changed.id).not.toBe(first.id);
    expect(await listScenarios()).toHaveLength(2);
  });

  it('remembers the default, and forgets it when that scenario is deleted', async () => {
    expect(await getDefaultScenario()).toBeNull();
    const saved = await saveScenario({
      name: 'Mine',
      scenario: await loadPresetScenario('2Dequil'),
    });
    await setDefaultScenarioId(saved.id);
    expect((await getDefaultScenario())?.name).toBe('Mine');
    await deleteScenario(saved.id);
    expect(await getDefaultScenarioId()).toBeNull();
  });

  it('lists entries that no longer validate, with their problems', async () => {
    const saved = await saveScenario({
      name: 'Old',
      scenario: await loadPresetScenario('2Dequil'),
    });
    // Simulate an entry from another version of the app.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('boltzmann4d', 1);
      open.onsuccess = () => {
        const tx = open.result.transaction('scenarios', 'readwrite');
        tx.objectStore('scenarios').put({ ...saved, scenario: { ...saved.scenario, version: 99 } });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
    const [entry] = await listScenarios();
    expect(entry && !isReadable(entry) && entry.problems).toEqual([
      expect.stringMatching(/^version: Unsupported scenario version/),
    ]);
  });
});
