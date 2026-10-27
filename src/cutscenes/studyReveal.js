import * as THREE from 'three';

export const MIRROR_EYE = [4.8, 1.6, -5.28];
export const RECOIL_EYE = [4.74, 1.6, -5.10];
export const CHAIR_EYE = [-4.8, 1.6, -4.5];
// One authoritative conversation; holds come from decoded buffers in production.
const voice = file => 'mark/LEVEL 3/' + file + '.mp3';
export const REVEAL_VOICE_LINES = Object.freeze([
  ['descent','MARK','The mirror... I need to see for myself.','l3_mark_reveal_01_descent',3.500408,.6,[]],
  ['memory','MARK',"Why can't I remember any of this?",'l3_mark_reveal_02_memory_panic',3.030204,.6,[]],
  ['mirror-no','MARK','No... What did I do?','l3_mark_reveal_03_mirror_reaction',4.780408,.75,[['mirror-no',1.25],['what',2.1]]],
  ['please','ANNABELLE',"Mark... please. It's me.",'l3_annabelle_reveal_01_recognition',3.84,.45,[['please',2.2],['me',1.9]]],
  ['no','MARK','No. I saw you. You were following me.','l3_mark_reveal_04_accusation',4.310204,.4,[['no',1.35],['saw',1.9],['following',2.6]]],
  ['tried','ANNABELLE','I tried to stop you. You told me to. You made me promise.','l3_annabelle_reveal_02_promise',5.746939,.85,[['tried',2.5],['told',2.2],['promise',2.4]]],
  ['remember','MARK',"I don't remember.",'l3_mark_reveal_05_dont_remember',2.716735,.65,[['remember',2.3]]],
  ['know','ANNABELLE',"I know. Your eyes are lying to you. That's why you made the visor.",'l3_annabelle_reveal_03_truth',6.4,2.25,[['know',1.8],['eyes',2.9],['visor',3]]],
  ['override','ANNABELLE',"There's one override left... You decide.",'l3_annabelle_reveal_04_override',3.668458,1.35,[['override',2.7],['decide',1.9]]]
].map(([id,speaker,text,file,hold,gap,reactions])=>Object.freeze({id,speaker,text,voice:voice(file),hold,gap,reactions})));

