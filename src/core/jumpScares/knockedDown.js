import * as THREE from 'three';

/**
 * KNOCKED DOWN: it hits you, you are on the floor, and it bends down over you.
 * Fits anywhere -- it needs no more room than a body lying down.
 *
 *   0.00  black
 *   0.06  it is there, a long step off, already coming; the scream starts
 *   0.22  it hits you: the red tunnel, the view jolts
 *   0.22  you go over backwards -- the view falls to the floor, tipping up
 *         and over onto its side, and lands with a thump
 *   0.60  it is standing where you were, looking down at you, and it BENDS:
 *         down the spine, the neck, the head, until its face is over yours
 *   1.10  its head goes over and it twitches there; the picture strobes
 *   1.70  black, and the scream is cut dead
 */

const REVEAL_AT = 0.06;
const IMPACT_AT = 0.22;
const LANDED_AT = 0.6;
const BEND_END = 1.1;
/** Metres from the lens to its face, as it appears and at impact. */
const START_DISTANCE = 1.3;
const IMPACT_DISTANCE = 0.45;
const RUN_SPEED = 6;
/** Where the fall puts the lens: this far back, this high, looking this far up, rolled this far. */
const FALL_BACK_METRES = 0.45;
const FLOOR_EYE_HEIGHT = 0.32;
const FALL_ROLL = 0.35;
/** Where it stands once you are down: this far past where you stood. */
const STAND_AHEAD_METRES = 0.15;
/** Bent forward as it comes, and how far down it bends over you (radians down the whole spine). */
const HUNCH = 0.35;
const BEND_CURL = 1.55;
const HEAD_COCK = 0.5;
const STROBES = [[1.15, 0.05], [1.32, 0.05], [1.48, 0.06]];
const SHAKE_RADIANS = 0.09;
const ZOOM_FOV = 52;

const easeInQuad = (t) => t * t;
const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);

export const knockedDown = {
  name: 'knockedDown',
  seconds: 1.7,
  room: START_DISTANCE + 0.5,

  frame(rig, t, dt) {
    const { creature, faceLight, camera, eye, forward } = rig;
    if (!creature.visible && t >= REVEAL_AT) rig.reveal();
    if (t >= REVEAL_AT) rig.scream();
    const impacted = t >= IMPACT_AT;

    // The fall: back and down, eased in like a body going over.
    const fall = easeInQuad(THREE.MathUtils.clamp((t - IMPACT_AT) / (LANDED_AT - IMPACT_AT), 0, 1));
    camera.position.set(
      eye.x - forward.x * FALL_BACK_METRES * fall,
      THREE.MathUtils.lerp(eye.y, FLOOR_EYE_HEIGHT, fall),
      eye.z - forward.z * FALL_BACK_METRES * fall
    );
    if (!this.landed && t >= LANDED_AT) {
      this.landed = true;
      rig.audio.thump(0.9);
    }

    const bend = smooth((t - LANDED_AT) / (BEND_END - LANDED_AT));
    creature.setSpeed(impacted ? RUN_SPEED * (1 - smooth((t - IMPACT_AT) / 0.25)) : RUN_SPEED);
    creature.update(dt);
    rig.pose({
      curl: HUNCH + BEND_CURL * bend,
      cock: HEAD_COCK * smooth((t - BEND_END + 0.15) / 0.15),
      twitch: t >= BEND_END ? rig.twitch(t) : null
    });

    if (!impacted) {
      const closing = THREE.MathUtils.clamp((t - REVEAL_AT) / (IMPACT_AT - REVEAL_AT), 0, 1);
      rig.placeFace(THREE.MathUtils.lerp(START_DISTANCE, IMPACT_DISTANCE, closing));
    } else {
      // Standing where you were, facing you on the floor.
      const x = eye.x + forward.x * STAND_AHEAD_METRES;
      const z = eye.z + forward.z * STAND_AHEAD_METRES;
      creature.setPosition(x, z);
      creature.setYaw(Math.atan2(-(camera.position.x - x), -(camera.position.z - z)));
      creature.group.updateMatrixWorld(true);
    }
    rig.keepUnderCeiling();

    if (impacted) rig.postFX.setCaught(1);
    const shake = impacted ? SHAKE_RADIANS * Math.exp(-(t - IMPACT_AT) * 2.6) + 0.006 : 0.01;
    // Lying down you look straight up at it: no cap on the look up, and the
    // frame rolls over as you land.
    rig.aim(rig.face(), { shake, maxPitchUp: impacted ? 1.45 : undefined, roll: FALL_ROLL * fall });
    rig.setFov(THREE.MathUtils.lerp(rig.startFov, ZOOM_FOV, bend));
    faceLight.intensity = creature.visible ? (impacted ? 4.5 + Math.random() * 2.5 : 3.2) : 0;
    if (t >= BEND_END) rig.strobe(t, STROBES);
  },

  start() { this.landed = false; },
  end() { this.landed = false; }
};
