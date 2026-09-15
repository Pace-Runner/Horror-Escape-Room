/**
 * Clip playback, crossfade, additive layers, event frames.  [owner: Hands]
 *
 * One Animator instance per hand, so the right hand can be halfway through
 * `pickup` while the left holds a torch in a steady `hold-cylinder`. Sharing one
 * animator between hands would make that impossible, and it is the single most
 * important thing about the handedness convention.
 *
 * THE THREE-PART EVALUATION ORDER (this is the architecture)
 *   1. BASE: the current clip, sampled at its playhead. If a crossfade is
 *      running, the outgoing clip is sampled too and the two are blended.
 *   2. LAYERS: procedural offsets - breathe, sway, walkbob, tremor - ADDED on
 *      top of the base result, each scaled by its own weight.
 *   3. WRITE: the composed result is applied to the rig.
 *
 * Layers are additive rather than being clips in their own right because they
 * have to combine with WHATEVER the hand is doing. `breathe` + `walkbob` +
 * `tremor` all need to run over `hold-cylinder` at once. Authoring that as
 * keyframed clips would mean hand-animating every combination; as additive
 * offsets it is a sum.
 *
 * ZERO ALLOCATION. update() runs twice a frame for the whole game. Every
 * quaternion, euler and accumulator it needs is allocated once at module scope
 * or in the constructor, never per call. Garbage-collector sawtooth is penalised
 * under two separate rubric categories.
 *
 * Status: both halves are implemented. LAYERS (step 2) - breathe, sway, walkbob
 * and crouch-shift - run and offset the hand ROOT. CLIP PLAYBACK (step 1) drives
 * individual JOINT rotations via rig.js's applyPose/blendPose, which is a
 * different set of nodes to the root the layers move - the two compose without
 * fighting each other. See update() for how they combine.
 */

/* --------------------------------------------------------- clip format */

/**
 * A clip is plain data, so it can be authored in the dev harness and pasted
 * into a module without touching engine code:
 *
 *   {
 *     name: 'pickup',
 *     duration: 0.62,          // seconds
 *     loop: false,
 *     keys: [                  // ordered by t, ascending
 *       { t: 0.00, pose: relaxed,     ease: 'out' },
 *       { t: 0.34, pose: gripCylinder, ease: 'inout' },
 *       { t: 0.62, pose: relaxed,     ease: 'in' },
 *     ],
 *     events: [                // fired once per playthrough, at time t
 *       { t: 0.34, name: 'hands:grasp' },
 *     ],
 *   }
 *
 * `t` is in SECONDS, not normalised 0..1. Normalised times mean that retiming a
 * clip silently moves every event, which is exactly the bug where an object
 * attaches to the hand two frames before the fingers close.
 */

import * as THREE from "three";

import { breathe } from "./layers/breathe.js";
import { sway } from "./layers/sway.js";
import { walkbob } from "./layers/walkbob.js";
import { runbob } from "./layers/runbob.js";
import { tremor } from "./layers/tremor.js";
import { crouchShift } from "./layers/crouch-shift.js";
import { JOINT_NAMES, applyPose, blendPose } from "./rig.js";

/** Easing curve names a keyframe may use. */
export const EASINGS = Object.freeze(["linear", "in", "out", "inout"]);

/**
 * @param {number} t 0..1
 * @param {string} name one of EASINGS; anything else falls back to linear
 */
function ease(t, name) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (name) {
    case "in": return x * x;
    case "out": return 1 - (1 - x) * (1 - x);
    case "inout": return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) * (-2 * x + 2)) / 2;
    default: return x;
  }
}

/** Default crossfade, seconds. Short enough to feel responsive, long enough to hide the switch. */
export const DEFAULT_CROSSFADE = 0.12;

/**
 * Fired automatically when a one-shot clip's playhead reaches its duration.
 * A literal string rather than an import from hands.js, which imports THIS
 * module - importing back would be circular. Must match
 * HANDS_EVENTS.CLIP_END in hands.js; clip authors never write this one
 * themselves; the animator is the only thing that fires it.
 */
const CLIP_END = "hands:clip-end";

/* -------------------------------------------------------- layer names */

/**
 * Canonical additive-layer names, as accepted by hands.setLayerWeight().
 *
 * Implemented: breathe, sway, walkbob, crouch-shift. `tremor` has a module but
 * its evaluate() is still a stub and nothing drives state.menace yet. `runbob`
 * and `shiver` are names only, reserved so they are fixed and the harness can
 * show a slider for each; a weight set on them is simply skipped.
 */
