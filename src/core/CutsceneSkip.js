/**
 * HOLD SPACE TO SKIP, for a scene that allows it (`skippable: true` in its
 * def -- see core/Cutscene.js).
 *
 * HELD, NOT PRESSED. The wake-up plays the moment a new game starts, which is
 * exactly when a player's hands are still on the keyboard from clicking Play
 * and finding WASD: a single press would throw away the first thing the game
 * has to show them by accident. Holding for HOLD_SECONDS is a decision.
 *
 * INVISIBLE UNTIL ASKED FOR. The prompt only appears once a key is pressed
 * during the scene, and fades again if nothing more happens, so a first-time
 * player watching the scene never has a "skip" label sitting in the corner of
 * it. Anyone replaying presses something and is told how.
 *
 * On real time, not the scene's: a paused scene does not fill the bar, but
 * slow motion (the free camera's T) does not slow it down either.
 */

const HOLD_SECONDS = 0.8;
/** How long the prompt stays after the last key, before fading back out. */
const PROMPT_SECONDS = 2.5;
const SKIP_KEY = 'Space';

export function createCutsceneSkip({ cutscene, isInputLive }) {
  const prompt = document.createElement('div');
  prompt.id = 'cutscene-skip';
  prompt.innerHTML = '<span class="cutscene-skip-label">Hold <kbd>Space</kbd> to skip</span>'
    + '<span class="cutscene-skip-bar"><span class="cutscene-skip-fill"></span></span>';
  document.body.appendChild(prompt);
  const fill = prompt.querySelector('.cutscene-skip-fill');

  let holding = false;
  let progress = 0;
  let promptLeft = 0;

  const canSkip = () => cutscene.isRunning && cutscene.skippable && isInputLive();

  window.addEventListener('keydown', (e) => {
    if (!canSkip()) return;
    promptLeft = PROMPT_SECONDS;
    if (e.code === SKIP_KEY) {
      e.preventDefault();
      holding = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === SKIP_KEY) holding = false;
  });
  // A keyup that never arrives (Alt-Tab) must not leave the bar filling.
  window.addEventListener('blur', () => { holding = false; });

  return {
    /** Once a frame, on real time. */
    update(realDt) {
      if (!canSkip()) {
        holding = false;
        progress = 0;
        promptLeft = 0;
        prompt.classList.remove('visible');
        return;
      }
      if (holding) {
        progress += realDt / HOLD_SECONDS;
        promptLeft = PROMPT_SECONDS;
      } else {
        // Let go early and it drains, rather than snapping back to empty.
        progress = Math.max(0, progress - realDt * 2);
      }
      promptLeft = Math.max(0, promptLeft - realDt);
      prompt.classList.toggle('visible', promptLeft > 0);
      fill.style.transform = `scaleX(${Math.min(1, progress)})`;
      if (progress >= 1) {
        holding = false;
        progress = 0;
        promptLeft = 0;
        prompt.classList.remove('visible');
        cutscene.skip();
      }
    }
  };
}
