/**
 * Pose registry.  [owner: Hands]
 *
 * Poses are DATA, deliberately kept as plain modules so they can be tweaked
 * without touching engine code and so a non-programmer on the team can adjust
 * one. The dev harness's "copy pose as JSON" button emits exactly the shape
 * these files hold, so authoring a pose is: drag joints in the harness, copy,
 * paste into the module, register below.
 *
 * A pose maps joint name -> [x, y, z] Euler in RADIANS, and lists ONLY the
 * joints that differ from rest. That is what makes poses composable: a pose that
 * touches only the thumb can be applied over one that sets the fingers.
 *
 * REGISTRY KEYS ARE THE PUBLIC NAMES. `hands.setPose('right', 'grip-cylinder')`
 * uses the hyphenated key; the JS binding is camelCase because an identifier
 * cannot contain a hyphen. Keep the two in step.
 */

import { relaxed } from "./relaxed.js";
import { open } from "./open.js";
import { fist } from "./fist.js";
import { point } from "./point.js";
import { pinch } from "./pinch.js";
import { gripCylinder } from "./grip-cylinder.js";
import { holdTorch } from "./hold-torch.js";
import { gripFlat } from "./grip-flat.js";
import { reach } from "./reach.js";
import { press } from "./press.js";
import { brace } from "./brace.js";

export const POSES = Object.freeze({
  relaxed,
  open,
  fist,
  point,
  pinch,
  "grip-cylinder": gripCylinder,
  "hold-torch": holdTorch,
  "grip-flat": gripFlat,
  reach,
  press,
  brace,
});

/** Populates the harness pose dropdown. */
export const POSE_NAMES = Object.freeze(Object.keys(POSES));

/**
 * Looks up a pose by name, returning null for an unknown one.
 *
 * Returning null rather than throwing is deliberate: a typo'd pose name must not
 * take down the frame in the middle of a demo. Hands warns once and carries on.
 */
export function getPose(name) {
  return Object.prototype.hasOwnProperty.call(POSES, name) ? POSES[name] : null;
}
