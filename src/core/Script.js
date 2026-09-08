/**
 * Cancellable scripted beats.
 *
 * THE BUG THIS EXISTS TO KILL. Level scripts drive story beats with bare
 * setTimeout, and nothing cancels them. main.js's onFreed was the worst case:
 * it armed a 4200 ms timer to blow the light bulb and a 9000 ms one to play a
 * creak. Press R inside that window and the timers keep counting against a game
 * that no longer exists -- so the freshly restarted room's bulb blows several
 * seconds in, with no warning and no way to work out why.
 *
 * Every beat in the storyline is a chain of delays like that, so this had to be
 * solved once rather than per timer.
 *
 * HOW. Same generation-counter shape as transitionTo() and the cutscene runner.
 * run() stamps the sequence; cancel() bumps the stamp; every await inside the
 * sequence returns false once the stamp is stale, so the sequence returns
 * instead of continuing. Timers are not "cancelled" so much as made harmless,
 * which is more robust than tracking handles: there is no list to forget to add
 * one to.
 *
 *     script.run(async (s) => {
 *       if (!await s.wait(4.2)) return;   // R was pressed -- stop here
 *       storm.blowBulb();
 *       if (!await s.play(BEATS.bulbBlows)) return;
 *       audio.creak();
 *     });
 */
export function createScriptRunner({ captions = null } = {}) {
  let generation = 0;
  let running = 0;

  return {
    /** Bumped by restart, and by any new run(): only one beat at a time. */
    cancel() {
      generation++;
    },

    get isRunning() {
      return running > 0;
    },

    /**
     * @param fn async (s) => {...} where `s` carries:
     *    s.alive()      - still current?
     *    s.wait(secs)   - resolves true if still current, false if cancelled
     *    s.play(lines)  - captions.play(), false if cancelled or superseded
     *    s.do(fn)       - runs fn only if still current
     */
    run(fn) {
      const mine = ++generation;
      running++;
      const alive = () => mine === generation;
      const s = {
        alive,
        wait: (secs) => new Promise((resolve) => {
          setTimeout(() => resolve(alive()), Math.max(0, secs * 1000));
        }),
        play: async (lines) => {
          if (!alive()) return false;
          const finished = captions ? await captions.play(lines) : true;
          return finished && alive();
        },
        do: (action) => {
          if (alive()) action();
          return alive();
        }
      };
      return Promise.resolve(fn(s)).finally(() => { running--; });
    }
  };
}
