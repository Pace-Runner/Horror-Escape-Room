import * as THREE from 'three';

/**
 * GRAB AND SEDATE: the study's catch, as it really is. Study pool only.
 *
 * Annabelle is not killing Mark (systems/StudySeeker.js): she promised to keep
 * him contained, and the archive's records say how -- Containment Sedation. So
 * this one does not end on a mauling. She runs him down, puts him on the
 * floor and pins him there; her right hand lets go and comes back with the
 * needle, and it goes into his neck; the world goes soft and doubled and dark
 * while she says his name. The wake pass (WakePass.js) run backwards:
 * comeRound.js opens the same eyes again in her chair's corner.
 *
 * IT IS DONE TO HIS BODY, and the lens is in his head (JumpScare.js, MARK'S
 * BODY): the camera goes where the body is thrown. Her hands are solved onto
 * him every frame -- his chest as she hits him, his shoulders as she pins
 * him, the side of his neck for the needle -- and his onto her: her forearms,
 * shoving her off, and her wrist when the needle comes. Facing him, her right
 * hand is on HIS left.
 *
 *   0.00  black
 *   0.05  she is there, two metres off and running at him, arms out, fingers
 *         spread; his hands come up; the scream
 *   0.40  her hands hit his chest: the view jolts, the red tunnel; he goes
 *         over backwards, the room tipping up past her, and she comes after him
 *   0.80  his back hits the boards, a thump, the head knocked back; she comes
 *         down over him, her hands onto his shoulders, his on her forearms,
 *         pushing; the frame shakes with it
 *   1.20  her right hand lets go; his left goes after it and loses it
 *   1.40  it comes back with the syringe, up at his left, the needle at him,
 *         and he has her wrist
 *   1.55  she forces it down at his neck, his hand fighting it
 *   1.82  in: the scream cut, a jolt through him; the plunger goes down
 *   1.95  "Sleep, Mark..." (the caller captions it: cue 'whisper')
 *   2.30  she draws it out; his hands slide off her and drop to the boards
 *   1.90+ the lids drooping, the picture doubling and glowing, and his head
 *         rolls away to his right, along the floor, her shape still over him
 *   3.20  black
 */

const REVEAL_AT = 0.05;
const HIT_AT = 0.4;
const LANDED_AT = 0.8;
const PINNED_AT = 1.0;
const LET_GO_AT = 1.2;
const FETCHED_AT = 1.3;
const RAISED_AT = 1.4;
const NEEDLE_AT = 1.55;
const NEEDLE_IN = 1.82;
const WHISPER_AT = 1.95;
const DRAW_OUT_AT = 2.3;
const DRUG_START = 1.9;
const LOLL_AT = 2.3;
const END = 3.2;

/** Her eyes from his, metres, as she appears and as her hands hit him: she covers it at a sprint. */
const START_DISTANCE = 2.0;
const HIT_DISTANCE = 0.5;
const RUN_SPEED = (START_DISTANCE - HIT_DISTANCE) / (HIT_AT - REVEAL_AT);
/** How far his feet are shoved out from under him as he goes over. */
const FEET_SLIDE = 0.3;
/** How far he leans back from her before she reaches him, radians. */
const RECOIL = 0.07;
/** Over him on the floor: her eyes this high over his, and this far down him, toward his feet. */
const OVER_HEIGHT = 0.5;
const OVER_ALONG = 0.2;
/** Bent forward running at him; bent down over him on the floor (radians down the spine). */
const RUN_HUNCH = 0.35;
const OVER_CURL = 1.55;
/** Her head lifted to look at him, not bowed to show him its crown. */
const HEAD_LIFT = 0.45;
const HEAD_COCK = 0.3;
/** His knees going as he goes down (radians: + bends a knee; - at the hip brings a thigh forward). */
const BUCKLE = 0.9;
/** His head lifted off the boards to see her: a forward curl down his spine (+x curls forward). */
const HEAD_UP = { Spine: 0.08, Chest: 0.06, Neck: 0.3, Head: 0.12 };
const HEAD_UP_TOTAL = HEAD_UP.Spine + HEAD_UP.Chest + HEAD_UP.Neck + HEAD_UP.Head;
/** The red tunnel only for the hit itself, so the needle can be seen. */
const TUNNEL_SECONDS = 0.3;
const ZOOM_FOV = 50;
/** The syringe sits this far from her wrist toward her knuckles (0..1): in her fist. */
const IN_THE_FIST = 0.75;

