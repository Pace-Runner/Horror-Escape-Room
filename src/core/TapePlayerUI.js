/**
 * The tape on the monitor, brought up to fill most of the screen.
 *
 * The CRT on the lab's desk is a 36 cm picture seen from a metre away: enough
 * to read a camera feed, not enough to watch a recording on. So when the
 * session tape plays, its picture comes up in front of the player -- seventy
 * per cent of the screen, with the dark lab still showing round it -- dressed
 * as the monitor shows it: green-grey phosphor, scanlines, the curve of the
 * tube's glass. The room behind it keeps running.
 *
 * Same shape as DocumentUI and PinPadUI: static markup in index.html, a
 * factory returning { open, close, isOpen }, and an `onClose` the host uses to
 * take the pointer back. It knows nothing about decks, power or the story: it
 * shows a source's picture, the subtitles for wherever that source has got to,
 * and, once it has run out, a clearer prompt to step back.
 *
 * WHY THE HOST CALLS update(). The subtitles follow the TAPE's clock, not wall
 * time, so they stay on the words whether the source is a video (its own
 * currentTime) or the painted placeholder (advanced by the level's frame loop).
 */

/**
 * @param {object} options
 * @param {Array<{start: number, end: number, speaker?: string, text: string}>} options.subtitles
 *   every subtitle on the tape, in seconds.
 * @param {(source: {hasRecording: boolean}) => boolean} [options.shouldShowSubtitles]
 *   asked each time the tape comes up: whether to show them. The host says yes
 *   when captions are on, and always for the silent placeholder.
 * @param {() => void} [options.onClose] called once the tape has been put down.
 */
export function createTapePlayerUI({ subtitles, shouldShowSubtitles = () => true, onClose = () => {} }) {
  const view = document.getElementById('tape-view');
  const picture = document.getElementById('tape-picture');
  const subtitleEl = document.getElementById('tape-subtitle');
  const hintEl = document.getElementById('tape-hint');
  const closeButton = document.getElementById('tape-close');

  let open = false;
  let source = null;
  let subtitlesOn = true;
  /** The subtitle lines on screen, joined, so the DOM is only touched when they change. */
  let shownKey = '';

  closeButton.addEventListener('click', () => close());
  view.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    close();
  });
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape' || e.code === 'KeyE') close();
  });

  /** Every subtitle showing at `timeInSeconds`; sounds and speech can overlap. */
  function readActiveSubtitles(timeInSeconds) {
    return subtitles.filter((cue) => timeInSeconds >= cue.start && timeInSeconds < cue.end);
  }

  /** Puts `cues` on screen: a speaker's words with their name, a sound in italics. */
  function renderSubtitles(cues) {
    const key = cues.map((cue) => cue.text).join('|');
    if (key === shownKey) return;
    shownKey = key;
    subtitleEl.replaceChildren(...cues.map((cue) => {
      const row = document.createElement('div');
      // textContent throughout: the script is plain prose and must never be
      // able to inject markup into the page.
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
  }

  /**
   * Brings a tape's picture up.
   *
   * @param {object} options
   * @param {{element: HTMLElement, currentTimeInSeconds: number, hasRecording: boolean}} options.source
   *   what the deck is playing -- see world/SessionTapeSource.js.
   */
  function openTape({ source: tapeSource }) {
    source = tapeSource;
    if (source.element.parentElement !== picture) picture.replaceChildren(source.element);
    subtitlesOn = shouldShowSubtitles(source);
    shownKey = null;
    renderSubtitles([]);
    view.classList.remove('ended');
    hintEl.textContent = 'E to step back';
    open = true;
    view.classList.remove('hidden');
  }

  /** Keeps the subtitles on the tape's clock. Once a frame, while open. */
  function update() {
    if (!open || !source) return;
    renderSubtitles(subtitlesOn ? readActiveSubtitles(source.currentTimeInSeconds) : []);
  }

  /** The tape has run out: the prompt to step back stops being a whisper. */
  function markEnded() {
    if (!open) return;
    view.classList.add('ended');
  }

  function close() {
    if (!open) return;
    open = false;
    view.classList.add('hidden');
    view.classList.remove('ended');
    source = null;
    onClose();
  }

  return {
    open: openTape,
    close,
    update,
    markEnded,
    get isOpen() { return open; }
  };
}
