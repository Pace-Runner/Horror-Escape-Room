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
import { createStudyActorPresentation } from '../src/cutscenes/studyActorPresentation.js';
import { createStudyMirrorReflection } from '../src/cutscenes/studyMirrorReflection.js';
import { CaptionSequencer } from '../src/core/CaptionSequencer.js';
import { Interaction } from '../src/core/Interaction.js';
import { resolveCircle } from '../src/core/collision.js';
import { buildStudyReveal, createStudyRevealTiming, studyMirrorRoute, createStudyChoreography, REVEAL_DURATION, REVEAL_TIMES, REVEAL_DIALOGUE, CHAIR_EYE, poseStudyCreature, MIRROR_EYE } from '../src/cutscenes/studyReveal.js';
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
function annabelleGeometry(file = 'annabelle.glb') {
  const bytes = fs.readFileSync(path.join(rootDir, 'src/assets/models',file));
  const jsonLength = bytes.readUInt32LE(12), bin = 20 + jsonLength + 8;
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const types = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const bcopy=(start,length)=>Uint8Array.from(bytes.subarray(start,start+length)).buffer;
  function attribute(index) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const Type = types[a.componentType], size = widths[a.type], step = size * Type.BYTES_PER_ELEMENT;
    const start = bin + (view?.byteOffset || 0) + (a.byteOffset || 0);
    const packed = new Uint8Array(a.count * step);
    if(view) for (let i = 0; i < a.count; i++) packed.set(bytes.subarray(start + i * (view.byteStride || step),
      start + i * (view.byteStride || step) + step), i * step);
    if(a.sparse){
      const sp=a.sparse,IndexType=types[sp.indices.componentType];
      const iv=gltf.bufferViews[sp.indices.bufferView],vv=gltf.bufferViews[sp.values.bufferView];
      const indices=new IndexType(bcopy(bin+(iv.byteOffset||0)+(sp.indices.byteOffset||0),sp.count*IndexType.BYTES_PER_ELEMENT));
      const values=bin+(vv.byteOffset||0)+(sp.values.byteOffset||0);
      for(let i=0;i<sp.count;i++)packed.set(bytes.subarray(values+i*step,values+(i+1)*step),indices[i]*step);
    }
    return new THREE.BufferAttribute(new Type(packed.buffer), size, !!a.normalized);
  }
  const joints=new Set((gltf.skins||[]).flatMap(s=>s.joints));
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
      if(primitive.targets){
        geometry.morphTargetsRelative=true;
        geometry.morphAttributes.position=primitive.targets.map((target,i)=>{
          const value=attribute(target.POSITION);value.name=gltf.meshes[node.mesh].extras?.targetNames?.[i]||String(i);return value;
        });
      }
      const material=new THREE.MeshStandardMaterial();material.name=gltf.materials?.[primitive.material]?.name||'';
      const mesh=node.skin!==undefined?new THREE.SkinnedMesh(geometry,material):new THREE.Mesh(geometry,material);
      mesh.name=gltf.meshes[node.mesh].name||'';group.add(mesh);
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
const source = annabelleGeometry(),monsterSource=annabelleGeometry('okabe.glb'),cleanSource=annabelleGeometry('okabe_clean.glb'),chairSource=annabelleGeometry('study/annabelle_wingback_chair.glb');
globalThis.__studyTestModel = url => {
  const model=url.includes('annabelle_wingback_chair.glb')?chairSource:url.includes('/models/annabelle.glb')?source:url.includes('/models/okabe.glb')?monsterSource:url.includes('/models/okabe_clean.glb')?cleanSource:null;
  if(!model)return new Promise(()=>{});
  const copy = cloneSkeleton(model);
  copy.traverse(n => {if(n.isMesh){n.material=n.material.clone();n.geometry=n.geometry.clone();}});
  return Promise.resolve(copy);
};

