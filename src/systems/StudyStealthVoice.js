import {STUDY_STEALTH_LINES} from '../story/studyStealthVoice.js';
import {VOICE_PRIORITY} from '../core/VoicePriority.js';
const key=n=>'l3_stealth_'+n;
const keys=Object.keys(STUDY_STEALTH_LINES);

/** Presentation-only approach detection using the same hide spots and cover as the seeker. */
export function nearStudyHidingSpot({x,z,groundY=0},{hideSpots=[],cover=[]},radius=1.25){
  return hideSpots.some(s=>Math.abs(s.floorY-groundY)<.6&&s.checkPoint&&Math.hypot(x-s.checkPoint[0],z-s.checkPoint[1])<=radius)
    ||cover.some(s=>Math.abs(s.floorY-groundY)<.6&&Math.hypot(x-Math.max(s.minX,Math.min(s.maxX,x)),z-Math.max(s.minZ,Math.min(s.maxZ,z)))<=radius);
}

/** Six bounded encounter cues on the existing Mark voice/caption owner, never a second player. */
export function createStudyStealthVoice({thoughts,audio,captions,isSceneCurrent,isEncounterCurrent,canSpeak=()=>true,isNearHideSpot=()=>false}){
  let state='idle',generation=0,current=null,near=false,introSettled=false;
  const requested=new Set(),finished=new Set(),pending=new Set();
  function stopOwned(){for(const k of keys)thoughts.cancel(k);current=null;}
  function cancel(){generation++;pending.clear();stopOwned();state='idle';}
  function cancelPending(){generation++;pending.clear();stopOwned();introSettled=true;}
  function request(n){const k=key(n);if(requested.has(k))return false;requested.add(k);pending.add(k);pump();return true;}
  function pump(){
    if(state==='idle'||state==='caught'||!isSceneCurrent()||!canSpeak()||current)return;
    if(audio.voiceSource||audio.voiceRequest||thoughts.currentKey||captions?.isVoiceSequence)return;
    const order=['01','02','05','03','04','07'];
    const n=order.find(n=>pending.has(key(n))&&(n==='01'||n==='07'||(n==='02'?finished.has(key('01')):n==='05'?finished.has(key('02')):introSettled)));
    if(!n)return;
    const k=key(n),token=generation;current=k;
    const end=()=>{if(token!==generation||current!==k)return;current=null;pending.delete(k);finished.add(k);if(n==='02')introSettled=true;pump();};
    const interrupted=()=>{
      if(token!==generation||current!==k)return;current=null;pending.delete(k);
      // A higher-priority scene can cancel an introduction, but never resurrect its tail.
      if(n==='01'||n==='02'){pending.clear();introSettled=true;}
    };
    const started=thoughts.play(k,{priority:VOICE_PRIORITY.story,replayable:true,
      when:()=>token===generation&&isSceneCurrent()&&(state==='restored'||isEncounterCurrent()),
      onEnded:end,onFailed:interrupted,onInterrupted:interrupted});
    if(!started&&current===k)current=null;
  }
  return {
    begin(){
      if(state!=='idle'||!isEncounterCurrent()||!isSceneCurrent())return false;
      generation++;requested.clear();finished.clear();pending.clear();state='active';near=isNearHideSpot();introSettled=false;
      request('01');return true;
    },
    creatureEntered(){if(state==='active')request('02');},
    breakerNeeded(){if(state==='active')request('05');},
    hideApproached(){if(state==='active')request('03');},
    throwablePicked(id){if(state==='active'&&['studyBook','studyGlass'].includes(id))request('04');},
    caught(){if(state!=='active')return;generation++;pending.clear();stopOwned();state='caught';},
    resume(){if(state==='caught'&&isEncounterCurrent()){state='active';near=isNearHideSpot();introSettled=true;}},
    restored(){
      if(!['active','caught'].includes(state)||!isSceneCurrent())return false;
      generation++;pending.clear();stopOwned();state='restored';request('07');return true;
    },
    update(){
      if(state==='idle')return;
      if(!isSceneCurrent()||(state==='active'&&!isEncounterCurrent())){cancel();return;}
      if(state==='active'&&canSpeak()){
        const next=isNearHideSpot();if(next&&!near)this.hideApproached();near=next;
      }
      pump();
    },
    cancel,
    cancelPending,
    get state(){return state;},
    get pendingCount(){return pending.size;}
  };
}
