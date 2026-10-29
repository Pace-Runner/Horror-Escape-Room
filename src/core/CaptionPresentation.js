/** Shared rendering only. Caption/audio clocks and priority stay with their owners. */
export function setupCaptionSurface(el, { recorded = false } = {}) {
  el.classList.add('game-caption');
  if (recorded) el.classList.add('game-caption--recorded');
  if (el.ownerDocument && typeof ResizeObserver !== 'undefined') {
    const variable = recorded ? '--game-tape-caption-height' : '--game-caption-height';
    const observer = new ResizeObserver(([entry]) => {
      el.ownerDocument.documentElement.style.setProperty(variable, `${entry.target.getBoundingClientRect().height}px`);
    });
    observer.observe(el);
  }
}

/** Speaker names kept off the caption while their predicate says so (setSpeakerNameHidden). */
const hiddenSpeakers = new Map();

/**
 * Keeps `name`'s label off every caption while `isHidden()` is true. main.js
 * hides MARK until Annabelle's letter tells the player who he is.
 */
export function setSpeakerNameHidden(name, isHidden) {
  if (isHidden) hiddenSpeakers.set(name.toUpperCase(), isHidden);
  else hiddenSpeakers.delete(name.toUpperCase());
}

export function renderCaptionText(el, line) {
  const prefix = !line.markThought && line.text.match(/^(ANNABELLE|MARK|SCIENTIST|GIRL|MAN|WOMAN|DOCTOR|RESEARCHER):\s*/i);
  const named = line.speaker || (line.markThought ? 'MARK' : prefix?.[1]);
  // Still styled as his line; only the name is withheld.
  const speaker = named && hiddenSpeakers.get(named.toUpperCase())?.() ? null : named;
  el.classList.toggle('game-caption--hint', !!line.hint);
  el.classList.toggle('game-caption--thought', !!line.markThought);
  el.classList.toggle('game-caption--dialogue', !!named);
  // Keep headless consumers and the original source text/timing untouched.
  if (!el.ownerDocument) { el.textContent = line.text; return; }
  const words = el.ownerDocument.createElement('span');
  words.className = 'game-caption__text';
  words.textContent = prefix ? line.text.slice(prefix[0].length) : line.text;
  if (speaker) {
    const name = el.ownerDocument.createElement('span');
    name.className = 'game-caption__speaker';
    name.textContent = speaker;
    el.replaceChildren(name, words);
  } else el.replaceChildren(words);
}
