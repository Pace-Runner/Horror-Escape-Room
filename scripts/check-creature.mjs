/**
 * Validate src/assets/models/creature.glb without a browser.  `npm run check:creature`
 *
 * This exists for the same reason scripts/check-maze.mjs does: the creature is
 * the one asset in this project that can be wrong in ways nothing reports. A
 * malformed maze fails a playthrough; a malformed character just renders
 * slightly incorrectly forever. Each rule below names the failure that
 * motivated it, but they all have the same shape -- the glTF is VALID, three.js
 * loads it without a warning, and the result is subtly wrong in a dark room
 * where nobody can see it well enough to be sure.
 *
 * Like check-maze.mjs this runs in plain node with zero dependencies. A GLB is
 * a 12-byte header followed by length-prefixed chunks, so getting the JSON out
 * of one is about twenty lines and needs no glTF library.
 *
 * A MISSING creature.glb is NOT an error. src/systems/Creature.js keeps the
 * procedural rig as a fallback and the game runs without the asset, exactly
 * like every other loadModel() call in this repo degrades. So an absent file
 * skips the asset rules and still runs the self-test. A file that is PRESENT
 * and wrong is a hard failure, because that is the case the fallback cannot
 * save you from.
 *
 * Exit code is non-zero on any fault, so it gates the build in CI.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GLB_PATH = join(HERE, '..', 'src', 'assets', 'models', 'creature.glb');

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/**
 * Every number here is checkable against something already shipped, so none is
 * a guess: flashlight.glb is 4,568 tris / 300 KB and bed.glb is 6,584, and both
 * are props you walk past. hands.glb spends 2,366 verts on a pair of hands
 * rendered 30 cm from the lens.
 *
 * The creature is seen at 5-15 m through FogExp2, and for most of its screen
 * time setSilhouette(true) has multiplied every material colour by
 * SILHOUETTE_DIM -- 0.18, so it is a dark shape with an outline rather than a
 * lit body. Detail spent there is detail nobody sees. (That figure was 0.05
 * when this budget was set, and raising it does not loosen the argument: at
 * 0.18 the coat still renders around 8:1 darker than the wallpaper behind it.)
 */
// RAISED from 5,000/3,500 when the art direction moved from PS1-era low-poly
// to a PS2/PS3 target. The old numbers were not wrong for what they were set
// against -- they were chosen to sit alongside flashlight.glb's 4,568 -- but a
// character carrying a readable face needs radial density a prop does not: at
// 16 segments there were about five vertices across the whole face, which
// cannot hold a brow, two sockets and a nose however hard they are displaced.
const MAX_TRIS = 12000;
const MAX_VERTS = 8000;
/** One draw call each. Five materials is the art brief; see EXPECTED_MATERIALS. */
const MAX_PRIMS = 5;
/**
 * A skinned vertex costs 52 bytes (POSITION 12 + NORMAL 12 + TEXCOORD_0 8 +
 * JOINTS_0 4 + WEIGHTS_0 16), indices 6 per triangle, inverse bind matrices 64
 * per joint. At the budget above with one sparse position-only morph that is
 * roughly 550 KB, so 700 KB is headroom rather than a target. Worth knowing:
 * skinned data is the LEAST compressible thing in this repo -- hands.glb gzips
 * only 1.73x where dresser.glb manages 8.35x -- because JOINTS_0/WEIGHTS_0 are
 * high-entropy and defeat DEFLATE.
 */
const MAX_BYTES = 700 * 1024;
/** Hand-authored armature, not Rigify, whose stock human rig generates ~500. */
const MAX_JOINTS = 30;
const MAX_MORPHS = 1;

/**
 * Bound by the art brief AND by src/world/textures.js, which binds canvas
 * textures to this asset BY MATERIAL NAME through applyTextureByMaterialName().
 * A typo on either side is silent -- the mesh simply never receives its map.
 * So this is an equality check, not a subset check: a name here that the JS
 * does not bind is as much a bug as a name the JS binds that is not here.
 */
