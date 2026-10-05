/**
 * Validate src/assets/models/okabe.glb without a browser.  `npm run check:okabe`
 *
 * WHY THIS EXISTS, AND WHY IT IS LATE. check-creature.mjs guards creature.glb
 * and nothing guarded this one, so every defect below shipped silently and was
 * found by looking at a screenshot -- which is the slowest and least reliable
 * detector there is. Each rule names the failure that motivated it, and every
 * one of them is a thing that actually happened to this asset:
 *
 *   - Eleven of fourteen materials rendered FLAT WHITE while still being named
 *     after the texture they were missing, because the FBX importer linked a
 *     dead MMD toon ramp to Base Color and the exporter dropped it.
 *   - The hands shipped as 2,778 disconnected triangles, 8,334 vertices
 *     sharing nothing, against a floor of 2,111.
 *   - Every one of the 19,999 triangles went out doubleSided.
 *   - The hair spent a build as alphaMode BLEND, which renders seven thousand
 *     triangles of hair card as a smear.
 *
 * All four are valid glTF. three.js loads them without a warning. That is the
 * whole category this file is for.
 *
 * Zero dependencies, like check-maze.mjs and check-creature.mjs: a GLB is a
 * 12-byte header and length-prefixed chunks.
 *
 * A MISSING okabe.glb is NOT an error -- OkabeCreature.js warns and the level
 * still runs, like every other loadModel() here. A file that is PRESENT and
 * wrong is a hard failure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS = join(HERE, '..', 'src', 'assets', 'models');

/**
 * Both bodies, because they are both shipped and both can break.
 *
 * They are the same mesh, skeleton, morph and UVs -- import_okabe.py writes
 * the clean one before befoul() touches the images -- so every rule applies to
 * both. The ONE difference is which textures carry a cutout: the monster's
 * coat and trousers are torn and need MASK, and the clean body has no tears,
 * so only its hair does. Asserting the monster's list against the clean file
 * would fail it for being undamaged.
 */
const ASSETS = [
  { file: 'okabe.glb', label: 'the monster', mustMask: ['okarin02', 'okarin03', 'okarin06'] },
  { file: 'okabe_clean.glb', label: 'the player', mustMask: ['okarin02'] }
];

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/**
 * Headroom over what the asset currently is, not a wish.
 *
 * As shipped: 19,547 tris, 11,759 verts, 14 primitives, 1,836 KB. These sit
 * about 20% above that, which is enough to absorb a deliberate change and
 * tight enough that the hands regressing to 3x vertices (+6,200) would trip
 * the vertex rule rather than quietly doubling the skinning cost.
 *
 * Higher than creature.glb's 12,000/8,000 on purpose: that one is generated
 * from tables and can be made to any budget, this one is an imported 20,866
 * vertex MMD model and the only lever is how much of it is thrown away.
 */
const MAX_TRIS = 23000;
const MAX_VERTS = 14000;
const MAX_PRIMS = 16;
const MAX_KB = 2600;

/**
 * Share of triangles allowed to render both faces.
 *
 * Currently 57%: the hair, which is alpha-masked cards rather than a solid,
 * plus the lab coat, which is worn open so the viewer genuinely sees its
 * inside. Those two are legitimate. 100% is what force_opaque used to ship by
 * setting use_backface_culling = False on everything, and it costs a full
 * second rasterisation of the body, head and trousers for nothing.
 */
const MAX_TWO_SIDED = 0.65;

/** The human reading is what ships; the monster is a morph on top of it. */
const MIN_HEIGHT = 1.60;
const MAX_HEIGHT = 2.00;

// ---------------------------------------------------------------------------
// GLB
// ---------------------------------------------------------------------------

const MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

function readGlb(buf) {
  const errors = [];
  if (buf.length < 12 || buf.readUInt32LE(0) !== MAGIC) {
    return { json: null, errors: ['not a GLB: wrong magic in the first 4 bytes'] };
  }
  let o = 12;
  let json = null;
  let binLength = 0;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32LE(o);
    const type = buf.readUInt32LE(o + 4);
    if (type === CHUNK_JSON) {
      try {
        json = JSON.parse(buf.toString('utf8', o + 8, o + 8 + len));
      } catch (e) {
        return { json: null, errors: [`JSON chunk does not parse: ${e.message}`] };
      }
    } else {
      binLength += len;
    }
    o += 8 + len;
  }
  if (!json) errors.push('no JSON chunk');
  return { json, binLength, errors };
}

