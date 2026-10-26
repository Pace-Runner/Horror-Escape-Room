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

export function renderCaptionText(el, line) {
  const prefix = !line.markThought && line.text.match(/^(ANNABELLE|MARK|SCIENTIST|GIRL|MAN|WOMAN|DOCTOR|RESEARCHER):\s*/i);
  const speaker = line.markThought ? null : line.speaker || prefix?.[1];
  el.classList.toggle('game-caption--thought', !!line.markThought);
  el.classList.toggle('game-caption--dialogue', !!speaker);
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
