/**
 * Keeps the browser's own shortcuts from ending the game.
 *
 * THE BUG. Crouch is Ctrl, and walking forward is W, so crouch-walking is
 * Ctrl+W -- "close tab". Ctrl+A/S/D and Ctrl+R/T/N/Q are no better. A page
 * cannot stop most of these with preventDefault(): Ctrl+W, Ctrl+T, Ctrl+N and
 * Ctrl+Q are reserved, and the browser acts on them before the page ever sees
 * the event. So listening harder was never going to fix it.
 *
 * THE FIX, in three layers, strongest first:
 *
 *   1. Keyboard Lock (Chrome and Edge). In fullscreen, navigator.keyboard.lock()
 *      hands the listed keys -- WITH their Ctrl/Alt/Meta combinations -- to the
 *      page instead of the browser. This is the only thing that actually stops
 *      Ctrl+W, and it only works in fullscreen, which is why entering the game
 *      now goes fullscreen.
 *   2. preventDefault on every Ctrl/Meta combination while the game has the
 *      pointer (see PointerLockPlayer), for the shortcuts a page IS allowed to
 *      cancel -- save page, bookmark, select all, find, print.
 *   3. A "Leave site?" prompt while the game has the pointer, for the browsers
 *      with no Keyboard Lock (Firefox, Safari) and for anyone who has dropped
 *      out of fullscreen. The tab cannot be kept open silently there, but it
 *      can be kept from closing without asking.
 *
 * ESCAPE IS DELIBERATELY NOT LOCKED. Locking it would make the browser require
 * a press-and-hold to leave fullscreen and, worse, would stop a single Esc from
 * releasing the pointer -- which is how the pause menu opens. Every other key
 * the game or the browser might care about is listed.
 */

const LOCKED_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
  ...'0123456789'.split('').map((d) => `Digit${d}`),
  'Tab', 'Space', 'Enter', 'Backspace',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'F1', 'F3', 'F5', 'F6', 'F7'
];

/**
 * Fullscreen, then Keyboard Lock. Call it from inside a click or key handler.
 *
 * Safe to call repeatedly, and every failure is swallowed: a browser that will
 * not go fullscreen, or has no Keyboard Lock, still gets layers 2 and 3, and
 * the game is perfectly playable windowed. Never throws, never rejects.
 */
export function enterImmersive() {
  const doc = document;
  const lockKeys = () => {
    try {
      const p = navigator.keyboard?.lock?.(LOCKED_KEYS);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // No Keyboard Lock here; the other two layers still apply.
    }
  };
  if (doc.fullscreenElement) {
    // Already fullscreen (resuming from pause). The lock is released whenever
    // fullscreen ends, so re-asking is harmless and sometimes necessary.
    lockKeys();
    return;
  }
  try {
    const p = doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    if (p && typeof p.then === 'function') p.then(lockKeys, () => {});
  } catch {
    // Fullscreen refused (iframe without permission, a preview pane...).
  }
}

/**
 * Layer 3. `isActive` is asked at the moment the tab tries to close.
 *
 * Gated on the game actually HAVING the pointer rather than on "a run is in
 * progress", and the difference matters during development: Vite reloads the
 * page on every code save, and a guard that fired then would put a "Leave
 * site?" dialog in front of every edit. Saving from the editor means the game
 * has already lost focus and the pointer, so the guard is off by then.
 */
export function installUnloadGuard(isActive) {
  window.addEventListener('beforeunload', (e) => {
    if (!isActive()) return;
    e.preventDefault();
    // Chrome still wants returnValue set before it will show the prompt.
    e.returnValue = '';
  });
}
