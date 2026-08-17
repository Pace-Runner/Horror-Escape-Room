// A close-up DOM overlay for the bedroom's photo puzzle: the three found
// photos start jumbled in a tray and the player drags them into the three
// slots above. Deliberately silent about what the "right" arrangement is --
// each photo's date is baked into its own image (see stampPhotoDate in
// bedroomLevel.js), and solving means noticing that and ordering by it
// yourself, not being told to. There's no wrong-order feedback either;
// slots just accept whatever you drop, and the puzzle only reacts once
// the arrangement happens to be correct.
export function createPhotoBoardUI({ onClose = () => {} } = {}) {
  const view = document.getElementById('board-view');
  const tray = document.getElementById('board-tray');
  const slots = Array.from(document.querySelectorAll('.board-slot'));
  const closeButton = document.getElementById('board-close');

  let open = false;
  let onSolvedCallback = null;
  let photosByKey = new Map();
  let slotOccupants = [null, null, null]; // photo key per slot, or null

  let dragEl = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragFromSlot = null; // slot index the dragged tile came from, or null if from tray

  function photoElement(key) {
    return tray.querySelector(`[data-key="${key}"]`) || view.querySelector(`.board-photo[data-key="${key}"]`);
  }

  function placeInTray(el) {
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.transform = `rotate(${(Math.random() - 0.5) * 8}deg)`;
    tray.appendChild(el);
  }

  function placeInSlot(el, slotIndex) {
    const slot = slots[slotIndex];
    slot.appendChild(el);
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.transform = 'none';
  }

  function slotIndexAtPoint(x, y) {
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return -1;
  }

  function clearDragOverStyles() {
    slots.forEach((s) => s.classList.remove('drag-over'));
  }

  function onPointerMove(e) {
    if (!dragEl) return;
    dragEl.style.left = `${e.clientX - dragOffsetX}px`;
    dragEl.style.top = `${e.clientY - dragOffsetY}px`;
    clearDragOverStyles();
    const idx = slotIndexAtPoint(e.clientX, e.clientY);
    if (idx >= 0) slots[idx].classList.add('drag-over');
  }

  function onPointerUp(e) {
    if (!dragEl) return;
    const key = dragEl.dataset.key;
    const targetSlot = slotIndexAtPoint(e.clientX, e.clientY);
    dragEl.classList.remove('dragging');
    clearDragOverStyles();

    if (dragFromSlot !== null) slotOccupants[dragFromSlot] = null;

    if (targetSlot >= 0) {
      const displaced = slotOccupants[targetSlot];
      if (displaced && displaced !== key) {
        // swap: the tile that was there goes back where the dragged one
        // came from (a slot) or into the tray if it came from the tray
        const displacedEl = photoElement(displaced);
        if (dragFromSlot !== null) {
          placeInSlot(displacedEl, dragFromSlot);
          slotOccupants[dragFromSlot] = displaced;
        } else {
          placeInTray(displacedEl);
        }
      }
      placeInSlot(dragEl, targetSlot);
      slotOccupants[targetSlot] = key;
    } else {
      placeInTray(dragEl);
    }

    dragEl = null;
    dragFromSlot = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    checkSolved();
  }

  function startDrag(e, el) {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    dragOffsetX = e.clientX - r.left;
    dragOffsetY = e.clientY - r.top;
    const slotParent = el.parentElement;
    dragFromSlot = slotParent && slotParent.classList.contains('board-slot')
      ? Number(slotParent.dataset.slot)
      : null;

    dragEl = el;
    el.classList.add('dragging');
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    document.body.appendChild(el); // free it from tray/slot layout while dragging

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function checkSolved() {
    if (slotOccupants.some((k) => k === null)) return;
    const dates = slotOccupants.map((k) => photosByKey.get(k).date);
    const inOrder = dates[0] < dates[1] && dates[1] < dates[2];
    if (inOrder && onSolvedCallback) {
      const cb = onSolvedCallback;
      onSolvedCallback = null;
      setTimeout(() => {
        cb();
        close();
      }, 500);
    }
  }

  function open_(photos, onSolved) {
    photosByKey = new Map(photos.map((p) => [p.key, p]));
    onSolvedCallback = onSolved;
    slotOccupants = [null, null, null];
    tray.innerHTML = '';
    slots.forEach((s) => { s.innerHTML = ''; });

    // Shuffled tray order -- never the discovery order or the correct
    // order, so the initial layout itself gives nothing away.
    const shuffled = [...photos].sort(() => Math.random() - 0.5);
    shuffled.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'board-photo';
      el.dataset.key = p.key;
      el.style.backgroundImage = `url(${p.dataUrl})`;
      el.style.transform = `rotate(${(Math.random() - 0.5) * 8}deg)`;
      el.addEventListener('pointerdown', (e) => startDrag(e, el));
      tray.appendChild(el);
    });

    open = true;
    view.classList.remove('hidden');
  }

  function close() {
    open = false;
    view.classList.add('hidden');
    onSolvedCallback = null;
    onClose();
  }

  closeButton.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) close();
  });

  return {
    open: open_,
    close,
    get isOpen() { return open; }
  };
}