export function createStudyRevealTiming(voiceDurations = {}) {
  const lines=REVEAL_VOICE_LINES.map(line=>({...line,hold:voiceDurations[line.voice] ?? line.hold}));
  let dialogueTime=.45;
  const dialogue=lines.slice(3).map(line=>{
    const beat={...line,t:dialogueTime};dialogueTime+=line.hold+line.gap;return beat;
  });
  const descentAt=2.5;
  const memoryAt=Math.max(7.5,descentAt+lines[0].hold+lines[0].gap);
  const walkSeconds=Math.max(13,memoryAt+lines[1].hold+lines[1].gap);
  const segments=[
    ['process',1],['walk',walkSeconds],['settle',1.4],['human',2.1],['mirrorVisor',.9],['hollow',3],
    ['recoil',.12+lines[2].hold+lines[2].gap+.325],['turn',2.9],
    ['cornerWalk',4.5],['chairSettle',1],['creature',1.9],['chairVisor',.9],['annabelle',dialogueTime]
  ];
  const times={};let duration=0;
  for(const [name,length] of segments){times[name]=duration;duration+=length;}
  // Keep the existing sentence reactions inside each continuous recording.
  const reactionBeats=beat=>{
    const weight=beat.reactions.reduce((sum,[,length])=>sum+length,0);
    let offset=0;
    return beat.reactions.map(([id,length])=>{
      const hold=beat.hold*length/weight;
      const reaction={id,t:beat.t+offset,hold};offset+=hold;return reaction;
    });
  };
  const reactions=dialogue.flatMap(reactionBeats);
  return {lines,dialogue,reactions,reactionBeats,segments,times,seconds:Object.fromEntries(segments),duration,descentAt,memoryAt};
}
const DEFAULT_REVEAL_TIMING=createStudyRevealTiming();
export const REVEAL_DIALOGUE=Object.freeze(DEFAULT_REVEAL_TIMING.dialogue);
export const REVEAL_SEGMENTS=Object.freeze(DEFAULT_REVEAL_TIMING.segments);
export const REVEAL_TIMES=Object.freeze(DEFAULT_REVEAL_TIMING.times);
export const REVEAL_DURATION=DEFAULT_REVEAL_TIMING.duration;
const mirrorTarget = new THREE.Vector3(4.8, 1.45, -6.372);
const smooth = u => THREE.MathUtils.smoothstep(u, 0, 1);
const clamp = u => THREE.MathUtils.clamp(u, 0, 1);
export function studyPanic(t, timing = DEFAULT_REVEAL_TIMING) {
  const {times:REVEAL_TIMES,seconds}=timing;
  const u=clamp((t-REVEAL_TIMES.walk)/seconds.walk);
  const travel=smooth(u/.065)*(1-smooth((t-REVEAL_TIMES.settle)/1.0));
  // Full clear intervals between irregular, broad focus failures. The final
  // approach has the strongest peaks, then the held last peak resolves in 1s.
  const phase=t<REVEAL_TIMES.settle?t:REVEAL_TIMES.settle;
  const wave=Math.sin((phase-1)*2.3+.34*Math.sin(phase*.83));
  const pulse=smooth((wave+.12)/.92);
  const recoil=Math.sin(Math.PI*clamp((t-REVEAL_TIMES.recoil)/seconds.recoil))**2;
  const arrival=smooth((u-.91)/.09)*.68;
  return clamp(travel*Math.max((.34+.66*u)*pulse,arrival)+recoil*.35);
}
function easedDistance(u, edge = 0.14) {
  u = clamp(u);
  if (u < edge) { const v = u / edge; return edge * (2 * v * v - v * v * v); }
  if (u > 1 - edge) return 1 - easedDistance(1 - u, edge);
  return u;
}
function walkingDistance(u) {
  const d=easedDistance(u),sections=[0,.18,.34,.58,.78,1];
  const i=Math.min(sections.length-2,Math.max(0,sections.findIndex((n,j)=>j<sections.length-1&&d<=sections[j+1])));
  const a=sections[i],b=sections[i+1],v=(d-a)/(b-a);
  return a+(b-a)*(.65*v+.35*smooth(v));
}
function look(position, target) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)));
}
function arc(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  curve.arcLengthDivisions = 800; curve.updateArcLengths();
  return curve;
}
function floorOnStair(z) {
  return 3.1 * (1 - easedDistance(clamp((z + 1.88) / 4.48), 0.04));
}

/** Authored safe route, smoothed in X/Z; eye height follows the existing stair flight. */
export function studyMirrorRoute(start) {
  const points = [start];
  const upstairs = start[1] > 4;
  const onStair = start[0] >= 6.85 && start[2] >= -1.88 && start[2] <= 2.60 && start[1] > 1.9;
  if (upstairs) points.push([start[0], 4.7, -4.05], [5.8, 4.7, -3.05],
    [6.8, 4.7, -2.60], [7.25, 4.7, -2.40], [7.25, 4.7, -1.88]);
  if (upstairs || onStair) points.push([7.25, 1.6, 2.60], [7.25, 1.6, 3.30],
    [6.50, 1.6, 3.50], [5.50, 1.6, 3.15], [4.90, 1.6, 1.60]);
  else if (start[2] > -0.4) points.push([Math.min(5.7, Math.max(3.2, start[0])), 1.6, Math.max(3.15, start[2])]);
  points.push([4.8, 1.6, -3.95], MIRROR_EYE);
  const curve = arc(points);
  const at = u => {
    const p = curve.getPointAt(clamp(u));
    if (upstairs || onStair) {
      const stair = p.x > 6.85 && p.z >= -1.88 && p.z <= 2.60;
      const upper = p.z < -1.88 && (upstairs && u < 0.55);
      p.y = 1.6 + (stair ? floorOnStair(p.z) : upper ? 3.1 : 0);
    } else p.y = 1.6;
    if (u < 0.08) p.y = THREE.MathUtils.lerp(start[1], p.y, smooth(u / 0.08));
    return p;
  };
  return u => at(u).toArray();
}