function primitives(g) {
  const out = [];
  for (const [mi, mesh] of (g.meshes ?? []).entries()) {
    for (const [pi, prim] of (mesh.primitives ?? []).entries()) {
      out.push({ prim, label: `${mesh.name ?? 'meshes[' + mi + ']'}#${pi}`, mesh });
    }
  }
  return out;
}

const countOf = (g, i) => (i === undefined ? 0 : (g.accessors?.[i]?.count ?? 0));

const imageNameFor = (g, mat) => {
  const ti = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (ti === undefined) return null;
  const src = g.textures?.[ti]?.source;
  if (src === undefined) return null;
  return g.images?.[src]?.name ?? '';
};

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** Pure, so the self-test below can prove every rule is capable of firing. */
export function validateOkabe(g, { fileBytes = 0, mustMask = ['okarin02'] } = {}) {
  const errors = [];
  const E = (m) => errors.push(m);
  const prims = primitives(g);
  const mats = g.materials ?? [];

  // --- the material naming invariant --------------------------------------
  // THE HIGHEST-VALUE RULE IN THIS FILE, because it compares two independent
  // paths to the same fact. merge_materials() names each merged slot after the
  // image it found on it -- Okabe_03_okarin01 -- so the NAME is a claim about
  // which texture the material carries. If the name says okarin01 and the
  // material has no baseColorTexture, something between the merge and the
  // export lost it. That is exactly the shape of the toon-ramp bug, and it is
  // undetectable from the glTF alone without this cross-check.
  for (const [i, m] of mats.entries()) {
    const name = m.name ?? '';
    const match = /^Okabe_\d\d_(.+)$/.exec(name);
    if (!match) {
      E(`materials[${i}] is named "${name}", which is not the Okabe_NN_<texture> `
        + 'form import_okabe.py writes -- the texture cross-check cannot run on it');
      continue;
    }
    const stem = match[1];
    const img = imageNameFor(g, m);
    if (stem === 'none') {
      if (img !== null) {
        E(`material "${name}" says it has no texture but carries image "${img}"`);
      }
    } else if (img === null) {
      E(`material "${name}" is NAMED for texture "${stem}" but has no baseColorTexture `
        + '-- the texture was lost between the material merge and the export');
    } else if (!img.startsWith(stem)) {
      E(`material "${name}" is named for "${stem}" but carries image "${img}"`);
    }
  }

  // --- images actually contain something ----------------------------------
  // A 0x0 MMD toon ramp is what started all of this: it loads, it is a valid
  // image datablock, and it exports as nothing at all.
  for (const [i, im] of (g.images ?? []).entries()) {
    const bv = g.bufferViews?.[im.bufferView];
    if (im.bufferView === undefined || !bv || !bv.byteLength) {
      E(`images[${i}] "${im.name ?? '?'}" has no data -- an empty texture renders white`);
    }
    if (im.mimeType && !/^image\/(png|jpeg)$/.test(im.mimeType)) {
      E(`images[${i}] is ${im.mimeType}, which browsers will not load`);
    }
  }

  // --- welding ------------------------------------------------------------
  // verts === 3 * tris means not one triangle shares a vertex with its
  // neighbour. That is what okarin07 shipped as, and it costs 3x the vertex
  // memory and 3x the skinning for identical pixels.
  for (const { prim, label } of prims) {
    const tris = countOf(g, prim.indices) / 3;
    const verts = countOf(g, prim.attributes?.POSITION);
    if (tris >= 50 && verts === tris * 3) {
      E(`${label} has ${verts} vertices for ${tris} triangles -- exactly 3x, so it is `
        + 'fully unwelded and nothing shares a vertex. weld_source() did not run on it');
    }
  }

  // --- backface culling ----------------------------------------------------
  let tris = 0;
  let twoSidedTris = 0;
  for (const { prim } of prims) {
    const t = countOf(g, prim.indices) / 3;
    tris += t;
    if (mats[prim.material]?.doubleSided) twoSidedTris += t;
  }
  if (tris && twoSidedTris / tris > MAX_TWO_SIDED) {
    E(`${Math.round(100 * twoSidedTris / tris)}% of triangles are doubleSided, over the `
      + `${Math.round(100 * MAX_TWO_SIDED)}% budget -- every closed surface is paying to `
      + 'rasterise its own inside');
  }

  // --- alpha ---------------------------------------------------------------
  for (const m of mats) {
    if (m.alphaMode === 'BLEND') {
      E(`material "${m.name ?? '?'}" is alphaMode BLEND, which does not write depth: `
        + 'transparent objects sort per OBJECT, so it will render behind or in front of '
        + 'the rest of the body at random. Use MASK');
    }
  }
  for (const stem of mustMask) {
    const hits = mats.filter((m) => (m.name ?? '').includes(stem));
    if (hits.length && !hits.some((m) => m.alphaMode === 'MASK')) {
      E(`no material for "${stem}" is alphaMode MASK -- its cutout (hair cards, or the `
        + 'tears befoul() punches into the cloth) will not appear at all');
    }
  }

  // --- skinning ------------------------------------------------------------
  if ((g.skins ?? []).length !== 1) {
    E(`expected exactly 1 skin, found ${(g.skins ?? []).length}`);
  }
  for (const { prim, label } of prims) {
    if (prim.attributes?.JOINTS_0 === undefined) {
      E(`${label} has no JOINTS_0, so it will not follow the skeleton`);
    }
    if (prim.attributes?.JOINTS_1 !== undefined) {
      E(`${label} has JOINTS_1: more than 4 influences per vertex. three.js normalises `
        + 'them away, so this renders as a subtly melted mesh rather than an error');
    }
    if (prim.attributes?.TEXCOORD_0 === undefined) {
      E(`${label} has no TEXCOORD_0, so its texture cannot be applied`);
    }
    if (prim.attributes?.NORMAL === undefined) {
      E(`${label} has no NORMAL, so it will be flat-shaded`);
    }
    if (prim.attributes?.COLOR_0 !== undefined) {
      E(`${label} has COLOR_0, which the exporter fabricates and which multiplies `
        + 'the base colour by something nobody authored');
    }
  }
  for (const [i, j] of ((g.skins?.[0]?.joints) ?? []).entries()) {
    if ((g.nodes?.[j]?.name ?? '') === 'neutral_bone') {
      E(`skins[0].joints[${i}] is "neutral_bone", which the exporter injects for `
        + 'unweighted vertices -- there is stray geometry nothing is painted to');
    }
  }

  // --- the morph -----------------------------------------------------------
  for (const { prim, label, mesh } of prims) {
    const n = (prim.targets ?? []).length;
    if (n !== 1) {
      E(`${label} has ${n} morph targets, expected exactly 1 (Monster)`);
    }
    const names = mesh.extras?.targetNames;
    if (!Array.isArray(names) || names[0] !== 'Monster') {
      E(`${label}'s mesh has no extras.targetNames == ["Monster"] -- glTF has no `
        + 'first-class name for a morph target, so morphTargetDictionary degrades to '
        + '{"0":0} and setCorrection stops finding it by name');
    }
  }

  // --- budget --------------------------------------------------------------
  const verts = prims.reduce((a, { prim }) => a + countOf(g, prim.attributes?.POSITION), 0);
  if (tris > MAX_TRIS) E(`${tris} triangles, over the ${MAX_TRIS} budget`);
  if (verts > MAX_VERTS) E(`${verts} vertices, over the ${MAX_VERTS} budget`);
  if (prims.length > MAX_PRIMS) {
    E(`${prims.length} primitives, over the ${MAX_PRIMS} budget -- one draw call each`);
  }
  if (fileBytes > MAX_KB * 1024) {
    E(`${Math.round(fileBytes / 1024)} KB, over the ${MAX_KB} KB budget`);
  }

  // --- orientation ---------------------------------------------------------
  const pos = prims.length ? g.accessors?.[prims[0].prim.attributes?.POSITION] : null;
  if (pos?.min && pos?.max) {
    const size = [0, 1, 2].map((i) => pos.max[i] - pos.min[i]);
    if (size[1] < size[0] || size[1] < size[2]) {
      E(`bounding box ${size.map((v) => v.toFixed(2)).join(' x ')} is not tallest in +Y `
        + '-- exported without export_yup, so it will lie on its side');
    }
  }
  const allMax = prims.map(({ prim }) => g.accessors?.[prim.attributes?.POSITION]?.max?.[1])
    .filter((v) => typeof v === 'number');
  const allMin = prims.map(({ prim }) => g.accessors?.[prim.attributes?.POSITION]?.min?.[1])
    .filter((v) => typeof v === 'number');
  if (allMax.length && allMin.length) {
    const h = Math.max(...allMax) - Math.min(...allMin);
    if (h < MIN_HEIGHT || h > MAX_HEIGHT) {
      E(`stands ${h.toFixed(2)} m, outside ${MIN_HEIGHT}-${MAX_HEIGHT} m. The GLB ships `
        + 'the HUMAN reading; the monster is a morph on top of it');
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Self-test: every rule above proved capable of going red
// ---------------------------------------------------------------------------

function fixture() {
  const accessor = (count, extra = {}) => ({ count, ...extra });
  return {
    asset: { generator: 'Khronos glTF Blender I/O v5.2.39' },
    // One image PER material that claims one. Pointing them all at a single
    // texture made the baseline fail its own naming rule, which the self-test
    // caught before any case below could mean anything -- which is the entire
    // reason it checks the clean fixture first.
    images: [
      { name: 'okarin03_befouled', mimeType: 'image/png', bufferView: 0 },
      { name: 'okarin02_befouled', mimeType: 'image/png', bufferView: 0 },
      { name: 'okarin06_befouled', mimeType: 'image/png', bufferView: 0 }
    ],
    bufferViews: [{ byteLength: 1024 }],
    textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
    materials: [
      {
        name: 'Okabe_00_okarin03',
        alphaMode: 'MASK',
        doubleSided: true,
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
      },
      { name: 'Okabe_01_none', alphaMode: 'OPAQUE' },
      {
        name: 'Okabe_02_okarin02',
        alphaMode: 'MASK',
        pbrMetallicRoughness: { baseColorTexture: { index: 1 } }
      },
      {
        name: 'Okabe_03_okarin06',
        alphaMode: 'MASK',
        pbrMetallicRoughness: { baseColorTexture: { index: 2 } }
      }
    ],
    skins: [{ joints: [0, 1] }],
    nodes: [{ name: 'Hips' }, { name: 'Spine' }],
    meshes: [{
      name: 'okabe_mesh',
      extras: { targetNames: ['Monster'] },
      primitives: [0, 1, 2, 3].map((m) => ({
        material: m,
        indices: 1,
        attributes: { POSITION: 0, NORMAL: 2, TEXCOORD_0: 3, JOINTS_0: 4, WEIGHTS_0: 5 },
        targets: [{ POSITION: 6 }]
      }))
    }],
    accessors: [
      accessor(2000, { min: [-0.45, 0, -0.25], max: [0.45, 1.85, 0.25] }),
      accessor(9000),            // 3000 triangles
      accessor(2000), accessor(2000), accessor(2000), accessor(2000), accessor(2000)
    ]
  };
}

const CASES = [
  {
    name: 'a material named for a texture it does not carry',
    break: (g) => { delete g.materials[0].pbrMetallicRoughness; },
    expect: /is NAMED for texture "okarin03" but has no baseColorTexture/
  },
  {
    name: 'a material carrying the wrong texture for its name',
    break: (g) => { g.images[0].name = 'okarin05_befouled'; },
    expect: /named for "okarin03" but carries image "okarin05_befouled"/
  },
  {
    name: 'an image with no data, like an MMD toon ramp',
    break: (g) => { g.bufferViews[0].byteLength = 0; },
    expect: /has no data -- an empty texture renders white/
  },
  {
    name: 'a fully unwelded primitive, 3 vertices per triangle',
    break: (g) => { g.accessors[0].count = 9000; },
    expect: /fully unwelded and nothing shares a vertex/
  },
  {
    name: 'everything shipped doubleSided',
    break: (g) => { for (const m of g.materials) m.doubleSided = true; },
    expect: /doubleSided, over the/
  },
  {
    name: 'hair left on alphaMode BLEND, which renders as a smear',
    break: (g) => { g.materials[2].alphaMode = 'BLEND'; },
    expect: /alphaMode BLEND, which does not write depth/
  },
  {
    name: 'a cutout material left OPAQUE, so the tears never appear',
    break: (g) => { g.materials[3].alphaMode = 'OPAQUE'; },
    expect: /no material for "okarin06" is alphaMode MASK/
  },
  {
    name: 'a second skin, which means two skeletons in one file',
    break: (g) => { g.skins.push({ joints: [0] }); },
    expect: /exactly 1 skin/
  },
  {
    name: 'more than four influences per vertex',
    break: (g) => { g.meshes[0].primitives[0].attributes.JOINTS_1 = 4; },
    expect: /subtly melted mesh/
  },
  {
    name: 'a mesh that is not skinned at all',
    break: (g) => { delete g.meshes[0].primitives[0].attributes.JOINTS_0; },
    expect: /will not follow the skeleton/
  },
  {
    name: 'a missing TEXCOORD_0, so the texture cannot be applied',
    break: (g) => { delete g.meshes[0].primitives[1].attributes.TEXCOORD_0; },
    expect: /no TEXCOORD_0/
  },
  {
    name: 'COLOR_0, which the exporter fabricates',
    break: (g) => { g.meshes[0].primitives[0].attributes.COLOR_0 = 7; },
    expect: /has COLOR_0/
  },
  {
    name: 'the morph target name lost in export',
    break: (g) => { delete g.meshes[0].extras; },
    expect: /extras.targetNames/
  },
  {
    name: 'the facial expression keys left in, all thirty of them',
    break: (g) => { g.meshes[0].primitives[0].targets = new Array(31).fill({ POSITION: 6 }); },
    expect: /31 morph targets, expected exactly 1/
  },
  {
    name: 'a neutral_bone, meaning stray unweighted geometry',
    break: (g) => { g.nodes[1].name = 'neutral_bone'; },
    expect: /neutral_bone/
  },
  {
    name: 'a triangle budget overrun',
    break: (g) => { g.accessors[1].count = MAX_TRIS * 3 + 300; },
    expect: /triangles, over the/
  },
  {
    name: 'a vertex budget overrun',
    break: (g) => { g.accessors[0].count = MAX_VERTS + 100; },
    expect: /vertices, over the/
  },
  {
    name: 'a file size overrun',
    break: () => {},
    bytes: (MAX_KB + 50) * 1024,
    expect: /KB, over the/
  },
  {
    name: 'a model exported on its side (export_yup=False)',
    break: (g) => { g.accessors[0].min = [-0.9, -0.2, 0]; g.accessors[0].max = [0.9, 0.2, 1.8]; },
    expect: /not tallest in \+Y/
  },
  {
    name: 'the monster reading shipped as the base mesh',
    break: (g) => { g.accessors[0].max = [0.45, 2.21, 0.25]; },
    expect: /outside 1\.6-2 m/
  }
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let errors = 0;
for (const asset of ASSETS) {
  const path = join(MODELS, asset.file);
  console.log(`--- ${asset.file} (${asset.label}) `.padEnd(66, '-'));
  if (!existsSync(path)) {
    console.log(`  skipped  ${asset.file} is absent; OkabeCreature.js warns and the level runs`);
    continue;
  }
  const buf = readFileSync(path);
  const { json, errors: structural } = readGlb(buf);
  const faults = structural.length || !json
    ? structural
    : validateOkabe(json, { fileBytes: buf.length, mustMask: asset.mustMask });
  if (faults.length) {
    errors += faults.length;
    for (const f of faults) console.log(`  FAULT    ${f}`);
  } else {
    const prims = primitives(json);
    const tris = prims.reduce((a, { prim }) => a + countOf(json, prim.indices) / 3, 0);
    const verts = prims.reduce((a, { prim }) => a + countOf(json, prim.attributes?.POSITION), 0);
    console.log(`  ok       ${prims.length} primitives, ${tris} tris, ${verts} verts, `
      + `${(json.images ?? []).length} textures, ${Math.round(buf.length / 1024)} KB`);
  }
}

let broken = 0;
console.log('\n--- validator self-test ------------------------------------------');
const baseline = validateOkabe(fixture(), { fileBytes: 1000, mustMask: ['okarin02', 'okarin03', 'okarin06'] });
if (baseline.length) {
  broken++;
  console.log('  MISSED   the clean fixture does not pass, so no case below means anything');
  for (const e of baseline) console.log(`           - ${e}`);
}
for (const c of CASES) {
  const g = fixture();
  c.break(g);
  const got = validateOkabe(g, { fileBytes: c.bytes ?? 1000, mustMask: ['okarin02', 'okarin03', 'okarin06'] });
  if (got.find((e) => c.expect.test(e))) {
    console.log(`  caught   ${c.name}`);
  } else {
    broken++;
    console.log(`  MISSED   ${c.name}`);
    console.log(`           expected /${c.expect.source}/`);
    console.log(`           got ${got.length
      ? got.slice(0, 3).map((e) => '\n             - ' + e).join('') : '(no errors at all)'}`);
  }
}
console.log(broken
  ? `\n${broken} rule(s) the validator claims to check but does not.`
  : `all ${CASES.length} faults are caught and named.`);

process.exit(errors + broken);
