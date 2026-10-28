import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAst} from 'rollup/parseAst';
import vm from 'node:vm';
import {SESSION_TAPE_SUBTITLES} from '../src/story/sessionTape.js';
const main=fs.readFileSync('src/main.js','utf8');
const ast=parseAst(main),nodes=[];
function walk(node,parents=[],visit=()=>{}){
  if(!node||typeof node!=='object'||!node.type)return;
  visit(node,parents);
  for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)walk(child,[...parents,node],visit);}else if(value?.type)walk(value,[...parents,node],visit);
}
walk(ast,[],n=>nodes.push(n));
const property=name=>nodes.find(n=>n.type==='Property'&&n.key.name===name).value;
const body=node=>main.slice(node.body.start+1,node.body.end-1);
const functionBody=name=>body(nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name));
// The post-tape group is one authored beat, with state validity, rather than four same-frame requests.
const groups=[];
new Function('silenceTape','tapeFocus','markThoughts','sceneManager','hallwayBasement','captions','line',body(property('onTapeEnded')))(
  ()=>{},{finish:fn=>fn()},{setBlocked(){},playSequence:(keys,options)=>groups.push({keys,options})},
  {activeKey:'hallwayBasement'},{refs:{tapeWatched:true,completeTapeAftermath(){}}},{play(){}},()=>[]);
assert.deepEqual(groups[0].keys,['l2_12','l2_14','l2_15','l2_16']);assert(groups[0].options.when());
const thoughts=[];
new Function('thought','script','sceneManager','generatorProgressStarted','hallwayBasement',body(property('onBlackout')))(
  (key,options)=>thoughts.push({key,options}),{run(){}},{activeKey:'hallwayBasement'},false,{refs:{powerStage:'blackout'}});
assert.equal(thoughts[0].key,'l2_21');assert.equal(thoughts[0].options.priority,40);
thoughts[0].options.onEnded();assert.equal(thoughts[1].key,'l2_22');assert(thoughts[1].options.when());
// A delayed frame catches up to the current tape sentence, never a backlog of expired speech.
const tapeCalls=[],source={currentTimeInSeconds:18,hasRecording:true};
new Function('tapePlaying','hallwayBasement','TAPE_VOICE_CUES','audio','tapeVoicesPlayed',functionBody('updateTapeSounds'))(
  true,{refs:{sessionTape:source}},SESSION_TAPE_SUBTITLES,{playVoice:(key,options)=>tapeCalls.push({key,options})},0);
assert.deepEqual(tapeCalls.map(c=>c.key),['level2/tape_03_man.m4a']);assert.equal(tapeCalls[0].options.offset(),1);
source.currentTimeInSeconds=23;assert(!tapeCalls[0].options.shouldPlay());
for(const name of ['showMainMenu','freezePlayerForTransition']){
  const b=functionBody(name);assert(b.includes('markThoughts.clear()')&&b.includes('audio.stopVoice()')&&b.includes('captions.cancel()'),name+' fails voice cleanup');
}
const activation=functionBody('activateLevel');assert(activation.includes('annabelleLetterNarration?.stop()')&&activation.includes('audio.stopVoice()'));
// These Level 1 recordings must remain deliberate interactions, never view callbacks.
const bedroom=parseAst(fs.readFileSync('src/levels/bedroomLevel.js','utf8'));
const interactions=[];
walk(bedroom,[],(node,parents)=>{
  if(node.type==='CallExpression'&&node.callee.name==='onThought'){
    assert(parents.some(n=>n.type==='Property'&&n.key.name==='onInteract'),'bedroom thought fires outside interaction');
    interactions.push(node.arguments[0].value);
  }
});
assert.deepEqual(interactions.sort(),['l1_08','l1_12','l1_17']);
for(const file of ['src/main.js','src/levels/bedroomLevel.js','src/levels/hallwayBasementLevel.js','src/levels/backroomsLevel.js']){
  walk(parseAst(fs.readFileSync(file,'utf8')),[],node=>{
    if(node.type!=='BlockStatement')return;
    const isThought=s=>s?.type==='ExpressionStatement'&&s.expression.type==='CallExpression'&&['thought','onThought'].includes(s.expression.callee.name);
    for(let i=1;i<node.body.length;i++)assert(!(isThought(node.body[i-1])&&isThought(node.body[i])),'same-frame duplicate thought calls in '+file);
  });
}
assert(!fs.readFileSync('src/levels/studyLevel.js','utf8').includes('else onThought(`l3_hint_'));
const hintNode=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='showHint'),hintCalls=[];
vm.runInNewContext('('+main.slice(hintNode.start,hintNode.end)+')(event)',{
  event:{},document:{activeElement:null},cutscene:{isRunning:false},tapePlaying:false,transitionInFlight:false,
  documentUI:{isOpen:false},pinPadUI:{isOpen:false},player:{isLocked:true},photoBoardUI:{isOpen:false},
  sceneManager:{activeKey:'study'},readHintProgress:()=>({}),getAvailableHintKeys:()=>['l3_clock'],readHintContext:()=>[],
  selectHintKey:()=> 'l3_clock',contextualHints:{show:key=>hintCalls.push(key)},thought:(key,options)=>hintCalls.push({key,options})
});
assert.equal(hintCalls[0],'l3_clock');assert.equal(hintCalls[1].key,'l3_hint_clock');assert.equal(hintCalls[1].options.priority,20);
console.log('PASS: actual L1 interaction-only hooks; L2 post-tape order and blackout validity; tape late-frame/late-decode guards; no adjacent duplicate thought triggers; menu/transition/level cleanup; H-only spoken L3 hints.');
