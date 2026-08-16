import * as THREE from 'three';

// A thin skirting board run around a rectangular room's perimeter. Small
// detail, but a bare wall-to-floor seam is one of the fastest visual
// tells that a room is a blockout rather than a dressed space.
export function addBaseboard(parent, { width, depth, height = 0.11, color = 0x1c1712, thickness = 0.02 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const y = height / 2;
  const sides = [
    { w: width, x: 0, z: -depth / 2 + thickness / 2, ry: 0 },
    { w: width, x: 0, z: depth / 2 - thickness / 2, ry: 0 },
    { w: depth, x: -width / 2 + thickness / 2, z: 0, ry: Math.PI / 2 },
    { w: depth, x: width / 2 - thickness / 2, z: 0, ry: Math.PI / 2 }
  ];
  sides.forEach(({ w, x, z, ry }) => {
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, height, thickness), mat);
    board.position.set(x, y, z);
    board.rotation.y = ry;
    parent.add(board);
  });
}

// A small cylindrical door/drawer handle -- cheap hardware detail that
// reads clearly even at a distance, unlike flat-coloured furniture faces.
export function makeHandle({ length = 0.1, radius = 0.008, color = 0x1a1a1a, metalness = 0.7, roughness = 0.35 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), mat);
  handle.rotation.z = Math.PI / 2;
  return handle;
}
