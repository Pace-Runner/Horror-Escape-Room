/**
 * drop - open, lower, release.  [owner: Hands]  P0
 *
 * EMITS: hands:release when the fingers open, then hands:clip-end.
 *
 * Deliberately slower and heavier than the reverse of `pickup`. Letting go is a
 * decision the player made; playing it as a fast un-grab makes objects feel
 * weightless and makes the drop read as a mistake.
 *
 * Unit 7 authors keys and event times. Times are in SECONDS.
 */

export const drop = Object.freeze({
  name: "drop",
  duration: 0,
  loop: false,
  keys: Object.freeze([]),
  events: Object.freeze([]),
});
