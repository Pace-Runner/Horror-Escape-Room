import { MARK_THOUGHTS } from '../story/markThoughts.js';

import {VOICE_PRIORITY} from '../core/VoicePriority.js';
export {VOICE_PRIORITY} from '../core/VoicePriority.js';
const RESULTS=new Set(['l1_03','l1_04','l1_06','l1_13','l1_15','l1_16','l1_18','l1_19','l2_07','l2_08','l2_24','l3_02','l3_03','l3_04']);
/** Exactly one current/latest request. Never queue, suspend, or resume a line. */
export function createMarkThoughts(audio,{captions=null,canPlay=()=>true}={}) {
  const seen=new Set(),lastPlayed=new Map();let current=null,pending=null,blocked=false;
  const allowed=entry=>!blocked&&canPlay(entry)&&entry.when()&&!(captions?.isVoiceSequence ?? captions?.isPlaying);
  function stop(){
    const old=current??pending;current=null;pending=null;
    if(old?.source&&audio.voiceSource===old.source)audio.stopVoice();
    else if(old?.loading)audio.stopVoice();
    captions?.cancelMarkThought?.();
    old?.onInterrupted?.();
  }
  function start(entry){
    if(!allowed(entry))return;
    if(captions?.isPlaying&&!captions.isVoiceSequence)captions.cancel({keepFeedback:true});
    current=entry;entry.loading=true;
    const voice='mark/'+MARK_THOUGHTS[entry.key][0];
    const text=MARK_THOUGHTS[entry.key][1];
    return audio.playVoice(voice,{
      priority:entry.priority,trimSilence:true,
      onStarted(buffer,source,timing){if(current!==entry)return;entry.source=source;entry.loading=false;
        seen.add(entry.key);lastPlayed.set(entry.key,audio.ctx?.currentTime??0);
        if(captions?.isPlaying&&!captions.isVoiceSequence)captions.cancel({keepFeedback:true});
        captions?.say({text,speaker:'MARK',markThought:true,hint:entry.priority===VOICE_PRIORITY.hint,
          recorded:true,manualEnd:true,duration:timing?.duration??buffer.duration});},
      onInterrupted(){if(current===entry){current=null;captions?.cancelMarkThought?.();entry.onInterrupted?.();}},
      onEnded(){if(current===entry){current=null;captions?.cancelMarkThought?.();entry.onEnded?.();}},
      onFailed(){if(current===entry){current=null;captions?.cancelMarkThought?.();entry.onFailed?.();}}
    })!==false;
  }
  return {
    play(key,{replayable=false,delay=0,priority,when=()=>true,onEnded,onFailed,onInterrupted,document=false,cutscene=null}={}){
      if(!audio.ctx||!MARK_THOUGHTS[key]||(!replayable&&seen.has(key)))return false;
      const now=audio.ctx?.currentTime??0;
      if(replayable&&now-(lastPlayed.get(key)??-Infinity)<1.5)return false;
      const rank=typeof priority==='number'?priority:priority===true?VOICE_PRIORITY.story:RESULTS.has(key)?VOICE_PRIORITY.result:VOICE_PRIORITY.interaction;
      const entry={key,priority:rank,when,onEnded,onFailed,onInterrupted,document,cutscene,startAt:now+delay};
      if(!allowed(entry)||(current??pending)?.priority>rank||audio.voiceRequest?.priority>rank)return false;
      if((current??pending)?.key===key&&(!replayable||current?.loading||pending))return false;
      stop();
      audio.preloadVoice('mark/'+MARK_THOUGHTS[key][0]);
      if(delay>0)pending=entry;else return start(entry);
      return true;
    },
    playSequence(keys,options={}){
      // This is an explicitly authored beat, never a queue of incidental requests.
      const list=[...keys];
      const next=()=>{
        if(!list.length){options.onEnded?.();return true;}
        const key=list.shift();
        if(seen.has(key)&&!options.replayable)return next();
        return this.play(key,{...options,onEnded:next});
      };
      return next();
    },
    preload(prefix){return Promise.all(Object.entries(MARK_THOUGHTS).filter(([k])=>k.startsWith(prefix+'_')).map(([,v])=>audio.preloadVoice('mark/'+v[0])));},
    setBlocked(value){blocked=value;if(value)stop();},
    update({blocked:busy=false}={}){
      if(busy||blocked){stop();return;}
      if(current&&!allowed(current)){stop();return;}
      if(pending){if(!allowed(pending)){pending=null;return;}if((audio.ctx?.currentTime??0)>=pending.startAt){const entry=pending;pending=null;start(entry);}}
    },
    cancel(key){if(current?.key===key||pending?.key===key)stop();},
    clear({reset=false}={}){stop();blocked=false;if(reset){seen.clear();lastPlayed.clear();}},
    get currentKey(){return (current??pending)?.key??null;}
  };
}
