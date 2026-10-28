import * as THREE from 'three';
import {createEndingTiming} from './studyEndingDialogue.js';
import {sampleEndingCatchPerformance} from './containedEndingPerformance.js';

export const RESEAL_TIMING=createEndingTiming('reseal');
const ease=u=>THREE.MathUtils.smoothstep(u,0,1);
const span=(t,a,b)=>THREE.MathUtils.clamp((t-a)/(b-a),0,1);
const look=(p,target)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p,target,new THREE.Vector3(0,1,0)));

/** Contained: reassurance from the player's eyes, a continuous withdrawal, then the catch. */
export function buildStudyResealEnding({camera,player,refs,visor,fade,stopChatter=()=>{},
  playMechanical=()=>{},muffleNight=()=>{},restoreNight=()=>{},showIdentity=()=>{},updateAudio=()=>{},stopAudio=()=>{},timing=RESEAL_TIMING}){
  const T=timing,start=camera.position.clone(),initial=camera.quaternion.clone(),fov=camera.fov;
  const body=new THREE.Vector3(start.x,0,start.z);
  const fallback=refs.annabelle.getWorldPosition(new THREE.Vector3());fallback.y=.98;
  const focus=()=>refs.getEndingFocus?.()??fallback.clone();
  const end=body.clone().add(new THREE.Vector3(.35,1.67,-2.65));
  const route=new THREE.CubicBezierCurve3(start.clone(),start.clone().add(new THREE.Vector3(.05,0,-.9)),end.clone().add(new THREE.Vector3(-.15,0,.8)),end);
  function sample(t){
    const withdrawal=ease(span(t,T.human,T.still));
    const p=route.getPointAt(withdrawal);
    const performance=sampleEndingCatchPerformance({position:p.toArray(),bodyPosition:body.toArray()},t,T);
    const {notice,load,rush,grab,strike}=performance,u=span(t,T.claw,T.contact);
    const recoil=ease(span(t,T.contact-.035,T.contact+.10));
    p.z-=.06*recoil;p.y-=.025*recoil;
    const target=body.clone();target.y=1.50+.12*notice;
    // Blend two composed orientations. Interpolating world targets can put the
    // target under a moving lens midway through the withdrawal and make it stare at the floor.
    const q=initial.clone().slerp(look(p,focus()),ease(span(t,T.look,T.voice)))
      .slerp(look(p,target),ease(span(t,T.human+.15,T.still-.1)));
    const living=.002*Math.sin(t*1.9);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(living-.035*recoil,.002*Math.sin(t*1.3),-.045*recoil)));
    const facing=Math.atan2(-(p.x-body.x),-(p.z-body.z));
    return {position:p.toArray(),quaternion:q.toArray(),fov:THREE.MathUtils.lerp(fov,Math.max(48,fov-12),ease(span(t,.5,T.voice+1)))-3*grab,
      external:t>=T.human,bodyPosition:body.toArray(),bodyYaw:facing+.42*(1-notice),time:t,emptyHands:true,visorWorn:t<T.human,
      containedPerformance:performance,
      claw:rush,lunge:rush,jump:0,anticipation:load,slash:strike,slashMode:true,
      scratch:t>=T.contact&&t<T.black?ease(span(t,T.contact,T.contact+.04)):0,
      distortion:t>=T.contact&&t<T.contact+1/30?1:0,contactHit:t>=T.contact&&t<T.black,
      blur:.35*Math.sin(Math.PI*u),glitch:0};
  }
  return {name:'studyEnding_contained',letterbox:false,skippable:false,restoreBeam:false,
    timing:T,sample,shots:[{seconds:T.end,pose:u=>sample(u*T.end)}],
    cues:[
      {t:0,run(){stopChatter();visor.set(true);refs.setEndingSeated?.(1);muffleNight(.2);}},
      {t:.85,run:()=>playMechanical('deadbolt_open',[0,.65,6.45])},
      {t:T.voice-.4,run:()=>refs.setResealReaction(start,.85)},
      {t:T.voiceEnd+.15,run:()=>refs.setResealReaction(new THREE.Vector3(0,1.4,6.45),.4)},
      {t:T.lastMechanism,run:()=>playMechanical('latch',[4,4,-2])},
      {t:T.seal,run:()=>muffleNight(.8)},
      {t:T.finalLock,run:()=>playMechanical('deadbolt_open',[0,1.2,6.45])},
      {t:T.quiet,run:()=>muffleNight(1.4)},
      {t:T.claw,run:()=>playMechanical('attack-swell',start.toArray())},
      {t:T.contact,run:()=>playMechanical('attack-contact',start.toArray())},
      {t:T.fade,run:()=>fade.fadeOut(140)}
    ],
    onFrame(_ctx,t){
      updateAudio(t);
      refs.setEndingSeated?.(1);refs.setResealResignation(ease(span(t,T.voice,T.voiceEnd+1)));
      refs.setResealLockdown(ease(span(t,0,T.locked)));
      const pose=sample(t);camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);player.groundY=0;
      showIdentity(t>=T.human+.55&&t<T.black?'hollow':null,pose);
    },
    onEnd(_ctx,completed){
      stopAudio();restoreNight();refs.setResealReaction(null,0,0);refs.setResealResignation(0);showIdentity(null);refs.setEndingSeated?.(0);
      if(!completed)fade.clear();
    }
  };
}
