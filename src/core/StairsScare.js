import * as THREE from 'three';

/**
 * The scare at the top of the upstairs hallway's stairs.
 *
 * The player walks up to the stairs and the game takes the camera:
 *
 *   1. the view settles on the stairs
 *   2. the house goes dark again, as it did for the rush
 *   3. the torch sputters and dies
 *   4. they shake it twice; it catches for a moment each time, then dies again
 *   5. a low growl, close behind them
 *   6. CUT to third person: the monster is right behind them, looking down at
 *      them (cutscenes/stairsBehind.js, through the scene runner)
 *   7. CUT back to first person; they turn round, and the torch catches as
 *      they do -- the hall is empty
 *   8. they turn back to the stairs, and it is there: the backrooms jump scare
 *   9. black, then the view comes back at the top of the stairs with the
 *      lights on. Nobody dies, and the torch works again.
 *
 * WHY NOT ALL ONE SCENE FOR THE RUNNER. core/Cutscene.js films through a camera
 * of its own and hides the hands for the whole scene -- right for a shot from
 * outside the head, wrong for steps 1-4 and 7, which are the player's own view
 * with the torch in their hand: the shake IS the hand. So those steps turn the
 * player's own camera (player.aim, with player.cinematic holding it), and only
 * step 6 goes through the runner. Step 8 is core/JumpScare.js, exactly as the
 * backrooms catch plays it.
 *
 * ON THE FRAME CLOCK, like the runner: main.js calls update(dt) every frame,
 * with 0 while the game is paused, so Esc holds the scene rather than letting
 * it play out behind the pause menu. Each frame is capped at MAX_FRAME_SECONDS,
 * so a stalled frame cannot skip a beat. Everything it borrows is handed back
 * in a `finally`, so a restart in the middle cannot leave a frozen camera.
 */

/** The most one frame may advance the timeline, so a stalled frame cannot skip a beat. */
const MAX_FRAME_SECONDS = 1 / 30;
/** Seconds the view takes to swing onto the stairs when the scare starts. */
const SETTLE_SECONDS = 0.8;
/** A slight downward look while settled on the stairs. */
const STAIRS_PITCH_RADIANS = -0.08;
const AFTER_LIGHTS_OUT_SECONDS = 0.9;
/** The house's power_down cue, quieter than the rush played it: this is the second time. */
const POWER_DOWN_GAIN_DB = -10;
/** The torch's death: [seconds from the start of the sputter, power 0..1]. */
const TORCH_DEATH_STEPS = [[0, 0.25], [0.07, 0.9], [0.16, 0], [0.3, 0.55], [0.36, 0.1], [0.5, 0]];
const AFTER_TORCH_DIES_SECONDS = 0.7;

/** One shake of the torch: a sharp flick down and back up. */
const SHAKE_SECONDS = 0.42;
const SHAKE_GAP_SECONDS = 0.3;
const SHAKE_DROP_METRES = 0.06;
const SHAKE_TILT_RADIANS = 0.32;
/** How far into a shake the batteries knock (the bottom of the flick). */
const SHAKE_KNOCK_AT = 0.45;
/** How bright the torch catches for at the bottom of each shake, and for how long. */
const SHAKE_SPUTTERS = [{ power: 0.55, seconds: 0.08 }, { power: 0.3, seconds: 0.05 }];
const AFTER_SHAKES_SECONDS = 0.7;

/**
 * The faint glow on the hand while the torch is dead: where it hangs in the
 * camera's own space (right, up, forward is -Z), and how strong and far.
 * Without it the shakes happen in pure black and cannot be seen.
 */
const HAND_GLOW_OFFSET = [0.15, 0.25, -0.25];
const HAND_GLOW_COLOUR = 0x8fa6c8;
const HAND_GLOW_INTENSITY = 0.35;
const HAND_GLOW_RANGE_METRES = 1.2;

const GROWL_SECONDS = 2.8;
/** How far into the growl the camera cuts to the shot from outside. */
const GROWL_LEAD_SECONDS = 1.3;

/** The turn round, the look at the empty hall, and the turn back. */
const PAUSE_BEFORE_TURN_SECONDS = 0.3;
const TURN_AROUND_SECONDS = 1.0;
const LOOK_BACK_SECONDS = 1.1;
const TURN_BACK_SECONDS = 0.9;
const PAUSE_BEFORE_SCARE_SECONDS = 0.35;
/** The torch catches again on the turn round, at this power, this far into the turn. */
const TORCH_CATCH_POWER = 0.75;
const TORCH_CATCH_AT_FRACTION = 0.55;

