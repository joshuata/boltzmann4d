import { describe, expect, it } from 'vitest';
import { parseNumber, parseSetFile, SetFileError } from './set-file';

const sample = `#Boltzmann3D V2.43
# Sat 27 Dec 2008 01:13:24

GlobalSettings {
  size 70 50 10   # trailing comment
  Boundary REFLECTING
}

ParticleGroup {
  color Red
  RandomlyPlaced {
    count 30
  }
}

ParticleGroup
{
  color Blue
}
`;

describe('parseSetFile', () => {
  it('reads the header, properties and nested groups', () => {
    const { formatName, version, root } = parseSetFile(sample);
    expect(formatName).toBe('Boltzmann3D');
    expect(version).toBe('V2.43');
    const gs = root.group('GlobalSettings');
    expect(gs.values('size')).toEqual(['70', '50', '10']);
    expect(gs.number('size', 2)).toBe(10);
    expect(root.groups('ParticleGroup').map((g) => g.string('color'))).toEqual(['Red', 'Blue']);
    expect(root.groups('ParticleGroup')[0]?.group('RandomlyPlaced').number('count')).toBe(30);
  });

  it('matches group and property names case-insensitively', () => {
    const gs = parseSetFile(sample).root.group('globalsettings');
    expect(gs.string('BOUNDARY')).toBe('REFLECTING');
  });

  it('treats CRLF, CR and LF line breaks the same', () => {
    const lf = parseSetFile(sample).root.group('GlobalSettings').values('size');
    for (const eol of ['\r\n', '\r']) {
      const root = parseSetFile(sample.replaceAll('\n', eol)).root;
      expect(root.group('GlobalSettings').values('size')).toEqual(lf);
      expect(root.groups('ParticleGroup')).toHaveLength(2);
    }
  });

  it('keeps the last value of a repeated property', () => {
    expect(parseSetFile('G {\n a 1\n a 2\n}\n').root.group('G').string('a')).toBe('2');
  });

  it.each([
    ['a property without values', 'G {\n  lonely\n}\n', /Line 3, col 1: expected "{"/],
    ['an unclosed group', 'G {\n  a 1\n', /Line 3/],
    ['a stray closing brace', 'a 1\n}\n', /Line 2/],
  ])('rejects %s with a line number', (_, text, message) => {
    expect(() => parseSetFile(text)).toThrow(SetFileError);
    expect(() => parseSetFile(text)).toThrow(message);
  });

  it('reports missing sections and properties by name', () => {
    const { root } = parseSetFile(sample);
    expect(() => root.group('AbscissaLimits')).toThrow('Missing section: AbscissaLimits');
    expect(() => root.group('GlobalSettings').number('size', 3)).toThrow(
      'GlobalSettings.size needs at least 4 values',
    );
    expect(() => root.group('GlobalSettings').string('size')).toThrow('several values');
  });
});

describe('parseNumber', () => {
  it.each([
    ['70', 70],
    ['-0.00000', -0],
    ['3.9236E-2', 0.039236],
    ['.5', 0.5],
    ['1579.3484959644366', 1579.3484959644366],
  ])('parses %s', (word, value) => {
    expect(parseNumber(word)).toBe(value);
  });

  it.each(['', '-', '1x', 'NaN', '1,000', '0x10'])('rejects %j', (word) => {
    expect(parseNumber(word)).toBeUndefined();
  });
});
