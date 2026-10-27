// The one AudioContext, and everything that plays through it.
//
// Wind, thunder, creaks and the scripted pass-by footsteps are synthesised with
// the Web Audio API. Everything that is performance rather than signal -- the
// breathing, the player's footsteps, the trolley, and the cues the audio
// director plays (doors, the lockbox, candles, static, the ambient bed, the
// monster's breathing and steps, the laughter, the caught sting) -- is a
// recording under src/assets/audio/. Where each came from, and under what
// licence, is src/assets/audio/SOURCES.md; how each is used is docs/AUDIO.md.
//
// This file is DSP and loading. WHO plays WHEN is systems/AudioDirector.js.
// AudioContext must be created after a user gesture (the start screen's click)
// or the browser will refuse to let it run.
import { CUE_NAMES, cueUrl, cueInfo } from './audio/assets.js';
import { createEmitter, createEchoBus, syncListener } from './audio/spatial.js';

// Every recording is loaded through a glob rather than the `import url from
// '../assets/audio/breathing.m4a?url'` pattern the .glb models use: a plain
// import of a file that is not there fails the BUILD, whereas a glob that
// matches nothing is just an empty object -- so a teammate who has not
// pulled the asset, or a swap to a different container, still builds. Vite
// hashes and rewrites the URL exactly as it does for the models, so this
// stays deployable under a subdirectory. The shipped file is .m4a (AAC-LC);
// .mp3, .ogg and .wav are picked up just as well if it is ever re-exported.
const BREATHING_FILES = import.meta.glob('../assets/audio/breathing.*', {
  query: '?url',
  import: 'default',
  eager: true
});
const BREATHING_URL = Object.values(BREATHING_FILES)[0] ?? null;

// Voice clips, for any caption whose dialogue entry names one -- see
// src/dialogue/README.md.
// Globbed for exactly the reason the breathing loop is: the game ships with
// text now and audio later, and a plain import of a file that is not there
// fails the BUILD. A glob that matches nothing is an empty object, so the game
// runs, captions still play, and the lines are simply silent.
//
// RECURSIVE, and keyed by the path under voice/, because the dialogue files
// name clips as "level1/wake_1.m4a". Each file answers to that path with and
// without its extension, so a writer who records an .mp3 against a line that
// says .m4a still gets it -- and to its bare filename, which is what the
// pre-dialogue-file keys ("tape-1") were.
const VOICE_FILES = import.meta.glob('../assets/voice/**/*.{m4a,mp3,ogg,wav}', {
  query: '?url',
  import: 'default',
  eager: true
});
const VOICE_URLS = {};
for (const [path, url] of Object.entries(VOICE_FILES)) {
  const rel = path.slice('../assets/voice/'.length);
  const noExt = rel.replace(/\.[^./]+$/, '');
  VOICE_URLS[rel] = url;
  VOICE_URLS[noExt] = url;
  const bare = noExt.split('/').pop();
  if (!(bare in VOICE_URLS)) VOICE_URLS[bare] = url;
}

// Mark recordings share the same voice bus and request generation as dialogue.
const MARK_VOICE_FILES=import.meta.glob('../assets/audio/Dont Let it out Mark voice/**/*.mp3',{
  query:'?url',import:'default',eager:true
});
for(const [path,url] of Object.entries(MARK_VOICE_FILES)){
  VOICE_URLS['mark/'+path.split('Dont Let it out Mark voice/')[1]]=url;
}

/**
 * The same key a dialogue file wrote, however it was written: tolerant of a
 * leading "src/assets/voice/" or "voice/", backslashes, and the extension.
 */
function voiceUrl(key) {
  const k = String(key).replace(/\\/g, '/').replace(/^(\.?\/)?(src\/)?(assets\/)?(voice\/)?/, '');
  return VOICE_URLS[k] ?? VOICE_URLS[k.replace(/\.[^./]+$/, '')];
}

// Voice sits above the ambience: a line that has to compete with the wind for
// intelligibility is a line the player will miss, and these carry the plot.
const VOICE_LEVEL = 0.9;

// Loop window in seconds, MEASURED off the shipped file rather than guessed at.
//
// The recording (a man breathing in the cold -- see SOURCES.md) is one
// unbroken shiver: no silent gap anywhere, and only a weak rhythm (the
// envelope's autocorrelation peaks at 1.19 s, r = 0.16). So the seam is not a
// lucky pair of quiet samples, as the old file's was, but BAKED: the build
// script cut 11.93 s between two of the recording's quietest moments (1.52 s
// and 13.45 s into the source, -43.9 and -40.9 dB, ten of those cycles apart)
// and crossfaded the window into itself over 0.25 s at equal power, so the end
// runs straight into the start. The file is that loop with 0.15 s of itself
// either side, which is why the window starts at 0.15: a browser that leaves
// the AAC encoder's priming in shifts the audio by ~20 ms, and the padding is
// the loop continuing, so the shifted window is still seamless. Measured off
// the encoded file, the step across the wrap is 0.0033 against a median
// sample-to-sample step of 0.0034 -- the seam is as smooth as the audio.
//
// scripts/audio/build.mjs writes these into manifest.json as well; the check at
// the bottom of this file says so if the two ever disagree.
const BREATH_LOOP_START = 0.15;
const BREATH_LOOP_END = 12.08;

// Long enough that starting and stopping reads as something moving closer or
// further away instead of a switch being flipped, short enough that a
// restart still feels immediate.
const BREATH_FADE = 0.6;

/**
 * The hearing filter's two ends (setMuffle). Open is above anything the game
 * plays, so the filter is transparent; shut is the dull, close, underwater
 * sound of a room heard while still mostly asleep.
 */
const MUFFLE_OPEN_HZ = 20000;
const MUFFLE_SHUT_HZ = 380;

// Intensity changes are story beats (the bulb blowing, the creature getting
// nearer), so they slide over about a breath rather than a frame.
const BREATH_LEVEL_RAMP = 1.1;

// The fixed gain between the 0..1 intensity dial and the file, so callers set
// a story level and never need to know how loud the recording is. Re-measure
// it if the file is replaced.
//
// MATCHED BY LOUDNESS TO THE LOOP IT REPLACED, so every intensity a level
// script already sets -- each one tuned by ear against the old file -- still
// sounds the size it did. The old loop measured -48.3 LUFS inside its window
// and played at a makeup of 5; this file measures -23.2 LUFS, so
//
//   5 x 10^((-48.3 - -23.2) / 20) = 0.278   (-11.1 dB)
//
// What that does to peaks (the file peaks at -3.3 dBFS):
//   BREATH_BASE_LEVEL 0.1         -> -34.5 dBFS   (the old loop: -34.3)
//   LEVEL_ONE_BREATHING_BASE 0.035 -> -43.6 dBFS  a background breath, as before
//   loudest story beat 0.95       -> -14.9 dBFS   (the old loop: -14.8)
//
// The old comment here promised -9.7 dBFS at 0.95. That was the peak of a
// handling thump at 1.39 s that the old loop window skipped -- it never played
// -- so the breath itself was never that loud, and matching it now would have
// made every beat 5 dB louder than the one the team tuned.
const BREATH_MAKEUP = 0.278;

// Exported because main.js's resetGame() has to put the intensity back to the
// level the game opens on, and two copies of that number in two files would
// drift the moment either is tuned.
export const BREATH_BASE_LEVEL = 0.1;

// Player footsteps. Two supplied recordings, sliced into individual steps at
// load and fired one per footfall -- NOT looped. See detectFootstepSlices.
//
// Globbed for the same reason the breathing loop and the voice clips are: a
// plain import of a file that is not there fails the BUILD, a glob that matches
// nothing is an empty object, and the game simply runs silent.
const WALK_STEP_FILES = import.meta.glob('../assets/audio/walking_audio.*', {
  query: '?url',
  import: 'default',
  eager: true
});
const RUN_STEP_FILES = import.meta.glob('../assets/audio/running_audio.*', {
  query: '?url',
  import: 'default',
  eager: true
});
const WALK_STEP_URL = Object.values(WALK_STEP_FILES)[0] ?? null;

// The instrument trolley's recordings: its castors rolling (looped while it
// moves) and its crash when it goes over. Globbed like the rest, so a missing
// file just falls back to the synthesised versions in setTrolleyRattle() and
// trolleyCrash() instead of breaking the build.
const TROLLEY_ROLL_URL = Object.values(import.meta.glob('../assets/audio/trolley_roll.*', {
  query: '?url', import: 'default', eager: true
}))[0] ?? null;
const TROLLEY_CRASH_URL = Object.values(import.meta.glob('../assets/audio/trolley_crash.*', {
  query: '?url', import: 'default', eager: true
}))[0] ?? null;
// A sample quieter than this counts as silence when the trolley clips are
// measured for where their sound actually starts and ends -- see audibleSpan().
const TROLLEY_SILENCE = 0.02;

