import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {performance} from 'node:perf_hooks';
const proposed=fs.readFileSync(new URL('../src/core/Interaction.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
// Reconstruct the previous implementation for a controlled differential benchmark.
const source=proposed.replace('    this.raycastHits = [];\n','').replaceAll('    this.raycastHits.length = 0;\n','').replace('this.targets, false, this.raycastHits','this.targets, false');
assert(!source.includes('raycastHits'),'benchmark baseline still contains the optimisation');
const load=s=>new Function('THREE','window',s.replace(/import .*?;\r?\n/,'').replace('export class Interaction','class Interaction')+'\nreturn Interaction;')(THREE,{addEventListener(){}});
const classes=[load(source),load(proposed)];
const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();
const material=new THREE.MeshBasicMaterial();const geometry=new THREE.BoxGeometry(.5,.5,.1);
const targets=Array.from({length:100},(_,i)=>{const m=new THREE.Mesh(geometry,material);m.position.set((i%10-5)*.2,(Math.floor(i/10)-5)*.2,-1-(i%3)*.3);m.userData.interact={label:String(i),onInteract(){}};m.updateMatrixWorld();return m;});
const instances=classes.map(C=>{const x=new C(camera,{style:{},textContent:''},{});x.setTargets(targets);return x;});

for(let i=0;i<200;i++){
 camera.position.set(Math.sin(i)*.8,Math.cos(i)*.8,0);camera.updateMatrixWorld();
 targets[i%targets.length].visible=i%3!==0;
 targets[(i+1)%targets.length].userData.interact.priority=i%4;
 targets[(i+2)%targets.length].userData.interact.enabled=i%5!==0;
 for(const x of instances)x.update();
 assert.equal(instances[0].current,instances[1].current);
 assert.deepEqual(instances[0].promptEl,instances[1].promptEl);
}
for(const x of instances){x.setTargets([]);x.update();assert.equal(x.current,null);x.setTargets(targets);x.setEnabled(false);x.update();assert.equal(x.current,null);x.setEnabled(true);}
camera.position.set(0,0,0);camera.updateMatrixWorld();
for(const x of instances)for(let i=0;i<1000;i++)x.update();
const times=[[],[]];for(let repeat=0;repeat<7;repeat++)for(const k of repeat%2?[1,0]:[0,1]){const start=performance.now();for(let i=0;i<4000;i++)instances[k].update();times[k].push(performance.now()-start);}
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
console.log(JSON.stringify({baselineMs:median(times[0]),candidateMs:median(times[1]),updates:4000,targets:100,sameTarget:instances[0].current===instances[1].current,avoidedRaycastArraysPerUpdate:1}));
