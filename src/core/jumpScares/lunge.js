import * as THREE from 'three';

/**
 * THE LUNGE: it rushes your face.
 *
 *   0.00  black
 *   0.08  it is there, two and a half metres off, lit from below
 *   0.10  the scream starts, and it LUNGES: to a hand's breadth from the lens
 *         in a fifth of a second, accelerating, because nothing that fast
 *         decelerates politely
 *   0.30  impact: the view jolts, zooms onto the face, the red tunnel closes
 *   0.30+ it holds there, twitching and breathing at you, while the picture
 *         strobes to black three times
 *   1.30  black, and the scream is cut dead
 *
 * It comes in bent over, not upright: at its full height its head is in a
 * low ceiling, and the camera would have to look up its neck.
 */

const REVEAL_AT = 0.08;
const LUNGE_START = 0.1;
const LUNGE_END = 0.3;
/** Metres from the lens to the face: where it appears, and where it stops. */
const START_DISTANCE = 2.6;
const END_DISTANCE = 0.3;
/** It runs in, then the run eases out over this long rather than stopping in a frame. */
const RUN_SPEED = 6;
const RUN_SETTLE_SECONDS = 0.15;
/** Bent forward as it comes (radians down the whole spine), and further as it stoops into your face. */
const HUNCH = 0.35;
const STOOP_CURL = 0.35;
/** Its head over on one side once it is on you: the least human thing a face can do. */
const HEAD_COCK = 0.42;
/** Seconds into the scare that the picture drops to black, and for how long. */
const STROBES = [[0.62, 0.06], [0.8, 0.045], [1.0, 0.07]];
const ZOOM_FOV = 40;
const SHAKE_RADIANS = 0.07;

const easeInCubic = (t) => t * t * t;

export const lunge = {
  name: 'lunge',
  seconds: 1.3,
  /** Metres of clear floor it needs in front of the lens. */
  room: START_DISTANCE + 0.4,

  frame(rig, t, dt) {
    const { creature, faceLight } = rig;
    if (!creature.visible && t >= REVEAL_AT) rig.reveal();
    if (t >= LUNGE_START) rig.scream();

    let distance;
    if (t < LUNGE_START) {
      distance = START_DISTANCE;
    } else if (t < LUNGE_END) {
      distance = START_DISTANCE - (START_DISTANCE - END_DISTANCE) * easeInCubic((t - LUNGE_START) / (LUNGE_END - LUNGE_START));
    } else {
      // A breath pushing it at you.
      distance = END_DISTANCE + Math.sin(t * 9) * 0.025;
    }
    const settle = THREE.MathUtils.smoothstep(t, LUNGE_END, LUNGE_END + RUN_SETTLE_SECONDS);
    creature.setSpeed(RUN_SPEED * (1 - settle));
    creature.update(dt);

    // It stoops over the second half of the lunge, as it closes.
    const lungeProgress = THREE.MathUtils.clamp((t - LUNGE_START) / (LUNGE_END - LUNGE_START), 0, 1);
    const stoop = THREE.MathUtils.smoothstep(lungeProgress, 0.45, 1);
    const impacted = t >= LUNGE_END;
    rig.pose({
      curl: HUNCH + STOOP_CURL * stoop,
      cock: HEAD_COCK * stoop,
      twitch: impacted ? rig.twitch(t) : null
    });
    rig.placeFace(distance);
    rig.lowerFace(stoop);
    rig.keepUnderCeiling();

    if (impacted) rig.postFX.setCaught(1);
    // Shake: hard on impact, dying away, never quite still.
    const sinceImpact = Math.max(0, t - LUNGE_END);
    const shake = impacted ? SHAKE_RADIANS * Math.exp(-sinceImpact * 3.2) + 0.006 : 0.008;
    rig.aim(rig.face(), { shake });

    // Zoom onto the face after the hit.
    rig.setFov(THREE.MathUtils.lerp(rig.startFov, ZOOM_FOV, impacted ? Math.min(1, sinceImpact / 0.22) : 0));
    // The up-light comes on with it and flickers.
    faceLight.intensity = creature.visible ? (impacted ? 5.5 + Math.random() * 2.5 : 3.5) : 0;
    if (creature.visible) rig.strobe(t, STROBES);
  }
};
