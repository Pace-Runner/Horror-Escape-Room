/**
 * Rebuild the game's recorded audio from its sources.  `node scripts/audio/build.mjs`
 *
 * The processed files under src/assets/audio/ are committed, so neither CI nor a
 * teammate needs this or its tools. It exists so every one of those files can be
 * made again from the URL it came from, with the same trim, loop seam and level,
 * instead of being a one-off nobody can reproduce. The decisions live in
 * sources.json; docs/AUDIO.md explains them.
 *
 *   node scripts/audio/build.mjs --cache <dir> [--download] [--only name,name]
 *
 * --cache     where the downloads live, one new empty folder per source. Keep it
 *             outside the repo: downloaded media is data from strangers, and
 *             nothing in that folder is ever run, only read by ffmpeg.
 * --download  fetch any source not already in the cache (needs yt-dlp).
 * --only      rebuild just these entries.
 *
 * Tools come from FFMPEG and YTDLP (paths to the executables) or the PATH. No
 * ffprobe is needed: durations are measured off the decoded samples.
 *
 * Writes each output file and src/assets/audio/manifest.json, which holds the
 * MEASURED numbers the game reads (duration, peak, loudness, loop windows,
 * excerpt boundaries). Level code reads those rather than decoding the file, so
 * a missing asset can never change gameplay timing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const AUDIO_DIR = join(ROOT, 'src', 'assets', 'audio');
const MANIFEST = join(AUDIO_DIR, 'manifest.json');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const YTDLP = process.env.YTDLP || 'yt-dlp';
// The bed decodes to ~58 MB of float samples; spawnSync's default is 1 MB.
const MAX_BUFFER = 1024 * 1024 * 1024;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const cacheDir = option('--cache');
if (!cacheDir) {
  console.error('usage: node scripts/audio/build.mjs --cache <dir> [--download] [--only a,b]');
  process.exit(2);
}
const only = option('--only')?.split(',') ?? null;

const config = JSON.parse(readFileSync(join(HERE, 'sources.json'), 'utf8'));
const SR = config.sampleRate;

function run(cmd, cmdArgs, input) {
  const r = spawnSync(cmd, cmdArgs, { input, maxBuffer: MAX_BUFFER });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}: ${r.stderr.toString().slice(-600)}`);
  return r;
}

/** The one downloaded file in a source's cache folder, or null. */
function cachedSource(name) {
  const dir = join(cacheDir, name);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find((f) => /^src(_1)?\./.test(f) && !f.endsWith('.part'));
  return file ? join(dir, file) : null;
}

/** Every member file of a zip-sourced entry, in order. */
function cachedMembers(name) {
  const dir = join(cacheDir, name);
  return readdirSync(dir).filter((f) => /^src_\d+\./.test(f))
    .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10))
    .map((f) => join(dir, f));
}

const UA = 'HorrorEscapeRoom-audio-build/1.0 (https://github.com/Pace-Runner/Horror-Escape-Room)';

/** A plain HTTP GET to a file. Freesound previews, Wikimedia Commons originals, zip packs. */
async function fetchTo(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/**
 * Members of a zip pack (Kenney's CC0 packs). The pack is fetched once into
 * <cache>/_zips and the members are pulled out with Windows' own tar.exe
 * (bsdtar, which reads zips; Git Bash's GNU tar does not) or with unzip
 * elsewhere. Each member lands as src_<n>.<ext>.
 */
async function fromZip(src, dir) {
  const { zip, members } = src.download;
  const zips = join(cacheDir, '_zips');
  mkdirSync(zips, { recursive: true });
  const zipFile = join(zips, zip.split('/').pop());
  if (!existsSync(zipFile)) await fetchTo(zip, zipFile);
  const out = join(zips, zipFile.split(/[\\/]/).pop().replace(/\.zip$/, ''));
  mkdirSync(out, { recursive: true });
  if (process.platform === 'win32') {
    run(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zipFile, '-C', out, ...members]);
  } else {
    run('unzip', ['-o', '-q', zipFile, ...members, '-d', out]);
  }
  members.forEach((m, i) => {
    const ext = m.split('.').pop();
    writeFileSync(join(dir, `src_${i + 1}.${ext}`), readFileSync(join(out, m)));
  });
}