/**
 * Where a recording's sound starts and ends, in seconds, skipping the silence
 * either side. Measured at load rather than typed in, so a replacement file
 * needs no code change. The rolling loop runs between the two, so leading or
 * trailing silence (and the AAC encoder's padding) never plays as a gap at
 * every pass; the crash starts at the first, so it lands with the impact
 * instead of a beat after it.
 */
function audibleSpan(buffer) {
  const data = buffer.getChannelData(0);
  let first = 0;
  while (first < data.length && Math.abs(data[first]) < TROLLEY_SILENCE) first++;
  let last = data.length - 1;
  while (last > first && Math.abs(data[last]) < TROLLEY_SILENCE) last--;
  if (last <= first) return { start: 0, end: buffer.duration };
  return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
}
const RUN_STEP_URL = Object.values(RUN_STEP_FILES)[0] ?? null;

/**
 * Per-level WALKING recordings. A level listed here walks on its own file; every
 * other level, and every sprint anywhere, keeps walking_audio / running_audio.
 * main.js's activateLevel() picks the surface through setFootstepSurface().
 *
 * hallwayBasement walks on metal (foley/steps_metal, see SOURCES.md). Each of
 * its footfalls is a heel and a toe 0.13 s apart, so at the default 120 ms
 * refractory the slicer cut its six footfalls into eleven half-steps and the
 * shuffle played a lone toe as often as a step. 250 ms is longer than heel to
 * toe and well under the 0.65 s between footfalls.
 *
 * The backrooms walk on their damp carpet (foley/steps_carpet: Kenney's five
 * CC0 carpet steps, joined 0.45 s apart so the slicer cuts them back out).
 */
const STEP_SURFACES = {
  hallwayBasement: { cue: 'steps_metal', refractorySeconds: 0.25 },
  backrooms: { cue: 'steps_carpet' }
};

/**
 * A footstep set that slices into fewer or more steps than this is not a
 * recording of footsteps as far as the slicer can tell -- the two shipped sets
 * give 8 and 61. Outside it the load warns instead of quietly sounding wrong.
 */
const STEP_SLICES_MIN = 4;
const STEP_SLICES_MAX = 120;

/**
 * The director's buses. Each is a plain gain to the master, and the gain IS the
 * duck stage: a cue sets its own level on its own node, so a duck on the bus
 * can never stomp on it, or be stomped on by it.
 *
 *   amb      the bed, the candles, the static, the laughter and its echo
 *   sfx      doors, the lockbox, the caught sting
 *   monster  the hunter's breathing and steps, the stalking aura
 */
const CUE_BUSES = ['amb', 'sfx', 'monster'];

/**
 * WHERE IN THE STRIDE A FOOT LANDS.
 *
 * PointerLockPlayer.bobPhase advances 2*pi per STRIDE, which is TWO steps, and
 * #applyEyeHeight draws the head as sin(bobPhase * 2). The head is lowest where
 * that is -1: bobPhase = 3*pi/4 and 7*pi/4. Firing there is what makes the
 * sound land with the visual dip instead of near it.
 *
 * The two points are exactly pi apart, so ONE test finds both: reduce the phase
 * modulo pi and watch for it to wrap. That also disposes of the 2*pi wrap for
 * free, which a pair of explicit threshold tests would each have to handle.
 */
const STEP_PHASE_OFFSET = Math.PI * 0.75;

/**
 * Peak each individual slice is normalised to, before the level dials below.
 *
 * BY PEAK, not by RMS. The two files as supplied are 23.7 dB apart at peak
 * (-25.7 dBFS walking against -2.0 running) and 25.1 dB apart in RMS, so they
 * cannot share a gain -- played at one level the run would be deafening beside
 * the walk. RMS would be worse than useless for choosing between them: the
 * walking file is mostly silence between steps and the running file is 27 s of
 * continuous running, so their RMS figures measure how much GAP each recording
 * has rather than how hard the foot lands. Peak measures the transient, which
 * is what a footstep is.
 *
 * TWO STAGES, because one was wrong. Normalising every SLICE to this peak
 * sounded right and is not: it flattens the recording's own dynamics, it fights
 * STEP_MAX_MAKEUP (five of the eight walking slices pinned to the ceiling and
 * came out anywhere from 0.16 to 0.42 anyway, which is the spread it was
 * supposed to remove), and a tread where every footfall is identical is the
 * metronome the alternating weight below exists to avoid. So the file is
 * matched to this peak, and slices are levelled only PARTWAY toward it --
 * enough that a random shuffle does not jump, not so much that the performance
 * is ironed flat.
 */
const STEP_TARGET_PEAK = 0.42;

/**
 * Ceiling on that normalisation, so near-silence is not lifted into hiss.
 *
 * 12, not 6, and the difference is not cosmetic. The supplied walking file
 * peaks at -25.7 dBFS, so reaching STEP_TARGET_PEAK needs x8.1 -- at a ceiling
 * of 6 EVERY walk slice clamped, which had two consequences: the walk came out
 * 2.6 dB under the run instead of matched to it, and, because they were all
 * pinned to the same number, the per-slice levelling that the clamp is sitting
 * on top of did nothing at all for that file. Measured after raising it, the
 * walk slices spread across their real range again.
 *
 * Headroom check, since raising a limiter is exactly the change that ships
 * hiss: the walking recording's RMS is -52.2 dBFS, and the gaps between steps
 * sit below that. At the ~x12 the file match needs (+21.6 dB) that noise floor
 * lands near -30 dBFS, under a step that is sitting at -7.5, and a slice only
 * ever plays the ~0.5 s around one footfall rather than the silence between
 * two. What reaches the mix is the step.
 */
const STEP_MAX_MAKEUP = 24;

/**
 * How far a slice is levelled toward its file's peak. 0 leaves the recording's
 * dynamics untouched, 1 makes every footfall identical. At 0.5 a step 12 dB
 * below the loudest in its file comes up 6 dB, so the shuffle stops jumping
 * while the tread still breathes.
 */
const STEP_EVEN = 0.5;

/**
 * Where footsteps sit in the mix. DERIVED, because the first pair of numbers
 * here were asserted and were the opposite of true.
 *
 * That comment claimed "under the breathing, well under the wind" while
 * setting 0.42, which works out as follows. A step peaks at STEP_TARGET_PEAK x
 * STEP_LEVEL, so 0.42 x 0.42 = 0.176 = -15.1 dBFS before the master. The
 * breathing loop at the level the game opens on peaks at about -34.5 dBFS (see
 * BREATH_MAKEUP). The wind drone is uniform noise through a 2nd-order 340 Hz
 * lowpass at gain 0.06, roughly -35 dBFS peak. So the player's own feet were
 * landing nearly 20 dB ABOVE the ambient breathing and the wind -- the loudest
 * recurring thing in the game, and louder than the loudest story beat.
 *
 * 0.12 puts a step at 0.0504 = -25.9 dBFS: about 9 dB over the base breathing
 * peak, 11 dB under a story-beat breath (-14.9), 9 dB over the wind. Clearly
 * audible as a transient, underneath everything that is supposed to carry the
 * scene.
 *
 * CROUCH IS A REAL DUCK NOW. 0.42 against 0.30 was -2.9 dB, roughly one
 * just-noticeable difference -- crouching sounded like walking. 0.04 is
 * -9.5 dB under the walk, which is the difference the mechanic is promising.
 */
const STEP_LEVEL = 0.12;
const STEP_CROUCH_LEVEL = 0.04;

/** Grab this much before the detected onset, so no attack transient is clipped. */
const STEP_PRE_ROLL = 0.015;

// Fade at each end of a slice. Short enough not to soften the transient that
// makes a footstep a footstep, long enough to kill the edge click -- see the
// note in #playStep.
const STEP_ATTACK = 0.003;
const STEP_RELEASE = 0.006;

/**
 * Slice a recording of walking into single footsteps.
 *
 * MEASURED AT LOAD rather than typed in as a table of times, so replacing
 * walking_audio.mp3 with a different recording needs no code change -- the same
 * reasoning as the breathing loop's measured window, but automated because
 * there are dozens of onsets here rather than two.
 *
 * A 10 ms peak envelope, then local maxima above a fraction of the file's own
 * peak, with a refractory gap so one footstep's decay cannot register as the
 * next footstep. The supplied files give 8 onsets at a median 0.56 s (1.79
 * steps/s) and 61 at 0.27 s (3.70 steps/s), which is exactly what walking and
 * running recordings should look like -- if a future file yields one slice or
 * two hundred, the assertion in #loadFootsteps says so rather than letting it
 * quietly sound wrong.
 *
 * `refractory` is PER FILE, and the default is the one the two files above were
 * measured with. A recording whose footfalls are not single transients -- the
 * Level 2 metal steps land heel and toe 0.13 s apart -- passes its own value
 * rather than this one being loosened for everybody.
 */
