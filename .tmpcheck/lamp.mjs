import { junctions, nameNoise, spawnPoint, exitPoint, ROUTE, routeLength, junctionPoint, CORRIDORS } from '../src/levels/backroomsMaze.js';
const js = junctions();
let lit=0;
const pts=[];
js.forEach((j,i)=>{
  const isLit = j.onRoute ? i%2===0 : nameNoise(j.name)<0.34;
  if(isLit){lit++;pts.push({x:j.x,z:j.z,name:j.name,onRoute:j.onRoute,mode:['steady','flicker','steady','dying'][Math.floor(nameNoise(j.name,7)*4)]});}
});
console.log('junctions total', js.length, 'lit', lit, 'dark', js.length-lit);
const modes={};pts.forEach(p=>modes[p.mode]=(modes[p.mode]||0)+1);
console.log('lit fixture modes', modes);
const sp=spawnPoint(), ex=exitPoint();
pts.push({x:sp.x,z:sp.z+0.4,name:'spawn',mode:'dying'});
pts.push({x:ex.x,z:ex.z+ex.nz*1.2,name:'exit',mode:'steady'});
console.log('total live fixtures', pts.length, 'corridors', CORRIDORS.length, 'route length m', routeLength().toFixed(1));
const path=[{x:sp.x,z:sp.z}];
for(const n of ROUTE){const p=junctionPoint(n); if(p) path.push({x:p.x,z:p.z});}
path.push({x:ex.x,z:ex.z});
const buckets=[2,3,5,6.5];
let tot=0; const within=[0,0,0,0]; const withinSteady=[0,0,0,0];
const steady=pts.filter(p=>p.mode==='steady');
for(let s=0;s<path.length-1;s++){
  const a=path[s],b=path[s+1];const L=Math.hypot(b.x-a.x,b.z-a.z); if(!L) continue;
  for(let t=0;t<L;t+=0.25){
    const x=a.x+(b.x-a.x)*t/L, z=a.z+(b.z-a.z)*t/L;
    let d=1e9;for(const p of pts) d=Math.min(d,Math.hypot(x-p.x,z-p.z));
    let ds=1e9;for(const p of steady) ds=Math.min(ds,Math.hypot(x-p.x,z-p.z));
    tot++;buckets.forEach((bk,k)=>{if(d<=bk)within[k]++; if(ds<=bk)withinSteady[k]++;});
  }
}
console.log('route samples',tot, 'path pts', path.length);
buckets.forEach((bk,k)=>console.log(`  within ${bk} m of ANY lit fixture: ${(100*within[k]/tot).toFixed(1)}%   | of a STEADY one: ${(100*withinSteady[k]/tot).toFixed(1)}%`));
