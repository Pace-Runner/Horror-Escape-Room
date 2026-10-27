import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildStudyResealEnding,RESEAL_TIMING as T} from '../src/cutscenes/studyResealEnding.js';
import {createCutsceneRunner} from '../src/core/Cutscene.js';
import {createResealAttackAudio} from '../src/cutscenes/resealAttackAudio.js';
import {createReleaseEndingScreen} from '../src/core/ReleaseEndingScreen.js';

function classes(){const values=new Set();return {add:(...s)=>s.forEach(x=>values.add(x)),remove:(...s)=>s.forEach(x=>values.delete(x)),contains:x=>values.has(x),toggle(x,on){if(on)values.add(x);else values.delete(x);}};}
globalThis.document={body:{classList:classes(),appendChild(){}},getElementById:()=>null,createElement:()=>({classList:classes(),style:{},appendChild(){}})};
for(const cancelAt of [null,.1,1.1,3.2,6.8,9.1,T.still+.1,T.contact+.02,T.news+.1]){
  const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);camera.position.set(-1.55,1.6,5.5);camera.rotation.y=Math.PI;
  const start=camera.position.clone(),initial=camera.quaternion.clone();
  const player={movementEnabled:true,lookEnabled:true,keys:{},clearKeys(){},aim(yaw,pitch){camera.rotation.set(pitch,yaw,0,'YXZ');}};
  const interaction={enabled:true,setEnabled(on){this.enabled=on;}};
  const annabelle=new THREE.Group();annabelle.position.set(-6.62,0,-6.075);
  const mechanics=[],reactions=[],lockdown=[],resignation=[],identity=[],perceptions=[],seated=[];let clock=0,muffled=false,restores=0,chatter=0,clears=0,fadeAt=null;
  const refs={annabelle,setEndingSeated:w=>seated.push(w),setResealLockdown:p=>lockdown.push(p),setResealReaction:(p,w)=>reactions.push({p,w}),setResealResignation:p=>resignation.push(p)};
  const scene=buildStudyResealEnding({camera,player,refs,visor:{set:on=>perceptions.push({on,t:clock})},
    fade:{fadeOut(ms){assert.equal(ms,450);fadeAt=clock;},clear(){clears++;}},
    stopChatter(){chatter++;},playMechanical:(key,p)=>mechanics.push({key,p}),muffleNight(){muffled=true;},restoreNight(){muffled=false;restores++;},
    showIdentity:who=>identity.push(who)});
  assert.equal(scene.letterbox,false);assert(T.end>=15&&T.end<=24);
  const runner=createCutsceneRunner({camera,player,interaction});const promise=runner.playScene(scene);
  assert(!player.movementEnabled&&!player.lookEnabled&&!interaction.enabled);
  assert(camera.position.distanceTo(start)<1e-8&&camera.quaternion.angleTo(initial)<1e-8);
  assert.equal(await runner.playScene(scene),false,'second reseal started while active');
  let prior=scene.sample(0),maxAngular=0;
  while(runner.isRunning){
    if(cancelAt!==null&&clock>=cancelAt){runner.cancel();break;}
    clock+=.01;runner.update(.01);
    const p=scene.sample(Math.min(clock,T.end));
    if(clock<T.human)assert(Math.hypot(p.position[0]-start.x,p.position[2]-start.z)<1e-8,'reseal camera moved before external shot');
    assert(p.position[2]<6.45,'reseal camera crossed sealed exit');
    maxAngular=Math.max(maxAngular,new THREE.Quaternion().fromArray(prior.quaternion).angleTo(new THREE.Quaternion().fromArray(p.quaternion))/.01);prior=p;
    assert(clock<T.end+.1);
  }
  const complete=await promise;assert.equal(seated.at(-1),0,'seated pose leaked after end/cancel');assert.equal(chatter,1);assert.equal(restores,1);assert(!muffled);
  assert.equal(resignation.at(-1),0,'ending pose was not cleaned up');
  if(cancelAt!==null){assert(!complete);assert(clears>0);continue;}
  assert.equal(Math.max(...seated),1);assert(complete);assert(maxAngular<2.5,'reseal look snapped');
  assert.equal(mechanics.length,11);assert(mechanics.some(c=>c.p[2]<0)&&mechanics.some(c=>c.p[1]>3),'lock sounds did not travel through house');
  assert(Math.abs(Math.max(...lockdown)-1)<1e-8);assert.equal(Math.max(...resignation),1);
  assert(reactions.some(r=>r.p?.z===6.45)&&reactions.some(r=>r.p?.x===start.x),'Annabelle did not look exit then Mark');
  assert.deepEqual(perceptions.map(p=>p.on),[true]);assert(identity.includes('hollow')&&!identity.includes('human'));
  const external=scene.sample(T.hollow),lens=new THREE.PerspectiveCamera(external.fov,16/9,.05,100);
  lens.position.fromArray(external.position);lens.quaternion.fromArray(external.quaternion);lens.updateMatrixWorld(true);
  const chest=new THREE.Vector3(...external.bodyPosition).add(new THREE.Vector3(0,1.3,0)).project(lens);
  assert(Math.abs(chest.x)<.1&&Math.abs(chest.y)<.1&&Math.abs(chest.z)<1,'contained monster is behind external lens');
  assert.equal(external.visorWorn,false,'external monster wears goggles');
  assert(external.position[1]>2,'reseal external camera is still too low');
  assert(Math.abs(T.claw-T.still-2.25)<1e-8,'tense turn hold');
  assert(Math.abs(T.contact-T.claw-.9)<1e-8,'explosive lunge duration');
  assert(Math.abs(T.black-T.contact-.45)<1e-8,'impact fade duration');
  assert(Math.abs(T.news-T.black-1.25)<1e-8,'black before news static');
  const tenseA=scene.sample(T.still),tenseB=scene.sample(T.claw-.01);
  assert(Math.abs(tenseA.bodyYaw-tenseB.bodyYaw)>.7,'Hollow did not turn toward camera');
  const windup=scene.sample(T.claw+.10),leap=scene.sample(T.claw+.65),hit=scene.sample(T.contact+.02);
  assert(windup.anticipation>.8&&windup.lunge===0,'missing loaded stillness');
  assert(leap.jump>.2&&leap.lunge>.3&&leap.blur>.1,'missing accelerating airborne strike/brief blur');
  assert(hit.slash>.99&&hit.scratch>0&&hit.distortion===1,'contact effects out of sync');
  assert(scene.sample(T.contact+.04).distortion===0,'distortion exceeds two frames');
  assert(scene.sample(T.black).scratch===0,'prolonged claw overlay over black');
  assert(mechanics.some(x=>x.key==='attack-contact')&&mechanics.some(x=>x.key==='attack-swell')&&mechanics.some(x=>x.key==='news-static'));
  assert(Math.abs(fadeAt-T.fade)<.02);

}

