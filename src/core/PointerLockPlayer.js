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
 * Crouching. CROUCH_DROP takes the default 1.7 m eye height down to 1.15 m,
 * which is a low crouch rather than a duck - enough that the change in sightline
 * is obvious in a corridor.
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
  constructor(camera, domElement, eyeHeight = 1.7) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.controls.pointerSpeed = 1.8; // default (1.0) reads as sluggish for this game's pace
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
    this._lookYaw = 0;
    this._lookPitch = 0;
    this._t = 0;

    window.addEventListener('keydown', (e) => this.#onKey(e, true));
    window.addEventListener('keyup', (e) => this.#onKey(e, false));
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

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  // Eye height is fixed by the controller (no crouch/jump in this world),
  // so spawn points only ever need an X/Z position.
  teleport(x, z) {
    this.object.position.set(x, this.eyeHeight, z);
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
     * Look delta, derived from the camera's own orientation rather than from
     * mouse events. PointerLockControls does not expose its deltas, and reading
     * the result means anything else that turns the view is picked up too. YXZ
     * order so yaw and pitch come out separated.
     */
    LOOK.setFromQuaternion(this.camera.quaternion);
    let dYaw = LOOK.y - this._lookYaw;
    // Shortest way round, so crossing the +/-pi seam does not register as a
    // full-circle whip and fling the hands.
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.lookDeltaX = dYaw;
    this.lookDeltaY = LOOK.x - this._lookPitch;
    this._lookYaw = LOOK.y;
    this._lookPitch = LOOK.x;

    if (!this.isLocked || !this.movementEnabled) {
      // Still settle the bob out and keep breathing, so pausing does not leave
      // the view frozen mid-step. The crouch stands back up for the same reason:
      // the scripted beats that clear movementEnabled (chained to the bed) have
      // no business leaving the player stuck in a crouch they cannot exit.
      this.moving += (0 - this.moving) * Math.min(1, dt / BOB_BLEND);
      this.crouch += (0 - this.crouch) * Math.min(1, dt / CROUCH_BLEND);
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
