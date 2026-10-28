import assert from 'node:assert/strict';
import {createEndingCinema,sampleEndingCinema} from '../src/core/EndingCinema.js';
import {createEndingTiming} from '../src/cutscenes/studyEndingDialogue.js';

for(const branch of ['release','reseal'])for(const duration of [16.718354,20.062021,30]){
  const T=createEndingTiming(branch,4.545306,duration);
  assert(T.black<T.title&&T.title<T.credits&&T.credits<T.news);
  assert(T.newsEnd+.75<T.end&&T.creditsEnd<T.end);
  assert.equal(sampleEndingCinema(T.black,T).phase,'hidden');
  assert.equal(sampleEndingCinema(T.title+1,T).phase,'title');
  assert.equal(sampleEndingCinema(T.news,T).phase,'credits');
  const before=sampleEndingCinema(T.newsEnd-.01,T),after=sampleEndingCinema(T.newsEnd+.01,T);
  assert(after.progress>=before.progress&&after.progress-before.progress<.002,'report end jumps the crawl');
  assert.equal(sampleEndingCinema(T.end,T).phase,'hidden');
}
const T=createEndingTiming('reseal'),values=new Set(['hidden']);
const title={style:{}},crawl={style:{},offsetHeight:1200},thanks={style:{}},team={replaceChildren(...nodes){this.nodes=nodes;}};
const root={style:{},dataset:{},clientHeight:720,classList:{add:s=>values.add(s),remove:s=>values.delete(s),toggle(s,on){if(on)values.add(s);else values.delete(s);}},
  removeAttribute(){delete this.dataset.phase;},querySelector:s=>s.includes('title')?title:s.includes('crawl')?crawl:s.includes('thanks')?thanks:team};
const canonical={cloneNode(deep){assert(deep);return {canonical:true};}};
let reduced=false;const cinema=createEndingCinema({root,teamSource:canonical,reducedMotion:()=>reduced});
assert(team.nodes[0].canonical);
cinema.update(T.title+1,T);assert(!values.has('hidden'));assert.equal(title.style.opacity,'1');
cinema.update(T.credits+1,T);const early=parseFloat(crawl.style.transform.slice(11));
cinema.update(T.credits+10,T);const later=parseFloat(crawl.style.transform.slice(11));assert(later<early,'credits do not scroll up');
cinema.update(T.thanks+.3,T);const crawlAtArrival=crawl.style.transform;
cinema.update(T.thanks+.8,T);assert.notEqual(crawl.style.transform,crawlAtArrival,'remaining credits must keep moving during arrival');
cinema.update(T.thanksHold,T);assert.equal(thanks.style.transform,'translateY(0px)');assert.equal(thanks.style.opacity,'1');
cinema.update(T.thanksHold+1,T);assert.equal(thanks.style.transform,'translateY(0px)','thank-you must stay centred');
cinema.update(T.creditsEnd+2,T);assert.equal(sampleEndingCinema(T.creditsEnd+2,T).phase,'credits');
cinema.hide();assert(values.has('hidden'));assert.equal(crawl.style.transform,'');assert.equal(root.dataset.phase,undefined);assert.equal(thanks.style.opacity,'0');
cinema.update(T.title+1,T);assert.equal(root.style.opacity,'1','restart inherits final fade');
reduced=true;cinema.update(T.credits+1,T);assert.equal(crawl.style.transform,'translateY(0px)');assert(values.has('ending-cinema--reduced'));
cinema.update(T.end,T);assert(values.has('hidden'));
console.log('PASS: both branches show title before flat rolling credits; report plays inside crawl; report end cannot jump/shorten crawl; canonical team reuse; hide/restart cleanup; reduced motion.');
