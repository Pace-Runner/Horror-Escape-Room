import * as THREE from 'three';
const ease=x=>THREE.MathUtils.smoothstep(x,0,1);
const span=(t,a,b)=>THREE.MathUtils.clamp((t-a)/(b-a),0,1);

/** Both endings share one attack performance, scaled to the available space in front of the lens. */
export function sampleEndingCatchPerformance(pose,t,T){
  const notice=ease(span(t,T.human+.65,T.still+.35));
  const load=ease(span(t,T.claw-.65,T.claw))*(1-ease(span(t,T.claw,T.claw+.22)));
  const u=span(t,T.claw,T.contact),rush=u*u*(.35+.65*u);
  const distance=Math.hypot(pose.position[0]-pose.bodyPosition[0],pose.position[2]-pose.bodyPosition[2]);
  const step=Math.min(.24,Math.max(0,distance-1.3)),reach=Math.min(1.4,Math.max(0,distance-1.05));
  const travel=step*ease(span(t,T.still+.15,T.claw-.55))+reach*rush;
  const grab=ease(span(u,.64,1)),strike=ease(span(u,.86,1));
  return {time:t,notice,load,rush,grab,strike,travel,speed:t<T.claw?.32*Math.sin(Math.PI*span(t,T.still+.15,T.claw-.55)):4.8*(1-grab)};
}

/** The catch's spine-distributed hunch, face placement and two-handed reach, sampled without randomness. */
export function applyContainedEndingPerformance(actor,pose,reach){
  const P=pose.containedPerformance,{time,notice,load,rush,grab,strike,travel,speed}=P;
  actor.sampleCinematicPose({time,speed,phase:travel/1.65*Math.PI*2,crouch:load*.24});
  const breath=Math.sin(time*2.1)*.015;
  const curl=.14+.17*notice+.30*load+.25*rush;
  const cock=.07+.20*notice+.09*grab;
  // As in the study catch: the neck moves with the chest, rather than swivelling on a rigid stalk.
  actor.offsetBones({
    Spine:[curl*.30,0,-cock*.08],Chest:[curl*.35,-.12*load,cock*.18],
    Neck:[curl*.20-.12*notice+breath,.12*notice,cock*.32],Head:[curl*.15-.12*notice,0,cock*.50],
    'Left shoulder':[0,-.12*load,.10*notice], 'Right shoulder':[0,.16*load,-.08*notice],
    'Right leg':[-.18*load,0,.035*load],'Right knee':[.36*load,0,0],
    'Left leg':[-.12*load,0,-.025*load],'Left knee':[.25*load,0,0]
  });
  const lens=new THREE.Vector3(...pose.position),q=new THREE.Quaternion().fromArray(pose.quaternion);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(q),up=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(q);
  const toward=lens.clone().sub(actor.refs.root.position).setY(0).normalize();
  actor.refs.root.position.addScaledVector(toward,travel);
  actor.refs.root.position.y=-.08*load+.035*Math.sin(Math.PI*rush);
  actor.group.updateMatrixWorld(true);
  // End the rush with the eyes a safe hand's breadth from the lens, the way lightningFace does.
  const faceLock=ease(span(rush,.30,.85));
  if(faceLock>0){
    const eye=actor.getEyePosition(new THREE.Vector3());
    const goal=lens.clone().addScaledVector(forward,.43).addScaledVector(up,-.015);
    const correction=goal.sub(eye).multiplyScalar(faceLock);
    actor.refs.root.position.x+=correction.x;actor.refs.root.position.z+=correction.z;
    actor.refs.root.position.y+=Math.min(0,correction.y);
    actor.group.updateMatrixWorld(true);
  }
  const reaching=Math.sqrt(rush);
  const extension=Math.min(1,.22*notice*(1-rush)+.48*load+ease(reaching/.55));
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const shoulder=actor.getRigBone(side+' arm').getWorldPosition(new THREE.Vector3());
    const waiting=shoulder.clone().addScaledVector(right,sign*(.18+.12*load)).addScaledVector(up,-.34+.55*load);
    const goal=lens.clone().addScaledVector(forward,.32-.08*grab)
      .addScaledVector(right,sign*(.32-.14*grab)).addScaledVector(up,-.06);
    if(side==='Left')goal.addScaledVector(right,-.64*strike).addScaledVector(up,-.30*strike);
    reach(actor,waiting.lerp(goal,ease(reaching/.7)),extension,side);
  }
  actor.offsetBones({
    'Left wrist':[.08,0,-.25*strike],'Right wrist':[.1,0,.12*grab],
    'indexfinger1 l':[-.12+.60*grab,0,-.12], 'middlefinger1 l':[-.10+.60*grab,0,0],
    'ringfinger1 l':[-.08+.55*grab,0,.10], 'indexfinger1 r':[-.12+.55*grab,0,.12],
    'middlefinger1 r':[-.10+.60*grab,0,0], 'ringfinger1 r':[-.08+.55*grab,0,-.10]
  });
}
