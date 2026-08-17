import * as THREE from 'three';

// Custom vertex + fragment shader for the bedroom window pane. Built-in
// materials can tint and make glass transparent, but they can't put
// something actually moving *on* the surface -- this procedurally streaks
// rain down the glass (falling droplet heads with fading wet trails behind
// them, two overlapping column densities so it doesn't read as a rigid
// grid) and brightens/tints the whole pane when lightning strikes, driven
// by Storm.js's lightning light intensity each frame rather than a fixed
// look. That reads as weather actually hitting the window, which is the
// first thing the storyline's opening beat calls for.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uTint;
  uniform vec3 uFlashColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // One layer of falling droplets: the plane's UV columns are divided into
  // "cols" rivulets, each with its own random speed/phase/offset. A small
  // bead falls down the column dragging a SHORT wet trail behind it (capped
  // to trailLen in UV space, not the whole window) -- a real droplet's
  // visible trail is a few centimetres, not floor-to-ceiling.
  float rainLayer(vec2 uv, float cols, float speedScale, float seedOffset, float trailLen) {
    float col = floor(uv.x * cols);
    float colSeed = hash21(vec2(col, seedOffset));
    float speed = (0.035 + colSeed * 0.07) * speedScale;
    float wobble = sin(uv.y * 11.0 + colSeed * 30.0) * 0.0035;
    float colCenter = (col + 0.5) / cols + wobble;
    float distX = abs(uv.x - colCenter);

    float headY = fract(colSeed * 3.0 - uTime * speed);
    float distAbove = uv.y - headY;
    float trail = 0.0;
    if (distAbove > 0.0 && distAbove < trailLen) {
      trail = pow(1.0 - distAbove / trailLen, 2.4);
    }

    float streakWidth = 0.0022 + 0.0015 * colSeed;
    float streakMask = smoothstep(streakWidth, 0.0, distX) * trail;

    float headMask = smoothstep(streakWidth * 2.0, 0.0, distX) * smoothstep(0.011, 0.0, abs(distAbove));
    return streakMask * 0.35 + headMask * 0.85;
  }

  // Small droplets stuck to the glass (not falling), scattered by a hashed
  // grid so they land at irregular spots -- real rain-on-glass is mostly
  // static condensation with a few streaks moving through it, not the
  // other way round.
  float condensation(vec2 uv) {
    vec2 g = uv * vec2(34.0, 46.0);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = hash21(id + 91.0);
    if (r < 0.82) return 0.0;
    vec2 jitter = (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.5;
    float radius = 0.1 + (r - 0.82) * 1.1;
    float d = length(f - jitter);
    return smoothstep(radius, radius * 0.3, d) * 0.5;
  }

  void main() {
    float rain = rainLayer(vUv, 20.0, 1.0, 3.0, 0.085) + rainLayer(vUv, 33.0, 0.75, 11.0, 0.06) * 0.7;
    rain += condensation(vUv);
    rain = clamp(rain, 0.0, 1.2);

    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.5);

    vec3 color = uTint + rain * 0.22 + fresnel * 0.05;
    color += uFlashColor * uFlash * (0.5 + rain * 0.3);

    float alpha = 0.5 + rain * 0.12 + uFlash * 0.3;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createRainGlassMaterial({
  tint = new THREE.Color(0x0c1420),
  flashColor = new THREE.Color(0xbcd4ff)
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
      uFlashColor: { value: flashColor }
    }
  });
}
