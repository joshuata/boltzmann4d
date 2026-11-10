// 1D/2D view: orthographic camera over the arena, one instanced circle per particle.
// Periodic arenas draw each disc's wrapped images, clipped to the box.
import * as THREE from 'three';
import type { RenderFrame, SceneInfo } from '../sim';
import { periodicImages } from './periodic-images';
import { disposeTree, NM, type View } from './view';

/** Space around the arena, as a fraction of its larger side. */
const MARGIN = 0.04;

export function createView2D(info: SceneInfo): View {
  const arena = { x: info.arenaXSize * NM, y: info.arenaYSize * NM };
  const root = new THREE.Group();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

  root.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(arena.x, 0, 0),
        new THREE.Vector3(arena.x, arena.y, 0),
        new THREE.Vector3(0, arena.y, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    ),
  );
  if (info.divider) root.add(buildDivider(info.divider, arena.y));

  const count = info.radii.length;
  const radii = info.radii;
  const periodic = info.periodic && info.dimension === 2;
  const material = new THREE.MeshBasicMaterial();
  // Clip to the box so the wrapped images (and the discs they copy) stop at its edges.
  material.clippingPlanes = periodic
    ? [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), arena.x),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), arena.y),
      ]
    : null;
  // A disc has up to four images in a periodic box (itself, two edges, the corner).
  const particles = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 32), // scaled per instance by radius
    material,
    periodic ? 4 * count : count,
  );
  particles.count = 0; // nothing to draw until the first frame
  const colors = Array.from(
    { length: count },
    (_, i) => new THREE.Color(info.typeColors[info.types[i] ?? 0] ?? 0xffffff),
  );
  for (let i = 0; i < count; i++) particles.setColorAt(i, colors[i]!);
  root.add(particles);

  const images = new Float64Array(8);
  const matrix = new THREE.Matrix4();

  return {
    root,
    camera,
    fit(aspect) {
      const margin = MARGIN * Math.max(arena.x, arena.y);
      let halfW = arena.x / 2 + margin;
      let halfH = arena.y / 2 + margin;
      if (halfW / halfH < aspect) halfW = halfH * aspect;
      else halfH = halfW / aspect;
      camera.left = arena.x / 2 - halfW;
      camera.right = arena.x / 2 + halfW;
      camera.bottom = arena.y / 2 - halfH;
      camera.top = arena.y / 2 + halfH;
      camera.updateProjectionMatrix();
    },
    display(frame: RenderFrame) {
      const d = frame.dimension;
      const n = Math.min(frame.types.length, count);
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const x = (frame.positions[i * d] ?? 0) * NM;
        const y = d > 1 ? (frame.positions[i * d + 1] ?? 0) * NM : 0;
        const r = (radii[i] ?? 0) * NM;
        if (!periodic) {
          matrix.makeScale(r, r, 1).setPosition(x, y, 0);
          particles.setMatrixAt(drawn++, matrix);
          continue;
        }
        const k = periodicImages(x, y, r, arena.x, arena.y, images);
        for (let m = 0; m < k; m++) {
          matrix.makeScale(r, r, 1).setPosition(images[2 * m]!, images[2 * m + 1]!, 0);
          particles.setColorAt(drawn, colors[i]!);
          particles.setMatrixAt(drawn++, matrix);
        }
      }
      particles.count = drawn;
      particles.instanceMatrix.needsUpdate = true;
      if (periodic && particles.instanceColor) particles.instanceColor.needsUpdate = true;
    },
    rotate() {},
    dispose() {
      particles.dispose();
      disposeTree(root);
    },
  };
}

/**
 * The divider as filled bars (in nanometres), with a gap for the hole and the two edge
 * discs that line it.
 */
function buildDivider(info: NonNullable<SceneInfo['divider']>, arenaHeight: number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const left = info.leftX * NM;
  const width = (info.rightX - info.leftX) * NM;
  const bar = (from: number, to: number) => {
    if (to <= from) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, to - from), material);
    mesh.position.set(left + width / 2, (from + to) / 2, 0);
    group.add(mesh);
  };
  if (info.edgeY && info.edgeY.length === 2) {
    const top = info.edgeY[0]! * NM;
    const bottom = info.edgeY[1]! * NM;
    bar(0, bottom);
    bar(top, arenaHeight);
    for (const y of [top, bottom]) {
      const edge = new THREE.Mesh(new THREE.CircleGeometry(info.edgeRadius * NM, 24), material);
      edge.position.set(left + width / 2, y, 0);
      group.add(edge);
    }
  } else {
    bar(0, arenaHeight);
  }
  return group;
}
