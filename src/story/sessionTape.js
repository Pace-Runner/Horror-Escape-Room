// =============================================================================
// THE SESSION 14 TAPE  --  what is on the cassette in the basement lab's
// recorder, as the subtitles that run under it while it plays.
//
//   * `start` and `end` are seconds into the tape. A subtitle shows between them.
//   * `speaker` is who says it. Leave it off for a sound, written in [brackets].
//   * `voice` is the spoken line's recording, relative to src/assets/voice/.
//     The game plays it at `start`; a line with no recording yet is silent,
//     and the subtitle still shows. The voices are NOT in the tape's own sound
//     (src/assets/audio/tape/session_14.m4a), so a line can be re-recorded
//     without rebuilding it.
//   * Change the words freely. Keep the timings in step with the tape's sound
//     (blender/build_session_tape_audio.py) and with how long each recorded
//     line runs (blender/split_session_tape_voices.py prints it): a line still
//     playing when the next starts is cut off, since one voice plays at a time.
//
// The tape is a recording made on the lab's cassette recorder, on the
// instrument trolley beside the restraint table. The two voices are never
// named. SCIENTIST is the scientist keeping the log. GIRL is Annabelle, a young
// girl in 1987 -- but nothing on the tape may say so. The only name spoken is
// "Mark", which means nothing to the player until the letter in Level 3 is
// signed with it.
//
// Story notes for anyone changing this: docs/LEVEL2_POWER_CHAIN.md, "The
// session tape".
// =============================================================================

/** The label on the cassette, in the same marker as the stack of earlier sessions. */
export const SESSION_TAPE_LABEL = 'SESSION 14 — 14.1.87';

/** How long the tape runs, in seconds, when there is no recording to measure. */
export const SESSION_TAPE_LENGTH_IN_SECONDS = 47;

/** Spoken captions only. Ends match the measured voice clip durations;
 * starts retain the authored soundtrack cues (the soundtrack is 47.044s). */
export const SESSION_TAPE_SUBTITLES = [
  { start: 1.2, end: 7.609, speaker: 'SCIENTIST', voice: 'level2/tape_01_man.m4a', text: 'Session fourteen. Subject has been sedated for twenty-four hours. Should be coming round any minute.' },
  { start: 7.8, end: 16.833, speaker: 'SCIENTIST', voice: 'level2/tape_02_man.m4a', text: 'For the record: Project HOLLOW was meant to make the body adapt. Faster healing. Stronger tissue. It did. It hasn\'t stopped.' },
  { start: 17.0, end: 21.992, speaker: 'SCIENTIST', voice: 'level2/tape_03_man.m4a', text: 'Visual distortion is increasing. Last week he stopped recognising staff.' },
  { start: 22.1, end: 23.052, speaker: 'GIRL', voice: 'level2/tape_04_girl.m4a', text: 'He\'ll know me.' },
  { start: 23.3, end: 25.994, speaker: 'SCIENTIST', voice: 'level2/tape_05_man.m4a', text: 'He might not. Stay behind the line.' },
  { start: 26.1, end: 27.749, speaker: 'SCIENTIST', voice: 'level2/tape_06_man.m4a', text: 'He\'s waking. Note the time.' },
  { start: 29.6, end: 31.806, speaker: 'GIRL', voice: 'level2/tape_07_girl.m4a', text: 'It\'s okay. You\'re okay\u2014' },
  { start: 32.3, end: 33.879, speaker: 'SCIENTIST', voice: 'level2/tape_08_man.m4a', text: 'Get back. Get back!' },
  { start: 33.9, end: 36.64, speaker: 'GIRL', voice: 'level2/tape_09_girl.m4a', text: 'Mark! It\'s me, it\'s me!' },
  { start: 43.0, end: 43.906, speaker: 'GIRL', voice: 'level2/tape_10_girl.m4a', text: 'Mark\u2026' },
];

/**
 * The sounds the placeholder plays, at seconds into the tape, while there is
 * no recording with a soundtrack of its own. Ignored once the recording exists.
 */
export const SESSION_TAPE_PLACEHOLDER_SOUNDS = [
  { at: 36.6, sound: 'impact' },
  { at: 36.7, sound: 'glass' },
  { at: 41.6, sound: 'alarm' }
];
