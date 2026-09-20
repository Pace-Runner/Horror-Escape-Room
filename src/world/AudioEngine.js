// Wind, thunder and creaks are synthesised with the Web Audio API rather
// than loaded from audio files, so the world's ambience costs no binary
// assets to credit, path or accidentally break on a case-sensitive server.
// The one exception is the breathing loop below: a breath is performance,
// not signal processing, and no filtered-noise fake of it holds up. It runs
// for the whole session once audio is unlocked. AudioContext must be created
// after a user gesture (the start screen's click) or the browser will refuse
// to let it run.

// The breathing loop is the only audio file the project ships, and it is
// deliberately loaded through a glob rather than the `import url from
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

// Voice clips -- the four cassette tapes and the two closing news reports.
// Globbed for exactly the reason the breathing loop is: the game ships with
// text now and audio later, and a plain import of a file that is not there
// fails the BUILD. A glob that matches nothing is an empty object, so the game
// runs, captions still play, and the lines are simply silent. Keys are the
// bare filename without extension, matching the `voice` field in story/lines.js
// -- so dropping tape-1.m4a into src/assets/voice/ is the entire integration.
const VOICE_FILES = import.meta.glob('../assets/voice/*.{m4a,mp3,ogg,wav}', {
  query: '?url',
  import: 'default',
  eager: true
});
const VOICE_URLS = {};
for (const [path, url] of Object.entries(VOICE_FILES)) {
  const key = path.split('/').pop().replace(/\.[^.]+$/, '');
  VOICE_URLS[key] = url;
}

// Voice sits above the ambience: a line that has to compete with the wind for
// intelligibility is a line the player will miss, and these carry the plot.
const VOICE_LEVEL = 0.9;
// Long enough not to click, short enough that cutting one line off for the
// next is not audibly a fade.
const VOICE_FADE = 0.12;

// Loop window in seconds, MEASURED off the supplied recording rather than
// guessed at. breathing.m4a decodes to 61.163 s and neither end of it is
// loopable as it stands: the first 10 ms are the AAC encoder's priming
// silence, the loudest event in the entire file (by 13 dB) is a -23.7 dBFS
// handling thump at 1.39 s, and the last ~1.4 s fades out to a -65 dBFS
// tail. Looping the whole buffer would replay a hole-then-thump every
// minute. This window instead starts and ends in the quiet gap between two
// breaths (-65.4 and -62.8 dBFS, 2.6 dB apart), spans 29 cycles of the
// recording's ~1.93 s breathing rhythm, and lands on near-zero samples both
// ends -- the step across the splice is 0.00014, roughly a twentieth of the
// sample-to-sample movement inside the audio itself, so the seam does not
// click. Both at 0 would mean "loop the whole buffer": the Web Audio API
// reads loopEnd 0 as end-of-buffer, so the window is only applied when it
// has actually been narrowed.
const BREATH_LOOP_START = 3.69;
const BREATH_LOOP_END = 59.7;

// Long enough that starting and stopping reads as something moving closer or
// further away instead of a switch being flipped, short enough that a
// restart still feels immediate.
const BREATH_FADE = 0.6;

// Intensity changes are story beats (the bulb blowing, the creature getting
// nearer), so they slide over about a breath rather than a frame.
const BREATH_LEVEL_RAMP = 1.1;

// The recording is quiet -- measured peak -23.7 dBFS, RMS -52.2 dBFS -- so
// even a dial value of 1.0 fed straight to the gain node would sit under the
// wind drone and be lost. This fixed makeup gain is what makes the 0..1
// intensity dial mean something audible, without callers having to know
// anything about the file's level. Re-measure it if the file is replaced.
//
// 5x (+14 dB): sized so the loudest story beat (0.95, see BEATS in
// story/lines.js) lands the recording's own peak at roughly -9.7 dBFS --
// clearly present without dominating the mix. At the level the game opens
// on (BREATH_BASE_LEVEL, 0.1) that puts the effective peak around -36 dBFS:
// a background breath, not a wall of noise. Left at 1 (i.e. no makeup at
// all) this dial never got loud enough to be more than technically playing
// -- audible on nothing but studio monitors at a dangerous volume.
const BREATH_MAKEUP = 5;

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
const RUN_STEP_URL = Object.values(RUN_STEP_FILES)[0] ?? null;

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
 * breathing at the level the game opens on peaks at 10^(-23.7/20) x
 * (BREATH_BASE_LEVEL x BREATH_MAKEUP) = 0.0327 = -29.7 dBFS. The wind drone is
 * uniform noise through a 2nd-order 340 Hz lowpass at gain 0.06, roughly
 * -35 dBFS peak. So the player's own feet were landing 14.6 dB ABOVE the
 * ambient breathing and 20 dB above the wind -- the loudest recurring thing in
 * the game, and within 5 dB of the loudest story beat there is.
 *
 * 0.12 puts a step at 0.0504 = -25.9 dBFS: about 4 dB over the base breathing
 * peak, 9 dB under a story-beat breath, 9 dB over the wind. Clearly audible as
 * a transient, underneath everything that is supposed to carry the scene.
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
 */
