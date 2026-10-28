import * as THREE from 'three';
import { loadModel } from '../world/modelLoader.js';
import annabelleUrl from '../assets/models/annabelle.glb?url';

export const ANNABELLE_MODEL = 'src/assets/models/annabelle.glb';
/** The existing rigged, worn-clothing Annabelle asset (65 Mixamo joints).
 * Pose and acting are reversible bone transforms; no replacement geometry/textures.
 */
export function createAnnabelle() {
  const root = new THREE.Group(); root.name = 'Annabelle';
  const rig = new THREE.Group(); root.add(rig);
  const bones = new Map(), rest = new Map(), posed = new Map(), colours = [];
  const parentQ = new THREE.Quaternion();
  let corrected = false, crouched = false, time = 0, revealAge = Infinity, loaded = false;
  let bracePoint = null, attention = null, attentionWeight = 0, cardTarget=null, cardWeight=0, offerWeight=0;
  let acting=[],hurtSince=null,walkSpeed=0,walkPhase=0,walkBlend=0,walkStride=1,resignation=0,endingConcern=0,endingSeated=0;
  const get = name => bones.get(name);
  const applySight = () => colours.forEach(({ material, colour }) => {
    material.color.copy(colour);
    if (!corrected) material.color.multiplyScalar(0.72);
  });
  function aim(name, childName, direction) {
    const bone = get(name), child = get(childName);
    if (!bone || !child) return;
    root.updateMatrixWorld(true);
    const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const to = new THREE.Vector3(...direction).normalize().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    parentQ.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
    bone.quaternion.copy(parentQ.multiply(world));
  }
  function offset(name, x = 0, y = 0, z = 0) {
    const bone = get(name);
    if (bone) bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));
  }
  function placeLimb(upper,lower,tip,support) {
    root.updateMatrixWorld(true);
    const shoulder=get(upper).getWorldPosition(new THREE.Vector3());
    const elbow=get(lower).getWorldPosition(new THREE.Vector3());
    const hand=get(tip).getWorldPosition(new THREE.Vector3());
    const a=shoulder.distanceTo(elbow), b=elbow.distanceTo(hand);
    const direction=support.clone().sub(shoulder),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.01,(a+b)*.98);
    direction.normalize();
    const pole=new THREE.Vector3(0,-1,.25).applyQuaternion(root.quaternion);
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(a*a+distance*distance-b*b)/(2*distance);
    const bend=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    const inverse=root.getWorldQuaternion(new THREE.Quaternion()).invert();
    aim(upper,lower,bend.sub(shoulder).applyQuaternion(inverse).toArray());
    root.updateMatrixWorld(true);
    aim(lower,tip,shoulder.clone().addScaledVector(direction,distance).sub(get(lower).getWorldPosition(new THREE.Vector3())).applyQuaternion(inverse).toArray());
  }
  function braceHand(){
    if(bracePoint)placeLimb('RightArm','RightForeArm','RightHand',cardTarget?bracePoint.clone().lerp(cardTarget,cardWeight):bracePoint);
  }
  function buildPose() {
    if (!loaded) return;
    rig.position.y = 0;
    for (const [name, state] of rest) {
      get(name).position.copy(state.position); get(name).quaternion.copy(state.quaternion);
    }
    if (crouched) {
      get('Hips').position.y -= 0.01;
      for (const side of ['Left','Right']) {
        aim(side+'UpLeg', side+'Leg', [side==='Left'?0.07:-0.07,-0.998,0.06]);
        aim(side+'Leg', side+'Foot', [0,-0.998,-0.06]);
        aim(side+'Foot', side+'ToeBase', [0,0,1]);
      }
      offset('Spine',0.02,0,0.02); offset('Spine1',0.015); offset('Spine2',0.01);
    }
    // Left arm guards the ribs; right hand takes her weight against the chair.
    aim('LeftArm','LeftForeArm',[-0.22,-0.82,0.48]);
    aim('LeftForeArm','LeftHand',[.05,.55,.30]);
    aim('RightArm','RightForeArm',[0.20,-0.73,0.65]);
    aim('RightForeArm','RightHand',[-0.10,-0.92,0.30]);
    offset('LeftHand',0.10,0,0.08); offset('RightHand',0.08,0,-0.08);
    offset('LeftShoulder',0.015,0,0.035);offset('RightShoulder',0,0,-0.025);
    if(crouched)braceHand();
    offset('Head',0,0,0.035);
    root.updateMatrixWorld(true);
    rig.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingBox(); });
    const bounds = new THREE.Box3().setFromObject(rig);
    rig.position.y -= (bounds.min.y - root.position.y)/root.getWorldScale(new THREE.Vector3()).y;
    posed.clear();
    for (const [name, bone] of bones) posed.set(name,{position:bone.position.clone(),quaternion:bone.quaternion.clone()});
  }
  function animate(target) {
    if (!loaded) return;
    for (const [name,state] of posed) { get(name).position.copy(state.position); get(name).quaternion.copy(state.quaternion); }
    root.updateMatrixWorld(true);
    const envelope=event=>THREE.MathUtils.smoothstep(event.age,0,.45)
      *(1-THREE.MathUtils.smoothstep(event.age,event.hold,event.hold+1.1));
    const still=acting.filter(e=>e.id==='remember').reduce((v,e)=>Math.max(v,envelope(e)),0);
    const fear=hurtSince===null?1:1-THREE.MathUtils.smoothstep(time-hurtSince,0,.65);
    const breath = (Math.sin(time * 1.85)+.18*Math.sin(time*2.63))*(1-still*.45), tremble = (Math.sin(time * 19.7) * 0.004 + Math.sin(time * 27.3) * 0.002)*(1-still*.7)*(.2+.8*fear);
    const flinch = fear>0&&Number.isFinite(revealAge) ? Math.exp(-revealAge * 4.5) * Math.sin(Math.min(1,revealAge/0.55)*Math.PI) : 0;
    offset('Spine1',breath*0.009 - flinch*0.05,0,tremble);
    offset('Spine2',breath*0.012 - flinch*0.06,0,-tremble*0.7);
    offset('LeftShoulder',breath*0.012,0,tremble*0.8);
    offset('RightShoulder',-breath*0.009,0,-tremble);
    const protect=Number.isFinite(revealAge)?1-THREE.MathUtils.smoothstep(revealAge,.45,2.7):0;
    offset('Spine2',-protect*.055-flinch*.055);
    offset('LeftShoulder',0,0,protect*.07);offset('LeftForeArm',-protect*.12);
    offset('LeftForeArm',Math.sin(time*1.85)*.012,0,tremble*2);
    for(const side of ['Left','Right']) for(const finger of ['Index','Middle','Ring','Pinky'])
      offset(side+'Hand'+finger+'1',.035+Math.sin(time*2.1)*.012+tremble*2);
    let yaw = 0, pitch = -0.07;
    if (target) {
      const point = target.isVector3 ? target.clone() : new THREE.Vector3(...target);
      if(attention)point.lerp(attention,attentionWeight);
      root.updateMatrixWorld(true);root.worldToLocal(point);
      yaw = THREE.MathUtils.clamp(Math.atan2(point.x,point.z),-0.38,0.38);
      pitch = -Math.atan2(point.y-(crouched?1.12:1.45),Math.hypot(point.x,point.z));
      pitch = THREE.MathUtils.clamp(pitch,-0.20,0.20);
    }
    const lift = Number.isFinite(revealAge) ? THREE.MathUtils.smoothstep(revealAge,0.25,1.75) : 1;
    pitch += crouched ? .035 : 0;
    offset('Neck',THREE.MathUtils.lerp(0.20,pitch*0.35,lift)+breath*0.003, yaw*0.3*lift,0);
    offset('Head',THREE.MathUtils.lerp(0.23,pitch*0.65,lift)+flinch*0.10,
      THREE.MathUtils.lerp(-0.12,yaw*0.7,lift)+Math.sin(time*0.73)*0.008,Math.sin(time*0.91)*0.006);
    for(const event of acting){
      const w=envelope(event)*.55*(hurtSince===null?1:.65),a=event.age;
      // Delayed head/arm accents overlap rather than arriving on the same frame.
      const delayed=w*THREE.MathUtils.smoothstep(a,.18,.65);
      switch(event.id){
        case 'please':
          offset('Spine2',-.12*w);offset('LeftShoulder',-.08*w,0,.13*w);offset('RightShoulder',-.06*w);
          offset('LeftArm',-.18*w);offset('LeftForeArm',-.28*w);offset('Head',.10*w-.15*delayed);break;
        case 'me':
          offset('Head',-.06*delayed,Math.sin(a*3)*.065*delayed,.035*w);
          offset('LeftArm',-.15*w);offset('LeftForeArm',-.25*delayed,0,.07*w);break;
        case 'no': {
          const flinch=Math.sin(Math.PI*THREE.MathUtils.clamp(a/.7,0,1));
          offset('Spine2',-.13*flinch);offset('Head',.10*flinch,0,-.04*flinch);
          offset('LeftShoulder',-.06*flinch,0,.11*flinch);break;
        }
        case 'saw':
          offset('Head',.03*w,Math.sin(a*4.3)*.105*delayed);
          offset('LeftShoulder',-.065*w,0,.07*w);offset('RightShoulder',-.045*w);break;
        case 'following':
          offset('Spine1',-.075*w,0,.025*w);offset('Head',.055*w);
          offset('LeftArm',-.08*w);offset('LeftForeArm',-.20*delayed);offset('RightHand',.09*w);break;
        case 'tried':
          offset('Head',.18*delayed);offset('Spine1',.075*w);offset('LeftForeArm',-.22*delayed);
          offset('LeftShoulder',.045*w,0,.06*w);break;
        case 'told':
          offset('Head',-.11*delayed,0,.025*w);offset('Spine2',-.055*w);
          offset('LeftForeArm',-.11*w);break;
        case 'promise':
          offset('Spine1',.065*w);offset('Head',.11*delayed,Math.sin(a*2.8)*.07*delayed,-.045*w);
          offset('LeftShoulder',.09*w,0,-.07*w);offset('RightShoulder',.07*w);break;
        case 'remember':
          offset('LeftShoulder',.065*delayed,0,-.085*delayed);offset('RightShoulder',.04*delayed);
          offset('LeftForeArm',.16*delayed);offset('Head',.025*delayed,0,.055*delayed);break;
        case 'know':
          offset('Head',Math.sin(Math.PI*Math.min(1,a/1.4))*.095*w,0,.04*delayed);
          offset('LeftShoulder',.04*w,0,-.06*w);offset('LeftForeArm',.08*w);break;
        case 'eyes':
          offset('Head',-.03*w,Math.sin(Math.PI*Math.min(1,a/Math.max(.5,event.hold)))*.12*delayed,-.02*w);
          offset('Neck',0,.045*w);break;
        case 'visor':
          offset('Head',0,.18*Math.sin(Math.PI*Math.min(1,a/Math.max(.5,event.hold)))*w,-.025*w);
          offset('Neck',0,.055*w);break;
        case 'override':
          offset('Head',.14*Math.sin(Math.PI*Math.min(1,a/Math.max(.5,event.hold)))*w,-.07*w);
          offset('Spine1',.035*w);break;
        case 'decide':
          offset('LeftShoulder',.075*w,0,-.035*w);offset('RightShoulder',.055*w);
          offset('Head',.04*delayed,0,-.045*w);offset('Spine1',.045*w);break;
      }
    }
    if(walkBlend>.001){
      root.updateMatrixWorld(true);
      const feetY=Math.min(get('LeftFoot').getWorldPosition(new THREE.Vector3()).y,get('RightFoot').getWorldPosition(new THREE.Vector3()).y);
      for(const [side,sign] of [['Left',1],['Right',-1]]){
        const swing=Math.sin(walkPhase)*sign*.16*walkBlend*walkStride;
        const knee=(.06+Math.max(0,-Math.sin(walkPhase)*sign)*.15)*walkBlend*walkStride;
        aim(side+'UpLeg',side+'Leg',[side==='Left'?.06:-.06,-Math.cos(swing),Math.sin(swing)]);
        aim(side+'Leg',side+'Foot',[0,-Math.cos(knee),-Math.sin(knee)]);
        aim(side+'Foot',side+'ToeBase',[0,0,1]);
      }
      root.updateMatrixWorld(true);
      const moved=Math.min(get('LeftFoot').getWorldPosition(new THREE.Vector3()).y,get('RightFoot').getWorldPosition(new THREE.Vector3()).y);
      get('Hips').position.y+=(feetY-moved)/root.getWorldScale(new THREE.Vector3()).y;
    }
    if(endingConcern>0){
      offset('Spine1',-.014*endingConcern);offset('Head',.025*endingConcern);
      offset('LeftShoulder',-.012*endingConcern,0,.012*endingConcern);
    }
    if(resignation>0){
      offset('Spine1',.025*resignation);offset('Head',.055*resignation);
      get('LeftShoulder').position.y-=.012*resignation;
      get('RightShoulder').position.y-=.018*resignation;
    }
    // Ending only: supported floor sit, knees forward, without moving the root below ground.
    if(endingSeated>0){
      const w=endingSeated;
      root.updateMatrixWorld(true);
      const planted=Math.min(get('LeftFoot').getWorldPosition(new THREE.Vector3()).y,get('RightFoot').getWorldPosition(new THREE.Vector3()).y);
      get('Hips').position.y-=.80*w;
      for(const side of ['Left','Right']){
        for(const [name,child,direction] of [
          [side+'UpLeg',side+'Leg',[side==='Left'?.12:-.12,.12,.99]],
          [side+'Leg',side+'Foot',[0,-.30,.95]],
          [side+'Foot',side+'ToeBase',[0,0,1]]]){
          const before=get(name).quaternion.clone();aim(name,child,direction);
          get(name).quaternion.slerpQuaternions(before,get(name).quaternion.clone(),w);
        }
      }
      root.updateMatrixWorld(true);
      const moved=Math.min(get('LeftFoot').getWorldPosition(new THREE.Vector3()).y,get('RightFoot').getWorldPosition(new THREE.Vector3()).y);
      get('Hips').position.y+=(planted-moved)/root.getWorldScale(new THREE.Vector3()).y;
      offset('Spine1',.06*w);offset('Head',.08*w);
    }
    // Keep the protective hand at the ribs, never up against the face.
    const guard=root.localToWorld(new THREE.Vector3(.10,1.02-.80*endingSeated,.17));
    placeLimb('LeftArm','LeftForeArm','LeftHand',guard);
    if(endingSeated>0){
      placeLimb('RightArm','RightForeArm','RightHand',root.localToWorld(new THREE.Vector3(-.22,.94-.80*endingSeated,.22)));
    }else if(crouched)braceHand();
    if(offerWeight>0&&endingSeated===0){
      const wrist=get('RightHand'),before=wrist.quaternion.clone();
      aim('RightHand','RightHandMiddle1',[0,.35,1]);
      wrist.quaternion.slerpQuaternions(before,wrist.quaternion.clone(),offerWeight);
      for(const finger of ['Index','Middle','Ring','Pinky']){
        for(const [joint,dir] of [[1,[0,.75,.66]],[2,[0,.45,-.89]],[3,[0,-.45,-.89]]]){
          const bone=get('RightHand'+finger+joint),q=bone.quaternion.clone();
          aim('RightHand'+finger+joint,'RightHand'+finger+(joint+1),dir);
          bone.quaternion.slerpQuaternions(q,bone.quaternion.clone(),offerWeight);
        }
      }
      const index=get('RightHandIndex3').getWorldPosition(new THREE.Vector3());
      placeLimb('RightHandThumb1','RightHandThumb2','RightHandThumb4',index);
    }
    // After her second speaking turn she is hurt/exhausted, no renewed fear pose.
    offset('Spine1',(1-fear)*.018);offset('Head',(1-fear)*.025);
    root.updateMatrixWorld(true);
  }
  const ready = loadModel(annabelleUrl).then(source => {
    rig.add(source);
    source.traverse(object => {
      if (object.isBone) {
        const name = object.name.replace(/^mixamorig[:_]?/,'');
        bones.set(name,object); rest.set(name,{position:object.position.clone(),quaternion:object.quaternion.clone()});
      }
      if (!object.isMesh) return;
      object.castShadow = false; object.receiveShadow = true; object.frustumCulled = false;
      for (const material of [].concat(object.material)) if (material.color) colours.push({material,colour:material.color.clone()});
    });
    if (!get('Hips') || !get('Head')) throw new Error('Rigged Annabelle is missing required bones');
    loaded = true; buildPose(); applySight(); animate();
  }).catch(error => console.warn('Annabelle could not load:',error));
  return {
    root, ready, model: ANNABELLE_MODEL,
    setCrouched(on) { if (crouched !== !!on) { crouched=!!on; buildPose(); animate(); } },
    beginReveal() { revealAge=0; animate(); },
    setBracePoint(point) { bracePoint=point.clone();buildPose();animate(); },
    setRestHandTarget(point) {bracePoint=point.clone();},
    setOfferTarget(point,weight) {cardTarget=point;cardWeight=THREE.MathUtils.clamp(weight,0,1);},
    setEndingSeated(weight){endingSeated=THREE.MathUtils.clamp(weight,0,1);},
    setEndingConcern(weight){endingConcern=THREE.MathUtils.clamp(weight,0,1);},
    setEndingResignation(weight){resignation=THREE.MathUtils.clamp(weight,0,1);},
    // stride: how big the steps are, 1 her own; the kept ending's drag braces and steps long.
    setLocomotion(speed,phase,stride=1) {walkSpeed=Math.max(0,speed);walkPhase=phase;walkStride=Math.max(0,stride);},
    getHandBone() {return get('RightHand');},
    getCardGripBone() {return get('RightHandIndex3');},
    get emotionalState() {return hurtSince===null?'frightened':'hurt';},
    setHandOffer(weight) {offerWeight=THREE.MathUtils.clamp(weight,0,1);},
    getHandPosition() {root.updateMatrixWorld(true);return get('RightHand')?.getWorldPosition(new THREE.Vector3());},
    getPoseAnchors() {root.updateMatrixWorld(true);return {head:get('Head')?.getWorldPosition(new THREE.Vector3()),torso:get('Spine2')?.getWorldPosition(new THREE.Vector3())};},
    setAttention(point,weight) { attention=point;attentionWeight=THREE.MathUtils.clamp(weight,0,1); },
    perform(id,hold=2.5) {if(id==='tried'&&hurtSince===null)hurtSince=time;acting.push({id,hold,age:0}); },
    setCorrectedSight(on) { corrected=!!on; applySight(); },
    update(dt,target) { const step=Math.max(0,Math.min(0.1,dt));time+=step;walkBlend+=(Math.min(1,walkSpeed/.65)-walkBlend)*(1-Math.exp(-step/.10));if(Number.isFinite(revealAge))revealAge+=step;acting=acting.filter(event=>{event.age+=step;return event.age<event.hold+1.2;});animate(target); },
    reset() { time=0;revealAge=Infinity;crouched=false;attention=null;attentionWeight=0;cardTarget=null;cardWeight=0;offerWeight=0;acting=[];hurtSince=null;walkStride=1;walkSpeed=walkPhase=walkBlend=resignation=endingConcern=endingSeated=0;buildPose();animate(); }
  };
}
