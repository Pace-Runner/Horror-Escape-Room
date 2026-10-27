import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  seededRandom, smoothstep, createTileableNoise, createCellNoise, fbm,
  paintCanvas, normalCanvasFromHeights, canvasTexture
} from '../world/proceduralPixels.js';

/**
 * The study chimneypiece, re-dressed in code when its GLB loads.
 *
 * WHAT WAS WRONG. The model's shapes are good (real mouldings, a proper
 * firebox opening) but its surfaces were not: the shared 'feature' mahogany
 * turned the carved surround red, the "limestone" slips were one flat grey,
 * and the cast-iron insert was a black hole. Rebuilding the GLB would mean a
 * Blender round trip with no build script, so the surfaces are replaced here
 * instead, on this fireplace's own cloned materials (modelLoader.js clones
 * them per load):
 *
 *   1. WOOD: the darker espresso family (studyLevel.js picks it for this URL),
 *      darkened further and given a waxed sheen -- an old, much-polished
 *      surround rather than a red one.
 *   2. SLIPS: Victorian majolica tiles. The texture is painted pixel by pixel
 *      (proceduralPixels.js): a raised flower on each tile, a pillowed edge,
 *      grout, fine crazing in the glaze and the odd chipped edge. One pass
 *      writes colour, height and roughness for every texel, so the normal map
 *      and the gloss can never disagree with the picture. The glaze pools dark
 *      in the hollows and thins over the relief, as real majolica does.
 *   3. HEARTH: the slab the slips stand on becomes honed black slate, and a
 *      matching apron is laid in front of it -- before, the hearth stood out
 *      only 8 cm from the slips.
 *   4. IRON: a mottled, faintly rusty cast iron instead of flat black.
 *   5. FENDER: a low iron kerb with a brass rail, the thing every Victorian
 *      hearth had to keep coals off the floor. It is the only new part that
 *      needs a collider (studyLevel.js adds it); the apron is 3 cm tall and
 *      the player simply walks onto it.
 *
 * RE-UV IN METRES. The GLB's own UVs are squeezed into 0..1 per part, so a
 * tile texture laid on them would stretch differently on every face. Each
 * face is instead box-projected from its own normal in fireplace-local
 * metres: one tile is exactly STUDY_FIREPLACE.tileWidth wide, and the grout
 * lines land on the edges of the opening and of the slips.
 *
 * Everything here is static: no lights, no per-frame work. The fire itself is
 * world/HearthFire.js.
 */

/** Measured from victorian_fireplace.glb, in fireplace-local metres (it faces +Z). */
export const STUDY_FIREPLACE = Object.freeze({
  /** Front face of the tiled slips, the opening's edge, the slips' outer edge. */
  slipFaceZ: 0.154,
  openingHalfWidth: 0.485,
  slipOuterHalfWidth: 0.606,
  openingTopY: 1.002,
  /** The hearth slab under the slips: everything of the "limestone" below this is slab. */
  hearthTopY: 0.092,
  hearthFrontZ: 0.229,
  /**
   * One tile. 0.485 / 4, so four tiles span half the opening and a fifth ends
   * at the slips' outer edge (0.606); (1.002 - 0.092) / 7, so seven rows climb
   * each side of the opening and the eighth runs across its top.
   */
  tileWidth: 0.485 / 4,
  tileHeight: (1.002 - 0.092) / 7,
  /** The cast-iron firebox, inside faces. */
  firebox: Object.freeze({ halfWidth: 0.478, floorY: 0.140, ceilingY: 0.982, backZ: -0.160, frontZ: 0.131 })
});

/** The new slate apron in front of the hearth slab, and the fender standing on it. */
export const STUDY_HEARTH_APRON = Object.freeze({
  halfWidth: 0.85, backZ: 0.232, frontZ: 0.632, topY: 0.032,
  fender: Object.freeze({ halfWidth: 0.63, frontZ: 0.575, railY: 0.125 })
});

/** Tiles painted per side of the texture: 4 x 4 different tiles before it repeats. */
const TILES_PER_TEXTURE = 4;
const TILE_TEXTURE_PIXELS = 512;
const SLATE_METRES_PER_REPEAT = 0.55;
const IRON_METRES_PER_REPEAT = 0.4;

