import * as THREE from 'three';
import {
  SESSION_TAPE_RECORDED_AT,
  SESSION_TAPE_LENGTH_IN_SECONDS,
  SESSION_TAPE_PICTURE
} from '../story/sessionTape.js';

/**
 * The Session 14 tape as a picture: what the deck sends to the monitor.
 *
 * TWO SOURCES BEHIND ONE FACE. The footage is not made yet -- it is filmed
 * in-engine and cut later (see docs/LEVEL2_POWER_CHAIN.md, "The session tape").
 * Until src/assets/video/session_14.mp4 exists, the tape is a PLACEHOLDER
 * painted onto a canvas: tape noise, the camcorder's date stamp running, the
 * deck's PLAY marker, the picture tumbling when the camera goes over, and the
 * roll into static and black at the end. The subtitles carry what happens.
 *
 * The video is found with an import.meta.glob for the same reason the voice
 * clips are (world/AudioEngine.js): a plain import of a file that is not there
 * fails the BUILD, and a glob that matches nothing is just empty. So dropping
 * the file in is the whole change -- nothing else has to know.
 *
 * Whichever it is, the caller sees the same thing: an `element` to show in the
 * pop-up, a `texture` for the CRT in the room, and a clock.
 */
const VIDEO_FILES = import.meta.glob('../assets/video/session_14.{mp4,webm}', {
  query: '?url',
  import: 'default',
  eager: true
});
const VIDEO_URL = Object.values(VIDEO_FILES)[0] ?? null;

/** The placeholder's resolution: a camcorder's picture, not a photograph. */
const PICTURE_WIDTH_IN_PIXELS = 320;
const PICTURE_HEIGHT_IN_PIXELS = 240;
/** The placeholder repaints at most this often; tape noise does not need sixty. */
const REPAINT_INTERVAL_IN_SECONDS = 1 / 30;
/** How long the deck's PLAY marker stays on screen once the tape starts. */
const PLAY_MARKER_SECONDS = 2.2;
/** How long the picture tumbles and breaks up as the camera goes over. */
const TUMBLE_SECONDS = 0.7;
/** Pre-made noise frames, cycled and offset rather than generated per frame. */
const NOISE_FRAME_COUNT = 4;

/**
 * Builds one frame of tape noise: grey grain with a little horizontal smear,
 * the way a tape's dropouts streak along the scanlines.
 *
 * @returns {HTMLCanvasElement} a frame the size of the picture.
 */
