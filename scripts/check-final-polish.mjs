import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {parseAst} from 'rollup/parseAst';
import {createStudyCupboardProtection} from '../src/systems/StudyCupboardProtection.js';
import {createSelectionFeedback} from '../src/core/SelectionFeedback.js';
import {Interaction} from '../src/core/Interaction.js';
import {PointerLockPlayer} from '../src/core/PointerLockPlayer.js';
import {MARK_THOUGHTS} from '../src/story/markThoughts.js';

let warnings=0,cancelled=0;
const protection=createStudyCupboardProtection({playWarning:()=>{warnings++;return true;},cancelWarning:()=>cancelled++});
for(const kind of ['wardrobe','cupboard']){
  protection.reset();protection.enter({kind});
  protection.update(11.99,{encounter:true});assert(protection.protected);const before=warnings;
  protection.update(.01,{encounter:true});assert.equal(warnings,before+1);
  protection.update(100,{active:false,encounter:true});assert.equal(protection.elapsed,12);
  protection.update(2.99,{encounter:true});assert(protection.protected);
  protection.update(.01,{encounter:true});assert(!protection.protected);assert.equal(warnings,before+1);
  protection.leave();assert.equal(protection.elapsed,0);assert(!protection.protected);
  protection.enter({kind});protection.update(12,{encounter:true});assert.equal(warnings,before+1,'rapid re-entry repeats warning');
  protection.leave();protection.update(45);protection.enter({kind});protection.update(12,{encounter:true});assert.equal(warnings,before+2);
}
protection.enter({kind:'curtain'});protection.update(12,{encounter:true});assert(!protection.protected,'curtain mechanics changed');
assert(cancelled>0);assert.equal(MARK_THOUGHTS.l3_stealth_08[1],"I can't stay in here much longer...");
assert(fs.statSync('src/assets/audio/Dont Let it out Mark voice/'+MARK_THOUGHTS.l3_stealth_08[0]).size>1000);

const selection=createSelectionFeedback();selection.choose(0,true);selection.choose(1,true);assert(selection.has(0)&&selection.has(1));
selection.choose(8,false);assert(selection.has(8),'wrong option never highlights');selection.update(.2);
assert(!selection.has(0)&&!selection.has(1)&&!selection.has(8));selection.choose(0,true);selection.choose(1,true);selection.choose(2,true);
selection.update(30);assert([0,1,2].every(i=>selection.has(i)),'success highlights expire');selection.clear();assert(!selection.has(0));

globalThis.window=new EventTarget();globalThis.document=new EventTarget();
const camera=new THREE.PerspectiveCamera(70,1,.05,100),prompt={style:{},textContent:''};
const interaction=new Interaction(camera,prompt,{}),parent=new THREE.Group();
const target=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());parent.add(target);
let opened=false;target.userData.interact={get label(){return opened?'Close box':'Open box';},onInteract(){opened=!opened;}};
interaction.setTargets([target]);interaction.current=target;interaction.interact();assert.equal(prompt.textContent,'[E] Close box');
interaction.interact();assert.equal(prompt.textContent,'[E] Open box','reusable close/open was removed');
target.userData.interact.onInteract=()=>interaction.targets.splice(0,1);interaction.interact();assert.equal(interaction.current,null);assert.equal(prompt.style.display,'none');
interaction.targets=[target];target.visible=false;assert(!interaction.isAvailable(target));target.userData.interact.allowHidden=true;assert(interaction.isAvailable(target));
parent.visible=false;assert(!interaction.isAvailable(target),'hidden parent still offers interaction');parent.visible=true;target.visible=true;
target.userData.interact.enabled=false;assert(!interaction.isAvailable(target));target.userData.interact.enabled=()=>true;
target.userData.interact.onInteract=async()=>{await Promise.resolve();target.userData.interact.enabled=false;};
interaction.current=target;interaction.interact();await Promise.resolve();await Promise.resolve();assert.equal(interaction.current,null,'async completion leaves stale prompt');

const main=fs.readFileSync('src/main.js','utf8'),ast=parseAst(main),nodes=[];
function visit(n){if(!n?.type)return;nodes.push(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}
visit(ast);const body=n=>main.slice(n.body.start+1,n.body.end-1);
const tag=nodes.find(n=>n.type==='Property'&&n.key?.name==='onReadSafeTag').value;
const close=nodes.find(n=>n.type==='Property'&&n.key?.name==='onClose'&&main.slice(n.start,n.end).includes('inspectionView?.')).value;
const player=new PointerLockPlayer(camera,{ownerDocument:document});player.controls.isLocked=true;player.spawn(3,4,.4,-.3);
player.crouch=.7;player.update(.016);const position=camera.position.clone(),quaternion=camera.quaternion.clone();
player.unlock=()=>{player.controls.isLocked=false;};player.lock=()=>{player.controls.isLocked=true;};
const sceneManager={active:{},activeKey:'bedroom'},documentUI={open(){assert(player.inspectionHeld);}};
const cameraFlow=new Function('player','sceneManager','documentUI','thought',
  `let inspectionView=null,inspectionViewLevel=null;return {open:()=>{${body(tag)}},close:()=>{${body(close)}}};`)(player,sceneManager,documentUI,()=>{});
cameraFlow.open();for(let i=0;i<400;i++)player.update(.016);
assert(camera.position.equals(position)&&camera.quaternion.equals(quaternion),'lockbox document snaps the camera');
cameraFlow.close();assert(!player.inspectionHeld&&player.controls.isLocked);assert(camera.quaternion.equals(quaternion));
cameraFlow.open();sceneManager.active={};camera.position.set(9,9,9);cameraFlow.close();assert.equal(camera.position.x,9,'level change restores old lockbox view');player.controls.dispose();

const openPause=nodes.find(n=>n.type==='ExpressionStatement'&&main.slice(n.start,n.end).startsWith("document.getElementById('pause-achievements').addEventListener")).expression.arguments[1];
const closeProgress=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='closeProgressScreen');
const calls=[],controls=new Map();const control=id=>{if(!controls.has(id))controls.set(id,{textContent:'',focus:()=>calls.push('focus:'+id)});return controls.get(id);};
const progressFlow=new Function('chapterSelect','showPauseScreen','showMainMenu','document','legacyStartControls',
  `let progressReturnState='main',menuOverlayState='game';${main.slice(closeProgress.start,closeProgress.end)};return {open:()=>{${body(openPause)}},close:closeProgressScreen};`)(
  {open:view=>calls.push(view),close:()=>calls.push('close')},()=>calls.push('pause'),()=>calls.push('main'),{getElementById:control},{classList:{add(){}}});
progressFlow.open();assert.equal(control('chapter-close').textContent,'Back to Pause Menu');progressFlow.close();
assert.deepEqual(calls,['achievements','close','pause','focus:pause-achievements']);
assert(!body(closeProgress).includes('resetGame')&&!body(openPause).includes('resetGame'));
for(const id of ['settings-volume','settings-sensitivity','settings-captions','settings-brightness','settings-graphics','settings-fps'])
  assert(fs.readFileSync('index.html','utf8').includes('id="'+id+'"'),'setting removed: '+id);
console.log('PASS: exact 12/15s protection and 45s warning cooldown; pause/re-entry/curtain behavior; new recording; selection flash/reset/completion; immediate stale prompt removal and reusable drawers; actual lockbox camera hold/cleanup; pause Achievements round trip; all settings retained.');
