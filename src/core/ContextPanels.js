export const ENDING_CHOICE_OBJECTIVE='MAKE YOUR CHOICE — RELEASE OR RESEAL CONTAINMENT';
export const CHOICE_CONSEQUENCES={
  RELEASE:'Open the front door and release containment.',
  RESEALED:'Seal the house and remain inside.'
};
const PURPOSES={door:'Exit door bolts',cctv:'Camera network',lighting:'Room lights',locks:'Auxiliary locks',vent:'Ventilation'};

/** Read-only context, shown while looking at an existing puzzle control. */
export function createContextPanels(root){
  let last='';
  return {
    update({breaker=null,choice=null}={}){
      const key=JSON.stringify({breaker,choice});
      if(key===last)return;last=key;
      root.replaceChildren();root.hidden=!breaker&&!choice;
      const add=(tag,text,cls='')=>{const el=document.createElement(tag);el.textContent=text;el.className=cls;root.appendChild(el);return el;};
      if(breaker){
        add('h3','Breaker panel');
        add('p',`Selected load ${breaker.load}A / ${breaker.capacity}A capacity`,'context-load');
        for(const circuit of breaker.circuits)add('p',`${circuit.label} · ${circuit.loadInAmps}A · ${circuit.on?'ON':'OFF'} — ${PURPOSES[circuit.id]??circuit.label}`,'context-circuit');
        add('p',breaker.tripped?'OVERLOAD — panel tripped. Reduce the selected load before retrying.':breaker.load>breaker.capacity?
          'OVER CAPACITY — reduce the selected load before throwing the main lever.':'Choose circuits within capacity, then throw the main lever.',
          breaker.tripped||breaker.load>breaker.capacity?'context-warning':'context-note');
      }else if(choice){
        add('h3',choice==='RELEASE'?'Release containment':'Reseal containment');
        add('p',CHOICE_CONSEQUENCES[choice]);
        add('p','These are two different endings. Choosing one locks out the other.','context-note');
        add('p','Use the access keycard, then turn the handle.');
        add('p','This decision cannot be undone.','context-warning');
      }
    }
  };
}
