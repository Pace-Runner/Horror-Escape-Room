import * as THREE from 'three';

/**
 * DRAGGED BY THE ANKLE: she takes his leg out from under him and hauls him
 * away across the boards. Study pool only. It ends where the respawn begins:
 * a sedated Mark comes round in the corner by her chair, where she dragged him.
 *
 * IT IS DONE TO HIS BODY, and the lens is in his head (JumpScare.js, MARK'S
 * BODY). A hand round his ankle; he looks down his own body and she is
 * there, low at his feet, looking up at him. She pulls the leg out and he
 * goes over backwards -- the body tips on its heels and the lens comes down
 * with it -- and lands looking down his own length at his right leg in her
 * hands, her bent over it. Then she hauls, walking backwards, a heave at a
 * time, and he goes with each one: his hands clawing at the floorboards,
 * planted and torn loose as he is pulled past them; his free leg kicking at
 * her; his head turning from her to his hands and back. Her two hands are
 * solved onto his leg every frame (rig.reach), round the ankle and on the
 * shin, so the grip is ON the leg however it lies.
 *
 *   0.00  black
 *   0.08  a hand on his ankle: he looks down his own body at it, and at her,
 *         low at his feet, her face turned up to his; the scream
 *   0.55  the yank: the leg out from under him, and over he goes, the room
 *         swinging up past her
 *   0.90  on his back, a thump; down his own length at his leg in her hands
 *   1.10  the haul: she walks backwards, heave by heave, and he slides after
 *         her, clawing at the boards, kicking; looking from her to his hands
 *         and back up to her face
 *   3.05  the picture strobes and goes
 *   3.35  black
 */

const GRAB_AT = 0.08;
const LOOKED_AT = 0.3;
const YANK_AT = 0.55;
const LANDED_AT = 0.9;
const DRAG_AT = 1.1;
const STROBE_AT = 3.05;
const END = 3.35;
/** Down at his feet: her eyes this far beyond his ankles, and this high off the boards. */
const LOW_AHEAD = 0.6;
const LOW_HEIGHT = 0.6;
/** Bent right down at his feet, her head turned up to him; bent over his ankle, hauling. */
const LOW_CURL = 1.5;
const LOW_NOD = -0.55;
const HUNCH = 1.3;
const NOD = 0.3;
/** The yank: his right leg out from under him (radians at the hip; -x brings a leg forward), then held up. */
const YANK_LIFT = 1.0;
const LEG_LIFT = 0.45;
/** His feet pulled out toward her as he goes over. */
const FEET_SLIDE = 0.35;
/** How his spine curls to lift his head and shoulders, wakeUp.js's lift (radians, +x curls forward). */
const HEAD_UP = { Spine: 0.22, Chest: 0.1, Neck: 0.45, Head: 0.22 };
const HEAD_UP_TOTAL = HEAD_UP.Spine + HEAD_UP.Chest + HEAD_UP.Neck + HEAD_UP.Head;
/** Each heave: this far, over this share of a beat this long (s); then a breath before the next. */
const HEAVE = 0.55;
const HEAVE_BEAT = 0.5;
const HEAVE_PULL = 0.64;
/** She stands this far past his ankle, along the way she drags him. */
const PAST_ANKLE = 0.5;
/** His hands, clawing: planted this far out to his side and down toward his hips from the shoulder. */
const CLAW_OUT = 0.38;
const CLAW_DOWN = 0.2;
/** His free leg kicking at her, kicks a second. */
const KICK_RATE = 1.4;
const STROBES = [[3.05, 0.05], [3.15, 0.05]];

const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
const span = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const Y = new THREE.Vector3(0, 1, 0);

