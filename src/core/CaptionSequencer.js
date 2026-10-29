import { setupCaptionSurface, renderCaptionLines } from './CaptionPresentation.js';
import { isEssentialCaption } from './CaptionPolicy.js';

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
 *   play() - a story sequence. Retains its caption/audio clock while direct
 *            interaction text is rendered alongside it in the same caption area.
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
    this.isSpeechPending = () => false;
    this._feedback = null;
  }

  get isPlaying() {
    return this._sequence;
  }

  get isVoiceSequence() {
    return this._sequence && (this.isVoiced(this._line) || this._queue.some(line=>this.isVoiced(line)));
  }

  _preservesThought(line) {
    return (this._line?.markThought || this.isVoiced(this._line) || this.isSpeechPending())
      && !line.markThought && !line.revealManaged && !line.endingManaged && !this.isVoiced(line);
  }

  get isVisible() {
    return this._phase !== 'idle' || !!this._feedback;
  }

  /**
   * One incidental line. Direct interactions remain visible beside a running
   * subtitle without interrupting its voice or story clock.
   *
   * Takes a plain string, a { text, voice, duration } line, or the array that
   * dialogue/index.js line() returns. A line object is what lets an examine
   * caption carry a voice clip -- onLineStart fires for it like any other. An
   * array of several lines plays them in order, but only if nothing else owns
   * the box: incidental text still never cuts into a story beat.
   */
  say(text, duration) {
    if (Array.isArray(text)) {
      text = text.map(toLine);
      if (!text.length) return false;
      if (text.length > 1) {
        if (text.every(line=>this._preservesThought(line)) && text.some(line=>this._shows(line))) {
          this._incidentalFeedback(text);return true;
        }
        if (this._sequence) {
          if(text.every(line=>!this.isVoiced(line))&&text.some(line=>this._shows(line))) {
            this._incidentalFeedback(text);return true;
          }
          return false;
        }
        this.play(text);
        return true;
      }
      text = text[0];
    }
    const line = typeof text === 'string' ? { text } : { ...text };
    if (duration != null) line.duration = duration;
    if (this._preservesThought(line)) {
      if (this._shows(line)) { this._showFeedback(toLine(line)); return true; }
      return false;
    }
    if (this._sequence) {
      // Requested object text is never dropped because a scene owns the clock.
      if (!this.isVoiced(line) && this._shows(line)) {
        this._showFeedback(toLine(line));return true;
      }
      return false;
    }
    this._start(toLine(line), false);
    return true;
  }

  _essential(line) { return isEssentialCaption(line, this.isVoiced); }

  _render() {
    const active = this._phase === 'in' || this._phase === 'hold';
    const primary = active && this._shows(this._line) ? this._line : null;
    const feedback=this._feedback?.line;
    const lines = [primary, feedback&&this._shows(feedback)?feedback:null].filter(Boolean);
    renderCaptionLines(this.el, lines.map(line=>({...line,recorded:!!this.isVoiced(line)})));
    this.el.classList.toggle('visible', lines.length > 0);
  }

  _incidentalFeedback(lines) {
    // Keep optional prose separate from essential text when combining a multi-line inspection.
    const essential=lines.filter(line=>this._essential(line));
    const visible=essential.length?essential:lines;
    this._showFeedback(toLine({text:visible.map(line=>line.text).join(' '),descriptive:!essential.length,staticInspection:visible.some(line=>line.staticInspection)}));
  }

  _showFeedback(line) {
    this._feedback = {line,remaining:line.duration};
    this._render();
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
    if (!list.length) return Promise.resolve(true);
    if (list.every(line=>this._preservesThought(line))) {
      if(list.some(line=>this._shows(line)))this._incidentalFeedback(list);
      return Promise.resolve(true);
    }
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

  /** Fade the current line; requested object text keeps its own reading time. */
  _hideLine() {
    this.el.style.transitionDuration = `${this._queue.length ? SWAP_FADE : FADE}s`;
    this._render();
  }

  /**
   * Hard stop. Everything hidden, every queue empty, every pending promise
   * released. resetGame() calls this: a restart used to leave the previous
   * run's captions to fade in over the fresh room.
   */
  cancel({keepFeedback = false} = {}) {
    if (keepFeedback && this._line?.interaction
      && (this._phase === 'in' || this._phase === 'hold')) {
      const requested = [this._line,...this._queue].filter(line=>line.interaction);
      const essential=requested.filter(line=>this._essential(line));
      const visible=essential.length?essential:requested;
      const line = toLine({text:visible.map(line=>line.text).join(' '),interaction:true,descriptive:!essential.length,staticInspection:visible.some(line=>line.staticInspection)});
      this._feedback = {line,remaining:line.duration};
    }
    if (!keepFeedback) this._feedback = null;
    this.onLineCancel?.(this._line);
    this._settle(false);
    this._queue = [];
    this._phase = 'idle';
    this._sequence = false;
    this._line = null;
    this._t = 0;
    this.el.style.transitionDuration = '';
    this._render();
  }
  cancelMarkThought() {
    if(!this._line?.markThought)return;
    this.cancel({keepFeedback:true});this.el.style.transitionDuration='0s';
    if(!this._feedback)this.el.textContent='';
  }
  extendMarkThought(seconds) {
    if(this._line?.markThought)this._line.duration=Math.max(1,seconds);
  }
  isCurrent(line){return this._line===line;}
  waitForVoice(line){if(this.isCurrent(line)){line.manualEnd=true;line.voicePending=true;this._render();}}
  beginVoice(line,duration){
    if(!this.isCurrent(line))return;
    line.duration=duration;line.manualEnd=true;line.voicePending=false;this._phase='in';this._t=0;
    this._render();
  }

  failVoice(line) {
    if (!this.isCurrent(line)) return;
    line.voicePending=false;line.manualEnd=false;line.duration=readingTime(line.text);
    this._phase='in';this._t=0;
    this._render();
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
    this._render();
  }

  /**
   * Whether a line is drawn. A line marked `always` (a hint the player asked
   * for with H) is help, not dialogue, and shows even with captions off.
   */
  _shows(line) {
    return !!line && !line.voicePending && (this.enabled || this._essential(line));
  }

  update(dt) {
    if (this.paused) return;
    if (this._feedback) {
      this._feedback.remaining -= dt;
      if (this._feedback.remaining <= 0) {this._feedback=null;this._render();}
    }
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
      this.el.style.transitionDuration = '';
      this._render();
      if (wasSequence) this._settle(true);
    }
  }

  _start(line, isSequence) {
    // A delayed recording can start after the player has inspected an object.
    // Keep that requested text in this same surface when speech takes ownership.
    if (this._line?.interaction && (this.isVoiced(line) || line.recorded)
      && (this._phase === 'in' || this._phase === 'hold')) {
      this._feedback = {line:this._line,remaining:this._line.duration};
    }
    if(this._line!==line)this.onLineCancel?.(this._line);
    this._line = line;
    this._sequence = isSequence;
    this._phase = 'in';
    this._t = 0;
    this.el.style.transitionDuration = `${isSequence ? SWAP_FADE : FADE}s`;
    this._render();
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
