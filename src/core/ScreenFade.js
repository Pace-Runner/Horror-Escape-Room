// The black between levels.
//
// A DOM overlay rather than a post-process pass: this game has no render-target
// pipeline, and a full-screen quad would still have to cover the HUD, which is
// DOM anyway. So the whole thing is one <div> and its opacity.
//
// Deliberately does NOT use the `.hidden` class every other overlay in this
// project toggles. `.hidden { display: none !important }` at the bottom of
// style.css outranks any ID selector, which is why the `transition: opacity`
// already declared on #loading-screen and #start-screen is dead code -- those
// two snap rather than fade. Opacity is driven from here instead.
export function createScreenFade(el, { defaultMs = 700 } = {}) {
  function to(opacity, ms) {
    el.style.transitionDuration = `${ms}ms`;
    // Forced reflow. Without it, a clear() immediately followed by a fadeOut()
    // in the same frame coalesces into a single style computation, the
    // transition never runs, and the screen just snaps to black.
    void el.offsetWidth;
    el.style.opacity = String(opacity);
    // Resolved on a timer, NOT on 'transitionend'. transitionend does not fire
    // when the value did not actually change, nor reliably in a backgrounded
    // tab -- and a fade promise that never settles leaves the game permanently
    // black with movement locked. A timer always fires.
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return {
    fadeOut: (ms = defaultMs) => to(1, ms),
    fadeIn: (ms = defaultMs) => to(0, ms),
    /**
     * Instant black, no transition. The mirror of clear(), for a beat that has
     * to START black -- waking up, and the endings. fadeOut(0) does the same
     * thing, but naming it stops every caller having to know that.
     */
    snapToBlack() {
      el.style.transitionDuration = '0ms';
      void el.offsetWidth;
      el.style.opacity = '1';
    },
    /** Instant, no transition. For aborts and restarts. */
    clear() {
      el.style.transitionDuration = '0ms';
      void el.offsetWidth;
      el.style.opacity = '0';
    }
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
