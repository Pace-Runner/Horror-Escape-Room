import { HINTS } from '../story/hints.js';

const DISPLAY_MILLISECONDS = 5500;

/** Reads completion from the actual puzzles, without advancing their state. */
export function getAvailableHintKeys(level, progress = {}) {
  if (level === 'study') {
    if (progress.endingChoice !== 'NONE' && progress.endingChoice) return [];
    if (progress.hasHollowOverrideKey) return ['l3_choice'];
    if (progress.mirrorRevealed) return [];
    if (progress.truthRecordsSolved) return ['l3_letter'];
    if (progress.correctedTrailSolved) return ['l3_restricted'];
    if (progress.memoryVisorCollected) return ['l3_trail', 'l3_visor'];
    if (progress.memoryArchiveSolved) return ['l3_visor'];
    if (progress.crestSolved) return ['l3_memory'];
    if (progress.clockSolved) return ['l3_crest'];
    return ['l3_clock'];
  }
  if (level === 'upstairsHallway') return ['hallway_progress'];
  if (level === 'backrooms') return ['backrooms_progress'];
  if (level === 'bedroom') {
    if (!progress.chainsEscaped) return ['l1_cuff'];
    if (!progress.flashlightFound) return ['l1_flashlight'];
    if (progress.doorUnlocked) return [];
    const keys = [];
    if (!progress.photosArranged) keys.push('l1_polaroids');
    if (!progress.drawerUnlocked) keys.push('l1_lamp_code', 'l1_locked_drawer');
    if (progress.photosArranged && !progress.chestOpened) keys.push('l1_hidden_chest');
    if (progress.hasCrowbar && !progress.planksRemoved) keys.push('l1_door_planks');
    if (progress.hasCrowbar && !progress.floorboardPried) keys.push('l1_floorboard');
    if (progress.planksRemoved) keys.push('l1_bedroom_door');
    return keys;
  }
  if (level !== 'hallwayBasement' || progress.deckPlaying) return [];
  if (progress.powerStage === 'dead') return ['l2_restore_power', 'l2_fuse'];
  if (['blackout', 'running'].includes(progress.powerStage)) return ['l2_generator', 'l2_restore_power'];
  if (progress.powerStage === 'lit') return ['l2_exit'];
  if (progress.powerStage !== 'routed') return [];
  const keys = [];
  if (!progress.tapeWatched && progress.tapePlace !== 'recorder') keys.push('l2_session14');
  if (!progress.securityCleared) {
    if (!progress.cctvReviewed) keys.push('l2_cctv');
    keys.push('l2_security_info');
  }
  if (!progress.tapeWatched && !keys.includes('l2_session14')) keys.push('l2_session14');
  keys.push('l2_exit');
  return keys;
}

/** Context wins only if its puzzle is still available and unsolved. */
export function selectHintKey(level, progress, contextKeys = []) {
  const available = getAvailableHintKeys(level, progress);
  return contextKeys.find((key) => available.includes(key)) ?? available[0] ?? null;
}

/** One text-only box and one counter per data key. Nothing runs per frame. */
export function createContextualHints() {
  const box = document.createElement('aside');
  box.id = 'contextual-hint';
  box.className = 'game-hint';
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  const heading = document.createElement('strong');
  heading.textContent = 'HINT';
  const text = document.createElement('p');
  box.append(heading, text);
  document.body.append(box);
  const indices = new Map();
  let timeout = null;
  let fadeTimeout = null;

  function hide() {
    clearTimeout(timeout);
    timeout = null;
    clearTimeout(fadeTimeout);
    box.classList.remove('visible');
    fadeTimeout = setTimeout(() => { box.hidden = true; }, 200);
  }

  return {
    show(key) {
      const hints = HINTS[key];
      if (!hints?.length) { hide(); return; }
      const index = Math.min(indices.get(key) ?? 0, hints.length - 1);
      indices.set(key, Math.min(index + 1, hints.length - 1));
      clearTimeout(timeout);
      text.textContent = hints[index];
      clearTimeout(fadeTimeout);
      box.hidden = false;
      // Flush the hidden state once so the first display also fades in.
      void box.offsetWidth;
      box.classList.add('visible');
      timeout = setTimeout(hide, DISPLAY_MILLISECONDS);
    },
    hide,
    reset() { hide(); indices.clear(); }
  };
}