const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
const span = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const Y = new THREE.Vector3(0, 1, 0);

/**
 * The syringe: needle along +Z, so pointing it is a lookAt. Built once, shared.
 * A glass barrel with the sedative in it -- amber, so it reads against her
 * pale hand -- a dark rubber plunger, a steel needle. Sized to her hand: the
 * figure is a third over life size, and a life-size syringe vanished in it.
 * The dose and the plunger are kept, so the plunger can be seen going down.
 */
let syringe = null;
function buildSyringe() {
  const group = new THREE.Group();
  group.name = 'SedationSyringe';
  // See-through, so the dose shows; front faces only, so it needs no two-pass draw.
  const glass = new THREE.MeshStandardMaterial({ color: 0xb9c4bf, roughness: 0.15, metalness: 0, emissive: 0x0c0f0e,
    transparent: true, opacity: 0.42, depthWrite: false });
  const dose = new THREE.MeshStandardMaterial({ color: 0x9a6a1e, roughness: 0.3, metalness: 0, emissive: 0x1a0f02 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.7, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.3, metalness: 0.9 });
  const add = (geometry, material, z) => {
    const mesh = new THREE.Mesh(geometry.rotateX(Math.PI / 2), material);
    mesh.position.z = z;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  group.userData.plunger = add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), rubber, -0.1);  // the plunger, behind
  add(new THREE.CylinderGeometry(0.019, 0.019, 0.13, 12), glass, 0.0);                           // the barrel, in her fist
  group.userData.dose = add(new THREE.CylinderGeometry(0.013, 0.013, 0.09, 12), dose, 0.018);     // what is in it, 6 mm inside the glass
  add(new THREE.CylinderGeometry(0.008, 0.004, 0.02, 8), steel, 0.075);                          // the hub
  add(new THREE.CylinderGeometry(0.0016, 0.0016, 0.07, 4), steel, 0.12);                         // the needle, ahead
  return group;
}
/** The dose's front end (+Z) and length, and how far the plunger travels as it empties. */
const DOSE_FRONT = 0.063;
const DOSE_LENGTH = 0.09;
const PLUNGER_REST = -0.1;

const _at = new THREE.Vector3();
const _his = new THREE.Vector3();
const _her = new THREE.Vector3();
const _over = new THREE.Vector3();
const _front = new THREE.Vector3();
const _gaze = new THREE.Vector3();
const _up = new THREE.Vector3();
const _look = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _neck = new THREE.Vector3();
const _away = new THREE.Vector3();
const _raised = new THREE.Vector3();
const _shoulderL = new THREE.Vector3();
const _close = new THREE.Vector3();
const _upper = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _knuckle = new THREE.Vector3();

