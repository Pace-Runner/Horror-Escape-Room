import * as THREE from 'three';

/**
 * THE CEILING DROP: it comes down out of the tiles, upside down, into your
 * face. Needs a drop ceiling to come out of, so it is only played where the
 * caller says how high the ceiling is (the backrooms).
 *
 *   0.00  black
 *   0.08  the corridor, empty; something shifts in the ceiling above
 *   0.12  the view drifts up toward the sound
 *   0.42  a tile goes, and it swings down, head first, upside down, until its
 *         face hangs level with yours a forearm away; the scream starts
 *   0.58  it stops dead and bounces on whatever is holding it: the red tunnel
 *   0.58+ it hangs there, swaying, its head working, the picture strobing
 *   1.75  black, and the scream is cut dead
 *
 * Upside down is the root turned half over about its own left-right axis;
 * everything above the ceiling plane is hidden by the ceiling itself, which is
 * one unbroken surface, so it comes THROUGH the tiles with nothing to cut.
 */

const REVEAL_AT = 0.08;
const CREAK_AT = 0.12;
const DROP_AT = 0.42;
const DROP_END = 0.58;
/** Where its face hangs: this far in front of the lens, this far under it. */
const HANG_DISTANCE = 0.42;
const HANG_BELOW_EYE = 0.02;
/** The look up toward the sound, before it drops. */
const LOOK_UP_PITCH = 0.32;
/** Its face starts this far above the ceiling plane, so it comes through rather than appears on it. */
const START_ABOVE_CEILING = 0.35;
/** The bounce at the bottom: metres, and how fast it dies. */
const BOUNCE_METRES = 0.09;
const BOUNCE_DAMPING = 7;
const BOUNCE_RATE = 21;
/** The sway as it hangs. */
const SWAY_METRES = 0.03;
const HEAD_COCK = 0.35;
const STROBES = [[1.0, 0.05], [1.2, 0.05], [1.38, 0.06]];
const SHAKE_RADIANS = 0.06;
const ZOOM_FOV = 46;

const easeInQuad = (t) => t * t;

const upright = new THREE.Vector3();
const headAt = new THREE.Vector3();

export const ceilingDrop = {
  name: 'ceilingDrop',
  seconds: 1.75,
  room: 1,
  needsCeiling: true,

  start(rig) {
    this.creaked = false;
    this.dropped = false;
    const root = rig.creature.refs.root;
    if (root) {
      this.order = root.rotation.order;
      root.rotation.order = 'YXZ';
    }
  },

  frame(rig, t, dt) {
    const { creature, faceLight, camera, eye, forward, right, ceiling } = rig;
    const root = creature.refs.root;
    if (t >= REVEAL_AT && t < DROP_AT) rig.fade.clear();
    if (!this.creaked && t >= CREAK_AT) {
      this.creaked = true;
      rig.audio.creak();
    }
    if (!this.dropped && t >= DROP_AT) {
      this.dropped = true;
      rig.audio.thump(0.75);
      rig.reveal();
      rig.scream();
    }

    creature.setSpeed(0);
    creature.update(dt);
    const hanging = t >= DROP_END;
    rig.pose({ cock: hanging ? HEAD_COCK : 0, twitch: hanging ? rig.twitch(t) : null });

    if (root && t >= DROP_AT) {
      // Facing the lens, upside down: yaw is turned half round as well, or the
      // half turn about X leaves it facing away.
      const sway = hanging ? Math.sin(t * 5.3) * SWAY_METRES : 0;
      const wx = eye.x + forward.x * HANG_DISTANCE + right.x * sway;
      const wz = eye.z + forward.z * HANG_DISTANCE + right.z * sway;
      const yaw = Math.atan2(-(camera.position.x - wx), -(camera.position.z - wz));
      root.rotation.set(Math.PI, yaw + Math.PI, 0);
      root.position.set(wx, 0, wz);
      creature.group.updateMatrixWorld(true);
      // Line the FACE up on the lens, as placeFace does upright.
      rig.face(headAt);
      root.position.x += wx - headAt.x;
      root.position.z += wz - headAt.z;
      const below = root.position.y - headAt.y;
      // Swinging down from with its head at the ceiling to hanging at eye height.
      const fall = easeInQuad(THREE.MathUtils.clamp((t - DROP_AT) / (DROP_END - DROP_AT), 0, 1));
      const sinceStop = Math.max(0, t - DROP_END);
      const bounce = hanging ? -BOUNCE_METRES * Math.exp(-sinceStop * BOUNCE_DAMPING) * Math.sin(sinceStop * BOUNCE_RATE) : 0;
      const faceY = THREE.MathUtils.lerp(ceiling + START_ABOVE_CEILING, eye.y - HANG_BELOW_EYE, fall) + bounce;
      root.position.y = faceY + below;
      creature.group.updateMatrixWorld(true);
    }

    if (hanging) rig.postFX.setCaught(1);
    if (t < DROP_AT) {
      // Drifting up toward the noise in the ceiling.
      const up = THREE.MathUtils.smoothstep(t, CREAK_AT, DROP_AT);
      upright.copy(eye).addScaledVector(forward, 2);
      upright.y = eye.y + Math.tan(LOOK_UP_PITCH * up) * 2;
      rig.aim(upright, { maxPitchUp: LOOK_UP_PITCH });
    } else {
      const shake = hanging ? SHAKE_RADIANS * Math.exp(-(t - DROP_END) * 3) + 0.006 : 0.01;
      rig.aim(rig.face(), { shake, maxPitchUp: LOOK_UP_PITCH });
    }
    rig.setFov(THREE.MathUtils.lerp(rig.startFov, ZOOM_FOV, hanging ? Math.min(1, (t - DROP_END) / 0.25) : 0));
    faceLight.intensity = creature.visible ? (hanging ? 5 + Math.random() * 2.5 : 3.5) : 0;
    if (hanging) rig.strobe(t, STROBES);
  },

  end(rig) {
    const root = rig.creature.refs.root;
    if (!root) return;
    root.rotation.set(0, root.rotation.y, 0);
    if (this.order) root.rotation.order = this.order;
    // The yaw it was given here was turned half round; whoever places it next sets its own.
    root.rotation.y = 0;
  }
};
