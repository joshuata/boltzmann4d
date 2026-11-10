// Colour science for checking that colours stay distinguishable (KIND-8, KIND-10): sRGB to
// CIELAB, the CIEDE2000 colour difference, and simulated colour-vision deficiency.

/** sRGB colour as 0xRRGGBB. */
export type Rgb = number;

export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const COLOR_VISION_DEFICIENCIES = ['protanopia', 'deuteranopia', 'tritanopia'] as const;

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/**
 * Machado, Oliveira and Fernandes (2009), "A Physiologically-based Model for Simulation of
 * Color Vision Deficiency", severity 1.0 (dichromacy). Applied to linear RGB.
 */
const CVD_MATRICES: Record<Exclude<ColorVision, 'normal'>, Matrix3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const channels = (rgb: Rgb): [number, number, number] => [
  ((rgb >> 16) & 0xff) / 255,
  ((rgb >> 8) & 0xff) / 255,
  (rgb & 0xff) / 255,
];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

/** How a viewer with the given colour vision sees `rgb`, as 0xRRGGBB. */
export function simulateColorVision(rgb: Rgb, vision: ColorVision): Rgb {
  if (vision === 'normal') return rgb;
  const m = CVD_MATRICES[vision];
  const [r, g, b] = channels(rgb).map(toLinear) as [number, number, number];
  const out = m.map((row) => fromLinear(clamp01(row[0] * r + row[1] * g + row[2] * b)));
  return out.reduce((acc, c) => (acc << 8) | Math.round(c * 255), 0);
}

export type Lab = [number, number, number];

/** sRGB (D65) to CIELAB. */
export function rgbToLab(rgb: Rgb): Lab {
  const [r, g, b] = channels(rgb).map(toLinear) as [number, number, number];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** CIEDE2000 colour difference (Sharma, Wu and Dalal 2005), with kL = kC = kH = 1. */
export function ciede2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cMean7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cMean7 / (cMean7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = deg(Math.atan2(b, a));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);

  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));

  const lMean = (l1 + l2) / 2;
  const cMeanP = (c1p + c2p) / 2;
  let hMeanP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hMeanP /= 2;
    else hMeanP = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(rad(hMeanP - 30)) +
    0.24 * Math.cos(rad(2 * hMeanP)) +
    0.32 * Math.cos(rad(3 * hMeanP + 6)) -
    0.2 * Math.cos(rad(4 * hMeanP - 63));
  const dTheta = 30 * Math.exp(-(((hMeanP - 275) / 25) ** 2));
  const cMeanP7 = cMeanP ** 7;
  const rc = 2 * Math.sqrt(cMeanP7 / (cMeanP7 + 25 ** 7));
  const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cMeanP;
  const sh = 1 + 0.015 * cMeanP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt(
    (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh),
  );
}

/** CIEDE2000 difference between two sRGB colours as seen with the given colour vision. */
export function colorDifference(a: Rgb, b: Rgb, vision: ColorVision = 'normal'): number {
  return ciede2000(
    rgbToLab(simulateColorVision(a, vision)),
    rgbToLab(simulateColorVision(b, vision)),
  );
}

/**
 * The smallest difference between `a` and `b` over normal vision and the three dichromacies,
 * with the vision that gave it.
 */
export function worstCaseDifference(a: Rgb, b: Rgb): { difference: number; vision: ColorVision } {
  let worst = { difference: colorDifference(a, b), vision: 'normal' as ColorVision };
  for (const vision of COLOR_VISION_DEFICIENCIES) {
    const difference = colorDifference(a, b, vision);
    if (difference < worst.difference) worst = { difference, vision };
  }
  return worst;
}
