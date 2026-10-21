import * as THREE from 'three';
import { INK, INTERLACE_ODD_LINE_GAIN } from './CctvFeeds.js';

/**
 * A playing clip that nobody has asked for a frame in this long pauses itself.
 *
 * The owner only calls update() while the picture is on screen -- the level
 * stops updating the feeds once the monitor is off, and stops altogether when
 * the player leaves the basement -- and nothing tells the clip either has
 * happened. Without this, a looping clip would go on decoding behind a dead
 * screen for the rest of the game. The next play() picks it up where it
 * stopped, which is also what a real recorder does.
 */
const UNWATCHED_PAUSE_MS = 1000;

/**
 * A recorded clip, shown as a CCTV feed.
 *
 * WHY THIS EXISTS when CctvFeeds.js argues so hard for drawing. The argument
 * there is about not BUILDING rooms nobody walks in. A short clip of a kitchen
 * costs no modelling at all, and on a 320x240 green-grey screen behind static
 * the things that give a generated clip away -- hands, text, a wall that
 * drifts between frames -- are below what the feed can resolve. So a clip is
 * allowed to stand in for a drawing, but only through the same tube: it is
 * flattened to luminance and repainted in the INK palette, so a filmed kitchen
 * and a drawn hallway read as two cameras on the same 1987 system rather than
 * one camera and one video.
 *
 * WHAT IT IS NOT: a replacement for the drawn feeds. CctvFeeds owns the feed,
 * the OSD, the power veil and the grain; this only produces the picture
 * underneath them. Every failure here -- no file, a format this browser will
 * not decode, a clip from another origin that taints the canvas -- ends with
 * update() returning false and the drawn room taking its place, never with a
 * black screen or a thrown error.
 *
 * NOTHING IS FETCHED UNTIL play(). Every level is built at boot, so a feed
 * that loaded its clip when it was created would download every camera's
 * video before the title screen. The <video> element itself is not even made
 * until the first play(), and it is made with preload 'none', so a pause() or
 * reset() that reaches it after a failed start still cannot start a download.
 *
 * @param {string} url  where the clip is served from (a Vite '?url' import)
 * @param {object} [options]
 * @param {number} [options.width=320]  feed resolution, matching CctvFeeds
 * @param {number} [options.height=240]
 * @param {boolean} [options.loop=true]  a camera that never stops recording
 *   loops; a one-shot clip (something crossing the frame once) does not, and
 *   holds on its last frame when it ends.
 * @param {boolean} [options.scanlines=true]  dims every other line the way
 *   CctvFeeds' grain() does. CctvFeeds turns this OFF, because its own grain
 *   pass runs over the whole frame afterwards and two passes would darken the
 *   odd lines twice.
 */
