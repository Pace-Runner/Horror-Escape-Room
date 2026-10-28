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
 *
 * MARK'S BODY. A scare that says `body: true` (the study's catches) is lent
 * the player's own body, main.js's playerBody, and acts with it.
 * rig.poseBody() stands it, tips it over and lays it down, keeping it on the
 * boards; rig.lensOnEyes() puts the lens in its head, so the camera goes where
 * the body goes and a fall is a fall, not a camera path; rig.reachBody() puts
 * its hands on her. rig.look() aims a lens that may be lying down, and
 * rig.ring() and rig.wobble() knock it about as functions of time alone, so a
 * frame frozen at a moment (the browser harness) shows what a played one
 * would. The runner hides the body's head, since the lens is inside it, and
 * hands the body back standing.
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

/** The face light's own colour, cool white; a blackout tints it (run's `dark`). */
const FACE_LIGHT_COLOUR = new THREE.Color(0xd6e4ff);
/**
 * Its own place, in the lens's frame: under the lens and just in front.
 * Up-lighting. Light from below is the oldest trick there is for a face and
 * still the best one: every shadow falls the wrong way up.
 */
const FACE_LIGHT_AT = new THREE.Vector3(0, -0.42, -0.2);
/**
 * Where a scare with his body hangs it instead (rig.lightOverHer): over her
 * eyes, this far toward the lens. Under the lens, his own hands are a hand's
 * width from it, and it burnt them white (seen in the browser).
 */
const OVER_HER_TOWARD = 0.12;
/**
 * Where his body must stay above the floor it is put on, metres: its bones
 * run down the middle of him, so lying on his back they are his thickness
 * off the boards.
 */
const BODY_ON_FLOOR = [['Hips', 0.11], ['Chest', 0.12], ['Head', 0.1], ['Left ankle', 0.05], ['Right ankle', 0.05]];
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

const _shoulder = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _wristAt = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _bendAway = new THREE.Vector3();
const _elbowAt = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _bodyAt = new THREE.Vector3();
const _lamp = new THREE.Vector3();
const _lampDir = new THREE.Vector3();
const _worldQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

/**
 * Turns `bone` so the direction from it to `child` points at `target`
 * (world), by `weight` of the way. Worked in WORLD space, so it never needs
 * to know which local axis a bone of this rig runs along -- the arms of an
 * MMD figure are not aligned to anything a pose could name.
 */
function aimBone(bone, child, target, weight) {
  bone.getWorldPosition(_shoulder);
  child.getWorldPosition(_elbow);
  _from.subVectors(_elbow, _shoulder).normalize();
  _to.subVectors(target, _shoulder).normalize();
  _turn.setFromUnitVectors(_from, _to);
  // Part of the way: slerp(turn, identity, 1 - w) is slerp(identity, turn, w).
  // Not slerpQuaternions(IDENTITY, _turn, w): it copies IDENTITY into _turn
  // first, so every partial reach was no reach at all.
  if (weight < 1) _turn.slerp(IDENTITY, 1 - weight);
  bone.getWorldQuaternion(_worldQ).premultiply(_turn);
  bone.parent.getWorldQuaternion(_parentQ).invert();
  bone.quaternion.copy(_parentQ.multiply(_worldQ));
  bone.updateMatrixWorld(true);
}

/**
 * A figure's arm, reaching: hand to `target` (world), the elbow bent out and
 * down toward `pole` -- a two-bone reach solved by the law of cosines, so the
 * hand lands ON the point (a shoulder, an ankle, her wrist) whenever the arm
 * is long enough, and points at it when it is not. `side` is the figure's
 * OWN side, 'left' or 'right'. Call after the figure is posed and placed,
 * every frame it is held.
 */
