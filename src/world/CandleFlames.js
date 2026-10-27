import * as THREE from 'three';
import { MAIN_ONLY } from '../core/RenderLayers.js';

/**
 * Live candle flames: every flame in a room is ONE instanced draw (plus one
 * for their halos), and a small FIXED pool of real point lights flickers in
 * step with the flames nearest the player.
 *
 * WHAT MAKES THEM LOOK ALIVE, cheapest first.
 *
 *   1. SHAPE, IN THE FRAGMENT SHADER. Each flame is a single quad. The shader
 *      carves the teardrop out of it with a width profile (a round bulb low
 *      down, tapering to a point), so there is no flame mesh to model. The
 *      edge is rippled by 1D value noise scrolling up the flame, which is the
 *      lick of a real flame's outline.
 *   2. COLOUR BANDS. A white-hot core low and in the middle, yellow, then
 *      orange, darkening to red at the tip, and the faint blue skirt a real
 *      candle has right at the wick where the wax vapour first burns.
 *   3. CYLINDRICAL BILLBOARDING. The quad turns about its own vertical axis to
 *      face the camera, so a flame looks the same from every side and stays
 *      upright when you look down at it from the loft.
 *   4. WIND. Each flame leans by a per-instance vector, bent quadratically up
 *      its height (the base is pinned to the wick; the tip swings furthest).
 *      The lean is a damped spring chasing a target built on the CPU from:
 *        - a slow ambient draft, different per flame;
 *        - the player's wake: walking past drags air along with you and
 *          shoves it ahead of you, so a nearby flame leans with your motion
 *          and away from your body, then wobbles back as the spring settles;
 *        - gusts: gust() pushes outward from a point, e.g. a door swinging;
 *        - steady draughts: addDraft() is a leak that never stops (an old
 *          sash window), blowing one way and breathing -- swelling and
 *          slackening on its own slow, irregular rhythm.
 *      The harder a flame is pushed, the more it flickers and the dimmer and
 *      shorter it burns -- a flame in a draught gutters.
 *   5. LIGHT. A small fixed pool of unshadowed PointLights goes to the
 *      candles nearest the player that are allowed one (a wall sconce, say,
 *      not a candle tucked on a shelf). Each light's intensity runs off the
 *      SAME flicker value the shader draws with, and it follows the lean, so
 *      the warm pool on the wallpaper breathes with the flame next to it. As
 *      the player walks on, a light fades out of the candle left behind and
 *      into the one ahead (LIGHT_FADE_SECONDS each way), with hysteresis so
 *      two candles at nearly the same distance do not trade it back and forth.
 *      A candle can say where its light stands (light.offset). A point light
 *      falls off as 1/d^2, so one left at the flame, 15 cm from the wallpaper,
 *      burns a spot behind the wick forty times brighter than the wall half a
 *      metre away: a white blot, not a pool. Stood a little way out into the
 *      room, the same light spreads into the soft, wide glow a candle really
 *      throws (most of which, in a real room, is light bounced off the wall
 *      and the brass, which no point light models).
 *
 * WHY A FIXED POOL. three.js bakes the number of lights into every lit
 * shader. Adding a light later -- when a candlestick model finishes loading,
 * say -- would recompile every material in the room mid-game, which is exactly
 * the hitch main.js's boot warm-up exists to prevent. So the pool's lights are
 * in the scene from the moment the room is built and are never added, removed
 * or hidden: only their intensity changes, and a light no candle needs sits at
 * 0. Twenty candles cost the same per pixel as three.
 *
 * The halo is a second quad per flame, fully camera-facing and additively
 * blended: the soft bloom round a candle seen in the dark, without a bloom pass.
 */

