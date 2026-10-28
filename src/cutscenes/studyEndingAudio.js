import {ENDING_SFX,CONTAINED_SFX,createEndingAudioTimeline} from './studyEndingAudioConfig.js';
import {ENDING_DIALOGUE,createEndingTiming} from './studyEndingDialogue.js';
import {ENDING_NEWS} from './studyEndingNews.js';
const caches=new WeakMap();
/** One owner for every bounded ending source. No wall-clock timers or unbounded loops. */
export function createStudyEndingAudio(audio,{branch,timing,urls={},fetchAudio=globalThis.fetch,cancelThoughts=()=>{},captions=null,onDialogueActive=()=>{}}={}){
  let T=timing,timeline=createEndingAudioTimeline(branch,T);
  const active=new Set(),buffers=new Map(),voiceKey=ENDING_DIALOGUE[branch].voice;
  const news=ENDING_NEWS[branch];
  const specs={...ENDING_SFX,...CONTAINED_SFX};
  let newsTriggered=false,newsPlaying=false,newsStartedAt=0,newsCaption=-1,newsFinishedAt=null,blackStartedAt=null;
  let voiceTriggered=false,voiceRequested=false,speaking=false,ambienceBase=0,captionActive=false;
  let disposed=false,next=0,impacted=false,blacked=false,lastVoice=null,sceneStartedAt=null,radioOpened=false;
  async function load(file){
    const ctx=audio.ctx,url=urls[file];if(!ctx||!url)return null;
    let cache=caches.get(ctx);if(!cache)caches.set(ctx,cache=new Map());
    if(!cache.has(url))cache.set(url,fetchAudio(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.arrayBuffer();})
      .then(bytes=>ctx.decodeAudioData(bytes)).catch(error=>{cache.delete(url);console.warn('[ending audio]',file,error.message);return null;}));
    return cache.get(url);
  }
  const voiceActive=()=>speaking||(newsPlaying&&(audio.ctx?.currentTime??0)>=newsStartedAt)||(!newsTriggered&&!!audio.voiceSource);
  // Keep the score present beneath speech; effects need a deeper dialogue duck.
  const voiceMix=(group,voice)=>voice?(group==='credits'?.72:.45):1;
  function mixAmbience(){
    if(impacted){audio.duck(['amb','breath','steps'],blacked?-80:-24,{attack:.025,hold:Math.max(0,T.end-currentTime),release:.4});return;}
    audio.duck(['amb'],speaking?Math.min(ambienceBase,-5):ambienceBase,{attack:speaking?.08:.4,hold:Math.max(0,T.end-currentTime),release:.4});
    audio.duck(['breath','steps'],speaking?-5:0,{attack:speaking?.08:.4,hold:Math.max(0,T.end-currentTime),release:.4});
  }
  let currentTime=0;
  function clearCaption(){
    if(!captionActive)return;captionActive=false;captions?.cancel();onDialogueActive(false);
  }
  function startDialogue(){
    if(disposed)return;cancelThoughts();audio.stopVoice?.();voiceRequested=true;
    const end=()=>{voiceRequested=false;clearCaption();if(disposed)return;speaking=false;mixAmbience();};
    audio.playVoice?.(voiceKey,{
      priority:60,
      onStarted(){
        if(disposed)return;speaking=true;mixAmbience();
        captionActive=true;onDialogueActive(true);
        captions?.say({text:ENDING_DIALOGUE[branch].caption,speaker:'ANNABELLE',voice:voiceKey,
          recorded:true,endingManaged:true,manualEnd:true,duration:T.voiceDuration});
      },
      onEnded:end,onFailed:end,onInterrupted:end
    });
  }
  function updateNewsCaption(){
    if(!newsPlaying)return;
    const elapsed=audio.ctx.currentTime-newsStartedAt;
    const index=news.captions.findIndex(c=>elapsed>=c.start&&elapsed<c.end);
    if(index===newsCaption)return;
    newsCaption=index;clearCaption();
    if(index<0)return;
    captionActive=true;onDialogueActive(true);
    captions?.say({text:news.captions[index].text,speaker:'NEWS',recorded:true,endingManaged:true,manualEnd:true,
      duration:news.captions[index].end-news.captions[index].start});
  }
  function startNews(){
    if(disposed)return;cancelThoughts();audio.stopVoice?.();voiceRequested=true;
    newsStartedAt=audio.ctx.currentTime+(T.news-T.black);
    const finish=()=>{voiceRequested=false;newsPlaying=false;newsFinishedAt=audio.ctx.currentTime;clearCaption();};
    audio.playVoice?.(news.voice,{
      priority:60,
      startAt:newsStartedAt,
      onStarted(){
        if(disposed)return;newsPlaying=true;
        updateNewsCaption();
      },
      onEnded(){finish();if(!disposed)play({t:T.newsEnd,key:'static',duration:.75,group:'news',gain:.025,fadeOut:.4},0);},
      onInterrupted:finish,onFailed:finish
    });
  }
  function stopGroups(groups,fade){for(const record of [...active])if(groups.includes(record.group)){record.emitter.stop(fade);active.delete(record);}}
  function play(e,late){
    const spec=e.key==='rain'?{offset:0,duration:e.duration,fadeIn:1,fadeOut:.2}:specs[e.key];
    const buffer=e.key==='rain'?audio.cue('rain_bed'):buffers.get(spec.file);if(!buffer)return;
    const playbackRate=e.playbackRate??1;
    const offset=(e.offset??spec.offset)+late*playbackRate;
    // Timeline duration is wall time; Web Audio's source duration is buffer time.
    const duration=Math.min(((e.duration??spec.duration)-late)*playbackRate,buffer.duration-offset);
    if(duration<=.01)return;
    const gain=e.gain??spec.gain,voice=voiceActive();
    const panner=e.position?{model:'equalpower',distanceModel:'inverse',refDistance:7,maxDistance:30,rolloff:.25}:null;
    const record={emitter:null,group:e.group,gain,until:e.t+late+duration/playbackRate};
    const emitter=audio.emit('sfx',{buffer,loop:false,offset,duration,gain:gain*voiceMix(e.group,voice),
      playbackRate,fadeIn:Math.min(e.fadeIn??spec.fadeIn??.01,duration/playbackRate*.25),fadeOut:Math.min(e.fadeOut??spec.fadeOut??.1,duration/playbackRate*.5),
      lowpass:e.lowpass??spec.lowpass??null,position:e.position??null,panner,
      onEnded:()=>active.delete(record)});
    if(emitter){record.emitter=emitter;active.add(record);}
  }
  return {
    get timeline(){return timeline;},
    get timing(){return T;},
    // Ending performance and black/report time follow the audio clock, including through slow frames.
    advanceTime(t,dt){
      if(dt<=0)return t+dt;
      if(blackStartedAt===null){
        if(sceneStartedAt!==null)return audio.ctx.currentTime-sceneStartedAt;
        return t+dt;
      }
      const now=audio.ctx.currentTime;
      // Both branches retain the full credit roll after the report finishes.
      return Math.min(newsFinishedAt===null?T.end-.001:T.end,T.black+now-blackStartedAt);
    },
    async prepare(){
      const [,voice,report]=await Promise.all([
        Promise.all(Object.values(specs).map(async spec=>{const b=await load(spec.file);if(!disposed&&b)buffers.set(spec.file,b);})),
        audio.preloadVoice?.(voiceKey),audio.preloadVoice?.(news.voice)
      ]);
      if(!disposed){T=createEndingTiming(branch,voice?.duration??T.voiceDuration,report?.duration??news.duration);timeline=createEndingAudioTimeline(branch,T);}
      return T;
    },
    setAmbienceBase(db){ambienceBase=db;if(!disposed)mixAmbience();},
    update(t){
      if(disposed)return;currentTime=t;
      if(sceneStartedAt===null)sceneStartedAt=(audio.ctx?.currentTime??0)-t;
      const contact=T.contact??T.fade;
      if(!voiceTriggered&&t>=T.voice){voiceTriggered=true;if(t<T.voiceEnd-.05)startDialogue();}
      if(!impacted&&t>=contact){
        impacted=true;stopGroups(['scene'],.025);mixAmbience();
        audio.setMuffle?.(.72,.06);
      }
      if(!radioOpened&&t>=T.title){radioOpened=true;audio.setMuffle?.(0,.9);}
      if(!blacked&&t>=T.black){
        blacked=true;blackStartedAt=audio.ctx?.currentTime??0;stopGroups(['scene','impact','aftermath'],.04);mixAmbience();
        newsTriggered=true;startNews();
      }
      updateNewsCaption();
      while(next<timeline.length&&timeline[next].t<=t+.00001){
        const e=timeline[next++];if((impacted&&e.group==='scene')||(blacked&&!['news','bridge','credits'].includes(e.group)))continue;
        play(e,Math.max(0,t-e.t));
      }
      for(const record of [...active])if(t>=record.until+.01){record.emitter.stop(.02);active.delete(record);}
      const voice=voiceActive();
      if(voice!==lastVoice){lastVoice=voice;for(const r of active)r.emitter.setGain?.(r.gain*voiceMix(r.group,voice),voice?.08:.4);}
    },
    dispose(){if(disposed)return;disposed=true;clearCaption();if(voiceRequested)audio.stopVoice?.();speaking=false;newsPlaying=false;voiceRequested=false;for(const r of active)r.emitter.stop(.03);active.clear();buffers.clear();
      audio.setMuffle?.(0,.2);
      audio.duck(['amb','breath','steps'],0,{attack:.4,hold:0,release:0});},
    get activeCount(){return active.size;}
  };
}
