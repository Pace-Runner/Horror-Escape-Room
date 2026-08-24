/**
 * sway - counter-rotation lagging behind the mouse look.  [owner: Hands]  P0
 *
 * When the camera turns, the hands lag and then catch up, rotating slightly
 * against the turn before settling. This is what sells WEIGHT: hands rigidly
 * welded to the camera read as a HUD element painted on the screen, because
 * nothing in the real world tracks a head that precisely.
 *
 * Driven by mouse delta, so it needs the frame's look input in ctx. The lag is a
 * damped spring toward zero, NOT a delay buffer - a buffer costs memory, adds
 * fixed latency regardless of how fast the player turned, and does not overshoot,
 * and the overshoot is most of the effect.
 *
 * Unit 6 implements.
 *
 * ---------------------------------------------------------------------------
 * THE LAYER CONTRACT (shared by every module in this folder)
 *
 * A layer is a plain frozen object with a name and an `evaluate` function:
 *
 *   evaluate(out, ctx, weight)
 *
 *   out    - the accumulator the animator ADDS into. Layers never write the rig
 *            directly and never overwrite each other; they sum. That is what
 *            lets breathe + walkbob + tremor all run at once over a base clip
 *            without any of them being authored together.
 *   ctx    - read-only frame context: { dt, elapsed, side, lookDeltaX,
 *            lookDeltaY, cadence, speed, crouching, menace }. Assembled once per
 *            frame by the animator and shared by every layer.
 *   weight - 0..1, already resolved from setLayerWeight(). A layer at weight 0
 *            is skipped by the animator and evaluate() is not called at all.
 *
 * ZERO ALLOCATION inside evaluate(). Layers run every frame for both hands;
 * anything created here is garbage sixty times a second. Keep scratch state at
 * module scope in the layer's own closure.
 *
 * This contract is PROVISIONAL until Unit 5 lands the animator that calls it -
 * it is internal, so it may be refined there. The public API in §4 of the brief
 * is what is frozen, not this.
 * ---------------------------------------------------------------------------
 */

export const sway = Object.freeze({
  name: "sway",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    void out;
    void ctx;
    void weight;
  },
});
