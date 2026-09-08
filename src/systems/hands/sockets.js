/**
 * Attachment points - where held objects actually live.  [owner: Hands]
 *
 * A socket is an empty Object3D parented into the rig at a hand-authored
 * position and orientation. Attaching a prop means parenting its mesh to a
 * socket; from then on the prop inherits the hand's motion for free, including
 * every additive layer (breathe, sway, bob, tremor) with no extra code. That is
 * the whole reason sockets are nodes in the hierarchy rather than a transform
 * computed per frame - a computed version would need to re-derive the full
 * animated transform every frame and would drift out of sync by one frame.
 *
 * WHY FOUR SOCKETS AND NOT ONE
 * Different objects are held in fundamentally different ways, and the difference
 * is what makes holding read as holding: a torch sits in a closed fist along the
 * palm axis, a key is pinched between two fingertips, a photograph rests on an
 * open palm. One socket plus per-prop offsets would push that tuning into forty
 * prop files instead of four socket definitions.
 *
 * ORIENTATION CONVENTION (matters for every prop the team models)
 *   grip  - +Y runs along the cylinder axis, out of the top of the fist. A
 *           torch modelled with its beam down +Y and its origin at the point
 *           the hand grips drops in with no per-prop tuning.
 *   pinch - +Y away from the fingertips, origin at the pinch point itself.
 *   flat  - +Y is the palm normal (up, out of the open palm); the object's
 *           origin is the centre of its resting face.
 *   palm  - +Y is the palm normal. Used for pressing and bracing, so the
 *           origin is the contact surface, not the object centre.
 * Unit 8 builds the placeholder props that pin this convention down and
 * documents it against real geometry.
 *
 * Unit 0 status: names are FINAL. Node construction is a stub - Unit 8.
 */

import * as THREE from "three";

import { JOINTS } from "./rig.js";

/**
 * Canonical socket names. The values are the strings the public API accepts in
 * `hands.attach(side, obj, 'grip')` and `hands.getSocket(side, 'grip')`.
 *
 * These are deliberately NOT prefixed with "socket." at the API surface even
 * though the brief's node names are `socket.grip` etc. The node in the scene
 * graph is named `socket.grip` (so it is unmistakable in a Three.js inspector
 * or a Blender export); the API takes the short form because
 * `attach(side, obj, 'socket.grip')` reads as stuttering noise at forty call
 * sites. SOCKET_NODE_NAMES maps between them.
 */
export const SOCKETS = Object.freeze({
  GRIP: "grip",
  PINCH: "pinch",
  FLAT: "flat",
  PALM: "palm",
});

export const SOCKET_NAMES = Object.freeze([
  SOCKETS.GRIP,
  SOCKETS.PINCH,
  SOCKETS.FLAT,
  SOCKETS.PALM,
]);

/** Public short name -> scene-graph node name. */
export const SOCKET_NODE_NAMES = Object.freeze({
  [SOCKETS.GRIP]: "socket.grip",
  [SOCKETS.PINCH]: "socket.pinch",
  [SOCKETS.FLAT]: "socket.flat",
  [SOCKETS.PALM]: "socket.palm",
});

/**
 * Which joint each socket hangs off.
 *
 * `pinch` parents to the INDEX fingertip rather than sitting between the thumb
 * and index tips as a computed midpoint. A midpoint would be more anatomically
 * honest, but it cannot be a static node, and a pinched key that lags the
 * fingers by a frame looks like it is falling out of the hand. Parenting to one
 * fingertip and authoring the pinch pose so the thumb closes onto it gives the
 * same read with none of the cost.
 */
export const SOCKET_PARENTS = Object.freeze({
  [SOCKETS.GRIP]: JOINTS.WRIST,
  [SOCKETS.PINCH]: JOINTS.INDEX_03,
  [SOCKETS.FLAT]: JOINTS.WRIST,
  [SOCKETS.PALM]: JOINTS.WRIST,
});

export function isSocket(name) {
  return name === SOCKETS.GRIP || name === SOCKETS.PINCH || name === SOCKETS.FLAT || name === SOCKETS.PALM;
}

/* ------------------------------------------------------ measuring the hand */

/**
 * Real-world sizes the sockets are built around, in metres.
 *
 * BARREL_R is 35 mm across because poses/grip-cylinder.js authors the grip pose
 * against a 35 mm tube and blender/build_flashlight.py builds the torch to it.
 */
const BARREL_R = 0.0175;

/**
 * VIEW-MODEL MAGNIFICATION for whatever is in the grip socket.
 *
 * A torch modelled at true size is correct in the world and reads as slightly
 * mean in the hand: at 220 mm against a 190 mm hand it disappears into the fist
 * on a small window. Held props are scaled up a little for legibility, which is
 * ordinary first-person practice - the object the player is meant to feel they
 * are carrying wins over the tape measure.
 *
 * EXPORTED because main.js has to scale the held torch by exactly this, and the
 * grip pose is fitted to the barrel radius it produces. All three move
 * together; changing it here alone will leave the fingers gripping thin air.
 */
