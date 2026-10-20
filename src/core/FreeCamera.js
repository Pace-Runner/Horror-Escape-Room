import * as THREE from 'three';

/**
 * FREE CAMERA -- a fly-through camera for recording clips and the trailer.
 *
 * A SEPARATE camera, not the player's one moved about, for the same reason the
 * third-person view is (see thirdCam in main.js): the hands, the torch and the
 * dust motes are parented to the player's camera, and everything that reads
 * "where is the player" -- the creature, the interaction ray, the minimap,
 * the level triggers -- reads it off that camera. Flying a second one leaves
 * the player standing exactly where they were, and the game carries on round
 * them while the shot is lined up.
 *
 * INPUT IS TAKEN, NOT SHARED. While the camera is active and the pointer is
 * locked, every key, mouse move and wheel step is caught on the window in the
 * CAPTURE phase and stopped there, so PointerLockPlayer, Interaction and
 * main.js's own key handler never see it. Without that, W would walk the
 * player and fly the camera at once, and Q would drop the held item. The only
 * keys let through are PASS_THROUGH_KEYS.
 *
 * Movement and look are both heavily smoothed -- much more than the player's
 * own look -- because this camera exists to make footage, and footage wants
 * a dolly's ease-in and ease-out rather than the instant response that suits
 * play.
 *
 * SHOTS ARE AUTHORED HERE TOO. The in-engine cutscenes (core/Cutscene.js) are
 * timelines of camera shots, and the easiest way to find a good framing is
 * to fly to it. So the camera can write down where it is, two ways:
 *
 *   M marks a keyframe -- one framing. Each mark copies the whole list of
 *     marks to the clipboard as a scene-ready shots array, one shot per mark,
 *     each cut to and held for the real time until the next mark was made.
 *     Fly, mark, fly, mark, paste.
 *   J records a take -- a flown move, sampled at an even 30 Hz on real time
 *     until J is pressed again (or the pause menu takes the pointer). The
 *     finished take is copied as { seconds, samples }, which the runner
 *     replays as it was flown.
 *
 * Backspace clears the marks to start a new list; takes are kept. Everything
 * copied is also logged to the console, in case the clipboard refused it, and
 * both lists are public, so window.__game.freeCamera.marks and .takes read
 * them back.
 */

/** Toggles the free camera on and off. N for noclip. */
export const FREE_CAMERA_TOGGLE_KEY = 'KeyN';

/**
 * Let through to the game even while flying. Escape so the pause menu still
 * opens; F so the player's torch can be switched on and off to light a shot.
 */
const PASS_THROUGH_KEYS = new Set(['Escape', 'KeyF']);

/** Radians of look per raw mouse count, before the settings-menu multiplier. */
const LOOK_RADIANS_PER_COUNT = 0.0018;
/** Time constant of the look easing. The player's own is 0.022; this is a camera operator's hand. */
const LOOK_SMOOTH_SECONDS = 0.14;
/** Just shy of straight up/down, so the view never flips through the pole. */
const PITCH_LIMIT_RADIANS = Math.PI / 2 - 0.001;

const SPEED_DEFAULT_METRES_PER_SECOND = 1.5;
const SPEED_MIN_METRES_PER_SECOND = 0.1;
const SPEED_MAX_METRES_PER_SECOND = 12;
/** Each wheel notch multiplies or divides the speed by this. */
const SPEED_STEP_FACTOR = 1.25;
/** Held Shift multiplies the speed by this, for getting across a level between takes. */
const BOOST_FACTOR = 4;
/** Time constant of the move easing: how long the camera takes to get up to speed and to glide to a stop. */
const MOVE_SMOOTH_SECONDS = 0.35;

const FOV_MIN_DEGREES = 15;
const FOV_MAX_DEGREES = 100;
/** How fast holding Z or X zooms. */
const FOV_RATE_DEGREES_PER_SECOND = 25;
const FOV_SMOOTH_SECONDS = 0.2;

/** T steps through these. Freezing is P, separately, so it can be toggled in one press. */
const TIME_SCALES = [1, 0.5, 0.25];

