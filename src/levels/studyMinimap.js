import * as THREE from 'three';
import {MINIMAP_ONLY} from '../core/RenderLayers.js';

/** An X/Z plan of the actual room, openings, gallery and staircase. */
export function createStudyMinimap(group,{width,depth,loftFrontZ,stairX,stairWidth,stairTopZ,stairBottomZ,entryZ,entryWidth,exitWidth}){
  const root=new THREE.Group();root.name='Study_Minimap_Plan';group.add(root);
  const points=[],x=width/2,z=depth/2,left=stairX-stairWidth/2,right=stairX+stairWidth/2;
  function line(x0,z0,x1,z1){points.push(new THREE.Vector3(x0,.1,z0),new THREE.Vector3(x1,.1,z1));}
  function floor(x0,z0,x1,z1,colour,y){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(x1-x0,z1-z0),new THREE.MeshBasicMaterial({color:colour}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set((x0+x1)/2,y,(z0+z1)/2);root.add(mesh);
  }
  floor(-x,-z,x,z,0x342d23,0);
  floor(-x,-z,left,loftFrontZ,0x57503b,.02);
  floor(left,-z,right,stairTopZ,0x57503b,.02);
  line(-x,-z,x,-z);line(-x,-z,-x,z);
  line(x,-z,x,entryZ-entryWidth/2);line(x,entryZ+entryWidth/2,x,z);
  line(-x,z,-exitWidth/2,z);line(exitWidth/2,z,x,z);
  line(-x,loftFrontZ,left,loftFrontZ);line(left,loftFrontZ,left,stairTopZ);
  line(left,stairTopZ,right,stairTopZ);line(left,stairTopZ,left,stairBottomZ);line(right,stairTopZ,right,stairBottomZ);
  for(let i=0;i<=16;i++){const zz=stairTopZ+(stairBottomZ-stairTopZ)*i/16;line(left,zz,right,zz);}
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xb8a87d})));
  root.traverse(object=>object.layers.set(MINIMAP_ONLY));
  const objects=new THREE.Group();objects.name='Study_Minimap_Furniture';root.add(objects);
  function mapObjects(colliders,{loftY=3,landmarks=[]}={}){
    objects.clear();const edges=[];
    for(const box of colliders){
      const w=box.maxX-box.minX,d=box.maxZ-box.minZ,cx=(box.minX+box.maxX)/2,cz=(box.minZ+box.maxZ)/2;
      // Omit structural walls, the stair run and exterior collision; keep actual furniture footprints.
      if(!Number.isFinite(w+d)||w<.09||d<.09||w>width*.65||d>depth*.65||Math.abs(cx)>x-.08||Math.abs(cz)>z-.08)continue;
      if(cx>left&&cx<right&&cz>stairTopZ&&cz<stairBottomZ)continue;
      const upstairs=(box.minY??0)>=loftY-.1;
      const x0=Math.max(-x+.08,box.minX),x1=Math.min(x-.08,box.maxX),z0=Math.max(-z+.08,box.minZ),z1=Math.min(z-.08,box.maxZ);
      if(x1<=x0||z1<=z0)continue;
      const y=upstairs?.085:.065;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(x1-x0,z1-z0),new THREE.MeshBasicMaterial({color:upstairs?0x958468:0x66503a}));
      mesh.rotation.x=-Math.PI/2;mesh.position.set((x0+x1)/2,y,(z0+z1)/2);mesh.userData.footprint={...box};objects.add(mesh);
      for(const [a,b,c,e] of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]])edges.push(new THREE.Vector3(a,y+.004,b),new THREE.Vector3(c,y+.004,e));
    }
    objects.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges),new THREE.LineBasicMaterial({color:0xb8a87d})));
    // Small, neutral location markers identify existing fixtures without exposing puzzle answers.
    for(const object of landmarks){
      const point=group.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
      const marker=new THREE.Mesh(new THREE.CircleGeometry(.105,8),new THREE.MeshBasicMaterial({color:0xd4bd83}));
      marker.rotation.x=-Math.PI/2;marker.position.set(point.x,.11,point.z);marker.name='Map_'+object.name;objects.add(marker);
    }
    objects.traverse(object=>object.layers.set(MINIMAP_ONLY));
  }
  return {mapObjects,mode:'overview' ,exclusive:true,bounds:{minX:-x,maxX:x,minZ:-z,maxZ:z}};
}
