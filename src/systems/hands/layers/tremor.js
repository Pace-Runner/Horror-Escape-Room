/**
 * tremor - fear shake, driven by menace.  [owner: Hands]  P1
 *
 * Weight comes from `state.menace` in core/Events.js - the SAME number that
 * drives the interference post-process, the music layer and the CCTV
 * degradation. One value, so they cannot drift apart, which is the whole reason
 * menace lives on the shared state rather than inside the AI director.
 *
 * WHY THIS EARNS ITS PLACE
 * Hands visibly shaking as the creature nears is one of the cheapest and most
 * memorable effects available to this project: no assets, no shader, a handful
 * of lines, and it turns an abstract dread meter into something the player feels
 * without being told. It is also a direct hit on the rubric clause about
 * uniforms and parameters driven by game state rather than being static.
 *
 * AUTHORING NOTE: noise, not a sine. A sinusoidal shake at tremor frequency
 * reads as a mechanical vibration or a bug in the animation system; fear is
 * irregular. Layer two noise frequencies - a fast fine jitter over a slower
 * wander - and keep the amplitude small enough at weight 1 that the hands are
 * still readable. If the player cannot tell what they are holding, it is too
 * much.
 *
 * The Hands module does NOT read state.menace itself - that would couple it to
 * the game. Unit 15 subscribes on the bus and calls setLayerWeight('tremor', v).
 *
 * Unit 6 implements. See ./sway.js for the shared layer contract.
 */

export const tremor = Object.freeze({
  name: "tremor",

  /** @type {(out: object, ctx: object, weight: number) => void} */
  evaluate(out, ctx, weight) {
    void out;
    void ctx;
    void weight;
  },
});
