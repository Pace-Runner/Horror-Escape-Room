import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAst} from 'rollup/parseAst';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const clearBody=source.match(/function clearStartupFrame\(\) \{([\s\S]*?)\n\}/)[1];
const originalTarget={},originalColour={};
let target=originalTarget,colour=originalColour,alpha=.4,cleared=false;
const renderer={
  getRenderTarget:()=>target,getClearColor:()=>({clone:()=>colour}),getClearAlpha:()=>alpha,
  setRenderTarget(value){target=value;},setClearColor(value,opacity){colour=value;alpha=opacity;},
  clear(c,d,s){assert.equal(target,null);assert.equal(colour,0);assert.equal(alpha,1);assert(c&&d&&s);cleared=true;}
};
new Function('renderer','THREE',clearBody)(renderer,{Color:class {}});
assert(cleared);assert.equal(target,originalTarget);assert.equal(colour,originalColour);assert.equal(alpha,.4);
const begin=source.slice(source.indexOf('function beginGame() {'),source.indexOf('function waitForOpeningNewsContinue'));
assert(begin.indexOf('clearStartupFrame();')<begin.indexOf("startScreen.classList.add('hidden')"));
assert(source.includes('bootReady.then(() => {\n  clearStartupFrame();'));


// Execute the shipped gameplay listener; removed keys must have no effects in either mode.
const ast=parseAst(source);let listener;
function walk(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='CallExpression'&&node.callee.property?.name==='addEventListener'&&node.arguments[0]?.value==='keydown'){
  const callback=node.arguments[1];if(source.slice(callback.start,callback.end).includes('openingSequenceActive'))listener=callback;
 }
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);
}
walk(ast);assert(listener);
const handlerSource=source.slice(listener.start,listener.end);
for(const locked of [false,true])for(const scene of ['bedroom','upstairsHallway','hallwayBasement','backrooms','study']){
 const effects=[];const record=key=>()=>effects.push(key);
 const handler=new Function('openingSequenceActive','showHint','player','cutscene','KEYS_HELD_BY_CUTSCENES','studyHidden','sceneManager',
 'transitionInFlight','gameStarted','activeRun','activateLevel','prepareStudyHandoffTest','window','return '+handlerSource)(
 false,record('hint'),{isLocked:locked},{isRunning:false},new Set(),false,{activeKey:scene},false,true,
 {invalidate:record('invalidate')},record('level'),record('handoff'),{__game:{prepareStudyRevealTest:record('reveal')}});
 for(const code of [...Array.from({length:9},(_,i)=>'Digit'+(i+1)),...Array.from({length:9},(_,i)=>'Numpad'+(i+1)),'KeyG','KeyL','KeyN']){
  handler({code,preventDefault:record('prevent'),target:{closest:()=>false}});
 }
 assert.deepEqual(effects,[],scene+' developer key still active');
}
for(const code of ['KeyH','KeyI','KeyE','KeyF','KeyQ','KeyT','KeyV','KeyR','KeyK'])assert(handlerSource.includes(code),'lost player control '+code);
for(const [code,expected] of [['KeyH','hint'],['KeyI','inspect'],['KeyF','flashlight'],['KeyQ','drop'],['KeyT','view'],['KeyV','visor'],['KeyR','restart'],['KeyK','credits']]){
 const effects=[],record=key=>()=>effects.push(key);
 const env={openingSequenceActive:false,player:{isLocked:true},cutscene:{isRunning:false},KEYS_HELD_BY_CUTSCENES:new Set(),studyHidden:false,
  showHint:record('hint'),inspectHeldItem:record('inspect'),flashlightFound:true,gameState:{inventory:{has:()=>true}},flashlightSwitchOn:false,
  setFlashlight:record('flashlight'),dropHeldItem:record('drop'),thirdPerson:false,setThirdPerson:record('view'),
  visor:{toggle(){effects.push('visor');return 'none';}},showCaption(){},line:()=>[],openRestartConfirm:record('restart'),transitionInFlight:false,toggleCredits:record('credits')};
 new Function('env','with(env){return '+handlerSource+';}')(env)({code,repeat:false});
 assert.deepEqual(effects,[expected],'player control changed: '+code);
}
assert(!source.includes('skipOpeningNews'),'opening report still has keyboard bypass');
const free=fs.readFileSync(new URL('../src/core/FreeCamera.js',import.meta.url),'utf8');
assert(!free.includes('this.#listenForInput();'),'developer camera installs shortcuts');
for(const name of ['PointerLockPlayer','PinPadUI','PhotoBoardUI','DocumentUI','CutsceneSkip','Newspaper','MenuPresentation','LeaderboardUI']){
 const text=fs.readFileSync(new URL('../src/core/'+name+'.js',import.meta.url),'utf8');assert(text.includes('keydown'));
}
console.log('PASS: startup state; all digit/numpad developer jumps, G/L/N disabled across every scene; legitimate gameplay handlers and player skip/input modules preserved; no intro keyboard bypass.');
