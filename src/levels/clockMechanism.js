import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function createBrassSigil() {
  const colorImage = document.createElement('canvas');
  const roughImage = document.createElement('canvas');
  colorImage.width = colorImage.height = roughImage.width = roughImage.height = 256;
  const colorContext = colorImage.getContext('2d');
  const roughContext = roughImage.getContext('2d');
  const colors = colorContext.createImageData(256, 256);
  const roughness = roughContext.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1;
    const edge = Math.min(1, Math.hypot(x - 128, y - 128) / 128);
    const patina = 0.91 - 0.16 * edge ** 4 + 0.055 * Math.sin(x * 0.045) * Math.cos(y * 0.033);
    [151, 129, 82].forEach((value, c) => { colors.data[i + c] = value * patina + grain * 5; });
    colors.data[i + 3] = 255;
    const rough = 179 + edge * 35 + grain * 5;
    roughness.data[i] = roughness.data[i + 1] = roughness.data[i + 2] = rough;
    roughness.data[i + 3] = 255;
  }
  colorContext.putImageData(colors, 0, 0);
  roughContext.putImageData(roughness, 0, 0);
  const map = new THREE.CanvasTexture(colorImage);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughImage);
  const brass = new THREE.MeshStandardMaterial({ map, roughnessMap, metalness: 0.72, roughness: 1 });
  const tarnish = brass.clone();
  tarnish.color.setHex(0x8a7957);

  // 10.5 cm medallion: bevel-like perimeter, engraved hollow triangle, and chapter cuts.
  const face = [new THREE.CylinderGeometry(0.0525, 0.0525, 0.008, 32).rotateX(Math.PI / 2)];
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    const mark = new THREE.BoxGeometry(0.0018, 0.006, 0.0012);
    mark.translate(0, 0.043, 0.0043).rotateZ(angle);
    face.push(mark);
  }
  const rim = new THREE.TorusGeometry(0.0495, 0.0015, 6, 32).translate(0, 0, 0.004);
  const crest = new THREE.RingGeometry(0.020, 0.026, 3).rotateZ(Math.PI / 2).translate(0, 0, 0.0042);
  const object = new THREE.Group();
  object.name = 'Brass_Sigil';
  object.add(new THREE.Mesh(mergeGeometries(face), brass));
  object.add(new THREE.Mesh(mergeGeometries([rim, crest]), tarnish));
  for (const geometry of [...face, rim, crest]) geometry.dispose();
  object.userData.triangleCount = object.children.reduce((count, mesh) => count + mesh.geometry.index.count / 3, 0);
  return object;
}

/** Physical presentation only. The study retains solution, inventory and reward authority. */
export function createClockMechanism({ woodMaterial, interiorMaterial, brassMaterial }) {
  const root = new THREE.Group();
  root.name = 'Clock_Lower_Compartment';
  root.position.set(0.153, 0.58, 0);
  root.rotation.y = Math.PI / 2;
  function box(parent, size, position, material, radius = 0.003) {
    const object = new THREE.Mesh(new RoundedBoxGeometry(...size, 1, radius), material);
    object.position.set(...position);
    parent.add(object);
    return object;
  }
  // Continuous cubby base meets the bottom of the lining and both side returns.
  // It is the floor of the compartment, with no separate pedestal or reward mount.
  box(root, [0.302, 0.25, 0.012], [0, 0, -0.220], interiorMaterial);
  const cubbyBase = box(root, [0.290, 0.012, 0.205], [0, -0.131, -0.117], interiorMaterial);
  cubbyBase.name = 'Clock_Cubby_Base';
  for (const side of [-1, 1]) {
    box(root, [0.012, 0.25, 0.205], [side * 0.151, 0, -0.117], interiorMaterial);
  }
  const doorPivot = new THREE.Group();
  doorPivot.name = 'Clock_Access_Door_Hinge';
  doorPivot.position.x = -0.1635;
  root.add(doorPivot);
  box(doorPivot, [0.327, 0.270, 0.028], [0.1635, 0, 0], woodMaterial, 0.005);
  box(doorPivot, [0.266, 0.212, 0.012], [0.1635, 0, 0.019], woodMaterial, 0.004);
  const latchStem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.016, 8), brassMaterial);
  latchStem.rotation.x = Math.PI / 2;
  latchStem.position.set(0.277, 0, 0.032);
  doorPivot.add(latchStem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), brassMaterial);
  knob.position.set(0.277, 0, 0.044);
  doorPivot.add(knob);
  for (const y of [-0.084, 0.084]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.034, 8), brassMaterial);
    pin.position.set(-0.1635, y, 0);
    root.add(pin);
  }
  const sigil = createBrassSigil();
  sigil.position.set(0, -0.121, -0.105);
  sigil.rotation.x = -Math.PI / 2;
  sigil.visible = false;
  root.add(sigil);
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });
  const duration = 0.8;
  const angle = THREE.MathUtils.degToRad(82);
  let elapsed = 0;
  return {
    root, doorPivot, sigil,
    get canCollect() { return elapsed >= duration * 0.85; },
    update(dt, solved) {
      if (!solved || elapsed >= duration) return;
      elapsed = Math.min(duration, elapsed + Math.max(0, dt));
      const t = elapsed / duration;
      doorPivot.rotation.y = -angle * t * t * (3 - 2 * t);
    },
    reset() {
      elapsed = 0;
      doorPivot.rotation.y = 0;
    }
  };
}
