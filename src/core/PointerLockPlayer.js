import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const MOVE = new THREE.Vector3();
const LOOK = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Head bob and look tracking.
 *
 * STRIDE is metres per full stride (two steps), so bobPhase advances 2*pi over
 * that distance. Driven by distance walked rather than by time, because a
 * time-based phase keeps ticking when the player stops, turns on the spot or
 * walks into a wall, and then the bob is out of step with the footsteps -
 * systems/hands/layers/walkbob.js explains why that is worse than no bob.
 */
const STRIDE = 1.55;
/** Vertical travel of the head per step, metres. Twice this is peak to trough. */
const BOB_AMPLITUDE = 0.0100;
/** Idle breathing rise, metres, at roughly 15 breaths a minute. */
const IDLE_AMPLITUDE = 0.0045;
const IDLE_RATE = 1.55;
/** Seconds for the bob to fade in when walking starts, and out when it stops. */
const BOB_BLEND = 0.16;

/**
 * MOUSE LOOK.
 *
 * This class owns looking outright; PointerLockControls is kept only to manage
 * the pointer lock itself and to fire the lock/unlock events the pause menu
 * listens for. Its own handler is neutralised (pointerSpeed 0) because it
 * rewrites the camera quaternion IMMEDIATELY on every pointermove event, outside
 * the render loop, with no smoothing and no time basis at all. Rotation then
 * arrived in event-sized chunks while translation was dt-smoothed, and the two
 * visibly disagreed whenever frame time jittered - which is what read as the
 * camera "snapping".
 *
 * LOOK_SENSITIVITY is radians of look per raw mouse count. This project used to
 * run PointerLockControls at pointerSpeed 1.8 against its own 0.002 factor, i.e.
 * 0.0036 rad/count - a 180 degree turn in about a centimetre of mouse travel.
 * This is the one number to tune for feel.
 *
 * LOOK_SMOOTH_TIME is the smoothing time constant in seconds. It exists to
 * absorb uneven mouse-event delivery between frames, so it only needs to be on
 * the order of a frame: at 0.022 a flick is 90% applied in about 50ms (~3 frames
 * at 60Hz), which reads as smooth without feeling like the view is lagging the
 * hand. Raising it smooths more and adds aim latency; 0.05 is about where that
 * latency starts to be felt.
 */
const LOOK_SENSITIVITY = 0.0023;
const LOOK_SMOOTH_TIME = 0.022;
/** Just shy of straight up/down, so the view can never flip through the pole. */
const PITCH_LIMIT = Math.PI / 2 - 0.001;

/**
 * Crouching. CROUCH_DROP takes the 1.6 m eye height down to 1.05 m, which is a
 * low crouch rather than a duck - enough that the change in sightline is obvious
 * in a corridor.
 *
 * Held, not toggled: this is a horror game and holding a key is a small ongoing
 * cost that suits hiding. A toggle is kinder on the hand but makes it easy to
 * forget you are crouched and wonder why you are so slow.
 *
 * Crouched movement is deliberately much slower than the 0.65 the standing speed
 * was already scaled by - crouch-walking that is nearly as fast as walking gives
 * the player no reason to ever stand up.
 */
const CROUCH_DROP = 0.55;
const CROUCH_SPEED_SCALE = 0.45;
const CROUCH_BLEND = 0.12;

// A thin wrapper around PointerLockControls that adds WASD movement with
// simple axis-aligned box collision, so the player can walk through each
// room without clipping through the walls and furniture that define it.
export class PointerLockPlayer {
  constructor(camera, domElement, eyeHeight = 1.6) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    // Neutralised, not tuned: this class applies the look itself in update(),
    // smoothed and on the frame clock. Leaving the library's handler live at any
    // non-zero speed would fight it. Its euler round-trip at 0 is the identity
    // for a camera with no roll, so it costs nothing to leave connected -- and
    // leaving it connected is what keeps its lock/unlock events working.
    this.controls.pointerSpeed = 0;
    this.eyeHeight = eyeHeight;
    // 3.1 originally. 0.65 of that: the rooms are small and the original pace
    // crossed them fast enough to undercut the tension.
    this.speed = 2.015;
    this.keys = { forward: false, back: false, left: false, right: false, crouch: false };
    this.colliders = [];
    this.bodyRadius = 0.35;
    // Gate for scripted beats (e.g. still chained to the bed at the start
    // of Level 1) where looking around should work but walking shouldn't.
    this.movementEnabled = true;

    /**
     * MOTION STATE, read once a frame by whatever wants to move with the player
     * - the head bob below, and the hands' procedural layers via main.js.
     *
     * `bobPhase` is one stride per 2*pi and advances with distance walked.
     * `moving` is a smoothed 0..1 rather than a boolean so the bob can fade in
     * and out instead of snapping on the first frame a key is held.
     * `lookDeltaX/Y` are this frame's yaw and pitch change in radians.
     */
    this.bobPhase = 0;
    this.moving = 0;
    /** Smoothed 0..1 crouch, so the drop eases rather than snapping. */
    this.crouch = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this._t = 0;