/** Black and silence after the scream, before the view comes back. */
const AFTER_SCARE_BLACK_SECONDS = 0.9;
const FADE_IN_MILLISECONDS = 650;

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
 * @param {object} deps.hands - the hands view model (setVisible, root)
 * @param {object} deps.creature - systems/OkabeCreature.js, the house monster
 * @param {object} deps.jumpScare - core/JumpScare.js
 * @param {object} deps.audio - world/AudioEngine.js (growl, torchRattle)
 * @param {(name: string, opts?: object) => unknown} deps.sfx - a recorded cue
 * @param {object} deps.fade - core/ScreenFade.js
 * @param {THREE.PointLight} deps.handLight - a light that is always in the
 *   scene and off; lit faintly by the hand while the torch is dead. Never added
 *   or removed here, because changing the scene's light count recompiles
 *   every shader.
 * @param {(out: boolean) => void} deps.setHouseLightsOut - main.js's blackout,
 *   the one the hallway rush uses.
 * @param {() => () => void} deps.forceFirstPerson - drops out of third person;
 *   returns a function that puts the player's chosen view back.
 * @param {object} deps.torch - main.js's torch: isAvailable(), bringOut(), and
 *   setPower(0..1), which scales the beam without touching its switch, and
 *   repair(), which clears any failure the torch was in the middle of.
 * @param {object} deps.hallway - the upstairs hallway's refs: stairsYaw.
 * @param {(standing: {x: number, z: number}) => Promise<boolean>} deps.playBehindShot -
 *   plays the third-person scene of the monster behind the player; resolves
 *   false if it was cancelled.
 */
