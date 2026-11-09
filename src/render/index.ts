import * as THREE from 'three';

export interface Renderer {
  dispose(): void;
}

/**
 * Placeholder 2D view: orthographic camera over a unit arena with a few circles.
 * Will grow into the 1D/2D/3D renderer described in boltzmann3d docs/rendering-baseline.md.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.OrthographicCamera(-0.55, 0.55, 0.55, -0.55, -1, 1);

  const wall = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  scene.add(wall);

  const circle = new THREE.CircleGeometry(0.03, 24);
  const colors = [0xff4040, 0x4080ff];
  const particles = Array.from({ length: 12 }, (_, i) => {
    const mesh = new THREE.Mesh(circle, new THREE.MeshBasicMaterial({ color: colors[i % 2] }));
    scene.add(mesh);
    return {
      mesh,
      x: Math.random() - 0.5,
      y: Math.random() - 0.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    };
  });

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

  // Placeholder motion only (walls, no particle collisions); real physics lives in sim/.
  const r = 0.03;
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = (now - last) / 1000;
    last = now;
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.abs(p.x) > 0.5 - r) p.vx = -p.vx;
      if (Math.abs(p.y) > 0.5 - r) p.vy = -p.vy;
      p.mesh.position.set(p.x, p.y, 0);
    }
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      circle.dispose();
      renderer.dispose();
    },
  };
}
