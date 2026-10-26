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
  let bracePoint = null, attention = null, attentionWeight = 0;
  let acting=[];
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
  function braceHand() {
    if (!bracePoint) return;
    root.updateMatrixWorld(true);
    const shoulder=get('RightArm').getWorldPosition(new THREE.Vector3());
    const elbow=get('RightForeArm').getWorldPosition(new THREE.Vector3());
    const hand=get('RightHand').getWorldPosition(new THREE.Vector3());
    const a=shoulder.distanceTo(elbow), b=elbow.distanceTo(hand);
    const direction=bracePoint.clone().sub(shoulder),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.01,(a+b)*.98);
    direction.normalize();
    const pole=new THREE.Vector3(0,-1,.25).applyQuaternion(root.quaternion);
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(a*a+distance*distance-b*b)/(2*distance);
    const bend=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    const inverse=root.getWorldQuaternion(new THREE.Quaternion()).invert();
    aim('RightArm','RightForeArm',bend.sub(shoulder).applyQuaternion(inverse).toArray());
    root.updateMatrixWorld(true);
    aim('RightForeArm','RightHand',bracePoint.clone().sub(get('RightForeArm').getWorldPosition(new THREE.Vector3())).applyQuaternion(inverse).toArray());
  }
  function buildPose() {
    if (!loaded) return;
    rig.position.y = 0;
    for (const [name, state] of rest) {
      get(name).position.copy(state.position); get(name).quaternion.copy(state.quaternion);
    }
    if (crouched) {
      get('Hips').position.y -= 0.30;
      for (const side of ['Left','Right']) {
        aim(side+'UpLeg', side+'Leg', [side==='Left'?0.07:-0.07,-0.35,0.94]);
        aim(side+'Leg', side+'Foot', [0,-0.82,-0.57]);
        aim(side+'Foot', side+'ToeBase', [0,0,1]);
      }
      offset('Spine',0.15,0,0.045); offset('Spine1',0.10); offset('Spine2',0.065);
    }
    // Left arm guards the ribs; right hand takes her weight against the chair.
    aim('LeftArm','LeftForeArm',[-0.22,-0.82,0.48]);
    aim('LeftForeArm','LeftHand',[-0.86,0.35,0.24]);
    aim('RightArm','RightForeArm',[0.20,-0.73,0.65]);
    aim('RightForeArm','RightHand',[0.84,0.38,0.22]);
    offset('LeftHand',0.10,0,0.08); offset('RightHand',0.08,0,-0.08);
    offset('LeftShoulder',0.015,0,0.035);offset('RightShoulder',0,0,-0.025);
    if(crouched)braceHand();
    offset('Head',0,0,0.035);
    root.updateMatrixWorld(true);
    rig.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingBox(); });
    const bounds = new THREE.Box3().setFromObject(rig);
    rig.position.y -= bounds.min.y - root.position.y;
    posed.clear();
    for (const [name, bone] of bones) posed.set(name,{position:bone.position.clone(),quaternion:bone.quaternion.clone()});
  }
  function animate(target) {
    if (!loaded) return;
    for (const [name,state] of posed) { get(name).position.copy(state.position); get(name).quaternion.copy(state.quaternion); }
    const envelope=event=>THREE.MathUtils.smoothstep(event.age,0,.45)
      *(1-THREE.MathUtils.smoothstep(event.age,event.hold,event.hold+1.1));
    const still=acting.filter(e=>e.id==='remember').reduce((v,e)=>Math.max(v,envelope(e)),0);
    const breath = Math.sin(time * 1.85)*(1-still*.75), tremble = Math.sin(time * 19.7) * 0.002 + Math.sin(time * 27.3) * 0.001;
    const flinch = Number.isFinite(revealAge) ? Math.exp(-revealAge * 4.5) * Math.sin(Math.min(1,revealAge/0.55)*Math.PI) : 0;
    offset('Spine1',breath*0.006 - flinch*0.05,0,tremble);
    offset('Spine2',breath*0.009 - flinch*0.06,0,-tremble*0.7);
    offset('LeftShoulder',breath*0.004,0,tremble*0.8);
    offset('RightShoulder',-breath*0.003,0,-tremble);
    const protect=Number.isFinite(revealAge)?1-THREE.MathUtils.smoothstep(revealAge,.45,2.7):0;
    offset('Spine2',-protect*.055-flinch*.055);
    offset('LeftShoulder',0,0,protect*.07);offset('LeftForeArm',-protect*.12);
    let yaw = 0, pitch = -0.07;
    if (target) {
      const point = target.isVector3 ? target.clone() : new THREE.Vector3(...target);
      if(attention)point.lerp(attention,attentionWeight);
      point.sub(root.position).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
      yaw = THREE.MathUtils.clamp(Math.atan2(point.x,point.z),-0.38,0.38);
      pitch = -Math.atan2(point.y-(crouched?1.12:1.45),Math.hypot(point.x,point.z));
      pitch = THREE.MathUtils.clamp(pitch,-0.20,0.20);
    }
    const lift = Number.isFinite(revealAge) ? THREE.MathUtils.smoothstep(revealAge,0.25,1.75) : 1;
    pitch -= crouched ? 0.315 : 0;
    offset('Neck',THREE.MathUtils.lerp(0.20,pitch*0.35,lift)+breath*0.003, yaw*0.3*lift,0);
    offset('Head',THREE.MathUtils.lerp(0.23,pitch*0.65,lift)+flinch*0.10,
      THREE.MathUtils.lerp(-0.12,yaw*0.7,lift)+Math.sin(time*0.73)*0.008,Math.sin(time*0.91)*0.006);
    for(const event of acting){
      const w=envelope(event),a=event.age;
      // Delayed head/arm accents overlap rather than arriving on the same frame.
      const delayed=w*THREE.MathUtils.smoothstep(a,.18,.65);
      switch(event.id){
        case 'please': offset('Spine2',-.065*w);offset('LeftShoulder',0,0,.05*w);offset('Head',-.035*delayed);break;
        case 'me': offset('Head',0,Math.sin(a*4.0)*.035*delayed,0);offset('LeftArm',-.065*w);offset('LeftForeArm',-.11*delayed,0,.025*w);break;
        case 'tried': offset('Head',.12*delayed);offset('Spine1',.045*w);offset('LeftForeArm',-.08*delayed);offset('LeftShoulder',0,0,-.03*w);break;
        case 'no': {const flinch=Math.sin(Math.PI*THREE.MathUtils.clamp(a/1.3,0,1));offset('Spine2',-.07*flinch);offset('Head',.06*flinch,0,-.025*flinch);offset('LeftShoulder',0,0,.045*flinch);break;}
        case 'saw':case 'following': offset('Head',0,Math.sin(a*3.4)*.045*delayed);offset('Spine1',-.035*w);offset('RightForeArm',.025*delayed);break;
        case 'told':offset('Head',-.045*delayed,0,.015*w);offset('Spine2',-.025*w);break;
        case 'promise':offset('Spine1',.045*w);offset('Head',.045*delayed,Math.sin(a*3)*.022*delayed,-.035*w);break;
        case 'know':offset('Head',Math.sin(Math.PI*Math.min(1,a/2))*.055*w,0,.035*delayed);offset('LeftShoulder',0,0,-.04*w);offset('RightShoulder',0,0,.025*w);break;
        case 'eyes':case 'visor':offset('Head',0,.095*delayed,-.018*w);offset('Neck',0,.025*w);break;
        case 'decide':offset('LeftShoulder',0,0,.035*w);offset('Head',.025*delayed,0,-.025*w);break;
      }
    }
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
    setAttention(point,weight) { attention=point;attentionWeight=THREE.MathUtils.clamp(weight,0,1); },
    perform(id,hold=2.5) { acting.push({id,hold,age:0}); },
    setCorrectedSight(on) { corrected=!!on; applySight(); },
    update(dt,target) { const step=Math.max(0,Math.min(0.1,dt));time+=step;if(Number.isFinite(revealAge))revealAge+=step;acting=acting.filter(event=>{event.age+=step;return event.age<event.hold+1.2;});animate(target); },
    reset() { time=0;revealAge=Infinity;crouched=false;attention=null;attentionWeight=0;acting=[];buildPose();animate(); }
  };
}