// Identical end-screen controller: contained title is authored in its own root.
const elements={actions:{hidden:true},menu:{addEventListener(_,fn){this.click=fn;},focus(){}},credits:{addEventListener(_,fn){this.click=fn;}}};
const root={classList:classes(),querySelector:key=>key.includes('actions')?elements.actions:key.includes('menu')?elements.menu:elements.credits};
let timer=null,menus=0,credits=0;
const screen=createReleaseEndingScreen({root,onMenu:()=>menus++,onCredits:()=>credits++,setTimer(fn,ms){assert.equal(ms,2000);timer=fn;return 1;},clearTimer(){timer=null;}});
screen.show();assert(elements.actions.hidden);timer();assert(!elements.actions.hidden&&menus===0);
elements.credits.click();assert.equal(credits,1);screen.show({ready:true});elements.menu.click();assert.equal(menus,1);
screen.show();screen.hide();assert.equal(timer,null,'reset retained end-card timer');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(main.includes("window.addEventListener('study:reseal-chosen'"));
assert(main.includes("gameState.endingChosen='contained'"));assert(main.includes('resealEndingGeneration++;resealEndingScreen.hide();'));
assert(main.includes("menuOverlayState==='reseal-ending'&&gameState.endingChosen==='contained'"));
assert(main.includes('audio.setMuffle(.24*Math.min(1,progress),1.2)')&&main.includes('audio.setMuffle(0,.4)'));
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert(html.includes('ENDING: CONTAINED'));
for(const text of ['HOLLOW never left.','Annabelle never made it out.'])assert(!html.includes(text));
console.log('PASS: reseal once; control lock/current view; bolts/closed exit hooks; spatial locks; muffled ambience cleanup; planted resignation; slow Annabelle/hands look; higher third-person single-claw jump/slash; persistent Annabelle; lens scratch; duration-driven full-frame ending; 450ms impact fade + 1.25s black before static; contained card/menu/credits/reset; branch remains separate from Release.');

// Audio stays on the game SFX bus; finite envelopes, non-looping, and cancel-safe.
const emitted=[];let stopped=0;
const attackAudio=createResealAttackAudio({
  ctx:{sampleRate:24000,createBuffer(channels,length,rate){const samples=new Float32Array(length);return {duration:length/rate,getChannelData:()=>samples};}},
  cue:key=>{assert.equal(key,'crt_static');return {duration:10};},
  emit(bus,opts){assert.equal(bus,'sfx');assert(!opts.loop);emitted.push(opts);return {stop(){stopped++;}};}
});
for(const kind of ['attack-swell','attack-contact','news-static'])attackAudio.play(kind);
assert.equal(emitted[0].buffer.duration,2.25);assert.equal(emitted[1].buffer.duration,.4);assert.equal(emitted[2].duration,.65);
for(const e of emitted.slice(0,2)){
  const samples=e.buffer.getChannelData(0);assert(samples.every(Number.isFinite));
  assert(Math.max(...samples.map(Math.abs))>.05);assert(Math.abs(samples[0])<1e-5&&Math.abs(samples.at(-1))<.005,'audio clicks at envelope boundary');
}
attackAudio.dispose();assert.equal(stopped,3,'ending cancellation leaked attack/static audio');
console.log('PASS: low swell, slash/low impact and existing static use owned finite SFX envelopes and dispose completely.');