const EXPECTED_MATERIALS = [
  'CreatureSkin',
  'CreatureCoat',
  'CreatureShirt',
  'CreatureTrousers',
  'CreatureHair'
];

/** The shape key name. Must match what Creature.js looks up in morphTargetDictionary. */
const EXPECTED_MORPH = 'Hollow';

/**
 * Empty on purpose. Neither GLTFLoader in this project registers a decoder
 * (src/world/modelLoader.js and src/systems/hands/hand-mesh.js), so ANY
 * compression extension here is a file that cannot load. If meshopt is adopted
 * later this becomes ['EXT_meshopt_compression'] -- and note three r169
 * supports only the EXT_ spelling, never KHR_meshopt_compression.
 */
const ALLOWED_EXTENSIONS = [];

/** Annabelle is 1.68 m. Outside this is an export in the wrong units or on its side. */
const MIN_HEIGHT_M = 1.5;
const MAX_HEIGHT_M = 2.0;

// ---------------------------------------------------------------------------
// GLB container
// ---------------------------------------------------------------------------

const MAGIC_GLTF = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/**
 * Pull the JSON chunk out of a GLB. Returns { json, binLength, errors } so a
 * container fault reports as an error rather than throwing -- a stack trace
 * tells you the file is broken but not which way.
 */
export function parseGlb(buf) {
  const errors = [];
  const fail = (m) => (errors.push(m), { json: null, binLength: 0, errors });

  if (buf.length < 12) return fail(`file is ${buf.length} bytes, too short to be a GLB`);
  if (buf.readUInt32LE(0) !== MAGIC_GLTF) return fail('not a GLB: magic is not glTF');
  const version = buf.readUInt32LE(4);
  if (version !== 2) return fail(`GLB container version is ${version}, expected 2`);

  const declared = buf.readUInt32LE(8);
  if (declared !== buf.length) {
    errors.push(`header says ${declared} bytes but the file is ${buf.length} -- truncated or padded`);
  }

  let offset = 12;
  const chunks = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + len > buf.length) {
      errors.push(`chunk at byte ${offset} claims ${len} bytes but the file ends first`);
      break;
    }
    chunks.push({ type, len, start });
    offset = start + len;
  }

  if (chunks.length !== 2) {
    errors.push(`expected exactly 2 chunks (JSON then BIN), found ${chunks.length}`);
  }
  if (!chunks.length || chunks[0].type !== CHUNK_JSON) {
    return fail('first chunk is not JSON');
  }
  if (chunks[1] && chunks[1].type !== CHUNK_BIN) {
    errors.push('second chunk is not BIN');
  }

  let json;
  try {
    json = JSON.parse(buf.toString('utf8', chunks[0].start, chunks[0].start + chunks[0].len));
  } catch (e) {
    return fail(`JSON chunk does not parse: ${e.message}`);
  }

  return { json, binLength: chunks[1] ? chunks[1].len : 0, errors };
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** Every primitive in the file, flattened, tagged with its mesh for messages. */
function primitives(g) {
  const out = [];
  for (const [mi, mesh] of (g.meshes ?? []).entries()) {
    for (const [pi, prim] of (mesh.primitives ?? []).entries()) {
      out.push({ prim, mesh, label: `${mesh.name ?? 'meshes[' + mi + ']'}#${pi}` });
    }
  }
  return out;
}

const countOf = (g, i) => (i === undefined ? 0 : (g.accessors?.[i]?.count ?? 0));

/**
 * Pure, so the self-test below can feed it synthetic glTF and prove every rule
 * is capable of firing. Mirrors validateMaze()'s contract in check-maze.mjs.
 */
