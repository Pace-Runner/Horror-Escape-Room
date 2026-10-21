import * as THREE from 'three';
import { MINIMAP_ONLY } from './RenderLayers.js';
import { compileVisibleAsync } from '../world/compileVisible.js';

/**
 * The top-down map, as its own module with two modes.
 *
 * A second, small WebGLRenderer sharing the main scene, rather than a
 * scissor/viewport split on the main one: postFX owns that renderer's whole
 * surface via its composer, and carving a corner out of a composer target is far
 * more invasive than handing the map its own tiny canvas.
 *
 * TWO MODES, because one scale cannot serve both jobs:
 *
 *   follow   -- 14 m around the player, marker pinned at the centre. This is
 *               orientation inside a room you can already see. Every house
 *               level uses it and nothing about them changed.
 *
 *   overview -- the whole level framed at once, marker moving inside it. The
 *               backrooms is 52 x 49 m; at 14 m the map is a keyhole, and a
 *               keyhole with fog over it is not navigation, it is a rumour.
 *               Framing the level is what lets the revealed corridors
 *               accumulate into a floor plan you can actually read.
 *
 * The map is the ONLY wayfinding aid the backrooms has left -- the blood arrows
 * were removed, and the lights that used to mark the route now fail on purpose.
 * So this is load-bearing for playability, not decoration.
 */

const ALTITUDE = 16;      // metres above the floor the map camera sits at
const MINIMAP_PX = 180;   // matches #minimap-wrap's CSS size in style.css
const OVERVIEW_MARGIN = 1.04;
/**
 * The shortest gap between two map renders. The map is a full second draw of
 * the scene through its own renderer -- in the bedroom that measured MORE than
 * the main view (760 draw calls, ~18 ms a frame on a GTX 1660 Ti) for a
 * 180 px picture. Thirty a second is indistinguishable at that size: at a
 * sprint the map moves under one pixel between renders. The heading arrow is
 * a DOM element and is still updated every frame, so turning stays smooth.
 * Set to 0 to render the map every frame again.
 */
const MIN_RENDER_INTERVAL_MS = 1000 / 30;

/** What a level asks for when it wants the whole floor framed. */
export const FOLLOW = { mode: 'follow', view: 14 };

