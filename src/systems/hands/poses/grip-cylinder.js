/**
 * grip-cylinder - closed around a shaft.  [owner: Hands]
 *
 * The torch, the crowbar and the hammer all use this. Target diameter is ~35 mm
 * (torch body), and the brief's acceptance check is that the curled fingers
 * visibly form a TUBE of roughly that size - which means the fingertips must not
 * meet the palm, and the thumb must wrap across the index rather than sitting
 * alongside it.
 *
 * The flashlight lives in the LEFT hand by convention, so this pose spends most
 * of the game mirrored.
 *
 * Unit 4 authors the values. Format: joint -> [x, y, z] Euler in radians.
 */

export const gripCylinder = Object.freeze({
  // Unit 4: author here.
});
