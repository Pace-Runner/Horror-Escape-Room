import * as THREE from 'three';
import { brassKeyMaterial, ironKeyMaterial } from './keyMaterials.js';

/**
 * Level 1's two keys, modelled once and used everywhere: lying in the room, in
 * the hand and on the floor after a drop all clone these.
 *
 * Old skeleton keys, not a ring on a stick: a bow with a hole in it, a lathe-
 * turned stem with collars, and a bit cut into teeth. Every extruded part has a
 * small bevel so its edges catch the torch beam -- on a flat-sided box the beam
 * slides off and the key reads as a dark cut-out.
 *
 * CANONICAL FRAME (the one world/itemMeshes.js documents): long axis along +Y,
 * the bow at the bottom, the bit's teeth toward +X, the broad face in the XY
 * plane. The origin is the collar just above the bow.
 */

/** ExtrudeGeometry's cap UVs are the shape's own coordinates, in metres: scaled up so the finish texture is not stretched over a few pixels. */
const EXTRUDE_UV_SCALE = 14;

function extrude(shape, depth, bevel) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 40
  });
  geometry.translate(0, 0, -depth / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * EXTRUDE_UV_SCALE, uv.getY(i) * EXTRUDE_UV_SCALE);
  return geometry;
}

/** A bow outline: a circle whose radius swells in `lobes` rounded petals, with a round hole through it. */
function bowShape({ radius, lobes, lobeDepth, stretch = 1, hole }) {
  const shape = new THREE.Shape();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = radius * (1 + lobeDepth * Math.cos(lobes * a));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * stretch;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const eye = new THREE.Path();
  eye.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(eye);
  return shape;
}

/** A closed polygon from flat [x, y, x, y, ...] pairs. */
function polygon(points) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points.length; i += 2) {
    if (i === 0) shape.moveTo(points[i], points[i + 1]);
    else shape.lineTo(points[i], points[i + 1]);
  }
  shape.closePath();
  return shape;
}

function part(geometry, material, { x = 0, y = 0, z = 0 } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildKey({ name, material, bow, stem, bit, thickness, bevel, bowCentre }) {
  const key = new THREE.Group();
  key.name = name;
  key.add(part(extrude(bowShape(bow), thickness, bevel), material, { y: bowCentre }));
  // A raised rim on the bow's face would need another mesh; the lathe collars
  // below carry the ornament instead.
  const lathe = new THREE.LatheGeometry(stem.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  key.add(part(lathe, material));
  key.add(part(extrude(polygon(bit), thickness * 0.8, bevel * 0.8), material));
  return key;
}

/**
 * The brass safe key from the lamp drawer: a clover bow, collars on the stem and
 * a bit with two notches. 10.5 cm.
 */
export function buildBrassKey() {
  return buildKey({
    name: 'brassKey',
    material: brassKeyMaterial(),
    thickness: 0.0034,
    bevel: 0.0007,
    bowCentre: -0.0215,
    bow: { radius: 0.0125, lobes: 4, lobeDepth: 0.34, hole: 0.0062 },
    // [radius, y] from the bottom of the stem up: collar, long shaft, a swelling
    // ring below the bit, the end rounded off.
    stem: [
      [0.0, -0.0035], [0.0046, -0.0035], [0.0066, -0.0012], [0.0066, 0.0016], [0.0044, 0.0032],
      [0.0031, 0.0048], [0.0031, 0.0345],
      [0.0050, 0.0362], [0.0050, 0.0394], [0.0031, 0.0412],
      [0.0031, 0.0618], [0.0022, 0.0640], [0.0, 0.0644]
    ],
    bit: [
      0.0015, 0.0640, 0.0175, 0.0640, 0.0175, 0.0592, 0.0108, 0.0592, 0.0108, 0.0548,
      0.0165, 0.0548, 0.0165, 0.0482, 0.0088, 0.0482, 0.0088, 0.0436, 0.0155, 0.0436,
      0.0155, 0.0372, 0.0015, 0.0372
    ]
  });
}

/**
 * The bedroom door's key: heavier, longer, a plain oval bow and a stout stem
 * with a flared collar. 19 cm -- it opens a door, not a drawer.
 */
export function buildIronKey() {
  return buildKey({
    name: 'bedroomKey',
    material: ironKeyMaterial(),
    thickness: 0.0105,
    bevel: 0.0014,
    bowCentre: -0.0415,
    bow: { radius: 0.0345, lobes: 2, lobeDepth: 0.06, stretch: 1.12, hole: 0.0185 },
    stem: [
      [0.0, -0.0045], [0.0105, -0.0045], [0.0145, -0.0010], [0.0145, 0.0035], [0.0100, 0.0070],
      [0.0078, 0.0110], [0.0078, 0.0850],
      [0.0112, 0.0880], [0.0112, 0.0925], [0.0078, 0.0955],
      [0.0078, 0.1140], [0.0056, 0.1180], [0.0, 0.1190]
    ],
    bit: [
      0.0050, 0.1180, 0.0385, 0.1180, 0.0385, 0.1090, 0.0250, 0.1090, 0.0250, 0.1010,
      0.0370, 0.1010, 0.0370, 0.0860, 0.0200, 0.0860, 0.0200, 0.0780, 0.0340, 0.0780,
      0.0340, 0.0700, 0.0050, 0.0700
    ]
  });
}