/** sRGB encode of a linear 0..1 value, as 0..255. Colours below are mixed in linear light. */
function toSrgbByte(linear) {
  const c = Math.min(1, Math.max(0, linear));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
}
const mix = (a, b, t) => a + (b - a) * t;
const mixColour = (a, b, t, out) => {
  out[0] = mix(a[0], b[0], t); out[1] = mix(a[1], b[1], t); out[2] = mix(a[2], b[2], t);
  return out;
};

/**
 * The glazed slip tiles: colour, normal and roughness maps for 4 x 4 tiles.
 *
 * Each tile's height field, in tile units (0..1 across):
 *   - a 3.6 mm grout joint, lowest of all;
 *   - a rounded (pillowed) arris rising from the joint;
 *   - a raised fillet border, with the field inside it sunk a little;
 *   - the motif: a domed boss, four domed petals with a groove down each,
 *     four pointed leaves on the diagonals, and a quarter ring in each corner
 *     that closes into a full ring where four tiles meet.
 * Colour then follows height, the way a translucent glaze does: thick and dark
 * in the hollows, thin and lighter over the relief.
 */
function paintSlipTiles(seed) {
  const size = TILE_TEXTURE_PIXELS;
  const tilePixels = size / TILES_PER_TEXTURE;
  const random = seededRandom(seed);
  const mottle = createTileableNoise(random, 16);
  const crazing = createCellNoise(random, 30, 30);
  const cell = { f1: 0, f2: 0, id: 0 };
  const tiles = Array.from({ length: TILES_PER_TEXTURE * TILES_PER_TEXTURE }, () => ({
    value: 0.86 + 0.24 * random(),
    hue: random() - 0.5,
    // Up to two chips knocked off an edge over a hundred years of fire irons.
    chips: Array.from({ length: random() < 0.55 ? 1 + Math.floor(random() * 2) : 0 }, () => {
      const along = 0.1 + 0.8 * random();
      const side = Math.floor(random() * 4);
      return {
        x: side === 0 ? 0.01 : side === 1 ? 0.99 : along,
        y: side === 2 ? 0.01 : side === 3 ? 0.99 : along,
        radius: 0.025 + 0.035 * random()
      };
    })
  }));
  const heights = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  const deep = [0.020, 0.062, 0.040];
  const body = [0.050, 0.128, 0.082];
  const thin = [0.20, 0.27, 0.16];
  const biscuit = [0.30, 0.22, 0.15];
  const grout = [0.032, 0.028, 0.024];
  const colour = [0, 0, 0];
  const bump = (distance, centre, width) => Math.exp(-(((distance - centre) / width) ** 2));

  const colourCanvas = paintCanvas(size, size, (px, py, rgba) => {
    const tile = tiles[Math.floor(py / tilePixels) * TILES_PER_TEXTURE + Math.floor(px / tilePixels)];
    const lx = (px % tilePixels + 0.5) / tilePixels;
    const ly = (py % tilePixels + 0.5) / tilePixels;
    const edge = Math.min(lx, 1 - lx, ly, 1 - ly);
    const n = fbm(mottle, px / size * 16, py / size * 16, 3);
    let height;
    let gloss;
    if (edge < 0.014) {
      height = 0.06 + 0.05 * n;
      const grit = 0.75 + 0.5 * n;
      colour[0] = grout[0] * grit; colour[1] = grout[1] * grit; colour[2] = grout[2] * grit;
      gloss = 0.95;
    } else {
      height = 0.42 + 0.26 * smoothstep(0.014, 0.075, edge);
      height += 0.14 * bump(edge, 0.104, 0.011);
      if (edge > 0.118) height -= 0.05;
      const cx = lx - 0.5;
      const cy = ly - 0.5;
      const r = Math.hypot(cx, cy);
      if (r < 0.06) height += 0.30 * Math.sqrt(1 - (r / 0.06) ** 2);
      for (let k = 0; k < 4; k++) {
        const angle = k * Math.PI / 2;
        const along = cx * Math.cos(angle) + cy * Math.sin(angle);
        const side = -cx * Math.sin(angle) + cy * Math.cos(angle);
        const petal = Math.hypot((along - 0.165) / 0.115, side / 0.072);
        if (petal < 1) {
          const dome = Math.sqrt(1 - petal * petal);
          height += 0.22 * dome - 0.07 * dome * Math.exp(-((side / 0.009) ** 2));
        }
        const leafAngle = angle + Math.PI / 4;
        const leafAlong = cx * Math.cos(leafAngle) + cy * Math.sin(leafAngle);
        const leafSide = -cx * Math.sin(leafAngle) + cy * Math.cos(leafAngle);
        const t = (leafAlong - 0.19) / 0.2;
        if (t > 0 && t < 1) {
          const halfWidth = 0.048 * Math.pow(Math.sin(Math.PI * t), 0.8);
          if (Math.abs(leafSide) < halfWidth) height += 0.15 * (1 - (leafSide / halfWidth) ** 2);
        }
      }
      const corner = Math.hypot(Math.min(lx, 1 - lx), Math.min(ly, 1 - ly));
      height += 0.13 * bump(corner, 0.15, 0.013);

      // Glaze: thick (dark, saturated) where it pooled, thin over the relief.
      mixColour(deep, body, smoothstep(0.40, 0.62, height), colour);
      mixColour(colour, thin, smoothstep(0.74, 1.0, height) * 0.85, colour);
      const shade = tile.value * (0.9 + 0.2 * n);
      colour[0] *= shade * (1 + 0.22 * tile.hue);
      colour[1] *= shade;
      colour[2] *= shade * (1 - 0.22 * tile.hue);
      gloss = 0.16 + 0.10 * n;

      crazing(px / size * 30, py / size * 30, cell);
      const craze = 1 - smoothstep(0.0, 0.07, cell.f2 - cell.f1);
      colour[0] *= 1 - 0.32 * craze; colour[1] *= 1 - 0.32 * craze; colour[2] *= 1 - 0.32 * craze;
      gloss += 0.22 * craze;

      for (const chip of tile.chips) {
        const d = Math.hypot(lx - chip.x, ly - chip.y) / chip.radius;
        if (d < 1) {
          const rim = smoothstep(0.75, 1.0, d);
          mixColour(biscuit, colour, rim, colour);
          height -= 0.16 * (1 - rim);
          gloss = mix(0.9, gloss, rim);
        }
      }
    }
    heights[py * size + px] = height;
    roughness[py * size + px] = gloss;
    rgba[0] = toSrgbByte(colour[0]);
    rgba[1] = toSrgbByte(colour[1]);
    rgba[2] = toSrgbByte(colour[2]);
  });
  const normalCanvas = normalCanvasFromHeights(heights, size, size, 2.6);
  const roughnessCanvas = paintCanvas(size, size, (px, py, rgba) => {
    rgba[0] = rgba[1] = rgba[2] = roughness[py * size + px] * 255;
  });
  return { colourCanvas, normalCanvas, roughnessCanvas };
}

