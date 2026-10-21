// Level 2's puzzle chain, as hint stages for core/HintSystem.js.
//
// The basement is one long power chain (see docs/LEVEL2_POWER_CHAIN.md), so
// unlike the bedroom there is only ever one thing to do next: the stages below
// are the chain in order, and each is read straight off the level's power
// stage rather than tracked separately.
//
// The words live in src/dialogue/level2_basement.js (every dialog_hint_* line
// in its "hints" section), so they can be edited there like the rest of the
// basement's dialogue.
//
// `progress` is the level's refs.hintProgress snapshot: the power stage, the
// fuse in the slot, whether the monitor is switched on, whether the security
// lockout is cleared, and the code itself.

import { line } from '../dialogue/index.js';

/** Stages of the power chain, as hallwayBasementLevel.js names them. */
const STAGE = {
  DEAD: 'dead',
  LIT: 'lit',
  BLACKOUT: 'blackout',
  RUNNING: 'running',
  ROUTED: 'routed'
};

/** The power stages in the order the chain moves through them. */
const STAGE_ORDER = [STAGE.DEAD, STAGE.LIT, STAGE.BLACKOUT, STAGE.RUNNING, STAGE.ROUTED];

/**
 * Reports whether the power chain has got past a stage.
 *
 * @param {object} progress - the hint progress snapshot.
 * @param {string} stage - one of STAGE.
 * @returns {boolean} true once the chain has moved beyond `stage`.
 */
function isPastStage(progress, stage) {
  return STAGE_ORDER.indexOf(progress.powerStage) > STAGE_ORDER.indexOf(stage);
}

/**
 * Whether the session tape no longer needs guiding to: watched, or the player
 * has got through the security lockout without it.
 *
 * @param {object} progress - the hint progress snapshot.
 * @returns {boolean} true once the tape's stages are over, either way.
 */
function isTapeStagePast(progress) {
  return progress.tapeWatched || progress.securityCleared;
}

/**
 * Level 2's stages, in the order the player is guided through them. Each
 * readHints returns its hints vaguest first.
 */
export const BASEMENT_HINT_STAGES = [
  {
    id: 'fuse',
    isComplete: (progress) => isPastStage(progress, STAGE.DEAD),
    readHints: () => [
      line('dialog_hint_fuse_1'),
      line('dialog_hint_fuse_2'),
      line('dialog_hint_fuse_3')
    ]
  },
  {
    // Walking to the door is what makes someone throw the main. The hint only
    // points at the exit; the blackout is the game's to spring.
    id: 'goToDoor',
    isComplete: (progress) => isPastStage(progress, STAGE.LIT),
    readHints: () => [
      line('dialog_hint_go_to_door_1'),
      line('dialog_hint_go_to_door_2')
    ]
  },
  {
    id: 'generator',
    isComplete: (progress) => isPastStage(progress, STAGE.BLACKOUT),
    readHints: () => [
      line('dialog_hint_generator_1'),
      line('dialog_hint_generator_2'),
      line('dialog_hint_generator_3')
    ]
  },
  {
    id: 'breakers',
    isComplete: (progress) => isPastStage(progress, STAGE.RUNNING),
    readHints: () => [
      line('dialog_hint_breakers_1'),
      line('dialog_hint_breakers_2'),
      line('dialog_hint_breakers_3')
    ]
  },
  // The session tape: found in the recorder on the floor, played in the deck
  // on the CCTV desk. The desk has no power until the panel is routed, so this
  // is the first point the tape can be guided to. It is the level's story, not
  // its lock, so hearing it OR getting past the lockout without it both count
  // as done -- otherwise a player who skipped it could never be hinted the code.
  {
    id: 'findTape',
    isComplete: (progress) => progress.tapePlace !== 'recorder' || isTapeStagePast(progress),
    readHints: () => [
      line('dialog_hint_tape_find_1'),
      line('dialog_hint_tape_find_2')
    ]
  },
  {
    id: 'playTape',
    isComplete: (progress) => isTapeStagePast(progress),
    readHints: () => [
      line('dialog_hint_tape_play_1'),
      line('dialog_hint_tape_play_2')
    ]
  },
  {
    // The code is on camera four, so a player who has not switched the monitor
    // on is told how before being told to count anything.
    id: 'securityCode',
    isComplete: (progress) => progress.securityCleared,
    readHints: (progress) => [
      line('dialog_hint_code_1'),
      line('dialog_hint_code_2'),
      progress.monitorSwitchedOn ? line('dialog_hint_code_3') : line('dialog_hint_code_2'),
      line('dialog_hint_code_4', { code: progress.securityCode })
    ]
  },
  {
    // Opening the door leaves the level, so this stage is never seen complete.
    id: 'exit',
    isComplete: () => false,
    readHints: () => [
      line('dialog_hint_basement_exit_1')
    ]
  }
];