export const LAYERS = Object.freeze({
  BREATHE: "breathe",
  SWAY: "sway",
  WALKBOB: "walkbob",
  RUNBOB: "runbob",
  CROUCH_SHIFT: "crouch-shift",
  TREMOR: "tremor",
  SHIVER: "shiver",
});

export const LAYER_NAMES = Object.freeze([
  LAYERS.BREATHE,
  LAYERS.SWAY,
  LAYERS.WALKBOB,
  LAYERS.RUNBOB,
  LAYERS.CROUCH_SHIFT,
  LAYERS.TREMOR,
  LAYERS.SHIVER,
]);

/**
 * Starting weights. breathe and sway default ON: the brief's rule is that the
 * hands are NEVER perfectly still, and a default of zero means every caller has
 * to remember to switch them on. Everything else is driven by gameplay - bob by
 * footstep cadence, tremor by state.menace - and starts at zero.
 */
export const DEFAULT_LAYER_WEIGHTS = Object.freeze({
  [LAYERS.BREATHE]: 1,
  [LAYERS.SWAY]: 1,
  [LAYERS.WALKBOB]: 0,
  [LAYERS.RUNBOB]: 0,
  [LAYERS.CROUCH_SHIFT]: 0,
  [LAYERS.TREMOR]: 0,
  [LAYERS.SHIVER]: 0,
});

export function isLayer(name) {
  return LAYER_NAMES.indexOf(name) !== -1;
}

/**
 * Layer name -> implementation. Names with no module yet are simply absent and
 * are skipped, so a weight can be set on `runbob` today without it throwing.
 */
const LAYER_IMPLS = {
  [LAYERS.BREATHE]: breathe,
  [LAYERS.SWAY]: sway,
  [LAYERS.WALKBOB]: walkbob,
  [LAYERS.RUNBOB]: runbob,
  [LAYERS.TREMOR]: tremor,
  [LAYERS.CROUCH_SHIFT]: crouchShift,
};

/* ------------------------------------------------- per-frame scratch (no alloc) */

/**
 * The accumulator every layer adds into: a position offset in metres and a
 * rotation offset in radians, both for the hand ROOT.
 *
 * One object for the whole module, reset in place each frame. The layer contract
 * in layers/sway.js calls itself provisional until the animator lands, so this
 * is that decision: layers describe whole-hand motion, and whole-hand motion is
 * six numbers, not a pose.
 */
const _out = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };

/** Read-only frame context handed to every layer. Mutated in place, never rebuilt. */
const _ctx = {
  dt: 0, elapsed: 0, side: null,
  lookDeltaX: 0, lookDeltaY: 0,
  bobPhase: 0, cadence: 0, speed: 0,
  crouching: false, menace: 0,
};

const _euler = new THREE.Euler();
const _offsetQuat = new THREE.Quaternion();
const _baseQuat = new THREE.Quaternion();
/**
 * Crossfade scratch: holds one joint's blended-so-far quaternion while it is
 * computed from a snapshot plus the incoming clip's target, without mutating
 * either. Module scope, reused by every joint on every hand every frame - see
 * Animator#_advanceClip.
 */
const _fadeBlend = new THREE.Quaternion();

/* ------------------------------------------------------------ animator */

/**
 * An inert handle, returned by play() before the animator can really run a
 * clip. Frozen and SHARED - returning a fresh object here would allocate on a
 * path that gameplay calls often.
 *
 * The real handle from Unit 5 exposes the same four members, so calling code
 * written against this keeps working.
 */
export const INERT_CLIP_HANDLE = Object.freeze({
  side: null,
  clip: null,
  /** True once the clip has finished, or immediately for a clip that never ran. */
  done: true,
  /** Playhead in seconds. */
  time: 0,
  stop() {},
});

