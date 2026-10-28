import { REVEAL_VOICE_LINES } from './studyReveal.js';

/** Existing voice bus owns every line; only ambience/foley can coexist. */
export function createStudyRevealAudio(audio, { cancelThoughts = () => {}, position = [0,.7,0] } = {}) {
  const groups=['amb','monster','breath'];
  let generation=0,started=false,elapsed=0,nextSettle=16,previousBreath=0,previousRate=1,frightAt=-Infinity;
  const effects=new Set();
  const panner={model:'HRTF',distanceModel:'inverse',refDistance:3,maxDistance:25,rolloff:.5};
  function effect(key,bus,gain,at=position){
    const buffer=audio.cue(key);if(!buffer)return;
    let emitter;emitter=audio.emit(bus,{buffer,gain,fadeIn:.035,fadeOut:.15,duration:buffer.duration,
      position:at,panner:at?panner:null,onEnded:()=>effects.delete(emitter)});
    if(emitter)effects.add(emitter);
  }
  function dreadSwell(){
    const ctx=audio.ctx;
    if(!ctx?.createOscillator)return;
    const oscillator=ctx.createOscillator(),level=ctx.createGain(),filter=ctx.createBiquadFilter();
    oscillator.type='sine';oscillator.frequency.value=54;
    filter.type='lowpass';filter.frequency.value=95;
    const now=ctx.currentTime;
    level.gain.setValueAtTime(0,now);level.gain.linearRampToValueAtTime(.018,now+.7);
    level.gain.setValueAtTime(.018,now+1.2);level.gain.linearRampToValueAtTime(0,now+2.7);
    oscillator.connect(filter).connect(level).connect(audio.buses.amb);
    const emitter={stop(){level.gain.cancelScheduledValues(ctx.currentTime);level.gain.setTargetAtTime(0,ctx.currentTime,.04);oscillator.stop(ctx.currentTime+.15);}};
    effects.add(emitter);
    oscillator.onended=()=>{oscillator.disconnect();filter.disconnect();level.disconnect();effects.delete(emitter);};
    oscillator.start(now);oscillator.stop(now+2.7);
  }
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
        if(!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0)
          throw new Error(`Missing or invalid reveal audio: ${REVEAL_VOICE_LINES[index].voice}`);
        durations[REVEAL_VOICE_LINES[index].voice]=buffer.duration;
      });
      return durations;
    },
    playDialogue(beat,onEnded){
      const request=++generation;
      const end=()=>{
        if(request!==generation)return;
        audio.duck(groups,0,{attack:.4,hold:0,release:.1});onEnded();
      };
      return audio.playVoice(beat.voice,{
        priority:60,
        onStarted(buffer){audio.duck(groups,-2.5,{attack:.15,hold:Math.max(0,buffer.duration-.15),release:.4});},
        onEnded:end,onFailed:end,onInterrupted:end
      });
    },
    startSound(){
      if(started)return;
      started=true;elapsed=0;nextSettle=16;frightAt=-Infinity;
      previousBreath=audio.breathLevel ?? .035;
      previousRate=audio.breathSource?.playbackRate.value ?? 1;
      audio.startBreathing?.();
    },
    updateSound({t,dt,timing,position:eye}){
      if(!started)return;
      elapsed+=dt;
      const {times,seconds}=timing;
      const descent=t>=times.walk&&t<times.settle;
      const corner=t>=times.cornerWalk&&t<times.chairSettle;
      const stairs=descent&&eye[0]>6.85&&eye[2]>=-1.88&&eye[2]<=2.6;
      const age=t-times.settle;
      const strain=descent?(.12+.06*(t-times.walk)/seconds.walk+(stairs?.035:0)):
        .055+.075*Math.exp(-Math.max(0,age)/3)+.012*Math.max(0,Math.sin(elapsed*.9))**4;
      const fright=Math.exp(-Math.max(0,elapsed-frightAt)/.9);
      audio.setBreathing?.(strain+.18*fright);
      audio.breathSource?.playbackRate.setTargetAtTime((descent?(stairs?1.22:1.12):1.02)+.2*fright,audio.ctx.currentTime,.5);
      const phase=descent?(t-times.walk)*2.4*Math.PI:
        corner?(t-times.cornerWalk)*1.45*Math.PI:0;
      audio.updateFootsteps?.(phase,{moving:descent||corner?1:0,sprint:0,crouch:0,impact:stairs?1.22:1,silent:!descent&&!corner});
      if(elapsed>=nextSettle){
        effect('wood_creak','amb',.08,[2.5,2.8,1.8]);
        nextSettle+=19.7;
      }
    },
    playMonsterReveal(){
      frightAt=elapsed;effect('visor_off','sfx',.20,null);effect('gasp','amb',.15,null);dreadSwell();
    },
    playPerception(){effect('visor_on','amb',.07);},
    playAlert(){
      effect('wood_creak','sfx',.34);
      effect('cloth','amb',.12);
    },
    stopDialogue,
    dispose(){
      stopDialogue();for(const emitter of effects)emitter.stop(.15);effects.clear();
      if(started){
        audio.setBreathing?.(previousBreath);
        audio.breathSource?.playbackRate.setTargetAtTime(previousRate,audio.ctx.currentTime,.5);
        audio.updateFootsteps?.(0,{moving:0,silent:true});
      }
      started=false;
    }
  };
}
