/**
 * What the player has discovered, kept across page loads in localStorage:
 * the levels they have reached (the main menu's chapter select unlocks only
 * those) and the achievements in core/achievements.js. Separate from the
 * settings key so "Reset progress" never touches volume or sensitivity.
 *
 * Every storage access is wrapped: a private window or blocked site data
 * leaves the game playable, just with nothing remembered.
 */
const STORAGE_KEY = 'dontLetItOut.progress.v1';

function blank() {
  return { levelsReached: ['bedroom'], achievements: {}, counters: {} };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return blank();
    const data = blank();
    if (Array.isArray(raw.levelsReached)) {
      for (const key of raw.levelsReached) if (!data.levelsReached.includes(key)) data.levelsReached.push(key);
    }
    if (raw.achievements && typeof raw.achievements === 'object') Object.assign(data.achievements, raw.achievements);
    if (raw.counters && typeof raw.counters === 'object') Object.assign(data.counters, raw.counters);
    return data;
  } catch {
    return blank();
  }
}

export function createProgress() {
  let data = load();
  const listeners = new Set();
  // Off while a debug jump or harness is driving: those are not discoveries.
  let recording = true;

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* not remembered */ }
  }

  return {
    get recording() { return recording; },
    set recording(on) { recording = !!on; },
    get: () => data,
    isLevelUnlocked: (key) => data.levelsReached.includes(key),
    markLevelReached(key) {
      if (!recording || data.levelsReached.includes(key)) return;
      data.levelsReached.push(key);
      save();
    },
    markChapterCompleted(from){
      const next={upstairsHallway:'hallwayBasement',hallwayBasement:'study'}[from];
      if(next)this.markLevelReached(next);
    },
    has: (id) => !!data.achievements[id],
    count: (id) => data.counters[id] ?? 0,
    /** True only the first time, when the listeners hear about it too. */
    unlock(id) {
      if (!recording || data.achievements[id]) return false;
      data.achievements[id] = Date.now();
      save();
      for (const fn of listeners) fn(id);
      return true;
    },
    /** Adds one to a lifetime counter and returns the new total. */
    bump(id) {
      if (!recording) return data.counters[id] ?? 0;
      data.counters[id] = (data.counters[id] ?? 0) + 1;
      save();
      return data.counters[id];
    },
    onUnlock(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    resetAll() {
      data = blank();
      save();
    }
  };
}
