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
import { Interaction } from '../src/core/Interaction.js';
import { resolveCircle } from '../src/core/collision.js';
import { buildStudyReveal, studyMirrorRoute, createStudyChoreography, REVEAL_DURATION, REVEAL_TIMES, REVEAL_DIALOGUE, CHAIR_EYE, poseStudyCreature, MIRROR_EYE } from '../src/cutscenes/studyReveal.js';
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
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', define:{'import.meta.env.DEV':'true'}, plugins: [{ name: 'study-test', setup(b) {
      b.onResolve({ filter: /\?url$/ }, a => ({ path: a.path, namespace: 'asset' }));
      b.onLoad({ filter: /.*/, namespace: 'asset' }, a => ({ contents: `export default ${JSON.stringify(a.path)}` }));
      b.onLoad({ filter: /[\\/]modelLoader\.js$/ }, () => ({ contents: 'export const loadModel=url=>globalThis.__studyTestModel(url);' }));
      b.onLoad({ filter: /dialogue[\\/]index\.js$/ }, () => ({ contents: 'export const line=k=>k;' }));
    } }] });
  fs.writeFileSync(bundlePath, bundle.outputFiles[0].text);
  const { createStudyLevel, gameState } = await import(pathToFileURL(bundlePath));

  // Cabinet presentation must follow locks, hinges and reset without leaking
  // records or hardware through the closed doors.
  {
    const level = createStudyLevel({ onUseItem: id => gameState.inventory.delete(id) });
    const contents = level.group.getObjectByName('RestrictedArchiveContents');
    assert(contents && !contents.visible, 'restricted records visible while locked');
    const recordTargets = contents.children.filter(t => /^Select /.test(t.userData.interact?.label ?? ''));
    assert.equal(recordTargets.length, 3);
    const cabinet = contents.parent;
    const cabinetCollision = level.colliders.find(box =>
      Math.abs(box.minX - (cabinet.position.x - 1.07)) < 1e-6
      && Math.abs(box.maxX - (cabinet.position.x + 1.07)) < 1e-6);
    assert(cabinetCollision, 'restricted cabinet has no hand clearance');
    const closedFront = cabinetCollision.maxZ;
    function assertCabinetClearance() {
      level.group.updateMatrixWorld(true);
      const leaves = new THREE.Box3().setFromObject(level.refs.hollowArchivePanel);
      leaves.union(new THREE.Box3().setFromObject(level.group.getObjectByName('RestrictedArchiveRightHinge')));
      const position = { x: cabinet.position.x, z: cabinetCollision.maxZ + 0.6 };
      for (let step = 0; step < 60; step++) {
        position.z -= 0.04;
        resolveCircle(position, 0.35, [cabinetCollision]);
      }
      assert(position.z - leaves.max.z > 0.55, 'hand can reach through cabinet doors');
      const record = recordTargets[0].getWorldPosition(new THREE.Vector3());
      assert(Math.hypot(position.x - record.x, position.z - record.z) < 3.2,
        'cabinet clearance makes records unreachable');
      assert.equal(cabinetCollision.minY, cabinet.position.y, 'loft collider blocks downstairs');
    }
    assertCabinetClearance();
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {} };
    const prompt = { style: {}, textContent: '' };
    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
    const interaction = new Interaction(camera, prompt, { say() {} });
    globalThis.window = previousWindow;
    interaction.setTargets(level.interactables);
    function assertRecordPrompts(accessible) {
      level.group.updateMatrixWorld(true);
      for (const target of recordTargets) {
        const position = target.getWorldPosition(new THREE.Vector3());
        camera.position.copy(position).add(new THREE.Vector3(0, 0, 1));
        camera.lookAt(position); camera.updateMatrixWorld(true);
        interaction.update();
        assert.equal(level.interactables.includes(target), accessible);
        assert.equal(interaction.current === target, accessible,
          `${target.userData.interact.label}: incorrect prompt availability`);
        if (!accessible) assert(!recordTargets.includes(interaction.current), 'selector prompt through closed door');
        else assert.equal(prompt.style.display, 'block');
      }
    }
    assertRecordPrompts(false);
    level.refs.setCorrectedSight(true);
    level.update(0.1);
    assert(!contents.visible, 'visor exposed locked records');
    assertRecordPrompts(false);
    const pull = level.group.getObjectByName('LetterCompartmentPull');
    level.group.updateMatrixWorld(true);
    const pullBounds = new THREE.Box3().setFromObject(pull);
    const pullFront = contents.worldToLocal(pullBounds.max.clone()).z;
    assert(pullFront < 0.2675 - 0.02, 'letter pull penetrates the closed outer doors');

    const key = level.group.getObjectByName('MemoryArchive_Used_Key_In_Lock');
    const lock = key.parent;
    assert(lock.position.z > 0.0225 && lock.rotation.y === 0, 'keyhole must face outwards');
    assert(!key.visible);
    gameState.inventory.add('archiveKey');
    level.interactables.find(t => t.userData.interact?.label === 'Unlock the memory archive').userData.interact.onInteract();
    assert(key.visible && !gameState.inventory.has('archiveKey'));
    level.group.updateMatrixWorld(true);
    const closedKeyPosition = key.getWorldPosition(new THREE.Vector3());
    const seatedTransform = key.matrix.clone();
    level.update(1);
    level.group.updateMatrixWorld(true);
    assert(key.matrix.equals(seatedTransform), 'inserted key moved relative to its lock');
    assert(key.getWorldPosition(new THREE.Vector3()).distanceTo(closedKeyPosition) > 0.1,
      'inserted key did not follow the opening door');
    level.refs.puzzle.correctedTrailSolved = true;
    assertRecordPrompts(false);
    level.update(0.1);
    assertRecordPrompts(false);
    assertCabinetClearance();
    level.update(1);
    assert(contents.visible, 'unlocked records remain hidden');
    assertRecordPrompts(true);
    assertCabinetClearance();
    assert(cabinetCollision.maxZ > closedFront + 0.6, 'collision did not follow open doors');
    level.update(1);
    for (const target of recordTargets) assert.equal(level.interactables.filter(t => t === target).length, 1);
    level.reset();
    assertRecordPrompts(false);
    assert.equal(cabinetCollision.maxZ, closedFront, 'reset retained open-door collision');
    assert(!contents.visible && !key.visible, 'reset retained unlocked cabinet presentation');
    console.log('PASS: locked archive visibility, recessed letter pull, outward keyhole and seated key through opening/reset.');
  }

  // Voice hooks must follow actual interactions, never visibility/proximity.
  {
    const events = []; let progress = 0, allowAuto = true;
    const voiceLevel = createStudyLevel({ onThought: (key, options) => events.push({key, options}),
      onVoiceProgress: () => progress++, canAutoThought: () => allowAuto,
      onPickUpItem: id => gameState.inventory.add(id) });
    const use = label => {
      const target = voiceLevel.interactables.find(t => t.userData.interact?.label === label);
      assert(target, `missing interaction ${label}`); target.userData.interact.onInteract();
    };
    voiceLevel.update(60); assert.equal(events.length, 0, 'unengaged clock spoke automatically');
    use('Turn hour hand (+1 hour)'); assert.equal(events[0].key, 'l3_01');
    voiceLevel.update(54); assert(!events.some(e => e.key === 'l3_hint_clock'));
    allowAuto = false; voiceLevel.update(30); assert(!events.some(e => e.key === 'l3_hint_clock'), 'document started hint');
    allowAuto = true; voiceLevel.update(1); assert.equal(events.filter(e => e.key === 'l3_hint_clock').length, 1);
    voiceLevel.update(60); assert.equal(events.filter(e => e.key === 'l3_hint_clock').length, 1);
    const oldProgress = progress;
    for (let i = 0; i < 3; i++) use('Turn minute hand (+5 minutes)');
    assert(voiceLevel.refs.puzzle.clockSolved); assert(progress > oldProgress);
    assert.equal(events.filter(e => e.key === 'l3_02').length, 1);
    voiceLevel.update(3); const sigil = voiceLevel.interactables.find(t => t.userData.interact?.label === 'Take the Brass Sigil'); assert(sigil); sigil.userData.interact.onInteract(); sigil.userData.interact.onInteract();
    assert.equal(events.filter(e => e.key === 'l3_03').length, 1);
    voiceLevel.refs.puzzle.memoryVisorCollected = true;
    voiceLevel.update(1); assert(!events.some(e => e.key === 'l3_06'), 'trail spoke from sight/update');
    use('Examine the trail'); use('Examine the trail');
    assert.equal(events.filter(e => e.key === 'l3_06' && e.options.replayable).length, 2);
    console.log('PASS: Level 3 deliberate clock/trail triggers, engaged 55s one-shot hint, document suppression, solve interruption hook, single sigil pickup, replayable trail request.');
    gameState.inventory.clear();
  }

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
  const originalProjection=eye.projectionMatrix.clone(),originalInverse=eye.projectionMatrixInverse.clone();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(.674,1.77),new THREE.MeshStandardMaterial());
  glass.position.set(4.8,1.08,-6.373); scene.add(glass); scene.updateMatrixWorld(true);
  const controller = createStudyMirrorReflection({ glass, body, getCamera:()=>eye });
  root.rotation.set(0,Math.PI,0,'XYZ');root.children[0].rotation.set(0,Math.PI,0,'XYZ');
  const savedRootRotation=root.rotation.toArray(),savedShellRotation=root.children[0].rotation.toArray();
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
  // Side/stair/pitched views must use the unchanged viewer projection and a
  // world-plane reflected eye; invalid views keep the last matching texture.
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  for(const [position,target] of [
    [[4.8,1.6,-5.28],[4.45,1.45,-6.373]],
    [[4.8,1.6,-5.28],[4.8,2,-6.373]],
    [[2.4,1.6,-4.6],[4.8,1.45,-6.373]],
    [[7.25,4.7,-1.88],[4.8,1.45,-6.373]],
    [[7.25,1.6,2.6],[4.8,1.45,-6.373]]]) {
    eye.position.fromArray(position);eye.lookAt(...target);eye.updateMatrixWorld();
    controller.setTime(position[1]+position[2]+20);
    controller.setCorrected(position[0] < 4.9);
    controller.mirror.onBeforeRender(renderer,scene,eye);
    assert(eye.projectionMatrix.equals(originalProjection),'mirror mutated main projection');
    assert(controller.mirror.camera.projectionMatrix.elements.every(Number.isFinite));
    const planeZ=controller.mirror.getWorldPosition(new THREE.Vector3()).z;
    assert(Math.abs(controller.mirror.camera.position.z-(2*planeZ-eye.position.z))<1e-6);
    const expected=bias.clone().multiply(eye.projectionMatrix).multiply(controller.mirror.camera.matrixWorldInverse).multiply(controller.mirror.matrixWorld);
    assert(controller.mirror.material.uniforms.textureMatrix.value.equals(expected),'unstable texture projection');
  }
  const frozenProjection=controller.mirror.material.uniforms.textureMatrix.value.clone(),rendersBeforeInvalid=captures.length;
  for(const [position,target] of [[[4.8,1.6,-6.8],[4.8,1.6,-5]],[[4.8,1.6,-5.28],[5.8,1.6,-5.28]]]){
    eye.position.fromArray(position);eye.lookAt(...target);eye.updateMatrixWorld();
    controller.mirror.onBeforeRender(renderer,scene,eye);
    assert(controller.mirror.material.uniforms.textureMatrix.value.equals(frozenProjection));
    assert(controller.hasFrame&&controller.mirror.visible);
  }
  assert.equal(captures.length,rendersBeforeInvalid,'back/grazing view rendered an invalid projection');
  eye.position.fromArray(MIRROR_EYE);eye.lookAt(4.8,1.45,-6.373);eye.updateMatrixWorld();

  assert.deepEqual(root.position.toArray(),[2,0,3]);assert.equal(renderer.target,null);
  assert.deepEqual(root.rotation.toArray(),savedRootRotation,'reflection corrupted a 180-degree logical heading');
  assert.deepEqual(root.children[0].rotation.toArray(),savedShellRotation,'reflection corrupted the imported shell Euler axes');
  assert(eye.projectionMatrix.equals(originalProjection)&&eye.projectionMatrixInverse.equals(originalInverse));
  assert.equal(controller.mirror.getRenderTarget().width,1024);assert.equal(controller.mirror.getRenderTarget().height,2048);
  const stableTexture=controller.mirror.getRenderTarget().texture;
  controller.setCinematic(false);eye.position.set(4.8,1.6,0);eye.lookAt(4.8,1.45,-6.373);eye.updateMatrixWorld();
  controller.mirror.onBeforeRender(renderer,scene,eye);
  assert.equal(controller.quality.interval,6);assert(controller.mirror.visible&&controller.hasFrame);
  assert.equal(controller.mirror.getRenderTarget().texture,stableTexture);
  controller.reset();assert(controller.mirror.visible&&controller.hasFrame);
  eye.position.fromArray(MIRROR_EYE);eye.lookAt(4.8,1.45,-6.372);eye.updateMatrixWorld();
  controller.setCinematic(true);
  renderer.render=()=>{throw new Error('expected render failure');};
  assert.throws(()=>controller.mirror.onBeforeRender(renderer,scene,eye));
  assert(!body.visible&&renderer.xr.enabled&&renderer.shadowMap.autoUpdate);assert.equal(renderer.target,null);
  assert(eye.projectionMatrix.equals(originalProjection)&&eye.projectionMatrixInverse.equals(originalInverse));
  controller.dispose();

  let fullDuration = 0;
  for (const cancelAt of [null, 0.2, 3, 13.5, 18, 28, 31, REVEAL_DURATION-2]) {
    gameState.inventory.clear(); gameState.hasVisor = true; gameState.visorWorn = true; gameState.endingChosen = false;
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 100);
    camera.position.set(4.4, 4.7, -4.55);
    const player = { eyeHeight: 1.6, groundY: 3.1, movementEnabled: true, lookEnabled: true,
      cinematic: false, isLocked: true, crouch: 0, sprint: 0, keys: {}, clearKeys() { this.keys = {}; },
      aim(yaw, pitch) { camera.rotation.set(pitch, yaw, 0, 'YXZ'); }, spawn() { throw new Error('unexpected teleport'); } };
    const interaction = { enabled: true, setEnabled(on) { this.enabled = on; } };
    const captions = new CaptionSequencer({ style: {}, classList: classes(), textContent: '' });
    captions.setEnabled(false); // Every essential placeholder must remain readable.
    const spoken = []; captions.onLineStart = line => { spoken.push(line); assert(line.voice?.startsWith('mark/LEVEL 3/')); };
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
    const beforeClock=level.refs.puzzle.clockSolved;
    level.refs.prepareRevealTest(true);
    assert(level.refs.puzzle.mirrorUnlocked&&level.refs.puzzle.truthRecordsComplete);
    assert(!level.refs.letterHit.visible&&!level.refs.puzzle.mirrorRevealInProgress);
    level.refs.prepareRevealTest();
    assert.equal(level.refs.puzzle.clockSolved,beforeClock);
    assert.equal(level.refs.puzzle.endingChoice,'NONE');
    assert(!level.refs.puzzle.mirrorUnlocked&&!level.refs.puzzle.mirrorRevealed);
    assert(level.refs.letterHit.visible&&level.interactables.includes(level.refs.letterHit));
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
      assert(elapsed < REVEAL_DURATION+1, 'scene did not hand back');
      if(elapsed<REVEAL_TIMES.annabelle+REVEAL_DIALOGUE.find(b=>b.id==='override').t-.45) assert(!level.refs.hollowOverrideKey.visible,'card appeared before the handoff');
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
      assert.equal(spoken.length, 2+REVEAL_DIALOGUE.length);
      for(const on of [false,true,false,true,false,true]){gameState.visorWorn=on;level.refs.setCorrectedSight(on);level.update(.02);assert.equal(level.refs.annabelle.visible,on);assert.equal(level.refs.annabelleMonster.visible,!on);}
      assert.equal(level.refs.puzzle.endingChoice,'NONE');
      assert.deepEqual(spoken.slice(2).map(line=>line.text),REVEAL_DIALOGUE.map(b=>`${b.speaker}: ${b.text}`));
      assert(REVEAL_DIALOGUE.every((b,i)=>!i||b.t>=REVEAL_DIALOGUE[i-1].t+REVEAL_DIALOGUE[i-1].hold+.49));
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
  const choreography = createStudyChoreography([4.4,4.7,-4.55],initialQuaternion,[-7.25,-5.9]);
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
  console.log(`PASS: ${fullDuration.toFixed(2)}s reveal; one-shot letter close; collision-clear stairs route; 1024x2048 stable projective planar reflection; side/stair/pitch world-plane math; grazing/back-side retained frame; exclusive creature/Annabelle swap; actual crouched-mesh height/reset; timed dialogue/pauses; late card handoff/pickup/endings; seven cancellation points; control restoration.`);
  console.log('Headless geometry/state/GPU-call validation. Browser-rendered appearance and pointer-lock permission were not exercised.');
} finally {
  fs.rmSync(bundlePath, { force: true });
  delete globalThis.__studyTestModel;
}

