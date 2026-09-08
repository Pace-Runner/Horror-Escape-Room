/**
 * throw - wind-up, forward swing, release, follow-through.  [owner: Hands]  P0
 *
 * EMITS: hands:throw-release at the APEX of the forward swing - the frame of
 * peak forward velocity, where the Physics system applies the impulse. Then
 * hands:clip-end.
 *
 * FOUR PHASES, ALL FOUR REQUIRED. The one teams cut is the follow-through, and
 * cutting it is exactly what makes a thrown object look weightless: the hand
 * stopping dead at the release point says nothing left it. The hand must
 * continue past the release and settle back.
 *
 * The release frame is NOT the last frame. Getting those confused means the
 * impulse is applied after the arm has already decelerated, and the object
 * dribbles out of the hand.
 *
 * Unit 7 authors keys and event times. Times are in SECONDS.
 */

export const throwClip = Object.freeze({
  name: "throw",
  duration: 0,
  loop: false,
  keys: Object.freeze([]),
  events: Object.freeze([]),
});
