/** Meshes handed to compile() at a time, before the page gets a turn. */
const MESHES_PER_BATCH = 24;

/** Lets the page draw a frame (or run a timer) between batches. */
const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * renderer.compileAsync() for exactly what is visible in `scene` right now,
 * a few meshes at a time.
 *
 * compileAsync(scene) on its own builds a shader for every mesh in the scene,
 * hidden or not -- every level, every time. Handing it a single room instead
 * (compileAsync(room, camera, scene)) counts that room's lights twice, once
 * from the room and once from the scene, so every shader came out built for
 * lights it is never drawn with and the first real frame built them all again.
 *
 * So each batch is handed over as a stand-in for the scene: the scene in every
 * way (its fog, its environment) except that traverse() visits only that
 * batch's meshes and traverseVisible() -- where compile() looks for lights --
 * only the visible lights, each once. The driver builds each shader in the
 * background, and the page gets a turn between batches: one call for a whole
 * room used to hold it for over a second.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {object} [options]
 * @param {(work: () => void) => void} [options.around] - runs each batch's
 *   synchronous part inside whatever state the real draw uses (a render
 *   target, fog off for the map). Defaults to running it as it is.
 * @returns {Promise<void>} resolves once every shader is ready.
 */
export async function compileVisibleAsync(renderer, scene, camera, { around = (work) => work() } = {}) {
  const meshes = [];
  const lights = [];
  around(() => {
    scene.traverseVisible((o) => {
      if (o.isLight) lights.push(o);
      else if (o.isMesh || o.isPoints || o.isLine || o.isSprite) meshes.push(o);
    });
  });
  const pending = [];
  for (let i = 0; i < meshes.length; i += MESHES_PER_BATCH) {
    const batch = meshes.slice(i, i + MESHES_PER_BATCH);
    const view = Object.create(scene);
    view.traverse = (visit) => batch.forEach(visit);
    view.traverseVisible = (visit) => lights.forEach(visit);
    around(() => pending.push(renderer.compileAsync(view, camera)));
    await yieldToPage();
  }
  await Promise.all(pending);
}
