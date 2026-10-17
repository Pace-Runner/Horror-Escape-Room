/**
 * The 3D half of the audio engine: where the ears are, things that make sound
 * somewhere, loops built on the fly, and one shared echo.
 *
 * RAW WEB AUDIO, NOT THREE.Audio / PositionalAudio / AudioListener. Those each
 * create their own AudioContext and listener, and this project has exactly one
 * context, owned by AudioEngine, which the settings slider and pause()/resume()
 * act on. A second one would ignore both.
 *
 * Every function takes the context and a destination node; nothing here holds
 * global state except the HRTF budget below.
 */

/**
 * HRTF panners cost a convolution per ear each. The monster cues (hunter
 * breathing, its footsteps, the stalking aura) are the only ones that earn it,
 * the director never runs more than two of those at once, and this cap is the
 * guard if that ever stops being true: past it, an emitter quietly falls back
 * to equal-power rather than stuttering the whole mix.
 */
const MAX_HRTF = 4;
let hrtfLive = 0;

const setParam = (param, value, now, tau) => {
  if (tau > 0) param.setTargetAtTime(value, now, tau);
  else {
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }
};

/**
 * Put the context's ears where `object3D` is, facing where it faces. Call once
 * a frame with the PLAYER's camera (or the free camera while it is flying),
 * never the third-person one -- the player hears from their own head.
 *
 * Plain .value writes rather than ramps: the listener moves with the frame, and
 * a ramp would make the world swing round the head a beat behind the picture.
 */
export function syncListener(ctx, object3D) {
  object3D.updateMatrixWorld();
  const e = object3D.matrixWorld.elements;
  // Column 2 is the camera's +Z; it looks down -Z. Column 1 is up.
  let fx = -e[8], fy = -e[9], fz = -e[10];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  let ux = e[4], uy = e[5], uz = e[6];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const L = ctx.listener;
  if (L.positionX) {
    L.positionX.value = e[12];
    L.positionY.value = e[13];
    L.positionZ.value = e[14];
    L.forwardX.value = fx;
    L.forwardY.value = fy;
    L.forwardZ.value = fz;
    L.upX.value = ux;
    L.upY.value = uy;
    L.upZ.value = uz;
  } else {
    L.setPosition(e[12], e[13], e[14]);
    L.setOrientation(fx, fy, fz, ux, uy, uz);
  }
}

/**
 * One sound, somewhere. A buffer source through its own envelope, an optional
 * low-pass and panner, and a level -- the same per-source discipline as
 * AudioEngine.#playStep: every node is its own and every one is disconnected on
 * `ended`, so a long session does not accumulate a graph per cue played.
 *
 * @param opts.buffer      the AudioBuffer to play
 * @param opts.loop        loop it; loopStart/loopEnd (seconds) narrow the window
 * @param opts.offset      where in the buffer to start, seconds
 * @param opts.duration    stop after this many buffer seconds (one-shots only)
 * @param opts.gain        the level, linear
 * @param opts.fadeIn      seconds of linear fade from silence
 * @param opts.fadeOut     with `duration`: seconds of fade before the end
 * @param opts.panner      { model, distanceModel, refDistance, maxDistance, rolloff }, or null for 2D
 * @param opts.position    [x, y, z] to start at
 * @param opts.lowpass     cutoff in Hz, or null for no filter
 * @param opts.send        { node, level } -- a post-filter, pre-panner send (the echo bus)
 * @param opts.onEnded     called once, after teardown
 */
