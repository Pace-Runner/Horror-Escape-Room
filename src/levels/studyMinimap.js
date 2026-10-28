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
  return {mode:'overview',exclusive:true,bounds:{minX:-x,maxX:x,minZ:-z,maxZ:z}};
}
