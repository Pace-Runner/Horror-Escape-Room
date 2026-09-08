import * as THREE from 'three';
import { MINIMAP_ONLY } from './RenderLayers.js';

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
  let view = 14;
  let cx = 0;
  let cz = 0;

  function setMode(next) {
    const s = next ?? FOLLOW;
    if (s === spec) return;    // identity guard: this is called every frame
    spec = s;

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
    renderer.render(scene, mapCamera);
    camera.visible = true;
    scene.fog = savedFog;
  }

  return { setMode, update, get camera() { return mapCamera; } };
}
