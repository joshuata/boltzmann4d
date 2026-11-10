import { describe, expect, it } from 'vitest';
import { loadPresetScenario } from '@boltzmann4d/engine/scenario';
import { summarizeScenario } from './summary';

describe('summarizeScenario', () => {
  it('names the dimension, walls and counts', async () => {
    const summary = summarizeScenario(await loadPresetScenario('2Dhotcold'));
    expect(summary).toMatch(/^2D · Divided box · 30 \S+, 30 \S+$/);
  });
});
