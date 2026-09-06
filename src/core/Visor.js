import { gameState } from './GameState.js';

/**
 * The calibration visor: one switch, and everything that has to answer to it.
 *
 * WHAT THE VISOR IS. Mark's letter: "They don't reveal another world. They
 * correct the one I'm seeing." So this is not a filter that turns on. It is the
 * player's sight being fixed, and that means several unrelated systems have to
 * change together and stay in step:
 *
 *   the image      world/VisorPass.js -- the blue correction, shadows lifting
 *   the creature   systems/Creature.js -- long arms become a woman's arms
 *   the room       whatever the active level hides from a broken eye
 *   the state      gameState.visorWorn, which the third lock and the ending read
 *
 * They are wired here rather than at each call site because the failure mode of
 * getting it wrong is the worst kind: the screen goes blue but the creature
 * stays a monster, or the portrait gains its fourth figure while the shadow on
 * the wall does not. The twist only lands if EVERYTHING corrects at once.
 *
 * visorEverWorn is separate from visorWorn on purpose. Once the player has seen
 * what they are, taking the visor off does not unsee it -- the mirror, the
 * letter and the ending all read "does this player know", which has to survive
 * them taking it off again.
 */
export function createVisor({ postFX = null, creature = null, getLevel = () => null } = {}) {
  /** Fired whenever the state changes, so a caller can play a beat. */
  let onChange = null;

  function apply() {
    const on = gameState.visorWorn;
    postFX?.setVisor(on);
    // 1 = corrected = a person. The creature eases between the two along with
    // the pass, so a half-faded visor shows a half-corrected figure rather than
    // a monster under a blue filter.
    creature?.setCorrection(on ? 1 : 0);
    getLevel()?.refs?.setCorrectedSight?.(on);
  }

  return {
    set onChange(fn) {
      onChange = fn;
    },

    get isWorn() {
      return gameState.visorWorn;
    },

    get isHeld() {
      return gameState.hasVisor;
    },

    /** Picked up. Not worn -- you can carry it without putting it on. */
    take() {
      if (gameState.hasVisor) return false;
      gameState.hasVisor = true;
      return true;
    },

    /**
     * @returns 'on' | 'off' | 'none' -- 'none' when there is no visor to wear,
     *   so the caller can say something useful rather than silently doing
     *   nothing when the key is pressed.
     */
    toggle() {
      if (!gameState.hasVisor) return 'none';
      gameState.visorWorn = !gameState.visorWorn;
      if (gameState.visorWorn) gameState.visorEverWorn = true;
      apply();
      onChange?.(gameState.visorWorn);
      return gameState.visorWorn ? 'on' : 'off';
    },

    /** Force a state, for scripted beats. */
    set(on) {
      if (!gameState.hasVisor) return false;
      if (gameState.visorWorn === on) return false;
      return this.toggle() === (on ? 'on' : 'off');
    },

    /**
     * Re-push the current state at everything. Called after a level change,
     * because activateLevel resets the post-processing dials and the newly
     * activated level has never been told what the player can see.
     */
    refresh() {
      apply();
    },

    /**
     * Back to nothing worn and nothing held. resetState() clears the flags; this
     * pushes that through to the pass, the creature and the room, which do not
     * read GameState themselves.
     */
    reset() {
      apply();
    }
  };
}
