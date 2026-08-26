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
 * See ./sway.js for the shared layer contract.
 *
 * Numbers: a resting adult breathes about 15 times a minute, so the base rate is
 * 2*pi/4s = 1.55 rad/s. The amplitudes are deliberately tiny - 3 mm of rise, 2 mm
 * of drift, a third of a degree of pitch. At this scale it is invisible as
 * motion and only registers as the hand not being dead, which is the point. Turn
 * any of them up and it reads as a slow hydraulic wobble.
 *
 * The three components run at 1x, 0.5x and 1x with different phase offsets so
 * they never line up into a single rigid bob.
 */

const RATE = 1.55;

export const breathe = Object.freeze({
  name: "breathe",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    const t = ctx.elapsed * RATE;
    out.py += weight * 0.0032 * Math.sin(t);
    out.pz += weight * 0.0018 * Math.sin(t * 0.5 + 1.1);
    out.rx += weight * 0.0060 * Math.sin(t + 0.6);
  },
});
