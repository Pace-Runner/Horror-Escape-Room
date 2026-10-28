import * as THREE from 'three';
import { createFrameClock } from './FrameClock.js';

/**
 * THE FALL INTO THE BACKROOMS: the way down from the upstairs hallway, which
 * used to be a fade to black.
 *
 *   1. at the bottom of the stairs the view takes over and walks on along the
 *      passage, looking down at the steps that keep going
 *   2. the light below dies, and the torch with it
 *   3. a beat of dark, and something creaks
 *   4. a step that is not there: the view drops and pitches over, the torch
 *      goes out of the hand -- a thump, and black, and the sound goes dull
 *
 * Then main.js switches to the maze and plays cutscenes/comeRound.js, which
 * is the player coming round on the wet carpet. Through the player's own
 * camera, with their hands, on the frame clock -- the shape of
 * core/StairsScare.js -- because it is their own body falling.
 */

/** The passage at the bottom of the stairs runs along +X: yaw -PI/2. */
const PASSAGE_YAW = -Math.PI / 2;
const WALK_SECONDS = 1.2;
const WALK_METRES = 1.1;
/** A step's dip, twice a second's worth of walking. */
const BOB_METRES = 0.035;
const LOOK_DOWN_PITCH = -0.22;
/** The torch dying with the light: [seconds, power 0..1]. */
const TORCH_DIES = [[0, 0.4], [0.06, 0], [0.13, 0.25], [0.2, 0]];
const DARK_BEAT_SECONDS = 0.7;
const FALL_SECONDS = 0.5;
const FALL_METRES = 1.35;
const FALL_FORWARD_METRES = 0.4;
const FALL_PITCH = -1.25;
const FALL_ROLL = 0.55;
/** Black, and the dull ring after the thump, before the maze comes up. Short:
 * the maze was warmed during the stairs scare, so nothing else is waiting. */
const AFTER_BLACK_SECONDS = 0.45;

const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1);
const angleBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * @param {object} deps
 * @param {THREE.PerspectiveCamera} deps.camera - the player's own camera
 * @param {object} deps.player - core/PointerLockPlayer.js
 * @param {object} deps.hands - the hands view model (setVisible)
 * @param {object} deps.audio - world/AudioEngine.js (bulbPop, creak, thump, setMuffle)
 * @param {(name: string, opts?: object) => unknown} deps.sfx
 * @param {object} deps.fade - core/ScreenFade.js
 * @param {(out: boolean) => void} deps.setHouseLightsOut
 * @param {object} deps.torch - setPower(0..1)
 * @param {() => () => void} deps.forceFirstPerson
 */
export function createStairsFall({ camera, player, hands, audio, sfx, fade, setHouseLightsOut, torch, forceFirstPerson, prepareHands = () => {} }) {
  const clock = createFrameClock();
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  let running = false;

  /** Points the camera with a roll, which player.aim cannot do. */
  function lookAt(yaw, pitch, roll = 0) {
    look.set(pitch, yaw, roll, 'YXZ');
    camera.quaternion.setFromEuler(look);
  }

  return {
    get isRunning() {
      return running;
    },

    /** Called every frame by main.js, with 0 while paused. */
    update(dt) {
      clock.update(dt);
    },

    /**
     * Plays the fall. Resolves on black, with the sound muffled for
     * comeRound to clear.
     *
     * @returns {Promise<boolean>} true if it played to the end.
     */
    async run({ isAlive = () => true } = {}) {
      if (running) return false;
      running = true;
      player.cinematic = true;
      player.movementEnabled = false;
      player.lookEnabled = false;
      const restoreView = forceFirstPerson();
      prepareHands();
      torch.bringOut?.();
      const from = camera.position.clone();
      const fromYaw = player.yaw;
      const fromPitch = player.pitch;
      const turn = angleBetween(fromYaw, PASSAGE_YAW);
      const ahead = new THREE.Vector3(-Math.sin(PASSAGE_YAW), 0, -Math.cos(PASSAGE_YAW));
      let finished = false;
      try {
        // 1. On along the passage, looking down at where the steps go.
        finished = await clock.animate(WALK_SECONDS, isAlive, (t) => {
          const e = smooth(t);
          camera.position.copy(from).addScaledVector(ahead, WALK_METRES * t);
          camera.position.y = from.y - Math.abs(Math.sin(t * Math.PI * 2)) * BOB_METRES;
          lookAt(fromYaw + turn * e, THREE.MathUtils.lerp(fromPitch, LOOK_DOWN_PITCH, e));
        });
        if (!finished) return false;

        // 2. The light below dies, and the torch with it.
        setHouseLightsOut(true);
        audio.bulbPop();
        let next = 0;
        finished = await clock.animate(DARK_BEAT_SECONDS, isAlive, (_t, elapsed) => {
          while (next < TORCH_DIES.length && TORCH_DIES[next][0] <= elapsed) torch.setPower(TORCH_DIES[next++][1]);
        });
        if (!finished) return false;
        audio.creak();

        // 4. The step that is not there.
        const top = camera.position.clone();
        sfx('gasp');
        hands.setVisible?.(false);
        finished = await clock.animate(FALL_SECONDS, isAlive, (t) => {
          const drop = t * t;
          camera.position.copy(top).addScaledVector(ahead, FALL_FORWARD_METRES * t);
          camera.position.y = top.y - FALL_METRES * drop;
          lookAt(PASSAGE_YAW, THREE.MathUtils.lerp(LOOK_DOWN_PITCH, FALL_PITCH, drop), FALL_ROLL * drop);
        });
        if (!finished) return false;
        audio.thump(1.0);
        fade.snapToBlack();
        audio.setMuffle(1, 0.05);
        finished = await clock.animate(AFTER_BLACK_SECONDS, isAlive);
        return finished;
      } finally {
        running = false;
        clock.clear();
        setHouseLightsOut(false);
        torch.setPower(1);
        hands.setVisible?.(true);
        player.cinematic = false;
        restoreView?.();
        // Left black on purpose: the caller brings the maze up behind it.
        if (!finished) audio.setMuffle(0, 0.2);
      }
    }
  };
}
