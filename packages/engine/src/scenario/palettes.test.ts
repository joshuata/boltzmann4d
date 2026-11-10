import { describe, expect, it } from 'vitest';
import { ciede2000, simulateColorVision } from '../utils/color-vision';
import {
  DEFAULT_PALETTE,
  findColorProblems,
  LARGE_PALETTE,
  MARKERS,
  MAX_KINDS,
  PALETTES,
} from './palettes';

describe('ciede2000', () => {
  // Test pairs 1, 7, 17 and 24 from Sharma, Wu and Dalal (2005), table 1.
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ] as const)('%j vs %j is %d', (a, b, expected) => {
    expect(ciede2000([...a], [...b])).toBeCloseTo(expected, 4);
  });
});

describe('simulateColorVision', () => {
  it('keeps greys grey and maps red and green together for deuteranopes', () => {
    expect(simulateColorVision(0x808080, 'deuteranopia')).toBe(0x808080);
    const red = simulateColorVision(0xff0000, 'deuteranopia');
    const green = simulateColorVision(0x00ff00, 'deuteranopia');
    // Both come out as yellowish browns: more red and green than blue.
    for (const c of [red, green]) expect(c & 0xff).toBeLessThan((c >> 8) & 0xff);
  });
});

describe.each(Object.values(PALETTES).filter((p) => p.colorBlindSafe))('$label', (palette) => {
  it('keeps every colour apart, for every colour vision and on both backgrounds (KIND-8)', () => {
    expect(findColorProblems(palette.colors)).toEqual([]);
  });
});

describe('palettes', () => {
  it('Classic is flagged: red and green are too close for deuteranopes', () => {
    const problems = findColorProblems(PALETTES.classic.colors);
    expect(problems.length).toBeGreaterThan(0);
    expect(PALETTES.classic.colorBlindSafe).toBe(false);
  });

  it('has enough colours and markers for the maximum number of kinds', () => {
    expect(PALETTES[LARGE_PALETTE].colors.length).toBe(MAX_KINDS);
    expect(PALETTES[DEFAULT_PALETTE].colorBlindSafe).toBe(true);
    expect(MARKERS.length).toBe(MAX_KINDS);
  });
});
