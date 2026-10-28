import { setupCaptionSurface, renderCaptionText } from './CaptionPresentation.js';

/**
 * The game's one caption authority.
 *
 * WHAT WAS WRONG. Interaction.showCaption() wrote the text, added .visible, and
 * armed a single setTimeout that it cleared on every call. Three consequences,
 * all of which the storyline walks straight into:
 *
 *   1. Two lines inside the 4.2 s window silently ate each other. Every story
 *      beat in this game is written as several lines in a row, so there was no
 *      way to say anything longer than one sentence.
 *   2. The timer was a setTimeout, which keeps counting while the game is
 *      paused. audio.pause() suspends the audio context on the same Esc, so a
 *      voiced line and its caption drifted apart the first time anyone paused.
 *   3. Nothing could wait for a caption to finish, so a cutscene had no way to
 *      time anything against what was being said.
 *
 * WHAT THIS DOES INSTEAD. Captions advance on the frame clock, from update(dt),
 * which the pause flag simply stops feeding. play() returns a promise, so a
 * scripted sequence is `await captions.play([...])` rather than a pile of
 * nested setTimeouts.
 *
 * PRIORITY. Two entry points on purpose:
 *
 *   say()  - one incidental line. This is what examining a radiator does, and
 *            it is what all ~50 existing call sites get. A later say() replaces
 *            an earlier one, exactly as before.
 *   play() - a story sequence. Outranks say(): while one is running, incidental
 *            examine text is dropped rather than being allowed to cut into the
 *            middle of a beat.
 *
 * That ordering is the point. The old code let whatever spoke last win, which
 * for a story means the player brushing a prop can delete a plot line.
 */

/**
 * Reading time when a line does not specify one: a fixed cost to notice the box
 * plus per-character reading time, clamped. 55 ms/char is around 220 words per
 * minute, slowed a little because this text is read once, in the dark, while
 * walking. The 4200 ms the old constant used lands mid-range for a short line,
 * so nothing already written gets noticeably faster or slower.
 */
const READ_FIXED = 1.45;
const READ_PER_CHAR = 0.055;
const READ_MIN = 2.4;
const READ_MAX = 9.5;

/** Matches the 0.4s opacity transition in style.css. Keep the two in step. */
const FADE = 0.4;
/**
 * Between lines OF THE SAME sequence the box dips instead of fading fully out
 * and back in: a full 0.8 s round trip between every line makes a four-line
 * beat feel like it is buffering. The dip still has to be visible, or two
 * consecutive lines read as one line that mysteriously rewrote itself.
 */
const SWAP_FADE = 0.16;
const SWAP_GAP = 0.06;
// Input errors, item requirements and puzzle status remain functional feedback.
const FUNCTIONAL_KEY = /(?:^|_)(?:hint|wrong|invalid|full|need|needs|hold|required|missing|blocked|unpowered|locked|no_power|not_ready|taken|insert|load|trip|trips|tripped|already|pickup)(?:_|$)/;

export function readingTime(text) {
  return Math.min(READ_MAX, Math.max(READ_MIN, READ_FIXED + text.length * READ_PER_CHAR));
}

/** Accepts a plain string or { text, duration } and normalises to the latter. */
function toLine(line) {
  const obj = typeof line === 'string' ? { text: line } : { ...line };
  obj.text = String(obj.text ?? '');
  obj.duration = obj.duration ?? readingTime(obj.text);
  return obj;
}

export class CaptionSequencer {
  constructor(el) {
    this.el = el;
    setupCaptionSurface(el);
    this.paused = false;
    // The settings-menu captions toggle. Deliberately does not touch the
    // timing state machine below or onLineStart (which is what fires the
    // voice clip) -- turning descriptions off never hides spoken subtitles or changes
    // how long a beat takes or mute a recorded line. See setEnabled().
    this.enabled = true;

    /** Remaining lines of the running sequence; empty when only say() is up. */
    this._queue = [];
    /** 'idle' | 'in' | 'hold' | 'out' -- where the current line is in its life. */
    this._phase = 'idle';
    this._t = 0;
    this._line = null;
    /** True while a play() sequence owns the box, so say() stands aside. */
    this._sequence = false;
    this._resolve = null;
    /**
     * A help line (a hint) drawn in the box while captions are off and a story
     * sequence is running unseen underneath it. Its own little clock, so the
     * hidden sequence keeps its timing: { line, phase, t } or null.
     */
    this._aside = null;
    /** Fires when a line becomes visible; the voice bus hangs off this. */
    this.onLineStart = null;
    this.onLineCancel = null;
    /**
     * Whether a line has a recording that will actually play. main.js wires it
     * to the audio engine. Recorded speech always has subtitles; the setting
     * controls only unvoiced descriptions. Functional feedback and requested
     * hints can opt into `always` independently of this setting.
     */
    this.isVoiced = line => Boolean(line?.recorded || line?.voice);
  }

