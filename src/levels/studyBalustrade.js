import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The study's Victorian balustrade: turned balusters, moulded handrails,
 * turned newel posts. Geometry only; studyLevel.js places it and owns the
 * colliders.
 *
 * WHAT MAKES IT READ AS VICTORIAN RATHER THAN A FENCE.
 *   - TURNED parts. Balusters, newel shafts and finials are LatheGeometry:
 *     a profile curve spun about the vertical axis, exactly what a lathe does
 *     to a spindle. The baluster has a square-ish foot, an urn, a long neck
 *     and a collared head.
 *   - A MOULDED HANDRAIL. The rail is a "mushroom" profile (a rounded crown,
 *     a waist and a flat underside) swept along each run with ExtrudeGeometry.
 *     On the stair it is SHEARED, not rotated (Matrix4.makeShear: y += k z),
 *     so its ends stay vertical where they die into the newels and every
 *     cross-section is the same height above the treads.
 *   - NEWELS built up as a joiner would: plinth, block, turned shaft, a die
 *     block that receives the rails, a cap and a ball finial.
 *
 * WHY IT LOOKED BROKEN BEFORE (the "glitch"). The top 1.18 m of the stair
 * rose right beside the loft edge, and the stair's rail and balusters stood in
 * the same plane as the loft's return balustrade: rails ran through posts and
 * balusters through each other. The stair balustrade now ends at the corner
 * newel, and only the return balustrade guards the last treads.
 *
 * COST. Every repeated part is one InstancedMesh (identity rotation, positive
 * scale only -- a negative determinant would turn an instance inside out),
 * and all rails are one merged mesh, all in the existing wood material: no
 * new lights and no new shader programs beyond the instanced variant the old
 * balusters already used.
 */

const v2 = (points) => points.map(([radius, height]) => new THREE.Vector2(radius, height));

/** A turned baluster of total height h (metres): fixed foot and head, a neck that stretches. */
export function turnedBalusterGeometry(h, segments = 10) {
  const e = h - 0.19;
  return new THREE.LatheGeometry(v2([
    [0.0001, 0], [0.021, 0], [0.021, 0.085], [0.025, 0.090], [0.025, 0.100], [0.017, 0.115],
    [0.021, 0.135], [0.026, 0.180], [0.024, 0.225], [0.018, 0.265], [0.013, 0.315],
    [0.012, 0.315 + 0.5 * (e - 0.315)],
    [0.014, e], [0.020, e + 0.025], [0.016, e + 0.045], [0.020, e + 0.070], [0.025, e + 0.090],
    [0.025, e + 0.100], [0.021, e + 0.106], [0.021, h], [0.0001, h]
  ]), segments);
}

const NEWEL_SHAFT = v2([
  [0.058, 0], [0.058, 0.022], [0.066, 0.030], [0.058, 0.038], [0.045, 0.052], [0.042, 0.072],
  [0.052, 0.112], [0.056, 0.152], [0.050, 0.202], [0.038, 0.252], [0.034, 0.332], [0.036, 0.402],
  [0.042, 0.432], [0.055, 0.452], [0.055, 0.464], [0.048, 0.472], [0.058, 0.492], [0.058, 0.510]
]);
const BALL_FINIAL = v2([
  [0.050, 0], [0.050, 0.010], [0.036, 0.018], [0.022, 0.032], [0.020, 0.045], [0.030, 0.056],
  [0.044, 0.072], [0.050, 0.092], [0.046, 0.112], [0.034, 0.128], [0.018, 0.139], [0.0001, 0.143]
]);

/** Right halves of the rail profiles, bottom centre first; mirrored into closed shapes. */
const HANDRAIL = [
  [0, -0.072], [0.024, -0.072], [0.028, -0.068], [0.029, -0.058], [0.026, -0.050], [0.024, -0.043],
  [0.027, -0.036], [0.034, -0.030], [0.039, -0.024], [0.040, -0.017], [0.037, -0.009], [0.030, -0.004],
  [0.018, -0.0008], [0, 0]
];
const BOTTOM_RAIL = [[0, 0], [0.0325, 0], [0.0325, 0.032], [0.026, 0.042], [0.016, 0.048], [0, 0.050]];
const CAPPING = [[0, 0], [0.065, 0], [0.065, 0.018], [0.058, 0.026], [0.052, 0.030], [0.045, 0.040], [0.032, 0.045], [0, 0.045]];

function mirroredShape(half, yScale = 1) {
  const shape = new THREE.Shape();
  const right = half.map(([x, y]) => [x, y * yScale]);
  const left = right.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  const points = [...right, ...left];
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  return shape;
}

