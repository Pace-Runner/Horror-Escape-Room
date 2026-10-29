import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {CaptionSequencer} from '../src/core/CaptionSequencer.js';
import {createStudyArrivalVoice} from '../src/systems/StudyArrivalVoice.js';
import {createMarkThoughts} from '../src/systems/MarkThoughts.js';
import {MARK_THOUGHTS} from '../src/story/markThoughts.js';
import {ageStudySheets,gatherMiddleCurtain} from '../src/levels/studyVisualPolish.js';
import {createStudyMinimap} from '../src/levels/studyMinimap.js';
import {MINIMAP_ONLY} from '../src/core/RenderLayers.js';
import {heldViewBounds,keepHeldItemClear} from '../src/core/HeldViewBounds.js';
import {LEFT_TORCH_FRAMING} from '../src/core/LeftTorch.js';
import {HELD_ITEM_FRAMING} from '../src/core/HeldItems.js';
const ENDING_CHOICE_OBJECTIVE='MAKE YOUR CHOICE — RELEASE OR RESEAL';
import {enterImmersive} from '../src/core/KeyboardGuard.js';
function classes(){const c=new Set();return{add:(...v)=>v.forEach(x=>c.add(x)),remove:(...v)=>v.forEach(x=>c.delete(x)),toggle(x,on){if(on)c.add(x);else c.delete(x);},contains:x=>c.has(x)};}
const el={style:{},classList:classes(),textContent:''},captions=new CaptionSequencer(el);
captions.isVoiced=line=>Boolean(line?.recorded||line?.voice==='existing.mp3');
captions.setEnabled(false);
for(const speaker of ['MARK','ANNABELLE','NEWS','NARRATION']){
  captions.say({text:'Spoken words',speaker,recorded:true,manualEnd:true});assert(el.classList.contains('visible'),speaker+' was hidden');
  captions.setEnabled(true);captions.setEnabled(false);assert(el.classList.contains('visible'));
}
captions.cancel();captions.say({text:'An environmental observation.',descriptive:true});assert(!el.classList.contains('visible'));
captions.setEnabled(true);assert(el.classList.contains('visible'));captions.setEnabled(false);assert(!el.classList.contains('visible'));
for(const line of [{text:'Requested hint',hint:true,always:true},{text:'Required interaction',functional:true},
  {text:'Hold the paperclip',key:'dialog_cuff_hold_paperclip'},{text:'Wrong code',key:'dialog_wrong_code_1'},
  {text:'Actual recording',voice:'existing.mp3'}]){
  captions.say(line);assert(el.classList.contains('visible'));
}
assert(!captions._shows({recorded:true,voicePending:true}),'caption appeared before audio started');

let ready=false,current=true,voice=null;const recordings=[];
const audio={ctx:{currentTime:0},hasVoice:()=>true,preloadVoice:async()=>({duration:2}),playVoice(key,callbacks){
  this.stopVoice();voice={key,callbacks};this.voiceSource=voice;recordings.push(key);callbacks.onStarted({duration:2},voice);return true;
},stopVoice(){const old=voice;voice=null;this.voiceSource=null;old?.callbacks.onInterrupted?.();}};
const thoughts=createMarkThoughts(audio),arrival=createStudyArrivalVoice({thoughts,isCurrent:()=>current,isReady:()=>ready});
arrival.arm();arrival.update();assert.equal(recordings.length,0,'arrival spoke during loading/fade');
ready=true;arrival.update();assert(recordings[0].endsWith('BACKROOMS/backrooms_thought_06_the_study.mp3'));
assert.equal(thoughts.play('l3_01'),false,'normal puzzle thought interrupted study arrival');
const endVoice=()=>{const old=voice;voice=null;audio.voiceSource=null;old.callbacks.onEnded();};
endVoice();assert(recordings[1].endsWith('BACKROOMS/backrooms_thought_07_why_know_it.mp3'));endVoice();
arrival.arm();arrival.update();assert.equal(recordings.length,2,'arrival repeated this run');
arrival.reset();thoughts.clear({reset:true});ready=false;arrival.arm();arrival.cancel();ready=true;arrival.update();assert.equal(recordings.length,2);
arrival.arm();current=false;arrival.update();current=true;arrival.update();assert.equal(recordings.length,2,'arrival leaked across scene change');
for(const key of ['backrooms_06','backrooms_07'])assert(fs.statSync('src/assets/audio/Dont Let it out Mark voice/'+MARK_THOUGHTS[key][0]).size>0);

