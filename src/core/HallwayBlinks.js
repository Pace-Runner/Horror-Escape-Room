import * as THREE from 'three';
import { segmentBlocked } from './collision.js';
import { createFrameClock } from './FrameClock.js';

/**
 * THE DOOR-1 SCENE: the bedroom door opens onto the upstairs hall, and the
 * lights start going.
 *
 *   1. the view settles down the hall (onto the door's centre line first, if
 *      the door was opened from off to one side)
 *   2. the hall is lit, and empty
 *   3. the lights go -- and when they come back it is standing at the far end
 *   4. they go again, something moves in the dark, and it is a fifth closer
 *   5. again, and it is half way, its head cocked over
 *   6. one last time, and the light comes back on an empty hall
 *
 * Then the singing starts below, and the player can move.
 *
 * WHY THROUGH THE PLAYER'S OWN CAMERA. It used to be a letterboxed scene on
 * the runner's camera, with cuts. This is the player's view, with their hands
 * and their torch, framed exactly as play is: the scare is that nothing about
 * the picture changes except what is standing in it. The same shape as
 * core/StairsScare.js -- player.cinematic holds the camera, player.aim turns
 * the head, and the steps run on the frame clock so Esc holds them.
 *
 * Every lights-out is main.js's house blackout (the one the stairs scare
 * uses), and the torch dies with it, or the beam would show it moving.
 */

/** Seconds the view takes to settle down the hall. */
const SETTLE_SECONDS = 0.7;
/** Off the door's centre line by more than this, the player glides onto it first. */
const DOOR_LINE_TOLERANCE_METRES = 0.25;
/** The glide stops at least this far back from the doorway, in the bedroom. */
const DOOR_LINE_BACK_METRES = 0.7;
/** The lit, empty hall before the first blackout. */
const EMPTY_HALL_SECONDS = 0.4;
/** Where the view is aimed on the figure: about its face. */
const AIM_HEIGHT_METRES = 2.0;

/**
 * The blinks. `along` is how far it has come when the light returns: 0 at the
 * far end, 1 at the player. `sideMetres` moves it across the hall -- half way
 * down it would otherwise stand with its head in the pendant's shade.
 *
 * Twice as fast as the first cut (user, 2026-10-23): it is seen for half as
 * long, which is what makes each sighting a flash rather than a look.
 */
const BLINKS = [
  { darkSeconds: 0.35, along: 0, litSeconds: 0.8, steps: 0 },
  { darkSeconds: 0.3, along: 0.2, litSeconds: 0.65, steps: 2 },
  { darkSeconds: 0.33, along: 0.5, litSeconds: 0.55, steps: 3, sideMetres: -0.45, cocked: true }
];
/** The last dark, in which it goes. */
const LAST_DARK_SECONDS = 0.4;
/** Its feet in the dark, between blinks. */
const STEP_SPACING_SECONDS = 0.1;
const STEP_LEVEL = 0.45;
const STEP_LEVEL_RISE = 0.12;
/** The clunk of the house's lights going and coming back. */
const LIGHTS_OFF_GAIN_DB = 4;
const LIGHTS_ON_GAIN_DB = 1;
/** The torch dying as the lights do: [seconds into the dark, power 0..1]. */
const TORCH_DIES = [[0, 0.5], [0.05, 0], [0.11, 0.3], [0.16, 0]];
/** Its head over on one side, at the last blink (+x curls forward on this rig). */
const COCKED_POSE = { Neck: [0.12, 0, 0.16], Head: [0.1, 0, 0.32] };

