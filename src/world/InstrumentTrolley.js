import * as THREE from 'three';
import { resolveCircle } from '../core/collision.js';

/**
 * The basement's instrument trolley, on castors.
 *
 * Walk into it and it rolls away from you (core/collision.js lets the player
 * shove any collider with a `push` method). Let go and it rolls on a little
 * and stops. Shove it more than `fallRadius` from where it started and it
 * tips over the way it was going, and everything on it -- each `Loose_*` part
 * of instrument_trolley.glb, see blender/build_instrument_trolley.py -- is
 * thrown off across the floor.
 *
 * No physics engine: it is one cart, and a hand-written version is cheaper
 * and stays under the level's control. The trolley's floor box slides through
 * the same 2D colliders the player walks through; the fall is a rotation about
 * its bottom edge that speeds up like a falling body; and the instruments fly
 * under gravity, bounce, and settle flat.
 *
 * Coordinates: the trolley and everything thrown off it live in `parent`
 * space (the lab), which is a pure translation of world space. Colliders are
 * in WORLD space, `parentWorldZ` further along z than lab space.
 */

/** 1/s: how fast a trolley let go of rolls to a stop. About 15 cm of roll-on after a walking push. */
const ROLL_FRICTION = 5;
/** m/s under which a rolling trolley counts as stopped. */
const STOP_SPEED = 0.04;
/** Radians of turn per metre rolled: castors never run quite straight. */
const DRIFT_PER_METRE = 0.22;
/** The castor rattle is at full volume at this speed, m/s. */
const RATTLE_FULL_SPEED = 1.6;

/**
 * The fall. It starts already moving (it was shoved over), and speeds up as
 * it goes, as a body tipping about an edge does: angular acceleration grows
 * with the sine of how far it has leaned past upright.
 */
const TIP_START_SPIN = 1.4;       // rad/s
const TIP_GRAVITY = 13;           // rad/s^2 at the full lean
const TIP_LEAN = 0.35;            // rad: where its balance point already is when it goes
const TIP_BOUNCE = 0.18;          // share of its spin kept when it hits the floor
const TIP_SETTLE_SPIN = 0.6;      // rad/s under which it stops bouncing
/** How far over it is when the top tray's load slides off, and when the lower shelf's does. */
const RELEASE_TOP_TILT = 0.45;
const RELEASE_SHELF_TILT = 0.95;
/** How much of the trolley's swing a thing on it carries off with it. */
const RELEASE_SWING_SHARE = 0.55;

const GRAVITY = 9.81;
const ITEM_BOUNCE = 0.3;          // share of falling speed kept on a bounce
const ITEM_BOUNCE_MIN = 0.6;      // m/s: slower than this it lands and stays down
const ITEM_BOUNCE_GRIP = 0.55;    // share of sliding speed kept on a bounce
const ITEM_SLIDE_FRICTION = 7;    // 1/s once down
const BOTTLE_ROLL_FRICTION = 2.2; // bottles roll on further
const ITEM_SETTLE_RATE = 14;      // 1/s: how fast a landed item turns to lie flat
const ITEM_RADIUS = 0.05;         // m: how far an item keeps from walls and furniture
/** Only items this low are kept out of furniture: one sailing over the table is not in it. */
const ITEM_COLLIDE_BELOW = 0.5;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const ZERO_MOVE = Object.freeze({ x: 0, z: 0 });

/**
 * @param {object} options
 * @param {THREE.Object3D} options.parent - the room the trolley stands in.
 * @param {number} options.parentWorldZ - world z of the parent's origin.
 * @param {{x:number, z:number}} options.position - where it starts, in parent space.
 * @param {number} options.yaw - its starting turn.
 * @param {{length:number, depth:number, handleReach:number}} options.size
 * @param {number} options.fallRadius - how far it can be pushed from where it
 *   started before it goes over, in metres.
 * @param {Array} options.colliders - the level's live collider list. The
 *   trolley adds its own box to it and slides against all the others.
 * @param {(level:number) => void} [options.onRoll] - 0..1 every frame: how hard it is rolling.
 * @param {() => void} [options.onCrash] - once, the moment it hits the floor.
 */