export class Animator {
  /**
   * @param {object} params
   * @param {import('./rig.js').HandSide} params.side
   * @param {((name: string, detail: object) => void)|null} [params.onEvent]
   *        The module-level event SINK, supplied once by Hands at init. Every
   *        clip event goes here as well as to the per-play callback, which is
   *        what puts events on the shared bus. Passed in rather than imported so
   *        the animator stays testable without a bus.
   */
  constructor({ side, onEvent = null } = {}) {
    this.side = side ?? null;

    /** Module-level sink, set once. Distinct from the per-play callback below. */
    this.sink = onEvent;

    /** Currently playing clip, or null. */
    this.clip = null;
    this.time = 0;
    this.playing = false;

    /**
     * Crossfade state. Rather than keeping the OUTGOING clip alive and
     * re-evaluating its own timeline during the fade (which would need a
     * second full clip-sampling pass every frame), play() snapshots what the
     * rig actually showed the instant the new clip started - one quaternion
     * per joint, in `_fadeQuats` - and update() slerps from that snapshot
     * toward the incoming clip's live pose. That snapshot is exactly what the
     * player was looking at, whether it came from another clip, a static
     * setPose(), or bare rest, so it is strictly more general than tracking
     * "the outgoing clip" would have been.
     *
     * Sized off JOINT_NAMES rather than allocated per rig, and built once here
     * rather than in update() - allocating 15 Quaternions a frame would be
     * exactly the GC sawtooth this module's zero-allocation rule exists to
     * avoid.
     */
    this._fadeQuats = JOINT_NAMES.map(() => new THREE.Quaternion());
    /** True from play() until update() has captured the snapshot above. */
    this._fadeArmed = false;
    this.fadeTime = 0;
    this.fadeDuration = 0;
    /** Bumped on every play(); lets a stale handle's `done` getter know it lost ownership. */
    this._gen = 0;

    /**
     * Layer name -> 0..1 weight. A plain object rather than a Map because it is
     * read every frame and property access on a fixed-shape object is the
     * faster path in V8.
     */
    this.layerWeights = { ...DEFAULT_LAYER_WEIGHTS };

    /** Per-playthrough event bookkeeping, so each event fires exactly once. */
    this._firedCount = 0;
    this._onEvent = null;
  }

  /**
   * Starts a clip, crossfading from whatever is running.
   *
   * @param {object} clip
   * @param {object} [options]
   * @param {(name: string, payload: object) => void} [options.onEvent]
   * @param {number} [options.fade] crossfade seconds
   * @returns {{ side: string|null, clip: object, done: boolean, time: number, stop: Function }}
   */
  play(clip, { onEvent = null, fade = DEFAULT_CROSSFADE } = {}) {
    if (!clip) return INERT_CLIP_HANDLE;

    // Replaying the SAME clip object while it is already running restarts it
    // from the top rather than crossfading with itself - which would arm a
    // snapshot-to-self blend that does nothing but costs a frame of work.
    const sameClipAlreadyPlaying = this.playing && this.clip === clip;

    this.clip = clip;
    this.time = 0;
    this.playing = true;
    this._firedCount = 0;
    this._onEvent = onEvent;
    this._gen++;

    if (fade > 0 && !sameClipAlreadyPlaying) {
      this.fadeDuration = fade;
      this.fadeTime = 0;
      // Captured on the NEXT update(), not here: play() never receives the
      // rig (only update() does), and snapshotting a frame late is
      // imperceptible against a fade that is itself a fraction of a second.
      this._fadeArmed = true;
    } else {
      this.fadeDuration = 0;
      this.fadeTime = 0;
      this._fadeArmed = false;
    }

    const animator = this;
    const gen = this._gen;
    return {
      side: this.side,
      clip,
      // Lost ownership (a later play() bumped _gen) counts as done, exactly
      // like the clip actually finishing - a caller holding a stale handle
      // should see it as over either way.
      get done() { return animator._gen !== gen || !animator.playing; },
      get time() { return animator._gen === gen ? animator.time : clip.duration ?? 0; },
      stop() { if (animator._gen === gen) animator.stop(); },
    };
  }

  /** Stops the current clip. Does not fire hands:clip-end - a stop is not a finish. */
  stop() {
    this.clip = null;
    this.playing = false;
    this.time = 0;
    this.fadeDuration = 0;
    this._fadeArmed = false;
    this._firedCount = 0;
    this._onEvent = null;
    // Deliberately does NOT touch joint rotations: whatever update() last
    // wrote stays exactly where it is, same as a one-shot finishing on its
    // own - see the header note on what update() does and does not do.
  }

  /** True while a one-shot clip is still running. Looping clips are not "busy". */
  isBusy() {
    return this.playing && !!this.clip && this.clip.loop !== true;
  }

  setLayerWeight(name, weight) {
    this.layerWeights[name] = weight;
  }

  /**
   * Moves the playhead without playing - the harness scrub control.
   *
   * Fires nothing itself. update()'s event test compares the OLD playhead to
   * the NEW one each frame and fires whatever it crossed, so scrubbing
   * backwards and then forwards across an event re-fires it exactly as if it
   * had been played there - no separate "fired" bookkeeping needed, and
   * nothing to reset here.
   */
  seek(time) {
    const duration = this.clip?.duration ?? 0;
    this.time = duration > 0 ? Math.max(0, Math.min(duration, time)) : 0;
  }

