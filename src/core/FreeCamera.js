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
  + 'Z/X zoom · R reset zoom · T slow-mo · P freeze · B show body · H show HUD · N exit';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const WISH_DIRECTION = new THREE.Vector3();
const LOOK = new THREE.Euler(0, 0, 0, 'YXZ');

export class FreeCamera {
  /**
   * @param {object} options
   * @param {THREE.PerspectiveCamera} options.sourceCamera The player's camera.
   *   Each time the free camera is switched on it starts from this camera's
   *   position, orientation and FOV, so the first frame is not a cut.
   * @param {() => boolean} options.isInputLive Whether the game currently has
   *   the pointer. Input is only taken while this is true, so the pause menu,
   *   the settings screen and the diegetic close-ups all keep their keys.
   * @param {() => number} [options.getSensitivityMultiplier] The settings
   *   menu's mouse sensitivity, so the free camera turns at the rate the
   *   player is used to.
   * @param {() => void} [options.onChange] Called whenever something main.js
   *   has to react to changes: switching on or off, or showing the body.
   */
  constructor({ sourceCamera, isInputLive, getSensitivityMultiplier = () => 1, onChange = () => {} }) {
    this.sourceCamera = sourceCamera;
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
   */
  disable() {
    if (!this.isActive) return;
    this.isActive = false;
    this.timeScale = 1;
    this.isWorldFrozen = false;
    this.heldKeys.clear();
    this.#applyHudVisibility();
    this.#hideStatus();
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
    if (!this.isActive) return;
    this.#updateLook(realDtInSeconds);
    this.#updateMove(realDtInSeconds);
    this.#updateFov(realDtInSeconds);
  }

  #copySourceCamera() {
    this.sourceCamera.updateMatrixWorld();
    this.sourceCamera.getWorldPosition(this.camera.position);
    LOOK.setFromQuaternion(this.sourceCamera.getWorldQuaternion(this.camera.quaternion), 'YXZ');
    this.yawInRadians = this.targetYawInRadians = LOOK.y;
    this.pitchInRadians = this.targetPitchInRadians = LOOK.x;
    this.camera.fov = this.targetFovInDegrees = this.sourceCamera.fov;
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
   */
  #showStatus(text, visibleMilliseconds = STATUS_VISIBLE_MILLISECONDS) {
    this.statusElement.textContent = text;
    this.statusElement.classList.add('visible');
    clearTimeout(this.statusHideTimer);
    this.statusHideTimer = setTimeout(() => this.#hideStatus(), visibleMilliseconds);
  }

  #hideStatus() {
    clearTimeout(this.statusHideTimer);
    this.statusElement.classList.remove('visible');
  }
}
