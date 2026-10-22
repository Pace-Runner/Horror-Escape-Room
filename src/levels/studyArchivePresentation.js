import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

let agedPaper = null;
function sharedAgedPaper() {
  if (agedPaper) return agedPaper;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  let randomState = 91837;
  const random = () => ((randomState = Math.imul(randomState, 1664525) + 1013904223 >>> 0) / 4294967296);
  // Multiscale stock mottling, irregular fibres and a gently oxidised perimeter.
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const edge = Math.exp(-Math.min(x, y, 511 - x, 511 - y) / 19);
    const cloud = Math.sin(x * .023 + Math.sin(y * .017)) * 2.4 + Math.cos(y * .041 + x * .009) * 1.6;
    const grain = (random() - .5) * 9;
    const crease = Math.exp(-Math.abs(y - 315 - Math.sin(x * .011) * 3) / 1.7) * 5;
    const i = (y * 512 + x) * 4;
    [195, 181, 153].forEach((base, c) => { pixels.data[i + c] = base + cloud + grain - edge * 21 - crease; });
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 700; i++) {
    const x = random() * 512, y = random() * 512;
    ctx.strokeStyle = i % 2 ? 'rgba(93,76,46,.09)' : 'rgba(245,231,193,.16)';
    ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 1 + random() * 3, y + random() * 10); ctx.stroke();
  }
  for (const [x, y, radius] of [[65,105,85], [420,370,105], [265,460,62]]) {
    const stain = ctx.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, 'rgba(111,78,34,.10)'); stain.addColorStop(1, 'rgba(111,78,34,0)');
    ctx.fillStyle = stain; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  // Sparse foxing stays faint enough to leave printed records legible.
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = `rgba(106,75,39,${.04 + random() * .06})`;
    ctx.beginPath(); ctx.arc(random() * 512, random() * 512, .35 + random() * 1.1, 0, Math.PI * 2); ctx.fill();
  }
  const relief = new THREE.CanvasTexture(canvas);
  agedPaper = { canvas, relief };
  return agedPaper;
}

export function createVisorGlassMap() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const tint = ctx.createRadialGradient(64, 64, 14, 64, 64, 64);
  tint.addColorStop(0, 'rgba(103,181,205,0.38)');
  tint.addColorStop(0.72, 'rgba(62,137,165,0.48)');
  tint.addColorStop(1, 'rgba(24,66,85,0.78)');
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Archive cards only: handled stock, real thin edges, unchanged text interface. */
export function createArchiveRecord(width, height, seed = 0, typography = {}) {
  const canvas = document.createElement('canvas');
  // Match the physical insert aspect, including the wide header; never stretch type.
  const texelsPerUnit = 512 / Math.max(width, height);
  canvas.width = Math.round(width * texelsPerUnit); canvas.height = Math.round(height * texelsPerUnit);
  const stock = sharedAgedPaper();
  const w = canvas.width, h = canvas.height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, 0.003, 1, 0.0007),
    new THREE.MeshStandardMaterial({ map: texture, color: seed % 2 ? 0xece3cf : 0xf0e6d2,
      roughness: 0.98, metalness: 0, emissive: 0,
      bumpMap: stock.relief, bumpScale: 0.00012 }));
  function write(lines) {
    const ink = canvas.getContext('2d'); ink.drawImage(stock.canvas, 0, 0, w, h);
    const stain = ink.createRadialGradient(w * (0.24 + seed % 3 * 0.16), h * 0.68, 0,
      w * 0.5, h * 0.68, w * 0.48);
    stain.addColorStop(0, `rgba(129,105,62,${0.035 + seed % 3 * 0.008})`);
    stain.addColorStop(1, 'rgba(129,105,62,0)');
    ink.fillStyle = stain; ink.fillRect(0, 0, w, h);
    if (typography.folded) {
      ink.strokeStyle = 'rgba(95,73,44,.14)'; ink.lineWidth = 1;
      for (const y of [h * .16, h * .84]) {
        ink.beginPath(); ink.moveTo(16, y); ink.lineTo(w - 16, y + 1); ink.stroke();
      }
    }
    const font = typography.fontSize ?? Math.min(28, Math.max(18, Math.floor(h / 8)));
    ink.font = `${typography.fontStyle ?? ''} ${font}px "${typography.fontFamily ?? 'Georgia'}", serif`; ink.textAlign = 'center'; ink.textBaseline = 'middle';
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
    const spacing = Math.min(font * 1.55, (h - (typography.paddingY ?? 29) * 2) / Math.max(1, rows.length));
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
    interior(parent, fitted = false, visorStand = true) {
      // A closed carcass behind the original selectors, not a front cover.
      // All surfaces stay within the existing cabinet collider footprint.
      const cavity = new THREE.Group();
      cavity.name = 'ArchiveClosedInterior';
      parent.add(cavity);
      if (fitted) {
        cavity.userData.studyStaticDetails = true;
        // Solid side returns bridge the shell-to-door reveal (the door rear is z=.2675).
        // Overlap hidden shell edges; stay outside the .682-wide record mounts.
        for (const side of [-1, 1]) timber(cavity, side * 0.744, 1.13, 0.035, 0.088, 2.10, 0.48);
        // Cap the reveal from above/below as well, without moving the hinged leaves.
        for (const y of [0.105, 2.165]) timber(cavity, 0, y, 0.249, 1.40, 0.05, 0.052);
        // Existing liner and shelves remain independent of rewards and doors.
        timber(cavity, 0, 1.04, -0.17, 1.32, 1.72, 0.018);
        timber(cavity, 0, 0.96, 0.025, 1.32, 0.028, 0.35);
        if (visorStand) {
          timber(cavity, 0, 0.603, 0.055, 0.62, 0.025, 0.34);
          for (const x of [-0.043, 0.043]) timber(cavity, x, 0.632, 0.20, 0.04, 0.032, 0.064, recess);
          timber(cavity, 0, 0.645, 0.09, 0.18, 0.058, 0.025, recess);
        }
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
    records(parent, faceZ, height, fitted = false, topClues = true) {
      const fixture = new THREE.Group();
      fixture.name = 'RecessedArchiveRecordMounts';
      parent.add(fixture);
      if (fitted) {
        fixture.userData.studyStaticDetails = true;
        for (const x of [-0.46, 0, 0.46]) {
          timber(fixture, x, 1.3, faceZ - 0.026, 0.424, height - 0.02, 0.020, recess);
          frame(fixture, x, 1.3, faceZ - 0.003, 0.444, height, 0.014, 0.024);
          timber(fixture, x, 1.3 + height / 2 - 0.005, faceZ + 0.005, 0.055, 0.012, 0.012, brass);
          // Top clue cards fit below the door opening, in their own slots.
          if (topClues) {
            frame(fixture, x, 1.72, 0.236, 0.432, 0.228, 0.010, 0.014);
            timber(fixture, x, 1.72, 0.222, 0.412, 0.208, 0.010, recess);
          }
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
    memoryDoor(panel, height = 1.7) {
      // Batched raised joinery and tiny worn-edge cuts, following the old hinge.
      const details = new THREE.Group(); details.userData.studyStaticDetails = true; panel.add(details);
      frame(details, 0, 0, 0.034, 0.64, height - 0.10, 0.025, 0.014);
      for (const y of [-(height - 0.14) / 4, (height - 0.14) / 4]) {
        frame(details, 0, y, 0.029, 0.54, height / 2 - 0.19, 0.014, 0.009);
      }
      timber(details, 0, 0, 0.035, 0.60, 0.045, 0.015);
      for (const y of [-height * 0.376, height * 0.359]) {
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
