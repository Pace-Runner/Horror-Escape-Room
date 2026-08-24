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
 * Unit 6 implements. See ./sway.js for the shared layer contract.
 */

export const walkbob = Object.freeze({
  name: "walkbob",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    void out;
    void ctx;
    void weight;
  },
});
