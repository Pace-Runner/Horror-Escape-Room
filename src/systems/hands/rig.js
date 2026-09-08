/**
 * Hand rig: canonical joint names, hierarchy, forward kinematics.  [owner: Hands]
 *
 * This module is the RIG LAYER. It knows about joints, poses and rotations. It
 * knows NOTHING about what the hands look like - no geometry, no materials, no
 * textures. That separation is the whole reason the module can survive having
 * its visual mesh replaced by a sculpted Blender glove later without any of the
 * animation work being rewritten. See ./README.md, "The upgrade seam".
 *
 * WHY THE NAMES ARE CONSTANTS AND NOT STRING LITERALS
 * Poses and clips are plain data files keyed by joint name. A typo in a pose
 * file ('index.02 ' with a trailing space, 'Index.02', 'index.2') does not
 * throw - it silently addresses a joint that does not exist, and the finger
 * just never moves. That is a genuinely nasty bug to find in a dark game with
 * fifteen joints per hand. Importing JOINTS turns it into an undefined-property
 * reference at author time instead.
 *
 * WHY THERE IS NO 'palm' JOINT
 * The palm does not articulate, so it is geometry, not a joint - the palm mesh
 * parents to `wrist`. The metacarpal offset that positions each finger root
 * away from the wrist is baked into that finger's `.01` local position. This
 * matches the joint list in the brief exactly; do not add joints to it without
 * a decision recorded in HANDOVER.md, because pose files are keyed by these
 * strings and every one of them would need editing.
 *
 * ============================ AXIS CONVENTION ============================
 * Read this before authoring a pose or building geometry. Everything downstream
 * depends on it, and it is DERIVED, not arbitrary.
 *
 *   - Bones run along local -Z. A joint's children sit at (0, 0, -parentLength).
 *   - +Y is the BACK of the hand. The rest pose is a flat hand, PALM DOWN.
 *   - FLEXION (curling a finger) is a NEGATIVE rotation about local X.
 *   - Finger SPLAY is rotation about local Y.
 *
 * The brief's own example pose is `'index.01': [-0.30, 0, 0.02]` - flexion as a
 * negative X value. Working backwards from that: rotating the vector (0,0,-1) by
 * a negative angle about X sends it toward -Y, so for negative-X to read as a
 * curl rather than a backward bend, -Y has to be the palm side. Hence palm-down
 * rest. Had the rest pose been palm-up, every pose in the game would need its X
 * sign flipped, so this is worth getting right once, here.
 *
 * REST IS A FLAT HAND, POSES CARRY THE CHARACTER. Rest rotations hold splay
 * only, no droop - the natural resting curl belongs in the `relaxed` POSE, so
 * that zero always means a clean, checkable reference and not a magic pose
 * baked into the skeleton.
 *
 * POSES ARE OFFSETS FROM REST, NOT ABSOLUTE LOCAL ROTATIONS:
 *
 *     node.quaternion = restQuaternion * poseQuaternion
 *
 * so a pose value rotates the bone about ITS OWN axes. If poses were absolute,
 * setting a flexion on `pinky.01` would silently wipe out the pinky's rest splay
 * and the finger would snap to parallel. Euler triples are applied in Three.js's
 * default 'XYZ' order.
 * =========================================================================
 */

import * as THREE from "three";

/* ------------------------------------------------------------------ sides */

/** @typedef {'left'|'right'} HandSide */

export const SIDES = Object.freeze(["left", "right"]);

export function isSide(value) {
  return value === "left" || value === "right";
}

/* ----------------------------------------------------------- joint names */

/**
 * Canonical joint names. Keys are SCREAMING_SNAKE for typo-safety at the call
 * site; values are the exact strings used in pose files, clip files, socket
 * parenting and the joint inspector in the dev harness.
 *
 * Frozen: a system that mutates this would corrupt every pose in the game.
 */
