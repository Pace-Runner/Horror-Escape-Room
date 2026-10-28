import fs from 'node:fs';

// Original instrumental cue: slow D-minor/add9 voicings, bowed harmonics and soft bells.
// Deterministic synthesis; no third-party samples. Playback overlaps phrases with long fades.
const rate=22050,seconds=14.2,count=Math.round(rate*seconds),channels=[new Float64Array(count),new Float64Array(count)];
const midi=n=>440*2**((n-69)/12);
const chords=[[38,57,60,64,69],[34,53,57,60,65],[41,57,60,64,69],[33,55,59,62,64]];
for(let chord=0;chord<4;chord++)for(let note=0;note<5;note++){
  const start=chord*3,frequency=midi(chords[chord][note]),duration=5.2;
  for(let i=Math.floor(start*rate);i<Math.min(count,(start+duration)*rate);i++){
    const t=i/rate-start,envelope=Math.min(1,t/1.25)*Math.min(1,(duration-t)/2.6);
    for(let side=0;side<2;side++){
      const phase=2*Math.PI*frequency*(1+(side?1:-1)*.0009)*t;
      const bow=Math.sin(phase)+.18*Math.sin(phase*2)+.07*Math.sin(phase*3);
      channels[side][i]+=bow*envelope*(note===0?.18:.075)*(1+.07*Math.sin(t*2.1+note));
    }
  }
}
// Sparse high notes and a diffuse stereo tail rather than a rhythmic beat.
for(const [start,pitch] of [[1,81],[4.3,76],[7.4,79],[10.5,76]]){
  for(let i=Math.floor(start*rate);i<count;i++){
    const t=i/rate-start,s=Math.sin(2*Math.PI*midi(pitch)*t)*Math.exp(-t/1.4)*Math.min(1,t/.025)*.035;
    channels[0][i]+=s;channels[1][i]+=s*.8;
  }
}
for(let side=0;side<2;side++)for(let i=count-1;i>=0;i--){
  let tail=0;for(const [delay,gain] of [[.19,.20],[.37,.16],[.61,.12],[.97,.08]]){
    const at=i-Math.floor((delay+side*.023)*rate);if(at>=0)tail+=channels[1-side][at]*gain;
  }
  channels[side][i]+=tail;
}
let peak=0;for(const ch of channels)for(const s of ch)peak=Math.max(peak,Math.abs(s));
const data=Buffer.alloc(44+count*4);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);
data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*4,40);
for(let i=0;i<count;i++)for(let side=0;side<2;side++){
  const envelope=Math.min(1,i/rate/.05,(seconds-i/rate)/.1);
  data.writeInt16LE(Math.round(channels[side][i]/peak*.74*envelope*32767),44+i*4+side*2);
}
fs.writeFileSync('src/assets/audio/endings-contained/l3_credits_score.wav',data);
console.log('Original credits score written: 14.2 seconds, stereo PCM, peak -2.6 dBFS.');
