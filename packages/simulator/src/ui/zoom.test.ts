import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampZoom, formatZoom, parseZoom, stepZoom } from './zoom';

describe('zoom', () => {
  it('steps by about 25% and back to 100%', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25, 12);
    expect(stepZoom(1.25, 1)).toBeCloseTo(1.5625, 12);
    expect(stepZoom(stepZoom(1, 1), -1)).toBeCloseTo(1, 12);
    expect(stepZoom(1, -1)).toBeCloseTo(0.8, 12);
  });

  it('snaps an in-between zoom to the next level', () => {
    expect(stepZoom(1.1, 1)).toBeCloseTo(1.25, 12);
    expect(stepZoom(1.1, -1)).toBeCloseTo(1, 12);
  });

  it('stops at 33% and the maximum', () => {
    let zoom = 1;
    for (let i = 0; i < 20; i++) zoom = stepZoom(zoom, -1);
    expect(zoom).toBe(MIN_ZOOM);
    expect(formatZoom(zoom)).toBe('33%');
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
  });

  it('reads typed percentages', () => {
    expect(parseZoom('150')).toBe(1.5);
    expect(parseZoom(' 80 % ')).toBe(0.8);
    expect(parseZoom('10')).toBe(MIN_ZOOM);
    expect(parseZoom('abc')).toBeNull();
    expect(parseZoom('0')).toBeNull();
  });
});