export function createMinimap({ canvas, arrowEl, wrapEl, scene, camera }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(MINIMAP_PX, MINIMAP_PX);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const mapCamera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 40);

  /**
   * The map's only light source, and the reason it stays legible in rooms the
   * story keeps deliberately dark for the main view.
   *
   * Scoped to MINIMAP_ONLY so it is invisible to every other camera in the game
   * -- three.js only feeds a light into a render pass when
   * `light.layers.test(camera.layers)` is true, which is a per-camera check done
   * once per render, not a per-object one. Nothing about the main view's
   * carefully measured brightness changes.
   */
  const light = new THREE.AmbientLight(0xffffff, 2.6);
  light.layers.set(MINIMAP_ONLY);
  scene.add(light);

  const _forward = new THREE.Vector3();
  let spec = null;         // the mode object the active level handed us
  // -Infinity so the very first update() always draws, and so does the first
  // one after a mode change (see setMode) -- a new level must never show the
  // previous level's map for even a frame.
  let lastRenderTimeMs = -Infinity;
  let view = 14;
  let cx = 0;
  let cz = 0;

  function setMode(next) {
    const s = next ?? FOLLOW;
    if (s === spec) return;    // identity guard: this is called every frame
    spec = s;
    lastRenderTimeMs = -Infinity;

    if (s.mode === 'overview') {
      const b = s.bounds;
      cx = (b.minX + b.maxX) / 2;
      cz = (b.minZ + b.maxZ) / 2;
      view = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * OVERVIEW_MARGIN;
      // A round map would crop the corners off a square floor plan, and the
      // corners are where the dead ends are. Square frame for square level.
      wrapEl.classList.add('overview');
    } else {
      view = s.view ?? 14;
      wrapEl.classList.remove('overview');
      // Follow mode pins the marker with CSS; clear anything overview wrote.
      arrowEl.style.left = '';
      arrowEl.style.top = '';
    }

    mapCamera.left = -view / 2;
    mapCamera.right = view / 2;
    mapCamera.top = view / 2;
    mapCamera.bottom = -view / 2;
    mapCamera.updateProjectionMatrix();

    // EXCLUSIVE mode draws the map from MINIMAP_ONLY geometry and nothing else.
    //
    // Not a micro-optimisation -- it closes a whole class of bug. The walls
    // themselves leak nothing (they are zero-thickness planes seen exactly
    // edge-on by a straight-down ortho camera, so they project to zero screen
    // area), but the wall tide strips are real 2 cm boxes, and so are the
    // puddles, the cobwebs, the dead flies and the door. Every one of them
    // traces an unexplored corridor from above and quietly undoes the fog.
    // Chasing props onto MAIN_ONLY one at a time would work until someone adds
    // the next prop; clearing bit 0 means only geometry authored FOR the map can
    // ever appear on it.
    if (s.exclusive) {
      mapCamera.layers.set(MINIMAP_ONLY);
    } else {
      mapCamera.layers.set(0);
      mapCamera.layers.enable(MINIMAP_ONLY);
    }
  }

  setMode(FOLLOW);

  /**
   * Draws the map, with the scene briefly put into the state the map needs.
   *
   * @param {(renderer: THREE.WebGLRenderer) => T} draw - does the actual
   *   rendering or compiling; runs with fog off and the view-model hidden.
   * @returns {T} whatever draw returned.
   * @template T
   */
  function withMapRenderState(draw) {
    // Fog is tuned for a horizontal sightline; 16 m of pure altitude would blow
    // through most levels' fog budget before the frustum even starts and wash
    // the whole map to a flat haze. Off for this one render, restored before the
    // main pass reads it.
    const savedFog = scene.fog;
    scene.fog = null;
    // The hands, the held torch, its two spotlights and the dust motes are all
    // parented to `camera`, so a second camera rendering the same scene sees
    // them too -- from directly above, the torch model reads as a stray line
    // poking out of the player marker. `visible = false` on a parent stops
    // WebGLRenderer's traversal from ever reaching its children (see
    // projectObject in three's source), so this hides the whole view-model rig
    // for one render and costs nothing else -- the camera itself was never drawn
    // to begin with.
    camera.visible = false;
    try {
      return draw(renderer);
    } finally {
      camera.visible = true;
      scene.fog = savedFog;
    }
  }

  /**
   * Builds every shader program the map will need for what is visible now,
   * then draws one frame. Called from the loading screen for each level.
   *
   * The map has its OWN WebGL context, so the main renderer's warm-up does
   * nothing for it. Unwarmed, it compiled its programs on its first frame in
   * each level -- the moment the player first clicked in, and again on
   * entering each new room -- which measured as a 1.8 to 10 s freeze after a
   * loading bar that had already finished.
   *
   * The programs are chosen synchronously inside compileAsync, under the same
   * fog-off state the real render uses (a program built under the level's fog
   * would be the wrong program); only the wait for the driver happens after
   * that state is restored.
   *
   * @returns {Promise<void>} resolves once the programs are ready and drawn.
   */
  async function warmUp() {
    // Each batch is built under the same fog-off, view-model-hidden state the
    // real map render uses.
    await compileVisibleAsync(renderer, scene, mapCamera, { around: (work) => withMapRenderState(work) });
    lastRenderTimeMs = -Infinity;
    update();
  }

  function update() {
    const px = camera.position.x;
    const pz = camera.position.z;

    if (spec.mode === 'overview') {
      mapCamera.position.set(cx, ALTITUDE, cz);
      mapCamera.up.set(0, 0, -1);
      mapCamera.lookAt(cx, 0, cz);
      // World +X is screen-right and world -Z is screen-up under that up
      // vector, so both axes map straight through with no sign flip.
      const scale = MINIMAP_PX / view;
      arrowEl.style.left = `${MINIMAP_PX / 2 + (px - cx) * scale}px`;
      arrowEl.style.top = `${MINIMAP_PX / 2 + (pz - cz) * scale}px`;
    } else {
      mapCamera.position.set(px, camera.position.y + ALTITUDE, pz);
      mapCamera.up.set(0, 0, -1);
      mapCamera.lookAt(camera.position);
    }

    camera.getWorldDirection(_forward);
    // Measured from "up" under the up vector above, and it grows in the same
    // clockwise sense CSS rotate() does, so no sign flip here either.
    const heading = Math.atan2(_forward.x, -_forward.z);
    arrowEl.style.transform = `translate(-50%, -50%) rotate(${heading}rad)`;

    const nowMs = performance.now();
    if (nowMs - lastRenderTimeMs < MIN_RENDER_INTERVAL_MS) return;
    lastRenderTimeMs = nowMs;
    withMapRenderState((mapRenderer) => mapRenderer.render(scene, mapCamera));
  }

  return { setMode, update, warmUp, get camera() { return mapCamera; } };
}