function detectFootstepSlices(buffer, { refractorySeconds = 0.12 } = {}) {
  const d = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const hop = Math.max(1, Math.round(sr * 0.01));
  const env = [];
  for (let b = 0; b + hop <= d.length; b += hop) {
    let m = 0;
    for (let i = b; i < b + hop; i++) {
      const a = Math.abs(d[i]);
      if (a > m) m = a;
    }
    env.push(m);
  }
  let peak = 0;
  for (const e of env) if (e > peak) peak = e;
  if (peak <= 0) return [];
  // Stage one: bring THIS RECORDING's loudest footfall to the target, which is
  // what closes the 23.7 dB gap between the two supplied files.
  const fileGain = STEP_TARGET_PEAK / peak;

  const threshold = peak * 0.18;
  // In 10 ms envelope frames. 120 ms by default: shorter than any real stride.
  const refractory = Math.round(refractorySeconds * 100);
  const onsets = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < threshold) continue;
    if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
    if (onsets.length && i - onsets[onsets.length - 1] < refractory) continue;
    onsets.push(i);
  }

  return onsets.map((idx, k) => {
    const start = Math.max(0, idx * 0.01 - STEP_PRE_ROLL);
    // Run to the NEXT onset, so a slice carries its own decay tail and stops
    // before the following foot lands. The last one runs to the end of the
    // recording, which is where its tail already is.
    const end = k + 1 < onsets.length ? onsets[k + 1] * 0.01 : buffer.duration;
    let slicePeak = 0;
    const from = Math.floor(start * sr);
    const to = Math.min(d.length, Math.floor(end * sr));
    for (let i = from; i < to; i++) {
      const a = Math.abs(d[i]);
      if (a > slicePeak) slicePeak = a;
    }
    // Stage two: lift a quiet slice PARTWAY toward its file's peak. At
    // STEP_EVEN = 1 this is full per-slice normalisation, which flattens the
    // performance; at 0 it is none, and the shuffle audibly jumps.
    const rel = slicePeak > 0 ? Math.pow(peak / slicePeak, STEP_EVEN) : 0;
    return {
      offset: start,
      duration: Math.max(0.05, end - start),
      gain: Math.min(STEP_MAX_MAKEUP, fileGain * rel)
    };
  });
}

// Default master level, matched to what start() used to hardcode so a player
// who never opens the settings menu hears exactly what they always heard.
const DEFAULT_MASTER_VOLUME = 0.5;

