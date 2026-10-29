import * as THREE from 'three';

/**
 * THE KEPT ENDING'S LAST BEAT: Annabelle in the bedroom. He is back on the
 * bed with the chain on his wrist, as the run began. She stands by the
 * nightstand, still out of breath from the haul, and looks at him. He yanks
 * at the chain and she flinches. She looks away, and goes; at the edge of his
 * sight she stops and looks back at him, once; then round the bed and behind
 * him, to the door. main.js (chainedForGood) stages the room and plays the
 * sounds; this is her acting.
 *
 * HER FEET ARE PLANTED. Her figure (annabelleFigure.js) has a walk that
 * swings her legs, but swinging legs do not touch the floor, and a figure
 * slid along a path on them skates. So each foot here stays where it was put
 * while her body moves over it, and steps -- lifted, carried, and put down
 * ahead -- when her body has left it behind or turned away from it, one foot
 * at a time. Her legs are solved to her feet (two bones, the law of cosines),
 * and her hips come down when a long step needs it. Her turns are steps too.
 *
 * Her body's way is a function of the time (bodyAt), not a sum of frames, so
 * a dropped frame cannot leave her behind her own footsteps and the door.
 */

/** Beside the bed, past the nightstand: close enough for the candles to find her face. */
const HER_AT = [0.25, -1.75];
/** Her way out: round the foot of the bed, behind him, to the door. Out of his sight after the first point. */
const HER_EXIT = [[-0.6, -0.6], [-0.55, 1.3], [0.7, 2.45]];
/** How far along her first leg she stops to look back at him: still in his sight. */
const GLANCE_AT = 0.75;
/** Her pace once she has looked back, metres a second: she does not want to be in the room. */
const PACE = 1.3;
/** Her path's corners are rounded off over this many metres either side (wayAt). */
const CORNER = 0.3;

/**
 * Walking (faster than WALKING), her steps come on a clock that runs with the
 * distance she covers: one step each stepLength(), feet in turn, so the
 * rhythm is even. Standing or turning on the spot, a foot steps when her body
 * has left it SLACK out of place or turned SLACK_TURN away from it.
 */
const WALKING = 0.3;
const stepLength = (speed) => 0.28 + 0.2 * speed;
const SLACK = 0.06;
const SLACK_TURN = 0.5;
/** Seconds a foot is off the floor: at most this, walking, and always some time on both feet. */
const SWING = 0.4;
const TURN_SWING = 0.32;
/** How high a stride carries a foot. */
const LIFT = 0.07;
/** A planted foot swivels on its ball rather than let her leg twist further than this from her body. */
const SWIVEL = 0.55;
/** The foot behind her comes up onto its toes, this far at most (radians), as a walker's does pushing off. */
const TOE_OFF = 1.0;
/** Her hips never come down more than this for a step. */
const MAX_DROP = 0.08;

/** The beat's moments, seconds from the picture coming up. */
export const KEPT_BED = {
  fadeIn: 1.6,
  promise: 0.7,       // she nods, slowly: she keeps her promises
  flash: 1.1,         // lightning through the window, and she is there in it
  chain: 1.5,         // he yanks at the chain, and she flinches
  line: 2.3,          // what he says
  chainAgain: 3.4,    // and again; she flinches less
  lookAway: 3.6,      // she cannot look at him
  turn: 4.7,          // and goes: her head first, then her shoulders, then her feet
  walk: 4.95,
  glance: 6.6,        // at the edge of his sight she stops, and looks back at him once
  flashAgain: 6.75,   // and the lightning shows him her face
  onward: 7.5,        // then she goes quickly; the door, the latch and the lock follow her footsteps out
  closing: 1.8        // the fade to the end screen begins this long after she reaches the door
};

const UP = new THREE.Vector3(0, 1, 0);
const SIDES = ['Left', 'Right'];
const smooth = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _world = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _pitch = new THREE.Quaternion();
const _euler = new THREE.Euler();
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

/**
 * How far along her way out she is at `t`: a hesitant start that eases to a
 * stop where she looks back, then a quick walk.
 */
