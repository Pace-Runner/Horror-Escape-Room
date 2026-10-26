import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** Portrait reveal target, reduced after the cutscene and gated by proximity. */
export function createStudyMirrorReflection({ glass, body, hollow = body, getCamera,
  getActorPose=()=>null,getHiddenObjects=()=>[] }) {
  const shader = {
    ...Reflector.ReflectorShader,
    vertexShader: Reflector.ReflectorShader.vertexShader
      .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 surfaceUv;')
      .replace('vUv = textureMatrix', 'surfaceUv = uv; vUv = textureMatrix'),
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec2 reflectionScale;
      varying vec4 vUv;
      varying vec2 surfaceUv;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 room = texture2DProj(tDiffuse, vec4(vUv.xy*reflectionScale,vUv.zw)).rgb;
        float edge = pow(max(abs(surfaceUv.x * 2.0 - 1.0), abs(surfaceUv.y * 2.0 - 1.0)), 14.0);
        vec2 cell = floor(surfaceUv * 160.0);
        float grain = fract(sin(dot(cell, vec2(127.1,311.7))) * 43758.5453);
        float fleck = step(0.9975, grain) * (0.15 + 0.85 * edge);
        room *= 0.97 - edge * 0.09 - fleck * 0.18;
        room = mix(room, vec3(0.13,0.12,0.09), edge * 0.04);
        gl_FragColor = vec4(room, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  const mirror = new Reflector(glass.geometry, { textureWidth: 1024, textureHeight: 2048,
    multisample: 0, clipBias: 0.003, shader });
  mirror.name = 'Study_Cutscene_Planar_Mirror';
  mirror.position.z = 0.0012;
  mirror.visible = false;
  mirror.castShadow = false;
  glass.add(mirror);
  const reflect = mirror.onBeforeRender;
  const renderTarget=mirror.getRenderTarget();
  mirror.material.uniforms.reflectionScale={value:new THREE.Vector2(1,1)};
  renderTarget.texture.minFilter=THREE.LinearFilter;
  renderTarget.texture.magFilter=THREE.LinearFilter;
  renderTarget.texture.generateMipmaps=false;
  let enabled = false, corrected = false, performanceTime = 0, cinematic = true;
  const floorOffsets = new WeakMap();
  // Measured separately from okabe_clean.glb and okabe.glb, then checked
  // face/chest-first in Chrome. Each imported shell already supplies its
  // facing correction; no extra yaw is needed for either file. Keep separate
  // entries and never infer a new half-turn from an animated head/eye pose.
  const localYaw=new Map([[body,0],[hollow,0]]);
  const frustum=new THREE.Frustum(),vp=new THREE.Matrix4();
  const worldEye=new THREE.Vector3(),worldMirror=new THREE.Vector3();
  const worldNormal=new THREE.Vector3(),viewDirection=new THREE.Vector3(),eyeOffset=new THREE.Vector3();
  const normalMatrix=new THREE.Matrix3();
  let frame=0,forceRefresh=true,lastVisibleTime=-Infinity,hasFrame=false;
  let quality={width:1024,height:2048,interval:1};

  // The real player rig is drawn only inside this nested reflection render.
  // It stays invisible to the first-person lens and keeps its normal state afterward.
  mirror.onBeforeRender = (renderer, scene, camera) => {
    if (!enabled || camera !== getCamera()) return;
    worldEye.setFromMatrixPosition(camera.matrixWorld);
    worldMirror.setFromMatrixPosition(mirror.matrixWorld);
    // Test the actual world plane before Reflector touches its texture matrix.
    // Invalid views retain both the last texture AND its matching projection.
    normalMatrix.getNormalMatrix(mirror.matrixWorld);
    worldNormal.set(0,0,1).applyMatrix3(normalMatrix).normalize();
    eyeOffset.subVectors(worldEye,worldMirror);
    camera.getWorldDirection(viewDirection);
    const planeDistance=eyeOffset.dot(worldNormal);
    if (planeDistance <= 0.025 || Math.abs(viewDirection.dot(worldNormal)) < 0.025
      || planeDistance / Math.max(eyeOffset.length(),0.001) < 0.015) {
      forceRefresh=true;
      return;
    }
    const distanceSq=worldEye.distanceToSquared(worldMirror);
    vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(vp);
    if(!frustum.intersectsObject(mirror))return;
    if(Math.abs(performanceTime-lastVisibleTime)>.12)forceRefresh=true;
    lastVisibleTime=performanceTime;
    const high=cinematic||distanceSq<2.25;
    const width=high?1024:512,height=high?2048:1024;
    const interval=high?1:distanceSq<16?2:6;
    if(quality.width!==width||quality.interval!==interval)forceRefresh=true;
    quality={width,height,interval};
    if(!forceRefresh&&hasFrame&&++frame%interval)return;
    forceRefresh=false;

    // Keep the viewer's projection untouched. Reflector reflects the world
    // eye, look target and up vector across the moving mirror's world plane,
    // then builds bias * projection * view * mirrorWorld projective coordinates.
    // Its standard oblique plane clips geometry behind the glass. Screen-space
    // corner crops are undefined when a corner crosses the eye/near plane.
    const actor = corrected ? hollow : body;
    const actorRoot = actor.refs.root;
    const shell = actorRoot.children[0];
    const shellPosition = shell?.position.clone(), shellRotation = shell?.rotation.clone();
    const actors = [...new Set([body,hollow])];
    const snapshots = actors.map(figure=>({figure,visible:figure.visible,correction:figure.correction,
      position:figure.refs.root.position.clone(),rotation:figure.refs.root.rotation.clone(),scale:figure.refs.root.scale.clone()}));
    const layers = mirror.camera.layers.mask;
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    const previousShadow = renderer.shadowMap.autoUpdate;
    const hidden=getHiddenObjects().map(object=>({object,visible:object.visible}));
    try {
      hidden.forEach(({object})=>{object.visible=false;});
      actors.forEach(figure=>{figure.visible=false;});
      actor.visible = true;
      actorRoot.scale.setScalar(1);
      actor.setCorrection(corrected ? 0 : 1);
      const pose=getActorPose();
      const position=pose?.position??camera.position;
      actor.setPosition(position.x, position.z);
      actorRoot.position.y = pose?.floorY??Math.max(0, camera.position.y - 1.6);
      const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      // Both actor roots share the player's heading. Normalize the Hollow's
      // presentation-facing offset inside its visual shell, never at the root.
      // A pure intended heading, shared by both identities. Never leave the
      // X/Z half-turns produced by XYZ quaternion -> Euler decomposition.
      actorRoot.rotation.set(0,pose?.yaw??rotation.y,0,'YXZ');
      actor.setSpeed(0); actor.setCrouch(0); actor.update(0);
      if(shell&&localYaw.get(actor))shell.rotateY(localYaw.get(actor));
      if (corrected) {
        const breath=Math.sin(performanceTime*1.35);
        actor.offsetBones?.({Spine:[0.055+breath*.004,0,0],Chest:[.035+breath*.006,0,.022],
          'Left shoulder':[.01,0,.012+breath*.003],'Right shoulder':[-.008,0,-.008],
          Head:[-.035,Math.sin(performanceTime*.5)*.005,.018]});
      }
      // Measure once per identity; compensate only the visual shell so both
      // roots stay at the same floor contact and the swap cannot hop vertically.
      if (shell) {
        if (!floorOffsets.has(actor)) {
          actor.group.updateMatrixWorld(true);
          actor.group.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.computeBoundingBox();});
          const box=new THREE.Box3().setFromObject(actor.group);
          floorOffsets.set(actor,box.isEmpty()?0:actorRoot.position.y-box.min.y);
        }
        shell.position.y+=floorOffsets.get(actor);
      }
      mirror.camera.layers.mask = camera.layers.mask;
      // One allocation for the mirror's lifetime. Lower tiers draw into a
      // smaller viewport of it: no setSize/dispose, no invalid black texture.
      renderTarget.viewport.set(0,0,width,height);
      renderTarget.scissor.set(0,0,width,height);renderTarget.scissorTest=true;
      reflect.call(mirror, renderer, scene, camera);
      mirror.material.uniforms.reflectionScale.value.set(width/renderTarget.width,height/renderTarget.height);
      hasFrame=true;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.xr.enabled = previousXr;
      renderer.shadowMap.autoUpdate = previousShadow;
      mirror.camera.layers.mask = layers;
      if (shell) { shell.position.copy(shellPosition);shell.rotation.copy(shellRotation); }
      for (const snapshot of snapshots) {
        const {figure,correction,position,rotation,scale,visible}=snapshot;
        figure.setCorrection(correction);
        figure.refs.root.scale.copy(scale);figure.refs.root.position.copy(position);figure.refs.root.rotation.copy(rotation);
        figure.update(0);figure.visible=visible;
      }
      hidden.forEach(({object,visible})=>{object.visible=visible;});
      mirror.visible = enabled;
    }
  };
  return {
    mirror,
    setEnabled(on) { if(enabled!==!!on)forceRefresh=true;enabled = !!on; mirror.visible = enabled; },
    setCorrected(on) { if(corrected!==!!on)forceRefresh=true;corrected = !!on; },
    setTime(seconds) { performanceTime=seconds; },
    setCinematic(on) {
      if(cinematic===!!on)return;
      cinematic=!!on;forceRefresh=true;
    },
    get enabled() { return enabled; },
    get quality() { return quality; },
    get hasFrame() { return hasFrame; },
    reset() { corrected=false;cinematic=false;enabled=true;mirror.visible=true;forceRefresh=true; },
    dispose() { enabled = false; mirror.removeFromParent(); mirror.dispose(); }
  };
}
