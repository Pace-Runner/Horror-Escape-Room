import * as THREE from 'three';

/**
 * Splits one wall-length skirting run around its door openings.
 * Each returned segment is expressed relative to the centre of the wall,
 * keeping trim clear of doorway frames without affecting room geometry.
 */
function createBaseboardSegments(lengthMetres, openings) {
  const halfLengthMetres = lengthMetres / 2;
  const sortedOpenings = [...openings].sort((firstOpening, secondOpening) => firstOpening.center - secondOpening.center);
  const segments = [];
  let segmentStartMetres = -halfLengthMetres;

  for (const opening of sortedOpenings) {
    const openingStartMetres = Math.max(-halfLengthMetres, opening.center - opening.width / 2);
    const openingEndMetres = Math.min(halfLengthMetres, opening.center + opening.width / 2);
    if (openingStartMetres > segmentStartMetres) {
      segments.push({
        center: (segmentStartMetres + openingStartMetres) / 2,
        width: openingStartMetres - segmentStartMetres
      });
    }
    segmentStartMetres = Math.max(segmentStartMetres, openingEndMetres);
  }

  if (segmentStartMetres < halfLengthMetres) {
    segments.push({
      center: (segmentStartMetres + halfLengthMetres) / 2,
      width: halfLengthMetres - segmentStartMetres
    });
  }
  return segments;
}

// A thin skirting board run around a rectangular room's perimeter. Small
// detail, but a bare wall-to-floor seam is one of the fastest visual
// tells that a room is a blockout rather than a dressed space.
export function addBaseboard(parent, {
  width,
  depth,
  height = 0.11,
  color = 0x1c1712,
  thickness = 0.02,
  materialFactory = null,
  frontOpenings = [],
  backOpenings = [],
  wallInsets = {}
} = {}) {
  const defaultMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const y = height / 2;
  const {
    front: frontInsetMetres = 0,
    back: backInsetMetres = 0,
    left: leftInsetMetres = 0,
    right: rightInsetMetres = 0
  } = wallInsets;
  const sides = [
    { length: width, x: 0, z: -depth / 2 + thickness / 2 + backInsetMetres, rotationY: 0, openings: backOpenings },
    { length: width, x: 0, z: depth / 2 - thickness / 2 - frontInsetMetres, rotationY: 0, openings: frontOpenings },
    { length: depth, x: -width / 2 + thickness / 2 + leftInsetMetres, z: 0, rotationY: Math.PI / 2, openings: [] },
    { length: depth, x: width / 2 - thickness / 2 - rightInsetMetres, z: 0, rotationY: Math.PI / 2, openings: [] }
  ];
  for (const side of sides) {
    for (const segment of createBaseboardSegments(side.length, side.openings)) {
      const material = materialFactory ? materialFactory(segment.width) : defaultMaterial;
      const board = new THREE.Mesh(new THREE.BoxGeometry(segment.width, height, thickness), material);
      board.name = 'SkirtingBoard';
      if (side.rotationY === 0) {
        board.position.set(side.x + segment.center, y, side.z);
      } else {
        board.position.set(side.x, y, side.z - segment.center);
      }
      board.rotation.y = side.rotationY;
      parent.add(board);
    }
  }
}

// A small cylindrical door/drawer handle -- cheap hardware detail that
// reads clearly even at a distance, unlike flat-coloured furniture faces.
export function makeHandle({ length = 0.1, radius = 0.008, color = 0x1a1a1a, metalness = 0.7, roughness = 0.35 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), mat);
  handle.rotation.z = Math.PI / 2;
  return handle;
}
