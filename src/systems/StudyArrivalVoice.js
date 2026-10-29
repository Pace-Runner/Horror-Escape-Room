/** Restore the original two recordings after the transition has handed control back. */
export function createStudyArrivalVoice({thoughts,isCurrent,isReady,keys=['backrooms_06','backrooms_07'],priority=55,onEnded}) {
  let pending=false,played=false;
  return {
    arm(){if(!played)pending=true;},
    cancel(){pending=false;},
    reset(){pending=false;played=false;},
    update(){
      if(!pending)return;
      if(!isCurrent()){pending=false;return;}
      if(!isReady())return;
      if(thoughts.playSequence(keys,{priority,when:isCurrent,onEnded})){
        pending=false;played=true;
      }
    }
  };
}
