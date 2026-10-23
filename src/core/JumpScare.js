import * as THREE from 'three';
import { segmentBlocked } from './collision.js';
import { JUMP_SCARES } from './jumpScares/index.js';

/**
 * THE JUMP SCARES: its face, all at once, and then nothing.
 *
 * Four of them, one file each in core/jumpScares/ -- the lunge (it rushes your
 * face), knocked down (it puts you on the floor and bends down over you), the
 * ceiling drop (it swings down out of the tiles, upside down; needs a drop
 * ceiling, so the backrooms only) and already there (the light comes on and
 * its face is a hand from yours). This file is what they share: the light
 * under the lens, standing it so its FACE is where a scare wants it, aiming
 * the camera, the scream, the red tunnel, the strobes, and handing everything
 * back.
 *
 * A jump scare is timing, so each is a fixed timeline on real time, not a
 * camera path. Every one starts on black -- one frame of nothing, so the
 * reveal is a cut, not a pan -- and ends on black with the scream cut dead:
 * the silence is the second hit.
 *
 * It takes the camera outright (the caller sets player.cinematic) and leaves
 * the screen black; the caller decides where the player wakes up and hands the
 * camera back. The camera's position and direction are put back as they were,
 * so a scare that knocks the view to the floor cannot leave it there.
 *
 * THE NECK. The monster's neck is long and thin by design (import_okabe.py),
 * and the first version cocked and twitched the HEAD bone alone, which pivots
 * the skull on a rigid stalk -- the "weird neck". pose() spreads a cock or a
 * twitch across chest, neck and head, the way a body actually does it, and
 * the rig's own twitch layer is switched off for the length of the scare so
 * the two never stack.
 */

/** Metres from the head bone (the base of the skull) up to the crown, per unit of the figure's scale. */
const CROWN_ABOVE_HEAD_BONE = 0.29;
/** How close under a ceiling the crown may come. */
const CEILING_MARGIN = 0.06;
/** Above the head bone to the middle of the face. */
const FACE_ABOVE_HEAD_BONE = 0.08;
/** The most the camera looks up at it, unless a scare says otherwise: the ceiling must not be what frames the face. */
const MAX_PITCH_UP = 0.14;
/** Half its body's width, for finding room in front of the lens. */
const BODY_HALF_WIDTH = 0.4;
/** Directions tried when the way the player faces has no room, either side of it. */
const DIRECTION_STEP = Math.PI / 6;
const DIRECTION_TRIES = 6;
/**
 * How a curl (forward bend) and a cock or twitch (over to one side) is shared
 * along the spine. Each set adds up to 1, so a scare's numbers are totals.
 */
const CURL_SHARE = { Spine: 0.3, Chest: 0.35, Neck: 0.2, Head: 0.15 };
const COCK_SHARE = { Chest: 0.18, Neck: 0.32, Head: 0.5 };

/**
 * @param {object} deps
 * @param {THREE.PerspectiveCamera} deps.camera - the player's camera
 * @param {object} deps.fade - core/ScreenFade.js
 * @param {object} deps.postFX - world/Postprocessing.js (its caught dial)
 * @param {object} deps.audio - world/AudioEngine.js (jumpScare, growl, creak, thump)
 * @param {() => ({stop: (fade?: number) => void} | null)} [deps.playScream] - a
 *   recorded scream, or null when there is none; the synthesised one stands in.
 */
