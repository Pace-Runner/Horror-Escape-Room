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

/**
 * Creates the four socket nodes and parents them into a rig.
 *
 * UNIT 8 IMPLEMENTS THIS. Returns an empty map for now, which is why
 * `hands.getSocket()` returns null in Unit 0 rather than a node.
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
  void rig;
  void side;
  return {
    /** Short socket name -> node. Empty until Unit 8. */
    sockets: new Map(),
    dispose() {
      this.sockets.clear();
    },
  };
}
