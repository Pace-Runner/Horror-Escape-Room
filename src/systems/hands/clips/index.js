/**
 * Clip registry.  [owner: Hands]
 *
 * Like poses, clips are plain data modules - see ../poses/index.js for the
 * reasoning. Registry keys are the public names accepted by
 * `hands.play(side, name)`.
 *
 * The full catalogue is ~40 clips across Units 7, 12, 13 and 14. Only the four
 * that the brief's file layout names exist as modules so far; each later unit
 * adds its clips as modules and registers them here. ADDING A CLIP IS: write the
 * module, import it, add one line to CLIPS. Nothing else in the module changes -
 * that is the point of the registry.
 */

import { pickup } from "./pickup.js";
import { drop } from "./drop.js";
import { throwClip } from "./throw.js";
import { lockpick } from "./lockpick.js";

export const CLIPS = Object.freeze({
  pickup,
  drop,
  // `throw` is a reserved word, so the binding is throwClip while the public
  // clip name stays 'throw'.
  throw: throwClip,
  lockpick,
});

/** Populates the harness clip dropdown. */
export const CLIP_NAMES = Object.freeze(Object.keys(CLIPS));

/** Returns null for an unknown name rather than throwing - see getPose(). */
export function getClip(name) {
  return Object.prototype.hasOwnProperty.call(CLIPS, name) ? CLIPS[name] : null;
}