/** Continuous first-person path and quaternion choreography; no per-shot lookAt snaps. */
export function createStudyChoreography(start, startQuaternion, annabelleSpot, startFov = 70, timing = DEFAULT_REVEAL_TIMING) {
  const {times:REVEAL_TIMES,seconds,duration:REVEAL_DURATION,dialogue}=timing;
  const dialogueBeat=id=>timing.reactions.find(beat=>beat.id===id);
  const route = studyMirrorRoute(start);
  const initial = new THREE.Quaternion().fromArray(startQuaternion);
  const chairTarget = new THREE.Vector3(annabelleSpot[0], 0.77, annabelleSpot[1]);
  const cornerStart = new THREE.Vector3(4.64, 1.6, -5.04);
  const cornerStop = new THREE.Vector3(-4.10, 1.6, -4.25);
  const cornerCurve = arc([cornerStart.toArray(), [1.6, 1.6, -4.55], [-1.8, 1.6, -4.25], cornerStop.toArray()]);
  // Integrate orientation once, then slerp adjacent quaternions. Interpolating
  // afresh from the initial heading can flip its shortest arc at a 180° turn.
  const orientations = [initial.clone()], samples = 1584, step = seconds.walk / samples;
  for (let i = 1; i <= samples; i++) {
    const u = i / samples, d = walkingDistance(u);
    const p = new THREE.Vector3(...route(d));
    const ahead = new THREE.Vector3(...route(Math.min(1, d + 0.04)));
    const behind = new THREE.Vector3(...route(Math.max(0, d - 0.02)));
    const heading = ahead.sub(behind); heading.y = heading.y * 0.82 - 0.025; heading.normalize();
    const target = look(p, p.clone().add(heading));
    target.slerp(look(p, mirrorTarget), smooth((u - 0.76) / 0.24));
    const q = orientations.at(-1).clone();
    const maxStep = 1.8 * step * smooth(u / 0.07);
    q.rotateTowards(target, Math.min(maxStep, q.angleTo(target) * (1 - Math.exp(-step / 0.13))));
    orientations.push(q);
  }
  const walk = u => {
    const distance = walkingDistance(u), p = new THREE.Vector3(...route(distance));
    const ahead = new THREE.Vector3(...route(Math.min(1, distance + 0.04)));
    const behind = new THREE.Vector3(...route(Math.max(0, distance - 0.02)));
    const heading = ahead.clone().sub(behind); heading.y = heading.y * 0.82 - 0.025; heading.normalize();
    const index = clamp(u) * samples, lower = Math.floor(index);
    const q = orientations[lower].clone().slerp(orientations[Math.min(samples, lower + 1)], index - lower);
    q.slerp(look(p, mirrorTarget), smooth((u - 0.84) / 0.16));
    const gain = smooth(u/.065)*(1-smooth((u-.96)/.04));
    const phase = u * seconds.walk * 2.4 * Math.PI * 2;
    const side = new THREE.Vector3(heading.z, 0, -heading.x);
    const stairs=smooth((p.x-6.85)/.25)*smooth((p.z+1.88)/.24)*(1-smooth((p.z-2.36)/.24));
    const impact=-Math.pow(Math.max(0,Math.sin(phase)),4);
    const breath=Math.sin(u*seconds.walk*2.7+.35*Math.sin(u*seconds.walk*1.1));
    p.addScaledVector(side, (Math.sin(phase*.5)*.020+Math.sin(phase*1.73)*.002)*gain);
    p.y += (Math.sin(phase)*(.023+.010*stairs)+impact*.014*stairs+breath*.010)*gain;
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (Math.sin(phase*.81)*.0065+Math.sin(phase*.233)*.004+impact*stairs*.004)*gain,
      (Math.sin(phase*.63)*.0045+Math.sin(phase*.271)*.0015)*gain,
      Math.sin(phase*.47)*.0045*gain)));
    return { p, q };
  };
  return function sample(t) {
    t = THREE.MathUtils.clamp(t, 0, REVEAL_DURATION);
    let p = new THREE.Vector3(...start), q = initial.clone();
    let fov = t < REVEAL_TIMES.walk ? startFov : t < REVEAL_TIMES.settle
      ? THREE.MathUtils.lerp(startFov, 60, smooth((t - REVEAL_TIMES.walk) / seconds.walk)) : 60;
    if (t >= REVEAL_TIMES.walk && t < REVEAL_TIMES.settle) {
      ({ p, q } = walk((t - REVEAL_TIMES.walk) / seconds.walk));
    } else if (t >= REVEAL_TIMES.settle && t < REVEAL_TIMES.recoil) {
      p.fromArray(MIRROR_EYE);
      p.y += Math.sin((t - REVEAL_TIMES.settle) * 1.8) * 0.0015;
      q = look(p, mirrorTarget);
      const settleGain=1-smooth((t-REVEAL_TIMES.settle)/1.0);
      const settleAge=t-REVEAL_TIMES.settle;
      p.y+=Math.sin(settleAge*5)*.008*settleGain;
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
        Math.sin(settleAge*7)*.004*settleGain,Math.sin(settleAge*5)*.003*settleGain,0)));
    } else if (t >= REVEAL_TIMES.recoil && t < REVEAL_TIMES.turn) {
      const u = clamp((t - REVEAL_TIMES.recoil) / seconds.recoil), e = smooth(u);
      p.fromArray(MIRROR_EYE).lerp(new THREE.Vector3(...RECOIL_EYE), e);
      p.y -= Math.sin(Math.PI * u) * 0.015;
      const target = mirrorTarget.clone(); target.y -= Math.sin(Math.PI * u) * 0.21;
      q = look(p, target);
      q.slerp(look(p,chairTarget),.02*smooth((t-(REVEAL_TIMES.turn-.4))/.4));
    } else if (t >= REVEAL_TIMES.turn && t < REVEAL_TIMES.cornerWalk) {
      const raw=clamp((t-REVEAL_TIMES.turn)/seconds.turn);
      const u = smooth(raw < .5 ? .5*smooth(raw*2) : .5+.5*smooth((raw-.5)*2));
      p.fromArray(RECOIL_EYE).lerp(cornerStart, u);
      q.slerpQuaternions(look(new THREE.Vector3(...RECOIL_EYE), mirrorTarget).slerp(look(new THREE.Vector3(...RECOIL_EYE),chairTarget),.02), look(cornerStart, chairTarget), u);
    } else if (t >= REVEAL_TIMES.cornerWalk && t < REVEAL_TIMES.chairSettle) {
      const u = clamp((t - REVEAL_TIMES.cornerWalk) / seconds.cornerWalk);
      p = cornerCurve.getPointAt(easedDistance(u));
      p.y += Math.sin(u * Math.PI * 13) * 0.005 * Math.sin(Math.PI * u) ** 2;
      q = look(p, chairTarget);
    } else if (t >= REVEAL_TIMES.chairSettle && t < REVEAL_TIMES.creature) {
      p.copy(cornerStop); q = look(p,chairTarget);
    } else if (t >= REVEAL_TIMES.creature) {
      const u = smooth(clamp((t - REVEAL_TIMES.creature) / seconds.creature));
      p.copy(cornerStop).lerp(new THREE.Vector3(...CHAIR_EYE), u);
      q = look(p, chairTarget);
      if (t >= REVEAL_TIMES.annabelle) {
        const age=t-REVEAL_TIMES.annabelle;
        const pulse=(id,length)=>{
          const u=clamp((age-dialogueBeat(id).t)/length);
          return Math.sin(Math.PI*u)**2;
        };
        // Centimetres of hesitation, a small refusal, then a lowered gaze.
        p.addScaledVector(p.clone().sub(chairTarget).setY(0).normalize(),pulse('me',3.2)*.028+pulse('no',2)*.035+pulse('following',3)*.02);
        const target=chairTarget.clone();target.y-=pulse('remember',3.7)*0.15;
        q=look(p,target);
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.sin(age*1.25)*0.0015,
          Math.sin((age-dialogueBeat('no').t)*8)*pulse('no',1.5)*0.008,0)));
      }
    }
    // Match the gameplay lens gradually during the final held breath.
    fov=THREE.MathUtils.lerp(fov,startFov,smooth((t-(REVEAL_DURATION-1.8))/1.8));
    fov+=studyPanic(t,timing)*(t<REVEAL_TIMES.human?1.8:.65);
    return { position: p.toArray(), quaternion: q.toArray(), fov };
  };
}

