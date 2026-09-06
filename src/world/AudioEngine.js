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
const BREATH_MAKEUP = 1;

// Exported because main.js's resetGame() has to put the intensity back to the
// level the game opens on, and two copies of that number in two files would
// drift the moment either is tuned.
export const BREATH_BASE_LEVEL = 0.1;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windSource = null;

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
  }

  start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
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

    // Fetched here and not at module load: decodeAudioData needs a context,
    // and a context before the user gesture is a context the browser blocks.
    this.#loadBreathing();
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
