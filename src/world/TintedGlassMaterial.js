import * as THREE from 'three';

/**
 * Tinted glass that thickens toward its silhouette, the way real glass does.
 *
 * Face on, a pane lets most of the light through; edge on, the light crosses
 * far more glass and it reads as solid colour. With one flat opacity a glass
 * tube looks like a tinted sheet stretched over the scene -- raising the alpha
 * where the surface turns away from the eye is what makes it read as round.
 * The reflections are carried by the alpha too, so they strengthen toward the
 * edge as well.
 *
 * Done in the shader rather than with three.js's `transmission`, which renders
 * the whole scene a second time for every frame the glass is on screen.
 *
 * Draw it FrontSide on a closed shell: the outside of the near wall and the
 * inside of the far wall are then exactly the two layers of glass the eye
 * looks through. DoubleSide would count each wall twice.
 *
 * @param {object} options
 * @param {THREE.ColorRepresentation} options.color - the tint.
 * @param {number} options.opacity - how opaque it is seen face on.
 * @param {number} options.grazingOpacity - how opaque it is seen edge on.
 * @param {number} [options.roughness] - low, for glass.
 * @param {boolean} [options.depthWrite] - false for a shell the eye sees both
 *   walls of; true for flat pieces that should hide what lies behind them.
 * @returns {THREE.MeshStandardMaterial}
 */
export function createTintedGlassMaterial({ color, opacity, grazingOpacity, roughness = 0.06, depthWrite = false }) {
  const material = new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, transparent: true, opacity, depthWrite
  });
  const grazing = grazingOpacity.toFixed(3);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float glassFacing = abs( dot( normal, normalize( vViewPosition ) ) );
      diffuseColor.a = mix( diffuseColor.a, ${grazing}, pow( 1.0 - glassFacing, 3.0 ) );
      #include <opaque_fragment>`
    );
  };
  // The edit above is not part of three.js's own program key, so glass with a
  // different edge opacity would otherwise be handed this program.
  material.customProgramCacheKey = () => `tinted-glass:${grazing}`;
  return material;
}
