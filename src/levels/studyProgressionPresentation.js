import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { studyLabel } from './studyPuzzlePresentation.js';

// Presentation only. Every copy shares this small, static card texture/material.
let cardMaterial;
function hollowCardMaterial() {
  if (cardMaterial) return cardMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 324;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c9c2ae'; ctx.fillRect(0, 0, 512, 324);
  ctx.strokeStyle = '#938c79'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 314);
  ctx.fillStyle = '#343735'; ctx.fillRect(24, 32, 464, 34);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 37px Arial'; ctx.fillText('PROJECT HOLLOW', 29, 111);
  ctx.font = '26px Arial'; ctx.fillText('OVERRIDE ACCESS', 30, 157);
  ctx.fillRect(30, 191, 452, 3);
  ctx.font = 'bold 24px monospace'; ctx.fillText('H-14', 30, 228);
  ctx.font = '19px monospace'; ctx.fillText('AUTHORIZED PERSONNEL', 30, 280);
  for (let i = 0; i < 42; i++) {
    const x = 340 + i * 3.2;
    ctx.fillRect(x, 211, i % 3 ? 1 : 2, 34);
  }
  // Sparse deterministic scuffs; no extra maps or per-frame canvas work.
  ctx.strokeStyle = 'rgba(239,230,204,.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 23; i++) {
    const x = (i * 97) % 500, y = (i * 71) % 320;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9 + i % 17, y - 2); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  cardMaterial = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.83 });
  return cardMaterial;
}

export function createHollowCard() {
  const card = new THREE.Group(); card.name = 'Project_HOLLOW_Access_Keycard';
  const edge = new THREE.MeshStandardMaterial({ color: 0xb2aa96, roughness: 0.88 });
  card.add(new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.054, 0.0014, 1, 0.0005), edge));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.0838, 0.0528), hollowCardMaterial());
  face.position.z = 0.00075; card.add(face);
  return card;
}

export function createHollowReader(faceZ) {
  const root = new THREE.Group(); root.name = 'Project_HOLLOW_Card_Reader';
  const casing = new THREE.MeshStandardMaterial({ color: 0x30332f, roughness: 0.85, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111411, roughness: 1 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.17, 0.028, 1, 0.005), casing);
  body.position.set(0, 0.025, faceZ + 0.014); root.add(body);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.091, 0.0015, 0.004), dark);
  slot.position.set(0, 0.1105, faceZ + 0.014); root.add(slot);
  const indicator = new THREE.Mesh(new THREE.CircleGeometry(0.004, 10),
    new THREE.MeshStandardMaterial({ color: 0x8d7944, emissive: 0x4c3914, emissiveIntensity: 0.4, roughness: 0.7 }));
  indicator.position.set(0.048, 0.071, faceZ + 0.0285); root.add(indicator);
  const label = studyLabel(0.117, 0.038, true, true);
  label.write(['PROJECT HOLLOW', 'ACCESS CONTROL']);
  label.mesh.position.set(0, -0.009, faceZ + 0.0285); root.add(label.mesh);
  const installedCard = createHollowCard();
  // Lower half enters the top slot; the branded upper half remains visible.
  installedCard.position.set(0, 0.112, faceZ + 0.014);
  installedCard.visible = false; root.add(installedCard);
  return { root, installedCard, setAuthorized(on) {
    indicator.material.color.setHex(on ? 0x70835c : 0x8d7944);
    indicator.material.emissive.setHex(on ? 0x263d17 : 0x4c3914);
  } };
}

export function createResealHandle(faceZ) {
  const root = new THREE.Group(); root.name = 'HOLLOW_Manual_Reseal_Rotary_Handle';
  root.position.set(0.085, 0.025, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x444740, metalness: 0.65, roughness: 0.75 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x171c19, roughness: 0.88 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.020, 16), steel);
  base.rotation.x = Math.PI / 2; base.position.z = faceZ + 0.010; root.add(base);
  const pivot = new THREE.Group(); pivot.position.z = faceZ + 0.032; root.add(pivot);
  const bar = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.230, 0.028, 1, 0.006), steel);
  pivot.add(bar);
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new RoundedBoxGeometry(0.038, 0.060, 0.041, 1, 0.008), grip);
    end.position.y = side * 0.092; pivot.add(end);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.030, 12), steel);
  hub.rotation.x = Math.PI / 2; pivot.add(hub);
  const label = studyLabel(0.155, 0.032, true, true);
  label.write(['TURN TO LOCK']); label.mesh.position.set(0, -0.160, faceZ + 0.002); root.add(label.mesh);
  return { root, pivot };
}

export function createPhysicalCrestTile(brass, inlay) {
  const tile = new THREE.Group(); tile.name = 'Shadow_Crest_Brass_Inlay_Tile';
  tile.add(new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.58, 0.022, 1, 0.006), brass));
  const stroke = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.51, 0.002, 1, 0.0008), inlay);
  stroke.position.z = 0.0105; tile.add(stroke);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.003, 10), brass);
  pin.rotation.x = Math.PI / 2; pin.position.set(0, 0.245, 0.012); tile.add(pin);
  return tile;
}
