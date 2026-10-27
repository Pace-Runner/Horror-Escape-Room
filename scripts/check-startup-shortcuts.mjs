import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const shortcut=source.slice(source.indexOf('  // Instant level previews'),source.indexOf("  if (e.code === 'KeyG') {"));
const handler=new Function('e','pinPadUI','photoBoardUI','documentUI','sceneManager','backrooms','activateLevel','abortTransition','TRANSITIONS',shortcut);
for(const [code,level] of [['Digit1','bedroom'],['Digit2','hallwayBasement'],['Digit3','study'],['Numpad3','study'],['Digit4','backrooms'],['KeyL','hallwayBasement']]){
  const calls=[];let aborted=false,prevented=false;
  const invoke=extra=>handler({code,preventDefault(){prevented=true;},...extra},{isOpen:false},{isOpen:false},{isOpen:false},
    {activeKey:'bedroom'},{setRoute(route){assert.equal(route.from,'bedroom');}},key=>calls.push(key),()=>aborted=true,{});
  invoke({});assert.deepEqual(calls,[level]);assert(aborted&&prevented);
  for(const extra of [{repeat:true},{ctrlKey:true},{target:{closest:()=>true}}]){calls.length=0;invoke(extra);assert.equal(calls.length,0);}
}
console.log('PASS: startup canvas cleared before menu removal; render state restored; production/demo shortcuts 1–4, numpad and L; repeat/modifier/text-field guards. No browser launched.');
