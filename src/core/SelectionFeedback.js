/** Presentation only: puzzle callbacks retain their existing answers and progression. */
export function createSelectionFeedback({wrongFlashSeconds=.18}={}) {
  const selected=new Set();let wrong=null,remaining=0;
  return {
    choose(index,correct){
      if(wrong!==null){selected.clear();wrong=null;remaining=0;}
      if(correct)selected.add(index);
      else {wrong=index;remaining=wrongFlashSeconds;}
    },
    update(dt){if(wrong===null)return false;remaining-=dt;if(remaining>0)return false;
      selected.clear();wrong=null;return true;},
    clear(){selected.clear();wrong=null;remaining=0;},
    has(index){return selected.has(index)||wrong===index;}
  };
}