function distanceAt(t, glanceAt) {
  if (t <= KEPT_BED.walk) return 0;
  if (t < KEPT_BED.onward) return glanceAt * smooth(t, KEPT_BED.walk, KEPT_BED.glance);
  const u = t - KEPT_BED.onward;
  const ramp = 0.4;
  return glanceAt + PACE * (u < ramp ? (u * u) / (2 * ramp) : u - ramp / 2);
}

/** A flinch: sharp in, slow out. */
function flinch(t, at, size) {
  return t < at ? 0 : size * Math.min(1, (t - at) / 0.07) * Math.exp(-Math.max(0, t - at - 0.07) / 0.35);
}

/** Turns `bone` so its `child` lies toward `target` (world), worked in world space as JumpScare's aimBone is. */
function aimBone(bone, child, target, weight = 1) {
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _dir.subVectors(_b, _a).normalize();
  _axis.subVectors(target, _a).normalize();
  _turn.setFromUnitVectors(_dir, _axis);
  if (weight < 1) _turn.slerp(new THREE.Quaternion(), 1 - weight);
  bone.getWorldQuaternion(_world).premultiply(_turn);
  bone.parent.getWorldQuaternion(_parent).invert();
  bone.quaternion.copy(_parent.multiply(_world));
  bone.updateMatrixWorld(true);
}

