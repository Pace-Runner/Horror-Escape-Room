import * as THREE from 'three';

/**
 * HAULED: the kept ending's shots (main.js, playKeptEnding). Mark on his
 * back, dragged feet first by the ankle -- the haul of jumpScares/dragged.js
 * with nothing before it: no hand on the ankle, no scream, no red tunnel, no
 * fall. He is already down and already moving when the picture comes up.
 *
 * It is played once in each room on the way back to the bedroom, by whoever
 * has him there (the monster, or Annabelle through levels/annabelleDragger.js),
 * so each shot has to say WHERE in a glance. His head is up, and he looks down
 * his own length, past her bent over his ankle, at the room she is dragging
 * him through.
 *
 *   0.00  black; the room is already up behind it
 *   0.15  the picture fades in: on his back, moving, her hauling
 *   0.15+ heave after heave with hardly a breath between, so he never stops
 *         sliding. She steps backwards the whole time, dropping into each
 *         step, leaning back into each tug, her shoulders rocking and her
 *         chest heaving. How she does it is her figure's (its `haulStyle`,
 *         below): the monster twitches, holds its head over on one side and
 *         every third heave is a yank; Annabelle leans her whole weight back,
 *         looks over her shoulder at where she is going, and her knees give
 *         once. He rocks with every tug, kicks at her, claws at the floor and
 *         looks from her to his own hand and back
 *   2.25  it fades out
 *   2.60  black
 *
 * It calls its beats as cues ('heave', 'yank', 'stumble') so main.js can
 * sound them for the floor of the room it is in.
 *
 * Kept apart from dragged.js rather than played from the middle of it: that
 * one is a catch, and its scream, strobes and fall are timed into the same
 * clock as the haul.
 */

const FADE_IN_AT = 0.15;
const FADE_OUT_AT = 2.25;
const END = 2.6;
const FADE_MS = 300;
/** Each heave: this far, over this share of a beat this long (s); then a short breath before the next. */
const HEAVE = 0.42;
const HEAVE_BEAT = 0.42;
const HEAVE_PULL = 0.78;
/** Her steps never stop: the gait is fed at least this speed, metres a second. */
const MIN_STEP_SPEED = 0.7;
/** She stands this far past his ankle, along the way she drags him, and her weight goes back this far with each tug. */
const PAST_ANKLE = 0.5;
const LEAN_BACK = 0.1;
/** A yank: the lean and his jolt this many times a heave's. */
const YANK = 1.7;
/**
 * How the one dragging him moves, unless her figure says otherwise (its
 * `haulStyle`). This is the monster's.
 *
 *   curl, nod      bent over his ankle (radians down the spine); the head
 *   legLift        how high his right leg is held (radians at his hip)
 *   lean           leaning back into each tug (radians off the curl)
 *   bob            metres the body drops into each step
 *   rock           the shoulders rocking with the steps (radians)
 *   breath, breathRate   the chest heaving (radians; breaths a second)
 *   twitch         the rig's twitches on the chest, neck and head (0: none)
 *   cock           the head over on one side, rolling slowly (radians)
 *   glance         a look back over the shoulder at where she is going (radians of turn; 0: never)
 *   yankEvery      every nth heave is a yank (0: never)
 *   stumble        her knees give once (metres dropped; 0: never)
 */
const MONSTER_STYLE = {
  curl: 1.3, nod: 0.3, legLift: 0.45, lean: 0.5, bob: 0.035, rock: 0.07,
  breath: 0.035, breathRate: 0.8, twitch: 0.8, cock: 0.4, glance: 0, yankEvery: 3, stumble: 0
};
/** How his spine curls to lift his head and shoulders (radians, +x curls forward). */
const HEAD_UP = { Spine: 0.22, Chest: 0.1, Neck: 0.45, Head: 0.22 };
const HEAD_UP_TOTAL = HEAD_UP.Spine + HEAD_UP.Chest + HEAD_UP.Neck + HEAD_UP.Head;
/** His hands, clawing: planted this far out to his side and down toward his hips from the shoulder. */
const CLAW_OUT = 0.38;
const CLAW_DOWN = 0.2;
/** His free leg kicking at her, kicks a second. */
const KICK_RATE = 1.4;
/** He rocks with each tug (radians of roll at his hips), and his breath lifts his view. */
const ROCK = 0.06;
const PANT = 0.02;
const PANT_RATE = 2.2;
/** What he looks at: this far from his ankle to her eyes -- his legs, her grip, her, and the room behind her. */
const LOOK_AT_HER = 0.62;
const FACE_LIGHT = 1.1;

const TAU = Math.PI * 2;
const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
const span = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
/** Up from `a` to `b`, held, back down from `c` to `d`: 0 to 1 and back. */
const hold = (t, a, b, c, d) => smooth(span(t, a, b)) - smooth(span(t, c, d));
const Y = new THREE.Vector3(0, 1, 0);

