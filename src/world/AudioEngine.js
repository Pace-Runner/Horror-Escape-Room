// All sound is synthesised with the Web Audio API rather than loaded from
// audio files, so the world has ambience and a thunder cue with zero
// binary assets to credit, path or accidentally break on a case-sensitive
// server. AudioContext must be created after a user gesture (the start
// screen's click) or the browser will refuse to let it run.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.#startWindDrone();
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
}
