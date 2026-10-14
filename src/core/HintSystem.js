// Progressive, on-demand hints for a level's puzzle chain.
//
// The level describes its puzzle as an ordered list of STAGES. The hint system
// only ever talks about the first stage that is not done yet, so a hint never
// spoils a later puzzle and never nags about one already solved.
//
// Each stage has several hints, vague first, explicit last. Pressing the hint
// key again on the same stage gives the next, more direct one; once the stage
// is solved the next stage starts again from its vaguest hint.
//
// The system also notices a player who has been stuck for a while and offers
// the key once per stage, rather than pushing a hint at them unasked -- working
// a puzzle out is the point, and the offer leaves that choice with the player.

/** How long a stage can go unsolved before the player is offered a hint. */
export const STUCK_NUDGE_DELAY_SECONDS = 90;

/**
 * Creates a hint system for one level.
 *
 * @param {object} options
 * @param {Array<{ id: string, isComplete: (progress: object) => boolean,
 *   readHints: (progress: object) => Array<Array<object>> }>} options.stages -
 *   the level's puzzle chain in the order the player meets it. readHints
 *   returns the stage's hints, vaguest first, each already in caption-line form
 *   (what dialogue/index.js line() returns).
 * @param {() => object} options.readProgress - returns a fresh snapshot of the
 *   level's puzzle progress; handed to each stage's isComplete and readHints.
 * @param {(lines: Array<object>) => boolean} options.showCaption - shows a
 *   caption; returns false when a story sequence is playing and the caption
 *   was not shown.
 * @param {() => Array<object>} options.readNudgeLines - returns the "press H"
 *   offer shown once a stage has been stuck for STUCK_NUDGE_DELAY_SECONDS. A
 *   function, not the lines, so an edited dialogue file is picked up live.
 * @param {() => Array<object>} options.readAllSolvedLines - returns what is shown
 *   if a hint is asked for after every stage is solved.
 * @returns {{ showNextHint: () => void, update: (dt: number) => void,
 *   reset: () => void, readCurrentStageId: () => string | null }}
 */
export function createHintSystem({ stages, readProgress, showCaption, readNudgeLines, readAllSolvedLines }) {
  let currentStageId = null;
  let hintsShownForStage = 0;
  let stuckSeconds = 0;
  let nudgeShownForStage = false;

  /**
   * Finds the first unsolved stage.
   *
   * @param {object} progress - a snapshot from readProgress().
   * @returns {object | null} the stage, or null when everything is solved.
   */
  function findCurrentStage(progress) {
    return stages.find((stage) => !stage.isComplete(progress)) ?? null;
  }

  /**
   * Moves the per-stage counters on when the player has solved a stage, so the
   * next stage starts again from its vaguest hint and its own stuck timer.
   *
   * @param {object | null} stage - the current unsolved stage.
   */
  function updateCurrentStage(stage) {
    const stageId = stage?.id ?? null;
    if (stageId === currentStageId) return;
    currentStageId = stageId;
    hintsShownForStage = 0;
    stuckSeconds = 0;
    nudgeShownForStage = false;
  }

  /**
   * Shows the next hint for the stage the player is on. Repeated presses on the
   * same stage step towards the most explicit hint and then repeat it. A hint
   * that could not be shown (a story caption was playing) is not counted, so
   * the player never skips past one they did not get to read.
   */
  function showNextHint() {
    const progress = readProgress();
    const stage = findCurrentStage(progress);
    updateCurrentStage(stage);
    if (!stage) {
      showCaption(readAllSolvedLines());
      return;
    }
    const hints = stage.readHints(progress);
    const hintIndex = Math.min(hintsShownForStage, hints.length - 1);
    if (showCaption(hints[hintIndex])) {
      hintsShownForStage++;
      // Asking for a hint answers the nudge; don't offer one on top of it.
      nudgeShownForStage = true;
    }
  }

  /**
   * Advances the stuck timer and offers a hint once per stage when it runs out.
   * Call once per frame while the level is being played.
   *
   * @param {number} dt - seconds since the last frame.
   */
  function update(dt) {
    updateCurrentStage(findCurrentStage(readProgress()));
    if (currentStageId === null || nudgeShownForStage) return;
    stuckSeconds += dt;
    if (stuckSeconds < STUCK_NUDGE_DELAY_SECONDS) return;
    // Retried next frame if a story caption is on screen right now.
    if (showCaption(readNudgeLines())) nudgeShownForStage = true;
  }

  /** Forgets every counter, for a restart. */
  function reset() {
    currentStageId = null;
    hintsShownForStage = 0;
    stuckSeconds = 0;
    nudgeShownForStage = false;
  }

  /**
   * @returns {string | null} the id of the first unsolved stage as last seen,
   *   or null when none is unsolved. For tests and debugging.
   */
  function readCurrentStageId() {
    return currentStageId;
  }

  return { showNextHint, update, reset, readCurrentStageId };
}