async function download(src) {
  const dir = join(cacheDir, src.name);
  mkdirSync(dir, { recursive: true });
  if (src.download?.zip) { await fromZip(src, dir); return; }
  if (src.download?.direct) {
    const ext = src.url.split('?')[0].split('.').pop();
    await fetchTo(src.url, join(dir, `src.${ext}`));
    return;
  }
  const dl = ['--no-playlist', '-f', 'bestaudio', '-o', join(dir, 'src.%(ext)s')];
  if (process.env.FFMPEG) dl.push('--ffmpeg-location', process.env.FFMPEG);
  if (src.download?.sections) dl.push('--download-sections', src.download.sections);
  // YouTube's player needs a JavaScript runtime now; node is already here.
  run(YTDLP, ['--js-runtimes', 'node', ...dl, src.url]);
}

/**
 * Mono float samples of [from, to) of a file. Both seek options go BEFORE -i: an
 * output-side -to after an input-side -ss counts from the seek point, so it
 * silently becomes a duration. `highpass` is for SOURCES only -- run over an
 * encoded file being measured, the filter's own ringing inflates the peak.
 * No -ss at all when reading from 0: on AAC even `-ss 0` skips the first
 * frame (~21 ms), which on a short one-shot is the whole transient (a water
 * drop measured -13 dBFS for a file peaking at -3).
 */
function decode(file, from, to, { highpass = false } = {}) {
  const filter = highpass ? ['-af', 'highpass=f=20'] : [];
  const seek = from > 0 ? ['-ss', String(from)] : [];
  const out = run(FFMPEG, ['-v', 'error', ...seek, '-to', String(to), '-i', file,
    '-ac', '1', '-ar', String(SR), ...filter, '-f', 'f32le', '-']).stdout;
  return new Float32Array(out.buffer, out.byteOffset, out.length / 4).slice();
}

const dbOf = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const peakOf = (x, a = 0, b = x.length) => {
  let p = 0;
  for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};

/** Window RMS envelope, one value per `hop` seconds. */
function envelope(x, hop) {
  const n = Math.round(hop * SR);
  const env = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    env.push(Math.sqrt(s / n));
  }
  return env;
}

/** First and last sample louder than `db` relative to the peak, with 10 ms / 30 ms of margin. */
function autotrim(x, db) {
  const t = peakOf(x) * 10 ** (db / 20);
  let a = 0;
  while (a < x.length && Math.abs(x[a]) < t) a++;
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) < t) b--;
  return [Math.max(0, a - Math.round(0.01 * SR)), Math.min(x.length, b + Math.round(0.03 * SR))];
}

/**
 * Bake an equal-power self-crossfade so [0, L) loops end to start, then pad it
 * CIRCULARLY: `pad` seconds of the loop's own end before it and of its own start
 * after it. The loop window is then [pad, pad + L) -- and because the padding is
 * the loop continuing, a decoder that shifts the audio by up to `pad` (AAC
 * priming that a browser does not trim) still lands on a seamless window.
 */
function bakeLoop(x, start, length, xfade, pad) {
  const s = Math.round(start * SR);
  const L = Math.round(length * SR);
  const X = Math.round(xfade * SR);
  const P = Math.round(pad * SR);
  if (s + L + X > x.length) throw new Error(`loop needs ${(s + L + X) / SR} s of source, have ${x.length / SR}`);
  const loop = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    if (i < X) {
      const t = (Math.PI * i) / (2 * X);
      loop[i] = x[s + i] * Math.sin(t) + x[s + L + i] * Math.cos(t);
    } else {
      loop[i] = x[s + i];
    }
  }
  const out = new Float32Array(P + L + P);
  out.set(loop.subarray(L - P), 0);
  out.set(loop, P);
  out.set(loop.subarray(0, P), P + L);
  return { samples: out, loopStart: P / SR, loopEnd: (P + L) / SR };
}

function fade(x, fadeIn, fadeOut) {
  const a = Math.round(fadeIn * SR);
  const b = Math.round(fadeOut * SR);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
}

/** Onsets the way AudioEngine's footstep slicer finds them: 10 ms peaks over 18% of the file's peak. */
function onsets(x, refractory = 0.12) {
  const hop = Math.round(0.01 * SR);
  const env = [];
  for (let i = 0; i + hop <= x.length; i += hop) env.push(peakOf(x, i, i + hop));
  const peak = Math.max(...env);
  const out = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < peak * 0.18 || env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
    if (out.length && i - out[out.length - 1] < refractory * 100) continue;
    out.push(i);
  }
  return out.map((i) => +(i * 0.01).toFixed(2));
}

