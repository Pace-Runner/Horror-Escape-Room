import * as THREE from 'three';

/**
 * THE THRASH: the stairs scare's jump scare (core/StairsScare.js, step 8). It
 * comes at you the way the animatronics do in Five Nights at Freddy's: one
 * lunge into your face, and then it shakes there -- the head going side to
 * side too fast to follow, the body rattling, the claws up at the edges of the
 * picture -- and in one second it is over.
 *
 *   0.00  black
 *   0.03  it is there, a metre and a half off and already coming; the scream
 *         starts with it
 *   0.15  impact, a hand's breadth from the lens: the view jolts and punches
 *         in, the red tunnel closes, the claws are up either side of its face
 *   0.15+ the thrash. Its head shakes "no" at 13 Hz, rolling and nodding on
 *         top; the body rattles; it pushes at the lens and the claws work.
 *         All of it steps at 24 poses a second, so it moves like a machine,
 *         not an animal
 *   0.88  a last lurch into the lens
 *   1.00  black, and the scream is cut dead
 *
 * The thrash is a function of time alone, not random twitches, so a frame
 * frozen at a moment in the browser harness shows what a played one would.
 */

const REVEAL_AT = 0.03;
const IMPACT_AT = 0.15;
/** Metres from the lens to its face: where it appears, where it hits, and where the last lurch takes it. */
const START_DISTANCE = 1.5;
const HOLD_DISTANCE = 0.46;
const LURCH_DISTANCE = 0.3;
const LURCH_AT = 0.88;
/** It pushes in and out at the lens while it thrashes: metres, and how often. */
const PUSH_METRES = 0.04;
const PUSH_HZ = 5;
/** Its run as it comes; still once it is on you. */
const RUN_SPEED = 7;
/** The machine's clock: each pose of the thrash is held for 1/24 s, then it snaps to the next. */
const POSES_PER_SECOND = 24;
/** The head's "no": radians each way and how often, turned at the neck and the head. */
const SHAKE_RADIANS = 0.34;
const SHAKE_HZ = 13;
const SHAKE_SHARE = { Neck: 0.35, Head: 0.65 };
/** On top of the shake, its head rolls over to the sides and nods. */
const COCK_RADIANS = 0.3;
const COCK_HZ = 2.7;
const NOD_RADIANS = 0.14;
const NOD_HZ = 9;
/** Bent forward as it comes, and further as it stoops into your face (radians down the whole spine). */
const HUNCH = 0.22;
const STOOP_CURL = 0.12;
/** Its head tipped back against the bend, so the face comes at the lens, not the crown (radians). */
const FACE_LIFT = 0.4;
/** The whole body rattles, metres. */
const RATTLE_METRES = 0.012;
/** The claws: either side of its face, a little below it and nearer the lens; they work in and out. */
const CLAW_SIDE = 0.26;
const CLAW_BELOW = 0.17;
const CLAW_AHEAD = 0.1;
const CLAW_WORK_METRES = 0.035;
const CLAW_HZ = 6;
/** Each elbow under its claw, a little out: the forearm stands up and the claw rises beside the face, not across it. */
const ELBOW_BELOW = 0.5;
const ELBOW_OUT = 0.12;
/** The fingers splayed, opening and closing as the claws work. */
const SPLAY = -0.8;
const SPLAY_WORK = 0.5;
/** The camera: the jolt on impact (radians), the punch-in, and a tremor. */
const JOLT_RADIANS = 0.09;
const PUNCH_FOV = 50;
const TREMOR = 0.012;
/** One drop to black in the middle of it: [seconds into the scare, length]. */
const STROBES = [[0.6, 0.035]];

const TAU = Math.PI * 2;
const _claw = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const easeInCubic = (t) => t * t * t;

