import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseAst} from 'rollup/parseAst';
import * as THREE from 'three';
import {hasDirectCreatureSight} from '../src/systems/labCreatureSight.js';
import {releaseDoorProgress,releaseHingeDepth} from '../src/cutscenes/releaseDoorMotion.js';
import {RELEASE_TIMING as T,buildStudyReleaseEnding} from '../src/cutscenes/studyReleaseEnding.js';
function declarations(source){const found=new Map();function visit(n){if(!n?.type)return;if(n.type==='FunctionDeclaration')found.set(n.id.name,source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}visit(parseAst(source));return found;}
const levelSource=fs.readFileSync('src/levels/hallwayBasementLevel.js','utf8'),levelFns=declarations(levelSource);
const context=vm.createContext({});
vm.runInContext(`const POWER_STAGE={LIT:'lit',ROUTED:'routed'};let powerStage='dead',monitorSwitchedOn=true;const breakerIsOn={cctv:true};
const screenMaterial={uniforms:{uNoiseStrength:{value:0},uStaticMix:{value:0},uFeed:{value:null}}};
const feeds={textures:{study:'secret-feed'}};const activeFeedId='study',CCTV_FEED_NOISE_STRENGTH=.1,CCTV_FEED_STATIC_MIX=.05;
${['isCircuitLive','isCctvPowered','isMonitorPowered','isMonitorShowing','syncScreenSignal'].map(k=>levelFns.get(k)).join('\n')}
globalThis.power={set(stage,on=true){powerStage=stage;breakerIsOn.cctv=on;syncScreenSignal();},get showing(){return isMonitorShowing();},get staticMix(){return screenMaterial.uniforms.uStaticMix.value;},get feed(){return screenMaterial.uniforms.uFeed.value;}};`,context);
for(const stage of ['dead','blackout','running']){context.power.set(stage);assert(!context.power.showing);assert.equal(context.power.staticMix,1);}
context.power.set('lit');assert(context.power.showing);assert.equal(context.power.staticMix,1);assert.equal(context.power.feed,null);
context.power.set('routed',false);assert(!context.power.showing);assert.equal(context.power.staticMix,1);
context.power.set('routed');assert(context.power.showing);assert.equal(context.power.feed,'secret-feed');assert(context.power.staticMix<1);
context.power.set('lit');assert.equal(context.power.staticMix,1,'old live feed leaked into initial power');

const closes=[];
const doors=vm.createContext({onLabDoorsClosed:p=>closes.push(p)});
vm.runInContext(`const LAB_DOOR_SWING={openAngle:1.35,heldStiffness:30,heldDamping:8,stiffness:10,damping:1.4,heavyStiffness:4,heavyDamping:6,shove:1.2,giveAngle:.95,passableAngle:.9,maxAngle:1.45};
const labDoorPivotZ=0,LAB_DOOR={openHalf:.9},LAB_DOOR_SHUT_BEHIND_Z=1.3,LAB_DOOR_FORCED_RELEASE_Z=2.5;
let labDoorHeld=-1,labDoorPlayerSide=1,labDoorHeavyHintShown=false,labDoorBurst=0,labDoorCreatureClosing=false;
const LAB_DOOR_COLLIDER_SHUT={minZ:-.06,maxZ:.06},labDoorCollider={...LAB_DOOR_COLLIDER_SHUT};
const labDoorHits=new Map(),labLeaves=[1,-1].map(sign=>({node:{rotation:{}},rest:0,sign,angle:0,speed:0}));
${['labDoorLabel','updateLabDoors','burstLabDoors','resetLabDoors'].map(k=>levelFns.get(k)).join('\n')}
globalThis.doors={burstLabDoors,resetLabDoors,updateLabDoors,get held(){return labDoorHeld;},get angles(){return labLeaves.map(l=>l.angle);},get collider(){return labDoorCollider;}};`,doors);
const sim=(seconds,pos)=>{for(let i=0;i<seconds*120;i++)doors.doors.updateLabDoors(1/120,pos);};
doors.doors.burstLabDoors(1.1);sim(.7,{x:2,z:3});assert(doors.doors.angles.every(a=>a<-.9));assert.equal(doors.doors.held,0);assert.equal(doors.doors.collider.minZ,-1000);
sim(3,{x:2,z:3});assert(doors.doors.angles.every(a=>a===0));assert.equal(doors.doors.collider.minZ,-.06);assert.equal(closes.length,1);
sim(2,{x:2,z:3});assert.equal(closes.length,1,'door closure sound repeated');
doors.doors.resetLabDoors();doors.doors.burstLabDoors(1.1);sim(.7,{x:2,z:3});sim(2,{x:0,z:0});
assert.equal(doors.doors.collider.minZ,-1000,'doors closed through player');assert.equal(closes.length,1);
sim(3,{x:2,z:3});assert.equal(closes.length,2);assert(doors.doors.angles.every(a=>a===0));

const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);camera.position.set(0,1.6,0);camera.lookAt(0,1.5,-5);
const room=new THREE.Group(),position=new THREE.Vector3(0,0,-5);
assert(hasDirectCreatureSight(camera,position,room));
camera.lookAt(0,1.5,5);assert(!hasDirectCreatureSight(camera,position,room));camera.lookAt(0,1.5,-5);
const wall=new THREE.Mesh(new THREE.BoxGeometry(8,3,.2),new THREE.MeshBasicMaterial());wall.position.set(0,1.5,-2);room.add(wall);
assert(!hasDirectCreatureSight(camera,position,room));wall.visible=false;assert(hasDirectCreatureSight(camera,position,room));
assert(hasDirectCreatureSight(camera,new THREE.Vector3(4,0,-5),room),'visible peripheral sighting was delayed');

