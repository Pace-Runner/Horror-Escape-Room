import * as THREE from 'three';

/**
 * The counter on the lab's Video8 deck: a small vacuum-fluorescent readout,
 * blue-green on black, behind the smoked window over the transport buttons.
 *
 * It shows what the deck is doing and how far into the tape it is -- STOP or
 * PLAY on the left, the counter on the right -- and nothing at all without
 * power. Painted onto a canvas, and only when what it shows has changed, so a
 * running counter repaints once a second rather than sixty times.
 */
const WIDTH_IN_PIXELS = 256;
const HEIGHT_IN_PIXELS = 64;
const LIT_COLOUR = '#7ff5dc';
/** The segments that are not lit still show faintly through the glass, as on a real tube. */
const GHOST_COLOUR = 'rgba(127, 245, 220, 0.07)';

/**
 * Formats a counter reading.
 *
 * @param {number} seconds - how far into the tape.
 * @returns {string} e.g. "0:00:37".
 */
function formatCounter(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor(whole / 60) % 60;
  const s = whole % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * @returns {{ texture: THREE.CanvasTexture, show: (reading: {powered: boolean,
 *   mode: string, seconds: number}) => void }}
 */
export function createDeckCounterDisplay() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH_IN_PIXELS;
  canvas.height = HEIGHT_IN_PIXELS;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  /** What is on the display now, so an unchanged reading costs nothing. */
  let shownKey = null;

  function paint({ powered, mode, seconds }) {
    ctx.fillStyle = '#020403';
    ctx.fillRect(0, 0, WIDTH_IN_PIXELS, HEIGHT_IN_PIXELS);
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "Courier New", monospace';
    // The unlit segments, always there behind the glass.
    ctx.fillStyle = GHOST_COLOUR;
    ctx.textAlign = 'right';
    ctx.fillText('8:88:88', WIDTH_IN_PIXELS - 12, HEIGHT_IN_PIXELS / 2 + 2);
    if (!powered) return;
    ctx.fillStyle = LIT_COLOUR;
    ctx.shadowColor = LIT_COLOUR;
    ctx.shadowBlur = 8;
    ctx.fillText(formatCounter(seconds), WIDTH_IN_PIXELS - 12, HEIGHT_IN_PIXELS / 2 + 2);
    if (mode) {
      ctx.font = 'bold 20px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(mode, 12, HEIGHT_IN_PIXELS / 2 + 2);
    }
    ctx.shadowBlur = 0;
  }

  return {
    texture,

    /**
     * Shows a reading, repainting only if it differs from the one showing.
     *
     * @param {object} reading
     * @param {boolean} reading.powered - whether the deck has power at all.
     * @param {string} reading.mode - 'PLAY', 'STOP', or '' with no tape in.
     * @param {number} reading.seconds - the counter, in seconds.
     */
    show(reading) {
      const key = reading.powered ? `${reading.mode}|${Math.floor(reading.seconds)}` : 'off';
      if (key === shownKey) return;
      shownKey = key;
      paint(reading);
      texture.needsUpdate = true;
    }
  };
}