function createNoiseFrame() {
  const canvas = document.createElement('canvas');
  canvas.width = PICTURE_WIDTH_IN_PIXELS;
  canvas.height = PICTURE_HEIGHT_IN_PIXELS;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  let previous = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    // Each pixel leans on the one before it, which smears the grain sideways.
    const value = previous * 0.45 + Math.random() * 255 * 0.55;
    previous = value;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Formats the camcorder's clock for the date stamp.
 *
 * @param {number} elapsedInSeconds - seconds since the recording started.
 * @returns {string} e.g. "AM 2:47:09".
 */
function formatStampTime(elapsedInSeconds) {
  const { hours, minutes, seconds } = SESSION_TAPE_RECORDED_AT;
  const total = hours * 3600 + minutes * 60 + seconds + Math.floor(elapsedInSeconds);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return `${h < 12 ? 'AM' : 'PM'} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Paints the placeholder tape onto a canvas, one frame per call.
 */
function createPlaceholderPainter(canvas) {
  const ctx = canvas.getContext('2d');
  const noiseFrames = Array.from({ length: NOISE_FRAME_COUNT }, createNoiseFrame);
  const w = canvas.width;
  const h = canvas.height;

  function drawNoise(alpha) {
    const frame = noiseFrames[Math.floor(Math.random() * noiseFrames.length)];
    ctx.globalAlpha = alpha;
    ctx.drawImage(frame, -Math.random() * 40, -Math.random() * 30, w + 40, h + 30);
    ctx.globalAlpha = 1;
  }

  /** The bright band a worn tape rolls up the picture. */
  function drawTrackingBand(timeInSeconds) {
    const y = h - ((timeInSeconds * 23) % (h + 40));
    const band = ctx.createLinearGradient(0, y - 14, 0, y + 14);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, y - 14, w, 28);
  }

  function drawOutlinedText(text, x, y, align) {
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#f2f2ea';
    ctx.fillText(text, x, y);
  }

  /** The camcorder's own stamp, burned into the corner of every frame. */
  function drawDateStamp(timeInSeconds) {
    drawOutlinedText(SESSION_TAPE_RECORDED_AT.date, w - 14, h - 34, 'right');
    drawOutlinedText(formatStampTime(timeInSeconds), w - 14, h - 16, 'right');
  }

  /** Paints the frame for `timeInSeconds` into the tape. */
  function paint(timeInSeconds) {
    const { cameraFallsAt, staticFromSeconds, blackFromSeconds } = SESSION_TAPE_PICTURE;
    if (timeInSeconds >= blackFromSeconds) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (timeInSeconds >= staticFromSeconds) {
      drawNoise(1);
      return;
    }
    // A murky, nearly black picture under the grain: the lab at night, lit by
    // one lamp, through a 1987 camcorder.
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, w, h);
    const tumbling = timeInSeconds >= cameraFallsAt && timeInSeconds < cameraFallsAt + TUMBLE_SECONDS;
    drawNoise(tumbling ? 0.85 : 0.22);
    drawTrackingBand(timeInSeconds);
    if (tumbling) {
      // The frame tearing as the camera hits the floor.
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
        ctx.fillRect(0, Math.random() * h, w, 2 + Math.random() * 10);
      }
    }
    drawDateStamp(timeInSeconds);
    if (timeInSeconds < PLAY_MARKER_SECONDS) drawOutlinedText('PLAY ▶', 16, 26, 'left');
  }

  return { paint };
}

/**
 * The tape the deck plays.
 *
 * @returns {{
 *   hasRecording: boolean,
 *   element: HTMLVideoElement|HTMLCanvasElement,
 *   texture: THREE.Texture,
 *   currentTimeInSeconds: number,
 *   durationInSeconds: number,
 *   isPlaying: boolean,
 *   hasEnded: boolean,
 *   play: () => void,
 *   stop: () => void,
 *   update: (deltaTimeInSeconds: number) => void
 * }}
 */
export function createSessionTapeSource() {
  const canvas = document.createElement('canvas');
  canvas.width = PICTURE_WIDTH_IN_PIXELS;
  canvas.height = PICTURE_HEIGHT_IN_PIXELS;
  const painter = createPlaceholderPainter(canvas);
  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.colorSpace = THREE.SRGBColorSpace;

  let video = null;
  let videoTexture = null;
  if (VIDEO_URL) {
    video = document.createElement('video');
    video.src = VIDEO_URL;
    video.preload = 'auto';
    video.playsInline = true;
    videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    // A file that will not decode falls back to the placeholder rather than
    // playing a black screen with no end.
    video.addEventListener('error', () => {
      console.warn('[tape] session_14 video failed to load -- using the placeholder', video.error);
      video = null;
    });
  }

  let playing = false;
  let placeholderTime = 0;
  let sinceRepaint = 0;
  painter.paint(0);

  const usingVideo = () => video !== null;

  return {
    get hasRecording() { return usingVideo(); },
    get element() { return usingVideo() ? video : canvas; },
    get texture() { return usingVideo() ? videoTexture : canvasTexture; },
    get currentTimeInSeconds() { return usingVideo() ? video.currentTime : placeholderTime; },
    get durationInSeconds() {
      return usingVideo() && Number.isFinite(video.duration) ? video.duration : SESSION_TAPE_LENGTH_IN_SECONDS;
    },
    get isPlaying() { return playing; },
    get hasEnded() {
      return usingVideo() ? video.ended : placeholderTime >= SESSION_TAPE_LENGTH_IN_SECONDS;
    },

    /** Starts the tape from the beginning. */
    play() {
      playing = true;
      placeholderTime = 0;
      sinceRepaint = REPAINT_INTERVAL_IN_SECONDS;
      if (!usingVideo()) return;
      video.currentTime = 0;
      video.play().catch((err) => console.warn('[tape] the video would not play', err));
    },

    /** Stops the tape and rewinds it, the way the deck does when it is stopped. */
    stop() {
      playing = false;
      placeholderTime = 0;
      painter.paint(0);
      canvasTexture.needsUpdate = true;
      if (!usingVideo()) return;
      video.pause();
      video.currentTime = 0;
    },

    /**
     * Advances the placeholder's clock and repaints it. A video runs on its
     * own clock, so for one this does nothing.
     *
     * @param {number} deltaTimeInSeconds - frame time.
     */
    update(deltaTimeInSeconds) {
      if (!playing || usingVideo()) return;
      placeholderTime = Math.min(SESSION_TAPE_LENGTH_IN_SECONDS, placeholderTime + deltaTimeInSeconds);
      sinceRepaint += deltaTimeInSeconds;
      if (sinceRepaint < REPAINT_INTERVAL_IN_SECONDS) return;
      sinceRepaint = 0;
      painter.paint(placeholderTime);
      canvasTexture.needsUpdate = true;
    }
  };
}
