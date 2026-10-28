import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildStudyReleaseEnding,RELEASE_TIMING as T} from '../src/cutscenes/studyReleaseEnding.js';
import {createCutsceneRunner} from '../src/core/Cutscene.js';
import {createReleaseEndingScreen} from '../src/core/ReleaseEndingScreen.js';

function classes(){const values=new Set();return {add:(...s)=>s.forEach(x=>values.add(x)),remove:(...s)=>s.forEach(x=>values.delete(x)),contains:x=>values.has(x),toggle(x,on){if(on)values.add(x);else values.delete(x);}};}
globalThis.document={body:{classList:classes(),appendChild(){}},getElementById:()=>null,
  createElement:()=>({classList:classes(),style:{},appendChild(){}})};
for(const cancelAt of [null,.2,2,8.25,9.8,19.6]){
  const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);camera.position.set(1.55,1.6,5.5);camera.rotation.y=Math.PI;
  const start=camera.position.clone(),initial=camera.quaternion.clone();
  const player={movementEnabled:true,lookEnabled:true,keys:{},clearKeys(){},aim(yaw,pitch){camera.rotation.set(pitch,yaw,0,'YXZ');}};
  const interaction={enabled:true,setEnabled(on){this.enabled=on;}};
  const calls=[],identity=[],visor=[],reactions=[],seated=[];let elapsed=0,night=false,stopped=0;
  const refs={setEndingSeated:w=>seated.push(w),setReleaseDoorOpen:on=>calls.push({on,t:elapsed}),setReleaseReaction:(point,weight,soften)=>reactions.push({point,weight,soften})};
  const fade={fadeOut(ms){assert.equal(ms,140);calls.push({fade:true,t:elapsed});},clear(){calls.push({clear:true});}};
  const scene=buildStudyReleaseEnding({camera,player,refs,fade,visor:{set:on=>visor.push({on,t:elapsed})},
    stopChatter(){stopped++;},playMechanical:(key,position)=>calls.push({key,position}),startNight(){night=true;},stopNight(){night=false;},
    showIdentity:(who,pose)=>identity.push({who,t:elapsed,pose})});
  const runner=createCutsceneRunner({camera,player,interaction});
  assert.equal(scene.letterbox,false);assert(T.black>=15&&T.black<=26);
  const promise=runner.playScene(scene);
  assert(!document.body.classList.contains('cutscene-letterbox'));
  assert(!player.movementEnabled&&!player.lookEnabled&&!interaction.enabled);
  assert(camera.position.distanceTo(start)<1e-8);assert(camera.quaternion.angleTo(initial)<1e-8);
  assert.equal(await runner.playScene(scene),false,'duplicate release started a second cinematic');
  let prior=scene.sample(0),maxSpeed=0,maxAngular=0,maxCalmAngular=0;
  while(runner.isRunning){
    if(cancelAt!==null&&elapsed>=cancelAt){runner.cancel();break;}
    elapsed+=.01;runner.update(.01);
    const pose=scene.sample(Math.min(T.end,elapsed));
    const angular=new THREE.Quaternion().fromArray(prior.quaternion).angleTo(new THREE.Quaternion().fromArray(pose.quaternion))/.01;
    maxAngular=Math.max(maxAngular,angular);if(elapsed<T.claw)maxCalmAngular=Math.max(maxCalmAngular,angular);
    maxSpeed=Math.max(maxSpeed,new THREE.Vector3(...pose.position).distanceTo(new THREE.Vector3(...prior.position))/.01);prior=pose;
    assert(elapsed<T.end+.1);
  }
  const completed=await promise;
  assert.equal(seated.at(-1),0,'seated pose leaked after end/cancel');assert.equal(stopped,1);assert(!night,'rain layer leaked');
  if(cancelAt!==null){assert(!completed);assert(calls.some(c=>c.clear));continue;}
  assert.equal(Math.max(...seated),1);assert(completed);assert(maxCalmAngular<2.5&&maxAngular<4,'release camera snaps outside the short impact correction');assert(maxSpeed<1.8,'exit walk became a sprint or snapped');
  assert.deepEqual(calls.filter(c=>c.key).map(c=>c.key),['deadbolt_open','padlock_open','latch','latch','visor_off','cloth','roar']);
  assert(calls.filter(c=>c.key).some(c=>c.position[2]<0),'release locks did not travel through house');
  assert.equal(calls[0].on,false);assert(calls.some(c=>c.on===true&&Math.abs(c.t-T.door)<.02));
  assert(reactions.some(r=>r.point?.z===6.9)&&reactions.some(r=>r.point?.x===start.x),'missing restrained exit/back reaction');
  assert(Math.abs(T.walkEnd-T.walk-6.2)<1e-8);
  assert(T.remove<T.walk,'visor must be off before exit walk');
  const external=scene.sample(T.hollow),lens=new THREE.PerspectiveCamera(external.fov,16/9,.05,100);
  lens.position.fromArray(external.position);lens.quaternion.fromArray(external.quaternion);lens.updateMatrixWorld(true);
  const chest=new THREE.Vector3(...external.bodyPosition).add(new THREE.Vector3(0,1.3,0)).project(lens);
  assert(Math.abs(chest.x)<.1&&Math.abs(chest.y)<.1&&Math.abs(chest.z)<1,'third-person camera faces away from actual body');
  assert(external.position[2]<9.05,'external camera crossed the porch gate');
  assert(external.position[1]>1.4&&external.position[1]<1.5,'escape reveal camera must stay at the lowered eye level');
  assert(external.glitch>0&&!external.visorWorn,'release swap needs its own glitch with goggles off');
  assert(scene.sample(T.walkEnd).position[2]>7.5,'camera did not leave the house');
  assert.deepEqual(visor.map(v=>v.on),[true,false]);
  assert(Math.abs(visor[1].t-T.remove)<.02);
  const visible=identity.filter(p=>p.who);
  assert.equal(visible[0].who,'human');assert(visible.some(p=>p.who==='hollow'));
  assert(Math.abs(T.claw-T.still-2.25)<1e-8);
  assert(Math.abs(T.contact-T.claw-.9)<1e-8);
  assert(Math.abs(T.black-T.contact-.14)<1e-8);
  const attack=scene.sample(T.claw+.65),hit=scene.sample(T.contact+.02);
  assert(attack.jump===0&&attack.containedPerformance.rush>.3&&attack.containedPerformance.strike>=0,'release did not inherit the shared planted catch/slash');
  assert(hit.slash>.99&&hit.scratch>0&&hit.contactHit&&hit.distortion===1,'release gashes/impact effects missing');
  assert(scene.sample(T.black).scratch===0,'release overlay persists over black');
  assert(calls.some(c=>c.fade&&Math.abs(c.t-T.fade)<.02));assert(T.black<T.title&&T.title<T.credits&&T.credits<T.news&&T.newsEnd<T.creditsEnd);
}

