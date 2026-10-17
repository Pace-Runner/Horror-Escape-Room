/**
 * Validate the recorded audio without a browser or ffmpeg.  `npm run check:audio`
 *
 * The game reads MEASURED numbers out of src/assets/audio/manifest.json -- loop
 * windows, the lockbox's length, excerpt boundaries -- rather than decoding the
 * files to find them, so a missing file can never change gameplay timing. That
 * only holds while the manifest and the files agree, and nothing else notices
 * when they stop: a re-exported clip with a stale manifest just loops in the
 * wrong place, forever.
 *
 * So this checks, for every manifest entry: the file is there, its length (read
 * straight out of the MP4 boxes, no decoder needed) matches, and every window in
 * it lies inside the file. Then that every cue the code asks for by name has an
 * entry, that the typed-in breathing loop matches the measured one, and that
 * nothing new matches one of the old single-file globs (breathing.* takes the
 * FIRST match, so a second one would make the pick arbitrary).
 *
 * Exit code is non-zero on any fault.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = join(ROOT, 'src', 'assets', 'audio');

/** Seconds a decoded file may differ from the manifest: AAC priming and padding is ~21-43 ms. */
const DURATION_TOLERANCE = 0.06;

/**
 * A file's playable length from its MP4 boxes: the edit list's segment if there
 * is one (that is what trims the encoder's priming), the media header if not.
 */
export function mp4Duration(bytes) {
  const u32 = (o) => bytes.readUInt32BE(o);
  const u64 = (o) => Number(bytes.readBigUInt64BE(o));
  const boxes = (from, to) => {
    const out = [];
    for (let o = from; o + 8 <= to;) {
      let size = u32(o);
      const type = bytes.toString('latin1', o + 4, o + 8);
      let header = 8;
      if (size === 1) { size = u64(o + 8); header = 16; }
      if (size === 0) size = to - o;
      if (size < header) break;
      out.push({ type, start: o + header, end: o + size });
      o += size;
    }
    return out;
  };
  const child = (box, type) => box && boxes(box.start, box.end).find((b) => b.type === type);
  const moov = boxes(0, bytes.length).find((b) => b.type === 'moov');
  const mvhd = child(moov, 'mvhd');
  if (!mvhd) return null;
  const mvV = bytes[mvhd.start];
  const movieScale = u32(mvhd.start + (mvV === 1 ? 20 : 12));
  const trak = child(moov, 'trak');
  const elst = child(child(trak, 'edts'), 'elst');
  if (elst && u32(elst.start + 4) > 0) {
    const v = bytes[elst.start];
    const seg = v === 1 ? u64(elst.start + 8) : u32(elst.start + 8);
    return seg / movieScale;
  }
  const mdhd = child(child(trak, 'mdia'), 'mdhd');
  if (!mdhd) return null;
  const v = bytes[mdhd.start];
  const scale = u32(mdhd.start + (v === 1 ? 20 : 12));
  const dur = v === 1 ? u64(mdhd.start + 24) : u32(mdhd.start + 16);
  return dur / scale;
}

/** Every fault in `manifest` against the files on disk, as readable lines. */
export function reportAudio(manifest, { readFile = (p) => readFileSync(p), exists = existsSync } = {}) {
  const errors = [];
  for (const [name, a] of Object.entries(manifest.assets ?? {})) {
    const file = join(AUDIO, a.file);
    if (!exists(file)) {
      errors.push(`${name}: ${a.file} is in the manifest but not on disk`);
      continue;
    }
    if (!(a.duration > 0)) {
      errors.push(`${name}: no measured duration`);
      continue;
    }
    if (a.file.endsWith('.m4a')) {
      const d = mp4Duration(readFile(file));
      if (d === null) errors.push(`${name}: ${a.file} has no readable MP4 duration`);
      else if (Math.abs(d - a.duration) > DURATION_TOLERANCE) {
        errors.push(`${name}: ${a.file} is ${d.toFixed(3)} s but the manifest says ${a.duration} s -- rebuild with scripts/audio/build.mjs`);
      }
    }
    const inside = (label, from, to) => {
      if (!(from >= 0 && to > from && to <= a.duration + 1e-6)) {
        errors.push(`${name}: ${label} [${from}, ${to}] is not inside the file's ${a.duration} s`);
      }
    };
    if (a.loop) inside('loop window', a.loop.start, a.loop.end);
    if (a.runtimeLoop) inside('runtime loop (plus its crossfade)', a.runtimeLoop.start, a.runtimeLoop.end + a.runtimeLoop.xfade);
    if (a.runtimeWindows) {
      const w = a.runtimeWindows;
      inside('runtime windows (latest start + length + crossfade)', w.from, w.to + w.length + w.xfade);
    }
    for (const [i, p] of (a.phrases ?? []).entries()) inside(`phrase ${i}`, p[0], p[1]);
    if (a.events) inside('lockbox events', a.events.latchEnd, a.events.settle);
    if (a.sections) inside('walk/run sections', a.sections.walkStart, a.sections.runEnd);
  }
  return errors;
}

