/**
 * The optional frame-rate readout (Settings > Show frame rate).
 *
 * Shows the average frames per second and the WORST frame time over the last
 * half second. The average alone hides exactly what a player feels: 59 smooth
 * frames and one 120 ms hitch average out to a respectable number. The worst
 * frame is what a stutter looks like on paper.
 *
 * It reads performance.now() itself rather than the game's frame dt, because
 * tick() clamps dt to 50 ms for the simulation's sake -- a counter fed that
 * would never report a frame slower than 20 fps.
 *
 * The text is written twice a second, not every frame: changing text forces
 * layout, and a counter that costs frames is measuring itself.
 */

/** How often the readout is refreshed, and the window it averages over. */
const REFRESH_INTERVAL_IN_MILLISECONDS = 500;

/**
 * @param {HTMLElement} element - where the readout is written. Hidden by the
 *   'visible' class being absent, so showing it causes no layout shift.
 * @returns {{ setVisible: (isVisible: boolean) => void, recordFrame: () => void }}
 */
export function createFrameRateCounter(element) {
  let isVisible = false;
  let windowStartInMilliseconds = performance.now();
  let previousFrameInMilliseconds = windowStartInMilliseconds;
  let frameCount = 0;
  let worstFrameInMilliseconds = 0;

  /** Writes the readout for the window just finished and starts a new one. */
  function publishWindow(nowInMilliseconds) {
    const windowInMilliseconds = nowInMilliseconds - windowStartInMilliseconds;
    const framesPerSecond = (frameCount * 1000) / windowInMilliseconds;
    element.textContent = `${Math.round(framesPerSecond)} fps · worst ${worstFrameInMilliseconds.toFixed(1)} ms`;
    // The colour a player can read at a glance: fine, borderline, struggling.
    element.classList.toggle('is-warning', framesPerSecond < 50);
    element.classList.toggle('is-bad', framesPerSecond < 30);
    windowStartInMilliseconds = nowInMilliseconds;
    frameCount = 0;
    worstFrameInMilliseconds = 0;
  }

  return {
    /** Shows or hides the readout. Measuring restarts, so stale frames never show. */
    setVisible(visible) {
      isVisible = !!visible;
      element.classList.toggle('visible', isVisible);
      windowStartInMilliseconds = previousFrameInMilliseconds = performance.now();
      frameCount = 0;
      worstFrameInMilliseconds = 0;
    },

    /** Call once per animation frame. Does nothing while hidden. */
    recordFrame() {
      if (!isVisible) return;
      const nowInMilliseconds = performance.now();
      worstFrameInMilliseconds = Math.max(worstFrameInMilliseconds, nowInMilliseconds - previousFrameInMilliseconds);
      previousFrameInMilliseconds = nowInMilliseconds;
      frameCount++;
      if (nowInMilliseconds - windowStartInMilliseconds >= REFRESH_INTERVAL_IN_MILLISECONDS) publishWindow(nowInMilliseconds);
    }
  };
}
