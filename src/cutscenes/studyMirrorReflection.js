import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** One 512px planar room render, enabled only for the mirror beat. */
export function createStudyMirrorReflection({ glass, body, hollow = body, getCamera }) {
  const shader = {
    ...Reflector.ReflectorShader,
    vertexShader: Reflector.ReflectorShader.vertexShader
      .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 surfaceUv;')
      .replace('vUv = textureMatrix', 'surfaceUv = uv; vUv = textureMatrix'),
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      varying vec4 vUv;
      varying vec2 surfaceUv;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 room = texture2DProj(tDiffuse, vUv).rgb;
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
  const mirror = new Reflector(glass.geometry, { textureWidth: 512, textureHeight: 512,
    multisample: 0, clipBias: 0.003, shader });
  mirror.name = 'Study_Cutscene_Planar_Mirror';
  mirror.position.z = 0.0012;
  mirror.visible = false;
  mirror.castShadow = false;
  glass.add(mirror);
  const reflect = mirror.onBeforeRender;
  let enabled = false, corrected = false;

  // The real player rig is drawn only inside this nested reflection render.
  // It stays invisible to the first-person lens and keeps its normal state afterward.
  mirror.onBeforeRender = (renderer, scene, camera) => {
    if (!enabled || camera !== getCamera()) return;
    const actor = corrected ? hollow : body;
    const actorRoot = actor.refs.root;
    const actors = [...new Set([body,hollow])];
    const snapshots = actors.map(figure=>({figure,visible:figure.visible,correction:figure.correction,
      position:figure.refs.root.position.clone(),quaternion:figure.refs.root.quaternion.clone(),scale:figure.refs.root.scale.clone()}));
    const layers = mirror.camera.layers.mask;
    const previousTarget = renderer.getRenderTarget();
    const previousXr = renderer.xr.enabled;
    const previousShadow = renderer.shadowMap.autoUpdate;
    try {
      actors.forEach(figure=>{figure.visible=false;});
      actor.visible = true;
      actorRoot.scale.setScalar(1);
      actor.setCorrection(corrected ? 0 : 1);
      actor.setPosition(camera.position.x, camera.position.z);
      actorRoot.position.y = Math.max(0, camera.position.y - 1.6);
      const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      actor.setYaw(rotation.y + (corrected ? Math.PI : 0)); actor.setSpeed(0); actor.setCrouch(0); actor.update(0);
      mirror.camera.layers.mask = camera.layers.mask;
      reflect.call(mirror, renderer, scene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.xr.enabled = previousXr;
      renderer.shadowMap.autoUpdate = previousShadow;
      mirror.camera.layers.mask = layers;
      for (const snapshot of snapshots) {
        const {figure,correction,position,quaternion,scale,visible}=snapshot;
        figure.setCorrection(correction);
        figure.refs.root.scale.copy(scale);figure.refs.root.position.copy(position);figure.refs.root.quaternion.copy(quaternion);
        figure.update(0);figure.visible=visible;
      }
      mirror.visible = enabled;
    }
  };
  return {
    mirror,
    setEnabled(on) { enabled = !!on; mirror.visible = enabled; },
    setCorrected(on) { corrected = !!on; },
    get enabled() { return enabled; },
    dispose() { enabled = false; mirror.removeFromParent(); mirror.dispose(); }
  };
}
