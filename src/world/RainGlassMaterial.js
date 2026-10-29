import * as THREE from 'three';

// Custom vertex + fragment shader for a window pane in the storm (the
// bedroom's and the upstairs hall's). Built-in materials can tint and make
// glass transparent, but they can't put something actually moving *on* the
// surface. This puts weather on the glass and the sky behind it:
//
// - The sky beyond: a storm sky looked up from the view direction, not the
//   pane's UVs, so it sits at infinity and the window frames a different part
//   of it as you move. A strike lights the cloud from inside it, with its
//   shape, rather than turning the pane into a flat lit rectangle.
// - Running drops: a bead clings, then slides, then clings again, as a real
//   drop does, dragging a short wet trail, in columns of different speeds so
//   it never reads as a grid.
// - Still drops: beaded water scattered over the pane, each a little lens, a
//   dark rim and a bright point, which catches every strike.
//
// Driven each frame by the room's lightning light (uFlash, 0..1), so the
// pane flashes with the light that comes in through it. The water is sized in
// metres (uSize is the pane's), so a tall pane gets round drops too. A window
// with a real sky behind it (the study's) turns the painted one off (sky) and
// is nearly clear (opacity); a sky with no glass (water off, opacity 1) is the
// backdrop behind a barred window, so the bars stand against it.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vSky;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    // The direction looked along, in the pane's own axes: right, up, and out
    // (the pane faces into the room, so out of the house is its -z).
    vec3 look = normalize(world.xyz - cameraPosition);
    vec3 right = normalize(modelMatrix[0].xyz);
    vec3 up = normalize(modelMatrix[1].xyz);
    vec3 outward = -normalize(modelMatrix[2].xyz);
    vSky = vec2(dot(look, right), dot(look, up)) / max(dot(look, outward), 0.08);
    vec4 mvPosition = viewMatrix * world;
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uTint;
  uniform vec3 uFlashColor;
  uniform vec2 uSize;
  uniform float uOpacity;
  uniform float uSky;
  uniform float uWater;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vSky;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }

  // One layer of running drops, in metres on the pane. Each column may carry
  // a bead: it clings, then slides a little way (a fifth of a metre), then
  // clings, dragging a short wet trail (centimetres, not the whole window).
  float rivulets(vec2 m, float perMetre, float speedScale, float seed, float trailLen) {
    float col = floor(m.x * perMetre);
    float s = hash21(vec2(col, seed));
    if (s < 0.3) return 0.0;
    float tt = uTime * (0.35 + s * 0.45) * speedScale + s * 13.0;
    float run = floor(tt) + smoothstep(0.55, 1.0, fract(tt));
    float headY = fract(s * 3.7 - run * 0.21 / uSize.y) * uSize.y;
    float wobble = sin(m.y * 7.0 + s * 40.0) * 0.0044 + sin(m.y * 21.0 + s * 11.0) * 0.0013;
    float centre = (col + 0.3 + 0.4 * hash21(vec2(col, seed + 1.0))) / perMetre + wobble;
    float dx = abs(m.x - centre);
    float above = m.y - headY;
    float trail = (above > 0.0 && above < trailLen) ? pow(1.0 - above / trailLen, 2.0) : 0.0;
    float width = 0.0018 + 0.0015 * s;
    float streak = smoothstep(width, 0.0, dx) * trail;
    float bead = smoothstep(width * 2.6, width * 0.6, length(vec2(dx, above * 0.85)));
    return streak * 0.3 + bead;
  }

  // Beaded drops sitting on the glass, in metres: x is the drop (0..1), y its bright point.
  vec2 beads(vec2 m, float perMetre, float seed, float fill) {
    vec2 g = m * perMetre;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = hash21(id + seed);
    if (r < fill) return vec2(0.0);
    vec2 jitter = (vec2(hash21(id + seed + 3.1), hash21(id + seed + 7.7)) - 0.5) * 0.5;
    float radius = 0.12 + (r - fill) / (1.0 - fill) * 0.26;
    vec2 q = (f - jitter) / radius;
    float d = length(q);
    float drop = smoothstep(1.0, 0.7, d);
    float point = smoothstep(0.38, 0.0, length(q - vec2(-0.32, 0.36)));
    return vec2(drop, point * drop);
  }

  void main() {
    float flash = clamp(uFlash, 0.0, 1.0);

    // The sky beyond: cloud, barely there in the dark, lit by a strike.
    vec2 skyUv = vSky * 0.75 + vec2(uTime * 0.01, 0.0);
    float cloud = fbm(skyUv * 1.3);
    float shape = smoothstep(0.3, 0.85, cloud);
    float height = smoothstep(-0.8, 0.9, vSky.y);
    vec3 sky = uTint * (0.8 + 0.35 * shape) * uSky;
    vec3 strike = uFlashColor * flash * (0.25 + 1.05 * shape) * (0.55 + 0.45 * height) * uSky;

    // The water on the glass: a few millimetres a drop, a few big ones.
    vec2 m = vUv * uSize;
    float running = (rivulets(m, 16.4, 1.0, 3.0, 0.104) + rivulets(m, 28.2, 0.7, 11.0, 0.065) * 0.7) * uWater;
    vec2 small = beads(m, 87.0, 91.0, 0.8) * uWater;
    vec2 large = beads(m, 31.0, 37.0, 0.93) * uWater;
    float drops = clamp(small.x + large.x, 0.0, 1.0);
    float glint = small.y * 0.7 + large.y + running * 0.35;

    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.5);

    vec3 color = sky + running * 0.1 + fresnel * 0.05;
    // A drop is a lens: darker than the glass around it, with one bright
    // point, brightest when the sky behind it flashes. Drawn as grey discs
    // they read as snow.
    color *= 1.0 - drops * 0.35;
    color += uFlashColor * glint * (0.035 + flash * 0.9);
    color += strike * (0.75 + running * 0.4 + drops * 0.5);

    // The glass itself (uOpacity), more where it is wet, and lit by a strike.
    float alpha = uOpacity + running * 0.08 + drops * 0.04 + flash * 0.28 * uSky;
    gl_FragColor = vec4(max(color, 0.0), clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * @param {object} [options]
 * @param {THREE.Color} [options.tint] - the night through the glass.
 * @param {THREE.Color} [options.flashColor] - a strike's light.
 * @param {number[]} [options.size] - the pane, metres [wide, tall], so the water on it is to scale.
 * @param {number} [options.opacity] - the glass, dry and unlit.
 * @param {boolean} [options.sky] - paint a storm sky behind the glass; off where a real one is out there.
 * @param {boolean} [options.water] - the rain on the glass; off for a sky with no glass in front of it.
 */
export function createRainGlassMaterial({
  tint = new THREE.Color(0x0c1420),
  flashColor = new THREE.Color(0xbcd4ff),
  size = [1.1, 1.3],
  opacity = 0.5,
  sky = true,
  water = true
} = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uTint: { value: tint },
      uFlashColor: { value: flashColor },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uOpacity: { value: opacity },
      uSky: { value: sky ? 1 : 0 },
      uWater: { value: water ? 1 : 0 }
    }
  });
}
