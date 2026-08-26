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
 * Status: the LAYERS are implemented - breathe, sway, walkbob and crouch-shift
 * all run - and update() applies them. CLIP PLAYBACK is still a stub, so step 1
 * contributes nothing and update() deliberately leaves joint rotations alone;
 * see its own comment for why that matters.
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
import { tremor } from "./layers/tremor.js";
import { crouchShift } from "./layers/crouch-shift.js";

/** Easing curve names a keyframe may use. Resolved by Unit 5. */
export const EASINGS = Object.freeze(["linear", "in", "out", "inout"]);

/** Default crossfade, seconds. Short enough to feel responsive, long enough to hide the switch. */
export const DEFAULT_CROSSFADE = 0.12;

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

    /** Outgoing clip during a crossfade. */
    this.fadeFrom = null;
    this.fadeTime = 0;
    this.fadeDuration = 0;

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
   * UNIT 5 IMPLEMENTS THIS.
   *
   * @param {object} clip
   * @param {object} [options]
   * @param {(name: string, payload: object) => void} [options.onEvent]
   * @param {number} [options.fade] crossfade seconds
   * @returns {typeof INERT_CLIP_HANDLE}
   */
  play(clip, { onEvent = null, fade = DEFAULT_CROSSFADE } = {}) {
    void clip;
    void onEvent;
    void fade;
    return INERT_CLIP_HANDLE;
  }

  /** Stops the current clip. Does not fire hands:clip-end - a stop is not a finish. */
  stop() {
    this.clip = null;
    this.playing = false;
    this.time = 0;
    this.fadeFrom = null;
    this._firedCount = 0;
    this._onEvent = null;
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
   * UNIT 5: scrubbing BACKWARDS must reset the fired-event bookkeeping, so that
   * scrubbing back and forward across an event frame re-fires it. Otherwise the
   * harness cannot be used to check event timing, which is most of what it is
   * for.
   */
  seek(time) {
    void time;
  }

  /**
   * Evaluates the additive layers and writes the result to the rig.
   *
   * WHAT THIS DOES AND DELIBERATELY DOES NOT DO. Only step 2 of the three in the
   * header - the LAYERS - is implemented. Clip playback (step 1) is still a stub,
   * so there is no base animation to compose against, and the layers are applied
   * on their own.
   *
   * Consequently this NEVER TOUCHES JOINT ROTATIONS. The static pose put there by
   * setPose() is the base, and overwriting it every frame with an empty clip
   * result would wipe the grip. The layers move the hand ROOT instead, which is
   * both cheaper and, for whole-hand motion like breathing and bob, exactly the
   * right node - and it carries the sockets, so anything held moves with it.
   * When clip playback lands, that is where joint composition belongs.
   *
   * ZERO ALLOCATION: the accumulator and the context are module-scope singletons
   * reset in place, and the root's base transform is captured once on the first
   * frame so offsets are applied to a fixed origin rather than accumulating.
   *
   * @param {number} dt seconds
   * @param {number} elapsed seconds since init, for the procedural layers
   * @param {ReturnType<import('./rig.js').buildRig>} rig
   * @param {object} [motion] frame's player state; see MOTION_DEFAULTS
   */
  update(dt, elapsed, rig, motion) {
    const root = rig?.root;
    if (!root) return;

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

  dispose() {
    this.stop();
    this.clip = null;
  }
}
