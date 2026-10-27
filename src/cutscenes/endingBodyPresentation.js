import * as THREE from 'three';
import {createStudyActorPresentation} from './studyActorPresentation.js';

/** Borrow existing rigs for ending-only external shots and physical visor handling. */
export function createEndingBodyPresentation({human,hollow,setBodyShown=()=>{},visorTemplate=null}){
  const actors=[human,hollow],facingOffsets=new Map();
  const props=createStudyActorPresentation({visorTemplate});props.setHeld(true);props.finishVisor(true);
  // Aim the free left arm toward the lens; the right hand keeps the removed goggles.
  function reach(actor,target,weight){
    const upper=actor.getRigBone?.('Left arm'),lower=actor.getRigBone?.('Left elbow'),hand=actor.refs?.hands?.l;
    if(!upper||!lower||!hand||weight<=0)return;
    actor.group.updateMatrixWorld(true);
    const shoulder=upper.getWorldPosition(new THREE.Vector3()),elbow=lower.getWorldPosition(new THREE.Vector3()),wrist=hand.getWorldPosition(new THREE.Vector3());
    const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),direction=target.clone().sub(shoulder).normalize();
    const distance=Math.min(a+b-.015,shoulder.distanceTo(target));
    const along=(a*a+distance*distance-b*b)/(2*distance);
    const pole=new THREE.Vector3(-1,-.2,0).applyQuaternion(actor.refs.root.quaternion);
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const bend=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    const end=shoulder.clone().addScaledVector(direction,distance);
    for(const [bone,child,point] of [[upper,lower,bend],[lower,hand,end]]){
      actor.group.updateMatrixWorld(true);
      const from=child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
      const to=point.clone().sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
      const desired=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
      desired.premultiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      bone.quaternion.slerp(desired,weight);
    }
    actor.offsetBones({'Left wrist':[.15*weight,0,0]});
    actor.group.updateMatrixWorld(true);
  }
  const saved=actors.map(actor=>({actor,visible:actor.visible,correction:actor.correction,
    p:actor.refs.root.position.clone(),q:actor.refs.root.quaternion.clone(),scale:actor.refs.root.scale.clone()}));
  return {
    show(identity,pose){
      setBodyShown(identity==='human');
      actors.forEach(actor=>{actor.visible=false;});if(!identity||!pose)return;
      const actor=identity==='human'?human:hollow;
      let yaw=pose.bodyYaw??new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(pose.quaternion),'YXZ').y;
      const forward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
      actor.setCorrection(identity==='human'?1:0);actor.refs.root.scale.setScalar(1);
      // Place the torso slightly ahead of the eyes, keeping it inside the normal full frame.
      const body=pose.bodyPosition;
      actor.setPosition(body?body[0]:pose.position[0]+forward.x*.10,body?body[2]:pose.position[2]+forward.z*.10);
      actor.refs.root.position.y=0;actor.setYaw(yaw);actor.sampleReflectionPose({speed:0,time:pose.time??0});
      if(pose.external){
        // Measure the face, never inherit an earlier script's shoulder/heading state.
        if(!facingOffsets.has(actor)){
          actor.group.updateMatrixWorld(true);
          const front=actor.getEyePosition(new THREE.Vector3()).sub(actor.refs.head.getWorldPosition(new THREE.Vector3())).setY(0);
          facingOffsets.set(actor,front.lengthSq()>.00001&&front.dot(forward)<0?Math.PI:0);
        }
        yaw+=facingOffsets.get(actor);actor.setYaw(yaw);
        const lens=new THREE.Vector3(...pose.position),toward=lens.clone().sub(actor.refs.root.position).setY(0);
        const distance=toward.length();toward.normalize();
        actor.refs.root.position.addScaledVector(toward,Math.max(0,distance-(pose.lensGap??.43))*(pose.lunge??0));
        actor.refs.root.position.y=(pose.jump??0)-.065*(pose.anticipation??0);
      }
      if(pose.external){
        props.update(pose.time,null);props.setHeld(!pose.emptyHands);
        if(pose.visorWorn===false)props.finishVisor(false);
        else if(pose.removeAt!==undefined)props.setVisor(false,{start:pose.removeAt,duration:1.1,contact:.38});
        else props.finishVisor(true);
        props.hideAttachedProps();props.apply(actor,identity==='hollow');
        const attack=pose.claw??0,load=pose.anticipation??0;
        actor.offsetBones({Spine:[.12*load+.20*attack,0,0],Chest:[.08*load+.16*attack,0,0],
          'Left leg':[-.16*load-.35*attack,0,0],'Right leg':[-.20*load-.28*attack,0,0],
          'Left knee':[.35*load+.55*attack,0,0],'Right knee':[.40*load+.50*attack,0,0],
          'Right arm':[-.55*attack,0,.30*attack]});
        const lensQ=new THREE.Quaternion().fromArray(pose.quaternion);
        const right=new THREE.Vector3(1,0,0).applyQuaternion(lensQ),up=new THREE.Vector3(0,1,0).applyQuaternion(lensQ);
        if(pose.slashMode&&(pose.lunge??0)>.9){
          // Different dialogue lengths sample different breathing phases. Keep the
          // existing close-up outside the actual face rather than inside its mesh.
          actor.group.updateMatrixWorld(true);
          const lens=new THREE.Vector3(...pose.position),forward=new THREE.Vector3(0,0,-1).applyQuaternion(lensQ);
          const depth=actor.getEyePosition(new THREE.Vector3()).sub(lens).dot(forward);
          if(depth<.15){
            const away=actor.refs.root.position.clone().sub(lens).setY(0).normalize();
            actor.refs.root.position.addScaledVector(away,(.15-depth)/Math.max(.2,away.dot(forward)));
            actor.group.updateMatrixWorld(true);
          }
        }
        let swipe=new THREE.Vector3(...pose.position).addScaledVector(right,.28-.60*attack).addScaledVector(up,.16-.24*attack);
        let reachWeight=attack;
        if(pose.slashMode){
          const slash=pose.slash??0;
          const cameraForward=new THREE.Vector3(0,0,-1).applyQuaternion(lensQ);
          const shoulder=actor.getRigBone('Left arm').getWorldPosition(new THREE.Vector3());
          // Wind the one striking arm above its shoulder, then sweep across the lens.
          const windup=shoulder.addScaledVector(right,.28).addScaledVector(up,.34);
          const strike=new THREE.Vector3(...pose.position).addScaledVector(cameraForward,.10)
            .addScaledVector(right,.38-.84*slash).addScaledVector(up,.30-.58*slash);
          swipe=windup.lerp(strike,(pose.strikeBlend??THREE.MathUtils.smoothstep(pose.attackAge,.38,.52)));
          reachWeight=pose.attackReach??THREE.MathUtils.smoothstep(pose.attackAge,0,.22);
          actor.offsetBones({Chest:[.12*attack,0,-.16*slash],'Right arm':[.30*attack,0,-.18*attack]});
        }
        reach(actor,swipe,reachWeight);
        actor.offsetBones({'indexfinger1 l':[.22*attack,0,-.12*attack],
          'middlefinger1 l':[.28*attack,0,0],'ringfinger1 l':[.24*attack,0,.1*attack]});
      }
      actor.setHeadVisible(!!pose.external);actor.visible=true;actor.group.updateMatrixWorld(true);
    },
    restore(restoreState=true){
      props.dispose();
      if(restoreState)setBodyShown(false);
      for(const {actor,visible,correction,p,q,scale} of saved){
        actor.setHeadVisible(true);if(!restoreState)continue;
        actor.setCorrection(correction);actor.refs.root.position.copy(p);actor.refs.root.quaternion.copy(q);
        actor.refs.root.scale.copy(scale);actor.update(0);actor.visible=visible;
      }
    }
  };
}
