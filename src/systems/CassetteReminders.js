import {VOICE_PRIORITY} from '../core/VoicePriority.js';
const FIND='l2_hint_find_cassette',PLAY='l2_hint_play_cassette';
/** Audio-clock deadlines, two one-shot objectives, and no dialogue backlog. */
export function createCassetteReminders({thoughts,audio,captions,isCurrent,hasPower,hasCassette,hasPlayed,canSpeak=()=>true}){
  let generation=0,powered=false,collected=false,played=false,findAt=null,playAt=null;
  const issued=new Set(),now=()=>audio.ctx?.currentTime??0;
  function cancel(){generation++;findAt=playAt=null;thoughts.cancel(FIND);thoughts.cancel(PLAY);}
  return {
    powerRestored(){
      if(!isCurrent()||powered)return;powered=true;
      if(!collected&&!hasCassette()&&!played&&!hasPlayed())findAt=now()+15;
    },
    cassetteCollected(){
      if(!isCurrent())return;
      findAt=null;thoughts.cancel(FIND);
      if(!collected){collected=true;if(!played&&!hasPlayed())playAt=now()+15;}
    },
    tapePlayed(){played=true;collected=true;cancel();},
    update(){
      if(!isCurrent()){cancel();return;}
      if(hasPlayed()&&!played){this.tapePlayed();return;}
      if(hasCassette()&&!collected)this.cassetteCollected();
      if(collected||hasCassette()){findAt=null;thoughts.cancel(FIND);}
      if(played){playAt=null;thoughts.cancel(PLAY);return;}
      if(!hasPower()||!canSpeak()||audio.voiceSource||audio.voiceRequest||thoughts.currentKey||captions?.isPlaying||captions?.isVisible)return;
      const key=findAt!==null&&now()>=findAt&&!issued.has(FIND)?FIND:
        playAt!==null&&now()>=playAt&&!issued.has(PLAY)?PLAY:null;
      if(!key)return;
      const token=generation;
      if(thoughts.play(key,{priority:VOICE_PRIORITY.hint,replayable:true,
        when:()=>token===generation&&isCurrent()&&hasPower()&&!played&&!hasPlayed()&&(key===FIND?!collected&&!hasCassette():collected||hasCassette())})){
        issued.add(key);if(key===FIND)findAt=null;else playAt=null;
      }
    },
    cancel,
    reset(){cancel();powered=collected=played=false;issued.clear();}
  };
}
