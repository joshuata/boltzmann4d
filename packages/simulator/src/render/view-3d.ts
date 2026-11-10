// 3D view (CoreProfileRenderer's 3D path in boltzmann3d): a perspective camera looking at
// the box, which turns about its centre (x axis, then y), lit instanced spheres, the
// walls as coloured panels seen from inside, and the divider with its hole.
//
// Periodic arenas draw each sphere's wrapped images, clipped to the box.
import * as THREE from 'three';
import type { RenderFrame, SceneInfo } from '@boltzmann4d/engine/sim';
import { periodicImages3D } from './periodic-images';
import { disposeTree, NM, type View } from './view';

/** Vertical field of view, in degrees (LwjglRenderSurface). */
const FIELD_OF_VIEW = 30;
/** Wall colours (LwjglRenderSurface's defaults): gold sides, tan top and bottom. */
const GOLD = 0xffe080;
const TAN = 0xe0c0a0;
const DIVIDER_COLOR = 0xffffff;
const HOLE_EDGE_COLOR = 0x808080;
/**
 * Java's shading: 28% ambient plus 72% diffuse from a light fixed relative to the camera.
 * Three.js divides diffuse light by π, so intensities are scaled by π to match.
 */
const AMBIENT = 0.28 * Math.PI;
const DIFFUSE = 0.72 * Math.PI;
const LIGHT_DIRECTION = new THREE.Vector3(-0.35, 0.65, 1.0);

export function createView3D(info: SceneInfo): View {
  const w = info.arenaXSize * NM;
  const h = info.arenaYSize * NM;
  const d = info.arenaZSize * NM;
  const extent = Math.hypot(w, h, d);

  const root = new THREE.Group();
  // The pivot turns about the box's centre; the box sits inside it, centred on the origin.
  const pivot = new THREE.Group();
  pivot.rotation.order = 'YXZ'; // about x first, then y, as Java's rotationY · rotationX
  const box = new THREE.Group();
  box.position.set(-w / 2, -h / 2, -d / 2);
  pivot.add(box);
  root.add(pivot);

  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 1);
  // Distance from the camera to the box's centre. Java's puts the front face edge to edge
  // vertically, so turning the box pushes its corners off screen; this instead fits the
  // sphere around the box (with a little room), so it stays in view however it's turned.
  const distance = ((extent / 2) * 1.05) / Math.sin((FIELD_OF_VIEW * Math.PI) / 360);
  root.add(camera);
  root.add(new THREE.AmbientLight(0xffffff, AMBIENT));
  const light = new THREE.DirectionalLight(0xffffff, DIFFUSE);
  light.position.copy(LIGHT_DIRECTION);
  camera.add(light, light.target); // fixed relative to the camera, like Java's view-space light

  box.add(buildWalls(w, h, d));
  if (info.divider) box.add(buildDivider(info.divider, w, h, d));

  // Particles: one lit sphere each, plus wrapped images in periodic arenas.
  const count = info.radii.length;
  const radii = info.radii;
  const periodic = info.periodic;
  const material = new THREE.MeshLambertMaterial();
  const clipping = periodic ? boxClipping(w, h, d) : null;
  material.clippingPlanes = clipping?.planes ?? null;
  const particles = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 24, 16), // scaled per instance by radius
    material,
    periodic ? 8 * count : count,
  );
  particles.count = 0; // nothing to draw until the first frame
  particles.frustumCulled = false; // instances move; the unit sphere's bounds don't
  const colors = Array.from(
    { length: count },
    (_, i) => new THREE.Color(info.typeColors[info.types[i] ?? 0] ?? 0xffffff),
  );
  for (let i = 0; i < count; i++) particles.setColorAt(i, colors[i]!);
  box.add(particles);

  let aboutX = info.viewingAngles?.[0] ?? 0;
  let aboutY = info.viewingAngles?.[1] ?? 0;
  const applyRotation = () => {
    pivot.rotation.set((aboutX * Math.PI) / 180, (aboutY * Math.PI) / 180, 0);
    root.updateMatrixWorld(true);
    clipping?.update(box.matrixWorld);
  };
  applyRotation();

  const images = new Float64Array(24);
  const matrix = new THREE.Matrix4();

  return {
    root,
    camera,
    fit(aspect) {
      camera.aspect = aspect || 1;
      // Keep at least the Java field of view horizontally too, so narrow (portrait)
      // screens still show the whole box.
      const tanHalf = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
      camera.fov =
        camera.aspect >= 1 ? FIELD_OF_VIEW : (Math.atan(tanHalf / camera.aspect) * 360) / Math.PI;
      camera.position.set(0, 0, distance);
      camera.near = Math.max(0.01, distance - extent);
      camera.far = distance + extent;
      camera.updateProjectionMatrix();
    },
    display(frame: RenderFrame) {
      if (frame.dimension !== 3) return;
      const n = Math.min(frame.types.length, count);
      const p = frame.positions;
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const x = p[3 * i]! * NM;
        const y = p[3 * i + 1]! * NM;
        const z = p[3 * i + 2]! * NM;
        const r = radii[i]! * NM;
        if (!periodic) {
          matrix.makeScale(r, r, r).setPosition(x, y, z);
          particles.setMatrixAt(drawn++, matrix);
          continue;
        }
        const k = periodicImages3D(x, y, z, r, w, h, d, images);
        for (let m = 0; m < k; m++) {
          matrix.makeScale(r, r, r).setPosition(images[3 * m]!, images[3 * m + 1]!, images[3 * m + 2]!); // prettier-ignore
          particles.setColorAt(drawn, colors[i]!);
          particles.setMatrixAt(drawn++, matrix);
        }
      }
      particles.count = drawn;
      particles.instanceMatrix.needsUpdate = true;
      if (periodic && particles.instanceColor) particles.instanceColor.needsUpdate = true;
    },
    rotate(dx, dy) {
      aboutX = (((aboutX + dx) % 360) + 360) % 360;
      aboutY = (((aboutY + dy) % 360) + 360) % 360;
      applyRotation();
    },
    dispose() {
      particles.dispose();
      disposeTree(root);
    },
  };
}

