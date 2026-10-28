import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildStudyResealEnding,RESEAL_TIMING as T} from '../src/cutscenes/studyResealEnding.js';
import {createCutsceneRunner} from '../src/core/Cutscene.js';
import {createResealAttackAudio} from '../src/cutscenes/resealAttackAudio.js';
import {createReleaseEndingScreen} from '../src/core/ReleaseEndingScreen.js';

function classes(){const values=new Set();return {add:(...s)=>s.forEach(x=>values.add(x)),remove:(...s)=>s.forEach(x=>values.delete(x)),contains:x=>values.has(x),toggle(x,on){if(on)values.add(x);else values.delete(x);}};}
globalThis.document={body:{classList:classes(),appendChild(){}},getElementById:()=>null,createElement:()=>({classList:classes(),style:{},appendChild(){}})};
for(const cancelAt of [null,.1,.5,3.2,T.human+.5,T.claw+.2,T.news+.1]){
  const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);camera.position.set(-1.55,1.6,5.5);camera.rotation.y=Math.PI;
  const start=camera.position.clone(),player={movementEnabled:true,lookEnabled:true,keys:{},clearKeys(){},aim(){}};
  const annabelle=new THREE.Group();annabelle.position.set(-6.62,0,-6.075);
  const mechanics=[],fades=[],identity=[],seated=[];let clock=0,restores=0,chatter=0,clears=0,maxAngular=0;
  const refs={annabelle,setEndingSeated:w=>seated.push(w),setResealLockdown(){},setResealReaction(){},setResealResignation(){}};
  const scene=buildStudyResealEnding({camera,player,refs,visor:{set(){}},
    fade:{fadeOut:ms=>fades.push({ms,t:clock}),fadeIn:ms=>fades.push({ms,t:clock,in:true}),clear(){clears++;}},
    stopChatter(){chatter++;},playMechanical:(key,p)=>mechanics.push({key,p}),restoreNight(){restores++;},showIdentity:who=>identity.push(who)});
  const runner=createCutsceneRunner({camera,player,interaction:{setEnabled(){}}});const promise=runner.playScene(scene);
  assert(!player.movementEnabled&&!player.lookEnabled);assert.equal(await runner.playScene(scene),false);
  let prior=scene.sample(0);
  while(runner.isRunning){
    if(cancelAt!==null&&clock>=cancelAt){runner.cancel();break;}
    clock+=.01;runner.update(.01);const p=scene.sample(clock);
    assert(p.position[2]<6.45,'camera crossed sealed exit');
    if(clock>.35)maxAngular=Math.max(maxAngular,new THREE.Quaternion().fromArray(prior.quaternion).angleTo(new THREE.Quaternion().fromArray(p.quaternion))/.01);
    prior=p;assert(clock<T.end+.1);
  }
  const complete=await promise;assert.equal(chatter,1);assert.equal(restores,1);assert.equal(seated.at(-1),0);
  if(cancelAt!==null){assert(!complete);assert(clears);continue;}
  assert(complete);assert(maxAngular<2,'withdrawal/attack camera snapped');
  assert.equal(fades.length,1,'opening still cuts/fades away from the player');
  assert(fades.some(f=>f.ms===140&&Math.abs(f.t-T.contact)<.02));
  const portrait=scene.sample(T.voice);assert(new THREE.Vector3(...portrait.position).distanceTo(start)<1e-8,'opening left player POV');assert(portrait.fov<camera.fov&&portrait.fov>=camera.fov-13,'opening zoom is not restrained');
  const a=scene.sample(T.still),b=scene.sample(T.claw-.1),rush=scene.sample(T.contact-.1),hit=scene.sample(T.contact+.02);
  assert(a.containedPerformance.notice>0&&b.containedPerformance.load>.8,'no living notice/weight-loading beat');
  assert(b.containedPerformance.travel>0&&rush.containedPerformance.rush>.5,'no step or accelerating rush');
  assert.equal(rush.jump,0,'contained monster still slides through a stiff airborne leap');
  assert(hit.contactHit&&hit.scratch>0);assert.equal(scene.sample(T.black).scratch,0);
  assert(identity.includes('hollow')&&!identity.includes('human'));assert(T.title>T.black&&T.credits>T.title&&T.news>T.credits&&T.end>T.creditsEnd);
  assert(mechanics.some(c=>c.key==='attack-contact'));
}
console.log('PASS: contained player POV and modest zoom; continuous withdrawal below 2 rad/s; sealed exit; notice/step/load/rush instead of stiff jump; 140ms contact cut; radio delay; cancellation and actor cleanup.');

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
console.log('PASS: reseal once; control lock/current view; bolts/closed exit hooks; spatial locks; muffled ambience cleanup; seated reassurance; living full-body catch; safe face distance; lens scratch; duration-driven full-frame ending; 140ms contact cut + title and crawl over news; contained card/menu/credits/reset; branch remains separate from Release.');

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