/** How long the status line stays up after something changes, before it fades so it is not in the shot. */
const STATUS_VISIBLE_MILLISECONDS = 1800;
/** The controls list is longer, so it stays up longer when the camera is first switched on. */
const HELP_VISIBLE_MILLISECONDS = 6000;
const HELP_TEXT = 'WASD move · E/Space up · Q down · Shift boost · wheel speed · '
  + 'Z/X zoom · R reset zoom · T slow-mo · P freeze · B show body · H show HUD · '
  + 'M mark · J record take · Backspace clear marks · N exit';

/**
 * A take is sampled this often, on real time -- the camera's own clock -- so
 * a move flown through slow-mo or a frozen world plays back at the speed it
 * was flown, not the speed the world was running at.
 */
const TAKE_SAMPLES_PER_SECOND = 30;
/** A take left running stops itself here rather than growing for ever. */
const TAKE_MAX_SECONDS = 60;
const TAKE_MAX_SAMPLE_INDEX = TAKE_MAX_SECONDS * TAKE_SAMPLES_PER_SECOND;
/** Shown, and kept up, for as long as a take is recording. */
const TAKE_STATUS_FLAG = 'REC';

/**
 * How far along the view a shot's lookAt point is put. Any distance frames
 * the shot the same; a few metres is a point that still makes sense when the
 * shot is edited by hand.
 */
const LOOK_AT_DISTANCE_METRES = 4;
/** The last mark has no next mark to measure its hold to, so it gets this. */
const LAST_SHOT_SECONDS = 1.5;

/**
 * What marks and take samples are rounded to: hundredths of a second,
 * millimetres, a ten-thousandth of a radian (half a millimetre at the far
 * end of a 4 m lookAt) and hundredths of a degree. Finer than anyone can
 * see, and short enough that a pasted shot list stays readable.
 *
 * Two are finer, because a coarser value would show:
 *
 *   A take's sample times. The cutscene runner plays a take back by its
 *     samples' t, and k / 30 rounded to hundredths runs 0, 0.03, 0.07, 0.1 --
 *     gaps up to 17% off, so a steady pan would replay at a speed wobbling
 *     ten times a second. To a ten-thousandth, it is under 0.3%.
 *   A shot's lookAt. Looking almost straight down, the 4 m lookAt is only a
 *     few millimetres off to the side of the camera, and rounding that to the
 *     millimetre could swing the replayed heading by 8°. To five places it is
 *     at most a tenth of a degree, at the very limit of the pitch.
 */
const SECONDS_DECIMALS = 2;
const TAKE_SECONDS_DECIMALS = 4;
const METRES_DECIMALS = 3;
const LOOK_AT_DECIMALS = 5;
const RADIANS_DECIMALS = 4;
const DEGREES_DECIMALS = 2;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const VIEW_AXIS = new THREE.Vector3(0, 0, -1);
const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const WISH_DIRECTION = new THREE.Vector3();
const LOOK = new THREE.Euler(0, 0, 0, 'YXZ');
const LOOK_AT = new THREE.Vector3();
const TAKE_POSITION = new THREE.Vector3();

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundVector(vector, decimals) {
  return [round(vector.x, decimals), round(vector.y, decimals), round(vector.z, decimals)];
}

/** A JSON array with one element per line: easy to read when pasted, and still plain JSON. */
function formatJsonRows(rows) {
  return `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n]`;
}