/**
 * The six walls as panels facing into the box. Front-face culling of the outside means
 * only the walls behind the particles show, whichever way the box is turned.
 */
function buildWalls(w: number, h: number, d: number): THREE.Group {
  const walls = new THREE.Group();
  const wall = (
    width: number,
    height: number,
    color: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    walls.add(mesh);
  };
  const half = Math.PI / 2;
  // A plane faces +z; each is turned to face the inside of the box.
  wall(w, h, GOLD, [w / 2, h / 2, 0], [0, 0, 0]); // back (z = 0)
  wall(w, h, GOLD, [w / 2, h / 2, d], [0, Math.PI, 0]); // front (z = d)
  wall(d, h, GOLD, [0, h / 2, d / 2], [0, half, 0]); // left (x = 0)
  wall(d, h, GOLD, [w, h / 2, d / 2], [0, -half, 0]); // right (x = w)
  wall(w, d, TAN, [w / 2, 0, d / 2], [-half, 0, 0]); // bottom (y = 0)
  wall(w, d, TAN, [w / 2, h, d / 2], [half, 0, 0]); // top (y = h)
  return walls;
}

/**
 * The divider: a slab across the box at its centre, with a round hole lined by a grey
 * tunnel and the ring of edge spheres the physics bounces particles off.
 */
function buildDivider(
  info: NonNullable<SceneInfo['divider']>,
  w: number,
  h: number,
  d: number,
): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: DIVIDER_COLOR });
  const x0 = info.leftX * NM;
  const thickness = (info.rightX - info.leftX) * NM;
  const holeRadius = ((info.holeDiameter ?? 0) / 2) * NM;

  if (holeRadius <= 0 || !info.edgeY || !info.edgeZ) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(thickness, h, d), material);
    slab.position.set(x0 + thickness / 2, h / 2, d / 2);
    group.add(slab);
    return group;
  }

  // The slab's face in the (z, y) plane with the hole cut out, extruded along x.
  const face = new THREE.Shape();
  face.moveTo(0, 0).lineTo(d, 0).lineTo(d, h).lineTo(0, h).closePath();
  face.holes.push(new THREE.Path().absarc(d / 2, h / 2, holeRadius, 0, 2 * Math.PI, true));
  const slab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(face, { depth: thickness, bevelEnabled: false, curveSegments: 48 }),
    material,
  );
  // Shape x → box z, shape y → box y, extrusion (+z) → box +x.
  slab.rotation.y = -Math.PI / 2;
  slab.position.set(x0 + thickness, 0, 0);
  group.add(slab);

  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(holeRadius, holeRadius, thickness, 48, 1, true),
    new THREE.MeshLambertMaterial({ color: HOLE_EDGE_COLOR, side: THREE.BackSide }),
  );
  tunnel.rotation.z = Math.PI / 2;
  tunnel.position.set(x0 + thickness / 2, h / 2, d / 2);
  group.add(tunnel);

  const r = info.edgeRadius * NM;
  const edges = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshLambertMaterial({ color: HOLE_EDGE_COLOR }),
    info.edgeY.length,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < info.edgeY.length; i++) {
    matrix.makeScale(r, r, r).setPosition(x0 + thickness / 2, info.edgeY[i]! * NM, info.edgeZ[i]! * NM); // prettier-ignore
    edges.setMatrixAt(i, matrix);
  }
  group.add(edges);
  return group;
}

/**
 * Planes keeping only what lies inside the box. Clipping planes are in world space, so
 * `update` moves them with the box whenever the view turns.
 */
function boxClipping(w: number, h: number, d: number) {
  const local = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), w),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), h),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), d),
  ];
  const planes = local.map((plane) => plane.clone());
  return {
    planes,
    update(boxToWorld: THREE.Matrix4) {
      planes.forEach((plane, k) => plane.copy(local[k]!).applyMatrix4(boxToWorld));
    },
  };
}