export function createJumpScare({ camera, fade, postFX, audio, playScream = () => null }) {
  const faceLight = new THREE.PointLight(0xd6e4ff, 0, 2.6, 2);
  // Under and just in front of the lens: up-lighting. Light from below is the
  // oldest trick there is for a face and still the best one: every shadow
  // falls the wrong way up.
  faceLight.position.set(0, -0.42, -0.2);
  camera.add(faceLight);

  const headPos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  let lastKind = null;

  /** A scare by name, or a random one that fits here and is not the last one played. */
  function pick(kind, ceiling) {
    if (kind !== 'random') return JUMP_SCARES[kind] ?? JUMP_SCARES.lunge;
    const fits = Object.values(JUMP_SCARES).filter((s) => !s.needsCeiling || ceiling !== null);
    const fresh = fits.filter((s) => s.name !== lastKind);
    const from = fresh.length > 0 ? fresh : fits;
    return from[Math.floor(Math.random() * from.length)];
  }

  /** Everything one scare acts with. Built per run, so nothing leaks between two. */
  function createRig({ creature, ceiling, colliders }) {
    const eye = camera.position.clone();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const scream = { stop: () => {}, started: false };
    let twitch = { x: 0, z: 0, next: 0 };

    const rig = {
      camera, creature, fade, postFX, audio, faceLight, ceiling,
      /** Where the lens was, and the flat direction it looked, when the scare began. */
      eye,
      forward,
      right,
      startFov: camera.fov,
      get scale() { return creature.refs.root?.scale.x ?? 1; },

      /**
       * Turns the scare to face the nearest direction with `metres` of clear
       * floor, so it never stands inside a wall. Only ever called on the black
       * first frame, where a turn is not seen.
       */
      faceRoom(metres) {
        if (!colliders || colliders.length === 0) return;
        const baseYaw = Math.atan2(-forward.x, -forward.z);
        for (let i = 0; i <= DIRECTION_TRIES * 2; i++) {
          const step = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
          const yaw = baseYaw + step * DIRECTION_STEP;
          const fx = -Math.sin(yaw);
          const fz = -Math.cos(yaw);
          const clear = [-BODY_HALF_WIDTH, 0, BODY_HALF_WIDTH].every((side) => {
            const sx = eye.x + fz * -side;
            const sz = eye.z + fx * side;
            return !segmentBlocked(sx, sz, sx + fx * metres, sz + fz * metres, colliders);
          });
          if (!clear) continue;
          forward.set(fx, 0, fz);
          right.set(-fz, 0, fx);
          return;
        }
      },

      /** The middle of its face, world space. */
      face(out = target) {
        const head = creature.refs.head;
        if (!head) return out.copy(eye).addScaledVector(forward, 1).setY(1.6);
        head.getWorldPosition(out);
        out.y += FACE_ABOVE_HEAD_BONE;
        return out;
      },

      /**
       * Stands it so its FACE -- not its feet -- is `distance` in front of the
       * lens (and `side` metres across), facing the lens. The monster hunches,
       * so its face is well forward of where it stands; placing the root would
       * leave the face off-centre.
       */
      placeFace(distance, side = 0) {
        const wx = eye.x + forward.x * distance + right.x * side;
        const wz = eye.z + forward.z * distance + right.z * side;
        creature.setPosition(wx, wz);
        creature.setYaw(Math.atan2(-(camera.position.x - wx), -(camera.position.z - wz)));
        creature.group.updateMatrixWorld(true);
        const head = creature.refs.head;
        if (!head) return;
        head.getWorldPosition(headPos);
        creature.setPosition(wx + (wx - headPos.x), wz + (wz - headPos.z));
        creature.group.updateMatrixWorld(true);
      },

      /**
       * Brings its face down toward the lens's height by lowering the whole
       * body -- `amount` 0 to 1. Only ever lowers, and only for the close-up,
       * where its legs are long out of frame; the bending is pose()'s job.
       */
      lowerFace(amount) {
        const root = creature.refs.root;
        if (!root || !(amount > 0)) return;
        const drop = Math.min(0, (camera.position.y - rig.face(headPos).y) * amount);
        root.position.y += drop;
        creature.group.updateMatrixWorld(true);
      },

      /** Keeps its crown under the ceiling, if there is one: a skull through the tiles is a bug, not a scare. */
      keepUnderCeiling() {
        const root = creature.refs.root;
        const head = creature.refs.head;
        if (ceiling === null || !root || !head) return;
        head.getWorldPosition(headPos);
        const over = headPos.y + CROWN_ABOVE_HEAD_BONE * rig.scale - (ceiling - CEILING_MARGIN);
        if (over <= 0) return;
        root.position.y -= over;
        creature.group.updateMatrixWorld(true);
      },

      /**
       * Bends it, totals in radians: `curl` forward down the spine, `cock` and
       * the twitch over to one side, `nod` the head alone. Call after
       * creature.update() and before placing it, every frame.
       */
      pose({ curl = 0, cock = 0, nod = 0, twitch: tw = null } = {}) {
        const tx = tw?.x ?? 0;
        const side = cock + (tw?.z ?? 0);
        creature.offsetBones({
          Spine: [curl * CURL_SHARE.Spine, 0, 0],
          Chest: [curl * CURL_SHARE.Chest + tx * COCK_SHARE.Chest, 0, side * COCK_SHARE.Chest],
          Neck: [curl * CURL_SHARE.Neck + tx * COCK_SHARE.Neck, 0, side * COCK_SHARE.Neck],
          Head: [curl * CURL_SHARE.Head + nod + tx * COCK_SHARE.Head, 0, side * COCK_SHARE.Head]
        });
      },

      /** Small, fast, never settling: a new twitch every 50-150 ms. */
      twitch(t, size = 1) {
        if (t >= twitch.next) {
          twitch = {
            x: (Math.random() - 0.5) * 0.3 * size,
            z: (Math.random() - 0.5) * 0.4 * size,
            next: t + 0.05 + Math.random() * 0.1
          };
        }
        return twitch;
      },

      /**
       * Points the lens at `at`, with handheld shake. Looking up is capped at
       * `maxPitchUp`; `roll` cocks the frame (a body lying on the floor).
       */
      aim(at, { shake = 0, maxPitchUp = MAX_PITCH_UP, roll = 0 } = {}) {
        const dx = at.x - camera.position.x;
        const dy = at.y - camera.position.y;
        const dz = at.z - camera.position.z;
        const yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * shake;
        const pitch = Math.min(maxPitchUp, Math.atan2(dy, Math.hypot(dx, dz))) + (Math.random() - 0.5) * shake;
        look.set(pitch, yaw, roll, 'YXZ');
        camera.quaternion.setFromEuler(look);
      },

      setFov(fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      },

      /** It is there: the figure on, the black off. */
      reveal() {
        creature.visible = true;
        fade.clear();
      },

      scream() {
        if (scream.started) return;
        scream.started = true;
        const recorded = playScream();
        if (recorded) scream.stop = () => recorded.stop(0.02);
        else Object.assign(scream, audio.jumpScare() ?? {});
      },

      /** Drops the picture to black inside any of `windows` ([start, length] seconds). */
      strobe(t, windows) {
        if (windows.some(([at, length]) => t >= at && t < at + length)) fade.snapToBlack();
        else fade.clear();
      },

      /** For finish(): cuts the scream dead. */
      stopScream() {
        scream.stop();
      }
    };
    return rig;
  }

  return {
    /** Every scare's name, for a harness. */
    get kinds() { return Object.keys(JUMP_SCARES); },
    /** The last one played. */
    get lastKind() { return lastKind; },

    /**
     * Plays a scare. Resolves when it is over, with the screen black.
     *
     * @param {object} options
     * @param {object} options.creature - an Okabe figure
     * @param {() => boolean} [options.isAlive] - false aborts (a restart)
     * @param {string} [options.kind] - a scare's name, or 'random'
     * @param {number|null} [options.ceiling] - the ceiling's height here, if
     *   it is low enough to matter; the ceiling drop needs one.
     * @param {object[]|null} [options.colliders] - the walls here, so the scare
     *   faces somewhere it has room.
     * @returns {Promise<void>}
     */
    run({ creature, isAlive = () => true, kind = 'lunge', ceiling = null, colliders = null }) {
      const scare = pick(kind, ceiling);
      lastKind = scare.name;
      const startPosition = camera.position.clone();
      const startQuaternion = camera.quaternion.clone();
      const wasSilhouette = creature.isSilhouette;
      creature.reset();
      creature.setCorrection(0);
      // The silhouette is how it hunts unseen. Here it is seen.
      creature.setSilhouette(false);
      creature.setTwitches(false);
      creature.visible = false;
      fade.snapToBlack();

      const rig = createRig({ creature, ceiling, colliders });
      rig.faceRoom(scare.room ?? 1);
      rig.aim(target.copy(rig.eye).addScaledVector(rig.forward, 4));
      scare.start?.(rig);
      const start = performance.now();
      let last = start;

      const finish = () => {
        rig.stopScream();
        scare.end?.(rig);
        creature.visible = false;
        const root = creature.refs.root;
        if (root) root.position.y = 0;
        creature.setTwitches(true);
        creature.setSilhouette(wasSilhouette);
        faceLight.intensity = 0;
        rig.setFov(rig.startFov);
        camera.position.copy(startPosition);
        camera.quaternion.copy(startQuaternion);
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
          if (t >= scare.seconds) {
            finish();
            resolve();
            return;
          }
          scare.frame(rig, t, dt);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }
  };
}