const FLAME_VERTEX = /* glsl */ `
  attribute vec4 aFlame; // xy: lean (flame heights per height), z: flicker 0..1, w: seed
  uniform float uTime;
  varying vec2 vUv;
  varying float vFlicker;
  varying float vSeed;
  varying float vStrain;

  void main() {
    vec4 base4 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 base = base4.xyz;
    float width = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    float height = length((modelMatrix * instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec2 lean = aFlame.xy;
    float strain = clamp(length(lean), 0.0, 1.0);

    // A pushed flame burns shorter and the flicker stretches it.
    float h = height * (0.86 + 0.22 * aFlame.z) * (1.0 - 0.35 * strain);
    float t = position.y; // 0 at the wick, 1 at the tip

    // Turn about the flame's own vertical axis to face the camera.
    vec3 toCamera = cameraPosition - base;
    toCamera.y = 0.0;
    vec3 right = normalize(vec3(toCamera.z, 0.0, -toCamera.x) + vec3(1e-5, 0.0, 0.0));

    // A little living wobble on top of the lean, larger towards the tip.
    float wobble = sin(uTime * 8.7 + aFlame.w * 17.0 + t * 4.0) * 0.05 * t * t
      + sin(uTime * 21.3 + aFlame.w * 5.0) * 0.018 * t;
    vec3 sway = vec3(lean.x, 0.0, lean.y) * t * t * h + right * wobble * h;

    vec3 p = base + right * position.x * width + vec3(0.0, t * h, 0.0) + sway;
    vUv = vec2(position.x, t);
    vFlicker = aFlame.z;
    vSeed = aFlame.w;
    vStrain = strain;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vFlicker;
  varying float vSeed;
  varying float vStrain;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float noise1(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  void main() {
    float y = vUv.y;
    // The outline licks: noise scrolling up the flame, stronger near the tip
    // and in a draught.
    float lick = (noise1(y * 7.0 - uTime * (6.5 + 4.0 * vStrain) + vSeed * 31.0) - 0.5)
      * (0.16 + 0.22 * vStrain) * y;
    float x = vUv.x + lick;

    // Width profile: a round bulb near the wick, then a long taper to a point.
    float bulb = 0.42 * pow(clamp(y / 0.3, 0.0, 1.0), 0.42);
    float taper = 0.42 * pow(clamp((1.0 - y) / 0.7, 0.0, 1.0), 1.3);
    float halfWidth = y < 0.3 ? bulb : taper;
    float d = abs(x) / max(halfWidth, 1e-3);
    if (d > 1.0) discard;

    vec3 red = vec3(0.62, 0.15, 0.03);
    vec3 orange = vec3(1.0, 0.50, 0.12);
    vec3 yellow = vec3(1.0, 0.84, 0.46);
    vec3 white = vec3(1.0, 0.97, 0.90);
    vec3 blue = vec3(0.22, 0.34, 0.95);

    float core = (1.0 - smoothstep(0.0, 0.6, d)) * (1.0 - smoothstep(0.12, 0.7, y));
    vec3 colour = mix(orange, yellow, 1.0 - smoothstep(0.25, 0.95, d));
    colour = mix(colour, white, core);
    colour = mix(colour, red, smoothstep(0.55, 1.0, y));
    float skirt = (1.0 - smoothstep(0.0, 0.13, y)) * smoothstep(0.15, 0.85, d);
    colour = mix(colour, blue, skirt * 0.85);

    float alpha = (1.0 - smoothstep(0.6, 1.0, d))
      * (1.0 - 0.55 * smoothstep(0.72, 1.0, y))
      * (0.78 + 0.22 * vFlicker)
      * mix(1.0, 0.4, skirt);
    gl_FragColor = vec4(colour * (1.05 + 0.25 * vFlicker), alpha);
  }
`;

const HALO_VERTEX = /* glsl */ `
  attribute vec4 aFlame;
  varying vec2 vUv;
  varying float vFlicker;

  void main() {
    vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float size = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    // Fully camera-facing: the camera's right and up, read out of the view matrix.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 lean = vec3(aFlame.x, 0.0, aFlame.y) * size * 0.25;
    vec3 p = centre + lean + (right * position.x + up * position.y) * size;
    vUv = position.xy * 2.0;
    vFlicker = aFlame.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uColour;
  uniform float uStrength;
  varying vec2 vUv;
  varying float vFlicker;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float glow = pow(1.0 - r, 2.4) * uStrength * (0.7 + 0.3 * vFlicker);
    gl_FragColor = vec4(uColour * glow, 1.0);
  }
`;

