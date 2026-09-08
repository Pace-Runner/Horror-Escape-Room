/**
 * Hand materials - grimy skin, and fingernails.  [owner: Hands]
 *
 * TWO materials, because the asset is two primitives: the skin mesh and a
 * separate 84-vertex nail mesh bound to the distal finger bones. They want
 * opposite treatments - skin is matte and mottled, keratin is pale and glossy -
 * and hand-mesh.js decides which mesh is which from the SKINNING, not from a
 * name or a vertex count.
 *
 * Both are procedural: mottling, creases, dirt in those creases and a worn sheen
 * for skin; tone, gloss and dirt for nails. No texture maps at all. The GLSL
 * lives in shaders/glove.glsl.js; this file owns lifecycle and uniforms.
 *
 * The `glove` naming is historical - the art direction moved from a leather
 * glove to bare hands (see HANDOVER.md) but createGloveMaterialSet() is what
 * hands.js calls, so the name stayed.
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
 * ONE INSTANCE, AND CURRENTLY ONE HAND
 * A single material serves however many hands are built. It was written that way
 * so two hands could not drift apart under setGrime(); with the left hand now
 * switched off in hands.js (see ACTIVE_SIDES there) it happens to serve only the
 * right, which is also why the mirrored-negative-scale case below stopped
 * mattering. Ownership lives here, not in hand-mesh.js: the mesh layer borrows
 * the material and must never dispose it.
 *
 * A NOTE IF THE LEFT HAND IS EVER TURNED BACK ON. The left hand is a clone with
 * scale.x = -1, so its matrix determinant is negative and Three flips the
 * winding order for it. Nothing here depends on winding or on derivatives any
 * more, so it should simply work - but it has never been seen on screen, so look
 * at it before trusting it.
 */

import * as THREE from "three";

import {
  GLOVE_FRAGMENT_UNIFORMS,
  GLOVE_VERTEX_HEAD,
  GLOVE_VERTEX_BODY,
  GLOVE_DIFFUSE_BODY,
  GLOVE_ROUGHNESS_BODY,
  NAIL_FRAGMENT_UNIFORMS,
  NAIL_DIFFUSE_BODY,
  NAIL_ROUGHNESS_BODY,
} from "./shaders/glove.glsl.js";

/**
 * NO TEXTURE MAPS. Both materials are entirely procedural - mottling, creases,
 * dirt and gloss are generated in the fragment shader from noise over the mesh's
 * UVs, so there is no normal or roughness map to author, ship, or fail to load.
 *
 * This is not laziness; it is the same choice the rest of this project already
 * makes. Every other surface in the game is generated at runtime (see
 * world/textures.js, and the credits line "all textures are generated
 * procedurally on <canvas> at runtime"), and the hands now match. It also
 * means the hands cost zero bytes of download beyond the 167 KB model, and there
 * is no UV-seam or texel-density problem to solve on a hand unwrap.
 *
 * The tuning constants that would otherwise live in those maps are in
 * shaders/glove.glsl.js, under GLOVE_TUNING.
 */

/**
 * Base skin colour.
 *
 * DARKER THAN IT LOOKS RIGHT IN A COLOUR PICKER, deliberately. Two reasons
 * compound here:
 * a surface 25 cm from the lens catches far more light than anything else in the
 * room, and this project renders with NO tone mapping (see the note in main.js -
 * ACES was measured and made every level darker, so it was dropped), which lifts
 * midtones relative to the filmic curve the original value was picked against.
 *
 * The shader then darkens further - creases multiply albedo by 0.42, dirt mixes
 * toward near-black - so this value is the BRIGHTEST the skin ever gets.
 *
 * THIS IS THE KNOB FOR OVERALL BRIGHTNESS. If the hands read too dark to make
 * out in Level 1, raise it before touching anything in the shader.
 */
export const GLOVE_BASE_COLOR = 0x6b5140;

/**
 * Base roughness, before the shader varies it per pixel.
 *
 * Skin keeps a broad, weak sheen even when filthy, and that sheen is much of
 * what gives the form away under a single torch - so not chalk-matte. The shader
 * varies it per pixel around this value. metalness stays 0: skin is a dielectric,
 * and any metalness at all turns the albedo into a reflection tint.
 */
export const GLOVE_BASE_ROUGHNESS = 0.68;

/**
 * Fingernail colour and gloss.
 *
 * Lighter and cooler than the skin, but NOT white: a nail catching a torch at
 * 25 cm blows out long before the skin does, and a blown-out nail reads as a
 * hole rather than as keratin. Slightly desaturated as well as lighter, because
 * against warm skin a difference in saturation separates better than brightness
 * alone.
 *
 * The first attempt at 0x8f7a66 was measured against the skin's 0x6b5140 and
 * came out almost invisible under a side light - hence the wider gap here.
 *
 * Roughness 0.18 against skin's 0.68 is the other half of it. A nail is only a
 * few pixels across at view-model range, so the specular glint does much of the
 * work of saying "nail". That glint matters more in the game than it does in a
 * turntable render, because the flashlight is parented to the CAMERA - a glossy
 * surface facing the player is lit almost head-on and returns a hard highlight.
 */
export const NAIL_BASE_COLOR = 0xa8968a;
export const NAIL_BASE_ROUGHNESS = 0.18;

