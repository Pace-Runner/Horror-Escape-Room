// Holds every level as a sibling THREE.Group under one root, and switches
// which one is visible/active/collidable. Levels are built once up front
// (cheap at this world's poly count) so jumping between them for a mentor
// demo is instant -- there is no async load between rooms.
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

  activate(key, player) {
    const level = this.levels.get(key);
    // Returns null rather than a bare `return` on a bad key: the caller reads
    // level.interactables straight away, so silently returning undefined was a
    // TypeError. Null also lets the transition layer log and recover visibly,
    // instead of fading back in on the wrong room with no signal.
    if (!level) {
      console.warn(`SceneManager.activate: no level registered under "${key}"`);
      return null;
    }
    if (this.activeKey) {
      this.levels.get(this.activeKey).group.visible = false;
    }
    this.activeKey = key;
    level.group.visible = true;
    player.setColliders(level.colliders);
    // One call, rather than teleporting and then reaching in to write
    // player.controls.object.rotation from out here. That bypassed the look
    // state the player owns and silently zeroed pitch, so a level jump both
    // snapped the view level and handed the hands a bogus one-frame look delta.
    player.spawn(level.spawn[0], level.spawn[1], level.spawnYaw ?? 0, level.spawnPitch ?? 0);
    return level;
  }

  update(dt) {
    this.active?.update?.(dt);
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