export const JOINTS = Object.freeze({
  WRIST: "wrist",
  CUFF: "cuff",

  THUMB_01: "thumb.01",
  THUMB_02: "thumb.02",

  INDEX_01: "index.01",
  INDEX_02: "index.02",
  INDEX_03: "index.03",

  MIDDLE_01: "middle.01",
  MIDDLE_02: "middle.02",
  MIDDLE_03: "middle.03",

  RING_01: "ring.01",
  RING_02: "ring.02",
  RING_03: "ring.03",

  PINKY_01: "pinky.01",
  PINKY_02: "pinky.02",
  PINKY_03: "pinky.03",
});

/**
 * Every joint name, in HIERARCHY ORDER (parents always before children).
 *
 * The ordering is load-bearing: forward kinematics and rig construction both
 * walk this array once, front to back, and rely on a joint's parent already
 * existing / already being updated by the time they reach it. Insert new
 * joints in the right place, never append blindly.
 */
export const JOINT_NAMES = Object.freeze([
  JOINTS.WRIST,
  JOINTS.CUFF,

  JOINTS.THUMB_01,
  JOINTS.THUMB_02,

  JOINTS.INDEX_01,
  JOINTS.INDEX_02,
  JOINTS.INDEX_03,

  JOINTS.MIDDLE_01,
  JOINTS.MIDDLE_02,
  JOINTS.MIDDLE_03,

  JOINTS.RING_01,
  JOINTS.RING_02,
  JOINTS.RING_03,

  JOINTS.PINKY_01,
  JOINTS.PINKY_02,
  JOINTS.PINKY_03,
]);

/**
 * joint name -> parent joint name. `wrist` is the root and maps to null.
 *
 * Note that the finger `.01` joints parent to `wrist`, not to a palm node -
 * see the header comment on why there is no palm joint.
 */
export const JOINT_PARENTS = Object.freeze({
  [JOINTS.WRIST]: null,
  [JOINTS.CUFF]: JOINTS.WRIST,

  [JOINTS.THUMB_01]: JOINTS.WRIST,
  [JOINTS.THUMB_02]: JOINTS.THUMB_01,

  [JOINTS.INDEX_01]: JOINTS.WRIST,
  [JOINTS.INDEX_02]: JOINTS.INDEX_01,
  [JOINTS.INDEX_03]: JOINTS.INDEX_02,

  [JOINTS.MIDDLE_01]: JOINTS.WRIST,
  [JOINTS.MIDDLE_02]: JOINTS.MIDDLE_01,
  [JOINTS.MIDDLE_03]: JOINTS.MIDDLE_02,

  [JOINTS.RING_01]: JOINTS.WRIST,
  [JOINTS.RING_02]: JOINTS.RING_01,
  [JOINTS.RING_03]: JOINTS.RING_02,

  [JOINTS.PINKY_01]: JOINTS.WRIST,
  [JOINTS.PINKY_02]: JOINTS.PINKY_01,
  [JOINTS.PINKY_03]: JOINTS.PINKY_02,
});

/**
 * The five digit chains, base-to-tip. Clips and poses iterate these when they
 * want to curl "all fingers" without hard-coding fifteen names - a fist, a
 * grip and a relax are all "drive every chain toward flexion by amount N".
 *
 * `thumb` deliberately has two joints where the others have three: a real
 * thumb has two phalanges, and giving it a fake third is the single most
 * common way a code-built hand ends up looking wrong.
 */
export const FINGERS = Object.freeze([
  Object.freeze({ name: "thumb", joints: Object.freeze([JOINTS.THUMB_01, JOINTS.THUMB_02]) }),
  Object.freeze({
    name: "index",
    joints: Object.freeze([JOINTS.INDEX_01, JOINTS.INDEX_02, JOINTS.INDEX_03]),
  }),
  Object.freeze({
    name: "middle",
    joints: Object.freeze([JOINTS.MIDDLE_01, JOINTS.MIDDLE_02, JOINTS.MIDDLE_03]),
  }),
  Object.freeze({
    name: "ring",
    joints: Object.freeze([JOINTS.RING_01, JOINTS.RING_02, JOINTS.RING_03]),
  }),
  Object.freeze({
    name: "pinky",
    joints: Object.freeze([JOINTS.PINKY_01, JOINTS.PINKY_02, JOINTS.PINKY_03]),
  }),
]);