/** Honed black slate: near black, faint cleavage streaks and a little mica. */
function paintSlate(seed) {
  const size = 256;
  const random = seededRandom(seed);
  const cloud = createTileableNoise(random, 8);
  // Few cells across, many down: noise stretched into streaks, still tiling.
  const grain = createTileableNoise(random, 4, 64);
  const roughness = new Float32Array(size * size);
  const colourCanvas = paintCanvas(size, size, (px, py, rgba) => {
    const u = px / size, v = py / size;
    const n = fbm(cloud, u * 8, v * 8, 4);
    // Riven slate splits along one plane: streaks stretched across the slab.
    const streak = smoothstep(0.58, 0.9, grain(u * 4, v * 64));
    const fleck = random() < 0.0025 ? 1 : 0;
    const value = 0.026 * (0.78 + 0.44 * n) + 0.010 * streak + 0.03 * fleck;
    rgba[0] = toSrgbByte(value * 0.96);
    rgba[1] = toSrgbByte(value * 0.98);
    rgba[2] = toSrgbByte(value * 1.04);
    roughness[py * size + px] = 0.36 + 0.2 * n + 0.12 * streak - 0.2 * fleck;
  });
  const roughnessCanvas = paintCanvas(size, size, (px, py, rgba) => {
    rgba[0] = rgba[1] = rgba[2] = roughness[py * size + px] * 255;
  });
  return { colourCanvas, roughnessCanvas };
}

