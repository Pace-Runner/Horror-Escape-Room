/**
 * Difficulty, and the clock it sets.
 *
 * The three difficulties differ only in time: Easy has no limit, Medium and
 * Hard give EACH ROOM its own countdown. Walking into the next room starts its
 * clock again from full; running out in any room ends the run (main.js's
 * playOutOfTime()). The corridors between rooms are not timed -- the clock is
 * hidden there and picks up fresh in the next room.
 *
 * The clock only runs while the player is actually playing. main.js decides
 * that and simply stops calling update(): paused, reading a newspaper, in a
 * fade between rooms or a cutscene, the time is not theirs to lose.
 */

/** Change the minutes here to retune a difficulty. `secondsPerRoom: null` is no limit. */
export const DIFFICULTIES = {
  easy: { label: 'Easy', detail: 'No time limit', secondsPerRoom: null },
  medium: { label: 'Medium', detail: '15 minutes per room', secondsPerRoom: 15 * 60 },
  hard: { label: 'Hard', detail: '8 minutes per room', secondsPerRoom: 8 * 60 }
};

export const DEFAULT_DIFFICULTY = 'easy';

/** The rooms with a clock, by level key. The backrooms corridor is not one. */
const TIMED_ROOMS = new Set(['bedroom', 'hallwayBasement', 'study']);

/** Under this many seconds the clock turns red and starts to pulse. */
const WARNING_SECONDS = 60;

/**
 * Formats seconds as m:ss, rounding up so 0:00 only shows once time is gone.
 *
 * @param {number} seconds
 * @returns {string}
 */
function formatClock(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/**
 * The per-room countdown for one run, and the HUD clock that shows it.
 *
 * @param {object} options
 * @param {HTMLElement} options.el      the HUD clock (#run-timer)
 * @param {() => void} options.onExpire called once, the frame time runs out
 */
export function createRunTimer({ el, onExpire }) {
  const valueEl = el.querySelector('.run-timer-value');
  /** Seconds each room gets on this run's difficulty, or null for no limit. */
  let secondsPerRoom = null;
  /** Whether the room the player is in has a clock running. */
  let isCounting = false;
  let remainingSeconds = 0;
  let expired = false;
  let shownText = '';

  function render() {
    const text = formatClock(remainingSeconds);
    // Only touch the DOM when the visible number changes: once a second.
    if (text !== shownText) {
      shownText = text;
      valueEl.textContent = text;
    }
    el.classList.toggle('is-warning', remainingSeconds <= WARNING_SECONDS);
  }

  return {
    get remainingSeconds() { return remainingSeconds; },

    /**
     * Sets the difficulty for a new run. The clock itself starts when a room
     * is entered (enterRoom), so call this before activating the first room.
     *
     * @param {string} difficultyId - a key of DIFFICULTIES
     */
    configure(difficultyId) {
      const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
      secondsPerRoom = difficulty.secondsPerRoom;
      expired = false;
    },

    /**
     * A room was just entered: a timed room gets the full time again, anywhere
     * else hides the clock. main.js's activateLevel() calls this every time.
     *
     * @param {string} levelKey
     */
    enterRoom(levelKey) {
      isCounting = secondsPerRoom !== null && TIMED_ROOMS.has(levelKey);
      el.classList.toggle('visible', isCounting);
      if (!isCounting) return;
      remainingSeconds = secondsPerRoom;
      expired = false;
      shownText = '';
      render();
    },

    /** Counts down. Call once per frame, only while the player is playing. */
    update(dt) {
      if (!isCounting || expired) return;
      remainingSeconds = Math.max(0, remainingSeconds - dt);
      render();
      if (remainingSeconds === 0) {
        expired = true;
        onExpire();
      }
    }
  };
}
