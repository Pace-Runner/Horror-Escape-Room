import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { MARK_THOUGHTS } from '../src/story/markThoughts.js';
import { createMarkThoughts } from '../src/systems/MarkThoughts.js';
import { CaptionSequencer } from '../src/core/CaptionSequencer.js';
import { getAvailableHintKeys, createContextualHints } from '../src/core/ContextualHints.js';
import { HINTS } from '../src/story/hints.js';
const bundlePath=new URL(`../.mark-voice-check-${process.pid}.mjs`,import.meta.url);
for(const [file] of Object.values(MARK_THOUGHTS))assert(fs.statSync(new URL('../src/assets/audio/Dont Let it out Mark voice/'+file,import.meta.url)).size>1000,`missing Mark recording: ${file}`);
const assets=Object.fromEntries(Object.values(MARK_THOUGHTS).map(([file])=>['../assets/audio/Dont Let it out Mark voice/'+file,'/'+file]));
const bundle=await build({stdin:{contents:"export {AudioEngine} from './src/world/AudioEngine.js'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.glob':'globalThis.__voiceTestGlob'}});
globalThis.__voiceTestGlob=pattern=>pattern.includes('Dont Let it out')?assets:{};
class Buffer {constructor(duration=4){this.duration=duration;}}
globalThis.AudioBuffer=Buffer;
const sources=[];
const gain=()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){return this;},disconnect(){}});
const context={currentTime:0,createGain:gain,createBufferSource(){const src={connect(){return this;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(src);return src;}};
try {
 fs.writeFileSync(bundlePath,bundle.outputFiles[0].text);
 const {AudioEngine}=await import(pathToFileURL(bundlePath.pathname.replace(/^\/(\w:)/,'$1')).href);
 const audio=new AudioEngine();audio.ctx=context;audio.voiceGain=gain();
 for(const [file] of Object.values(MARK_THOUGHTS))audio.voiceBuffers.set('mark/'+file,new Buffer());
 const el={textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}};
 const captions=new CaptionSequencer(el);captions.setEnabled(true);
 captions.isVoiced=line=>Boolean(line?.recorded||audio.hasVoice(line?.voice));
 let documentOpen=false,cutscene=false,cutsceneName='studyMirrorReveal';
 const thoughts=createMarkThoughts(audio,{captions,canPlay:e=>(!cutscene||e.cutscene===cutsceneName)&&(!documentOpen||e.document)});
 // Exercise the actual main.js caption/voice bridge, including legacy caption keys without assets.
 const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const bridge=mainSource.slice(mainSource.indexOf('captions.onLineStart = ')).split('\n};')[0].slice('captions.onLineStart = '.length)+'\n}';
 captions.onLineStart=new Function('markThoughts','audio','let tapePlaying=false;return '+bridge)(thoughts,audio);
 for(const key of ['l1_03','hallway_01','l2_07','backrooms_01','l3_03']){
   thoughts.clear({reset:true});captions.cancel();
   assert(thoughts.play(key));const speaking=audio.voiceSource;
   captions.say({text:'Legacy pickup caption',voice:'level1/pickup_paperclip.m4a'});
   await captions.play([{text:'Old story placeholder',voice:'level1/freed_1.m4a'},'Another placeholder']);
   thoughts.update();assert.equal(audio.voiceSource,speaking,`legacy caption cut off ${key}`);
   assert.equal(el.textContent,MARK_THOUGHTS[key][1]);
   thoughts.clear({reset:true});captions.cancel();
   const legacy=captions.play([{text:'Unrecorded interaction sequence',voice:'level1/freed_1.m4a'}]);
   assert(thoughts.play(key),`unrecorded caption suppressed ${key}`);await legacy;
   thoughts.update();assert.equal(thoughts.currentKey,key);
 }
 thoughts.clear({reset:true});captions.cancel();cutscene=true;cutsceneName='wakeUp';
 assert(!thoughts.play('l1_01'),'incidental speech entered cutscene');
 assert(thoughts.play('l1_01',{cutscene:'wakeUp'}));thoughts.update();assert.equal(thoughts.currentKey,'l1_01');
 cutsceneName='studyMirrorReveal';thoughts.update();assert.equal(thoughts.currentKey,null,'wake speech survived different cutscene');
 cutscene=false;thoughts.clear({reset:true});captions.cancel();
 assert(thoughts.play('l1_18'));const first=audio.voiceSource;const firstText=el.textContent;
 assert(thoughts.play('l1_04'));assert(first.stopped);assert.notEqual(el.textContent,firstText);assert.equal(el.textContent,MARK_THOUGHTS.l1_04[1]);
 assert.equal(sources.filter(s=>s.started&&!s.stopped).length,1,'overlapping Mark voices');
 first.onended();assert.equal(thoughts.currentKey,'l1_04','obsolete onended erased replacement');
 assert(!thoughts.play('l3_hint_clock',{priority:20}),'hint interrupted item result');
 thoughts.clear({reset:true});assert.equal(el.textContent,'');
 assert(thoughts.play('l3_hint_clock',{priority:20}));const hint=audio.voiceSource;
 thoughts.cancel('l3_hint_clock');assert(hint.stopped);assert(thoughts.play('l3_02',{priority:40}));assert.equal(thoughts.currentKey,'l3_02');
 thoughts.clear({reset:true});assert(thoughts.play('l3_06',{replayable:true}));assert(!thoughts.play('l3_06',{replayable:true}));context.currentTime+=1.6;assert(thoughts.play('l3_06',{replayable:true}));
 thoughts.clear();documentOpen=true;assert(!thoughts.play('l3_hint_shadow',{priority:20}));assert(thoughts.play('l3_08',{document:true,priority:50}));
 cutscene=true;thoughts.update();assert.equal(audio.voiceSource,null);assert.equal(el.textContent,'');
 cutscene=false;documentOpen=false;thoughts.update();assert.equal(audio.voiceSource,null,'interrupted line resumed');
 // A slow old decode must not become audible after a newer request.
 let resolveOld;const oldKey='mark/'+MARK_THOUGHTS.l3_01[0];audio.voiceBuffers.set(oldKey,new Promise(r=>resolveOld=r));
 audio.playVoice(oldKey);audio.playVoice('mark/'+MARK_THOUGHTS.l3_03[0]);const latest=audio.voiceSource;
 resolveOld(new Buffer());await Promise.resolve();await Promise.resolve();assert.equal(audio.voiceSource,latest);
 audio.stopVoice();
 const nodes=[];globalThis.document={createElement(){const el={hidden:false,textContent:'',classList:{add(){},remove(){}},setAttribute(){},append(...children){this.children=children;}};nodes.push(el);return el;},body:{append(){}}};
 const hints=createContextualHints();for(let i=0;i<4;i++)hints.show('l3_clock');assert.equal(nodes[2].textContent,HINTS.l3_clock[2]);hints.reset();hints.show('l3_clock');assert.equal(nodes[2].textContent,HINTS.l3_clock[0]);hints.hide();
 for(const [progress,key] of [[{},'l3_clock'],[{clockSolved:true},'l3_crest'],[{crestSolved:true},'l3_memory'],[{memoryVisorCollected:true},'l3_trail'],[{correctedTrailSolved:true},'l3_restricted'],[{truthRecordsSolved:true},'l3_letter'],[{hasHollowOverrideKey:true},'l3_choice']])assert.equal(getAvailableHintKeys('study',progress)[0],key);
 assert.equal(HINTS.l3_choice.length,1);assert(HINTS.l3_memory[2].includes('ADAPTIVE RESTORATION'));
 console.log('PASS: all Mark assets present; actual caption bridge preserves thoughts across every level; authored wake-up speech only; Level 1 immediate audio/subtitle replacement; priorities; solve cancels hint; 1.5s replay debounce; document suppression; cutscene cancellation/no resume; stale decode discarded; H escalation/clamp/reset and Level 3 progression contexts.');
} finally {fs.rmSync(bundlePath,{force:true});}