function reachArm(figure, side, target, { weight = 1, pole = null } = {}) {
  const arm = figure?.bone?.(`${side} arm`);
  const elbow = figure?.bone?.(`${side} elbow`);
  const wrist = figure?.bone?.(`${side} wrist`);
  if (!arm || !elbow || !wrist || !(weight > 0)) return;
  figure.group.updateMatrixWorld(true);
  arm.getWorldPosition(_shoulder);
  elbow.getWorldPosition(_elbow);
  wrist.getWorldPosition(_wristAt);
  const upper = _shoulder.distanceTo(_elbow);
  const fore = _elbow.distanceTo(_wristAt);
  _toTarget.subVectors(target, _shoulder);
  const reach = THREE.MathUtils.clamp(_toTarget.length(), Math.abs(upper - fore) + 1e-3, upper + fore - 1e-3);
  _toTarget.normalize();
  // Elbow out to its side and down, unless the caller says otherwise.
  if (pole) _pole.copy(pole);
  else {
    const yaw = figure.yaw;
    const outward = side === 'left' ? 1 : -1;
    // Facing (-sin, -cos); its left is (fz, -fx) of that.
    _pole.set(-Math.cos(yaw) * outward * 0.5, -0.6, Math.sin(yaw) * outward * 0.5).add(_shoulder);
  }
  _bendAway.subVectors(_pole, _shoulder);
  _bendAway.addScaledVector(_toTarget, -_bendAway.dot(_toTarget)).normalize();
  const cos = THREE.MathUtils.clamp((upper * upper + reach * reach - fore * fore) / (2 * upper * reach), -1, 1);
  const angle = Math.acos(cos);
  _elbowAt.copy(_shoulder)
    .addScaledVector(_toTarget, Math.cos(angle) * upper)
    .addScaledVector(_bendAway, Math.sin(angle) * upper);
  aimBone(arm, elbow, _elbowAt, weight);
  aimBone(elbow, wrist, target, weight);
}

/**
 * Smooth noise at time `t`, about -1..1: three sines that never line up,
 * between 2 and 12 Hz -- a tremor, not the new random angle every frame that
 * reads as a broken camera. `k` picks a channel.
 */
