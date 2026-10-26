/** Focused Level 3 story regression: node scripts/check-study-reveal.mjs.
 * Real cutscene runner, caption clock, study gates and Annabelle geometry;
 * canvas/GPU/model transport are stubbed. No browser/audio is started.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createCutsceneRunner } from '../src/core/Cutscene.js';
import { createStudyMirrorReflection } from '../src/cutscenes/studyMirrorReflection.js';
import { CaptionSequencer } from '../src/core/CaptionSequencer.js';
import { buildStudyReveal, studyMirrorRoute, createStudyChoreography, REVEAL_DURATION, REVEAL_TIMES, CHAIR_EYE, poseStudyCreature, MIRROR_EYE } from '../src/cutscenes/studyReveal.js';
import { ANNABELLE_FINAL_LETTER } from '../src/story/studyReveal.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const bundlePath = path.join(rootDir, `.study-reveal-check-${process.pid}.mjs`);
const classes = () => {
  const values = new Set();
  return { add: (...names) => names.forEach(n => values.add(n)),
    remove: (...names) => names.forEach(n => values.delete(n)), contains: n => values.has(n),
    toggle(n, on = !values.has(n)) { if (on) values.add(n); else values.delete(n); } };
};
const gradient = { addColorStop() {} };
const context = new Proxy({
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  measureText: s => ({ width: String(s).length * 8 }),
  createLinearGradient: () => gradient, createRadialGradient: () => gradient
}, { get: (o, k) => k in o ? o[k] : (() => {}) });
globalThis.document = { body: { classList: classes(), appendChild() {} },
  createElement: () => ({ width: 512, height: 512, classList: classes(), getContext: () => context }) };
THREE.TextureLoader.prototype.load = () => new THREE.Texture({ width: 512, height: 512 });

// Read only the GLB's geometry and node matrices: no texture/image decoder or GPU.
function annabelleGeometry() {
  const bytes = fs.readFileSync(path.join(rootDir, 'src/assets/models/annabelle.glb'));
  const jsonLength = bytes.readUInt32LE(12), bin = 20 + jsonLength + 8;
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const types = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function attribute(index) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const Type = types[a.componentType], size = widths[a.type], step = size * Type.BYTES_PER_ELEMENT;
    const start = bin + (view.byteOffset || 0) + (a.byteOffset || 0);
    const packed = new Uint8Array(a.count * step);
    for (let i = 0; i < a.count; i++) packed.set(bytes.subarray(start + i * (view.byteStride || step),
      start + i * (view.byteStride || step) + step), i * step);
    return new THREE.BufferAttribute(new Type(packed.buffer), size, !!a.normalized);
  }
  const joints=new Set(gltf.skins.flatMap(s=>s.joints));
  const nodes = gltf.nodes.map((node,index) => {
    const group = joints.has(index)?new THREE.Bone():new THREE.Group();group.name=node.name||'';
    if (node.matrix) group.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    else {
      if (node.translation) group.position.fromArray(node.translation);
      if (node.rotation) group.quaternion.fromArray(node.rotation);
      if (node.scale) group.scale.fromArray(node.scale);
    }
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, name] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv'], ['JOINTS_0','skinIndex'], ['WEIGHTS_0','skinWeight']]) {
        if (primitive.attributes[semantic] !== undefined) geometry.setAttribute(name, attribute(primitive.attributes[semantic]));
      }
      if (primitive.indices !== undefined) geometry.setIndex(attribute(primitive.indices));
      group.add(node.skin!==undefined?new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial()):new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
    }
    return group;
  });
  gltf.nodes.forEach((n, i) => (n.children || []).forEach(child => nodes[i].add(nodes[child])));
  const scene = new THREE.Group();
  gltf.scenes[gltf.scene || 0].nodes.forEach(i => scene.add(nodes[i]));
  scene.updateMatrixWorld(true);
  gltf.nodes.forEach((node,i)=>{if(node.skin===undefined)return;const skin=gltf.skins[node.skin];const inv=attribute(skin.inverseBindMatrices).array;const skeleton=new THREE.Skeleton(skin.joints.map(j=>nodes[j]),skin.joints.map((j,k)=>new THREE.Matrix4().fromArray(inv,k*16)));nodes[i].traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.bind(skeleton,new THREE.Matrix4());});});
  return scene;
}
const source = annabelleGeometry();
globalThis.__studyTestModel = url => {
  if (!url.includes('/models/annabelle.glb')) return new Promise(() => {});
  const copy = cloneSkeleton(source);
  copy.traverse(n => { if (n.isMesh) n.material = n.material.clone(); });
  return Promise.resolve(copy);
};

try {
  const bundle = await build({ stdin: { contents: "export {createStudyLevel} from './src/levels/studyLevel.js';export {gameState} from './src/core/GameState.js';", resolveDir: rootDir },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'study-test', setup(b) {
      b.onResolve({ filter: /\?url$/ }, a => ({ path: a.path, namespace: 'asset' }));
      b.onLoad({ filter: /.*/, namespace: 'asset' }, a => ({ contents: `export default ${JSON.stringify(a.path)}` }));
      b.onLoad({ filter: /[\\/]modelLoader\.js$/ }, () => ({ contents: 'export const loadModel=url=>globalThis.__studyTestModel(url);' }));
      b.onLoad({ filter: /dialogue[\\/]index\.js$/ }, () => ({ contents: 'export const line=k=>k;' }));
    } }] });
  fs.writeFileSync(bundlePath, bundle.outputFiles[0].text);
  const { createStudyLevel, gameState } = await import(pathToFileURL(bundlePath));

  // A real reflected camera renders the room and staged body, then restores ownership.
  const scene = new THREE.Scene(), group = new THREE.Group(), root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.2), new THREE.MeshStandardMaterial()));
  group.add(root); scene.add(group); root.position.set(2, 0, 3); group.visible = false;
  const body = { group, refs: { root }, correction: 1,
    get visible() { return group.visible; }, set visible(v) { group.visible = v; },
    setPosition(x, z) { root.position.set(x, 0, z); }, setYaw(y) { root.rotation.y = y; },
    setCorrection(v) { this.correction = v; }, setSpeed() {}, setCrouch() {}, update() {} };
  const eye = new THREE.PerspectiveCamera(60, 16/9, .05, 100);
  eye.position.fromArray(MIRROR_EYE); eye.lookAt(4.8, 1.45, -6.372); eye.updateMatrixWorld();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(.674,1.77),new THREE.MeshStandardMaterial());
  glass.position.set(4.8,1.08,-6.373); scene.add(glass); scene.updateMatrixWorld(true);
  const controller = createStudyMirrorReflection({ glass, body, getCamera:()=>eye });
  controller.mirror.updateMatrixWorld(true);
  const captures = [];
  const renderer = { xr: { enabled:true }, shadowMap: { autoUpdate:true },
    state:{ buffers:{depth:{setMask(){}}},viewport(){} }, autoClear:true,
    target:null, getRenderTarget(){return this.target;},setRenderTarget(v){this.target=v;},clear(){},
    render(room, reflectedCamera){assert.equal(room,scene);assert(body.visible);
      assert(reflectedCamera.position.z < glass.position.z);captures.push(body.correction);}
  };
  controller.mirror.onBeforeRender(renderer,scene,eye);assert.equal(captures.length,0);
  controller.setEnabled(true);controller.mirror.onBeforeRender(renderer,scene,eye);
  controller.setCorrected(true);controller.mirror.onBeforeRender(renderer,scene,eye);
  assert.deepEqual(captures,[1,0]);assert(!body.visible);assert.equal(body.correction,1);
  assert.deepEqual(root.position.toArray(),[2,0,3]);assert.equal(renderer.target,null);
  assert.equal(controller.mirror.getRenderTarget().width,512);assert.equal(controller.mirror.getRenderTarget().height,512);
  renderer.render=()=>{throw new Error('expected render failure');};
  assert.throws(()=>controller.mirror.onBeforeRender(renderer,scene,eye));
  assert(!body.visible&&renderer.xr.enabled&&renderer.shadowMap.autoUpdate);assert.equal(renderer.target,null);
  controller.dispose();

  let fullDuration = 0;
  for (const cancelAt of [null, 0.2, 3, 13.5, 18, 28, 31]) {
    gameState.inventory.clear(); gameState.hasVisor = true; gameState.visorWorn = true; gameState.endingChosen = false;
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 100);
    camera.position.set(4.4, 4.7, -5.35);
    const player = { eyeHeight: 1.6, groundY: 3.1, movementEnabled: true, lookEnabled: true,
      cinematic: false, isLocked: true, crouch: 0, sprint: 0, keys: {}, clearKeys() { this.keys = {}; },
      aim(yaw, pitch) { camera.rotation.set(pitch, yaw, 0, 'YXZ'); }, spawn() { throw new Error('unexpected teleport'); } };
    const interaction = { enabled: true, setEnabled(on) { this.enabled = on; } };
    const captions = new CaptionSequencer({ style: {}, classList: classes(), textContent: '' });
    captions.setEnabled(false); // Every essential placeholder must remain readable.
    const spoken = []; captions.onLineStart = line => { spoken.push(line); assert(!line.voice); };
    const cutscene = createCutsceneRunner({ camera, player, interaction, captions });
    const creature = { visible: false, setCorrection(v) { this.correction = v; }, setSpeed() {}, update() {}, offsetBones() {} };
    let read, calls = 0, completed = 0, promise;
    const picked = [], used = [], endings = [];
    const level = createStudyLevel({ onReadLetter: request => { assert(!read); read = request; },
      onPickUpItem: id => { picked.push(id); gameState.inventory.add(id); },
      onUseItem: id => { used.push(id); gameState.inventory.delete(id); }, onChooseEnding: value => endings.push(value),
      onLookInMirror: () => {
        calls++;
        level.refs.installMirrorReflection({ setCorrected(){}, setEnabled(){}, dispose(){} });
        const visor = { set(on) { gameState.visorWorn = on; level.refs.setCorrectedSight(on); creature.setCorrection(on ? 1 : 0); } };
        const scene = buildStudyReveal({ start: camera.position.toArray(), startQuaternion: camera.quaternion.toArray(), annabelleSpot: level.refs.annabelleSpot,
          camera, player, visor, captions, refs: level.refs, creature, prepareCreature() { creature.visible = false; },
          restoreCreature() { creature.visible = false; }, onFinish(done) {
            if (done) completed++; else { visor.set(true); level.refs.cancelRevealPresentation(); }
          } });
        fullDuration = scene.shots.reduce((sum, shot) => sum + shot.seconds, 0);
        promise = cutscene.playScene(scene); return promise;
      } });
    await level.refs.warmUpReady;
    assert(!level.refs.annabelle.visible);
    const standingHeight = new THREE.Box3().setFromObject(level.refs.annabelle).getSize(new THREE.Vector3()).y;
    assert(Math.abs(standingHeight - 1.55) < 0.01);
    // Sample the whole authored upper-floor/stair route against real study colliders.
    const route = studyMirrorRoute(camera.position.toArray());
    for (let i = 0; i <= 500; i++) {
      const [x, y, z] = route(i / 500), feet = y - 1.6;
      for (const box of level.colliders) {
        if (box.minY !== undefined && (feet + 1.6 <= box.minY || feet >= box.maxY)) continue;
        const dx = x - Math.max(box.minX, Math.min(x, box.maxX));
        const dz = z - Math.max(box.minZ, Math.min(z, box.maxZ));
        assert(dx * dx + dz * dz >= 0.35 ** 2 - 1e-6, `route blocker at ${x},${y},${z}`);
      }
    }
    level.refs.puzzle.truthRecordsSolved = true; level.update(0.8);
    level.refs.letterHit.userData.interact.onInteract(); level.refs.letterHit.userData.interact.onInteract();
    assert.equal(read.body, ANNABELLE_FINAL_LETTER);
    assert(read.body.includes('Put on the visor.\n\nLook in the mirror.'));
    read.onFinished(); read.onFinished();
    void level.refs.mirrorGlass.userData.interact.onInteract();
    assert.equal(calls, 1); assert(cutscene.isRunning);
    assert(!player.movementEnabled && !player.lookEnabled && !interaction.enabled);
    assert.equal(level.refs.puzzle.endingChoice, 'NONE');
    let elapsed = 0, sawCreature = false, sawHuman = false, sawCard = false;
    while (cutscene.isRunning) {
      const dt = Math.min(0.05, cancelAt === null ? 0.05 : Math.max(0, cancelAt - elapsed));
      if (cancelAt !== null && dt === 0) { cutscene.cancel(); break; }
      elapsed += dt; captions.update(dt); level.update(dt); cutscene.update(dt);
      assert(!document.body.classList.contains('cutscene-letterbox'));
      assert(!(creature.visible && level.refs.annabelle.visible));
      sawCreature ||= creature.visible; sawHuman ||= level.refs.annabelle.visible;
      sawCard ||= level.refs.hollowOverrideKey.visible;
      assert.equal(endings.length, 0);
      assert(elapsed < 70, 'scene did not hand back');
    }
    await promise; await Promise.resolve();
    assert(player.movementEnabled && player.lookEnabled && interaction.enabled && !player.cinematic && player.isLocked);
    assert(!document.body.classList.contains('study-reveal'));
    assert(!creature.visible);
    if (cancelAt === null) {
      assert(sawCreature && sawHuman && sawCard); assert.equal(completed, 1);
      assert(level.refs.puzzle.mirrorRevealed && level.refs.annabelle.visible && gameState.visorWorn);
      const humanBounds = new THREE.Box3().setFromObject(level.refs.annabelle);
      assert(humanBounds.min.y > -0.001 && humanBounds.max.y < 1.50);
      const head=level.refs.annabelle.getObjectByName('mixamorig:Head');
      assert(head);const headBefore=head.getWorldPosition(new THREE.Vector3());level.update(.1);
      assert(head.getWorldPosition(new THREE.Vector3()).distanceTo(headBefore)>.0001,'Annabelle idle is frozen');
      assert.equal(spoken.length, 3);
      assert(spoken.every(line => line.always));
      assert.deepEqual(camera.position.toArray(), CHAIR_EYE);
      const pickup = level.interactables.find(h => h.userData.interact.label === 'Take the PROJECT HOLLOW ACCESS KEYCARD');
      pickup.userData.interact.onInteract(); pickup.userData.interact.onInteract();
      assert.equal(picked.filter(id => id === 'hollowOverrideKey').length, 1);
      const reseal = level.refs.overrideSockets.find(s => s.choice === 'RESEALED');
      const release = level.refs.overrideSockets.find(s => s.choice === 'RELEASE');
      reseal.hit.userData.interact.onInteract(); release.hit.userData.interact.onInteract();
      assert.equal(used.filter(id => id === 'hollowOverrideKey').length, 1);
      assert.equal(level.refs.puzzle.endingChoice, 'NONE');
      reseal.handleHit.userData.interact.onInteract(); level.update(1);
      assert.deepEqual(endings, ['contained']); assert(level.refs.annabelle.visible);
      await level.refs.mirrorGlass.userData.interact.onInteract(); assert.equal(calls, 1);
    } else {
      assert(!level.refs.puzzle.mirrorRevealed && !level.refs.puzzle.mirrorRevealInProgress);
      assert(!level.refs.annabelle.visible && !level.refs.hollowOverrideKey.visible);
      assert.equal(completed, 0);
    }
    level.reset(); read.onFinished();
    assert.equal(calls, 1); assert(!level.refs.puzzle.mirrorRevealed);
    assert(Math.abs(new THREE.Box3().setFromObject(level.refs.annabelle).getSize(new THREE.Vector3()).y - 1.55) < 0.01);
  }
  // Bound frame-to-frame camera velocity and quaternion changes at 120 Hz.
  const initialQuaternion = new THREE.Quaternion().toArray();
  const choreography = createStudyChoreography([4.4,4.7,-5.35],initialQuaternion,[-7.25,-5.9]);
  let before=choreography(0),maxSpeed=0,maxAngular=0;
  for(let i=1;i<=Math.ceil(REVEAL_DURATION*120);i++){
    const now=choreography(Math.min(REVEAL_DURATION,i/120));
    const speed=new THREE.Vector3(...before.position).distanceTo(new THREE.Vector3(...now.position))*120;
    const angular=new THREE.Quaternion().fromArray(before.quaternion).angleTo(new THREE.Quaternion().fromArray(now.quaternion))*120;
    maxSpeed=Math.max(maxSpeed,speed);maxAngular=Math.max(maxAngular,angular);
    assert(speed<7.5,`camera position discontinuity: ${speed}`);
    assert(angular<5.5,`camera turn discontinuity: ${angular}`);
    before=now;
  }
  console.log(`Camera maxima: ${maxSpeed.toFixed(2)} m/s, ${(maxAngular*180/Math.PI).toFixed(1)} deg/s.`);
  console.log(`PASS: ${fullDuration.toFixed(2)}s reveal; one-shot letter close; collision-clear stairs route; 512px planar room reflection transaction; exclusive creature/Annabelle swap; actual crouched-mesh height/reset; three silent captions; card pickup/endings; six cancellation points; control restoration.`);
  console.log('Headless geometry/state/GPU-call validation. Browser-rendered appearance and pointer-lock permission were not exercised.');
} finally {
  fs.rmSync(bundlePath, { force: true });
  delete globalThis.__studyTestModel;
}
