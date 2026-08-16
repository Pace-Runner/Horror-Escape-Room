import * as THREE from 'three';

// All textures in this file are generated on <canvas> at runtime rather than
// loaded from image files. That keeps the repo self-contained (no binary
// assets to path correctly, no case-sensitivity traps once this is hosted
// on a case-sensitive Linux server) while still giving every surface real
// detail instead of a flat colour.

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function finish(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Bump maps are height data, not colour, so they're left in linear space
// (no sRGB tag) -- otherwise the renderer would gamma-decode grey values
// meant to be read literally as elevation.
function finishBump(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// Companion bump map for createWoodFloorTexture(): the plank seams read as
// grooves and the grain streaks get a little relief, so raking light from
// the bedroom's bulb/lightning actually catches the floor's structure
// instead of it reading as a flat painted plane.
export function createWoodFloorBumpTexture() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const planks = 8;
  const plankH = canvas.height / planks;
  for (let i = 0; i < planks; i++) {
    ctx.strokeStyle = 'rgba(120, 120, 120, 0.15)';
    for (let g = 0; g < 6; g++) {
      const y = i * plankH + Math.random() * plankH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += 32) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 4);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * plankH);
    ctx.lineTo(canvas.width, i * plankH);
    ctx.stroke();
  }
  return finishBump(canvas, 4, 4);
}

// Companion bump map for createPlasterWallTexture(): mostly fine noise
// (matching the colour map's grain) plus the same water-damage streaks
// recessed slightly, so the wall isn't perfectly flat under a grazing light.
export function createPlasterBumpTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    const x = Math.random() * canvas.width;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 30, canvas.height);
    ctx.lineWidth = 4 + Math.random() * 8;
    ctx.stroke();
  }
  return finishBump(canvas, 2, 2);
}

// Companion bump map for createConcreteTexture(): coarse noise plus deep
// grooves at the panel-seam lines, reading as poured concrete slabs
// rather than a flat grey plane once a light rakes across it.
export function createConcreteBumpTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 60;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.strokeStyle = 'rgba(15, 15, 15, 0.95)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (canvas.height / 4) * i + 4);
    ctx.lineTo(canvas.width, (canvas.height / 4) * i + 4);
    ctx.stroke();
  }
  return finishBump(canvas, 3, 3);
}

