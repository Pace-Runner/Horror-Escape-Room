import * as THREE from 'three';
import { waitForAllLoads } from './LoadTracker.js';

/** A stable room handle: constructing it downloads nothing. Existing consumers
 * retain the same group, refs and collider array when its factory runs later.
 */
export function createDeferredLevel(factory, onCreated = () => {}) {
  let instance = null;
  let preparation = null;
  const empty = [];
  // Async model callbacks keep mutating the factory's own arrays after creation.
  const forwardArray = (read) => new Proxy([], {
    get(_target, key) {
      const array = read() ?? empty;
      const value = Reflect.get(array, key, array);
      return typeof value === 'function' ? value.bind(array) : value;
    },
    set(_target, key, value) { return Reflect.set(read() ?? empty, key, value); }
  });
  const handle = {
    group: new THREE.Group(),
    refs: { candleAnchors: forwardArray(() => instance?.refs?.candleAnchors) },
    colliders: forwardArray(() => instance?.colliders),
    get isPrepared() { return instance !== null; },
    initialize() {
      if (instance) return;
      instance = factory();
      handle.group.add(instance.group);
      const descriptors = Object.getOwnPropertyDescriptors(instance.refs ?? {});
      if (descriptors.candleAnchors) {
        delete descriptors.candleAnchors;
      }
      Object.defineProperties(handle.refs, descriptors);
      onCreated(handle);
    },
    prepare() {
      if (!preparation) preparation = Promise.resolve().then(() => {
        handle.initialize();
        return waitForAllLoads({ timeoutMilliseconds: Infinity });
      });
      return preparation;
    },
    reset() { instance?.reset?.(); },
    update(...args) { instance?.update?.(...args); }
  };
  return new Proxy(handle, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'then') return undefined;
      handle.initialize();
      const value = instance[key];
      return typeof value === 'function' ? value.bind(instance) : value;
    }
  });
}

// Holds every level as a sibling THREE.Group under one root, and switches
// which one is visible/active/collidable. Deferred room factories are prepared
// by loading orchestration before production activation.
export class SceneManager {
  constructor(root) {
    this.root = root;
    this.levels = new Map();
    this.activeKey = null;
  }

  register(key, level) {
    this.levels.set(key, level);
    level.group.visible = false;
    this.root.add(level.group);
  }

  get active() {
    return this.levels.get(this.activeKey) ?? null;
  }

  get(key) {
    return this.levels.get(key) ?? null;
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.seamless] - walked into, not loaded: the room being
   *   left stays drawn and the player stays exactly where they are (the
   *   bedroom and the upstairs hallway are one space -- see main.js).
   */
  activate(key, player, { seamless = false } = {}) {
    const level = this.levels.get(key);
    // Returns null rather than a bare `return` on a bad key: the caller reads
    // level.interactables straight away, so silently returning undefined was a
    // TypeError. Null also lets the transition layer log and recover visibly,
    // instead of fading back in on the wrong room with no signal.
    if (!level) {
      console.warn(`SceneManager.activate: no level registered under "${key}"`);
      return null;
    }
    level.initialize?.();
    if (this.activeKey && !seamless) {
      this.levels.get(this.activeKey).group.visible = false;
    }
    this.activeKey = key;
    level.group.visible = true;
    player.setColliders(level.colliders);
    // Only the upstairs hallway has a floor that is not flat (its stairs).
    player.setGround?.(level.groundAt ?? null);
    // One call, rather than teleporting and then reaching in to write
    // player.controls.object.rotation from out here. That bypassed the look
    // state the player owns and silently zeroed pitch, so a level jump both
    // snapped the view level and handed the hands a bogus one-frame look delta.
    if (!seamless) player.spawn(level.spawn[0], level.spawn[1], level.spawnYaw ?? 0, level.spawnPitch ?? 0);
    return level;
  }

  /**
   * Ticks whichever level is active.
   *
   * @param {number} dt - frame time in seconds.
   * @param {THREE.Vector3} [playerPosition] - the player's world position,
   *   forwarded so a level can run proximity triggers of its own. Levels that
   *   do not take a second parameter are unaffected.
   */
  update(dt, playerPosition) {
    this.active?.update?.(dt, playerPosition);
  }

  /**
   * Every level that implements reset(). Restart used to reset only the
   * bedroom, which left Level 2's breaker flipped and its door still reading
   * "Open the door" across an R.
   */
  resetAll() {
    for (const level of this.levels.values()) level.reset?.();
  }
}
