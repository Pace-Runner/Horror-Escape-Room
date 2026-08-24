/**
 * GLSL injected into MeshStandardMaterial for the glove.  [owner: Hands]
 *
 * Kept as template strings in their own module rather than inline in
 * materials.js so the shader source can be read and reviewed as shader source,
 * and so materials.js stays about material lifecycle.
 *
 * Unit 0 status: empty injections. Unit 10 writes the real GLSL, which must
 * deliver, per the brief:
 *
 *   - Procedural grime in the creases, biased by a per-vertex crease mask baked
 *     into a vertex-colour attribute by hand-mesh.js in Unit 3. Dirt sits where
 *     dirt actually collects; uniform noise all over reads as static, not grime.
 *   - Wear sheen on the edges - knuckles, fingertips, heel of the palm - driven
 *     by the INVERSE of the crease mask. Leather rubs shiny where it flexes.
 *   - uGrime (0..1), driven from game state through hands.setGrime(). This is
 *     the "uniforms driven by game state so the effect is alive rather than
 *     static" requirement, and it is nearly free.
 *   - uWetness (0..1), raising specular and darkening albedo for rain and the
 *     damp basement.
 *
 * Injection works by string replacement against Three.js's own shader chunks,
 * which is why `three` is pinned to 0.185.1 in package.json. Chunk names are
 * internal API and do change between versions.
 */

/** Uniform declarations, prepended to the fragment shader. */
export const GLOVE_FRAGMENT_UNIFORMS = /* glsl */ `
  // Unit 10: uniform float uGrime;
  // Unit 10: uniform float uWetness;
`;

/** Varyings and vertex-side work: passes the baked crease mask to the fragment stage. */
export const GLOVE_VERTEX_HEAD = /* glsl */ `
  // Unit 10: varying float vCrease;
`;

export const GLOVE_VERTEX_BODY = /* glsl */ `
  // Unit 10: read the crease mask out of the vertex colour attribute.
`;

/** Albedo modification: grime darkens the creases, wetness darkens everything. */
export const GLOVE_DIFFUSE_BODY = /* glsl */ `
  // Unit 10: diffuseColor.rgb = mix(...) grime in creases, wetness overall.
`;

/** Roughness modification: wear sheen on the high points, wetness everywhere. */
export const GLOVE_ROUGHNESS_BODY = /* glsl */ `
  // Unit 10: roughnessFactor = mix(...) lower on worn edges and when wet.
`;