export function createWoodFloorTexture() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  const planks = 8;
  const plankH = canvas.height / planks;
  for (let i = 0; i < planks; i++) {
    const base = 58 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${base + 22}, ${base + 10}, ${base - 6})`;
    ctx.fillRect(0, i * plankH, canvas.width, plankH);
    // grain streaks
    ctx.strokeStyle = `rgba(30, 18, 10, 0.25)`;
    for (let g = 0; g < 6; g++) {
      const y = i * plankH + Math.random() * plankH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += 32) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 4);
      }
      ctx.stroke();
    }
    // plank seam
    ctx.strokeStyle = 'rgba(10, 6, 4, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * plankH);
    ctx.lineTo(canvas.width, i * plankH);
    ctx.stroke();
  }
  return finish(canvas, 4, 4);
}

export function createPlasterWallTexture(tint = '#8f8778') {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  // water-damage / grime streaks
  ctx.strokeStyle = 'rgba(20, 20, 16, 0.08)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    const x = Math.random() * canvas.width;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 30, canvas.height);
    ctx.lineWidth = 4 + Math.random() * 8;
    ctx.stroke();
  }
  return finish(canvas, 2, 2);
}

export function createConcreteTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#55564f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.strokeStyle = 'rgba(15, 15, 12, 0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (canvas.height / 4) * i + 4);
    ctx.lineTo(canvas.width, (canvas.height / 4) * i + 4);
    ctx.stroke();
  }
  return finish(canvas, 3, 3);
}

export function createScratchedMessageTexture(text = "DON'T LET IT OUT") {
  const canvas = makeCanvas(512, 256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-0.03);
  ctx.font = 'bold 46px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // scratched-into-wood look: dark gouge + faint highlight offset
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(text, 2, 3);
  ctx.fillStyle = 'rgba(210, 190, 160, 0.55)';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPolaroidTexture({ caption = 'PROJECT HOLLOW', date = 'JUNE 1987' } = {}) {
  const canvas = makeCanvas(256, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // photo area
  const pad = 16;
  const photoH = 210;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(pad, pad, canvas.width - pad * 2, photoH);
  // vignette + faint shadow figure
  const grad = ctx.createRadialGradient(
    canvas.width / 2, pad + photoH / 2, 10,
    canvas.width / 2, pad + photoH / 2, 140
  );
  grad.addColorStop(0, 'rgba(60,55,50,0.9)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(pad, pad, canvas.width - pad * 2, photoH);
  // gaunt silhouette
  ctx.fillStyle = 'rgba(15,13,12,0.95)';
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, pad + photoH / 2 - 20, 14, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(canvas.width / 2 - 10, pad + photoH / 2, 20, 70);
  // handwriting
  ctx.fillStyle = '#1c1a17';
  ctx.font = '18px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(caption, canvas.width / 2, pad + photoH + 34);
  ctx.font = 'italic 14px Georgia';
  ctx.fillText(date, canvas.width / 2, pad + photoH + 56);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPaperNoteTexture(lines = []) {
  const canvas = makeCanvas(300, 380);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8e0c8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  ctx.fillStyle = '#2b2620';
  ctx.font = '20px "Comic Sans MS", cursive';
  ctx.textAlign = 'left';
  let y = 46;
  lines.forEach((line) => {
    ctx.save();
    ctx.translate(20, y);
    ctx.rotate((Math.random() - 0.5) * 0.02);
    ctx.fillText(line, 0, 0, canvas.width - 40);
    ctx.restore();
    y += 34;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFamilyPhotoTexture({ scratchedFourth = false } = {}) {
  const canvas = makeCanvas(256, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8cfb8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3a3226';
  ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
  const figures = 4;
  const spacing = (canvas.width - 40) / figures;
  for (let i = 0; i < figures; i++) {
    const x = 30 + spacing * i + spacing / 2;
    ctx.fillStyle = '#c9b98f';
    ctx.beginPath();
    ctx.arc(x, 70, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 14, 86, 28, 60);
    if (scratchedFourth && i === figures - 1) {
      ctx.strokeStyle = 'rgba(10,10,10,0.9)';
      ctx.lineWidth = 3;
      for (let s = 0; s < 6; s++) {
        ctx.beginPath();
        ctx.moveTo(x - 20 + Math.random() * 10, 50 + Math.random() * 10);
        ctx.lineTo(x + 10 + Math.random() * 10, 150 - Math.random() * 10);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRugTexture({ base = '#5a2a28', accent = '#8a5a2a' } = {}) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
  // faint worn/frayed noise so it doesn't read as a flat vector rectangle
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHazardSignTexture(text = 'HIGH VOLTAGE') {
  const canvas = makeCanvas(256, 192);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c1a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const stripe = 24;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, 34);
  ctx.rect(0, canvas.height - 34, canvas.width, 34);
  ctx.clip();
  for (let x = -canvas.height; x < canvas.width + canvas.height; x += stripe * 2) {
    ctx.fillStyle = '#d8b32a';
    ctx.save();
    ctx.translate(x, 0);
    ctx.transform(1, 0, -0.6, 1, 0, 0);
    ctx.fillRect(0, -10, stripe, canvas.height + 20);
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = '#d8b32a';
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 50);
  ctx.lineTo(canvas.width / 2 - 34, 110);
  ctx.lineTo(canvas.width / 2 + 34, 110);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c1a12';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', canvas.width / 2, 100);
  ctx.fillStyle = '#e8d89a';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(text, canvas.width / 2, 132);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStickyNoteTexture(text) {
  const canvas = makeCanvas(200, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8c85a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2b2620';
  ctx.font = '18px "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  const words = text.split(' ');
  let line = '';
  let y = 40;
  words.forEach((w) => {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > 170) {
      ctx.fillText(line, canvas.width / 2, y);
      line = w + ' ';
      y += 24;
    } else {
      line = test;
    }
  });
  ctx.fillText(line, canvas.width / 2, y);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
