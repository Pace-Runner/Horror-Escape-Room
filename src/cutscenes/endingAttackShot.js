import * as THREE from 'three';
const clamp=x=>THREE.MathUtils.clamp(x,0,1);
const ease=x=>THREE.MathUtils.smoothstep(x,0,1);
/** Shared final attack shot: a slow acknowledgement followed by sharp acceleration into the lens. */
export function sampleEndingAttack(pose,t,T){
  if(!pose.external)return pose;
  const origin=new THREE.Vector3(...pose.bodyPosition),p=new THREE.Vector3(...pose.position);
  const tense=ease((t-T.still)/(T.claw-T.still));
  const direction=p.clone().sub(origin).setY(0).normalize();
  p.addScaledVector(direction,-.16*tense);
  const age=t-T.claw,u=clamp(age/(T.contact-T.claw));
  // Cubic acceleration: no run-up or looping gait; one crouch and one leap.
  const launch=clamp((u-.12)/.88),lunge=launch**2.6;
  const jump=Math.sin(Math.PI*launch*.86)*.34;
  const slash=ease((u-.64)/.36),anticipation=ease(u/.12)*(1-ease((u-.12)/.20));
  const contactAge=t-T.contact,impact=ease(contactAge/.025);
  p.addScaledVector(direction,.065*ease((u-.55)/.45));
  p.y+=.007*impact;
  const target=origin.clone();target.y=1.36;
  const face=origin.clone().lerp(new THREE.Vector3(p.x,0,p.z),lunge*.80);face.y=1.92+jump;
  target.lerp(face,ease(u/.65));
  const aimed=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p,target,new THREE.Vector3(0,1,0)));
  const q=new THREE.Quaternion().fromArray(pose.quaternion).slerp(aimed,ease((t-T.still)/.4));
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.008*impact,.006*impact,.022*impact)));
  const facing=Math.atan2(-(p.x-origin.x),-(p.z-origin.z));
  return {...pose,position:p.toArray(),quaternion:q.toArray(),
    bodyYaw:facing+.78*(1-tense),time:t,emptyHands:true,visorWorn:false,
    fov:pose.fov+8*Math.sin(Math.PI*u),attackAge:age,
    claw:lunge,lunge,jump,anticipation,slashMode:true,slash,attackReach:ease(u/.3),
    strikeBlend:ease((u-.55)/.18),lensGap:.30,
    scratch:t>=T.contact&&t<T.black?ease(contactAge/.055):0,
    distortion:contactAge>=0&&contactAge<1/30?1:0,contactHit:t>=T.contact&&t<T.black,
    blur:age>0&&age<T.contact-T.claw?.75*Math.sin(Math.PI*u):0};
}
