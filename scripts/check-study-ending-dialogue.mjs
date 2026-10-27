import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ENDING_DIALOGUE,createEndingTiming} from '../src/cutscenes/studyEndingDialogue.js';
import {createStudyEndingAudio} from '../src/cutscenes/studyEndingAudio.js';
import {buildStudyReleaseEnding} from '../src/cutscenes/studyReleaseEnding.js';
import {buildStudyResealEnding} from '../src/cutscenes/studyResealEnding.js';
import * as THREE from 'three';
for(const [branch,build,duration] of [['release',buildStudyReleaseEnding,5.2],['reseal',buildStudyResealEnding,4.4]]){
  const spec=ENDING_DIALOGUE[branch];
  assert(fs.existsSync('src/assets/audio/Dont Let it out Mark voice/'+spec.voice.slice(5)),'missing exact MP3');
  for(const resetDuringVoice of [false,true]){
    let now=0,current=null,plays=0,interruptions=0,cancels=0;const ducks=[],captionLines=[],captionVisibility=[];let captionClears=0;
    const audio={ctx:{},cue:()=>null,voiceSource:{thought:true},duck:(groups,db,opts)=>ducks.push({groups,db,opts,t:now}),
      preloadVoice:async key=>{assert.equal(key,spec.voice);return {duration};},
      stopVoice(){if(this.voiceSource)interruptions++;this.voiceSource=null;current=null;},
      playVoice(key,opts){assert.equal(key,spec.voice);assert.equal(this.voiceSource,null,'voice overlap');plays++;
        current={end:now+duration,opts};this.voiceSource=current;opts.onStarted({duration});return true;}
    };
    const owner=createStudyEndingAudio(audio,{branch,timing:createEndingTiming(branch),cancelThoughts:()=>cancels++,captions:{say:line=>captionLines.push(line),cancel:()=>captionClears++},onDialogueActive:on=>captionVisibility.push(on)});
    const T=await owner.prepare();assert.equal(T.voiceDuration,duration,'did not use actual decoded duration');
    assert.equal(T.voice,T.look+T.lookDuration+.4);assert.equal(T.afterVoice,.45);
    const camera=new THREE.PerspectiveCamera(70,16/9,.05,100);camera.position.set(branch==='release'?1.55:-1.55,1.6,5.5);camera.rotation.y=Math.PI;
    const annabelle=new THREE.Group();annabelle.position.set(-6.62,0,-6.075);
    const scene=build({camera,player:{},refs:{annabelle},visor:{},fade:{},timing:T});
    assert.equal(scene.timing,T);assert.equal(scene.shots[0].seconds,T.end);
    assert(Math.abs((branch==='release'?T.turn:T.human)-T.voiceEnd-.45)<1e-8);
    let finished=false;
    for(now=0;now<T.end;now+=.01){
      if(current&&now>=current.end){const callbacks=current.opts;current=null;audio.voiceSource=null;callbacks.onEnded();finished=true;}
      if(resetDuringVoice&&now>=T.voice+.6){owner.dispose();break;}
      owner.update(now);
    }
    assert.equal(captionLines.length,1);assert.equal(captionLines[0].text,spec.caption);
    assert(captionLines[0].endingManaged&&captionLines[0].manualEnd&&captionLines[0].recorded);
    assert.equal(captionLines[0].speaker,'ANNABELLE');assert.equal(captionLines[0].duration,duration);
    assert.deepEqual(captionVisibility,[true,false]);assert.equal(captionClears,1,'ending caption leaks after finish/reset');
    assert.equal(plays,1,'ending line did not play exactly once');assert(cancels>0&&interruptions>0,'Mark thought was not cancelled');
    assert(ducks.some(d=>d.db===-5&&d.opts.attack===.08),'ambience not ducked beneath Annabelle');
    if(!resetDuringVoice){
      assert(finished);assert(ducks.some(d=>d.db===0&&d.opts.attack===.4),'ambience failed smooth restore');
      const start=scene.sample(branch==='release'?T.turn:T.human),moving=scene.sample((branch==='release'?T.turn:T.human)+.4);
      const angular=new THREE.Quaternion().fromArray(start.quaternion).angleTo(new THREE.Quaternion().fromArray(moving.quaternion));
      assert(angular>.02,'camera remains frozen after line');
    }
    owner.dispose();owner.update(T.end+100);assert.equal(plays,1);assert.equal(audio.voiceSource,null,'ghost ending voice after reset');
  }
}
console.log('PASS: exact MP3 mappings; decoded-duration pacing; 0.4s reaction before speech; 0.45s after speech; real next camera movement; one-shot voice ownership; thought interruption; ambience duck/restore; reset/no restart.');

assert.equal(ENDING_DIALOGUE.release.caption,"Mark... no.\nPlease.\nI can't stop you again.");
assert.equal(ENDING_DIALOGUE.reseal.caption,"It's okay, Mark. It's okay. I'm okay.");
console.log('PASS: exact Annabelle ending captions appear once on voice start and clear on audio end/reset, with manual audio ownership.');
