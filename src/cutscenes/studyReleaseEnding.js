import * as THREE from 'three';
import {createEndingTiming} from './studyEndingDialogue.js';
import {endingTransformation} from './endingTransformation.js';
import {sampleEndingAttack} from './endingAttackShot.js';
import {sampleEndingCatchPerformance} from './containedEndingPerformance.js';

export const RELEASE_TIMING=createEndingTiming('release');
const ease=u=>THREE.MathUtils.smoothstep(u,0,1);
const look=(p,target)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p,target,new THREE.Vector3(0,1,0)));

/** Release: seated Annabelle, first-person exit, then an external perception glitch and claw. */
export function buildStudyReleaseEnding({camera,player,refs,visor,fade,stopChatter=()=>{},
  playMechanical=()=>{},startNight=()=>{},stopNight=()=>{},showIdentity=()=>{},updateAudio=()=>{},stopAudio=()=>{},timing=RELEASE_TIMING}){
  const T=timing,start=camera.position.clone(),initial=camera.quaternion.clone(),fov=camera.fov;
  const outside=new THREE.Vector3(0,start.y,7.55),doorTarget=new THREE.Vector3(0,start.y,10);
  const annabelle=refs.annabelle?.getWorldPosition(new THREE.Vector3())??new THREE.Vector3(-6.62,0,-6.075);annabelle.y=.92;
  const route=new THREE.CubicBezierCurve3(start.clone(),new THREE.Vector3(start.x*.2,start.y,start.z),new THREE.Vector3(0,start.y,6.15),outside);
  function sample(t){
    const u=THREE.MathUtils.clamp((t-T.walk)/(T.walkEnd-T.walk),0,1);
    const p=t<T.walk?start.clone():route.getPointAt(ease(u));
    const gain=Math.sin(Math.PI*u)**2;
    p.y+=Math.sin(u*Math.PI*16)*.012*gain;
    p.y+=Math.sin(t*1.7)*.002*ease(t/.6)*(1-ease((t-T.walk)/.3));
    const annabelleLook=look(p,annabelle),exitLook=look(p,doorTarget);
    const q=initial.clone().slerp(annabelleLook,ease((t-T.look)/T.lookDuration));
    q.slerp(exitLook,ease((t-T.turn)/T.turnDuration));
    const pose=endingTransformation({position:p.toArray(),quaternion:q.toArray(),fov},t,
      {start:T.human,body:[0,0,7.55],yaw:Math.PI,clawAt:Infinity,distance:1.42,targetFov:70,cameraHeight:1.45,targetHeight:1.36});
    pose.visorWorn=false;
    const glitchAge=t-(T.hollow-.24);
    pose.glitch=glitchAge>=0&&glitchAge<.48?(.35+.35*Math.sin(glitchAge*85)**2)*Math.sin(Math.PI*glitchAge/.48):0;
    const shot=sampleEndingAttack(pose,t,T);
    if(t>=T.hollow){
      shot.containedPerformance=sampleEndingCatchPerformance(shot,t,T);
      shot.jump=0; // The shared catch plants its weight and reaches; no rigid airborne leap.
    }
    return shot;
  }
  return {name:'studyEnding_released',letterbox:false,skippable:false,restoreBeam:false,
    timing:T,sample,shots:[{seconds:T.end,pose:u=>sample(u*T.end)}],
    cues:[
      {t:0,run(){stopChatter();visor.set(true);refs.setEndingSeated?.(0);refs.setReleaseDoorOpen(false);playMechanical('deadbolt_open',[0,.7,6.45]);}},
      {t:.7,run:()=>playMechanical('padlock_open',[0,1.7,6.45])},
      {t:1.5,run:()=>playMechanical('latch',[-5,2,-3])},
      {t:2.3,run:()=>playMechanical('latch',[4,4,-2])},
      {t:T.voice-.4,run:()=>refs.setReleaseReaction(camera.position.clone(),.85)},
      {t:T.voice,run:()=>refs.setReleaseConcern?.(1)},
      {t:T.voiceEnd+.1,run:()=>refs.setReleaseReaction(new THREE.Vector3(0,1.4,6.9),.85)},
      {t:T.door,run(){refs.setReleaseDoorOpen(true);startNight();}},
      {t:T.turn+.6,run:()=>refs.setReleaseReaction(camera.position.clone(),.75)},
      {t:T.walk,run(){refs.setReleaseReaction(null,0);refs.setReleaseConcern?.(0);}},
      {t:T.remove,run(){visor.set(false);playMechanical('visor_off',[0,1.5,7.55]);}},
      {t:T.hollow,run:()=>playMechanical('cloth',[0,1.3,7.55])},
      {t:T.claw,run:()=>playMechanical('roar',[0,1.5,7.55])},
      {t:T.fade,run:()=>fade.fadeOut(140)}
    ],
    onFrame(_ctx,t){
      updateAudio(t);
      const pose=sample(t);camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);
      player.groundY=0;
      refs.setEndingSeated?.(ease(t/2.4));
      refs.setReleaseBarsProgress?.(ease((t-(T.door-1.8))/1.8));
      showIdentity(t>=T.human+.9&&t<T.black?(t>=T.hollow||(t>T.hollow-.18&&Math.sin(t*100)>0)?'hollow':'human'):null,pose);
    },
    onEnd(_ctx,completed){
      stopAudio();
      stopNight();refs.setReleaseReaction(null,0);refs.setReleaseConcern?.(0);showIdentity(null);
      refs.setEndingSeated?.(0);
      if(!completed)fade.clear();
    }
  };
}
