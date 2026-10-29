import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCassetteReminders} from '../src/systems/CassetteReminders.js';
import {createMarkThoughts} from '../src/systems/MarkThoughts.js';
import {CaptionSequencer} from '../src/core/CaptionSequencer.js';
import {MARK_THOUGHTS} from '../src/story/markThoughts.js';
const FIND='l2_hint_find_cassette',PLAY='l2_hint_play_cassette';
assert.equal(MARK_THOUGHTS[FIND][1],"I wonder if there's a cassette for the tape player...");
assert.equal(MARK_THOUGHTS[PLAY][1],'I should play this cassette... find out what happened here.');
for(const key of [FIND,PLAY])assert(fs.statSync('src/assets/audio/Dont Let it out Mark voice/'+MARK_THOUGHTS[key][0]).size>1000);
function harness(){
  const flags={current:true,power:false,collected:false,played:false,ready:true},plays=[];
  const captions=new CaptionSequencer({textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}});captions.isVoiced=l=>!!l?.recorded;
  const audio={ctx:{currentTime:0},voiceSource:null,voiceRequest:null,hasVoice:()=>true,preloadVoice:async()=>({duration:3}),
    playVoice(voice,options){assert(!this.voiceSource,'reminder interrupted existing dialogue');this.voiceSource={voice,options};this.voiceRequest={priority:options.priority};plays.push(this.voiceSource);options.onStarted({duration:3},this.voiceSource);return true;},
    stopVoice(){const old=this.voiceSource;this.voiceSource=null;this.voiceRequest=null;old?.options?.onInterrupted?.();}};
  const thoughts=createMarkThoughts(audio,{captions});
  const ctrl=createCassetteReminders({thoughts,audio,captions,isCurrent:()=>flags.current,hasPower:()=>flags.power,
    hasCassette:()=>flags.collected,hasPlayed:()=>flags.played,canSpeak:()=>flags.ready});
  return {flags,plays,captions,audio,ctrl,
    at(t){audio.ctx.currentTime=t;ctrl.update();},
    power(){flags.power=true;ctrl.powerRestored();},collect(){flags.collected=true;ctrl.cassetteCollected();},
    play(){flags.played=true;ctrl.tapePlayed();},
    end(){const source=audio.voiceSource;audio.voiceSource=null;audio.voiceRequest=null;source.options.onEnded();}};
}
{
  const h=harness();h.power();h.at(14.999);assert.equal(h.plays.length,0);h.at(15);assert.equal(h.plays.length,1);
  assert(h.plays[0].voice.endsWith('l2_hint_01_find_cassette.mp3'));
  assert.equal(h.captions._line.speaker,'MARK');assert.equal(h.captions._line.text,MARK_THOUGHTS[FIND][1]);assert(h.captions._line.manualEnd);
  assert.equal(h.plays[0].options.priority,20);
  const stale=h.audio.voiceSource;h.collect();assert.equal(h.audio.voiceSource,null);assert(!h.captions.isVisible);
  stale.options.onEnded();h.at(29.999);assert.equal(h.plays.length,1);h.at(30);assert.equal(h.plays.length,2);
  assert(h.plays[1].voice.endsWith('l2_hint_02_play_cassette.mp3'));assert.equal(h.captions._line.text,MARK_THOUGHTS[PLAY][1]);
  h.play();assert.equal(h.audio.voiceSource,null);assert(!h.captions.isVisible);h.at(200);h.ctrl.powerRestored();h.collect();h.at(300);assert.equal(h.plays.length,2);
}
{
  const h=harness();h.power();h.at(5);h.collect();h.at(19.999);assert.equal(h.plays.length,0);h.at(20);assert.equal(h.plays.length,1);assert(h.plays[0].voice.includes('02_play'));
  h.end();h.at(200);assert.equal(h.plays.length,1);
}
{
  const h=harness();h.collect();h.at(15);assert.equal(h.plays.length,0,'unpowered deck reminder spoke');
  h.power();h.at(16);assert.equal(h.plays.length,1);assert(h.plays[0].voice.includes('02_play'));
}
for(const busy of ['recording','cutscene','caption']){
  const h=harness();h.power();
  if(busy==='recording'){h.audio.voiceSource={important:true};h.audio.voiceRequest={priority:60};}
  if(busy==='cutscene')h.flags.ready=false;
  if(busy==='caption')captionsBusy(h.captions);
  h.at(15);assert.equal(h.plays.length,0,busy+' was interrupted');
  h.audio.stopVoice();h.flags.ready=true;h.captions.cancel();h.at(16);assert.equal(h.plays.length,1,'due reminder did not use next quiet slot');
}
function captionsBusy(captions){captions.say({text:'Existing dialogue',recorded:false});}
for(const completion of ['collect','play','scene']){
  const h=harness();h.power();h.flags.ready=false;h.at(30);
  if(completion==='collect')h.collect();if(completion==='play')h.play();if(completion==='scene'){h.flags.current=false;h.at(31);h.flags.current=true;}
  h.flags.ready=true;h.at(31);assert.equal(h.plays.length,0,'obsolete find reminder survived '+completion);
}
{
  const h=harness();h.power();h.at(15);h.ctrl.reset();assert.equal(h.audio.voiceSource,null);
  Object.assign(h.flags,{power:false,collected:false,played:false});h.at(100);h.power();h.at(114.999);assert.equal(h.plays.length,1);
  h.at(115);assert.equal(h.plays.length,2,'restart did not reset timer/one-shot state');h.end();h.at(500);assert.equal(h.plays.length,2);
}
const main=fs.readFileSync('src/main.js','utf8');
assert(main.includes('cassetteReminders.powerRestored()')&&main.includes('cassetteReminders.cassetteCollected()')&&main.includes('cassetteReminders.tapePlayed()'));
assert(main.match(/function resetGame\([^)]*\) \{([\s\S]*?)\n\}/)[1].includes('cassetteReminders.reset();'));
console.log('PASS: exact two assets/MARK captions; both 15s boundaries; power/objective gates; immediate cancellation of playing/pending reminders; occupied dialogue/tape/cutscene protection; once per run; restart timers; scene cleanup.');