const _at = new THREE.Vector3();
const _his = new THREE.Vector3();
const _her = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _shin = new THREE.Vector3();
const _low = new THREE.Vector3();
const _gaze = new THREE.Vector3();
const _up = new THREE.Vector3();
const _look = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const dragged = {
  name: 'dragged',
  pool: 'study',
  body: true,
  seconds: END,
  room: LOW_AHEAD + FEET_SLIDE + HEAVE * Math.ceil((STROBE_AT - DRAG_AT) / HEAVE_BEAT) + PAST_ANKLE + 0.4,
  /** His fall: his head lands about a body's length behind where he stood. */
  roomBehind: 1.4,

  start(rig) {
    this.landed = false;
    this.screamed = false;
    // Hauled as far as the floor goes: she stops short of a wall rather than walking through it.
    const clear = rig.clear(rig.forward.x, rig.forward.z, this.room);
    this.haulMax = Math.max(0.6, clear - (FEET_SLIDE + PAST_ANKLE + 0.4));
  },

  /** How far he has been hauled at `t`: a heave at a time, each a pull and then a breath. */
  hauled(t) {
    const beats = Math.max(0, t - DRAG_AT) / HEAVE_BEAT;
    const n = Math.floor(beats);
    return Math.min(this.haulMax, HEAVE * (n + smooth(Math.min(1, (beats - n) / HEAVE_PULL))));
  },

  frame(rig, t, dt) {
    const { creature, faceLight, camera, eye, forward, right, fade } = rig;
    const floorY = creature.group.position.y;
    if (t >= GRAB_AT && !creature.visible) {
      rig.reveal();
      rig.postFX.setCaught(1);
      if (rig.body) rig.body.visible = true;
    }
    if (!this.screamed && t >= LOOKED_AT - 0.05) {
      this.screamed = true;
      rig.scream();
    }
    if (!this.landed && t >= LANDED_AT) {
      this.landed = true;
      rig.audio.thump(1);
    }

    // ---- him: standing; the leg out from under him; on his back, hauled
    const fall = span(t, YANK_AT, LANDED_AT);
    const tip = fall * fall;
    const lay = (Math.PI / 2) * tip;
    const lift = smooth(span(t, LANDED_AT - 0.1, DRAG_AT));
    const hauled = this.hauled(t);
    // The haul's speed (for her steps) and its effort (0..1 in each heave).
    const speed = (this.hauled(t + 0.02) - hauled) / 0.02;
    const beats = Math.max(0, t - DRAG_AT) / HEAVE_BEAT;
    const effort = t >= DRAG_AT ? Math.sin(Math.PI * Math.min(1, (beats % 1) / HEAVE_PULL)) : 0;
    const along = FEET_SLIDE * smooth(fall) + hauled;
    this.poseHim(rig, t, dt, floorY, fall, lay, lift, along);

    // His right ankle, in her hands, and his knee above it.
    if (rig.body) {
      rig.body.refs.feet.r.getWorldPosition(_ankle);
      rig.body.bone?.('right knee')?.getWorldPosition(_knee) ?? _knee.copy(_ankle);
    } else {
      _ankle.copy(eye).addScaledVector(forward, along + 0.2).setY(floorY + 0.12);
      _knee.copy(_ankle).addScaledVector(forward, -0.45);
    }

    // ---- her: down at his feet; up and pulling; walking backwards with him in tow
    creature.setBackwards?.(t >= DRAG_AT);
    creature.setSpeed(t >= DRAG_AT ? speed : 0);
    creature.update(dt);
    const up = smooth(span(t, YANK_AT - 0.05, LANDED_AT + 0.1));
    rig.pose({
      curl: THREE.MathUtils.lerp(LOW_CURL, HUNCH, up) - 0.3 * effort,
      nod: THREE.MathUtils.lerp(LOW_NOD, NOD, up),
      twitch: t >= LOOKED_AT ? rig.twitch(t, 0.5) : null
    });
    if (up < 1) {
      // Low at his feet, her face turned up to his, rising and stepping back as she yanks.
      _low.copy(_ankle).addScaledVector(forward, LOW_AHEAD + 0.25 * up);
      _low.y = floorY + LOW_HEIGHT + 0.5 * up;
      rig.placeFaceAt(_low, Math.atan2(forward.x, forward.z));
      if (up > 0) {
        // ...and toward standing past his ankle, where the haul has her.
        const root = creature.refs.root;
        const x = _ankle.x + forward.x * PAST_ANKLE;
        const z = _ankle.z + forward.z * PAST_ANKLE;
        root.position.x = THREE.MathUtils.lerp(root.position.x, x, up);
        root.position.z = THREE.MathUtils.lerp(root.position.z, z, up);
        root.position.y *= 1 - up;
        creature.group.updateMatrixWorld(true);
      }
    } else {
      // Past his ankle, facing him, bent over it, leaning back into each heave.
      const x = _ankle.x + forward.x * (PAST_ANKLE + 0.06 * effort);
      const z = _ankle.z + forward.z * (PAST_ANKLE + 0.06 * effort);
      creature.setPosition(x, z);
      creature.setYaw(Math.atan2(-(camera.position.x - x), -(camera.position.z - z)));
      creature.group.updateMatrixWorld(true);
    }
    rig.keepUnderCeiling();
    // Her hands on his leg: one round the ankle, one a hand's width up the shin.
    _shin.copy(_ankle).lerp(_knee, 0.28);
    rig.reach('right', _ankle);
    rig.reach('left', _shin);
    rig.grip(1.2);

    // ---- his hands: flung out as he goes over; clawing at the boards as he is hauled
    this.hisHands(rig, t, fall, lay, hauled);

    // ---- the picture
    if (t < GRAB_AT || t >= END - 0.15) fade.snapToBlack();
    else if (t >= STROBE_AT) rig.strobe(t, STROBES);
    else fade.clear();

    // ---- the lens, in his head
    if (rig.body) rig.lensOnEyes();
    else camera.position.copy(eye).addScaledVector(forward, along - 1.2 * Math.sin(lay)).setY(THREE.MathUtils.lerp(eye.y, floorY + 0.46, tip));
    // Looking down, the head bows and the eyes come forward over the chest;
    // left inside the head, the lens looked down into his own collar (seen in the browser).
    const down = smooth(span(t, GRAB_AT + 0.02, LOOKED_AT)) * (1 - smooth(span(t, YANK_AT, YANK_AT + 0.15)));
    camera.position.addScaledVector(forward, 0.13 * down).addScaledVector(Y, -0.04 * down);
    _his.copy(camera.position);
    const a = lay - HEAD_UP_TOTAL * lift;
    _gaze.copy(forward).multiplyScalar(Math.cos(a)).addScaledVector(Y, Math.sin(a));
    _up.copy(Y).multiplyScalar(Math.cos(a)).addScaledVector(forward, -Math.sin(a));
    rig.eyes(_her);
    // Down at his ankle as she takes it; carried over as he falls; down his
    // length at her hands, tipping up to her face as she hauls.
    _look.copy(_his).addScaledVector(forward, 2).lerp(_ankle, smooth(span(t, GRAB_AT + 0.02, LOOKED_AT)));
    if (t >= LOOKED_AT) _look.lerp(_her, 0.3 * smooth(span(t, LOOKED_AT, YANK_AT)));
    if (t >= YANK_AT) {
      _a.copy(_his).add(_gaze);
      _b.copy(_ankle).lerp(_her, THREE.MathUtils.lerp(0.3, 0.75, smooth(span(t, DRAG_AT, DRAG_AT + 1.2))));
      _look.copy(_a).lerp(_b, 1 - 0.6 * Math.sin(Math.PI * fall));
    }
    // From her to his hands and back: his left, then his right -- looked AT,
    // not turned toward, or the look goes up over them (seen in the browser).
    const toLeft = smooth(span(t, 1.55, 1.75)) - smooth(span(t, 1.95, 2.15));
    const toRight = smooth(span(t, 2.3, 2.5)) - smooth(span(t, 2.7, 2.9));
    const hand = rig.body?.bone?.(toLeft > 0 ? 'left wrist' : 'right wrist');
    if (hand && toLeft + toRight > 0) _look.lerp(hand.getWorldPosition(_a), 0.85 * (toLeft + toRight));
    const beatStart = DRAG_AT + Math.floor(beats) * HEAVE_BEAT;
    const knocks = 0.2 * rig.ring(t, LANDED_AT, { freq: 5, decay: 9 })
      - (t >= DRAG_AT && beatStart < STROBE_AT ? 0.05 * rig.ring(t, beatStart, { freq: 5, decay: 10 }) : 0);
    rig.look(_look, {
      up: t >= YANK_AT ? _up : Y,
      nod: knocks,
      roll: 0.35 * Math.sin(Math.PI * fall) + (t >= LANDED_AT ? 0.12 + (effort - 0.5) * 0.1 : 0),
      shake: t >= LANDED_AT ? 0.02 : 0.008,
      t
    });
    // The red tunnel for the yank and the fall; then the dark, dragged.
    if (t >= LANDED_AT) rig.postFX.setCaught(1 - 0.75 * smooth(span(t, LANDED_AT, LANDED_AT + 0.3)));
    // Higher over her than the others: down at his feet, she is under his coat,
    // and hung any lower it would be lighting him rather than her.
    rig.lightOverHer(0.5);
    faceLight.intensity = creature.visible ? 1.0 + Math.random() * 0.4 : 0;
  },

  /**
   * Mark: standing, a tug on the ankle; the right leg yanked out from under
   * him and over he goes; on his back, his head up to see, his right leg up
   * in her hands, his left kicking at her.
   */
  poseHim(rig, t, dt, floorY, fall, lay, lift, along) {
    if (!rig.body) return;
    const { eye, forward } = rig;
    const yank = smooth(span(t, YANK_AT, YANK_AT + 0.18));
    const legLift = THREE.MathUtils.lerp(YANK_LIFT * yank, LEG_LIFT, smooth(span(t, LANDED_AT - 0.1, LANDED_AT + 0.2)));
    const tug = 0.08 * smooth(span(t, GRAB_AT, LOOKED_AT));
    const s = Math.max(0, t - DRAG_AT) * KICK_RATE * Math.PI * 2;
    const kicking = smooth(span(t, DRAG_AT, DRAG_AT + 0.2)) * (1 - smooth(span(t, STROBE_AT - 0.3, STROBE_AT)));
    const knee = 1.3 * Math.max(0, Math.sin(s)) * kicking;
    const hip = (0.15 + 0.6 * Math.max(0, Math.sin(s + 0.6))) * kicking;
    _at.set(eye.x + forward.x * along, floorY, eye.z + forward.z * along);
    rig.poseBody({
      at: _at, lay, dt, floor: floorY,
      offsets: {
        'Right leg': [-(tug + legLift), 0, 0],
        'Left leg': [-0.3 * Math.sin(Math.PI * fall) - hip, 0, 0],
        'Left knee': [0.7 * Math.sin(Math.PI * fall) + knee, 0, 0],
        Spine: [HEAD_UP.Spine * lift, 0, 0],
        Chest: [HEAD_UP.Chest * lift, 0, 0],
        Neck: [HEAD_UP.Neck * lift - 0.3 * rig.ring(t, LANDED_AT, { freq: 5, decay: 9 }), 0, 0],
        Head: [HEAD_UP.Head * lift, 0, 0]
      }
    });
  },

  /**
   * His hands: at his sides standing; flung out as he goes over; and then
   * clawing at the boards. Each heave, a hand is planted beside him and
   * stays where it is on the floor while he is pulled past it; in the breath
   * between heaves it is torn loose and planted again further down.
   */
  hisHands(rig, t, fall, lay, hauled) {
    const body = rig.body;
    if (!body) return;
    const { forward, right } = rig;
    const flung = Math.sin(Math.PI * fall) * 0.8;
    const clawing = smooth(span(t, LANDED_AT, DRAG_AT));
    const beats = Math.max(0, t - DRAG_AT) / HEAVE_BEAT;
    const n = Math.floor(beats);
    const f = beats - n;
    // Where the heave began, back along the floor: a planted hand is left there.
    const slid = hauled - this.hauled(DRAG_AT + n * HEAVE_BEAT);
    const torn = f > HEAVE_PULL ? smooth((f - HEAVE_PULL) / (1 - HEAVE_PULL)) : 0;
    for (const [side, sign, offset] of [['left', -1, 0], ['right', 1, 0.04]]) {
      const shoulder = body.bone?.(`${side} arm`);
      if (!shoulder) continue;
      shoulder.getWorldPosition(_a);
      if (t < LANDED_AT) {
        // Out to his side and up, toward her, as he goes.
        _a.addScaledVector(right, sign * 0.5).addScaledVector(forward, Math.cos(lay) * 0.3).addScaledVector(Y, 0.25 + Math.sin(lay) * 0.2);
        rig.reachBody(side, _a, { weight: flung });
        continue;
      }
      // Planted beside him, a little down toward his hips; left behind as he slides.
      _a.addScaledVector(right, sign * (CLAW_OUT + offset)).addScaledVector(forward, CLAW_DOWN).setY(rig.creature.group.position.y + 0.03);
      _b.copy(_a).addScaledVector(forward, -slid);
      // Torn loose and planted again: lifted off the floor on the way.
      _b.lerp(_a, torn).addScaledVector(Y, 0.12 * Math.sin(Math.PI * torn));
      rig.reachBody(side, _b, { weight: clawing });
    }
    rig.bodyGrip(0.2 + 0.7 * (1 - torn) * clawing);
  },

  end(rig) {
    this.landed = false;
    this.screamed = false;
  }
};