/** Runs of sound between silences, merged across short gaps and split if too long. */
function phrases(x, { silenceDb, minGap, minLength, maxLength }) {
  const hop = 0.05;
  const env = envelope(x, hop);
  const floor = peakOf(x) * 10 ** (silenceDb / 20);
  const runs = [];
  let s = null;
  env.forEach((v, i) => {
    if (v >= floor && s === null) s = i;
    if ((v < floor || i === env.length - 1) && s !== null) { runs.push([s * hop, (i + 1) * hop]); s = null; }
  });
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < minGap) last[1] = r[1];
    else merged.push([...r]);
  }
  const out = [];
  for (const [a, b] of merged) {
    if (b - a < minLength) continue;
    if (b - a <= maxLength) { out.push([a, b]); continue; }
    // Too long for one excerpt: cut it at its quietest point away from either end.
    const i0 = Math.ceil((a + minLength) / hop);
    const i1 = Math.floor((b - minLength) / hop);
    let cut = i0;
    for (let i = i0; i <= i1; i++) if (env[i] < env[cut]) cut = i;
    out.push([a, cut * hop], [cut * hop, b]);
  }
  return out.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
}

function encode(samples, outFile, kbps) {
  mkdirSync(dirname(outFile), { recursive: true });
  const bytes = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  run(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-',
    '-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart', outFile], bytes);
}

/** Integrated loudness and true peak of a file, from ffmpeg's EBU R128 meter. */
function loudness(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { maxBuffer: MAX_BUFFER });
  const text = r.stderr.toString();
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const lufs = summary.match(/I:\s+(-?[\d.]+) LUFS/);
  const tp = summary.match(/Peak:\s+(-?[\d.]+) dBFS/);
  return { lufs: lufs ? +lufs[1] : null, truePeakDb: tp ? +tp[1] : null };
}

/**
 * The step across a loop's wrap, against the median step inside the audio and
 * against the step the audio itself takes at that spot. The second matters on
 * crackle or footsteps, where a seam that lands near a transient takes a big
 * step that is the recording's own, not a click.
 */
function seam(x, loopStart, loopEnd) {
  const a = Math.round(loopStart * SR);
  const b = Math.round(loopEnd * SR);
  const steps = [];
  for (let i = a + 1; i < b; i += 7) steps.push(Math.abs(x[i] - x[i - 1]));
  steps.sort((p, q) => p - q);
  const median = steps[steps.length >> 1];
  const jump = Math.abs(x[a] - x[b - 1]);
  const natural = Math.abs(x[a] - x[a - 1]);
  return {
    jump: +jump.toFixed(6), medianStep: +median.toFixed(6), naturalStep: +natural.toFixed(6),
    ratio: +(jump / median).toFixed(2)
  };
}

