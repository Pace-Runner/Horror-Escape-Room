import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAIN_ONLY } from '../core/RenderLayers.js';

/**
 * A low, dying fire in the study grate: made here in code, not downloaded.
 *
 * WHY NOT A "FIRE MODEL". Real-time fire is a visual effect whichever way it
 * is made -- a downloaded fire mesh would still need animating in a shader,
 * plus a licence row in the credits. So every part is built here:
 *
 *   1. ASH AND GRATE. A pale ash bed hides the firebox floor; an iron basket
 *      (one merged mesh) holds the logs off it.
 *   2. LOGS that are still burning inside. Three charred cylinders whose
 *      emissive map is a canvas of orange cracks; the crack glow pulses with
 *      the flicker (a uniform change, never a recompile), so the embers
 *      breathe the way real coals do.
 *   3. FLAMES. Four crossed quads with ONE ShaderMaterial. The fragment shader
 *      builds each tongue from fractal noise (fbm) scrolling upwards, cut by a
 *      flame-shaped mask that narrows with height, and maps the result through
 *      a colour ramp: white-yellow at the roots, orange, then dull red where
 *      the tongues break up. Blending is ADDITIVE, so overlapping tongues add
 *      up to a brighter core and draw order never matters.
 *   4. SPARKS. Points whose motion is computed entirely in the vertex shader
 *      from time and a per-spark seed: each rises, drifts, cools and dies
 *      before the throat of the chimney. No CPU work per spark.
 *   5. GLOW. An additive card on the iron back plate and one on the hearth,
 *      their brightness tied to the flicker -- light the fire throws on the
 *      surfaces nearest it.
 *   6. ONE POINT LIGHT, unshadowed, created now at build time (light count is
 *      baked into every lit shader; see CandleFlames.js), flickering in step
 *      with all of the above, so the room around the hearth breathes with it.
 *
 * All coordinates are fireplace-local metres (the GLB faces +Z); the firebox
 * interior is x +-0.478, y 0.140..0.982, z -0.160..0.131, and nothing here
 * leaves it except the light.
 */

const FLAME_VERTEX = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vSeed;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Fractal noise: four octaves, each twice the frequency and half the weight.
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * noise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec2 uv = vUv;
    // Turbulence: the noise field rises through the flame and sways sideways.
    float t = uTime * 1.5 + vSeed * 7.0;
    float n = fbm(vec2(uv.x * 3.0 + vSeed * 3.1, uv.y * 3.2 - t));
    float sway = (fbm(vec2(uv.y * 2.0 - t * 0.5, vSeed)) - 0.5) * 0.35 * uv.y;
    // The mask: wide at the roots, licking to nothing at the top.
    float x = abs(uv.x - 0.5 + sway) * 2.0;
    float width = (1.0 - uv.y) * 0.95 + 0.05;
    float body = 1.0 - smoothstep(width * 0.55, width, x);
    float flame = body * smoothstep(0.0, 0.08, uv.y) * (n * 1.6 - uv.y * 0.9);
    flame = clamp(flame, 0.0, 1.0);
    if (flame < 0.01) discard;

    vec3 red = vec3(0.55, 0.08, 0.01);
    vec3 orange = vec3(1.0, 0.42, 0.06);
    vec3 yellow = vec3(1.0, 0.85, 0.5);
    vec3 colour = mix(red, orange, smoothstep(0.1, 0.45, flame));
    colour = mix(colour, yellow, smoothstep(0.55, 0.95, flame));
    gl_FragColor = vec4(colour * flame * uIntensity * 1.4, 1.0);
  }
