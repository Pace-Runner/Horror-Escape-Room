/**
 * pickup - reach, grasp, retract.  [owner: Hands]  P0
 *
 * EMITS: hands:grasp at the frame the fingers close, then hands:clip-end.
 *
 * The grasp event is the one place in this module where animation timing and
 * gameplay are hard-coupled: the Interaction system parents the object to the
 * socket when it fires. Fire it early and the object visibly snaps into a hand
 * that is still open; fire it late and the closed hand passes through the object
 * first. It goes on the frame of visual closure, and Unit 7's acceptance is
 * exactly that.
 *
 * Unit 7 authors keys and event times. Times are in SECONDS.
 */

export const pickup = Object.freeze({
  name: "pickup",
  duration: 0,
  loop: false,
  keys: Object.freeze([]),
  events: Object.freeze([]),
});