/** The quietest 10 ms within +/-radius of `t` (both in seconds of `x`), for a loop to start on. */
function quietestNear(x, t, radius) {
  const n = Math.round(0.01 * SR);
  let best = t;
  let bestE = Infinity;
  for (let c = Math.round((t - radius) * SR); c <= Math.round((t + radius) * SR); c += n >> 2) {
    if (c < 0 || c + n > x.length) continue;
    let e = 0;
    for (let i = c; i < c + n; i++) e += x[i] * x[i];
    if (e < bestE) { bestE = e; best = (c + n / 2) / SR; }
  }
  return best;
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { assets: {} };
for (const src of config.sources) {
  if (only && !only.includes(src.name)) continue;
  let file = cachedSource(src.name);
  if (!file && flag('--download')) {
    await download(src);
    file = cachedSource(src.name);
  }
  if (!file) {
    console.warn(`skip ${src.name}: not in ${cacheDir} (pass --download to fetch it)`);
    continue;
  }

  const trim = src.trim ?? [0, 1e6];
  let x;
  if (src.download?.zip && src.download.members.length > 1) {
    // Several one-shots joined with a gap between each -- a footstep set the
    // engine's slicer cuts back apart, one footfall per slice.
    const gap = new Float32Array(Math.round((src.download.gap ?? 0.5) * SR));
    // Each one to the same peak first: the slicer only cuts at transients over
    // 18% of the FILE's peak, and Kenney's quietest carpet step sat under that.
    const parts = cachedMembers(src.name).flatMap((f) => {
      const one = decode(f, 0, 1e6, { highpass: true });
      const [a, b] = autotrim(one, -50);
      const cut = one.slice(a, b);
      const g = 1 / (peakOf(cut) || 1);
      for (let i = 0; i < cut.length; i++) cut[i] *= g;
      return [cut, gap];
    });
    // And a lead-in, so the first step has a rise for the slicer to find --
    // starting on sample 0 it was never counted. (Such a source must not also
    // ask for `autotrim`, which would take the lead-in straight back off.)
    parts.unshift(gap);
    x = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { x.set(p, o); o += p.length; }
  } else {
    x = decode(file, trim[0], trim[1], { highpass: true });
  }
  let trimStart = trim[0];
  if (src.autotrim !== undefined) {
    const [a, b] = autotrim(x, src.autotrim);
    trimStart += a / SR;
    x = x.slice(a, b);
  }

  const entry = { file: src.out, track: src.track, sourceStart: +trimStart.toFixed(3) };
  if (src.loop) {
    let start = src.loop.start - trimStart;
    // Slid onto the quietest nearby 10 ms, so the wrap never falls on a transient.
    if (src.loop.quietSearch) start = quietestNear(x, start, src.loop.quietSearch);
    const baked = bakeLoop(x, start, src.loop.length, src.loop.xfade, src.loop.pad);
    x = baked.samples;
    entry.sourceLoopStart = +(start + trimStart).toFixed(3);
    entry.loop = { start: +baked.loopStart.toFixed(6), end: +baked.loopEnd.toFixed(6) };
  } else {
    fade(x, src.fadeIn ?? 0.005, src.fadeOut ?? 0.02);
  }

  let gain = 10 ** (src.peakDb / 20) / peakOf(x);
  for (let i = 0; i < x.length; i++) x[i] *= gain;

  if (src.runtimeLoop) entry.runtimeLoop = { ...src.runtimeLoop, start: src.runtimeLoop.start - trimStart, end: src.runtimeLoop.end - trimStart };
  if (src.runtimeWindows) {
    entry.runtimeWindows = { ...src.runtimeWindows, from: +(src.runtimeWindows.from - trimStart).toFixed(3), to: +(src.runtimeWindows.to - trimStart).toFixed(3) };
  }
  if (src.phrases) entry.phrases = phrases(x, src.phrases);
  if (src.events) {
    const on = onsets(x);
    const gapAt = on.findIndex((t, i) => i > 0 && t - on[i - 1] > src.events.clusterGap);
    entry.events = { onsets: on, latchEnd: gapAt > 0 ? on[gapAt - 1] : on[0], settle: on[on.length - 1] };
  }
  if (src.sections) {
    const on = onsets(x);
    const dense = on.findIndex((t) => on.filter((u) => u >= t && u < t + 1).length >= src.sections.runDensity);
    const runStart = dense >= 0 ? on[dense] : x.length / SR;
    const walk = on.filter((t) => t < runStart - 0.5);
    entry.sections = { walkStart: walk[0] ?? 0, walkEnd: +((walk[walk.length - 1] ?? 0) + 0.5).toFixed(2), runStart, runEnd: +(x.length / SR).toFixed(2) };
  }

  const outFile = join(AUDIO_DIR, src.out);
  encode(x, outFile, src.kbps);
  // AAC rings on sharp transients, so the encoded peak can land over a dB above
  // what went in (the hunter's footsteps measured -1.6 against a -3 target).
  // Corrected off the ENCODED true peak -- iterated, because the encoder's
  // overshoot is not linear in level (one pass on those steps landed at -4.9).
  for (let pass = 0; pass < 3; pass++) {
    const over = loudness(outFile).truePeakDb - src.peakDb;
    if (Math.abs(over) <= 0.5) break;
    gain = 10 ** (-over / 20);
    for (let i = 0; i < x.length; i++) x[i] *= gain;
    encode(x, outFile, src.kbps);
  }

  // Measured off the ENCODED file, decoded back, not off what went in: that is
  // what the game actually plays.
  const back = decode(outFile, 0, 1e6);
  entry.duration = +(back.length / SR).toFixed(3);
  entry.peakDb = +dbOf(peakOf(back)).toFixed(2);
  Object.assign(entry, loudness(outFile));
  if (entry.loop) entry.loop.seam = seam(back, entry.loop.start, entry.loop.end);
  manifest.assets[src.name] = entry;
  console.log(`${src.name.padEnd(14)} ${entry.duration.toFixed(2)} s  peak ${entry.peakDb} dBFS  `
    + `${entry.lufs} LUFS  tp ${entry.truePeakDb}${entry.loop ? `  seam x${entry.loop.seam.ratio}` : ''}`);
}

manifest.sampleRate = SR;
manifest.generatedBy = 'scripts/audio/build.mjs';
const ordered = Object.fromEntries(Object.entries(manifest.assets).sort((a, b) => a[1].track - b[1].track));
writeFileSync(MANIFEST, JSON.stringify({ ...manifest, assets: ordered }, null, 2) + '\n');