`;

const SPARK_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aSpeed;
  uniform float uTime;
  uniform float uPixelScale;
  varying float vLife;
  void main() {
    float life = fract(uTime * aSpeed + aSeed);
    vec3 p = position;
    p.y += life * 0.62;
    p.x += sin(uTime * 2.3 + aSeed * 40.0) * 0.03 * life;
    p.z += cos(uTime * 1.7 + aSeed * 23.0) * 0.02 * life;
    vLife = life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPixelScale * (1.0 - life) / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  varying float vLife;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float fade = (1.0 - vLife) * (1.0 - r);
    vec3 colour = mix(vec3(1.0, 0.75, 0.3), vec3(0.8, 0.15, 0.02), vLife);
    gl_FragColor = vec4(colour * fade * uIntensity, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uColour;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - vec2(0.5, 0.35)) * vec2(1.6, 2.2);
    float glow = pow(max(0.0, 1.0 - length(d)), 2.0);
    gl_FragColor = vec4(uColour * glow * uIntensity, 1.0);
  }
`;

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The ember cracks painted onto the logs' emissive map. Canvas only, so Node's stub can build it. */
function paintEmberCracks() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = '#ff6a1a';
  context.lineCap = 'round';
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    let x = random() * 128;
    let y = random() * 128;
    context.lineWidth = 0.8 + random() * 2.2;
    context.beginPath();
    context.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (random() - 0.5) * 22;
      y += (random() - 0.2) * 18;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createHearthFire() {
  const group = new THREE.Group();
  group.name = 'Hearth_Fire';
  const uniforms = { uTime: { value: 0 }, uIntensity: { value: 1 } };

  // Ash bed, just above the firebox floor (0.140).
  const ash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.26).rotateX(-Math.PI / 2).translate(0, 0.143, -0.015),
    new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 })
  );
  ash.name = 'Hearth_Ash';
  group.add(ash);

  // The fire basket: front bars, a base grid and four feet, one mesh.
  const ironMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1816, roughness: 0.6, metalness: 0.6 });
  const bars = [
    new THREE.BoxGeometry(0.62, 0.012, 0.012).translate(0, 0.185, 0.085),
    new THREE.BoxGeometry(0.62, 0.012, 0.012).translate(0, 0.265, 0.085),
    new THREE.BoxGeometry(0.62, 0.01, 0.2).translate(0, 0.165, -0.01)
  ];
  for (let i = 0; i < 5; i++) bars.push(new THREE.BoxGeometry(0.012, 0.13, 0.012).translate(-0.24 + i * 0.12, 0.225, 0.085));
  for (const x of [-0.29, 0.29]) for (const z of [-0.09, 0.075]) {
    bars.push(new THREE.BoxGeometry(0.025, 0.025, 0.025).translate(x, 0.152, z));
  }
  const grate = new THREE.Mesh(mergeGeometries(bars), ironMaterial);
  grate.name = 'Hearth_Grate';
  group.add(grate);

  // Logs: two along the grate, one crossed on top. Charred, cracked, glowing.
  const logMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d140e, roughness: 0.95, emissive: 0xff4a12, emissiveMap: paintEmberCracks(), emissiveIntensity: 1
  });
  const logs = new THREE.Mesh(mergeGeometries([
    new THREE.CylinderGeometry(0.045, 0.05, 0.5, 10).rotateZ(Math.PI / 2).translate(0, 0.215, -0.06),
    new THREE.CylinderGeometry(0.042, 0.047, 0.48, 10).rotateZ(Math.PI / 2).translate(0.02, 0.215, 0.025),
    new THREE.CylinderGeometry(0.038, 0.042, 0.44, 10).rotateZ(Math.PI / 2).rotateY(0.35).translate(-0.02, 0.29, -0.02)
  ]), logMaterial);
  logs.name = 'Hearth_Logs';
  group.add(logs);

  // Flames: four crossed sheets, roots on the logs, tips well below the lintel (0.982).
  const sheets = [];
  [[-0.12, -0.04, -0.5, 0.36, 0.42], [0, -0.03, 0, 0.42, 0.5], [0.11, -0.04, 0.5, 0.36, 0.44], [0.02, 0.0, 1.57, 0.26, 0.38]]
    .forEach(([x, z, yaw, w, h], index) => {
      const sheet = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0).rotateY(yaw).translate(x, 0.235, z);
      sheet.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(sheet.attributes.position.count).fill(index * 1.7 + 0.3), 1));
      sheets.push(sheet);
    });
  const flames = new THREE.Mesh(mergeGeometries(sheets), new THREE.ShaderMaterial({
    name: 'Hearth_Flame_Material',
    uniforms,
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false
  }));
  flames.name = 'Hearth_Flames';
  flames.frustumCulled = false;
  flames.layers.set(MAIN_ONLY);
  group.add(flames);

  // Sparks: 40 points, animated wholly in the vertex shader.
  const sparkCount = 40;
  const sparkPositions = [];
  const seeds = [];
  const speeds = [];
  for (let i = 0; i < sparkCount; i++) {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const r = a - Math.floor(a);
    sparkPositions.push((r - 0.5) * 0.4, 0.27, -0.05 + ((i * 0.37) % 1) * 0.1);
    seeds.push(r);
    speeds.push(0.25 + ((i * 0.61) % 1) * 0.35);
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  sparkGeometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
  const sparks = new THREE.Points(sparkGeometry, new THREE.ShaderMaterial({
    name: 'Hearth_Spark_Material',
    uniforms: { uTime: uniforms.uTime, uIntensity: uniforms.uIntensity, uPixelScale: { value: 9 } },
    vertexShader: SPARK_VERTEX,
    fragmentShader: SPARK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  }));
  sparks.name = 'Hearth_Sparks';
  sparks.frustumCulled = false;
  sparks.layers.set(MAIN_ONLY);
  group.add(sparks);

  // Glow on the iron back plate (-0.160) and a warm spill on the hearth.
  function glowCard(geometry, colour, strength, name) {
    const material = new THREE.ShaderMaterial({
      name: `${name}_Material`,
      uniforms: { uIntensity: { value: strength }, uColour: { value: new THREE.Color(colour) } },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      forceSinglePass: true,
      toneMapped: false
    });
    const card = new THREE.Mesh(geometry, material);
    card.name = name;
    card.frustumCulled = false;
    card.layers.set(MAIN_ONLY);
    group.add(card);
    return { material, strength };
  }
  const backGlow = glowCard(new THREE.PlaneGeometry(0.9, 0.7).translate(0, 0.45, -0.155), 0xff6a20, 0.55, 'Hearth_Back_Glow');
  const hearthGlow = glowCard(
    new THREE.PlaneGeometry(1.2, 0.7).rotateX(-Math.PI / 2).translate(0, 0.096, 0.42), 0xff7a30, 0.22, 'Hearth_Spill_Glow');

  // The fire's light: in front of the slips, so it reaches the hearth, the
  // mantel front and the room. Made now; only its intensity ever changes.
  const BASE_INTENSITY = 6.5;
  const light = new THREE.PointLight(0xffc38a, BASE_INTENSITY, 5.5, 2);
  light.name = 'Hearth_Fire_Light';
  light.position.set(0, 0.42, 0.28);
  light.castShadow = false;
  light.layers.set(MAIN_ONLY);
  group.add(light);

  let time = 0;
  return {
    group,
    light,
    update(dt) {
      time += Math.min(Math.max(dt, 0), 0.05);
      const flicker = 0.84 + 0.09 * Math.sin(time * 7.7) + 0.05 * Math.sin(time * 13.3 + 1.7)
        + 0.04 * Math.sin(time * 29.1 + 0.4);
      uniforms.uTime.value = time;
      uniforms.uIntensity.value = flicker;
      light.intensity = BASE_INTENSITY * (1+.04*Math.sin(time*.85)+.025*Math.sin(time*1.43+.7));

      logMaterial.emissiveIntensity = 0.75 + 0.45 * flicker;
      backGlow.material.uniforms.uIntensity.value = backGlow.strength * flicker;
      hearthGlow.material.uniforms.uIntensity.value = hearthGlow.strength * flicker;
    }
  };
}