// The placeholder session tape's sounds (see setTapeHiss and tapeSound): the
// hiss under everything, and the alarm at the end -- two tones, each held this
// long, for this many rounds, which outlasts what is left of the tape.
const TAPE_HISS_LEVEL = 0.035;
const TAPE_ALARM_LEVEL = 0.05;
const TAPE_ALARM_TONE_SECONDS = 0.36;
const TAPE_ALARM_CYCLES = 8;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windSource = null;
    // The trolley rattle loop, built on first use -- see setTrolleyRattle().
    this.rattleGain = null;
    this.rattleNodes = null;

    // Settable before start(): the settings menu can call this from a value it
    // restored out of localStorage before the player has even clicked through
    // the start screen (i.e. before there is an AudioContext to hold it).
    this.masterVolume = DEFAULT_MASTER_VOLUME;

    // Breathing state lives here rather than in start() because every public
    // breathing method is safe to call before start(), before the file has
    // finished decoding, and after dispose() -- main.js drives this from
    // level scripts that know nothing about load order.
    this.breathGain = null;
    this.breathSource = null;
    this.breathFade = null;
    this.breathBuffer = null;
    this.breathLoading = null;
    this.breathWanted = false;
    this.breathWarned = false;
    this.breathLevel = BREATH_BASE_LEVEL;

    // Voice bus. Like the breathing state above, this lives on the instance
    // rather than in start(), so playVoice() is safe to call at any point in
    // the load order -- the story fires lines from level scripts that know
    // nothing about whether audio has been unlocked yet.
    this.voiceGain = null;
    this.voiceSource = null;
    this.voiceGeneration = 0;
    this.voiceBuffers = new Map();
    this.voiceWarned = new Set();

    // Footstep state, on the instance for the same reason as the two buses
    // above: main.js drives updateFootsteps() from the frame loop, which starts
    // running before the player has clicked through the start screen and so
    // before there is a context or a decoded buffer to play out of.
    this.stepGain = null;
    this.stepWalk = null;
    this.stepRun = null;
    // null rather than 0 so the first frame RESYNCS instead of counting the
    // distance from phase 0 as a footfall.
    this.stepPhase = null;
    this.stepFoot = false;
    // Which STEP_SURFACES entry walking uses, and the sets loaded for them.
    this.stepSurface = null;
    this.stepSurfaceSets = {};

    // The director's cues: buses, decoded buffers by name, and the echo. On
    // the instance for the same load-order reason as everything above.
    this.buses = {};
    this.breathDuck = null;
    this.cueBuffers = new Map();
    this.cueWarned = new Set();
    this.echo = null;

    // The session tape: its video's source node (one per element, ever), and
    // the placeholder's hiss and alarm, so they can be cut when it stops.
    this.mediaSources = null;
    this.tapeHissSource = null;
    this.tapeAlarmNodes = null;
  }

  start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    // Hearing, after everything else: a lowpass that is wide open (and so
    // does nothing) except while someone is coming round -- see setMuffle().
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = MUFFLE_OPEN_HZ;
    this.muffle.Q.value = 0;
    this.master.connect(this.muffle).connect(this.ctx.destination);
    this.#startWindDrone();

    // Its own gain node on the way to the master, so breathing intensity can
    // be driven by the story without dragging the wind and thunder with it.
    this.breathGain = this.ctx.createGain();
    this.breathGain.gain.value = this.breathLevel * BREATH_MAKEUP;
    // A duck stage after the dial, for the caught sting -- the dial itself is
    // the story's, and setBreathing() ramps it on its own schedule.
    this.breathDuck = this.ctx.createGain();
    this.breathGain.connect(this.breathDuck).connect(this.master);

    // Its own bus, beside breathGain rather than under it: the story's menace
    // dial must never change how loud a plot line is.
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = VOICE_LEVEL;
    this.voiceGain.connect(this.master);

    // Its own bus again, so footsteps can be balanced against the ambience
    // without the story's breathing dial or a voice line moving them.
    this.stepGain = this.ctx.createGain();
    this.stepGain.gain.value = 1;
    this.stepGain.connect(this.master);

    for (const name of CUE_BUSES) {
      const bus = this.ctx.createGain();
      bus.connect(this.master);
      this.buses[name] = bus;
    }

    // Fetched here and not at module load: decodeAudioData needs a context,
    // and a context before the user gesture is a context the browser blocks.
    this.#loadBreathing();
    const loading = [this.breathLoading];
    loading.push(this.#loadFootstepSet(WALK_STEP_URL, 'walking').then((set) => { this.stepWalk = set; }));
    loading.push(this.#loadFootstepSet(RUN_STEP_URL, 'running').then((set) => { this.stepRun = set; }));
    for (const [key, surface] of Object.entries(STEP_SURFACES)) {
      loading.push(this.#loadFootstepSet(cueUrl(surface.cue), surface.cue, surface)
        .then((set) => { this.stepSurfaceSets[key] = set; }));
    }
    loading.push(this.#loadClip(TROLLEY_ROLL_URL).then((buffer) => { this.trolleyRollBuffer = buffer; }));
    loading.push(this.#loadClip(TROLLEY_CRASH_URL).then((buffer) => { this.trolleyCrashBuffer = buffer; }));
    // Every director cue, in the background. Nothing waits on these: a cue
    // asked for before its buffer lands is skipped, not queued -- see cue().
    for (const name of CUE_NAMES) {
      loading.push(this.#loadClip(cueUrl(name)).then((buffer) => {
        if (buffer && this.ctx) this.cueBuffers.set(name, buffer);
      }));
    }
    this.ready = Promise.all(loading);
  }

  // ---------- the director's cues ----------

  /**
   * The decoded buffer for a cue, or null. Null is never an error: the file may
   * not be in this build, or may still be decoding, and either way the cue is
   * simply not heard this time. Says which, once per cue.
   */
  cue(name) {
    const buffer = this.cueBuffers.get(name);
    if (buffer) return buffer;
    if (!this.cueWarned.has(name)) {
      this.cueWarned.add(name);
      console.info(cueUrl(name)
        ? `[audio] "${name}" has not finished loading -- skipped this time`
        : `[audio] no recording for "${name}" -- that cue is silent`);
    }
    return null;
  }

  /**
   * Start a sound on one of the director's buses -- see spatial.js's
   * createEmitter for the options. Null before start() or after dispose().
   */
  emit(bus, opts) {
    if (!this.ctx) return null;
    return createEmitter(this.ctx, this.buses[bus] ?? this.master, opts);
  }

  /** The shared echo's input, built the first time something sends to it. */
  echoInput() {
    if (!this.ctx) return null;
    // Into the ambience bus, so the sting's duck takes the echo down with the dry.
    if (!this.echo) this.echo = createEchoBus(this.ctx, this.buses.amb);
    return this.echo.input;
  }

  /** The ears follow `object3D` -- call once a frame, after it has moved. */
  updateListener(object3D) {
    if (this.ctx && object3D) syncListener(this.ctx, object3D);
  }

  /**
   * Pull some buses down and bring them back: `db` (negative) over `attack`,
   * held for `hold`, back to unity over `release`, all in seconds. Groups are
   * the cue buses plus 'breath' and 'steps'. Ramped from wherever the stage
   * is, so a second duck over a first does not jump.
   */
  duck(groups, db, { attack = 0.05, hold = 0, release = 0.8 } = {}) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const floor = 10 ** (db / 20);
    for (const name of groups) {
      const param = this.#duckStage(name)?.gain;
      if (!param) continue;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(floor, now + attack);
      param.setValueAtTime(floor, now + attack + hold);
      param.linearRampToValueAtTime(1, now + attack + hold + release);
    }
  }

  /** Every duck stage back to unity at once -- a restart must not inherit a dip. */
  clearDucks() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const name of [...CUE_BUSES, 'breath', 'steps']) {
      const param = this.#duckStage(name)?.gain;
      if (!param) continue;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(1, now + 0.05);
    }
  }

  #duckStage(name) {
    if (name === 'breath') return this.breathDuck;
    // stepGain sits at a constant 1 -- its level lives in STEP_LEVEL -- so it
    // doubles as the steps' duck stage.
    if (name === 'steps') return this.stepGain;
    return this.buses[name] ?? null;
  }

  /**
   * Which floor the player is walking on: a level key from STEP_SURFACES, or
   * anything else for the default recording. Walking only -- a sprint is the
   * running recording everywhere. Until a surface's own file has decoded it
   * walks on the default rather than in silence.
   */
  setFootstepSurface(key) {
    this.stepSurface = key in STEP_SURFACES ? key : null;
  }

  /** Fetches and decodes one recording; resolves null if there is none or it will not decode. */
  #loadClip(url) {
    if (!url) return Promise.resolve(null);
    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => this.ctx?.decodeAudioData(bytes) ?? null)
      .catch((err) => {
        console.warn(`AudioEngine: could not load ${url}`, err);
        return null;
      });
  }

  // Suspends the whole AudioContext rather than just zeroing gain, so the
  // wind drone and any scheduled thunder/creak cues genuinely stop
  // processing while paused (menu open / pointer unlocked) instead of
  // silently running on in the background.
  pause() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * The settings-menu volume slider, 0..1. Stepped rather than ramped: this is
   * a direct user drag, not a story beat, so it should track the slider with no
   * lag -- the ramping in setBreathing() is for a level the game changes on its
   * own timeline, which is a different thing.
   *
   * Safe before start(): the value is remembered and applied the moment the
   * context (and its master gain node) actually exists.
   */
  setMasterVolume(level) {
    this.masterVolume = Math.min(1, Math.max(0, level));
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  // ---------- breathing loop ----------

  // Records the intent and then tries; the context, the decoded buffer and
  // the game's own "start breathing now" beat can land in any order, so
  // whichever is last actually starts the sound. Calling this twice does
  // nothing the second time.
  startBreathing() {
    this.breathWanted = true;
    this.#playBreathing();
  }

  stopBreathing() {
    this.breathWanted = false;
    this.#releaseBreathing(BREATH_FADE);
  }

  /**
   * How muffled the whole world sounds, 0 (clear) .. 1 (through water, or
   * through sleep). For waking: the room comes in dull and close, and clears
   * as the eyes do. Ramped over `seconds` on a log scale, which is how a
   * filter sweep is heard -- a linear sweep in Hz sounds like it does nothing
   * until the very end. Safe before start(): it simply does nothing.
   */
  setMuffle(amount, seconds = 0) {
    if (!this.ctx || !this.muffle) return;
    const a = Math.min(1, Math.max(0, amount));
    const hz = MUFFLE_OPEN_HZ * Math.pow(MUFFLE_SHUT_HZ / MUFFLE_OPEN_HZ, a);
    const f = this.muffle.frequency;
    const now = this.ctx.currentTime;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    if (seconds > 0) f.exponentialRampToValueAtTime(hz, now + seconds);
    else f.setValueAtTime(hz, now);
  }

  /** Breathing volume, 0..1, independent of every other sound. */
  setBreathing(level) {
    // Clamped and remembered even with no context yet, so a level set before
    // start() is the level the loop comes in at.
    this.breathLevel = Math.min(1, Math.max(0, level));
    if (!this.ctx || !this.breathGain) return;
    const gain = this.breathGain.gain;
    const now = this.ctx.currentTime;
    // Ramped, not assigned: a step change on a gain node is an audible click.
    // Anchoring at the current value first is what stops a ramp that is still
    // in flight from jumping when this one is scheduled over it.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.breathLevel * BREATH_MAKEUP, now + BREATH_LEVEL_RAMP);
  }

  // fetch + decodeAudioData rather than an HTMLAudioElement, because only an
  // AudioBufferSourceNode loops sample-accurately -- an <audio> element's
  // loop leaves an audible hitch at the wrap, which on a breath is the one
  // thing that gives the illusion away. A missing or undecodable file warns
  // once and leaves the rest of the world running, the same as a failed
  // model load in main.js.
  #loadBreathing() {
    if (this.breathLoading) return;
    if (!BREATHING_URL) {
      this.#warnBreathing('no breathing loop found -- expected src/assets/audio/breathing.m4a (or .mp3/.ogg/.wav)');
      return;
    }
    this.breathLoading = fetch(BREATHING_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buffer) => {
        // dispose() may have closed the context while this was in flight.
        if (!this.ctx) return;
        this.breathBuffer = buffer;
        if (this.breathWanted) this.#playBreathing();
      })
      .catch((err) => {
        this.#warnBreathing(`could not load the breathing loop, continuing without it: ${err.message}`);
      });
  }

  #playBreathing() {
    if (!this.ctx || !this.breathBuffer || this.breathSource) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.breathBuffer;
    src.loop = true;
    // Also guarded on the buffer being long enough to hold the window: a
    // shorter file dropped in with the measured constants left behind would
    // clamp to loopStart >= loopEnd, which the spec turns into "play once and
    // stop" -- a loop that silently isn't one. Falling back to the whole
    // buffer is at least still a loop.
    const windowed = BREATH_LOOP_END > BREATH_LOOP_START && src.buffer.duration >= BREATH_LOOP_END;
    if (windowed) {
      src.loopStart = BREATH_LOOP_START;
      src.loopEnd = BREATH_LOOP_END;
    }

    // A fade gain per source rather than fading this.breathGain: that one is
    // the story's intensity dial, and a fade-out on stop must not stomp on a
    // level the game set (or be stomped on by a setBreathing() mid-fade).
    const fade = ctx.createGain();
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + BREATH_FADE);

    src.connect(fade).connect(this.breathGain);
    // Started at the loop window, not at the head of the buffer, so the part
    // the window excludes (encoder silence, then the handling thump) is never
    // heard at all -- not even on the first pass.
    src.start(now, windowed ? BREATH_LOOP_START : 0);
    this.breathSource = src;
    this.breathFade = fade;
  }

  #releaseBreathing(fadeSeconds) {
    const src = this.breathSource;
    const fade = this.breathFade;
    // Dropped from the instance immediately, before the fade has even run: an
    // AudioBufferSourceNode is single-use, so a startBreathing() right after
    // this has to build a fresh one instead of waiting on a dead node.
    this.breathSource = null;
    this.breathFade = null;
    if (!src || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (fade && fadeSeconds > 0) {
      fade.gain.cancelScheduledValues(now);
      fade.gain.setValueAtTime(fade.gain.value, now);
      fade.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    }
    src.stop(now + fadeSeconds);
    // Unhooked on its own `ended` event, otherwise every stop/start cycle
    // leaves another finished source and gain hanging off breathGain.
    src.onended = () => {
      src.disconnect();
      fade?.disconnect();
    };
  }

  #warnBreathing(message) {
    if (this.breathWarned) return;
    this.breathWarned = true;
    console.warn(`[audio] ${message}`);
  }

  // ---------- voice ----------

  /**
   * Whether a voice clip has been recorded for `key` -- for text that should
   * stand in for a line nobody has voiced yet.
   *
   * @param {string} key - the line's voice key, as a dialogue file writes it.
   * @returns {boolean} true if playVoice(key) would have a clip to play.
   */
  hasVoice(key) {
    return Boolean(key && voiceUrl(key));
  }

  /**
   * Play one voice clip, cutting off whatever was speaking.
   *
   * One voice at a time on purpose, and it matches the caption box: two lines
   * cannot be on screen at once, so two voices must not be either. Returns
   * true if a clip actually started, so a caller can tell the difference
   * between "spoken" and "text-only" -- which is the state the whole game
   * ships in until the clips are recorded.
   *
   * A missing key is not an error. Text is the primary channel here; audio is
   * an enhancement that may never arrive for a given line.
   */
  preloadVoice(key) {
    if(!key||!this.ctx)return Promise.resolve(null);
    const url=voiceUrl(key);if(!url)return Promise.resolve(null);
    const cached=this.voiceBuffers.get(key);if(cached)return Promise.resolve(cached);
    const pending=fetch(url).then(res=>{if(!res.ok)throw Error(`HTTP ${res.status}`);return res.arrayBuffer();})
      .then(bytes=>this.ctx?.decodeAudioData(bytes)).then(buffer=>{
        if(buffer)this.voiceBuffers.set(key,buffer);return buffer;
      }).catch(error=>{this.voiceBuffers.delete(key);console.warn(`[audio] could not load ${key}: ${error.message}`);return null;});
    this.voiceBuffers.set(key,pending);return pending;
  }

  playVoice(key,options={}) {
    this.stopVoice();
    const generation=this.voiceGeneration;
    if(!key||!this.ctx||!this.voiceGain||!voiceUrl(key)){options.onFailed?.();return false;}
    const start=buffer=>{
      if(generation!==this.voiceGeneration)return;
      if(buffer)this.#startVoice(buffer,options);else options.onFailed?.();
    };
    const cached=this.voiceBuffers.get(key);
    if(cached instanceof AudioBuffer)start(cached);
    else this.preloadVoice(key).then(start);
    return true;
  }

  /** Invalidates pending decodes too: interrupted lines never start later. */
  stopVoice() {
    this.voiceGeneration=(this.voiceGeneration||0)+1;
    const src=this.voiceSource;this.voiceSource=null;
    if(!src)return;
    src.__interrupted=true;
    try{src.stop();}catch{}
    src.disconnect();src.__fade?.disconnect();src.__onInterrupted?.();
  }

  #startVoice(buffer,options={}) {
    if(!this.ctx||!this.voiceGain)return;
    const ctx=this.ctx,src=ctx.createBufferSource(),fade=ctx.createGain();
    src.buffer=buffer;fade.gain.setValueAtTime(0,ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1,ctx.currentTime+.05);
    src.connect(fade).connect(this.voiceGain);src.__fade=fade;
    src.__onInterrupted=options.onInterrupted;
    src.onended=()=>{
      src.disconnect();fade.disconnect();
      if(this.voiceSource===src)this.voiceSource=null;
      if(!src.__interrupted)options.onEnded?.();
    };
    this.voiceSource=src;src.start();options.onStarted?.(buffer,src);
  }

  #noiseBuffer(seconds = 2) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  #startWindDrone() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(4);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    const gain = ctx.createGain();
    gain.gain.value = 0.06;

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.windSource = src;
  }

  thunder() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(1.4);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(now + 1.4);
  }

  // ---------- player footsteps ----------
  //
  // NOT to be confused with footsteps() further down, which synthesises a
  // scripted pass-by for something that is not the player. This one plays the
  // supplied recordings, one slice per actual footfall.

  /**
   * Advance the footstep clock. Call once a frame, after player.update().
   *
   * TAKES THE PLAYER'S OWN bobPhase rather than a speed or a timer, and that is
   * the whole design. bobPhase advances with DISTANCE ACTUALLY TRAVELLED after
   * collision, so three things fall out for nothing:
   *
   *   walking into a wall makes no footsteps, because the bob already stops
   *   crouch-walking steps slower, because it covers ground slower
   *   a cutscene makes none, because player.update() returns before moving
   *
   * A timer-driven or loop-driven version would have to special-case every one
   * of those, and would drift out of step with the camera bob and the hands'
   * walkbob besides -- bobPhase is the single clock all of them already share.
   *
   * MISSED STEPS AT LOW FRAME RATE, stated because it is a real limit and a
   * benign one. The wrap test below sees one step per crossing, so a frame that
   * advances the phase by more than pi drops a step. main.js clamps dt to
   * 0.05 s and the fastest the phase moves is sprint: 2*pi * 3.526 / 2.17 =
   * 10.2 rad/s, so a worst-case frame advances 0.51 rad against the pi it would
   * need. There is a factor of six in hand, and at a frame rate low enough to
   * break that, a dropped footstep is not the problem.
   */
  updateFootsteps(bobPhase, { moving = 0, sprint = 0, crouch = 0, impact = 1, silent = false } = {}) {
    if (!this.ctx) return;
    const t = ((bobPhase - STEP_PHASE_OFFSET) % Math.PI + Math.PI) % Math.PI;
    const prev = this.stepPhase;
    this.stepPhase = t;
    // Standing still: resync and fire nothing. Without the gate, the tiny
    // residual phase left over when the player stops could cross a trigger and
    // drop one unattached footstep after they have come to a halt.
    // NO `moving` GATE, and the version that had one was wrong twice over. Its
    // stated reason -- residual phase drift after a stop -- does not exist:
    // PointerLockPlayer initialises `walked` to 0 and only assigns it inside
    // `if (MOVE.lengthSq() > 0)`, so the frame the keys come up it adds exactly
    // 0 and the phase FREEZES. A frozen phase gives t === prev, which the test
    // below already rejects, so the gate bought nothing. What it cost was the
    // first step of a walk: `moving` is a lerp with BOB_BLEND 0.16 and needs
    // three frames at 60 Hz to pass 0.2, the phase moves 0.41 rad in those
    // three frames against trigger points pi apart, and stepPhase is written
    // every frame regardless -- so roughly one walk-start in eight had its
    // opening footfall consumed in silence.
    if (silent || prev === null) return;
    if (t >= prev) return;                       // no wrap, no footfall
    const walk = (this.stepSurface && this.stepSurfaceSets[this.stepSurface]) || this.stepWalk;
    const set = sprint > 0.5 ? this.stepRun : walk;
    if (!set || !set.slices.length) return;

    // Alternating weight, for the same reason the synthesised footsteps() does
    // it: a person does not put both feet down equally hard, and a perfectly
    // even tread sounds like a metronome rather than like somebody walking.
    this.stepFoot = !this.stepFoot;
    const level = (crouch > 0.5 ? STEP_CROUCH_LEVEL : STEP_LEVEL)
      * (this.stepFoot ? 1 : 0.82) * Math.min(1.3,Math.max(.5,impact));
    this.#playStep(set, level, this.stepFoot ? -0.12 : 0.12);
  }

  #playStep(set, level, pan) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const slice = set.slices[Math.floor(Math.random() * set.slices.length)];
    if (!slice) return;

    const src = ctx.createBufferSource();
    src.buffer = set.buffer;
    // A couple of percent of detune per step. Real footfalls are never twice
    // the same, and without it the shuffle through a handful of slices starts
    // to sound like a shuffle through a handful of slices.
    const rate = 0.96 + Math.random() * 0.08;
    src.playbackRate.value = rate;

    // Its own gain node per step, not a shared one: these overlap by design at
    // a run, and a single node would have each new step stamp on the previous
    // one's tail. Same reason the breathing loop and each voice line have one.
    const out = ctx.createGain();

    // RAMPED AT BOTH ENDS, which is not polish -- without it every footstep
    // clicks. A slice is cut out of the middle of a recording: it ends where
    // the NEXT foot lands, so the signal there is not silence, and jumping it
    // to zero in one sample is a broadband tick. Measured on these two files,
    // the boundary sample reaches -16.3 dBFS on the running recording and the
    // click lands at -20.7 dBFS after the slice makeup -- about 13 dB under
    // the footstep it is attached to, on every step, at 3.25 a second while
    // sprinting. The start needs it too: 15 ms before an onset is mid-decay of
    // the previous footfall, not silence. Every other one-shot in this class
    // (thunder, creak, bulbPop, the synthesised footsteps) already ramps both
    // ends for exactly this reason.
    //
    // `duration` in start(when, offset, duration) is in BUFFER seconds, so the
    // slice lasts duration / playbackRate of WALL CLOCK. Scheduling the release
    // at now + slice.duration would miss the cut by up to 4% and the ramp would
    // land in the wrong place -- which is the same bug, quieter.
    const peak = level * slice.gain;
    const end = now + slice.duration / rate;
    const hold = Math.max(now + STEP_ATTACK, end - STEP_RELEASE);
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(peak, now + STEP_ATTACK);
    out.gain.setValueAtTime(peak, hold);
    out.gain.linearRampToValueAtTime(0, end);

    let tail = out;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);
      out.connect(panner);
      tail = panner;
    }
    tail.connect(this.stepGain);
    src.connect(out);
    src.start(now, slice.offset, slice.duration);
    // AudioBufferSourceNode is single-use; drop the graph when it finishes so a
    // long session does not accumulate a node per step taken.
    src.onended = () => {
      try {
        src.disconnect();
        out.disconnect();
        if (tail !== out) tail.disconnect();
      } catch { /* already torn down */ }
    };
  }

  /**
   * @param opts.refractorySeconds  this file's slicer refractory -- see
   *        detectFootstepSlices. Omitted, the default the shipped sets use.
   * @param opts.cue  set for a STEP_SURFACES file, which lives with the other
   *        cues rather than at the top of src/assets/audio/.
   */
  #loadFootstepSet(url, label, { refractorySeconds, cue } = {}) {
    if (!url) {
      const expected = cue
        ? `src/assets/audio/foley/${cue}.m4a. That level walks on the default recording instead.`
        : `src/assets/audio/${label}_audio.mp3 (or .m4a/.ogg/.wav). Footsteps for this gait will be silent.`;
      console.warn(`AudioEngine: no ${label} recording found -- expected ${expected}`);
      return Promise.resolve(null);
    }
    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buffer) => {
        const slices = detectFootstepSlices(buffer, { refractorySeconds });
        // A recording that yields no steps is the one failure that would
        // otherwise be silent in every sense -- the game would run, footsteps
        // would simply never play, and nothing would say why.
        if (!slices.length) {
          console.error(`AudioEngine: found no footsteps in the ${label} recording `
            + `(${buffer.duration.toFixed(2)} s). detectFootstepSlices needs clear `
            + 'transients above 18% of the file peak, at least 120 ms apart. A '
            + 'continuous or heavily compressed recording will not slice.');
        } else if (slices.length < STEP_SLICES_MIN || slices.length > STEP_SLICES_MAX) {
          console.warn(`AudioEngine: the ${label} recording sliced into ${slices.length} `
            + `footsteps, outside ${STEP_SLICES_MIN}-${STEP_SLICES_MAX}. It is probably not `
            + 'step-shaped for this detector: pre-slice it, or give it its own refractory.');
        }
        return { buffer, slices };
      })
      .catch((err) => {
        console.warn(`AudioEngine: could not load the ${label} recording, `
          + `continuing without it: ${err.message}`);
        return null;
      });
  }

  /**
   * Slow, heavy footsteps on boards, receding or approaching.
   *
   * Synthesised like the thunder and the creak rather than sampled, for the
   * reason at the top of this file. A footstep is a low thump plus a short
   * board-resonance ring, so it is a filtered noise burst with a fast attack
   * and a bandpass partial on top -- a plain lowpass thump alone reads as a
   * door closing, not as weight on a floorboard.
   *
   * @param count  how many steps
   * @param spacing seconds between them. 0.62 is a slow walk; anything under
   *                0.4 reads as running, which this creature never does past a
   *                closed door.
   * @param pan    -1 to 1, swept across the steps, so the thing passes rather
   *                than pacing on the spot. The whole beat is worthless without
   *                it: footsteps with no travel are just noise.
   */
  footsteps({ count = 6, spacing = 0.62, pan = 0, panTo = null, level = 0.5 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      const at = start + i * spacing;
      const t = count > 1 ? i / (count - 1) : 0;
      const where = panTo === null ? pan : pan + (panTo - pan) * t;

      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) panner.pan.setValueAtTime(Math.max(-1, Math.min(1, where)), at);

      const out = ctx.createGain();
      // Alternating weight, because a person does not put both feet down
      // equally hard, and a perfectly even tread sounds like a metronome.
      const weight = level * (i % 2 === 0 ? 1 : 0.78);
      out.gain.setValueAtTime(0.0001, at);
      out.gain.exponentialRampToValueAtTime(weight, at + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);

      const thump = ctx.createBufferSource();
      thump.buffer = this.#noiseBuffer(0.4);
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 130;

      const board = ctx.createBufferSource();
      board.buffer = this.#noiseBuffer(0.4);
      const ring = ctx.createBiquadFilter();
      ring.type = 'bandpass';
      ring.frequency.value = 320 + Math.random() * 180;
      ring.Q.value = 6;
      const ringGain = ctx.createGain();
      ringGain.gain.value = 0.35;

      thump.connect(low).connect(out);
      board.connect(ring).connect(ringGain).connect(out);
      if (panner) out.connect(panner).connect(this.master);
      else out.connect(this.master);

      thump.start(at);
      thump.stop(at + 0.4);
      board.start(at);
      board.stop(at + 0.4);
    }
    // Seconds the whole run occupies, so a script can wait exactly as long as
    // it actually takes rather than guessing.
    return count * spacing + 0.34;
  }

  /**
   * A filament failing: a rising mains whine that stops dead, and the glass.
   *
   * The whine is a 60 Hz sine (mains hum, doubled) swelling as the bulb draws
   * harder, cut off rather than faded -- a fade would read as the bulb dimming,
   * and it does not dim, it stops. The pop on top is a short bandpassed noise
   * burst, which is what a small glass envelope actually sounds like.
   */
  bulbPop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(60, now);
    whine.frequency.linearRampToValueAtTime(96, now + 0.62);
    const whineGain = ctx.createGain();
    whineGain.gain.setValueAtTime(0.0001, now);
    whineGain.gain.exponentialRampToValueAtTime(0.11, now + 0.6);
    // Cut, not faded. It stops; it does not dim.
    whineGain.gain.setValueAtTime(0.11, now + 0.66);
    whineGain.gain.linearRampToValueAtTime(0, now + 0.675);
    whine.connect(whineGain).connect(this.master);
    whine.start(now);
    whine.stop(now + 0.7);

    const pop = ctx.createBufferSource();
    pop.buffer = this.#noiseBuffer(0.3);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200;
    band.Q.value = 1.6;
    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.0001, now + 0.66);
    popGain.gain.exponentialRampToValueAtTime(0.34, now + 0.672);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.79);
    pop.connect(band).connect(popGain).connect(this.master);
    pop.start(now + 0.66);
    pop.stop(now + 0.82);
  }

  creak() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(0.6);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700 + Math.random() * 400;
    filter.Q.value = 4;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(now + 0.6);
  }

  /**
   * A low growl from close behind the player (core/StairsScare.js).
   *
   * Two layers, built like every other effect here:
   *   - the throat: two detuned saws around 60 Hz, low-passed, with their
   *     level shaken by a fast irregular flutter. The flutter is what turns a
   *     drone into a rattle in a chest.
   *   - the breath: band-passed noise under it, the air being pushed out.
   *
   * It swells in, holds, and dies away rather than stopping, because it is
   * something breathing out, not something switched off.
   *
   * @param {number} [seconds] - how long it lasts, end to end.
   */
  growl(seconds = 2.4) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const end = now + seconds;

    const level = ctx.createGain();
    level.gain.setValueAtTime(0.0001, now);
    level.gain.exponentialRampToValueAtTime(0.85, now + seconds * 0.3);
    level.gain.setValueAtTime(0.85, now + seconds * 0.6);
    level.gain.exponentialRampToValueAtTime(0.0001, end);
    level.connect(this.master);

    // The throat.
    const throatFilter = ctx.createBiquadFilter();
    throatFilter.type = 'lowpass';
    throatFilter.frequency.value = 420;
    throatFilter.Q.value = 2.2;
    const flutter = ctx.createGain();
    flutter.gain.value = 0.5;
    throatFilter.connect(flutter).connect(level);
    const flutterRate = ctx.createOscillator();
    flutterRate.type = 'square';
    flutterRate.frequency.setValueAtTime(11, now);
    flutterRate.frequency.linearRampToValueAtTime(7, end);
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.32;
    flutterRate.connect(flutterDepth).connect(flutter.gain);
    const sources = [flutterRate];
    for (const detune of [0, -38]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(68, now);
      osc.frequency.linearRampToValueAtTime(52, end);
      osc.detune.value = detune;
      osc.connect(throatFilter);
      sources.push(osc);
    }

    // The breath.
    const breath = ctx.createBufferSource();
    breath.buffer = this.#noiseBuffer(seconds);
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 340;
    breathFilter.Q.value = 0.9;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.35;
    breath.connect(breathFilter).connect(breathGain).connect(level);
    sources.push(breath);

    for (const source of sources) {
      source.start(now);
      source.stop(end + 0.05);
    }
  }

  /**
   * THE ROAR, synthesised: what the monster does when you get into one of
   * Annabelle's rooms and it cannot follow. The stand-in until a recording is
   * chosen -- AudioDirector.roar() plays monster/roar if the build has it.
   *
   * A throat, not a siren: three saws a fifth or so apart, rising into the
   * roar and sagging out of it, driven through a hard clipper and two vowel
   * formants; a rasp of noise chopped at vocal-fry rate; and a sub under it.
   * Panned by the caller toward where it is, and sent to the shared echo so
   * it carries down the corridors.
   *
   * @param {object} [o]
   * @param {number} [o.pan] - -1 left .. 1 right
   * @param {number} [o.level] - 0..1.5, how loud it arrives
   * @param {number} [o.seconds]
   */
  roar({ pan = 0, level = 1, seconds = 2.3 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const end = now + seconds;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(Math.max(0.001, level), now + 0.14);
    out.gain.setValueAtTime(Math.max(0.001, level * 0.85), now + seconds * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(this.master);
    const echo = this.echoInput?.();
    if (echo) {
      const send = ctx.createGain();
      send.gain.value = 0.45;
      panner.connect(send).connect(echo);
    }

    // The throat: clipped, then shaped into a vowel.
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 4);
    clip.curve = curve;
    const throat = ctx.createGain();
    throat.gain.value = 0.55;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 2400;
    for (const [freq, q, gain] of [[430, 2.2, 1.0], [1150, 3.5, 0.55]]) {
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = freq;
      formant.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      clip.connect(formant).connect(g).connect(low);
    }
    low.connect(throat).connect(out);
    const sources = [];
    for (const [ratio, detune] of [[1, 0], [1.5, 12], [2.02, -9]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(78 * ratio, now);
      osc.frequency.exponentialRampToValueAtTime(128 * ratio, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(96 * ratio, now + seconds * 0.6);
      osc.frequency.exponentialRampToValueAtTime(64 * ratio, end);
      osc.detune.value = detune;
      osc.connect(clip);
      sources.push(osc);
    }

    // The rasp: noise, chopped at vocal-fry rate.
    const rasp = ctx.createBufferSource();
    rasp.buffer = this.#noiseBuffer(seconds);
    const raspBand = ctx.createBiquadFilter();
    raspBand.type = 'bandpass';
    raspBand.frequency.value = 900;
    raspBand.Q.value = 0.7;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const fry = ctx.createOscillator();
    fry.type = 'square';
    fry.frequency.setValueAtTime(34, now);
    fry.frequency.linearRampToValueAtTime(22, end);
    const fryDepth = ctx.createGain();
    fryDepth.gain.value = 0.45;
    fry.connect(fryDepth).connect(chop.gain);
    rasp.connect(raspBand).connect(chop).connect(out);
    sources.push(rasp, fry);

    // And the chest it comes out of.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(52, now);
    sub.frequency.linearRampToValueAtTime(40, end);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    sub.connect(subGain).connect(out);
    sources.push(sub);

    for (const source of sources) {
      source.start(now);
      source.stop(end + 0.05);
    }
  }

  /**
   * One shake of a dead torch: the batteries knocking inside the barrel. Two
   * short, high clicks a few hundredths apart -- the cells hitting one end of
   * the tube and then the spring -- rather than one, which reads as a switch.
   */
  torchRattle() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const [offset, peak] of [[0, 0.32], [0.045, 0.2]]) {
      const click = ctx.createBufferSource();
      click.buffer = this.#noiseBuffer(0.06);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 3400 + Math.random() * 700;
      band.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.045);
      click.connect(band).connect(gain).connect(this.master);
      click.start(now + offset);
      click.stop(now + offset + 0.06);
    }
  }

  /**
   * The backrooms jump scare's scream (core/JumpScare.js). Four layers, built
   * here like every other effect rather than loaded:
   *
   *   - the shriek: three detuned saws, distorted, sliding from a shout down
   *     to a groan -- detuning is what makes it a throat and not a synth
   *   - the screech: a square wave with a fast, wide wobble on top, the
   *     part that sets teeth on edge
   *   - the tear: band-passed noise sweeping down, breath through a ruined
   *     mouth
   *   - the hit: a sub thump on the first frame, felt more than heard
   *
   * All of it goes through one compressor, so it is as loud as it can be
   * without clipping into crackle. Returns { stop } so the scare can cut it
   * dead on the black -- the sudden silence is part of the scare.
   */
  jumpScare() {
    if (!this.ctx) return { stop() {} };
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const length = 1.5;
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -14;
    out.knee.value = 6;
    out.ratio.value = 8;
    out.attack.value = 0.002;
    out.release.value = 0.12;
    const level = ctx.createGain();
    level.gain.value = 1.15;
    out.connect(level).connect(this.master);

    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    const sources = [];

    // The shriek.
    const shriekShape = ctx.createWaveShaper();
    shriekShape.curve = curve;
    const shriekFilter = ctx.createBiquadFilter();
    shriekFilter.type = 'bandpass';
    shriekFilter.frequency.setValueAtTime(1800, now);
    shriekFilter.frequency.exponentialRampToValueAtTime(700, now + length);
    shriekFilter.Q.value = 0.8;
    const shriekGain = ctx.createGain();
    shriekGain.gain.setValueAtTime(0.0001, now);
    shriekGain.gain.exponentialRampToValueAtTime(0.42, now + 0.03);
    shriekGain.gain.setValueAtTime(0.42, now + 0.7);
    shriekGain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    shriekShape.connect(shriekFilter).connect(shriekGain).connect(out);
    for (const detune of [0, 23, -31]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(430, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + length);
      osc.detune.value = detune;
      osc.connect(shriekShape);
      sources.push(osc);
    }

    // The screech, with a wobble too fast to be a voice.
    const screech = ctx.createOscillator();
    screech.type = 'square';
    screech.frequency.setValueAtTime(1500, now);
    screech.frequency.exponentialRampToValueAtTime(900, now + 0.9);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 31;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 160;
    wobble.connect(wobbleDepth).connect(screech.frequency);
    const screechGain = ctx.createGain();
    screechGain.gain.setValueAtTime(0.0001, now);
    screechGain.gain.exponentialRampToValueAtTime(0.11, now + 0.04);
    screechGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    screech.connect(screechGain).connect(out);
    sources.push(screech, wobble);

    // The tear: noise, sweeping down.
    const tear = ctx.createBufferSource();
    tear.buffer = this.#noiseBuffer(length);
    const tearFilter = ctx.createBiquadFilter();
    tearFilter.type = 'bandpass';
    tearFilter.frequency.setValueAtTime(3200, now);
    tearFilter.frequency.exponentialRampToValueAtTime(600, now + length);
    tearFilter.Q.value = 1.2;
    const tearGain = ctx.createGain();
    tearGain.gain.setValueAtTime(0.0001, now);
    tearGain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    tearGain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    tear.connect(tearFilter).connect(tearGain).connect(out);
    sources.push(tear);

    // The hit.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(70, now);
    thump.frequency.exponentialRampToValueAtTime(32, now + 0.45);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    thump.connect(thumpGain).connect(out);
    sources.push(thump);

    for (const source of sources) {
      source.start(now);
      source.stop(now + length + 0.05);
    }
    return {
      /** Cut it dead, with only a few milliseconds' fade so it does not click. */
      stop: () => {
        const t = ctx.currentTime;
        level.gain.cancelScheduledValues(t);
        level.gain.setValueAtTime(level.gain.value, t);
        level.gain.linearRampToValueAtTime(0, t + 0.012);
        for (const source of sources) {
          try { source.stop(t + 0.02); } catch { /* already stopped */ }
        }
      }
    };
  }

  /**
   * A newspaper landing on the desk: a dry, crackling slide of paper. Three
   * short bursts of high, narrow noise one after another rather than one long
   * hiss, because paper does not rustle smoothly -- it crackles in creases.
   */
  paperRustle() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bursts = [[0, 0.22, 0.09], [0.12, 0.16, 0.06], [0.24, 0.3, 0.05]];
    for (const [offset, length, level] of bursts) {
      const src = ctx.createBufferSource();
      src.buffer = this.#noiseBuffer(length);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2600 + Math.random() * 1800;
      filter.Q.value = 0.9;

      const gain = ctx.createGain();
      const start = now + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);

      src.connect(filter).connect(gain).connect(this.master);
      src.start(start);
      src.stop(start + length);
    }
  }

  spark() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(0.3);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2200;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(now + 0.3);
  }

  /** A single heavy impact, used for nearby knocks without implying an attack. */
  thump(level = 0.72) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(0.3);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 0.34);
  }

  /**
   * The rattle of a trolley's castors, 0 (silent) to 1 (shoved hard). Called
   * every frame by whoever is pushing one; the level eases toward it.
   *
   * One loop, built the first time it is wanted and then left running at zero
   * gain: noise through a band-pass for the clatter of loose steel, with its
   * level chopped by a fast LFO so it ticks like small wheels over concrete.
   */
  setTrolleyRattle(level) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    // The level reports the rattle every frame, from the moment audio starts --
    // usually before the recording has finished decoding. Nothing is built
    // for a silent call, and if the synthesised stand-in was built while the
    // recording was still loading, it is torn down for the recording now.
    if (this.trolleyRollBuffer && this.rattleGain && !this.rattleIsRecording) {
      this.rattleNodes?.forEach((node) => node.stop());
      this.rattleGain.disconnect();
      this.rattleNodes = null;
      this.rattleGain = null;
    }
    if (!this.rattleGain && level <= 0) return;
    if (!this.rattleGain && this.trolleyRollBuffer) {
      // The recording, looped for as long as the trolley moves.
      const buffer = this.trolleyRollBuffer;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const span = audibleSpan(buffer);
      src.loopStart = span.start;
      src.loopEnd = span.end;
      this.rattleGain = ctx.createGain();
      this.rattleGain.gain.value = 0;
      src.connect(this.rattleGain).connect(this.master);
      src.start(0, span.start);
      this.rattleNodes = [src];
      this.rattleIsRecording = true;
    }
    if (!this.rattleGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.#noiseBuffer(2);
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1900;
      band.Q.value = 1.4;
      // The tick: an LFO swinging a gain between near-silence and full.
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 13;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.45;
      lfo.connect(lfoDepth).connect(chop.gain);
      this.rattleGain = ctx.createGain();
      this.rattleGain.gain.value = 0;
      src.connect(band).connect(chop).connect(this.rattleGain).connect(this.master);
      src.start();
      lfo.start();
      this.rattleNodes = [src, lfo];
    }
    const clamped = Math.max(0, Math.min(1, level));
    // The recording is a real level already; the synthesised rattle is quiet noise.
    const peak = this.rattleIsRecording ? 0.9 : 0.16;
    this.rattleGain.gain.setTargetAtTime(clamped * peak, ctx.currentTime, 0.06);
  }

  /**
   * A steel trolley going over onto concrete with everything on it: one heavy
   * hit, the frame ringing off it, then the instruments landing in a scatter of
   * smaller hits that thin out over most of a second.
   */
  trolleyCrash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.setTrolleyRattle(0);
    if (this.trolleyCrashBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.trolleyCrashBuffer;
      src.connect(this.master);
      // Straight in at the impact, a hair early so its attack is not clipped.
      src.start(0, Math.max(0, audibleSpan(this.trolleyCrashBuffer).start - 0.01));
      return;
    }
    this.thump(0.95);

    // The frame ringing: two inharmonic partials, like a struck steel tube.
    for (const [freq, level, decay] of [[410, 0.09, 1.1], [1130, 0.05, 0.7], [2310, 0.03, 0.45]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * (0.97 + Math.random() * 0.06);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }

    // The instruments: short bright clicks, each quieter and more spread out
    // than the last.
    const clatter = this.#noiseBuffer(0.1);
    let t = 0.04;
    for (let i = 0; i < 14; i++) {
      t += 0.02 + Math.random() * 0.07 * (1 + i * 0.12);
      const src = ctx.createBufferSource();
      src.buffer = clatter;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2400 + Math.random() * 4200;
      band.Q.value = 6;
      const gain = ctx.createGain();
      const peak = 0.5 * Math.pow(0.86, i) * (0.6 + Math.random() * 0.4);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(peak, now + t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.07);
      src.connect(band).connect(gain).connect(this.master);
      src.start(now + t);
      src.stop(now + t + 0.09);
    }
  }

  // ---------- the session tape ----------

  /**
   * Routes a media element's sound through the master gain, so the tape in
   * the basement is as loud as the volume slider says and falls silent with
   * everything else when the game pauses (pause() suspends the whole context).
   *
   * Once per element: a browser allows only one source node per media element,
   * ever, so a second call is a no-op. Before start(), or if the browser
   * refuses, the element simply keeps playing through its own output.
   *
   * @param {HTMLMediaElement} element - the tape's recording.
   */
  connectMediaElement(element) {
    if (!this.ctx || !element || this.mediaSources?.has(element)) return;
    this.mediaSources ??= new Map();
    try {
      const source = this.ctx.createMediaElementSource(element);
      source.connect(this.master);
      this.mediaSources.set(element, source);
    } catch (err) {
      console.warn('AudioEngine: could not route the tape through the mixer', err);
    }
  }

  /**
   * The stand-in tape's hiss: band-passed noise, looped while the tape runs.
   * Only for the stand-in -- the real recording brings its own.
   *
   * @param {boolean} on - start (true) or stop (false) it.
   */
  setTapeHiss(on) {
    if (!this.ctx) return;
    if (!on) {
      this.tapeHissSource?.stop();
      this.tapeHissSource = null;
      return;
    }
    if (this.tapeHissSource) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(2);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = TAPE_HISS_LEVEL;
    src.connect(band).connect(gain).connect(this.master);
    src.start();
    this.tapeHissSource = src;
  }

  /**
   * One of the sounds the placeholder tape plays at its cue -- see
   * SESSION_TAPE_PLACEHOLDER_SOUNDS in story/sessionTape.js.
   *
   * @param {'impact'|'glass'|'alarm'} name - which sound.
   */
  tapeSound(name) {
    if (!this.ctx) return;
    if (name === 'impact') this.thump(0.9);
    else if (name === 'glass') this.#tapeGlass();
    else if (name === 'alarm') this.#tapeAlarm();
  }

  /** Stops everything the placeholder tape started: the hiss and the alarm. */
  stopTapeSounds() {
    this.setTapeHiss(false);
    // The alarm schedules its own stop, and a node stopped twice throws.
    this.tapeAlarmNodes?.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
    });
    this.tapeAlarmNodes = null;
  }

  /** Glass going: one bright crack, then pieces landing for most of a second. */
  #tapeGlass() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const crack = ctx.createBufferSource();
    crack.buffer = this.#noiseBuffer(0.4);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2800;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.4, now + 0.006);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    crack.connect(high).connect(crackGain).connect(this.master);
    crack.start(now);
    crack.stop(now + 0.4);

    const tinkle = this.#noiseBuffer(0.08);
    let t = 0.05;
    for (let i = 0; i < 18; i++) {
      t += 0.015 + Math.random() * 0.05 * (1 + i * 0.1);
      const src = ctx.createBufferSource();
      src.buffer = tinkle;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 4000 + Math.random() * 5000;
      band.Q.value = 9;
      const gain = ctx.createGain();
      const peak = 0.35 * Math.pow(0.88, i) * (0.6 + Math.random() * 0.4);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(peak, now + t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.06);
      src.connect(band).connect(gain).connect(this.master);
      src.start(now + t);
      src.stop(now + t + 0.08);
    }
  }

  /**
   * A lab alarm heard through a fallen recorder's microphone: a two-tone square wave,
   * muffled, for as long as the tape has left. stopTapeSounds() cuts it.
   */
  #tapeAlarm() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    for (let i = 0; i < TAPE_ALARM_CYCLES * 2; i++) {
      osc.frequency.setValueAtTime(i % 2 ? 700 : 940, now + i * TAPE_ALARM_TONE_SECONDS);
    }
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 2200;
    const gain = ctx.createGain();
    gain.gain.value = TAPE_ALARM_LEVEL;
    osc.connect(muffle).connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + TAPE_ALARM_CYCLES * 2 * TAPE_ALARM_TONE_SECONDS);
    this.tapeAlarmNodes = [osc];
  }

  // Tears the whole graph down and closes the context. Safe before start(),
  // safe twice, and start() afterwards rebuilds from scratch (the decoded
  // buffer belongs to the closed context, so it is dropped and refetched).
  // No fade on the way out -- dispose is teardown, not a story beat.
  dispose() {
    this.breathWanted = false;
    this.#releaseBreathing(0);
    this.stopVoice();
    if (!this.ctx) return;

    this.rattleNodes?.forEach((node) => node.stop());
    this.rattleNodes = null;
    this.rattleGain = null;
    this.rattleIsRecording = false;
    this.stopTapeSounds();
    // The tape's video keeps its element; its source node dies with this
    // context, and a browser will not give the element a second one.
    this.mediaSources = null;
    this.trolleyRollBuffer = null;
    this.trolleyCrashBuffer = null;
    this.windSource?.stop();
    this.windSource?.disconnect();
    this.breathGain?.disconnect();
    this.breathDuck?.disconnect();
    this.voiceGain?.disconnect();
    for (const bus of Object.values(this.buses)) bus.disconnect();
    this.master?.disconnect();
    this.ctx.close();

    this.ctx = null;
    this.master = null;
    this.windSource = null;
    this.breathGain = null;
    this.breathDuck = null;
    this.breathBuffer = null;
    this.breathLoading = null;
    this.voiceGain = null;
    this.buses = {};
    this.echo = null;
    // The decoded buffers belong to the context that is now closed, so they
    // cannot be reused and must be refetched if start() is called again.
    this.voiceBuffers.clear();
    this.cueBuffers.clear();
    this.stepSurfaceSets = {};
  }
}

// ---------------------------------------------------------------------------
// Boot-time checks
// ---------------------------------------------------------------------------
//
// Warn, never throw -- a stale number should cost a console line, not the game.

{
  // The loop window above is typed in, and the build script measures it into
  // the manifest. If the file is rebuilt with a different window and these are
  // not updated, the loop would wrap somewhere that is not the baked seam.
  const loop = cueInfo('breathing')?.loop;
  if (loop && (Math.abs(loop.start - BREATH_LOOP_START) > 0.002 || Math.abs(loop.end - BREATH_LOOP_END) > 0.002)) {
    console.warn(`AudioEngine: BREATH_LOOP_START/END (${BREATH_LOOP_START}, ${BREATH_LOOP_END}) `
      + `no longer match the measured loop in manifest.json (${loop.start}, ${loop.end}). `
      + 'Copy the measured values in, and re-derive BREATH_MAKEUP if the file changed.');
  }
}
