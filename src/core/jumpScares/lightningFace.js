import * as THREE from 'three';

/**
 * LIGHTNING FACE: the dark, and then the storm shows you she is coming.
 * Study pool only -- it needs the study's lightning: the caller flashes it on
 * each cue 'lightning' (levels/studyBlackout.js's strike()), three times.
 *
 * IT IS DONE TO HIS BODY, and the lens is in his head (JumpScare.js, MARK'S
 * BODY). He stands in the dark looking round. At the first flash she is
 * across the floor and running at him, and he backs away -- his own body
 * stepping backwards, the lens bobbing with its steps -- his hands coming up
 * in front of his face. At the second she is an arm's length off and
 * reaching over them; at the third she has his head in her hands, her face a
 * hand from his, and she wrenches it.
 *
 *   0.00  black
 *   0.08  the dark room, moonlit. He looks off to his left -- something --
 *         and back
 *   0.70  the first strike: she is two metres off and coming, arms out,
 *         fingers spread; the scream; he starts back, his hands coming up
 *   1.06  the second: an arm's length off, reaching for his face
 *   1.30  the third: she has his head, her hands either side of his face,
 *         and wrenches it, the view thrown about with it; his hands on her
 *         forearms
 *   1.62  black, hard, and the scream cut dead
 *   2.00  over
 */

const DARK_AT = 0.08;
const STRIKES = [0.7, 1.06, 1.3];
const CUT_AT = 1.62;
const END = 2.0;
/** Her eyes from where his were, along the floor, at the first strike; how fast she comes, m/s. */
const RUN_FROM = 1.8;
const RUN_SPEED = 3.6;
/** Her eyes from his once she has his head, metres. */
const GRAB_DISTANCE = 0.36;
/** How far he backs off from her, at most (less if the floor behind him runs out). */
const BACK_MAX = 0.55;
/** How far she pulls his head toward her once she has it. */
const PULLED = 0.12;
/** Bent forward running at him; her head lifted to stare, and over on one side once she has him. */
const HUNCH = 0.4;
const HEAD_UP = 0.3;
const HEAD_COCK = 0.5;
/**
 * Where her elbows go: out to her sides at about shoulder height, so the
 * forearms come IN at his face from the sides and the fingers point at him.
 * (The default, out and down, raises the forearms and points the fingers up.)
 */
const ELBOWS = { side: 0.8, up: -0.05, ahead: 0.4 };
/** Fingers splayed reaching; clawed round his head. */
const SPREAD = -0.6;
const CLAW = 0.7;
/** Where he looks before she comes: off to his left (radians), and back. */
const GLANCE = 0.5;

const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
const span = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const Y = new THREE.Vector3(0, 1, 0);

/** A strike's light, 0..1, `age` seconds after it: studyBlackout.js's flashCurve, for the light under the lens. */
function flash(age) {
  const pulse = (at, length, peak) => (age >= at && age < at + length ? peak * (1 - (age - at) / length) : 0);
  return Math.max(pulse(0, 0.08, 1), pulse(0.12, 0.06, 0.55), pulse(0.22, 0.14, 0.85));
}

