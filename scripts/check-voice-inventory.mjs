import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {MARK_THOUGHTS} from '../src/story/markThoughts.js';
import {REVEAL_VOICE_LINES} from '../src/cutscenes/studyReveal.js';
import {ENDING_DIALOGUE} from '../src/cutscenes/studyEndingDialogue.js';
import {ENDING_NEWS} from '../src/cutscenes/studyEndingNews.js';
import {ANNABELLE_LETTER_VOICE} from '../src/core/LetterNarration.js';
import {SESSION_TAPE_SUBTITLES} from '../src/story/sessionTape.js';
import {mp4Duration} from './check-audio.mjs';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name).replaceAll('\\','/')]);
const recordings=walk('src/assets/audio').filter(f=>/\.(mp3|m4a|wav|ogg)$/i.test(f));
const files=new Set([...recordings,...walk('src/assets/voice')]);
const markRoot='src/assets/audio/Dont Let it out Mark voice/';
const resolveVoice=key=>key.startsWith('mark/')?markRoot+key.slice(5):key.startsWith('audio/')?'src/assets/audio/'+key.slice(6):key.startsWith('l3_news_')?'src/assets/audio/'+key:'src/assets/voice/'+key;
function mp3Seconds(file){
  const b=fs.readFileSync(file);let at=0,seconds=0,frames=0;
  if(b.toString('ascii',0,3)==='ID3')at=10+((b[6]&127)<<21)+((b[7]&127)<<14)+((b[8]&127)<<7)+(b[9]&127);
  const bitrates={3:[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],2:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160]};
  while(at+4<b.length){
    const h=b.readUInt32BE(at),v=(h>>>19)&3,layer=(h>>>17)&3,bi=(h>>>12)&15,sr=(h>>>10)&3;
    if((h>>>21)!==2047||v===1||layer!==1||bi===0||bi===15||sr===3){at++;continue;}
    const rate=[44100,48000,32000][sr]/(v===3?1:v===2?2:4),samples=v===3?1152:576;
    const length=Math.floor((v===3?144:72)*bitrates[v===3?3:2][bi]*1000/rate)+((h>>>9)&1);
    if(at+length>b.length)break;
    frames++;seconds+=samples/rate;at+=length;
  }
  assert(frames>0,'no playable MPEG audio frames '+file);return seconds;
}
const mappings=[...Object.entries(MARK_THOUGHTS).map(([id,[file]])=>({id,voice:'mark/'+file,owner:'thought'})),
  ...REVEAL_VOICE_LINES.map(l=>({id:l.id,voice:l.voice,owner:'reveal'})),
  ...Object.entries(ENDING_DIALOGUE).map(([id,l])=>({id,voice:l.voice,owner:'ending'})),
  ...Object.entries(ENDING_NEWS).map(([id,l])=>({id,voice:l.voice,owner:'news'})),
  {id:'letter',voice:ANNABELLE_LETTER_VOICE,owner:'document'},
  {id:'opening-news',voice:'audio/news_intro.MP3',owner:'opening'},
  ...SESSION_TAPE_SUBTITLES.map((l,i)=>({id:'session-'+(i+1),voice:l.voice,owner:'tape'}))];
