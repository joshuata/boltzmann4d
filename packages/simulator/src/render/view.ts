// What the renderer needs from a 1D/2D or 3D view of the arena (view-2d.ts, view-3d.ts).
import type * as THREE from 'three';
import type { RenderFrame } from '@boltzmann4d/engine/sim';

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
  dispose(): void;
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
