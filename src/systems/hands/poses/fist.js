/**
 * fist - fully closed.  [owner: Hands]
 *
 * This is the STRESS-TEST pose for the geometry, not just an animation pose: a
 * full fist is where segment gaps open at the knuckles and where phalanges
 * self-intersect if the overlap in hand-mesh.js is wrong. Unit 3's acceptance
 * check is "flex to a full fist with no gaps at any joint", and this pose is how
 * that gets checked.
 *
 * Unit 4 authors the values. Format: joint -> [x, y, z] Euler in radians.
 */

export const fist = Object.freeze({
  // Unit 4: author here.
});
