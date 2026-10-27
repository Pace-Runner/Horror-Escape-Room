import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ENDING_SFX,createEndingAudioTimeline} from '../src/cutscenes/studyEndingAudioConfig.js';
import {createStudyEndingAudio} from '../src/cutscenes/studyEndingAudio.js';
import {RELEASE_TIMING} from '../src/cutscenes/studyReleaseEnding.js';
import {RESEAL_TIMING} from '../src/cutscenes/studyResealEnding.js';
const directory=path.resolve('src/assets/audio/Dont Let it out Mark voice/LEVEL 3/ENDINGS');
function wav(file){
  const bytes=fs.readFileSync(path.join(directory,file));let rate,align,length,data,bits;
  for(let i=12;i+8<=bytes.length;){const size=bytes.readUInt32LE(i+4),tag=bytes.toString('ascii',i,i+4);
    if(tag==='fmt '){rate=bytes.readUInt32LE(i+12);align=bytes.readUInt16LE(i+20);bits=bytes.readUInt16LE(i+22);}
    if(tag==='data'){length=size;data=i+8;}i+=8+size+(size%2);}
  let peak=0;
  for(let i=0;i<length;i+=bits/8){const value=bits===24?bytes.readIntLE(data+i,3)/8388608:bytes.readInt16LE(data+i)/32768;peak=Math.max(peak,Math.abs(value));}
  return {file,duration:length/(rate*align),bytes,rate,align,data,peak};
}
const sources=new Map(Object.values(ENDING_SFX).map(spec=>[spec.file,wav(spec.file)]));
assert.deepEqual([...sources.keys()].sort(),fs.readdirSync(directory).filter(f=>f.endsWith('.wav')).sort(),'uninspected ending file');
for(const spec of Object.values(ENDING_SFX)){
  const source=sources.get(spec.file);assert(Math.abs(spec.sourceDuration-source.duration)<.002);
  assert(spec.offset>=0&&spec.offset+spec.duration<=source.duration+.001,'invalid selected window '+spec.file);
  assert(spec.duration<source.duration&&spec.duration<=12,'full long source selected '+spec.file);
}
const impact=sources.get(ENDING_SFX.impact.file);let peak=0,peakAt=0;
for(let p=0;p<impact.duration*impact.rate*impact.align;p+=2){const value=Math.abs(impact.bytes.readInt16LE(impact.data+p));if(value>peak){peak=value;peakAt=p/(impact.rate*impact.align);}}
assert(Math.abs(peakAt-ENDING_SFX.impact.offset)<.008,'impact transient not aligned to contact');

