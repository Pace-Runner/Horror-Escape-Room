import * as THREE from 'three';

const ease=value=>THREE.MathUtils.smoothstep(value,0,1);
const clamp=value=>THREE.MathUtils.clamp(value,0,1);

/** Shared visual clock and existing-goggle attachments; no player movement ownership. */
export function createStudyActorPresentation({visorTemplate=null,buildHeldItem=()=>null}={}){
  let time=0,lastTime=null,lastPosition=null,speed=0,phase=0,worn=false,held=false,action=null;
  const records=new Map(),world=new THREE.Matrix4(),inverse=new THREE.Matrix4();
  const handPoint=new THREE.Vector3(),facePoint=new THREE.Vector3();
  const handQ=new THREE.Quaternion(),faceQ=new THREE.Quaternion(),goalQ=new THREE.Quaternion();
  const scale=new THREE.Vector3(1,1,1);
  let view=null,inventoryMode=false,handItem=null,leftItem=null;
  function cloneVisor(){
    if(!visorTemplate)return null;
    const prop=visorTemplate.clone(true);prop.name='Mark_Physical_Visor';prop.visible=true;
    prop.position.set(0,0,0);prop.quaternion.identity();prop.scale.setScalar(1);
    prop.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true;}});
    return prop;
  }
  function state(){
    if(!action)return {lift:0,blend:worn?1:0,attachment:worn?'face':'hand',moving:false};
    const age=time-action.start,u=clamp((age+1e-7)/action.duration);
    if(action.on){
      return {lift:age<=action.duration?ease(u):1-ease((age-action.duration)/.4),
        blend:ease(u),attachment:u>=1?'face':'hand',moving:age>=0&&age<action.duration};
    }
    const contact=action.contact;
    return {lift:age<contact?ease(age/contact):1-ease((age-contact)/(action.duration-contact)),
      blend:age<contact?1:1-ease((age-contact)/(action.duration-contact)),
      attachment:age<contact?'face':'hand',moving:age>=0&&age<action.duration};
  }
  function record(actor,corrected){
    if(records.has(actor))return records.get(actor);
    const head=actor.refs?.head,hand=actor.refs?.hands?.r;
    if(!head||!hand||!visorTemplate)return null;
    const face=new THREE.Object3D();face.name='Mark_Visor_Face_Anchor';head.add(face);
    actor.group.updateMatrixWorld(true);
    const front=new THREE.Vector3(0,0,-1).applyQuaternion(actor.refs.root.getWorldQuaternion(new THREE.Quaternion()));
    face.position.copy(head.worldToLocal(actor.getEyePosition(new THREE.Vector3()).addScaledVector(front,corrected?.045:.026)));
    face.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(actor.refs.root.getWorldQuaternion(new THREE.Quaternion()))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)));
    const grip=new THREE.Object3D();grip.name='Mark_Visor_Hand_Anchor';hand.add(grip);
    // Grip the end of the right temple, keeping both long arms beyond the cuff.
    const elbow=actor.getRigBone?.('Right elbow');
    const wrist=hand.getWorldPosition(new THREE.Vector3());
    const forward=elbow?wrist.clone().sub(elbow.getWorldPosition(new THREE.Vector3())).normalize():front.clone();
    const across=new THREE.Vector3(1,0,0).applyQuaternion(actor.refs.root.getWorldQuaternion(new THREE.Quaternion()));
    across.addScaledVector(forward,-across.dot(forward)).normalize();
    const up=new THREE.Vector3().crossVectors(forward,across).normalize();
    const gripWorld=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,up,forward));
    grip.position.copy(hand.worldToLocal(wrist.clone().addScaledVector(forward,.155).addScaledVector(across,-.075)));
    grip.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(gripWorld));
    const prop=cloneVisor();grip.add(prop);
    const itemGrip=new THREE.Object3D();itemGrip.name='Mark_Held_Item_Anchor';hand.add(itemGrip);
    itemGrip.position.copy(hand.worldToLocal(wrist.clone().addScaledVector(forward,.10)));
    itemGrip.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(actor.refs.root.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)));
    const leftHand=actor.refs?.hands?.l,leftGrip=new THREE.Object3D();
    if(leftHand){
      leftHand.add(leftGrip);leftGrip.name='Mark_Left_Item_Anchor';
      const leftElbow=actor.getRigBone?.('Left elbow');
      const leftWrist=leftHand.getWorldPosition(new THREE.Vector3());
      const direction=leftElbow?leftWrist.clone().sub(leftElbow.getWorldPosition(new THREE.Vector3())).normalize():forward;
      leftGrip.position.copy(leftHand.worldToLocal(leftWrist.clone().addScaledVector(direction,.09)));
      leftGrip.quaternion.copy(leftHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(actor.refs.root.getWorldQuaternion(new THREE.Quaternion())));
    }
    const value={head,hand,face,grip,prop,itemGrip,leftGrip,items:new Map()};records.set(actor,value);return value;
  }
  return {
    update(seconds,position,camera=null){
      const dt=lastTime===null?0:seconds-lastTime;
      if(position&&lastPosition&&dt>0&&dt<.25){
        const distance=Math.hypot(position.x-lastPosition.x,position.z-lastPosition.z);
        const actual=distance<1?distance/dt:0;
        speed+=((actual>.06?actual:0)-speed)*(1-Math.exp(-dt/.12));
        if(actual>.06)phase=(phase+distance/1.8*Math.PI*2)%(Math.PI*2);
      }else if(dt<0||dt>.25)speed=0;
      if(position){if(!lastPosition)lastPosition=new THREE.Vector3();lastPosition.copy(position);}
      time=seconds;lastTime=seconds;
      if(action&&time+1e-7>=action.start+action.duration)worn=action.on;
      // A cheap first-person copy only during authored handling; hidden from mirror capture.
      if(camera&&action?.cinematic){
        if(!view){view=cloneVisor();if(view)view.name='First_Person_Visor_Handling';}
        if(view){
          if(view.parent!==camera)camera.add(view);
          const s=state(),b=s.blend;
          view.visible=held&&time>=action.start&&time<action.start+action.duration;
          view.position.set(.25*(1-b),-.23*(1-b),-.40+.43*b);
          view.rotation.set(.15*(1-b),Math.PI,.3*(1-b));
        }
      }else if(view)view.visible=false;
    },
    initializeInHand(){
      inventoryMode=false;held=true;worn=false;action=null;if(view)view.visible=false;
      for(const r of records.values()){
        r.grip.add(r.prop);r.prop.position.set(0,0,0);r.prop.quaternion.identity();r.prop.scale.setScalar(1);
        r.prop.visible=true;r.prop.userData.attachment='hand';
      }
    },
    setHeld(on){held=!!on;},
    setInventoryItem(id,leftId=null){inventoryMode=true;handItem=id??null;leftItem=leftId;},
    setCinematicItems(){inventoryMode=false;},
    setVisor(on,{start=time,duration=.32,contact=duration*.36,cinematic=false}={}){
      held=true;action={on:!!on,start,duration,contact,cinematic};
    },
    syncWorn(on){
      const active=action&&time+1e-7<action.start+action.duration;
      if(active&&(action.cinematic||action.on===!!on))return;
      if(worn!==!!on||action&&action.on!==!!on)this.setVisor(on);
    },
    apply(actor,corrected){
      const s=state();actor.sampleReflectionPose?.({speed,phase,time,visorLift:held?s.lift:0});
      const r=record(actor,corrected);if(!r)return;
      r.prop.visible=held&&(!inventoryMode||s.attachment==='face'||s.moving||handItem==='visor');
      for(const prop of r.items.values())prop.visible=false;
      if(inventoryMode&&handItem&&handItem!=='visor'&&!s.moving){
        if(!r.items.has(handItem)){
          const item=buildHeldItem(handItem);
          if(item){item.name='Mirror_Held_'+handItem;r.itemGrip.add(item);r.items.set(handItem,item);}
        }
        const item=r.items.get(handItem);if(item)item.visible=true;
      }
      if(inventoryMode&&leftItem&&r.leftGrip.parent){
        const key='left:'+leftItem;
        if(!r.items.has(key)){
          const item=buildHeldItem(leftItem);if(item){item.name='Mirror_Left_'+leftItem;r.leftGrip.add(item);r.items.set(key,item);}
        }
        const item=r.items.get(key);if(item)item.visible=true;
      }
      if(!held)return;
      actor.group.updateMatrixWorld(true);
      r.grip.getWorldPosition(handPoint);r.grip.getWorldQuaternion(handQ);
      r.face.getWorldPosition(facePoint);r.face.getWorldQuaternion(faceQ);
      let propBlend=s.blend;
      if(action){
        const age=time-action.start;
        propBlend=action.on?ease((age/action.duration-.82)/.18):age<action.contact?1:1-ease((age-action.contact)/.16);
      }
      // The prop stays in the grip throughout the raise/lower. Only the short
      // contact interval adjusts its local grip into the calibrated eye anchor.
      handPoint.lerp(facePoint,propBlend);goalQ.slerpQuaternions(handQ,faceQ,propBlend);
      const parent=s.attachment==='face'?r.face:r.grip;
      if(r.prop.parent!==parent)parent.add(r.prop);
      world.compose(handPoint,goalQ,scale);inverse.copy(parent.matrixWorld).invert();
      inverse.multiply(world).decompose(r.prop.position,r.prop.quaternion,r.prop.scale);
      r.prop.userData.attachment=s.attachment;
    },
    finishVisor(on){action=null;worn=!!on;if(view)view.visible=false;},
    hideAttachedProps(){for(const r of records.values()){r.prop.visible=false;for(const prop of r.items.values())prop.visible=false;}},
    get motion(){return {speed,phase,time,...state()};},
    get hiddenObjects(){return view?[view]:[];},
    get attachments(){return [...records.values()];},
    reset(){lastTime=null;lastPosition=null;speed=0;action=null;held=false;worn=false;inventoryMode=false;handItem=leftItem=null;for(const r of records.values()){r.prop.visible=false;for(const prop of r.items.values())prop.visible=false;}if(view)view.visible=false;},
    dispose(){view?.removeFromParent();for(const r of records.values()){r.prop.removeFromParent();r.grip.removeFromParent();r.face.removeFromParent();r.itemGrip.removeFromParent();r.leftGrip.removeFromParent();}records.clear();}
  };
}
