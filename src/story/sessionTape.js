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
//     (blender/build_session_tape_audio.py): they are what keeps a line on
//     screen while it is being said.
//
// The tape is a recording made on the lab's cassette recorder, on the
// instrument trolley beside the restraint table. The two voices are never
// named. MAN is the scientist keeping the log. WOMAN is Annabelle -- but
// nothing on the tape may say so. The only name spoken is "Mark", which means
// nothing to the player until the letter in Level 3 is signed with it.
//
// Story notes for anyone changing this: docs/LEVEL2_POWER_CHAIN.md, "The
// session tape".
// =============================================================================

/** The label on the cassette, in the same marker as the stack of earlier sessions. */
export const SESSION_TAPE_LABEL = 'SESSION 14 — 14.1.87';

/** How long the tape runs, in seconds, when there is no recording to measure. */
export const SESSION_TAPE_LENGTH_IN_SECONDS = 47;

/** Every subtitle on the tape, in order. */
export const SESSION_TAPE_SUBTITLES = [
  { start: 0.0, end: 0.8, text: '[a recorder key clunks down]' },
  { start: 0.8, end: 3.4, text: '[slow breathing]' },
  { start: 1.2, end: 7.6, speaker: 'MAN', voice: 'level2/tape_01_man.m4a', text: 'Session fourteen. Subject has been sedated for thirty-six hours. Should be coming round any minute.' },
  { start: 8.0, end: 15.6, speaker: 'MAN', voice: 'level2/tape_02_man.m4a', text: 'For the record: HOLLOW was meant to make the body adapt. Faster healing. Stronger tissue. It did. It hasn\'t stopped.' },
  { start: 16.0, end: 20.0, speaker: 'MAN', voice: 'level2/tape_03_man.m4a', text: 'Visual distortion is increasing. Last week he stopped recognising staff.' },
  { start: 20.2, end: 21.8, speaker: 'WOMAN', voice: 'level2/tape_04_woman.m4a', text: 'He\'ll know me.' },
  { start: 22.0, end: 24.2, speaker: 'MAN', voice: 'level2/tape_05_man.m4a', text: 'He might not. Stay behind the line.' },
  { start: 24.4, end: 26.0, text: '[the breathing quickens]' },
  { start: 26.0, end: 28.0, speaker: 'MAN', voice: 'level2/tape_06_man.m4a', text: 'He\'s waking. Note the time—' },
  { start: 28.0, end: 29.6, text: '[the restraints strain]' },
  { start: 29.6, end: 31.8, speaker: 'WOMAN', voice: 'level2/tape_07_woman.m4a', text: 'It\'s okay. You\'re okay—' },
  { start: 32.0, end: 33.0, text: '[a strap snaps]' },
  { start: 32.8, end: 35.0, speaker: 'MAN', voice: 'level2/tape_08_man.m4a', text: 'Get back. Get back!' },
  { start: 35.0, end: 36.6, speaker: 'WOMAN', voice: 'level2/tape_09_woman.m4a', text: 'Mark! Mark, it\'s me!' },
  { start: 36.6, end: 38.0, text: '[the recorder is knocked to the floor]' },
  { start: 38.2, end: 40.0, text: '[something heavy, moving away]' },
  { start: 40.4, end: 41.8, text: '[glass shatters]' },
  { start: 41.6, end: 44.6, text: '[an alarm]' },
  { start: 43.0, end: 45.4, speaker: 'WOMAN', voice: 'level2/tape_10_woman.m4a', text: 'Mark…' },
  { start: 45.6, end: 47.0, text: '[the recording cuts off]' }
];

/**
 * The sounds the placeholder plays, at seconds into the tape, while there is
 * no recording with a soundtrack of its own. Ignored once the recording exists.
 */
export const SESSION_TAPE_PLACEHOLDER_SOUNDS = [
  { at: 36.6, sound: 'impact' },
  { at: 40.4, sound: 'glass' },
  { at: 41.6, sound: 'alarm' }
];
