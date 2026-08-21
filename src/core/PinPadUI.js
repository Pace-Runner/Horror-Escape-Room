// A small on-screen numeric keypad for combination-lock puzzles. Generic
// over the code/length so any lock in the game can reuse it (open() takes
// both) rather than each puzzle rolling its own keypad DOM/logic -- the
// bedroom's lamp-drawer lock is the first caller (see bedroomLevel.js).
export function createPinPadUI({ onClose = () => {} } = {}) {
  const view = document.getElementById('pinpad-view');
  const display = document.getElementById('pinpad-display');
  const grid = document.getElementById('pinpad-grid');
  const clearButton = document.getElementById('pinpad-clear');
  const closeButton = document.getElementById('pinpad-close');
  const digitButtons = Array.from(grid.querySelectorAll('[data-digit]'));

  let open = false;
  let busy = false; // true while the granted/denied flash is playing, so input is ignored
  let length = 4;
  let expectedCode = '';
  let entered = '';
  let onSolvedCallback = null;

  function renderDisplay() {
    display.innerHTML = '';
    for (let i = 0; i < length; i++) {
      const slot = document.createElement('div');
      slot.className = 'pinpad-slot';
      if (i < entered.length) slot.classList.add('filled');
      display.appendChild(slot);
    }
  }

  function checkCode() {
    busy = true;
    if (entered === expectedCode) {
      view.classList.add('granted');
      setTimeout(() => {
        view.classList.remove('granted');
        const cb = onSolvedCallback;
        onSolvedCallback = null;
        busy = false;
        close();
        cb?.();
      }, 500);
    } else {
      view.classList.add('denied');
      setTimeout(() => {
        view.classList.remove('denied');
        entered = '';
        renderDisplay();
        busy = false;
      }, 450);
    }
  }

  function pressDigit(d) {
    if (busy || !open || entered.length >= length) return;
    entered += d;
    renderDisplay();
    if (entered.length === length) checkCode();
  }

  function clearEntry() {
    if (busy) return;
    entered = '';
    renderDisplay();
  }

  digitButtons.forEach((btn) => {
    btn.addEventListener('click', () => pressDigit(btn.dataset.digit));
  });
  clearButton.addEventListener('click', clearEntry);
  closeButton.addEventListener('click', close);

  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape') { close(); return; }
    if (busy) return;
    if (e.code === 'Backspace') { entered = entered.slice(0, -1); renderDisplay(); return; }
    const digitMatch = /^(Digit|Numpad)([0-9])$/.exec(e.code);
    if (digitMatch) pressDigit(digitMatch[2]);
  });

  function open_({ length: len = 4, code, onSolved } = {}) {
    length = len;
    expectedCode = String(code);
    entered = '';
    busy = false;
    onSolvedCallback = onSolved;
    view.classList.remove('granted', 'denied');
    renderDisplay();
    open = true;
    view.classList.remove('hidden');
  }

  function close() {
    open = false;
    view.classList.add('hidden');
    onSolvedCallback = null;
    onClose();
  }

  return {
    open: open_,
    close,
    get isOpen() { return open; }
  };
}
