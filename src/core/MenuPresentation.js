/** One looping source for the entire launch menu, independent of gameplay audio. */
export function createMenuMusic({source, makeAudio = () => new Audio(),
  events = window, page = document, frame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now()}) {
  const track = makeAudio();
  track.src = source;
  track.loop = true;
  track.preload = 'auto';
  track.volume = 0;
  let active = false, master = .5, pending = false, fadeFrame = null;
  const audible = () => active && !page.hidden;
  function fadeTo(target, duration, onDone) {
    if (fadeFrame !== null) cancelFrame(fadeFrame);
    const from = track.volume, started = now();
    function step() {
      const progress = Math.min(1, (now() - started) / duration);
      track.volume = from + (target - from) * progress;
      fadeFrame = progress < 1 ? frame(step) : null;
      if (progress === 1) onDone?.();
    }
    fadeFrame = frame(step);
  }
  function play() {
    if (!audible() || pending || !track.paused) return;
    pending = true;
    // Browser autoplay restrictions and unavailable assets never affect the menu.
    try {
      Promise.resolve(track.play()).then(() => {
        if (audible()) fadeTo(master * .36, 1200);
        else track.pause();
      }).catch(() => {}).finally(() => { pending = false; });
    } catch { pending = false; }
  }
  function setActive(value) {
    active = value;
    if (active) {
      if (!track.paused) fadeTo(master * .36, 600);
      play();
    } else fadeTo(0, 240, () => { track.pause(); track.currentTime = 0; });
  }
  const visibility = () => {
    if (page.hidden) {
      if (fadeFrame !== null) cancelFrame(fadeFrame);
      fadeFrame = null;
      track.pause(); track.volume = 0;
    } else play();
  };
  const hide = () => { track.pause(); };
  events.addEventListener('pointerdown', play, true);
  events.addEventListener('keydown', play, true);
  events.addEventListener('pagehide', hide);
  page.addEventListener('visibilitychange', visibility);
  return {
    setActive,
    setVolume(value) {
      master = Math.max(0, Math.min(1, Number(value) || 0));
      if (audible() && !track.paused) fadeTo(master * .36, 100);
    },
    dispose() {
      active = false;
      if (fadeFrame !== null) cancelFrame(fadeFrame);
      track.pause();
      events.removeEventListener('pointerdown', play, true);
      events.removeEventListener('keydown', play, true);
      events.removeEventListener('pagehide', hide);
      page.removeEventListener('visibilitychange', visibility);
    }
  };
}

/** Captures the continue input so it cannot also choose a difficulty. */
export function createHeadphonesScreen({root, onContinue, events = window}) {
  let open = false;
  function close() { open = false; root.classList.add('hidden'); }
  function proceed(event) {
    if (!open) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    close(); onContinue();
  }
  root.addEventListener('click', proceed);
  events.addEventListener('keydown', proceed, true);
  return {
    open() { open = true; root.classList.remove('hidden'); root.focus({preventScroll:true}); },
    close
  };
}
