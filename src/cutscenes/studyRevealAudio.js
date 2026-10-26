import { REVEAL_VOICE_LINES } from './studyReveal.js';

/** Existing voice bus owns every line; only ambience/foley can coexist. */
export function createStudyRevealAudio(audio, { cancelThoughts = () => {}, position = [0,.7,0] } = {}) {
  const groups=['amb','monster','breath'];
  let generation=0,alert=null;
  function stopDialogue(){
    generation++;cancelThoughts();audio.stopVoice();
    audio.duck(groups,0,{attack:.35,hold:0,release:.1});
  }
  return {
    async prepare(){
      cancelThoughts();audio.stopVoice();
      const buffers=await Promise.all(REVEAL_VOICE_LINES.map(line=>audio.preloadVoice(line.voice)));
      const durations={};
      buffers.forEach((buffer,index)=>{
        if(!buffer)throw new Error(`Missing reveal audio: ${REVEAL_VOICE_LINES[index].voice}`);
        durations[REVEAL_VOICE_LINES[index].voice]=buffer.duration;
      });
      return durations;
    },
    playDialogue(beat,onEnded){
      const request=++generation;
      const end=()=>{
        if(request!==generation)return;
        audio.duck(groups,0,{attack:.45,hold:0,release:.1});onEnded();
      };
      return audio.playVoice(beat.voice,{
        onStarted(buffer){audio.duck(groups,-4.5,{attack:.15,hold:Math.max(0,buffer.duration-.15),release:.45});},
        onEnded:end,onFailed:end,onInterrupted:end
      });
    },
    playAlert(){
      const buffer=audio.cue('wood_creak');
      if(!buffer)return;
      alert=audio.emit('sfx',{buffer,gain:.23,fadeIn:.025,fadeOut:.18,duration:Math.min(buffer.duration,1),
        position,panner:{model:'HRTF',distanceModel:'inverse',refDistance:3,maxDistance:25,rolloff:.5}});
    },
    stopDialogue,
    dispose(){stopDialogue();alert?.stop(.1);alert=null;}
  };
}
