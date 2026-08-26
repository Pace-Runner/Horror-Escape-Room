/**
 * crouch-shift - the hands pull in when the player crouches.  [owner: Hands]
 *
 * The camera already drops when crouching (CROUCH_DROP in
 * core/PointerLockPlayer.js), and because the hands are parented to it they drop
 * too. That alone reads as the whole view being lowered on a lift: nothing about
 * the hand itself changes, only where the camera is.
 *
 * What a person actually does when they crouch is draw the hands IN - closer to
 * the chest, tucked a little lower and turned slightly inward, because a crouch
 * is a defensive shape. This layer is that difference, applied relative to the
 * camera, so the torch settles back toward the body as the player sinks and
 * pushes back out as they stand.
 *
 * WEIGHT IS THE BLEND. main.js passes the player's smoothed 0..1 crouch straight
 * in as the layer weight, so the shift eases with the drop for free and this
 * needs no state and no easing of its own. `ctx.crouching` exists on the frame
 * context as a boolean, but a boolean cannot express half-crouched, so it is
 * deliberately not what drives this.
 *
 * See ./sway.js for the shared layer contract.
 */

export const crouchShift = Object.freeze({
  name: "crouch-shift",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    // in toward the body and down a little
    out.pz += weight * 0.0240;
    out.py -= weight * 0.0180;
    out.px -= weight * 0.0090;
    // and tipped up slightly, the way a held object rotates when the elbow
    // tucks against the ribs
    out.rx += weight * 0.0850;
    out.rz += weight * 0.0380;
  },
});
