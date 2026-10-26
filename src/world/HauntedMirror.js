import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/**
 * The study's one uncracked mirror, as a REAL reflection -- but only once the
 * player is meant to look into it.
 *
 * Until Annabelle's letter is read (the last cupboard, studyLevel.js's
 * truthDrawer) the mirror is the same dull silvered plane it always was, and
 * examining it says "The reflection won't settle." Reading the letter
 * ("The mirror feels different now.") brings this layer in over it: the glass
 * fades from dull to reflecting over a couple of seconds, swimming as it does,
 * and then holds still. The reveal cutscene that follows is filmed with the
 * reflection live, so the body in the glass is the one the scene shows.
 *
 * HOW A PLANAR REFLECTION WORKS (three's Reflector, from the examples):
 *   1. On every frame the glass is on screen, a second camera is placed at the
 *      viewer's position MIRRORED through the glass's plane, looking at the
 *      mirrored look-at point.
 *   2. The scene is drawn from that camera into a render target. Its
 *      projection matrix gets an OBLIQUE near plane lying exactly on the glass
 *      (Lengyel's technique), so nothing behind the mirror -- the wall it hangs
 *      on -- leaks into the picture.
 *   3. The glass samples that texture with PROJECTIVE coordinates: the vertex
 *      shader multiplies each vertex by `textureMatrix` (bias * projection *
 *      view of the mirrored camera) and the fragment shader divides by w. That
 *      lines the texture up with the screen, so the reflection sits where the
 *      eye expects it instead of being stretched across the glass like a poster.
 *
 * WHAT IS OURS is the glass's shader below. Reflector accepts a custom shader as
 * long as it keeps the `tDiffuse`, `textureMatrix` and `color` uniforms it fills
 * in. `uReveal` is GAME STATE driving a uniform: 0 before the letter, eased to 1
 * after it. While it climbs, two scrolling noise fields displace the lookup and
 * a lagging second image is mixed in, both scaled by (1 - uReveal), so the
 * reflection visibly settles into place. The glass is old: its silvering is
 * tinted, and loses reflectivity in blotches (foxing -- the dark spots antique
 * mirrors develop as the silver tarnishes) and towards the frame.
 *
 * COST. Nothing at all before the letter: the layer is hidden, so three never
 * calls its onBeforeRender and no second render happens. After it, the extra
 * render only runs on frames where the glass survives frustum culling, at a
 * fraction of the screen's resolution (setSize; the graphics setting lowers it).
 */

/** How strongly the reflection swims while it is settling, in screen-space UV. */
const SETTLING_WARP_IN_UV = 0.018;
/** How far the lagging second image drifts sideways at most, in UV. */
const GHOST_DRIFT_IN_UV = 0.010;
/** Seconds (time constant) for the glass to come in and settle. Slow on purpose. */
const REVEAL_TIME_IN_SECONDS = 1.6;
/** Below this the layer is hidden outright, so it costs no render. */
const HIDDEN_BELOW_REVEAL = 0.002;
/** Silvered glass reflects most of the light, not all of it, and not neutrally. */
const SILVER_TINT = 0xd8dcd4;

