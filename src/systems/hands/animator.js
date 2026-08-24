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
 * Unit 0 status: the CLIP FORMAT and the LAYER NAMES below are the contract.
 * Playback is a stub - Unit 5 implements it, Unit 6 implements the layers.
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

/** Easing curve names a keyframe may use. Resolved by Unit 5. */
export const EASINGS = Object.freeze(["linear", "in", "out", "inout"]);

/** Default crossfade, seconds. Short enough to feel responsive, long enough to hide the switch. */
export const DEFAULT_CROSSFADE = 0.12;

/* -------------------------------------------------------- layer names */

/**
 * Canonical additive-layer names, as accepted by hands.setLayerWeight().
 *
 * Unit 6 implements breathe / sway / walkbob / tremor (the four with modules in
 * layers/); runbob, crouch-shift and shiver are listed here so the name is
 * fixed now and the harness can show a slider for each from Unit 1 onward.
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
   * Advances the playhead, evaluates base + layers, writes to the rig.
   *
   * UNIT 5 IMPLEMENTS THIS. Must allocate nothing.
   *
   * @param {number} dt seconds
   * @param {number} elapsed seconds since init, for the procedural layers
   * @param {ReturnType<import('./rig.js').buildRig>} rig
   */
  update(dt, elapsed, rig) {
    void dt;
    void elapsed;
    void rig;
  }

  dispose() {
    this.stop();
    this.clip = null;
  }
}
