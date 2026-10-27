/** Small procedural effects on the existing game audio buses; no files, loops or voice. */
export function createResealAttackAudio(audio){
  const active=new Set(),buffers=new Map();
  function buffer(kind){
    if(buffers.has(kind))return buffers.get(kind);
    const ctx=audio.ctx;if(!ctx)return null;
    const seconds=kind==='attack-swell'?2.25:.40;
    const result=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate),data=result.getChannelData(0);
    let phase=0,previous=0,seed=1297;
    for(let i=0;i<data.length;i++){
      const t=i/ctx.sampleRate,u=t/seconds;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;
      if(kind==='attack-swell'){
        phase+=2*Math.PI*(48+8*u)/ctx.sampleRate;
        data[i]=Math.sin(phase)*.14*Math.sin(Math.PI*u)**1.5;
      }else{
        phase+=2*Math.PI*(38+37*Math.exp(-t*24))/ctx.sampleRate;
        const slash=(noise-previous)*.12*Math.min(1,t/.008)*Math.exp(-t*27);
        const impact=Math.sin(phase)*.35*Math.min(1,t/.006)*Math.exp(-t*12);
        data[i]=(slash+impact)*Math.min(1,(seconds-t)/.025);previous=noise;
      }
    }
    buffers.set(kind,result);return result;
  }
  return {
    play(kind,position){
      const b=kind==='news-static'?audio.cue('crt_static'):buffer(kind);if(!b)return;
      const emitter=audio.emit('sfx',{buffer:b,gain:kind==='news-static'?.07:1,
        duration:kind==='news-static'?.65:b.duration,fadeIn:kind==='news-static'?.04:0,fadeOut:.06,
        ...(kind==='attack-swell'?{position}: {})});
      if(emitter)active.add(emitter);
    },
    dispose(){for(const emitter of active)emitter.stop(.03);active.clear();buffers.clear();}
  };
}
