const LEVELS=['bedroom','hallwayBasement','study'];
const DIFFICULTIES=['easy','medium','hard'];
/** Real elapsed active time; independent of slow motion and the per-room difficulty clock. */
export function createActiveRun(){
  let running=false,previous=null,wasActive=false,milliseconds=0,difficulty='easy',id=0,result=null,eligible=true;
  const visited=new Set();
  return {
    start(value){id++;running=true;previous=null;wasActive=false;milliseconds=0;result=null;eligible=DIFFICULTIES.includes(value);difficulty=value;visited.clear();},
    sample(now,active,level){
      if(!running)return;
      if(previous!==null&&wasActive&&active)milliseconds+=Math.max(0,now-previous);
      previous=now;wasActive=active;
      if(active&&LEVELS.includes(level))visited.add(level);
    },
    suspend(){previous=null;wasActive=false;},
    invalidate(){eligible=false;},
    finish(ending,now){
      if(!running)return null;
      if(wasActive&&previous!==null&&Number.isFinite(now))milliseconds+=Math.max(0,now-previous);
      running=false;
      if(!eligible||!['released','contained'].includes(ending)||!LEVELS.every(l=>visited.has(l))||milliseconds<1)return null;
      result=Object.freeze({id,ending,difficulty,time_ms:Math.round(milliseconds)});return result;
    },
    cancel(){running=false;result=null;this.suspend();},
    get result(){return result;}
  };
}
