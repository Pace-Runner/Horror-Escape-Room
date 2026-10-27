import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLetterNarration,ANNABELLE_LETTER_VOICE} from '../src/core/LetterNarration.js';
import {createDocumentUI} from '../src/core/DocumentUI.js';

assert(fs.statSync(new URL('../src/assets/audio/Dont Let it out Mark voice/LEVEL 3/anabelle_reading_letter.mp3',import.meta.url)).size>0);
const elements=new Map(),listeners=[];
function element(){
  const classes=new Set();
  return {hidden:true,style:{},scrollTop:0,clientHeight:400,scrollHeight:800,children:[],
    classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,on){if(on)classes.add(n);else classes.delete(n);}},
    addEventListener(){},removeAttribute(){},appendChild(child){this.children.push(child);},textContent:''};
}
globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
globalThis.window={addEventListener(type,fn,capture=false){listeners.push({type,fn,capture});}};
globalThis.requestAnimationFrame=fn=>fn();
let gameplaySpace=0;
window.addEventListener('keydown',e=>{if(e.code==='Space')gameplaySpace++;});
function space(repeat=false){
  const event={type:'keydown',code:'Space',repeat,timeStamp:performance.now()+10,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  for(const listener of [...listeners].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(listener.type===event.type)listener.fn(event);if(event.stopped)break;}
  assert(event.prevented&&event.stopped);return event;
}
let now=0,nextTimer=0,valid=true,closed=0,markCleared=0,captionsCleared=0,plays=0,stops=0,voice=null;
const timers=new Map(),ducks=[];
const audio={preloadVoice:key=>{assert.equal(key,ANNABELLE_LETTER_VOICE);return Promise.resolve({duration:140});},
  stopVoice(){stops++;const previous=voice;voice=null;previous?.onInterrupted?.();},
  playVoice(key,callbacks){assert.equal(key,ANNABELLE_LETTER_VOICE);assert(!voice,'overlapping voice');plays++;voice=callbacks;callbacks.onStarted({duration:140});return true;},
  duck(groups,db,options){ducks.push({groups,db,...options});}};
const ui=createDocumentUI();
const narration=createLetterNarration({audio,cancelThoughts:()=>markCleared++,clearCaptions:()=>captionsCleared++,isValid:()=>ui.isOpen&&valid,
  setTimer(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimer:id=>timers.delete(id)});
function advance(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}
function open(){valid=true;ui.open({title:"Annabelle's letter",body:'Keep the exact authored letter.',variant:'letter',narration,onClosed(){assert(!voice,'close callback fired before voice stopped');closed++;}});}
const prompt=elements.get('document-narration');

// A/B: delayed one-shot start and Space consumption without document closure.
voice={onInterrupted(){}};open();assert(!voice&&narration.ownsVoice&&prompt.hidden);
advance(399);assert.equal(plays,0);advance(1);assert.equal(plays,1);assert(narration.playing&&!prompt.hidden);
assert.equal(markCleared,1);assert.equal(captionsCleared,1);
space();assert(!voice&&!narration.ownsVoice&&ui.isOpen&&prompt.hidden);assert.equal(closed,0);assert.equal(gameplaySpace,0);
space();space(true);advance(20000);assert.equal(plays,1);assert(ui.isOpen);assert.equal(closed,0);
assert.equal(ducks.at(-1).db,0);assert.equal(ducks.at(-1).attack,.4);
ui.close();assert.equal(closed,1);

// C: immediate close, no audio under the reveal, including opening-delay cancellation.
open();advance(400);assert(voice);ui.close();assert(!voice&&prompt.hidden);assert.equal(closed,2);
open();ui.close();const count=plays;advance(500);assert.equal(plays,count);assert.equal(closed,3);

// D/E: natural end only hides the prompt; the letter itself supplies the text.
open();advance(400);const complete=voice;voice=null;complete.onEnded();assert(ui.isOpen&&prompt.hidden&&!narration.ownsVoice);
assert.equal(closed,3);assert.equal(elements.get('document-body').children.at(-1).textContent,'Keep the exact authored letter.');
ui.close();assert.equal(closed,4);

// G: reset/shortcut closure suppresses reveal; unload invalidates delayed and live playback.
open();advance(400);ui.close({complete:false});assert(!voice&&prompt.hidden);assert.equal(closed,4);
open();valid=false;narration.update();advance(500);assert(!voice&&prompt.hidden);ui.close({complete:false});
open();advance(400);valid=false;narration.update();assert(!voice&&prompt.hidden&&!narration.ownsVoice);ui.close({complete:false});

// Failed/pending loads are safe to close and can never revive the prompt.
const normalPlay=audio.playVoice;let pending;
audio.playVoice=(key,callbacks)=>{pending=callbacks;return true;};
open();advance(400);assert(prompt.hidden);const beforeStop=stops;ui.close({complete:false});assert(stops>beforeStop);
pending.onStarted({duration:140});pending.onEnded();assert(prompt.hidden&&!ui.isOpen);
audio.playVoice=normalPlay;
assert(ducks.some(d=>d.db===-2.5&&d.release===.4));
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(main.includes('!annabelleLetterNarration?.ownsVoice &&'));
assert(main.includes('onResetLetter:()=>{annabelleLetterNarration.stop();documentUI.close({complete:false});}'));
console.log('PASS: real letter UI + narration controller; 400ms delay; Space capture/repeats; close-before-reveal; natural end; no narration captions; thought ownership; -2.5dB duck / 400ms restore; reset/unload/pending-decode cleanup.');
