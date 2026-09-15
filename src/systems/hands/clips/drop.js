/**
 * drop - open, lower, release.  [owner: Hands]  P0
 *
 * EMITS: hands:release when the fingers open, then hands:clip-end.
 *
 * Deliberately slower and heavier than the reverse of `pickup` (0.85s against
 * 0.62s) and with a genuine hold at the release key rather than an instant
 * pass-through: letting go is a decision the player made, and a fast un-grab
 * makes the object feel weightless and reads as a mistake rather than a choice.
 *
 * `open` is still unauthored (see its own file), so the release key is built
 * from `relaxed` - the closest real, checkable hand shape to "fingers open" this
 * project has - with a `wrist` tilt layered on top. That tilt is what actually
 * carries "lower": the animator only ever composes JOINT rotations (the wrist
 * included, see rig.js's header on why there is no separate palm joint), never
 * the hand's camera-space position, so there is no other node here that could
 * read as the hand dipping. 0.14 rad pitch-down is modest on purpose - compare
 * hold-torch's 1.39 rad wrist roll for aiming, which is the proof this joint
 * tolerates far more before anything looks broken.
 */

import { relaxed } from "../poses/relaxed.js";
import { gripCylinder } from "../poses/grip-cylinder.js";

const release = Object.freeze({ ...relaxed, wrist: Object.freeze([0.14, 0, 0]) });

export const drop = Object.freeze({
  name: "drop",
  duration: 0.85,
  loop: false,
  keys: Object.freeze([
    Object.freeze({ t: 0.00, pose: gripCylinder, ease: "out" }),
    Object.freeze({ t: 0.55, pose: release, ease: "inout" }),
    Object.freeze({ t: 0.85, pose: relaxed, ease: "in" }),
  ]),
  events: Object.freeze([
    Object.freeze({ t: 0.55, name: "hands:release" }),
  ]),
});
