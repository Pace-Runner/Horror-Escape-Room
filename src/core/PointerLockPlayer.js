import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const MOVE = new THREE.Vector3();

// A thin wrapper around PointerLockControls that adds WASD movement with
// simple axis-aligned box collision, so the player can walk through each
// room without clipping through the walls and furniture that define it.
export class PointerLockPlayer {
  constructor(camera, domElement, eyeHeight = 1.7) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.controls.pointerSpeed = 1.8; // default (1.0) reads as sluggish for this game's pace
    this.eyeHeight = eyeHeight;
    this.speed = 3.1;
    this.keys = { forward: false, back: false, left: false, right: false };
    this.colliders = [];
    this.bodyRadius = 0.35;
    // Gate for scripted beats (e.g. still chained to the bed at the start
    // of Level 1) where looking around should work but walking shouldn't.
    this.movementEnabled = true;

    window.addEventListener('keydown', (e) => this.#onKey(e, true));
    window.addEventListener('keyup', (e) => this.#onKey(e, false));
  }

  #onKey(e, isDown) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = isDown; break;
      case 'KeyS': case 'ArrowDown': this.keys.back = isDown; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = isDown; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = isDown; break;
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
    if (!this.isLocked || !this.movementEnabled) return;

    this.camera.getWorldDirection(FORWARD);
    FORWARD.y = 0;
    FORWARD.normalize();
    RIGHT.crossVectors(FORWARD, this.camera.up).normalize();

    MOVE.set(0, 0, 0);
    if (this.keys.forward) MOVE.add(FORWARD);
    if (this.keys.back) MOVE.sub(FORWARD);
    if (this.keys.right) MOVE.add(RIGHT);
    if (this.keys.left) MOVE.sub(RIGHT);

    if (MOVE.lengthSq() > 0) {
      MOVE.normalize().multiplyScalar(this.speed * dt);
      const next = this.object.position.clone().add(MOVE);
      this.#resolveCollision(next);
      this.object.position.x = next.x;
      this.object.position.z = next.z;
    }
    this.object.position.y = this.eyeHeight;
  }
}
