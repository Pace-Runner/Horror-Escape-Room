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
const gain=()=>({gain:{value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){}},connect(){return this;},disconnect(){}});
const context={currentTime:0,createGain:gain,createBufferSource(){const src={connect(){return this;},disconnect(){},start(at,offset){this.started=true;this.startAt=at;this.offset=offset;},stop(at){this.stopped=true;this.stopAt=at;}};sources.push(src);return src;}};
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
 captions.onLineStart=new Function('markThoughts','audio','captions','let tapePlaying=false;return '+bridge)(thoughts,audio,captions);
 const release=mainSource.match(/captions.onLineCancel=(.*);/)[1];
 captions.onLineCancel=new Function('audio','return '+release)(audio);
 for(const key of ['l1_03','hallway_01','l2_07','backrooms_01','l3_03']){
   thoughts.clear({reset:true});captions.cancel();
   assert(thoughts.play(key));const speaking=audio.voiceSource;
   captions.say({text:'Legacy pickup caption',voice:'level1/pickup_paperclip.m4a'});
   await captions.play([{text:'Old story placeholder',voice:'level1/freed_1.m4a'},'Another placeholder']);
   thoughts.update();assert.equal(audio.voiceSource,speaking,`legacy caption cut off ${key}`);
   assert(el.textContent.includes(MARK_THOUGHTS[key][1]),'interaction removed spoken subtitle');
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
 // The bus protects both playing and still-decoding story recordings.
 thoughts.clear({reset:true});captions.cancel();
 const storyKey='mark/'+MARK_THOUGHTS.l1_01[0];
 audio.playVoice('mark/'+MARK_THOUGHTS.l1_03[0],{priority:30});const fading=audio.voiceSource;
 audio.playVoice(storyKey,{priority:60});const storySource=audio.voiceSource;
 assert(Math.abs(fading.stopAt-context.currentTime-.012)<1e-8,'voice interruption lost its de-click ramp');
 assert(storySource.startAt>=fading.stopAt,'replacement overlaps outgoing spoken voice');
 assert(!thoughts.play('l3_hint_clock',{priority:20}));assert(!thoughts.play('l1_09'));assert.equal(audio.voiceSource,storySource);
 audio.stopVoice();let finishPending,interrupted=0;
 audio.voiceBuffers.set(storyKey,new Promise(resolve=>finishPending=resolve));
 audio.playVoice(storyKey,{priority:60,onInterrupted:()=>interrupted++});
 assert(!audio.playVoice('mark/'+MARK_THOUGHTS.l1_03[0],{priority:20}));
 audio.stopVoice();finishPending(new Buffer());await Promise.resolve();await Promise.resolve();
 assert.equal(interrupted,1);assert.equal(audio.voiceSource,null);
 audio.voiceBuffers.set(storyKey,new Buffer());
 // Captions wait for decoding, hold for actual audio, toggle independently and release their own voice.
 let decode;audio.voiceBuffers.set(storyKey,new Promise(resolve=>decode=resolve));
 captions.say({text:'Recorded story',speaker:'MARK',voice:storyKey});
 assert(captions._line.voicePending);captions.setEnabled(false);captions.setEnabled(true);
 assert(captions._line.voicePending);decode(new Buffer(4));await Promise.resolve();await Promise.resolve();
 assert.equal(captions._line.duration,4);assert(!captions._line.voicePending);
 for(let i=0;i<120;i++)captions.update(.1);assert.equal(captions._phase,'hold','caption expired while source was playing');
 captions.cancel();assert.equal(audio.voiceSource,null);
 // Replacing an authored sequence must preserve the NEW remaining lines.
 audio.voiceBuffers.set(storyKey,new Buffer());
 captions.say({text:'Old recorded line',voice:storyKey});
 const oldCaptionSource=audio.voiceSource;
 const authored=captions.play([{text:'New recorded line',voice:storyKey},{text:'Next authored line',voice:storyKey}]);
 assert(oldCaptionSource.stopped);assert.equal(captions._queue.length,1);
 audio.voiceSource.onended();for(let i=0;i<8;i++)captions.update(.1);
 assert.equal(captions._line.text,'Next authored line');captions.cancel();await authored;
 // Only a completed authored group advances. An important replacement kills its remaining lines.
 thoughts.clear({reset:true});captions.cancel();
 assert(thoughts.playSequence(['l2_12','l2_14','l2_15','l2_16'],{priority:true}));
 const firstGroupSource=audio.voiceSource;firstGroupSource.onended();assert.equal(thoughts.currentKey,'l2_14');
 assert(thoughts.play('l1_04',{priority:60}));const replacement=audio.voiceSource;
 firstGroupSource.onended();assert.equal(audio.voiceSource,replacement);assert.equal(thoughts.currentKey,'l1_04');
 thoughts.clear();assert.equal(audio.voiceSource,null);assert.equal(captions._line,null);
 // Execute the shipped bulb callback while the cuff recording still owns the bus.
 thoughts.clear({reset:true});captions.cancel();captions.setEnabled(false);
 assert(thoughts.play('l1_04'));
 const cuffSource=audio.voiceSource;
 const blowBody=mainSource.match(/onBlow: \(\) => \{([\s\S]*?)\n    \}/)[1];
 new Function('thought','sceneManager','bedroom','audio',blowBody)(
   (key,options)=>thoughts.play(key,options),{activeKey:'bedroom'},
   {refs:{pendantIntact:{},pendantBroken:{}}},{bulbPop(){}});
 thoughts.update();assert(cuffSource.stopped);
 assert.equal(thoughts.currentKey,'l1_05');
 assert(el.textContent.includes(MARK_THOUGHTS.l1_05[1]),'bulb recording has no spoken subtitle with descriptions off');
 assert(!thoughts.play('l1_06'),'pickup interrupted bulb reaction');
 audio.voiceSource.onended();assert.equal(captions._line,null);
 // State may change between a request and the decoded recording becoming ready.
 thoughts.clear({reset:true});let finishDecode;
 audio.voiceBuffers.set(oldKey,new Promise(resolve=>finishDecode=resolve));
 assert(thoughts.play('l3_01'));documentOpen=true;
 finishDecode(new Buffer());await Promise.resolve();await Promise.resolve();
 assert.equal(audio.voiceSource,null,'obsolete decoded thought started inside document');
 assert.equal(thoughts.currentKey,null);documentOpen=false;captions.setEnabled(true);
 // Actual study evidence hooks: the third document's reaction owns its full beat.
 thoughts.clear({reset:true});documentOpen=true;
 const studySource=fs.readFileSync('src/levels/studyLevel.js','utf8');
 const correctedBody=studySource.match(/function correctedEvidence\(\) \{([\s\S]*?)\n  \}/)[1];
 const corrected=new Function('puzzle','gameState','onThought',correctedBody).bind(null,
   {memoryVisorCollected:true},{visorWorn:true},(key,options)=>thoughts.play(key,options));
 const evidenceBody=studySource.match(/function readEvidence\(id\) \{([\s\S]*?)\n  \}/)[1];
 const readEvidence=new Function('id','evidenceRead','onThought','correctedEvidence',evidenceBody);
 readEvidence('third',new Set(['first','second']),(key,options)=>thoughts.play(key,options),corrected);
 assert.equal(thoughts.currentKey,'l3_07');const evidenceSource=audio.voiceSource;
 corrected();assert.equal(audio.voiceSource,evidenceSource,'visor thought cut off evidence story');
 evidenceSource.onended();assert.equal(thoughts.currentKey,'l3_05');
 thoughts.clear();documentOpen=false;
 const nodes=[];globalThis.document={createElement(){const el={hidden:false,textContent:'',classList:{add(){},remove(){}},setAttribute(){},append(...children){this.children=children;}};nodes.push(el);return el;},body:{append(){}}};
 const hints=createContextualHints();for(let i=0;i<4;i++)hints.show('l3_clock');assert.equal(nodes[2].textContent,HINTS.l3_clock[2]);hints.reset();hints.show('l3_clock');assert.equal(nodes[2].textContent,HINTS.l3_clock[0]);hints.hide();
 for(const [progress,key] of [[{},'l3_clock'],[{clockSolved:true},'l3_crest'],[{crestSolved:true},'l3_memory'],[{memoryVisorCollected:true},'l3_trail'],[{correctedTrailSolved:true},'l3_restricted'],[{truthRecordsSolved:true},'l3_letter'],[{hasHollowOverrideKey:true},'l3_choice']])assert.equal(getAvailableHintKeys('study',progress)[0],key);
 assert.equal(HINTS.l3_choice.length,1);assert(HINTS.l3_memory[2].includes('ADAPTIVE RESTORATION'));
 console.log('PASS: all Mark assets present; actual caption bridge preserves thoughts across every level; authored wake-up speech only; Level 1 immediate audio/subtitle replacement; priorities; solve cancels hint; 1.5s replay debounce; document suppression; cutscene cancellation/no resume; stale decode discarded; H escalation/clamp/reset and Level 3 progression contexts.');
} finally {fs.rmSync(bundlePath,{force:true});}