/**
 * Creates the skin and nail materials, and the handles that drive their shared
 * uniforms.
 *
 * @param {object} [params]
 * @param {number} [params.grime]    0..1 initial grime
 * @param {number} [params.wetness]  0..1 initial wetness
 * @returns {{
 *   material: import('three').Material|null,
 *   nailMaterial: import('three').Material|null,
 *   grime: number,
 *   wetness: number,
 *   setGrime(value: number): void,
 *   setWetness(value: number): void,
 *   dispose(): void
 * }}
 */
export function createGloveMaterialSet({ grime = 0, wetness = 0 } = {}) {
  /**
   * Held here and shared BY REFERENCE with every compiled program, rather than
   * copied into shader.uniforms. Three calls onBeforeCompile once per program,
   * and a copy would mean setGrime() updated an object the GPU no longer reads -
   * the classic "the uniform does nothing" bug with this pattern.
   */
  const uniforms = {
    uGrime: { value: clamp01(grime) },
    uWetness: { value: clamp01(wetness) },
  };

  const material = new THREE.MeshStandardMaterial({
    name: "glove",
    color: GLOVE_BASE_COLOR,
    roughness: GLOVE_BASE_ROUGHNESS,
    metalness: 0,
    /**
     * FALSE, and it has to stay false. The imported glTF carries no `color`
     * attribute at all, so there is nothing to read - but more importantly, if a
     * replacement asset ever ships with vertex colours, Three's `color_fragment`
     * chunk would multiply them straight into the albedo and tint the glove
     * whatever the artist happened to leave in that attribute.
     */
    vertexColors: false,
  });

  /**
   * setGrime / setWetness reach the uniforms through here, so they keep working
   * whether or not a program has been compiled yet.
   */
  material.userData.uniforms = uniforms;

  /**
   * The injection. Each marker below occurs EXACTLY ONCE in three 0.169's stock
   * MeshStandardMaterial source, which is what makes a plain replace() safe;
   * see the header of shaders/glove.glsl.js for the rest of the verification.
   *
   * The two fragment replacements MUST stay in this order - the diffuse body
   * declares the noise fields that the roughness body reads.
   *
   * No customProgramCacheKey() is needed: Three's default implementation already
   * returns `this.onBeforeCompile.toString()`, so a material carrying this
   * injection can never be handed a program compiled for a stock standard
   * material.
   */
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = uniforms.uGrime;
    shader.uniforms.uWetness = uniforms.uWetness;

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GLOVE_VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${GLOVE_VERTEX_BODY}`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GLOVE_FRAGMENT_UNIFORMS}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${GLOVE_DIFFUSE_BODY}`)
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n${GLOVE_ROUGHNESS_BODY}`,
      );

    // There is deliberately NO <normal_fragment_maps> injection any more. A
    // dFdx-based bump there made the hand look faceted, because on a mesh this
    // coarse the derivative of a slowly varying height field is near-constant
    // across each triangle - so the perturbed normal went flat per triangle and
    // overwhelmed the smoothly interpolated vertex normal. See the header of
    // shaders/glove.glsl.js for the full account and what to do instead.
  };

  /**
   * FINGERNAILS. A second material, because the nails are a second primitive in
   * the asset (84 vertices bound to the distal finger bones) and want the
   * opposite treatment to skin: paler, and glossy rather than matte.
   *
   * It shares the SAME uniform objects, so setGrime() dirties the nails and the
   * skin together and they cannot drift apart. It reuses the skin material's
   * vertex injection too, so there is one set of varyings to reason about.
   *
   * No customProgramCacheKey is needed even though both materials inject: the
   * default key is onBeforeCompile.toString(), and these two functions have
   * different source, so they cannot be handed each other's program.
   */
  const nailMaterial = new THREE.MeshStandardMaterial({
    name: "nail",
    color: NAIL_BASE_COLOR,
    roughness: NAIL_BASE_ROUGHNESS,
    metalness: 0,
    vertexColors: false,
  });
  nailMaterial.userData.uniforms = uniforms;

  nailMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = uniforms.uGrime;
    shader.uniforms.uWetness = uniforms.uWetness;

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GLOVE_VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${GLOVE_VERTEX_BODY}`);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${GLOVE_FRAGMENT_UNIFORMS}\n${NAIL_FRAGMENT_UNIFORMS}`,
      )
      .replace("#include <map_fragment>", `#include <map_fragment>\n${NAIL_DIFFUSE_BODY}`)
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n${NAIL_ROUGHNESS_BODY}`,
      );
  };

  return {
    material,
    nailMaterial,

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
     * The glove itself is fully procedural and binds no textures, so the loop
     * below finds nothing today. It stays because Three.js frees nothing for you
     * (see core/Disposer.js) and the moment anyone adds a map - an emissive
     * decal, a blood overlay - forgetting this is a silent leak across level
     * reloads.
     */
    dispose() {
      for (const key of ["material", "nailMaterial"]) {
        const material = this[key];
        if (!material) continue;
        for (const prop of Object.keys(material)) {
          const value = material[prop];
          if (value && value.isTexture) value.dispose();
        }
        // Drops the shared uniform objects too, so a stale set cannot be
        // written to after teardown.
        delete material.userData.uniforms;
        material.dispose();
        this[key] = null;
      }
    },
  };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
