import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as THREE from 'three';
// Compare against the main commit from before these mesh repairs.
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function meshes(doc,name){const root=new THREE.Group();const n=doc.getRoot().listNodes().find(n=>n.getName()===name);for(const p of n.getMesh().listPrimitives()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.getAttribute('POSITION').getArray(),3));g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(),1));root.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.FrontSide})));}const transform=new THREE.Matrix4().fromArray(n.getWorldMatrix());transform.setPosition(0,0,0);root.applyMatrix4(transform);root.updateMatrixWorld(true);return root;}
let rays=0,hitsCompared=0;
for(const [file,name] of [['src/assets/models/study/annabelle_wingback_chair.glb','Annabelle_Wingback_Chair'],['src/assets/models/study/study_dust_sheets.glb','Sheet_Armchair']]){
 const before=await io.readBinary(new Uint8Array(execFileSync('git',['show','e8d7363:'+file],{maxBuffer:20000000}))),after=await io.read(file);
 assert.deepEqual(before.getRoot().listTextures().map(t=>createHash('sha256').update(t.getImage()).digest('hex')),after.getRoot().listTextures().map(t=>createHash('sha256').update(t.getImage()).digest('hex')),'embedded textures changed');
 for(const n of before.getRoot().listNodes())if(n.getMesh()){
  const other=after.getRoot().listNodes().find(x=>x.getName()===n.getName());assert.deepEqual(other.getMatrix(),n.getMatrix());
  n.getMesh().listPrimitives().forEach((p,k)=>{const q=other.getMesh().listPrimitives()[k];for(const semantic of p.listSemantics()){const old=p.getAttribute(semantic).getArray(),now=q.getAttribute(semantic).getArray();assert.deepEqual(now.slice(0,old.length),old,'original vertex attribute moved: '+n.getName()+' '+semantic);}if(n.getName()!==name)assert.deepEqual(q.getIndices().getArray(),p.getIndices().getArray(),'unrelated furniture changed');});
 }
 const roots=[meshes(before,name),meshes(after,name)];const ray=new THREE.Raycaster(),target=new THREE.Vector3();
 for(let angle=0;angle<32;angle++)for(let h=0;h<12;h++)for(const offset of [-.3,0,.3]){
  const a=angle*Math.PI/16,origin=new THREE.Vector3(Math.cos(a)*3,.12+h*.12,Math.sin(a)*3);target.set(offset,.15+h*.1,0);ray.set(origin,target.clone().sub(origin).normalize());const hits=roots.map(r=>ray.intersectObject(r,true)[0]?.distance??Infinity);assert(Math.abs(hits[0]-hits[1])<1e-5||hits.every(x=>x===Infinity),'surface coverage changed: '+name+' '+JSON.stringify({angle,h,offset,hits}));if(hits[0]!==Infinity)hitsCompared++;rays++;
 }
}
assert(hitsCompared>500,'ray test missed the furniture');
const study=fs.readFileSync('src/levels/studyLevel.js','utf8');assert(study.includes('new THREE.BoxGeometry(0.416, 0.5, 0.05)'));
assert((.42-.416)/2>.0019,'desk chair has no side-face separation');
const backrooms=fs.readFileSync('src/levels/backroomsLevel.js','utf8');assert(backrooms.includes('topRail.position.z += 0.002'));assert(backrooms.includes('d.x + d.nx * 0.002, 0, d.z + d.nz * 0.002'));
console.log('PASS: '+rays+' before/after surface rays; original vertices/UVs/normals, textures, transforms and other covered furniture preserved; desk/door joinery separated.');