/** Adult-sized, uniformly scaled withdrawn pose; never shrink-to-fit the chair. */
export function poseStudyCreature(creature, spot) {
  const offset=creature.studyPositionOffset||[0,0];
  creature.setPosition(spot[0]+offset[0], spot[1]+offset[1]); creature.setCorrection(0); creature.setSpeed(0);
  creature.refs.root.scale.setScalar(creature.studyUniformScale||.9);
  creature.setCrouch?.(0);creature.update(1);
  const shell=creature.refs.root.children[0];
  if(shell) shell.position.y-=creature.studyFloorOffset||0;
  creature.refs.root.position.y=0;
  updateStudyCreature(creature,0);
  creature.group.updateMatrixWorld(true);
  creature.group.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.computeBoundingBox();});
  const box=new THREE.Box3().setFromObject(creature.group);
  if(!box.isEmpty()&&shell){creature.studyFloorOffset=-box.min.y/creature.refs.root.scale.y;shell.position.y+=creature.studyFloorOffset;}
}
/** Fit the two existing bodies in world metres, without folding or axis scaling. */
export function alignStudyCreature(creature,spot,anchors) {
  poseStudyCreature(creature,spot);
  if(!anchors.head||!anchors.torso||!creature.refs.head||!creature.refs.chest)return;
  const head=creature.refs.head.getWorldPosition(new THREE.Vector3());
  const torso=creature.refs.chest.getWorldPosition(new THREE.Vector3());
  // Least-squares fit of both vertical anchors keeps the head and ribcage close.
  const ratio=(anchors.head.y*head.y+anchors.torso.y*torso.y)/(head.y*head.y+torso.y*torso.y);
  creature.studyUniformScale=creature.refs.root.scale.x*ratio;
  poseStudyCreature(creature,spot);
  const fitted=creature.refs.head.getWorldPosition(new THREE.Vector3());
  creature.studyPositionOffset=[anchors.head.x-fitted.x,anchors.head.z-fitted.z];
  poseStudyCreature(creature,spot);
}