export function createStairsScare({
  camera,
  player,
  interaction,
  hands,
  creature,
  jumpScare,
  audio,
  sfx,
  fade,
  handLight,
  setHouseLightsOut,
  forceFirstPerson,
  torch,
  hallway,
  playBehindShot,
  /**
   * Work to do while the screen is black after the scare (main.js warms the
   * backrooms here, so the way down does not stall on it). The black lasts
   * until this resolves, however long the compile takes.
   */
  whileBlack = () => Promise.resolve()
}) {
  const handGlowPosition = new THREE.Vector3();
  const handsRestPosition = new THREE.Vector3();
  const handsRestQuaternion = new THREE.Quaternion();
  const shakeQuaternion = new THREE.Quaternion();
  const shakeEuler = new THREE.Euler();
  /** Per-frame steps waiting on update(), each returning true once it is done. */
  let frameSteps = [];
  let running = false;
  /** True while a shake has the hands moved off their rest pose. */
  let isShaking = false;
  /** True from the jump scare's first frame until the view is handed back. */
  let isScareOnScreen = false;

  /**
   * Runs `onFrame(t)` once a frame for `seconds` of game time, t going 0 to 1.
   *
   * @returns {Promise<boolean>} false if `isAlive` turned false part way (a
   *   restart), in which case the caller must stop.
   */
  function animate(seconds, isAlive, onFrame = () => {}) {
    return new Promise((resolve) => {
      let elapsedSeconds = 0;
      frameSteps.push((dt) => {
        if (!isAlive()) { resolve(false); return true; }
        elapsedSeconds += Math.min(MAX_FRAME_SECONDS, dt);
        const t = Math.min(1, elapsedSeconds / seconds);
        onFrame(t);
        if (t < 1) return false;
        resolve(true);
        return true;
      });
    });
  }

  /** Turns the player's head from (fromYaw, fromPitch) to (toYaw, toPitch), eased. */
  function turnHead(fromYaw, fromPitch, toYaw, toPitch, seconds, isAlive, onTurn = () => {}) {
    const yawChange = angleBetween(fromYaw, toYaw);
    return animate(seconds, isAlive, (t) => {
      const eased = smoothstep(t);
      player.aim(fromYaw + yawChange * eased, fromPitch + (toPitch - fromPitch) * eased);
      onTurn(t);
    });
  }

  /** Steps the torch's power through a list of [seconds, power] keys. */
  function sputterTorch(steps, isAlive) {
    const totalSeconds = steps[steps.length - 1][0];
    let next = 0;
    return animate(totalSeconds, isAlive, (t) => {
      const seconds = t * totalSeconds;
      while (next < steps.length && steps[next][0] <= seconds) {
        torch.setPower(steps[next][1]);
        next++;
      }
    });
  }

  /** Puts the hands back where the shake found them, if one has them moved. */
  function restoreHands() {
    if (!isShaking) return;
    hands.root.position.copy(handsRestPosition);
    hands.root.quaternion.copy(handsRestQuaternion);
    isShaking = false;
  }

  /**
   * One shake: the hands flick down and tilt, and spring back. At the bottom
   * the batteries knock and the torch catches for a moment.
   */
  function shakeTorch(sputter, isAlive) {
    let knocked = false;
    let sputterEndsAt = -1;
    // Read now rather than when the scare starts: bringing the torch out can
    // re-frame the hands after that.
    handsRestPosition.copy(hands.root.position);
    handsRestQuaternion.copy(hands.root.quaternion);
    isShaking = true;
    return animate(SHAKE_SECONDS, isAlive, (t) => {
      const flick = Math.sin(Math.PI * t) * (1 - 0.35 * Math.sin(2 * Math.PI * t));
      hands.root.position.copy(handsRestPosition);
      hands.root.position.y -= SHAKE_DROP_METRES * flick;
      shakeEuler.set(-SHAKE_TILT_RADIANS * flick, 0, 0.12 * flick);
      shakeQuaternion.setFromEuler(shakeEuler);
      hands.root.quaternion.copy(handsRestQuaternion).multiply(shakeQuaternion);
      if (!knocked && t >= SHAKE_KNOCK_AT) {
        knocked = true;
        audio.torchRattle();
        torch.setPower(sputter.power);
        sputterEndsAt = t + sputter.seconds / SHAKE_SECONDS;
      }
      if (sputterEndsAt >= 0 && t >= sputterEndsAt) {
        torch.setPower(0);
        sputterEndsAt = -1;
      }
      if (t >= 1) {
        restoreHands();
        torch.setPower(0);
      }
    });
  }

  /**
   * With the house dark and the torch dead, nothing lights the hand, and the
   * shakes would happen in pure black. The hand light is hung just above the
   * hand, faint and short-range: enough to see the torch being shaken, not
   * enough to light the hall.
   */
  function lightTheHand() {
    handGlowPosition.set(...HAND_GLOW_OFFSET);
    camera.localToWorld(handGlowPosition);
    handLight.position.copy(handGlowPosition);
    handLight.color.setHex(HAND_GLOW_COLOUR);
    handLight.distance = HAND_GLOW_RANGE_METRES;
    handLight.intensity = HAND_GLOW_INTENSITY;
  }

  /** Takes the player's camera and everything that would get in its way. */
  function takeControl() {
    player.cinematic = true;
    player.movementEnabled = false;
    player.lookEnabled = false;
    interaction?.setEnabled(false);
  }

  /**
   * Gives everything back. Safe from any point in the timeline, because a
   * restart can land anywhere.
   *
   * @param {() => void} restoreView - from forceFirstPerson().
   * @param {boolean} wasAborted - a restart cut it short. The restart has
   *   already set movement, looking and interaction for the room it went to
   *   (the bedroom starts with movement locked), so those are left alone, and
   *   if the jump scare had the screen black, it is cleared: the scare blacks
   *   the screen as it aborts, after the restart has already cleared it.
   */
  function giveBackControl(restoreView, wasAborted) {
    frameSteps = [];
    handLight.intensity = 0;
    creature.visible = false;
    restoreHands();
    hands.setVisible?.(true);
    torch.repair();
    torch.setPower(1);
    setHouseLightsOut(false);
    player.cinematic = false;
    restoreView?.();
    if (wasAborted) {
      if (isScareOnScreen) fade.clear();
      isScareOnScreen = false;
      return;
    }
    player.movementEnabled = true;
    player.lookEnabled = true;
    interaction?.setEnabled(true);
  }

  /** Steps 1-4: the lights, the torch, and the two shakes. */
  async function playLightsOut(standing, isAlive) {
    if (!await turnHead(standing.yaw, standing.pitch, hallway.stairsYaw, STAIRS_PITCH_RADIANS, SETTLE_SECONDS, isAlive)) return false;
    sfx('power_down', { gainDb: POWER_DOWN_GAIN_DB });
    setHouseLightsOut(true);
    if (!await animate(AFTER_LIGHTS_OUT_SECONDS, isAlive)) return false;
    if (!torch.isAvailable()) return animate(AFTER_TORCH_DIES_SECONDS, isAlive);
    lightTheHand();
    if (!await sputterTorch(TORCH_DEATH_STEPS, isAlive)) return false;
    if (!await animate(AFTER_TORCH_DIES_SECONDS, isAlive)) return false;
    for (const sputter of SHAKE_SPUTTERS) {
      if (!await shakeTorch(sputter, isAlive)) return false;
      if (!await animate(SHAKE_GAP_SECONDS, isAlive)) return false;
    }
    return animate(AFTER_SHAKES_SECONDS, isAlive);
  }

  /** Steps 5-6: the growl, and the cut to it standing behind them. */
  async function playMonsterBehind(standing, isAlive) {
    audio.growl(GROWL_SECONDS);
    if (!await animate(GROWL_LEAD_SECONDS, isAlive)) return false;
    handLight.intensity = 0;
    const finished = await playBehindShot(standing);
    // The runner handed the camera back when the shot ended; this scene is
    // not over, so take it again before the next frame.
    player.cinematic = true;
    player.movementEnabled = false;
    player.lookEnabled = false;
    interaction?.setEnabled(false);
    // Gone before the first frame back in first person.
    creature.visible = false;
    return finished && isAlive();
  }

  /** Step 7: the turn round to an empty hall, and back to the stairs. */
  async function playTurnAround(isAlive) {
    const stairsYaw = hallway.stairsYaw;
    const backYaw = stairsYaw + Math.PI;
    if (!await animate(PAUSE_BEFORE_TURN_SECONDS, isAlive)) return false;
    let caught = false;
    const turnedAround = await turnHead(stairsYaw, STAIRS_PITCH_RADIANS, backYaw, 0, TURN_AROUND_SECONDS, isAlive, (t) => {
      if (caught || t < TORCH_CATCH_AT_FRACTION) return;
      caught = true;
      torch.setPower(TORCH_CATCH_POWER);
    });
    if (!turnedAround) return false;
    if (!await animate(LOOK_BACK_SECONDS, isAlive)) return false;
    if (!await turnHead(backYaw, 0, stairsYaw, 0, TURN_BACK_SECONDS, isAlive)) return false;
    return animate(PAUSE_BEFORE_SCARE_SECONDS, isAlive);
  }

  /** Step 8: the scare, then a beat of black. */
  async function playJumpScare(isAlive) {
    hands.setVisible?.(false);
    isScareOnScreen = true;
    await jumpScare.run({ creature, isAlive });
    if (!isAlive()) return false;
    const [stillAlive] = await Promise.all([animate(AFTER_SCARE_BLACK_SECONDS, isAlive), whileBlack()]);
    if (!stillAlive || !isAlive()) return false;
    isScareOnScreen = false;
    return true;
  }

  return {
    get isRunning() {
      return running;
    },

    /**
     * Advances the scene. Called every frame by main.js, with 0 while paused.
     *
     * @param {number} dt - seconds since the last frame.
     */
    update(dt) {
      if (frameSteps.length === 0) return;
      const steps = frameSteps;
      frameSteps = [];
      for (const step of steps) {
        if (!step(dt)) frameSteps.push(step);
      }
    },

    /**
     * Plays the whole scare.
     *
     * @param {object} options
     * @param {() => boolean} [options.isAlive] - false aborts (a restart).
     * @returns {Promise<boolean>} true if it played to the end.
     */
    async run({ isAlive = () => true } = {}) {
      if (running) return false;
      running = true;
      const standing = { x: camera.position.x, z: camera.position.z, yaw: player.yaw, pitch: player.pitch };
      takeControl();
      const restoreView = forceFirstPerson();
      torch.bringOut();
      let finished = false;
      try {
        finished = await playLightsOut(standing, isAlive)
          && await playMonsterBehind(standing, isAlive)
          && await playTurnAround(isAlive)
          && await playJumpScare(isAlive);
        if (finished) player.aim(hallway.stairsYaw, 0);
        return finished;
      } finally {
        running = false;
        giveBackControl(restoreView, !isAlive());
        if (finished) await fade.fadeIn(FADE_IN_MILLISECONDS);
      }
    }
  };
}
