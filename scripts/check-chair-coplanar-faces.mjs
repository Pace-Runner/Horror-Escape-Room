// Remove only positive-area, same-facing coplanar overlaps; retain the surface union.
// UVs/normals are interpolated on the original triangle, not regenerated.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import assert from 'node:assert/strict';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=poly=>Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.xy[0]*q.xy[1]-p.xy[1]*q.xy[0];},0))/2;
function split(poly,a,b,sign){const inside=[],outside=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p.xy)*sign,dq=cross(a,b,q.xy)*sign; (dp>=0?inside:outside).push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq),v={xy:p.xy.map((x,k)=>x+(q.xy[k]-x)*t),w:p.w.map((x,k)=>x+(q.w[k]-x)*t)};inside.push(v);outside.push(v);}}return {inside,outside};}
function subtract(poly,clip){let inside=poly,parts=[];const sign=Math.sign(cross(...clip));for(let i=0;i<3&&inside.length>=3;i++){const r=split(inside,clip[i],clip[(i+1)%3],sign);if(r.outside.length>=3&&area(r.outside)>1e-12)parts.push(r.outside);inside=r.inside;}return {parts,overlap:inside.length>=3?area(inside):0};}
function repair(p,write){
 const attrs=p.listSemantics().map(s=>[s,p.getAttribute(s)]),pos=p.getAttribute('POSITION'),idx=p.getIndices(),indices=Array.from(idx.getArray()),arrays=new Map(attrs.map(([s,a])=>[s,Array.from(a.getArray())]));
 const groups=new Map(),result=[];let changed=0,removedArea=0;
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),v=ids.map(j=>pos.getElement(j,[])),u=v[1].map((x,k)=>x-v[0][k]),w=v[2].map((x,k)=>x-v[0][k]);let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],len=Math.hypot(...n);if(len<1e-12){result.push(...ids);continue;}n=n.map(x=>x/len);const distance=n.reduce((s,x,k)=>s+x*v[0][k],0),axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(k=>k!==axis),tri=v.map(x=>axes.map(k=>x[k])),key=[...n,distance].map(x=>x.toFixed(4)).join(',');
 let pieces=[tri.map((xy,j)=>({xy,w:[0,1,2].map(k=>Number(k===j))}))],clipped=false;
 const previous=groups.get(key)??[];
 for(const old of previous){if(Math.abs(distance-old.distance)>1e-6||n.reduce((s,x,k)=>s+x*old.n[k],0)<1-1e-10)continue;let next=[];for(const poly of pieces){const r=subtract(poly,old.tri);if(r.overlap>1e-7){next.push(...r.parts);clipped=true;removedArea+=r.overlap;}else next.push(poly);}pieces=next;}
 previous.push({tri,n,distance});groups.set(key,previous);
 if(!clipped){result.push(...ids);continue;}changed++;
 if(write)for(const poly of pieces){const vertices=poly.map(point=>{const id=arrays.get('POSITION').length/3;for(const [semantic,a]of attrs){const values=Array.from({length:a.getElementSize()},(_,k)=>point.w.reduce((s,weight,j)=>s+weight*a.getElement(ids[j],[])[k],0));if(semantic==='NORMAL'){const norm=Math.hypot(...values);if(norm)for(let k=0;k<3;k++)values[k]/=norm;}arrays.get(semantic).push(...values);}return id;});for(let j=1;j<vertices.length-1;j++)result.push(vertices[0],vertices[j],vertices[j+1]);}
 }
 if(write&&changed){for(const [semantic,a]of attrs)p.setAttribute(semantic,a.clone().setArray(new (a.getArray().constructor)(arrays.get(semantic))));p.setIndices(idx.clone().setArray(new (idx.getArray().constructor)(result)));}
 return {changed,removedArea};
}
let total=0;
for(const [file,nodeName]of [['src/assets/models/study/annabelle_wingback_chair.glb','Annabelle_Wingback_Chair'],['src/assets/models/study/study_dust_sheets.glb','Sheet_Armchair']]){
 const doc=await io.read(file),mesh=doc.getRoot().listNodes().find(n=>n.getName()===nodeName).getMesh();let changed=0;
 for(const p of mesh.listPrimitives()){const r=repair(p,process.argv.includes('--write'));changed+=r.changed;if(r.changed)console.log(file,p.getMaterial().getName(),r);}
 if(process.argv.includes('--write')&&changed){for(const a of doc.getRoot().listAccessors())if(a.listParents().every(parent=>parent.propertyType==='Root'))a.dispose();await io.write(file,doc);for(const p of mesh.listPrimitives())assert.equal(repair(p,false).changed,0,'repair left overlapping faces');}
 total+=changed;
}
if(!process.argv.includes('--write'))assert.equal(total,0,'chair assets contain coplanar overlapping faces; run with --write to repair');
console.log(process.argv.includes('--write')?'Repaired chair overlaps without moving exterior surfaces.':'PASS: wingback and covered armchair contain no positive-area same-facing coplanar overlaps.');