const HAUNTED_MIRROR_SHADER = {
  name: 'HauntedMirrorShader',

  uniforms: {
    // The three Reflector fills in itself.
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    // Ours.
    uTime: { value: 0 },
    /** 0 = the dull glass underneath shows, 1 = a settled reflection. Eased by update(). */
    uReveal: { value: 0 }
  },

  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    // Projective coordinates into the reflection texture. vec4, not vec2: the
    // divide by w has to happen per FRAGMENT, or the reflection warps across
    // the glass when it is seen at an angle.
    varying vec4 vReflectCoord;
    // The glass's own 0..1 coordinates, for effects that belong to the glass
    // (the ripple's pattern, the foxing) rather than to the screen.
    varying vec2 vUv;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vUv = uv;
      vReflectCoord = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,

  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uReveal;
    varying vec4 vReflectCoord;
    varying vec2 vUv;

    #include <logdepthbuf_pars_fragment>

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Value noise: smooth random hills, cheap enough to sample several times.
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    void main() {
      #include <logdepthbuf_fragment>

      // The projective divide: where this fragment's reflection is on screen.
      vec2 reflectUv = vReflectCoord.xy / vReflectCoord.w;

      // --- settling --------------------------------------------------------
      // Two noise fields scrolling against each other, in the glass's own UVs
      // so the ripples stay stuck to the mirror as the player moves. Taller
      // than wide, like heat haze. All of it fades out as uReveal reaches 1.
      float unsettled = 1.0 - uReveal;
      vec2 rippleUv = vUv * vec2(3.0, 7.0);
      vec2 warp = vec2(
        noise(rippleUv + vec2(0.0, uTime * 0.45)),
        noise(rippleUv + vec2(5.2, -uTime * 0.38))
      ) - 0.5;
      warp.x += sin(vUv.y * 11.0 + uTime * 1.3) * 0.3;
      vec2 offset = warp * ${SETTLING_WARP_IN_UV.toFixed(4)} * unsettled;

      vec3 reflection = texture2D(tDiffuse, reflectUv + offset).rgb;
      // A second image lagging behind the first, so an outline in the glass
      // does not quite agree with itself until it has settled.
      vec2 ghostShift = vec2(sin(uTime * 0.7), cos(uTime * 0.53) * 0.4) * ${GHOST_DRIFT_IN_UV.toFixed(4)};
      vec3 ghost = texture2D(tDiffuse, reflectUv - offset * 1.7 + ghostShift * unsettled).rgb;
      reflection = mix(reflection, ghost, 0.4 * unsettled);

      // --- old silvering ---------------------------------------------------
      // Foxing: blotches where the silver has tarnished, darker but never black.
      float foxing = smoothstep(0.62, 0.86, noise(vUv * vec2(7.0, 17.0)) * 0.7 + noise(vUv * 31.0) * 0.3);
      // And the edges go first: dimmer at the frame, full a few centimetres in.
      vec2 fromEdge = min(vUv, 1.0 - vUv);
      float rim = smoothstep(0.0, 0.07, min(fromEdge.x, fromEdge.y * 0.4));
      float silver = mix(0.55, 1.0, rim) * (1.0 - foxing * 0.45);

      // Alpha is the reveal: the dull glass underneath shows through until the
      // reflection has fully come in.
      gl_FragColor = vec4(reflection * color * silver, uReveal);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
};

/**
 * Frame-rate independent ease toward a target -- the same curve the rest of the
 * project uses (1 - exp(-dt / tau)), so 60 Hz and 144 Hz settle identically.
 *
 * @param {number} current - the value now.
 * @param {number} target - the value being approached.
 * @param {number} timeConstantInSeconds - time to cover ~63% of the gap.
 * @param {number} dtInSeconds - this frame's step.
 * @returns {number} the eased value.
 */
function approachValue(current, target, timeConstantInSeconds, dtInSeconds) {
  return current + (target - current) * (1 - Math.exp(-dtInSeconds / timeConstantInSeconds));
}

/**
 * Builds the reflecting layer. The caller positions it just in front of the
 * dull glass (it faces +Z in its own space, like a PlaneGeometry).
 *
 * @param {object} options
 * @param {number} options.widthInMetres - the glass's width.
 * @param {number} options.heightInMetres - the glass's height.
 * @returns {{
 *   mesh: Reflector,
 *   setReflective: (isReflective: boolean) => void,
 *   setReflectionHooks: (hooks: { beforeReflection?: () => void, afterReflection?: () => void }) => void,
 *   setSize: (widthInPixels: number, heightInPixels: number) => void,
 *   update: (dtInSeconds: number) => void,
 *   reset: () => void
 * }}
 */
export function createHauntedMirror({ widthInMetres, heightInMetres }) {
  const mesh = new Reflector(new THREE.PlaneGeometry(widthInMetres, heightInMetres), {
    shader: HAUNTED_MIRROR_SHADER,
    color: SILVER_TINT,
    // A first size only; main.js resizes it to the screen before it is seen.
    textureWidth: 512,
    textureHeight: 512,
    // The glass is right in front of the player's face; without MSAA the
    // reflection's edges stair-step.
    multisample: 4
  });
  mesh.name = 'Study_Mirror_Reflection';
  // Transparent so the fade-in can show the dull glass through it. Not
  // depth-writing, so it can never hide the glass it lies on.
  mesh.material.transparent = true;
  mesh.material.depthWrite = false;
  mesh.visible = false;

  const uniforms = mesh.material.uniforms;
  let revealTarget = 0;
  let reflectionHooks = {};

  /**
   * Wraps Reflector's own onBeforeRender (where it draws the reflection) to do
   * the three things this game needs around it:
   *
   * - ONLY FOR PERSPECTIVE EYES. The minimap's orthographic camera draws the
   *   study from straight above, and mirroring that is wasted work.
   * - THE SAME LAYERS AS THE EYE. Reflector's camera sees layer 0 only, but
   *   this game scopes real geometry AND lights to the main camera with layers
   *   (core/RenderLayers.js) -- and three culls lights by the camera's layers
   *   too, so a reflection camera on the default mask would draw the room
   *   with some of its lights missing.
   * - THE PLAYER, NOT THE VIEW MODEL. The hands and the torch are parented to
   *   the camera and would hang in the glass where the head is; the player's
   *   body, hidden in first person, is what should be there instead. main.js
   *   owns those objects, so it does the swap through these hooks.
   */
  const renderReflection = mesh.onBeforeRender;
  mesh.onBeforeRender = function (renderer, scene, camera, ...rest) {
    if (!camera.isPerspectiveCamera) return;
    mesh.camera.layers.mask = camera.layers.mask;
    reflectionHooks.beforeReflection?.();
    try {
      renderReflection.call(this, renderer, scene, camera, ...rest);
    } finally {
      reflectionHooks.afterReflection?.();
    }
  };

  return {
    mesh,

    /** The letter has been read (true) or not yet (false). Eased -- see update(). */
    setReflective(isReflective) {
      revealTarget = isReflective ? 1 : 0;
    },

    /** Callbacks run immediately before and after the reflection is drawn. */
    setReflectionHooks(hooks) {
      reflectionHooks = hooks ?? {};
    },

    /**
     * Sizes the reflection target in pixels. The texture is sampled in SCREEN
     * space, so it should keep the screen's aspect ratio; its resolution is
     * the caller's call (a fraction of the drawing buffer).
     */
    setSize(widthInPixels, heightInPixels) {
      mesh.getRenderTarget().setSize(Math.max(1, Math.round(widthInPixels)), Math.max(1, Math.round(heightInPixels)));
    },

    /** Advances the ripple clock and eases the reveal; hides the layer when it is off. */
    update(dtInSeconds) {
      uniforms.uTime.value += dtInSeconds;
      uniforms.uReveal.value = approachValue(uniforms.uReveal.value, revealTarget, REVEAL_TIME_IN_SECONDS, dtInSeconds);
      // Snap the tail, so "settled" really is 1 and the ripple really stops.
      if (Math.abs(uniforms.uReveal.value - revealTarget) < 0.001) uniforms.uReveal.value = revealTarget;
      mesh.visible = uniforms.uReveal.value > HIDDEN_BELOW_REVEAL;
    },

    /** Back to the start of a run: dull glass, immediately. */
    reset() {
      revealTarget = 0;
      uniforms.uReveal.value = 0;
      mesh.visible = false;
    }
  };
}
