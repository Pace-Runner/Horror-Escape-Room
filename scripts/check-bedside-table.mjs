import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';

// Check the exported asset and exercise the actual drawer/pickup code without
// needing a browser renderer. Other bedroom systems are outside this test.
const bytes = fs.readFileSync(new URL('../src/assets/models/bedside_table.glb', import.meta.url));
const asset = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const drawerNode = asset.nodes.find((node) => node.name === 'BedsideDrawer');
assert(drawerNode?.children?.length >= 4, 'Drawer must own its moving parts');
assert(asset.nodes.some((node) => node.name === 'BedsideDrawerKnob'));
assert(asset.nodes.some((node) => node.name === 'BedsideTopScratch'));
const tableNode = asset.nodes.find((node) => node.name === 'BedsideTable');
const tablePosition = asset.accessors[asset.meshes[tableNode.mesh].primitives[0].attributes.POSITION];
assert(tablePosition.max[0] - tablePosition.min[0] > 0.53, 'Table width must reflect the Blender enlargement');
assert(tablePosition.max[1] > 0.54, 'Table height must reflect the Blender enlargement');
const drawerFloorNode = asset.nodes.find((node) => node.name === 'BedsideDrawerFloor');
const drawerFloorPosition = asset.accessors[asset.meshes[drawerFloorNode.mesh].primitives[0].attributes.POSITION];
const drawerFloorTop = drawerFloorNode.translation[1] + drawerFloorPosition.max[1];
assert(drawerFloorTop < 0.338 && drawerFloorTop > 0.33, 'Photo must sit directly above the tray floor');
assert(asset.images?.some((image) => image.bufferView !== undefined), 'Custom wood image must be embedded');
assert(!drawerNode.translation || drawerNode.translation.every((value) => value === 0), 'Export must start closed');

const source = fs.readFileSync(new URL('../src/levels/bedroomLevel.js', import.meta.url), 'utf8');
const start = source.indexOf('  const NIGHTSTAND_DRAWER_TRAVEL_METRES');
const end = source.indexOf('  // Knocked-over waste bin', start);
const updateStart = source.indexOf('      // A reset-safe scripted slide');
const updateEnd = source.indexOf('      this._t', updateStart);
const resetStart = source.indexOf('      drawerStates.nightstandLeft.isOpen = false;');
const resetEnd = source.indexOf('      drawerStates.dresserTop.isOpen = false;', resetStart);
let collectedCount = 0;
const model = new THREE.Group();
const drawer = new THREE.Group();
drawer.name = 'BedsideDrawer';
model.add(drawer);
const state = { foundPhotos: new Set() };
const context = vm.createContext({
  THREE, console, group: new THREE.Group(), colliders: [], interactables: [],
  loadModel: async () => model, bedsideTableModelUrl: 'custom-table',
  SEARCH_NIGHTSTAND_POSITION_X: 0.60, SEARCH_NIGHTSTAND_POSITION_Z: -2.2,
  PUZZLE_PHOTO_HEIGHT_METRES: 0.24, PUZZLE_PHOTO_ASPECT_RATIO: 0.8,
  puzzlePhotoTextures: { 1985: new THREE.Texture() }, puzzleState: state,
  drawerStates: { nightstandLeft: { isOpen: false } },
  photoThumbMeshes: { nightstandLeft: { visible: false } },
  showCaption: () => {}, onPhotoCollected: () => { collectedCount += 1; }
});
vm.runInContext(`${source.slice(start, end)}
globalThis.tableTest = {
  search: () => nightstandLeft.userData.interact.onInteract(),
  update: (dt) => { ${source.slice(updateStart, updateEnd)} },
  reset: () => {
    ${source.slice(resetStart, resetEnd)}
    nightstandPhotoPickup.reset(); puzzleState.foundPhotos.clear();
    if (!interactables.includes(nightstandLeft)) interactables.push(nightstandLeft);
  }
};`, context);
await new Promise((resolve) => setImmediate(resolve));
const pickup = context.group.getObjectByName('CustomBedsideTable').children
  .find((child) => child.isGroup && child !== model).children.find((child) => child.userData.interact);
assert.equal(pickup.visible, false);
pickup.userData.interact.onInteract();
assert.equal(state.foundPhotos.size, 0, 'Hidden photo cannot be collected');
context.tableTest.search();
assert.equal(state.foundPhotos.size, 0, 'Searching must not grant the photo');
context.tableTest.update(0.3);
assert(drawer.position.z > 0 && drawer.position.z < 0.246);
assert.equal(pickup.visible, false);
context.tableTest.update(0.36);
assert.equal(drawer.position.z, 0.246);
assert.equal(pickup.visible, true);
pickup.userData.interact.onInteract();
assert(state.foundPhotos.has('nightstandLeft'));
assert.equal(collectedCount, 1);
assert.equal(pickup.visible, false);
context.tableTest.reset();
assert.equal(drawer.position.z, 0);
assert.equal(pickup.visible, false);
assert.equal(context.drawerStates.nightstandLeft.isOpen, false);
context.tableTest.search();
context.tableTest.update(0.2);
context.tableTest.reset();
context.tableTest.update(1);
assert.equal(drawer.position.z, 0, 'Restart cancels an unfinished slide');
assert.equal(pickup.visible, false);
assert(context.colliders.some((collider) => collider.minX < 0.60 && collider.maxX > 0.60));
console.log('Custom GLB, closed/open drawer, separate 1985 pickup, collision and restart checks passed.');
