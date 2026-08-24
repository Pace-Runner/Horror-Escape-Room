/**
 * Glove material - dirty brown leather.  [owner: Hands]
 *
 * Built in two stages, on purpose:
 *   Stage 1 (Unit 3): a plain MeshStandardMaterial, brown, rough, non-metal.
 *     Just enough to judge silhouette and animation under torch light.
 *   Stage 2 (Unit 10): the graded material - procedural grime in the creases,
 *     wear sheen on the knuckles and fingertips, and uGrime / uWetness uniforms
 *     driven by game state.
 *
 * WHY onBeforeCompile AND NOT ShaderMaterial (this is a demo question - every
 * team member will be asked it, so the answer lives in the source)
 * A raw ShaderMaterial replaces Three.js's entire shader program, which means
 * giving up its lighting, its shadow mapping, its PBR BRDF, its tone mapping and
 * its fog - and then re-implementing all of it by hand to get back to where you
 * started. `onBeforeCompile` instead hands us the built-in MeshStandardMaterial
 * source as a string just before it is compiled, so we can splice our own GLSL
 * into it. We keep every one of those features and add grime on top. The cost is
 * that we are patching strings against Three.js's internal chunk names, which is
 * why the version is pinned in package.json and must not be bumped mid-project.
 *
 * SHARED, NOT PER-HAND
 * One material instance serves both hands. Two would double the draw calls for
 * no visual gain, and would mean setGrime() had to be applied twice and could
 * drift. Ownership therefore lives here, not in hand-mesh.js: the mesh layer
 * borrows the material and must never dispose it.
 *
 * Unit 3 status: Stage 1 material is real. setGrime / setWetness still only
 * store their values - there are no uniforms to drive until Unit 10 - but they
 * are safe to call, so no caller has to be edited when the uniforms arrive.
 */

import * as THREE from "three";

/**
 * Where the leather maps will live once Unit 10 authors them.
 *
 * RESOLVED PATH DECISION (Unit 0): the brief's layout says `assets/hands/`, but
 * in this repository the runtime asset root is `public/` - Vite copies it
 * verbatim and both linters (tools/check-assets.mjs, tools/check-deploy.mjs)
 * only scan public/. A top-level `assets/` folder would simply not ship. So the
 * files go to `public/assets/hands/` and are referenced RELATIVE, never with a
 * leading slash, because the game is served from a subdirectory.
 *
 * The folder is deliberately NOT created empty in Unit 0: git cannot track an
 * empty directory, and a `.gitkeep` placed under public/ would be copied into
 * dist/ and FAIL tools/check-deploy.mjs, which rejects dotfiles in the build
 * output. Unit 10 creates the folder along with the first real texture.
 */
export const GLOVE_TEXTURE_PATHS = Object.freeze({
  normal: "./assets/hands/glove-normal.webp",
  roughness: "./assets/hands/glove-roughness.webp",
});

/** Budget from the brief: 1024 max, both maps together under ~1 MB. */
export const GLOVE_TEXTURE_MAX_PX = 1024;

/**
 * Creates the shared glove material and the handles that drive its uniforms.
 *
 * UNIT 3 returns a real MeshStandardMaterial here; UNIT 10 adds the
 * onBeforeCompile injection and wires uGrime / uWetness.
 *
 * @param {object} [params]
 * @param {number} [params.grime]    0..1 initial grime
 * @param {number} [params.wetness]  0..1 initial wetness
 * @returns {{
 *   material: import('three').Material|null,
 *   grime: number,
 *   wetness: number,
 *   setGrime(value: number): void,
 *   setWetness(value: number): void,
 *   dispose(): void
 * }}
 */
export function createGloveMaterialSet({ grime = 0, wetness = 0 } = {}) {
  return {
    /**
     * STAGE 1 (Unit 3): a plain brown leather-ish MeshStandardMaterial. Enough
     * to judge silhouette and animation under torch light, and nothing more.
     *
     * roughness 0.78 rather than 0.95: worn leather is not chalk. It needs a
     * broad, soft specular lobe or the gloves read as felt under a torch, and
     * that lobe is the only thing giving the form away in a dark room. metalness
     * stays 0 - leather is a dielectric, and any metalness at all turns the
     * albedo into a reflection tint and kills the brown.
     *
     * vertexColors is deliberately FALSE even though the geometry carries a
     * `color` attribute. That attribute is the crease/wear MASK baked by
     * hand-mesh.js for Unit 10, not a colour: switching vertexColors on would
     * let Three's `color_fragment` chunk multiply it into the albedo and tint
     * the glove a blotchy dark red. Unit 10 turns it on and REPLACES that chunk
     * so the mask drives grime and sheen instead of albedo.
     */
    /**
     * Stage 1 for BARE GRIMY HANDS. The art direction moved off gloves, so this
     * is skin that has been through something, not leather.
     *
     * Deliberately desaturated and dark for skin: clean pink reads as a doll, and
     * ACES tone mapping at exposure 1.05 lifts midtones, so an albedo that looks
     * right in a colour picker comes out pale on screen. This is grubby, slightly
     * grey-brown skin, which the Unit 10 shader then loads up with grime in the
     * creases, dirt on the knuckles and a little blood.
     *
     * roughness 0.62 rather than leather's 0.78: skin keeps a broad, weak
     * specular sheen even when filthy, and that sheen is most of what gives the
     * form away under a single torch. metalness stays 0 - skin is a dielectric.
     */
    material: new THREE.MeshStandardMaterial({
      name: "hands",
      // Darkened again after seeing them in the game: at 0x8a6a58 the hands blew
      // out to near-white against a level lit for dread, which reads as a ghost
      // rather than a person. Level 1's lights are brighter on a surface 30 cm
      // from the lens than anything else in the room, so hand albedo has to sit
      // well BELOW what looks right in a colour picker.
      color: 0x5c4436,
      roughness: 0.62,
      metalness: 0,
      vertexColors: false,
    }),

    grime: clamp01(grime),
    wetness: clamp01(wetness),

    /**
     * Grime 0 must still look like a USED working glove, not a new one - these
     * hands have been through something before the game starts. The uniform
     * range is "worn" to "filthy", not "clean" to "dirty".
     */
    setGrime(value) {
      this.grime = clamp01(value);
      const uniforms = this.material?.userData?.uniforms;
      if (uniforms?.uGrime) uniforms.uGrime.value = this.grime;
    },

    setWetness(value) {
      this.wetness = clamp01(value);
      const uniforms = this.material?.userData?.uniforms;
      if (uniforms?.uWetness) uniforms.uWetness.value = this.wetness;
    },

    /**
     * Releases the material and every texture it holds.
     *
     * Textures are disposed explicitly rather than left to the material,
     * because Three.js does not free them for you - see core/Disposer.js. Unit
     * 10 must keep this in step with whatever maps it adds.
     */
    dispose() {
      const material = this.material;
      if (!material) return;
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && value.isTexture) value.dispose();
      }
      material.dispose();
      this.material = null;
    },
  };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
