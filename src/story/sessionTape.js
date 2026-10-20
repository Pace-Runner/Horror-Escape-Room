// =============================================================================
// THE SESSION 14 TAPE  --  what is on the Video8 tape in the basement lab's
// camcorder, as the subtitles that run over it on the monitor.
//
//   * `start` and `end` are seconds into the tape. A subtitle shows between them.
//   * `speaker` is who says it. Leave it off for a sound, written in [brackets].
//   * Change the words freely. Keep the timings in step with the footage once
//     it exists (src/assets/video/session_14.mp4): they are what keeps a line
//     on screen while it is being said.
//
// The two voices are never seen. MAN is the scientist behind the camera.
// WOMAN is Annabelle -- but nothing on the tape may say so. The only name
// spoken is "Mark", which means nothing to the player until the letter in
// Level 3 is signed with it.
//
// Story notes for anyone changing this: docs/LEVEL2_POWER_CHAIN.md, "The
// session tape".
// =============================================================================

/** The label on the cassette, in the same marker as the stack of earlier sessions. */
export const SESSION_TAPE_LABEL = 'SESSION 14 — 14.1.87';

/**
 * The camcorder's date stamp, burned into the picture: when the recording
 * starts. The clock runs on from here as the tape plays.
 */
export const SESSION_TAPE_RECORDED_AT = { date: 'JAN.14 1987', hours: 2, minutes: 47, seconds: 4 };

/** How long the tape runs, in seconds, when there is no footage to measure. */
export const SESSION_TAPE_LENGTH_IN_SECONDS = 47;

/** Every subtitle on the tape, in order. */
export const SESSION_TAPE_SUBTITLES = [
  { start: 0.6, end: 3.4, text: '[slow breathing]' },
  { start: 1.2, end: 7.6, speaker: 'MAN', text: 'Session fourteen. Subject has been sedated for thirty-six hours. Should be coming round any minute.' },
  { start: 8.0, end: 15.6, speaker: 'MAN', text: 'For the record: HOLLOW was meant to make the body adapt. Faster healing. Stronger tissue. It did. It hasn\'t stopped.' },
  { start: 16.0, end: 20.0, speaker: 'MAN', text: 'Visual distortion is increasing. Last week he stopped recognising staff.' },
  { start: 20.2, end: 21.8, speaker: 'WOMAN', text: 'He\'ll know me.' },
  { start: 22.0, end: 24.2, speaker: 'MAN', text: 'He might not. Stay behind the line.' },
  { start: 24.4, end: 26.0, text: '[the breathing quickens]' },
  { start: 26.0, end: 28.0, speaker: 'MAN', text: 'He\'s waking. Note the time—' },
  { start: 28.0, end: 29.6, text: '[the restraints strain]' },
  { start: 29.6, end: 31.8, speaker: 'WOMAN', text: 'It\'s okay. You\'re okay—' },
  { start: 32.0, end: 33.0, text: '[a strap snaps]' },
  { start: 32.8, end: 35.0, speaker: 'MAN', text: 'Get back. Get back!' },
  { start: 35.0, end: 36.6, speaker: 'WOMAN', text: 'Mark! Mark, it\'s me!' },
  { start: 36.6, end: 38.0, text: '[the camera goes over]' },
  { start: 38.2, end: 40.0, text: '[something heavy, moving away]' },
  { start: 40.4, end: 41.8, text: '[glass shatters]' },
  { start: 41.6, end: 44.6, text: '[an alarm]' },
  { start: 43.0, end: 45.4, speaker: 'WOMAN', text: 'Mark…' }
];

/**
 * The sounds the placeholder plays, at seconds into the tape, while there is
 * no footage with a soundtrack of its own. Ignored once the video exists.
 */
export const SESSION_TAPE_PLACEHOLDER_SOUNDS = [
  { at: 36.6, sound: 'impact' },
  { at: 40.4, sound: 'glass' },
  { at: 41.6, sound: 'alarm' }
];

/**
 * Where the picture is, in seconds: when the camera goes over (the frame
 * tumbles and lies on its side), and when it rolls into static, then black.
 * The placeholder draws these; the footage, once it exists, is cut to them.
 */
export const SESSION_TAPE_PICTURE = {
  cameraFallsAt: 36.6,
  staticFromSeconds: 44.6,
  blackFromSeconds: 45.6
};
