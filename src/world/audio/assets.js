/**
 * The recorded cues -- everything under src/assets/audio/{amb,sfx,monster,foley}/
 * -- and the measured numbers that describe them.
 *
 * GLOBBED, NOT IMPORTED, for the reason every other recording in this project
 * is (see the top of AudioEngine.js): a plain import of a file that is not
 * there fails the BUILD, a glob that matches nothing is an empty object. A
 * missing file is a silent cue and one console line, never a broken game.
 *
 * Subfolders only, so nothing here can ever match the old top-level globs
 * (breathing.*, walking_audio.*, running_audio.*, trolley_*). BREATHING_URL
 * takes the first match of its glob, and a second breathing.* would make that
 * pick arbitrary.
 *
 * Keyed by BASENAME without extension ("door_open"), which is also the key in
 * manifest.json -- so swapping an .m4a for an .ogg of the same name needs no
 * code change.
 */
const FILES = import.meta.glob('../../assets/audio/{amb,sfx,monster,foley}/*.{m4a,mp3,ogg,wav}', {
  query: '?url',
  import: 'default',
  eager: true
});

// The manifest is globbed too, so deleting it costs measured numbers (every
// reader has a fallback), not the build.
const MANIFEST = Object.values(import.meta.glob('../../assets/audio/manifest.json', {
  import: 'default',
  eager: true
}))[0] ?? { assets: {} };

const URLS = {};
for (const [path, url] of Object.entries(FILES)) {
  const base = path.split('/').pop().replace(/\.[^.]+$/, '');
  URLS[base] = url;
}

/** Every cue name that has a file, for the loader to fetch. */
export const CUE_NAMES = Object.keys(URLS);

/** The URL of a cue, or null when the file is not in the build. */
export function cueUrl(name) {
  return URLS[name] ?? null;
}

/**
 * The measured facts about a cue (duration, peakDb, lufs, loop window, excerpt
 * boundaries...) as scripts/audio/build.mjs wrote them, or null.
 */
export function cueInfo(name) {
  return MANIFEST.assets?.[name] ?? null;
}
