/**
 * Timed steps on the FRAME clock, for scripted beats that drive the player's
 * own camera (core/HallwayBlinks.js, core/StairsFall.js).
 *
 * The same shape core/StairsScare.js grew for itself: main.js calls update(dt)
 * every frame, with 0 while the game is paused, so Esc holds a beat rather
 * than letting it play out behind the pause menu; and each frame is capped, so
 * a stalled frame cannot skip one.
 */

/** The most one frame may advance a step, so a stalled frame cannot skip a beat. */
const MAX_FRAME_SECONDS = 1 / 30;

export function createFrameClock() {
  /** Per-frame steps waiting on update(), each returning true once it is done. */
  let steps = [];

  return {
    /**
     * Runs `onFrame(t, elapsedSeconds)` once a frame for `seconds`, t going 0 to 1.
     *
     * @returns {Promise<boolean>} false if `isAlive` turned false part way (a
     *   restart), in which case the caller must stop.
     */
    animate(seconds, isAlive, onFrame = () => {}) {
      return new Promise((resolve) => {
        let elapsed = 0;
        steps.push((dt) => {
          if (!isAlive()) { resolve(false); return true; }
          elapsed += Math.min(MAX_FRAME_SECONDS, dt);
          const t = Math.min(1, elapsed / seconds);
          onFrame(t, elapsed);
          if (t < 1) return false;
          resolve(true);
          return true;
        });
      });
    },

    /** Advances every waiting step. */
    update(dt) {
      if (steps.length === 0) return;
      const now = steps;
      steps = [];
      for (const step of now) {
        if (!step(dt)) steps.push(step);
      }
    },

    /** Drops every waiting step without resolving it -- for handing everything back. */
    clear() {
      steps = [];
    }
  };
}
