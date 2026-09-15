/**
 * pickup - reach, grasp, retract.  [owner: Hands]  P0
 *
 * EMITS: hands:grasp at the frame the fingers close, then hands:clip-end.
 *
 * The grasp event is the one place in this module where animation timing and
 * gameplay are hard-coupled: the Interaction system parents the object to the
 * socket when it fires. Fire it early and the object visibly snaps into a hand
 * that is still open; fire it late and the closed hand passes through the object
 * first. It goes on the frame of visual closure.
 *
 * `open` and `reach` are still unauthored (see their own files), so this uses
 * `relaxed` as both the pre-grasp and settle pose rather than a fully splayed
 * hand - a smaller move than the ideal "reach out, then close", but a real,
 * checkable pose at both ends instead of one invented blind. Swap the two
 * `relaxed` keys for `reach` the day that pose lands; nothing else here changes.
 *
 * `grip-cylinder` stands in for the grasp shape regardless of what is actually
 * being picked up (flashlight, crowbar, key, paperclip): it is the only closed
 * hand shape this project has fitted and measured against real geometry (see
 * poses/grip-cylinder.js), and at the size these props render on screen the
 * difference between "gripping a shaft" and "gripping a key" is not legible.
 */

import { relaxed } from "../poses/relaxed.js";
import { gripCylinder } from "../poses/grip-cylinder.js";

export const pickup = Object.freeze({
  name: "pickup",
  duration: 0.62,
  loop: false,
  keys: Object.freeze([
    Object.freeze({ t: 0.00, pose: relaxed, ease: "out" }),
    Object.freeze({ t: 0.34, pose: gripCylinder, ease: "inout" }),
    Object.freeze({ t: 0.62, pose: relaxed, ease: "in" }),
  ]),
  events: Object.freeze([
    Object.freeze({ t: 0.34, name: "hands:grasp" }),
  ]),
});