function poseStudyArms(creature) {
  if(!creature.studyArmBones){
    const bones=new Map();
    creature.group?.traverse(b=>{if(b.isBone)bones.set(b.name.toLowerCase(),b);});
    creature.studyArmBones=bones;
  }
  const bones=creature.studyArmBones, root=creature.refs?.root;
  if(!root)return;
  const aim=(bone,child,target)=>{
    root.updateMatrixWorld(true);
    const from=child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const to=target.clone().sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const world=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  };
  for(const side of ['left','right']){
    const arm=bones.get(side+' arm'),elbow=bones.get(side+' elbow'),hand=bones.get(side+' wrist');
    if(!arm||!elbow||!hand)continue;
    root.updateMatrixWorld(true);
    const shoulder=arm.getWorldPosition(new THREE.Vector3());
    // The imported Hollow faces -Z; Annabelle faces +Z.
    const target=side==='right'&&creature.studyBracePoint?creature.studyBracePoint.clone():
      root.localToWorld(new THREE.Vector3(.13,1.12,-.23));
    const a=shoulder.distanceTo(elbow.getWorldPosition(new THREE.Vector3()));
    const b=elbow.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
    const direction=target.clone().sub(shoulder),length=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.01,(a+b)*.98);
    direction.normalize();
    const pole=new THREE.Vector3(side==='left'?.35:-.35,-1,0).applyQuaternion(root.quaternion);
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(a*a+length*length-b*b)/(2*length);
    const bend=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    aim(arm,elbow,bend);aim(elbow,hand,shoulder.clone().addScaledVector(direction,length));
  }
}

