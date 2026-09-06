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

// Converts a grayscale height canvas (as used for the bump maps below)
// into a tangent-space normal map by sampling the height gradient at each
// texel. This reads real light direction against the surface detail
// (raking light catches ridges/grooves correctly from any angle), which a
// bump map -- Three's cheaper single-channel approximation -- can't do as
// convincingly. Kept as a general-purpose converter so any of this file's
// procedural height canvases can get a matching normal map for free.
function heightToNormalMap(heightCanvas, strength = 1.5) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const heightAt = (x, y) => {
    const xi = (x + w) % w;
    const yi = (y + h) % h;
    return src[(yi * w + xi) * 4] / 255;
  };

  const out = makeCanvas(w, h);
  const outCtx = out.getContext('2d');
  const img = outCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength;
      const dy = (heightAt(x, y - 1) - heightAt(x, y + 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const idx = (y * w + x) * 4;
      img.data[idx] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  outCtx.putImageData(img, 0, 0);
  return out;
}

// Raw height canvas shared by createWoodFloorBumpTexture() and
// createWoodFloorNormalTexture(), so the bump and normal variants always
// agree on where the plank seams and grain actually are.
function buildWoodFloorHeightCanvas() {
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
  return canvas;
}

// Companion bump map for createWoodFloorTexture(): the plank seams read as
// grooves and the grain streaks get a little relief, so raking light from
// the bedroom's bulb/lightning actually catches the floor's structure
// instead of it reading as a flat painted plane.
export function createWoodFloorBumpTexture() {
  return finishBump(buildWoodFloorHeightCanvas(), 4, 4);
}

// Normal-map counterpart of the above -- swap this in wherever a surface
// needs the raking light from the bulb/lightning to actually rake, rather
// than the flatter bumpMap approximation.
export function createWoodFloorNormalTexture() {
  return finishBump(heightToNormalMap(buildWoodFloorHeightCanvas(), 2.2), 4, 4);
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

// stain darkens/deepens the wood tone (1 = original honey-brown pine, ~0.6
// gives the near-black stained hardwood look of a much older house) without
// changing anything for callers that don't pass it.
export function createWoodFloorTexture({ stain = 1 } = {}) {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  const planks = 8;
  const plankH = canvas.height / planks;
  for (let i = 0; i < planks; i++) {
    const base = 58 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${Math.round((base + 22) * stain)}, ${Math.round((base + 10) * stain)}, ${Math.round((base - 6) * stain)})`;
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

// Shared grayscale height canvas for the damask wallpaper: the motif is
// drawn once as raised luminance (lighter = embossed higher off the wall)
// so the colour texture and normal map below always agree on exactly
// where the pattern sits, instead of two independently-drawn approximations
// of each other.
function buildWallpaperHeightCanvas() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);

  // faint vertical undertone stripes, a classic Victorian wallpaper ground
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let x = 0; x < canvas.width; x += 34) {
    ctx.fillRect(x, 0, 4, canvas.height);
  }

  // one damask "fleur" motif, stamped on a diamond (offset) grid so it
  // tiles as a continuous repeating pattern
  function drawMotif(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';

    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i / 4) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(26, -20, 30, 0);
      ctx.quadraticCurveTo(26, 20, 0, 6);
      ctx.closePath();
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i / 4) * Math.PI * 2 + Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, -32, 4, -46);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  const cell = 128;
  for (let gy = -1; gy <= canvas.height / cell + 1; gy++) {
    for (let gx = -1; gx <= canvas.width / cell + 1; gx++) {
      const offsetX = gy % 2 === 0 ? 0 : cell / 2;
      drawMotif(gx * cell + offsetX, gy * cell);
    }
  }

  return canvas;
}

// Ornate damask wallpaper: a repeating embossed floral motif over a dark
// tinted ground, aged with the same kind of water-damage streaking as the
// plain plaster texture above. Colour is derived from the shared height
// canvas (raised = motif colour, recessed = base colour) so the visible
// pattern and its normal map (below) can never drift out of sync.
export function createDamaskWallpaperTexture({
  base = [20, 26, 21],
  motif = [58, 68, 46]
} = {}) {
  const height = buildWallpaperHeightCanvas();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const t = Math.min(Math.max((hData[i] - 70) / 110, 0), 1);
    out.data[i] = base[0] + (motif[0] - base[0]) * t;
    out.data[i + 1] = base[1] + (motif[1] - base[1]) * t;
    out.data[i + 2] = base[2] + (motif[2] - base[2]) * t;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // age/water-damage streaks over the finished pattern, sparser than bare
  // plaster since this is wallpaper left up for years, not an open wall
  ctx.strokeStyle = 'rgba(4, 4, 4, 0.18)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const x = Math.random() * canvas.width;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, canvas.height);
    ctx.lineWidth = 6 + Math.random() * 10;
    ctx.stroke();
  }

  return finish(canvas, 2, 2);
}

// Normal-map counterpart of createDamaskWallpaperTexture() -- makes the
// embossed motif actually catch the bedroom bulb/lightning at a raking
// angle instead of the pattern being flat paint on a flat wall.
export function createWallpaperNormalTexture() {
  return finishBump(heightToNormalMap(buildWallpaperHeightCanvas(), 1.8), 2, 2);
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

// Shared height canvas for the scratched floor message: instead of one
// crisp fillText() pass (which reads as typed, not carved), the glyph
// shape gets stamped many times with small random jitter/rotation/alpha,
// building up a ragged, uneven edge the way a shaking hand dragging
// something sharp actually would, plus a few stray overshoot scratches
// past the letters and a per-letter baseline wobble so the whole line
// doesn't sit dead straight.
function buildScratchedMessageHeightCanvas(text) {
  const W = 512;
  const H = 256;

  // Render the message ONCE, cleanly, to an offscreen source -- filling
  // or stroking the same glyph shape many times (tried both) always
  // averages back toward the font's own solid silhouette, which is
  // exactly the "too neat/typed" look this needs to avoid. Distorting
  // already-solid pixels per scanline afterward is what actually breaks
  // that up convincingly.
  const src = makeCanvas(W, H);
  const sctx = src.getContext('2d');
  sctx.save();
  sctx.translate(W / 2, H / 2);
  sctx.rotate(-0.03);
  sctx.font = 'bold 48px Georgia';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillStyle = '#fff';
  sctx.fillText(text, 0, 0);
  sctx.restore();
  const srcAlpha = sctx.getImageData(0, 0, W, H).data;
  const alphaAt = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : srcAlpha[(y * W + x) * 4 + 3]);

  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(W, H);

  // Per-scanline horizontal jitter (a slow wander plus per-row noise) so
  // each row of the letters is offset a little differently -- a hand
  // dragging something sharp doesn't cut a mathematically straight edge.
  // A handful of rows are dropped entirely (gaps where the point skipped)
  // and a handful are doubled/smeared (where it dragged unevenly).
  let wander = 0;
  for (let y = 0; y < H; y++) {
    wander += (Math.random() - 0.5) * 1.6;
    wander = Math.max(-5, Math.min(5, wander));
    const rowGap = Math.random() < 0.045;
    const rowSmear = Math.random() < 0.1 ? 2 + Math.random() * 3 : 0;
    for (let x = 0; x < W; x++) {
      let v = 0;
      if (!rowGap) {
        const shift = Math.round(wander);
        v = alphaAt(x - shift, y);
        if (rowSmear) v = Math.max(v, alphaAt(x - shift - Math.round(rowSmear), y));
      }
      const idx = (y * W + x) * 4;
      out.data[idx] = v;
      out.data[idx + 1] = v;
      out.data[idx + 2] = v;
      out.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  // random ragged notches bitten out of the letter edges
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = H / 2 + (Math.random() - 0.5) * 90;
    if (alphaAt(Math.round(x), Math.round(y)) < 40) continue;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // stray scratches overshooting past the letters, like the point skidded
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const x0 = Math.random() * W;
    const y0 = H / 2 + (Math.random() - 0.5) * 70;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + (Math.random() - 0.5) * 30, y0 + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }

  return canvas;
}

export function createScratchedMessageTexture(text = "DON'T LET IT OUT") {
  const height = buildScratchedMessageHeightCanvas(text);
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const t = hData[i] / 255;
    // dark gouge core with a faint pale highlight where the exposed wood
    // underneath would catch light, not a single flat fill colour
    const dark = Math.min(1, t * 1.4);
    out.data[i] = 8 + 60 * (1 - dark) * t * 0.4;
    out.data[i + 1] = 6 + 52 * (1 - dark) * t * 0.4;
    out.data[i + 2] = 4 + 40 * (1 - dark) * t * 0.4;
    out.data[i + 3] = Math.min(255, t * 300);
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Normal-map counterpart -- lets the gouge actually catch the bedroom
// bulb/lightning at a raking angle instead of being flat dark paint on
// the floor.
export function createScratchedMessageNormalTexture(text = "DON'T LET IT OUT") {
  return finishBump(heightToNormalMap(buildScratchedMessageHeightCanvas(text), 2.2));
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

/**
 * The family photograph, and the reveal the whole ending turns on.
 *
 * `figures` is 3 or 4, and the LAYOUT IS ALWAYS FOUR SLOTS. That is the entire
 * point: the three people who are there stand in identical positions in both
 * versions, so the four-figure print is unmistakably the same photograph with
 * someone added, rather than a differently-composed one. It also leaves a
 * conspicuous gap on the end of the three-figure print -- a space where a person
 * should be, which the player has no reason to think about until much later.
 *
 * This used to hardcode `const figures = 4` and only toggle the scratching out,
 * and BOTH the bedroom and the study passed scratchedFourth: true. So the
 * Level 1 -> Level 3 contrast the storyline builds its reveal on ("the same
 * family picture seen in the first room, this time with a 4th person, scratched
 * out with marker") did not exist in the game at all: both prints were already
 * the end state.
 *
 * Why the player cannot see the fourth without the visor: they are not missing
 * from the photograph, they are missing from the PLAYER. Broken sight cannot
 * resolve the scratched-out figure. The lenses correct that, exactly as they
 * correct everything else.
 */
export function createFamilyPhotoTexture({ figures = 3, scratchedFourth = false } = {}) {
  const canvas = makeCanvas(256, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8cfb8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3a3226';
  ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
  // Four slots, always. Only `figures` of them are occupied.
  const SLOTS = 4;
  const spacing = (canvas.width - 40) / SLOTS;
  const shown = Math.max(1, Math.min(SLOTS, figures));
  for (let i = 0; i < shown; i++) {
    const x = 30 + spacing * i + spacing / 2;
    ctx.fillStyle = '#c9b98f';
    ctx.beginPath();
    ctx.arc(x, 70, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 14, 86, 28, 60);
    if (scratchedFourth && i === SLOTS - 1) {
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

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Shared height canvas for the rug: a filled decorative border BAND
// (not just an outline) with a repeating diamond trim, four layers of
// nested central medallion, and quarter-medallions in the corners --
// modelled on a Persian-style layout rather than a single tinted
// rectangle with a thin double outline. Encoded as 5 distinct luminance
// levels (field / border band / trim motif / medallion ring / medallion
// core) so createRugTexture() below can map each one to its own colour,
// and the normal map gets real stepped relief between them.
function buildRugHeightCanvas() {
  const canvas = makeCanvas(384, 384);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const LEVEL = { field: 60, border: 130, trim: 175, ring: 205, core: 235 };

  ctx.fillStyle = `rgb(${LEVEL.field},${LEVEL.field},${LEVEL.field})`;
  ctx.fillRect(0, 0, w, h);

  const diamond = (x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  };

  const ring = (x0, y0, x1, y1, level) => {
    ctx.strokeStyle = `rgb(${LEVEL[level]},${LEVEL[level]},${LEVEL[level]})`;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  };

  // outer decorative border: a filled band plus several thinner alternating
  // pinstripes just inside it, closer to the layered multi-stripe borders
  // real Persian rugs use instead of one plain band.
  const bandOuter = 14;
  const bandInner = 60;
  ctx.fillStyle = `rgb(${LEVEL.border},${LEVEL.border},${LEVEL.border})`;
  ctx.fillRect(bandOuter, bandOuter, w - bandOuter * 2, h - bandOuter * 2);
  ctx.fillStyle = `rgb(${LEVEL.field},${LEVEL.field},${LEVEL.field})`;
  ctx.fillRect(bandInner, bandInner, w - bandInner * 2, h - bandInner * 2);

  ctx.lineWidth = 3;
  [[bandInner + 6, 'trim'], [bandInner + 13, 'ring'], [bandInner + 19, 'trim']].forEach(([inset, level]) => {
    ring(inset, inset, w - inset, h - inset, level);
  });

  // repeating diamond trim running around the border band
  ctx.fillStyle = `rgb(${LEVEL.trim},${LEVEL.trim},${LEVEL.trim})`;
  const step = 28;
  const bandMid = (bandOuter + bandInner) / 2;
  for (let x = bandInner; x <= w - bandInner; x += step) {
    diamond(x, bandMid, 8);
    diamond(x, h - bandMid, 8);
  }
  for (let y = bandInner; y <= h - bandInner; y += step) {
    diamond(bandMid, y, 8);
    diamond(w - bandMid, y, 8);
  }

  // a mini nested-medallion motif, reused for both the central medallion
  // (large) and the corner motifs (small) so the whole rug echoes one
  // design instead of the corners using a different, simpler shape
  const medallion = (x, y, scale, withPetals) => {
    [[100, 'ring'], [80, 'field'], [60, 'ring'], [40, 'trim']].forEach(([r, level]) => {
      ctx.fillStyle = `rgb(${LEVEL[level]},${LEVEL[level]},${LEVEL[level]})`;
      diamond(x, y, r * scale);
    });
    ctx.fillStyle = `rgb(${LEVEL.core},${LEVEL.core},${LEVEL.core})`;
    ctx.beginPath();
    ctx.arc(x, y, 16 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (withPetals) {
      // small petal flourishes poking out from the medallion's 4 points
      const petalR = 100 * scale;
      ctx.fillStyle = `rgb(${LEVEL.ring},${LEVEL.ring},${LEVEL.ring})`;
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
        ctx.save();
        ctx.translate(x + dx * petalR, y + dy * petalR);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.beginPath();
        ctx.moveTo(0, -10 * scale);
        ctx.quadraticCurveTo(22 * scale, 0, 0, 10 * scale);
        ctx.quadraticCurveTo(8 * scale, 0, 0, -10 * scale);
        ctx.fill();
        ctx.restore();
      });
    }
  };

  const cx = w / 2;
  const cy = h / 2;
  medallion(cx, cy, 1, true);

  // quarter-medallions in the corners, now a scaled-down echo of the
  // central medallion (with its own petals) instead of a plain diamond
  [[bandInner + 40, bandInner + 40], [w - bandInner - 40, bandInner + 40],
    [bandInner + 40, h - bandInner - 40], [w - bandInner - 40, h - bandInner - 40]].forEach(([x, y]) => {
    medallion(x, y, 0.34, true);
  });

  // fine woven-pile noise over everything, so no band reads as flat vector fill
  const imgData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas;
}

// An ornate Persian-style area rug (filled border band with a diamond
// trim, nested central medallion, corner motifs) instead of a plain
// tinted rectangle with a thin outline -- colour is derived from the
// shared height canvas above (5 bands -> 5 colours) so the pattern and
// its normal map (below) always line up.
export function createRugTexture({
  base = '#6e1f1f',
  border = '#16303c',
  trim = '#e8dcc0',
  ring = '#7a1414',
  core = '#c9a13a'
} = {}) {
  const palette = [hexToRgb(base), hexToRgb(border), hexToRgb(trim), hexToRgb(ring), hexToRgb(core)];
  const thresholds = [45, 100, 150, 190, 255];

  const height = buildRugHeightCanvas();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const v = hData[i];
    let band = 0;
    while (band < thresholds.length - 1 && v > thresholds[band]) band++;
    const [r, g, b] = palette[band];
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Normal-map counterpart of createRugTexture() -- the pile/pattern
// actually catches the bedroom bulb/lightning at a raking angle instead
// of being flat paint on a flat plane.
export function createRugNormalTexture() {
  return finishBump(heightToNormalMap(buildRugHeightCanvas(), 1.1));
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

// Shared height canvas for a set of claw/scratch marks -- 4 curved,
// tapering gouges (like fingers dragged down a wall) plus 2-3 shorter
// stray marks, drawn as raised streaks so the colour and normal-map
// versions below always agree on where the gouges actually are. The
// storyline calls for these ("signs that something violent may have
// happened", and the same marks reappearing in the Level 2 basement).
function buildClawMarksHeightCanvas() {
  const canvas = makeCanvas(384, 384);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const startX = 70 + Math.random() * 40;
  const startY = 40 + Math.random() * 30;
  const spacing = 34 + Math.random() * 8;
  const length = 220 + Math.random() * 60;

  for (let i = 0; i < 4; i++) {
    const x0 = startX + i * spacing + (Math.random() - 0.5) * 8;
    const y0 = startY + (Math.random() - 0.5) * 10;
    const dx = (Math.random() - 0.5) * 30;
    const dy = length + Math.random() * 30;
    const midX = x0 + dx * 0.5 + (Math.random() - 0.5) * 14;
    const midY = y0 + dy * 0.5;

    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    // tapering width: draw several overlapping strokes narrowing toward the tail
    for (let seg = 0; seg < 10; seg++) {
      const t0 = seg / 10;
      const t1 = (seg + 1) / 10;
      const w = 6 * (1 - t0) + 0.6;
      ctx.globalAlpha = 0.75 * (1 - t0 * 0.5);
      ctx.lineWidth = w;
      ctx.beginPath();
      const p0 = quadPoint(x0, y0, midX, midY, x0 + dx, y0 + dy, t0);
      const p1 = quadPoint(x0, y0, midX, midY, x0 + dx, y0 + dy, t1);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  function quadPoint(x0, y0, cx, cy, x1, y1, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
      y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1
    };
  }

  return canvas;
}

// Colour + alpha version -- a dark gouge with a faint torn-highlight edge,
// same "scratched into the surface" look as createScratchedMessageTexture,
// meant to sit on top of a wall/wood texture with alpha blending rather
// than replacing it.
export function createClawMarksTexture() {
  const height = buildClawMarksHeightCanvas();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const t = hData[i] / 255;
    out.data[i] = 10;
    out.data[i + 1] = 8;
    out.data[i + 2] = 6;
    out.data[i + 3] = Math.min(255, t * 235);
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Normal-map counterpart -- lets the gouges actually catch the bedroom
// bulb/lightning at a raking angle instead of being flat dark paint.
export function createClawMarksNormalTexture() {
  return finishBump(heightToNormalMap(buildClawMarksHeightCanvas(), 2.5));
}

// General-purpose wood grain for the Blender-authored furniture (bed
// frame, dresser, door -- see blender/build_*.py) -- those exports only
// ever carried a flat PBR colour with no map at all (bmesh.ops never
// creates UV data, so there was nothing to put a texture on), unlike the
// floor/walls/fabric which all have real canvas textures. This is grain
// streaks only, no plank seams (createWoodFloorTexture's are specific to
// flooring), tileable at real-world scale to match the UV density the
// Blender scripts now bake in (2.2 units/metre, see common.py).
function buildFurnitureWoodHeightCanvas() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(130, 130, 130, 0.22)';
  for (let g = 0; g < 26; g++) {
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 22) {
      ctx.lineTo(x, y + (Math.random() - 0.5) * 7);
    }
    ctx.lineWidth = 1 + Math.random();
    ctx.stroke();
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function createFurnitureWoodTexture({ tint = [60, 44, 30] } = {}) {
  const height = buildFurnitureWoodHeightCanvas();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const t = hData[i] / 255;
    const shade = 0.72 + t * 0.5;
    out.data[i] = Math.min(255, tint[0] * shade);
    out.data[i + 1] = Math.min(255, tint[1] * shade);
    out.data[i + 2] = Math.min(255, tint[2] * shade);
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  // repeat left at 1,1 -- the mesh's own UVs (baked in Blender at a fixed
  // units-per-metre density) already control real-world tiling scale
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createFurnitureWoodNormalTexture() {
  const canvas = heightToNormalMap(buildFurnitureWoodHeightCanvas(), 1.3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// A cobweb fanned out from one corner of its plane -- radial spokes plus
// irregular connecting rings, transparent everywhere else. Meant for a
// PlaneGeometry tucked into a room's ceiling corner: classic cheap detail
// for "nobody's cleaned this house in a long time" that a normal-mapped
// wall/floor pass doesn't cover on its own.
export function createCobwebTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = 4;
  const cy = 4;
  const maxR = 350;
  const spokeCount = 6 + Math.floor(Math.random() * 2);
  const angles = [];
  ctx.strokeStyle = 'rgba(225, 222, 208, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < spokeCount; i++) {
    const a = (Math.PI / 2) * (i / (spokeCount - 1)) + (Math.random() - 0.5) * 0.08;
    angles.push(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
    ctx.stroke();
  }

  const rings = 6;
  for (let r = 1; r <= rings; r++) {
    const radius = (r / rings) * maxR * (0.8 + Math.random() * 0.25);
    ctx.beginPath();
    angles.forEach((a, i) => {
      const rr = radius * (0.85 + Math.random() * 0.25);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.globalAlpha = 0.4 + Math.random() * 0.3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A curled, torn wallpaper flap with a jagged bottom edge and exposed
// grey plaster showing through beneath it -- meant to sit slightly
// proud of/tilted off the wall it's placed on (see bedroomLevel.js) so it
// reads as peeling away rather than a flat sticker.
export function createPeelingWallpaperTexture({ paperColor = [20, 26, 21] } = {}) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Transparent everywhere except the flap itself -- the actual wall
  // (with its own real damask pattern) sits directly behind this mesh
  // and shows through, so there's no need to fake plaster underneath;
  // faking it as an opaque grey rectangle is what read as an obvious
  // sticker before. paperColor defaults to the same base tone
  // createDamaskWallpaperTexture() uses, so the flap actually matches
  // the wall it's supposedly peeling off of.
  const [pr, pg, pb] = paperColor;

  // organic torn edge: a wandering boundary, not a repeating sawtooth
  const edgePts = [];
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = 8 + t * 240;
    const y = 140 + Math.sin(t * 9 + 1.7) * 14 + (Math.random() - 0.5) * 26;
    edgePts.push([x, y]);
  }

  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.lineTo(248, 10);
  ctx.lineTo(248, edgePts[edgePts.length - 1][1]);
  for (let i = edgePts.length - 1; i >= 0; i--) ctx.lineTo(edgePts[i][0], edgePts[i][1]);
  ctx.closePath();
  ctx.clip();

  const grad = ctx.createLinearGradient(0, 10, 0, 190);
  grad.addColorStop(0, `rgb(${pr},${pg},${pb})`);
  grad.addColorStop(0.75, `rgb(${pr},${pg},${pb})`);
  grad.addColorStop(1, `rgb(${Math.max(0, pr - 18)},${Math.max(0, pg - 18)},${Math.max(0, pb - 18)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // faint water-stain blotches and grain noise on the flap itself
  for (let i = 0; i < 5; i++) {
    const x = 30 + Math.random() * 200;
    const y = 30 + Math.random() * 110;
    const r = 14 + Math.random() * 22;
    const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, 'rgba(8,8,4,0.28)');
    spot.addColorStop(1, 'rgba(8,8,4,0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] === 0) continue;
    const n = (Math.random() - 0.5) * 14;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);

  // dark shadow line right at the torn edge -- sells the paper lifting
  // away from the wall instead of lying flush
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(edgePts[0][0], edgePts[0][1]);
  edgePts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.stroke();

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

// Shared grayscale height canvas for quilted/tufted fabric (mattress,
// blanket): soft puffiness bulging between grid points with the
// stitch/seam lines recessed at the grid itself, so the colour texture
// and normal map below agree on exactly where the fabric actually puckers.
function buildFabricHeightCanvas({ stitch = 22 } = {}) {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cell = canvas.width / stitch;
  for (let gy = 0; gy <= stitch; gy++) {
    for (let gx = 0; gx <= stitch; gx++) {
      const x = gx * cell + cell / 2 + (Math.random() - 0.5) * cell * 0.15;
      const y = gy * cell + cell / 2 + (Math.random() - 0.5) * cell * 0.15;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.6);
      grad.addColorStop(0, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1.5;
  for (let gy = 0; gy <= stitch; gy++) {
    ctx.beginPath();
    ctx.moveTo(0, gy * cell);
    ctx.lineTo(canvas.width, gy * cell);
    ctx.stroke();
  }
  for (let gx = 0; gx <= stitch; gx++) {
    ctx.beginPath();
    ctx.moveTo(gx * cell, 0);
    ctx.lineTo(gx * cell, canvas.height);
    ctx.stroke();
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// Quilted fabric colour texture (mattress ticking, blanket knit) -- colour
// is derived from the shared height canvas so the puffiness/seam pattern
// always lines up with its normal map below.
export function createFabricTexture({ color = [156, 148, 132], stitch = 22 } = {}) {
  const height = buildFabricHeightCanvas({ stitch });
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const t = hData[i] / 255;
    const shade = 0.7 + t * 0.6;
    out.data[i] = Math.min(255, color[0] * shade);
    out.data[i + 1] = Math.min(255, color[1] * shade);
    out.data[i + 2] = Math.min(255, color[2] * shade);
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return finish(canvas, 2, 2);
}

// Normal-map counterpart of createFabricTexture() -- makes the tufting
// actually catch the bedroom bulb/lightning at a raking angle instead of
// the quilting being flat paint on a flat mattress.
export function createFabricNormalTexture({ stitch = 22 } = {}) {
  return finishBump(heightToNormalMap(buildFabricHeightCanvas({ stitch }), 1.4), 2, 2);
}

// ===========================================================================
// Level 0 -- the backrooms corridor
// ===========================================================================
//
// A note on memoisation, which the older builders in this file get wrong.
// buildWallpaperHeightCanvas(), buildClawMarksHeightCanvas(), the rug and the
// fabric all draw with Math.random(), and their colour and normal functions
// each call the builder separately -- so despite the comments above promising
// that the colour texture and normal map "always agree on exactly where the
// pattern sits", they are in fact two independent random draws whose stains
// land in different places. The builders below are cached so that promise
// actually holds: one canvas per surface, shared by both maps.

/**
 * Same canvas, different real-world scale.
 *
 * Texture.clone() shares the underlying Source, so this costs one Texture
 * object and NO extra GPU upload -- which is what makes "one wallpaper canvas,
 * thirteen wall runs of different lengths" affordable. Deliberately does not
 * touch needsUpdate: the source is already uploaded, and flagging it would
 * force a pointless re-upload for every clone.
 */
export function tiled(tex, repeatX, repeatY) {
  const t = tex.clone();
  t.repeat.set(repeatX, repeatY);
  return t;
}

// ---------- yellow damp wallpaper ----------

let _backroomsWallHeight = null;
function backroomsWallHeight() {
  return (_backroomsWallHeight ??= buildBackroomsWallpaperHeightCanvas());
}

function buildBackroomsWallpaperHeightCanvas() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Roll drop-seams: the most recognisable wallpaper feature, and the thing
  // that stops a flat yellow wall reading as painted plaster. A groove with a
  // lifted lip beside it every 128px -- which at the level's tiling
  // (512px == 2.12m) is a seam every 0.53m, a real roll width.
  for (let x = 0; x < canvas.width; x += 128) {
    ctx.strokeStyle = 'rgba(46, 46, 46, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210, 210, 210, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2.5, 0);
    ctx.lineTo(x + 2.5, canvas.height);
    ctx.stroke();
  }

  // Orange-peel emboss -- what makes it read as paper rather than paint when
  // the flashlight rakes across it.
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 2 + Math.random() * 3;
    const up = Math.random() < 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, up ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blistering: paper lifting off the wall where it is damp. Raised, and
  // biased low, because moisture wicks UP from the carpet.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * canvas.width;
    const y = canvas.height * (0.45 + Math.random() * 0.55);
    const r = 20 + Math.random() * 28;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Missing patches, cut deep. The colour pass thresholds on this to paint
  // bare plaster, so the hole and its shading can never disagree -- the same
  // trick createRugTexture uses for its colour bands.
  // NO torn-through patches here, deliberately. They looked right in isolation
  // but this canvas tiles every 2.12m along a 22m wall, so each one became the
  // same silhouette repeated a dozen times across the level -- the single most
  // artificial thing in frame. Torn paper is carried instead by the peeling
  // flaps the level places individually (createPeelingWallpaperTexture), which
  // do not tile and so can never repeat.

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 11;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * The backrooms wall.
 *
 * `base` is an ochre, not a primary yellow -- blue crushed to roughly 48% of
 * red. It is deliberately BRIGHT: the corridor lights it in pools rather than
 * evenly, so a lit stretch reads as unmistakable backrooms yellow while the
 * same material in the dark gaps between fixtures falls to a murky olive. One
 * material, two moods, no extra cost. That brightness is also why the level
 * runs a far lower ambient than every other room in this game -- see the note
 * on the AmbientLight in backroomsLevel.js.
 */
export function createBackroomsWallpaperTexture({
  base = [198, 178, 96],
  lit = [222, 202, 122],
  damp = [74, 60, 26],
  // Kept in the signature for the height-threshold branch below, which is now
  // only reached by the deepest damp pits.
  bare = [128, 116, 86]
} = {}) {
  const height = backroomsWallHeight();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const h = hData[i];
    if (h < 46) {
      out.data[i] = bare[0];
      out.data[i + 1] = bare[1];
      out.data[i + 2] = bare[2];
    } else {
      const t = Math.max(0, Math.min(1, (h - 70) / 110));
      out.data[i] = base[0] + (lit[0] - base[0]) * t;
      out.data[i + 1] = base[1] + (lit[1] - base[1]) * t;
      out.data[i + 2] = base[2] + (lit[2] - base[2]) * t;
    }
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // Damp staining, drawn as ellipses TALLER than wide because water runs down,
  // and anchored to the top and bottom bands of the canvas. The level maps
  // exactly one canvas height onto each wall, so those bands land on the real
  // ceiling and skirting lines instead of floating mid-wall.
  const stains = [];
  for (let i = 0; i < 8; i++) {
    const cx = Math.random() * canvas.width;
    const cy = i < 4 ? canvas.height * (0.85 + Math.random() * 0.15)
      : i < 6 ? canvas.height * Math.random() * 0.10
        : Math.random() * canvas.height;
    const r = 28 + Math.random() * 54;
    stains.push([cx, cy, r]);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 1.9 + Math.random());
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(' + damp[0] + ',' + damp[1] + ',' + damp[2] + ',0.50)');
    g.addColorStop(1, 'rgba(' + damp[0] + ',' + damp[1] + ',' + damp[2] + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tide-line. Real water stains concentrate their solute at the edge, and
    // this one detail is the difference between "a water stain" and "a brown
    // smudge".
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 1.9);
    // Soft: at 0.34/3px these arcs were crisp enough to read as drawn circles
    // once the canvas tiled along a 22m wall.
    ctx.strokeStyle = 'rgba(96, 76, 32, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Mildew speckle, rejection-sampled so it only lands inside the stains.
  ctx.fillStyle = 'rgba(24, 20, 10, 0.35)';
  for (let i = 0; i < 320; i++) {
    const s = stains[Math.floor(Math.random() * stains.length)];
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * s[2];
    ctx.beginPath();
    ctx.arc(s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d * 1.9, 0.5 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Run streaks from the ceiling line -- createPlasterWallTexture's idiom,
  // browner, and only ever downward.
  ctx.strokeStyle = 'rgba(46, 36, 14, 0.13)';
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 26, 150 + Math.random() * 362);
    ctx.lineWidth = 4 + Math.random() * 10;
    ctx.stroke();
  }

  // repeat 1,1: the level sets its own per-wall repeat with tiled(), because
  // every wall run is a different length and the VERTICAL repeat has to stay
  // at exactly 1 for the damp bands to land on the floor and ceiling.
  return finish(canvas, 1, 1);
}

export function createBackroomsWallpaperNormalTexture() {
  return finishBump(heightToNormalMap(backroomsWallHeight(), 1.6), 1, 1);
}

// ---------- damp beige carpet ----------

let _dampCarpetHeight = null;
function dampCarpetHeight() {
  return (_dampCarpetHeight ??= buildDampCarpetHeightCanvas());
}

function buildDampCarpetHeightCanvas() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Much coarser base noise than the wall -- that roughness IS the pile.
  let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 34;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);

  // Loop highlights. Short strokes rather than thousands of arc() calls --
  // roughly four times cheaper and indistinguishable at this density.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const a = Math.random() * Math.PI * 2;
    const len = 2 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // Woven backing grid -- what stops the whole thing reading as sand.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.lineWidth = 1;
  for (let g = 0; g < canvas.width; g += 6) {
    ctx.beginPath();
    ctx.moveTo(g + 0.5, 0);
    ctx.lineTo(g + 0.5, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g + 0.5);
    ctx.lineTo(canvas.width, g + 0.5);
    ctx.stroke();
  }

  // Wet patches. Recessed, because wet carpet mats DOWN -- and the colour pass
  // thresholds on the same values, so stain and normal stay registered.
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 40 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(30,30,30,0.55)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Worn traffic lane straight down the middle.
  const lane = ctx.createLinearGradient(canvas.width * 0.3, 0, canvas.width * 0.7, 0);
  lane.addColorStop(0, 'rgba(0,0,0,0)');
  lane.addColorStop(0.5, 'rgba(0,0,0,0.10)');
  lane.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lane;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bald patches: flatten the pile by half-blending grey back over it.
  ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
  for (let i = 0; i < 3; i++) {
    const cx = canvas.width * (0.35 + Math.random() * 0.3);
    const cy = Math.random() * canvas.height;
    ctx.beginPath();
    for (let p = 0; p <= 8; p++) {
      const a = (p / 8) * Math.PI * 2;
      const r = (22 + Math.random() * 20);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  return canvas;
}

export function createDampCarpetTexture({
  base = [150, 136, 92],
  wet = [74, 65, 42],
  mould = [34, 32, 20]
} = {}) {
  const height = dampCarpetHeight();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const h = hData[i];
    const t = h / 255;
    const shade = 0.78 + t * 0.42;
    let r = base[0] * shade;
    let g = base[1] * shade;
    let b = base[2] * shade;
    // Same threshold the height pass used for its wet patches, so the damp
    // colour can never drift off the matted pile it belongs to.
    if (h < 92) {
      const w = (92 - h) / 92;
      r += (wet[0] - r) * w;
      g += (wet[1] - g) * w;
      b += (wet[2] - b) * w;
    }
    out.data[i] = Math.min(255, r);
    out.data[i + 1] = Math.min(255, g);
    out.data[i + 2] = Math.min(255, b);
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // Mould, as soft blooms rather than stroked rings. Hard-edged circles were
  // the one feature in this canvas that survived tiling as an obviously
  // repeated shape -- a floor covered in identical drawn rings. Soft radial
  // gradients blend into their neighbours and read as staining instead.
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 34 + Math.random() * 64;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + mould[0] + ',' + mould[1] + ',' + mould[2] + ',0.20)');
    g.addColorStop(1, 'rgba(' + mould[0] + ',' + mould[1] + ',' + mould[2] + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return finish(canvas, 1, 1);
}

export function createDampCarpetNormalTexture() {
  return finishBump(heightToNormalMap(dampCarpetHeight(), 1.1), 1, 1);
}

// ---------- suspended ceiling tiles ----------

let _ceilingTileHeight = null;
function ceilingTileHeight() {
  return (_ceilingTileHeight ??= buildCeilingTileHeightCanvas());
}

function buildCeilingTileHeightCanvas() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  const TILE = 128; // 4x4 tiles -> 0.6m tiles at the level's tiling
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Acoustic pinholes, on a jittered grid so they do not moire.
  ctx.fillStyle = 'rgba(60, 60, 60, 0.35)';
  for (let x = 4; x < canvas.width; x += 11) {
    for (let y = 4; y < canvas.height; y += 11) {
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Three water-stained tiles, picked from the sixteen.
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  for (let s = 0; s < 3; s++) {
    const ti = order[s];
    const cx = (ti % 4) * TILE + TILE / 2;
    const cy = Math.floor(ti / 4) * TILE + TILE / 2;
    const r = 26 + Math.random() * 30;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(40,40,40,0.6)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 52, 52, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
  }

  // One tile sagged almost to black -- the colour pass paints it as a hole.
  const sag = order[3];
  const sx = (sag % 4) * TILE;
  const sy = Math.floor(sag / 4) * TILE;
  const sg = ctx.createRadialGradient(sx + TILE / 2, sy + TILE / 2, 6, sx + TILE / 2, sy + TILE / 2, TILE * 0.55);
  sg.addColorStop(0, 'rgba(20,20,20,1)');
  sg.addColorStop(1, 'rgba(128,128,128,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sx, sy, TILE, TILE);

  // T-bar grid LAST, so nothing above draws over it: recessed channel with a
  // light lip either side, because the metal grid catches the fluorescents.
  for (let g = 0; g <= canvas.width; g += TILE) {
    ctx.strokeStyle = 'rgba(40, 40, 40, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(canvas.width, g); ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g - 2.5, 0); ctx.lineTo(g - 2.5, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(g + 2.5, 0); ctx.lineTo(g + 2.5, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, g - 2.5); ctx.lineTo(canvas.width, g - 2.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, g + 2.5); ctx.lineTo(canvas.width, g + 2.5); ctx.stroke();
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    imgData.data[i] += n;
    imgData.data[i + 1] += n;
    imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function createCeilingTileTexture({
  base = [178, 166, 120],
  stain = [96, 74, 34],
  hole = [10, 9, 6]
} = {}) {
  const height = ceilingTileHeight();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const h = hData[i];
    let r; let g; let b;
    if (h < 40) {
      // the sagged/missing tile
      r = hole[0]; g = hole[1]; b = hole[2];
    } else if (h < 96) {
      // water staining, and the recessed T-bar channel, both read dark
      const t = (96 - h) / 56;
      r = base[0] + (stain[0] - base[0]) * t;
      g = base[1] + (stain[1] - base[1]) * t;
      b = base[2] + (stain[2] - base[2]) * t;
    } else {
      const shade = 0.86 + (h / 255) * 0.30;
      r = base[0] * shade; g = base[1] * shade; b = base[2] * shade;
    }
    out.data[i] = Math.min(255, r);
    out.data[i + 1] = Math.min(255, g);
    out.data[i + 2] = Math.min(255, b);
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return finish(canvas, 1, 1);
}

export function createCeilingTileNormalTexture() {
  return finishBump(heightToNormalMap(ceilingTileHeight(), 1.3), 1, 1);
}

// ---------- blood arrows ----------

function buildBloodArrowHeightCanvas(dir) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The arrow is authored pointing at canvas +X with its drips running to
  // canvas +Y. Mirroring here rather than with a negative mesh scale: a
  // negative scale would invert the plane's normal and black out its lighting.
  // Only the X axis flips, so the drips stay vertical either way.
  if (dir < 0) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';

  // Many overlapping tapering segments along a slightly bent path -- the same
  // build as buildScratchedMessageHeightCanvas, for the same reason: a single
  // clean stroke reads as printed, not as something dragged by a hand.
  function smear(x0, y0, x1, y1, w0, w1) {
    const cxp = (x0 + x1) / 2 + (Math.random() - 0.5) * 20;
    const cyp = (y0 + y1) / 2 + (Math.random() - 0.5) * 20;
    const SEG = 14;
    let px = x0; let py = y0;
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG;
      const mt = 1 - t;
      const nx = mt * mt * x0 + 2 * mt * t * cxp + t * t * x1;
      const ny = mt * mt * y0 + 2 * mt * t * cyp + t * t * y1;
      ctx.lineWidth = (w0 + (w1 - w0) * t) * (0.75 + Math.random() * 0.5);
      ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      px = nx; py = ny;
    }
  }

  smear(30, 128, 168, 128, 22, 20);   // shaft
  smear(216, 128, 140, 58, 24, 10);   // head, upper barb
  smear(216, 128, 140, 198, 24, 10);  // head, lower barb
  ctx.globalAlpha = 1;

  // Finger gaps -- a hand painted this, so it has separations in it.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    const y = 108 + Math.random() * 40;
    ctx.lineWidth = 2 + Math.random();
    ctx.beginPath();
    ctx.moveTo(30 + Math.random() * 40, y);
    ctx.lineTo(150 + Math.random() * 60, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Drips, from the lowest edge of the shape downward.
  for (let i = 0; i < 5; i++) {
    const x = 50 + Math.random() * 150;
    const yTop = 140 + Math.random() * 12;
    const len = 40 + Math.random() * 70;
    const SEG = 10;
    for (let s = 0; s < SEG; s++) {
      const t = s / SEG;
      ctx.lineWidth = 7 - t * 5;
      ctx.globalAlpha = 0.85 - t * 0.35;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t * 6) * 2, yTop + len * t);
      ctx.lineTo(x + Math.sin((t + 1 / SEG) * 6) * 2, yTop + len * (t + 1 / SEG));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, yTop + len, 3 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Stray flecks.
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.arc(20 + Math.random() * 220, 40 + Math.random() * 180, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  return canvas;
}

/**
 * Returns BOTH maps for one arrow, from one shared height canvas.
 *
 * Every other decal in this file exposes createXTexture() and
 * createXNormalTexture() as two entry points, which only works when the builder
 * is deterministic. This one randomises the smear per call -- each arrow should
 * be its own drag of a hand -- so two separate entry points would hand back the
 * colour map of one arrow and the normal map of a different one. (Which is
 * exactly what createClawMarksTexture/createClawMarksNormalTexture do above.)
 *
 * `dir` is +1 for an arrow pointing along the plane's local +X, -1 for -X.
 * `wet` only changes the colour ramp; the caller also drops the material's
 * roughness, which is what actually makes it glisten.
 */
export function createBloodArrowMaps({ dir = 1, wet = false } = {}) {
  const height = buildBloodArrowHeightCanvas(dir);
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);

  // Dried blood is oxblood-brown, not red -- and against yellow wallpaper under
  // a warm fluorescent, brown is what actually reads. The thick centre goes
  // near-black while the thin smeared edges stay redder, so the outline still
  // catches the flashlight instead of sinking into the wall's own dark values.
  const thin = wet ? [138, 44, 30] : [110, 38, 26];
  const thick = wet ? [84, 14, 12] : [58, 9, 8];

  for (let i = 0; i < hData.length; i += 4) {
    const t = hData[i + 3] / 255;
    out.data[i] = thin[0] + (thick[0] - thin[0]) * t;
    out.data[i + 1] = thin[1] + (thick[1] - thin[1]) * t;
    out.data[i + 2] = thin[2] + (thick[2] - thin[2]) * t;
    out.data[i + 3] = Math.min(255, t * 250);
  }
  ctx.putImageData(out, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  // heightToNormalMap reads the RED channel, but this canvas carries its shape
  // in ALPHA (it is a decal on transparency), so flatten alpha into a grey
  // height canvas first rather than handing it a mostly-black red channel.
  const flat = makeCanvas(height.width, height.height);
  const fctx = flat.getContext('2d');
  const fimg = fctx.createImageData(flat.width, flat.height);
  for (let i = 0; i < hData.length; i += 4) {
    const a = hData[i + 3];
    fimg.data[i] = a;
    fimg.data[i + 1] = a;
    fimg.data[i + 2] = a;
    fimg.data[i + 3] = 255;
  }
  fctx.putImageData(fimg, 0, 0);

  return { map, normalMap: finishBump(heightToNormalMap(flat, 2.0)) };
}

/**
 * The creature sketch found on the basement floor.
 *
 * Drawn to match the ACTUAL proportions of systems/Creature.js at correction 0
 * -- long arms hanging past the knee, thin body, hunched back, small head at an
 * angle. That correspondence is the point: this is somebody's attempt to record
 * what they were living with, and a player who has seen the thing should
 * recognise the drawing, and vice versa.
 *
 * Pressed hard and gone over twice, because the storyline says the notes down
 * here are in "messy handwriting" and this was not drawn calmly.
 */
export function createCreatureSketchTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 496;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Paper: cheap lab notepad, foxed and grubby at the edges.
  ctx.fillStyle = '#cfc7b0';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 2.6;
    ctx.fillStyle = `rgba(120,104,74,${0.02 + Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Darkened edges, as if it has been on a concrete floor for a while.
  const edge = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(46,38,26,0.42)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  const ink = 'rgba(26,22,18,';
  const cx = W * 0.5;
  const groundY = H * 0.86;
  const s = H / 520;   // scale so the figure fills the sheet

  /** Two passes over every line: nobody drew this once and stopped. */
  function stroke(path, width, alpha) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.lineWidth = width * (pass ? 0.7 : 1);
      ctx.strokeStyle = ink + (alpha * (pass ? 0.55 : 1)) + ')';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const j = pass ? 1.6 : 0;
      path.forEach(([x, y], i) => {
        const px = x + (Math.random() - 0.5) * j;
        const py = y + (Math.random() - 0.5) * j;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }

  // Legs -- close to human length. That contrast is what makes the arms read.
  stroke([[cx - 14 * s, groundY], [cx - 16 * s, groundY - 96 * s], [cx - 10 * s, groundY - 170 * s]], 5 * s, 0.85);
  stroke([[cx + 16 * s, groundY], [cx + 14 * s, groundY - 96 * s], [cx + 8 * s, groundY - 170 * s]], 5 * s, 0.85);
  // Feet
  stroke([[cx - 22 * s, groundY], [cx - 2 * s, groundY]], 5 * s, 0.8);
  stroke([[cx + 8 * s, groundY], [cx + 28 * s, groundY]], 5 * s, 0.8);

  // Torso, narrow, and a spine that curves forward at the top -- the hunch.
  stroke([
    [cx - 10 * s, groundY - 170 * s],
    [cx - 16 * s, groundY - 240 * s],
    [cx - 14 * s, groundY - 300 * s],
    [cx - 4 * s, groundY - 336 * s]
  ], 5 * s, 0.9);
  stroke([
    [cx + 8 * s, groundY - 170 * s],
    [cx + 16 * s, groundY - 240 * s],
    [cx + 16 * s, groundY - 300 * s],
    [cx + 12 * s, groundY - 332 * s]
  ], 5 * s, 0.9);
  // Ribs, sketched in: "thin body"
  for (let i = 0; i < 5; i++) {
    const y = groundY - (200 + i * 26) * s;
    stroke([[cx - 12 * s, y], [cx + 12 * s, y - 4 * s]], 2.2 * s, 0.35);
  }

  // ARMS. The whole point of the drawing. Shoulder to fingertip is longer than
  // hip to floor, so the hands hang past the knees.
  stroke([
    [cx - 12 * s, groundY - 322 * s],
    [cx - 42 * s, groundY - 250 * s],
    [cx - 50 * s, groundY - 150 * s],
    [cx - 46 * s, groundY - 88 * s]
  ], 5 * s, 0.9);
  stroke([
    [cx + 14 * s, groundY - 320 * s],
    [cx + 44 * s, groundY - 248 * s],
    [cx + 52 * s, groundY - 146 * s],
    [cx + 48 * s, groundY - 80 * s]
  ], 5 * s, 0.9);
  // Fingers, too many strokes and too long
  for (let side = -1; side <= 1; side += 2) {
    const hx = cx + side * (side < 0 ? 46 : 48) * s;
    const hy = groundY - (side < 0 ? 88 : 80) * s;
    for (let f = 0; f < 4; f++) {
      stroke([[hx, hy], [hx + side * (2 + f * 3) * s, hy + (26 + f * 5) * s]], 2.6 * s, 0.8);
    }
  }

  // Head: small, set forward of the shoulders, and tilted.
  ctx.save();
  ctx.translate(cx + 6 * s, groundY - 356 * s);
  ctx.rotate(0.34);
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    ctx.lineWidth = (pass ? 3 : 4.5) * s;
    ctx.strokeStyle = ink + (pass ? 0.5 : 0.9) + ')';
    ctx.ellipse(0, 0, 20 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // The annotations, in the same hand as the torn notes.
  ctx.fillStyle = ink + '0.8)';
  ctx.font = `${Math.round(21 * s)}px monospace`;
  ctx.fillText('arms  ~1.5x', W * 0.60, H * 0.42);
  ctx.fillText('week 11', W * 0.07, H * 0.10);
  ctx.font = `${Math.round(18 * s)}px monospace`;
  ctx.fillText('still climbing', W * 0.07, H * 0.145);
  ctx.fillText('it is not', W * 0.62, H * 0.72);
  ctx.fillText('finished', W * 0.62, H * 0.755);

  // An arrow from the note to the arm, scratched in afterwards.
  stroke([[W * 0.60, H * 0.435], [W * 0.44, H * 0.47]], 2.4 * s, 0.7);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Writing that only the calibration lenses can resolve.
 *
 * Drawn as bright ink on transparent, so the mesh using it can sit flat against
 * a wall and be switched on without a second material. Ragged, gone over twice,
 * and slightly luminous at the edges -- not because the ink glows, but because
 * the visor is CORRECTING contrast the naked eye is losing, and the cheapest
 * honest way to say "you can suddenly see this" is to let it sit above the
 * wall's own value range.
 */
export function createHiddenWritingTexture(lines = ["DON'T LET IT OUT"]) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const lineH = canvas.height / (lines.length + 0.6);
  lines.forEach((text, i) => {
    const baseY = lineH * (i + 0.9);
    const size = Math.min(120, (canvas.width * 0.92) / Math.max(text.length, 1) * 1.55);
    ctx.font = `${Math.round(size)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';

    /**
     * PER CHARACTER, not per line. Drawing the string in one call gave a
     * perfectly level, perfectly kerned line that read as a user-interface
     * caption stuck to the wall rather than as something a frightened person
     * wrote on it. Each letter now sits at its own angle, its own baseline and
     * its own weight -- which is the difference between text and handwriting.
     */
    const widths = [...text].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = cx - total / 2;
    [...text].forEach((ch, k) => {
      const w = widths[k];
      // Deterministic wobble: same string always draws the same way, so the
      // wall does not change between one look and the next.
      const wobble = Math.sin(k * 2.399 + i * 5.1);
      const wobble2 = Math.sin(k * 1.117 + i * 3.3);
      for (let pass = 0; pass < 2; pass++) {
        ctx.save();
        ctx.translate(x + w / 2 + wobble2 * 3, baseY + wobble * (size * 0.045));
        ctx.rotate(wobble * 0.055 + (pass ? 0.01 : -0.008));
        // Pale, not saturated. A hot blue reads as a screen; this is chalk-pale
        // and lets the visor's own tint do the colouring.
        const a = (pass ? 0.30 : 0.62) * (0.72 + Math.abs(wobble2) * 0.28);
        ctx.fillStyle = pass
          ? `rgba(206, 224, 238, ${a})`
          : `rgba(232, 243, 250, ${a})`;
        ctx.fillText(ch, (pass ? 1.5 : 0), (pass ? 1 : 0));
        ctx.restore();
      }
      x += w;
    });
  });

  // Rough the edges so it reads as ink on plaster rather than as a caption.
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const px = (i / 4) % canvas.width;
    const py = Math.floor(i / 4 / canvas.width);
    const n = Math.sin(px * 0.31 + py * 0.17) * 0.5 + 0.5;
    d[i + 3] = Math.max(0, Math.min(255, d[i + 3] * (0.55 + n * 0.55)));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * One footmark, for the trail across the study floor.
 *
 * A smear rather than a boot print: bare, dragged, and not quite the right
 * shape. It is the same trail walked so many times that it has worn into the
 * boards, which is the point -- somebody has been pacing this room for a very
 * long time.
 */
export function createFootmarkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createRadialGradient(64, 150, 6, 64, 150, 74);
  g.addColorStop(0, 'rgba(178, 208, 236, 0.62)');
  g.addColorStop(0.55, 'rgba(140, 176, 210, 0.30)');
  g.addColorStop(1, 'rgba(120, 156, 190, 0)');
  ctx.fillStyle = g;

  // Sole: a long oval, narrowed at the arch.
  ctx.beginPath();
  ctx.ellipse(64, 158, 34, 76, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ball of the foot, pressed harder.
  ctx.beginPath();
  ctx.ellipse(64, 96, 36, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  // Toes -- five, and too long.
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(30 + i * 17, 60 - Math.abs(i - 2) * 5, 7, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