/** Cue names the code asks for: `cue: '...'` specs and cueInfo('...') calls. */
function namesInCode() {
  const files = ['src/systems/AudioDirector.js', 'src/world/AudioEngine.js', 'src/levels/bedroomLevel.js'];
  const names = new Set();
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/cue:\s*'([a-z_]+)'/g)) names.add(m[1]);
    for (const m of text.matchAll(/cueInfo\('([a-z_]+)'\)/g)) names.add(m[1]);
  }
  return names;
}

/**
 * The free sound effects: AudioDirector's SFX table, read as text. Returns the
 * effect names it defines, each with the files it plays (its `variants`, or
 * the file of its own name).
 */
export function sfxTable(director) {
  const block = director.replace(/\r\n/g, '\n').match(/\nconst SFX = \{\n([\s\S]*?)\n\};/)?.[1] ?? '';
  const table = new Map();
  let current = null;
  for (const lineText of block.split('\n')) {
    const key = lineText.match(/^ {2}([a-z_0-9]+): \{/);
    if (key) { current = key[1]; table.set(current, [current]); }
    const variants = lineText.match(/variants: \[([^\]]*)\]/);
    if (variants && current) table.set(current, [...variants[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
  }
  return table;
}

/**
 * Effect names the code plays: every quoted name on a line that calls sfx() or
 * onSfx(), less the ones only compared (`=== 'on'`), plus the values of
 * STUDY_LOCK_SFX. At runtime a name missing from SFX is silent, not an error --
 * which is exactly why it is checked here.
 */
export function sfxNamesInCode(texts) {
  const names = new Set();
  for (const text of texts) {
    for (const lineText of text.replace(/\r\n/g, '\n').split('\n')) {
      // The wrappers that pass a name through (`onSfx: (name) => sfx(name)`) name nothing.
      if (/\bsfx\(|onSfx\(/.test(lineText) && !/sfx\(name\b/.test(lineText)) {
        for (const m of lineText.matchAll(/(?<!===?\s?)'([a-z_0-9]+)'/g)) names.add(m[1]);
      }
      if (/^const STUDY_LOCK_SFX = /.test(lineText)) {
        for (const m of lineText.matchAll(/: '([a-z_0-9]+)'/g)) names.add(m[1]);
      }
    }
  }
  return names;
}

const manifest = JSON.parse(readFileSync(join(AUDIO, 'manifest.json'), 'utf8'));
const errors = reportAudio(manifest);

for (const name of namesInCode()) {
  if (!manifest.assets[name]) errors.push(`the code asks for cue "${name}", which manifest.json does not have`);
}

// Every effect the code plays is in SFX, and every file SFX plays is recorded.
const SFX_TABLE = sfxTable(readFileSync(join(ROOT, 'src/systems/AudioDirector.js'), 'utf8'));
const SFX_CALLERS = ['src/main.js', ...readdirSync(join(ROOT, 'src/levels'))
  .filter((f) => f.endsWith('.js')).map((f) => `src/levels/${f}`)];
const SFX_USED = sfxNamesInCode(SFX_CALLERS.map((f) => readFileSync(join(ROOT, f), 'utf8')));

/** Every fault between the effects played, the SFX table and the manifest. */
export function reportSfx(manifest, table, used) {
  const out = [];
  for (const name of used) {
    if (!table.has(name)) out.push(`the code plays sound effect "${name}", which AudioDirector's SFX table does not define`);
  }
  for (const [name, files] of table) {
    for (const f of files) if (!manifest.assets[f]) out.push(`SFX "${name}" plays "${f}", which manifest.json does not have`);
  }
  if (table.size < 10) out.push(`only ${table.size} entries read out of AudioDirector's SFX table -- has its layout changed?`);
  return out;
}
errors.push(...reportSfx(manifest, SFX_TABLE, SFX_USED));

// The typed-in breathing window against the measured one.
{
  const engine = readFileSync(join(ROOT, 'src/world/AudioEngine.js'), 'utf8');
  const start = +engine.match(/const BREATH_LOOP_START = ([\d.]+);/)?.[1];
  const end = +engine.match(/const BREATH_LOOP_END = ([\d.]+);/)?.[1];
  const loop = manifest.assets.breathing?.loop;
  if (loop && (Math.abs(start - loop.start) > 0.002 || Math.abs(end - loop.end) > 0.002)) {
    errors.push(`BREATH_LOOP_START/END (${start}, ${end}) do not match the measured loop (${loop.start}, ${loop.end})`);
  }
}

// One file per old single-file glob, at the top level only.
for (const stem of ['breathing', 'walking_audio', 'running_audio', 'trolley_roll', 'trolley_crash']) {
  const hits = readdirSync(AUDIO).filter((f) => f.startsWith(`${stem}.`));
  if (hits.length > 1) errors.push(`${hits.length} files match ${stem}.* (${hits.join(', ')}) -- the engine takes the first, so the pick is arbitrary`);
}

/**
 * SELF-TEST: prove the checks can still say no -- the same reasoning as
 * check-maze.mjs. Each case breaks a copy of the manifest one way and asserts
 * the report names it.
 */
const CASES = [
  {
    name: 'a loop window past the end of the file',
    break: (m) => { m.assets.breathing.loop.end = m.assets.breathing.duration + 1; },
    expect: /breathing: loop window/
  },
  {
    name: 'a manifest duration that no longer matches the file',
    break: (m) => { m.assets.door_open.duration += 0.5; },
    expect: /door_open: .* manifest says/
  },
  {
    name: 'an entry whose file is missing',
    break: (m) => { m.assets.candle.file = 'amb/not_there.m4a'; },
    expect: /candle: .* not on disk/
  }
];
for (const c of CASES) {
  const copy = JSON.parse(JSON.stringify(manifest));
  if (!copy.assets.breathing || !copy.assets.door_open || !copy.assets.candle) continue;
  c.break(copy);
  if (!reportAudio(copy).some((e) => c.expect.test(e))) errors.push(`self-test: ${c.name} was NOT reported`);
}

// And the sound-effect check: a variant whose file is gone, and a name the code
// plays that the table never defined.
const SFX_CASES = [
  {
    name: 'an SFX variant missing from the manifest',
    break: (m) => { delete m.assets.thunder_3; },
    used: new Set(),
    expect: /SFX "thunder" plays "thunder_3"/
  },
  {
    name: 'a sound effect played but never defined',
    break: () => {},
    used: new Set(['not_a_sound']),
    expect: /plays sound effect "not_a_sound"/
  }
];
for (const c of SFX_CASES) {
  const copy = JSON.parse(JSON.stringify(manifest));
  if (!copy.assets.thunder_3) continue;
  c.break(copy);
  if (!reportSfx(copy, SFX_TABLE, c.used).some((e) => c.expect.test(e))) errors.push(`self-test: ${c.name} was NOT reported`);
}

if (errors.length) {
  console.error(`check:audio -- ${errors.length} fault(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check:audio -- ${Object.keys(manifest.assets).length} recordings match the manifest; `
  + `${namesInCode().size} cue names in the code all have entries; ${SFX_USED.size} sound effects played from `
  + `${SFX_TABLE.size} in the SFX table, all recorded; ${CASES.length + SFX_CASES.length} self-tests went red as they should.`);