const _at = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _shin = new THREE.Vector3();
const _her = new THREE.Vector3();
const _gaze = new THREE.Vector3();
const _up = new THREE.Vector3();
const _look = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const hauled = {
  name: 'hauled',
  pool: 'kept',
  body: true,
  seconds: END,
  /** Metres of clear floor it needs ahead: the haul, her past his ankle, and her own depth. */
  room: HEAVE * Math.ceil(END / HEAVE_BEAT) + PAST_ANKLE + LEAN_BACK + 0.4,

  /** Each shot its own moments, so four in a row are not the same two seconds. */
  start() {
    this.fadedIn = false;
    this.fadedOut = false;
    this.beat = -1;
    this.stumbled = false;
    this.glanceAt = 0.75 + Math.random() * 0.45;
    this.stumbleAt = 1.15 + Math.random() * 0.4;
    this.handAt = 1.0 + Math.random() * 0.5;
    this.cockSide = Math.random() < 0.5 ? -1 : 1;
    this.yankPhase = Math.floor(Math.random() * 3);
  },

  /** How far he has been hauled at `t`: a heave at a time, each a pull and then a breath. */
  hauled(t) {
    const beats = Math.max(0, t) / HEAVE_BEAT;
    const n = Math.floor(beats);
    return HEAVE * (n + smooth(Math.min(1, (beats - n) / HEAVE_PULL)));
  },

  frame(rig, t, dt) {
    const { creature, faceLight, eye, forward, fade } = rig;
    const style = creature.haulStyle ?? MONSTER_STYLE;
    const floorY = creature.group.position.y;
    if (!creature.visible) {
      creature.visible = true;
      if (rig.body) rig.body.visible = true;
    }
    if (!this.fadedIn && t >= FADE_IN_AT) {
      this.fadedIn = true;
      fade.fadeIn(FADE_MS);
    }
    if (!this.fadedOut && t >= FADE_OUT_AT) {
      this.fadedOut = true;
      fade.fadeOut(FADE_MS);
    }

    // ---- the beat: a heave, sometimes a yank, once perhaps a stumble
    const beats = Math.max(0, t) / HEAVE_BEAT;
    const n = Math.floor(beats);
    const yank = style.yankEvery > 0 && (n + this.yankPhase) % style.yankEvery === 0;
    if (n !== this.beat) {
      this.beat = n;
      if (t >= FADE_IN_AT && t < FADE_OUT_AT) rig.cue(yank ? 'yank' : 'heave');
    }
    const effort = Math.sin(Math.PI * Math.min(1, (beats - n) / HEAVE_PULL)) * (yank ? YANK : 1);
    const stumble = style.stumble > 0 ? Math.sin(Math.PI * span(t, this.stumbleAt, this.stumbleAt + 0.42)) : 0;
    if (style.stumble > 0 && !this.stumbled && t >= this.stumbleAt && t < FADE_OUT_AT) {
      this.stumbled = true;
      rig.cue('stumble');
    }
    // One step to each heave, left then right.
    const step = Math.sin(Math.PI * beats);

    const hauled = this.hauled(t);
    const speed = (this.hauled(t + 0.02) - hauled) / 0.02;
    this.poseHim(rig, t, dt, floorY, hauled, style.legLift, effort, stumble);

    // His right ankle, in her hands, and his knee above it.
    if (rig.body) {
      rig.body.refs.feet.r.getWorldPosition(_ankle);
      rig.body.bone?.('right knee')?.getWorldPosition(_knee) ?? _knee.copy(_ankle);
    } else {
      _ankle.copy(eye).addScaledVector(forward, hauled + 0.2).setY(floorY + 0.12);
      _knee.copy(_ankle).addScaledVector(forward, -0.45);
    }

    // ---- her: past his ankle, facing him, bent over it, stepping backwards
    creature.setBackwards?.(true);
    creature.setSpeed(Math.max(MIN_STEP_SPEED, speed));
    creature.update(dt);
    const glance = style.glance * hold(t, this.glanceAt, this.glanceAt + 0.22, this.glanceAt + 0.6, this.glanceAt + 0.85);
    rig.pose({
      curl: style.curl - style.lean * effort + 0.3 * stumble,
      nod: style.nod + 0.15 * stumble,
      cock: this.cockSide * style.cock * (0.6 + 0.4 * Math.sin(t * 1.3)) * (1 - glance / (style.glance || 1)),
      twitch: style.twitch > 0 ? rig.twitch(t, style.twitch) : null
    });
    // Breathing hard, the shoulders rocking with her steps, and the turn of a look back over her shoulder.
    creature.offsetBones({
      Chest: [style.breath * Math.sin(TAU * style.breathRate * t), style.rock * 0.5 * step + 0.25 * glance, style.rock * step],
      Neck: [0, 0.35 * glance, 0],
      Head: [-0.1 * glance, 0.55 * glance, 0]
    });
    const back = PAST_ANKLE + LEAN_BACK * Math.min(1, effort);
    const x = _ankle.x + forward.x * back;
    const z = _ankle.z + forward.z * back;
    creature.setPosition(x, z);
    creature.setYaw(Math.atan2(-(eye.x - x), -(eye.z - z)) + 0.5 * style.rock * step);
    // Down into each step, and further if her knees give.
    const root = creature.refs.root;
    if (root) root.position.y -= style.bob * Math.abs(step) + style.stumble * stumble;
    creature.group.updateMatrixWorld(true);
    rig.keepUnderCeiling();
    // Her hands on his leg: one round the ankle, one a hand's width up the shin.
    _shin.copy(_ankle).lerp(_knee, 0.28);
    rig.reach('right', _ankle);
    rig.reach('left', _shin);
    rig.grip(1.2);

    this.hisHands(rig, t, hauled);

    // ---- the lens, in his head: down his own length, past her, at the room
    if (rig.body) rig.lensOnEyes();
    const a = Math.PI / 2 - HEAD_UP_TOTAL;
    _gaze.copy(forward).multiplyScalar(Math.cos(a)).addScaledVector(Y, Math.sin(a));
    _up.copy(Y).multiplyScalar(Math.cos(a)).addScaledVector(forward, -Math.sin(a));
    rig.eyes(_her);
    _look.copy(_ankle).lerp(_her, LOOK_AT_HER);
    // Once, his eyes drop toward his own right hand clawing at the floor, and back up to her.
    // Not all the way: that close, the hand fills the picture (seen in the browser).
    const toHand = hold(t, this.handAt, this.handAt + 0.18, this.handAt + 0.45, this.handAt + 0.65);
    const wrist = rig.body?.bone?.('right wrist');
    if (wrist && toHand > 0) _look.lerp(wrist.getWorldPosition(_hand), 0.4 * toHand);
    const beatStart = n * HEAVE_BEAT;
    rig.look(_look, {
      up: _up,
      nod: -0.05 * (yank ? YANK * 1.6 : 1) * rig.ring(t, beatStart, { freq: 5, decay: 10 })
        + PANT * Math.sin(TAU * PANT_RATE * t) - 0.06 * stumble,
      roll: 0.12 + (effort - 0.5) * 0.1,
      shake: 0.015,
      t
    });
    // A little light on her: in a dark room she is the thing to see.
    rig.lightOverHer(0.5);
    faceLight.intensity = creature.visible ? FACE_LIGHT : 0;
  },

  /**
   * Mark on his back, his head up to see, his right leg up in her hands, his
   * left kicking at her. Each tug rocks him, and a stumble of hers drops the
   * leg she holds.
   */
  poseHim(rig, t, dt, floorY, hauled, legLift, effort, stumble) {
    if (!rig.body) return;
    const { eye, forward } = rig;
    const s = t * KICK_RATE * TAU;
    const knee = 1.3 * Math.max(0, Math.sin(s));
    const hip = 0.15 + 0.6 * Math.max(0, Math.sin(s + 0.6));
    _at.set(eye.x + forward.x * hauled, floorY, eye.z + forward.z * hauled);
    rig.poseBody({
      at: _at, lay: Math.PI / 2, dt, floor: floorY,
      offsets: {
        Hips: [0, 0, ROCK * (effort - 0.5)],
        'Right leg': [-(legLift - 0.25 * stumble), 0, 0],
        'Left leg': [-hip, 0, 0],
        'Left knee': [knee, 0, 0],
        Spine: [HEAD_UP.Spine, 0, 0],
        Chest: [HEAD_UP.Chest, 0, 0],
        Neck: [HEAD_UP.Neck, 0, 0],
        Head: [HEAD_UP.Head, 0, 0]
      }
    });
  },

  /**
   * His hands clawing at the floor: each heave a hand is planted beside him
   * and stays where it is while he is pulled past it; in the breath between
   * heaves it is torn loose and planted again further down (dragged.js).
   */
  hisHands(rig, t, hauled) {
    const body = rig.body;
    if (!body) return;
    const { forward, right } = rig;
    const beats = Math.max(0, t) / HEAVE_BEAT;
    const n = Math.floor(beats);
    const f = beats - n;
    const slid = hauled - this.hauled(n * HEAVE_BEAT);
    const torn = f > HEAVE_PULL ? smooth((f - HEAVE_PULL) / (1 - HEAVE_PULL)) : 0;
    for (const [side, sign, offset] of [['left', -1, 0], ['right', 1, 0.04]]) {
      const shoulder = body.bone?.(`${side} arm`);
      if (!shoulder) continue;
      shoulder.getWorldPosition(_a);
      _a.addScaledVector(right, sign * (CLAW_OUT + offset)).addScaledVector(forward, CLAW_DOWN).setY(rig.creature.group.position.y + 0.03);
      _b.copy(_a).addScaledVector(forward, -slid);
      _b.lerp(_a, torn).addScaledVector(Y, 0.12 * Math.sin(Math.PI * torn));
      rig.reachBody(side, _b);
    }
    rig.bodyGrip(0.2 + 0.7 * (1 - torn));
  },

  end() {
    this.fadedIn = false;
    this.fadedOut = false;
  }
};
