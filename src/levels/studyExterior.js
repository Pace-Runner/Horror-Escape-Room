import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAIN_ONLY } from '../core/RenderLayers.js';
import { STUDY_WINDOWS } from './studyWindows.js';
import { Rain } from '../world/Rain.js';

/**
 * THE OUTSIDE OF THE STUDY: the porch the front door opens onto, the gate
 * across it, the house front behind it, and the yard, trees and night sky
 * beyond.
 *
 * Seen from the doorway and the porch, which is where the release ending
 * starts. Everything is built here in code, textures included, the same way
 * the other levels' canvas textures are (world/textures.js).
 *
 * The lights are the ones this level always had -- a cold hemisphere and moon,
 * the porch lamp and a night fill -- and none is added: every light is part of
 * every shader in the room, the study's included.
 */

const PORCH_D = 2.6;
const PORCH_W = 3.0;
/** The yard is three steps below the porch deck, as a real porch is. */
const YARD_Y = -0.55;
const OUT = 0.22;

/** Deterministic, so the yard is the same every time the game is played. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- canvas textures ----------

function drawCanvas(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  return canvas;
}

function colorTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function dataTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

/** A normal map from a greyscale height canvas (brighter is higher). */
function normalFromHeight(heightCanvas, strength = 2) {
  const { width, height } = heightCanvas;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, width, height).data;
  return drawCanvas(width, height, (ctx) => {
    const out = ctx.createImageData(width, height);
    const h = (x, y) => src[(((y + height) % height) * width + ((x + width) % width)) * 4] / 255;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
        const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * width + x) * 4;
        out.data[i] = (-dx / len * 0.5 + 0.5) * 255;
        out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
        out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  });
}

/** Specks and blotches of `colors` scattered over the whole canvas. */
function speckle(ctx, width, height, rand, count, colors, maxSize, alpha = 0.5) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.3 + rand() * 0.7);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const size = 0.5 + rand() * maxSize;
    ctx.beginPath();
    ctx.ellipse(rand() * width, rand() * height, size, size * (0.4 + rand() * 0.8), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Weathered white clapboard, as the house in the news photographs: twelve
 * laps to a two-metre tile, each shaded darker under the board above it, the
 * paint worn through to grey wood and streaked by rain from the top down.
 */
function createSidingTextures() {
  const SIZE = 512;
  const BOARDS = 12;
  const lap = SIZE / BOARDS;
  const rand = seeded(11);
  const color = drawCanvas(SIZE, SIZE, (ctx) => {
    for (let b = 0; b < BOARDS; b++) {
      const y = b * lap;
      const grad = ctx.createLinearGradient(0, y, 0, y + lap);
      grad.addColorStop(0, '#8a877e');
      grad.addColorStop(0.82, '#7a776e');
      grad.addColorStop(1, '#3f3d38');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, SIZE, lap);
      // paint worn through to the grey board in long horizontal patches
      for (let k = 0; k < 6; k++) {
        ctx.globalAlpha = 0.25 + rand() * 0.35;
        ctx.fillStyle = rand() < 0.5 ? '#625e55' : '#6d695f';
        ctx.fillRect(rand() * SIZE, y + rand() * lap * 0.7, 20 + rand() * 90, 1 + rand() * 4);
      }
      ctx.globalAlpha = 1;
    }
    // rain streaks running down from the laps
    // Blurred, or the streaks read as painted-on rectangles.
    ctx.filter = 'blur(4px)';
    for (let i = 0; i < 50; i++) {
      const x = rand() * SIZE;
      const len = 60 + rand() * 200;
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(45,44,38,0.16)');
      grad.addColorStop(1, 'rgba(45,44,38,0)');
      ctx.fillStyle = grad;
      ctx.save();
      ctx.translate(x, rand() * SIZE);
      ctx.fillRect(0, 0, 6 + rand() * 16, len);
      ctx.restore();
    }
    ctx.filter = 'none';
    speckle(ctx, SIZE, SIZE, rand, 500, ['#4b4a40', '#55553f', '#3a3d33'], 1.4, 0.25);
  });
  const height = drawCanvas(SIZE, SIZE, (ctx) => {
    for (let b = 0; b < BOARDS; b++) {
      const grad = ctx.createLinearGradient(0, b * lap, 0, (b + 1) * lap);
      grad.addColorStop(0, '#3a3a3a');
      grad.addColorStop(0.9, '#d0d0d0');
      grad.addColorStop(1, '#202020');
      ctx.fillStyle = grad;
      ctx.fillRect(0, b * lap, SIZE, lap);
    }
  });
  return {
    map: colorTexture(color),
    normalMap: dataTexture(normalFromHeight(height, 3))
  };
}

/** Painted porch boards, grey paint worn to the wood, dark gaps between. */
function createPorchBoardTextures() {
  const SIZE = 512;
  const BOARDS = 11; // about 9 cm boards on a one-metre tile
  const width = SIZE / BOARDS;
  const rand = seeded(23);
  const color = drawCanvas(SIZE, SIZE, (ctx) => {
    for (let b = 0; b < BOARDS; b++) {
      const x = b * width;
      const shade = 0.85 + rand() * 0.25;
      ctx.fillStyle = `rgb(${Math.round(78 * shade)},${Math.round(77 * shade)},${Math.round(72 * shade)})`;
      ctx.fillRect(x, 0, width, SIZE);
      // worn to brown wood along the middle of the board, where feet go
      for (let k = 0; k < 10; k++) {
        ctx.globalAlpha = 0.2 + rand() * 0.4;
        ctx.fillStyle = rand() < 0.6 ? '#46372a' : '#554535';
        ctx.fillRect(x + width * (0.15 + rand() * 0.5), rand() * SIZE, 2 + rand() * width * 0.4, 20 + rand() * 120);
      }
      ctx.globalAlpha = 1;
      // a butt joint now and then
      if (rand() < 0.7) {
        ctx.fillStyle = '#1d1a16';
        ctx.fillRect(x, rand() * SIZE, width, 2);
      }
      // nail heads
      ctx.fillStyle = '#2a2622';
      for (let n = 0; n < 3; n++) ctx.fillRect(x + width * 0.25, (n / 3) * SIZE + 30, 2, 2), ctx.fillRect(x + width * 0.72, (n / 3) * SIZE + 30, 2, 2);
      ctx.fillStyle = '#0d0c0a';
      ctx.fillRect(x, 0, 2, SIZE);
    }
    speckle(ctx, SIZE, SIZE, rand, 700, ['#3d3a33', '#7a776e', '#2c2a25'], 2, 0.4);
  });
  const height = drawCanvas(SIZE, SIZE, (ctx) => {
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#101010';
    for (let b = 0; b < BOARDS; b++) ctx.fillRect(b * width, 0, 3, SIZE);
  });
  // Wet near the open edge, where the rain blows in under the roof.
  const roughness = drawCanvas(64, 64, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#d8d8d8');
    grad.addColorStop(1, '#8a8a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  });
  return {
    map: colorTexture(color, 3, PORCH_D),
    normalMap: dataTexture(normalFromHeight(height, 2.5), 3, PORCH_D),
    roughnessMap: dataTexture(roughness)
  };
}

/** Pale blue-grey beadboard, the traditional porch ceiling, with water stains. */
function createBeadboardTexture() {
  const SIZE = 256;
  const rand = seeded(5);
  const canvas = drawCanvas(SIZE, SIZE, (ctx, w) => {
    ctx.fillStyle = '#6a7577';
    ctx.fillRect(0, 0, w, SIZE);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = '#5f6a6c';
      ctx.fillRect(x, 0, 2, SIZE);
      ctx.fillStyle = '#7c8689';
      ctx.fillRect(x + 2, 0, 1, SIZE);
    }
    for (let i = 0; i < 5; i++) {
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30 + rand() * 50);
      g.addColorStop(0, 'rgba(90,72,48,0.45)');
      g.addColorStop(0.8, 'rgba(90,72,48,0.15)');
      g.addColorStop(1, 'rgba(90,72,48,0)');
      ctx.save();
      ctx.translate(rand() * w, rand() * SIZE);
      ctx.fillStyle = g;
      ctx.fillRect(-90, -90, 180, 180);
      ctx.restore();
    }
  });
  return colorTexture(canvas, 1.5, 1.3);
}