  get isPlaying() {
    return this._sequence;
  }

  get isVoiceSequence() {
    return this._sequence && (this.isVoiced(this._line) || this._queue.some(line=>this.isVoiced(line)));
  }

  _preservesThought(line) {
    return this._line?.markThought && !line.markThought && !line.revealManaged
      && !line.always && !this.isVoiced(line);
  }

  get isVisible() {
    return this._phase !== 'idle';
  }

  /**
   * One incidental line. Returns false if a story sequence is running, so the
   * caller can tell it was dropped (nothing needs to today, but a level that
   * wants to re-offer the line later can).
   *
   * Takes a plain string, a { text, voice, duration } line, or the array that
   * dialogue/index.js line() returns. A line object is what lets an examine
   * caption carry a voice clip -- onLineStart fires for it like any other. An
   * array of several lines plays them in order, but only if nothing else owns
   * the box: incidental text still never cuts into a story beat.
   */
  say(text, duration) {
    if (Array.isArray(text)) {
      if (!text.length) return false;
      if (text.length > 1) {
        if (this._sequence) return false;
        this.play(text);
        return true;
      }
      text = text[0];
    }
    const line = typeof text === 'string' ? { text } : { ...text };
    if (duration != null) line.duration = duration;
    if (this._preservesThought(line)) return false;
    if (this._sequence) {
      // Requested help may use the box while a hidden description advances.
      // Visible dialogue keeps ownership of its subtitle surface.
      if (this._shows(this._line) || !line.always) return false;
      this._showAside(toLine(line));
      return true;
    }
    this._start(toLine(line), false);
    return true;
  }

  _showAside(line) {
    this._aside = { line, phase: 'in', t: 0 };
    renderCaptionText(this.el, line);
    this.el.style.transitionDuration = `${FADE}s`;
    this.el.classList.add('visible');
  }

  /** Advances the aside line on the same frame clock as everything else. */
  _updateAside(dt) {
    const aside = this._aside;
    aside.t += dt;
    if (aside.phase === 'in' && aside.t >= FADE) {
      aside.phase = 'hold';
      aside.t = 0;
    } else if (aside.phase === 'hold' && aside.t >= aside.line.duration) {
      aside.phase = 'out';
      aside.t = 0;
      this.el.classList.remove('visible');
    } else if (aside.phase === 'out' && aside.t >= FADE) {
      this._aside = null;
    }
  }

