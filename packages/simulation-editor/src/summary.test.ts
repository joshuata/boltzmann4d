import { describe, expect, it } from 'vitest';
import { loadPresetScenario } from '@boltzmann4d/engine/scenario';
import { summarizeScenario } from './summary';

describe('summarizeScenario', () => {
  it('names the dimension, walls and counts per kind', async () => {
    expect(summarizeScenario(await loadPresetScenario('2Dhotcold'))).toMatch(
      /^2D · Divided box · 30 \S+, 30 \S+$/,
    );
  });
});