try {
  const bundle = await build({ stdin: { contents: "export {createStudyLevel} from './src/levels/studyLevel.js';export {gameState} from './src/core/GameState.js';export {createAnnabelle} from './src/levels/annabelleFigure.js';export {createOkabeCreature} from './src/systems/OkabeCreature.js';export {createAudioDirector,STUDY_BED_GAIN_DB} from './src/systems/AudioDirector.js';", resolveDir: rootDir },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', define:{'import.meta.env.DEV':'true'}, plugins: [{ name: 'study-test', setup(b) {
      b.onResolve({ filter: /\?url$/ }, a => ({ path: a.path, namespace: 'asset' }));
      b.onLoad({ filter: /.*/, namespace: 'asset' }, a => ({ contents: `export default ${JSON.stringify(a.path)}` }));
      b.onLoad({ filter: /[\\/]modelLoader\.js$/ }, () => ({ contents: 'export const loadModel=url=>globalThis.__studyTestModel(url);' }));
      b.onLoad({filter:/world[\\/]audio[\\/]assets\.js$/},()=>({contents:`export const cueInfo=name=>(${JSON.stringify(JSON.parse(fs.readFileSync(path.join(rootDir,'src/assets/audio/manifest.json'),'utf8')).assets)})[name];`}));
      b.onLoad({ filter: /dialogue[\\/]index\.js$/ }, () => ({ contents: 'export const line=k=>k;' }));
    } }] });
  fs.writeFileSync(bundlePath, bundle.outputFiles[0].text);
  const { createStudyLevel, gameState, createAnnabelle,createOkabeCreature,createAudioDirector,STUDY_BED_GAIN_DB } = await import(pathToFileURL(bundlePath));

  const bedCalls=[];
  const bedAudio={ctx:{state:'running'},cue:name=>({duration:300,name}),emit(bus,options){
    const emitter={alive:true,stopping:false,setGain(gain){bedCalls.push({gain});},stop(){this.stopping=true;}};
    if(options.buffer.name==='rain_bed')bedCalls.push({gain:options.gain,options});return emitter;
  }};
  const bedDirector=createAudioDirector({audio:bedAudio,THREE,player:{},hunter:{state:'stopped'},
    captions:{},getLevel:()=>({key:'study'}),getListener:()=>null,isBusy:()=>true,isHuntingCrossing:()=>false});
  bedDirector.onLevelActivated('bedroom');const baseBed=bedCalls.at(-1).gain;
  bedDirector.onLevelActivated('study');
  assert.equal(STUDY_BED_GAIN_DB,5);assert(Math.abs(bedCalls.at(-1).gain/baseBed-10**(.25))<1e-8);
  assert(bedCalls[0].options.loop&&bedCalls[0].options.loopEnd>bedCalls[0].options.loopStart);
  console.log('PASS: existing shared rain loop receives +5dB in study, with its measured loop window.');

  // Every sentence accent must visibly affect the existing rig, above the idle.
  const actor=createAnnabelle(),idleActor=createAnnabelle();
  await Promise.all([actor.ready,idleActor.ready]);
  for(const id of ['please','me','no','saw','following','tried','told','promise','remember','know','eyes','visor','override','decide']){
    for(const figure of [actor,idleActor]){figure.reset();figure.setCrouched(true);}
    actor.perform(id,2);
    let change=0;
    for(let frame=0;frame<7;frame++){actor.update(.1);idleActor.update(.1);
    for(const name of ['Head','Spine1','Spine2','LeftShoulder','LeftForeArm']){
      const a=actor.root.getObjectByName('mixamorig:'+name),b=idleActor.root.getObjectByName('mixamorig:'+name);
      change=Math.max(change,a.quaternion.angleTo(b.quaternion));
    }
    }
    assert(change>.025,`emotion accent missing: ${id}`);
  }
  console.log('PASS: all 14 emotional sentence accents visibly move the existing rig over its continuous idle.');
  actor.reset();actor.setCrouched(true);actor.perform('please',2);actor.update(.5);
  assert.equal(actor.emotionalState,'frightened');actor.perform('tried',2);
  for(let i=0;i<10;i++)actor.update(.1);
  assert.equal(actor.emotionalState,'hurt');actor.perform('know',2);actor.update(.1);assert.equal(actor.emotionalState,'hurt');
  const guard=actor.root.getObjectByName('mixamorig:LeftHand').getWorldPosition(new THREE.Vector3());
  assert(guard.y<1.15,'guarding hand still reaches face');


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
    let read, calls = 0, completed = 0, promise,mirrorIdentity;
    const picked = [], used = [], endings = [];
    const level = createStudyLevel({ onReadLetter: request => { assert(!read); read = request; },
      onPickUpItem: id => { picked.push(id); gameState.inventory.add(id); },
      onUseItem: id => { used.push(id); gameState.inventory.delete(id); }, onChooseEnding: value => endings.push(value),
      onLookInMirror: () => {
        calls++;
        level.refs.installMirrorReflection({ setCorrected(on){mirrorIdentity=on;}, setEnabled(){}, dispose(){} });
        const visor = { set(on) { gameState.visorWorn = on; level.refs.setCorrectedSight(on); creature.setCorrection(on ? 1 : 0); } };
        const scene = buildStudyReveal({ start: camera.position.toArray(), startQuaternion: camera.quaternion.toArray(), annabelleSpot: level.refs.annabelleSpot,
          camera, player, visor, captions, refs: level.refs, creature, prepareCreature() { creature.visible = false; },
          restoreCreature() { creature.visible = false; }, onFinish(done) {
            if (done) completed++; else { visor.set(true); level.refs.cancelRevealPresentation(); }
          } });
        fullDuration = scene.shots.reduce((sum, shot) => sum + shot.seconds, 0);
        promise = cutscene.playScene(scene); return promise;
      } });
    await level.refs.warmUpReady;await level.refs.cornerReady;await level.refs.chairReady;
    if(cancelAt===null){
      const human=createOkabeCreature({clean:true,restCorrection:1,gait:'player'});
      const hollow=createOkabeCreature({restCorrection:0,gait:'player'});
      await Promise.all([human.ready,hollow.ready]);
      for(const figure of [human,hollow]){
        assert(['Hips','Spine','Chest','Head','Left leg','Right leg','Left knee','Right knee','Left ankle','Right ankle',
          'Left shoulder','Right shoulder','Left arm','Right arm','Left elbow','Right elbow','Left wrist','Right wrist']
          .every(name=>figure.getRigBone(name)), 'missing reflection rig joint');
        let minThigh=Infinity,maxThigh=-Infinity,minArm=Infinity,maxArm=-Infinity,minHip=Infinity,maxHip=-Infinity;
        for(let frame=0;frame<120;frame++){
          figure.sampleReflectionPose({speed:2,phase:frame/120*Math.PI*2});figure.group.updateMatrixWorld(true);
          const leg=figure.getRigBone('Left knee').getWorldPosition(new THREE.Vector3()).sub(figure.getRigBone('Left leg').getWorldPosition(new THREE.Vector3()));
          const arm=figure.getRigBone('Left elbow').getWorldPosition(new THREE.Vector3()).sub(figure.getRigBone('Left arm').getWorldPosition(new THREE.Vector3()));
          const thigh=Math.atan2(leg.z,-leg.y)*180/Math.PI, swing=Math.atan2(arm.z,-arm.y)*180/Math.PI;
          minThigh=Math.min(minThigh,thigh);maxThigh=Math.max(maxThigh,thigh);minArm=Math.min(minArm,swing);maxArm=Math.max(maxArm,swing);
          const y=figure.refs.hips.getWorldPosition(new THREE.Vector3()).y;minHip=Math.min(minHip,y);maxHip=Math.max(maxHip,y);
        }
        assert(Math.max(Math.abs(minThigh),Math.abs(maxThigh))<26,'reflection thighs over-swing');
        assert(Math.max(Math.abs(minArm),Math.abs(maxArm))<16,'reflection arms over-swing');
        assert(maxHip-minHip<.021,'reflection hip bob too large');
        console.log(`Reflection gait: thigh ${minThigh.toFixed(1)}..${maxThigh.toFixed(1)}deg; arm ${minArm.toFixed(1)}..${maxArm.toFixed(1)}deg; hip bob ${((maxHip-minHip)*100).toFixed(1)}cm.`);
        figure.sampleReflectionPose({visorLift:1});figure.group.updateMatrixWorld(true);
        const face=figure.getEyePosition(new THREE.Vector3()),hand=figure.refs.hands.r.getWorldPosition(new THREE.Vector3());
        assert(hand.distanceTo(face.clone().add(new THREE.Vector3(.08,0,-.015)))<.06,'hand misses visor temple');
        figure.setSpeed(0);figure.update(0);const idle=figure.getRigBone('Left leg').quaternion.clone();
        figure.sampleReflectionPose({speed:2,phase:1});figure.update(0);
        assert(idle.angleTo(figure.getRigBone('Left leg').quaternion)<.00001,'visual sample altered owning actor locomotion');
      }
      const itemBuilds=[];
      const visual=createStudyActorPresentation({visorTemplate:level.refs.visorGroup,buildHeldItem:id=>{itemBuilds.push(id);const prop=new THREE.Group();prop.add(new THREE.Mesh(new THREE.BoxGeometry(.08,.05,.01),new THREE.MeshStandardMaterial()));return prop;}});visual.setHeld(true);
      const p=new THREE.Vector3(0,1.6,0);visual.update(0,p);
      for(let i=1;i<=120;i++){p.z-=2/60;visual.update(i/60,p);}
      assert(visual.motion.speed>1.9);
      const legPose=[];
      for(const [figure,corrected] of [[human,false],[hollow,true]]){
        visual.apply(figure,corrected);legPose.push(figure.getRigBone('Left leg').quaternion.clone());
        const first=figure.getRigBone('Left leg').quaternion.clone();
        figure.sampleReflectionPose({speed:2,phase:visual.motion.phase+Math.PI/2});
        assert(first.angleTo(figure.getRigBone('Left leg').quaternion)>.04,'walking reflection is frozen');
      }
      const phase=visual.motion.phase;visual.syncWorn(true);assert.equal(visual.motion.phase,phase,'swap reset gait');
      for(let i=121;i<=180;i++)visual.update(i/60,p);
      assert(visual.motion.speed<.001,'idle did not return');
      const viewCamera=new THREE.PerspectiveCamera(),viewScene=new THREE.Scene();viewScene.add(viewCamera);
      visual.setVisor(true,{start:3,duration:1.2,cinematic:true});
      visual.update(3,p,viewCamera);visual.apply(human,false);
      const humanAttachment=visual.attachments.find(r=>r.head===human.refs.head);
      const handStart=humanAttachment.prop.getWorldPosition(new THREE.Vector3());
      for(const [actor,corrected] of [[human,false],[hollow,true]]){
        visual.apply(actor,corrected);const r=visual.attachments.find(r=>r.head===actor.refs.head);
        const wrist=r.hand.getWorldPosition(new THREE.Vector3()),elbow=actor.getRigBone('Right elbow').getWorldPosition(new THREE.Vector3());
        const forward=wrist.clone().sub(elbow).normalize();let cuffClearance=Infinity;
        r.prop.updateMatrixWorld(true);r.prop.traverse(mesh=>{if(!mesh.isMesh)return;mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
          for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
            const p=new THREE.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld);cuffClearance=Math.min(cuffClearance,p.sub(wrist).dot(forward));
          }});
        assert(cuffClearance>.02,'visor temple intersects wrist/cuff plane');
      }

      assert.equal(visual.attachments.find(r=>r.head===human.refs.head).prop.userData.attachment,'hand');
      visual.update(3.6,p,viewCamera);visual.apply(human,false);
      assert(visual.motion.blend>.4&&visual.motion.blend<.6);
      assert(visual.hiddenObjects[0].visible&&visual.hiddenObjects[0].parent===viewCamera,'first-person visor not in visible scene');
      assert.equal(humanAttachment.prop.children[0].geometry,level.refs.visorGroup.children[0].geometry,'visor geometry was rebuilt');
      assert(humanAttachment.prop.getWorldPosition(new THREE.Vector3()).y>handStart.y+.15,'visor failed to rise with hand');
      visual.update(4.2,p,viewCamera);visual.apply(human,false);
      const humanFace=visual.attachments.find(r=>r.head===human.refs.head);
      assert.equal(humanFace.prop.parent,humanFace.face);
      assert(humanFace.prop.visible);
      visual.apply(hollow,true);
      assert.equal(visual.attachments.find(r=>r.head===hollow.refs.head).prop.userData.attachment,'face');
      assert(visual.attachments.find(r=>r.head===hollow.refs.head).prop.visible);
      visual.update(4.199,p);visual.apply(human,false);const beforeAttach=humanFace.prop.getWorldPosition(new THREE.Vector3());
      visual.update(4.201,p);visual.apply(human,false);assert(beforeAttach.distanceTo(humanFace.prop.getWorldPosition(new THREE.Vector3()))<.015,'visor teleported at face attach');
      visual.setVisor(false,{start:4.3,duration:1.1,contact:.4,cinematic:true});
      visual.update(4.7,p);visual.apply(human,false);
      visual.update(5.4,p);visual.apply(human,false);
      assert.equal(visual.attachments.find(r=>r.head===human.refs.head).prop.userData.attachment,'hand');
      visual.setVisor(true,{start:5.5,duration:1.2,cinematic:true});visual.update(6.7,p);visual.apply(hollow,true);
      assert.equal(visual.attachments.find(r=>r.head===hollow.refs.head).prop.userData.attachment,'face');
      visual.finishVisor(true);assert(!visual.hiddenObjects[0].visible,'handling prop leaked past cutscene');
      visual.syncWorn(false);visual.update(7.02,p);visual.apply(human,false);
      assert.equal(visual.attachments.find(r=>r.head===human.refs.head).prop.userData.attachment,'hand');
      visual.syncWorn(true);visual.update(7.34,p);visual.apply(hollow,true);
      assert.equal(visual.attachments.find(r=>r.head===hollow.refs.head).prop.userData.attachment,'face');
      visual.finishVisor(false);visual.setInventoryItem('hollowOverrideKey','flashlight');visual.apply(human,false);
      const equipped=visual.attachments.find(r=>r.head===human.refs.head);
      assert(!equipped.prop.visible,'owned visor leaked into hand while holding card');
      assert(equipped.items.get('hollowOverrideKey').visible,'selected card missing from reflection');
      assert(equipped.items.get('left:flashlight').visible,'carried left flashlight missing');
      visual.setInventoryItem(null);visual.apply(human,false);
      assert(!equipped.prop.visible&&!equipped.items.get('hollowOverrideKey').visible,'empty reflected hand shows an item');
      visual.setInventoryItem('archiveKey');visual.apply(human,false);
      assert(equipped.items.get('archiveKey').visible&&!equipped.items.get('hollowOverrideKey').visible);
      visual.setInventoryItem('hollowOverrideKey');visual.apply(human,false);
      assert.equal(itemBuilds.filter(id=>id==='hollowOverrideKey').length,1,'item rebuilt each toggle');
      visual.finishVisor(true);visual.apply(hollow,true);
      const hollowEquipped=visual.attachments.find(r=>r.head===hollow.refs.head);
      assert(hollowEquipped.prop.visible&&hollowEquipped.prop.userData.attachment==='face');
      assert(hollowEquipped.items.get('hollowOverrideKey').visible,'worn goggles hid held card');
      visual.initializeInHand();visual.apply(human,false);
      assert.equal(visual.motion.blend,0,'canonical reset left an active removal');
      for(const r of visual.attachments){assert.equal(r.prop.parent,r.grip);assert.equal(r.prop.userData.attachment,'hand');assert(r.prop.visible);}
      visual.dispose();
      const gaitScene=new THREE.Scene(),gaitGlass=new THREE.Mesh(new THREE.PlaneGeometry(.674,1.77),new THREE.MeshStandardMaterial());
      gaitGlass.position.set(4.8,1.08,-6.373);gaitScene.add(gaitGlass,human.group,hollow.group);
      const gaitCamera=new THREE.PerspectiveCamera(60,16/9,.05,100);
      const gaitMirror=createStudyMirrorReflection({glass:gaitGlass,body:human,hollow,getCamera:()=>gaitCamera,
        getActorPose:()=>({position:new THREE.Vector3(4.8,1.6,-5.2),cinematic:true,hasVisor:true}),visorTemplate:level.refs.visorGroup});
      gaitMirror.setEnabled(true);gaitMirror.setCinematic(true);gaitMirror.setCorrected(true);
      const legSamples=[];const gaitRenderer={...renderer,target:null,render(){legSamples.push(hollow.getRigBone('Left leg').quaternion.clone());}};
      for(let frame=0;frame<60;frame++){
        gaitCamera.position.set(4.5+frame*.008,1.6,-5-frame*.004);gaitCamera.lookAt(4.8,1.45,-6.373);gaitCamera.updateMatrixWorld(true);
        gaitScene.updateMatrixWorld(true);gaitMirror.setTime(frame/60,gaitCamera.position);
        gaitMirror.mirror.onBeforeRender(gaitRenderer,gaitScene,gaitCamera);
      }
      assert(legSamples.length>30,'cinematic mirror did not render walking rig');
      assert(gaitMirror.actorPresentation.motion.speed>.4,'cutscene camera motion did not drive gait');
      assert(legSamples.some(q=>q.angleTo(legSamples[0])>.025),'Hollow legs frozen in cinematic reflection');
      gaitMirror.dispose();

      console.log('PASS: both full reflection rigs walk; shared phase survives swap; idle blends back; existing visor hand/face attachments and repeated put-on/take-off.');
      const lights=[];level.group.traverse(object=>{if(object.isLight)lights.push(object);});
      assert.equal(lights.length,9,'study light budget grew');
      const shadows=lights.filter(light=>light.castShadow);
      assert.equal(shadows.length,1,'study must have only one shadow source');
      const night=lights.find(light=>light.name==='Study_Window_Night');
      assert(night?.isDirectionalLight&&night.intensity===.55);
      assert.equal(shadows[0],night);assert.equal(night.shadow.mapSize.x,512);
      assert.equal(night.shadow.autoUpdate,false,'night shadow refreshes every frame');
      assert.equal(level.refs.ambient.intensity,.85);
      assert(level.refs.ambient.intensity<3.5*.5,'preview ambient remains');
      assert.equal(level.refs.lamp.intensity,2.4);assert.equal(level.refs.lamp.distance,3);
      assert.equal(level.refs.candles.lights.length,2);
      assert(level.refs.candles.lights.every(light=>!light.castShadow));
      const ceiling=level.group.getObjectByName('Study_Shadowed_Plaster');
      assert(ceiling.material.color.r<.5&&ceiling.receiveShadow);
      assert(level.group.getObjectByName('StudyLeftWall').children.some(mesh=>mesh.castShadow));
      const fire=level.refs.fire;
      assert.equal(fire.light.distance,5.5);assert(!fire.light.castShadow);
      const drawCount=fire.group.children.length;
      for(let i=0;i<600;i++){
        fire.update(.05);assert(fire.light.intensity>=6.5*.935&&fire.light.intensity<=6.5*1.065);
      }
      assert.equal(fire.group.children.length,drawCount,'fire allocated new particles');
      for(const eye of [new THREE.Vector3(4.8,1.6,-5.28),new THREE.Vector3(4.4,4.7,-5.35)]){
        for(let frame=0;frame<60;frame++)level.refs.candles.update(.05,{playerPosition:eye});
        assert(level.refs.candles.lights.some(light=>light.intensity>.2),'nearby candle pools remain dark');
        assert(level.refs.candles.lights.every(light=>light.intensity<1.5),'candle pool washes out room');
      }
      console.log('PASS: study lighting budget 9 lights (including existing map wash) / 1 static 512px shadow; ambient .85; night .55; desk 2.4 at 3m; 2 candle pools; fire 6.5 +/-6.5%; unchanged fire geometry.');
    }
    assert(!level.refs.annabelle.visible);
    const standingHeight = new THREE.Box3().setFromObject(level.refs.annabelle).getSize(new THREE.Vector3()).y;
    assert(Math.abs(standingHeight - 1.705) < 0.01);
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
    const cardPositions=[],personPositions=[],walkLegs=[];const personStart=level.refs.annabelle.position.clone();
    while (cutscene.isRunning) {
      const dt = Math.min(0.05, cancelAt === null ? 0.05 : Math.max(0, cancelAt - elapsed));
      if (cancelAt !== null && dt === 0) { cutscene.cancel(); break; }
      elapsed += dt; captions.update(dt); level.update(dt); cutscene.update(dt);
      assert.equal(mirrorIdentity,gameState.visorWorn,'stale cutscene mirror identity');
      if(elapsed<REVEAL_TIMES.hollow){assert.equal(gameState.visorWorn,false,'pre-letter ON state leaked into reveal');assert.equal(mirrorIdentity,false);}
      if(elapsed>=REVEAL_TIMES.turn&&cutscene.isRunning){
        assert.equal(level.refs.annabelle.visible,gameState.visorWorn,'stale chair identity');
        assert.equal(level.refs.annabelleMonster.visible,!gameState.visorWorn);
      }
      if(level.refs.annabelle.visible){
        const a=level.refs.annabelle;
        const l=a.getObjectByName('mixamorig:LeftHand').getWorldPosition(new THREE.Vector3());
        const r=a.getObjectByName('mixamorig:RightHand').getWorldPosition(new THREE.Vector3());
        assert(l.distanceTo(r)>.18,'Annabelle hands cross during dialogue');
      }
      const decideTime=REVEAL_TIMES.annabelle+createStudyRevealTiming().reactions.find(b=>b.id==='decide').t;
      if(Math.abs(elapsed-decideTime)<.026){
        const root=level.refs.annabelle,desired=Math.atan2(CHAIR_EYE[0]-root.position.x,CHAIR_EYE[2]-root.position.z);
        assert(Math.abs(root.rotation.y-desired)<.02,'Annabelle must face Mark for You decide');
        assert.equal(level.refs.hollowOverrideKey.parent,level.refs.annabelle.getObjectByName('mixamorig:RightHand'),'card must remain offered in hand at You decide');
      }
      if(cancelAt===null&&elapsed>=REVEAL_TIMES.turn){
        const chair=level.group.getObjectByName('Annabelle_Wingback_Chair');chair.updateMatrixWorld(true);
        const a=level.refs.annabelle,m=level.refs.annabelleMonster;
        const joints=a.visible?[
          ['mixamorig:Hips','mixamorig:Spine2'],['mixamorig:RightArm','mixamorig:RightForeArm'],
          ['mixamorig:RightForeArm','mixamorig:RightHand'],['mixamorig:LeftArm','mixamorig:LeftForeArm'],
          ['mixamorig:LeftForeArm','mixamorig:LeftHand'],['mixamorig:LeftUpLeg','mixamorig:LeftLeg'],
          ['mixamorig:RightUpLeg','mixamorig:RightLeg']
        ].map(pair=>pair.map(name=>a.getObjectByName(name))):[
          ['Hips','Chest'],['Right arm','Right elbow'],['Right elbow','Right wrist'],
          ['Left arm','Left elbow'],['Left elbow','Left wrist'],['Left leg','Left knee'],['Right leg','Right knee']
        ].map(pair=>pair.map(name=>m.getRigBone(name)));
        for(const [from,to] of joints){
          const p=from.getWorldPosition(new THREE.Vector3()),d=to.getWorldPosition(new THREE.Vector3()).sub(p);
          const ray=new THREE.Raycaster(p,d.clone().normalize(),.012,d.length()-.012);
          assert.equal(ray.intersectObject(chair,true).length,0,`${a.visible?'Annabelle':'monster'} ${from.name} crosses chair at ${elapsed.toFixed(2)}s`);
        }
      }
      const card=level.refs.hollowOverrideKey;
      personPositions.push(level.refs.annabelle.position.clone());
      if(level.refs.annabelleMonster.studyWalkSpeed>.1)walkLegs.push({human:level.refs.annabelle.getObjectByName('mixamorig:LeftUpLeg').quaternion.clone(),monster:level.refs.annabelleMonster.getRigBone('Left leg').quaternion.clone()});
      if(card.visible){
        const previous=cardPositions.at(-1);
        cardPositions.push({t:elapsed,p:card.getWorldPosition(new THREE.Vector3()),held:card.parent?.isBone});
        if(cancelAt===null&&card.parent?.isBone){
          const chair=level.group.getObjectByName('Annabelle_Wingback_Chair');chair.updateMatrixWorld(true);
          const wrist=level.refs.annabelle.getObjectByName('mixamorig:RightHand').getWorldPosition(new THREE.Vector3());
          const elbow=level.refs.annabelle.getObjectByName('mixamorig:RightForeArm').getWorldPosition(new THREE.Vector3());
          const delta=wrist.clone().sub(elbow),ray=new THREE.Raycaster(elbow,delta.clone().normalize(),.01,delta.length());
          const hits=ray.intersectObject(chair,true);
          assert.equal(hits.length,0,`offering forearm crosses chair at ${elapsed.toFixed(2)}s`);
          if(previous){const d=card.getWorldPosition(new THREE.Vector3()).sub(previous.p);if(d.length()>.0001){const r=new THREE.Raycaster(previous.p,d.clone().normalize(),.001,d.length());assert.equal(r.intersectObject(chair,true).length,0,`carried card crosses chair at ${elapsed.toFixed(2)}s`);}}
        }
      }
      assert(!document.body.classList.contains('cutscene-letterbox'));
      assert(!(creature.visible && level.refs.annabelle.visible));
      sawCreature ||= creature.visible; sawHuman ||= level.refs.annabelle.visible;
      sawCard ||= level.refs.hollowOverrideKey.visible;
      assert.equal(endings.length, 0);
      assert(elapsed < REVEAL_DURATION+1, 'scene did not hand back');
      if(elapsed<REVEAL_TIMES.annabelle+REVEAL_DIALOGUE.find(b=>b.id==='override').t-.01) assert(!level.refs.hollowOverrideKey.visible,'card appeared before the handoff');
    }
    await promise; await Promise.resolve();
    assert(player.movementEnabled && player.lookEnabled && interaction.enabled && !player.cinematic && player.isLocked);
    assert(!document.body.classList.contains('study-reveal'));
    assert(!creature.visible);
    if (cancelAt === null) {
      assert(sawCreature && sawHuman && sawCard); assert.equal(completed, 1);
      assert(level.refs.puzzle.mirrorRevealed && level.refs.annabelle.visible && gameState.visorWorn);
      const humanBounds = new THREE.Box3().setFromObject(level.refs.annabelle);
      assert(humanBounds.min.y > -0.001 && humanBounds.max.y < 1.9);
      const head=level.refs.annabelle.getObjectByName('mixamorig:Head');
      assert(head);const headBefore=head.getWorldPosition(new THREE.Vector3());level.update(.1);
      assert(head.getWorldPosition(new THREE.Vector3()).distanceTo(headBefore)>.0001,'Annabelle idle is frozen');
      const monster=level.refs.annabelleMonster;
      const scale=monster.refs.root.scale;assert.equal(scale.x,scale.y);assert.equal(scale.y,scale.z);
      assert(monster.crouch<.001,'corner monster still crouches');
      let restrainedMorph=false;monster.group.traverse(m=>{if(m.morphTargetInfluences?.some(v=>Math.abs(v-.2)<.001))restrainedMorph=true;});
      assert(restrainedMorph,'chair monster still uses extreme full deformation');
      for(const side of ['Left','Right']){
        const upper=monster.getRigBone(side+' leg').getWorldPosition(new THREE.Vector3());
        const knee=monster.getRigBone(side+' knee').getWorldPosition(new THREE.Vector3());
        const ankle=monster.getRigBone(side+' ankle').getWorldPosition(new THREE.Vector3());
        assert(knee.clone().sub(upper).angleTo(ankle.sub(knee))<.4,'monster knees excessively bent');
      }
      assert.deepEqual(level.refs.annabelle.scale.toArray(),[1.1,1.1,1.1]);
      const humanHead=head.getWorldPosition(new THREE.Vector3());
      const monsterHead=monster.refs.head.getWorldPosition(new THREE.Vector3());
      const torso=monster.refs.chest.getWorldPosition(new THREE.Vector3()).sub(monster.refs.hips.getWorldPosition(new THREE.Vector3()));
      assert(Math.atan2(Math.hypot(torso.x,torso.z),torso.y)<Math.PI/7,'monster torso folded forward');
      const humanHand=level.refs.annabelle.getObjectByName('mixamorig:RightHand').getWorldPosition(new THREE.Vector3());
      const monsterHand=monster.refs.hands.r.getWorldPosition(new THREE.Vector3());
      console.log(`Injured alignment: head separation ${humanHead.distanceTo(monsterHead).toFixed(3)}m; corresponding offering hand ${humanHand.distanceTo(monsterHand).toFixed(3)}m.`);
      assert(humanHead.distanceTo(monsterHead)<.10,'perception head alignment');
      assert(humanHand.distanceTo(monsterHand)<.04,'corresponding offering hand alignment');
      const humanTorso=level.refs.annabelle.getObjectByName('mixamorig:Spine2').getWorldPosition(new THREE.Vector3());
      const monsterTorso=monster.refs.chest.getWorldPosition(new THREE.Vector3());
      monster.group.updateMatrixWorld(true);monster.group.traverse(m=>{if(m.isSkinnedMesh)m.computeBoundingBox();});
      const monsterBounds=new THREE.Box3().setFromObject(monster.group);
      console.log(`Fitted uniform scale ${scale.x.toFixed(3)}; torso separation ${humanTorso.distanceTo(monsterTorso).toFixed(3)}m; monster height ${monsterBounds.getSize(new THREE.Vector3()).y.toFixed(3)}m.`);
      assert(monsterBounds.getSize(new THREE.Vector3()).y>1.64,'monster is undersized');
      assert(Math.abs(monsterBounds.min.y)<.003,'actual monster mesh is below/above floor');
      assert(humanTorso.distanceTo(monsterTorso)<.10,'perception torso alignment');
      assert(cardPositions.length>15);
      const first=cardPositions[0],last=cardPositions.at(-1);
      const chair=level.group.getObjectByName('Annabelle_Wingback_Chair');chair.updateMatrixWorld(true);
      assert(chair.worldToLocal(personStart.clone()).z<-.65,'Annabelle must begin behind chair');
      assert(chair.worldToLocal(level.refs.annabelle.position.clone()).z<-.65,'offer moved Annabelle in front of chair');
      assert(level.refs.hollowOverrideKey.children.every(m=>m.material.side===THREE.DoubleSide),'card back can disappear');
      assert.equal(level.refs.hollowOverrideKey.parent,level.refs.annabelle.getObjectByName('mixamorig:RightHand'),'offered card detached from hand');
      assert(cardPositions.every(p=>p.held),'card ever left a hand');
      assert(first.p.distanceTo(last.p)>.10,'missing visible extension of offered card');
      const shift=level.refs.annabelle.position.distanceTo(personStart);
      assert(shift>.65&&shift<.90,'Annabelle must walk out from corner to the former standing spot');
      assert(walkLegs.length>10&&walkLegs.some(p=>p.human.angleTo(walkLegs[0].human)>.03)&&walkLegs.some(p=>p.monster.angleTo(walkLegs[0].monster)>.03),'walk-out slides without active legs');
      const personFinal=level.refs.annabelle.position.clone();
      const leftHand=level.refs.annabelle.getObjectByName('mixamorig:LeftHand').getWorldPosition(new THREE.Vector3());
      assert(leftHand.distanceTo(humanHand)>.20,'hands intersect');
      assert(last.p.distanceTo(humanHand)<.15,'offered card floats away from hand');
      const offeredPickup=level.interactables.find(h=>h.userData.interact.label==='Take the PROJECT HOLLOW ACCESS KEYCARD');
      assert(offeredPickup&&offeredPickup.position.distanceTo(last.p)<.08,'pickup hotspot is not at offered card');
      assert(last.p.y>.85&&last.p.y<1.3,'card should be held at a readable offering height');
      const indexGrip=level.refs.annabelle.getObjectByName('mixamorig:RightHandIndex3').getWorldPosition(new THREE.Vector3());
      const thumbGrip=level.refs.annabelle.getObjectByName('mixamorig:RightHandThumb4').getWorldPosition(new THREE.Vector3());
      assert(indexGrip.distanceTo(thumbGrip)<.035,'thumb does not pinch card corner');
      const cardCorner=level.refs.hollowOverrideKey.localToWorld(new THREE.Vector3(-.035/1.12,-.022/1.12,0));
      assert(indexGrip.distanceTo(cardCorner)<.012,'card corner floats away from index grip');
      console.log(`Offered card height ${last.p.y.toFixed(3)}m; forward shift ${shift.toFixed(3)}m; hand separation ${leftHand.distanceTo(humanHand).toFixed(3)}m.`);
      // Authored chair UVs survive the reveal material setup without wood reprojection.
      const chairMeshes=[];chair.traverse(m=>{if(m.isMesh)chairMeshes.push(m);});
      const original=[];chairSource.traverse(m=>{if(m.isMesh)original.push(m);});
      assert.equal(chairMeshes.length,2,'chair duplicated');
      chairMeshes.forEach((m,i)=>{
        assert.deepEqual(Array.from(m.geometry.attributes.uv.array),Array.from(original[i].geometry.attributes.uv.array));
        assert.equal(m.material.side,THREE.FrontSide);assert(m.material.depthWrite&&m.material.depthTest&&!m.material.transparent);
      });
      assert.equal(spoken.length, 3+REVEAL_DIALOGUE.length);
      for(const on of [false,true,false,true,false,true]){gameState.visorWorn=on;level.refs.setCorrectedSight(on);assert.equal(mirrorIdentity,on);assert.equal(level.refs.annabelle.visible,on);assert.equal(level.refs.annabelleMonster.visible,!on);level.update(.02);assert.equal(level.refs.annabelle.visible,on);assert.equal(level.refs.annabelleMonster.visible,!on);
        assert(level.refs.annabelle.position.distanceTo(personFinal)<.001,'Annabelle reset after handoff');
        assert(level.refs.annabelleMonster.refs.root.position.clone().setY(0).distanceTo(personFinal)<.12,'monster jumped back behind chair');
        assert(head.getWorldPosition(new THREE.Vector3()).distanceTo(monster.refs.head.getWorldPosition(new THREE.Vector3()))<.10,'post-swap head alignment drifted');
        monster.group.updateMatrixWorld(true);let floor=Infinity;const feet=[Infinity,Infinity];
        for(const {mesh,index} of monster.studySoles){const p=mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,p.y);const side=mesh.geometry.attributes.position.getX(index)>0?0:1;feet[side]=Math.min(feet[side],p.y);}
        assert(Math.abs(floor)<.003,'monster soles sink or float after visor toggle');assert(feet.every(y=>Math.abs(y)<.012),'one monster foot floats');
        assert(level.refs.hollowOverrideKey.visible,'offered card vanished on toggle');
        assert(level.refs.hollowOverrideKey.getWorldPosition(new THREE.Vector3()).distanceTo(offeredPickup.position)<.08,'handoff prompt drifted after toggle');}
      assert.equal(level.refs.puzzle.endingChoice,'NONE');
      assert.deepEqual(spoken.slice(3).map(line=>line.text),REVEAL_DIALOGUE.map(b=>`${b.speaker}: ${b.text}`));
      assert(REVEAL_DIALOGUE.every((b,i)=>!i||b.t>=REVEAL_DIALOGUE[i-1].t+REVEAL_DIALOGUE[i-1].hold+REVEAL_DIALOGUE[i-1].gap-.001));
      assert(spoken.every(line => line.always));
      assert.deepEqual(camera.position.toArray(), CHAIR_EYE);
      const pickup = level.interactables.find(h => h.userData.interact.label === 'Take the PROJECT HOLLOW ACCESS KEYCARD');
      const prompt={style:{},textContent:''},handoffCamera=camera.clone();
      handoffCamera.lookAt(pickup.position);handoffCamera.updateMatrixWorld(true);level.group.updateMatrixWorld(true);
      const beforeWindow=globalThis.window;globalThis.window={addEventListener(){}};
      const handoffInteraction=new Interaction(handoffCamera,prompt,{say(){}});globalThis.window=beforeWindow;
      handoffInteraction.setTargets([pickup]);handoffInteraction.update();assert.equal(handoffInteraction.current,pickup,'offered card cannot be targeted from reveal end');

      pickup.userData.interact.onInteract(); pickup.userData.interact.onInteract();
      assert.equal(picked.filter(id => id === 'hollowOverrideKey').length, 1);
      for(const on of [false,true]){gameState.visorWorn=on;level.refs.setCorrectedSight(on);level.update(.02);assert(!level.refs.hollowOverrideKey.visible&&!level.interactables.includes(pickup),'taken card reappeared');}
      const heldHeight=level.refs.annabelle.getObjectByName('mixamorig:RightHand').getWorldPosition(new THREE.Vector3()).y;
      for(let i=0;i<7;i++)level.update(.1);
      assert(level.refs.annabelle.getObjectByName('mixamorig:RightHand').getWorldPosition(new THREE.Vector3()).y<heldHeight-.05,'empty hand failed to lower after pickup');
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
    assert(Math.abs(new THREE.Box3().setFromObject(level.refs.annabelle).getSize(new THREE.Vector3()).y - 1.705) < 0.01);
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
  console.log(`PASS: ${fullDuration.toFixed(2)}s reveal; one-shot letter close; collision-clear stairs route; 1024x2048 stable projective planar reflection; side/stair/pitch world-plane math; grazing/back-side retained frame; exclusive creature/Annabelle swap; uniform fitted monster scale; natural Annabelle scale; upright injured torso; corresponding offering hand/head alignment; actual mesh height/reset; timed dialogue/pauses; held-out card handoff/pickup/endings; seven cancellation points; control restoration.`);
  console.log('Headless geometry/state/GPU-call validation. Browser-rendered appearance and pointer-lock permission were not exercised.');
} finally {
  fs.rmSync(bundlePath, { force: true });
  delete globalThis.__studyTestModel;
}

