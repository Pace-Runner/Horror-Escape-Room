/**
 * GLSL injected into MeshStandardMaterial for the hands.  [owner: Hands]
 *
 * SKIN, not leather. The art direction is bare grimy hands (see HANDOVER.md).
 * The file keeps its `glove` name because the module's API is named that way -
 * createGloveMaterialSet() is what hands.js calls.
 *
 * ======================== NO DERIVATIVE BUMP. ON PURPOSE. ==================
 * An earlier version perturbed the normal with a height field via dFdx/dFdy,
 * the way three's own bumpMap does. It made the hand look FACETED - hard-edged
 * triangular patches all over the back of the hand - and it took a render to
 * see why:
 *
 *   dFdx of a SLOWLY varying field is very nearly constant across one triangle.
 *   This mesh is 3,984 triangles for a whole hand, so each triangle covers a lot
 *   of screen at view-model range. A constant gradient per triangle gives a
 *   constant perturbed normal per triangle, which is flat shading - and it
 *   overwhelms the smoothly interpolated vertex normal it was supposed to
 *   decorate.
 *
 * Verified the asset is not to blame: of 261 positions shared between triangles,
 * only 3 carry normals more than 25 degrees apart, so the model is genuinely
 * smooth-shaded. The facets were ours.
 *
 * A derivative bump only works when the height field varies faster than the
 * triangles do. If relief is wanted later, drive it from the PORE term alone
 * (which does vary per-pixel) and keep the scale tiny - or add a real tangent-
 * space normal map. Everything here now works through albedo and roughness,
 * which cannot break the interpolated normal.
 * =========================================================================
 *
 * ======================== SAMPLED IN UV, NOT OBJECT SPACE ==================
 * The fields are sampled from the mesh's UV attribute. The previous version used
 * the bind-pose `position` attribute and, in the rendered result, every field
 * came out CONSTANT across the whole hand - the fbm sat exactly on its 0.5 mean,
 * which is what a constant input gives. The attribute itself is fine (it ranges
 * -42.9..-11.9 on x), so something between reading it and using it was flattening
 * it, and UV space sidesteps the question entirely.
 *
 * UV is also the conventional choice, it is unit-scaled so the frequencies below
 * mean something, and it needs no asset-specific centring constant. The cost is
 * seams where the unwrap is cut; on this model those fall along the sides of the
 * fingers and the edge of the palm, where they read as skin folds anyway.
 *
 * This model's unwrap occupies u 0.009..0.554, v 0.012..0.893.
 * =========================================================================
 *
 * ======================== FEATURES HAVE TO BE BIG ENOUGH TO SEE ============
 * The first version was correct and invisible: its grain ran at ~73 cycles
 * across a hand that occupies roughly 150 pixels of screen height. That is one
 * cycle per two pixels, which the sampler averages back to flat colour.
 *
 * So the frequencies below are chosen against a pixel budget:
 *
 *   dirt      ~9 features across the hand   ~17 px each   reads easily
 *   creases   ~30 across                    ~5 px         reads as texture
 *   pores     ~120 across                   ~1 px         sub-pixel, so it is
 *                                                         only allowed to
 *                                                         disturb ROUGHNESS
 * =========================================================================
 *
 * INJECTION ORDER IS LOAD-BEARING. GLOVE_DIFFUSE_BODY computes the fields once
 * and leaves them in scope; GLOVE_ROUGHNESS_BODY reuses them. Both land in the
 * same main(), in this order:
 *
 *     <map_fragment>            <- GLOVE_DIFFUSE_BODY    declares the fields
 *     <roughnessmap_fragment>   <- GLOVE_ROUGHNESS_BODY  reads them
 *
 * Verified against three 0.169: both markers occur exactly once in the stock
 * source, `diffuseColor` is in scope before the diffuse injection, and
 * `roughnessFactor` is declared by the chunk immediately above the roughness
 * injection. Chunk names are internal API - re-check if `three` is bumped.
 */

/* ------------------------------------------------------------- tuning ---- */

/**
 * Frequencies are in "cycles across the unwrap", so they can be reasoned about
 * against the pixel budget above rather than by trial and error. Raise CONTRAST
 * to make the whole effect stronger, lower it to calm it down; it is the one
 * knob worth touching first.
 */