export class FreeCamera {
  /**
   * @param {object} options
   * @param {THREE.PerspectiveCamera} options.sourceCamera The player's camera.
   *   Each time the free camera is switched on it starts from this camera's
   *   position, orientation and FOV, so the first frame is not a cut.
   * @param {() => THREE.PerspectiveCamera} [options.getStartCamera] The camera
   *   on screen when it is switched on, if that is not always the player's --
   *   a cutscene films through its own. Defaults to sourceCamera. Only the
   *   starting pose comes from it; zoom reset and zoom scaling stay relative
   *   to the player's FOV.
   * @param {() => boolean} options.isInputLive Whether the game currently has
   *   the pointer. Input is only taken while this is true, so the pause menu,
   *   the settings screen and the diegetic close-ups all keep their keys.
   * @param {() => number} [options.getSensitivityMultiplier] The settings
   *   menu's mouse sensitivity, so the free camera turns at the rate the
   *   player is used to.
   * @param {() => void} [options.onChange] Called whenever something main.js
   *   has to react to changes: switching on or off, or showing the body.
   */
  constructor({ sourceCamera, getStartCamera = null, isInputLive, getSensitivityMultiplier = () => 1, onChange = () => {} }) {
    this.sourceCamera = sourceCamera;
    this.getStartCamera = getStartCamera ?? (() => sourceCamera);
    this.isInputLive = isInputLive;
    this.getSensitivityMultiplier = getSensitivityMultiplier;
    this.onChange = onChange;

    this.camera = new THREE.PerspectiveCamera(
      sourceCamera.fov,
      sourceCamera.aspect,
      sourceCamera.near,
      sourceCamera.far
    );

    this.isActive = false;
    /** World seconds per real second. Only ever not 1 while the camera is active. */
    this.timeScale = 1;
    this.isWorldFrozen = false;
    this.isHudVisible = false;
    this.isPlayerBodyVisible = false;
    this.speedInMetresPerSecond = SPEED_DEFAULT_METRES_PER_SECOND;

    this.heldKeys = new Set();
    this.velocity = new THREE.Vector3();
    this.yawInRadians = 0;
    this.pitchInRadians = 0;
    this.targetYawInRadians = 0;
    this.targetPitchInRadians = 0;
    this.targetFovInDegrees = sourceCamera.fov;
    this.statusHideTimer = null;

    /**
     * Keyframes made with M, each { t, pos:[x,y,z], yaw, pitch, fov }, with t
     * the real seconds since the first one. Kept across switching the camera
     * off and on, so the player can be walked somewhere between marks.
     */
    this.marks = [];
    /**
     * The clock marks are timed on: real seconds, but only those the game had
     * the pointer for. Time on the pause menu or in another window, pasting
     * the last list, is not counted -- a mark made after two minutes away
     * would otherwise be a two-minute shot, and the runner cuts a scene off
     * at 90 s. Seconds rather than performance.now() for the same reason.
     */
    this.markClockSeconds = 0;
    this.firstMarkSeconds = 0;
    /** Finished takes recorded with J, each { seconds, samples }, samples shaped like marks. */
    this.takes = [];
    /**
     * The take J is recording, or null. `lastFrame` is the camera as it was at
     * the end of the previous frame, so a sample that falls between two
     * frames can be interpolated to its exact time -- see #updateTake.
     */
    this.takeInProgress = null;

    this.statusElement = this.#createStatusElement();
    this.#listenForInput();
    window.addEventListener('resize', () => this.#updateAspect());
  }

  /** Switches the free camera on or off. */
  toggle() {
    if (this.isActive) this.disable();
    else this.enable();
  }

  /**
   * Switches the free camera on, starting exactly where the player's camera
   * is. Speed is kept from the last time, so a run of takes at the same pace
   * does not have to be set up again each time.
   */
  enable() {
    if (this.isActive) return;
    this.isActive = true;
    this.#copySourceCamera();
    this.velocity.set(0, 0, 0);
    this.heldKeys.clear();
    this.#applyHudVisibility();
    this.#showStatus(HELP_TEXT, HELP_VISIBLE_MILLISECONDS);
    this.onChange();
  }

  /**
   * Switches the free camera off and puts the world back on normal time.
   * Time has to be reset here: a world left frozen or slowed after the camera
   * is gone would look like the game had hung.
   *
   * A take still recording is finished here too. Left running, it would sit
   * still while the camera was off and then jump to wherever the player was
   * standing when it came back on. Its "Take n" line is left up to fade by
   * itself, so leaving the camera does not hide whether the take was kept.
   */
  disable() {
    if (!this.isActive) return;
    this.isActive = false;
    this.timeScale = 1;
    this.isWorldFrozen = false;
    this.heldKeys.clear();
    this.#applyHudVisibility();
    if (this.takeInProgress) this.#finishTake();
    else this.#hideStatus();
    this.onChange();
  }

  /**
   * Moves, turns and zooms the camera for one frame.
   *
   * @param {number} realDtInSeconds Wall-clock frame time, NOT the scaled
   *   world time: the camera has to fly smoothly through a slowed or frozen
   *   world, and it would stop dead if it were on the world's clock.
   */
  update(realDtInSeconds) {
    // Before the isActive check: walking the player between marks, with the
    // camera off, is still time between marks.
    if (this.isInputLive()) this.markClockSeconds += realDtInSeconds;
    if (!this.isActive) return;
    this.#updateLook(realDtInSeconds);
    this.#updateMove(realDtInSeconds);
    this.#updateFov(realDtInSeconds);
    // Last, so a take samples the camera as this frame will draw it. Losing
    // the pointer -- Escape to the pause menu, Alt-Tab -- ends the take, as
    // switching the camera off does: J cannot reach it from the pause menu,
    // the REC line is hidden under it, and a take left running there would
    // fill with a camera sitting still, up to the cap.
    if (this.isInputLive()) this.#updateTake(realDtInSeconds);
    else if (this.takeInProgress) this.#finishTake();
  }

  #copySourceCamera() {
    const start = this.getStartCamera() ?? this.sourceCamera;
    start.updateMatrixWorld();
    start.getWorldPosition(this.camera.position);
    LOOK.setFromQuaternion(start.getWorldQuaternion(this.camera.quaternion), 'YXZ');
    this.yawInRadians = this.targetYawInRadians = LOOK.y;
    this.pitchInRadians = this.targetPitchInRadians = LOOK.x;
    this.camera.fov = this.targetFovInDegrees = start.fov;
    this.#updateAspect();
  }

