import * as THREE from 'three';

const direction = new THREE.Vector3(), target = new THREE.Vector3(), projected = new THREE.Vector3(), ray = new THREE.Raycaster();
const occluders = [];

/** A direct view of the creature, never the CCTV image or a view through a wall. */
export function hasDirectCreatureSight(camera, position, room) {
  camera.getWorldDirection(direction);
  room.updateWorldMatrix(true, true);
  occluders.length = 0;
  room.traverseVisible(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material?.visible !== false && (!material?.transparent || material.opacity > .5))) occluders.push(object);
  });
  for (const height of [1.55, 1.05]) {
    target.set(position.x, height, position.z);
    projected.copy(target).project(camera);
    if (Math.abs(projected.x)>1 || Math.abs(projected.y)>1 || projected.z < -1 || projected.z > 1) continue;
    target.sub(camera.position);
    const distance = target.length();
    if (!distance) return true;
    target.divideScalar(distance);
    if (direction.dot(target) <= 0) continue;
    ray.set(camera.position, target);
    ray.near = .03;
    ray.far = Math.max(.03, distance - .3);
    if (!ray.intersectObjects(occluders, false).length) return true;
  }
  return false;
}