function detectFootstepSlices(buffer) {
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
  const refractory = 12;            // 120 ms: shorter than any real stride
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

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windSource = null;

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
  }

  start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);
    this.#startWindDrone();

    // Its own gain node on the way to the master, so breathing intensity can
    // be driven by the story without dragging the wind and thunder with it.
    this.breathGain = this.ctx.createGain();
    this.breathGain.gain.value = this.breathLevel * BREATH_MAKEUP;
    this.breathGain.connect(this.master);

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

    // Fetched here and not at module load: decodeAudioData needs a context,
    // and a context before the user gesture is a context the browser blocks.
    this.#loadBreathing();
    this.#loadFootstepSet(WALK_STEP_URL, 'walking').then((set) => { this.stepWalk = set; });
    this.#loadFootstepSet(RUN_STEP_URL, 'running').then((set) => { this.stepRun = set; });
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
  playVoice(key) {
    if (!key || !this.ctx || !this.voiceGain) return false;
    const url = VOICE_URLS[key];
    if (!url) {
      if (!this.voiceWarned.has(key)) {
        this.voiceWarned.add(key);
        console.info(`[audio] no voice clip for "${key}" -- caption only`);
      }
      return false;
    }

    const cached = this.voiceBuffers.get(key);
    if (cached instanceof AudioBuffer) {
      this.#startVoice(cached);
      return true;
    }
    // Already in flight: let the pending decode start it when it lands, rather
    // than firing a second fetch for the same clip.
    if (cached) return true;

    const pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buffer) => {
        if (!this.ctx) return;
        this.voiceBuffers.set(key, buffer);
        this.#startVoice(buffer);
      })
      .catch((err) => {
        // Dropped from the cache so a later attempt can retry rather than
        // being stuck behind a promise that already failed.
        this.voiceBuffers.delete(key);
        if (!this.voiceWarned.has(key)) {
          this.voiceWarned.add(key);
          console.warn(`[audio] could not load voice clip "${key}": ${err.message}`);
        }
      });
    this.voiceBuffers.set(key, pending);
    return true;
  }

  /** Cuts the current line. Called on restart and when a sequence is cancelled. */
  stopVoice() {
    const src = this.voiceSource;
    this.voiceSource = null;
    if (!src || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = src.__fade;
    if (gain) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + VOICE_FADE);
    }
    src.stop(now + VOICE_FADE);
  }

  #startVoice(buffer) {
    if (!this.ctx || !this.voiceGain) return;
    this.stopVoice();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Per-source fade, so cutting one line short cannot leave the bus turned
    // down for the next -- the same reason the breathing loop has one.
    const fade = ctx.createGain();
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + VOICE_FADE);

    src.connect(fade).connect(this.voiceGain);
    src.__fade = fade;
    src.onended = () => {
      src.disconnect();
      fade.disconnect();
      if (this.voiceSource === src) this.voiceSource = null;
    };
    src.start(now);
    this.voiceSource = src;
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
  updateFootsteps(bobPhase, { moving = 0, sprint = 0, crouch = 0 } = {}) {
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
    if (prev === null) return;
    if (t >= prev) return;                       // no wrap, no footfall
    const set = sprint > 0.5 ? this.stepRun : this.stepWalk;
    if (!set || !set.slices.length) return;

    // Alternating weight, for the same reason the synthesised footsteps() does
    // it: a person does not put both feet down equally hard, and a perfectly
    // even tread sounds like a metronome rather than like somebody walking.
    this.stepFoot = !this.stepFoot;
    const level = (crouch > 0.5 ? STEP_CROUCH_LEVEL : STEP_LEVEL)
      * (this.stepFoot ? 1 : 0.82);
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

  #loadFootstepSet(url, label) {
    if (!url) {
      console.warn(`AudioEngine: no ${label} recording found -- expected `
        + `src/assets/audio/${label}_audio.mp3 (or .m4a/.ogg/.wav). `
        + 'Footsteps for this gait will be silent.');
      return Promise.resolve(null);
    }
    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buffer) => {
        const slices = detectFootstepSlices(buffer);
        // A recording that yields no steps is the one failure that would
        // otherwise be silent in every sense -- the game would run, footsteps
        // would simply never play, and nothing would say why.
        if (!slices.length) {
          console.error(`AudioEngine: found no footsteps in the ${label} recording `
            + `(${buffer.duration.toFixed(2)} s). detectFootstepSlices needs clear `
            + 'transients above 18% of the file peak, at least 120 ms apart. A '
            + 'continuous or heavily compressed recording will not slice.');
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

  // Tears the whole graph down and closes the context. Safe before start(),
  // safe twice, and start() afterwards rebuilds from scratch (the decoded
  // buffer belongs to the closed context, so it is dropped and refetched).
  // No fade on the way out -- dispose is teardown, not a story beat.
  dispose() {
    this.breathWanted = false;
    this.#releaseBreathing(0);
    this.stopVoice();
    if (!this.ctx) return;

    this.windSource?.stop();
    this.windSource?.disconnect();
    this.breathGain?.disconnect();
    this.voiceGain?.disconnect();
    this.master?.disconnect();
    this.ctx.close();

    this.ctx = null;
    this.master = null;
    this.windSource = null;
    this.breathGain = null;
    this.breathBuffer = null;
    this.breathLoading = null;
    this.voiceGain = null;
    // The decoded buffers belong to the context that is now closed, so they
    // cannot be reused and must be refetched if start() is called again.
    this.voiceBuffers.clear();
  }
}
