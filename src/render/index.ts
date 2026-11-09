import * as THREE from 'three';
import type { RenderFrame } from '../sim';

export interface Renderer {
  /** Queue a frame; it is drawn on the next animation tick (MainGuiView.setNextFrameToDisplay). */
  setNextFrameToDisplay(frame: RenderFrame): void;
  dispose(): void;
}

const TYPE_COLORS = [0xff4040, 0x4080ff];
/** Placeholder until RenderFrame carries per-type radii; matches the stub Physics. */
const PARTICLE_RADIUS = 0.03;

/**
 * Placeholder 2D view: orthographic camera over a unit arena, drawing whatever frames the
 * simulation worker sends. Will grow into the 1D/2D/3D renderer described in boltzmann3d
 * docs/rendering-baseline.md. It keeps rendering while the simulation is paused.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.OrthographicCamera(-0.55, 0.55, 0.55, -0.55, -1, 1);

  const wallGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ]);
  const wallMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  scene.add(new THREE.LineLoop(wallGeometry, wallMaterial));

  const circle = new THREE.CircleGeometry(PARTICLE_RADIUS, 24);
  const particleMaterial = new THREE.MeshBasicMaterial();
  let particles: THREE.InstancedMesh | null = null;
  let nextFrame: RenderFrame | null = null;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  const displayFrame = (frame: RenderFrame) => {
    const count = frame.types.length;
    if (particles?.count !== count) {
      if (particles) {
        scene.remove(particles);
        particles.dispose();
      }
      particles = new THREE.InstancedMesh(circle, particleMaterial, count);
      scene.add(particles);
    }
    const d = frame.dimension;
    for (let i = 0; i < count; i++) {
      const x = frame.positions[i * d] ?? 0;
      const y = d > 1 ? (frame.positions[i * d + 1] ?? 0) : 0;
      particles.setMatrixAt(i, matrix.makeTranslation(x, y, 0));
      const type = frame.types[i] ?? 0;
      particles.setColorAt(i, color.setHex(TYPE_COLORS[type % TYPE_COLORS.length] ?? 0xffffff));
    }
    particles.instanceMatrix.needsUpdate = true;
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    const aspect = w / h || 1;
    const half = 0.55;
    camera.left = -half * Math.max(aspect, 1);
    camera.right = half * Math.max(aspect, 1);
    camera.top = half / Math.min(aspect, 1);
    camera.bottom = -half / Math.min(aspect, 1);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  renderer.setAnimationLoop(() => {
    if (nextFrame) {
      displayFrame(nextFrame);
      nextFrame = null;
    }
    renderer.render(scene, camera);
  });

  return {
    setNextFrameToDisplay(frame) {
      nextFrame = frame;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      particles?.dispose();
      circle.dispose();
      particleMaterial.dispose();
      wallGeometry.dispose();
      wallMaterial.dispose();
      renderer.dispose();
    },
  };
}
