/**
 * grip-cylinder - closed around a shaft.  [owner: Hands]
 *
 * The torch, the crowbar and the hammer all use this. Target diameter is ~35 mm
 * (torch body), and the brief's acceptance check is that the curled fingers
 * visibly form a TUBE of roughly that size - which means the fingertips must not
 * meet the palm, and the thumb must wrap across the index rather than sitting
 * alongside it.
 *
 * The flashlight lives in the LEFT hand by convention, but the game currently
 * builds the RIGHT hand only (see ACTIVE_SIDES in hands.js), so in practice this
 * runs unmirrored on the right. Both work: rig.js defines either side and the
 * left is a mirror of these same values.
 *
 * THIS POSE ONLY SHAPES THE HAND. It deliberately says nothing about where the
 * held object points, because a torch wants aiming down the player's eyeline and
 * a crowbar does not. The arm rotation that aims a torch forward lives in
 * ./hold-torch.js, which layers onto this one.
 *
 * HOW THESE NUMBERS WERE ARRIVED AT. Not dragged in the harness - SOLVED, against
 * the live armature, because the acceptance check above is a geometric condition
 * and can therefore be measured rather than eyeballed. The barrel axis was placed
 * where socket.grip puts it, then for each digit:
 *
 *   - adduction at the MCP cancels the rest pose's SPLAY, so the fingers close up
 *     parallel the way they do around a barrel. Chasing per-finger positions
 *     instead does not work: past about 50 degrees of flexion, rotating a finger
 *     about the palm normal swings its tip AROUND the barrel rather than along
 *     it, and the solve just runs into its limits.
 *   - flexion was then fitted so the fingertip lands on the barrel's surface.
 *
 * Fitted to the barrel the hand ACTUALLY closes around, which is the torch's
 * 17.5 mm radius times HELD_MAGNIFICATION from sockets.js - 21.9 mm, not 17.5.
 * Held props are scaled up for legibility and the grip has to follow.
 *
 * Each finger is fitted against ITS OWN SKIN, not against its tip bone plus an
 * assumed pad thickness. That first attempt left the middle finger touching the
 * barrel while the index and pinky floated visibly off it, because the digits
 * are not equally fleshy. Attributing every mesh vertex to a digit by its
 * dominant skin weight, then fitting so that digit's nearest vertex lands 1 mm
 * inside the barrel, makes all five make contact by the same amount.
 *
 * Result, measured on the current asset: all five digits' nearest skin sits
 * 20.8-21.0 mm from the barrel axis, against a surface at 21.9 mm - so every one
 * touches, with about 1 mm of overlap kept deliberately, because leather
 * compresses and a perfectly tangent grip reads as floating. Every digit stays
 * clear of the palm. The thumb lands at 45.5 mm along the barrel, which is where
 * build_flashlight.py puts the rubber side switch - so the thumb rests on the
 * switch, as it would in life.
 *
 * These are therefore FITTED TO THE CURRENT hands.glb. Swap the hand asset and
 * they want re-solving; sockets.js measures its frame at runtime and will follow
 * a new rig on its own, but a pose file is data and cannot.
 *
 * Format: joint -> [x, y, z] Euler in radians, applied as rest * offset.
 */

export const gripCylinder = Object.freeze({
  // The thumb only needs a little flexion because most of its travel here is
  // the opposition that brings it across the palm.
  "thumb.01": [0.7561, 0.6146, -0.5166],
  "thumb.02": [0.0987, 0.3198, -0.5483],

  "index.01": [0.7688, 0.1346, 0.0247],
  "index.02": [0.8996, 0.0217, -0.3314],
  "index.03": [0.5200, 0.0491, -0.1849],

  "middle.01": [0.7752, 0.0310, 0.1513],
  "middle.02": [1.0019, 0.1103, 0.1700],
  "middle.03": [0.5816, 0.0268, 0.1117],

  "ring.01": [0.7471, -0.1026, 0.0115],
  "ring.02": [0.9310, -0.0161, 0.2368],
  "ring.03": [0.5358, -0.0667, 0.1365],

  // The pinky curls least: it is the shortest finger, so it reaches the same
  // barrel surface with less flexion than the middle needs.
  "pinky.01": [0.5928, -0.2188, -0.1920],
  "pinky.02": [0.8123, -0.1736, 0.0985],
  "pinky.03": [0.4621, -0.1224, 0.0386],
});