function wobble(t, k = 0) {
  return 0.5 * Math.sin(t * 13.7 + k * 2.1) + 0.3 * Math.sin(t * 31.1 + k * 5.3) + 0.2 * Math.sin(t * 71.9 + k * 1.7);
}

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
  const faceLight = new THREE.PointLight(FACE_LIGHT_COLOUR, 0, 2.6, 2);
  faceLight.position.copy(FACE_LIGHT_AT);
  camera.add(faceLight);

  const headPos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  let lastKind = null;

  /**
   * A scare by name, or a random one that fits here and is not the last one
   * played. `pool` names a set of scares that belong to one place (the study's
   * catch is a sedation, not a mauling: jumpScares/index.js); without one, only
   * the scares that belong to no pool are drawn, so the backrooms never gets
   * the study's.
   */
  function pick(kind, ceiling, pool = null) {
    if (kind !== 'random') return JUMP_SCARES[kind] ?? JUMP_SCARES.lunge;
    const fits = Object.values(JUMP_SCARES).filter((s) => (!s.needsCeiling || ceiling !== null)
      && (s.pool ?? null) === pool);
    const fresh = fits.filter((s) => s.name !== lastKind);
    const from = fresh.length > 0 ? fresh : fits;
    return from[Math.floor(Math.random() * from.length)];
  }

  /** Everything one scare acts with. Built per run, so nothing leaks between two. */
  function createRig({ creature, ceiling, colliders, onCue, body }) {
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
      /** Tells the caller a beat has come (a whisper to caption, a strike to flash). */
      cue: (name) => onCue?.(name),
      /** The player's own body (main.js's playerBody), lent to a scare that says `body: true`; or null. */
      body,

      /**
       * Her arm, reaching (reachArm): hand to `target`, world. `side` is HER
       * side; facing the lens, her right hand is on its left. Call after
       * pose() and after placing her, every frame it is held.
       */
      reach(side, target, options) {
        reachArm(creature, side, target, options);
      },

      /** His arm, reaching: the same, on his body. `side` is HIS side. Call after poseBody(). */
      reachBody(side, target, options) {
        if (body) reachArm(body, side, target, options);
      },

      /** Her fingers: positive clenches (on a shoulder, an ankle), negative splays (reaching). */
      grip(left, right = left) {
        creature.setGrip?.(left, right);
      },

      /** His fingers, the same way. */
      bodyGrip(left, right = left) {
        body?.setGrip?.(left, right);
      },

      /**
       * His body, posed for this frame: its feet (the root) at `at`, turned to
       * `yaw` (default: facing the way the scare faces), tipped back `lay`
       * radians about its own right-hand side -- PI/2 is flat on his back, the
       * head behind where he stood -- with `offsets` on its bones
       * (offsetBones) and its gait at `speed`. With `floor` (a height), it is
       * then lifted wherever it would sink into the boards: a falling body
       * pivots on its heels until its back reaches the floor, and then lies
       * on it. Call before reachBody() and lensOnEyes(), every frame.
       */
      poseBody({ at, lay = 0, yaw = null, offsets = null, speed = 0, dt = 0, floor = null }) {
        const root = body?.refs.root;
        if (!root) return;
        body.setSpeed(speed);
        body.update(dt);
        root.rotation.order = 'YXZ';
        root.rotation.set(lay, yaw ?? rig.facing, 0);
        if (offsets) body.offsetBones(offsets);
        root.position.copy(at);
        body.group.updateMatrixWorld(true);
        if (floor === null) return;
        let lift = 0;
        for (const [name, above] of BODY_ON_FLOOR) {
          const bone = body.bone(name);
          if (!bone) continue;
          bone.getWorldPosition(_bodyAt);
          lift = Math.max(lift, floor + above - _bodyAt.y);
        }
        if (lift > 0) {
          root.position.y += lift;
          body.group.updateMatrixWorld(true);
        }
      },

      /** The lens in his head, between his eyes -- wherever poseBody() has put them. */
      lensOnEyes() {
        body?.getEyePosition(camera.position);
      },

      /** The yaw that faces the way the scare faces. */
      get facing() { return Math.atan2(-forward.x, -forward.z); },

      /**
       * Points the lens at `at` with `up` the top of the picture -- for a body
       * that is falling or lying down, where a pitch and a yaw stop meaning
       * anything (looking straight up, every yaw is the same picture). `roll`
       * turns the picture about the line of sight; `nod` (+ tips the view up)
       * and `turn` (+ to the left) are radians added after, for a head that
       * is knocked about; `shake` is a tremor of that many radians (wobble).
       */
      look(at, { up = WORLD_UP, roll = 0, nod = 0, turn = 0, shake = 0, t = 0 } = {}) {
        camera.up.copy(up);
        camera.lookAt(at);
        camera.up.copy(WORLD_UP);
        if (roll) camera.rotateZ(roll);
        const x = nod + shake * wobble(t, 1);
        const y = turn + shake * wobble(t, 2);
        if (x) camera.rotateX(x);
        if (y) camera.rotateY(y);
      },

      /**
       * A knock that rings out: 0 until `at`, then a swing that dies away,
       * its first peak about 0.7. A function of time alone, like wobble().
       */
      ring(t, at, { freq = 4, decay = 6 } = {}) {
        const s = t - at;
        return s < 0 ? 0 : Math.exp(-decay * s) * Math.sin(TAU * freq * s);
      },

      wobble,

      /** Clear floor from where the lens began, along (dx, dz), metres, up to `max`: how far a fall may go. */
      clear(dx, dz, max) {
        if (!colliders || colliders.length === 0) return max;
        for (let d = 0.1; d < max; d += 0.1) {
          if (segmentBlocked(eye.x, eye.z, eye.x + dx * d, eye.z + dz * d, colliders)) return Math.max(0, d - 0.25);
        }
        return max;
      },

      /** A point in the lens's own flat frame: `side` metres right, `up` up, `ahead` forward. */
      nearLens(side, up, ahead, out = new THREE.Vector3()) {
        return out.copy(camera.position).addScaledVector(right, side).addScaledVector(forward, ahead).setY(camera.position.y + up);
      },
      /** Where the lens was, and the flat direction it looked, when the scare began. */
      eye,
      forward,
      right,
      startFov: camera.fov,
      get scale() { return creature.refs.root?.scale.x ?? 1; },

      /**
       * Turns the scare to face the nearest direction with `metres` of clear
       * floor ahead -- and `behind` metres behind, if any direction has both
       * (a body knocked over needs floor to land on) -- so it never stands
       * inside a wall. Only ever called on the black first frame, where a
       * turn is not seen.
       */
      faceRoom(metres, behind = 0) {
        if (!colliders || colliders.length === 0) return;
        const baseYaw = Math.atan2(-forward.x, -forward.z);
        for (const back of behind > 0 ? [behind, 0] : [0]) {
          for (let i = 0; i <= DIRECTION_TRIES * 2; i++) {
            const step = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
            const yaw = baseYaw + step * DIRECTION_STEP;
            const fx = -Math.sin(yaw);
            const fz = -Math.cos(yaw);
            const clear = [-BODY_HALF_WIDTH, 0, BODY_HALF_WIDTH].every((side) => {
              const sx = eye.x + fz * -side;
              const sz = eye.z + fx * side;
              return !segmentBlocked(sx, sz, sx + fx * metres, sz + fz * metres, colliders)
                && (back <= 0 || !segmentBlocked(sx, sz, sx - fx * back, sz - fz * back, colliders));
            });
            if (!clear) continue;
            forward.set(fx, 0, fz);
            right.set(-fz, 0, fx);
            return;
          }
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
       * Hangs the face light over her eyes for this frame, `above` metres up
       * and a little toward the lens: the moon from above rather than a lamp
       * under the lens, for a scare that shows his body. Call once the lens
       * is placed and aimed; the runner puts the light back under it after.
       */
      lightOverHer(above = 0.32) {
        rig.eyes(_lamp);
        _lamp.addScaledVector(_lampDir.subVectors(camera.position, _lamp).normalize(), OVER_HER_TOWARD);
        _lamp.y += above;
        camera.updateMatrixWorld();
        faceLight.position.copy(_lamp);
        camera.worldToLocal(faceLight.position);
      },

      /** Between her eyes, world space: the middle of her face however her head is bowed. */
      eyes(out = target) {
        return creature.getEyePosition ? creature.getEyePosition(out) : rig.face(out);
      },

      /**
       * Stands it turned to `yaw` with its EYES over `point` (world x, z),
       * lowered, if they are higher, to `point.y` -- for a face hanging over a
       * body on the floor, where placeFace's "in front of the lens" means
       * nothing. Only lowers: it cannot stand taller than it is.
       */
      placeFaceAt(point, yaw) {
        creature.setYaw(yaw);
        creature.setPosition(point.x, point.z);
        creature.group.updateMatrixWorld(true);
        rig.eyes(headPos);
        creature.setPosition(2 * point.x - headPos.x, 2 * point.z - headPos.z);
        creature.group.updateMatrixWorld(true);
        rig.eyes(headPos);
        const root = creature.refs.root;
        const drop = Math.min(0, point.y - headPos.y);
        if (root && drop < 0) {
          root.position.y += drop;
          creature.group.updateMatrixWorld(true);
        }
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
     * Every scare, by name. A harness may swap one in to try it: a saved
     * scare file reloads the page, and a reload is the whole shader warm-up.
     */
    get scares() { return JUMP_SCARES; },

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
     * @param {string|null} [options.pool] - draw 'random' from this pool only
     * @param {(name: string) => void} [options.onCue] - a scare's beats, by name
     * @param {object|null} [options.body] - the player's own body, for a scare
     *   that acts with it (`body: true`): lent for the run, its head hidden,
     *   and handed back standing, as visible as it was
     * @param {object|null} [options.dark] - the room is in a blackout: the
     *   under-light every scare puts on its face is turned down to `scale` of
     *   itself and tinted `color` (the moon's), so she is lit like the room
     *   she came out of, not by a lamp from nowhere. A scale above 1 lifts it,
     *   for a room too dim to see the figure in (the kept ending's lab)
     * @returns {Promise<void>}
     */
    run({ creature, isAlive = () => true, kind = 'lunge', ceiling = null, colliders = null, pool = null, onCue = null, body = null, dark = null }) {
      const scare = pick(kind, ceiling, pool);
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

      // His body, for a scare that acts with it: hidden until the scare shows
      // it, and its head for the whole run -- the lens is inside it.
      const lent = body && scare.body ? { visible: body.visible } : null;
      if (lent) {
        body.reset();
        body.setHeadVisible?.(false);
        body.visible = false;
      }
      const rig = createRig({ creature, ceiling, colliders, onCue, body: lent ? body : null });
      if (dark?.color) faceLight.color.set(dark.color);
      rig.faceRoom(scare.room ?? 1, scare.roomBehind ?? 0);
      rig.aim(target.copy(rig.eye).addScaledVector(rig.forward, 4));
      scare.start?.(rig);
      const start = performance.now();
      let last = start;

      const finish = () => {
        rig.stopScream();
        scare.end?.(rig);
        creature.setGrip?.(0, 0);
        creature.setBackwards?.(false);
        creature.visible = false;
        if (lent) {
          const bodyRoot = body.refs.root;
          if (bodyRoot) {
            bodyRoot.rotation.order = 'XYZ';
            bodyRoot.rotation.set(0, 0, 0);
            bodyRoot.position.y = 0;
          }
          body.setGrip?.(0, 0);
          body.setBackwards?.(false);
          body.setHeadVisible?.(true);
          body.visible = lent.visible;
        }
        const root = creature.refs.root;
        if (root) root.position.y = 0;
        creature.setTwitches(true);
        creature.setSilhouette(wasSilhouette);
        faceLight.intensity = 0;
        faceLight.color.copy(FACE_LIGHT_COLOUR);
        faceLight.position.copy(FACE_LIGHT_AT);
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
          // Each scare sets its face light every frame; in a blackout, keep it to the room's darkness.
          if (dark) faceLight.intensity *= dark.scale ?? 1;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }
  };
}
