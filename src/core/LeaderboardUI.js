import {formatScoreTime,validateNickname} from '../services/leaderboard.js';
const difficulty=value=>({easy:'Easy',medium:'Medium',hard:'Hard'}[value]??value);
export function createLeaderboardUI({root,prompt,service,onClose=()=>{}}){
  const body=root.querySelector('tbody'),status=root.querySelector('[data-board-status]');
  const form=prompt.querySelector('form'),input=prompt.querySelector('input'),message=prompt.querySelector('[data-score-status]'),submit=form.querySelector('[type=submit]');
  let generation=0,offer=null,sending=false,previousFocus=null;const offered=new Set();
  const displayError=()=> 'Could not connect. You can retry or continue playing.';
  function hidePrompt(){generation++;offer=null;sending=false;prompt.classList.add('hidden');submit.disabled=false;previousFocus?.focus?.();}
  root.querySelector('[data-board-close]').addEventListener('click',()=>{root.classList.add('hidden');onClose();});
  root.querySelector('[data-board-retry]').addEventListener('click',()=>void load());
  prompt.querySelector('[data-score-skip]').addEventListener('click',hidePrompt);
  prompt.addEventListener('keydown',event=>{
    if(event.code==='Escape'){event.preventDefault();event.stopPropagation();hidePrompt();}
    if(event.code==='Tab'){
      const controls=[input,submit,prompt.querySelector('[data-score-skip]')].filter(e=>!e.hidden&&!e.disabled);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  async function load(){
    const token=++generation;status.textContent='Loading scores…';body.replaceChildren();
    try{
      const rows=await service.top();if(token!==generation)return;
      rows.forEach((row,index)=>{
        const tr=document.createElement('tr');
        for(const value of [index+1,row.nickname,formatScoreTime(row.time_ms),difficulty(row.difficulty)]){
          const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);
        }body.appendChild(tr);
      });status.textContent=rows.length?'':'No scores yet. Escape the house to set the first time.';
    }catch{if(token===generation)status.textContent=displayError();}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||!offer)return;
    let nickname;try{nickname=validateNickname(input.value);}catch(error){message.textContent=error.message;return;}
    sending=true;submit.disabled=true;message.textContent='Submitting…';const token=generation,run=offer;
    try{
      const result=await service.submit(nickname,run);if(token!==generation)return;
      message.textContent=result.improved?'Personal best saved.':'Your faster personal best is already saved.';
      try{localStorage.setItem('dont-let-it-out-nickname',nickname);}catch{}
      offer=null;submit.hidden=true;prompt.querySelector('[data-score-skip]').textContent='Continue';
    }catch{if(token===generation)message.textContent=displayError();}
    finally{if(token===generation){sending=false;submit.disabled=false;}}
  });
  return {
    open(){root.classList.remove('hidden');root.querySelector('[data-board-close]').focus();void load();},
    close(){generation++;root.classList.add('hidden');},
    offer(run){
      if(!run||offered.has(run.id))return;offered.add(run.id);offer=run;generation++;sending=false;previousFocus=document.activeElement;
      prompt.querySelector('[data-score-time]').textContent=`${formatScoreTime(run.time_ms)} · ${difficulty(run.difficulty)}`;
      message.textContent='Save your fastest escape time.';submit.disabled=false;submit.hidden=false;
      prompt.querySelector('[data-score-skip]').textContent='Skip';
      try{input.value=localStorage.getItem('dont-let-it-out-nickname')??'';}catch{input.value='';}
      prompt.classList.remove('hidden');input.focus();
    },
    reset(){this.close();hidePrompt();},
    get promptOpen(){return !prompt.classList.contains('hidden');}
  };
}
