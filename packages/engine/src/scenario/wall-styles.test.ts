import { describe, expect, it } from 'vitest';
import { ARENA_BACKGROUNDS } from './palettes';
import { WALL_KINDS } from './schema';
import { contrastRatio, DEFAULT_WALL_STYLES, wallStyle } from './wall-styles';

describe('wall styles (WALL-5)', () => {
  it.each(WALL_KINDS)('give %s walls a default with 3:1 contrast on both backgrounds', (kind) => {
    for (const background of ARENA_BACKGROUNDS) {
      expect(contrastRatio(DEFAULT_WALL_STYLES[kind].color, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it('tell kinds apart by more than colour', () => {
    const looks = WALL_KINDS.map((k) => {
      const { lineWidth, dash } = DEFAULT_WALL_STYLES[k];
      return `${lineWidth} ${dash}`;
    });
    // Reflecting and thermal share a look but thermal walls are labelled with their temperature.
    expect(new Set(looks).size).toBeGreaterThanOrEqual(4);
  });

  it("fall back to the kind's default for anything left out", () => {
    expect(wallStyle('gate', { color: '#ff0000' })).toEqual({
      color: 0xff0000,
      lineWidth: 3,
      dash: 'dashed',
    });
  });

  it('compute WCAG contrast', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 6);
    expect(contrastRatio(0x777777, 0x777777)).toBe(1);
  });
});
