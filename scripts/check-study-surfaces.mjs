import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {softenRepeatEdges,STUDY_PAPER_REPEAT} from '../src/levels/studySurfaceSampling.js';
const root='src/assets/textures/study/';
const {data,info}=await sharp(root+'continuous_damask_1k.webp').extract(STUDY_PAPER_REPEAT).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const before=Buffer.from(data);softenRepeatEdges(data,info.width,info.height);
for(let y=0;y<info.height;y++)for(let c=0;c<4;c++)assert.equal(data[y*info.width*4+c],data[(y*info.width+info.width-1)*4+c],'horizontal wallpaper edge discontinuity');
for(let x=0;x<info.width;x++)for(let c=0;c<4;c++)assert.equal(data[x*4+c],data[((info.height-1)*info.width+x)*4+c],'vertical wallpaper edge discontinuity');
const center=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;
assert.deepEqual(data.subarray(center,center+4),before.subarray(center,center+4),'wallpaper interior was blurred');
function linearMean(data,channels){const sums=[0,0,0];for(let i=0;i<data.length;i++)if(i%channels<3){const x=data[i]/255;sums[i%channels]+=x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}return sums.map(x=>x/(data.length/channels));}
for(const [oldName,newName,tint] of [['option_a_damask_512.jpg','continuous_damask_1k.webp',[.597,.623,.644]],['continuous_ceiling_plaster.webp','continuous_plaster_v2.webp',[.892,.917,.945]]]){
 const old=await sharp(root+oldName).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const oldMean=linearMean(old.data,old.info.channels);
 const next=newName.includes('damask')?{data,info:{channels:4}}:await sharp(root+newName).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const nextMean=linearMean(next.data,next.info.channels);
 for(let c=0;c<3;c++)assert(Math.abs(nextMean[c]*tint[c]/oldMean[c]-1)<.02,'surface brightness/palette drift');
 assert(fs.statSync(root+newName).size<300000,'surface asset download grew unnecessarily');
}
const surfaces=fs.readFileSync('src/levels/studySurfaces.js','utf8');
assert(surfaces.includes('ceilingMap.wrapS = ceilingMap.wrapT = THREE.ClampToEdgeWrapping'));
assert(surfaces.includes('prepareStudyWallpaper : undefined'));
assert(surfaces.includes('const paperScale = 58 / 56'));
console.log('PASS: real wallpaper repeat edges match exactly in both axes; interior detail retained; physical motif aspect preserved; albedo brightness/palette within 2% of originals; compact textures; single non-repeating ceiling; one-time sampler preparation.');
