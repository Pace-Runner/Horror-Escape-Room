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

export function studyLabel(width, height, metal = false, engraved = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.min(768, Math.max(128, Math.round(512 * height / width)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = engraved
    ? new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: 0.0007, metalness: 0.65, roughness: 0.58 })
    : new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  function write(lines) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.fillStyle = metal ? '#51422e' : '#bfb69f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = metal ? '#a18e69' : '#887b61'; ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    if (engraved) {
      const patina = ctx.createLinearGradient(0, 0, w, h);
      patina.addColorStop(0, '#746044'); patina.addColorStop(0.48, '#b49a66'); patina.addColorStop(1, '#665038');
      ctx.fillStyle = patina; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 3; ctx.strokeStyle = '#d0b681'; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.lineWidth = 1; ctx.strokeStyle = '#493a26'; ctx.strokeRect(14, 14, w - 28, h - 28);
      for (let y = 2; y < h; y += 3) {
        ctx.strokeStyle = `rgba(44,31,18,${0.025 + (y % 7) * 0.006})`;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y - 1); ctx.stroke();
      }
      for (const x of [23, w - 23]) for (const y of [23, h - 23]) {
        ctx.fillStyle = '#4b3926'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c3aa76'; ctx.beginPath(); ctx.moveTo(x - 2, y + 1); ctx.lineTo(x + 2, y - 1); ctx.stroke();
      }
    }
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
    wrapped.forEach((line, i) => {
      if (engraved) {
        ctx.fillStyle = '#d3bd89'; ctx.fillText(line, w / 2 + 0.7, first + i * spacing + 0.9);
        ctx.fillStyle = '#30251a';
      }
      ctx.fillText(line, w / 2, first + i * spacing);
    });
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
  part(parent, new RoundedBoxGeometry(0.258, 0.345, 0.028, 1, 0.012), wood, 0, 0, -0.088);
  part(parent, new THREE.TorusGeometry(0.083, 0.009, 5, 20), brass, 0, -0.025, 0.091);
  const collar = part(parent, new THREE.CylinderGeometry(0.065, 0.069, 0.026, 16), brass, 0, -0.025, 0.101);
  collar.rotation.x = Math.PI / 2;
  const knob = part(parent, new THREE.CylinderGeometry(0.052, 0.059, 0.032, 16), wood, 0, -0.025, 0.125);
  knob.rotation.x = Math.PI / 2;
  part(parent, new THREE.TorusGeometry(0.047, 0.004, 4, 20), brass, 0, -0.025, 0.143);
  part(parent, new RoundedBoxGeometry(0.009, 0.035, 0.005, 1, 0.002), brass, 0, -0.014, 0.146);
  for (const x of [-0.083, 0.083]) for (const y of [-0.119, 0.119]) {
    const screw = part(parent, new THREE.CylinderGeometry(0.007, 0.007, 0.003, 8), brass, x, y, 0.088);
    screw.rotation.x = Math.PI / 2;
  }
  const pointer = part(parent, new THREE.CircleGeometry(0.014, 3), brass, 0, 0.135, 0.092);
  pointer.rotation.z = -Math.PI / 2;
}

export function createCrestIndicatorGeometry() {
  const bar = new RoundedBoxGeometry(0.065, 0.58, 0.022, 1, 0.008);
  const pin = new THREE.CylinderGeometry(0.026, 0.026, 0.028, 10).rotateX(Math.PI / 2).translate(0, 0.245, 0.003);
  const pinTriangles = pin.toNonIndexed();
  const geometry = mergeGeometries([bar, pinTriangles]);
  bar.dispose(); pin.dispose(); pinTriangles.dispose();
  return geometry;
}

export function fillStudyKey(group, brass, override = false) {
  group.clear();
  group.userData.studyStaticDetails = true;
  if (!override) {
    const bow = part(group, new THREE.TorusGeometry(0.032, 0.006, 6, 24), brass, 0, 0.027);
    bow.scale.x = 0.82;
    part(group, new THREE.CylinderGeometry(0.007, 0.009, 0.125, 12), brass, 0, -0.055);
    for (const y of [-0.009, -0.022]) part(group, new THREE.CylinderGeometry(0.011, 0.011, 0.006, 12), brass, 0, y);
    const bit = new THREE.Shape();
    bit.moveTo(0, 0); bit.lineTo(0.046, 0); bit.lineTo(0.046, -0.009);
    bit.lineTo(0.030, -0.009); bit.lineTo(0.030, -0.017); bit.lineTo(0.046, -0.017);
    bit.lineTo(0.046, -0.027); bit.lineTo(0.019, -0.027); bit.lineTo(0.019, -0.021);
    bit.lineTo(0, -0.021); bit.closePath();
    part(group, new THREE.ExtrudeGeometry(bit, { depth: 0.012, bevelEnabled: true,
      bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, steps: 1 }), brass, 0, -0.089, -0.006);
    return;
  }
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