/** Sand-cast iron: graphite grey, mottled, pitted, with a bloom of rust here and there. */
function paintCastIron(seed) {
  const size = 256;
  const random = seededRandom(seed);
  const cloud = createTileableNoise(random, 8);
  const rustCloud = createTileableNoise(random, 4);
  const pits = createTileableNoise(random, 128);
  const iron = [0.030, 0.028, 0.027];
  const rust = [0.060, 0.032, 0.018];
  const colour = [0, 0, 0];
  const roughness = new Float32Array(size * size);
  const colourCanvas = paintCanvas(size, size, (px, py, rgba) => {
    const u = px / size, v = py / size;
    const n = fbm(cloud, u * 8, v * 8, 4);
    const rusty = smoothstep(0.58, 0.78, fbm(rustCloud, u * 4, v * 4, 3)) * 0.7;
    const pit = smoothstep(0.72, 0.9, pits(u * 128, v * 128));
    mixColour(iron, rust, rusty, colour);
    const shade = (0.7 + 0.6 * n) * (1 - 0.45 * pit);
    rgba[0] = toSrgbByte(colour[0] * shade);
    rgba[1] = toSrgbByte(colour[1] * shade);
    rgba[2] = toSrgbByte(colour[2] * shade);
    roughness[py * size + px] = 0.5 + 0.18 * n + 0.25 * pit + 0.15 * rusty;
  });
  const roughnessCanvas = paintCanvas(size, size, (px, py, rgba) => {
    rgba[0] = rgba[1] = rgba[2] = Math.min(1, roughness[py * size + px]) * 255;
  });
  return { colourCanvas, roughnessCanvas };
}

/**
 * Box-projects UVs, face by face, in the geometry's own metres.
 *
 * Every triangle is projected along the axis its own (flat) normal points
 * down, so a bevel never gets one vertex projected one way and the next
 * another -- that is what smears a texture across a rounded edge. The result
 * is un-indexed: a vertex shared by two differently projected faces needs two
 * UVs.
 *
 * @param {THREE.BufferGeometry} source
 * @param {(x: number, y: number, z: number, axis: 'x'|'y'|'z', faceTopY: number) => [number, number]} project
 *   - called per vertex, with the axis its face is projected along and the
 *   height of that face's highest corner (so a whole face can be told apart).
 * @param {THREE.Matrix4} [matrix] - into fireplace-local space, for GLB parts.
 * @returns {THREE.BufferGeometry}
 */
function projectFaces(source, project, matrix = null) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  if (matrix) geometry.applyMatrix4(matrix);
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    normal.subVectors(c, b).cross(edge.subVectors(a, b));
    const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
    const axis = ay >= ax && ay >= az ? 'y' : ax >= az ? 'x' : 'z';
    const faceTopY = Math.max(a.y, b.y, c.y);
    for (let k = 0; k < 3; k++) {
      const [u, v] = project(positions.getX(i + k), positions.getY(i + k), positions.getZ(i + k), axis, faceTopY);
      uvs[(i + k) * 2] = u;
      uvs[(i + k) * 2 + 1] = v;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.deleteAttribute('uv1');
  return geometry;
}

/**
 * Splits the GLB's "limestone" into two draw groups -- tiled slips (0) and the
 * slate hearth slab (1) -- by height: every triangle wholly below the slab's
 * top is slab. The slab and the slips were separate pieces before export, so
 * no vertex is shared across the cut.
 */
function splitSlipsFromSlab(geometry) {
  const positions = geometry.attributes.position;
  const slips = [];
  const slab = [];
  for (let i = 0; i < positions.count; i += 3) {
    const top = Math.max(positions.getY(i), positions.getY(i + 1), positions.getY(i + 2));
    (top <= STUDY_FIREPLACE.hearthTopY + 0.0005 ? slab : slips).push(i);
  }
  const reordered = geometry.clone();
  for (const name of Object.keys(geometry.attributes)) {
    const source = geometry.attributes[name];
    const target = reordered.attributes[name];
    let write = 0;
    for (const start of [...slips, ...slab]) {
      for (let k = 0; k < 3; k++) {
        for (let component = 0; component < source.itemSize; component++) {
          target.array[(write + k) * source.itemSize + component] = source.array[(start + k) * source.itemSize + component];
        }
      }
      write += 3;
    }
    target.needsUpdate = true;
  }
  reordered.clearGroups();
  reordered.addGroup(0, slips.length * 3, 0);
  reordered.addGroup(slips.length * 3, slab.length * 3, 1);
  return reordered;
}

/**
 * Builds the fireplace's new surfaces, its slate apron and its fender. The
 * apron and fender exist from the moment the room is built; dressModel() is
 * run on the GLB when it arrives (before it is added to the room).
 *
 * @param {object} options
 * @param {THREE.Material} options.brassMaterial - the room's aged brass.
 * @returns {{
 *   group: THREE.Group,
 *   fenderBounds: { minX: number, maxX: number, minZ: number, maxZ: number, maxY: number },
 *   dressModel: (model: THREE.Object3D) => void
 * }}
 */
