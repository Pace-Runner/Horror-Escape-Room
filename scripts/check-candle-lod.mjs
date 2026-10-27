import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCandleFlames } from '../src/world/CandleFlames.js';

function fixture(xs,lightCount=2){
  const parent=new THREE.Group();
  const candles=createCandleFlames({parent,capacity:8,lightCount,steadyLight:true,
    lightDistanceFade:{full:4,off:7,handoverSeconds:1.1}});
  for(const x of xs){const anchor=new THREE.Object3D();anchor.position.set(x,1.7,0);parent.add(anchor);
    candles.add(anchor,{light:{intensity:1,distance:2.6},draft:0});}
  return {parent,candles};
}
function settled(distance){
  const {candles}=fixture([0],1),eye=new THREE.Vector3(distance,1.7,0);
  for(let i=0;i<150;i++)candles.update(1/60,{playerPosition:eye});
  assert(candles.meshes.every(mesh=>mesh.count===1),'distance hid a flame or halo');
  const value=candles.lights[0].intensity;candles.dispose();return value;
}
const full=settled(3);
assert(full>.9);assert(Math.abs(settled(4)-full)<1e-6);
assert(Math.abs(settled(5.5)/full-.5)<1e-6);
assert(settled(6.9)/full<.004);assert.equal(settled(7),0);assert.equal(settled(9),0);
assert(settled(4.01)/full>.999,'hard boundary at full distance');

const {parent,candles}=fixture([0,2,10]);
const ids=candles.lights.map(light=>light.uuid),eye=new THREE.Vector3(0,1.7,0);
for(let i=0;i<150;i++)candles.update(1/60,{playerPosition:eye});
let maximumDelta=0;
for(const direction of [1,-1])for(let frame=1;frame<=600;frame++){
  eye.x=direction===1?frame/60:10-frame/60;
  const before=candles.lights.map(light=>({intensity:light.intensity,position:light.position.clone()}));
  candles.update(1/60,{playerPosition:eye});
  assert(candles.meshes.every(mesh=>mesh.count===3),'handover hid visual flames or halos');
  assert.deepEqual(candles.lights.map(light=>light.uuid),ids,'light instances replaced');
  assert(candles.lights.every(light=>!light.castShadow));
  assert.equal(parent.children.filter(object=>object.isPointLight).length,2);
  candles.lights.forEach((light,i)=>{
    maximumDelta=Math.max(maximumDelta,Math.abs(light.intensity-before[i].intensity));
    if(light.position.distanceTo(before[i].position)>1)assert(light.intensity<.002,'lit source jumped between sconces');
  });
}
assert(maximumDelta<.035,`visible handover intensity step: ${maximumDelta}`);
candles.dispose();
console.log(`PASS: 7m–4m smoothstep fade both directions; full inside 4m; zero beyond 7m; flames/halos stay visible; two reused shadowless lights; eased dark handovers; max 60Hz intensity step ${maximumDelta.toFixed(4)}. No browser launched.`);
