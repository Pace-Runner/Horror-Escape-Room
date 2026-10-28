import * as THREE from 'three';

let weave;
function clothWeave(){
  if(weave)return weave;
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const thread=((x%4<2)!==(y%4<2))?22:-22;
    const v=128+thread+Math.round(4*Math.sin(x*1.7+y*.8));
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  weave=new THREE.DataTexture(data,size,size);
  weave.wrapS=weave.wrapT=THREE.RepeatWrapping;
  weave.needsUpdate=true;
  return weave;
}

/** Repair the source sheets' missing UVs and add age/fibre without new triangles. */
export function ageStudySheets(root){
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.material?.name?.includes('Dust sheet'))return;
    const geometry=mesh.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;
    geometry.computeBoundingBox();
    const box=geometry.boundingBox,height=box.max.y-box.min.y;
    const uv=new Float32Array(p.count*2),colours=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
      uv[i*2]=(ny>nx&&ny>nz?x:nx>nz?z:x)*5;
      uv[i*2+1]=(ny>nx&&ny>nz?z:y)*5;
      const hem=Math.max(0,1-(y-box.min.y)/Math.max(.01,height*.22));
      const mottle=.025*Math.sin(x*12+z*7)*Math.sin(y*9-z*4);
      colours[i*3]=.91-hem*.17+mottle;
      colours[i*3+1]=.86-hem*.19+mottle;
      colours[i*3+2]=.74-hem*.20+mottle;
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    geometry.setAttribute('color',new THREE.BufferAttribute(colours,3));
    const material=mesh.material.clone();
    material.map=null;material.color.set(0xffffff);material.vertexColors=true;
    material.roughness=.98;material.metalness=0;material.bumpMap=clothWeave();material.bumpScale=.0015;
    mesh.geometry=geometry;mesh.material=material;
  });
}

/** Tie back the middle curtain to screen-right (-Z), keeping its lower hiding cover. */
export function gatherMiddleCurtain(root){
  for(let i=0;i<4;i++){
    const strip=root.getObjectByName(`Strip_${i}`);
    if(!strip?.isMesh)continue;
    const geometry=strip.geometry.clone(),p=geometry.attributes.position;
    for(let j=0;j<p.count;j++){
      const y=p.getY(j)+strip.position.y;
      const u=THREE.MathUtils.clamp((y-1.7)/(5.75-1.7),0,1);
      const gather=Math.sin(Math.PI*u)**1.3;
      const across=p.getX(j)+strip.position.x;
      p.setX(j,across*(1-.72*gather)+.48*gather-strip.position.x);
      p.setZ(j,p.getZ(j)+.025*gather*Math.sin(across*48));
    }
    p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    strip.geometry=geometry;
  }
}