export const sedate = {
  name: 'sedate',
  pool: 'study',
  body: true,
  seconds: END,
  room: START_DISTANCE + 0.5,
  /** His fall: his head lands about a body's length behind where he stood. */
  roomBehind: 1.5,

  start(rig) {
    this.cued = false;
    this.jabbed = false;
    this.landed = false;
    syringe ??= buildSyringe();
    syringe.visible = false;
    (rig.camera.parent ?? rig.creature.group.parent)?.add(syringe);
  },

  frame(rig, t, dt) {
    const { creature, faceLight, camera, forward, right } = rig;
    const floorY = creature.group.position.y;
    if (!creature.visible && t >= REVEAL_AT) {
      rig.reveal();
      if (rig.body) rig.body.visible = true;
    }
    if (t >= REVEAL_AT && t < NEEDLE_IN) rig.scream();
    const hit = t >= HIT_AT;
    if (!this.landed && t >= LANDED_AT) {
      this.landed = true;
      rig.audio.thump(0.9);
    }

    // ---- him: standing, going over backwards, on his back
    const fall = span(t, HIT_AT, LANDED_AT);
    // Shoved, so already tipping, and then falling: gravity takes over.
    const tip = 0.25 * fall + 0.75 * fall * fall;
    const recoil = RECOIL * smooth(span(t, REVEAL_AT + 0.12, HIT_AT));
    const lay = recoil + (Math.PI / 2 - recoil) * tip;
    // His head lifts off the boards to see her, and goes back down as the drug takes him.
    const lift = smooth(span(t, LANDED_AT, PINNED_AT)) * (1 - 0.8 * smooth(span(t, LOLL_AT, END - 0.4)));
    this.poseHim(rig, t, dt, floorY, fall, lay, lift);
    this.hisEyes(rig, fall, floorY, _his);
    // His front: the way his chest faces, tipped back with him.
    _front.copy(forward).multiplyScalar(Math.cos(lay)).addScaledVector(Y, Math.sin(lay));

    // ---- her: running at him, then bent down over him on the floor
    const over = smooth(span(t, HIT_AT, PINNED_AT));
    const pinned = smooth(span(t, LANDED_AT, PINNED_AT));
    creature.setSpeed(hit ? RUN_SPEED * (1 - smooth(fall)) : RUN_SPEED);
    creature.update(dt);
    rig.pose({
      curl: THREE.MathUtils.lerp(RUN_HUNCH, OVER_CURL, over),
      nod: -HEAD_LIFT * over,
      cock: HEAD_COCK * pinned,
      twitch: t >= LANDED_AT && t < NEEDLE_IN ? rig.twitch(t, 0.5) : null
    });
    if (!hit) {
      rig.placeFace(THREE.MathUtils.lerp(START_DISTANCE, HIT_DISTANCE, span(t, REVEAL_AT, HIT_AT)));
    } else {
      // In front of his face as she hits him; over it, on the floor. Her eyes
      // start well above where they can be, so she is only lowered once she
      // is coming down on him; pressing down on him, she shakes with it.
      _over.copy(_his).addScaledVector(forward, THREE.MathUtils.lerp(HIT_DISTANCE, OVER_ALONG, over));
      _over.y += THREE.MathUtils.lerp(1, OVER_HEIGHT, over) + 0.025 * rig.wobble(t, 3) * pinned;
      rig.placeFaceAt(_over, Math.atan2(forward.x, forward.z));
    }
    rig.keepUnderCeiling();

    // ---- her hands: his chest as she hits him, his shoulders on the floor; the right away for the needle
    const reachIn = 0.35 + 0.65 * smooth(span(t, REVEAL_AT, HIT_AT));
    const onHim = smooth(span(t, HIT_AT + 0.05, PINNED_AT));
    this.hisChest(rig, 1, _front, _a);
    this.hisShoulder(rig, 'right', _front, _b);
    rig.reach('left', _a.lerp(_b, onHim), { weight: reachIn });
    this.rightHand(rig, t, onHim, _a);
    rig.reach('right', _a, { weight: t < LET_GO_AT ? reachIn : 1 });
    rig.grip(hit ? 1.1 : -0.55, t >= LET_GO_AT ? 0.85 : hit ? 1.1 : -0.55);

    // ---- the syringe, in her right fist, pointed at his neck
    const holding = t >= LET_GO_AT + 0.08 && t < END - 0.4;
    syringe.visible = holding;
    if (holding) this.placeSyringe(rig, t);
    if (!this.jabbed && t >= NEEDLE_IN) {
      this.jabbed = true;
      rig.stopScream();
      rig.audio.thump(0.35);
    }
    if (!this.cued && t >= WHISPER_AT) {
      this.cued = true;
      rig.cue('whisper');
    }

    // ---- his hands: up at her as she comes; on her forearms, shoving; his left on her wrist for the needle
    this.hisHands(rig, t, _front);

    if (hit) rig.postFX.setCaught(t < HIT_AT + TUNNEL_SECONDS ? 1 : 0.2);

    // The drug: lids down, two images that will not agree, halos, then dark.
    const drug = smooth(span(t, DRUG_START, END - 0.15));
    // The lids last, so his head is seen to roll away first.
    const closing = smooth(span(t, LOLL_AT + 0.3, END - 0.1));
    const lids = closing > 0 ? 1 - closing * (0.85 + 0.15 * Math.sin(t * 5.3)) : 1;
    rig.postFX.setWake(Math.max(0, lids), drug, { double: Math.min(1, drug * 1.4), glow: drug * 0.7 });

    // ---- the lens, in his head
    if (rig.body) rig.lensOnEyes();
    else camera.position.copy(_his);
    // Where his face points: level standing, up and down his body lying with his head lifted.
    const a = lay - HEAD_UP_TOTAL * lift;
    _gaze.copy(forward).multiplyScalar(Math.cos(a)).addScaledVector(Y, Math.sin(a));
    _up.copy(Y).multiplyScalar(Math.cos(a)).addScaledVector(forward, -Math.sin(a));
    // He looks at her -- except while he goes over, when his head is carried
    // and she swings away up the frame -- and at the needle as it comes.
    rig.eyes(_her);
    const watch = 1 - 0.6 * Math.sin(Math.PI * fall);
    _look.copy(camera.position).add(_gaze).lerp(_her, watch);
    if (holding) {
      // Half on it as it comes up; on it as it comes down at him.
      const needle = (0.45 * smooth(span(t, RAISED_AT - 0.1, RAISED_AT + 0.1)) + 0.25 * smooth(span(t, NEEDLE_AT, NEEDLE_AT + 0.12)))
        * (1 - smooth(span(t, NEEDLE_IN, NEEDLE_IN + 0.35)));
      _look.lerp(syringe.position, needle);
    }
    const loll = smooth(span(t, LOLL_AT, END - 0.2));
    // Knocks: her hands on his chest; the back of his head on the boards; the needle.
    const nod = -0.12 * rig.ring(t, HIT_AT, { freq: 3, decay: 7 })
      + 0.22 * rig.ring(t, LANDED_AT, { freq: 5, decay: 9 })
      - 0.06 * rig.ring(t, PINNED_AT, { freq: 6, decay: 10 })
      - 0.08 * rig.ring(t, NEEDLE_IN, { freq: 4, decay: 6 });
    const turn = -0.25 * rig.ring(t, NEEDLE_IN, { freq: 2.5, decay: 4 }) - 0.95 * loll;
    const struggle = t >= LANDED_AT && t < NEEDLE_IN + 0.2 ? 0.035 : 0;
    rig.look(_look, {
      up: _up,
      nod: nod - 0.1 * loll,
      turn,
      roll: 0.15 * Math.sin(Math.PI * fall) + 0.3 * loll,
      shake: 0.01 + struggle,
      t
    });
    rig.setFov(THREE.MathUtils.lerp(rig.startFov, ZOOM_FOV, pinned) + drug * 6);
    rig.lightOverHer();
    faceLight.intensity = creature.visible ? (hit ? 1.8 + Math.random() * 0.6 : 1.5) * (1 - drug * 0.6) : 0;
  },

  /** His body for this frame; without one (a harness), nothing -- hisEyes() stands in. */
  poseHim(rig, t, dt, floorY, fall, lay, lift) {
    if (!rig.body) return;
    const { eye, forward } = rig;
    const slide = FEET_SLIDE * smooth(fall);
    // The knees go on the way down and come back a little once he is down.
    const buckle = Math.sin(Math.PI * Math.min(1, fall * 1.15));
    _at.set(eye.x + forward.x * slide, floorY, eye.z + forward.z * slide);
    rig.poseBody({
      at: _at, lay, dt, floor: floorY,
      offsets: {
        'Left leg': [-0.55 * buckle - 0.1 * fall, 0, 0],
        'Right leg': [-0.45 * buckle - 0.2 * fall, 0, 0],
        'Left knee': [BUCKLE * buckle + 0.2 * fall, 0, 0],
        'Right knee': [BUCKLE * 0.85 * buckle + 0.35 * fall, 0, 0],
        Spine: [HEAD_UP.Spine * lift, 0, 0],
        Chest: [HEAD_UP.Chest * lift, 0, 0],
        Neck: [HEAD_UP.Neck * lift - 0.3 * rig.ring(t, LANDED_AT, { freq: 5, decay: 9 }), 0, 0],
        Head: [HEAD_UP.Head * lift, 0, 0]
      }
    });
  },

  /** His eyes: in his body, or -- with none lent -- on the arc a head falls along. */
  hisEyes(rig, fall, floorY, out) {
    if (rig.body) return rig.body.getEyePosition(out);
    const tip = 0.25 * fall + 0.75 * fall * fall;
    return out.copy(rig.eye).addScaledVector(rig.forward, -1.2 * Math.sin(tip * Math.PI / 2))
      .setY(THREE.MathUtils.lerp(rig.eye.y, floorY + 0.3, tip));
  },

  /** On his chest, `side` +1 his right, -1 his left: where her hand lands as she hits him. */
  hisChest(rig, side, front, out) {
    const chest = rig.body?.bone?.('Chest');
    if (!chest) return out.copy(_his).addScaledVector(Y, -0.35).addScaledVector(rig.right, side * 0.15);
    return chest.getWorldPosition(out).addScaledVector(front, 0.13).addScaledVector(rig.right, side * 0.14);
  },

  /** On the top of his shoulder, as he lies: where her hand pins him. */
  hisShoulder(rig, side, front, out) {
    const arm = rig.body?.bone?.(`${side} arm`);
    if (!arm) return out.copy(_his).addScaledVector(Y, -0.25).addScaledVector(rig.right, side === 'right' ? 0.2 : -0.2);
    return arm.getWorldPosition(out).addScaledVector(front, 0.08);
  },

  /** The left of his neck, at its skin: where the needle goes. */
  hisNeck(rig, out) {
    const neck = rig.body?.bone?.('Neck');
    if (!neck) return out.copy(_his).addScaledVector(Y, -0.15).addScaledVector(rig.right, -0.08);
    return neck.getWorldPosition(out).addScaledVector(rig.right, -0.075).addScaledVector(Y, 0.035);
  },

  /**
   * Where her right hand is at `t`: his chest and then his left shoulder;
   * away out of sight for the needle; up at his left with it; forced down
   * into his neck, his hand fighting it; held there; drawn out and away.
   */
  rightHand(rig, t, onHim, out) {
    const { right, forward } = rig;
    const shoulder = this.hisShoulder(rig, 'left', _front, _shoulderL);
    this.hisChest(rig, -1, _front, out).lerp(shoulder, onHim);
    if (t < LET_GO_AT) return out;
    // Out of frame, beside him on the floor; up over his left, the needle at him; his neck.
    const away = _away.copy(shoulder).addScaledVector(right, -0.42).addScaledVector(forward, 0.15).addScaledVector(Y, 0.04);
    this.hisNeck(rig, _neck);
    const raised = _raised.copy(_neck).addScaledVector(right, -0.14).addScaledVector(Y, 0.36).addScaledVector(forward, 0.08);
    if (t < FETCHED_AT) return out.copy(shoulder).lerp(away, smooth(span(t, LET_GO_AT, FETCHED_AT)));
    if (t < RAISED_AT) return out.copy(away).lerp(raised, smooth(span(t, FETCHED_AT, RAISED_AT)));
    if (t < NEEDLE_AT) return out.copy(raised).addScaledVector(Y, 0.04 * smooth(span(t, RAISED_AT, NEEDLE_AT)));
    if (t < NEEDLE_IN) {
      // Forced down against his grip, close in front of his face where he can
      // see it -- it gains, loses a little, gains, wavering across -- and then
      // the last of the way into his neck, fast, under the frame.
      const p = span(t, NEEDLE_AT, NEEDLE_IN - 0.08);
      const gained = THREE.MathUtils.clamp(p * p * (3 - 2 * p) - 0.09 * Math.sin(p * Math.PI * 3) * (1 - p), 0, 1);
      // A forearm's length off: any closer it is a blur of fingers and glass on the lens (seen in the browser).
      const close = _close.copy(_neck).addScaledVector(right, -0.14).addScaledVector(Y, 0.26).addScaledVector(forward, 0.18);
      out.copy(raised).addScaledVector(Y, 0.04).lerp(close, gained)
        .addScaledVector(right, 0.035 * Math.sin(p * Math.PI * 7) * (1 - p));
      return out.lerp(_neck, span(t, NEEDLE_IN - 0.08, NEEDLE_IN) ** 2);
    }
    // Pressing the plunger home, and out.
    if (t < DRAW_OUT_AT) return out.copy(_neck).addScaledVector(Y, 0.006 * Math.sin((t - NEEDLE_IN) * 31));
    return out.copy(_neck).lerp(raised, smooth(span(t, DRAW_OUT_AT, DRAW_OUT_AT + 0.25)))
      .lerp(away, smooth(span(t, DRAW_OUT_AT + 0.25, DRAW_OUT_AT + 0.55)));
  },

  /**
   * His hands. Up in front of him as she comes, palms out; on her forearms
   * once she has him -- his right on her left, his left on her right --
   * shoving at her; his left after her right as it goes for the needle,
   * losing it, and back on her wrist as it comes, fighting it; and off her,
   * dropping to the boards, as the drug takes him.
   */
  hisHands(rig, t, front) {
    if (!rig.body) return;
    const { creature, forward, right } = rig;
    const guard = smooth(span(t, REVEAL_AT + 0.08, HIT_AT));
    const onHer = smooth(span(t, HIT_AT - 0.08, HIT_AT + 0.1));
    const shove = t >= LANDED_AT && t < NEEDLE_IN ? 0.04 : 0;
    for (const [side, her, sign] of [['right', 'left', 1], ['left', 'right', -1]]) {
      // In front of his face, coming up, palms out at her.
      _a.copy(_his).addScaledVector(forward, 0.32).addScaledVector(right, sign * 0.16)
        .addScaledVector(Y, THREE.MathUtils.lerp(-0.3, -0.04, guard));
      // On her upper arm, shoving -- her forearms are down on his shoulders,
      // under the frame (seen in the browser) -- and his left on her wrist for the needle.
      let wristHold = 0;
      let weight = 0.25 + 0.75 * guard;
      if (side === 'left' && t >= LET_GO_AT) {
        wristHold = smooth(span(t, RAISED_AT - 0.06, RAISED_AT + 0.06));
        weight *= 1 - 0.65 * (smooth(span(t, LET_GO_AT + 0.06, LET_GO_AT + 0.18)) - wristHold);
      }
      const shoulder = creature.bone?.(`${her} arm`);
      const elbow = creature.bone?.(`${her} elbow`);
      const wrist = creature.bone?.(`${her} wrist`);
      if (shoulder && elbow && wrist) {
        shoulder.getWorldPosition(_upper);
        elbow.getWorldPosition(_b);
        wrist.getWorldPosition(_hand);
        _upper.lerp(_b, 0.6).addScaledVector(front, shove * Math.sin(t * 13.8 + sign));
        _b.lerp(_hand, 0.95);
        _a.lerp(_upper.lerp(_b, wristHold), onHer);
      }
      // The drug: the hand slides off her and the arm drops back to the floor.
      const goes = side === 'left'
        ? smooth(span(t, NEEDLE_IN + 0.2, DRAW_OUT_AT + 0.15))
        : smooth(span(t, NEEDLE_IN + 0.35, DRAW_OUT_AT + 0.45));
      rig.reachBody(side, _a, { weight: weight * (1 - goes) });
    }
    const hold = 0.95 * smooth(span(t, HIT_AT - 0.05, HIT_AT + 0.05));
    const fade = 1 - smooth(span(t, NEEDLE_IN + 0.3, DRAW_OUT_AT + 0.5));
    rig.bodyGrip((t < HIT_AT ? -0.25 : hold) * fade, (t < HIT_AT ? -0.25 : hold) * fade);
  },

  /**
   * The syringe in the fist: between her wrist and her knuckles (the middle
   * finger's first joint), so it sits in the hand however the wrist bends,
   * its needle at his neck; the plunger going down while it is in him.
   */
  placeSyringe(rig, t) {
    const wrist = rig.creature.refs.hands?.r;
    const knuckle = rig.creature.bone?.('MiddleFinger1_R');
    const elbow = rig.creature.bone?.('right elbow');
    if (!wrist || !knuckle || !elbow) { syringe.visible = false; return; }
    wrist.getWorldPosition(_hand);
    knuckle.getWorldPosition(_knuckle);
    _hand.lerp(_knuckle, IN_THE_FIST);
    elbow.getWorldPosition(_a);
    // Up the forearm, toward the elbow: the way the hand is NOT pointing.
    const upForearm = _a.sub(_hand).normalize();
    syringe.position.copy(_hand);
    // Pointing on down the forearm while she fetches it; at his neck once it is up.
    if (t < RAISED_AT - 0.05) _b.copy(_hand).addScaledVector(upForearm, -0.2);
    else this.hisNeck(rig, _b);
    syringe.lookAt(_b);
    const emptied = smooth(span(t, NEEDLE_IN + 0.05, DRAW_OUT_AT - 0.05));
    const left = 1 - 0.85 * emptied;
    const { dose, plunger } = syringe.userData;
    dose.scale.set(1, 1, left);
    dose.position.z = DOSE_FRONT - (DOSE_LENGTH * left) / 2;
    plunger.position.z = PLUNGER_REST + DOSE_LENGTH * 0.85 * emptied;
  },

  end(rig) {
    this.cued = false;
    this.jabbed = false;
    this.landed = false;
    if (syringe) {
      syringe.visible = false;
      syringe.removeFromParent();
      syringe.userData.dose.scale.set(1, 1, 1);
      syringe.userData.dose.position.z = 0.018;
      syringe.userData.plunger.position.z = PLUNGER_REST;
    }
    rig.postFX.setWake(1, 0);
  }
};
