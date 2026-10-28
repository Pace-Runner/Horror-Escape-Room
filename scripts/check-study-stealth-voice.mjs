import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseAst} from 'rollup/parseAst';
import {createMarkThoughts} from '../src/systems/MarkThoughts.js';
import {CaptionSequencer} from '../src/core/CaptionSequencer.js';
import {STUDY_STEALTH_LINES} from '../src/story/studyStealthVoice.js';
import {createStudyStealthVoice,nearStudyHidingSpot} from '../src/systems/StudyStealthVoice.js';
assert.deepEqual(Object.keys(STUDY_STEALTH_LINES).map(k=>k.slice(-2)),['01','02','03','04','05','07']);
for(const [file] of Object.values(STUDY_STEALTH_LINES))assert(fs.statSync('src/assets/audio/Dont Let it out Mark voice/'+file).size>1000);
assert.equal(STUDY_STEALTH_LINES.l3_stealth_03[1],'I could hide in there... just stay quiet.');
function harness(){
  let scene=true,encounter=false,canSpeak=true,near=false;const played=[],captions=[];
  const el={textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}},surface=new CaptionSequencer(el);
  surface.isVoiced=line=>!!line?.recorded;const say=surface.say.bind(surface);surface.say=line=>{captions.push(line);return say(line);};
  const audio={ctx:{currentTime:0},voiceSource:null,voiceRequest:null,hasVoice:()=>true,preloadVoice:async()=>({duration:3}),
    playVoice(voice,options){assert(!this.voiceSource,'overlapping voices');const source={voice,options};this.voiceSource=source;this.voiceRequest={priority:options.priority};played.push(source);options.onStarted({duration:3},source);return true;},
    stopVoice(){const old=this.voiceSource;this.voiceSource=null;this.voiceRequest=null;old?.options.onInterrupted?.();}};
  const thoughts=createMarkThoughts(audio,{captions:surface});
  const ctrl=createStudyStealthVoice({thoughts,audio,captions:surface,isSceneCurrent:()=>scene,isEncounterCurrent:()=>encounter,
    canSpeak:()=>canSpeak,isNearHideSpot:()=>near});
  return {ctrl,audio,thoughts,played,captions,surface,setScene:v=>scene=v,setEncounter:v=>encounter=v,setNear:v=>near=v,setReady:v=>canSpeak=v,
    end(){const old=audio.voiceSource;assert(old);audio.voiceSource=null;audio.voiceRequest=null;audio.ctx.currentTime+=3;old.options.onEnded();ctrl.update();}};
}
{
  const h=harness();h.ctrl.hideApproached();h.ctrl.throwablePicked('studyBook');assert(!h.ctrl.begin());assert.equal(h.played.length,0);
  h.setEncounter(true);h.setScene(false);assert(!h.ctrl.begin());h.setScene(true);
  // A live important recording owns the bus; the blackout waits instead of cutting it off.
  h.audio.voiceSource={options:{}};h.audio.voiceRequest={priority:60};assert(h.ctrl.begin());assert.equal(h.played.length,0);
  h.ctrl.creatureEntered();h.ctrl.breakerNeeded();h.setNear(true);h.ctrl.update();h.ctrl.throwablePicked('studyBook');h.ctrl.throwablePicked('studyGlass');
  h.audio.stopVoice();h.ctrl.update();assert(h.played[0].voice.includes('_01_'));
  for(let i=0;i<5;i++)h.end();
  assert.deepEqual(h.played.map(s=>s.voice.match(/stealth_(\d+)/)[1]),['01','02','05','03','04']);
  assert(h.captions.every(c=>c.speaker==='MARK'&&c.recorded&&c.manualEnd&&c.duration===3));
  h.setNear(false);h.ctrl.update();h.setNear(true);h.ctrl.update();h.ctrl.hideApproached();h.ctrl.throwablePicked('studyBook');
  assert.equal(h.played.length,5,'encounter event repeated');
  h.setEncounter(false);assert(h.ctrl.restored());assert(h.audio.voiceSource.voice.includes('_07_'),'power-restored line was delayed');
  h.end();assert(!h.ctrl.restored());assert.equal(h.ctrl.pendingCount,0);assert(!h.ctrl.begin());
}
{
  const h=harness();h.setEncounter(true);h.setNear(true);h.ctrl.begin();h.ctrl.creatureEntered();h.ctrl.breakerNeeded();
  h.end();h.end();h.end();assert.equal(h.played.length,3,'already standing near cover became an approach');
  h.setNear(false);h.ctrl.update();h.setNear(true);h.ctrl.update();assert(h.audio.voiceSource.voice.includes('_03_'));
}
for(const reason of ['caught','cancel','scene','cutscene']){
  const h=harness();h.setEncounter(true);h.ctrl.begin();h.ctrl.creatureEntered();h.ctrl.breakerNeeded();h.ctrl.throwablePicked('studyGlass');
  const stale=h.audio.voiceSource;
  if(reason==='caught')h.ctrl.caught();else if(reason==='scene'){h.setScene(false);h.ctrl.update();}else if(reason==='cutscene')h.ctrl.cancelPending();else h.ctrl.cancel();
  assert.equal(h.ctrl.pendingCount,0);assert.equal(h.audio.voiceSource,null);assert(!h.surface.isVisible);
  stale.options.onEnded();h.ctrl.update();assert.equal(h.played.length,1,'cancelled introduction resumed');
  if(reason==='caught'){
    h.ctrl.resume();h.ctrl.hideApproached();assert(h.audio.voiceSource.voice.includes('_03_'),'fresh event after recovery was lost');
    h.ctrl.caught();h.setEncounter(false);h.ctrl.restored();assert(h.audio.voiceSource.voice.includes('_07_'));
  }
}
const spots={hideSpots:[{floorY:0,checkPoint:[0,0]},{floorY:3.1,checkPoint:[4,0]}],cover:[{floorY:0,minX:8,maxX:10,minZ:0,maxZ:2}]};
assert(nearStudyHidingSpot({x:0,z:.5,groundY:0},spots));assert(nearStudyHidingSpot({x:7,z:1,groundY:0},spots));
assert(!nearStudyHidingSpot({x:4,z:0,groundY:0},spots),'different-floor spot counted');assert(nearStudyHidingSpot({x:4,z:0,groundY:3.1},spots));
// Exercise the actual one-shot admission guard before its script can alter the world.
const main=fs.readFileSync('src/main.js','utf8'),all=[];
function visit(n){if(!n?.type)return;all.push(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}visit(parseAst(main));
const start=all.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='startStudyBlackout');
let starts=0;const puzzle={hasArchiveKey:false,blackoutStage:'none'};
const context=vm.createContext({sceneManager:{activeKey:'study'},study:{refs:{puzzle,blackout:{isOut:false}}},objectiveEl:{textContent:'Puzzle'},studyObjectiveBefore:'',studyScript:{run(){starts++;}}});
vm.runInContext(main.slice(start.start,start.end),context);
context.startStudyBlackout('teaser');assert.equal(starts,0,'crest solution started encounter before key pickup');
puzzle.hasArchiveKey=true;context.startStudyBlackout('teaser');assert.equal(starts,1);
context.startStudyBlackout('teaser');context.startStudyBlackout('hunt');assert.equal(starts,1);
puzzle.blackoutStage='teaserDone';context.startStudyBlackout('teaser');context.startStudyBlackout('hunt');assert.equal(starts,1);
context.sceneManager.activeKey='backrooms';puzzle.blackoutStage='none';context.startStudyBlackout('teaser');assert.equal(starts,1);
const restore=all.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='onStudyBreakerThrown');
let cancelled=0,restored=0;
Object.assign(context,{studySeeker:null,studyScript:{cancel(){cancelled++;}},endStudyStalk(){},clearStudyShards(){},captions:{play(){}},line:()=>[],studyStealthVoice:{restored(){restored++;}}});
vm.runInContext(main.slice(restore.start,restore.end),context);puzzle.blackoutStage='teaser';
context.onStudyBreakerThrown('teaser');context.onStudyBreakerThrown('teaser');
assert.equal(cancelled,1,'breaker did not cancel pending entrance/resume script');assert.equal(restored,1);assert.equal(puzzle.blackoutStage,'teaserDone');
const studySource=fs.readFileSync('src/levels/studyLevel.js','utf8');
assert(studySource.slice(studySource.indexOf("label: 'Take the Archive Key'"),studySource.indexOf('shadowCrest.add(archiveKeyHit)')).includes('onCrestKeyTaken()'));
const visor=all.find(n=>n.type==='Property'&&n.key.name==='onTakeVisor');assert(!main.slice(visor.start,visor.end).includes('startStudyBlackout'));
for(const name of ['onStudyCaught','stopStudyHideAndSeek','freezePlayerForTransition']){
  const fn=all.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(main.slice(fn.start,fn.end).includes('studyStealthVoice.'),'missing voice cleanup '+name);
}
console.log('PASS: six exact assets/no 06; shared MARK/audio-ended captions; 01→02→05 ordering; event-only hide/pickup once; no important-voice interruption; immediate 07; catch/cutscene/scene/reset cancellation; real key-only once-per-run guard; no visor restart.');