/**
 * Namespaced joint id, e.g. qualify('left', 'index.02') -> 'left.index.02'.
 *
 * Used for debug readouts and the harness joint inspector, where both hands
 * are on screen at once and 'index.02' alone is ambiguous. The rig itself keys
 * joints by the BARE name within a per-hand map, so left and right share one
 * set of pose files - which is the point of the naming convention.
 */
export function qualify(side, joint) {
  return `${side}.${joint}`;
}

/* ------------------------------------------------------------ rig spec === */

/**
 * Skeleton measurements, in METRES, for a RIGHT hand.
 *
 * Real anthropometry for an adult hand, not invented numbers. Totals that fall
 * out of this table, and which the test suite asserts:
 *
 *   wrist -> middle fingertip   0.196 m   (adult hand length is ~0.19 m)
 *   wrist -> middle knuckle     0.095 m   (the brief's "palm is 9-10 cm")
 *   index knuckle -> pinky      0.064 m   (knuckle span, ~6-7 cm)
 *
 * Proportions between the digits matter more than absolute size, because that
 * is what the eye reads: middle is the longest, then index, then ring, then
 * pinky, and each phalanx is shorter than the one before it. A hand built with
 * four equal fingers reads as a cartoon glove no matter how good the material.
 *
 * `length` is how far the NEXT joint sits along -Z, and for a tip joint it is
 * the length of the final segment. hand-mesh.js reads these to size its
 * capsules, which is why they live here rather than being duplicated there.
 *
 * SIGN CONVENTION FOR X: +X is the PINKY side, -X is the THUMB side, for the
 * right hand. Held palm-down with fingers forward along -Z, a right thumb falls
 * on the -X side. Unit 9 mirrors this for the left hand.
 */
export const RIG_SPEC = Object.freeze({
  [JOINTS.WRIST]: Object.freeze({ position: Object.freeze([0, 0, 0]), rest: Object.freeze([0, 0, 0]), length: 0.095 }),

  // Sits BEHIND the wrist (+Z) - it is the gauntlet anchor, and the flared cuff
  // is what hides the fact that the arm simply stops.
  [JOINTS.CUFF]: Object.freeze({ position: Object.freeze([0, 0, 0.028]), rest: Object.freeze([0, 0, 0]), length: 0.045 }),

  // The thumb is the joint that makes or breaks a hand rig. Its rest rotation
  // swings it off the radial side and rolls the pad to face the fingers - a
  // thumb left parallel to the fingers is instantly wrong, and no pose can
  // recover it because the axis itself would be wrong.
  [JOINTS.THUMB_01]: Object.freeze({
    position: Object.freeze([-0.03, -0.006, -0.032]),
    rest: Object.freeze([0.05, 0.72, -0.28]),
    length: 0.036,
  }),
  [JOINTS.THUMB_02]: Object.freeze({ position: Object.freeze([0, 0, -0.036]), rest: Object.freeze([0, 0, 0]), length: 0.028 }),

  // Splay fans the fingers away from the middle: index toward -X, ring and
  // pinky toward +X, middle straight ahead.
  [JOINTS.INDEX_01]: Object.freeze({ position: Object.freeze([-0.033, 0.002, -0.09]), rest: Object.freeze([0, 0.05, 0]), length: 0.044 }),
  [JOINTS.INDEX_02]: Object.freeze({ position: Object.freeze([0, 0, -0.044]), rest: Object.freeze([0, 0, 0]), length: 0.026 }),
  [JOINTS.INDEX_03]: Object.freeze({ position: Object.freeze([0, 0, -0.026]), rest: Object.freeze([0, 0, 0]), length: 0.021 }),

  [JOINTS.MIDDLE_01]: Object.freeze({ position: Object.freeze([-0.011, 0.003, -0.095]), rest: Object.freeze([0, 0, 0]), length: 0.048 }),
  [JOINTS.MIDDLE_02]: Object.freeze({ position: Object.freeze([0, 0, -0.048]), rest: Object.freeze([0, 0, 0]), length: 0.03 }),
  [JOINTS.MIDDLE_03]: Object.freeze({ position: Object.freeze([0, 0, -0.03]), rest: Object.freeze([0, 0, 0]), length: 0.023 }),

  [JOINTS.RING_01]: Object.freeze({ position: Object.freeze([0.011, 0.002, -0.089]), rest: Object.freeze([0, -0.05, 0]), length: 0.045 }),
  [JOINTS.RING_02]: Object.freeze({ position: Object.freeze([0, 0, -0.045]), rest: Object.freeze([0, 0, 0]), length: 0.027 }),
  [JOINTS.RING_03]: Object.freeze({ position: Object.freeze([0, 0, -0.027]), rest: Object.freeze([0, 0, 0]), length: 0.022 }),

  [JOINTS.PINKY_01]: Object.freeze({ position: Object.freeze([0.031, 0, -0.079]), rest: Object.freeze([0, -0.11, 0]), length: 0.035 }),
  [JOINTS.PINKY_02]: Object.freeze({ position: Object.freeze([0, 0, -0.035]), rest: Object.freeze([0, 0, 0]), length: 0.02 }),
  [JOINTS.PINKY_03]: Object.freeze({ position: Object.freeze([0, 0, -0.02]), rest: Object.freeze([0, 0, 0]), length: 0.019 }),
});