for(const m of mappings){
  assert(!m.voice.includes('..')&&!m.voice.includes('\\'),'invalid voice path '+m.voice);
  m.file=resolveVoice(m.voice);assert(files.has(m.file),'missing or incorrectly cased voice '+m.file);assert(fs.statSync(m.file).size>1000);
  const bytes=fs.readFileSync(m.file),mp4=bytes.toString('ascii',4,8)==='ftyp';
  m.container=mp4?'MP4/AAC':'MPEG audio';
  m.duration=mp4?mp4Duration(bytes):mp3Seconds(m.file);
}
const durationDifferences=REVEAL_VOICE_LINES.map(line=>({voice:line.voice,declared:line.hold,measured:mappings.find(m=>m.owner==='reveal'&&m.voice===line.voice).duration})).filter(l=>Math.abs(l.declared-l.measured)>.16);
assert.equal(durationDifferences.length,0,'reveal recording lengths changed');
for(const cue of SESSION_TAPE_SUBTITLES)assert(Math.abs(mappings.find(m=>m.voice===cue.voice).duration-(cue.end-cue.start))<.08,'tape caption duration changed '+cue.voice);
for(const [branch,line] of Object.entries(ENDING_DIALOGUE))assert(Math.abs(mappings.find(m=>m.owner==='ending'&&m.id===branch).duration-line.duration)<.16);
for(const [branch,line] of Object.entries(ENDING_NEWS))assert(Math.abs(mappings.find(m=>m.owner==='news'&&m.id===branch).duration-line.duration)<.16);
const mapped=new Set(mappings.map(m=>m.file));
assert.equal(new Set(mappings.map(m=>m.voice.toLowerCase())).size,mappings.length,'duplicate voice mapping');
assert.deepEqual(walk('src/assets/voice').filter(f=>/\.(mp3|m4a|wav|ogg)$/i.test(f)&&!mapped.has(f)),[],'unmapped legacy voice recording');
const unusedVoice=recordings.filter(f=>f.startsWith(markRoot)&&f.endsWith('.mp3')&&!mapped.has(f));
const knownUnused=['LEVEL 1/l1_line_door_locked_1.mp3','BACKROOMS/backrooms_line_look_1.mp3','BACKROOMS/backrooms_line_look_2.mp3','BACKROOMS/backrooms_line_look_3.mp3','LEVEL 3/l3_mark_reveal_06_someones_there.mp3'].map(f=>markRoot+f);
assert(unusedVoice.every(f=>knownUnused.includes(f)),'new unreferenced voice recording');
const sourceFiles=walk('src').filter(f=>f.endsWith('.js')&&!f.startsWith('src/assets/'));
const source=sourceFiles.filter(f=>!f.endsWith('/markThoughts.js')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
for(const id of Object.keys(MARK_THOUGHTS))assert(source.includes(id),'mapped thought has no trigger '+id);
const legacy=[];const keys=new Set();
for(const f of fs.readdirSync('src/dialogue').filter(f=>f.endsWith('.js')&&f!=='index.js')){
  const mod=await import(pathToFileURL(path.resolve('src/dialogue',f)));
  for(const [key,value] of Object.entries(mod))if(key.startsWith('dialog_')){
    assert(!keys.has(key),'duplicate dialogue key '+key);keys.add(key);
    const rows=Array.isArray(value?.[0])?value:[value];
    for(const row of rows)if(Array.isArray(row)&&typeof row[1]==='string'&&row[1]&&!files.has(resolveVoice(row[1])))legacy.push({key,voice:row[1],status:'existing text-only placeholder; no shipped recording'});
  }
}
const unreferencedAudio=recordings.filter(f=>!mapped.has(f)&&!source.includes(path.basename(f))&&!source.includes(path.basename(f,path.extname(f))+'.*')&&
  !fs.readFileSync('src/assets/audio/manifest.json','utf8').includes(path.basename(f)));
for(const news of Object.values(ENDING_NEWS))for(let i=0;i<news.captions.length;i++){
  const cue=news.captions[i];assert(cue.start>=0&&cue.end>cue.start&&cue.end<=news.duration+.001);
  if(i)assert(cue.start>=news.captions[i-1].end,'overlapping news captions');
}
const report={recordingCount:recordings.length,mappedVoiceCount:mappings.length,missingShippedVoiceFiles:[],unusedVoice,
  durationDifferences,
  containerMismatches:mappings.filter(m=>/\.mp3$/i.test(m.file)&&m.container==='MP4/AAC').map(m=>m.file),
  unusedVoiceReasons:Object.fromEntries(unusedVoice.map(f=>[f,f.includes('reveal_06')?'Unused alternative reveal line retained to preserve the approved reveal order.':'Retired from active playback by request; original audio preserved.'])),
  legacyTextOnlyCaptionPaths:legacy,unreferencedAudio,mappings};
fs.mkdirSync('docs/validation',{recursive:true});fs.writeFileSync('docs/validation/voice-dialogue-inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({recordings:recordings.length,mappedVoices:mappings.length,missing:0,unusedVoice,durationDifferences,legacyTextOnlyPaths:legacy.length,unreferencedAudio},null,2));
