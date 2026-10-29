import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {constrainThirdPersonCamera} from '../src/core/thirdPersonCamera.js';
import {createKeptBedroomBeat} from '../src/cutscenes/keptBedroom.js';
import {ACHIEVEMENTS} from '../src/core/achievements.js';

const out=new THREE.Vector3();
const eye=new THREE.Vector3(0,4.7,0),desired=new THREE.Vector3(0,5,2);
const low={minX:-1,maxX:1,minZ:.5,maxZ:1.5,minY:0,maxY:2};
constrainThirdPersonCamera(eye,desired,[low],out);
assert(out.equals(desired),'downstairs prop pins upstairs camera');
constrainThirdPersonCamera(new THREE.Vector3(0,1.6,0),new THREE.Vector3(0,1.9,2),[low],out);
assert(out.z<.5,'camera passes through furniture on its own floor');
for(const height of [0,.6,1.4,2.4,3.1]){
  const head=new THREE.Vector3(0,height+1.6,0),want=head.clone().add(new THREE.Vector3(0,.3,2));
  constrainThirdPersonCamera(head,want,[],out);assert(out.y>height+1.6,'camera fails to follow stair height');
}
const loft={minX:-5,maxX:5,minZ:-5,maxZ:5,minY:2.82,maxY:3.1};
constrainThirdPersonCamera(new THREE.Vector3(0,1.6,0),new THREE.Vector3(0,4,2),[loft],out);
assert(out.y<2.82,'camera crosses loft from below');
constrainThirdPersonCamera(eye,new THREE.Vector3(0,2,2),[loft],out);
assert(out.y>3.1,'camera crosses loft from above');
const wall={minX:-5,maxX:5,minZ:.5,maxZ:1};
constrainThirdPersonCamera(eye,desired,[wall],out);assert(out.z<.5);
constrainThirdPersonCamera(eye,desired,[wall],desired);assert(desired.equals(out),'in-place output changes collision result');

let updates=0,steps=0,correction=null;
const monster={refs:{root:new THREE.Group()},setPosition(){},setYaw(){},setSpeed(){},
  setCorrection(v){correction=v;},update(){updates++;},offsetBones(){}};
const beat=createKeptBedroomBeat({her:monster,bed:[0,-1]});
for(let t=0;t<beat.duration;t+=1/60)beat.frame(t,1/60,new THREE.Vector3(0,1.6,-1),()=>steps++);
assert.equal(correction,0);assert(updates>100&&steps>0,'monster failure beat fails to animate');
assert.equal(beat.frame(beat.duration,1/60,eye,()=>{}),false);
const main=fs.readFileSync('src/main.js','utf8');
const shots=main.slice(main.indexOf('const KEPT_SHOTS'),main.indexOf('const KEPT_DRAG_BREATHING'));
assert.equal((shots.match(/by: 'monster'/g)||[]).length,4);
assert(!shots.includes("by: 'annabelle'"));
assert(main.includes("const her = keptDragger('monster')"));
assert(main.includes('playerBody.position.y = player.groundY + player.jumpHeight'));
assert(!main.includes("kept: 'She"));
assert(!fs.readFileSync('src/dialogue/endings.js','utf8').includes('She brought'));
assert.equal(ACHIEVEMENTS.find(a=>a.id==='clock').title,'Tick Tock');
console.log('PASS: height-aware third-person walls/props/stairs/loft; grounded body; monster-only failure shots and bedroom gait; neutral failure text; Tick Tock title.');
