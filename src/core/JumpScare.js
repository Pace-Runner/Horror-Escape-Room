import * as THREE from 'three';

/**
 * The backrooms catch: the monster's face, all at once, and then nothing.
 *
 * A jump scare is timing, so this is a fixed timeline on real time, not a
 * camera path. In order:
 *
 *   0.00  black -- one frame of nothing, so the reveal is a cut, not a pan
 *   0.08  it is there, two and a half metres off, lit from below
 *   0.10  the scream starts
 *   0.10  it LUNGES: to a hand's breadth from the lens in a fifth of a second,
 *         accelerating, because nothing that fast decelerates politely
 *   0.30  impact: the view jolts, zooms onto the face, the red tunnel closes
 *   0.30+ it holds there, twitching and breathing at you, while the picture
 *         strobes to black three times
 *   1.30  black, and the scream is cut dead -- the silence is the second hit
 *
 * The face is lit by one cold light under the lens. Light from below is the
 * oldest trick there is for a face and still the best one: every shadow falls
 * the wrong way up.
 *
 * It takes the camera outright (player.cinematic) and leaves the screen black;
 * the caller decides where the player wakes up and hands the camera back.
 */

const REVEAL_AT = 0.08;
const LUNGE_START = 0.1;
const LUNGE_END = 0.3;
const HOLD_END = 1.3;
/** Metres from the lens to the face: where it appears, and where it stops. */
const START_DISTANCE = 2.6;
const END_DISTANCE = 0.3;
/** Seconds into the scare that the picture drops to black, and for how long. */
const STROBES = [[0.62, 0.06], [0.8, 0.045], [1.0, 0.07]];
const ZOOM_FOV = 40;
const SHAKE_RADIANS = 0.07;
/**
 * The monster is 2.2 m tall and its face sits well above the player's eye, so
 * left alone the close-up is a view up its neck. It stoops to eye level as it
 * closes -- down into your face -- and cocks its head over on one side, which
 * is the single least human thing a face can do.
 */
const HEAD_COCK = 0.42;

const easeInCubic = (t) => t * t * t;

/**
 * @param {object} deps
 * @param {THREE.PerspectiveCamera} deps.camera - the player's camera
 * @param {object} deps.fade - core/ScreenFade.js
 * @param {object} deps.postFX - world/Postprocessing.js (its caught dial)
 * @param {object} deps.audio - world/AudioEngine.js (its jumpScare())
 */
