import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const STUDY_RUG = Object.freeze({ width: 9.2, depth: 7.2, x: -0.15, y: 0.004, z: -0.25 });

// Applied joinery only: original mirror plane, door slab and hinges stay authoritative.
function details(name) {
  const root = new THREE.Group(); root.name = name;
  root.userData.studyStaticDetails = true;
  return root;
}
function part(root, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = true;
  root.add(mesh); return mesh;
}
function timber(root, material, size, position) {
  return part(root, new RoundedBoxGeometry(...size, 1, 0.004), material, ...position);
}

export function dressStudyMirror(frame, glass, walnut, brass) {
  const root = details('Victorian_Mirror_Carved_Joinery'); frame.add(root);
  for (const side of [-1, 1]) {
    timber(root, walnut, [0.085, 1.96, 0.070], [side * 0.408, 1.075, 0.077]);
    timber(root, walnut, [0.10, 0.15, 0.09], [side * 0.408, 0.10, 0.077]);
    const column = new THREE.LatheGeometry([
      [0.023, 0], [0.029, 0.035], [0.019, 0.08], [0.015, 0.14],
      [0.015, 1.56], [0.022, 1.62], [0.028, 1.66], [0.028, 1.70]
    ].map(p => new THREE.Vector2(...p)), 10);
    part(root, column, walnut, side * 0.408, 0.23, 0.111);
    for (const y of [0.245, 1.94]) {
      const band = part(root, new THREE.TorusGeometry(0.024, 0.003, 4, 12), brass, side * 0.408, y, 0.111);
      band.rotation.x = Math.PI / 2;
    }
  }
  timber(root, walnut, [0.91, 0.095, 0.080], [0, 0.105, 0.078]);
  timber(root, walnut, [0.91, 0.105, 0.080], [0, 2.055, 0.078]);
  timber(root, walnut, [0.94, 0.035, 0.086], [0, 2.12, 0.080]);
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      [side * 0.36, 2.13, 0.09], [side * 0.24, 2.17, 0.09],
      [side * 0.12, 2.255, 0.09], [side * 0.055, 2.22, 0.09],
      [side * 0.095, 2.195, 0.09]
    ].map(p => new THREE.Vector3(...p)));
    part(root, new THREE.TubeGeometry(curve, 20, 0.014, 6, false), walnut, 0, 0, 0);
    const leaf = part(root, new THREE.SphereGeometry(1, 10, 6), walnut, side * 0.028, 2.235, 0.095);
    leaf.scale.set(0.035, 0.070, 0.017); leaf.rotation.z = -side * 0.32;
  }
  const boss = part(root, new THREE.SphereGeometry(1, 10, 6), brass, 0, 2.22, 0.117);
  boss.scale.set(0.018, 0.027, 0.008);
  // Roughness only: cloudy edges without covering the functional/reveal plane.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const edge = Math.max(Math.abs(x / 255.5 - 1), Math.abs(y / 255.5 - 1));
    const cloud = Math.sin(x * 0.037) * Math.cos(y * 0.027) * 0.018;
    const value = Math.round(255 * (0.10 + 0.40 * edge ** 12 + cloud));
    const i = (y * 512 + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  glass.material.roughnessMap = new THREE.CanvasTexture(canvas);
  glass.material.roughness = 1; glass.material.metalness = 0.92;
  glass.material.color.setHex(0xa9afa5); glass.material.needsUpdate = true;
}

export function dressFinalStudyExit(frontDoor, slab, walnut, brass) {
  const casing = details('Final_Exit_Heavy_Walnut_Casing'); frontDoor.add(casing);
  for (const side of [-1, 1]) {
    timber(casing, walnut, [0.16, 3.10, 0.12], [side * 1.02, 1.55, -0.045]);
    timber(casing, walnut, [0.21, 0.22, 0.15], [side * 1.02, 0.11, -0.045]);
    timber(casing, walnut, [0.045, 2.85, 0.025], [side * 1.02, 1.58, -0.117]);
  }
  timber(casing, walnut, [2.25, 0.14, 0.14], [0, 3.10, -0.050]);
  timber(casing, walnut, [2.33, 0.045, 0.16], [0, 3.195, -0.050]);
  const joinery = details('Final_Exit_Recessed_Panel_Mouldings'); slab.add(joinery);
  // Retain every counted panel and its layout; add mouldings around its recessed face.
  for (const panel of slab.children.filter(p => p.userData.finalExitPanel)) {
    const { width, height } = panel.geometry.parameters;
    panel.position.z = -0.049;
    for (const side of [-1, 1]) {
      timber(joinery, walnut, [0.025, height + 0.025, 0.022],
        [panel.position.x + side * width / 2, panel.position.y, -0.066]);
      timber(joinery, walnut, [width - 0.025, 0.025, 0.022],
        [panel.position.x, panel.position.y + side * height / 2, -0.066]);
    }
  }
  timber(joinery, brass, [0.066, 0.225, 0.012], [0.65, -0.12, -0.055]);
  const stem = part(joinery, new THREE.CylinderGeometry(0.012, 0.012, 0.045, 10), brass, 0.65, -0.10, -0.079);
  stem.rotation.x = Math.PI / 2;
  timber(joinery, brass, [0.14, 0.025, 0.026], [0.704, -0.10, -0.109]);
}
