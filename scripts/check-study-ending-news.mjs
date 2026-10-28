import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStudyEndingAudio} from '../src/cutscenes/studyEndingAudio.js';
import {createEndingTiming,ENDING_DIALOGUE} from '../src/cutscenes/studyEndingDialogue.js';
import {ENDING_NEWS} from '../src/cutscenes/studyEndingNews.js';

for(const branch of ['release','reseal']){
  const news=ENDING_NEWS[branch];
  assert(fs.existsSync('src/assets/audio/'+news.voice));
  for(const cancelAt of [null,1,7,12,17]){
    let sceneTime=0,source=null,disposed=false;const captions=[],plays=[],emits=[];
    const audio={ctx:{currentTime:0,decodeAudioData:async()=>({duration:25.763})},voiceSource:null,duck(){},cue(){return null;},
      preloadVoice:async key=>({duration:key===news.voice?news.duration:ENDING_DIALOGUE[branch].duration}),
      playVoice(key,opts){assert(!source,'overlapping voice');
        const start=opts.startAt??this.ctx.currentTime;
        source={opts,end:start+(key===news.voice?news.duration:ENDING_DIALOGUE[branch].duration)};
        this.voiceSource=source;plays.push({key,at:start});opts.onStarted();return true;
      },
      stopVoice(){const old=source;source=null;this.voiceSource=null;old?.opts.onInterrupted?.();},
      emit(_bus,opts){opts.gains=[];emits.push(opts);return {stop(){opts.stopped=true;},setGain(gain){opts.gains.push(gain);}};}
    };
    let caption=null;
    const owner=createStudyEndingAudio(audio,{branch,timing:createEndingTiming(branch),urls:{'l3_news_static.wav':'static','l3_credits_score.wav':'score'},
      fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}),captions:{
      say(line){caption=line.text;captions.push({line,at:audio.ctx.currentTime});},cancel(){caption=null;}
    }});
    const T=await owner.prepare();assert(Math.abs(T.news-T.black-5.2)<1e-8);
    assert.equal(T.newsDuration,news.duration);
    let blackAt=null,endAt=null,newsEnd=null;
    // Simulate irregular frame timing and clamped game dt, including a long frame during the report.
    for(let frame=0;frame<12000;frame++){
      const realDt=frame%57===0?.17:.016;
      audio.ctx.currentTime+=realDt;
      if(source&&audio.ctx.currentTime>=source.end){
        const old=source;source=null;audio.voiceSource=null;old.opts.onEnded();
        if(plays.at(-1).key===news.voice)newsEnd=audio.ctx.currentTime;
      }
      sceneTime=Math.max(sceneTime,Math.min(T.end,owner.advanceTime(sceneTime,Math.min(.05,realDt))));
      owner.update(sceneTime);
      if(blackAt===null&&sceneTime>=T.black)blackAt=audio.ctx.currentTime;
      const newsStart=plays.find(p=>p.key===news.voice);
      if(newsStart){
        const elapsed=audio.ctx.currentTime-newsStart.at;
        if(cancelAt!==null&&elapsed>=cancelAt){owner.dispose();disposed=true;assert.equal(caption,null);assert.equal(source,null);break;}
        if(source){const cue=news.captions.find(c=>elapsed>=c.start&&elapsed<c.end);assert.equal(caption,cue?.text??null,'caption drifted from audio clock');}
      }
      if(sceneTime>=T.end){endAt=audio.ctx.currentTime;break;}
    }
    const report=plays.filter(p=>p.key===news.voice);assert.equal(report.length,1);
    assert(Math.abs(report[0].at-blackAt-(T.news-T.black))<.001,'news did not respect the branch aftermath');
    if(!disposed){
      assert(newsEnd!==null&&endAt!==null);assert(sceneTime>=T.creditsEnd,'credits were cut short by report end');assert(endAt-newsEnd>=.75,'credits interrupted report tail');
      assert.deepEqual(captions.slice(1).map(c=>c.line.text),news.captions.map(c=>c.text));
      assert.equal(caption,null);
      const tails=emits.filter(e=>e.duration===.75);assert.equal(tails.length,1,'tail must follow the real news end');
      assert(emits.length>1,'missing continuous radio texture');
      const music=emits.filter(e=>e.lowpass===7200);
      assert(music.length>=2&&music.some(e=>e.gain===.32*.72||e.gains.includes(.32*.72)),'music must stay audible beneath the news voice');
      assert(music.some(e=>e.gains.includes(.32)||e.gain===.32),'score must return after speech');
    }
    else {
      assert.equal(emits.filter(e=>e.duration===.75).length,newsEnd===null?0:1,'reset unexpectedly played a static tail');
      assert(emits.every(e=>e.stopped),'reset left static playing');
    }
    const count=plays.length;owner.dispose();owner.update(T.end+10);assert.equal(plays.length,count);assert.equal(owner.activeCount,0);
  }
}
console.log('PASS: exact news MP3 mappings/durations; branch-specific aftermath; sentence captions follow audio despite slow frames; credits finish independently of report end; cancel during either report clears captions/voice and prevents restart.');
