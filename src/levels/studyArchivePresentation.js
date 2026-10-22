import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Archive cards only: handled stock, real thin edges, unchanged text interface. */
export function createArchiveRecord(width, height, seed = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = Math.min(512, Math.max(160, Math.round(384 * height / width)));
  const paper = document.createElement('canvas');
  paper.width = canvas.width; paper.height = canvas.height;
  const ctx = paper.getContext('2d'), w = paper.width, h = paper.height;
  const pixels = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const grain = ((x * 17 + y * 31 + seed * 13) % 19) / 19;
    const edge = Math.max(0, 1 - Math.min(x, y, w - 1 - x, h - 1 - y) / 28);
    [207, 192, 157].forEach((value, c) => { pixels.data[i + c] = value - edge * 25 + grain * 6; });
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.strokeStyle = '#ad9c79'; ctx.lineWidth = 1; ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.strokeStyle = 'rgba(101,81,50,.13)'; ctx.beginPath(); ctx.moveTo(17, h * .72); ctx.lineTo(w - 15, h * .72 + 1); ctx.stroke();
  for (const x of [22, w - 22]) {
    ctx.fillStyle = '#8e7959'; ctx.beginPath(); ctx.arc(x, 22, 3, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.003), new THREE.MeshBasicMaterial({ map: texture }));
  function write(lines) {
    const ink = canvas.getContext('2d'); ink.drawImage(paper, 0, 0);
    const font = Math.min(28, Math.max(18, Math.floor(h / 8)));
    ink.font = `${font}px Georgia, serif`; ink.textAlign = 'center'; ink.textBaseline = 'middle';
    const rows = [];
    for (const line of lines) {
      let row = '';
      for (const word of String(line).split(/\s+/)) {
        const next = row ? `${row} ${word}` : word;
        if (row && ink.measureText(next).width > w - 44) { rows.push(row); row = word; }
        else row = next;
      }
      rows.push(row);
    }
    const spacing = Math.min(font * 1.55, (h - 58) / Math.max(1, rows.length));
    const first = (h - (rows.length - 1) * spacing) / 2;
    rows.forEach((row, index) => { ink.fillStyle = index === 0 ? '#6e4030' : '#302b23'; ink.fillText(row, w / 2, first + index * spacing); });
    texture.needsUpdate = true;
  }
  return { mesh, write };
}

export function buildArchiveVisor(group, frame, lens, brass) {
  group.userData.studyStaticDetails = true;
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  for (const x of [-0.043, 0.043]) {
    const rim = add(new THREE.TorusGeometry(0.033, 0.006, 6, 24), frame, x);
    rim.scale.y = 0.82;
    const glass = add(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 20).rotateX(Math.PI / 2), lens, x, 0, 0.002);
    glass.scale.y = 0.82;
    const seal = add(new THREE.TorusGeometry(0.0295, 0.0015, 4, 24), brass, x, 0, 0.003);
    seal.scale.y = 0.82;
  }
  add(new RoundedBoxGeometry(0.028, 0.010, 0.012, 1, 0.004), frame, 0, 0.007, -0.002);
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.007, 0.007, 0.016, 8), brass, side * 0.081, 0, -0.006);
    const arm = add(new RoundedBoxGeometry(0.010, 0.012, 0.105, 1, 0.004), frame, side * 0.080, 0, -0.064);
    arm.rotation.y = side * 0.035;
    add(new THREE.SphereGeometry(0.007, 8, 5), frame, side * 0.078, 0, -0.117);
  }
}