  /**
   * Play `lines` in order.
   *
   * Resolves TRUE when the last line has faded out, and FALSE if the sequence
   * was cancelled or superseded by another play(). It always resolves, and that
   * is deliberate: the caller is usually a cutscene holding the camera in a
   * `try/finally`, and a promise that never settles would strand it there with
   * the player frozen and the hands hidden. Returning the outcome instead lets
   * it bail out cleanly:
   *
   *     if (!(await captions.play(LINES))) return;   // something else took over
   */
  play(lines, { interrupt = true } = {}) {
    const list = (Array.isArray(lines) ? lines : [lines]).map(toLine).filter((l) => l.text);
    if (!list.length || list.every(line=>this._preservesThought(line))) return Promise.resolve(true);
    if (this._sequence && !interrupt) return Promise.resolve(false);

    this._settle(false);
    this._queue = list.slice(1);
    this._start(list[0], true);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  /** Ends the line on screen now and moves to the next one, if any. */
  skip() {
    if (this._phase === 'idle') return;
    this.onLineCancel?.(this._line);
    this._phase = 'out';
    this._t = 0;
    this._hideLine();
  }

  /** Fades the current line out, unless a hint drawn over it owns the box. */
  _hideLine() {
    if (this._aside) return;
    this.el.style.transitionDuration = `${this._queue.length ? SWAP_FADE : FADE}s`;
    this.el.classList.remove('visible');
  }

  /**
   * Hard stop. Everything hidden, every queue empty, every pending promise
   * released. resetGame() calls this: a restart used to leave the previous
   * run's captions to fade in over the fresh room.
   */
  cancel() {
    this.onLineCancel?.(this._line);
    this._settle(false);
    this._queue = [];
    this._phase = 'idle';
    this._sequence = false;
    this._line = null;
    this._t = 0;
    this._aside = null;
    this.el.style.transitionDuration = '';
    this.el.classList.remove('visible');
  }
  cancelMarkThought() {
    if(!this._line?.markThought)return;
    this.cancel();this.el.style.transitionDuration='0s';this.el.textContent='';
  }
  extendMarkThought(seconds) {
    if(this._line?.markThought)this._line.duration=Math.max(1,seconds);
  }
  isCurrent(line){return this._line===line;}
  waitForVoice(line){if(this.isCurrent(line)){line.manualEnd=true;line.voicePending=true;this.el.classList.remove('visible');}}
  beginVoice(line,duration){
    if(!this.isCurrent(line))return;
    line.duration=duration;line.manualEnd=true;line.voicePending=false;this._phase='in';this._t=0;
    if(this._shows(line)){renderCaptionText(this.el,line);this.el.classList.add('visible');}
  }

  setPaused(paused) {
    this.paused = paused;
  }

  /**
   * The settings-menu captions toggle.
   *
   * Turning descriptions off leaves their reading-time clock
   * in update() keeps running underneath exactly as if it were visible, so a
   * story script awaiting captions.play() still waits the same real seconds
   * either way. Spoken subtitles and explicitly functional lines always show.
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (this._aside) return;   // a hint on screen keeps showing either way
    const onScreen = this._phase === 'hold' || this._phase === 'in';
    const show = onScreen && this._shows(this._line);
    // A line that started hidden never wrote its text, so write it now.
    if (show) renderCaptionText(this.el, this._line);
    this.el.classList.toggle('visible', show);
  }

  /**
   * Whether a line is drawn. A line marked `always` (a hint the player asked
   * for with H) is help, not dialogue, and shows even with captions off.
   */
  _shows(line) {
    return !line?.voicePending&&(this.enabled || Boolean(line?.always || line?.hint || line?.functional || line?.recorded)
      || FUNCTIONAL_KEY.test(line?.key??'') || this.isVoiced(line));
  }

  update(dt) {
    if (this.paused) return;
    if (this._aside) this._updateAside(dt);
    if (this._phase === 'idle') return;
    this._t += dt;

    if (this._phase === 'in') {
      // The fade-in is not charged against reading time -- the line is only
      // legible once it is actually on screen.
      if (this._t >= (this._sequence ? SWAP_FADE : FADE)) { this._phase = 'hold'; this._t = 0; }
      return;
    }
    if (this._phase === 'hold') {
      // Audio-owned dialogue ends from its source's completion callback.
      if (!this._line.manualEnd && this._t >= this._line.duration) {
        this._phase = 'out';
        this._t = 0;
        this._hideLine();
      }
      return;
    }
    // 'out'
    const fade = this._queue.length ? SWAP_FADE + SWAP_GAP : FADE;
    if (this._t < fade) return;
    if (this._queue.length) {
      this._start(this._queue.shift(), true);
    } else {
      const wasSequence = this._sequence;
      this._phase = 'idle';
      this._sequence = false;
      this._line = null;
      if (!this._aside) this.el.style.transitionDuration = '';
      if (wasSequence) this._settle(true);
    }
  }

  _start(line, isSequence) {
    if(this._line!==line)this.onLineCancel?.(this._line);
    this._line = line;
    this._sequence = isSequence;
    this._phase = 'in';
    this._t = 0;
    // A line that will not be seen leaves the box alone, so a hint drawn
    // there (captions off) is not overwritten by the story running unseen.
    if (this._shows(line)) {
      this._aside = null;
      renderCaptionText(this.el, line);
      // Set before the class flips, so the browser uses this duration for the
      // transition it is about to start rather than the previous one.
      this.el.style.transitionDuration = `${isSequence ? SWAP_FADE : FADE}s`;
      this.el.classList.add('visible');
    } else if (!this._aside) {
      this.el.classList.remove('visible');
    }
    this.onLineStart?.(line);
  }

  /**
   * Releases a pending play() promise exactly once, with its outcome. Nulling
   * the slot first is what makes "exactly once" true -- cancel() during the
   * last line would otherwise settle the same promise twice.
   */
  _settle(completed) {
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(completed);
  }
}