/** Wet, trodden yard: mud showing through flattened dead grass. */
function createGroundTextures() {
  const SIZE = 512;
  const rand = seeded(41);
  const color = drawCanvas(SIZE, SIZE, (ctx) => {
    ctx.fillStyle = '#1d1c14';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speckle(ctx, SIZE, SIZE, rand, 260, ['#2a2a1a', '#1c1f15', '#2e2a1c'], 30, 0.5);
    // grass blades lying flat in every direction
    ctx.lineWidth = 1;
    for (let i = 0; i < 9000; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const a = rand() * Math.PI * 2;
      const len = 3 + rand() * 9;
      const g = 38 + rand() * 34;
      ctx.strokeStyle = `rgba(${Math.round(g * 0.9)},${Math.round(g)},${Math.round(g * 0.5)},${0.25 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    speckle(ctx, SIZE, SIZE, rand, 120, ['#1d1912', '#231e15'], 26, 0.55);
  });
  // Low roughness where water stands: those patches catch the porch light.
  const roughness = drawCanvas(SIZE, SIZE, (ctx) => {
    ctx.fillStyle = '#d6d6d6';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speckle(ctx, SIZE, SIZE, rand, 26, ['#3a3a3a', '#555555'], 40, 0.9);
  });
  return {
    map: colorTexture(color, 40, 40),
    roughnessMap: dataTexture(roughness, 40, 40)
  };
}

/** One tuft of grass, cut out by its alpha. */
function createGrassTexture() {
  const rand = seeded(77);
  const canvas = drawCanvas(128, 128, (ctx) => {
    for (let i = 0; i < 46; i++) {
      const x = 20 + rand() * 88;
      const top = 6 + rand() * 60;
      const lean = (rand() - 0.5) * 34;
      const g = 70 + rand() * 60;
      ctx.strokeStyle = `rgb(${Math.round(g * 0.95)},${Math.round(g)},${Math.round(g * 0.5)})`;
      ctx.lineWidth = 1.5 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.quadraticCurveTo(x + lean * 0.3, (128 + top) / 2, x + lean, top);
      ctx.stroke();
    }
  });
  const texture = colorTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Diagonal lattice for the skirting under the porch, see-through between slats. */
function createLatticeTexture() {
  const canvas = drawCanvas(128, 128, (ctx) => {
    ctx.strokeStyle = '#a9a69c';
    ctx.lineWidth = 11;
    for (let i = -128; i <= 256; i += 42) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke();
    }
  });
  return colorTexture(canvas, 6, 1.1);
}

/** Rough fieldstone for the foundation. */
function createStoneTexture() {
  const rand = seeded(91);
  const canvas = drawCanvas(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1c1b18';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      let x = -rand() * 30;
      while (x < w) {
        const sw = 26 + rand() * 40;
        const v = 70 + rand() * 45;
        ctx.fillStyle = `rgb(${Math.round(v)},${Math.round(v * 0.96)},${Math.round(v * 0.88)})`;
        ctx.beginPath();
        ctx.ellipse(x + sw / 2, row * 32 + 16, sw / 2 - 2, 13, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        x += sw;
      }
    }
    speckle(ctx, w, h, rand, 400, ['#2d2c27', '#4d5040'], 3, 0.4);
  });
  return colorTexture(canvas, 8, 1);
}

/** Generic chipped paint for posts, rails, trim and pickets. */
function createPaintTexture(base) {
  const rand = seeded(base.length * 13);
  const canvas = drawCanvas(128, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, rand, 40, ['#5a5145', '#6b6052'], 2.2, 0.35);
    speckle(ctx, 128, 128, rand, 160, ['#2e2b25'], 0.8, 0.25);
  });
  return colorTexture(canvas, 2, 2);
}

// ---------- geometry ----------

/** A turned post: square base, turned shaft, square capital. */
function createTurnedPostGeometry(height) {
  const base = new THREE.BoxGeometry(0.17, 0.62, 0.17);
  base.translate(0, 0.31, 0);
  const shaftProfile = [
    [0.075, 0.62], [0.086, 0.66], [0.06, 0.72], [0.066, 0.8], [0.052, 0.9],
    [0.05, height - 0.7], [0.058, height - 0.62], [0.072, height - 0.56], [0.06, height - 0.52],
    [0.075, height - 0.46]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shaft = new THREE.LatheGeometry(shaftProfile, 14);
  const capital = new THREE.BoxGeometry(0.17, 0.46, 0.17);
  capital.translate(0, height - 0.23, 0);
  const cap = new THREE.BoxGeometry(0.21, 0.04, 0.21);
  cap.translate(0, height - 0.02, 0);
  return mergeGeometries([base, shaft, capital, cap].map((g) => g.toNonIndexed()));
}

/** A small turned baluster, origin at its foot. */
function createBalusterGeometry(height) {
  const p = [
    [0.022, 0], [0.022, 0.06], [0.03, 0.08], [0.017, 0.16], [0.028, 0.32],
    [0.016, height - 0.16], [0.026, height - 0.08], [0.022, height - 0.06], [0.022, height]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(p, 8);
}

/** A scroll bracket filling the corner between a post and the beam above it. */
function createBracketGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, 0.42);
  s.lineTo(0.42, 0.42);
  s.lineTo(0.42, 0.37);
  s.quadraticCurveTo(0.14, 0.34, 0.06, 0.06);
  s.lineTo(0.05, 0);
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0.2, 0.25, 0.055, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -0.0175);
  return g;
}

/**
 * A pine: a trunk and stacked tiers of drooping, ragged branches. Ragged so
 * its silhouette reads as needles against the sky, not as a cone.
 */
function createPineGeometry(rand, height) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.09, 0.2, height * 0.35, 7);
  trunk.translate(0, height * 0.175, 0);
  paint(trunk, 0x0f0c0a);
  parts.push(trunk);
  const tiers = 7 + Math.floor(rand() * 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const radius = (1 - t) * height * 0.24 + 0.25;
    const tierH = height * 0.26 * (1 - t * 0.45);
    const y = height * 0.16 + t * height * 0.8;
    const cone = new THREE.ConeGeometry(radius, tierH, 11, 1, true);
    const pos = cone.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const vy = pos.getY(v);
      if (vy < -tierH / 2 + 0.001) {
        // the ragged bottom edge: branch tips at different lengths, drooping
        const k = 0.72 + rand() * 0.5;
        pos.setX(v, pos.getX(v) * k);
        pos.setZ(v, pos.getZ(v) * k);
        pos.setY(v, vy - rand() * 0.3);
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y + tierH / 2, 0);
    paint(cone, new THREE.Color(0x070c09).lerp(new THREE.Color(0x0e150f), rand()));
    parts.push(cone);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/** A bare tree: a trunk forking into thinner and thinner branches. */
function createBareTreeGeometry(rand, height) {
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  function branch(start, dir, length, radius, depth) {
    // Open-ended: a branch's caps are always buried in its parent.
    const g = new THREE.CylinderGeometry(radius * 0.62, radius, length, 5, 1, true);
    g.translate(0, length / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(start.x, start.y, start.z);
    paint(g, 0x100e0c);
    parts.push(g);
    if (depth === 0) return;
    const end = start.clone().addScaledVector(dir, length);
    const forks = depth > 2 ? 2 + Math.floor(rand() * 2) : 2;
    for (let i = 0; i < forks; i++) {
      const spread = 0.35 + rand() * 0.5;
      const turn = rand() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn));
      const next = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread)).normalize();
      next.y = Math.max(next.y, 0.15);
      branch(end, next.normalize(), length * (0.62 + rand() * 0.18), radius * 0.62, depth - 1);
    }
  }
  branch(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3((rand() - 0.5) * 0.1, 1, (rand() - 0.5) * 0.1).normalize(), height * 0.36, 0.2 + height * 0.012, 5);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/**
 * Collects fixed pieces by material, each baked where it stands, and merges
 * every material's pieces into one mesh: one draw call per material rather
 * than one per board.
 */
function createBatcher() {
  const sets = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  return {
    add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
      const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      piece.applyMatrix4(matrix.compose(
        new THREE.Vector3(...position), quaternion.setFromEuler(euler.set(...rotation)), new THREE.Vector3(...scale)
      ));
      if (!sets.has(material)) sets.set(material, []);
      sets.get(material).push(piece);
    },
    build({ castShadow = false, receiveShadow = true } = {}) {
      return [...sets].map(([material, pieces]) => {
        const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        return mesh;
      });
    }
  };
}

/** Bakes one colour into a geometry's vertex colours, for merged meshes. */
function paint(geometry, color) {
  const c = new THREE.Color(color);
  const n = geometry.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

/** Three crossed quads with their feet at the origin: one grass tuft. */
function createTuftGeometry() {
  const quads = [];
  for (let i = 0; i < 3; i++) {
    const q = new THREE.PlaneGeometry(0.45, 0.4);
    q.translate(0, 0.2, 0);
    q.rotateY((i / 3) * Math.PI);
    quads.push(q);
  }
  return mergeGeometries(quads);
}

/** A picket with a pointed top, origin at its foot. */
function createPicketGeometry() {
  const body = new THREE.BoxGeometry(0.075, 0.95, 0.022);
  body.translate(0, 0.475, 0);
  const tip = new THREE.CylinderGeometry(0, 0.053, 0.08, 4, 1);
  tip.rotateY(Math.PI / 4);
  tip.scale(1, 1, 0.3);
  tip.translate(0, 0.99, 0);
  return mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
}

// ---------- shaders ----------

/**
 * The night sky, drawn at the far plane behind everything: a dark gradient,
 * slow ragged cloud cover lit from the moon's side, the moon and a few stars
 * where the cloud breaks. Not fogged -- it IS the distance.
 */
function createSkyMaterial(moonDirection) {
  return new THREE.ShaderMaterial({
    name: 'StudyNightSky',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMoonDir: { value: moonDirection.clone().normalize() },
      // A strike: how lit (0..1), and where in the sky it is.
      uFlash: { value: 0 },
      uStrikeDir: { value: new THREE.Vector3(-0.9, 0.35, 0.2).normalize() }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww; // at the far plane, behind everything
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uMoonDir;
      uniform float uFlash;
      uniform vec3 uStrikeDir;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(vec3(0.011, 0.013, 0.019), vec3(0.002, 0.0025, 0.005), smoothstep(0.0, 0.6, h));
        col = mix(col, vec3(0.006, 0.006, 0.007), smoothstep(0.0, -0.1, h));

        float m = max(dot(d, uMoonDir), 0.0);
        vec3 moonGlow = vec3(0.04, 0.046, 0.058) * pow(m, 7.0) + vec3(0.16, 0.18, 0.21) * pow(m, 90.0);
        float disc = smoothstep(0.99935, 0.99955, m);

        vec2 uv = d.xz / (max(h, 0.0) + 0.16) * 0.8 + vec2(uTime * 0.006, uTime * 0.002);
        float c = fbm(uv);
        float cover = smoothstep(0.42, 0.7, c) * smoothstep(-0.03, 0.12, h);
        vec3 cloud = mix(vec3(0.005, 0.006, 0.008), vec3(0.022, 0.025, 0.031), smoothstep(0.5, 0.85, c));
        cloud += vec3(0.07, 0.075, 0.085) * pow(m, 10.0) * smoothstep(0.45, 0.8, c);

        vec2 sp = d.xz / (h + 0.05) * 160.0;
        float star = step(0.9982, hash(floor(sp))) * smoothstep(0.12, 0.45, h);

        col += moonGlow * (1.0 - cover * 0.6);
        col += vec3(0.62, 0.64, 0.66) * disc * (1.0 - cover * 0.9);
        col += vec3(0.35, 0.38, 0.48) * star * (1.0 - cover);
        col = mix(col, cloud, cover);
        // A strike lights the cloud from inside: brightest round where it
        // is, and in the thick of the cloud; the gaps between stay darker.
        float near = pow(max(dot(d, uStrikeDir), 0.0), 3.0);
        float thick = smoothstep(0.4, 0.85, c) * smoothstep(-0.05, 0.15, h);
        col += vec3(0.5, 0.56, 0.72) * uFlash * (0.12 + 0.88 * near) * (0.25 + 1.4 * thick);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

/**
 * Rain as falling streaks, moved entirely on the GPU: each drop's height is
 * its start minus time, wrapped. Brighter near the porch lamp, gone at range.
 */
function createRain(rand, { count, minX, maxX, minZ, maxZ, top, bottom, skip, lamp }) {
  const positions = [];
  const ends = [];
  const speeds = [];
  while (speeds.length < count * 2) {
    const x = minX + rand() * (maxX - minX);
    const z = minZ + rand() * (maxZ - minZ);
    if (skip(x, z)) continue;
    const y = bottom + rand() * (top - bottom);
    const speed = 7.5 + rand() * 3;
    for (const end of [0, 1]) {
      positions.push(x, y, z);
      ends.push(end);
      speeds.push(speed);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aEnd', new THREE.Float32BufferAttribute(ends, 1));
  geometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
  const material = new THREE.ShaderMaterial({
    name: 'StudyRain',
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: top },
      uBottom: { value: bottom },
      uLamp: { value: lamp.clone() },
      uFlash: { value: 0 }
    },
    vertexShader: /* glsl */`
      uniform float uTime, uTop, uBottom;
      uniform vec3 uLamp;
      attribute float aEnd, aSpeed;
      varying float vAlpha;
      varying float vLit;
      void main() {
        float span = uTop - uBottom;
        vec3 p = position;
        p.y = uBottom + mod(position.y - uTime * aSpeed - uBottom, span);
        // a slight slant, as if blown in towards the house
        p += vec3(0.04, 0.42, -0.07) * aEnd;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        vAlpha = (1.0 - smoothstep(12.0, 26.0, dist)) * smoothstep(0.3, 1.5, dist) * mix(0.25, 1.0, aEnd);
        vec3 toLamp = p - uLamp;
        vLit = 1.0 / (1.0 + dot(toLamp, toLamp) * 0.25);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uFlash;
      varying float vAlpha;
      varying float vLit;
      void main() {
        vec3 col = mix(vec3(0.2, 0.23, 0.28), vec3(1.0, 0.82, 0.55), vLit);
        // A strike lights every drop at once.
        col = mix(col, vec3(0.85, 0.9, 1.0), uFlash);
        gl_FragColor = vec4(col, vAlpha * (0.1 + vLit * 0.4 + uFlash * 0.8));
        #include <colorspace_fragment>
      }
    `
  });
  const rain = new THREE.LineSegments(geometry, material);
  rain.frustumCulled = false;
  rain.layers.set(MAIN_ONLY);
  return rain;
}

/**
 * @param {object} options
 * @param {number} options.roomW - the study's width.
 * @param {number} options.roomD - the study's depth; its front wall is at roomD / 2.
 * @param {number} options.roomH - the study's height.
 * @param {number} options.doorX - the front door's centre.
 * @param {number} options.doorwayW - the front doorway's width.
 * @param {number} options.doorwayH - the front doorway's height.
 * @param {object[]} options.colliders - the level's collider list, added to.
 * @returns {{ porch: THREE.Group, gate: THREE.Group, exterior: THREE.Group, update: (dt: number) => void }}
 */
export function createStudyExterior({ roomW, roomD, roomH, doorX, doorwayW, doorwayH, colliders }) {
  const frontZ = roomD / 2;
  const SHELL_H = roomH + 0.4;
  const rand = seeded(1987);
  const mainOnly = (object) => {
    object.traverse((o) => o.layers.set(MAIN_ONLY));
    return object;
  };

  // Shared materials.
  const whitePaint = new THREE.MeshStandardMaterial({ map: createPaintTexture('#625f58'), roughness: 0.82 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, metalness: 0.65, roughness: 0.52 });
  const siding = createSidingTextures();
  const boards = createPorchBoardTextures();
  const treadMat = new THREE.MeshStandardMaterial({ ...boards, roughness: 0.85 });

  // ---------- the porch ----------
  const porch = new THREE.Group();
  porch.position.set(doorX, 0, frontZ + PORCH_D / 2);
  // The porch's fixed boards and trim, merged into one mesh per material.
  // Only these cast the lamp's shadow: it is the one light here that has one.
  const porchParts = createBatcher();

  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(PORCH_W, PORCH_D),
    new THREE.MeshStandardMaterial({ ...boards, roughness: 0.9 })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.002;
  deck.receiveShadow = true;
  porch.add(deck);

  // The deck's edge boards, and lattice skirting down to the yard.
  const skirtH = -YARD_Y;
  const lattice = new THREE.MeshStandardMaterial({
    map: createLatticeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9
  });
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x030303 });
  const skirting = createBatcher();
  for (const [w, x, z, ry] of [
    [PORCH_W, 0, PORCH_D / 2, 0],
    [PORCH_D, -PORCH_W / 2, 0, -Math.PI / 2],
    [PORCH_D, PORCH_W / 2, 0, Math.PI / 2]
  ]) {
    porchParts.add(new THREE.BoxGeometry(w + 0.04, 0.16, 0.03), whitePaint, { position: [x, -0.08, z], rotation: [0, ry, 0] });
    skirting.add(new THREE.PlaneGeometry(w, skirtH - 0.16), lattice, { position: [x, YARD_Y + (skirtH - 0.16) / 2, z], rotation: [0, ry, 0] });
    skirting.add(new THREE.PlaneGeometry(w, skirtH), voidMat, { position: [x * 0.97, YARD_Y + skirtH / 2, z * 0.97], rotation: [0, ry, 0] });
  }
  porch.add(...skirting.build());

  // Turned posts at the two front corners, as the old square ones were, with
  // scroll brackets into the front beam and the side beam.
  const POST_H = 2.6;
  const postGeometry = createTurnedPostGeometry(POST_H);
  const bracketGeometry = createBracketGeometry();
  for (const px of [-1.4, 1.4]) {
    porchParts.add(postGeometry, whitePaint, { position: [px, 0, PORCH_D / 2 - 0.1] });
    // Turned half round rather than mirrored, so its faces still face out.
    const inward = -Math.sign(px);
    porchParts.add(bracketGeometry, whitePaint, {
      position: [px + inward * 0.085, POST_H - 0.6, PORCH_D / 2 - 0.1],
      rotation: [0, inward > 0 ? 0 : Math.PI, 0]
    });
    porchParts.add(bracketGeometry, whitePaint, {
      position: [px, POST_H - 0.6, PORCH_D / 2 - 0.185], rotation: [0, Math.PI / 2, 0]
    });
    colliders.push({
      minX: doorX + px - 0.1, maxX: doorX + px + 0.1,
      minZ: frontZ + 0.05, maxZ: frontZ + PORCH_D - 0.05
    });
  }

  // Side railings: rails and turned balusters, open rather than a solid board.
  const balusterSpots = [];
  for (const px of [-1.4, 1.4]) {
    for (const [h, y] of [[0.07, 0.94], [0.06, 0.12]]) {
      porchParts.add(new THREE.BoxGeometry(0.075, h, PORCH_D - 0.25), whitePaint, { position: [px, y, -0.08] });
    }
    for (let z = -PORCH_D / 2 + 0.12; z < PORCH_D / 2 - 0.2; z += 0.115) balusterSpots.push([px, z]);
  }
  const balusters = new THREE.InstancedMesh(createBalusterGeometry(0.78), whitePaint, balusterSpots.length);
  balusterSpots.forEach(([x, z], i) => {
    balusters.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.15, z));
  });
  balusters.castShadow = true;
  balusters.receiveShadow = true;
  porch.add(balusters);

  // Beams round the top, the beadboard ceiling, and the roof above it.
  porchParts.add(new THREE.BoxGeometry(PORCH_W + 0.1, 0.2, 0.14), whitePaint, { position: [0, POST_H - 0.1, PORCH_D / 2 - 0.1] });
  for (const px of [-1.45, 1.45]) {
    // Start at the exterior siding. Ends on the interior wall plane flicker
    // through the wallpaper as pale rectangles on either side of the door.
    porchParts.add(new THREE.BoxGeometry(0.12, 0.2, PORCH_D - OUT), whitePaint, { position: [px, POST_H - 0.1, OUT / 2] });
  }
  porchParts.add(new THREE.BoxGeometry(PORCH_W + 0.5, 0.16, 0.04), whitePaint, { position: [0, POST_H + 0.2, PORCH_D / 2 + 0.36] });
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(PORCH_W, PORCH_D),
    new THREE.MeshStandardMaterial({ map: createBeadboardTexture(), roughness: 0.85 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = POST_H;
  porch.add(ceiling);
  const roofSlope = new THREE.Mesh(
    new THREE.BoxGeometry(PORCH_W + 0.5, 0.06, PORCH_D + 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.95 })
  );
  roofSlope.position.set(0, POST_H + 0.42, 0.12);
  roofSlope.rotation.x = 0.2;
  porch.add(mainOnly(roofSlope));

  // Steps down to the yard, just beyond the gate.
  for (let s = 0; s < 2; s++) {
    porchParts.add(new THREE.BoxGeometry(1.5, 0.05, 0.32), treadMat, { position: [0, -0.18 * (s + 1) - 0.025, PORCH_D / 2 + 0.17 + s * 0.3] });
    porchParts.add(new THREE.BoxGeometry(1.5, 0.18, 0.03), whitePaint, { position: [0, -0.18 * (s + 1) + 0.065, PORCH_D / 2 + 0.02 + s * 0.3] });
  }
  for (const sx of [-0.77, 0.77]) {
    porchParts.add(new THREE.BoxGeometry(0.05, 0.55, 0.72), whitePaint, { position: [sx, YARD_Y + 0.22, PORCH_D / 2 + 0.33] });
  }

  // A weathered bench against the left rail.
  const benchMat = new THREE.MeshStandardMaterial({ map: createPaintTexture('#5b5046'), roughness: 0.9 });
  const BENCH = [-1.12, 0, -0.15];
  porchParts.add(new THREE.BoxGeometry(0.4, 0.05, 1.2), benchMat, { position: [BENCH[0], 0.45, BENCH[2]] });
  porchParts.add(new THREE.BoxGeometry(0.05, 0.42, 1.2), benchMat, { position: [BENCH[0] - 0.18, 0.7, BENCH[2]], rotation: [0, 0, -0.12] });
  for (const lz of [-0.52, 0.52]) {
    porchParts.add(new THREE.BoxGeometry(0.36, 0.45, 0.05), benchMat, { position: [BENCH[0], 0.225, BENCH[2] + lz] });
  }
  porch.add(...porchParts.build({ castShadow: true }));

  // The lamp: a hanging lantern round the porch light, which sits inside it.
  // None of it casts a shadow, or the light inside would be shut in.
  const LAMP = new THREE.Vector3(0, 2.35, -0.5);
  const lanternParts = createBatcher();
  lanternParts.add(new THREE.CylinderGeometry(0.006, 0.006, POST_H - LAMP.y - 0.12, 5), ironMat, { position: [0, (POST_H - LAMP.y) / 2 + 0.06, 0] });
  lanternParts.add(new THREE.ConeGeometry(0.13, 0.09, 4), ironMat, { position: [0, 0.15, 0], rotation: [0, Math.PI / 4, 0] });
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    lanternParts.add(new THREE.BoxGeometry(0.014, 0.22, 0.014), ironMat, { position: [cx * 0.077, 0, cz * 0.077] });
  }
  lanternParts.add(new THREE.BoxGeometry(0.17, 0.025, 0.17), ironMat, { position: [0, -0.11, 0] });
  lanternParts.add(new THREE.BoxGeometry(0.15, 0.2, 0.15), new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffb764, emissiveIntensity: 1.4, transparent: true, opacity: 0.55, roughness: 0.2
  }));
  lanternParts.add(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe4b8 }));
  const lantern = new THREE.Group();
  lantern.position.copy(LAMP);
  lantern.add(...lanternParts.build({ receiveShadow: false }));
  porch.add(lantern);

  // A doormat, and a pot of dead stems in the far corner.
  const doormat = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.015, 0.55),
    new THREE.MeshStandardMaterial({ map: createPaintTexture('#4a3a28'), roughness: 1 })
  );
  doormat.position.set(0, 0.008, -PORCH_D / 2 + 0.45);
  doormat.receiveShadow = true;
  porch.add(doormat);
  const potParts = createBatcher();
  potParts.add(
    new THREE.LatheGeometry([[0.11, 0], [0.14, 0.02], [0.17, 0.3], [0.19, 0.32], [0.19, 0.35], [0.165, 0.35]]
      .map(([r, y]) => new THREE.Vector2(r, y)), 14),
    new THREE.MeshStandardMaterial({ color: 0x5a3426, roughness: 0.9 })
  );
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a3123, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const len = 0.25 + rand() * 0.35;
    const stem = new THREE.CylinderGeometry(0.004, 0.007, len, 4);
    stem.translate(0, len / 2, 0);
    stem.rotateZ((rand() - 0.5) * 0.9);
    stem.rotateY(rand() * Math.PI * 2);
    potParts.add(stem, stemMat, { position: [0, 0.32, 0] });
  }
  const potGroup = new THREE.Group();
  potGroup.position.set(1.12, 0, -0.95);
  potGroup.add(...potParts.build({ castShadow: false }));
  porch.add(potGroup);

  // ---------- the gate ----------
  // Wrought iron, two leaves meeting in the middle, chained and padlocked:
  // "a fence door sealing the porch off". The last thing between the player
  // and the yard. Same place and size as the gate it replaces.
  const gate = new THREE.Group();
  gate.position.set(0, 0, PORCH_D / 2 - 0.04);
  porch.add(gate);
  const leafW = 1.31;
  const gateParts = createBatcher();
  for (const side of [-1, 1]) {
    const x0 = side * 0.01;
    for (const [y, h] of [[0.12, 0.05], [1.12, 0.035], [1.62, 0.05]]) {
      gateParts.add(new THREE.BoxGeometry(leafW, h, 0.035), ironMat, { position: [x0 + side * leafW / 2, y, 0] });
    }
    for (const sx of [0.02, leafW]) {
      gateParts.add(new THREE.BoxGeometry(0.045, 1.78, 0.04), ironMat, { position: [x0 + side * sx, 0.95, 0] });
    }
    for (let i = 1; i < 9; i++) {
      const x = x0 + side * (i * leafW / 9);
      gateParts.add(new THREE.CylinderGeometry(0.013, 0.013, 1.72, 6), ironMat, { position: [x, 0.98, 0] });
      gateParts.add(new THREE.ConeGeometry(0.03, 0.11, 6), ironMat, { position: [x, 1.89, 0] });
      if (i % 2 === 1 && i < 8) {
        gateParts.add(new THREE.TorusGeometry(0.06, 0.009, 6, 16), ironMat, { position: [x + side * leafW / 18, 1.37, 0] });
      }
    }
  }
  // The chain wrapped round the two meeting stiles, and its padlock.
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x3b3833, metalness: 0.8, roughness: 0.45 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    gateParts.add(new THREE.TorusGeometry(0.018, 0.0045, 5, 10), chainMat, {
      position: [Math.cos(a) * 0.07, 1.0 + i * 0.012, Math.sin(a) * 0.05], rotation: [0, i % 2 ? Math.PI / 2 : 0, 0]
    });
  }
  gateParts.add(new THREE.BoxGeometry(0.07, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0x5b4a2b, metalness: 0.75, roughness: 0.4 }), { position: [0, 0.93, 0.06] });
  gateParts.add(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), ironMat, { position: [0, 0.97, 0.06] });
  gate.add(...gateParts.build({ castShadow: true }));

  const gateCollider = {
    minX: doorX - 1.4, maxX: doorX + 1.4,
    minZ: frontZ + PORCH_D - 0.12, maxZ: frontZ + PORCH_D + 0.05
  };
  colliders.push(gateCollider);

  /**
   * Porch lighting, and it has to be brighter than instinct says.
   *
   * At 0.34 the whole porch rendered as a black void with a few faint vertical
   * lines in it -- and those lines are the gate, which is the thing stopping
   * the player leaving. An obstacle the player cannot see is not an obstacle,
   * it is a wall they walk into.
   *
   * The warm door lamp contrasts with the shared cold moon below. The porch
   * needs no separate cold point light or six-face point-shadow pass.
   */
  const porchLight = new THREE.PointLight(0xffd8a0, 1.15, 7, 2);
  porchLight.position.copy(LAMP);
  porchLight.name='Study_Porch_Lamp';porchLight.castShadow=false;
  porch.add(porchLight);
  // The same moon lights the yard and all three windows; no second night fill.

  // ---------- the house ----------
  const exterior = new THREE.Group();
  const houseParts = createBatcher();

  // The walls, one siding material for all of them: each piece's UVs are in
  // metres and the texture tiles every two.
  const sidingMat = new THREE.MeshStandardMaterial({ ...siding, roughness: 0.9 });
  const metresToTiles = (geometry, width, height) => {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 2, uv.getY(i) * height / 2);
    return geometry;
  };

  // The front wall, in one piece with the doorway cut out of it: under the
  // porch, turning round used to look straight into the study through it.
  const left = -roomW / 2 - OUT;
  const right = roomW / 2 + OUT;
  const dl = doorX - doorwayW / 2;
  const dr = doorX + doorwayW / 2;
  const frontShape = new THREE.Shape();
  frontShape.moveTo(left, YARD_Y);
  frontShape.lineTo(dl, YARD_Y);
  frontShape.lineTo(dl, doorwayH);
  frontShape.lineTo(dr, doorwayH);
  frontShape.lineTo(dr, YARD_Y);
  frontShape.lineTo(right, YARD_Y);
  frontShape.lineTo(right, SHELL_H);
  frontShape.lineTo(left, SHELL_H);
  frontShape.closePath();
  // ShapeGeometry's UVs are already in metres: scale as a one-metre piece.
  houseParts.add(metresToTiles(new THREE.ShapeGeometry(frontShape), 1, 1), sidingMat, { position: [0, 0, frontZ + OUT] });

  // The other three walls.
  const wallH = SHELL_H - YARD_Y;
  for (const [w, x, z, ry] of [
    [roomW + OUT * 2, 0, -frontZ - OUT, Math.PI],
    [roomD + OUT * 2, right, 0, Math.PI / 2]
  ]) {
    houseParts.add(metresToTiles(new THREE.PlaneGeometry(w, wallH), w, wallH), sidingMat, {
      position: [x, (SHELL_H + YARD_Y) / 2, z], rotation: [0, ry, 0]
    });
  }

  // The left wall, with the study's windows cut through it. The plane's local x
  // runs along world z, so the shape is drawn in (z, height above its centre).
  {
    const wallMidY = (SHELL_H + YARD_Y) / 2;
    const halfD = roomD / 2 + OUT;
    const leftShape = new THREE.Shape();
    leftShape.moveTo(-halfD, -wallH / 2);
    leftShape.lineTo(halfD, -wallH / 2);
    leftShape.lineTo(halfD, wallH / 2);
    leftShape.lineTo(-halfD, wallH / 2);
    leftShape.closePath();
    const { bottom, top, halfWidth, zs } = STUDY_WINDOWS;
    for (const zc of zs) {
      const hole = new THREE.Path();
      hole.moveTo(zc - halfWidth, bottom - wallMidY);
      hole.lineTo(zc - halfWidth, top - wallMidY);
      hole.lineTo(zc + halfWidth, top - wallMidY);
      hole.lineTo(zc + halfWidth, bottom - wallMidY);
      hole.closePath();
      leftShape.holes.push(hole);
    }
    houseParts.add(metresToTiles(new THREE.ShapeGeometry(leftShape), 1, 1), sidingMat, {
      position: [left, wallMidY, 0], rotation: [0, -Math.PI / 2, 0]
    });
  }

  // The doorway's reveal through the wall's thickness, and its casing.
  const trimMat = whitePaint;
  for (const [w, h, x, y, ry, rx] of [
    [OUT, doorwayH, dl, doorwayH / 2, Math.PI / 2, 0],
    [OUT, doorwayH, dr, doorwayH / 2, -Math.PI / 2, 0],
    [doorwayW, OUT, doorX, doorwayH, 0, Math.PI / 2]
  ]) {
    houseParts.add(new THREE.PlaneGeometry(w, h), trimMat, { position: [x, y, frontZ + OUT / 2], rotation: [rx, ry, 0] });
  }
  // The side casings stop under the head casing (y = doorwayH + 0.07). Run up
  // into it, all three fronts shared one plane over the two top corners and
  // flickered there; butted, each face has its own patch of that plane.
  for (const [w, h, x, y] of [
    [0.14, doorwayH + 0.07, dl - 0.07, (doorwayH + 0.07) / 2],
    [0.14, doorwayH + 0.07, dr + 0.07, (doorwayH + 0.07) / 2],
    [doorwayW + 0.42, 0.2, doorX, doorwayH + 0.17]
  ]) {
    houseParts.add(new THREE.BoxGeometry(w, h, 0.03), trimMat, { position: [x, y, frontZ + OUT + 0.015] });
  }
  houseParts.add(new THREE.BoxGeometry(doorwayW + 0.56, 0.06, 0.08), trimMat, { position: [doorX, doorwayH + 0.3, frontZ + OUT + 0.04] });

  // Shuttered windows either side of the porch, faintly lit from inside.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d10, roughness: 0.08, metalness: 0.6, emissive: 0x3a2410, emissiveIntensity: 0.35
  });
  const shutterMat = new THREE.MeshStandardMaterial({ map: createPaintTexture('#26302a'), roughness: 0.85 });
  const windowZ = frontZ + OUT + 0.01;
  for (const wx of [-6.2, -3.6, 3.6, 6.2]) {
    const cx = doorX + wx;
    houseParts.add(new THREE.PlaneGeometry(0.9, 1.7), glassMat, { position: [cx, 1.95, windowZ] });
    // Head, sill, the two sides between them, the transom bar, and a mullion
    // 1 cm shallower that passes behind the bar. The sides used to run 6 cm up
    // into the head and 5.5 cm down into the sill, and the mullion straight
    // through the bar, every pair sharing a front plane where they crossed.
    for (const [w, h, x, y, d = 0.05] of [
      [1.08, 0.1, 0, 2.85], [1.14, 0.07, 0, 1.06], [0.09, 1.705, -0.495, 1.9475], [0.09, 1.705, 0.495, 1.9475],
      [0.9, 0.04, 0, 1.95], [0.035, 1.7, 0, 1.95, 0.04]
    ]) {
      houseParts.add(new THREE.BoxGeometry(w, h, d), trimMat, { position: [cx + x, y, windowZ + 0.02] });
    }
    for (const sx of [-0.78, 0.78]) {
      houseParts.add(new THREE.BoxGeometry(0.44, 1.8, 0.03), shutterMat, { position: [cx + sx, 1.95, windowZ + 0.02] });
    }
  }

  // Corner boards, and a fieldstone foundation band where the walls meet the yard.
  for (const cx of [left, right]) {
    houseParts.add(new THREE.BoxGeometry(0.16, wallH, 0.16), trimMat, { position: [cx, (SHELL_H + YARD_Y) / 2, frontZ + OUT] });
  }
  const stoneMat = new THREE.MeshStandardMaterial({ map: createStoneTexture(), roughness: 0.95 });
  for (const [w, x, z, ry] of [
    [roomW + OUT * 2 + 0.1, 0, frontZ + OUT + 0.04, 0],
    [roomD + OUT * 2 + 0.1, left - 0.04, 0, Math.PI / 2],
    [roomD + OUT * 2 + 0.1, right + 0.04, 0, Math.PI / 2]
  ]) {
    houseParts.add(new THREE.BoxGeometry(w, 0.5, 0.08), stoneMat, { position: [x, YARD_Y + 0.25, z], rotation: [0, ry, 0] });
  }
  exterior.add(...houseParts.build());

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(roomW + OUT * 3, 0.22, roomD + OUT * 3),
    new THREE.MeshStandardMaterial({ color: 0x0f0d0b, roughness: 1 })
  );
  roof.position.set(0, SHELL_H + 0.11, 0);
  exterior.add(roof);

  // ---------- the yard ----------
  const groundTex = createGroundTextures();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 170),
    new THREE.MeshStandardMaterial({ ...groundTex, roughness: 1, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = YARD_Y;
  ground.receiveShadow = true;
  exterior.add(ground);

  const yardFront = frontZ + PORCH_D;
  const FENCE_Z = yardFront + 9.5;

  // Flagstones from the porch steps to the fence.
  const stoneSpots = [];
  for (let z = yardFront + 0.85; z < FENCE_Z - 0.2; z += 0.62 + rand() * 0.12) {
    stoneSpots.push([doorX + (rand() - 0.5) * 0.25, z, 0.42 + rand() * 0.14, rand() * Math.PI]);
  }
  const flagstones = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 0.05, 7),
    new THREE.MeshStandardMaterial({ color: 0x252422, roughness: 0.55 }),
    stoneSpots.length
  );
  stoneSpots.forEach(([x, z, r, a], i) => {
    flagstones.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(x, YARD_Y + 0.01, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      new THREE.Vector3(r, 1, r * 0.8)
    ));
  });
  flagstones.receiveShadow = true;
  exterior.add(flagstones);

  // Grass tufts across the front yard, never on the path.
  const tuftSpots = [];
  while (tuftSpots.length < 900) {
    const x = doorX + (rand() - 0.5) * 44;
    const z = frontZ + OUT + 0.3 + rand() * 30;
    if (Math.abs(x - doorX) < 0.95 && z < FENCE_Z + 1) continue;
    if (Math.abs(x - doorX) < PORCH_W / 2 + 0.2 && z < yardFront + 0.8) continue;
    tuftSpots.push([x, z]);
  }
  const tufts = new THREE.InstancedMesh(
    createTuftGeometry(),
    new THREE.MeshStandardMaterial({ map: createGrassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }),
    tuftSpots.length
  );
  const tuftColor = new THREE.Color();
  tuftSpots.forEach(([x, z], i) => {
    const s = 0.5 + rand() * 0.6;
    tufts.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(x, YARD_Y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI),
      new THREE.Vector3(s, s * (0.7 + rand() * 0.6), s)
    ));
    tufts.setColorAt(i, tuftColor.setHSL(0.15 + rand() * 0.06, 0.22, 0.1 + rand() * 0.08));
  });
  exterior.add(mainOnly(tufts));

  // Overgrown shrubs against the foundation, either side of the porch.
  const shrubParts = [];
  for (const [sx, sz, sr] of [
    [-2.4, 0.7, 0.75], [-3.3, 0.6, 0.6], [2.5, 0.75, 0.8], [3.5, 0.55, 0.55], [-7.4, 0.6, 0.7], [7.1, 0.65, 0.65]
  ]) {
    for (let k = 0; k < 4; k++) {
      const blob = new THREE.IcosahedronGeometry(sr * (0.6 + rand() * 0.45), 1);
      const pos = blob.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const f = 0.82 + rand() * 0.32;
        pos.setXYZ(v, pos.getX(v) * f, pos.getY(v) * f * 0.8, pos.getZ(v) * f);
      }
      blob.computeVertexNormals();
      blob.translate(doorX + sx + (rand() - 0.5) * sr, YARD_Y + sr * 0.55, frontZ + OUT + sz + (rand() - 0.5) * 0.4);
      paint(blob, new THREE.Color(0x080d09).lerp(new THREE.Color(0x0f160e), rand()));
      shrubParts.push(blob); // icosahedra are built non-indexed already
    }
  }
  const shrubs = new THREE.Mesh(mergeGeometries(shrubParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  exterior.add(shrubs);

  // A weathered picket fence across the front, its gate left hanging open.
  const picketSpots = [];
  for (let x = doorX - 22; x <= doorX + 22; x += 0.16) {
    if (Math.abs(x - doorX) < 0.75) continue;
    picketSpots.push(x);
  }
  const picketMat = new THREE.MeshStandardMaterial({ map: createPaintTexture('#3c3b37'), roughness: 0.9 });
  const pickets3d = new THREE.InstancedMesh(createPicketGeometry(), picketMat, picketSpots.length + 7);
  const lean = new THREE.Euler();
  picketSpots.forEach((x, i) => {
    lean.set((rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.05);
    pickets3d.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(x, YARD_Y, FENCE_Z),
      new THREE.Quaternion().setFromEuler(lean),
      new THREE.Vector3(1, 0.92 + rand() * 0.12, 1)
    ));
  });
  // The fence gate: seven pickets, swung open towards the house.
  const gateHinge = new THREE.Vector3(doorX + 0.75, YARD_Y, FENCE_Z);
  const openAngle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -1.15);
  for (let k = 0; k < 7; k++) {
    const offset = new THREE.Vector3(-0.08 - k * 0.2, 0, 0).applyQuaternion(openAngle);
    pickets3d.setMatrixAt(picketSpots.length + k, new THREE.Matrix4().compose(
      gateHinge.clone().add(offset), openAngle, new THREE.Vector3(1, 0.95, 1)
    ));
  }
  exterior.add(mainOnly(pickets3d));
  for (const side of [-1, 1]) {
    for (const y of [0.25, 0.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(21.25, 0.07, 0.04), picketMat);
      rail.position.set(doorX + side * (0.75 + 10.625), YARD_Y + y, FENCE_Z - 0.03);
      exterior.add(mainOnly(rail));
    }
  }

  // ---------- the woods ----------
  // Pines in a ring well past the fence, and bare trees closer in, as in the
  // news photographs. A few shapes each, instanced, so the wood is cheap.
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const pineShapes = [12, 15, 18].map((h) => createPineGeometry(rand, h));
  const pineSpots = [[], [], []];
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    const r = 19 + rand() * 32;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + 2;
    // Leave the view from the porch open across the front yard.
    if (z > frontZ && Math.abs(x) < 7 && r < 26) continue;
    pineSpots[i % 3].push([x, z, 0.7 + rand() * 0.55, rand() * Math.PI * 2]);
  }
  pineShapes.forEach((shape, k) => {
    const pines = new THREE.InstancedMesh(shape, treeMat, pineSpots[k].length);
    pineSpots[k].forEach(([x, z, s, a], i) => {
      pines.setMatrixAt(i, new THREE.Matrix4().compose(
        new THREE.Vector3(x, YARD_Y - 0.1, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
        new THREE.Vector3(s, s, s)
      ));
    });
    exterior.add(mainOnly(pines));
  });
  const bareShapes = [7, 9.5].map((h) => createBareTreeGeometry(rand, h));
  const bareSpots = [
    [-9.5, frontZ + 7.5], [8.8, frontZ + 6.2], [-14, frontZ + 3], [13.5, frontZ + 10],
    [-5.5, frontZ + 15.5], [6.5, frontZ + 17], [-17, frontZ - 6], [16, frontZ - 4]
  ];
  bareShapes.forEach((shape, k) => {
    const spots = bareSpots.filter((_, i) => i % 2 === k);
    const trees = new THREE.InstancedMesh(shape, treeMat, spots.length);
    spots.forEach(([x, z], i) => {
      const s = 0.85 + rand() * 0.35;
      trees.setMatrixAt(i, new THREE.Matrix4().compose(
        new THREE.Vector3(doorX + x, YARD_Y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
        new THREE.Vector3(s, s, s)
      ));
    });
    exterior.add(mainOnly(trees));
  });

  // ---------- the night ----------
  // A cold wash over the whole outside, so the house has a night to sit in
  // rather than a black void. Hemisphere rather than ambient: the ground reads
  // darker than the sky, which is most of what says "outdoors".
  const sky = new THREE.HemisphereLight(0x36404d, 0x08090b, 0.18);
  sky.name='Study_Night_Sky_Fill';exterior.add(sky);
  const moon = new THREE.DirectionalLight(0xa9b9cb, .55);
  moon.name='Study_Window_Night';moon.position.set(-14,8,5.3);
  moon.target.position.set(0,1.2,.8);exterior.add(moon.target);
  // A single static 512px map replaces the porch point light's six cube faces.
  moon.castShadow=true;moon.shadow.mapSize.set(512,512);
  Object.assign(moon.shadow.camera,{left:-10,right:10,top:9,bottom:-9,near:1,far:38});
  moon.shadow.camera.updateProjectionMatrix();moon.shadow.bias=-.0003;moon.shadow.normalBias=.025;
  moon.shadow.radius=1.5;moon.shadow.autoUpdate=false;moon.shadow.needsUpdate=true;
  exterior.add(moon);

  // The sky itself: low and ahead of the porch is where the player looks.
  const skyMaterial = createSkyMaterial(new THREE.Vector3(-0.42, 0.36, 0.83));
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), skyMaterial);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -1;
  exterior.add(mainOnly(skyDome));

  // Rain everywhere outside, except under the porch roof and inside the house.
  const rain = createRain(rand, {
    count: 2400,
    minX: doorX - 16, maxX: doorX + 16,
    minZ: frontZ + OUT + 0.15, maxZ: frontZ + 26,
    top: 9, bottom: YARD_Y,
    lamp: new THREE.Vector3(doorX + LAMP.x, LAMP.y, frontZ + PORCH_D / 2 + LAMP.z),
    skip: (x, z) => Math.abs(x - doorX) < PORCH_W / 2 + 0.3 && z < frontZ + PORCH_D + 0.4
  });
  exterior.add(rain);

  // And down the left side of the house, past the study's windows: the view
  // out of them was the yard and the sky with no rain in it.
  const { zs } = STUDY_WINDOWS;
  const sideRain = new Rain({
    count: 3600,
    origin: new THREE.Vector3(left - 0.12, YARD_Y, (zs[0] + zs[zs.length - 1]) / 2),
    out: new THREE.Vector3(-1, 0, 0),
    width: zs[zs.length - 1] - zs[0] + 3.2,
    depth: 7,
    height: 9.5,
    spread: 0.8,
    wind: [0.1, 0.03],
    brightness: 1.2
  });
  exterior.add(sideRain.object);
  /** Seconds since the sky was last lit: a strike's pulses have dark gaps in them. */
  let darkFor = Infinity;

  return {
    porch,
    gate,
    exterior,
    /**
     * The night's own lights. They reach in through the windows and fill the
     * study as well, so a blackout turns them down with the room's
     * (studyBlackout.js BLACKOUT_FILL): intensity only, as ever.
     */
    nightLights: [sky, moon],
    /** The moonlit window light: the one a lightning strike comes in by. */
    windowLight: moon,
    /**
     * Moves the rain and the clouds. `flash` (0..1) is a strike's light
     * (studyBlackout.js): the sky and the rain light with it.
     */
    update(dt, { flash = 0 } = {}) {
      rain.material.uniforms.uTime.value += dt;
      skyMaterial.uniforms.uTime.value += dt;
      sideRain.update(dt);
      // Each strike somewhere new in the western sky, the side the windows face;
      // not each pulse of one, which go dark for a moment between them.
      if (flash > 0 && darkFor > 0.3) {
        skyMaterial.uniforms.uStrikeDir.value.set(-1, 0.25 + Math.random() * 0.45, (Math.random() - 0.5) * 1.6).normalize();
      }
      darkFor = flash > 0 ? 0 : darkFor + dt;
      skyMaterial.uniforms.uFlash.value = flash;
      rain.material.uniforms.uFlash.value = flash;
      sideRain.setFlash(flash);
    }
  };
}
