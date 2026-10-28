import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {PointerLockPlayer} from '../src/core/PointerLockPlayer.js';

const main=fs.readFileSync('src/main.js','utf8');
const bounds=new Function('return '+main.match(/const BEDROOM_RESTRAINED_LOOK_BOUNDS = Object.freeze\((\{[\s\S]*?\})\);/)[1])();
globalThis.window=new EventTarget();globalThis.document=new EventTarget();
const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);
const player=new PointerLockPlayer(camera,{ownerDocument:document});
player.controls.isLocked=true;player.movementEnabled=false;
function sweep(dx){
  const event=new Event('pointermove');Object.defineProperties(event,{movementX:{value:dx},movementY:{value:0}});
  document.dispatchEvent(event);for(let i=0;i<90;i++)player.update(1/60);
}
for(let run=0;run<2;run++){
  player.setLookBounds(bounds);player.spawn(1.65,-1.4,.5,-.3);
  sweep(30000);assert.equal(player.yaw,bounds.minYaw);
  sweep(-30000);assert.equal(player.yaw,bounds.maxYaw);
  assert(bounds.minYaw>-Math.PI/2&&bounds.maxYaw<Math.PI/2,'chained player can turn behind the bed');
  // The paperclip stays reachable; the cuff no longer requires aiming to unlock.
  for(const target of [[1.636,.75,-2.33]]){
    const dx=target[0]-1.65,dz=target[2]+1.4;
    const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(target[1]-1.6,Math.hypot(dx,dz));
    player.aim(yaw,pitch);assert(Math.abs(player.yaw-yaw)<1e-8);assert(Math.abs(player.pitch-pitch)<1e-8);
  }
  assert(bounds.minYaw>=-.3,'right turn exposes the fixed chain/hand gap');
  player.setLookBounds(null);sweep(-30000);assert(player.yaw>Math.PI,'freed player remains restrained');
}
const activate=main.slice(main.indexOf('function activateLevel('),main.indexOf('// ---------- level transitions'));
assert(activate.indexOf('player.setLookBounds(isBedroomRestraintActive')>activate.indexOf('stopStudyHideAndSeek();'),'old hiding-spot cleanup can clear new bedroom bounds');
const freed=main.slice(main.indexOf('  onFreed: () => {'),main.indexOf('    consumeItem(\'paperclip\');'));
assert(freed.includes('player.setLookBounds(null)'));
player.controls.dispose();
console.log('PASS: chained mouse sweeps stop at both sides with tighter right arc; paperclip stays reachable; freeing restores full rotation; restart reapplies bounds after old-room cleanup.');
