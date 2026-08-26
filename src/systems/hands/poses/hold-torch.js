/**
 * hold-torch - grip-cylinder, aimed down the player's eyeline.  [owner: Hands]
 *
 * WHY THIS IS A SEPARATE POSE. grip-cylinder shapes the hand around a shaft and
 * nothing else, because the torch, the crowbar and the hammer all share that
 * shape while wanting completely different arm orientations. Aiming belongs to
 * the object, so it lives here and layers on top - poses list only the joints
 * they change, which is exactly what makes that composition work.
 *
 * WHY THE ARM HAS TO ROTATE AT ALL. The beam leaves a closed fist along the
 * pinky-to-index axis: that is the direction the tube formed by the curled
 * fingers actually runs, and it is why socket.grip points its +Y there. With
 * the hands in their rest orientation - fingers forward, palms down - that axis
 * runs ACROSS the view, so a torch dropped into the socket shines out to the
 * left. Measured before this pose existed: the beam sat at (-0.97, 0.21, 0.12)
 * in camera space, i.e. 97% straight out to the side.
 *
 * Turning the beam forward therefore means turning the forearm and wrist, not
 * re-orienting the socket - re-orienting the socket would swing the barrel off
 * the axis the fingers are curled around and the hand would slice through it.
 *
 * ALL OF IT GOES ON THE WRIST, AND IT HAS TO. The first attempt split the ~87
 * degrees across `cuff` and the wrist, on the reasoning that pronation is
 * forearm-led in life and that one joint carrying the whole roll would shear the
 * skin. That made the hand VANISH the moment the torch was picked up.
 *
 * A joint rotation pivots about that joint's own origin, so rotating a PARENT
 * bone does not merely re-orient what hangs off it - it swings it through an
 * arc. In the current hands.glb the bone mapArmature binds to `cuff`
 * (forearm.R.001) sits at the world origin while the hand sits about 105 units
 * away, so 54 degrees there threw the hand a hundred units off screen. The wrist
 * is the last joint before the hand itself, so rotating it turns the hand in
 * place and leaves it exactly where it was.
 *
 * The cost is 87 degrees of shear at one joint. That is a real cost and it is
 * the right trade: the wrist is the part the flared cuff geometry covers, and a
 * slightly twisted wrist beats no hand at all. If it reads badly, the fix is to
 * distribute it across a bone whose origin is AT the wrist, not to reintroduce a
 * rotation on a distant parent.
 *
 * WHERE IT AIMS: (-0.217, 0.259, -0.941) in camera space, about 20 degrees off
 * dead-forward, which lands the BEZEL just below the centre of the screen at
 * roughly (0.12, -0.05) in normalised device coordinates while the tail runs off
 * the bottom-right corner. That is a torch pointed down its own length at what
 * the player is looking at, which is what a real one does.
 *
 * Settled by sweeping the beam elevation in a replica of the player's own camera
 * and reading off where the bezel landed:
 *
 *   elevation   5    10    15    20    25    35    45    55    65
 *   bezel ndc.y -.14 -.09  -.05  -.01  +.03  +.10  +.17  +.23  +.28
 *
 * Earlier passes sat at 65 (torch pointing over the top of the view) and 35
 * (bezel above centre). Worth knowing for future tuning: LOWER elevation means
 * closer to the view axis, so the torch foreshortens and reads shorter - at 12
 * degrees an early attempt looked like a stub. 15 is about as low as it goes
 * before that starts to bite.
 *
 * The direction is COSMETIC. The light the player actually sees is a
 * THREE.SpotLight parented to the camera (src/main.js) pointing wherever they
 * look; it is not attached to this prop. So the aim only decides the
 * silhouette, never where the room is lit.
 *
 * Format: joint -> [x, y, z] Euler in radians, applied as rest * offset.
 */

import { gripCylinder } from "./grip-cylinder.js";

export const holdTorch = Object.freeze({
  ...gripCylinder,

  /**
   * The whole aim, at the wrist. Deliberately NOT shared with `cuff` - see the
   * header: the cuff bone's origin is nowhere near the hand, so any rotation
   * there translates the hand instead of turning it.
   *
   * Solved, not dialled: with M the wrist's chain-times-rest rotation and v the
   * beam axis in wrist space, the offset is just the rotation taking v onto
   * M^-1 * target, for the target in the header. Achieved to 0.00 degrees.
   */
  wrist: [-0.1260, -0.1774, 1.3924],
});
