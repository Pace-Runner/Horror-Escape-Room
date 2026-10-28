import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createActiveRun} from '../src/core/ActiveRun.js';
import {createLeaderboardService,validateNickname,formatScoreTime} from '../src/services/leaderboard.js';

const clock=createActiveRun();clock.start('hard');
clock.sample(1000,true,'bedroom');clock.sample(2000,true,'bedroom');
clock.sample(3000,false,'bedroom');clock.sample(60000,false,'bedroom');
clock.sample(61000,true,'hallwayBasement');clock.sample(62000,true,'hallwayBasement');
clock.sample(63000,false,'hallwayBasement');clock.sample(100000,true,'study');clock.sample(101000,true,'study');
assert.deepEqual(clock.finish('contained',101500),{id:1,ending:'contained',difficulty:'hard',time_ms:3500});
assert.equal(clock.finish('released'),null);
clock.start('easy');clock.sample(0,true,'study');clock.sample(10000,true,'study');assert.equal(clock.finish('released'),null,'level skip accepted');
for(const ending of ['released','contained','timeout']){
  clock.start('medium');clock.sample(0,true,'bedroom');clock.sample(1000,true,'hallwayBasement');clock.sample(2000,true,'study');
  if(ending==='timeout')assert.equal(clock.finish(ending),null);else assert(clock.finish(ending));
}
clock.start('easy');clock.sample(0,true,'bedroom');clock.sample(1000,true,'hallwayBasement');clock.suspend();clock.sample(100000,true,'study');clock.sample(101000,true,'study');assert.equal(clock.finish('released').time_ms,2000);
clock.start('easy');clock.sample(0,true,'bedroom');clock.sample(1000,true,'hallwayBasement');clock.sample(2000,true,'study');clock.invalidate();assert.equal(clock.finish('released'),null);
clock.start('easy');clock.cancel();assert.equal(clock.result,null);
assert.equal(validateNickname('  AB_12-3  '),'AB_12-3');assert.equal(validateNickname('a'.repeat(18)).length,18);
for(const name of ['','a',' '.repeat(4),'a'.repeat(19),'Hi<script>','👻👻','AB\nCD'])assert.throws(()=>validateNickname(name));
assert.equal(formatScoreTime(65010),'01:05.01');assert.equal(formatScoreTime(3661000),'1:01:01.00');