export function createVideoFeed(url, { width = 320, height = 240, loop = true, scanlines = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  // The same sampling as the drawn feeds' textures, so a clip feed and a drawn
  // feed are filtered identically on the monitor's glass.
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  /**
   * Luminance (0-255) to phosphor colour, one lookup per pixel instead of a
   * blend per pixel. Built here rather than at module scope on purpose:
   * CctvFeeds imports this file and this file imports INK from CctvFeeds, so
   * at module-evaluation time INK may not exist yet. By the time anything
   * calls createVideoFeed, both modules have finished evaluating.
   */
  const phosphor = buildPhosphorRamp();

  /** Created by the first play(). Null until then. */
  let video = null;
  /** True once the clip has proven it cannot be shown. Never cleared. */
  let failed = false;
  /** Set by play() and cleared by pause()/reset(), so play() is safe to call every frame. */
  let playRequested = false;
  /** performance.now() of the last play() or update(), for UNWATCHED_PAUSE_MS. */
  let lastWatchedAt = 0;

  /**
   * The last frame, already in phosphor colours. Kept so a paused clip, or a
   * game frame that lands between two video frames, costs one putImageData
   * rather than a decode-and-remap -- and so CctvFeeds can draw its OSD and
   * grain straight onto this canvas every frame without them piling up.
   */
  let frame = null;
  /** The clip time `frame` was captured at. -1 means nothing captured yet. */
  let capturedAt = -1;

  let resolveReady;
  /**
   * Resolves `true` once the clip has a frame to show and `false` if it never
   * will. It never REJECTS: nothing is obliged to await it, and an unawaited
   * rejection would put an error in the console for what is, by design, an
   * optional asset. Stays pending until play() is first called.
   */
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  /** One console line and the drawn room takes over, as for a missing sound. */
  function fail(reason) {
    if (failed) return;
    failed = true;
    playRequested = false;
    frame = null;
    capturedAt = -1;
    console.warn(`[video] could not show ${url} -- using the drawn feed: ${reason}`);
    resolveReady(false);
  }

  function ensureVideo() {
    if (video) return video;
    video = document.createElement('video');
    // Muted and inline are what let a browser start it without a click of its
    // own: autoplay policy waves through a silent, inline clip. The feed has
    // no sound of its own anyway -- the basement's audio is the soundtrack.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.loop = loop;
    video.preload = 'none';
    video.crossOrigin = 'anonymous';
    video.addEventListener('loadeddata', () => resolveReady(true), { once: true });
    video.addEventListener('error', () => {
      fail(video.error?.message || `media error ${video.error?.code ?? '?'}`);
    });
    // Fires a few times a second, and only while playing: exactly when the
    // unwatched check is needed and at no other time.
    video.addEventListener('timeupdate', () => {
      if (!playRequested || performance.now() - lastWatchedAt < UNWATCHED_PAUSE_MS) return;
      playRequested = false;
      video.pause();
    });
    video.src = url;
    return video;
  }

  /**
   * Copies the clip's current frame into `frame`, cropped to fill the feed
   * (a 16:9 clip loses its sides rather than gaining black bars, which a 4:3
   * camera of the period never had), then flattened to luminance and mapped
   * onto the phosphor ramp.
   */
  function captureFrame() {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return false;

    const coverScale = Math.max(width / sourceWidth, height / sourceHeight);
    const cropWidth = width / coverScale;
    const cropHeight = height / coverScale;
    context.drawImage(
      video,
      (sourceWidth - cropWidth) / 2,
      (sourceHeight - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height
    );

    let image;
    try {
      image = context.getImageData(0, 0, width, height);
    } catch (err) {
      // A clip from another origin without CORS headers taints the canvas,
      // and a tainted canvas cannot be read back -- or uploaded as a texture.
      fail(err.message);
      return false;
    }

    const pixels = image.data;
    for (let y = 0; y < height; y++) {
      const lineGain = scanlines && y % 2 === 1 ? INTERLACE_ODD_LINE_GAIN : 1;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Rec. 601 weights: what a 1987 camera tube's luminance actually was.
        const luma = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0;
        const p = luma * 3;
        pixels[i] = phosphor[p] * lineGain;
        pixels[i + 1] = phosphor[p + 1] * lineGain;
        pixels[i + 2] = phosphor[p + 2] * lineGain;
        pixels[i + 3] = 255;
      }
    }
    frame = image;
    capturedAt = video.currentTime;
    return true;
  }

  return {
    canvas,
    texture,
    ready,

    /** True while the clip is actually running, not merely asked to. */
    get isPlaying() {
      return Boolean(video) && !failed && !video.paused && !video.ended;
    },

    /** True once there is a picture to show. False again after reset(), until the rewound frame decodes. */
    get hasFrame() {
      return frame !== null;
    },

    /** True once the clip has failed for good and the drawn feed has taken over. */
    get failed() {
      return failed;
    },

    /**
     * Starts the clip, creating and loading it the first time. Idempotent, so
     * a caller can simply call it every frame the feed is on screen.
     */
    play() {
      lastWatchedAt = performance.now();
      if (failed || playRequested) return;
      playRequested = true;
      const element = ensureVideo();
      element.preload = 'auto';
      const started = element.play();
      started?.catch((err) => {
        // A pause() landing before playback began. Not a failure: the next
        // play() starts it again.
        if (err.name === 'AbortError') return;
        // Autoplay refused. Unusual for a muted clip, but let the next frame's
        // play() try again rather than writing the camera off.
        if (err.name === 'NotAllowedError') {
          playRequested = false;
          return;
        }
        fail(err.message);
      });
    },

    pause() {
      playRequested = false;
      if (video && !video.paused) video.pause();
    },

    /**
     * Back to the first frame, paused. The cached frame is dropped with it, so
     * until the rewound frame decodes the caller sees "no frame" and draws its
     * fallback, rather than the frame the last run ended on.
     */
    reset() {
      playRequested = false;
      frame = null;
      capturedAt = -1;
      if (!video) return;
      video.pause();
      video.currentTime = 0;
    },

    /**
     * Paints the clip's current frame onto the canvas.
     *
     * `dt` is accepted for parity with every other per-frame update in the
     * game but is not used: the clip runs on the video element's own clock,
     * and this only samples it. A new frame is captured only when the clip has
     * moved on since the last capture; otherwise the cached one is put back.
     *
     * @returns {boolean} true when the canvas now holds a clip frame. False
     *   leaves the canvas untouched, for the caller to draw something else.
     */
    update(dt) {
      lastWatchedAt = performance.now();
      if (failed || !video) return false;
      const hasCurrentFrame = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.seeking;
      // A failed capture clears `frame`, so the check below covers it too.
      if (hasCurrentFrame && video.currentTime !== capturedAt) captureFrame();
      if (!frame) return false;
      context.putImageData(frame, 0, 0);
      texture.needsUpdate = true;
      return true;
    },

    dispose() {
      if (video) {
        video.pause();
        // Detaching the source is what actually frees the decoder; a paused
        // element with a src keeps its buffers.
        video.removeAttribute('src');
        video.load();
        video = null;
      }
      texture.dispose();
    }
  };
}

/**
 * The phosphor ramp: 256 luminance steps, each an [r, g, b] in INK colours,
 * packed flat. Runs black through to `lightest` -- the same range the drawn
 * rooms are painted in.
 *
 * `hot` is left OUT on purpose. On the drawn feeds it is used for one thing,
 * the camera's burned-in label and clock, and that is what keeps the OSD
 * legible over any room. A clip's highlights reaching the same colour would
 * let a bright window swallow the timestamp.
 */
function buildPhosphorRamp() {
  const stops = [INK.black, INK.darkest, INK.dark, INK.mid, INK.light, INK.lightest].map(hexToRgb);
  const ramp = new Uint8ClampedArray(256 * 3);
  const spans = stops.length - 1;
  for (let luma = 0; luma < 256; luma++) {
    const position = (luma / 255) * spans;
    const from = Math.min(spans - 1, Math.floor(position));
    const t = position - from;
    for (let channel = 0; channel < 3; channel++) {
      ramp[luma * 3 + channel] = stops[from][channel] + (stops[from + 1][channel] - stops[from][channel]) * t;
    }
  }
  return ramp;
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