export function createEmitter(ctx, destination, opts) {
  const {
    buffer, loop = false, loopStart = 0, loopEnd = 0, offset = 0, duration = null,
    gain = 1, fadeIn = 0.02, fadeOut = 0.08, panner = null, position = null,
    lowpass = null, send = null, playbackRate = 1, onEnded = null
  } = opts;
  const now = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = playbackRate;
  if (loop) {
    src.loop = true;
    // 0/0 means "the whole buffer" to the API, so only a real window is set.
    if (loopEnd > loopStart) {
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
    }
  }

  // The envelope, separate from the level so a fade never fights a setGain().
  const env = ctx.createGain();
  env.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, now);
  if (fadeIn > 0) env.gain.linearRampToValueAtTime(1, now + fadeIn);
  if (!loop && duration !== null && fadeOut > 0) {
    const end = now + duration / playbackRate;
    env.gain.setValueAtTime(1, Math.max(now + fadeIn, end - fadeOut));
    env.gain.linearRampToValueAtTime(0, end);
  }
  const nodes = [src, env];
  src.connect(env);
  let tail = env;

  let filter = null;
  if (lowpass !== null) {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    filter.Q.value = 0.5;
    tail.connect(filter);
    tail = filter;
    nodes.push(filter);
  }

  let sendGain = null;
  if (send) {
    sendGain = ctx.createGain();
    sendGain.gain.value = send.level;
    tail.connect(sendGain).connect(send.node);
    nodes.push(sendGain);
  }

  let pan = null;
  let usesHrtf = false;
  if (panner) {
    pan = ctx.createPanner();
    usesHrtf = panner.model === 'HRTF' && hrtfLive < MAX_HRTF;
    if (usesHrtf) hrtfLive++;
    pan.panningModel = usesHrtf ? 'HRTF' : 'equalpower';
    pan.distanceModel = panner.distanceModel ?? 'inverse';
    pan.refDistance = panner.refDistance ?? 1;
    pan.maxDistance = panner.maxDistance ?? 10000;
    pan.rolloffFactor = panner.rolloff ?? 1;
    if (position) {
      if (pan.positionX) {
        pan.positionX.value = position[0];
        pan.positionY.value = position[1];
        pan.positionZ.value = position[2];
      } else {
        pan.setPosition(position[0], position[1], position[2]);
      }
    }
    tail.connect(pan);
    tail = pan;
    nodes.push(pan);
  }

  const level = ctx.createGain();
  level.gain.value = gain;
  tail.connect(level).connect(destination);
  nodes.push(level);

  let alive = true;
  let stopped = false;
  let stopAt = Infinity;
  src.onended = () => {
    alive = false;
    if (usesHrtf) hrtfLive--;
    for (const n of nodes) {
      try { n.disconnect(); } catch { /* already torn down */ }
    }
    onEnded?.();
  };
  if (!loop && duration !== null) src.start(now, offset, duration);
  else src.start(now, offset);

  return {
    get alive() { return alive; },
    get stopping() { return stopped; },
    get level() { return level.gain.value; },
    position: position ? [...position] : null,
    /** Follow something. tau > 0 glides there, which is what keeps a moving source from zippering. */
    setPosition(x, y, z, tau = 0.05) {
      if (!pan || !alive) return;
      this.position = [x, y, z];
      const t = ctx.currentTime;
      if (pan.positionX) {
        setParam(pan.positionX, x, t, tau);
        setParam(pan.positionY, y, t, tau);
        setParam(pan.positionZ, z, t, tau);
      } else {
        pan.setPosition(x, y, z);
      }
    },
    setGain(g, tau = 0.1) {
      if (alive) setParam(level.gain, g, ctx.currentTime, tau);
    },
    setLowpass(hz, tau = 0.1) {
      if (filter && alive) setParam(filter.frequency, hz, ctx.currentTime, tau);
    },
    /**
     * Fade out over `fade` seconds and tear down. Safe to call twice: a second
     * call only matters if it would end SOONER -- a restart's hard cut has to
     * win over a slow fade an appearance had already started.
     */
    stop(fade = 0.1) {
      const t = ctx.currentTime;
      if (!alive || (stopped && t + fade >= stopAt)) return;
      stopped = true;
      stopAt = t + fade;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(env.gain.value, t);
      env.gain.linearRampToValueAtTime(0, t + fade);
      src.stop(t + fade + 0.01);
    }
  };
}

/**
 * A loop of `length` seconds from `start` in `buffer`, made seamless by an
 * equal-power self-crossfade over its first `xfade` seconds:
 *
 *   out[i] = src[s+i] * sin(pi i / 2X) + src[s+L+i] * cos(pi i / 2X)    i < X
 *   out[i] = src[s+i]                                                    otherwise
 *
 * so out[L-1] runs straight on into out[0]. Needs `xfade` seconds of audio past
 * the end of the window -- the stored clips carry that margin for exactly this.
 * The same recipe scripts/audio/build.mjs bakes into the shipped loops, done here
 * for the windows that are only chosen at play time.
 */
export function buildSeamlessLoop(ctx, buffer, start, length, xfade) {
  const sr = buffer.sampleRate;
  const s = Math.round(start * sr);
  const L = Math.round(length * sr);
  const X = Math.min(L, Math.round(xfade * sr));
  const out = ctx.createBuffer(buffer.numberOfChannels, L, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const a = buffer.getChannelData(c);
    const o = out.getChannelData(c);
    for (let i = 0; i < L; i++) {
      const here = a[s + i] ?? 0;
      if (i < X) {
        const t = (Math.PI * i) / (2 * X);
        o[i] = here * Math.sin(t) + (a[s + L + i] ?? 0) * Math.cos(t);
      } else {
        o[i] = here;
      }
    }
  }
  return out;
}

/** The echo's repeat time, seconds: inside the 190-260 ms of a far wall in a house. */
export const ECHO_DELAY = 0.23;
/** Level kept per repeat: 20*log10(0.4) = -7.96 dB, so -60 dB after 7.5 repeats (1.7 s). */
export const ECHO_FEEDBACK = 0.4;
const ECHO_IR_SECONDS = 1.4;

/**
 * The one echo, shared by everything that sends to it (the distant laughter).
 *
 * Two parts, because neither alone reads as "somewhere else in the house". A
 * feedback delay at 230 ms gives the discrete slap of a far wall; feedback 0.4
 * through a 1.6 kHz low-pass loses 8 dB and some top per pass, so each repeat
 * is darker and the tail is down 60 dB in 7.5 passes (1.7 s). A short convolver
 * on procedural noise, decaying 60 dB over 1.4 s, fills the gaps between the
 * repeats so it is a room and not a canyon.
 *
 * Built once and left running. A cue that sends to it can stop whenever it
 * likes: the tail is in here, not in the cue, so it is never hard-cut.
 */
export function createEchoBus(ctx, destination) {
  const input = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 1;

  const delay = ctx.createDelay(1);
  delay.delayTime.value = ECHO_DELAY;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1600;
  const feedback = ctx.createGain();
  feedback.gain.value = ECHO_FEEDBACK;
  input.connect(delay);
  delay.connect(damp);
  damp.connect(feedback).connect(delay);
  damp.connect(wet);

  const ir = ctx.createBuffer(2, Math.round(ECHO_IR_SECONDS * ctx.sampleRate), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    // exp(-6.91 t / T) is -60 dB at T.
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp((-6.91 * i) / d.length);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const convLevel = ctx.createGain();
  convLevel.gain.value = 0.5;
  input.connect(conv).connect(convLevel).connect(wet);

  wet.connect(destination);
  return { input, output: wet };
}
