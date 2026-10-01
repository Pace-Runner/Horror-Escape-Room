/**
 * runbob - the heavier, wider gait of a sprint.  [owner: Hands]  P0
 *
 * ADDITIVE ON TOP OF walkbob, not a replacement for it. The animator sums
 * layers, so sprinting means walkbob at full weight plus this one fading in
 * alongside it -- which is why the numbers here are deltas that read as "more"
 * rather than a complete gait of their own. Cross-fading between two full gaits
 * would need them authored against each other to avoid a hitch at the handover;
 * summing needs nothing.
 *
 * WHY THIS EXISTS ON THE HANDS AT ALL. PointerLockPlayer refuses camera roll
 * (see the note above #applyEyeHeight) and routes the sideways half of motion
 * here instead: the view staying level while what you are holding swings is
 * what sells weight. A sprint is where that matters most -- roll the camera and
 * it reads as motion sickness, roll the torch and it reads as running.
 *
 * The name was reserved in animator.js long before there was a module for it,
 * so nothing outside this folder changes to switch it on.
 *
 * See ./sway.js for the shared layer contract. Same phase source as walkbob:
 * `ctx.bobPhase` is one STRIDE per 2*pi, advanced from distance actually walked,
 * so this cannot drift against the footsteps either.
 */

export const runbob = Object.freeze({
  name: "runbob",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    const p = ctx.bobPhase;

    // Vertical, once per step, and roughly double walkbob's 0.0065. A run
    // drives harder off each foot.
    out.py += weight * 0.0130 * Math.sin(p * 2);

    // The sideways swing and its roll, once per stride, both well up on
    // walkbob's 0.0080 / 0.0150. This is the half the camera is not allowed to
    // do, so it has to be legible here or the sprint has no lateral component
    // at all.
    out.px += weight * 0.0165 * Math.sin(p);
    out.rz += weight * 0.0380 * Math.sin(p);

    // Push-pull along the barrel, a quarter cycle out of phase as in walkbob so
    // the hand leads and trails rather than moving on the beat of the rise.
    out.pz += weight * 0.0070 * Math.sin(p * 2 + 1.57);

    // Pitch: the arm drops slightly and nods once per step. A held torch
    // pointing dead level while its owner runs is the tell that the hands are
    // a HUD element rather than an object with mass.
    out.py -= weight * 0.0060;
    out.rx += weight * 0.0220 * Math.sin(p * 2 + 0.6);
  },
});