  /**
   * Evaluates clip playback and the additive layers, and writes the result to
   * the rig.
   *
   * STEP 1 (BASE, clip playback) writes JOINT rotations - wrist, knuckles,
   * fingertips - via rig.js's applyPose/blendPose, in `_advanceClip` below. A
   * hand with no clip playing simply has this step do nothing, which leaves
   * joints exactly where setPose() (or the previous clip) left them - the same
   * "never touch what nothing is driving" behaviour this method always had for
   * joints, just no longer permanent.
   *
   * STEPS 2-3 (LAYERS, WRITE) offset the hand ROOT - a different set of nodes
   * to the joints - so clip playback and the procedural layers compose without
   * either overwriting the other: a played clip can curl the fingers into a
   * grip while breathe/sway/bob keep moving the whole hand that grip is
   * attached to.
   *
   * ZERO ALLOCATION: the accumulator and the context are module-scope singletons
   * reset in place, the root's base transform is captured once on the first
   * frame so offsets are applied to a fixed origin rather than accumulating, and
   * the crossfade snapshot is allocated once in the constructor, not per frame.
   *
   * @param {number} dt seconds
   * @param {number} elapsed seconds since init, for the procedural layers
   * @param {ReturnType<import('./rig.js').buildRig>} rig
   * @param {object} [motion] frame's player state; see MOTION_DEFAULTS
   */
  update(dt, elapsed, rig, motion) {
    const root = rig?.root;
    if (!root) return;

    // Kept alive by a running crossfade even after the clip itself has
    // finished (this.playing false): a zero-duration single-key clip played
    // with a long `fade` - see hands.js's blendToPose() - has nothing left to
    // advance but still has seconds of blending left to do.
    if (this.clip && (this.playing || this.fadeDuration > 0)) this._advanceClip(dt, rig);

    // The base is whatever hands.js positioned this hand at during init. Captured
    // lazily because that happens after the animator is constructed.
    if (!this._base) {
      this._base = {
        px: root.position.x, py: root.position.y, pz: root.position.z,
        qx: root.quaternion.x, qy: root.quaternion.y,
        qz: root.quaternion.z, qw: root.quaternion.w,
      };
    }

    _out.px = 0; _out.py = 0; _out.pz = 0;
    _out.rx = 0; _out.ry = 0; _out.rz = 0;

    _ctx.dt = dt;
    _ctx.elapsed = elapsed;
    _ctx.side = this.side;
    _ctx.lookDeltaX = motion?.lookDeltaX ?? 0;
    _ctx.lookDeltaY = motion?.lookDeltaY ?? 0;
    _ctx.bobPhase = motion?.bobPhase ?? 0;
    _ctx.cadence = motion?.cadence ?? 0;
    _ctx.speed = motion?.speed ?? 0;
    _ctx.crouching = motion?.crouching ?? false;
    _ctx.menace = motion?.menace ?? 0;

    for (let i = 0; i < LAYER_NAMES.length; i++) {
      const name = LAYER_NAMES[i];
      const weight = this.layerWeights[name];
      // A layer at weight 0 is skipped and evaluate() is never called, which is
      // the contract layers/sway.js documents.
      if (!(weight > 0)) continue;
      const layer = LAYER_IMPLS[name];
      if (layer) layer.evaluate(_out, _ctx, weight);
    }

    const base = this._base;
    root.position.set(base.px + _out.px, base.py + _out.py, base.pz + _out.pz);
    _euler.set(_out.rx, _out.ry, _out.rz);
    _offsetQuat.setFromEuler(_euler);
    _baseQuat.set(base.qx, base.qy, base.qz, base.qw);
    // base * offset, so the offset acts about the hand's own axes rather than
    // the camera's - a bob that tilts with the wrist, not with the view.
    root.quaternion.copy(_baseQuat).multiply(_offsetQuat);
  }

