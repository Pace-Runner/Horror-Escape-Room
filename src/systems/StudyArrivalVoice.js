/** Restore the original two recordings after the transition has handed control back. */
export function createStudyArrivalVoice({thoughts,isCurrent,isReady}) {
  let pending=false,played=false;
  return {
    arm(){if(!played)pending=true;},
    cancel(){pending=false;},
    reset(){pending=false;played=false;},
    update(){
      if(!pending)return;
      if(!isCurrent()){pending=false;return;}
      if(!isReady())return;
      if(thoughts.playSequence(['backrooms_06','backrooms_07'],{priority:55,when:isCurrent})){
        pending=false;played=true;
      }
    }
  };
}