export function createInstrumentTrolley({
  parent, parentWorldZ, position, yaw, size, fallRadius, colliders,
  onRoll = () => {}, onCrash = () => {}
}) {
  // group: where it stands and which way it faces. tip: the pivot it falls
  // about, moved to its bottom edge when it goes. body: the trolley itself,
  // moved back the other way so it does not jump when the pivot moves.
  const group = new THREE.Group();
  const tip = new THREE.Group();
  const body = new THREE.Group();
  group.add(tip);
  tip.add(body);
  parent.add(group);

  /** The model's own extents, without anything loose: what the fall pivots on. */
  const bounds = new THREE.Box3(
    new THREE.Vector3(-size.length / 2 - size.handleReach, 0, -size.depth / 2),
    new THREE.Vector3(size.length / 2, 1, size.depth / 2)
  );

  /** Everything that comes off it, with where it sits on the trolley so a restart can put it back. */
  const loose = [];
  /** Items in the air or settling, in parent space. */
  const thrown = [];

  let state = 'standing';                   // 'standing' | 'falling' | 'fallen'
  const velocity = new THREE.Vector2();     // m/s, parent space x/z
  const lastPush = new THREE.Vector2(1, 0); // which way it was last shoved, for a fall from a standstill
  let pushedX = 0;
  let pushedZ = 0;
  let driftSign = 0;
  let tilt = 0;
  let spin = 0;
  /** Which way it is going over: its local axis, and +1 or -1 along it. */
  let fallAxis = 'x';
  let fallSign = 1;
  let topReleased = false;
  let shelfReleased = false;
  let landed = false;

  const collider = {
    minX: 0, maxX: 0, minZ: 0, maxZ: 0,
    push: (dx, dz) => {
      if (state !== 'standing') return ZERO_MOVE;
      const moved = slide(dx, dz);
      pushedX += moved.x;
      pushedZ += moved.z;
      return moved;
    }
  };
  colliders.push(collider);

  /** Its floor box in world space, stood at (x, z) turned to `turn`. Counts the handle at both ends. */
  function footprint(x, z, turn) {
    const halfLength = size.length / 2 + size.handleReach;
    const halfDepth = size.depth / 2;
    const cos = Math.abs(Math.cos(turn));
    const sin = Math.abs(Math.sin(turn));
    const halfX = halfLength * cos + halfDepth * sin;
    const halfZ = halfLength * sin + halfDepth * cos;
    return {
      minX: x - halfX, maxX: x + halfX,
      minZ: parentWorldZ + z - halfZ, maxZ: parentWorldZ + z + halfZ
    };
  }

  function setBox(box) {
    collider.minX = box.minX;
    collider.maxX = box.maxX;
    collider.minZ = box.minZ;
    collider.maxZ = box.maxZ;
  }

  /** Would this box sit in anything else? A millimetre of slack, so touching is not overlapping. */
  function blocked(box) {
    const slack = 0.001;
    return colliders.some((c) => c !== collider
      && box.minX < c.maxX - slack && box.maxX > c.minX + slack
      && box.minZ < c.maxZ - slack && box.maxZ > c.minZ + slack);
  }

  /**
   * Moves the trolley by (dx, dz) as far as it will go: the whole way, or
   * failing that along just one axis, so it scrapes along a wall instead of
   * sticking to it. Returns how far it actually went.
   */
  function slide(dx, dz) {
    for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
      if (mx === 0 && mz === 0) continue;
      const x = group.position.x + mx;
      const z = group.position.z + mz;
      const box = footprint(x, z, group.rotation.y);
      if (blocked(box)) continue;
      group.position.x = x;
      group.position.z = z;
      setBox(box);
      drift(Math.hypot(mx, mz));
      return { x: mx, z: mz };
    }
    return ZERO_MOVE;
  }

  /** The castors pulling it a little off straight as it rolls, unless that would turn it into something. */
  function drift(distance) {
    if (driftSign === 0) driftSign = Math.random() < 0.5 ? -1 : 1;
    const turn = group.rotation.y + driftSign * DRIFT_PER_METRE * distance;
    const box = footprint(group.position.x, group.position.z, turn);
    if (blocked(box)) return;
    group.rotation.y = turn;
    setBox(box);
  }

  /**
   * Hands over the loaded model. The loose things are found by name and
   * remembered; the scalpel already on the floor is moved out into the room,
   * so it stays where it lies when the trolley rolls away from it.
   */
  function setModel(model) {
    body.add(model);
    // Ancestors too: the measuring and the re-parenting below both work from
    // world matrices, and the room may not have been drawn yet.
    body.updateWorldMatrix(true, true);
    const staticBounds = new THREE.Box3();
    let floorScalpel = null;
    for (const child of [...model.children]) {
      if (child.name.startsWith('Loose_')) {
        loose.push(describeLoose(child));
      } else if (child.name === 'Floor_Scalpel') {
        floorScalpel = child;
      } else {
        staticBounds.expandByObject(child);
      }
    }
    // Box3.expandByObject works in world space; the trolley is placed and
    // turned, so the extents are taken back into the trolley's own frame.
    if (!staticBounds.isEmpty()) {
      const toLocal = new THREE.Matrix4().copy(body.matrixWorld).invert();
      bounds.copy(staticBounds.applyMatrix4(toLocal));
    }
    if (floorScalpel) parent.attach(floorScalpel);
  }

  /** What has to be known about one loose thing to throw it and to put it back. */
  function describeLoose(object) {
    const isBottle = object.name.startsWith('Loose_Bottle');
    const isBowl = object.name.startsWith('Loose_Bowl');
    const isShelf = isBottle || isBowl;

    // Its extents in its own frame, children included, for how it lies.
    const extents = new THREE.Box3();
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.computeBoundingBox();
      const box = child.geometry.boundingBox.clone();
      if (child !== object) box.applyMatrix4(child.matrix);
      extents.union(box);
    });

    return {
      object,
      home: { parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone() },
      isShelf,
      isBottle,
      isBowl,
      extents
    };
  }

  /** Is it rolling at all? */
  function speed() {
    return velocity.length();
  }

  function update(dt) {
    if (state === 'standing') updateRolling(dt);
    else if (state === 'falling') updateFalling(dt);
    updateThrown(dt);
  }

  function updateRolling(dt) {
    if (pushedX !== 0 || pushedZ !== 0) {
      // Being shoved: it goes as fast as the player is shoving it, eased a
      // little so a jittery frame does not read as a jolt.
      const ease = 1 - Math.exp(-dt * 25);
      velocity.x += (pushedX / dt - velocity.x) * ease;
      velocity.y += (pushedZ / dt - velocity.y) * ease;
      lastPush.set(pushedX, pushedZ).normalize();
    } else if (speed() > STOP_SPEED) {
      // Let go of: it rolls on and slows, and stops dead if it runs into anything.
      velocity.multiplyScalar(Math.exp(-dt * ROLL_FRICTION));
      const wantX = velocity.x * dt;
      const wantZ = velocity.y * dt;
      const moved = slide(wantX, wantZ);
      if (moved.x === 0 && wantX !== 0) velocity.x = 0;
      if (moved.z === 0 && wantZ !== 0) velocity.y = 0;
    } else {
      velocity.set(0, 0);
    }
    pushedX = 0;
    pushedZ = 0;
    onRoll(Math.min(1, speed() / RATTLE_FULL_SPEED));

    const fromHome = Math.hypot(group.position.x - home.x, group.position.z - home.z);
    if (fromHome > fallRadius) startFall();
  }

  /** Over it goes, the way it was moving, about whichever of its bottom edges faces most that way. */
  function startFall() {
    state = 'falling';
    onRoll(0);
    const way = speed() > 0.01 ? velocity.clone().normalize() : lastPush.clone();
    // That direction in the trolley's own frame (three.js turns +x toward -z).
    const turn = group.rotation.y;
    const localX = way.x * Math.cos(turn) - way.y * Math.sin(turn);
    const localZ = way.x * Math.sin(turn) + way.y * Math.cos(turn);
    if (Math.abs(localX) >= Math.abs(localZ)) {
      fallAxis = 'x';
      fallSign = Math.sign(localX) || 1;
      tip.position.set(fallSign > 0 ? bounds.max.x : bounds.min.x, 0, 0);
    } else {
      fallAxis = 'z';
      fallSign = Math.sign(localZ) || 1;
      tip.position.set(0, 0, fallSign > 0 ? bounds.max.z : bounds.min.z);
    }
    body.position.copy(tip.position).negate();
    tilt = 0;
    spin = TIP_START_SPIN;
    velocity.set(0, 0);
  }

  /**
   * Turns the pivot to the current tilt. Leaning toward +x is a negative turn
   * about z; toward +z, a positive turn about x.
   */
  function applyTilt() {
    if (fallAxis === 'x') tip.rotation.set(0, 0, -fallSign * tilt);
    else tip.rotation.set(fallSign * tilt, 0, 0);
  }

  function updateFalling(dt) {
    spin += TIP_GRAVITY * Math.sin(tilt + TIP_LEAN) * dt;
    tilt += spin * dt;
    if (tilt >= Math.PI / 2) {
      tilt = Math.PI / 2;
      if (!landed) {
        landed = true;
        release(true);
        release(false);
        onCrash();
      }
      if (spin > TIP_SETTLE_SPIN) {
        spin = -spin * TIP_BOUNCE;
      } else {
        applyTilt();
        settle();
        return;
      }
    }
    applyTilt();
    if (!topReleased && tilt > RELEASE_TOP_TILT) release(true);
    if (!shelfReleased && tilt > RELEASE_SHELF_TILT) release(false);
  }

  /** Down for good: it becomes an obstacle the shape of a trolley lying on its side. */
  function settle() {
    state = 'fallen';
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(body);
    const inset = 0.02;
    setBox({ minX: box.min.x + inset, maxX: box.max.x - inset, minZ: box.min.z + inset, maxZ: box.max.z - inset });
  }

  const tmpWorld = new THREE.Vector3();
  const tmpPivot = new THREE.Vector3();

  /**
   * Throws one tray's load off the trolley: each thing leaves at the speed its
   * spot on the trolley is swinging at, plus a shove the way it is falling, a
   * little sideways scatter, a pop upward and a tumble.
   */
  function release(top) {
    if (top ? topReleased : shelfReleased) return;
    if (top) topReleased = true; else shelfReleased = true;

    group.updateWorldMatrix(true, true);
    tip.getWorldPosition(tmpPivot);
    // The spin as a vector in parent space: about the trolley's own z (or x),
    // turned with it.
    const spinAxis = fallAxis === 'x'
      ? new THREE.Vector3(0, 0, -fallSign * spin)
      : new THREE.Vector3(fallSign * spin, 0, 0);
    spinAxis.applyQuaternion(group.quaternion);
    const fallWay = (fallAxis === 'x' ? new THREE.Vector3(fallSign, 0, 0) : new THREE.Vector3(0, 0, fallSign))
      .applyQuaternion(group.quaternion);
    const across = new THREE.Vector3().crossVectors(Y_AXIS, fallWay);

    for (const item of loose) {
      if (item.isShelf === top) continue;
      item.object.getWorldPosition(tmpWorld);
      // Only part of the trolley's swing: things on a tray slide as it tips,
      // they are not bolted to it. At the full swing the top tray's load
      // sailed a metre and more past the fallen trolley in a tight clump.
      const swing = new THREE.Vector3().crossVectors(spinAxis, tmpWorld.clone().sub(tmpPivot))
        .multiplyScalar(RELEASE_SWING_SHARE);
      const shove = top ? 0.15 + Math.random() * 0.5 : 0.1 + Math.random() * 0.3;
      const vel = swing
        .addScaledVector(fallWay, shove)
        .addScaledVector(across, (Math.random() - 0.5) * 1.3);
      vel.y += 0.2 + Math.random() * (top ? 0.7 : 0.3);

      parent.attach(item.object);

      // How it will end up lying: a bottle on its side, the bowl either way
      // up, anything else flat, each at a random turn.
      const base = new THREE.Quaternion();
      if (item.isBottle) base.setFromAxisAngle(X_AXIS, Math.PI / 2);
      else if (item.isBowl && Math.random() < 0.5) base.setFromAxisAngle(X_AXIS, Math.PI);
      const rest = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.random() * Math.PI * 2).multiply(base);
      const lying = item.extents.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(base));

      thrown.push({
        item,
        velocity: vel,
        tumble: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .normalize().multiplyScalar(6 + Math.random() * 8),
        restQuaternion: rest,
        restHeight: -lying.min.y,
        friction: item.isBottle ? BOTTLE_ROLL_FRICTION : ITEM_SLIDE_FRICTION,
        touched: false,
        down: false,
        still: false
      });
    }
  }

  const tmpTurn = new THREE.Quaternion();
  const tmpCircle = { x: 0, z: 0 };

  function updateThrown(dt) {
    if (thrown.length === 0) return;
    const others = colliders.filter((c) => c !== collider);
    for (const t of thrown) {
      if (t.still) continue;
      const object = t.item.object;
      const pos = object.position;

      if (!t.down) {
        t.velocity.y -= GRAVITY * dt;
        pos.addScaledVector(t.velocity, dt);
        const angle = t.tumble.length() * dt;
        if (angle > 0) {
          tmpTurn.setFromAxisAngle(t.tumble.clone().normalize(), angle);
          object.quaternion.premultiply(tmpTurn);
        }
        if (pos.y <= t.restHeight) {
          pos.y = t.restHeight;
          t.touched = true;
          if (-t.velocity.y > ITEM_BOUNCE_MIN) {
            t.velocity.y = -t.velocity.y * ITEM_BOUNCE;
            t.velocity.x *= ITEM_BOUNCE_GRIP;
            t.velocity.z *= ITEM_BOUNCE_GRIP;
            t.tumble.multiplyScalar(0.4);
          } else {
            t.velocity.y = 0;
            t.down = true;
          }
        }
      } else {
        // Sliding -- or, for a bottle, rolling -- to a stop.
        const keep = Math.exp(-dt * t.friction);
        t.velocity.x *= keep;
        t.velocity.z *= keep;
        pos.x += t.velocity.x * dt;
        pos.z += t.velocity.z * dt;
        pos.y = t.restHeight;
      }

      // Once it has hit the floor, it turns to lie the way it will end up.
      if (t.touched) {
        object.quaternion.slerp(t.restQuaternion, 1 - Math.exp(-dt * ITEM_SETTLE_RATE));
      }

      // Kept out of walls and furniture once it is low enough to be in them.
      if (pos.y < ITEM_COLLIDE_BELOW) {
        tmpCircle.x = pos.x;
        tmpCircle.z = pos.z + parentWorldZ;
        if (resolveCircle(tmpCircle, ITEM_RADIUS, others)) {
          pos.x = tmpCircle.x;
          pos.z = tmpCircle.z - parentWorldZ;
          t.velocity.x *= 0.3;
          t.velocity.z *= 0.3;
        }
      }

      if (t.down && Math.hypot(t.velocity.x, t.velocity.z) < 0.01
          && object.quaternion.angleTo(t.restQuaternion) < 0.01) {
        object.quaternion.copy(t.restQuaternion);
        t.still = true;
      }
    }
  }

  /** Puts it back where it started, standing, with everything back on it. */
  function reset() {
    state = 'standing';
    group.position.set(home.x, 0, home.z);
    group.rotation.set(0, home.yaw, 0);
    tip.position.set(0, 0, 0);
    tip.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    velocity.set(0, 0);
    lastPush.set(1, 0);
    pushedX = 0;
    pushedZ = 0;
    driftSign = 0;
    tilt = 0;
    spin = 0;
    topReleased = false;
    shelfReleased = false;
    landed = false;
    thrown.length = 0;
    for (const item of loose) {
      item.home.parent.add(item.object);
      item.object.position.copy(item.home.position);
      item.object.quaternion.copy(item.home.quaternion);
    }
    setBox(footprint(home.x, home.z, home.yaw));
    onRoll(0);
  }

  const home = { x: position.x, z: position.z, yaw };
  group.position.set(home.x, 0, home.z);
  group.rotation.y = home.yaw;
  setBox(footprint(home.x, home.z, home.yaw));

  return {
    /** Where it stands; add nothing to this that should stay upright when it falls. */
    group,
    /** The trolley itself: anything added here goes over with it -- its click target, say. */
    body,
    setModel,
    update,
    reset,
    get fallen() { return state !== 'standing'; }
  };
}