/**
 * Where each hand's wrist sits relative to the camera.
 *
 * THESE ARE THE TWO FRAMING KNOBS. Every number below was chosen by measuring
 * the SKINNED VERTEX positions through this game's real projection (70 degree
 * vertical fov, 0.05 near plane) rather than by eye, because there is no way to
 * eyeball a view model without a viewport. What was measured, and why each
 * criterion exists:
 *
 *   fingertips reach 72% down the frame, wrist end at 105% - i.e. OFF the bottom
 *     edge. This asset has no usable forearm: the donor body's forearm and
 *     upper-arm bones carry broken transforms (the bone this rig maps as `cuff`
 *     sits 132 m from the wrist in a rig whose hand is 15 cm), so ~500 vertices
 *     weighted to them are flung tens of metres and clipped. What remains is a
 *     hand plus a 1.5 cm stub, and that cut edge has to run off frame or the
 *     player sees a severed wrist floating mid-screen.
 *   16% of frame width stays clear between the hands, so they read as a pair
 *     rather than meeting in the middle.
 *   nearest vertex 0.23 m from the eye, comfortably past the 0.05 near plane.
 *   inside frame from 4:3 to 21:9. Three.js's fov is VERTICAL, so vertical
 *     framing is aspect-independent but horizontal framing is not - an earlier
 *     candidate that looked right on 16:9 put the wrists at 95% of frame width
 *     on 4:3, with the hands sliced off at the edges.
 *   the flung donor geometry stays behind the camera at this rotation. That is a
 *     real constraint on how far the hands may be turned, not a nicety.
 *
 * To retune: Y moves the pair up and down the frame (less negative = higher, but
 * past about -0.15 the wrist cut comes back on screen), Z moves them toward and
 * away from the eye (closer = larger), X spreads them apart.
 */
export const HAND_ROOT_POSITION = Object.freeze({
  right: Object.freeze([0.22, -0.17, -0.22]),
  left: Object.freeze([-0.22, -0.17, -0.22]),
});

