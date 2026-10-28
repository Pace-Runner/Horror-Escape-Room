import * as THREE from 'three';

/** Same doorway envelope, without faces coplanar with the room's walls/ceiling. */
export function createDoorSoffitGeometry(axis, width, length, height) {
  const geometry = new THREE.BoxGeometry(axis === 'z' ? width : length, height, axis === 'z' ? length : width);
  // Box face groups: +X, -X, +Y, -Y, +Z, -Z. Keep bottom and doorway ends.
  const hidden = new Set(axis === 'z' ? [0, 1, 2] : [2, 4, 5]);
  const indices = [];
  geometry.groups.forEach((group, face) => {
    if (hidden.has(face)) return;
    for (let i = group.start; i < group.start + group.count; i++) indices.push(geometry.index.getX(i));
  });
  geometry.setIndex(indices);
  geometry.clearGroups();
  return geometry;
}

/** Fixed transparent layering; depth testing against real walls stays enabled. */
export function createDecalOrdering() {
  let serial = 0;
  return (mesh, layer = 100) => {
    mesh.renderOrder = layer + (++serial / 100000);
    return mesh;
  };
}
