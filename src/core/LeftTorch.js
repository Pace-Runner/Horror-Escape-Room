import * as THREE from 'three';
import { HELD_MAGNIFICATION } from '../systems/hands/sockets.js';

/**
 * The torch in the player's LEFT hand, kept apart from the right-hand item system
 * (core/HeldItems.js).
 *
 * WHY APART. The torch used to be one more item in the right hand, so picking up
 * a key or a crowbar put it away and switched it off, and the player had to
 * scroll back and relight it. Carried on its own, in the lower left of the view,
 * it stays out and lit whatever the right hand is doing. F still switches it.
 *
 * Like every held item the glove is not drawn: only the torch, parented to the
 * camera, with a little breathing, walking bob and look-lag so it is not nailed
 * to the lens. No clips, no rig -- the hands module builds the right hand only
 * (ACTIVE_SIDES in systems/hands/hands.js).
 *
 * Live-tunable from the console: edit window.__game.leftTorch.framing and the
 * next frame uses it.
 */
const deg = THREE.MathUtils.degToRad;

export const LEFT_TORCH_FRAMING = {
  /** Camera-space metres of the grip: left of, below and in front of the lens. */
  position: [-0.27, -0.26, -0.52],
  /** Camera-space direction the beam leaves along: forward, a touch up and inward. */
  aim: [0.24, 0.30, -0.92],
  /** Radians spun about the beam: which face of the barrel the camera sees. */
  roll: deg(-20),
  scale: HELD_MAGNIFICATION
};

/** Seconds for the torch to rise into view when first picked up. */
const RAISE_SECONDS = 0.6;
/** How far below its resting spot the torch starts, camera-space metres. */
const RAISE_DROP = 0.45;

const _up = new THREE.Vector3(0, 1, 0);
const _aim = new THREE.Vector3();
const _align = new THREE.Quaternion();
const _roll = new THREE.Quaternion();

/**
 * @param {object} deps
 * @param {THREE.Camera} deps.camera
 * @param {ReturnType<import('../world/itemMeshes.js').createItemMeshes>} deps.itemMeshes
 */
export function createLeftTorch({ camera, itemMeshes }) {
  const group = new THREE.Group();
  group.name = 'leftTorch';
  group.visible = false;
  camera.add(group);

  let mesh = null;
  let carried = false;
  /** 0..1 raise progress, eased in update(). */
  let raise = 0;
  let lagX = 0;
  let lagY = 0;
  let clock = 0;
  let nervous = 0;

  function ensureMesh() {
    if (mesh) return true;
    const model = itemMeshes.build('flashlight', 'held');
    if (!model) return false;
    mesh = model;
    group.add(mesh);
    return true;
  }

  function applyFraming(bobX, bobY, lagYaw, lagPitch) {
    const f = LEFT_TORCH_FRAMING;
    const drop = (1 - raise) * (1 - raise) * RAISE_DROP;
    group.position.set(f.position[0] + bobX, f.position[1] + bobY - drop, f.position[2]);
    _aim.fromArray(f.aim).normalize();
    _align.setFromUnitVectors(_up, _aim);
    _roll.setFromAxisAngle(_aim, f.roll);
    group.quaternion.copy(_roll).multiply(_align);
    // Look-lag: the torch trails the turn a little, then settles.
    group.rotateOnWorldAxis(_up, lagYaw);
    group.rotateX(lagPitch);
    group.scale.setScalar(f.scale);
  }

  return {
    group,
    framing: LEFT_TORCH_FRAMING,

    get carried() { return carried; },

    /** The torch is now in the left hand (or, with false, gone from it). */
    setCarried(on, { animate = true } = {}) {
      on = !!on;
      if (on && !carried) raise = animate ? 0 : 1;
      carried = on;
    },

    /**
     * Per frame. `motion` is main.js's handMotion; `viewShown` follows the hands
     * (hidden in third person, cutscenes and the jump scare).
     */
    update(dt, motion, viewShown) {
      clock += dt;
      const show = carried && viewShown && ensureMesh();
      group.visible = show;
      if (!show) return;

      raise = Math.min(1, raise + dt / RAISE_SECONDS);

      // Walking bob: the same phase as the player's step, a touch off the right
      // hand's so the two do not move as one rigid pair.
      const walk = motion.speed;
      const bobY = Math.sin(motion.bobPhase * 2 + 0.6) * 0.007 * walk + Math.sin(clock * 1.5) * 0.0025;
      const bobX = Math.cos(motion.bobPhase + 0.6) * 0.005 * walk + Math.sin(clock * 0.9) * 0.0015;

      const follow = 1 - Math.exp(-dt * 10);
      lagX += (THREE.MathUtils.clamp(-motion.lookDeltaX * 0.0012, -0.08, 0.08) - lagX) * follow;
      lagY += (THREE.MathUtils.clamp(-motion.lookDeltaY * 0.0012, -0.08, 0.08) - lagY) * follow;

      applyFraming(bobX, bobY, lagX, lagY);
      // A nervous wrist, only requested by the passage/fall cinematic.
      nervous += ((motion.torchShake || 0) - nervous) * (1 - Math.exp(-dt * 12));
      group.position.y += Math.sin(clock * 19) * 0.009 * nervous;
      group.position.x += Math.sin(clock * 13) * 0.004 * nervous;
      group.rotateX(Math.sin(clock * 17) * 0.035 * nervous);
      group.rotateZ(Math.sin(clock * 13 + 0.8) * 0.025 * nervous);
    },

    reset() {
      carried = false;
      raise = 0;
      nervous = 0;
      group.visible = false;
    }
  };
}
