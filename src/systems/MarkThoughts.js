import { MARK_THOUGHTS } from '../story/markThoughts.js';

const files = import.meta.glob('../assets/audio/Dont Let it out Mark voice/**/*.mp3', {
  query: '?url', import: 'default', eager: true
});
const urls = Object.fromEntries(Object.entries(files).map(([path, url]) => [
  path.split('Dont Let it out Mark voice/')[1], url
]));

/** Queues inner thoughts through the existing mixer and audio-context clock.
 * Replayable inspections are deduplicated while pending, but can be requested
 * again after completion. Recording playback suspends and requeues a thought.
 */
export function createMarkThoughts(audio) {
  const box = document.createElement('div');
  box.id = 'mark-thought';
  box.setAttribute('aria-live', 'polite');
  document.body.append(box);
  const buffers = new Map();
  const seen = new Set();
  let queue = [];
  let current = null;
  let readyAt = 0;
  let blocked = false;

  function preload(key) {
    if (!audio.ctx || buffers.has(key)) return;
    const [file] = MARK_THOUGHTS[key];
    const context = audio.ctx;
    buffers.set(key, fetch(urls[file]).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${file}`);
      return response.arrayBuffer();
    }).then((bytes) => context.decodeAudioData(bytes)).then((buffer) => {
      buffers.set(key, buffer);
    }).catch((error) => {
      buffers.delete(key);
      const failed = queue.filter((entry) => entry.key === key);
      queue = queue.filter((entry) => entry.key !== key);
      for (const entry of failed) entry.onFailed?.();
      console.warn('Mark thought could not load:', file, error);
    }));
  }

  function stop() {
    if (current) {
      current.source.onended = null;
      current.source.stop();
      current.source.disconnect();
      current = null;
    }
    box.style.transitionDelay = '0s';
    box.classList.remove('visible');
  }

  return {
    play(key, { replayable = false, delay = 0.4, priority = false, when = () => true, onEnded, onFailed } = {}) {
      if (!MARK_THOUGHTS[key] || current?.key === key || queue.some((entry) => entry.key === key)) return;
      if (!replayable && seen.has(key)) return;
      seen.add(key);
      const entry = { key, delay, priority, when, onEnded, onFailed };
      // Post-recording conclusions precede any thought suspended by the tape.
      const index = priority ? queue.findIndex((pending) => !pending.priority) : -1;
      if (index < 0) queue.push(entry);
      else queue.splice(index, 0, entry);
      preload(key);
    },
    preload(prefix) {
      for (const key of Object.keys(MARK_THOUGHTS)) if (key.startsWith(prefix + '_')) preload(key);
      return Promise.all([...buffers.entries()].filter(([key]) => key.startsWith(prefix + '_')).map(([, buffer]) => buffer));
    },
    setBlocked(value) {
      blocked = value;
      if (value && current) {
        queue.unshift({ ...current.entry, startAt: undefined });
        stop();
      }
    },
    update({ blocked: busy = false } = {}) {
      queue = queue.filter((entry) => entry.when());
      if (blocked || busy || !audio.ctx || audio.ctx.state !== 'running') {
        if (busy && current) {
          queue.unshift({ ...current.entry, startAt: undefined });
          stop();
        }
        return;
      }
      // Existing voiced dialogue has priority; thoughts resume afterwards.
      if (audio.voiceSource) {
        if (current) {
          queue.unshift({ ...current.entry, startAt: undefined });
          stop();
        }
        return;
      }
      if (current || !queue.length || audio.ctx.currentTime < readyAt) return;
      const entry = queue[0];
      preload(entry.key);
      const buffer = buffers.get(entry.key);
      if (!(buffer instanceof AudioBuffer)) return;
      entry.startAt ??= audio.ctx.currentTime + entry.delay;
      if (audio.ctx.currentTime < entry.startAt) return;
      queue.shift();
      const source = audio.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.voiceGain);
      current = { key: entry.key, source, entry };
      source.onended = () => {
        source.disconnect();
        current = null;
        box.style.transitionDelay = '0s';
        box.classList.remove('visible');
        readyAt = audio.ctx.currentTime + 0.2;
        entry.onEnded?.();
      };
      box.textContent = MARK_THOUGHTS[entry.key][1];
      source.start();
      // Both start on the context clock, so pausing also holds natural gaps.
      box.style.transitionDelay = '0s';
      box.classList.add('visible');
    },
    clear({ reset = false } = {}) {
      stop();
      queue = [];
      readyAt = 0;
      blocked = false;
      if (reset) seen.clear();
    }
  };
}
