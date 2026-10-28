import * as THREE from 'three';

/** Camera-space bounds: avoid world-AABB rotation inflating them when looking around. */
export function heldViewBounds(camera,root){
  camera.updateMatrixWorld(true);root.updateWorldMatrix(true,true);
  const inverse=camera.matrixWorld.clone().invert(),result=new THREE.Box3(),matrix=new THREE.Matrix4();
  root.traverseVisible(object=>{
    if(!object.isMesh||!object.geometry)return;
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    matrix.multiplyMatrices(inverse,object.matrixWorld);
    result.union(object.geometry.boundingBox.clone().applyMatrix4(matrix));
  });
  return result;
}

export function keepHeldItemClear(camera,mesh,viewRoot){
  const bounds=heldViewBounds(camera,mesh);
  const clearance=Math.max(.12,camera.near+.04);
  if(!bounds.isEmpty()&&bounds.max.z>-clearance)viewRoot.position.z-=bounds.max.z+clearance;
}