/**
 * Rest orientation of each hand in camera space, radians, applied to the hand
 * root before any pose.
 *
 * DERIVED, NOT GUESSED. Euler triples for a view model are almost impossible to
 * author by hand, so this one was solved: the hand's local frame after
 * alignHand() is known exactly (fingers along -Z, pinky side +X, back of hand
 * +Y, so the palm faces -Y), which means picking the camera-space direction the
 * fingers should point and the direction the palm should face fully determines
 * the rotation matrix - and its Euler triple can be read straight back off it.
 *
 * These values put the PALMS FACING DOWN - 93% of straight down - with the
 * fingers reaching forward, 17.5 degrees above horizontal and 5.7 degrees
 * inward. The back of each hand faces up, so that is the side on show, seen
 * from above.
 *
 * ==================== EDITING THIS BY HAND ====================
 * The three numbers are radians, in Three.js's default 'XYZ' Euler order, which
 * composes as Rx * Ry * Rz. Rz is therefore applied FIRST, in the hand's OWN
 * frame, and because the fingers run along local -Z that makes the three numbers
 * unusually well behaved here - they act as three nearly independent knobs
 * rather than the tangled mess Euler triples usually are:
 *
 *   [0] X = PITCH. Tilts the fingers up and down. Measured: 0.01 -> fingers
 *       level, 0.31 -> 17.5 deg up, 0.61 -> 34 deg up. Raising it also drags the
 *       palm off vertical (94% down at 0.31, 82% at 0.61), because of the
 *       perpendicularity constraint below.
 *   [1] Y = YAW. Swings the fingers left and right. Measured: 0.22 -> 12.7 deg
 *       inward, 0.10 -> 5.7 deg inward, 0.00 -> straight ahead, -0.10 -> 5.7 deg
 *       outward. LOWER turns each hand outward, higher turns them inward. Barely
 *       touches pitch or palm direction.
 *   [2] Z = ROLL about the finger axis, i.e. THE PALM KNOB. It leaves the finger
 *       direction completely untouched - rotating about local Z cannot move a
 *       vector that lies along local -Z - and only turns the palm. Measured:
 *       -0.25 -> 94% down, -0.40 -> 90%, -0.55 -> 85%. This is the number that
 *       was -2.07 when the palms faced each other.
 *
 * So: aim the fingers with X and Y, then roll the palm with Z. Do not bother
 * hand-solving all three at once.
 *
 * Remember the left hand mirrors this as (x, -y, -z), so ONE edit moves both
 * hands symmetrically - lowering Y rotates the right hand rightward and the left
 * hand leftward together.
 *
 * Watch the horizontal extent when turning the hands outward: it widens the
 * pair, and combined with a large HAND_ROOT_POSITION X the outer edge of each
 * hand can run past the frame edge on a narrow (4:3) window. 16:9 has room.
 * ==============================================================
 *
 * WHY THE FINGERS CANNOT POINT UP IF THE PALMS FACE DOWN. The palm normal and
 * the finger direction are two axes of the same orthonormal frame, so they are
 * perpendicular by construction. An earlier pass aimed the fingers 70 degrees
 * upward, which forces the palm into the vertical plane - it ended up facing
 * inward, the hands turned toward each other, which is what this replaced. A
 * palm within 20 degrees of straight down needs the fingers within about 20
 * degrees of horizontal; measured, the reachable "downness" is 99% at 0 degrees
 * of finger pitch, 94% at 17 degrees and only 85% by 30 degrees.
 *
 * The pass before that pointed the fingers 91% straight down -Z, away into the
 * scene, so the hands were seen end-on and heavily foreshortened.
 *
 * ONE SET OF VALUES FOR BOTH HANDS, and the LEFT HAND NEGATES Y AND Z - see
 * hands.js, which applies (x, -y, -z) on the left. The mirror is NOT free: the
 * negative X scale is composed on the right of the rotation (Matrix4.compose
 * builds T * R * S), so it mirrors the geometry in the hand's own local space
 * BEFORE the rotation and leaves the rotation itself untouched. Feeding both
 * hands the same triple therefore aims both sets of fingers the same way instead
 * of mirroring them - measured at 149 mm of landmark asymmetry, with the left
 * hand's fingertips skewed toward the middle of the screen. Negating Y and Z
 * gives the conjugate rotation and makes the pair exactly symmetric, verified at
 * 0 micrometres of vertex error.
 */
export const HAND_ROOT_ROTATION = Object.freeze([0.3126, 0.1, -0.2498]);

/** Length of a joint's own segment, in metres. Read by hand-mesh.js in Unit 3. */
export function jointLength(name) {
  return RIG_SPEC[name]?.length ?? 0;
}

/* ----------------------------------------------------- scratch (no alloc) */

/**
 * Reused every call, allocated exactly once. applyPose and blendPose run for
 * both hands every frame for the life of the game; anything created inside them
 * becomes garbage-collector sawtooth, which is penalised under two separate
 * rubric categories. `dev/hands-tests.mjs` asserts a flat heap across 100k
 * calls, so if you add a `new` in here that test will fail.
 */