// End card/menu/credits actions and delayed-button cleanup use real screen controller.
const elements={actions:{hidden:true},menu:{addEventListener(_,fn){this.click=fn;},focus(){}},credits:{addEventListener(_,fn){this.click=fn;}}};
const root={classList:classes(),querySelector:key=>key.includes('actions')?elements.actions:key.includes('menu')?elements.menu:elements.credits};
let timer=null,menuCalls=0,creditsCalls=0;
const ui=createReleaseEndingScreen({root,onMenu:()=>menuCalls++,onCredits:()=>creditsCalls++,setTimer(fn,ms){assert.equal(ms,2000);timer=fn;return 1;},clearTimer(){timer=null;}});
ui.show();assert(elements.actions.hidden);timer();assert(!elements.actions.hidden);assert.equal(menuCalls,0);
elements.credits.click();assert.equal(creditsCalls,1);assert(root.classList.contains('hidden'));
ui.show({ready:true});elements.menu.click();assert.equal(menuCalls,1);
ui.show();ui.hide();assert.equal(timer,null,'reset left ending buttons scheduled');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(main.includes("window.addEventListener('study:release-chosen'"));
// The separate reseal implementation must not alter this release regression.
assert(main.includes('releaseEndingGeneration++;releaseEndingScreen.hide();endingInFlight=false;'));
assert(main.includes("gameState.endingChosen='released'"));
assert(main.includes("menuOverlayState==='release-ending'&&gameState.endingChosen==='released'"));
assert(main.includes("document.body.classList.add('ending-cinematic')"));
assert(main.includes("document.body.classList.remove('ending-cinematic')"));
assert(main.includes('createEndingBodyPresentation({human:playerBody,hollow:creature'));
const css=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
for(const selector of ['#hud','#crosshair','#fps-counter'])assert(css.includes('body.ending-cinematic '+selector));
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const text of ['ENDING: RELEASED','Return to Main Menu'])assert(html.includes(text));
for(const text of ['Annabelle lived.','HOLLOW got out.'])assert(!html.includes(text));
console.log('PASS: release once; current-camera control lock; physical locks/door; restrained Annabelle reaction; duration-driven full-frame ending; Annabelle-facing concern beat; 6.2s walk outside; porch-gate-safe third-person Human/monster glitch and claw; 140ms contact fade; movie title and flat credits over Released news; end card/menu/credits; cancellation/reset cleanup; polished release regression.');
