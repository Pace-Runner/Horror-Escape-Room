/**
 * Full-screen reader for anything with more words than a caption can hold.
 *
 * The caption box is 520 px wide, fades after a few seconds and has
 * `pointer-events: none`. Mark's letter is several hundred words, the tape
 * transcripts are paragraphs, and the personnel files want a heading. None of
 * that fits in a line that vanishes on a timer.
 *
 * Deliberately generic, because it is the reading surface for the whole game --
 * the letter, the notes, the tape transcripts, the found-footage log, the
 * lab files. A level passes text; this decides nothing about the story. Same
 * shape as PinPadUI and PhotoBoardUI: static markup in index.html, a factory
 * returning { open, close, isOpen }, and `onClose: () => player.lock()` so the
 * pointer goes back where it came from.
 *
 * WAS-READ TRACKING. open() takes an `onRead` that fires once the reader has
 * actually reached the bottom -- not when the document is opened, and not when
 * it is closed. A story flag like `letterRead` should mean the player saw the
 * end of it, and for a document that fits on screen without scrolling that is
 * true immediately. Opening and instantly closing a long letter is not reading
 * it, and the ending turns on whether they know.
 */

/** Slack in px for "scrolled to the bottom": sub-pixel layout never lands exactly. */
const BOTTOM_EPSILON = 6;

export function createDocumentUI({ onClose = () => {} } = {}) {
  const view = document.getElementById('document-view');
  const panel = document.getElementById('document-panel');
  const titleEl = document.getElementById('document-title');
  const bodyEl = document.getElementById('document-body');
  const hintEl = document.getElementById('document-hint');
  const closeButton = document.getElementById('document-close');
  const imageEl = document.getElementById('document-image');
  // A picture changes the panel's height once it arrives, so the read check
  // runs again then.
  imageEl.addEventListener('load', () => requestAnimationFrame(checkRead));

  let open = false;
  let reachedEnd = false;
  let onReadCallback = null;
  /**
   * When the reader last opened, on the same clock as Event.timeStamp.
   *
   * E and right-click both OPEN a document (through Interaction) and CLOSE it
   * (here). Interaction's keydown listener runs first, so the very press that
   * opened the reader used to reach this file's listener next and shut it
   * again in the same instant: the note never appeared, and the pointer was
   * released and re-requested at once, which the game took as a pause -- the
   * sound cut out until the next click. Only a press that STARTS after the
   * reader opened may close it.
   */
  let openedAtMilliseconds = 0;
  /** A right button went down on the reader after it opened, so its contextmenu may close it. */
  let isRightPressSinceOpen = false;

  /** True for an event that began before the reader opened -- the one that opened it. */
  function isFromOpeningPress(event) {
    return event.timeStamp <= openedAtMilliseconds;
  }

  function atBottom() {
    return panel.scrollTop + panel.clientHeight >= panel.scrollHeight - BOTTOM_EPSILON;
  }

  /** Fires onRead at most once per open(), and updates the scroll hint. */
  function checkRead() {
    const bottom = atBottom();
    // The hint only earns its space when there is more to see.
    hintEl.classList.toggle('visible', !bottom);
    if (bottom && !reachedEnd) {
      reachedEnd = true;
      const cb = onReadCallback;
      onReadCallback = null;
      cb?.();
    }
  }

  panel.addEventListener('scroll', checkRead);
  closeButton.addEventListener('click', () => close());
  // Right-click puts it down, like E does -- instead of the browser's menu.
  // Only a right-click pressed on the reader itself: the contextmenu that
  // follows the right-click which opened it arrives here too, after the open.
  view.addEventListener('mousedown', (e) => {
    if (e.button === 2 && !isFromOpeningPress(e)) isRightPressSinceOpen = true;
  });
  view.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!isRightPressSinceOpen) return;
    close();
  });

  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape' || e.code === 'KeyE') {
      // Held E auto-repeats; neither a repeat nor the opening press closes it.
      if (e.repeat || isFromOpeningPress(e)) return;
      close();
      return;
    }
    // Reading keys, so a document can be read without touching the mouse.
    const step = panel.clientHeight * 0.8;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') panel.scrollTop += 60;
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') panel.scrollTop -= 60;
    else if (e.code === 'Space' || e.code === 'PageDown') panel.scrollTop += step;
    else if (e.code === 'PageUp') panel.scrollTop -= step;
    else return;
    e.preventDefault();
  });

  /**
   * @param title    heading, or '' for an untitled scrap
   * @param body     one string, or an array of paragraphs
   * @param variant  'letter' (handwritten) | 'file' (typed carbon copy) |
   *                 'note' (a scrap) | 'exhibit' (a picture or framed piece,
   *                 shown large on a dark panel). Look only -- no behaviour
   *                 hangs off it.
   * @param image    optional picture URL, shown above the title
   * @param onRead   called once, when the bottom of the document is reached
   */
  function open_({ title = '', body = '', variant = 'note', image = null, onRead } = {}) {
    const paragraphs = Array.isArray(body) ? body : String(body).split(/\n{2,}/);

    imageEl.hidden = !image;
    if (image) imageEl.src = image;
    else imageEl.removeAttribute('src');
    imageEl.alt = title;

    titleEl.textContent = title;
    titleEl.classList.toggle('visible', Boolean(title));
    bodyEl.innerHTML = '';
    for (const text of paragraphs) {
      const p = document.createElement('p');
      // textContent, not innerHTML: story text is authored as plain prose and
      // must never be able to inject markup into the page.
      p.textContent = String(text);
      bodyEl.appendChild(p);
    }

    panel.className = `document-${variant}`;
    panel.scrollTop = 0;
    reachedEnd = false;
    onReadCallback = onRead;
    openedAtMilliseconds = performance.now();
    isRightPressSinceOpen = false;
    open = true;
    view.classList.remove('hidden');
    // After layout, so scrollHeight is real: a short document has no scrollbar
    // and counts as read the moment it is on screen.
    requestAnimationFrame(checkRead);
  }

  function close() {
    if (!open) return;
    open = false;
    view.classList.add('hidden');
    onReadCallback = null;
    onClose();
  }

  return {
    open: open_,
    close,
    get isOpen() { return open; }
  };
}