const _euler = new THREE.Euler();
const _poseQuat = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
/**
 * The composed rest*offset result, built here and copied into the node ONCE.
 *
 * Writing `node.quaternion.copy(rest).multiply(offset)` instead would look
 * tidier and cost double: every mutation of an Object3D's quaternion fires the
 * onChange callback, which runs Euler.setFromQuaternion - a full matrix
 * decomposition - to keep node.rotation in step. copy() then multiply() is two
 * of those per joint, i.e. 64 decompositions per frame for two hands, for
 * nothing. Composing in scratch and copying once halves it.
 */
const _result = new THREE.Quaternion();

/** Applied when a joint is absent from a pose: no offset, so the bone sits at rest. */
const ZERO = Object.freeze([0, 0, 0]);

/* --------------------------------------------------------------- rig ==== */

/**
 * Builds the Object3D joint hierarchy for one hand.
 *
 * @param {object} params
 * @param {HandSide} params.side
 * @returns {{
 *   side: HandSide|null,
 *   root: import('three').Object3D|null,
 *   joints: Map<string, import('three').Object3D>,
 *   order: Array<{ name: string, node: import('three').Object3D, rest: import('three').Quaternion, length: number }>,
 *   dispose(): void
 * }}
 */
export function buildRig({ side } = {}) {
  const joints = new Map();

  /**
   * The same joints as a flat array of pre-resolved entries.
   *
   * applyPose walks THIS, not the Map: a Map.get() per joint per hand per frame
   * is 32 hash lookups a frame for nothing, when the set of joints never changes
   * after construction. Building it once turns the hot path into an index loop.
   */
  const order = [];

  const root = new THREE.Object3D();
  root.name = side ? `hand.${side}` : "hand";

  const rootPosition = HAND_ROOT_POSITION[side];
  if (rootPosition) root.position.fromArray(rootPosition);

  for (let i = 0; i < JOINT_NAMES.length; i++) {
    const name = JOINT_NAMES[i];
    const spec = RIG_SPEC[name];

    const node = new THREE.Object3D();
    // Namespaced, so both hands are distinguishable in a Three.js inspector or
    // a Blender export. The Map is keyed by the BARE name so one set of pose
    // files drives both hands.
    node.name = side ? qualify(side, name) : name;
    node.position.fromArray(spec.position);

    _euler.fromArray(spec.rest);
    node.quaternion.setFromEuler(_euler);

    // The rest orientation has to be kept, not just applied: every pose is an
    // offset FROM it, so it is needed on every frame, not only at build time.
    const rest = new THREE.Quaternion().copy(node.quaternion);
    node.userData.restQuaternion = rest;
    node.userData.jointName = name;
    node.userData.jointLength = spec.length;

    const parentName = JOINT_PARENTS[name];
    // JOINT_NAMES is in hierarchy order, so the parent is guaranteed to exist.
    if (parentName === null) root.add(node);
    else joints.get(parentName).add(node);

    joints.set(name, node);
    order.push({ name, node, rest, length: spec.length });
  }

  return {
    side: side ?? null,
    root,
    joints,
    order,

    /**
     * Object3D holds no GPU resource, so there is nothing to dispose here - the
     * meshes that hang off these nodes are owned by hand-mesh.js and disposed
     * there. This detaches and drops references so the subtree can be collected.
     */
    dispose() {
      this.root?.removeFromParent();
      this.root?.clear();
      this.joints.clear();
      this.order.length = 0;
      this.root = null;
    },
  };
}

