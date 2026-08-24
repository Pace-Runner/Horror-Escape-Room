/**
 * breathe - the layer that keeps the hands alive.  [owner: Hands]  P0
 *
 * Slow vertical drift of the whole hand plus a faint settle in the fingers, out
 * of phase with each other so it does not read as a single rigid bob. Runs at
 * weight 1 by default and effectively never stops.
 *
 * WHY THIS IS THE MOST IMPORTANT LAYER
 * Perfectly still hands look like a paused game. Two sine waves are all it takes
 * to fix that, and no amount of quality in the keyframed clips substitutes for
 * it - a beautifully animated `pickup` that returns to a frozen hand still reads
 * as broken. Never let the hands be perfectly still.
 *
 * Procedural, not keyframed: a breathing cycle is a sine wave, and authoring it
 * as keyframes would cost a clip slot, a file and a seam at the loop boundary
 * for no gain.
 *
 * Unit 6 implements. See ./sway.js for the shared layer contract.
 */

export const breathe = Object.freeze({
  name: "breathe",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    void out;
    void ctx;
    void weight;
  },
});