export function updateStudyCreature(creature,dt) {
  if(creature.correction!==0)creature.setCorrection(0);
  creature.update(Math.max(0,dt)*0.65);
  const t=creature.studyPresenceTime=(creature.studyPresenceTime||0)+Math.max(0,dt);
  const breath=Math.sin(t*1.85),shift=Math.sin(t*.41)*.008;
  creature.offsetBones({Hips:[0,0,shift],Spine:[.01+breath*.005,0,-.015],
    Chest:[.01+breath*.008,0,.025],
    'Left shoulder':[.015,0,.055+breath*.005],
    'Right shoulder':[-.01,0,-.025-breath*.005],
    Head:[.065+Math.sin(t*.65)*.006,Math.sin(t*.55)*.008,.015]});
  poseStudyArms(creature);

}

export function buildStudyReveal({ start, startQuaternion = [0,0,0,1], annabelleSpot, camera, player, visor, captions, refs,
  creature, prepareCreature, restoreCreature, onFinish, setPanic=()=>{},
  voiceDurations={}, playDialogue=null, stopDialogue=()=>{}, playAlert=()=>{}, startSound=()=>{}, updateSound=()=>{}, playPerception=()=>{}, playMonsterReveal=()=>{} }) {
  const timing=createStudyRevealTiming(voiceDurations);
  const {times:REVEAL_TIMES,seconds,duration:REVEAL_DURATION,dialogue:REVEAL_DIALOGUE}=timing;
  const dialogueBeat=id=>REVEAL_DIALOGUE.find(beat=>beat.id===id);
  let activeVoice=null,finished=false,lifeTime=0;
  const sample = createStudyChoreography(start, startQuaternion, annabelleSpot, camera.fov,timing);
  const cues = [], cue = (t, run) => cues.push({ t, run });
  const setVisor=on=>{visor.set(on);refs.syncRevealVisor?.();};
  const speak = (beat,at) => {
    const current={end:at+beat.hold,ended:false};activeVoice=current;
    captions.say({text:`${beat.speaker}: ${beat.text}`,voice:beat.voice,recorded:!!playDialogue,
      revealManaged:true,manualEnd:!!playDialogue,duration:beat.hold,always:!playDialogue});
    const ended=()=>{
      if(finished||activeVoice!==current)return;
      current.ended=true;captions.cancel();
    };
    if(playDialogue)playDialogue(beat,ended);
    else current.ended=true;
  };
  cue(0, () => {
    document.body.classList.add('study-reveal'); stopDialogue(); captions.cancel();
    startSound(); prepareCreature(); setVisor(false); refs.setRevealAnnabelle(false);
    // Reflect whenever the glass enters view, including the approach, without a
    // last-frame switch from opaque glass to a populated mirror.
    refs.setMirrorRevealSight(false); refs.setMirrorRevealActive(true);
  });
  cue(REVEAL_TIMES.settle, () => refs.setMirrorRevealActive(true));
  cue(REVEAL_TIMES.mirrorVisor, () => setVisor(true));
  cue(REVEAL_TIMES.mirrorVisor + seconds.mirrorVisor * 0.5, () => { refs.setMirrorRevealSight(true);playPerception(); });
  const spoken=[{...timing.lines[0],at:REVEAL_TIMES.walk+timing.descentAt},
    {...timing.lines[1],at:REVEAL_TIMES.walk+timing.memoryAt},
    {...timing.lines[2],at:REVEAL_TIMES.recoil+.12},
    ...REVEAL_DIALOGUE.map(beat=>({...beat,at:REVEAL_TIMES.annabelle+beat.t}))];
  for(const beat of spoken){
    cue(beat.at,()=>speak(beat,beat.at));
    for(const reaction of timing.reactionBeats({...beat,t:beat.at}))
      cue(reaction.t,()=>refs.performAnnabelleLine?.(reaction.id,reaction.hold));
    if(!playDialogue)cue(beat.at+beat.hold,()=>captions.cancel());
  }
  cue(REVEAL_TIMES.turn-.325,playAlert);
  cue(REVEAL_TIMES.turn, () => {
    refs.setRevealChairActive?.(true);setVisor(false);
    creature.setCorrection(0); creature.studyPresenceTime=0; creature.visible = true;playMonsterReveal();
  });
  cue(REVEAL_TIMES.cornerWalk, () => refs.setMirrorRevealActive(false));
  cue(REVEAL_TIMES.chairVisor, () => {setVisor(true);creature.visible=false;refs.setRevealAnnabelle(true);});
  const cardTime=REVEAL_TIMES.annabelle+dialogueBeat('override').t;
  cue(cardTime-.001,()=>{if(refs.placeRevealKeycard)refs.placeRevealKeycard();else refs.showRevealKeycard();});
  return {
    name: 'studyMirrorReveal', maxSeconds:150, letterbox: false, skippable: false,
    // Audio completion gates progression; elapsed frame time cannot cut off a line.
    advanceTime(t,dt) {
      if(activeVoice&&playDialogue){
        if(!activeVoice.ended)return Math.min(t+dt,activeVoice.end-.00001);
        if(t<activeVoice.end)return activeVoice.end+dt;
      }
      return t+dt;
    },
    timing,
    shots: [{ pose: u => sample(u * REVEAL_DURATION), seconds: REVEAL_DURATION }], cues,
    onFrame(_ctx, t, dt) {
      const pose = sample(t);
      lifeTime+=dt;
      if(t>=REVEAL_TIMES.annabelle){
        const gain=smooth((t-REVEAL_TIMES.annabelle)/.6);
        pose.position[1]+=Math.sin(lifeTime*1.8)*.0035*gain;
        const q=new THREE.Quaternion().fromArray(pose.quaternion);
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.sin(lifeTime*1.7)*.002*gain,Math.sin(lifeTime*.73)*.0025*gain,0)));
        pose.quaternion=q.toArray();
      }
      camera.position.fromArray(pose.position); camera.quaternion.fromArray(pose.quaternion);
      const upper = t >= REVEAL_TIMES.walk && t < REVEAL_TIMES.settle;
      player.groundY = upper ? Math.max(0, camera.position.y - 1.6) : t < REVEAL_TIMES.walk ? Math.max(0,start[1]-1.6) : 0;
      updateSound({t,dt,timing,position:pose.position});
      refs.setMirrorPerformanceTime?.(t);
      setPanic(studyPanic(t,timing),t>=REVEAL_TIMES.walk&&t<REVEAL_TIMES.human);
      // A deliberate glance motivates the card's appearance on the cushion.
      const glance= smooth((t-(cardTime-1.25))/0.7)*(1-smooth((t-(cardTime+0.7))/1.0));
      refs.setAnnabelleCardGlance?.(glance);
      // The visor changes apparent identity, not the staged creature's proportions.
      if (creature.visible || (t >= REVEAL_TIMES.settle && t < REVEAL_TIMES.turn)) {
        updateStudyCreature(creature,dt);
      }
    },
    onEnd(_ctx, completed) {
      finished=true;activeVoice=null;stopDialogue();
      document.body.classList.remove('study-reveal');
      refs.setMirrorRevealActive(false); restoreCreature();
      setPanic(0);
      refs.setAnnabelleCardGlance?.(0);
      player.clearKeys(); player.crouch = 0; player.sprint = 0;
      if (completed) {
        setVisor(true); refs.setRevealAnnabelle(true); refs.showRevealKeycard();
        player.groundY = 0; camera.position.fromArray(CHAIR_EYE);
      } else refs.setRevealAnnabelle(false);
      captions.cancel(); onFinish(completed);
    }
  };
}
