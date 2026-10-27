import * as THREE from 'three';
const ease=u=>THREE.MathUtils.smoothstep(u,0,1);
/** An authored external camera, independent of gameplay physics and the mirror. */
export function endingTransformation(pose,t,{start,body,yaw,clawAt,removeAt,distance=2.15,targetFov=60,cameraHeight=1.48,targetHeight=1.30,cinematicSlash=false}){
  if(t<start)return pose;
  const origin=new THREE.Vector3(...body),forward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const side=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const pull=ease((t-start)/2.4),zoom=ease((t-start-2.4)/1.0),attackAge=t-clawAt,claw=ease((attackAge-.23)/.43);
  const endpoint=origin.clone().addScaledVector(forward,distance-.20*zoom).addScaledVector(side,.55);endpoint.y=cameraHeight;
  const p=new THREE.Vector3(...pose.position).lerp(endpoint,pull);
  const target=origin.clone();target.y=targetHeight;
  const targetQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p,target,new THREE.Vector3(0,1,0)));
  const q=new THREE.Quaternion().fromArray(pose.quaternion).slerp(targetQ,pull);
  // One small impact kick as the swipe crosses the lens, immediately before black.
  const impact=ease((attackAge-.57)/.10);
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.025*impact,0,.065*impact)));
  const slash=cinematicSlash?ease((attackAge-.48)/.24):undefined;
  const leap=cinematicSlash?ease((attackAge-.26)/.36):claw;
  const airborne=cinematicSlash?Math.sin(Math.PI*ease((attackAge-.26)/.62))*.40:Math.sin(Math.PI*claw)*.22;
  return {...pose,position:p.toArray(),quaternion:q.toArray(),fov:THREE.MathUtils.lerp(pose.fov,targetFov,pull),
    external:true,bodyPosition:body,bodyYaw:yaw,time:t,claw,removeAt,emptyHands:true,
    attackAge,anticipation:ease(attackAge/.23)*(1-leap),lunge:leap,
    jump:airborne,slashMode:cinematicSlash,slash,
    scratch:cinematicSlash?ease((attackAge-.61)/.10):0};
}