  #updateAspect() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Eases the actual yaw and pitch toward where the mouse has asked for. */
  #updateLook(dtInSeconds) {
    const ease = 1 - Math.exp(-dtInSeconds / LOOK_SMOOTH_SECONDS);
    this.yawInRadians += (this.targetYawInRadians - this.yawInRadians) * ease;
    this.pitchInRadians += (this.targetPitchInRadians - this.pitchInRadians) * ease;
    LOOK.set(this.pitchInRadians, this.yawInRadians, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(LOOK);
  }

  /**
   * Flies along the view, not along the floor: looking down and pressing W
   * dives. E and Q go straight up and down in world space whatever the view
   * is doing, so a crane shot is a single key.
   */
  #updateMove(dtInSeconds) {
    this.#readWishDirection(WISH_DIRECTION);
    const boost = this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight') ? BOOST_FACTOR : 1;
    WISH_DIRECTION.multiplyScalar(this.speedInMetresPerSecond * boost);
    const ease = 1 - Math.exp(-dtInSeconds / MOVE_SMOOTH_SECONDS);
    this.velocity.lerp(WISH_DIRECTION, ease);
    this.camera.position.addScaledVector(this.velocity, dtInSeconds);
  }

  /**
   * Fills `out` with the unit direction the held keys ask for, or zero.
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3} out
   */
  #readWishDirection(out) {
    this.camera.getWorldDirection(FORWARD);
    RIGHT.crossVectors(FORWARD, WORLD_UP).normalize();
    out.set(0, 0, 0);
    if (this.#isHeld('KeyW', 'ArrowUp')) out.add(FORWARD);
    if (this.#isHeld('KeyS', 'ArrowDown')) out.sub(FORWARD);
    if (this.#isHeld('KeyD', 'ArrowRight')) out.add(RIGHT);
    if (this.#isHeld('KeyA', 'ArrowLeft')) out.sub(RIGHT);
    if (this.#isHeld('KeyE', 'Space')) out.add(WORLD_UP);
    if (this.#isHeld('KeyQ')) out.sub(WORLD_UP);
    return out.lengthSq() > 0 ? out.normalize() : out;
  }

  /** Zoom is held rather than stepped, so it can be ridden smoothly during a take. */
  #updateFov(dtInSeconds) {
    const zoomDirection = (this.#isHeld('KeyX') ? 1 : 0) - (this.#isHeld('KeyZ') ? 1 : 0);
    if (zoomDirection !== 0) {
      this.targetFovInDegrees = THREE.MathUtils.clamp(
        this.targetFovInDegrees + zoomDirection * FOV_RATE_DEGREES_PER_SECOND * dtInSeconds,
        FOV_MIN_DEGREES,
        FOV_MAX_DEGREES
      );
      this.#showStatus(this.#describeState());
    }
    const ease = 1 - Math.exp(-dtInSeconds / FOV_SMOOTH_SECONDS);
    const nextFovInDegrees = this.camera.fov + (this.targetFovInDegrees - this.camera.fov) * ease;
    if (Math.abs(nextFovInDegrees - this.camera.fov) < 1e-4) return;
    this.camera.fov = nextFovInDegrees;
    this.camera.updateProjectionMatrix();
  }

  #isHeld(...codes) {
    return codes.some((code) => this.heldKeys.has(code));
  }

  /**
   * All in the capture phase on the window, which runs before every other
   * listener in the game -- see "INPUT IS TAKEN" at the top of this file.
   */
  #listenForInput() {
    window.addEventListener('keydown', (e) => this.#handleKeyDown(e), { capture: true });
    window.addEventListener('keyup', (e) => this.#handleKeyUp(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.#handlePointerMove(e), { capture: true });
    window.addEventListener('wheel', (e) => this.#handleWheel(e), { capture: true, passive: false });
    // A keyup that never arrives (Alt-Tab) would leave the camera drifting.
    window.addEventListener('blur', () => this.heldKeys.clear());
  }

  #isTakingInput() {
    return this.isActive && this.isInputLive();
  }

  #handleKeyDown(e) {
    if (!this.isInputLive()) return;
    if (e.code === FREE_CAMERA_TOGGLE_KEY) {
      e.stopPropagation();
      if (!e.repeat) this.toggle();
      return;
    }
    if (!this.isActive || PASS_THROUGH_KEYS.has(e.code)) return;
    e.stopPropagation();
    e.preventDefault();
    this.heldKeys.add(e.code);
    if (!e.repeat) this.#handleCommandKey(e.code);
  }

  #handleKeyUp(e) {
    // Released even when input is not live, so a key let go over the pause
    // menu does not stay held when play resumes.
    this.heldKeys.delete(e.code);
    if (this.#isTakingInput() && !PASS_THROUGH_KEYS.has(e.code)) e.stopPropagation();
  }

  /** One-press keys. Movement and zoom are read from heldKeys each frame instead. */
  #handleCommandKey(code) {
    switch (code) {
      case 'KeyT': this.#cycleTimeScale(); break;
      case 'KeyP': this.#toggleWorldFrozen(); break;
      case 'KeyR': this.#resetFov(); break;
      case 'KeyB': this.#togglePlayerBody(); break;
      case 'KeyH': this.#toggleHud(); break;
      case 'KeyM': this.#markKeyframe(); break;
      case 'KeyJ': this.#toggleTake(); break;
      case 'Backspace': this.#clearMarks(); break;
    }
  }

  /**
   * Scaled down as the view zooms in, so a slow pan on a long lens is as easy
   * to hold steady as one at the normal field of view.
   */
  #handlePointerMove(e) {
    if (!this.#isTakingInput()) return;
    e.stopPropagation();
    const zoomScale = this.camera.fov / this.sourceCamera.fov;
    const radiansPerCount = LOOK_RADIANS_PER_COUNT * this.getSensitivityMultiplier() * zoomScale;
    this.targetYawInRadians -= (e.movementX || 0) * radiansPerCount;
    this.targetPitchInRadians = THREE.MathUtils.clamp(
      this.targetPitchInRadians - (e.movementY || 0) * radiansPerCount,
      -PITCH_LIMIT_RADIANS,
      PITCH_LIMIT_RADIANS
    );
  }

  #handleWheel(e) {
    if (!this.#isTakingInput()) return;
    e.stopPropagation();
    e.preventDefault();
    // Shift+wheel arrives as a sideways scroll on Windows -- see main.js's
    // own wheel handler for the same fix.
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (delta === 0) return;
    const factor = delta < 0 ? SPEED_STEP_FACTOR : 1 / SPEED_STEP_FACTOR;
    this.speedInMetresPerSecond = THREE.MathUtils.clamp(
      this.speedInMetresPerSecond * factor,
      SPEED_MIN_METRES_PER_SECOND,
      SPEED_MAX_METRES_PER_SECOND
    );
    this.#showStatus(this.#describeState());
  }

  #cycleTimeScale() {
    const index = TIME_SCALES.indexOf(this.timeScale);
    this.timeScale = TIME_SCALES[(index + 1) % TIME_SCALES.length];
    this.#showStatus(this.#describeState());
  }

  #toggleWorldFrozen() {
    this.isWorldFrozen = !this.isWorldFrozen;
    this.#showStatus(this.#describeState());
  }

  #resetFov() {
    this.targetFovInDegrees = this.sourceCamera.fov;
    this.#showStatus(this.#describeState());
  }

  #togglePlayerBody() {
    this.isPlayerBodyVisible = !this.isPlayerBodyVisible;
    this.#showStatus(this.isPlayerBodyVisible ? 'Player body shown' : 'Player body hidden');
    this.onChange();
  }

  #toggleHud() {
    this.isHudVisible = !this.isHudVisible;
    this.#applyHudVisibility();
  }

  /**
   * Hidden by a class on <body> rather than by touching #hud's display, which
   * the pause and resume handlers in main.js already own and would overwrite.
   */
  #applyHudVisibility() {
    document.body.classList.toggle('free-camera-clean', this.isActive && !this.isHudVisible);
  }

  /**
   * M. Writes down the framing as it is on screen -- the eased position, look
   * and zoom, not where the mouse and keys are still asking it to go -- then
   * copies every mark so far as shots.
   *
   * Times are on markClockSeconds -- real time, so the gaps between marks
   * are however long the camera was being flown between them, whatever the
   * world's clock was doing, but not time spent away from the game.
   */
  #markKeyframe() {
    if (this.marks.length === 0) this.firstMarkSeconds = this.markClockSeconds;
    const mark = this.#describeView(
      this.markClockSeconds - this.firstMarkSeconds,
      this.camera.position,
      this.yawInRadians,
      this.pitchInRadians,
      this.camera.fov
    );
    this.marks.push(mark);
    this.#exportJson(
      `Mark ${this.marks.length} · ${mark.t.toFixed(2)} s`,
      formatJsonRows(this.#marksAsShots())
    );
  }

  /** Backspace. Only the marks: a take is a whole flown move, too costly to lose to a stray key. */
  #clearMarks() {
    this.marks.length = 0;
    this.#showStatus('Marks cleared');
  }

  /**
   * The marks in the shape a cutscene scene file takes its shots in. Each
   * holds for the gap to the next mark; the last, having no next, holds for
   * LAST_SHOT_SECONDS.
   *
   * Every one is a cut. Without `cut`, the runner (core/Cutscene.js) eases a
   * shot in from wherever the last one ended and only arrives at its framing
   * on its final frame -- so the first shot would open on the player's eye,
   * no mark would ever be held, and each move would get the next gap's time.
   * A mark is a framing, so it cuts to it. Turning a pair of them into a
   * move is the scene's decision, made by dropping a `cut` by hand.
   *
   * lookAt rather than yaw and pitch, because that is what a scene file is
   * written in. The camera never rolls, so a position and a point to look at
   * give back exactly the framing that was marked.
   */
  #marksAsShots() {
    return this.marks.map((mark, index) => {
      const nextMark = this.marks[index + 1];
      LOOK.set(mark.pitch, mark.yaw, 0, 'YXZ');
      LOOK_AT.copy(VIEW_AXIS).applyEuler(LOOK).multiplyScalar(LOOK_AT_DISTANCE_METRES);
      LOOK_AT.x += mark.pos[0];
      LOOK_AT.y += mark.pos[1];
      LOOK_AT.z += mark.pos[2];
      return {
        cut: true,
        at: mark.pos,
        lookAt: roundVector(LOOK_AT, LOOK_AT_DECIMALS),
        fov: mark.fov,
        // Rounded again: two 2-dp times can still subtract to 1.0999999999999999.
        seconds: nextMark ? round(nextMark.t - mark.t, SECONDS_DECIMALS) : LAST_SHOT_SECONDS
      };
    });
  }

  /** J. Starts a take, or finishes the one that is running. */
  #toggleTake() {
    if (this.takeInProgress) {
      this.#finishTake();
      return;
    }
    this.takeInProgress = {
      samples: [this.#describeView(0, this.camera.position, this.yawInRadians, this.pitchInRadians, this.camera.fov)],
      lastFrame: {
        seconds: 0,
        position: this.camera.position.clone(),
        yaw: this.yawInRadians,
        pitch: this.pitchInRadians,
        fov: this.camera.fov
      }
    };
    // Empty, so the line reads just the flag -- see #showStatus.
    this.#showStatus('');
  }

  /**
   * Samples a running take on an exact grid of TAKE_SAMPLES_PER_SECOND.
   *
   * Frames do not land on that grid -- at 60 fps only every other one comes
   * near a sample time, at 144 fps none is exactly on one -- so each sample
   * is interpolated between the frame before its time and the frame after.
   * That keeps sample k at exactly k / 30 s whatever the frame rate is doing,
   * and an evenly spaced take can be played back as a path over its
   * `seconds` without being retimed.
   *
   * The clock is the dt the camera itself moves by -- main.js's real frame
   * time, capped at 0.05 s -- so a take times the move exactly as the camera
   * flew it, hitches included.
   */
  #updateTake(dtInSeconds) {
    const take = this.takeInProgress;
    if (!take) return;
    const { lastFrame } = take;
    const frameEndSeconds = lastFrame.seconds + dtInSeconds;
    let sampleIndex = take.samples.length;
    let sampleSeconds = sampleIndex / TAKE_SAMPLES_PER_SECOND;
    // Every sample time not yet taken lies after lastFrame.seconds, so alpha
    // is in (0, 1] and a frame with a dt of 0 never reaches the division.
    while (sampleIndex <= TAKE_MAX_SAMPLE_INDEX && sampleSeconds <= frameEndSeconds) {
      const alpha = (sampleSeconds - lastFrame.seconds) / dtInSeconds;
      TAKE_POSITION.lerpVectors(lastFrame.position, this.camera.position, alpha);
      take.samples.push(this.#describeView(
        sampleSeconds,
        TAKE_POSITION,
        THREE.MathUtils.lerp(lastFrame.yaw, this.yawInRadians, alpha),
        THREE.MathUtils.lerp(lastFrame.pitch, this.pitchInRadians, alpha),
        THREE.MathUtils.lerp(lastFrame.fov, this.camera.fov, alpha),
        TAKE_SECONDS_DECIMALS
      ));
      sampleIndex += 1;
      sampleSeconds = sampleIndex / TAKE_SAMPLES_PER_SECOND;
    }
    lastFrame.seconds = frameEndSeconds;
    lastFrame.position.copy(this.camera.position);
    lastFrame.yaw = this.yawInRadians;
    lastFrame.pitch = this.pitchInRadians;
    lastFrame.fov = this.camera.fov;
    if (sampleIndex > TAKE_MAX_SAMPLE_INDEX) this.#finishTake();
  }

  /**
   * Keeps the take and copies it. It ends on its last sample rather than at
   * the moment J was pressed, up to a thirtieth of a second earlier, so every
   * gap in it is the same and `seconds` is (samples - 1) / 30, to the
   * ten-thousandth of a second the sample times are kept to.
   */
  #finishTake() {
    const { samples } = this.takeInProgress;
    this.takeInProgress = null;
    const seconds = samples[samples.length - 1].t;
    this.takes.push({ seconds, samples });
    const sampleWord = samples.length === 1 ? 'sample' : 'samples';
    const capNote = samples.length > TAKE_MAX_SAMPLE_INDEX ? ` · stopped at the ${TAKE_MAX_SECONDS} s cap` : '';
    this.#exportJson(
      `Take ${this.takes.length} · ${seconds.toFixed(1)} s · ${samples.length} ${sampleWord}${capNote}`,
      `{"seconds":${seconds},"samples":${formatJsonRows(samples)}}`
    );
  }

  /**
   * One keyframe -- where the camera is, which way it looks and how wide --
   * in the shape both marks and take samples are kept in. Rounded here, once,
   * so what sits in marks and takes is exactly what was copied.
   *
   * Yaw is left unwrapped, as the mouse wound it, so a take that turns past
   * ±π carries straight on. Wrapped, it would jump a whole turn between two
   * samples, and anything interpolating between them would spin the camera
   * the long way round.
   */
  #describeView(seconds, position, yawInRadians, pitchInRadians, fovInDegrees, secondsDecimals = SECONDS_DECIMALS) {
    return {
      t: round(seconds, secondsDecimals),
      pos: roundVector(position, METRES_DECIMALS),
      yaw: round(yawInRadians, RADIANS_DECIMALS),
      pitch: round(pitchInRadians, RADIANS_DECIMALS),
      fov: round(fovInDegrees, DEGREES_DECIMALS)
    };
  }

  /**
   * Copies what was just recorded to the clipboard, ready to paste into
   * whatever is building the scene, and always logs it to the console as
   * well. The clipboard can refuse -- a page served over plain http from
   * another machine has no navigator.clipboard at all, and a take that hits
   * its cap finishes inside a frame rather than a key press, which some
   * browsers will not copy from -- and when it does, the status line says
   * so, so an old clipboard is never pasted by mistake.
   */
  #exportJson(statusText, json) {
    this.#showStatus(statusText);
    console.log(`[FreeCamera] ${statusText}\n${json}`);
    const reportNotCopied = () => this.#showStatus(`${statusText} · not copied, see console`);
    try {
      navigator.clipboard.writeText(json).catch(reportNotCopied);
    } catch {
      reportNotCopied();
    }
  }

  #describeState() {
    const timeLabel = this.isWorldFrozen ? 'frozen' : `${Math.round(this.timeScale * 100)}%`;
    return `FREE CAM · speed ${this.speedInMetresPerSecond.toFixed(2)} m/s`
      + ` · FOV ${Math.round(this.targetFovInDegrees)}° · time ${timeLabel}`;
  }

  #createStatusElement() {
    const element = document.createElement('div');
    element.id = 'free-camera-status';
    document.body.appendChild(element);
    return element;
  }

  /**
   * Shows a line of text that fades out by itself, so it is never left
   * sitting in the frame while recording.
   *
   * The one exception is a take. While J is recording, every line is shown
   * after TAKE_STATUS_FLAG and nothing fades: a take records the camera's
   * path for a cutscene to replay, not the picture, so the flag costs the
   * shot nothing, and a take left running unnoticed would be a minute of
   * nothing.
   */
  #showStatus(text, visibleMilliseconds = STATUS_VISIBLE_MILLISECONDS) {
    this.statusElement.classList.add('visible');
    clearTimeout(this.statusHideTimer);
    if (this.takeInProgress) {
      this.statusElement.textContent = text ? `${TAKE_STATUS_FLAG} · ${text}` : TAKE_STATUS_FLAG;
      return;
    }
    this.statusElement.textContent = text;
    this.statusHideTimer = setTimeout(() => this.#hideStatus(), visibleMilliseconds);
  }

  #hideStatus() {
    clearTimeout(this.statusHideTimer);
    this.statusElement.classList.remove('visible');
  }
}
