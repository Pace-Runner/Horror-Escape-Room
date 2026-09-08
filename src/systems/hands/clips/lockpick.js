/**
 * lockpick - paperclip in the restraint.  [owner: Hands]  P0
 *
 * EMITS: hands:clip-end.
 *
 * THIS IS THE FIRST THING THE PLAYER EVER DOES (Level 1, Puzzle 1), which makes
 * it the most closely watched animation in the game - the player is restrained,
 * has nothing else to look at, and will repeat it until the lock gives. Two
 * consequences for how it is authored:
 *
 *   - It must look FIDDLY, not smooth. Small, uneven wrist rotations with
 *     hesitations, not a clean arc. Competence reads as a cutscene; fumbling
 *     reads as the player doing it.
 *   - It must be LOOPABLE without a visible seam, because it is repeated. The
 *     start and end poses have to match, and the ease at the boundary has to be
 *     continuous or there is a tick every cycle.
 *
 * Unit 12 authors keys and event times. Times are in SECONDS.
 */

export const lockpick = Object.freeze({
  name: "lockpick",
  duration: 0,
  loop: true,
  keys: Object.freeze([]),
  events: Object.freeze([]),
});
