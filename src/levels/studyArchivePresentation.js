import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

let agedPaper = null;
function sharedAgedPaper() {
  if (agedPaper) return agedPaper;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(512, 512);
  let randomState = 91837;
  const random = () => ((randomState = Math.imul(randomState, 1664525) + 1013904223 >>> 0) / 4294967296);
  // Irregular broad age clouds, oxidised edges and worn corners; quiet at the text centre.
  const lattice = (x,y) => {
    let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  function mottling(x,y,scale) {
    const gx=x/scale, gy=y/scale, ix=Math.floor(gx), iy=Math.floor(gy);
    const fx=gx-ix, fy=gy-iy, u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
    return (lattice(ix,iy)*(1-u)+lattice(ix+1,iy)*u)*(1-v)
      +(lattice(ix,iy+1)*(1-u)+lattice(ix+1,iy+1)*u)*v;
  }
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const edgeDistance=Math.min(x, y, 511-x, 511-y);
    const irregularity=3*Math.sin(x*.19+y*.11)+2*Math.sin(y*.37-x*.07);
    const edge=Math.exp(-Math.max(0,edgeDistance+irregularity)/17);
    const corner=Math.exp(-Math.min(Math.hypot(x,y),Math.hypot(511-x,y),Math.hypot(x,511-y),Math.hypot(511-x,511-y))/38);
    const cloud=(mottling(x,y,79)-.5)*28+(mottling(x,y,23)-.5)*12;
    const grain=(random()-.5)*6;
    const crease=Math.exp(-Math.abs(y-315-Math.sin(x*.011)*3)/1.4)*3;
    const i=(y*512+x)*4;
    [191,170,132].forEach((base,c)=>{pixels.data[i+c]=base+cloud+grain-edge*(36+c*2)-corner*20-crease;});
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  for(let i=0;i<700;i++) {
    const x=random()*512,y=random()*512;
    ctx.strokeStyle=i%2?'rgba(93,76,46,.08)':'rgba(242,221,176,.12)';
    ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x+1+random()*3,y+random()*8);ctx.stroke();
  }
  for(const [x,y,radius,opacity] of [[36,72,76,.22],[473,416,94,.24],[249,476,58,.17],[285,188,88,.075]]) {
    const stain=ctx.createRadialGradient(x,y,0,x,y,radius);
    stain.addColorStop(0,`rgba(112,71,28,${opacity})`);stain.addColorStop(1,'rgba(112,71,28,0)');
    ctx.fillStyle=stain;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  // Most foxing gathers at the edges, away from the readable central area.
  for(let i=0;i<240;i++) {
    let x=random()*512,y=random()*512;
    if(i<190){const inset=4+Math.pow(random(),2)*45;
      switch(i%4){case 0:x=inset;break;case 1:x=512-inset;break;case 2:y=inset;break;default:y=512-inset;}}
    ctx.fillStyle=`rgba(114,72,28,${.07+random()*.12})`;
    ctx.beginPath();ctx.arc(x,y,.4+random()*1.4,0,Math.PI*2);ctx.fill();
  }
  const relief = new THREE.CanvasTexture(canvas);
  const color = new THREE.CanvasTexture(canvas); color.colorSpace = THREE.SRGBColorSpace;
  agedPaper = { canvas, relief, color };
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

/** Shared stock for printed records, loose notes and paper dressing. */
export function createArchivePaperMaterial(seed = 0) {
  const stock = sharedAgedPaper();
  return new THREE.MeshStandardMaterial({ map: stock.color,
    color: [0xd6c6a7, 0xcfc0a0, 0xdbcaab][seed % 3],
    roughness: 1, metalness: 0, emissive: 0, emissiveIntensity: 0,
    envMapIntensity: 0, vertexColors: false, toneMapped: true,
    bumpMap: stock.relief, bumpScale: 0.0003 });
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
  const material = createArchivePaperMaterial(seed); material.map = texture;
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, 0.003, 1, 0.0007), material);
  function write(lines) {
    const ink = canvas.getContext('2d');
    // Vary only the stock under the print, never the text or its alignment.
    ink.save(); ink.translate(seed % 2 ? w : 0, seed % 3 === 1 ? h : 0);
    ink.scale(seed % 2 ? -1 : 1, seed % 3 === 1 ? -1 : 1);
    ink.drawImage(stock.canvas, 0, 0, w, h); ink.restore();
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
