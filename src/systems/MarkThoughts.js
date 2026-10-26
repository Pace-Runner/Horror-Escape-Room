import { MARK_THOUGHTS } from '../story/markThoughts.js';

export const VOICE_PRIORITY={ambient:10,hint:20,interaction:30,result:40,story:50,cutscene:60};
const RESULTS=new Set(['l1_03','l1_04','l1_06','l1_13','l1_15','l1_16','l1_18','l1_19','l2_07','l2_08','l2_24','l3_02','l3_03','l3_04']);
const AMBIENT=new Set(['l1_09','hallway_01','backrooms_01','backrooms_02','backrooms_03','backrooms_05']);
/** Exactly one current/latest request. Never queue, suspend, or resume a line. */
export function createMarkThoughts(audio,{captions=null,canPlay=()=>true}={}) {
  const seen=new Set(),lastPlayed=new Map();let current=null,pending=null,blocked=false;
  const allowed=entry=>!blocked&&canPlay(entry)&&entry.when()&&!captions?.isPlaying;
  function stop(){
    const old=current;current=null;pending=null;
    if(old?.source&&audio.voiceSource===old.source)audio.stopVoice();
    else if(old?.loading)audio.stopVoice();
    captions?.cancelMarkThought?.();
  }
  function start(entry){
    if(!allowed(entry))return;
    current=entry;entry.loading=true;
    const voice='mark/'+MARK_THOUGHTS[entry.key][0];
    const text=MARK_THOUGHTS[entry.key][1];
    captions?.say({text,markThought:true,recorded:audio.hasVoice(voice),duration:Math.max(2,text.length*.055+1)});
    audio.playVoice(voice,{
      onStarted(buffer,source){if(current!==entry)return;entry.source=source;entry.loading=false;
        captions?.extendMarkThought?.(buffer.duration);},
      onInterrupted(){if(current===entry){current=null;captions?.cancelMarkThought?.();}},
      onEnded(){if(current===entry){current=null;captions?.cancelMarkThought?.();entry.onEnded?.();}},
      onFailed(){if(current===entry){current=null;captions?.cancelMarkThought?.();entry.onFailed?.();}}
    });
  }
  return {
    play(key,{replayable=false,delay=0,priority,when=()=>true,onEnded,onFailed,document=false}={}){
      if(!audio.ctx||!MARK_THOUGHTS[key]||(!replayable&&seen.has(key)))return false;
      const now=audio.ctx?.currentTime??0;
      if(replayable&&now-(lastPlayed.get(key)??-Infinity)<1.5)return false;
      const rank=typeof priority==='number'?priority:priority===true?50:RESULTS.has(key)?40:AMBIENT.has(key)?10:30;
      const entry={key,priority:rank,when,onEnded,onFailed,document,startAt:now+delay};
      if(!allowed(entry)||(current??pending)?.priority>rank)return false;
      stop();seen.add(key);lastPlayed.set(key,now);
      audio.preloadVoice('mark/'+MARK_THOUGHTS[key][0]);
      if(delay>0)pending=entry;else start(entry);
      return true;
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
