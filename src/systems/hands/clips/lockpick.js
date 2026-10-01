/**
 * lockpick - paperclip in the restraint.  [owner: Hands]  P0
 *
 * EMITS: hands:clip-end. (Never actually fires: this clip loops, and update()
 * only reaches the finish branch for a non-looping clip - see animator.js.)
 *
 * THIS IS THE FIRST THING THE PLAYER EVER DOES (Level 1, Puzzle 1), which makes
 * it the most closely watched animation in the game - the player is restrained,
 * has nothing else to look at, and will repeat it until the lock gives. Two
 * consequences for how it is authored:
 *
 *   - It must look FIDDLY, not smooth. Small, uneven wrist rotations with
 *     hesitations, not a clean arc. Competence reads as a cutscene; fumbling
 *     reads as the player doing it. `pinch` (the pose that would actually shape
 *     fingers around a thin wire) is still unauthored, so the fiddling has to
 *     live entirely in the wrist - `grip-cylinder` holds the hand shape steady
 *     underneath while the wrist carries the whole performance. That is not a
 *     downgrade: the brief's own note is that the wrist motion, not the finger
 *     shape, is what has to read as fumbling.
 *   - It must be LOOPABLE without a visible seam: the first and last keys are
 *     the exact same pose object, not just similar values, so there is nothing
 *     for a seam to appear between.
 *
 * The five interior keys are deliberately UNEVEN in both spacing and size -
 * three small adjustments, a near-hold (0.58 -> 0.68, the "hesitation"), then
 * one larger correction - rather than a smooth sinusoid, which is what would
 * make this read as a clean mechanism instead of someone actually fumbling a
 * lock. Magnitudes stay under 0.09 rad (~5 degrees): compare hold-torch's 1.39
 * rad wrist roll for aiming, which is the proof this joint tolerates far more
 * before anything looks broken - this clip is deliberately restrained, not
 * limited by the rig.
 */

import { gripCylinder } from "../poses/grip-cylinder.js";

/** One wiggle key: grip-cylinder's hand shape plus a small wrist offset. */
function wiggle(x, y, z) {
  return Object.freeze({ ...gripCylinder, wrist: Object.freeze([x, y, z]) });
}

const START = wiggle(0.02, -0.06, 0.03);

export const lockpick = Object.freeze({
  name: "lockpick",
  duration: 1.4,
  loop: true,
  keys: Object.freeze([
    Object.freeze({ t: 0.00, pose: START, ease: "inout" }),
    Object.freeze({ t: 0.28, pose: wiggle(-0.03, 0.08, -0.02), ease: "inout" }),
    Object.freeze({ t: 0.42, pose: wiggle(0.06, 0.01, 0.07), ease: "out" }),
    // The hesitation: a short span to a barely-different pose, so the hand
    // all but stops here before the next correction.
    Object.freeze({ t: 0.68, pose: wiggle(0.05, 0.02, 0.06), ease: "in" }),
    Object.freeze({ t: 1.05, pose: wiggle(-0.05, -0.07, -0.04), ease: "inout" }),
    // Same pose OBJECT as t=0.00 (not just the same values) - see the header.
    Object.freeze({ t: 1.40, pose: START, ease: "inout" }),
  ]),
  events: Object.freeze([]),
});