function smoothstep(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/** The shortest signed angle from `from` to `to`, in radians. */
function angleBetween(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * @param {object} deps
 * @param {THREE.PerspectiveCamera} deps.camera - the player's own camera
 * @param {object} deps.player - core/PointerLockPlayer.js
 * @param {object} deps.interaction - core/Interaction.js
 * @param {object} deps.creature - systems/OkabeCreature.js, the house monster
 * @param {(at: {x: number, z: number}) => void} deps.showCreature - stands it
 *   there facing the player, breathing, until hideCreature.
 * @param {() => void} deps.hideCreature
 * @param {(out: boolean) => void} deps.setHouseLightsOut - main.js's blackout.
 * @param {() => () => void} deps.forceFirstPerson - returns the view put back.
 * @param {object} deps.torch - setPower(0..1), which scales the beam only.
 * @param {(name: string, opts?: object) => unknown} deps.sfx
 * @param {object} deps.audio - world/AudioEngine.js (footsteps)
 * @param {object} deps.hallway - the upstairs hallway's refs: farEnd, doorway.
 * @param {() => object[]} deps.getColliders - what the player collides with now.
 */
export function createHallwayBlinks({
  camera,
  player,
  interaction,
  creature,
  showCreature,
  hideCreature,
  setHouseLightsOut,
  forceFirstPerson,
  torch,
  sfx,
  audio,
  hallway,
  getColliders
}) {
  const clock = createFrameClock();
  const animate = clock.animate;
  let running = false;
  let cocked = false;

  /** The yaw and pitch that look from the player's eye at (x, y, z). */
  function aimAt(x, y, z) {
    const dx = x - camera.position.x;
    const dz = z - camera.position.z;
    return {
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(y - camera.position.y, Math.hypot(dx, dz))
    };
  }

  /** Eases the head from where it is now onto `to` over the animation's t. */
  function turnTo(to) {
    const fromYaw = player.yaw;
    const fromPitch = player.pitch;
    const yawChange = angleBetween(fromYaw, to.yaw);
    return (t) => {
      const eased = smoothstep(t);
      player.aim(fromYaw + yawChange * eased, fromPitch + (to.pitch - fromPitch) * eased);
    };
  }

  /** Step 1: onto the door's centre line if need be, and the view down the hall. */
  function settle(isAlive) {
    const from = { x: camera.position.x, z: camera.position.z };
    const door = hallway.doorway;
    let to = from;
    // Only from the bedroom side; G's carry puts them in the hall already.
    if (from.z < door.z && Math.abs(from.x - door.x) > DOOR_LINE_TOLERANCE_METRES) {
      const target = { x: door.x, z: Math.min(from.z, door.z - DOOR_LINE_BACK_METRES) };
      if (!segmentBlocked(from.x, from.z, target.x, target.z, getColliders())) to = target;
    }
    const far = hallway.farEnd;
    // Aimed from where the glide ends, not from where it starts.
    const dx = far.x - to.x;
    const dz = far.z - to.z;
    const aim = { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(AIM_HEIGHT_METRES - camera.position.y, Math.hypot(dx, dz)) };
    const turn = turnTo(aim);
    return animate(SETTLE_SECONDS, isAlive, (t) => {
      const eased = smoothstep(t);
      player.teleport(from.x + (to.x - from.x) * eased, from.z + (to.z - from.z) * eased);
      turn(t);
    });
  }

  /** The house goes dark, and the torch with it. Returns the per-frame sputter. */
  function lightsOut() {
    setHouseLightsOut(true);
    sfx('breaker_off', { gainDb: LIGHTS_OFF_GAIN_DB });
    let next = 0;
    return (elapsedSeconds) => {
      while (next < TORCH_DIES.length && TORCH_DIES[next][0] <= elapsedSeconds) {
        torch.setPower(TORCH_DIES[next][1]);
        next++;
      }
    };
  }

  function lightsOn() {
    setHouseLightsOut(false);
    torch.setPower(1);
    sfx('breaker_on', { gainDb: LIGHTS_ON_GAIN_DB });
  }

  /** One blink: dark, it moves (or arrives), the view finds where it is, light. */
  async function blink(b, index, isAlive) {
    const sputter = lightsOut();
    const far = hallway.farEnd;
    const eye = camera.position;
    const x = far.x + (eye.x - far.x) * b.along + (b.sideMetres ?? 0);
    const z = far.z + (eye.z - far.z) * b.along;
    if (index === 0) {
      showCreature({ x, z });
    } else {
      creature.setPosition(x, z);
      creature.setYaw(Math.atan2(-(eye.x - x), -(eye.z - z)));
    }
    // Gone completely while the lights are out -- not a dark shape with eyes
    // in it moving up the hall (Kiran, 2026-10-28). It is moved in the dark and
    // only shown again with the light, where it now stands.
    creature.visible = false;
    cocked = !!b.cocked;
    if (b.steps) audio.footsteps({ count: b.steps, spacing: STEP_SPACING_SECONDS, pan: 0, level: STEP_LEVEL + STEP_LEVEL_RISE * index });
    // In the dark the head finds where it will be, so the light comes back on it.
    const turn = turnTo(aimAt(x, AIM_HEIGHT_METRES, z));
    if (!await animate(b.darkSeconds, isAlive, (t, elapsed) => { sputter(elapsed); turn(t); })) return false;
    lightsOn();
    creature.visible = true;
    return animate(b.litSeconds, isAlive);
  }

  /** The last dark, in which it goes, and the light back on an empty hall. */
  async function lastBlink(isAlive) {
    const sputter = lightsOut();
    cocked = false;
    hideCreature();
    sfx('gasp');
    if (!await animate(LAST_DARK_SECONDS, isAlive, (_t, elapsed) => sputter(elapsed))) return false;
    lightsOn();
    return true;
  }

  function takeControl() {
    player.cinematic = true;
    player.movementEnabled = false;
    player.lookEnabled = false;
    interaction?.setEnabled(false);
  }

  /**
   * Gives everything back, from any point in the timeline. Aborted by a
   * restart, movement, looking and interaction are left as the restart set them
   * (the bedroom starts with movement locked).
   */
  function giveBackControl(restoreView, wasAborted) {
    clock.clear();
    cocked = false;
    hideCreature();
    torch.setPower(1);
    setHouseLightsOut(false);
    player.cinematic = false;
    restoreView?.();
    if (wasAborted) return;
    player.movementEnabled = true;
    player.lookEnabled = true;
    interaction?.setEnabled(true);
  }

  return {
    get isRunning() {
      return running;
    },

    /**
     * Advances the scene. Called every frame by main.js, with 0 while paused,
     * AFTER the creature's own update: the cocked head is a bone offset, and
     * update() resets every bone.
     */
    update(dt) {
      if (cocked && creature.visible) creature.offsetBones(COCKED_POSE);
      clock.update(dt);
    },

    /**
     * Plays the whole scene.
     *
     * @returns {Promise<boolean>} true if it played to the end.
     */
    async run({ isAlive = () => true } = {}) {
      if (running) return false;
      running = true;
      takeControl();
      const restoreView = forceFirstPerson();
      let finished = false;
      try {
        finished = await settle(isAlive) && await animate(EMPTY_HALL_SECONDS, isAlive);
        for (let i = 0; finished && i < BLINKS.length; i++) finished = await blink(BLINKS[i], i, isAlive);
        finished = finished && await lastBlink(isAlive);
        return finished;
      } finally {
        running = false;
        giveBackControl(restoreView, !isAlive());
      }
    }
  };
}