export const GLOVE_TUNING = Object.freeze({
  DIRT_FREQ: 16.0,
  CREASE_FREQ: 55.0,
  PORE_FREQ: 220.0,
  MOTTLE_FREQ: 8.0,
  CONTRAST: 1.0,
});

/** Uniforms, varyings and the noise helpers, for the fragment stage. */
export const GLOVE_FRAGMENT_UNIFORMS = /* glsl */ `
uniform float uGrime;
uniform float uWetness;

varying vec2 vSkinUv;
varying vec3 vSkinNormal;

// Grime is dust and dried blood: it desaturates towards grey-brown. Tinting with
// a darker version of the skin tone only reads as shadow, not as dirt.
const vec3 SKIN_DIRT_COLOR = vec3(0.042, 0.034, 0.027);

float skinHash(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794) + vec2(0.71, 0.113));
  p *= 17.0;
  return fract(p.x * p.y * (p.x + p.y));
}

float skinNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(skinHash(i + vec2(0.0, 0.0)), skinHash(i + vec2(1.0, 0.0)), f.x),
    mix(skinHash(i + vec2(0.0, 1.0)), skinHash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

// Normalised to a full 0..1 so the contrast decisions downstream mean what they
// say. The raw octave sum tops out near 0.875, which quietly weakened every
// term in the first version.
float skinFbm(vec2 p) {
  float total = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 3; i++) {
    total += amp * skinNoise(p);
    norm += amp;
    p *= 2.07;
    amp *= 0.5;
  }
  return total / norm;
}

// Ridged: turns a blob field into thin LINES, which is what a crease is.
float skinRidge(vec2 p, float width) {
  return 1.0 - smoothstep(0.0, width, abs(skinFbm(p) - 0.5));
}
`;

/** Varyings for the vertex stage. */
export const GLOVE_VERTEX_HEAD = /* glsl */ `
varying vec2 vSkinUv;
varying vec3 vSkinNormal;
`;

/**
 * Passes the UV and the bind-pose normal through.
 *
 * `uv` and `normal` are raw attributes; the skinning chunks further down main()
 * write into `transformed` and `objectNormal` and leave the attributes alone.
 * Using the bind-pose normal is what keeps the dorsal/palm split welded to the
 * surface as the fingers move.
 */
export const GLOVE_VERTEX_BODY = /* glsl */ `
vSkinUv = uv;
vSkinNormal = normalize(normal);
`;

/** Albedo: mottling, creases, dirt in those creases, wetness. */
export const GLOVE_DIFFUSE_BODY = /* glsl */ `
vec2 skinP = vSkinUv;
float skinContrast = ${GLOVE_TUNING.CONTRAST.toFixed(2)};

// Back of the hand or palm? +Y is dorsal by this rig's convention (see rig.js).
// The palm creases harder; the back of the hand shows dirt more.
float skinDorsal = clamp(vSkinNormal.y * 0.5 + 0.5, 0.0, 1.0);

// Broad uneven colour. The largest-scale term, and the one that stops the hand
// reading as a single flat swatch at gameplay distance.
float skinMottle = skinFbm(skinP * ${GLOVE_TUNING.MOTTLE_FREQ.toFixed(1)});

// Creases: thin lines where a mid-frequency fbm crosses its midpoint.
float skinCrease = skinRidge(skinP * ${GLOVE_TUNING.CREASE_FREQ.toFixed(1)}, 0.14);
skinCrease *= mix(1.0, 0.7, skinDorsal);

// Pores: sub-pixel at this size, so it is confined to roughness downstream.
float skinPore = skinFbm(skinP * ${GLOVE_TUNING.PORE_FREQ.toFixed(1)});

// Dirt: blotches, plus whatever settles in the creases. The 0.25 floor is the
// module README's rule - grime 0 is a hand that has been through something.
float skinBlotch = smoothstep(0.4, 0.78, skinFbm(skinP * ${GLOVE_TUNING.DIRT_FREQ.toFixed(1)}));
float skinDirt = clamp(skinBlotch * 0.75 + skinCrease * 0.45, 0.0, 1.0)
               * mix(0.25, 1.0, clamp(uGrime, 0.0, 1.0));

float skinWet = clamp(uWetness, 0.0, 1.0);

vec3 skinAlbedo = diffuseColor.rgb;
// Uneven skin first, so everything after sits on top of it.
skinAlbedo *= mix(1.0, mix(0.70, 1.20, skinMottle), skinContrast);
// Creases are the darkest thing on otherwise clean skin.
skinAlbedo = mix(skinAlbedo, skinAlbedo * 0.42, skinCrease * 0.7 * skinContrast);
// Dirt.
skinAlbedo = mix(skinAlbedo, SKIN_DIRT_COLOR, skinDirt * 0.78 * skinContrast);
// Wet skin darkens.
skinAlbedo *= mix(1.0, 0.66, skinWet);
diffuseColor.rgb = skinAlbedo;
`;

