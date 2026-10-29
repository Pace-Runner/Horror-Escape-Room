/**
 * Everything worth discovering, listed in the main menu's Chapters panel.
 * Where each one is earned is in docs/ACHIEVEMENTS.md. `hidden` ones read
 * "???" until earned, so the list never spoils the story. `counter` and
 * `target` make a progress bar out of a lifetime count in core/Progress.js.
 */
export const ACHIEVEMENT_CATEGORIES = ['Chapters', 'Backrooms', 'Puzzles', 'Cutscenes', 'Caught', 'Endings'];

/** The levels the chapter select can start at, in story order. */
export const CHAPTERS = [
  { key: 'bedroom', title: 'I. The Bedroom', still: 'bedroom' },
  { key: 'hallwayBasement', title: 'II. The Basement', still: 'basement' },
  { key: 'study', title: 'III. The Study', still: 'study' }
];

export const ACHIEVEMENTS = [
  { id: 'level_bedroom', category: 'Chapters', title: 'Restrained', description: 'Wake up in the bedroom.' },
  { id: 'level_hallwayBasement', category: 'Chapters', title: 'Downstairs', description: 'Reach the basement.' },
  { id: 'level_study', category: 'Chapters', title: 'The Archive', description: 'Reach the study.' },

  { id: 'room_BL', category: 'Backrooms', title: 'Nursery', description: 'Find the baby\'s room in the backrooms.', hidden: true },
  { id: 'room_L', category: 'Backrooms', title: 'Age Five', description: 'Find the little girl\'s room.', hidden: true },
  { id: 'room_TR', category: 'Backrooms', title: 'Age Eighteen', description: 'Find the teenager\'s room.', hidden: true },
  { id: 'room_R', category: 'Backrooms', title: 'Age Thirty', description: 'Find the last room anybody sees.', hidden: true },
  { id: 'room_C', category: 'Backrooms', title: 'Door Two', description: 'Find the room with the second door.', hidden: true },
  { id: 'rooms_all', category: 'Backrooms', title: 'Her Whole Life', description: 'Find every room in the backrooms.' },

  { id: 'power_first_try', category: 'Puzzles', title: 'Right First Time', description: 'Seat the correct fuse without trying a wrong one.' },
  { id: 'clock', category: 'Puzzles', title: 'Quarter Past Eleven', description: 'Set the grandfather clock.' },
  { id: 'crest', category: 'Puzzles', title: 'Three Lights', description: 'Solve the shadow crest.' },
  { id: 'letter', category: 'Puzzles', title: 'Dear Mark', description: 'Read Annabelle\'s letter.', hidden: true },
  { id: 'keypad', category: 'Puzzles', title: 'Count the Panels', description: 'Open a keypad in the study.' },

  { id: 'cut_wakeUp', category: 'Cutscenes', title: 'Wake Up', description: 'Open your eyes.' },
  { id: 'cut_comeRound', category: 'Cutscenes', title: 'Come Round', description: 'Wake up on the carpet.', hidden: true },
  { id: 'cut_stairsBehind', category: 'Cutscenes', title: 'Something Behind', description: 'Fall down the stairs.', hidden: true },
  { id: 'cut_studyMirrorReveal', category: 'Cutscenes', title: 'Reflection', description: 'See what the mirror shows.', hidden: true },
  { id: 'cut_studyEnding_released', category: 'Cutscenes', title: 'Let Out', description: 'Watch the release.', hidden: true },
  { id: 'cut_studyEnding_contained', category: 'Cutscenes', title: 'Sealed In', description: 'Watch the reseal.', hidden: true },

  { id: 'caught_backrooms_1', category: 'Caught', title: 'Got You', description: 'Get caught in the backrooms.', counter: 'backroomsCaught', target: 1 },
  { id: 'caught_backrooms_5', category: 'Caught', title: 'Slow Learner', description: 'Get caught in the backrooms 5 times.', counter: 'backroomsCaught', target: 5 },
  { id: 'caught_backrooms_20', category: 'Caught', title: 'Old Friends', description: 'Get caught in the backrooms 20 times.', counter: 'backroomsCaught', target: 20 },
  { id: 'caught_study_1', category: 'Caught', title: 'Sedated', description: 'Get found in the dark study.', counter: 'studyCaught', target: 1 },

  { id: 'ending_kept', category: 'Endings', title: 'Kept', description: 'Be dragged home.', hidden: true },
  { id: 'ending_released', category: 'Endings', title: 'Released', description: 'Let it out.', hidden: true },
  { id: 'ending_contained', category: 'Endings', title: 'Contained', description: 'Seal it back in.', hidden: true },
  { id: 'ending_timeout', category: 'Endings', title: 'Out of Time', description: 'Let the clock run out.', hidden: true }
];

export const BACKROOMS_ROOM_IDS = ['room_BL', 'room_L', 'room_TR', 'room_R', 'room_C'];
