import * as THREE from 'three';

/**
 * ALREADY THERE: the light comes on and its face is a hand from yours.
 * Fits anywhere -- it does not move to get to you, so it needs no room.
 *
 *   0.00  black, and something breathing, close
 *   0.75  the light catches, once -- and it is already there, its face a
 *         hand's breadth from the lens, perfectly still, looking at you
 *   1.10  its head SNAPS over, and it screams: the red tunnel, the jolt
 *   1.10+ it twitches there, the light stuttering, the picture strobing
 *   1.95  black, and the scream is cut dead
 *
 * The stillness is the scare. For a third of a second nothing moves -- not
 * the body's breath, not a twitch -- which a living thing never does.
 */

const BREATH_AT = 0.05;
const BREATH_SECONDS = 0.9;
const REVEAL_AT = 0.75;
const SNAP_AT = 1.1;
/** Metres from the lens to its face. */
const FACE_DISTANCE = 0.2;
/** Bent down to you, and its head a little over even while it is still. */
const HUNCH = 0.45;
const STILL_COCK = 0.12;
const SNAP_COCK = 0.55;
const STROBES = [[1.4, 0.05], [1.58, 0.05], [1.74, 0.06]];
const SHAKE_RADIANS = 0.08;
const ZOOM_FOV = 50;

export const alreadyThere = {
  name: 'alreadyThere',
  seconds: 1.95,
  room: 0.9,

  start() {
    this.breathed = false;
    this.posed = false;
  },

  frame(rig, t, dt) {
    const { creature, faceLight } = rig;
    if (!this.breathed && t >= BREATH_AT) {
      this.breathed = true;
      rig.audio.growl(BREATH_SECONDS);
    }
    if (!creature.visible && t >= REVEAL_AT) rig.reveal();
    const snapped = t >= SNAP_AT;
    if (snapped) rig.scream();

    // Frozen until the snap: update(0) poses the body without advancing its
    // clock, so not even its breathing moves.
    creature.setSpeed(0);
    creature.update(snapped ? dt : 0);
    const snap = THREE.MathUtils.smoothstep(t, SNAP_AT, SNAP_AT + 0.06);
    rig.pose({
      curl: HUNCH,
      cock: THREE.MathUtils.lerp(STILL_COCK, SNAP_COCK, snap),
      twitch: snapped ? rig.twitch(t, 1.3) : null
    });
    rig.placeFace(FACE_DISTANCE);
    rig.lowerFace(1);
    rig.keepUnderCeiling();

    if (snapped) rig.postFX.setCaught(1);
    const shake = snapped ? SHAKE_RADIANS * Math.exp(-(t - SNAP_AT) * 3) + 0.006 : 0;
    rig.aim(rig.face(), { shake });
    rig.setFov(THREE.MathUtils.lerp(rig.startFov, ZOOM_FOV, snap));
    // One steady catch of light while it is still; a stutter once it moves.
    if (!creature.visible) faceLight.intensity = 0;
    else if (!snapped) faceLight.intensity = 2.8;
    else faceLight.intensity = Math.random() < 0.18 ? 0.4 : 4.5 + Math.random() * 3;
    if (snapped) rig.strobe(t, STROBES);
  }
};
