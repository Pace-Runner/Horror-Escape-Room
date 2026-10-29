import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CaptionSequencer} from '../src/core/CaptionSequencer.js';
import {createMarkThoughts} from '../src/systems/MarkThoughts.js';
import {voicePlaybackWindow} from '../src/core/VoiceTiming.js';

function surface(){
  const classes=new Set();
  const el={textContent:'',style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),
    contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}}};
  return {el,captions:new CaptionSequencer(el)};
}
for(const enabled of [false,true]){
  const {el,captions}=surface();captions.setEnabled(enabled);
  captions.say({text:'Spoken recording',recorded:true,markThought:true,manualEnd:true});
  assert(el.classList.contains('visible'),'speech hidden by descriptions setting');
  captions.setEnabled(!enabled);assert(el.classList.contains('visible'));
  await captions.play([{text:'Optional description',duration:8,descriptive:true}]);
  assert(el.textContent.includes('Spoken recording'),'description replaced speech');
  assert.equal(el.textContent.includes('Optional description'),!enabled,'optional feedback bypasses toggle');
  captions.say({text:'The door is locked.',interaction:true});
  assert(el.textContent.includes('Spoken recording')&&el.textContent.includes('The door is locked.'));assert.equal(captions._feedback.line.text,'The door is locked.');
  captions.setPaused(true);captions.update(20);assert(captions._feedback);
  captions.setPaused(false);captions.update(20);assert.equal(captions._feedback,null);
  captions.cancel();captions.setEnabled(enabled);
  captions.say({text:'Rain on the window.',descriptive:true});assert.equal(el.classList.contains('visible'),enabled);
  captions.say({text:'The drawer is empty.',interaction:true});assert(el.classList.contains('visible'));
  captions.say({text:'Press H to ask for help.',hint:true});assert(el.classList.contains('visible'));
  captions.say({text:'Loaded spoken line',voice:'recorded.mp3'});const line=captions._line;
  captions.waitForVoice(line);assert(!el.classList.contains('visible'));
  captions.setEnabled(false);captions.beginVoice(line,1.73);assert(el.classList.contains('visible'));
  captions.update(20);assert.equal(captions._line,line,'subtitle timed out before audio ended');
  captions.failVoice(line);assert(el.classList.contains('visible'));assert(!line.manualEnd);
  captions.cancel();assert.equal(captions._feedback,null);
}
// Realistic delayed decode: a placeholder sequence must not swallow the subtitle.
{
  const {el,captions}=surface();captions.setEnabled(false);captions.isVoiced=l=>!!l?.recorded;
  let options;const audio={ctx:{currentTime:0},preloadVoice(){},playVoice(_key,o){options=o;return true;},stopVoice(){}};
  const thoughts=createMarkThoughts(audio,{captions});captions.isSpeechPending=()=>!!thoughts.currentKey;
  assert(thoughts.play('l1_07'));await captions.play([{text:'Optional loading description',duration:5,descriptive:true}]);
  assert(!captions.isPlaying,'unrecorded sequence blocks pending speech');
  options.onStarted({duration:2.3},{},{duration:1.69});
  assert.equal(el.textContent,'Don’t let what out?');assert(el.classList.contains('visible'));
  assert.equal(captions._line.duration,1.69);options.onEnded();assert(!el.classList.contains('visible'));
}
// Measure all channels, retain quiet edges, and preserve deliberate gaps inside speech.
{
  const sampleRate=1000,length=5000,left=new Float32Array(length),right=new Float32Array(length);
  right.fill(.2,600,1500);right.fill(.2,2600,3700);right.fill(.004,550,600);right.fill(.004,3700,3750);
  const buffer={duration:5,length,sampleRate,numberOfChannels:2,getChannelData:ch=>ch?right:left};
  const timing=voicePlaybackWindow(buffer);
  assert(timing.offset<=.55&&timing.offset>=.4);assert(timing.end>=3.75&&timing.end<4);
  assert(timing.duration>3,'internal silence or quiet consonants were removed');
  assert.equal(voicePlaybackWindow(buffer),timing,'window not cached');
  assert.equal(voicePlaybackWindow({duration:2}).duration,2);
  const silence={duration:5,length,sampleRate,numberOfChannels:1,getChannelData:()=>left};
  assert.equal(voicePlaybackWindow(silence).duration,5);
}
const html=fs.readFileSync('index.html','utf8'),main=fs.readFileSync('src/main.js','utf8');
const menu=html.slice(html.indexOf('id="menu-main-actions"'),html.indexOf('id="menu-difficulty"'));
assert.deepEqual([...menu.matchAll(/id="menu-([a-z]+)"/g)].map(m=>m[1]),
  ['start','chapters','achievements','leaderboard','controls','credits','settings','quit']);
assert(main.includes("chapterSelect.open('achievements')"));
for(const id of ['start-button','settings-button','pause-controls','restart-button','pause-main-menu']){
  const button=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))?.[0];
  assert(button?.includes('menu-option'),'pause button lacks shared style: '+id);
}
assert(fs.readFileSync('src/dialogue/hallway.js','utf8').includes("Locked. Something about this door makes me glad it won't open."));
assert(fs.readFileSync('src/levels/upstairsHallwayLevel.js','utf8').includes('dialog_hallway_locked_nursery'));
console.log('PASS: speech/interaction/H visibility with descriptions on/off; delayed decode; no duplicate descriptions; independent feedback/pause; real-duration ownership/failure; conservative stereo speech windows; exact menu order and shared pause styles.');
