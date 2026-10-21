import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Called after UV alignment. Only explicitly tagged, non-interactive details
// merge; animated pivots, leaf meshes and all gameplay targets keep identity.
export function batchStudyPuzzleDetails(root) {
  const groups = [];
  root.traverse(object => { if (object.userData.studyStaticDetails) groups.push(object); });
  for (const parent of groups) {
    const batches = new Map();
    for (const mesh of [...parent.children]) {
      if (!mesh.isMesh || mesh.children.length || Array.isArray(mesh.material)) continue;
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(geometry);
      parent.remove(mesh);
    }
    for (const [material, geometries] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.receiveShadow = true;
      parent.add(mesh);
      geometries.forEach(geometry => geometry.dispose());
    }
  }
}

// Presentation clock only. Puzzle state remains owned by studyLevel.
export function hingeMotion(hinges, axis = 'y', angle = Math.PI * 0.51, duration = 0.85) {
  let progress = 0;
  return {
    update(dt, open) {
      progress = THREE.MathUtils.clamp(progress + (open ? 1 : -1) * Math.max(0, dt) / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      hinges.forEach(([pivot, direction]) => { pivot.rotation[axis] = direction * angle * eased; });
    },
    isOpen: () => progress >= 0.9,
    reset() { progress = 0; hinges.forEach(([pivot]) => { pivot.rotation[axis] = 0; }); }
  };
}

export function studyLabel(width, height, metal = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.min(768, Math.max(128, Math.round(512 * height / width)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  function write(lines) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.fillStyle = metal ? '#51422e' : '#bfb69f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = metal ? '#a18e69' : '#887b61'; ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = metal ? '#e1d4b5' : '#29251e'; ctx.textAlign = 'center';
    const font = Math.min(29, Math.max(17, Math.floor(h / 7)));
    ctx.font = `${font}px Georgia, serif`;
    const wrapped = [];
    for (const line of lines) {
      let row = '';
      for (const word of String(line).split(/\s+/)) {
        const next = row ? `${row} ${word}` : word;
        if (row && ctx.measureText(next).width > w - 50) { wrapped.push(row); row = word; }
        else row = next;
      }
      wrapped.push(row);
    }
    const spacing = Math.min(font * 1.55, (h - 38) / Math.max(1, wrapped.length));
    const first = (h - (wrapped.length - 1) * spacing) / 2;
    ctx.textBaseline = 'middle';
    wrapped.forEach((line, i) => ctx.fillText(line, w / 2, first + i * spacing));
    texture.needsUpdate = true;
  }
  return { mesh, write };
}

function part(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

export function dressArchiveLeaf(leaf, width, height, wood, brass, hingeSide = -1) {
  leaf.userData.studyStaticDetails = true;
  for (const x of [-width / 2 + 0.045, width / 2 - 0.045]) {
    part(leaf, new THREE.BoxGeometry(0.025, height - 0.1, 0.018), wood, x, 0, 0.031);
  }
  for (const y of [-height / 2 + 0.045, 0, height / 2 - 0.045]) {
    part(leaf, new THREE.BoxGeometry(width - 0.1, 0.025, 0.018), wood, 0, y, 0.031);
  }
  for (const y of [-height * 0.32, height * 0.32]) {
    part(leaf, new THREE.BoxGeometry(0.045, 0.065, 0.016), brass, hingeSide * (width / 2 - 0.025), y, 0.032);
  }
}

export function dressCrestControl(parent, brass, wood) {
  parent.userData.studyStaticDetails = true;
  part(parent, new THREE.TorusGeometry(0.117, 0.012, 5, 16), brass, 0, 0, 0.072);
  const knob = part(parent, new THREE.CylinderGeometry(0.048, 0.054, 0.045, 12), wood, 0, 0, 0.118);
  knob.rotation.x = Math.PI / 2;
  part(parent, new THREE.BoxGeometry(0.012, 0.045, 0.008), brass, 0, 0.012, 0.145);
  const pointer = part(parent, new THREE.CircleGeometry(0.018, 3), brass, 0, 0.13, 0.09);
  pointer.rotation.z = -Math.PI / 2;
}

export function fillStudyKey(group, brass, override = false) {
  group.clear();
  group.userData.studyStaticDetails = true;
  const bow = part(group, new THREE.TorusGeometry(override ? 0.037 : 0.032, 0.007, 6, override ? 8 : 16), brass, 0, 0.027);
  if (override) bow.rotation.z = Math.PI / 8;
  part(group, new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), brass, 0, -0.055);
  part(group, new RoundedBoxGeometry(0.043, 0.025, 0.016, 1, 0.003), brass, 0.016, -0.102);
  for (const y of [-0.095, -0.112]) part(group, new THREE.BoxGeometry(0.013, 0.008, 0.018), brass, 0.043, y);
  part(group, new THREE.CylinderGeometry(0.013, 0.013, 0.012, 8), brass, 0, -0.015);
}

export function dressStudyDoor(parent, width, height, wood, brass, reverse = false) {
  const trim = new THREE.Group();
  trim.userData.studyStaticDetails = true;
  if (reverse) trim.rotation.y = Math.PI;
  parent.add(trim);
  for (const x of [-width / 2 + 0.065, width / 2 - 0.065]) {
    part(trim, new THREE.BoxGeometry(0.035, height - 0.10, 0.018), wood, x, 0, 0.057);
  }
  for (const y of [-height / 2 + 0.065, height / 2 - 0.065]) {
    part(trim, new THREE.BoxGeometry(width - 0.1, 0.035, 0.018), wood, 0, y, 0.057);
  }
  const handleX = (reverse ? -1 : 1) * (width / 2 - 0.16);
  part(trim, new RoundedBoxGeometry(0.075, 0.20, 0.018, 1, 0.008), brass, handleX, -0.15, 0.064);
  const knob = part(trim, new THREE.SphereGeometry(0.031, 10, 6), brass, handleX, -0.15, 0.102);
  knob.scale.z = 0.72;
}

export function dressFloorOrderClue(clue, index, material) {
  clue.userData.studyStaticDetails = true;
  const arc = part(clue, new THREE.RingGeometry(0.255, 0.266, 28, 1, 0.15, Math.PI * 1.65), material, 0, 0, 0.001);
  arc.rotation.z = 0.12;
  // A short tally and direction mark reinforces order without spelling out an answer.
  for (let i = 0; i <= index; i++) part(clue, new THREE.PlaneGeometry(0.025, 0.065), material, 0.34 + i * 0.045, -0.17, 0.003);
  const arrow = part(clue, new THREE.CircleGeometry(0.035, 3), material, 0, -0.32, 0.003);
  arrow.rotation.z = Math.PI / 2;
}
