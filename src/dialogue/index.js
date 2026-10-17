/**
 * The dialogue loader. You should not need to edit this file -- edit the level
 * files next to it. See README.md in this folder for the workflow.
 *
 * Every `export const dialog_... = [...]` in every .js file in this folder is
 * collected into one table, keyed by its name. The game asks for lines by that
 * name (`line('dialog_pickup_flashlight')`), and the lookup happens at the
 * moment the line is about to show -- never earlier -- so whatever the file
 * says right now is what the player sees.
 *
 * THE FORMAT, as written in the level files:
 *
 *   one line      ["text", "voice/path.m4a"]
 *                 ["text", "voice/path.m4a", 4.2]       third item = seconds on screen
 *                 ["text"]                              no voice, auto timing
 *   several       [["first line", ""], ["second", "level1/x.m4a"]]
 *
 * Voice paths are relative to src/assets/voice/. An empty path, a missing one,
 * or a path to a file that does not exist yet all mean the same thing: the
 * caption shows, silently. That is what lets the text be written first and the
 * recordings dropped in later.
 *
 * `{name}` in the text is filled from the second argument:
 *   line('dialog_fuse_taken', { amps: '30A' })
 */

// Every file in this folder except this one -- globbing itself would be a
// circular import.
const FILES = import.meta.glob(['./*.js', '!./index.js'], { eager: true });

/**
 * The table lives on globalThis, not in a module variable, and that is what
 * makes saving a dialogue file update the RUNNING game.
 *
 * Vite re-runs this module when a file it globs changes (it self-accepts at the
 * bottom), but every level already imported the OLD copy's `line` function and
 * keeps calling it. A module-level table would leave that old function reading
 * old text forever. Both copies read this one shared object, so the new copy
 * rebuilding it is enough.
 */
const store = (globalThis.__dialogueStore ??= { table: new Map() });

function build() {
  const table = new Map();
  const origin = new Map();
  for (const [path, mod] of Object.entries(FILES)) {
    const file = path.slice(2);
    for (const [key, value] of Object.entries(mod)) {
      if (!key.startsWith('dialog_')) continue;
      if (table.has(key)) {
        console.error(`[dialogue] "${key}" is defined in both ${origin.get(key)} and ${file}. `
          + `The one in ${file} wins -- rename one of them.`);
      }
      table.set(key, value);
      origin.set(key, file);
    }
  }
  store.table = table;
}

build();

/** ["text", "voice", seconds] -> { text, voice, duration } */
function toLine(entry, key) {
  if (typeof entry === 'string') entry = [entry];
  if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
    console.error(`[dialogue] "${key}" has a line that is not ["text", "voice"]:`, entry);
    return null;
  }
  const [text, voice, duration] = entry;
  // The key travels with the line, so the voice hook can tell WHICH line is
  // starting (the "hold the right item" lines get a spoken reaction).
  const out = { text, key };
  if (voice) out.voice = voice;
  if (typeof duration === 'number') out.duration = duration;
  return out;
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/**
 * Every line of a dialogue entry, ready for CaptionSequencer.
 *
 * Always an array, even for a one-line entry, so a caller never has to know
 * which shape the writer chose -- and the writer can turn one line into three
 * without touching any code.
 */
export function line(key, vars) {
  const value = store.table.get(key);
  if (value === undefined) {
    console.error(`[dialogue] no line called "${key}". Check the spelling in src/dialogue/.`);
    // On screen in development so a typo is obvious the first time the beat
    // plays; silent in a build, where a stray key is better than a broken line.
    return import.meta.env.DEV ? [{ text: `[missing dialogue: ${key}]` }] : [];
  }
  const entries = Array.isArray(value) && Array.isArray(value[0]) ? value : [value];
  const out = [];
  for (const e of entries) {
    const l = toLine(e, key);
    if (l) {
      l.text = fill(l.text, vars);
      out.push(l);
    }
  }
  return out;
}

/**
 * Picks among several takes of one moment -- `dialog_dead_end_1`, `_2`, `_3` --
 * so a repeated beat is not the same sentence every time.
 *
 *   const pick = linePicker(['dialog_a', 'dialog_b', 'dialog_c']);
 *   captions.play(line(pick()));
 *
 * 'random' never picks the same key twice in a row. 'sequence' plays them in
 * order once, then carries on at random -- for beats that should escalate the
 * first few times (being caught, coming round) before they start repeating.
 * Pass a narrower list to pick() to choose only among some of them.
 */
export function linePicker(keys, { order = 'random' } = {}) {
  let last = null;
  let next = 0;
  const pick = (among = keys) => {
    if (order === 'sequence' && next < keys.length) {
      last = keys[next++];
      return last;
    }
    const options = among.length > 1 ? among.filter((k) => k !== last) : among;
    last = options[Math.floor(Math.random() * options.length)];
    return last;
  };
  pick.reset = () => { last = null; next = 0; };
  return pick;
}

/** True if a dialogue entry exists, for the few places a line is optional. */
export function hasLine(key) {
  return store.table.has(key);
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {});
}
