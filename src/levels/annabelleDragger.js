import * as THREE from 'three';
import { createAnnabelle } from './annabelleFigure.js';

/**
 * ANNABELLE, DRAGGING: her figure (annabelleFigure.js) dressed in the handful
 * of calls core/JumpScare.js and a scare make on the monster (OkabeCreature),
 * so the kept ending's haul (jumpScares/hauled.js) can be played by either.
 *
 * Her own update() puts every bone back to her pose and acts on top, each
 * frame; everything here goes on after it, the way OkabeCreature.offsetBones
 * goes on after its gait, so nothing has to be undone. Her model faces +Z;
 * the monster's yaw 0 faces -Z, and that is the yaw this speaks.
 */

/** The monster's bone names, as the runner and the scares say them, on her Mixamo rig. */
const BONES = {
  spine: [['Spine', 1]],
  chest: [['Spine1', 0.5], ['Spine2', 0.5]],
  neck: [['Neck', 1]],
  head: [['Head', 1]],
  'left shoulder': [['LeftShoulder', 1]],
  'right shoulder': [['RightShoulder', 1]],
  'left arm': [['LeftArm', 1]],
  'left elbow': [['LeftForeArm', 1]],
  'left wrist': [['LeftHand', 1]],
  'right arm': [['RightArm', 1]],
  'right elbow': [['RightForeArm', 1]],
  'right wrist': [['RightHand', 1]]
};
/** Her stride, radians of the walk's phase a metre, and how long her steps are against her own walk. */
const STRIDE = 4.2;
const STRIDE_REACH = 2.4;
/** Her eyes, from the head bone: up, and toward the way she faces. */
const EYES_UP = 0.07;
const EYES_AHEAD = 0.08;
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

const _euler = new THREE.Euler();
const _turn = new THREE.Quaternion();

export function createAnnabelleDragger() {
  const figure = createAnnabelle();
  figure.setCorrectedSight(true);
  const group = new THREE.Group();
  group.name = 'Annabelle (dragging)';
  const root = new THREE.Group();
  group.add(root);
  root.add(figure.root);
  const bones = new Map();
  let yaw = 0;
  let speed = 0;
  let backwards = false;
  let phase = 0;
  const grip = { l: 0, r: 0 };

  const ready = figure.ready.then(() => {
    figure.root.traverse((object) => {
      if (object.isBone) bones.set(object.name.replace(/^mixamorig[:_]?/, ''), object);
    });
  });

  function turn(bone, x, y, z) {
    if (!bone) return;
    bone.quaternion.multiply(_turn.setFromEuler(_euler.set(x, y, z)));
  }

  const dragger = {
    group,
    ready,
    refs: {
      root,
      get head() { return bones.get('Head') ?? null; }
    },
    get visible() { return group.visible; },
    set visible(on) { group.visible = !!on; },
    get yaw() { return yaw; },
    isSilhouette: false,
    /** Her own figure (annabelleFigure.js), for a beat that is not a haul: the kept ending's last look. */
    figure,
    /**
     * How she drags him (jumpScares/hauled.js, which lists the fields). Her
     * arms are short for the monster's stoop, so she bends less, has his leg
     * up at her hips, and looks at him. She is a girl hauling a grown man: she
     * leans her whole weight back, breathes hard, steps long and braced, looks
     * back over her shoulder at where she is going, and once her knees give.
     */
    haulStyle: {
      curl: 0.55, nod: -0.4, legLift: 0.9, lean: 0.4, bob: 0.05, rock: 0.1,
      breath: 0.06, breathRate: 1.7, twitch: 0, cock: 0.12, glance: 1.1, yankEvery: 0, stumble: 0.08
    },

    reset() {
      figure.reset();
      speed = 0;
      backwards = false;
      phase = 0;
      grip.l = grip.r = 0;
    },
    // The monster's looks and tics, which she does not have.
    setCorrection() {},
    setSilhouette() {},
    setTwitches() {},

    setSpeed(metresPerSecond) { speed = Math.max(0, metresPerSecond || 0); },
    setBackwards(on) { backwards = !!on; },
    setGrip(left = 0, right = left) {
      grip.l = Number.isFinite(left) ? left : 0;
      grip.r = Number.isFinite(right) ? right : 0;
    },

    /** Her pose for this frame: her own, a walk at the speed set (backwards if so), and the grip. */
    update(dt) {
      phase += (backwards ? -1 : 1) * speed * STRIDE * dt;
      figure.setLocomotion(speed, phase, STRIDE_REACH);
      figure.update(dt, null);
      for (const [side, amount] of [['Left', grip.l], ['Right', grip.r]]) {
        if (!amount) continue;
        for (const finger of FINGERS) {
          for (const joint of [1, 2, 3]) turn(bones.get(`${side}Hand${finger}${joint}`), amount * 0.55, 0, 0);
        }
      }
      root.updateMatrixWorld(true);
    },

    /** Adds rotations to this frame's pose, by the monster's bone names (OkabeCreature.offsetBones). */
    offsetBones(offsets, weight = 1) {
      for (const [name, rotation] of Object.entries(offsets)) {
        if (!rotation) continue;
        for (const [bone, share] of BONES[name.toLowerCase()] ?? []) {
          const w = share * weight;
          turn(bones.get(bone), (rotation[0] ?? 0) * w, (rotation[1] ?? 0) * w, (rotation[2] ?? 0) * w);
        }
      }
      root.updateMatrixWorld(true);
    },

    /** A bone of her own rig by its Mixamo name ('LeftUpLeg', 'Hips'), or null: for acting her legs (cutscenes/keptBedroom.js). */
    skeletonBone(name) { return bones.get(name) ?? null; },

    /** A bone by the monster's name ('right arm', 'left wrist', 'Head'), or null. */
    bone(name) {
      const map = BONES[name.toLowerCase()];
      return map ? bones.get(map[0][0]) ?? null : null;
    },

    setPosition(x, z) { root.position.set(x, 0, z); },
    get position() { return root.position; },
    setYaw(next) {
      yaw = next;
      root.rotation.y = yaw + Math.PI;
    },

    getEyePosition(out = new THREE.Vector3()) {
      const head = bones.get('Head');
      if (!head) return out.copy(root.position);
      head.getWorldPosition(out);
      out.x -= Math.sin(yaw) * EYES_AHEAD;
      out.z -= Math.cos(yaw) * EYES_AHEAD;
      out.y += EYES_UP;
      return out;
    }
  };
  dragger.visible = false;
  return dragger;
}
