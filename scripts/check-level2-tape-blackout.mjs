import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseAst} from 'rollup/parseAst';
import {createMarkThoughts} from '../src/systems/MarkThoughts.js';
function nodes(source){const out=[];function visit(n){if(!n?.type)return;out.push(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}visit(parseAst(source));return out;}
const source=fs.readFileSync('src/levels/hallwayBasementLevel.js','utf8'),ast=nodes(source);
const fn=name=>{const n=ast.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return source.slice(n.start,n.end);};
const complete=ast.find(n=>n.type==='Property'&&n.key.name==='completeTapeAftermath').value;
const door=ast.find(n=>n.type==='AssignmentExpression'&&source.slice(n.left.start,n.left.end)==='metalDoor.userData.interact');
const doorUse=door.right.properties.find(n=>n.key.name==='onInteract').value;
assert.equal(ast.filter(n=>n.type==='CallExpression'&&n.callee.name==='triggerBlackout').length,1,'a door/desk/timer still trips power');
assert(!source.includes('updateBlackoutTriggers')&&!source.includes('startBlackoutTimer'));
const main=fs.readFileSync('src/main.js','utf8'),mainAst=nodes(main);
const aftermath=mainAst.find(n=>n.type==='Property'&&n.key.name==='onTapeEnded').value;
const events=[],plays=[];let current=null;
const audio={ctx:{currentTime:0},hasVoice:()=>true,preloadVoice:async()=>({duration:2}),
  playVoice(key,opts){this.stopVoice();current={key,opts};this.voiceSource=current;plays.push(key);opts.onStarted({duration:2},current);return true;},
  stopVoice(){const old=current;current=null;this.voiceSource=null;old?.opts.onInterrupted?.();}};
const thoughts=createMarkThoughts(audio),sceneManager={activeKey:'hallwayBasement'};
const context=vm.createContext({onTapeEnded:()=>{},onBlackout:e=>events.push(e.cause),
  audio,
  setAllBreakers(){},setMainLever(){},updateGeneratorControlLights(){},syncScreenSignal(){},syncMonitor(){},syncFeedRoomPower(){},
  metalDoor:{userData:{interact:{}}},DOOR_LABELS:{blackout:'Locked'},showCaption(){},line:k=>k,
  silenceTape(){},tapeFocus:{finish:fn=>fn()},markThoughts:thoughts,sceneManager,captions:{play(){}}});
vm.runInContext(`const POWER_STAGE={DEAD:'dead',LIT:'lit',BLACKOUT:'blackout',RUNNING:'running',ROUTED:'routed'};
let powerStage='dead',powerLevel=0,tapeWatchedToEnd=false,deckPlaying=false,tapeRanOut=false,generatorStepsCompleted=0,starterPulls=0,tapeBlackoutAt=null;
const breakerIsOn={cctv:true};
${['isCircuitLive','isCctvPowered','isTapePowered','isDoorPowered','triggerBlackout','finishTape'].map(fn).join('\n')}
function completeTapeAftermath()${source.slice(complete.body.start,complete.body.end)}
function useDoor()${source.slice(doorUse.body.start,doorUse.body.end)}
${main.slice(mainAst.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='updateTapeAftermath').start,mainAst.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='updateTapeAftermath').end)}
globalThis.api={get stage(){return powerStage;},get watched(){return tapeWatchedToEnd;},
  setStage(s){powerStage=s;},reset(){powerStage='lit';tapeWatchedToEnd=false;tapeBlackoutAt=null;},updateTapeAftermath,isTapePowered,isCctvPowered,finishTape,completeTapeAftermath,useDoor};`,context);
context.hallwayBasement={refs:{get tapeWatched(){return context.api.watched;},completeTapeAftermath:()=>context.api.completeTapeAftermath()}};
context.onTapeEnded=vm.runInContext('('+main.slice(aftermath.start,aftermath.end)+')',context);
assert(!context.api.isTapePowered());context.api.setStage('lit');assert(context.api.isTapePowered());assert(!context.api.isCctvPowered());
for(let i=0;i<100;i++)context.api.useDoor();assert.equal(context.api.stage,'lit');assert.equal(events.length,0);
context.api.completeTapeAftermath();assert.equal(context.api.stage,'lit','unplayed tape triggered blackout');
context.api.finishTape();assert.equal(context.api.stage,'lit','tape completion cut off Mark');
const expected=['12_hollow_is_project','14_mark_subject','15_girl_knew_him','16_started_with_him'];
for(let i=0;i<4;i++){
  assert(current.key.includes(expected[i]));assert.equal(context.api.stage,'lit');
  const old=current;current=null;audio.voiceSource=null;audio.ctx.currentTime+=2;old.opts.onEnded();
}
assert.equal(context.api.stage,'lit','blackout must wait after final audio');
audio.ctx.currentTime+=1.499;context.api.updateTapeAftermath();assert.equal(context.api.stage,'lit');
audio.ctx.currentTime+=.001;context.api.updateTapeAftermath();
assert.equal(context.api.stage,'blackout');assert.deepEqual(events,['tape']);assert(!context.api.isTapePowered());
context.api.completeTapeAftermath();assert.equal(events.length,1,'blackout repeated');
thoughts.clear({reset:true});context.api.reset();context.api.finishTape();const stale=current;
thoughts.clear({reset:true});context.api.reset();stale.opts.onEnded();assert.equal(context.api.stage,'lit','cancelled aftermath tripped a new run');
assert.equal(current,null);assert.equal(events.length,1);
context.api.setStage('routed');assert(context.api.isTapePowered()&&context.api.isCctvPowered());
console.log('PASS: cassette and all four actual Mark recordings finish, then 1.5s on the pausable audio clock before one blackout; exit cannot trip power; generator stage entered; reset/cancel cannot trip a new run.');
