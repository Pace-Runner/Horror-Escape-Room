/**
 * walkbob - figure-eight bob synced to footstep cadence.  [owner: Hands]  P0
 *
 * A figure-eight rather than a vertical sine, because that is what a hand
 * actually traces when you walk: it rises and falls once per step but also
 * swings side to side once per STRIDE, at half the frequency. A pure vertical
 * bob reads as a lift, not a walk.
 *
 * Must be driven by the same cadence value the footstep audio uses. If the bob
 * and the footstep sound drift apart the effect inverts and actively feels
 * wrong - the hands are visibly bobbing between the steps you can hear.
 *
 * See ./sway.js for the shared layer contract.
 *
 * `ctx.bobPhase` is one STRIDE per 2*pi, advanced by PointerLockPlayer from
 * distance actually walked rather than from elapsed time. Distance is what keeps
 * this locked to the footsteps: a time-based phase drifts out of sync the moment
 * the player stops, turns, or walks into a wall, and the brief is explicit that
 * bob drifting against audible steps is worse than no bob at all.
 *
 * So vertical is sin(2 * phase) - twice per stride, i.e. once per step - and
 * lateral is sin(phase), once per stride. That 2:1 is the figure-eight.
 */

export const walkbob = Object.freeze({
  name: "walkbob",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    const p = ctx.bobPhase;
    // once per step
    out.py += weight * 0.0065 * Math.sin(p * 2);
    // once per stride: the sideways half of the eight, plus the roll that comes
    // with it, because a hand swinging out also tips
    out.px += weight * 0.0080 * Math.sin(p);
    out.rz += weight * 0.0150 * Math.sin(p);
    // a little push-pull along the barrel, a quarter cycle out of phase so the
    // hand leads and trails rather than moving on the same beat as the rise
    out.pz += weight * 0.0028 * Math.sin(p * 2 + 1.57);
  },
});