/** Facing `yaw` (yaw 0 faces -Z, as the dragger's setYaw speaks it): forward on the floor. */
function forward(yaw, out) {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/**
 * @param {object} deps
 * @param {object} deps.her   levels/annabelleDragger.js, loaded
 * @param {number[]} deps.bed [x, z] of his head on the bed: where she looks
 * @returns {{ atDoor: number, duration: number, frame: Function }}
 */
export function createKeptBedroomBeat({ her, bed }) {
  const figure = her.figure;
  const root = her.refs.root;
  const bone = (name) => her.skeletonBone(name);
  const path = [HER_AT, ...HER_EXIT];
  const legs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const facings = path.slice(1).map((p, i) => Math.atan2(-(p[0] - path[i][0]), -(p[1] - path[i][1])));
  const ends = legs.map((_, i) => legs.slice(0, i + 1).reduce((sum, leg) => sum + leg, 0));
  const total = ends[ends.length - 1];
  const glanceAt = legs[0] * GLANCE_AT;
  // distanceAt's quick walk, solved for the door.
  const atDoor = KEPT_BED.onward + 0.2 + (total - glanceAt) / PACE;
  const toHim = Math.atan2(-(bed[0] - HER_AT[0]), -(bed[1] - HER_AT[1]));
  // She turns away the short way round, and looks away to that side first.
  const away = Math.sign(wrap(facings[0] - toHim)) || 1;

  /** The point `d` along the straight path, and the way that leg of it runs. */
  function straightAt(d) {
    let leg = 0;
    while (leg < legs.length - 1 && d > ends[leg]) leg++;
    const [ax, az] = path[leg];
    const [bx, bz] = path[leg + 1];
    const f = clamp((d - (ends[leg] - legs[leg])) / legs[leg], 0, 1);
    return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, facing: facings[leg] };
  }

  /**
   * Where her body is `d` along her way, and the way it faces. Her path's
   * corners are rounded off (a curve from CORNER before each to CORNER after
   * it), so she walks round them rather than to a point and off at an angle
   * -- a body cutting a corner leaves its planted foot far behind.
   */
  function wayAt(d) {
    for (let i = 0; i < ends.length - 1; i++) {
      if (Math.abs(d - ends[i]) >= CORNER) continue;
      const a = straightAt(ends[i] - CORNER);
      const [cx, cz] = path[i + 1];
      const b = straightAt(ends[i] + CORNER);
      const u = (d - (ends[i] - CORNER)) / (2 * CORNER);
      const x = (1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * cx + u * u * b.x;
      const z = (1 - u) * (1 - u) * a.z + 2 * u * (1 - u) * cz + u * u * b.z;
      const dx = (1 - u) * (cx - a.x) + u * (b.x - cx);
      const dz = (1 - u) * (cz - a.z) + u * (b.z - cz);
      return { x, z, facing: Math.atan2(-dx, -dz) };
    }
    return straightAt(d);
  }

  /** Where her body is at `t`, the way it faces, how fast it goes, and how far she has turned back to look at him. */
  function bodyAt(t, eye) {
    const d = distanceAt(t, glanceAt);
    const { x, z, facing } = wayAt(d);
    const speed = (d - distanceAt(t - 0.05, glanceAt)) / 0.05;
    const turned = smooth(t, KEPT_BED.turn, KEPT_BED.turn + 0.75);
    let yaw = t < KEPT_BED.turn + 0.75 ? toHim + wrap(facings[0] - toHim) * turned : facing;
    // The look back: her feet turn a little toward him; her spine, neck and head do the rest.
    const back = smooth(t, KEPT_BED.glance - 0.15, KEPT_BED.glance + 0.3) * (1 - smooth(t, KEPT_BED.onward - 0.3, KEPT_BED.onward + 0.05));
    const toward = wrap(Math.atan2(-(eye.x - x), -(eye.z - z)) - yaw);
    const pivot = Math.sign(toward) * Math.min(Math.abs(toward), 0.6) * back;
    const twist = Math.sign(toward) * Math.min(Math.max(0, Math.abs(toward) - 0.6), 1.5) * back;
    yaw += pivot;
    return { d, x, z, yaw, speed, turned, back, twist };
  }

  // Her feet, read off her standing pose the first frame: where each sits against her body.
  let feet = null;
  let breath = 0;
  let arm = 0;
  // The step clock: steps walked, the next one due, and which foot went last.
  let steps = 0;
  let lastD = 0;
  let nextStep = 0;
  let wasWalking = false;
  let lastFoot = null;

  function readFeet() {
    root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    feet = SIDES.map((side) => {
      const ankle = bone(`${side}Foot`).getWorldPosition(new THREE.Vector3());
      const hip = bone(`${side}UpLeg`).getWorldPosition(new THREE.Vector3());
      const thigh = hip.distanceTo(bone(`${side}Leg`).getWorldPosition(new THREE.Vector3()));
      const shin = bone(`${side}Leg`).getWorldPosition(new THREE.Vector3()).distanceTo(ankle);
      const toes = bone(`${side}ToeBase`)?.getWorldPosition(new THREE.Vector3());
      return {
        side,
        // Ankle to the ball of the foot, flat: what a heel coming up turns about.
        length: toes ? Math.hypot(toes.x - ankle.x, toes.z - ankle.z) : 0.12,
        rise: toes ? ankle.y - toes.y : 0.06,
        // Where it stands against her body, in her root's own frame.
        home: root.worldToLocal(ankle.clone()),
        height: ankle.y,
        // How it sits against her body, so a planted foot keeps its own turn as she turns over it.
        sits: rootQ.clone().multiply(bone(`${side}Foot`).getWorldQuaternion(new THREE.Quaternion())),
        // A little past how far the leg stands at rest: straight, as a walking leg is at either end of a step.
        reach: Math.min(hip.distanceTo(ankle) + 0.01, 0.995 * (thigh + shin)),
        at: ankle.clone(),
        yaw: her.yaw,
        step: null
      };
    });
  }

  /** Where `foot` belongs under a body at `pose`. */
  function homeOf(foot, pose, out) {
    out.copy(foot.home).applyAxisAngle(UP, pose.yaw + Math.PI);
    out.x += pose.x;
    out.z += pose.z;
    out.y = foot.height;
    return out;
  }

  /**
   * A planted foot as it sits this frame: flat, or, behind her as she walks,
   * up on its toes -- the heel lifted about the ball of the foot, which
   * lifts and brings forward the ankle a little.
   */
  function onToes(foot, pose) {
    forward(pose.yaw, _dir);
    const behind = -((foot.at.x - pose.x) * _dir.x + (foot.at.z - pose.z) * _dir.z);
    const pitch = TOE_OFF * smooth(behind, 0.1, 0.45) * clamp(pose.speed / WALKING, 0, 1);
    // The ankle turns about the ball, which is ahead of it and below it.
    const at = foot.at.clone();
    forward(foot.yaw, _dir);
    at.addScaledVector(_dir, foot.length * (1 - Math.cos(pitch)) + foot.rise * Math.sin(pitch));
    at.y += foot.length * Math.sin(pitch) + foot.rise * (Math.cos(pitch) - 1);
    return { at, pitch };
  }

  /** Lifts `foot` to come down where her body will want it `swing` seconds on. */
  function stepOff(foot, t, swing, pose, eye) {
    const ahead = bodyAt(t + swing, eye);
    // Walking, a little under half a step on from under her: the other foot is the rest of the step behind, on its toes.
    const lead = ahead.speed > WALKING ? 0.42 * stepLength(ahead.speed) : 0;
    const to = homeOf(foot, ahead, new THREE.Vector3()).addScaledVector(forward(ahead.yaw, _dir), lead);
    const { at, pitch } = onToes(foot, pose);
    foot.step = { from: at, fromPitch: pitch, to, fromYaw: foot.yaw, toYaw: ahead.yaw, start: t, swing };
    lastFoot = foot;
  }

  /** Each foot's ankle and turn this frame, stepping any that her body has left. Calls onStep(x, z) as a foot comes down. */
  function moveFeet(t, pose, eye, onStep) {
    for (const foot of feet) {
      if (foot.step && t >= foot.step.start + foot.step.swing) {
        foot.at.copy(foot.step.to);
        foot.yaw = foot.step.toYaw;
        foot.step = null;
        onStep?.(foot.at.x, foot.at.z);
      }
    }
    // A planted foot swivels on its ball as she turns over it, rather than twist her leg.
    for (const foot of feet) {
      if (foot.step) continue;
      const off = wrap(pose.yaw - foot.yaw);
      if (Math.abs(off) <= SWIVEL) continue;
      // About the ball of the foot: the toes stay, the heel comes round.
      const ball = foot.at.clone().addScaledVector(forward(foot.yaw, _dir), foot.length);
      foot.yaw += off - Math.sign(off) * SWIVEL;
      foot.at.copy(ball).addScaledVector(forward(foot.yaw, _dir), -foot.length);
    }
    const walking = pose.speed > WALKING;
    const length = stepLength(pose.speed);
    steps += (pose.d - lastD) / length;
    lastD = pose.d;
    // Setting off, the first step comes soon.
    if (walking && !wasWalking) nextStep = steps + 0.3;
    wasWalking = walking;
    if (!feet.some((foot) => foot.step)) {
      if (walking) {
        const next = feet.find((foot) => foot !== lastFoot);
        // Due, or about to be left further behind than her leg will stretch.
        const late = Math.hypot(homeOf(next, pose, _c).x - next.at.x, _c.z - next.at.z) > 0.8 * length;
        if (steps >= nextStep || late) {
          nextStep = Math.floor(steps) + 1;
          // Feet in turn, and always some time on both.
          stepOff(next, t, Math.min(SWING, (0.85 * length) / pose.speed), pose, eye);
        }
      } else {
        let worst = null;
        let worstBy = 1;
        for (const foot of feet) {
          homeOf(foot, pose, _c);
          const off = Math.hypot(_c.x - foot.at.x, _c.z - foot.at.z);
          const by = Math.max(off / SLACK, Math.abs(wrap(foot.yaw - pose.yaw)) / SLACK_TURN);
          if (by > worstBy) { worst = foot; worstBy = by; }
        }
        if (worst) stepOff(worst, t, TURN_SWING, pose, eye);
      }
    }
    return feet.map((foot) => {
      if (!foot.step) return { foot, yaw: foot.yaw, ...onToes(foot, pose) };
      const { from, fromPitch, to, fromYaw, toYaw, start, swing } = foot.step;
      const u = clamp((t - start) / swing, 0, 1);
      const e = u * u * (3 - 2 * u);
      // A shuffle barely leaves the floor; a stride is carried.
      const size = clamp(from.distanceTo(to) / 0.3, 0.35, 1);
      const at = from.clone().lerp(to, e);
      at.y += LIFT * size * Math.sin(Math.PI * u);
      // Off its toes, carried a little toe down, and put down heel first.
      const pitch = fromPitch * (1 - e) + size * Math.sin(Math.PI * u) * (0.3 * (1 - u) - 0.15 * u);
      return { foot, at, yaw: fromYaw + wrap(toYaw - fromYaw) * e, pitch };
    });
  }

  /** Her hips down as far as the furthest foot needs, then each leg solved to its foot. */
  function plantLegs(placed) {
    root.updateMatrixWorld(true);
    let drop = 0;
    for (const { foot, at } of placed) {
      bone(`${foot.side}UpLeg`).getWorldPosition(_a);
      const flat = Math.hypot(at.x - _a.x, at.z - _a.z);
      const fits = Math.sqrt(Math.max(0, foot.reach * foot.reach - flat * flat));
      drop = Math.max(drop, _a.y - at.y - fits);
    }
    if (drop > 1e-4) {
      const hips = bone('Hips');
      hips.getWorldPosition(_a);
      _a.y -= Math.min(drop, MAX_DROP);
      hips.position.copy(hips.parent.worldToLocal(_a));
      root.updateMatrixWorld(true);
    }
    for (const { foot, at, yaw, pitch } of placed) {
      const hip = bone(`${foot.side}UpLeg`);
      const knee = bone(`${foot.side}Leg`);
      const ankle = bone(`${foot.side}Foot`);
      hip.getWorldPosition(_a);
      knee.getWorldPosition(_b);
      ankle.getWorldPosition(_c);
      const thigh = _a.distanceTo(_b);
      const shin = _b.distanceTo(_c);
      _dir.subVectors(at, _a);
      const reach = clamp(_dir.length(), Math.abs(thigh - shin) + 1e-3, thigh + shin - 1e-3);
      _dir.normalize();
      // The knee bends the way the foot points.
      forward(yaw, _bend).addScaledVector(_dir, -_bend.dot(_dir)).normalize();
      const cos = clamp((thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach), -1, 1);
      _knee.copy(_a).addScaledVector(_dir, cos * thigh).addScaledVector(_bend, Math.sin(Math.acos(cos)) * thigh);
      aimBone(hip, knee, _knee);
      aimBone(knee, ankle, at);
      // The foot keeps its own turn on the floor, and pitches through a step.
      _world.setFromAxisAngle(UP, yaw + Math.PI).multiply(foot.sits);
      if (pitch) {
        forward(yaw, _axis);
        _pitch.setFromAxisAngle(_b.set(_axis.z, 0, -_axis.x), pitch);
        _world.premultiply(_pitch);
      }
      ankle.parent.getWorldQuaternion(_parent).invert();
      ankle.quaternion.copy(_parent.multiply(_world));
      ankle.updateMatrixWorld(true);
    }
  }

  /**
   * Her arms let down to her sides for walking, and swung against her legs:
   * standing, her figure holds her left hand to her ribs and her right out
   * in front of her, and walking like that she looks to be carrying
   * something. `swing` is her right arm's, forward positive.
   */
  function swingArms(weight, swing) {
    if (weight < 1e-3) return;
    figure.root.updateMatrixWorld(true);
    // Her model faces +Z; her right is -X.
    for (const [side, out, ahead] of [['Right', -1, swing], ['Left', 1, -swing]]) {
      const shoulder = bone(`${side}Arm`);
      const elbow = bone(`${side}ForeArm`);
      const hand = bone(`${side}Hand`);
      // Down, a little out from her side, and forward or back with the swing; the elbow a little bent.
      shoulder.getWorldPosition(_c);
      _axis.set(0.12 * out, -1, 0.05 + 0.4 * ahead).normalize().transformDirection(figure.root.matrixWorld);
      aimBone(shoulder, elbow, _knee.copy(_c).add(_axis), weight);
      elbow.getWorldPosition(_c);
      _axis.set(0.04 * out, -1, 0.3 + 0.35 * ahead).normalize().transformDirection(figure.root.matrixWorld);
      aimBone(elbow, hand, _knee.copy(_c).add(_axis), weight);
      // Hanging hands curl a little; her pose holds them open.
      _turn.setFromEuler(_euler.set(0.3 * weight, 0, 0));
      for (const finger of FINGERS) {
        for (const joint of [1, 2, 3]) bone(`${side}Hand${finger}${joint}`)?.quaternion.multiply(_turn);
      }
    }
  }

  /**
   * Plays frame `t` (seconds from the picture coming up). `eye` is his eye,
   * world. Returns false once she is through the door.
   */
  function frame(t, dt, eye, onStep) {
    const pose = bodyAt(t, eye);
    if (pose.d >= total) return false;

    // The chain: she flinches each time he pulls at it, the second time less, and her body
    // jerks back a hand's width over her planted feet.
    const jolt = flinch(t, KEPT_BED.chain, 1) + flinch(t, KEPT_BED.chainAgain, 0.6);
    const recoil = 0.05 * (smooth(t, KEPT_BED.chain, KEPT_BED.chain + 0.12) * (1 - smooth(t, KEPT_BED.chain + 0.5, KEPT_BED.chain + 1.6))
      + 0.6 * smooth(t, KEPT_BED.chainAgain, KEPT_BED.chainAgain + 0.12) * (1 - smooth(t, KEPT_BED.chainAgain + 0.5, KEPT_BED.lookAway + 0.9)));
    forward(toHim, _dir);
    her.setPosition(pose.x - _dir.x * recoil, pose.z - _dir.z * recoil);
    her.setYaw(pose.yaw);
    // Failure never exposes the human figure. Keep the same path and cue clock,
    // using the monster's own grounded gait rather than the Mixamo-only pose.
    if (!figure) {
      her.setCorrection(0);
      her.setSpeed(pose.speed);
      her.update(dt);
      her.offsetBones({ Head: [jolt * .05, pose.twist * .25, 0] });
      const count = Math.floor(pose.d / .55);
      while (steps < count) { steps++; onStep?.(pose.x, pose.z); }
      return true;
    }
    // Her figure poses her, its own walk off: the feet below do the walking.
    figure.setLocomotion(0, 0);
    // Her eyes are on him until she cannot look at him any more.
    figure.update(dt, t < KEPT_BED.lookAway ? eye : null);
    if (!feet) readFeet();
    const placed = moveFeet(t, pose, eye, onStep);

    // Spent from the haul: she pants, stooped, and straightens as her breath comes back.
    const spent = 1 - smooth(t, 0, 3.2);
    breath += dt * (2.2 + 2.2 * spent);
    const inhale = Math.sin(breath) * (0.012 + 0.028 * spent);
    // Her promise kept: a slow nod, and her head stays tilted until she looks away.
    const nod = Math.sin(Math.PI * clamp((t - KEPT_BED.promise) / 1.2, 0, 1));
    const tilt = smooth(t, KEPT_BED.promise, KEPT_BED.promise + 0.5) * (1 - smooth(t, KEPT_BED.lookAway, KEPT_BED.lookAway + 0.4));
    // Looking away, down and to the side she will turn: her head leads the turn, her shoulders follow it.
    const ashamed = smooth(t, KEPT_BED.lookAway, KEPT_BED.lookAway + 0.55);
    const leads = ashamed * (1 - pose.turned);
    const shoulders = Math.sin(Math.PI * pose.turned);
    // Walking: which foot is ahead, -1..1 (left ahead is +1), swings her shoulders and her right arm against it.
    const walking = clamp(pose.speed / 0.8, 0, 1);
    forward(pose.yaw, _dir);
    const gait = clamp(_dir.dot(_a.subVectors(placed[0].at, placed[1].at)) / stepLength(pose.speed), -1, 1) * walking;
    // Her arms come down as she turns to go, and stay down when she stops to look back.
    arm += (Math.max(walking, pose.turned) - arm) * (1 - Math.exp(-dt / 0.25));
    const idle = Math.sin(t * 0.9) * (1 - walking);
    const shrug = 0.08 * jolt + inhale * 0.6;
    her.offsetBones({
      Spine: [0.08 * spent + 0.04 * ashamed + 0.03 * walking - 0.05 * jolt, 0.15 * pose.twist, 0.02 * idle],
      Chest: [-inhale - 0.12 * jolt, 0.12 * away * leads + 0.22 * away * shoulders + 0.3 * pose.twist + 0.05 * gait, -0.012 * idle],
      Neck: [0.05 * nod + 0.05 * ashamed, 0.2 * away * leads + 0.2 * pose.twist, 0],
      Head: [0.14 * nod + 0.14 * ashamed * (1 - pose.back) + 0.06 * walking - 0.12 * jolt + 0.08 * pose.back, 0.5 * away * leads + 0.35 * pose.twist, 0.08 * away * tilt],
      'left shoulder': [-0.04 * jolt, 0, shrug],
      'right shoulder': [0.04 * jolt, 0, -shrug]
    });
    plantLegs(placed);
    swingArms(arm, gait);
    root.updateMatrixWorld(true);
    return true;
  }

  return { atDoor, duration: atDoor + KEPT_BED.closing, frame };
}