export function createStudyFireplaceDressing({ brassMaterial }) {
  const group = new THREE.Group();
  group.name = 'Fireplace_Hearth_Dressing';

  const tiles = paintSlipTiles(1847);
  const tileMaterial = new THREE.MeshStandardMaterial({
    name: 'Fireplace_Majolica_Slips',
    map: canvasTexture(tiles.colourCanvas),
    normalMap: canvasTexture(tiles.normalCanvas, { isColour: false }),
    roughnessMap: canvasTexture(tiles.roughnessCanvas, { isColour: false }),
    roughness: 1, metalness: 0, envMapIntensity: 0.7,
    // The GLB's own materials are double-sided; keep that, its inner faces rely on it.
    side: THREE.DoubleSide
  });
  tileMaterial.normalScale.set(1.1, 1.1);

  const slate = paintSlate(2203);
  const slateMaterial = new THREE.MeshStandardMaterial({
    name: 'Fireplace_Honed_Slate',
    map: canvasTexture(slate.colourCanvas),
    roughnessMap: canvasTexture(slate.roughnessCanvas, { isColour: false }),
    roughness: 1, metalness: 0, envMapIntensity: 0.45, side: THREE.DoubleSide
  });

  const iron = paintCastIron(3119);
  const ironMaterial = new THREE.MeshStandardMaterial({
    name: 'Fireplace_Cast_Iron',
    map: canvasTexture(iron.colourCanvas),
    roughnessMap: canvasTexture(iron.roughnessCanvas, { isColour: false }),
    roughness: 1, metalness: 0.35, envMapIntensity: 0.55, side: THREE.DoubleSide
  });

  const { tileWidth, tileHeight, hearthTopY } = STUDY_FIREPLACE;
  const tileRepeatU = tileWidth * TILES_PER_TEXTURE;
  const tileRepeatV = tileHeight * TILES_PER_TEXTURE;
  // Grout lines fall on x = 0, +-0.485 (the opening) and +-0.606 (the slips' edge),
  // and on y = 0.092 (the hearth) and 1.002 (the top of the opening).
  const projectTile = (x, y, z, axis) => axis === 'y'
    ? [x / tileRepeatU, z / tileRepeatU]
    : axis === 'x' ? [z / tileRepeatU, (y - hearthTopY) / tileRepeatV] : [x / tileRepeatU, (y - hearthTopY) / tileRepeatV];
  const projectSlate = (x, y, z, axis) => axis === 'y'
    ? [x / SLATE_METRES_PER_REPEAT, z / SLATE_METRES_PER_REPEAT]
    : axis === 'x' ? [z / SLATE_METRES_PER_REPEAT, y / SLATE_METRES_PER_REPEAT] : [x / SLATE_METRES_PER_REPEAT, y / SLATE_METRES_PER_REPEAT];
  const projectIron = (x, y, z, axis) => axis === 'y'
    ? [x / IRON_METRES_PER_REPEAT, z / IRON_METRES_PER_REPEAT]
    : axis === 'x' ? [z / IRON_METRES_PER_REPEAT, y / IRON_METRES_PER_REPEAT] : [x / IRON_METRES_PER_REPEAT, y / IRON_METRES_PER_REPEAT];

  // The apron: one slab of the same slate, laid on the floorboards in front of
  // the hearth. 3.2 cm tall, so no collider: the player steps onto it.
  const apron = STUDY_HEARTH_APRON;
  const apronGeometry = projectFaces(
    new RoundedBoxGeometry(apron.halfWidth * 2, apron.topY, apron.frontZ - apron.backZ, 2, 0.006)
      .translate(0, apron.topY / 2, (apron.frontZ + apron.backZ) / 2),
    projectSlate
  );
  const apronMesh = new THREE.Mesh(apronGeometry, slateMaterial);
  apronMesh.name = 'Fireplace_Slate_Apron';
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  // The fender: an iron kerb on the apron, a brass rail on turned posts, and
  // brass knobs at the corners. Two merged meshes, two draws.
  const { fender } = apron;
  const kerbTop = apron.topY + 0.035;
  const kerbParts = [
    new RoundedBoxGeometry(fender.halfWidth * 2 + 0.04, 0.035, 0.04, 1, 0.006)
      .translate(0, apron.topY + 0.0175, fender.frontZ)
  ];
  const brassParts = [];
  const railLength = fender.halfWidth * 2;
  brassParts.push(new THREE.CylinderGeometry(0.011, 0.011, railLength, 10)
    .rotateZ(Math.PI / 2).translate(0, fender.railY, fender.frontZ));
  for (const side of [-1, 1]) {
    const sideLength = fender.frontZ - apron.backZ;
    kerbParts.push(new RoundedBoxGeometry(0.04, 0.035, sideLength, 1, 0.006)
      .translate(side * fender.halfWidth, apron.topY + 0.0175, apron.backZ + sideLength / 2));
    brassParts.push(new THREE.CylinderGeometry(0.011, 0.011, sideLength - 0.01, 10)
      .rotateX(Math.PI / 2).translate(side * fender.halfWidth, fender.railY, apron.backZ + (sideLength + 0.01) / 2));
    brassParts.push(new THREE.SphereGeometry(0.021, 12, 8).translate(side * fender.halfWidth, fender.railY, fender.frontZ));
    brassParts.push(new THREE.SphereGeometry(0.014, 10, 6).translate(side * fender.halfWidth, fender.railY, apron.backZ + 0.012));
    for (const z of [0.34, 0.46]) {
      brassParts.push(new THREE.CylinderGeometry(0.0045, 0.006, fender.railY - kerbTop, 8)
        .translate(side * fender.halfWidth, (kerbTop + fender.railY) / 2, z));
    }
  }
  const postCount = 11;
  for (let i = 1; i < postCount - 1; i++) {
    const x = -fender.halfWidth + railLength * i / (postCount - 1);
    brassParts.push(new THREE.CylinderGeometry(0.0045, 0.006, fender.railY - kerbTop, 8)
      .translate(x, (kerbTop + fender.railY) / 2, fender.frontZ));
  }
  const kerb = new THREE.Mesh(projectFaces(mergeGeometries(kerbParts), projectIron), ironMaterial);
  kerb.name = 'Fireplace_Fender_Kerb';
  const rail = new THREE.Mesh(mergeGeometries(brassParts), brassMaterial);
  rail.name = 'Fireplace_Fender_Rail';
  for (const part of [kerb, rail]) {
    part.castShadow = false;
    part.receiveShadow = true;
    group.add(part);
  }

  /**
   * Re-surfaces the loaded GLB in place. Its three primitives arrive as three
   * meshes, told apart by their exported material names.
   */
  /**
   * Bakes a GLB part's transform into its (new) geometry and seats it straight
   * under the model root, so its vertices ARE fireplace-local metres -- the
   * frame the tile grid was measured in. (The model has not been added to the
   * room yet, so its matrixWorld is relative to its own root.)
   */
  function seatInModelSpace(mesh, model, geometry, material) {
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    model.add(mesh);
  }

  function dressModel(model) {
    model.updateMatrixWorld(true);
    const parts = [];
    model.traverse((object) => { if (object.isMesh) parts.push(object); });
    for (const mesh of parts) {
      const name = [].concat(mesh.material)[0]?.name.toLowerCase() ?? '';
      if (name.includes('walnut')) {
        // Already the espresso study wood (harmoniseAsset): darker, and waxed.
        const material = mesh.material;
        material.color.multiplyScalar(0.72);
        material.roughness = 0.62;
        material.envMapIntensity = 0.4;
        material.needsUpdate = true;
      } else if (name.includes('limestone')) {
        // A face wholly below the hearth's top is the slab (slate); the rest
        // are slips (tiles). Same rule as splitSlipsFromSlab's draw groups.
        const projected = projectFaces(mesh.geometry, (x, y, z, axis, faceTopY) =>
          faceTopY <= hearthTopY + 0.0005 ? projectSlate(x, y, z, axis) : projectTile(x, y, z, axis),
        mesh.matrixWorld);
        seatInModelSpace(mesh, model, splitSlipsFromSlab(projected), [tileMaterial, slateMaterial]);
      } else if (name.includes('cast iron')) {
        seatInModelSpace(mesh, model, projectFaces(mesh.geometry, projectIron, mesh.matrixWorld), ironMaterial);
      }
    }
  }

  return {
    group,
    /** Fireplace-local: the fender's footprint (studyLevel.js turns it into a collider). */
    fenderBounds: {
      minX: -fender.halfWidth - 0.025, maxX: fender.halfWidth + 0.025,
      minZ: STUDY_FIREPLACE.hearthFrontZ, maxZ: fender.frontZ + 0.025, maxY: fender.railY + 0.03
    },
    dressModel
  };
}