export const HELD_MAGNIFICATION = 1.25;

/** The barrel radius the fingers actually close around, once magnified. */
const GRIP_BARREL_R = BARREL_R * HELD_MAGNIFICATION;

/** Air between the palm surface and the barrel's skin. */
const PALM_CLEARANCE = 0.0025;
/** How far up the palm a gripped barrel sits, as a fraction of wrist->knuckles. */
const GRIP_ALONG = 0.70;

/**
 * Where the palm's SURFACE is, as a fraction of the hand's own length, measured
 * along the palm normal from the wrist bone's origin.
 *
 * This exists because the wrist bone sits INSIDE the wrist, not on the skin. An
 * earlier pass lifted the barrel by (radius + clearance) from the bone and the
 * torch visibly sank into the palm -- measured on the current asset's skinned
 * mesh, the surface is 36 mm out from the bone, so the barrel was 26 mm under
 * it. buildSockets only receives the rig and never the mesh, so the number has
 * to be carried as a ratio rather than re-measured here; expressing it against
 * hand length at least keeps it scale-free.
 */
const PALM_SURFACE_FRACTION = 0.1893;

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Derives the hand's own frame from the LIVE rig, in wrist-local space.
 *
 * MEASURED, NOT TABULATED, for the same reason hand-mesh.js derives its
 * alignment instead of baking it: the rig is adopted from an imported armature
 * (see adoptRig), so rig.js's RIG_SPEC no longer describes the bones that
 * actually exist, and their axes are whatever the asset's author used. Anything
 * hard-coded here would silently rot the moment the hand asset is swapped -
 * which is exactly what the upgrade seam in README.md promises will be cheap.
 *
 * Returns null if the landmark joints are missing, so a partially mapped
 * armature degrades to "no sockets" rather than to sockets in nonsense places.
 */
function measureHand(rig) {
  const wrist = rig?.joints?.get(JOINTS.WRIST);
  const need = [JOINTS.INDEX_01, JOINTS.MIDDLE_01, JOINTS.RING_01, JOINTS.PINKY_01, JOINTS.MIDDLE_03];
  if (!wrist || need.some((n) => !rig.joints.get(n))) return null;

  rig.root?.updateMatrixWorld(true);
  const toWrist = _m.copy(wrist.matrixWorld).invert().clone();
  const at = (name) => new THREE.Vector3()
    .setFromMatrixPosition(rig.joints.get(name).matrixWorld).applyMatrix4(toWrist);

  const kIndex = at(JOINTS.INDEX_01);
  const kPinky = at(JOINTS.PINKY_01);
  const knuckles = kIndex.clone().add(at(JOINTS.MIDDLE_01)).add(at(JOINTS.RING_01)).add(kPinky)
    .multiplyScalar(0.25);
  if (knuckles.lengthSq() < 1e-12) return null;

  // forward: wrist -> the middle of the knuckles
  const forward = knuckles.clone().normalize();
  // side: pinky knuckle -> index knuckle, which is the direction a torch beam
  // (or a hammer head) leaves the top of a closed fist. Gram-Schmidt'd, because
  // the raw knuckle line sits about 10 degrees off perpendicular and an oblique
  // basis would tilt every socket built from it.
  let side = kIndex.clone().sub(kPinky);
  side.addScaledVector(forward, -side.dot(forward));
  if (side.lengthSq() < 1e-12) return null;
  side.normalize();
  // palm normal, signed so it points out of the PALM rather than the back of
  // the hand: the thumb is on the palm side, so its tip settles the sign.
  const normal = new THREE.Vector3().crossVectors(forward, side).normalize();
  const thumb = rig.joints.get(JOINTS.THUMB_02);
  if (thumb) {
    const t = new THREE.Vector3().setFromMatrixPosition(thumb.matrixWorld).applyMatrix4(toWrist);
    if (t.sub(knuckles).dot(normal) < 0) normal.negate();
  }

  /**
   * The scale a socket's children would otherwise inherit.
   *
   * alignHand() rescales the whole hand to TARGET_HAND_LENGTH, and a socket
   * parented to a bone sits INSIDE that scale - measured at 1.68x on the
   * current asset, which would render a 0.22 m torch as a 0.37 m one. Every
   * socket therefore carries the reciprocal, so a prop modelled at true
   * real-world size attaches at true real-world size and "no per-prop tuning"
   * stays true.
   */
  wrist.matrixWorld.decompose(_p, _q, _s);
  const inherited = (Math.abs(_s.x) + Math.abs(_s.y) + Math.abs(_s.z)) / 3;
  const unscale = inherited > 1e-9 ? 1 / inherited : 1;

  // hand length, the yardstick every ratio below is expressed against
  const handLen = at(JOINTS.MIDDLE_03).length();

  return {
    forward,
    side,
    normal,
    knuckleDist: knuckles.length(),
    handLen,
    palmSurface: handLen * PALM_SURFACE_FRACTION,
    unscale,
    /** metres -> wrist-local units */
    toLocal: (metres) => metres * unscale,
  };
}

