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

  activate(key, player) {
    if (!this.levels.has(key)) return;
    if (this.activeKey) {
      this.levels.get(this.activeKey).group.visible = false;
    }
    this.activeKey = key;
    const level = this.levels.get(key);
    level.group.visible = true;
    player.setColliders(level.colliders);
    player.teleport(level.spawn[0], level.spawn[1]);
    if (player.controls.object.rotation) {
      player.controls.object.rotation.set(0, level.spawnYaw ?? 0, 0);
    }
    return level;
  }

  update(dt) {
    this.active?.update?.(dt);
  }
}
