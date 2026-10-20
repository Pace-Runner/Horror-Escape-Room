/**
 * The session tape's subtitles, along the bottom of the screen while the deck
 * on the lab's desk plays it.
 *
 * The tape plays in the room, not in front of the player: they stay free to
 * look round, walk off, or stand at the deck and listen. So this takes nothing
 * from them -- no pointer, no keys -- and only shows what is being said, with
 * its speaker, or what is heard, in italics. It sits under the caption box so
 * the player's own thoughts can still come and go while it plays.
 *
 * WHY THE HOST CALLS update(). The subtitles follow the TAPE's clock, not wall
 * time, so they stay on the words whether the source is the recording (its
 * own currentTime) or the stand-in (advanced by the level's frame loop).
 */

/**
 * @param {object} options
 * @param {Array<{start: number, end: number, speaker?: string, text: string}>} options.subtitles
 *   every subtitle on the tape, in seconds.
 */
export function createTapeSubtitles({ subtitles }) {
  const box = document.getElementById('tape-subtitle');
  let source = null;
  /** The subtitle lines on screen, joined, so the DOM is only touched when they change. */
  let shownKey = '';

  /** Every subtitle showing at `timeInSeconds`; sounds and speech can overlap. */
  function readActiveSubtitles(timeInSeconds) {
    return subtitles.filter((cue) => timeInSeconds >= cue.start && timeInSeconds < cue.end);
  }

  /** Puts `cues` on screen: a speaker's words with their name, a sound in italics. */
  function render(cues) {
    const key = cues.map((cue) => cue.text).join('|');
    if (key === shownKey) return;
    shownKey = key;
    // textContent throughout: the script is plain prose and must never be
    // able to inject markup into the page.
    box.replaceChildren(...cues.map((cue) => {
      const row = document.createElement('div');
      if (cue.speaker) {
        const name = document.createElement('span');
        name.className = 'tape-speaker';
        name.textContent = cue.speaker;
        row.append(name, document.createTextNode(cue.text));
      } else {
        row.className = 'tape-sound';
        row.textContent = cue.text;
      }
      return row;
    }));
    box.classList.toggle('hidden', cues.length === 0);
  }

  return {
    /**
     * Follows a tape that has started playing.
     *
     * @param {{currentTimeInSeconds: number}} tapeSource - what the deck is playing.
     */
    start(tapeSource) {
      source = tapeSource;
      shownKey = null;
      render([]);
    },

    /** Takes the subtitles down: the tape has stopped or run out. */
    stop() {
      source = null;
      render([]);
    },

    /**
     * Keeps the subtitles on the tape's clock. Once a frame.
     *
     * @param {(cue: object) => boolean} [isShown] - which of the subtitles due
     *   now to show: the host follows the captions setting, which can change
     *   while the tape plays, and shows a line nobody has voiced yet either way.
     */
    update(isShown = () => true) {
      if (source) render(readActiveSubtitles(source.currentTimeInSeconds).filter(isShown));
    },

    get isShowing() { return source !== null; }
  };
}