/**
 * Bone axis in a joint's OWN local space, i.e. which way the segment points.
 *
 * Taken from the first child's local offset, falling back to the joint's own
 * offset from its parent. Both read +Y on the current asset; neither is
 * assumed, because a different rig may well run its bones down -Z.
 */
function boneAxisLocal(joint) {
  const kid = joint.children?.find((c) => c.position.lengthSq() > 1e-12
    && c.position.length() < joint.position.length() * 4 + 0.05);
  const src = kid ?? joint;
  return src.position.lengthSq() > 1e-12
    ? src.position.clone().normalize()
    : new THREE.Vector3(0, 1, 0);
}

/** Builds a node whose local +Y is `up`, with `fwdHint` breaking the roll tie. */
function orientedNode(name, position, up, fwdHint, scale) {
  const node = new THREE.Object3D();
  node.name = name;
  node.position.copy(position);

  const y = up.clone().normalize();
  let z = fwdHint.clone();
  z.addScaledVector(y, -z.dot(y));
  if (z.lengthSq() < 1e-12) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();
  node.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
  node.scale.setScalar(scale);
  return node;
}

/**
 * Creates the four socket nodes and parents them into a rig.
 *
 * `grip` is FITTED: its axis is placed where a 35 mm barrel actually sits in a
 * closed fist, and poses/grip-cylinder.js was solved against this exact
 * placement (all five digits land on the barrel's surface, wrapped, none
 * penetrating). The other three are derived from the same measured basis and
 * honour the orientation contract above, but nothing exercises them yet, so
 * treat their offsets as a starting point rather than as tuned values.
 *
 * @param {object} params
 * @param {ReturnType<import('./rig.js').buildRig>} params.rig
 * @param {import('./rig.js').HandSide} params.side
 * @returns {{
 *   sockets: Map<string, import('three').Object3D>,
 *   dispose(): void
 * }}
 */
export function buildSockets({ rig, side } = {}) {
  const sockets = new Map();
  const hand = rig ? measureHand(rig) : null;

  if (hand) {
    const { forward, side: lateral, normal, knuckleDist, palmSurface, unscale, toLocal } = hand;

    /* ---- grip: a barrel across the palm, beam out of the top of the fist ----
     * Lifted from the palm SURFACE, not from the wrist bone, so the barrel
     * rests on the hand instead of inside it. poses/grip-cylinder.js is fitted
     * to exactly this placement. */
    const gripPos = forward.clone().multiplyScalar(knuckleDist * GRIP_ALONG)
      .addScaledVector(normal, palmSurface + toLocal(GRIP_BARREL_R + PALM_CLEARANCE));
    sockets.set(
      SOCKETS.GRIP,
      orientedNode(SOCKET_NODE_NAMES[SOCKETS.GRIP], gripPos, lateral, normal, unscale),
    );

    /* ---- flat / palm: +Y is the palm normal, so an object rests face-up.
     * Both sit ON the palm surface: `palm` is the contact point for pressing
     * and bracing, `flat` a shade proud of it so a resting object's underside
     * does not z-fight with the skin. */
    const palmPos = forward.clone().multiplyScalar(knuckleDist * 0.5)
      .addScaledVector(normal, palmSurface);
    sockets.set(
      SOCKETS.PALM,
      orientedNode(SOCKET_NODE_NAMES[SOCKETS.PALM], palmPos, normal, forward, unscale),
    );
    sockets.set(
      SOCKETS.FLAT,
      orientedNode(
        SOCKET_NODE_NAMES[SOCKETS.FLAT],
        forward.clone().multiplyScalar(knuckleDist * 0.55)
          .addScaledVector(normal, palmSurface + toLocal(0.001)),
        normal,
        forward,
        unscale,
      ),
    );

    /* ---- pinch: at the index fingertip, +Y away from the fingertips ---- */
    const indexTip = rig.joints.get(JOINTS.INDEX_03);
    if (indexTip) {
      const axis = boneAxisLocal(indexTip);
      // the distal segment's own length is not recorded on a tip joint, so its
      // offset from the joint before it is the best available stand-in
      const reach = indexTip.position.length() || toLocal(0.018);
      sockets.set(
        SOCKETS.PINCH,
        orientedNode(
          SOCKET_NODE_NAMES[SOCKETS.PINCH],
          axis.clone().multiplyScalar(reach),
          axis,
          new THREE.Vector3(0, 0, 1),
          unscale,
        ),
      );
    }

    for (const [name, node] of sockets) {
      const parent = rig.joints.get(SOCKET_PARENTS[name]);
      if (parent) parent.add(node);
      else sockets.delete(name);
    }
  }

  void side;
  return {
    /** Short socket name -> node. */
    sockets,
    dispose() {
      for (const node of this.sockets.values()) {
        node.removeFromParent();
        node.clear();
      }
      this.sockets.clear();
    },
  };
}