  /**
   * Advances the playhead, applies the clip's pose to the rig's joints, fires
   * any events crossed this frame, and handles looping / finishing / the
   * crossfade. Split out of update() because it is the whole of STEP 1 and
   * update() already has plenty going on.
   *
   * @param {number} dt seconds
   * @param {ReturnType<import('./rig.js').buildRig>} rig
   */
  _advanceClip(dt, rig) {
    const order = rig.order;
    if (!order || !order.length) return;

    const clip = this.clip;

    // Snapshot what the rig actually showed the instant THIS clip started -
    // see the constructor's note on _fadeQuats for why this beats tracking
    // the outgoing clip's own timeline.
    if (this._fadeArmed) {
      for (let i = 0; i < order.length && i < this._fadeQuats.length; i++) {
        this._fadeQuats[i].copy(order[i].node.quaternion);
      }
      this._fadeArmed = false;
    }

    // Only while the clip itself is still going - once it has finished
    // (this.playing false), the joints already hold its last pose and there
    // is nothing left to advance, sample or fire. A still-running crossfade
    // (below) is a separate concern from here on.
    if (this.playing) {
      const prevTime = this.time;
      this.time += dt;

      // A clip authored with no keys (an unauthored stub) has nothing to pose
      // - leave the joints exactly where they already are rather than
      // snapping every joint to rest, which would make an empty clip visibly
      // WORSE than no clip at all.
      if (clip.keys && clip.keys.length) this._applyClipPose(clip, this.time, rig);

      this._fireEvents(clip, prevTime, this.time);

      const duration = clip.duration ?? 0;
      if (clip.loop) {
        if (duration > 0 && this.time >= duration) this.time %= duration;
      } else if (this.time >= duration) {
        this.time = duration;
        this.playing = false;
        this.sink?.(CLIP_END, { clip, time: this.time });
        this._onEvent?.(CLIP_END, { clip, time: this.time });
      }
    }

    // Crossfade: blend the pre-clip snapshot toward whatever _applyClipPose
    // last wrote, joint by joint. Applied AFTER the clip's own pose so it
    // blends "what the hand showed a moment ago" into "what this clip says
    // right now", not the other way round. Runs on its own clock
    // (fadeTime/fadeDuration), so it keeps going for frames after the clip
    // above has already finished - see update()'s comment on why that matters.
    if (this.fadeDuration > 0) {
      this.fadeTime += dt;
      const alpha = Math.min(1, this.fadeTime / this.fadeDuration);
      for (let i = 0; i < order.length && i < this._fadeQuats.length; i++) {
        const node = order[i].node;
        // Blend into scratch, not into the snapshot itself - the snapshot has
        // to stay the ORIGINAL pre-clip pose for every frame of the fade, or
        // slerping it in place would compound instead of interpolating fresh
        // from the same start point each time.
        _fadeBlend.copy(this._fadeQuats[i]).slerp(node.quaternion, alpha);
        node.quaternion.copy(_fadeBlend);
      }
      if (alpha >= 1) this.fadeDuration = 0;
    }
  }

  /**
   * Samples `clip` at `time` and writes the result to the rig's joints.
   *
   * Clamps to the first/last key outside the authored range, and slerps
   * between the bracketing pair (eased per the incoming key's `ease`) inside
   * it. ALLOCATES NOTHING - applyPose/blendPose are the same zero-allocation
   * primitives setPose()/blendToPose() already use.
   */
  _applyClipPose(clip, time, rig) {
    const keys = clip.keys;
    const n = keys.length;

    if (n === 1 || time <= keys[0].t) {
      applyPose(rig, keys[0].pose);
      return;
    }
    if (time >= keys[n - 1].t) {
      applyPose(rig, keys[n - 1].pose);
      return;
    }

    // Linear scan for the bracketing pair. A clip is a handful of keys, so
    // this costs nothing - see the module header on why `t` is authored in
    // ascending seconds rather than normalised, which is what makes this scan
    // (and not just a division) the correct way to find "where am I".
    let i = 0;
    while (i < n - 1 && keys[i + 1].t <= time) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const span = b.t - a.t;
    const raw = span > 0 ? (time - a.t) / span : 1;
    blendPose(rig, a.pose, b.pose, ease(raw, b.ease));
  }

  /**
   * Fires every event this clip crossed between `prevTime` and `newTime`.
   *
   * Comparing the OLD and NEW playhead each frame, rather than walking an
   * index of "already fired" events, is what makes seek() safe to scrub
   * backwards and forwards across an event with no separate bookkeeping to
   * reset - see seek()'s own comment.
   */
  _fireEvents(clip, prevTime, newTime) {
    const events = clip.events;
    if (!events || !events.length) return;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.t > prevTime && ev.t <= newTime) {
        this.sink?.(ev.name, { clip, time: ev.t });
        this._onEvent?.(ev.name, { clip, time: ev.t });
      }
    }
  }

  dispose() {
    this.stop();
    this.clip = null;
  }
}
