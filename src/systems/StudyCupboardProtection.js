export const CUPBOARD_SAFE_SECONDS = 15;
export const CUPBOARD_WARNING_SECONDS = 12;
export const CUPBOARD_WARNING_COOLDOWN = 45;

/** Continuous, pause-aware hiding time. Leaving resets protection, not voice cooldown. */
export function createStudyCupboardProtection({playWarning=()=>false,cancelWarning=()=>{}}={}) {
  let spot=null,elapsed=0,clock=0,lastWarning=-Infinity,warned=false;
  const cupboard=()=>spot&&['wardrobe','cupboard'].includes(spot.kind);
  return {
    enter(next){cancelWarning();spot=next;elapsed=0;warned=false;},
    leave(){cancelWarning();spot=null;elapsed=0;warned=false;},
    update(dt,{active=true,encounter=false}={}){
      if(!active||dt<=0)return;
      clock+=dt;
      if(!cupboard())return;
      elapsed+=dt;
      if(encounter&&!warned&&elapsed>=CUPBOARD_WARNING_SECONDS&&elapsed<CUPBOARD_SAFE_SECONDS
        &&clock-lastWarning>=CUPBOARD_WARNING_COOLDOWN&&playWarning()){
        warned=true;lastWarning=clock;
      }
    },
    reset(){this.leave();clock=0;lastWarning=-Infinity;},
    get protected(){return !!cupboard()&&elapsed<CUPBOARD_SAFE_SECONDS;},
    get elapsed(){return elapsed;}
  };
}