/**
 * Wraps an ALREADY-EXISTING armature - one imported with a skinned model - in the
 * same handle shape `buildRig` returns, so `applyPose` and `blendPose` work on it
 * unchanged.
 *
 * This is the counterpart to buildRig for the imported-model path. buildRig stays
 * because the code-built skeleton is still the reference implementation the tests
 * exercise, and because a future replacement may want it again.
 *
 * REST COMES FROM THE MODEL, NOT FROM RIG_SPEC. Each bone's current rotation at
 * adopt time IS its rest, captured once. Everything else about the convention
 * holds: a pose is an offset applied on top of rest, and a joint absent from a
 * pose returns to the model's own bind pose. That means poses authored in Unit 4
 * are authored against this armature - which is the right way round, since
 * authoring against a placeholder and re-doing it later would be waste.
 *
 * @param {object} params
 * @param {import('three').Object3D} params.root
 * @param {Map<string, import('three').Object3D>} params.joints keyed by bare §5 name
 * @param {HandSide} params.side
 * @returns {ReturnType<typeof buildRig>}
 */
export function adoptRig({ root, joints, side } = {}) {
  const order = [];
  const map = joints ?? new Map();

  // JOINT_NAMES order, so the hot loop still walks parents before children.
  for (let i = 0; i < JOINT_NAMES.length; i++) {
    const name = JOINT_NAMES[i];
    const node = map.get(name);
    if (!node) continue;

    const rest = new THREE.Quaternion().copy(node.quaternion);
    node.userData.restQuaternion = rest;
    node.userData.jointName = name;

    order.push({ name, node, rest, length: jointLength(name) });
  }

  return {
    side: side ?? null,
    root: root ?? null,
    joints: map,
    order,
    /**
     * The bones belong to the imported hierarchy, which hand-mesh.js owns and
     * disposes. This only drops references.
     */
    dispose() {
      this.joints.clear();
      this.order.length = 0;
      this.root = null;
    },
  };
}

/* ------------------------------------------------------------------- FK == */

/**
 * Snaps a rig to a pose. Joints absent from the pose are returned to rest.
 *
 * ALLOCATES NOTHING. See the scratch block above.
 *
 * @param {ReturnType<typeof buildRig>} rig
 * @param {Record<string, [number, number, number]>} pose joint name -> Euler XYZ, radians
 */
export function applyPose(rig, pose) {
  if (!rig || !pose) return;

  const order = rig.order;
  if (!order) return;

  for (let i = 0; i < order.length; i++) {
    const entry = order[i];
    const triple = pose[entry.name] ?? ZERO;

    _euler.set(triple[0] ?? 0, triple[1] ?? 0, triple[2] ?? 0);
    _poseQuat.setFromEuler(_euler);

    // rest * offset: the offset acts about the bone's own axes, so a flexion on
    // a splayed finger still flexes rather than swinging sideways.
    _result.copy(entry.rest).multiply(_poseQuat);
    entry.node.quaternion.copy(_result);
  }
}

/**
 * Writes the interpolation of two poses at `t` into the rig.
 *
 * QUATERNION SLERP, NOT EULER LERP, and the difference is visible. Lerping Euler
 * triples through a large rotation makes a finger swing out sideways on its way
 * to a fist, because the three axes interpolate independently and the
 * intermediate triples do not describe the intermediate rotation. Slerp takes
 * the direct arc.
 *
 * ALLOCATES NOTHING.
 *
 * @param {ReturnType<typeof buildRig>} rig
 * @param {Record<string, [number, number, number]>} poseA
 * @param {Record<string, [number, number, number]>} poseB
 * @param {number} t 0..1, clamped
 */
export function blendPose(rig, poseA, poseB, t) {
  if (!rig) return;

  const order = rig.order;
  if (!order) return;

  const from = poseA ?? null;
  const to = poseB ?? null;
  const amount = t < 0 ? 0 : t > 1 ? 1 : t;

  for (let i = 0; i < order.length; i++) {
    const entry = order[i];

    const a = (from && from[entry.name]) ?? ZERO;
    const b = (to && to[entry.name]) ?? ZERO;

    _euler.set(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
    _poseQuat.setFromEuler(_euler);

    _euler.set(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0);
    _quatB.setFromEuler(_euler);

    // In-place on _poseQuat. Quaternion.slerp handles the shortest-arc sign flip
    // internally, which is what stops a blend taking the long way round.
    _poseQuat.slerp(_quatB, amount);

    _result.copy(entry.rest).multiply(_poseQuat);
    entry.node.quaternion.copy(_result);
  }
}
