const clamp=x=>Math.max(0,Math.min(1,x));

/** A frame/audio-clock presentation: no independent CSS animation or timers to drift on pause. */
export function sampleEndingCinema(t,T){
  if(t<T.title||t>=T.end)return {phase:'hidden',opacity:0,progress:0};
  if(t<T.credits){
    const age=t-T.title;
    return {phase:'title',opacity:Math.min(clamp(age/.8),clamp((T.credits-.15-t)/.65)),progress:0};
  }
  return {phase:'credits',opacity:Math.min(clamp((t-T.credits)/.7),clamp((T.end-t)/.4)),
    progress:clamp((t-T.credits)/(T.creditsEnd-T.credits))};
}

export function createEndingCinema({root,teamSource,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false}){
  const title=root.querySelector('[data-cinema-title]'),crawl=root.querySelector('[data-cinema-crawl]');
  const thanks=root.querySelector('[data-cinema-thanks]');
  const team=root.querySelector('[data-cinema-team]');
  // The canonical team list stays in the full credits; never maintain a second copy of the names.
  if(teamSource){
    const credits=teamSource.cloneNode(true);
    for(const note of credits.querySelectorAll('.credits-note'))
      if(/world.*story|story.*world/i.test(note.textContent))note.remove();
    team.replaceChildren(credits);
  }
  let phase='hidden';
  function hide(){root.classList.add('hidden');root.removeAttribute('data-phase');title.style.opacity='0';crawl.style.transform='';thanks.style.opacity='0';thanks.style.transform='';phase='hidden';}
  return {hide,update(t,T){
    const state=sampleEndingCinema(t,T);
    if(state.phase==='hidden'){if(phase!=='hidden')hide();return;}
    if(phase!==state.phase){root.classList.remove('hidden');root.dataset.phase=state.phase;phase=state.phase;}
    root.style.opacity=String(state.phase==='credits'?state.opacity:1);
    title.style.opacity=String(state.phase==='title'?state.opacity:0);
    const reduced=reducedMotion();root.classList.toggle('ending-cinema--reduced',reduced);
    const arrival=clamp((t-T.thanks)/(T.thanksHold-T.thanks)),settle=arrival*arrival*(3-2*arrival);
    thanks.style.opacity=String(clamp((t-T.thanks)/.7));
    thanks.style.transform=`translateY(${reduced?0:(1-settle)*root.clientHeight*.38}px)`;
    if(state.phase==='credits'){
      const start=root.clientHeight*.86,end=-crawl.offsetHeight;
      crawl.style.transform=`translateY(${reduced?0:start+(end-start)*state.progress}px)`;
      // Reduced motion uses a static list; clear it before the closing thank-you card.
      crawl.style.opacity=String(reduced?1-clamp((t-T.thanks)/.7):1);
    }
  }};
}
