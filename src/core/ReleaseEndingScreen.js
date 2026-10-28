/** Temporary release card; existing menu-option styling and explicit navigation only. */
export function createReleaseEndingScreen({root,onMenu,onCredits,onReady=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  const actions=root.querySelector('[data-release-actions]');
  const menu=root.querySelector('[data-release-menu]'),credits=root.querySelector('[data-release-credits]');
  let timer=null;
  function hide(){if(timer!==null)clearTimer(timer);timer=null;root.classList.add('hidden');}
  menu.addEventListener('click',()=>{hide();onMenu();});
  credits.addEventListener('click',()=>{hide();onCredits();});
  return {hide,show({ready=false}={}){
    hide();root.classList.remove('hidden');actions.hidden=!ready;
    if(ready){menu.focus();onReady();}
    else timer=setTimer(()=>{timer=null;actions.hidden=false;menu.focus();onReady();},2000);
  }};
}
