import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMenuMusic, createHeadphonesScreen} from '../src/core/MenuPresentation.js';

class Events {
  listeners = new Map();
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type) { this.listeners.delete(type); }
  emit(type, extra = {}) {
    const event = {preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
    this.listeners.get(type)?.(event); return event;
  }
}
const events = new Events(), page = new Events(); page.hidden = false;
let time = 0, next = 0, frames = new Map(), plays = 0, pauses = 0, denied = true;
const track = {paused:true,volume:0,currentTime:12,
  play() { plays++; if (denied) return Promise.reject(new Error('autoplay denied')); this.paused=false; return Promise.resolve(); },
  pause() { pauses++; this.paused=true; }
};
const flush = async () => { for(let i=0;i<5;i++) await Promise.resolve(); };
const advance = ms => { time += ms; const pending=[...frames.values()]; frames.clear(); pending.forEach(fn=>fn()); };
const music = createMenuMusic({source:'menu.ogg',makeAudio:()=>track,events,page,now:()=>time,
  frame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>frames.delete(id)});
assert.equal(track.loop,true);
music.setActive(true); await flush(); assert.equal(plays,1);
denied=false; events.emit('pointerdown'); await flush(); advance(1200);
assert.equal(track.paused,false); assert.equal(track.volume,.18);
events.emit('keydown'); music.setActive(true); await flush(); advance(600);
assert.equal(plays,2,'menu navigation must not restart the loop');
music.setVolume(0); advance(100); assert.equal(track.volume,0);
music.setVolume(1); advance(100); assert.equal(track.volume,.36);
page.hidden=true;page.emit('visibilitychange');assert.equal(track.paused,true);
page.hidden=false;page.emit('visibilitychange');await flush();advance(1200);assert.equal(track.paused,false);
music.setActive(false); advance(240);assert.equal(track.paused,true);assert.equal(track.currentTime,0);
const count=plays;events.emit('pointerdown');await flush();assert.equal(plays,count,'gameplay must not start menu music');
music.dispose();assert.equal(events.listeners.size,0);assert.equal(page.listeners.size,0);assert(pauses>0);

const root = new Events(), keyboard = new Events();
let hidden=true,continued=0;
root.classList={add(){hidden=true;},remove(){hidden=false;}};root.focus=()=>{};
const screen=createHeadphonesScreen({root,events:keyboard,onContinue:()=>continued++});
screen.open();assert.equal(hidden,false);
const held=keyboard.emit('keydown',{repeat:true});assert(held.prevented&&held.stopped);assert.equal(continued,0);
const key=keyboard.emit('keydown',{code:'Enter'});assert(key.prevented&&key.stopped);assert.equal(continued,1);assert(hidden);
keyboard.emit('keydown');assert.equal(continued,1);
screen.open();root.emit('click');assert.equal(continued,2);
screen.open();screen.close();keyboard.emit('keydown');assert.equal(continued,2);
console.log('PASS: menu autoplay retry, continuous single loop, volume/mute, tab visibility and gameplay fade/cleanup; headphones click/key/repeat input isolation.');

const source=fs.readFileSync('src/main.js','utf8').replace(/\r\n/g,'\n');
const html=fs.readFileSync('index.html','utf8');
const exitBody=source.match(/function returnToMainMenu\(\) \{([\s\S]*?)\n\}/)[1];
const calls=[],player={movementEnabled:true,lookEnabled:true};
const exit=new Function('resetGame','player','interaction','audio','showMainMenu',`let gameStarted=true;${exitBody};return gameStarted;`);
const running=exit(()=>calls.push('reset'),player,{setEnabled:value=>{assert.equal(value,false);calls.push('disable');}},
  {pause:()=>calls.push('pause')},()=>calls.push('menu'));
assert.equal(running,false);assert.equal(player.movementEnabled,false);assert.equal(player.lookEnabled,false);
assert.deepEqual(calls,['reset','disable','pause','menu']);
const difficulty=source.slice(source.indexOf("menuDifficulty.querySelectorAll('[data-difficulty]')"),source.indexOf("menuStartButton.addEventListener"));
assert(difficulty.includes('headphonesScreen.open()'));assert(!difficulty.includes('startButton.click()'));
const continueBody=source.slice(source.indexOf('const headphonesScreen ='),source.indexOf('const controlsScreen ='));
assert(continueBody.includes('startButton.click()'));
assert(!html.includes('id="start-controls"'));
for(const id of ['menu-controls','pause-controls','pause-main-menu','controls-screen','controls-close'])assert(html.includes(`id="${id}"`));
assert(source.includes('if (!gameStarted || !sceneManager.activeKey || openingSequenceActive)'));
console.log('PASS: difficulty precedes headphones; continue starts game; pause exit uses complete reset and freezes old run; dedicated controls in both menus.');