    /**
     * The camera's orientation, owned here as yaw/pitch rather than read back
     * out of the quaternion.
     *
     * The old code recovered lookDeltaX/Y by differencing the quaternion against
     * a cached yaw/pitch that nothing reset when the camera was teleported, so
     * the first frame in a new level reported a bogus delta of up to pi radians.
     * That fed the hands' sway spring as an impulse and whipped the on-screen
     * torch. Holding the angles as the source of truth and DERIVING the
     * quaternion from them makes that class of disagreement impossible.
     */
    this._yaw = 0;
    this._pitch = 0;
    /** Raw mouse counts received but not yet applied. Drained in update(). */
    this._pendingYaw = 0;
    this._pendingPitch = 0;
    /** Cleared during transitions, so looking freezes without dropping the lock. */
    this.lookEnabled = true;

    window.addEventListener('keydown', (e) => this.#onKey(e, true));
    window.addEventListener('keyup', (e) => this.#onKey(e, false));
    // Accumulate only; the camera is written once a frame in update().
    domElement.ownerDocument.addEventListener('pointermove', (e) => {
      if (!this.isLocked || !this.lookEnabled) return;
      this._pendingYaw += e.movementX || 0;
      this._pendingPitch += e.movementY || 0;
    });
  }

  #onKey(e, isDown) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = isDown; break;
      case 'KeyS': case 'ArrowDown': this.keys.back = isDown; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = isDown; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = isDown; break;
      // Ctrl rather than the more usual C, which this game already spends on
      // the credits screen (see index.html).
      case 'ControlLeft': case 'ControlRight': this.keys.crouch = isDown; break;
    }
  }

  get object() {
    return this.controls.object;
  }

  /**
   * Takes the pointer lock, asking for RAW mouse deltas.
   *
   * Deliberately not controls.lock(), which calls requestPointerLock() with no
   * options at all. Without `unadjustedMovement` the browser hands over deltas
   * that have already been through the OS pointer-acceleration curve, and
   * "Enhance pointer precision" is on by default on Windows - so fast flicks
   * come through disproportionately large and slow moves disproportionately
   * small. That inconsistency is the biggest single cause of the look feeling
   * snappy, and it is not correctable by any sensitivity value.
   *
   * Safe to bypass the library here: its pointerlockchange handler only checks
   * WHICH element holds the lock, so isLocked and the lock/unlock events that
   * drive the pause menu still behave exactly as before.
   */
  lock() {
    const el = this.controls.domElement;
    let req;
    try {
      req = el.requestPointerLock({ unadjustedMovement: true });
    } catch {
      // Older signature: throws rather than returning a rejected promise.
      el.requestPointerLock();
      return;
    }
    // Chromium returns a promise and rejects with NotSupportedError where raw
    // input is unavailable (some Linux/X11 setups); Firefox/Safari return
    // undefined and ignore the option. Fall back to a plain lock either way.
    if (req && typeof req.catch === 'function') {
      req.catch(() => el.requestPointerLock());
    }
  }

  unlock() {
    this.controls.unlock();
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  /**
   * Put the player somewhere, facing somewhere. The ONE way the camera is moved.
   *
   * SceneManager used to teleport and then reach in and write
   * `player.controls.object.rotation` itself, which both bypassed the look state
   * this class owns and silently zeroed pitch. Funnelling it through here keeps
   * the angles and the quaternion in agreement, and clearing the accumulator
   * means no half-applied mouse movement survives the jump.
   */
  spawn(x, z, yaw = 0, pitch = 0) {
    this.object.position.set(x, this.eyeHeight, z);
    this._yaw = yaw;
    this._pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    this._pendingYaw = 0;
    this._pendingPitch = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.#applyLook();
  }

  /** Kept for callers that only want to move without re-aiming. */
  teleport(x, z) {
    this.object.position.set(x, this.eyeHeight, z);
  }

  #applyLook() {
    LOOK.set(this._pitch, this._yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(LOOK);
  }

  // Colliders are simple { minX, maxX, minZ, maxZ } boxes in world space
  // (room walls, furniture footprints). Kept 2D since the player never
  // needs to duck or jump in this world.
  setColliders(boxes) {
    this.colliders = boxes;
  }

  #resolveCollision(nextPos) {
    const r = this.bodyRadius;
    for (const box of this.colliders) {
      const closestX = Math.max(box.minX, Math.min(nextPos.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(nextPos.z, box.maxZ));
      const dx = nextPos.x - closestX;
      const dz = nextPos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < r * r) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = r - dist;
        nextPos.x += (dx / dist) * push;
        nextPos.z += (dz / dist) * push;
      }
    }
    return nextPos;
  }

  update(dt) {
    this._t += dt;

    /**
     * Apply the mouse movement banked since the last frame.
     *
     * An exponential DRAIN, not an averaging lowpass: every count that came in
     * is eventually applied in full, so aim stays exactly 1:1 with the mouse and
     * a sweep out and back returns you to the same heading. A filter that
     * averaged would quietly eat input and make the view feel like it was
     * fighting you. 1 - exp(-dt/tau) makes the rate frame-rate independent, so
     * 144Hz and 60Hz feel identical rather than the faster one feeling snappier.
     *
     * lookDeltaX/Y are now exactly what was applied here, so the hands' sway
     * layer can never be handed a spike from something else moving the camera.
     */
    const drain = 1 - Math.exp(-dt / LOOK_SMOOTH_TIME);
    const dYaw = this._pendingYaw * drain;
    const dPitch = this._pendingPitch * drain;
    this._pendingYaw -= dYaw;
    this._pendingPitch -= dPitch;

    this.lookDeltaX = -dYaw * LOOK_SENSITIVITY;
    this.lookDeltaY = -dPitch * LOOK_SENSITIVITY;
    if (dYaw !== 0 || dPitch !== 0) {
      this._yaw += this.lookDeltaX;
      this._pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._pitch + this.lookDeltaY));
      this.#applyLook();
    }

    if (!this.isLocked || !this.movementEnabled) {
      // Still settle the bob out and keep breathing, so pausing does not leave
      // the view frozen mid-step.
      this.moving += (0 - this.moving) * Math.min(1, dt / BOB_BLEND);
      // The crouch is HELD here, not decayed. It used to ease back to standing,
      // which meant a transition -- which clears movementEnabled 700ms before
      // the screen is actually black -- stood the camera up 0.55m in plain
      // sight, and dropped it again after the fade-in if Ctrl was still held.
      // Two 55cm camera moves per doorway. The scripted beat that clears
      // movementEnabled (chained to the bed) starts standing anyway, so there is
      // nothing here to get stuck in.
      this.#applyEyeHeight();
      return;
    }

    this.crouch += ((this.keys.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt / CROUCH_BLEND);

    this.camera.getWorldDirection(FORWARD);
    FORWARD.y = 0;
    FORWARD.normalize();
    RIGHT.crossVectors(FORWARD, this.camera.up).normalize();

    MOVE.set(0, 0, 0);
    if (this.keys.forward) MOVE.add(FORWARD);
    if (this.keys.back) MOVE.sub(FORWARD);
    if (this.keys.right) MOVE.add(RIGHT);
    if (this.keys.left) MOVE.sub(RIGHT);

    let walked = 0;
    if (MOVE.lengthSq() > 0) {
      // Interpolated on the smoothed crouch, so speed eases with the drop
      // instead of stepping the instant the key goes down.
      const speed = this.speed * (1 - this.crouch * (1 - CROUCH_SPEED_SCALE));
      MOVE.normalize().multiplyScalar(speed * dt);
      const next = this.object.position.clone().add(MOVE);
      this.#resolveCollision(next);
      // Distance ACTUALLY travelled, after collision, so walking into a wall
      // stops the bob instead of bobbing on the spot.
      walked = Math.hypot(next.x - this.object.position.x, next.z - this.object.position.z);
      this.object.position.x = next.x;
      this.object.position.z = next.z;
    }

    this.bobPhase = (this.bobPhase + (walked / STRIDE) * Math.PI * 2) % (Math.PI * 2);
    const want = walked > 1e-6 ? 1 : 0;
    this.moving += (want - this.moving) * Math.min(1, dt / BOB_BLEND);

    this.#applyEyeHeight();
  }

  /**
   * Eye height plus head bob and idle breathing.
   *
   * Only the Y axis moves. Lateral bob would have to go through x/z, which are
   * the collision-resolved walk position, so it would feed back into the next
   * frame's collision test; and a camera ROLL would be wiped the moment
   * PointerLockControls next rewrote the quaternion on a mouse move, which shows
   * up as a flicker. The sideways half of the motion lives on the hands instead
   * (systems/hands/layers/walkbob.js), which is also where it reads better: the
   * view staying level while what you are holding swings is what sells weight.
   */
  #applyEyeHeight() {
    const bob = this.moving * BOB_AMPLITUDE * Math.sin(this.bobPhase * 2);
    const idle = IDLE_AMPLITUDE * Math.sin(this._t * IDLE_RATE);
    this.object.position.y = this.eyeHeight - this.crouch * CROUCH_DROP + bob + idle;
  }
}
