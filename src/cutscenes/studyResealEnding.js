import * as THREE from 'three';
import {createEndingTiming} from './studyEndingDialogue.js';
import {endingTransformation} from './endingTransformation.js';
import {sampleEndingAttack} from './endingAttackShot.js';

export const RESEAL_TIMING=createEndingTiming('reseal');
const ease=u=>THREE.MathUtils.smoothstep(u,0,1);
const look=(p,target)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p,target,new THREE.Vector3(0,1,0)));

/** Containment: acknowledge seated Annabelle, then reveal Mark externally inside the sealed house. */
export function buildStudyResealEnding({camera,player,refs,visor,fade,stopChatter=()=>{},
  playMechanical=()=>{},muffleNight=()=>{},restoreNight=()=>{},showIdentity=()=>{},updateAudio=()=>{},stopAudio=()=>{},timing=RESEAL_TIMING}){
  const T=timing,start=camera.position.clone(),initial=camera.quaternion.clone(),fov=camera.fov;
  const annabelle=refs.annabelle.getWorldPosition(new THREE.Vector3());annabelle.y=.92;
  const bodyYaw=Math.atan2(start.x-annabelle.x,start.z-annabelle.z);
  function sample(t){
    const p=start.clone();p.y+=Math.sin(t*1.6)*.002*ease(t/.8);
    const q=initial.clone().slerp(look(p,annabelle),ease((t-T.look)/T.lookDuration));
    const pose=endingTransformation({position:p.toArray(),quaternion:q.toArray(),fov},t,
      {start:T.human,body:[start.x,0,start.z],yaw:bodyYaw,clawAt:Infinity,cameraHeight:2.05,targetHeight:1.36});
    pose.visorWorn=false;return sampleEndingAttack(pose,t,T);
  }
  return {name:'studyEnding_contained',letterbox:false,skippable:false,restoreBeam:false,
    timing:T,sample,shots:[{seconds:T.end,pose:u=>sample(u*T.end)}],
    cues:[
      {t:0,run(){stopChatter();visor.set(true);refs.setEndingSeated?.(0);muffleNight(.20);playMechanical('latch',[0,1.3,6.45]);}},
      {t:.85,run:()=>playMechanical('deadbolt_open',[0,.65,6.45])},
      {t:2.8,run:()=>playMechanical('padlock_open',[0,1.7,6.45])},
      {t:T.voiceEnd+.15,run:()=>refs.setResealReaction(new THREE.Vector3(0,1.4,6.45),.7,0)},
      {t:4.5,run(){muffleNight(.6);playMechanical('latch',[-5,2,-4]);}},
      {t:T.voice-.4,run:()=>refs.setResealReaction(camera.position.clone(),.8,0)},
      {t:T.lastMechanism,run:()=>playMechanical('latch',[4,4,-2])},
      {t:T.seal,run:()=>muffleNight(1)},
      {t:T.finalLock,run:()=>playMechanical('deadbolt_open',[0,1.2,6.45])},
      {t:T.quiet,run:()=>muffleNight(1.4)},
      {t:T.hollow,run:()=>playMechanical('cloth',start.toArray())},
      {t:T.still,run:()=>playMechanical('attack-swell',start.toArray())},
      {t:T.claw,run:()=>playMechanical('roar',start.toArray())},
      {t:T.contact,run:()=>playMechanical('attack-contact',start.toArray())},
      {t:T.news,run:()=>playMechanical('news-static')},
      {t:T.fade,run:()=>fade.fadeOut(450)}
    ],
    onFrame(_ctx,t){
      updateAudio(t);
      const pose=sample(t);camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);player.groundY=0;
      const first=.30*ease(t/1.6),middle=.35*ease((t-3)/2.8),last=.35*ease((t-T.lastMechanism)/(T.locked-T.lastMechanism));
      refs.setResealLockdown(first+middle+last);
      refs.setResealResignation(ease((t-T.voice)/1.0));
      refs.setEndingSeated?.(ease(t/2.4));
      showIdentity(t>=T.human+.9&&t<T.black?'hollow':null,pose);
    },
    onEnd(_ctx,completed){
      stopAudio();
      restoreNight();refs.setResealReaction(null,0,0);refs.setResealResignation(0);showIdentity(null);
      refs.setEndingSeated?.(0);
      if(!completed)fade.clear();
    }
  };
}
