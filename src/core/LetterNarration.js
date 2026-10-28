export const ANNABELLE_LETTER_VOICE = 'mark/LEVEL 3/anabelle_reading_letter.mp3';

/** One document-owned voice request, including its opening delay and pending decode. */
export function createLetterNarration({audio, cancelThoughts=()=>{}, clearCaptions=()=>{},
  intro=null,onIntro=()=>{},onIntroEnd=()=>{},isValid=()=>true, setTimer=setTimeout, clearTimer=clearTimeout}={}) {
  let generation=0,timer=null,ownsVoice=false,requested=false,playing=false,show=()=>{};
  let introActive=false;
  const groups=['amb','monster','breath'];
  function finish(token){
    if(token!==generation)return;
    requested=false;playing=false;ownsVoice=false;show(false);
    if(introActive){introActive=false;onIntroEnd();}
    audio.duck(groups,0,{attack:.4,hold:0,release:0});
  }
  function stop(){
    generation++;
    if(timer!==null)clearTimer(timer);timer=null;
    const hadRequest=requested,wasPlaying=playing;
    ownsVoice=false;requested=false;playing=false;show(false);
    if(introActive){introActive=false;onIntroEnd();}
    if(hadRequest)audio.stopVoice();
    if(wasPlaying)audio.duck(groups,0,{attack:.4,hold:0,release:0});
  }
  return {
    start(onPlaying=()=>{}){
      stop();show=onPlaying;show(false);ownsVoice=true;
      cancelThoughts();clearCaptions();audio.stopVoice();
      // Fetch/decode during the opening beat; the existing voice engine caches it.
      audio.preloadVoice(ANNABELLE_LETTER_VOICE);
      if(intro)audio.preloadVoice(intro.voice);
      const token=++generation;
      function playRecording(voice,isIntro=false){
        if(token!==generation||!isValid()){stop();return;}
        requested=true;
        const ok=audio.playVoice(voice,{
          priority:50,
          onStarted(buffer){
            if(token!==generation)return;
            if(!isValid()){stop();return;}
            playing=true;show(true);
            if(isIntro){introActive=true;onIntro({...intro,duration:buffer.duration});}
            audio.duck(groups,-2.5,{attack:.15,hold:Math.max(0,buffer.duration-.15),release:.4});
          },
          onEnded:()=>{if(token!==generation)return;if(isIntro){introActive=false;onIntroEnd();playRecording(ANNABELLE_LETTER_VOICE);}else finish(token);},
          onFailed:()=>{if(token!==generation)return;if(isIntro)playRecording(ANNABELLE_LETTER_VOICE);else finish(token);},
          onInterrupted:()=>finish(token)
        });
        if(!ok)finish(token);
      }
      timer=setTimer(()=>{
        timer=null;
        if(token!==generation)return;
        if(!isValid()){stop();return;}
        playRecording(intro?.voice??ANNABELLE_LETTER_VOICE,!!intro);
      },400);
    },
    stop,
    update(){if(ownsVoice&&!isValid())stop();},
    get ownsVoice(){return ownsVoice;},
    get playing(){return playing;}
  };
}