export function createJumpScare({ camera, fade, postFX, audio }) {
  const faceLight = new THREE.PointLight(0xd6e4ff, 0, 2.6, 2);
  // Under and just in front of the lens: up-lighting.
  faceLight.position.set(0, -0.42, -0.2);
  camera.add(faceLight);

  const forward = new THREE.Vector3();
  const headPos = new THREE.Vector3();
  const target = new THREE.Vector3();

  /**
   * Stands the creature so its HEAD -- not its feet -- is `distance` in front
   * of the lens, facing it. The monster hunches, so its face is well forward
   * of where it stands; placing the root would leave the face off-centre.
   */
  /**
   * @param {number} stoop - 0 standing at its own height, 1 with its face
   *   brought down level with the lens.
   */
  function placeFace(creature, distance, stoop) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const want = camera.position.clone().addScaledVector(forward, distance);
    creature.setPosition(want.x, want.z);
    creature.setYaw(Math.atan2(-(camera.position.x - want.x), -(camera.position.z - want.z)));
    creature.group.updateMatrixWorld(true);
    const head = creature.refs.head;
    const root = creature.refs.root;
    if (!head || !root) return;
    head.getWorldPosition(headPos);
    creature.setPosition(want.x + (want.x - headPos.x), want.z + (want.z - headPos.z));
    // Down to eye level. Only ever this close, so its sunken legs are well
    // out of frame by the time it has stooped.
    const faceY = headPos.y + 0.08;
    root.position.y = (camera.position.y - faceY) * stoop;
    creature.group.updateMatrixWorld(true);
  }

  /** Where to look: the middle of the face, a little above the skull's base. */
  function aimAtFace(creature, shakeYaw, shakePitch) {
    const head = creature.refs.head;
    if (head) {
      head.getWorldPosition(target);
      target.y += 0.08;
    } else {
      target.copy(camera.position).addScaledVector(forward, 1).setY(1.6);
    }
    camera.lookAt(target);
    camera.rotateY(shakeYaw);
    camera.rotateX(shakePitch);
  }

  return {
    /**
     * Plays the scare. Resolves when it is over, with the screen black.
     *
     * @param {object} options
     * @param {object} options.creature - the backrooms Okabe figure
     * @param {() => boolean} [options.isAlive] - false aborts (a restart)
     * @returns {Promise<void>}
     */
    run({ creature, isAlive = () => true }) {
      const startFov = camera.fov;
      const wasSilhouette = creature.isSilhouette;
      creature.reset();
      creature.setCorrection(0);
      // The silhouette is how it hunts unseen. Here it is seen.
      creature.setSilhouette(false);
      creature.visible = false;
      fade.snapToBlack();

      const scream = { stop: () => {} };
      let screamStarted = false;
      let revealed = false;
      let impacted = false;
      let twitch = { x: 0, z: 0, next: 0 };
      const start = performance.now();
      let last = start;

      const finish = () => {
        scream.stop();
        creature.visible = false;
        if (creature.refs.root) creature.refs.root.position.y = 0;
        creature.setSilhouette(wasSilhouette);
        faceLight.intensity = 0;
        camera.fov = startFov;
        camera.updateProjectionMatrix();
        postFX.setCaught(0);
        fade.snapToBlack();
      };

      return new Promise((resolve) => {
        const step = () => {
          if (!isAlive()) {
            finish();
            resolve();
            return;
          }
          const now = performance.now();
          const t = (now - start) / 1000;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;

          if (!revealed && t >= REVEAL_AT) {
            revealed = true;
            creature.visible = true;
            fade.clear();
          }
          if (!screamStarted && t >= LUNGE_START) {
            screamStarted = true;
            Object.assign(scream, audio.jumpScare() ?? {});
          }

          // The lunge, then the hold with a breath pushing it at you.
          let distance;
          if (t < LUNGE_START) {
            distance = START_DISTANCE;
          } else if (t < LUNGE_END) {
            distance = START_DISTANCE - (START_DISTANCE - END_DISTANCE) * easeInCubic((t - LUNGE_START) / (LUNGE_END - LUNGE_START));
          } else {
            distance = END_DISTANCE + Math.sin(t * 9) * 0.025;
          }
          // Running while it lunges, so the arms are coming at you too.
          creature.setSpeed(t < LUNGE_END ? 6 : 0);
          creature.update(dt);
          // It stoops over the second half of the lunge, as it closes.
          const lungeProgress = THREE.MathUtils.clamp((t - LUNGE_START) / (LUNGE_END - LUNGE_START), 0, 1);
          const stoop = THREE.MathUtils.smoothstep(lungeProgress, 0.45, 1);

          // Its head cocks over and twitches, small and fast, never settling.
          // Posed before the placing, so the face is centred where it ends up.
          const head = creature.refs.head;
          if (head) {
            if (t >= LUNGE_END && t >= twitch.next) {
              twitch = { x: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.4, next: t + 0.05 + Math.random() * 0.1 };
            }
            head.rotation.z += HEAD_COCK * stoop + (t >= LUNGE_END ? twitch.z : 0);
            head.rotation.x += t >= LUNGE_END ? twitch.x : 0;
          }
          placeFace(creature, distance, stoop);

          if (!impacted && t >= LUNGE_END) {
            impacted = true;
            postFX.setCaught(1);
          }
          // Shake: hard on impact, dying away, never quite still.
          const sinceImpact = Math.max(0, t - LUNGE_END);
          const shake = t < LUNGE_END ? 0.008 : SHAKE_RADIANS * Math.exp(-sinceImpact * 3.2) + 0.006;
          aimAtFace(creature, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

          // Zoom onto the face after the hit.
          const zoom = Math.min(1, sinceImpact / 0.22);
          camera.fov = THREE.MathUtils.lerp(startFov, ZOOM_FOV, impacted ? zoom : 0);
          camera.updateProjectionMatrix();
          // The up-light comes on with it and flickers.
          faceLight.intensity = revealed ? (impacted ? 5.5 + Math.random() * 2.5 : 3.5) : 0;

          // Strobe to black, briefly, through the hold.
          const strobing = STROBES.some(([at, length]) => t >= at && t < at + length);
          if (revealed && t < HOLD_END) {
            if (strobing) fade.snapToBlack();
            else fade.clear();
          }

          if (t >= HOLD_END) {
            finish();
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }
  };
}
