import {ENDING_SFX,createEndingAudioTimeline} from './studyEndingAudioConfig.js';
import {ENDING_DIALOGUE,createEndingTiming} from './studyEndingDialogue.js';
const caches=new WeakMap();
/** One owner for every bounded ending source. No wall-clock timers or unbounded loops. */
export function createStudyEndingAudio(audio,{branch,timing,urls={},fetchAudio=globalThis.fetch,cancelThoughts=()=>{},captions=null,onDialogueActive=()=>{}}={}){
  let T=timing,timeline=createEndingAudioTimeline(branch,T);
  const active=new Set(),buffers=new Map(),voiceKey=ENDING_DIALOGUE[branch].voice;
  let voiceTriggered=false,voiceRequested=false,speaking=false,ambienceBase=0,captionActive=false;
  let disposed=false,next=0,impacted=false,blacked=false,lastVoice=null;
  async function load(file){
    const ctx=audio.ctx,url=urls[file];if(!ctx||!url)return null;
    let cache=caches.get(ctx);if(!cache)caches.set(ctx,cache=new Map());
    if(!cache.has(url))cache.set(url,fetchAudio(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.arrayBuffer();})
      .then(bytes=>ctx.decodeAudioData(bytes)).catch(error=>{cache.delete(url);console.warn('[ending audio]',file,error.message);return null;}));
    return cache.get(url);
  }
  const voiceActive=()=>speaking||!!audio.voiceSource;
  function mixAmbience(){
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
      onStarted(){
        if(disposed)return;speaking=true;mixAmbience();
        captionActive=true;onDialogueActive(true);
        captions?.say({text:ENDING_DIALOGUE[branch].caption,speaker:'ANNABELLE',voice:voiceKey,
          recorded:true,endingManaged:true,manualEnd:true,duration:T.voiceDuration});
      },
      onEnded:end,onFailed:end,onInterrupted:end
    });
  }
  function stopGroups(groups,fade){for(const record of [...active])if(groups.includes(record.group)){record.emitter.stop(fade);active.delete(record);}}
  function play(e,late){
    const spec=e.key==='rain'?{offset:0,duration:e.duration,fadeIn:1,fadeOut:.2}:ENDING_SFX[e.key];
    const buffer=e.key==='rain'?audio.cue('rain_bed'):buffers.get(spec.file);if(!buffer)return;
    const offset=(e.offset??spec.offset)+late;
    const duration=Math.min((e.duration??spec.duration)-late,buffer.duration-offset);
    if(duration<=.01)return;
    const gain=e.gain??spec.gain,voice=voiceActive();
    const panner=e.position?{model:'equalpower',distanceModel:'inverse',refDistance:7,maxDistance:30,rolloff:.25}:null;
    const record={emitter:null,group:e.group,gain,until:e.t+(e.duration??spec.duration)};
    const emitter=audio.emit('sfx',{buffer,loop:false,offset,duration,gain:gain*(voice?.45:1),
      fadeIn:Math.min(e.fadeIn??spec.fadeIn??.01,duration*.25),fadeOut:Math.min(e.fadeOut??spec.fadeOut??.1,duration*.5),
      lowpass:e.lowpass??spec.lowpass??null,position:e.position??null,panner,
      onEnded:()=>active.delete(record)});
    if(emitter){record.emitter=emitter;active.add(record);}
  }
  return {
    get timeline(){return timeline;},
    get timing(){return T;},
    async prepare(){
      const [,voice]=await Promise.all([
        Promise.all(Object.values(ENDING_SFX).map(async spec=>{const b=await load(spec.file);if(!disposed&&b)buffers.set(spec.file,b);})),
        audio.preloadVoice?.(voiceKey)
      ]);
      if(!disposed&&voice?.duration>0){T=createEndingTiming(branch,voice.duration);timeline=createEndingAudioTimeline(branch,T);}
      return T;
    },
    setAmbienceBase(db){ambienceBase=db;if(!disposed)mixAmbience();},
    update(t){
      if(disposed)return;currentTime=t;
      const contact=T.contact??T.fade;
      if(!voiceTriggered&&t>=T.voice){voiceTriggered=true;if(t<T.voiceEnd-.05)startDialogue();}
      if(!impacted&&t>=contact){impacted=true;stopGroups(['scene'],.035);audio.duck(['amb','breath','steps'],-18,{attack:.035,hold:Math.max(0,T.end-t),release:.4});}
      if(!blacked&&t>=T.black){blacked=true;stopGroups(['scene','impact','aftermath'],.04);}
      while(next<timeline.length&&timeline[next].t<=t+.00001){
        const e=timeline[next++];if((impacted&&e.group==='scene')||(blacked&&e.group!=='news'))continue;
        play(e,Math.max(0,t-e.t));
      }
      for(const record of [...active])if(t>=record.until+.01){record.emitter.stop(.02);active.delete(record);}
      const voice=voiceActive();
      if(voice!==lastVoice){lastVoice=voice;for(const r of active)r.emitter.setGain?.(r.gain*(voice?.45:1),voice?.08:.4);}
    },
    dispose(){if(disposed)return;disposed=true;clearCaption();if(voiceRequested)audio.stopVoice?.();speaking=false;voiceRequested=false;for(const r of active)r.emitter.stop(.03);active.clear();buffers.clear();
      audio.duck(['amb','breath','steps'],0,{attack:.4,hold:0,release:0});},
    get activeCount(){return active.size;}
  };
}
