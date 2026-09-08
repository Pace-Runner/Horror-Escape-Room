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

/**
 * Spring state, one entry per side, allocated once at module load.
 *
 * Per-side and not a single pair of numbers because the layer object is a
 * SHARED singleton - both hands call the same evaluate() - so one set of state
 * would have the two hands fighting over it. Only the right hand is built today
 * (ACTIVE_SIDES in hands.js), but getting this wrong would be invisible until
 * the left came back and then baffling.
 */
const spring = {
  left: { x: 0, y: 0, vx: 0, vy: 0 },
  right: { x: 0, y: 0, vx: 0, vy: 0 },
};

/**
 * Damped spring toward zero. STIFF sets how fast it snaps back, DAMP how much
 * it overshoots on the way - underdamped on purpose, since the overshoot IS the
 * effect. KICK converts a frame's look delta in radians into an impulse.
 */
const STIFF = 85;
const DAMP = 11;
const KICK = 0.55;
/** Radians. Whip the mouse fast enough and without this the hands would spin. */
const LIMIT = 0.075;

export const sway = Object.freeze({
  name: "sway",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    const s = spring[ctx.side] ?? spring.right;
    const dt = ctx.dt;

    // The look delta is already a per-frame amount, so it enters as an impulse
    // on velocity rather than being scaled by dt a second time.
    s.vx -= ctx.lookDeltaX * KICK;
    s.vy -= ctx.lookDeltaY * KICK;

    s.vx += (-STIFF * s.x - DAMP * s.vx) * dt;
    s.vy += (-STIFF * s.y - DAMP * s.vy) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    if (s.x > LIMIT) { s.x = LIMIT; s.vx = 0; } else if (s.x < -LIMIT) { s.x = -LIMIT; s.vx = 0; }
    if (s.y > LIMIT) { s.y = LIMIT; s.vy = 0; } else if (s.y < -LIMIT) { s.y = -LIMIT; s.vy = 0; }

    // Rotate against the turn, and let the hand trail sideways a little as well
    // - rotation alone reads as the wrist twitching rather than the arm lagging.
    out.ry += weight * s.x;
    out.rx += weight * s.y;
    out.px += weight * s.x * 0.045;
    out.py += weight * s.y * 0.045;
  },
});
