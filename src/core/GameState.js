/**
 * The one place run-scoped story state lives.
 *
 * Everything else in this project keeps state either in a per-level closure
 * (bedroomLevel's `puzzleState`, hallwayBasement's `powerRestored`) or as a
 * module-level `let` in main.js. Both are right for what they hold: a level's
 * own puzzle flags belong to that level, and the torch belongs to the frame
 * loop. Neither works for the storyline, because the story is the part that
 * CROSSES levels -- whether the visor has ever been worn, which tapes have
 * played, which ending was taken.
 *
 * Putting those in a level closure would be actively wrong: SceneManager wipes
 * a level's state wholesale on reset, and the study would end up reaching into
 * the bedroom's closure to ask what the player already knows.
 *
 * THE RULE THAT MATTERS: every field here must be restored by resetState(), and
 * resetGame() must call it. main.js already carries a comment about being bitten
 * by exactly this -- a restart used to leave Level 2's breaker flipped because
 * only the bedroom was reset. One call is much harder to forget than N.
 */

/** Fresh values for a new run. Also the schema -- add fields here, not below. */
function initialState() {
  return {
    // --- the visor -------------------------------------------------------
    /** Worn right now. Drives the render pass and what the creature looks like. */
    visorWorn: false,
    /**
     * Worn at least once this run. The mirror, the letter and the shadow all
     * read differently once the player knows -- and "knows" has to survive
     * taking the visor off again, which `visorWorn` alone cannot express.
     */
    visorEverWorn: false,
    /** Picked up. Separate from worn: you can carry it before you put it on. */
    hasVisor: false,

    // --- Level 3 progress ------------------------------------------------
    /** Ids of the front door's locks that are open. Size 3 opens the door. */
    locksOpen: new Set(),
    /** Ids of cassette tapes already played, so a replay does not re-trigger. */
    tapesPlayed: new Set(),
    /** True once the letter has been read in full. */
    letterRead: false,

    // --- the creature ----------------------------------------------------
    /**
     * How many times the player has been intercepted. Not a life counter --
     * being caught costs position and time, never the run -- but the creature
     * reads it to escalate, and the ending can acknowledge it.
     */
    caughtCount: 0,

    // --- outcome ---------------------------------------------------------
    /** null until the player commits: 'released' | 'contained'. */
    endingChosen: null
  };
}

/**
 * The live state. A single mutable object rather than a class or a store,
 * matching how the rest of this project shares things (see AudioEngine's
 * exported BREATH_BASE_LEVEL, which exists so two files cannot drift).
 *
 * Mutate its fields; never reassign the binding, or every module holding a
 * reference would keep pointing at the old object.
 */
export const gameState = initialState();

/**
 * Put every field back to its new-run value, in place.
 *
 * In place, not by reassignment, precisely because callers hold the reference.
 * Sets are emptied rather than replaced for the same reason.
 */
export function resetState() {
  const fresh = initialState();
  for (const key of Object.keys(fresh)) {
    const value = fresh[key];
    if (value instanceof Set) {
      gameState[key].clear();
    } else {
      gameState[key] = value;
    }
  }
}
