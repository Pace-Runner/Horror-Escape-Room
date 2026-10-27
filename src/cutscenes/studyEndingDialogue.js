/** Existing game voice keys; recordings play once, unmodified, on the shared voice bus. */
export const ENDING_DIALOGUE=Object.freeze({
  release:{caption:"Mark... no.\nPlease.\nI can't stop you again.",voice:'mark/LEVEL 3/l3_annabelle_ending_release.mp3',duration:5.355102040816327},
  reseal:{caption:"It's okay, Mark. It's okay. I'm okay.",voice:'mark/LEVEL 3/l3_annabelle_ending_reseal.mp3',duration:4.54530612244898}
});
export function createEndingTiming(branch,duration=ENDING_DIALOGUE[branch].duration){
  const voiceDuration=Number.isFinite(duration)&&duration>0?duration:ENDING_DIALOGUE[branch].duration;
  const look=.25,lookDuration=1.8,voice=look+lookDuration+.4,voiceEnd=voice+voiceDuration;
  const common={look,lookDuration,voice,voiceDuration,voiceEnd,afterVoice:.45};
  if(branch==='release'){
    const turn=voiceEnd+.45,walk=turn+1.9,walkEnd=walk+6.2,hollow=walkEnd+2.95,still=hollow+.25;
    const claw=still+2.25,contact=claw+.9,black=contact+.45,news=black+1.25;
    return Object.freeze({...common,turn,turnDuration:1.9,door:voiceEnd-.85,walk,walkEnd,human:walkEnd,remove:walk-.4,
      hollow,still,claw,contact,fade:contact,black,news,end:news+.9});
  }
  const human=voiceEnd+.45,still=human+2.4,claw=still+2.25,contact=claw+.9,black=contact+.45,news=black+1.25;
  return Object.freeze({...common,human,hollow:still,still,claw,contact,fade:contact,black,news,end:news+.9,
    finalLock:still,quiet:still+.4,lastMechanism:human-.5,seal:human+.5,windDown:human+1.3,
    locked:human+1.8});
}