export function validateCreature(g, { fileBytes = 0 } = {}) {
  const errors = [];
  const E = (m) => errors.push(m);
  const prims = primitives(g);

  // --- provenance ---------------------------------------------------------
  const generator = g.asset?.generator ?? '';
  if (!generator.startsWith('Khronos glTF Blender I/O')) {
    E(`asset.generator is "${generator}" -- this did not come from blender/build_creature.py`);
  }

  // --- the repo's zero-image invariant ------------------------------------
  // There is not a single .png/.jpg anywhere in this repo; every texture is
  // generated on a canvas at runtime by src/world/textures.js. An embedded
  // image would not break anything visibly -- it would silently ship a baked
  // map that the runtime texture then overwrites, for free bytes.
  if (g.images?.length) E(`${g.images.length} embedded image(s) -- this repo ships zero image files`);
  if ((g.buffers ?? []).length !== 1) E(`expected exactly 1 buffer, found ${(g.buffers ?? []).length}`);
  for (const [i, b] of (g.buffers ?? []).entries()) {
    if (b.uri) E(`buffers[${i}] has a uri -- must be GLB-embedded, not a sidecar .bin`);
  }
  for (const i of (g.textures ?? []).keys()) {
    E(`textures[${i}] present -- textures are bound at runtime by material name`);
  }

  // --- extensions ---------------------------------------------------------
  for (const kind of ['extensionsUsed', 'extensionsRequired']) {
    for (const ext of g[kind] ?? []) {
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        E(`${kind} contains ${ext}, and no decoder is registered for it in either GLTFLoader`);
      }
    }
  }

  // --- budget -------------------------------------------------------------
  let tris = 0;
  let verts = 0;
  for (const { prim, label } of prims) {
    if (prim.indices === undefined) {
      E(`${label} is non-indexed, which wastes roughly 3x the vertex data`);
    } else {
      tris += countOf(g, prim.indices) / 3;
    }
    verts += countOf(g, prim.attributes?.POSITION);
  }
  if (tris > MAX_TRIS) E(`${tris} triangles, over the ${MAX_TRIS} budget`);
  if (verts > MAX_VERTS) E(`${verts} vertices, over the ${MAX_VERTS} budget`);
  if (prims.length > MAX_PRIMS) E(`${prims.length} primitives, over the ${MAX_PRIMS} draw-call budget`);
  if (fileBytes > MAX_BYTES) {
    E(`${(fileBytes / 1024).toFixed(0)} KB, over the ${MAX_BYTES / 1024} KB budget`);
  }

  // --- skinning -----------------------------------------------------------
  const skins = g.skins ?? [];
  if (skins.length !== 1) E(`expected exactly 1 skin, found ${skins.length}`);
  for (const [i, skin] of skins.entries()) {
    const joints = skin.joints ?? [];
    if (joints.length > MAX_JOINTS) E(`skin ${i} has ${joints.length} joints, over the ${MAX_JOINTS} budget`);
    // The exporter appends a synthetic joint literally named neutral_bone for
    // any vertex carrying no vertex-group weight above 0.0001. Its presence is
    // a free "you left stray geometry unweighted" detector, and that geometry
    // would deform as if welded to the origin.
    for (const ji of joints) {
      if (g.nodes?.[ji]?.name === 'neutral_bone') {
        E('joint neutral_bone present -- some vertices carry no weight at all');
      }
    }
    const ibm = countOf(g, skin.inverseBindMatrices);
    if (skin.inverseBindMatrices !== undefined && ibm !== joints.length) {
      E(`skin ${i} has ${joints.length} joints but ${ibm} inverse bind matrices`);
    }
  }

  for (const { prim, label } of prims) {
    const a = prim.attributes ?? {};
    if (a.JOINTS_0 === undefined || a.WEIGHTS_0 === undefined) {
      E(`${label} is missing JOINTS_0/WEIGHTS_0 -- it will not follow the skeleton`);
    }
    // three r169's GLTFLoader ATTRIBUTES table contains only JOINTS_0 and
    // WEIGHTS_0. A second influence set loads as an inert attribute and is
    // silently ignored, then normalizeSkinWeights() rescales the four that did
    // survive -- so the mesh stays intact and deforms WRONGLY at every
    // multi-bone region. No warning, no error, just a subtly melted shoulder.
    if (a.JOINTS_1 !== undefined || a.WEIGHTS_1 !== undefined) {
      E(`${label} has JOINTS_1/WEIGHTS_1 -- more than 4 influences; export with export_all_influences=False`);
    }
    if (a.TEXCOORD_0 === undefined) {
      E(`${label} has no TEXCOORD_0 -- every canvas texture bound to it is a no-op`);
    }
    if (a.NORMAL === undefined) {
      E(`${label} has no NORMAL, so GLTFLoader will force flatShading on it`);
    }
    // export_all_vertex_colors defaults to TRUE in Blender 5.2 and fabricates a
    // COLOR_0 from any stray colour attribute. GLTFLoader then clones the
    // material with vertexColors enabled and multiplies the albedo by it --
    // which under a torch in a dark room reads as blotchy tinting rather than
    // as an obvious bug.
    if (a.COLOR_0 !== undefined) {
      E(`${label} has COLOR_0 -- export with export_vertex_color NONE`);
    }
  }

  // --- morph targets ------------------------------------------------------
  for (const { prim, mesh, label } of prims) {
    const targets = prim.targets ?? [];
    if (targets.length > MAX_MORPHS) {
      E(`${label} has ${targets.length} morph targets, over the ${MAX_MORPHS} budget`);
    }
    if (!targets.length) continue;
    // glTF has no first-class name for a morph target. Shape key names survive
    // ONLY via mesh.extras.targetNames, and GLTFLoader rebuilds
    // morphTargetDictionary from it only when the lengths match -- otherwise it
    // warns once and the dictionary degrades to a numeric one. Creature.js
    // looks the key up BY NAME, so a missing array silently breaks the twist.
    const names = mesh.extras?.targetNames;
    if (!Array.isArray(names)) {
      E(`${label} has morph targets but no extras.targetNames -- morphTargetDictionary will be numeric`);
    } else if (names.length !== targets.length) {
      E(`${label} has ${targets.length} targets but ${names.length} extras.targetNames; GLTFLoader will ignore the names`);
    } else if (!names.includes(EXPECTED_MORPH)) {
      E(`${label} targetNames are [${names.join(', ')}] -- expected one named ${EXPECTED_MORPH}`);
    }
  }

  // --- materials ----------------------------------------------------------
  const names = (g.materials ?? []).map((m) => m.name ?? '(unnamed)');
  for (const n of names) {
    // hands.glb already ships basicRigSkin AND basicRigSkin.001, so
    // applyTextureByMaterialName(root, 'basicRigSkin') textures one primitive
    // and silently skips the other. Blender's duplicate suffix round-trips
    // verbatim into the GLB; three never strips it.
    if (/\.\d{3}$/.test(n)) {
      E(`material ${n} carries Blender's duplicate suffix -- it will not match by name`);
    }
  }
  const missing = EXPECTED_MATERIALS.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !EXPECTED_MATERIALS.includes(n));
  if (missing.length) E(`missing material(s): ${missing.join(', ')}`);
  if (extra.length) E(`unexpected material(s): ${extra.join(', ')} -- nothing binds a texture to these`);

  // --- orientation --------------------------------------------------------
  // A model exported with export_yup=False lies on its side, and that is not
  // obvious in a screenshot of a dark figure.
  const withBounds = prims
    .map(({ prim }) => g.accessors?.[prim.attributes?.POSITION])
    .filter((a) => a && Array.isArray(a.min) && Array.isArray(a.max));
  if (withBounds.length) {
    const lo = [0, 1, 2].map((i) => Math.min(...withBounds.map((a) => a.min[i])));
    const hi = [0, 1, 2].map((i) => Math.max(...withBounds.map((a) => a.max[i])));
    const [dx, dy, dz] = [0, 1, 2].map((i) => hi[i] - lo[i]);
    if (dy < dx || dy < dz) {
      E(`bounding box is ${dx.toFixed(2)} x ${dy.toFixed(2)} x ${dz.toFixed(2)} -- not tallest in +Y, check export_yup`);
    } else if (dy < MIN_HEIGHT_M || dy > MAX_HEIGHT_M) {
      E(`stands ${dy.toFixed(2)} m tall, outside ${MIN_HEIGHT_M}-${MAX_HEIGHT_M} m (Annabelle is 1.68)`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function reportCreature(path = GLB_PATH) {
  if (!existsSync(path)) {
    console.log('creature.glb is not built yet -- Creature.js falls back to the procedural');
    console.log('rig, so this is not a failure. The asset rules go unchecked until it lands.');
    return 0;
  }

  const buf = readFileSync(path);
  const { json, errors: containerErrors } = parseGlb(buf);
  const errors = [...containerErrors];
  if (json) errors.push(...validateCreature(json, { fileBytes: buf.length }));

  console.log(`creature.glb  ${(buf.length / 1024).toFixed(1)} KB`);
  if (json) {
    const prims = primitives(json);
    const tris = prims.reduce((n, { prim }) => n + countOf(json, prim.indices) / 3, 0);
    const verts = prims.reduce((n, { prim }) => n + countOf(json, prim.attributes?.POSITION), 0);
    const targets = Math.max(0, ...prims.map(({ prim }) => (prim.targets ?? []).length));
    // Printed even on success: the morph's byte cost is the line item most
    // likely to drift. Counted per accessor rather than reported as one word,
    // because "sparse" as a yes/no was actively misleading -- one sparse
    // target out of five read as though the whole morph were cheap. The
    // exporter picks per primitive and dense is genuinely smaller when most of
    // a primitive's vertices move, so a mix is the expected healthy answer.
    let sparseN = 0;
    let denseN = 0;
    for (const { prim } of prims) {
      for (const t of prim.targets ?? []) {
        for (const i of Object.values(t)) {
          if (json.accessors?.[i]?.sparse) sparseN++;
          else denseN++;
        }
      }
    }
    console.log(
      `  ${tris} tris, ${verts} verts, ${prims.length} prims, ` +
      `${json.skins?.[0]?.joints?.length ?? 0} joints, ${targets} morph target(s)` +
      (targets ? ` (${sparseN} sparse / ${denseN} dense accessors)` : '')
    );
  }

  for (const e of errors) console.log(`  ERROR  ${e}`);
  if (!errors.length) console.log('  ok');
  return errors.length;
}

const errors = reportCreature();

/**
 * SELF-TEST: prove the validator can still say no.
 *
 * Same contract as check-maze.mjs: a green check is worth nothing unless it is
 * capable of going red. Each case takes a fixture that PASSES, breaks it one
 * specific way, and asserts the report NAMES that fault -- matching on the
 * message, because "something is wrong with your character" is only useful if
 * it says which rule caught it.
 *
 * These run against synthetic glTF JSON rather than real GLBs, for the same
 * reason check-maze.mjs mutates a copy of LEGS: the rules are the thing under
 * test, not the container parser.
 */
function fixture() {
  return {
    asset: { generator: 'Khronos glTF Blender I/O v5.2.39' },
    buffers: [{ byteLength: 1000 }],
    accessors: [
      { count: 3000, min: [-0.3, 0, -0.2], max: [0.3, 1.68, 0.2] }, // 0 POSITION
      { count: 12000 },                                             // 1 indices
      { count: 25 }                                                 // 2 inverse bind matrices
    ],
    nodes: [{ name: 'root' }],
    skins: [{ joints: Array.from({ length: 25 }, () => 0), inverseBindMatrices: 2 }],
    meshes: [{
      name: 'creature',
      extras: { targetNames: ['Hollow'] },
      primitives: [{
        indices: 1,
        attributes: { POSITION: 0, NORMAL: 0, TEXCOORD_0: 0, JOINTS_0: 0, WEIGHTS_0: 0 },
        targets: [{ POSITION: 0 }]
      }]
    }],
    materials: EXPECTED_MATERIALS.map((name) => ({ name }))
  };
}

const CASES = [
  {
    name: 'more than 4 bone influences (the melted-shoulder failure)',
    break: (g) => { g.meshes[0].primitives[0].attributes.JOINTS_1 = 0; },
    expect: /JOINTS_1|more than 4 influences/
  },
  {
    name: 'unweighted geometry, which the exporter names neutral_bone',
    break: (g) => { g.nodes.push({ name: 'neutral_bone' }); g.skins[0].joints.push(1); },
    expect: /neutral_bone/
  },
  {
    name: "Blender's duplicate-material suffix, which breaks name binding",
    break: (g) => { g.materials[0].name = 'CreatureSkin.001'; },
    expect: /duplicate suffix/
  },
  {
    name: 'a mesh with no UVs, so every canvas texture silently does nothing',
    break: (g) => { delete g.meshes[0].primitives[0].attributes.TEXCOORD_0; },
    expect: /no TEXCOORD_0/
  },
  {
    name: 'a fabricated COLOR_0 tinting the albedo',
    break: (g) => { g.meshes[0].primitives[0].attributes.COLOR_0 = 0; },
    expect: /COLOR_0/
  },
  {
    name: 'a compression extension no loader in this project can decode',
    break: (g) => { g.extensionsRequired = ['KHR_draco_mesh_compression']; },
    expect: /no decoder is registered/
  },
  {
    name: 'the shape key name lost, degrading morphTargetDictionary to numeric',
    break: (g) => { delete g.meshes[0].extras; },
    expect: /extras\.targetNames/
  },
  {
    name: 'a model exported on its side (export_yup=False)',
    break: (g) => { g.accessors[0] = { count: 3000, min: [-0.3, -0.2, 0], max: [0.3, 0.2, 1.68] }; },
    expect: /not tallest in \+Y/
  },
  {
    name: 'an embedded image, against the repo zero-image rule',
    break: (g) => { g.images = [{ mimeType: 'image/png', bufferView: 0 }]; },
    expect: /embedded image/
  },
  {
    name: 'a triangle budget overrun',
    // 60000 indices = 20000 triangles. It has to be stated against MAX_TRIS
    // rather than as a bare number: this case was written as 30000 when the
    // budget was 5000, and when the budget was raised to 12000 the case
    // quietly stopped failing -- 10000 triangles is under it. The self-test
    // caught that, which is the entire reason the self-test exists, but only
    // because it asserts each rule is CAPABLE of going red.
    break: (g) => { g.accessors[1] = { count: MAX_TRIS * 6 }; },
    expect: /triangles, over the/
  },
  {
    name: 'a second skin, which means two skeletons in one file',
    break: (g) => { g.skins.push({ joints: [0] }); },
    expect: /exactly 1 skin/
  },
  {
    name: 'a mesh that is not skinned at all',
    break: (g) => { delete g.meshes[0].primitives[0].attributes.JOINTS_0; },
    expect: /will not follow the skeleton/
  }
];

let broken = 0;
console.log('\n--- validator self-test ------------------------------------------');

// The fixture has to pass, or none of the cases below prove anything.
const baseline = validateCreature(fixture(), { fileBytes: 1000 });
if (baseline.length) {
  broken++;
  console.log('  MISSED   the clean fixture does not pass, so no case below means anything');
  for (const e of baseline) console.log(`           - ${e}`);
}

for (const c of CASES) {
  const g = fixture();
  c.break(g);
  const got = validateCreature(g, { fileBytes: 1000 });
  const hit = got.find((e) => c.expect.test(e));
  if (hit) {
    console.log(`  caught   ${c.name}`);
  } else {
    broken++;
    console.log(`  MISSED   ${c.name}`);
    console.log(`           expected /${c.expect.source}/`);
    console.log(`           got ${got.length ? got.slice(0, 3).map((e) => '\n             - ' + e).join('') : '(no errors at all)'}`);
  }
}
console.log(broken
  ? `\n${broken} rule(s) the validator claims to check but does not.`
  : `all ${CASES.length} faults are caught and named.`);

process.exit(errors + broken);