/**
 * Roughness: pores break up the specular, creases and dirt go matte, wet goes
 * glossy.
 *
 * This is where the fine detail lives now that there is no bump. Roughness
 * variation cannot break the interpolated normal, so it is safe at any
 * frequency - and on a surface lit by a single close torch it is what stops skin
 * looking like moulded plastic.
 */
export const GLOVE_ROUGHNESS_BODY = /* glsl */ `
float skinR = roughnessFactor;
skinR += (skinPore - 0.5) * 0.32;
skinR = mix(skinR, 0.93, skinCrease * 0.55);
skinR = mix(skinR, 0.96, skinDirt * 0.45);
// Skin stretched over bone stays the shiniest part of a dirty hand.
skinR = mix(skinR, 0.38, smoothstep(0.6, 0.95, skinMottle) * skinDorsal * 0.5);
skinR = mix(skinR, skinR * 0.28 + 0.05, skinWet);
roughnessFactor = clamp(skinR, 0.06, 1.0);
`;

/* --------------------------------------------------------------- nails ---- */

/**
 * The asset already carries fingernails: a second primitive of 84 vertices, 18
 * each on index / middle / ring / pinky bound to their distal bones, plus 12 on
 * the thumb. They were invisible because hand-mesh.js overrode every mesh's
 * material with the single skin material, so nails rendered as skin.
 *
 * DELIBERATELY SIMPLE. A nail is only a few pixels across at view-model range,
 * so what makes it read is TONE and GLOSS, not texture - a paler patch with a
 * specular glint. Fine detail here would be sub-pixel and would only alias, which
 * is the same trap the first version of the skin shader fell into.
 *
 * Shares GLOVE_VERTEX_HEAD / GLOVE_VERTEX_BODY and the noise helpers with the
 * skin material, so the two stay in step and there is one set of varyings.
 */
export const NAIL_FRAGMENT_UNIFORMS = /* glsl */ `
// Grime under a nail is darker and browner than grime on skin.
const vec3 NAIL_DIRT_COLOR = vec3(0.028, 0.021, 0.015);
`;

export const NAIL_DIFFUSE_BODY = /* glsl */ `
float nailGrime = clamp(uGrime, 0.0, 1.0);
float nailWet = clamp(uWetness, 0.0, 1.0);

// Dirt in patches rather than an even wash. No assumption is made about which
// way the nail unwrap runs - guessing that would put the dirt in a band across
// the middle of the nail as often as along its edge.
float nailDirt = smoothstep(0.42, 0.86, skinFbm(vSkinUv * 70.0))
               * mix(0.2, 1.0, nailGrime);

vec3 nailAlbedo = diffuseColor.rgb;
nailAlbedo = mix(nailAlbedo, NAIL_DIRT_COLOR, nailDirt * 0.75);
nailAlbedo *= mix(1.0, 0.70, nailWet);
diffuseColor.rgb = nailAlbedo;
`;

export const NAIL_ROUGHNESS_BODY = /* glsl */ `
// Keratin is the glossiest thing on a hand, and that glint is most of what makes
// a nail read at this size. Dirt dulls it.
float nailR = mix(roughnessFactor, 0.85, nailDirt * 0.6);
nailR = mix(nailR, nailR * 0.3 + 0.04, nailWet);
roughnessFactor = clamp(nailR, 0.05, 1.0);
`;