const main=fs.readFileSync('src/main.js','utf8'),mainFns=declarations(main);
for(const speaking of [false,true]){
  const events=[];let seen=false;
  const creature={position:new THREE.Vector3(0,0,-5),yaw:0,setPosition(x,z){this.position.set(x,0,z);},setYaw(y){this.yaw=y;},setSpeed(v){events.push(['speed',v]);}};
  const scene={activeKey:'hallwayBasement'};
  const scope=vm.createContext({creature,sceneManager:scene,camera,player:{isLocked:true},documentUI:{isOpen:false},
    hasDirectCreatureSight:()=>seen,hideCreature(){},hallwayBasement:{group:room,refs:{setCameraFiveFigure(){},revealPool(){events.push(['pool']);},creatureExitRoute:[[0,-30]],labDoorway:[100,100]}},
    script:{cancel(){events.push(['cancel-script']);}},markThoughts:{clear(){events.push(['interrupt',speaking]);}},captions:{cancel(){}},audio:{stopVoice(){events.push(['stop-voice']);},footsteps(){},setBreathing(){}},sfx:key=>events.push([key])});
  vm.runInContext(`const LAB_CREATURE_STARE_MAX=5,LAB_CREATURE_RUN_SPEED=5,LAB_CREATURE_TURN_RATE=9,LAB_CREATURE_DOOR_REACH=1.4,LAB_CREATURE_DOOR_HOLD=1.1;
let labCreatureExit={phase:'stare',t:0,seenAt:null,leg:0,doorsBurst:false,cueFinished:false,growl:{stop(){}}};
${mainFns.get('updateLabCreatureExit')}
globalThis.escape={updateLabCreatureExit,get phase(){return labCreatureExit.phase;}};`,scope);
  scope.escape.updateLabCreatureExit(.016);assert.equal(scope.escape.phase,'stare');assert(!events.some(e=>e[0]==='gasp'));
  seen=true;scope.escape.updateLabCreatureExit(.016);assert.equal(scope.escape.phase,'run','voice cue delayed first sighting');
  assert.equal(events.filter(e=>e[0]==='gasp').length,1);assert(creature.position.z<-5);
  assert(events.findIndex(e=>e[0]==='stop-voice')<events.findIndex(e=>e[0]==='gasp'));
  scope.escape.updateLabCreatureExit(.016);assert.equal(events.filter(e=>e[0]==='gasp').length,1);
}

const hinge=releaseHingeDepth(.09,.05);assert(hinge-.008>.06,'hinge barrel intersects outer lining');
const pin=new THREE.Object3D(),leaf=new THREE.Mesh(new THREE.BoxGeometry(1.78,2.42,.09));pin.position.set(-.89,0,hinge);leaf.position.set(.89,1.215,-hinge);pin.add(leaf);
pin.updateMatrixWorld(true);const closed=new THREE.Box3().setFromObject(leaf);assert(Math.abs(closed.min.z+.045)<1e-6&&Math.abs(closed.max.z-.045)<1e-6,'closed leaf moved');
for(let i=0;i<=100;i++){
  pin.rotation.y=(-Math.PI/2.1)*i/100;pin.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(leaf);assert(bounds.min.x>-.895,'swing clips hinge-side lining');
}
assert.equal(releaseDoorProgress(T.door,T),0);assert.equal(releaseDoorProgress(T.walk-.45,T),1);
let last=0;for(let t=0;t<T.walk;t+=1/144){const p=releaseDoorProgress(t,T);assert(p>=last&&p<=1);last=p;}
const progress=[],film=buildStudyReleaseEnding({camera,player:{},refs:{setReleaseDoorProgress:p=>progress.push(p)},visor:{},fade:{}});
for(const t of [T.door,T.door+.9,T.walk])film.onFrame({},t);
assert.equal(progress[0],0);assert(Math.abs(progress[1]-.5)<1e-8);assert.equal(progress[2],1);
console.log('PASS: initial CRT static with no feed/story leakage; creature doors close once with collider/sound and player safety; real/peripheral sighting and occlusion; immediate escape and gasp with/without ongoing speech; outward hinge clearance, preserved closed pose and camera-clock door motion.');
