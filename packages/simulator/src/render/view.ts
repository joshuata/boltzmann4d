// What the renderer needs from a 1D/2D or 3D view of the arena (view-2d.ts, view-3d.ts).
import * as THREE from 'three';
import type { ColorMode, RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';

/** The scene is drawn in nanometres: simulation meters are ~1e-8, awkward for float32. */
export const NM = 1e9;

export interface View {
  /** Everything the view draws, added to the renderer's scene. */
  readonly root: THREE.Object3D;
  readonly camera: THREE.Camera;
  /** Fits the camera to a drawing area of this aspect ratio (width / height). */
  fit(aspect: number): void;
  /** Places the particles where the frame has them. */
  display(frame: RenderFrame): void;
  /** Turns the view by these angles in degrees (3D only; 2D views ignore it). */
  rotate(aboutX: number, aboutY: number): void;
  /** How particles are coloured from the next frame on. */
  setColorMode(mode: ColorMode): void;
  /** Trace mode (2D): accumulate particle marks of `pointSize` pixels; off clears them. */
  setTrace(enabled: boolean, pointSize: number): void;
  /** Called before each draw, with the renderer (the trace draws into its own target). */
  beforeRender?(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

/** kg per amu, and J → kJ/mol (Units: 1e3 / Avogadro J per kJ/mol). */
const AMU_KG = 1.660538782e-27;
const KJ_PER_MOL = 1.0e3 / 6.02214179e23;

/**
 * Each particle's colour (MainGuiFullView's colourers): its type's colour (which
 * reactions change), or for SPEED and KE a hue from red (0, at or above 2.5 × the
 * predicted average) to blue-violet (0.7, at rest): hue = 0.7 × clamp((limit − v) / limit).
 */
export class ParticleColors {
  mode: ColorMode;
  private readonly palette: THREE.Color[];
  private readonly masses: Float64Array | undefined;
  private readonly limits: { speed: number; energy: number } | undefined;
  private readonly color = new THREE.Color();

  constructor(info: SceneInfo) {
    this.palette = info.typeColors.map((c) => new THREE.Color(c));
    this.masses = info.masses;
    this.limits = info.colorLimits;
    this.mode = info.colorMode ?? 'NORMAL';
  }

  /** The colour particle i shows in this frame (a shared object; copy it to keep it). */
  of(frame: RenderFrame, i: number): THREE.Color {
    const mode = this.mode;
    const limits = this.limits;
    if (mode === 'NORMAL' || !limits || !frame.speeds) {
      return this.palette[frame.types[i]!] ?? this.palette[0]!;
    }
    const speed = frame.speeds[i]!;
    let value = speed;
    let limit = limits.speed;
    if (mode === 'KE') {
      const mass = (this.masses?.[i] ?? 0) * AMU_KG;
      value = (0.5 * mass * speed * speed) / KJ_PER_MOL;
      limit = limits.energy;
    }
    const percent = Math.min(1, Math.max(0, (limit - value) / limit));
    // HSB with full saturation and brightness is HSL with lightness ½.
    return this.color.setHSL(0.7 * percent, 1, 0.5);
  }
}

/** Disposes every geometry and material under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