/** Grain runs along the rail: u = along / 0.85 m, v = round the profile / 0.25 m. Caps are offset so they never weld to the sides. */
const railUV = {
  generateTopUV(geometry, vertices, a, b, c) {
    return [a, b, c].map((i) => new THREE.Vector2(10 + vertices[i * 3 + 2] / 0.85, 10 + (vertices[i * 3] + vertices[i * 3 + 1]) / 0.25));
  },
  generateSideWallUV(geometry, vertices, a, b, c, d) {
    return [a, b, c, d].map((i) => new THREE.Vector2(vertices[i * 3 + 2] / 0.85, (vertices[i * 3] + vertices[i * 3 + 1]) / 0.25));
  }
};

/** A rail of `half` profile swept `length` along +Z from z = 0; `pitch` shears it (y += pitch z). */
export function railGeometry(half, length, { pitch = 0, yScale = 1 } = {}) {
  let geometry = new THREE.ExtrudeGeometry(mirroredShape(half, yScale), {
    depth: length, steps: 1, bevelEnabled: false, UVGenerator: railUV, curveSegments: 1
  });
  if (pitch) geometry.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, 0, pitch));
  // Smooth the moulding: weld the side walls by position and UV, then share normals.
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 1e-4);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/**
 * Collects newel parts and balusters and flushes them as instanced batches.
 * @param {THREE.Object3D} parent
 * @param {THREE.Material} material
 */
export function createBalustradeBuilder(parent, material) {
  const parts = {
    plinth: { geometry: new THREE.BoxGeometry(0.19, 0.04, 0.19).translate(0, 0.02, 0), at: [] },
    block: { geometry: new THREE.BoxGeometry(0.165, 1, 0.165).translate(0, 0.5, 0), at: [] },
    shaft: { geometry: new THREE.LatheGeometry(NEWEL_SHAFT, 12), at: [] },
    die: { geometry: new THREE.BoxGeometry(0.165, 0.20, 0.165).translate(0, 0.10, 0), at: [] },
    cap: { geometry: new THREE.BoxGeometry(0.205, 0.04, 0.205).translate(0, 0.02, 0), at: [] },
    finial: { geometry: new THREE.LatheGeometry(BALL_FINIAL, 12), at: [] },
    // A turned drop under the corner newel, where it hangs below the loft edge.
    drop: { geometry: new THREE.LatheGeometry(BALL_FINIAL, 12).rotateX(Math.PI), at: [] }
  };
  const balusterSets = [];
  const rails = [];

  function put(part, x, y, z, scaleY = 1) {
    parts[part].at.push([x, y, z, scaleY]);
  }

  /**
   * A newel post standing on the floor at floorY.
   * @param {object} [options]
   * @param {number} [options.blockHeight]  The lower block (receives bottom rails, strings, cappings).
   * @param {number} [options.dropFrom]     Corner newels: the block starts here instead, below the floor.
   * @param {boolean} [options.plinth]
   */
  function newel(x, floorY, z, { blockHeight = 0.36, shaftScale = 1, dropFrom = null, plinth = true } = {}) {
    const blockBottom = dropFrom ?? floorY;
    if (plinth && dropFrom === null) put('plinth', x, floorY - 0.002, z);
    put('block', x, blockBottom, z, floorY + blockHeight - blockBottom);
    if (dropFrom !== null) put('drop', x, dropFrom + 0.001, z, 0.7);
    const shaftBottom = floorY + blockHeight - 0.005;
    put('shaft', x, shaftBottom, z, shaftScale);
    const dieBottom = shaftBottom + 0.51 * shaftScale - 0.005;
    put('die', x, dieBottom, z);
    put('cap', x, dieBottom + 0.195, z);
    put('finial', x, dieBottom + 0.23, z);
    return { dieBottom };
  }

  /** @param {number} height  @param {Array<[number, number, number]>} feet  x, footY, z */
  function balusters(height, feet) {
    balusterSets.push({ height, feet });
  }

  function rail(geometry) {
    rails.push(geometry);
  }

  function finish() {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const meshes = [];
    const instanced = (geometry, placements, name) => {
      if (!placements.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
      mesh.name = name;
      placements.forEach(([x, y, z, scaleY], index) => {
        matrix.compose(position.set(x, y, z), rotation, scale.set(1, scaleY, 1));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      parent.add(mesh);
      meshes.push(mesh);
    };
    for (const [key, part] of Object.entries(parts)) instanced(part.geometry, part.at, `Study_Newel_${key}`);
    balusterSets.forEach(({ height, feet }, index) =>
      instanced(turnedBalusterGeometry(height), feet.map(([x, y, z]) => [x, y, z, 1]), `Study_Balusters_${index}`));
    if (rails.length) {
      const railMesh = new THREE.Mesh(mergeGeometries(rails), material);
      railMesh.name = 'Study_Handrails';
      railMesh.receiveShadow = true;
      parent.add(railMesh);
      meshes.push(railMesh);
    }
    return meshes;
  }

  return { newel, balusters, rail, finish };
}

export const RAIL_PROFILES = { HANDRAIL, BOTTOM_RAIL, CAPPING };
