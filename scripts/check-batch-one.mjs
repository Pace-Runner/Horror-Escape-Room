import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {PointerLockPlayer} from '../src/core/PointerLockPlayer.js';
import {Interaction} from '../src/core/Interaction.js';
import {HOUSE_PHOTOGRAPH} from '../src/story/housePhotograph.js';
import {HALLWAY} from '../src/story/hallway.js';
import {createDoorSoffitGeometry,createDecalOrdering} from '../src/world/backroomsSurfaces.js';
import {createLeftTorch} from '../src/core/LeftTorch.js';

assert.equal(HALLWAY.house.body,HOUSE_PHOTOGRAPH.body);
assert.equal(HALLWAY.house.plaque,HOUSE_PHOTOGRAPH.plaque);
assert.match(HOUSE_PHOTOGRAPH.body,/forty years/);
const main=fs.readFileSync('src/main.js','utf8').replace(/\r\n/g,'\n');
const bedroom=fs.readFileSync('src/levels/bedroomLevel.js','utf8');
assert(bedroom.includes('onInteract: () => showCaption(HOUSE_PHOTOGRAPH.body)'));
const floor=main.slice(main.indexOf('  onFloorboardOpened:'),main.indexOf('  onDoorPlankRemoved:'));
assert(!floor.includes('playDoorPass'));assert(floor.includes('audio.footsteps')&&floor.includes('rattleDoor'));

globalThis.window=new EventTarget();globalThis.document=new EventTarget();
const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);
const player=new PointerLockPlayer(camera,{ownerDocument:document});
player.controls.isLocked=true;
player.spawn(3,4,.41,-.32);player.crouch=.7;player.moving=.5;player.update(.016);
const pos=camera.position.clone(),quat=camera.quaternion.clone(),fov=camera.fov;
const release=player.holdInspectionView();player.controls.isLocked=false;
for(let i=0;i<100;i++)player.update(.016);
assert(camera.position.equals(pos));assert(camera.quaternion.equals(quat));assert.equal(camera.fov,fov);
camera.position.set(99,99,99);camera.rotation.set(1,2,3);release();
assert(camera.position.equals(pos));assert(camera.quaternion.equals(quat));assert.equal(player.yaw,.41);
const discard=player.holdInspectionView();camera.position.set(9,9,9);discard(false);assert.equal(camera.position.x,9);assert.equal(player.inspectionHeld,false);
player.controls.dispose();

// The passage cinematic shakes the real carried torch, not an empty-hand clip.
const torchCamera=new THREE.PerspectiveCamera();
const makeTorch=()=>createLeftTorch({camera:torchCamera,itemMeshes:{build:()=>new THREE.Group()}});
const calm=makeTorch(),nervous=makeTorch();
calm.setCarried(true,{animate:false});nervous.setCarried(true,{animate:false});
const motion={speed:0,bobPhase:0,lookDeltaX:0,lookDeltaY:0};
for(let i=0;i<30;i++){calm.update(.016,motion,true);nervous.update(.016,{...motion,torchShake:1},true);}
assert(!calm.group.quaternion.equals(nervous.group.quaternion));
assert(calm.group.position.distanceTo(nervous.group.position)<.02,'nervous shake should stay subtle');
nervous.reset();assert.equal(nervous.group.visible,false);

const interaction=new Interaction(camera,{style:{}},{});let picked=0,unlocked=0;
const flags={locked:true,cinematic:false,key:'bedroom',escaped:false,selected:'paperclip'};
const override=main.slice(main.indexOf('interaction.beforeInteract = () => {'),main.indexOf('// ---------- contextual H-key hints'));
const overrideBody=override.match(/interaction.beforeInteract = \(\) => \{([\s\S]*?)\n\};/)[1];
interaction.beforeInteract=new Function('player','cutscene','sceneManager','bedroom','heldItems',overrideBody).bind(null,
  {get isLocked(){return flags.locked;},get cinematic(){return flags.cinematic;}},{isRunning:false},
  {get activeKey(){return flags.key;}},{refs:{puzzleState:{get chainsEscaped(){return flags.escaped;}},unlockCuff(){unlocked++;}}},
  {get selected(){return flags.selected;}});
interaction.current=null;interaction.interact();assert.equal(unlocked,1,'held clip must work without a ray target');
interaction.current={userData:{interact:{onInteract(){picked++;}}}};
for(const change of [{key:'study'},{escaped:true},{selected:'crowbar'},{locked:false},{cinematic:true}]){
  Object.assign(flags,{locked:true,cinematic:false,key:'bedroom',escaped:false,selected:'paperclip'},change);
  const before=unlocked;interaction.interact();assert.equal(unlocked,before);
}
assert.equal(picked,5);interaction.setEnabled(false);interaction.interact();assert.equal(picked,5);

// Exercise the actual transition cleanup after recovering a dropped puzzle item.
const inventory=new Set(['flashlight','crowbar','bedroomKey','photo1984']);
const dropped=new Map([['key',{levelKey:'bedroom',id:'brassKey'}],['other',{levelKey:'study',id:'book'}]]);
const cleanupBody=main.match(/if \(previousKey === 'bedroom' && key !== 'bedroom'\) \{([\s\S]*?)\n  \}/)[1];
const cleanup=new Function('gameState','consumeItem','droppedItems','removeDroppedProp',cleanupBody);
cleanup({inventory},id=>inventory.delete(id),dropped,id=>dropped.delete(id));
assert.deepEqual([...inventory],['flashlight']);assert.deepEqual([...dropped.keys()],['other']);

for(const axis of ['x','z']){
  const geometry=createDoorSoffitGeometry(axis,1.4,1.6,.3);geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  assert(Math.abs(size.x-(axis==='z'?1.4:1.6))<1e-6);assert(Math.abs(size.z-(axis==='z'?1.6:1.4))<1e-6);
  assert.equal(geometry.index.count,18);
  const normals=geometry.attributes.normal;
  for(const index of geometry.index.array){assert(normals.getY(index)<=0,'soffit duplicates ceiling');assert.equal(axis==='z'?normals.getX(index):normals.getZ(index),0,'soffit duplicates side wall');}
  geometry.dispose();
}
const order=createDecalOrdering();const a={},b={},pool={};order(a,100);order(b,100);order(pool,300);
assert(a.renderOrder<b.renderOrder&&b.renderOrder<pool.renderOrder);
const hallway=fs.readFileSync('src/levels/upstairsHallwayLevel.js','utf8');
assert(hallway.includes('inspect(HALLWAY.mirror, art.mirror.colour)'));
assert(hallway.includes('inspect(HALLWAY.blueprint, art.blueprint, true)'));
assert(main.includes('if (!fullscreen) { showCaption(body); return; }'));
assert(main.includes('inspectionView?.(false);'));
console.log('PASS: shared house caption; sound-only floorboard scare; no-aim held-clip unlock with level/state gates; flashlight-only bedroom exit; exact inspection camera hold/restore; unchanged soffit envelope without duplicate faces; stable decal layering; in-world hallway observations.');
