const LEVELS=['bedroom','hallwayBasement','study'];
const DIFFICULTIES=['easy','medium','hard'];
/** Real elapsed active time; independent of slow motion and the per-room difficulty clock. */
export function createActiveRun(){
  let running=false,previous=null,wasActive=false,milliseconds=0,difficulty='easy',id=0,result=null,completion=null,eligible=true;
  const visited=new Set();
  return {
    start(value){id++;running=true;previous=null;wasActive=false;milliseconds=0;result=null;completion=null;eligible=DIFFICULTIES.includes(value);difficulty=value;visited.clear();},
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
      if(!['released','contained'].includes(ending))return null;
      const qualified=eligible&&LEVELS.every(l=>visited.has(l))&&milliseconds>=1;
      completion=Object.freeze({id,ending,difficulty,time_ms:Math.round(milliseconds),eligible:qualified});
      if(!qualified)return null;
      result=Object.freeze({id,ending,difficulty,time_ms:Math.round(milliseconds)});return result;
    },
    cancel(){running=false;result=null;completion=null;this.suspend();},
    get result(){return result;},
    get completion(){return completion;}
  };
}