for(const [branch,T] of [['release',RELEASE_TIMING],['reseal',RESEAL_TIMING]]){
  for(const cancelAt of [null,.5,4.2,T.black+.15]){
    let now=0;const emitted=[],ducks=[];
    const audio={ctx:{decodeAudioData:async bytes=>{const name=Buffer.from(bytes).toString();return sources.get(name);}},voiceSource:null,
      cue:key=>{assert.equal(key,'rain_bed');return {file:key,duration:90};},
      duck:(groups,db,opts)=>ducks.push({groups,db,opts,t:now}),
      emit(bus,opts){assert.equal(bus,'sfx');assert.equal(opts.loop,false);assert(opts.duration>0&&opts.offset+opts.duration<=opts.buffer.duration+.001);
        const record={...opts,t:now,stops:[],gains:[]};emitted.push(record);
        return {stop:fade=>record.stops.push({t:now,fade}),setGain:(gain,tau)=>record.gains.push({gain,tau,t:now})};}
    };
    const urls=Object.fromEntries([...sources.keys()].map(name=>[name,name]));
    const ctrl=createStudyEndingAudio(audio,{branch,timing:T,urls,fetchAudio:async name=>({ok:true,arrayBuffer:async()=>Buffer.from(name)})});
    await ctrl.prepare();
    const timeline=createEndingAudioTimeline(branch,T);
    for(let t=0;t<T.end;t+=.01){
      let bound=0;for(const e of timeline){const spec=e.key==='rain'?{duration:e.duration,gain:e.gain}:ENDING_SFX[e.key];
        if(t<e.t||t>=e.t+(e.duration??spec.duration))continue;
        if(t>=(branch==='release'?T.fade:T.contact)&&e.group==='scene')continue;
        bound+=(e.gain??spec.gain)*(e.key==='rain'?1:sources.get(spec.file).peak);
      }
      assert(bound<.8,'ending layers lack mix headroom: '+bound);
    }
    assert(timeline.some(e=>e.key==='alarm')&&timeline.some(e=>e.key==='lunge'));
    for(now=0;now<T.end+.001;now+=.01){
      audio.voiceSource=now>=3&&now<5?{}:null;
      if(cancelAt!==null&&now>=cancelAt)break;
      ctrl.update(now);
    }
    ctrl.dispose();const count=emitted.length;ctrl.update(T.end+60);assert.equal(emitted.length,count,'disposed timeline restarted');
    assert.equal(ctrl.activeCount,0);assert(emitted.every(e=>e.stops.length),'reset failed to stop owned source');
    assert(ducks.some(d=>d.db===0),'cleanup left ambience ducked');
    if(cancelAt!==null)continue;
    assert(emitted.some(e=>e.gains.some(g=>g.gain<e.gain)),'speech did not reduce ending SFX');
    assert(emitted.some(e=>e.gains.some(g=>g.tau===.4)),'dialogue mix did not restore smoothly');
    const staticSound=emitted.filter(e=>e.buffer.file===ENDING_SFX.static.file);
    assert.equal(staticSound.length,1);assert(staticSound[0].t>=T.news-.001&&staticSound[0].t>=T.black+1.2);
    assert(!emitted.some(e=>e.buffer.file===ENDING_SFX.newsBed.file),'news bed starts without news voice');
    const hit=emitted.find(e=>e.buffer.file===ENDING_SFX.impact.file&&e.gain>.4);
    const contact=branch==='release'?T.fade:T.contact;assert(Math.abs(hit.t-contact)<.011,'screen-hit sync');
    for(const e of emitted.filter(e=>e.t<contact&&e.t+e.duration>contact))assert(e.stops.some(s=>Math.abs(s.t-contact)<.011&&s.fade<=.04),'scene leaked past impact');
    const limit=Math.max(...emitted.map(e=>e.duration));assert(limit<16,'unbounded long playback');
    assert(timeline.some(e=>e.key==='rumble'&&e.t===T.still),'missing tension swell');
    const rush=emitted.find(e=>e.buffer.file===ENDING_SFX.lunge.file);
    assert(Math.abs(rush.t-T.claw)<.011&&Math.abs(rush.duration-.9)<.011,'lunge SFX not matched to refined attack');
    if(branch==='reseal')assert(emitted.some(e=>e.buffer.file===ENDING_SFX.seal.file&&e.gain===.26&&Math.abs(e.t-T.finalLock)<.011),'final lock lacks definitive layer');
  }
}
// Pending network/decode completion after reset must never emit anything.
const pendingFetches=[];let lateEmits=0;const pending=createStudyEndingAudio({ctx:{decodeAudioData:async()=>({duration:60})},duck(){},emit(){lateEmits++;}},
  {branch:'release',timing:RELEASE_TIMING,urls:Object.fromEntries([...sources.keys()].map(f=>[f,f])),fetchAudio:()=>new Promise(resolve=>{pendingFetches.push(resolve);})});
const preparing=pending.prepare();pending.dispose();for(const resolve of pendingFetches)resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await preparing;
pending.update(100);assert.equal(lateEmits,0);
console.log('PASS: all 10 real WAVs/window bounds; impact transient alignment; distinct bounded timelines; no loops/full-minute playback; speech duck/restore; impact/black cutoffs; quiet static after 1.25s black; final lock; reset/cancel/stale-load safety.');