const _at = new THREE.Vector3();
const _his = new THREE.Vector3();
const _her = new THREE.Vector3();
const _look = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const lightningFace = {
  name: 'lightningFace',
  pool: 'study',
  body: true,
  seconds: END,
  room: RUN_FROM + 0.5,
  roomBehind: BACK_MAX + 0.4,

  start(rig) {
    this.struck = 0;
    // As far back as he can go: the floor behind him may run out sooner.
    this.backMax = Math.min(BACK_MAX, rig.clear(-rig.forward.x, -rig.forward.z, BACK_MAX + 0.35) - 0.35);
    this.backMax = Math.max(0, this.backMax);
  },

  frame(rig, t, dt) {
    const { creature, faceLight, fade, camera, eye, forward, right } = rig;
    const floorY = creature.group.position.y;
    for (let i = this.struck; i < STRIKES.length && t >= STRIKES[i]; i++) {
      this.struck = i + 1;
      rig.cue('lightning');
      if (i === 0) {
        rig.reveal();
        rig.scream();
        rig.postFX.setCaught(1);
      }
    }
    const seen = t >= STRIKES[0];
    const grabbed = smooth(span(t, STRIKES[2] - 0.04, STRIKES[2] + 0.06));

    // ---- him: standing, then backing off from her, then pulled in by the head
    const backing = span(t, STRIKES[0] + 0.05, STRIKES[2] + 0.05);
    const back = this.backMax * smooth(backing);
    const pulled = PULLED * smooth(span(t, STRIKES[2], CUT_AT));
    // Stepping backwards at the speed he is going: smoothstep's slope, 6u(1-u), over its span.
    const speed = (this.backMax * 6 * backing * (1 - backing)) / (STRIKES[2] - STRIKES[0]);
    const along = pulled - back;
    if (rig.body) {
      if (t >= DARK_AT) rig.body.visible = true;
      rig.body.setBackwards?.(speed > 0.02);
      _at.set(eye.x + forward.x * along, floorY, eye.z + forward.z * along);
      // Leaning back from her as he goes, and pulled over toward her by the head.
      rig.poseBody({ at: _at, lay: 0.06 * smooth(backing) - 0.06 * grabbed, speed, dt, floor: floorY });
      rig.lensOnEyes();
    } else {
      camera.position.copy(eye).addScaledVector(forward, along);
    }
    _his.copy(camera.position);

    // ---- her: running at him, then his head in her hands
    const run = RUN_FROM - RUN_SPEED * Math.max(0, t - STRIKES[0]);
    // From where his eyes are now, not where his feet are: leaning, they are
    // well in front of them, and her face was inside his head (seen in the browser).
    const hold = _a.subVectors(_his, eye).dot(forward) + GRAB_DISTANCE;
    const closing = smooth(span(t, STRIKES[1] - 0.05, STRIKES[2]));
    creature.setSpeed(seen ? RUN_SPEED * (1 - closing) : 0);
    creature.update(dt);
    rig.pose({
      curl: HUNCH,
      nod: -HEAD_UP,
      cock: 0.1 + (HEAD_COCK - 0.1) * grabbed,
      twitch: seen ? rig.twitch(t, 0.8) : null
    });
    rig.placeFace(Math.max(hold, THREE.MathUtils.lerp(run, hold, closing)));
    rig.lowerFace(closing);
    rig.keepUnderCeiling();
    // Her hands: reaching for his head as she comes, then either side of it.
    // Facing him, her right hand is on the lens's left.
    const reachOut = 0.5 + 0.5 * smooth(span(t, STRIKES[0], STRIKES[1]));
    for (const [side, sign] of [['right', -1], ['left', 1]]) {
      rig.nearLens(sign * 0.24, -0.02, 0.5, _a);
      rig.nearLens(sign * 0.13, 0.0, 0.04, _b);
      rig.reach(side, _a.lerp(_b, closing), {
        weight: reachOut,
        pole: rig.nearLens(sign * ELBOWS.side, ELBOWS.up, ELBOWS.ahead, _pole)
      });
    }
    rig.grip(THREE.MathUtils.lerp(SPREAD, CLAW, grabbed));

    // ---- his hands: up in front of his face as she comes; on her forearms once she has him
    if (rig.body) {
      const up = smooth(span(t, STRIKES[0] + 0.04, STRIKES[1] - 0.04));
      for (const [side, her, sign] of [['right', 'left', 1], ['left', 'right', -1]]) {
        _a.copy(_his).addScaledVector(forward, 0.3).addScaledVector(right, sign * 0.15)
          .addScaledVector(Y, THREE.MathUtils.lerp(-0.4, -0.1, up) + 0.012 * rig.wobble(t, sign + 4));
        const elbow = creature.bone?.(`${her} elbow`);
        const wrist = creature.bone?.(`${her} wrist`);
        if (elbow && wrist) {
          elbow.getWorldPosition(_b);
          wrist.getWorldPosition(_hand);
          _a.lerp(_b.lerp(_hand, 0.55), grabbed);
        }
        rig.reachBody(side, _a, { weight: up });
      }
      rig.bodyGrip(THREE.MathUtils.lerp(-0.3, 0.9, grabbed));
    }

    // ---- the picture
    if (t < DARK_AT || t >= CUT_AT) fade.snapToBlack();
    else fade.clear();
    if (t >= CUT_AT) rig.stopScream();
    creature.visible = seen && t < CUT_AT;
    const lastStrike = STRIKES[Math.max(0, this.struck - 1)];
    rig.lightOverHer();
    faceLight.intensity = seen && t < CUT_AT ? 4 * flash(t - lastStrike) + 0.5 : 0;

    // ---- the lens: looking round in the dark; at her; his head wrenched in her hands
    rig.eyes(_her);
    const glance = GLANCE * (smooth(span(t, 0.15, 0.42)) - smooth(span(t, 0.5, 0.66)));
    _look.copy(_his).addScaledVector(forward, 2);
    if (seen) _look.lerp(_her, smooth(span(t, STRIKES[0], STRIKES[0] + 0.12)));
    const wrench = grabbed * Math.exp(-(t - STRIKES[2]) * 1.2);
    const s = t - STRIKES[2];
    const flinch = STRIKES.reduce((sum, at) => sum + 0.07 * rig.ring(t, at, { freq: 3, decay: 8 }), 0);
    rig.look(_look, {
      turn: (seen ? 0 : glance) + 0.2 * wrench * Math.sin(s * 19),
      nod: flinch + 0.008 * Math.sin(t * 2.4) + 0.08 * wrench * Math.sin(s * 23 + 1),
      roll: 0.2 * wrench * Math.sin(s * 15 + 2),
      shake: seen ? 0.02 : 0.004,
      t
    });
    rig.setFov(seen ? THREE.MathUtils.lerp(rig.startFov, 42, grabbed) : rig.startFov);
  },

  end(rig) {
    this.struck = 0;
  }
};
