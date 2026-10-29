import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAst} from 'rollup/parseAst';
import {createStudyArrivalVoice} from '../src/systems/StudyArrivalVoice.js';
const main=fs.readFileSync('src/main.js','utf8');
const expression=main.match(/const levelArrivals=([\s\S]*?\n\}\)\));/)[1];
const sceneManager={activeKey:'hallwayBasement'},audio={},captions={},player={isLocked:true},documentUI={isOpen:false};
let transitioning=true;
const calls=[];
const thoughts={currentKey:null,playSequence(keys,options){calls.push({keys,options});return true;}};
const create=()=>new Function('createStudyArrivalVoice','markThoughts','sceneManager','audio','captions','player','documentUI','thought','hallwayBasement','state',`
const gameState={},caughtInFlight=false,cutscene={isRunning:false},jumpScareRunning=false;
const transitionInFlight=state.transitioning;
return ${expression};`)(createStudyArrivalVoice,thoughts,sceneManager,audio,captions,player,documentUI,(key,options)=>calls.push({key,options}),{refs:{powerStage:'dead'}},{transitioning});
let arrivals=create();arrivals[0].arm();arrivals[0].update();assert.equal(calls.length,0,'arrival started in transition');
transitioning=false;arrivals=create();arrivals[0].arm();arrivals[0].update();assert.deepEqual(calls[0].keys,['l2_01']);
calls[0].options.onEnded();assert.equal(calls[1].key,'l2_20');assert(calls[1].options.when());
arrivals[0].arm();arrivals[0].update();assert.equal(calls.length,2,'arrival replayed');
arrivals[1].arm();arrivals[1].update();assert.equal(calls.length,2,'wrong-scene arrival played');
sceneManager.activeKey='backrooms';assert(!calls[1].options.when(),'power reminder outlived scene');
arrivals[1].arm();arrivals[1].update();assert.deepEqual(calls[2].keys,['backrooms_01']);
arrivals[1].reset();arrivals[1].arm();arrivals[1].cancel();arrivals[1].update();assert.equal(calls.length,3,'cancelled arrival played');
// Execute the authored maze beat as shipped, including the room recognition tail.
const maze=fs.readFileSync('src/levels/backroomsLevel.js','utf8');
let beat;
function walk(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='CallExpression'&&node.callee.name==='onThought'&&node.arguments[0]?.value==='backrooms_03')beat=node;
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);
}
walk(parseAst(maze));const mazeCalls=[];
new Function('onThought','LEGS','name',maze.slice(beat.start,beat.end))(
 (key,options)=>mazeCalls.push({key,options}),{room:{kind:'room'}},'room');
mazeCalls[0].options.onEnded();mazeCalls[1].options.onEnded();
assert.deepEqual(mazeCalls.map(c=>c.key),['backrooms_03','backrooms_04','backrooms_05']);
assert(mazeCalls.every(c=>c.options.priority===50));
console.log('PASS: shipped L2/Backrooms arrival wiring waits for transitions, follows power state, plays once, and cancels across scenes/reset.');
