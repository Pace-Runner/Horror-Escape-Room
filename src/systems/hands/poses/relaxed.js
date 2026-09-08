/**
 * relaxed - the neutral pose everything returns to.  [owner: Hands]
 *
 * A hand at rest is NOT a flat hand. Left alone, the fingers settle into a
 * gentle curl with the pinky curled slightly more than the index. Authoring
 * this as all-zeros is the single most common way a code-built hand ends up
 * looking like a shop mannequin, so `relaxed` is a real pose with real values,
 * not an empty object.
 *
 * Every clip in the game starts and ends here, which makes it the most
 * load-bearing pose in the module - get it wrong and everything inherits it.
 *
 * Format: joint name -> [x, y, z] Euler in RADIANS. Joints omitted are at rest.
 *
 * HOW THESE NUMBERS WERE PRODUCED, since they are not hand-typed and the shape
 * of them looks odd at first glance (why is there a Y and Z component on a
 * finger that only needs to curl?).
 *
 * `applyPose` multiplies each triple onto the bone's REST orientation, so a
 * triple acts about that bone's own local axes - and those axes are whatever the
 * donor rig and the glTF exporter left them as, not a tidy "X is flexion". The
 * bind pose here has the index chain's local X at (0.963, 0.027, -0.267) of the
 * finger's real flexion axis, which is why a pure [flex, 0, 0] triple would bend
 * the finger slightly sideways as well as closing it.
 *
 * So each joint's flexion axis was MEASURED off the asset instead: rotating a
 * joint about axis `a` moves its child along `a x c` (c = the bone direction),
 * and a curling finger moves toward the palm, so the axis is `along x palm`.
 * One axis per finger, shared down the chain, because a real finger curls in a
 * PLANE - and because the distal joints have no child in the joint map to
 * measure a direction from, so taking whatever terminator bone the exporter left
 * would give each phalanx a slightly different axis and splay the fingertip.
 * The resulting axis-angle rotations were converted to Euler XYZ, which is what
 * puts a component on all three numbers.
 *
 * Verified: flexion alone is planar to under 1 mm per finger, every joint moves
 * its fingertip toward the palm rather than sideways, and the closest pair of
 * fingertips stays 27 mm apart so no two fingers intersect.
 *
 * The knuckle triples also carry a small ADDUCTION - a rotation about the palm
 * normal that closes the bind pose's splay, since a relaxed hand does not hold
 * its fingers fanned. That part is deliberately out of the flexion plane. The
 * direction of the close was determined by test per finger rather than reasoned
 * from which side of the hand a finger sits on, because the sign of the splay in
 * the bind pose is the asset's business, not ours.
 *
 * HOW OPEN THE HAND IS. The angles below are a HALF-STRENGTH curl. The first
 * pass used double these and it read as clenched - a claw, with the fingertips
 * curling back toward the lens - which is wrong for a hand held palm-down. At
 * half strength the index flexes 14 / 20 / 10 degrees down its chain, a gentle
 * natural curve, and the hand measures 180 mm wrist-to-fingertip against 190 mm
 * dead straight (the clenched version measured 160 mm).
 *
 * To retune by feel, these are the full-strength angles in radians scaled by
 * 0.5: thumb 0.34/0.42, index 0.50/0.68/0.34, middle 0.56/0.78/0.38, ring
 * 0.58/0.80/0.40, pinky 0.60/0.76/0.38, with adduction (scaled by 0.6) thumb
 * 0.30, index 0.10, ring 0.08, pinky 0.16. Larger closes the hand; the distal
 * joint should always be the smallest of a chain or the fingertip curls under.
 */

export const relaxed = Object.freeze({
  'thumb.01': [0.2249, 0.0984, -0.0448],
  'thumb.02': [0.0702, -0.0636, -0.1853],

  'index.01': [0.2569, 0.0034, -0.0094],
  'index.02': [0.3258, -0.0252, -0.0902],
  'index.03': [0.1639, -0.0090, -0.0435],

  'middle.01': [0.2753, 0.0011, 0.0513],
  'middle.02': [0.3822, 0.0243, 0.0694],
  'middle.03': [0.1869, 0.0035, 0.0338],

  'ring.01': [0.2939, -0.0019, 0.0008],
  'ring.02': [0.3931, 0.0265, 0.0644],
  'ring.03': [0.1973, -0.0008, 0.0326],

  'pinky.01': [0.2899, -0.0212, -0.1184],
  'pinky.02': [0.3789, -0.0044, -0.0273],
  'pinky.03': [0.1892, -0.0065, -0.0160],
});