const DEFAULT_LIGHT = { color: 0xffa04a, intensity: 0.9, distance: 3.2, decay: 2 };
const LIGHT_FADE_SECONDS = 0.35;
/** A challenger must be this much nearer (in distance) to take a lit candle's light. */
const LIGHT_HYSTERESIS = 1.15;

/**
 * @param {object} options
 * @param {THREE.Object3D} options.parent  Where the flame batches and lights live (the level group).
 * @param {number} [options.capacity]      Most flames this room will ever hold.
 * @param {number} [options.lightCount]    Real lights in the pool. Fixed for the room's life.
 * @param {string} [options.name]
 */
export function createCandleFlames({ parent, capacity = 32, lightCount = 0, name = 'Candle_Flames' }) {
  const uniforms = { uTime: { value: 0 } };
  const flameGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const flameData = new Float32Array(capacity * 4);
  const flameAttribute = new THREE.InstancedBufferAttribute(flameData, 4);
  flameAttribute.setUsage(THREE.DynamicDrawUsage);
  flameGeometry.setAttribute('aFlame', flameAttribute);
  const flameMaterial = new THREE.ShaderMaterial({
    name: `${name}_Material`,
    uniforms,
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // A flat quad only ever shows one face per pixel: one pass, not three's
    // two (renderOptimizations.js -- the second pass also rebuilds the program key).
    forceSinglePass: true,
    toneMapped: false
  });
  const flames = new THREE.InstancedMesh(flameGeometry, flameMaterial, capacity);
  flames.name = name;
  flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Positions come from the anchors every frame; one batch, never culled.
  flames.frustumCulled = false;
  flames.castShadow = false;
  flames.receiveShadow = false;
  flames.renderOrder = 2;
  flames.count = 0;
  // The eye, the mirror and the decanter's capture see them; the minimap does not.
  flames.layers.set(MAIN_ONLY);
  parent.add(flames);

  const haloGeometry = new THREE.PlaneGeometry(1, 1);
  haloGeometry.setAttribute('aFlame', flameAttribute);
  const haloMaterial = new THREE.ShaderMaterial({
    name: `${name}_Halo_Material`,
    uniforms: { uColour: { value: new THREE.Color(1.0, 0.58, 0.24) }, uStrength: { value: 0.32 } },
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const halos = new THREE.InstancedMesh(haloGeometry, haloMaterial, capacity);
  halos.name = `${name}_Halos`;
  halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  halos.frustumCulled = false;
  halos.renderOrder = 3;
  halos.count = 0;
  halos.layers.set(MAIN_ONLY);
  parent.add(halos);

  /** @type {{ light: THREE.PointLight, owner: object|null, fade: number }[]} */
  const pool = [];
  for (let index = 0; index < lightCount; index++) {
    const light = new THREE.PointLight(DEFAULT_LIGHT.color, 0, DEFAULT_LIGHT.distance, DEFAULT_LIGHT.decay);
    light.name = `${name}_Light_${index}`;
    light.castShadow = false;
    light.layers.set(MAIN_ONLY);
    parent.add(light);
    pool.push({ light, owner: null, fade: 0 });
  }

  const entries = [];
  const gusts = [];
  const drafts = [];
  const worldPosition = new THREE.Vector3();
  const lightPoint = new THREE.Vector3();
  const localPosition = new THREE.Vector3();
  const haloCentre = new THREE.Vector3();
  const parentInverse = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const lastPlayer = new THREE.Vector3();
  let hasLastPlayer = false;
  const playerVelocity = new THREE.Vector2();
  let elapsed = 0;
  let extinguished = false;

  function isShown(object) {
    for (let node = object; node; node = node.parent) {
      if (!node.visible) return false;
    }
    return true;
  }

  /**
   * @param {THREE.Object3D} anchor  The wick tip: the flame's base sits here.
   * @param {object} [options]
   * @param {number} [options.width]   Metres, at rest.
   * @param {number} [options.height]  Metres, at rest.
   * @param {boolean|object} [options.light]  May this candle be given a pool light? An
   *   object overrides { color, intensity, distance, decay } for it, and may add
   *   `offset` ([x, y, z] or a Vector3): where the light stands relative to the
   *   wick tip, in the anchor's own space -- so for a wall sconce whose +z faces
   *   the room, [0, 0.02, 0.2] stands it 20 cm out from the candle. Without
   *   one the light sits in the flame, as it always has.
   * @param {number} [options.halo]    Halo radius in metres; 0 for none.
   * @param {number} [options.draft]   How much drafts move this flame, 0..1: the
   *   slow ambient sway and every addDraft() source alike.
   */
  function add(anchor, { width = 0.016, height = 0.046, light = false, halo = 0.075, draft = 1 } = {}) {
    if (entries.length >= capacity) {
      console.warn(`${name}: no room for another flame (capacity ${capacity})`);
      return null;
    }
    const lightSettings = light ? { ...DEFAULT_LIGHT, ...(typeof light === 'object' ? light : {}) } : null;
    if (lightSettings?.offset) {
      // A copy: the caller's array or vector stays theirs.
      const { offset } = lightSettings;
      lightSettings.offset = Array.isArray(offset) ? new THREE.Vector3().fromArray(offset) : offset.clone();
    }
    const entry = {
      anchor, width, height, halo, draft,
      seed: Math.random() * 100,
      leanX: 0, leanZ: 0, swingX: 0, swingZ: 0,
      flicker: 1, strain: 0, gutter: 0, lit: true, shown: false,
      lightSettings,
      // Refreshed every update: world position for the light ranking, and
      // position in the parent's space for placing the light.
      x: 0, y: 0, z: 0, localX: 0, localY: 0, localZ: 0, rank: Infinity
    };
    entries.push(entry);
    return {
      get lit() { return entry.lit; },
      setLit(on) { entry.lit = !!on; }
    };
  }

  /**
   * A push of air outward from a point -- a door swinging, a window blowing.
   * @param {THREE.Vector3} position
   * @param {object} [options]
   * @param {number} [options.strength]  Peak lean at the centre (1 is about 45 degrees).
   * @param {number} [options.radius]    Metres; falls off as a Gaussian.
   * @param {number} [options.life]      Seconds.
   */
  function gust(position, { strength = 0.9, radius = 3, life = 2.2 } = {}) {
    gusts.push({ x: position.x, y: position.y, z: position.z, strength, radius, life, age: 0 });
  }

  /**
   * A draught that never stops: air leaking in round an old window frame, or
   * under a door. Where a gust pushes outward from a point and dies away, a
   * draught blows ONE way (`direction`) for as long as the room exists, and
   * reaches the flames near its source with the same Gaussian falloff.
   *
   * It is not steady, though, because real ones are not: the wind outside
   * rises and falls, so the push is scaled by a slow "breath" -- two
   * incommensurate sines per draught, so it never visibly repeats -- and its
   * heading wanders a few degrees either side. With `unsteadiness` 0.6 a
   * draught swings between 40% and 160% of `strength`. Part of the room, so
   * reset() leaves it alone; change `strength` on the returned object to
   * open or close the leak.
   *
   * @param {THREE.Vector3} position  Where the air comes in: world space, as for gust().
   * @param {object} [options]
   * @param {{ x: number, z: number }} [options.direction]  Which way it blows, in world
   *   space (only x and z count: a flame only leans sideways).
   * @param {number} [options.strength]      Lean at the source (1 is about 45 degrees).
   * @param {number} [options.radius]        Metres.
   * @param {number} [options.unsteadiness]  0 steady .. 1 comes and goes completely.
   */
  function addDraft(position, { direction = { x: 1, z: 0 }, strength = 0.12, radius = 1.6, unsteadiness = 0.6 } = {}) {
    const length = Math.hypot(direction.x, direction.z) || 1;
    const source = {
      x: position.x, y: position.y, z: position.z,
      heading: Math.atan2(direction.z / length, direction.x / length),
      strength, radius, unsteadiness,
      seed: Math.random() * 100,
      // Refreshed once a frame, then shared by every flame it reaches.
      pushX: 0, pushZ: 0
    };
    drafts.push(source);
    return source;
  }

  /** Every flame out (a blackout), or back as they were. Their lights go with them. */
  function setExtinguished(out) {
    extinguished = !!out;
  }

  /** A restart: no gusts in flight, every candle relit, every light released. */
  function reset() {
    gusts.length = 0;
    extinguished = false;
    hasLastPlayer = false;
    playerVelocity.set(0, 0);
    for (const entry of entries) {
      entry.lit = true;
      entry.leanX = entry.leanZ = entry.swingX = entry.swingZ = 0;
      entry.strain = entry.gutter = 0;
    }
    for (const slot of pool) {
      slot.owner = null;
      slot.fade = 0;
      slot.light.intensity = 0;
    }
  }

  function trackPlayer(dt, playerPosition) {
    if (!playerPosition || dt <= 0) return;
    if (hasLastPlayer) {
      const vx = (playerPosition.x - lastPlayer.x) / dt;
      const vz = (playerPosition.z - lastPlayer.z) / dt;
      // A teleport (respawn, level jump) is not a breeze.
      if (vx * vx + vz * vz < 64) {
        const blend = Math.min(1, dt * 10);
        playerVelocity.x += (vx - playerVelocity.x) * blend;
        playerVelocity.y += (vz - playerVelocity.y) * blend;
      } else {
        playerVelocity.set(0, 0);
      }
    }
    lastPlayer.copy(playerPosition);
    hasLastPlayer = true;
  }

  const isOwned = (entry) => pool.some((slot) => slot.owner === entry);

  /**
   * Hands the pool to the nearest candles that may have a light. A light only
   * moves once it has faded out of its old candle, and a newcomer has to be
   * clearly nearer (LIGHT_HYSTERESIS) to take a light from a lit candle.
   */
  function assignLights(step, playerPosition) {
    if (!pool.length) return;
    const candidates = [];
    for (const entry of entries) {
      entry.rank = Infinity;
      if (!entry.lightSettings || !entry.shown) continue;
      if (playerPosition) {
        const dx = entry.x - playerPosition.x;
        const dz = entry.z - playerPosition.z;
        // A candle on another floor counts as further away than it is.
        const dy = (entry.y - playerPosition.y) * 1.8;
        entry.rank = dx * dx + dz * dz + dy * dy;
      } else {
        entry.rank = 0;
      }
      candidates.push(entry);
    }
    candidates.sort((a, b) => a.rank - b.rank);
    const wanted = new Set(candidates.slice(0, pool.length));
    const fadeStep = step / LIGHT_FADE_SECONDS;

    for (const slot of pool) {
      if (slot.owner && !wanted.has(slot.owner)) {
        const challenger = candidates.find((entry) => wanted.has(entry) && !isOwned(entry));
        const holdsOn = slot.owner.shown && challenger
          && slot.owner.rank <= challenger.rank * LIGHT_HYSTERESIS * LIGHT_HYSTERESIS;
        if (holdsOn || !challenger && slot.owner.shown) {
          slot.fade = Math.min(1, slot.fade + fadeStep);
          continue;
        }
        slot.fade = Math.max(0, slot.fade - fadeStep);
        if (slot.fade > 0) continue;
        slot.owner = null;
      }
      if (!slot.owner) {
        const next = candidates.find((entry) => wanted.has(entry) && !isOwned(entry));
        if (!next) continue;
        slot.owner = next;
        slot.fade = 0;
        slot.light.color.set(next.lightSettings.color);
        slot.light.distance = next.lightSettings.distance;
        slot.light.decay = next.lightSettings.decay;
      }
      slot.fade = Math.min(1, slot.fade + fadeStep);
    }
  }

  /**
   * @param {number} dt
   * @param {object} [frame]
   * @param {THREE.Vector3} [frame.playerPosition]  The camera's world position.
   */
  function update(dt, { playerPosition = null } = {}) {
    const step = Math.min(Math.max(dt, 0), 0.05);
    elapsed += step;
    uniforms.uTime.value = elapsed;
    trackPlayer(step, playerPosition);
    for (let index = gusts.length - 1; index >= 0; index--) {
      gusts[index].age += step;
      if (gusts[index].age >= gusts[index].life) gusts.splice(index, 1);
    }
    // Each draught's breath and heading, once a frame for all the flames it reaches.
    for (const source of drafts) {
      const s = source.seed;
      const breath = Math.max(0, 1 + source.unsteadiness
        * (0.6 * Math.sin(elapsed * 0.83 + s) + 0.4 * Math.sin(elapsed * 2.27 + s * 1.9)));
      const heading = source.heading + 0.18 * Math.sin(elapsed * 0.41 + s * 0.7);
      source.pushX = Math.cos(heading) * source.strength * breath;
      source.pushZ = Math.sin(heading) * source.strength * breath;
    }

    parent.updateWorldMatrix(true, false);
    parentInverse.copy(parent.matrixWorld).invert();
    const playerSpeed = playerVelocity.length();
    let drawn = 0;

    for (const entry of entries) {
      entry.shown = !extinguished && entry.lit && isShown(entry.anchor);
      if (!entry.shown) continue;
      entry.anchor.getWorldPosition(worldPosition);
      entry.x = worldPosition.x;
      entry.y = worldPosition.y;
      entry.z = worldPosition.z;
      const s = entry.seed;

      // Where the air wants the flame to lean.
      let targetX = entry.draft * (0.05 * Math.sin(elapsed * 0.63 + s) + 0.03 * Math.sin(elapsed * 1.71 + s * 2.3));
      let targetZ = entry.draft * (0.05 * Math.sin(elapsed * 0.57 + s * 1.7) + 0.03 * Math.sin(elapsed * 1.43 + s * 0.9));
      let turbulence = 0;
      if (playerPosition && playerSpeed > 0.05) {
        const dx = worldPosition.x - playerPosition.x;
        const dz = worldPosition.z - playerPosition.z;
        const dy = worldPosition.y - (playerPosition.y - 0.6);
        const distance = Math.hypot(dx, dz) + 0.35 * Math.abs(dy);
        const reach = Math.exp(-(distance * distance) / (1.05 * 1.05));
        if (reach > 0.002) {
          const flat = Math.max(Math.hypot(dx, dz), 1e-3);
          const push = reach * Math.min(playerSpeed, 5) * 0.16;
          targetX += push * (playerVelocity.x / playerSpeed * 0.65 + dx / flat * 0.45);
          targetZ += push * (playerVelocity.y / playerSpeed * 0.65 + dz / flat * 0.45);
          turbulence += push;
        }
      }
      for (const g of gusts) {
        const dx = worldPosition.x - g.x;
        const dz = worldPosition.z - g.z;
        const dy = worldPosition.y - g.y;
        const distance = Math.hypot(dx, dz, dy * 0.6);
        const reach = Math.exp(-(distance * distance) / (g.radius * g.radius));
        if (reach < 0.002) continue;
        const envelope = (1 - Math.exp(-g.age * 14)) * Math.exp(-g.age * 2.4);
        const flat = Math.max(Math.hypot(dx, dz), 1e-3);
        const push = g.strength * reach * envelope;
        targetX += push * dx / flat;
        targetZ += push * dz / flat;
        turbulence += push;
      }
      for (const source of drafts) {
        const dx = worldPosition.x - source.x;
        const dz = worldPosition.z - source.z;
        const dy = worldPosition.y - source.y;
        const distance = Math.hypot(dx, dz, dy * 0.6);
        const reach = entry.draft * Math.exp(-(distance * distance) / (source.radius * source.radius));
        if (reach < 0.002) continue;
        targetX += source.pushX * reach;
        targetZ += source.pushZ * reach;
        // Moving air is never laminar round a flame: half its push again as flutter.
        turbulence += 0.5 * reach * Math.hypot(source.pushX, source.pushZ);
      }
      // Pushed flames flutter about the lean rather than holding it still.
      targetX += turbulence * 0.35 * Math.sin(elapsed * 13.1 + s * 3.0);
      targetZ += turbulence * 0.35 * Math.sin(elapsed * 11.7 + s * 4.1);

      // Damped spring: quick to follow, a little overshoot on the way back.
      const stiffness = 85;
      const damping = 9;
      entry.swingX += ((targetX - entry.leanX) * stiffness - entry.swingX * damping) * step;
      entry.swingZ += ((targetZ - entry.leanZ) * stiffness - entry.swingZ * damping) * step;
      entry.leanX += entry.swingX * step;
      entry.leanZ += entry.swingZ * step;
      const leanLength = Math.hypot(entry.leanX, entry.leanZ);
      if (leanLength > 1.1) {
        entry.leanX *= 1.1 / leanLength;
        entry.leanZ *= 1.1 / leanLength;
      }
      entry.strain += (Math.min(1, leanLength + turbulence) - entry.strain) * Math.min(1, step * 6);

      // Flicker: layered sines plus the odd gutter, livelier in a draught.
      if (entry.gutter <= 0 && Math.random() < step * (0.05 + 0.9 * entry.strain)) entry.gutter = 0.18 + Math.random() * 0.25;
      entry.gutter = Math.max(0, entry.gutter - step);
      const steady = 0.80
        + 0.08 * Math.sin(elapsed * 7.3 + s)
        + 0.06 * Math.sin(elapsed * 17.9 + s * 2.1)
        + 0.04 * Math.sin(elapsed * 31.7 + s * 3.3);
      const gutterDip = entry.gutter > 0 ? 0.35 * Math.sin(Math.PI * Math.min(1, entry.gutter / 0.2)) : 0;
      entry.flicker = THREE.MathUtils.clamp(steady - gutterDip - 0.25 * entry.strain * (0.5 + 0.5 * Math.sin(elapsed * 23 + s)), 0, 1);

      localPosition.copy(worldPosition).applyMatrix4(parentInverse);
      entry.localX = localPosition.x;
      entry.localY = localPosition.y;
      entry.localZ = localPosition.z;
      matrix.compose(localPosition, identity, scale.set(entry.width, entry.height, 1));
      flames.setMatrixAt(drawn, matrix);
      haloCentre.copy(localPosition);
      haloCentre.y += entry.height * 0.42;
      const haloSize = entry.halo > 0 ? entry.halo : 0.0001;
      matrix.compose(haloCentre, identity, scale.set(haloSize, haloSize, haloSize));
      halos.setMatrixAt(drawn, matrix);
      flameData[drawn * 4] = entry.leanX;
      flameData[drawn * 4 + 1] = entry.leanZ;
      flameData[drawn * 4 + 2] = entry.flicker;
      flameData[drawn * 4 + 3] = s;
      drawn++;
    }

    assignLights(step, playerPosition);
    for (const slot of pool) {
      const entry = slot.owner;
      if (!entry || !entry.shown) {
        slot.light.intensity = 0;
        continue;
      }
      if (entry.lightSettings.offset) {
        // The anchor's world matrix is this frame's: getWorldPosition above refreshed it.
        lightPoint.copy(entry.lightSettings.offset).applyMatrix4(entry.anchor.matrixWorld).applyMatrix4(parentInverse);
      } else {
        lightPoint.set(entry.localX, entry.localY + entry.height * 0.45, entry.localZ);
      }
      // Wherever it stands, the light swings with the flame's lean.
      slot.light.position.set(
        lightPoint.x + entry.leanX * entry.height * 0.5,
        lightPoint.y,
        lightPoint.z + entry.leanZ * entry.height * 0.5
      );
      slot.light.intensity = entry.lightSettings.intensity * slot.fade
        * (0.55 + 0.45 * entry.flicker) * (1 - 0.3 * entry.strain);
    }

    flames.count = drawn;
    halos.count = drawn;
    flames.instanceMatrix.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
    flameAttribute.needsUpdate = true;
  }

  function dispose() {
    flames.removeFromParent();
    halos.removeFromParent();
    for (const slot of pool) slot.light.removeFromParent();
    flameGeometry.dispose();
    haloGeometry.dispose();
    flameMaterial.dispose();
    haloMaterial.dispose();
  }

  return {
    add,
    gust,
    addDraft,
    update,
    reset,
    setExtinguished,
    dispose,
    /** The pool, for the warm-up and for anyone tuning brightness. */
    lights: pool.map((slot) => slot.light),
    /** Every flame's anchor (its wick tip), e.g. for a candle crackle. */
    get anchors() { return entries.map((entry) => entry.anchor); },
    get flameCount() { return entries.length; },
    meshes: [flames, halos]
  };
}
