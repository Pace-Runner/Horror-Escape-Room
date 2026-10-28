import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ENDING_SFX,CONTAINED_SFX,createEndingAudioTimeline} from '../src/cutscenes/studyEndingAudioConfig.js';
import {createStudyEndingAudio} from '../src/cutscenes/studyEndingAudio.js';
import {RELEASE_TIMING} from '../src/cutscenes/studyReleaseEnding.js';
import {RESEAL_TIMING} from '../src/cutscenes/studyResealEnding.js';
const SFX={...ENDING_SFX,...CONTAINED_SFX};
const curatedFiles=new Set(Object.values(CONTAINED_SFX).map(s=>s.file));
const directory=path.resolve('src/assets/audio/Dont Let it out Mark voice/LEVEL 3/ENDINGS');
function wav(file){
  const bytes=fs.readFileSync(path.join(curatedFiles.has(file)?'src/assets/audio/endings-contained':directory,file));let rate,align,length,data,bits;
  for(let i=12;i+8<=bytes.length;){const size=bytes.readUInt32LE(i+4),tag=bytes.toString('ascii',i,i+4);
    if(tag==='fmt '){rate=bytes.readUInt32LE(i+12);align=bytes.readUInt16LE(i+20);bits=bytes.readUInt16LE(i+22);}
    if(tag==='data'){length=size;data=i+8;}i+=8+size+(size%2);}
  let peak=0;
  for(let i=0;i<length;i+=bits/8){const value=bits===24?bytes.readIntLE(data+i,3)/8388608:bytes.readInt16LE(data+i)/32768;peak=Math.max(peak,Math.abs(value));}
  return {file,duration:length/(rate*align),bytes,rate,align,data,peak};
}
const sources=new Map(Object.values(SFX).map(spec=>[spec.file,wav(spec.file)]));
assert.deepEqual([...sources.keys()].filter(f=>!curatedFiles.has(f)).sort(),fs.readdirSync(directory).filter(f=>f.endsWith('.wav')).sort(),'uninspected ending file');
for(const spec of Object.values(SFX)){
  const source=sources.get(spec.file);assert(Math.abs(spec.sourceDuration-source.duration)<.002);
  assert(spec.offset>=0&&spec.offset+spec.duration<=source.duration+.001,'invalid selected window '+spec.file);
  assert(spec.duration<source.duration&&spec.duration<=15,'full long source selected '+spec.file);
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
      let bound=0;for(const e of timeline){const spec=e.key==='rain'?{duration:e.duration,gain:e.gain}:SFX[e.key];
        if(t<e.t||t>=e.t+(e.duration??spec.duration))continue;
        if(t>=(branch==='release'?T.fade:T.contact)&&e.group==='scene')continue;
        bound+=(e.gain??spec.gain)*(e.key==='rain'?1:sources.get(spec.file).peak);
      }
      assert(bound<.8,'ending layers lack mix headroom: '+bound);
    }
    assert(timeline.some(e=>e.key==='rise')&&timeline.some(e=>e.key==='hollowRush'));
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
    assert.equal(staticSound.length,Math.ceil(T.newsDuration/5.6),'unexpected radio bridge/carrier count');
    assert(timeline.some(e=>e.key==='tune'&&e.t>T.black+1&&e.t<T.news),'radio tuning does not bridge aftermath and report');
    assert(!emitted.some(e=>e.buffer.file===ENDING_SFX.newsBed.file),'news bed starts without news voice');
    const hit=emitted.find(e=>e.buffer.file===CONTAINED_SFX.hollowClaw.file&&e.gain>=.3&&Math.abs(e.t-(T.contact??T.fade))<.02);
    const contact=branch==='release'?T.fade:T.contact;assert(Math.abs(hit.t-contact)<.011,'screen-hit sync');
    for(const e of emitted.filter(e=>e.t<contact&&e.t+e.duration>contact+.001))assert(e.stops.some(s=>Math.abs(s.t-contact)<.011&&s.fade<=.04),'scene leaked past impact');
    const limit=Math.max(...emitted.map(e=>e.duration));assert(limit<16,'unbounded long playback');
    assert(timeline.some(e=>e.key==='tension'),'missing continuous tension swell');
    const music=emitted.filter(e=>e.buffer.file===CONTAINED_SFX.creditsMusic.file);
    assert(music.length>=2,'missing credits score');
    assert(Math.abs(music[0].t-T.credits)<.02,'score must start with credits');
    assert(music.every(e=>e.duration<=14&&e.t+e.duration<=T.end+.02),'score outlives ending');
    const rush=emitted.find(e=>e.buffer.file===CONTAINED_SFX.hollowRush.file);
    assert(Math.abs(rush.t-(T.contact-.40))<.011&&Math.abs(rush.duration-.40)<.011,'rush does not reach contact');
    {assert(!timeline.some(e=>['roar','lunge','impact'].includes(e.key)),'legacy attack audio remains');assert(timeline.some(e=>e.key==='hollowRoar'&&e.t<T.claw)&&timeline.some(e=>e.key==='hollowGrowl'),'new roar/growl missing');}
    if(branch==='reseal')assert(emitted.some(e=>e.buffer.file===ENDING_SFX.seal.file&&e.gain===.18&&Math.abs(e.t-T.finalLock)<.011),'final lock lacks definitive layer');
  }
}
// Pending network/decode completion after reset must never emit anything.
const pendingFetches=[];let lateEmits=0;const pending=createStudyEndingAudio({ctx:{decodeAudioData:async()=>({duration:60})},duck(){},emit(){lateEmits++;}},
  {branch:'release',timing:RELEASE_TIMING,urls:Object.fromEntries([...sources.keys()].map(f=>[f,f])),fetchAudio:()=>new Promise(resolve=>{pendingFetches.push(resolve);})});
const preparing=pending.prepare();pending.dispose();for(const resolve of pendingFetches)resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await preparing;
pending.update(100);assert.equal(lateEmits,0);
console.log('PASS: all 20 real WAVs/window bounds; impact transient alignment; distinct bounded timelines; no loops/full-minute playback; speech duck/restore; impact/black cutoffs; contained radio bridge/carrier; final lock; reset/cancel/stale-load safety.');