function database(rows=[],id='player-a'){
  const db={rows:structuredClone(rows),writes:[],calls:[],signIns:0,sessions:0,session:null,error:null,beforeInsert:null,beforeUpdate:null};
  const client={auth:{
    async getSession(){db.sessions++;return {data:{session:db.session},error:db.error};},
    async signInAnonymously(){db.signIns++;db.session={user:{id}};return {data:{user:{id},session:db.session},error:null};}
  },from(table){
    assert.equal(table,'leaderboard_scores');let action='select',values,filters=[],orders=[],limit=Infinity,single=false,returning=false;
    const q={
      select(columns){db.calls.push(['select',columns]);returning=true;return q;},
      eq(k,v){filters.push(r=>r[k]===v);db.calls.push(['eq',k,v]);return q;},
      gt(k,v){filters.push(r=>r[k]>v);db.calls.push(['gt',k,v]);return q;},
      order(k,options){assert(options.ascending);orders.push(k);return q;},limit(n){limit=n;return q;},
      maybeSingle(){single=true;return q;},
      insert(v){action='insert';values=v;return q;},update(v){action='update';values=v;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(db.error)return {data:null,error:db.error};
        if(action==='insert'){
          db.beforeInsert?.(db);db.beforeInsert=null;
          if(db.rows.some(r=>r.user_id===values.user_id))return {data:null,error:{code:'23505'}};
          assert.equal(values.user_id,id);db.rows.push({...values});db.writes.push(action);return {data:null,error:null};
        }
        if(action==='update'){db.beforeUpdate?.(db);db.beforeUpdate=null;}
        let found=db.rows.filter(r=>filters.every(f=>f(r)));
        if(action==='update'){
          for(const row of found){assert.equal(row.user_id,id);assert(row.time_ms>values.time_ms);Object.assign(row,values);db.writes.push(action);}
        }
        found=found.map(r=>({...r}));found.sort((a,b)=>{for(const k of orders){const d=typeof a[k]==='number'?a[k]-b[k]:String(a[k]).localeCompare(String(b[k]));if(d)return d;}return 0;});
        return {data:single?found[0]??null:found.slice(0,limit),error:null};
      }).then(resolve,reject);}
    };return q;
  }};
  return {db,service:createLeaderboardService(client)};
}
const run=(time,difficulty='easy',ending='released')=>({time_ms:time,difficulty,ending});
{
  const {db,service}=database(Array.from({length:15},(_,i)=>({user_id:'p'+i,player_name:'Name'+i,time_ms:10000+i*1000,difficulty:['hard','easy','medium'][i%3]})));
  const [top]=await Promise.all([service.top(),service.top()]);assert.equal(top.length,10);assert.equal(top[0].time_ms,10000);assert.equal(new Set(top.map(r=>r.difficulty)).size,3);
  assert.equal(db.signIns,1);assert.equal(db.sessions,1);assert(!db.calls.some(c=>c[0]==='eq'&&c[1]==='difficulty'));
}
{
  const {db,service}=database();assert.deepEqual(await service.submit('Player A',run(8000,'hard')),{improved:true});
  assert.deepEqual(await service.submit('Changed',run(9000,'easy')),{improved:false});assert.equal(db.rows[0].player_name,'Player A');
  assert.deepEqual(await service.submit('Player A',run(6000,'medium','contained')),{improved:true});assert.equal(db.rows.length,1);assert.equal(db.rows[0].difficulty,'medium');
  assert.deepEqual(await service.submit('Changed',run(6000)),{improved:false});assert.equal(db.writes.length,2);
}
{
  const {db,service}=database();db.beforeInsert=d=>d.rows.push({user_id:'player-a',player_name:'Other tab',time_ms:4000,difficulty:'hard'});
  assert.deepEqual(await service.submit('Slower tab',run(5000)),{improved:false});assert.equal(db.rows.length,1);assert.equal(db.rows[0].time_ms,4000);
}
{
  const {db,service}=database([{user_id:'player-a',player_name:'Player A',time_ms:9000,difficulty:'hard'}]);
  db.beforeUpdate=d=>d.rows[0].time_ms=3000;assert.deepEqual(await service.submit('Racing update',run(5000)),{improved:false});assert.equal(db.rows[0].time_ms,3000);
}
{
  const {db,service}=database();for(const candidate of [run(5000,'easy','timeout'),run(0),run(7200001),run(5000,'unknown')])await assert.rejects(()=>service.submit('Player',candidate));assert.equal(db.signIns,0);
  db.error={message:'Offline'};await assert.rejects(()=>service.top());assert.equal(db.writes.length,0);
  db.error=null;assert.deepEqual(await service.top(),[]);await assert.rejects(()=>createLeaderboardService(null).top());
}
const main=fs.readFileSync('src/main.js','utf8'),html=fs.readFileSync('index.html','utf8');
assert(/id="menu-settings"[^]*?<\/button>\s*<button[^]*?id="menu-leaderboard"/.test(html));
assert(main.includes("activeRun.finish('released'")&&main.includes("activeRun.finish('contained'"));
assert(main.includes('!cutscene.isRunning&&!player.cinematic&&player.lookEnabled'));
assert(!main.includes('await leaderboardUI')&&!main.includes('await leaderboardService'),'network blocks gameplay');
console.log('PASS: active real time excludes pauses/cinematics; three-level/success-only eligibility; restart/debug exclusion; nickname/schema validation; combined Top 10; anonymous identity reuse; one cross-difficulty PB; concurrent insert/update races; offline recovery; menu placement.');
