import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CaptionSequencer} from '../src/core/CaptionSequencer.js';
import {Interaction} from '../src/core/Interaction.js';
import {isEssentialCaption} from '../src/core/CaptionPolicy.js';

function surface(){
  const classes=new Set();
  const el={textContent:'',style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),
    contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}}};
  const captions=new CaptionSequencer(el);captions.isVoiced=line=>!!line?.recorded;
  return {el,captions,shown:()=>classes.has('visible')};
}
// Exercise the real dialogue loader against every level's actual text.
const modules={};
for(const name of fs.readdirSync('src/dialogue').filter(n=>n.endsWith('.js')&&n!=='index.js'))
  modules['./'+name]=await import(pathToFileURL(path.resolve('src/dialogue',name)));
globalThis.__captionPolicyModules=modules;
const temporary=path.resolve(`.caption-policy-check-${process.pid}.mjs`);
let loader=fs.readFileSync('src/dialogue/index.js','utf8');
loader=loader.replace("'../core/CaptionPolicy.js'",JSON.stringify(pathToFileURL(path.resolve('src/core/CaptionPolicy.js')).href))
  .replace("import.meta.glob(['./*.js', '!./index.js'], { eager: true })",'globalThis.__captionPolicyModules')
  .replaceAll('import.meta.env.DEV','true');
try{
  fs.writeFileSync(temporary,loader);
  const {line}=await import(pathToFileURL(temporary));
  const keys=Object.values(modules).flatMap(mod=>Object.keys(mod).filter(k=>k.startsWith('dialog_')));
  let inspected=0;
  for(const enabled of [false,true]){
    const {el,captions,shown}=surface();captions.setEnabled(enabled);
    for(const key of keys)for(const row of line(key)){
      captions.cancel();
      Interaction.prototype.showCaption.call({captions},row);
      assert.equal(shown(),enabled||isEssentialCaption(row,()=>false),`description visibility ${enabled}: ${key}`);
      if(shown())assert.equal(el.textContent,row.text);
      assert(captions._line.interaction);
      assert.equal(!!captions._line.descriptive,!!row.descriptive);
      inspected++;
    }
    for(const speaker of ['MARK','ANNABELLE','SCIENTIST','GIRL','NEWS','NARRATION']){
      captions.cancel();captions.say({text:'Spoken line',speaker,recorded:true,manualEnd:true,descriptive:true});
      assert(shown(),speaker+' subtitle hidden');
      captions.say({text:'Inspect a photograph.',interaction:true});
      assert(el.textContent.includes('Spoken line')&&el.textContent.includes('Inspect a photograph.'));
      captions.setEnabled(!enabled);assert(shown());
      assert(el.textContent.includes('Spoken line')&&el.textContent.includes('Inspect a photograph.'));
    }
    captions.cancel();captions.setEnabled(enabled);
    captions.say('Unclassified object text');assert(shown(),'default text incorrectly optional');
    captions.cancel();captions.say(line('dialog_hallway_enter'));
    assert.equal(shown(),enabled,'automatic environment classification');
    const t=captions._t;captions.setEnabled(!enabled);assert.equal(shown(),!enabled);assert.equal(captions._t,t);
    captions.cancel();
    const playing=captions.play([{text:'Scene observation',descriptive:true,duration:2}]);
    Interaction.prototype.showCaption.call({captions},['First object line.','Second object line.']);
    assert(shown());assert(el.textContent.includes('First object line.')&&el.textContent.includes('Second object line.'));
    captions.cancel();await playing;
    captions.say({text:'A note inspected while audio decodes.',interaction:true});
    captions.say({text:'Recording starts.',recorded:true,markThought:true,manualEnd:true});
    assert(el.textContent.includes('Recording starts.')&&el.textContent.includes('A note inspected while audio decodes.'));
    captions.cancelMarkThought();assert(shown());assert.equal(el.textContent,'A note inspected while audio decodes.');
    captions.setPaused(true);const remaining=captions._feedback.remaining;captions.update(30);assert.equal(captions._feedback.remaining,remaining);
    captions.setPaused(false);captions.update(30);assert(!shown());
  }
  // The toggle affects rendering only; scene completion time is identical.
  const clocks=[];
  for(const enabled of [false,true]){
    const {captions}=surface();captions.setEnabled(enabled);let ended=false;
    const done=captions.play([{text:'Optional one',descriptive:true,duration:1.2},{text:'Optional two',descriptive:true,duration:1.7}]).then(()=>ended=true);
    let time=0;while(!ended&&time<10){captions.update(.05);time+=.05;await Promise.resolve();}
    await done;clocks.push(time);
  }
  assert.equal(clocks[0],clocks[1],'description toggle changed story timing');
  assert(isEssentialCaption({text:'Plain inspect text'},()=>false));
  assert(!isEssentialCaption({text:'Optional flavour',descriptive:true},()=>false));
  const css=fs.readFileSync('src/style.css','utf8'),html=fs.readFileSync('index.html','utf8');
  assert(!css.includes('.game-feedback'),'small serif feedback style remains');
  assert(!fs.readFileSync('src/core/CaptionSequencer.js','utf8').includes('interaction-feedback'));
  assert(!/body:has\(#tape-subtitle[^}]*#caption-box\s*\{[^}]*(?:opacity:\s*0|visibility:\s*hidden)/.test(css),'tape hides object captions');
  assert(html.includes('>Descriptive Captions</label>'));
  console.log(`PASS: ${inspected} actual dialogue-row inspections across every level/settings combination; always-visible speech and functional object text; optional inspection descriptions obey toggle; unified caption surface; delayed audio; independent pause/expiry; unchanged sequence clocks; tape no longer hides interactions.`);
}finally{fs.rmSync(temporary,{force:true});delete globalThis.__captionPolicyModules;}
