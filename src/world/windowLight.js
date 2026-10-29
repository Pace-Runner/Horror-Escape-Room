import * as THREE from 'three';

/**
 * A window's light (the bedroom's and the upstairs hall's): a SpotLight far
 * out in the storm, its cone on the window, cut to the window's shape by the
 * walls' shadows. That cut only holds on a surface that takes shadows. A
 * skirting board, the door's planks or a decal that did not lit up across
 * the room in every strike, and in the moonlight between them, as if there
 * were no wall.
 *
 * So everything lit that reaches into the cone takes shadows. Call it once,
 * synchronously, as the room is built (a shadow receiver is a different
 * shader, and the room's shaders are compiled at boot).
 *
 * @param {THREE.Object3D} root - the room.
 * @param {THREE.SpotLight} light - the window's light (its target in the scene).
 * @param {object} [options]
 * @param {THREE.Object3D[]} [options.except] - left as they are (a ceiling kept from another light's shadow).
 */
export function takeWindowShadows(root, light, { except = [] } = {}) {
  root.updateMatrixWorld(true);
  const apex = light.getWorldPosition(new THREE.Vector3());
  const axis = light.target.getWorldPosition(new THREE.Vector3()).sub(apex).normalize();
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.receiveShadow || except.includes(mesh)) return;
    const lit = [].concat(mesh.material).some((m) => m?.isMeshStandardMaterial || m?.isMeshLambertMaterial || m?.isMeshPhongMaterial);
    if (!lit) return;
    box.setFromObject(mesh);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(apex);
      if (corner.angleTo(axis) < light.angle) {
        mesh.receiveShadow = true;
        return;
      }
    }
  });
}
