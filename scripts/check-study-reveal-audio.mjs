/** Headless reveal audio integration: no browser, profiles, or audio devices. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { REVEAL_VOICE_LINES, buildStudyReveal, createStudyRevealTiming } from '../src/cutscenes/studyReveal.js';
import { createStudyRevealAudio } from '../src/cutscenes/studyRevealAudio.js';
import { createCutsceneRunner } from '../src/core/Cutscene.js';
import { CaptionSequencer } from '../src/core/CaptionSequencer.js';
const expectedFiles = [
 'l3_mark_reveal_01_descent','l3_mark_reveal_02_memory_panic','l3_mark_reveal_03_mirror_reaction',
 'l3_annabelle_reveal_01_recognition','l3_mark_reveal_04_accusation','l3_annabelle_reveal_02_promise',
 'l3_mark_reveal_05_dont_remember','l3_annabelle_reveal_03_truth','l3_annabelle_reveal_04_override'
];
assert.deepEqual(REVEAL_VOICE_LINES.map(line=>path.basename(line.voice,'.mp3')),expectedFiles);
for (const line of REVEAL_VOICE_LINES) {
 const file=path.resolve(import.meta.dirname,'../src/assets/audio/Dont Let it out Mark voice',line.voice.slice('mark/'.length));
 assert(fs.statSync(file).size>1000,`Missing/empty recording: ${file}`);
}
const classes=()=>{const set=new Set();return {add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle(x,on=!set.has(x)){if(on)set.add(x);else set.delete(x);}};};
globalThis.document={body:{classList:classes(),appendChild(){}},createElement:()=>({classList:classes()})};

function fakeAudio() {
 const events=[],ducks=[],effects=[],breaths=[],steps=[],rates=[],oscillators=[],envelopes=[];let now=0,current=null,cancelled=0;
 const buffers=new Map(REVEAL_VOICE_LINES.map((line,i)=>[line.voice,{duration:1+(i%5)*.31}]));
 const node=()=>({connect(target){return target;},disconnect(){this.disconnected=true;}});
 return {events,ducks,effects,buffers,breaths,steps,rates,oscillators,envelopes,buses:{amb:{}},breathLevel:.035,
  ctx:{get currentTime(){return now;},
    createOscillator(){const value={...node(),frequency:{value:0},start(time){this.started=time;},stop(time){this.until=Math.min(this.until??Infinity,time);}};oscillators.push(value);return value;},
    createGain(){const points=[];envelopes.push(points);return {...node(),gain:{setValueAtTime:(v,t)=>points.push({v,t}),linearRampToValueAtTime:(v,t)=>points.push({v,t}),cancelScheduledValues(){},setTargetAtTime(){}}};},
    createBiquadFilter(){return {...node(),frequency:{value:0}};}
  },breathSource:{playbackRate:{value:1,setTargetAtTime(value){rates.push(value);}}},
  startBreathing(){},setBreathing(level){breaths.push(level);},updateFootsteps(phase,options){steps.push({phase,...options,time:now});},get now(){return now;},get current(){return current;},get cancelled(){return cancelled;},
  preloadVoice:key=>Promise.resolve(buffers.get(key)),
  stopVoice(){if(current){const old=current;current=null;cancelled++;old.callbacks.onInterrupted?.();}},
  playVoice(key,callbacks){assert(!current,'dialogue overlap');const buffer=buffers.get(key);current={key,callbacks,start:now,end:now+buffer.duration+(key===REVEAL_VOICE_LINES[0].voice?.9:0)};events.push({type:'start',key,time:now});callbacks.onStarted?.(buffer);return true;},
  duck(groups,db,options){ducks.push({groups,db,options,time:now});},cue:key=>['wood_creak','cloth','visor_on','visor_off','gasp'].includes(key)?{duration:.987,key}:null,
  emit(bus,options){effects.push({bus,options,time:now});return {stop(){}};},
  tick(dt){now+=dt;for(const oscillator of oscillators)if(now>=oscillator.until&&!oscillator.disconnected)oscillator.onended();if(current&&now+1e-9>=current.end){const old=current;current=null;events.push({type:'end',key:old.key,time:now});old.callbacks.onEnded();}}
 };
}
const audio=fakeAudio();let cancelledThoughts=0;
const adapter=createStudyRevealAudio(audio,{cancelThoughts:()=>cancelledThoughts++,position:[-7.25,.7,-5.9]});
const durations=await adapter.prepare();assert.equal(Object.keys(durations).length,9);assert(cancelledThoughts>0);
const timing=createStudyRevealTiming(durations);assert.equal(timing.lines[3].hold,durations[timing.lines[3].voice]);
const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);camera.position.set(4.4,4.7,-5.35);
const player={movementEnabled:true,lookEnabled:true,cinematic:false,groundY:3.1,keys:{},clearKeys(){this.keys={};},aim(yaw,pitch){camera.rotation.set(pitch,yaw,0,'YXZ');}};
const interaction={enabled:true,setEnabled(on){this.enabled=on;}};
const captions=new CaptionSequencer({style:{},classList:classes(),textContent:''});
const subtitleEvents=[];captions.onLineStart=line=>subtitleEvents.push({line,time:audio.now});
const acting=[],cards=[],sight=[];let completed=false,human=false,scene;
const refs={setRevealAnnabelle:on=>{human=on;},setMirrorRevealSight(){},setMirrorRevealActive(){},performAnnabelleLine:(id,hold)=>acting.push({id,hold,time:audio.now}),showRevealKeycard:()=>cards.push(audio.now)};
const creature={visible:false,correction:0,setCorrection(v){this.correction=v;},update(){},offsetBones(){}};
const runner=createCutsceneRunner({camera,player,interaction,captions});
scene=buildStudyReveal({start:camera.position.toArray(),startQuaternion:camera.quaternion.toArray(),annabelleSpot:[-7.25,-5.9],camera,player,captions,refs,creature,
 visor:{set:on=>sight.push({on,time:audio.now})},voiceDurations:durations,playDialogue:adapter.playDialogue,stopDialogue:adapter.stopDialogue,playAlert:adapter.playAlert,startSound:adapter.startSound,updateSound:adapter.updateSound,playPerception:adapter.playPerception,playMonsterReveal:adapter.playMonsterReveal,
 prepareCreature(){},restoreCreature(){creature.visible=false;},onFinish:done=>{completed=done;}});
const promise=runner.playScene(scene);assert(!player.movementEnabled&&!interaction.enabled);
let checkedDelayedCaption=false;
while(runner.isRunning){
 audio.tick(.01);captions.update(.01);runner.update(.01);
 const live=audio.current;
 if(live){assert(captions.isVisible,'subtitle disappeared before source ended');assert.equal(captions._line.voice,live.key);}
 if(live?.key===REVEAL_VOICE_LINES[0].voice&&audio.now>live.start+durations[live.key]+.8){checkedDelayedCaption=true;assert(runner.time<timing.times.walk+timing.descentAt+durations[live.key]);}
 if(!live)assert(!captions.isVisible,'subtitle survived audio end');
 assert(!(human&&creature.visible),'simultaneous perception models');
 assert(audio.now<timing.duration+3,'reveal stalled');
}
assert(await promise);assert(completed&&human&&checkedDelayedCaption);
assert(player.movementEnabled&&player.lookEnabled&&interaction.enabled&&!player.cinematic);
assert.deepEqual(audio.events.filter(e=>e.type==='start').map(e=>e.key),REVEAL_VOICE_LINES.map(e=>e.voice));
const starts=audio.events.filter(e=>e.type==='start'),ends=audio.events.filter(e=>e.type==='end');assert.equal(ends.length,9);
for(let i=1;i<9;i++){const pause=starts[i].time-ends[i-1].time;assert(pause>=REVEAL_VOICE_LINES[i-1].gap-.025,`short pause ${i}: ${pause}`);}
assert.deepEqual(subtitleEvents.map(e=>e.line.text),REVEAL_VOICE_LINES.map(e=>`${e.speaker}: ${e.text}`));
assert.deepEqual(acting.map(e=>e.id),REVEAL_VOICE_LINES.flatMap(e=>e.reactions.map(([id])=>id)));
let reactionIndex=0;
for(let i=0;i<REVEAL_VOICE_LINES.length;i++)for(const [id] of REVEAL_VOICE_LINES[i].reactions){
 const reaction=acting[reactionIndex++];assert.equal(reaction.id,id);
 assert(reaction.time>=starts[i].time-.001&&reaction.time<ends[i].time,'reaction outside spoken clip');
}
const chair=audio.effects.find(e=>e.bus==='sfx'&&e.options.buffer.key==='wood_creak');
assert(chair);assert.deepEqual(chair.options.position,[-7.25,.7,-5.9]);
assert(chair.time-ends[2].time>=.72&&chair.time-ends[2].time<=.78);
assert(sight[2].time-chair.time>=.3&&sight[2].time-chair.time<=.35);
assert(audio.effects.some(e=>e.options.buffer.key==='visor_on'&&e.options.gain===.07));
assert(audio.effects.some(e=>e.options.buffer.key==='cloth'&&e.time===chair.time));
assert(audio.effects.some(e=>e.bus==='amb'&&e.options.gain===.08));
for(let i=4;i<9;i++){
 const expected=[.45,.4,.85,.65,2.25][i-4];
 assert(Math.abs(starts[i].time-ends[i-1].time-expected)<.025,`wrong conversation gap ${i}`);
}
const revealOff=audio.effects.find(e=>e.options.buffer.key==='visor_off');
const gasp=audio.effects.find(e=>e.options.buffer.key==='gasp');
assert(revealOff&&gasp);assert.equal(revealOff.time,sight[2].time);assert.equal(gasp.time,revealOff.time);
assert.equal(audio.oscillators.length,1);assert.equal(audio.oscillators[0].frequency.value,54);
assert.equal(audio.oscillators[0].started,revealOff.time);
assert(Math.abs(audio.oscillators[0].until-revealOff.time-2.7)<.001);
assert(audio.envelopes.some(points=>points.some(p=>p.v===.018)&&points.at(-1).v===0));
assert(audio.oscillators[0].disconnected,'swell leaked nodes');
assert(audio.steps.some(s=>s.impact===1.22&&!s.silent),'missing stair impacts');
assert(audio.steps.every(s=>s.moving>0||s.silent),'stationary footstep');
assert(audio.rates.includes(1.22)&&audio.rates.includes(1.02));
assert(Math.max(...audio.breaths)>.20&&Math.min(...audio.breaths)<.075);
assert(cards[0]-ends[7].time>=2.22&&cards[0]-ends[7].time<=2.28,'missing pre-card silence');
assert(cards[0]<=starts[8].time);assert(audio.now-ends[8].time>=1.32&&audio.now-ends[8].time<=1.38,'final hold too short');
assert(audio.ducks.some(d=>d.db===-2.5)&&audio.ducks.at(-1).db===0);
adapter.dispose();assert.equal(audio.breaths.at(-1),.035);assert.equal(audio.rates.at(-1),1);assert(audio.steps.at(-1).silent);
// Cancellation invalidates callbacks and clears speech without resuming it.
let staleCompleted=false;adapter.playDialogue(timing.lines[0],()=>staleCompleted=true);adapter.dispose();audio.tick(5);assert(!staleCompleted&&!audio.current);
const invalid=fakeAudio();invalid.buffers.set(REVEAL_VOICE_LINES[2].voice,{duration:NaN});await assert.rejects(createStudyRevealAudio(invalid).prepare(),/invalid reveal audio/);
console.log('PASS: all 9 grouped assets/order; runtime buffer durations; delayed audio gates timeline and captions; non-overlap; grouped subtitles/sentence reactions; chair-side cue; 2.25s pre-card silence; final 1.35s hold; 25% ambience duck/restore; shared breathing/steps; raised creak/cloth/breathing; immediate visor-off/gasp/54Hz swell; cancellation; control hand-back. No browser launched.');
