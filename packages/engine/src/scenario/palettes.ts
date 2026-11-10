// Colour palettes for particle kinds (KIND-6–KIND-11). Colour is never the only cue: each
// kind also has a marker (KIND-9), so palettes only need to keep a handful of colours apart.
import { DefaultParticleInfo } from '../sim/particle-type';
import { worstCaseDifference, type Rgb } from '../utils/color-vision';

export const MAX_KINDS = 10;

export const PALETTE_IDS = ['okabe-ito', 'muted', 'bright', 'classic'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export interface Palette {
  id: PaletteId;
  label: string;
  /** Colours as 0xRRGGBB, in the order kinds take them. */
  colors: readonly Rgb[];
  /** Checked against colour-vision deficiencies (KIND-8). Classic exists for fidelity. */
  colorBlindSafe: boolean;
  source: string;
}

export const PALETTES: Record<PaletteId, Palette> = {
  'okabe-ito': {
    id: 'okabe-ito',
    label: 'Okabe–Ito',
    // Okabe and Ito's eight colours without black, which disappears on the dark arena.
    // Vermillion and blue come first so two kinds still read as "red and blue".
    colors: [0xd55e00, 0x0072b2, 0x009e73, 0xe69f00, 0x56b4e9, 0xcc79a7, 0xf0e442],
    colorBlindSafe: true,
    source: 'M. Okabe and K. Ito, "Color Universal Design" (2002)',
  },
  muted: {
    id: 'muted',
    label: 'Muted',
    // Paul Tol's muted scheme without its pale grey (too close to the light arena), plus a
    // violet chosen to stay apart from the other nine under all three dichromacies.
    colors: [
      0xcc6677, 0x332288, 0xddcc77, 0x117733, 0x88ccee, 0x882255, 0x44aa99, 0x999933, 0xaa4499,
      0x9977ff,
    ],
    colorBlindSafe: true,
    source: 'P. Tol, "Colour Schemes" (SRON/EPS/TN/09-002), muted scheme, plus #9977FF',
  },
  bright: {
    id: 'bright',
    label: 'Bright',
    colors: [0xee6677, 0x4477aa, 0x228833, 0xccbb44, 0x66ccee, 0xaa3377, 0xbbbbbb],
    colorBlindSafe: true,
    source: 'P. Tol, "Colour Schemes" (SRON/EPS/TN/09-002), bright scheme',
  },
  classic: {
    id: 'classic',
    label: 'Classic (not colour-blind safe)',
    colors: [
      DefaultParticleInfo.RED,
      DefaultParticleInfo.BLUE,
      DefaultParticleInfo.GREEN,
      DefaultParticleInfo.YELLOW,
      DefaultParticleInfo.PURPLE,
    ],
    colorBlindSafe: false,
    source: 'Boltzmann 3D (DefaultParticleInfo.java)',
  },
};

/** New scenarios' palette, and the one to switch to when it runs out of colours (KIND-7). */
export const DEFAULT_PALETTE: PaletteId = 'okabe-ito';
export const LARGE_PALETTE: PaletteId = 'muted';

/** Marker drawn on each kind's particles, by kind index (KIND-9). */
export const MARKERS = [
  'disk',
  'ring',
  'dot',
  'cross',
  'square',
  'diamond',
  'triangle',
  'plus',
  'star',
  'bar',
] as const;
export type Marker = (typeof MARKERS)[number];

/** Arena backgrounds every colour must stand out from (VIEW-1's dark and light schemes). */
export const ARENA_BACKGROUNDS: readonly Rgb[] = [0x000000, 0xffffff];

/**
 * Smallest CIEDE2000 difference, over normal vision and the three dichromacies, that two
 * kinds' colours must keep (KIND-8). About where two small dots stop being easy to tell
 * apart at a glance; the markers carry the rest.
 */
export const MIN_KIND_DIFFERENCE = 8;
/** The same against the arena backgrounds, which particles must stand out from. */
export const MIN_BACKGROUND_DIFFERENCE = 15;

export interface ColorProblem {
  /** Indices into the colour list; `background` is set for a clash with a background. */
  indices: [number] | [number, number];
  background?: Rgb;
  difference: number;
  vision: ReturnType<typeof worstCaseDifference>['vision'];
}

/**
 * Pairs of colours (and colours against the arena backgrounds) that are too close for some
 * viewers. Used by the palette test and by the editor's warning on colour overrides (KIND-10).
 */
export function findColorProblems(
  colors: readonly Rgb[],
  backgrounds: readonly Rgb[] = ARENA_BACKGROUNDS,
): ColorProblem[] {
  const problems: ColorProblem[] = [];
  colors.forEach((a, i) => {
    for (let j = i + 1; j < colors.length; j++) {
      const worst = worstCaseDifference(a, colors[j]!);
      if (worst.difference < MIN_KIND_DIFFERENCE) problems.push({ indices: [i, j], ...worst });
    }
    for (const background of backgrounds) {
      const worst = worstCaseDifference(a, background);
      if (worst.difference < MIN_BACKGROUND_DIFFERENCE) {
        problems.push({ indices: [i], background, ...worst });
      }
    }
  });
  return problems;
}

/** The colour a kind takes from a palette, or undefined when the palette is too short. */
export const paletteColor = (palette: PaletteId, kindIndex: number): Rgb | undefined =>
  PALETTES[palette].colors[kindIndex];
