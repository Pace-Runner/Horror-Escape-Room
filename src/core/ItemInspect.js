import * as THREE from 'three';

/**
 * INSPECT (I): the item in the hand, laid flat on the screen in the document
 * reader -- the same full-size view the upstairs hall's framed pieces open in
 * (main.js, onInspect), for every item the game has.
 *
 * The picture is the item's own model, the one the floor and the hand draw
 * (world/itemMeshes.js), laid the way it lies when dropped and photographed
 * from above against black by a renderer of its own: a second, small WebGL
 * context. So nothing it draws touches the game's shader programs (a program
 * is built for one exact set of lights, and the game's are baked in at boot),
 * the game's camera never moves, and no frame of the game is spent on it.
 * Photographed afresh each time, so an item whose model arrives late (a GLB
 * template) is shown as it is now, not as its placeholder was.
 */

/** The picture's side, in pixels. */
const SIZE = 768;
/** Tipped this far off looking straight down (radians), so the item keeps some depth. */
const TILT = 0.32;
/** The share of the picture its longer side fills. */
const FILL = 0.78;

/**
 * @param {object} deps
 * @param {ReturnType<import('../world/itemMeshes.js').createItemMeshes>} deps.itemMeshes
 */
export function createItemInspect({ itemMeshes }) {
  let renderer = null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  // A warm key from above and in front, a cool rim from behind, and a little of everything.
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x241c14, 1.4));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
  key.position.set(0.8, 3, 1.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db2d4, 1.1);
  rim.position.set(-1.6, 1.2, -2);
  scene.add(rim);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();

  function createRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(SIZE, SIZE, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x050404, 1);
    return r;
  }

  function photograph(id) {
    const prop = itemMeshes.build(id, 'world');
    if (!prop) return null;
    renderer ??= createRenderer();
    const [rx, ry, rz] = itemMeshes.restRotation(id);
    prop.rotation.set(rx, ry, rz);
    const holder = new THREE.Group();
    holder.add(prop);
    scene.add(holder);
    try {
      holder.updateMatrixWorld(true);
      box.setFromObject(holder);
      box.getCenter(centre);
      holder.position.sub(centre);
      holder.updateMatrixWorld(true);
      box.getSize(size);
      // Its longer side across the floor fills FILL of the picture; a tall
      // thing (the bottle, lying down) is still mostly its length.
      const span = Math.max(size.x, size.z, size.y * 0.6, 0.02);
      const distance = span / FILL / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, Math.cos(TILT) * distance, Math.sin(TILT) * distance);
      camera.near = distance / 20;
      camera.far = distance * 4;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      scene.remove(holder);
    }
  }

  return {
    /** A picture of `id` for an <img> (a data URL), or null for an item with no model. */
    picture(id) {
      try {
        return photograph(id);
      } catch (error) {
        console.warn(`ItemInspect: could not photograph ${id}`, error);
        return null;
      }
    }
  };
}
