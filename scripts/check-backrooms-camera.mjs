import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {parseAst} from 'rollup/parseAst';
import {BOX} from '../src/levels/backroomsMaze.js';
import {constrainThirdPersonCamera} from '../src/core/thirdPersonCamera.js';
const source=fs.readFileSync('src/levels/backroomsLevel.js','utf8');
let bounds;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='Property'&&node.key.name==='cameraColliders')bounds=node.value;for(const v of Object.values(node))if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}
walk(parseAst(source));assert(bounds);
const height=Number(source.match(/const HALL_H = ([\d.]+)/)[1]);
const boxes=new Function('BOX_MIN_X','BOX_MAX_X','BOX_MIN_Z','BOX_MAX_Z','HALL_H','return '+source.slice(bounds.start,bounds.end))(BOX.minX,BOX.maxX,BOX.minZ,BOX.maxZ,height);
const out=new THREE.Vector3();
// Standing, crouching and jumping: sweep the complete camera pitch range.
for(const y of [.9,1.6,2.2])for(let pitch=-89;pitch<=89;pitch++){
 const eye=new THREE.Vector3((BOX.minX+BOX.maxX)/2,y,(BOX.minZ+BOX.maxZ)/2);
 const want=eye.clone().add(new THREE.Vector3(0,Math.sin(pitch*Math.PI/180)*3+.3,Math.cos(pitch*Math.PI/180)*3));
 constrainThirdPersonCamera(eye,want,boxes,out);
 assert(out.y>=.099&&out.y<=height-.099,`camera escaped at eye ${y}, pitch ${pitch}: ${out.y}`);
}
const eye=new THREE.Vector3(0,1.6,0),want=new THREE.Vector3(0,1.9,1);
constrainThirdPersonCamera(eye,want,boxes,out);assert(out.equals(want),'clear shoulder view changed');
constrainThirdPersonCamera(eye,new THREE.Vector3(0,3,2),boxes,want);assert(want.y<height-.1,'in-place camera crossed ceiling');
console.log('PASS: actual Backrooms camera-only slabs contain standing/crouching/jumping pitch sweeps; clear view and in-place boom remain correct.');