// Decorative only: original record targets and moving panels remain their parents.
export function createArchivePresentation(wood, brass) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const recess = new THREE.MeshStandardMaterial({ color: 0x201b16, roughness: 1 });
  function timber(parent, x, y, z, w, h, d, material = wood) {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function frame(parent, x, y, z, w, h, thickness, depth) {
    for (const side of [-1, 1]) {
      timber(parent, x + side * (w - thickness) / 2, y, z, thickness, h, depth);
      timber(parent, x, y + side * (h - thickness) / 2, z, w - thickness * 2, thickness, depth);
    }
  }
  return {
    interior(parent, fitted = false) {
      // A closed carcass behind the original selectors, not a front cover.
      // All surfaces stay within the existing cabinet collider footprint.
      const cavity = new THREE.Group();
      cavity.name = 'ArchiveClosedInterior';
      parent.add(cavity);
      if (fitted) {
        cavity.userData.studyStaticDetails = true;
        // A liner and fitted shelves only: do not duplicate the GLB carcass.
        timber(cavity, 0, 1.04, -0.17, 1.32, 1.72, 0.018);
        timber(cavity, 0, 0.96, 0.025, 1.32, 0.028, 0.35);
        timber(cavity, 0, 0.603, 0.055, 0.62, 0.025, 0.34);
        for (const x of [-0.043, 0.043]) timber(cavity, x, 0.632, 0.20, 0.04, 0.032, 0.064, recess);
        timber(cavity, 0, 0.645, 0.09, 0.18, 0.058, 0.025, recess);
        return;
      }
      timber(cavity, 0, 1.13, -0.215, 1.55, 2.20, 0.035);
      for (const x of [-0.755, 0.755]) {
        timber(cavity, x, 1.13, -0.005, 0.04, 2.20, 0.43);
      }
      for (const y of [0.05, 2.21]) {
        timber(cavity, 0, y, -0.005, 1.47, 0.04, 0.43);
      }
      // Dark interior lining and a shallow shelf divide records from the reward recess.
      timber(cavity, 0, 1.13, -0.192, 1.46, 2.12, 0.008, recess);
      timber(cavity, 0, 0.90, -0.015, 1.47, 0.03, 0.40);
    },
    records(parent, faceZ, height, fitted = false) {
      const fixture = new THREE.Group();
      fixture.name = 'RecessedArchiveRecordMounts';
      parent.add(fixture);
      if (fitted) {
        fixture.userData.studyStaticDetails = true;
        for (const x of [-0.46, 0, 0.46]) {
          timber(fixture, x, 1.3, faceZ - 0.026, 0.424, 0.54, 0.020, recess);
          frame(fixture, x, 1.3, faceZ - 0.003, 0.444, 0.56, 0.014, 0.024);
          timber(fixture, x, 1.575, faceZ + 0.005, 0.055, 0.012, 0.012, brass);
          // Top clue cards fit below the door opening, in their own slots.
          frame(fixture, x, 1.72, 0.236, 0.432, 0.228, 0.010, 0.014);
          timber(fixture, x, 1.72, 0.222, 0.412, 0.208, 0.010, recess);
        }
        return;
      }
      // Three individual pockets, returned cheeks and an overhanging cornice.
      for (const x of [-0.46, 0, 0.46]) {
        timber(fixture, x, 1.3, faceZ - 0.052, 0.45, height + 0.055, 0.07, recess);
        frame(fixture, x, 1.3, faceZ - 0.025, 0.454, height + 0.06, 0.012, 0.035);
        timber(fixture, x, 1.3 + height / 2 + 0.012, faceZ - 0.006, 0.07, 0.014, 0.012, brass);
      }
      for (const x of [-0.72, 0.72]) timber(fixture, x, 1.3, faceZ - 0.16, 0.055, height + 0.18, 0.28);
      timber(fixture, 0, 1.3 + height / 2 + 0.075, faceZ - 0.105, 1.52, 0.055, 0.24);
      timber(fixture, 0, 1.3 - height / 2 - 0.065, faceZ - 0.105, 1.49, 0.045, 0.24);
    },
    door(panel, height) {
      // Raised joinery follows the existing sliding mesh, including reset/open state.
      frame(panel, 0, 0, 0.031, 1.28, height - 0.12, 0.032, 0.016);
      timber(panel, 0, -0.18, 0.031, 1.22, 0.035, 0.016);
      frame(panel, 0, (height / 2 - 0.21) / 2, 0.027, 1.10, height / 2 - 0.19, 0.014, 0.01);
    },
    memoryDoor(panel) {
      // Batched raised joinery and tiny worn-edge cuts, following the old hinge.
      const details = new THREE.Group(); details.userData.studyStaticDetails = true; panel.add(details);
      frame(details, 0, 0, 0.034, 0.64, 1.60, 0.025, 0.014);
      for (const y of [-0.39, 0.39]) {
        frame(details, 0, y, 0.029, 0.54, 0.66, 0.014, 0.009);
      }
      timber(details, 0, 0, 0.035, 0.60, 0.045, 0.015);
      for (const y of [-0.64, 0.61]) {
        timber(details, -0.29, y, 0.043, 0.022, 0.003, 0.002, recess);
        timber(details, 0.29, y - 0.02, 0.043, 0.018, 0.002, 0.002, recess);
      }
    },
    marker(marker) {
      // Back fixed to the wall; stepped walnut molding surrounds the original plaque.
      timber(marker, 0, 0, -0.055, 0.75, 0.71, 0.075);
      frame(marker, 0, 0, 0.009, 0.73, 0.69, 0.035, 0.065);
      timber(marker, 0, 0.365, -0.025, 0.79, 0.035, 0.12);
      for (const x of [-0.337, 0.337]) timber(marker, x, -0.29, 0.049, 0.012, 0.012, 0.008, brass);
    }
  };
}