const clothRoot=new THREE.Group(),cloth=new THREE.Mesh(new THREE.PlaneGeometry(2,2,8,8),new THREE.MeshStandardMaterial({name:'Dust sheet cream linen'}));
cloth.position.y=1;clothRoot.add(cloth);const count=cloth.geometry.attributes.position.count,indexCount=cloth.geometry.index.count;
ageStudySheets(clothRoot);assert.equal(cloth.geometry.attributes.position.count,count);assert.equal(cloth.geometry.index.count,indexCount);
assert.equal(cloth.geometry.attributes.uv.count,count);assert.equal(cloth.geometry.attributes.color.count,count);assert.equal(cloth.material.map,null);assert(cloth.material.bumpMap&&cloth.material.roughness>.95);
const curtain=new THREE.Group();
for(let i=0;i<4;i++){const strip=new THREE.Mesh(new THREE.PlaneGeometry(.225,5.7,2,12));strip.geometry.translate(0,-2.85,0);strip.position.set(-.3375+i*.225,5.75,0);strip.name='Strip_'+i;curtain.add(strip);}
const before=curtain.children.map(s=>s.geometry.attributes.position.array.slice());gatherMiddleCurtain(curtain);
let gathered=0;
curtain.children.forEach((strip,k)=>{const p=strip.geometry.attributes.position;
  assert.equal(p.array.length,before[k].length);
  for(let i=0;i<p.count;i++){
    if(p.getY(i)+strip.position.y<1.7)assert(Math.abs(p.getX(i)-before[k][i*3])<1e-6,'hiding cover footprint changed');
    if(p.getY(i)+strip.position.y>3&&p.getY(i)+strip.position.y<4){assert(p.getX(i)>before[k][i*3]);gathered++;}
  }
});assert(gathered>0);

const room=new THREE.Group(),map=createStudyMinimap(room,{width:16,depth:13,loftFrontZ:-.7,stairX:7.25,stairWidth:1.5,stairTopZ:-1.88,stairBottomZ:2.6,entryZ:4.8,entryWidth:1.5,exitWidth:1.8});
assert(map.exclusive&&map.mode==='overview');assert.deepEqual(map.bounds,{minX:-8,maxX:8,minZ:-6.5,maxZ:6.5});
room.getObjectByName('Study_Minimap_Plan').traverse(object=>assert.equal(object.layers.mask,1<<MINIMAP_ONLY));
const mapCamera=new THREE.OrthographicCamera(-8.32,8.32,8.32,-8.32,.1,40);mapCamera.position.set(0,16,0);mapCamera.up.set(0,0,-1);mapCamera.lookAt(0,0,0);mapCamera.updateMatrixWorld();
for(const [x,z] of [[6.9,4.8],[-7,-5],[7.25,2.6],[0,6.5]]){const projected=new THREE.Vector3(x,0,z).project(mapCamera);assert(Math.abs((projected.x+1)*90-(90+x*180/16.64))<1e-7);assert(Math.abs((1-projected.y)*90-(90+z*180/16.64))<1e-7);}

const camera=new THREE.PerspectiveCamera(70,16/9,.05,100),viewRoot=new THREE.Group();camera.add(viewRoot);
const item=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.3));viewRoot.add(item);viewRoot.position.set(.3,-.2,-.06);
keepHeldItemClear(camera,item,viewRoot);assert(heldViewBounds(camera,item).max.z<=-.12+1e-7);
const z=viewRoot.position.z;camera.rotation.set(.7,1.4,0);keepHeldItemClear(camera,item,viewRoot);assert(Math.abs(viewRoot.position.z-z)<1e-7,'look angle changed held-item clearance');
assert(LEFT_TORCH_FRAMING.position[2]<=-.5&&LEFT_TORCH_FRAMING.position[0]<-.25);assert.equal(HELD_ITEM_FRAMING.visor.scale,.5);

const main=fs.readFileSync('src/main.js','utf8'),html=fs.readFileSync('index.html','utf8');
assert(main.includes('minPitch: -0.78'));assert(main.includes("return 'Pick lock'"));
assert(!fs.readFileSync('src/levels/backroomsLevel.js','utf8').includes("onThought('backrooms_06'"));
assert(main.includes("if(key==='study')studyArrival.arm()"));assert(main.includes("objectiveEl.textContent = '"+ENDING_CHOICE_OBJECTIVE+"'"));
assert(!main.includes("contextPanels.update("));
assert(!fs.readFileSync('src/core/OpeningNewsCutscene.js','utf8').includes('captionsEnabled'));
assert(html.includes('Descriptive Captions'));

const node=()=>({children:[],hidden:false,appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];}});
globalThis.document={createElement:()=>node(),documentElement:{requestFullscreen(){throw new Error('denied');}},fullscreenElement:null};
let difficultyOpened=0;
const startBody=main.match(/menuStartButton.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/)[1];
new Function('enterImmersive','showDifficultyChoice',startBody)(enterImmersive,()=>difficultyOpened++);assert.equal(difficultyOpened,1,'fullscreen denial blocked Start');
/* Retired large context panels.
const panel=node(),ui=createContextPanels(panel);
ui.update({breaker:{capacity:60,load:85,tripped:false,circuits:[{id:'cctv',label:'CCTV',loadInAmps:15,on:true}]}});
let text=panel.children.map(c=>c.textContent).join(' ');assert(text.includes('85A / 60A')&&text.includes('Camera network')&&text.includes('OVER CAPACITY'));
for(const choice of ['RELEASE','RESEALED']){ui.update({choice});text=panel.children.map(c=>c.textContent).join(' ');assert(text.includes(CHOICE_CONSEQUENCES[choice])&&text.includes('This decision cannot be undone.'));}
ui.update();assert(panel.hidden);
*/
console.log('PASS: always-on speech/descriptive-only toggle, requested help; original study arrival once after transition with priority; cloth UV/age and right-gathered curtain without new triangles/cover changes; accurate exclusive study plan/player projection; held-object clearance; Pick lock and pitch limit; fullscreen denial fallback; breaker load/overload and post-reveal irreversible choice UI.');