export const thrash = {
  name: 'thrash',
  seconds: 1,
  /** Metres of clear floor it needs in front of the lens. */
  room: START_DISTANCE + 0.4,
  pool: 'stairs',

  frame(rig, t, dt) {
    const { creature, camera, faceLight } = rig;
    if (!creature.visible && t >= REVEAL_AT) rig.reveal();
    if (t >= REVEAL_AT) rig.scream();
    const impacted = t >= IMPACT_AT;
    const lunge = THREE.MathUtils.clamp((t - REVEAL_AT) / (IMPACT_AT - REVEAL_AT), 0, 1);
    // How hard it is thrashing: on almost at once, so the hit runs straight into it.
    const thrashing = THREE.MathUtils.smoothstep(t, IMPACT_AT, IMPACT_AT + 0.05);
    // The machine's clock, and a swing on it.
    const s = Math.floor(t * POSES_PER_SECOND) / POSES_PER_SECOND;
    const wave = (hz, phase = 0) => Math.sin(TAU * hz * s + phase);

    creature.setSpeed(RUN_SPEED * (1 - THREE.MathUtils.smoothstep(t, IMPACT_AT, IMPACT_AT + 0.1)));
    creature.update(dt);

    let distance = impacted
      ? HOLD_DISTANCE + PUSH_METRES * wave(PUSH_HZ) * thrashing
      : START_DISTANCE - (START_DISTANCE - HOLD_DISTANCE) * easeInCubic(lunge);
    distance -= (HOLD_DISTANCE - LURCH_DISTANCE) * THREE.MathUtils.smoothstep(t, LURCH_AT, thrash.seconds);

    const stoop = THREE.MathUtils.smoothstep(lunge, 0.4, 1);
    rig.pose({
      curl: HUNCH + STOOP_CURL * stoop,
      cock: COCK_RADIANS * wave(COCK_HZ, 0.6) * thrashing,
      nod: -FACE_LIFT * stoop,
      twitch: { x: NOD_RADIANS * wave(NOD_HZ, 1.3) * thrashing, z: 0 }
    });
    // The "no" is a turn of the neck and head, which pose() does not do.
    const turn = SHAKE_RADIANS * wave(SHAKE_HZ) * thrashing;
    creature.offsetBones({ Neck: [0, turn * SHAKE_SHARE.Neck, 0], Head: [0, turn * SHAKE_SHARE.Head, 0] });
    rig.placeFace(distance);
    rig.lowerFace(stoop);
    rig.keepUnderCeiling();
    const root = creature.refs.root;
    if (root && thrashing > 0) {
      root.position.addScaledVector(rig.right, RATTLE_METRES * wave(21, 0.4) * thrashing);
      root.position.y += RATTLE_METRES * 0.7 * wave(17, 2.1) * thrashing;
      creature.group.updateMatrixWorld(true);
    }

    // The claws come up from its sides as it comes, then work either side of
    // its face, out of step with each other. Her left hand is on the lens's right.
    const arms = THREE.MathUtils.smoothstep(lunge, 0.15, 0.9);
    for (const [side, across, phase] of [['left', 1, 0], ['right', -1, Math.PI]]) {
      const work = wave(CLAW_HZ, phase) * thrashing;
      rig.nearLens(across * (CLAW_SIDE - CLAW_WORK_METRES * work), -CLAW_BELOW + CLAW_WORK_METRES * 0.6 * work,
        distance - CLAW_AHEAD, _claw);
      _elbow.copy(_claw).addScaledVector(rig.right, across * ELBOW_OUT);
      _elbow.y -= ELBOW_BELOW;
      rig.reach(side, _claw, { weight: arms, pole: _elbow });
    }
    const flex = SPLAY_WORK * wave(CLAW_HZ) * thrashing;
    rig.grip(SPLAY + flex, SPLAY - flex);

    if (impacted) rig.postFX.setCaught(1);
    rig.aim(rig.face(), { shake: impacted ? TREMOR : 0.004 });
    // The hit knocks the view up and over, ringing out.
    const hit = rig.ring(t, IMPACT_AT, { freq: 7, decay: 11 });
    camera.rotateX(JOLT_RADIANS * hit);
    camera.rotateZ(JOLT_RADIANS * 0.5 * hit);
    const punch = THREE.MathUtils.smoothstep(t, IMPACT_AT, IMPACT_AT + 0.07);
    rig.setFov(THREE.MathUtils.lerp(rig.startFov, PUNCH_FOV, punch) + 4 * hit);

    // The light under the lens comes on with it, then flickers on the machine's clock.
    const flicker = 0.5 + 0.5 * Math.sin(s * 917.3);
    faceLight.intensity = creature.visible ? (impacted ? 4.5 + 3 * flicker : 4) : 0;
    if (creature.visible) rig.strobe(t, STROBES);
  }
};
