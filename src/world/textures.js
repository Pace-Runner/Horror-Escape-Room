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

// ---------------------------------------------------------------------------
// Generic canvas maths, shared by the procedural textures below
// ---------------------------------------------------------------------------

/** Hermite ramp: 0 at or below `a`, 1 at or above `b`, smooth in between. */
function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * One axis of a box blur, with a running window sum so the cost is independent
 * of the radius. Edges clamp rather than wrap: every mask that uses this is a
 * decal with dead space around it, and wrapping would smear one side of a
 * puddle onto the other.
 */
function boxBlurPass(src, dst, w, h, r, horizontal) {
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const step = (horizontal ? 1 : w) * 4;
  const lineStep = (horizontal ? w : 1) * 4;
  const win = r * 2 + 1;
  for (let o = 0; o < outer; o++) {
    const base = o * lineStep;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) {
        sum += src[base + Math.min(inner - 1, Math.max(0, i)) * step + c];
      }
      for (let i = 0; i < inner; i++) {
        dst[base + i * step + c] = sum / win;
        sum += src[base + Math.min(inner - 1, i + r + 1) * step + c]
             - src[base + Math.max(0, i - r) * step + c];
      }
    }
  }
}

/**
 * Blur a canvas in place, across all four channels.
 *
 * `ctx.filter = 'blur(Npx)'` would be one line, but it is the only 2D canvas
 * feature this file would lean on that some shipping browsers still ignore --
 * and an ignored filter does not throw, it just turns every soft edge below
 * into a hard cut, which is exactly the failure that would ship unnoticed.
 * Three box passes are visually indistinguishable from a Gaussian here.
 */
function blurCanvas(canvas, radius, passes = 3) {
  const r = Math.round(radius);
  if (r < 1) return canvas;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const scratch = new Uint8ClampedArray(src.length);
  for (let p = 0; p < passes; p++) {
    boxBlurPass(src, scratch, w, h, r, true);
    boxBlurPass(scratch, src, w, h, r, false);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * A closed, smoothly irregular blob -- the outline a spill actually makes.
 *
 * Samples `lobes` radii around an ellipse and joins them with quadratics
 * through the MIDPOINTS of consecutive samples, so the curve has no corner at
 * any sample. Joining the samples directly would give a polygon, and a polygon
 * with visible corners is precisely what the old circle-geometry puddles read
 * as under a moving torch.
 *
 * Returns the radii it used, so a second call can trace the same outline at a
 * different size -- that is how the tide-mark variant gets a ring that follows
 * its own shoreline instead of an unrelated second blob.
 */
function blobPath(ctx, cx, cy, rx, ry, { lobes = 9, wobble = 0.45, rot = 0, radii = null } = {}) {
  const rs = radii ?? Array.from({ length: lobes }, () => 1 - wobble / 2 + Math.random() * wobble);
  const n = rs.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx * rs[i], cy + Math.sin(a) * ry * rs[i]]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const end = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], end[0], end[1]);
  }
  ctx.closePath();
  return rs;
}

/**
 * Smooth value noise, as a greyscale canvas.
 *
 * A tiny random grid blown up with the browser's own bilinear filter. Per-pixel
 * Math.random() is white noise, and white noise pushed through
 * heightToNormalMap() gives a normal map that sparkles like static; what a
 * water surface needs is low-frequency undulation, which is what this is.
 */
function smoothNoiseCanvas(size, cells) {
  const small = makeCanvas(cells, cells);
  const sCtx = small.getContext('2d');
  const img = sCtx.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random() * 255;
    img.data[i] = n; img.data[i + 1] = n; img.data[i + 2] = n; img.data[i + 3] = 255;
  }
  sCtx.putImageData(img, 0, 0);
  const out = makeCanvas(size, size);
  const oCtx = out.getContext('2d');
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = 'high';
  oCtx.drawImage(small, 0, 0, size, size);
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
/**
 * A roughness map, derived from a height canvas.
 *
 * NOTHING IN THIS PROJECT HAD ONE. Every surface -- floorboards, plaster,
 * varnished wood, cast iron -- carried a single scalar roughness, which means
 * every surface answered the torch with one identical specular lobe. That is
 * the single biggest reason a room full of carefully generated colour and
 * normal maps still reads as flat: the normal map changes which way the light
 * bounces, and the roughness map changes HOW MUCH, and only having the first
 * gives you shape without material.
 *
 * Derived from the same height canvas the bump and normal maps use, so the
 * three can never disagree about where the grain is. Low ground (a plank seam,
 * a gouge, a crack in plaster) is rougher: dirt and wear collect in the low
 * places, and that is exactly where a real floor stops being shiny.
 *
 * @param low   roughness in the recesses (matte)
 * @param high  roughness on the high points (glossier)
 */
function heightToRoughnessCanvas(heightCanvas, low = 0.96, high = 0.55) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h);
  const out = makeCanvas(w, h);
  const dst = out.getContext('2d').createImageData(w, h);
  for (let i = 0; i < src.data.length; i += 4) {
    const height = src.data[i] / 255;
    // Only the RED channel is read as roughness by three.js's standard
    // material, but writing all three keeps the canvas legible if it is ever
    // dumped to look at.
    const r = Math.round(255 * (low + (high - low) * height));
    dst.data[i] = r;
    dst.data[i + 1] = r;
    dst.data[i + 2] = r;
    dst.data[i + 3] = 255;
  }
  out.getContext('2d').putImageData(dst, 0, 0);
  return out;
}

export function createWoodFloorBumpTexture() {
  return finishBump(buildWoodFloorHeightCanvas(), 4, 4);
}

/**
 * Floorboards: matte in the seams and where the varnish has worn through,
 * glossier along the middle of each board where feet have polished it.
 */
export function createWoodFloorRoughnessTexture() {
  return finishBump(heightToRoughnessCanvas(buildWoodFloorHeightCanvas(), 0.97, 0.42), 4, 4);
}

/**
 * Plaster. A much narrower range than wood -- old plaster is matte everywhere,
 * and the only variation is that the raised texture catches slightly more.
 */
export function createPlasterRoughnessTexture() {
  // SAME repeat as the bump map (2, 2). A roughness map tiling at a different
  // rate than the normal map it is paired with slides the gloss across the
  // relief, which reads as the wall being wet in moving patches.
  return finishBump(heightToRoughnessCanvas(buildPlasterHeightCanvas(), 0.98, 0.80), 2, 2);
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
/**
 * Built ONCE and reused, unlike the inline version this replaces.
 *
 * The plaster height is full of Math.random(), so calling the generator twice
 * produced two different walls -- which was fine while only the bump map used
 * it, and stops being fine the moment a roughness map is derived from it too.
 * A bump map and a roughness map that disagree about where the cracks are is
 * worse than having neither, because the light and the gloss argue.
 */
let plasterHeightCanvas = null;
function buildPlasterHeightCanvas() {
  if (plasterHeightCanvas) return plasterHeightCanvas;
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
  plasterHeightCanvas = canvas;
  return canvas;
}

export function createPlasterBumpTexture() {
  return finishBump(buildPlasterHeightCanvas(), 2, 2);
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

// Bedroom wallpaper: a small embossed vintage motif over dark, muted mushroom
// paper. The warm grey-brown ground keeps the room domestic rather than
// institutional while leaving the motif deliberately low contrast.
// Colour is derived from the shared height canvas (raised = motif
// colour, recessed = base colour) so the visible pattern and its normal map
// cannot drift out of sync.
export function createDamaskWallpaperTexture({
  base = [82, 75, 67],
  motif = [98, 89, 79]
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

  // Roll seams are quieter than the motif, but their tiny dark/light pair
  // breaks the clean tiled surface into actual wallpaper drops.
  for (let x = 0; x < canvas.width; x += 170) {
    ctx.fillStyle = 'rgba(34, 29, 26, 0.18)';
    ctx.fillRect(x, 0, 2, canvas.height);
    ctx.fillStyle = 'rgba(154, 141, 124, 0.06)';
    ctx.fillRect(x + 2, 0, 1, canvas.height);
  }

  // Faded vertical streaks belong to the paper itself. Larger, unique damp
  // patches are placed as bedroom-local decals so they never repeat by tile.
  ctx.strokeStyle = 'rgba(42, 35, 31, 0.18)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const x = Math.random() * canvas.width;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, canvas.height);
    ctx.lineWidth = 3 + Math.random() * 7;
    ctx.stroke();
  }

  const lowerGrime = ctx.createLinearGradient(0, canvas.height * 0.62, 0, canvas.height);
  lowerGrime.addColorStop(0, 'rgba(45, 36, 30, 0)');
  lowerGrime.addColorStop(1, 'rgba(35, 29, 26, 0.28)');
  ctx.fillStyle = lowerGrime;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
 * The rating stamped into a glass fuse's nickel end cap, plus a bump map
 * from the same lettering so it reads as pressed into the metal rather than
 * printed on it.
 *
 * Laid out for the caps' own cylindrical UVs (blender/glass_fuse.py): canvas
 * x runs once round the cap and y along it, and 512 x 80 is the cap's own
 * proportions (circumference 15 cm, length 2.2 cm). The rating is stamped
 * twice, a half-turn apart, so one is always facing out. The middle of the
 * canvas is left bare because the cap's flat end samples it.
 *
 * Every loose fuse is the same model, so this stamp is the only thing on it
 * that says what it is.
 */
export function createFuseCapStampTexture(amps) {
  const W = 512;
  const H = 80;
  const lettering = makeCanvas(W, H);
  const lctx = lettering.getContext('2d');
  lctx.fillStyle = '#000';
  lctx.fillRect(0, 0, W, H);
  lctx.fillStyle = '#fff';
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.font = 'bold 50px Arial, sans-serif';
  for (const x of [W * 0.25, W * 0.75]) lctx.fillText(`${amps} ☆`, x, H / 2 + 2);

  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b4b6b8';
  ctx.fillRect(0, 0, W, H);
  // Fine lines round the cap, from it being spun when it was pressed.
  for (let y = 0; y < H; y++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'}, ${Math.random() * 0.08})`;
    ctx.fillRect(0, y, W, 1);
  }
  // The stamp itself sits darker, where grime has settled into it.
  const lData = lctx.getImageData(0, 0, W, H).data;
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const darken = (lData[i] / 255) * 70;
    img.data[i] -= darken; img.data[i + 1] -= darken; img.data[i + 2] -= darken;
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: finish(canvas, 1, 1),
    // Inverted: the lettering is pressed IN, so it is the low ground.
    bumpMap: finishBump((() => {
      const bump = makeCanvas(W, H);
      const bctx = bump.getContext('2d');
      bctx.filter = 'invert(1) blur(1px)';
      bctx.drawImage(lettering, 0, 0);
      return bump;
    })(), 1, 1)
  };
}

/**
 * The vent holes down the sides of the CRT, after a close photo of one: a
 * crescent of round holes in rows that follow arcs centred past the back
 * bottom corner, between a pressed crease that sweeps from the top of the
 * back down to the front of the underside, and a plain skirt along the
 * bottom. Returns a colour map and a bump map from the same holes and crease,
 * so they read as pressed into the plastic when light rakes across them.
 *
 * Laid out for the casing's side faces (blender/build_crt_monitor.py), which
 * run 0..1 from the bezel (u = 0) to the back (u = 1) and from the underside
 * (v = 0) to the top. `base` is the plastic's own colour, read back off the
 * model, so the vent panels match the rest of the casing exactly.
 *
 * Holes are about 3 mm across and 7 mm apart at the casing's real size --
 * big and dark enough to read in a dim room, which the first, finer version
 * of this was not.
 */
export function createCrtVentTexture(base = '#cfc9b6') {
  const S = 1024;
  const colour = makeCanvas(S, S);
  const cctx = colour.getContext('2d');
  cctx.fillStyle = base;
  cctx.fillRect(0, 0, S, S);
  const height = makeCanvas(S, S);
  const hctx = height.getContext('2d');
  hctx.fillStyle = '#c0c0c0';
  hctx.fillRect(0, 0, S, S);

  // Canvas x is front (0) to back (S); canvas y is top (0) to bottom (S).
  const cx = S * 1.06;
  const cy = S * 1.12;
  const innerR = S * 0.5;    // inside this, the plain skirt
  const outerR = S * 1.02;   // the crease
  const spacing = 22;
  const holeR = 4.5;

  // The crease and the skirt's edge: a ridge with a shadowed side, in both maps.
  for (const r of [outerR + 12, innerR - 14]) {
    cctx.strokeStyle = 'rgba(70, 62, 46, 0.35)';
    cctx.lineWidth = 3;
    cctx.beginPath(); cctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5); cctx.stroke();
    cctx.strokeStyle = 'rgba(255, 252, 240, 0.35)';
    cctx.lineWidth = 2;
    cctx.beginPath(); cctx.arc(cx, cy, r - 3, Math.PI, Math.PI * 1.5); cctx.stroke();
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 5;
    hctx.beginPath(); hctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5); hctx.stroke();
  }
  // Outside the crease the panel sits a touch proud, as on the photo.
  hctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  hctx.beginPath();
  hctx.rect(0, 0, S, S);
  hctx.arc(cx, cy, outerR + 12, 0, Math.PI * 2, true);
  hctx.fill('evenodd');

  for (let r = innerR; r <= outerR - spacing * 0.5; r += spacing) {
    const steps = Math.floor((Math.PI / 2) * r / spacing);
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (i / steps) * (Math.PI / 2);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (x < 10 || x > S - 10 || y < 10 || y > S - 10) continue;
      // A dark hole with a lit lower lip, which is what makes a dot read as
      // a hole rather than a spot of dirt.
      cctx.fillStyle = 'rgba(255, 250, 235, 0.5)';
      cctx.beginPath(); cctx.arc(x, y + 1.5, holeR, 0, Math.PI * 2); cctx.fill();
      cctx.fillStyle = 'rgba(22, 19, 14, 0.95)';
      cctx.beginPath(); cctx.arc(x, y, holeR, 0, Math.PI * 2); cctx.fill();
      hctx.fillStyle = '#000';
      hctx.beginPath(); hctx.arc(x, y, holeR, 0, Math.PI * 2); hctx.fill();
    }
  }

  // Grime, settled into the lower edge where the casing meets the desk.
  const g = cctx.createLinearGradient(0, S, 0, S * 0.6);
  g.addColorStop(0, 'rgba(90, 78, 56, 0.25)');
  g.addColorStop(1, 'rgba(90, 78, 56, 0)');
  cctx.fillStyle = g;
  cctx.fillRect(0, 0, S, S);

  const map = finish(colour, 1, 1);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const bumpMap = finishBump(height, 1, 1);
  bumpMap.wrapS = bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bumpMap };
}

/**
 * The cooling slots on top of the CRT's casing: rows of short slots across
 * the top of its middle step, where the heat off the tube rises. Same pair of
 * maps as the side vents. Laid out 0..1 across that one panel -- u side to
 * side, v front to back.
 */
export function createCrtTopVentTexture(base = '#cfc9b6') {
  const W = 512;
  const H = 256;
  const colour = makeCanvas(W, H);
  const cctx = colour.getContext('2d');
  cctx.fillStyle = base;
  cctx.fillRect(0, 0, W, H);
  const height = makeCanvas(W, H);
  const hctx = height.getContext('2d');
  hctx.fillStyle = '#c0c0c0';
  hctx.fillRect(0, 0, W, H);

  const cols = 14;
  const rows = 5;
  const slotW = 20;
  const slotH = 7;
  const x0 = W * 0.12;
  const x1 = W * 0.88;
  const y0 = H * 0.22;
  const y1 = H * 0.8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * (x1 - x0) / cols - slotW / 2;
      const y = y0 + (r + 0.5) * (y1 - y0) / rows - slotH / 2;
      cctx.fillStyle = 'rgba(255, 250, 235, 0.45)';
      cctx.fillRect(x, y + 1.5, slotW, slotH);
      cctx.fillStyle = 'rgba(20, 17, 12, 0.95)';
      cctx.fillRect(x, y, slotW, slotH);
      hctx.fillStyle = '#000';
      hctx.fillRect(x, y, slotW, slotH);
    }
  }
  // Dust settles on a flat top, and darkens round the slots most of all.
  cctx.fillStyle = 'rgba(110, 100, 80, 0.12)';
  cctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);

  const map = finish(colour, 1, 1);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const bumpMap = finishBump(height, 1, 1);
  bumpMap.wrapS = bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bumpMap };
}

/**
 * The power symbol on the CRT's button, white on black, for an emissive map:
 * the symbol is what lights up green when the monitor is on. Laid out for a
 * CylinderGeometry's end cap, which maps the cap's disc onto the canvas.
 */
export function createPowerSymbolTexture() {
  const S = 128;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.27, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(S / 2, S * 0.18);
  ctx.lineTo(S / 2, S * 0.5);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * One breaker's label: a black plate with the circuit's name in white
 * capitals and its rating under it, after the labels on a marine switch
 * panel -- one plate per switch rather than a shared strip, so each reads on
 * its own from across the room.
 *
 * Drawn from the level's circuit table rather than baked anywhere, so a label
 * can never disagree with the load chart or the puzzle.
 */
export function createSwitchLabelTexture(name, amps) {
  const W = 256;
  const H = 176;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0e';
  ctx.fillRect(0, 0, W, H);
  // A faint bevelled edge, as on a moulded plate.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  ctx.fillStyle = '#f2f2ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shrinks a long name (LIGHTING) to fit rather than running off the plate.
  let size = 52;
  ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(name).width > W - 36 && size > 24) {
    size -= 2;
    ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(name, W / 2, H * 0.4);
  ctx.font = `${Math.round(size * 0.7)}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = '#c8c8c2';
  ctx.fillText(`${amps}A`, W / 2, H * 0.72);

  // Worn: the white rubs off first at the edges of the lettering.
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] > 120 && Math.random() < 0.08) {
      img.data[i] *= 0.6; img.data[i + 1] *= 0.6; img.data[i + 2] *= 0.6;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
export function createPeelingWallpaperTexture({ paperColor = [82, 75, 67] } = {}) {
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
/**
 * How much dirt is baked into the TILING wallpaper. The damp stains are no
 * longer among it, and that is the point.
 *
 * WHY THE STAINS LEFT THIS CANVAS. This texture is generated once, shared by
 * every wall in the level, and tiled every 2.12 m along a wall's length. Three
 * stains in it are therefore not three stains: on a 22 m corridor they are
 * THIRTY, in ten identical groups of three, every one of them at exactly the
 * same height off the skirting. That reads as a printed pattern rather than as
 * damage, and no reduction in the count fixes it -- cutting to one stain just
 * gives you ten identical stains instead of thirty. The repetition, not the
 * quantity, was the defect.
 *
 * So stains are now DECALS, placed per wall run by backroomsLevel.js from
 * createDampStainTexture() below: nought to three on any given wall, at
 * physical size, wherever that wall's own seed puts them. A count of "3 max"
 * finally means three on the wall rather than three per two metres.
 *
 * What stays here is what genuinely wants to tile: the height-derived mottling
 * (which is the wallpaper itself, not dirt) and a couple of faint run-streaks
 * at 13% alpha, which are vertical and read as part of the paper's own grain
 * against its vertical stripe.
 *
 * MILDEW_SPECKS is kept for the decals rather than for this canvas -- the
 * speckle only ever drew INSIDE a stain, so with no stains here it draws
 * nothing, and the loop below is guarded for that.
 */
const DAMP_STAINS = 0;
const MILDEW_SPECKS = 128;
const RUN_STREAKS = 2;

/**
 * ONE damp stain on a transparent canvas, for use as a wall decal.
 *
 * Drawn rising from the BOTTOM edge rather than centred, because that is what
 * the thing actually is: damp wicking up out of the floor. The caller gives
 * the plane its real-world size, so the stain scales with the wall instead of
 * with the texture's tiling -- which is the whole reason these moved out of
 * createBackroomsWallpaperTexture.
 *
 * `seed` picks a deterministic variant. Same seed, same stain, every reload:
 * "the wall by the third turn has two stains" has to survive a refresh or it
 * cannot be tested, and Math.random() at build time would deal a different
 * level every boot.
 */
export function createDampStainTexture(seed = 0, {
  damp = [74, 60, 26],
  tide = [96, 76, 32]
} = {}) {
  const rand = creatureRand(0x5721 + seed * 7919);
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // Wider than tall in canvas space, then stretched upward by the transform --
  // the same "water runs down" idiom the wallpaper used, kept because it is
  // what makes a blob read as a stain rather than as a smudge.
  const r = S * (0.40 + rand() * 0.16);
  const rise = 1.15 + rand() * 0.55;
  const cx = S * (0.36 + rand() * 0.28);
  const alpha = 0.34 + rand() * 0.16;

  ctx.save();
  ctx.translate(cx, S);
  ctx.scale(1, rise);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${damp[0]},${damp[1]},${damp[2]},${alpha})`);
  g.addColorStop(0.55, `rgba(${damp[0]},${damp[1]},${damp[2]},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${damp[0]},${damp[1]},${damp[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tide-line. Real water stains concentrate their solute at the edge, and
  // this one detail is the difference between "a water stain" and "a brown
  // smudge". Soft on purpose -- crisp, it reads as a drawn circle.
  ctx.save();
  ctx.translate(cx, S);
  ctx.scale(1, rise);
  ctx.strokeStyle = `rgba(${tide[0]},${tide[1]},${tide[2]},0.13)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * (0.80 + rand() * 0.12), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Mildew, rejection-sampled inside this stain only.
  ctx.fillStyle = 'rgba(24, 20, 10, 0.30)';
  const specks = Math.round(MILDEW_SPECKS / 4 * (0.6 + rand() * 0.8));
  for (let i = 0; i < specks; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r;
    const x = cx + Math.cos(a) * d;
    const y = S + Math.sin(a) * d * rise;
    if (y > S) continue;
    ctx.beginPath();
    ctx.arc(x, y, 0.5 + rand() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ClampToEdge, NOT the RepeatWrapping finish() hands out: this is a decal on
  // its own quad, and repeat-wrapping a stain that runs off one edge would
  // wrap it back in on the other as a hard seam.
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}


// ---------- decals: floor damp, and blood ----------

/**
 * Shared plumbing for every decal below.
 *
 * `decal()` finishes a canvas as a ClampToEdge texture rather than the
 * RepeatWrapping one finish() hands out. That is not a preference: a decal sits
 * on its own quad and its content runs off the edge by design, so repeat
 * wrapping brings it back in on the opposite side as a hard seam.
 *
 * `blob()` is the reason these read as fluid rather than as circles. A single
 * radial gradient is a disc, and a floor covered in discs reads as a pattern
 * however it is coloured -- the wallpaper learned that already, in its comment
 * about hard-edged mould rings. Overlapping several gradients on jittered
 * centres gives an outline with lobes and inlets, which is what a spill has.
 */
function decal(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function blob(ctx, rand, cx, cy, r, rgb, alpha, lobes = 5, squash = 1) {
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rand() * 0.9;
    const d = i === 0 ? 0 : r * (0.18 + rand() * 0.42);
    const lr = r * (i === 0 ? 1 : 0.42 + rand() * 0.46);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * squash;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, squash);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, lr);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')');
    g.addColorStop(0.62, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha * 0.72 + ')');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Satellite droplets thrown clear of a spill. What stops it reading as a rug. */
function spatter(ctx, rand, cx, cy, r, rgb, count, reach = 1.9) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (1.0 + rand() * reach);
    const rr = 1.2 + rand() * 4.4;
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (0.30 + rand() * 0.45) + ')';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, rr * (0.6 + rand() * 0.8),
      rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A damp / mould patch on the carpet, seen from above.
 *
 * The floor's counterpart to createDampStainTexture, and it exists for the same
 * reason: buildDampCarpetHeightCanvas used to carry nine of these, and the floor
 * tiles that canvas every 2.6 m across a 53 m box, so nine became about 3,800 in
 * a dead-regular grid. Here they are placed per corridor instead.
 *
 * Centred rather than edge-anchored -- a wall stain wicks up from the skirting
 * and has a bottom, a floor stain is seen from directly above and has none.
 */
export function createFloorStainTexture(seed = 0, {
  wet = [74, 65, 42],
  mould = [34, 32, 20]
} = {}) {
  const rand = creatureRand(0x1f83d9 + seed * 7717);
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const r = S * (0.26 + rand() * 0.10);
  blob(ctx, rand, S / 2, S / 2, r, wet, 0.42 + rand() * 0.16, 5 + Math.floor(rand() * 3));
  // A darker mould heart, offset from the middle -- damp spreads outward from
  // wherever the water actually got in, not from the centre of the patch.
  blob(ctx, rand, S / 2 + (rand() - 0.5) * r * 0.7, S / 2 + (rand() - 0.5) * r * 0.7,
    r * (0.34 + rand() * 0.2), mould, 0.34, 4);
  spatter(ctx, rand, S / 2, S / 2, r, mould, 10 + Math.floor(rand() * 14), 0.7);
  return decal(canvas);
}

// Blood, three states. Kept as one palette so a pool and the dry patch beside
// it are obviously the same substance at different ages, which is most of what
// makes a scene read as having happened rather than having been decorated.
const BLOOD_WET = [112, 14, 16];
const BLOOD_DEEP = [52, 6, 9];
const BLOOD_DRY = [86, 38, 28];
const BLOOD_CRUST = [58, 24, 18];

/**
 * A pool, seen from above. Still wet.
 *
 * WETNESS IS NOT IN THIS CANVAS -- it is the material's roughness, and it has
 * to be, because a pool reads as wet by holding a sharp specular reflection of
 * the fluorescents and nothing painted into an albedo map can fake that under a
 * moving light. What the canvas contributes is the shape: a lobed outline, a
 * deep almost-black heart where it is thickest, a lighter rim where it is
 * shallow enough to see the carpet through, and thrown droplets.
 */
export function createBloodPoolTexture(seed = 0) {
  const rand = creatureRand(0x7ac3e1 + seed * 6971);
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const r = S * (0.24 + rand() * 0.11);
  const squash = 0.72 + rand() * 0.5;
  blob(ctx, rand, S / 2, S / 2, r * 1.06, BLOOD_WET, 0.60, 6, squash);
  blob(ctx, rand, S / 2, S / 2, r * 0.62, BLOOD_DEEP, 0.78, 4, squash);
  spatter(ctx, rand, S / 2, S / 2, r, BLOOD_WET, 12 + Math.floor(rand() * 18));
  return decal(canvas);
}

/**
 * A dry patch. Older, browner, matte, and cracked.
 *
 * The cracks are ERASED rather than drawn, which is the whole trick: a crack in
 * a dried film shows the carpet underneath it, so cutting alpha out reads as
 * less blood while painting a dark line reads as more. Getting that backwards
 * is what makes dried blood look like wet blood with scratches on it.
 */
export function createBloodDryTexture(seed = 0) {
  const rand = creatureRand(0x3d9e77 + seed * 8663);
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const r = S * (0.23 + rand() * 0.12);
  blob(ctx, rand, S / 2, S / 2, r, BLOOD_DRY, 0.54, 6, 0.8 + rand() * 0.45);
  blob(ctx, rand, S / 2, S / 2, r * 0.7, BLOOD_CRUST, 0.42, 5);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  for (let i = 0; i < 5 + Math.floor(rand() * 6); i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    let x = S / 2 + Math.cos(a) * d;
    let y = S / 2 + Math.sin(a) * d;
    let dir = rand() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(0,0,0,' + (0.30 + rand() * 0.35) + ')';
    ctx.lineWidth = 0.8 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      dir += (rand() - 0.5) * 1.3;
      x += Math.cos(dir) * r * 0.16;
      y += Math.sin(dir) * r * 0.16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  spatter(ctx, rand, S / 2, S / 2, r, BLOOD_CRUST, 8 + Math.floor(rand() * 12));
  return decal(canvas);
}

/**
 * Blood running DOWN a wall: a source smear at the top, rivulets below it.
 *
 * Top-anchored, the mirror of createDampStainTexture's bottom anchor, because
 * this one is falling rather than wicking. Every rivulet ends in a rounded
 * head: surface tension gathers the front of a run into a bead, and a run that
 * merely tapers to nothing reads as a brush stroke instead of as liquid. The
 * runs are also of deliberately UNEVEN length -- equal ones read as a comb.
 */
export function createBloodWallRunTexture(seed = 0) {
  const rand = creatureRand(0x51ab2f + seed * 7333);
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');

  const cx = S * (0.34 + rand() * 0.32);
  const srcR = S * (0.13 + rand() * 0.10);
  blob(ctx, rand, cx, srcR * 0.75, srcR, BLOOD_WET, 0.62, 5, 0.75);
  blob(ctx, rand, cx, srcR * 0.75, srcR * 0.6, BLOOD_DEEP, 0.7, 4, 0.75);

  const runs = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < runs; i++) {
    const x0 = cx + (rand() - 0.5) * srcR * 1.7;
    const len = S * (0.22 + rand() * 0.66);
    const w = 1.6 + rand() * 4.2;
    ctx.strokeStyle = 'rgba(' + BLOOD_DEEP[0] + ',' + BLOOD_DEEP[1] + ',' + BLOOD_DEEP[2]
      + ',' + (0.5 + rand() * 0.35) + ')';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, srcR * 0.6);
    let x = x0;
    const steps = 6;
    for (let k = 1; k <= steps; k++) {
      x += (rand() - 0.5) * 5;
      ctx.lineTo(x, srcR * 0.6 + (len * k) / steps);
    }
    ctx.stroke();
    // The bead at the front of the run.
    ctx.fillStyle = 'rgba(' + BLOOD_DEEP[0] + ',' + BLOOD_DEEP[1] + ',' + BLOOD_DEEP[2]
      + ',' + (0.62 + rand() * 0.3) + ')';
    ctx.beginPath();
    ctx.ellipse(x, srcR * 0.6 + len, w * 0.85, w * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  spatter(ctx, rand, cx, srcR * 0.9, srcR, BLOOD_WET, 6 + Math.floor(rand() * 10), 1.1);
  return decal(canvas);
}

/**
 * Blood on the CEILING, seen from below: a soaked patch with gather points.
 *
 * The gather points are the reason this is its own texture rather than the pool
 * reused upside down. Liquid on a ceiling does not sit in an even film; it
 * creeps to low spots and hangs there, so the shape is a broad thin stain with
 * two or three much darker beads in it -- and those beads are where
 * backroomsLevel hangs its drip strands, so the geometry and the painting agree
 * about where the drips are coming from.
 */
export function createBloodCeilingTexture(seed = 0) {
  const rand = creatureRand(0x2c7f41 + seed * 6143);
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const r = S * (0.25 + rand() * 0.12);
  blob(ctx, rand, S / 2, S / 2, r, BLOOD_DEEP, 0.46, 7, 0.85 + rand() * 0.3);
  for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.5;
    blob(ctx, rand, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d,
      r * (0.16 + rand() * 0.12), BLOOD_DEEP, 0.8, 3);
  }
  spatter(ctx, rand, S / 2, S / 2, r, BLOOD_DEEP, 6 + Math.floor(rand() * 10), 1.0);
  return decal(canvas);
}

/**
 * One hanging strand, for the drips under a ceiling stain.
 *
 * A thread that swells to a bead at the bottom. It is the one blood decal that
 * is GEOMETRY rather than paint on an existing surface, because a drip hanging
 * in the air is exactly that -- there is no surface under a ceiling to paint it
 * on, and without these the ceiling stain reads as a stain rather than as
 * something still coming down.
 */
export function createBloodDripStrandTexture(seed = 0) {
  const rand = creatureRand(0x6e21b5 + seed * 5849);
  const W = 32, H = 256;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const len = H * (0.45 + rand() * 0.5);
  const w = 2.2 + rand() * 3.0;
  ctx.strokeStyle = 'rgba(' + BLOOD_DEEP[0] + ',' + BLOOD_DEEP[1] + ',' + BLOOD_DEEP[2] + ',0.88)';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2 + (rand() - 0.5) * 3, len);
  ctx.stroke();
  ctx.fillStyle = 'rgba(' + BLOOD_DEEP[0] + ',' + BLOOD_DEEP[1] + ',' + BLOOD_DEEP[2] + ',0.94)';
  ctx.beginPath();
  ctx.ellipse(W / 2, len, w * 1.15, w * 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  return decal(canvas);
}


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
  for (let i = 0; i < DAMP_STAINS; i++) {
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

  // Mildew speckle, rejection-sampled so it only lands inside the stains. With
  // DAMP_STAINS at 0 there is nothing to sample and this draws nothing -- the
  // guard is what stops stains[floor(rand * 0)] handing back undefined.
  ctx.fillStyle = 'rgba(24, 20, 10, 0.35)';
  for (let i = 0; stains.length && i < MILDEW_SPECKS; i++) {
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
  for (let i = 0; i < RUN_STREAKS; i++) {
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

/**
 * Dirt in the TILING carpet, and this is NOT the same edit the wallpaper got.
 *
 * The floor is ONE plane spanning the whole 53 x 53 m bounding box, tiled every
 * 2.6 m: 424 tiles of this canvas. Nine wet patches were therefore about 3,800
 * wet patches and six mould blooms about 2,500, all on a dead-regular 2.6 m
 * grid -- the wallpaper's problem an order of magnitude worse.
 *
 * THE OBVIOUS FIX WAS WRONG, and the asymmetry is worth spelling out because it
 * is invisible until you look. On the WALL the stains lived only in the COLOUR
 * pass; backroomsWallHeight() was never touched and still carries the roll
 * seams and blisters, which is why the wall decals can be colour-only and still
 * sit on a surface with topology. On the FLOOR the wet patches are drawn into
 * the HEIGHT canvas, and heightToNormalMap() derives the floor's normal map
 * from it. They are the only large-scale feature in there. Zeroing them to
 * match the wallpaper would have deleted the carpet's entire undulation along
 * with the stain -- measured on a 16x downsample, coarse normal tilt collapses
 * from 2.70 deg mean to 0.54, and the coarse height range from 50..129 to
 * 114..129. The floor is the surface most often seen at a grazing angle under
 * pooled fluorescents, so it is the worst possible place to lose raking-light
 * response, and a flat colour decal dropped on it reads as a sticker.
 *
 * So the patches STAY in the height canvas and what was deleted is the COLOUR
 * consequence: createDampCarpetTexture no longer tints h < 92 toward `wet`.
 * That is the true equivalent of the wall fix -- the stain's colour leaves the
 * tiling texture, its topology does not. What survives is the shade term, a
 * ~9% darkening where the pile is matted, with no hue shift: enough to be the
 * floor's tonal variation, far too subtle to read as a repeated stain. It also
 * degrades better under tiling than a colour blob ever could, because the
 * normal response changes with each corridor's own lighting while a dark blob
 * looks identical everywhere -- which is precisely why the repeat was visible.
 *
 * The MOULD blooms were pure colour and are the ones that read as stains, so
 * they are cut from six to three AND rescaled: radius 150-250 px at 6% alpha
 * rather than 34-98 px at 20%. At that size one bloom is most of a tile and
 * never resolves as a shape, so it carries tone without being a mark. The
 * discrete floor staining is decals now -- see createFloorStainTexture.
 */
const CARPET_WET_PATCHES = 9;
const CARPET_MOULD_BLOOMS = 3;

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
  for (let i = 0; i < CARPET_WET_PATCHES; i++) {
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
    // NO WET TINT. This used to pull anything under h = 92 toward `wet`, which
    // is what turned the height canvas's nine recessed patches into nine
    // visible stains -- and then into ~3,800 of them once the floor tiled this
    // canvas 424 times. The recesses are still there and still shade
    // themselves through the `shade` term above; what is gone is the extra
    // colour that made them read as damage rather than as matted pile. See the
    // note on CARPET_WET_PATCHES. `wet` is kept in the signature because
    // createFloorStainTexture takes the same colour for the decals that
    // replaced these.
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
  for (let i = 0; i < CARPET_MOULD_BLOOMS; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    // Deliberately BIGGER and fainter than a stain: at this radius one bloom
    // covers most of the tile, so it never resolves as a repeated shape.
    const r = 150 + Math.random() * 100;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + mould[0] + ',' + mould[1] + ',' + mould[2] + ',0.06)');
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

// ---------------------------------------------------------------------------
// Backrooms ceiling fixtures
//
// A fluorescent troffer is three surfaces the player reads separately, so it
// gets three maps rather than one: the painted steel pan, the tubes inside it,
// and the prismatic lens across the front. Splitting them is what lets the
// tubes glow while the pan stays dull and the lens shows what is trapped
// behind it -- one shared material could not do any of that.
// ---------------------------------------------------------------------------

/**
 * One fluorescent tube, wrapped around a cylinder.
 *
 * The canvas is TALL, not wide, because CylinderGeometry runs u around the
 * circumference and v along the axis: anything that has to vary along the tube
 * has to vary down the canvas.
 *
 * `age` from 0 (recently relamped) to 1 (should have been replaced a decade
 * ago) drives the two things that actually date a fluorescent: how far the
 * mercury has blackened the glass back from each electrode, and how far the
 * phosphor has yellowed and gone blotchy. It doubles as the emissive map, so
 * the blackened ends do not glow -- which is the whole reason to bother, and
 * why an old tube reads as a bright bar with dark stubs rather than as an
 * evenly lit stick.
 */
export function createFluorescentTubeTexture({ age = 0.5 } = {}) {
  const canvas = makeCanvas(96, 512);
  const ctx = canvas.getContext('2d');

  // Halophosphate is a faintly green-grey when it is off, never white. Painting
  // it white is what makes an unlit tube read as a plastic rod in torchlight.
  ctx.fillStyle = '#e3e1d3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Yellowing, then blotching, with age.
  ctx.fillStyle = `rgba(158, 134, 76, ${0.06 + age * 0.20})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * canvas.height;
    const g = ctx.createLinearGradient(0, y - 26, 0, y + 26);
    g.addColorStop(0, 'rgba(150, 130, 84, 0)');
    g.addColorStop(0.5, `rgba(150, 130, 84, ${0.05 + age * 0.14})`);
    g.addColorStop(1, 'rgba(150, 130, 84, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 26, canvas.width, 52);
  }

  // Electrode blackening. Real tubes darken from the ends inward, and how far
  // in it has crept is how you tell across a room which fixture is about to go.
  const endLen = canvas.height * (0.04 + age * 0.10);
  [0, 1].forEach((end) => {
    const outer = end ? canvas.height : 0;
    const inner = end ? canvas.height - endLen : endLen;
    const g = ctx.createLinearGradient(0, outer, 0, inner);
    g.addColorStop(0, `rgba(24, 19, 14, ${0.60 + age * 0.38})`);
    g.addColorStop(0.35, `rgba(58, 42, 27, ${0.34 + age * 0.44})`);
    g.addColorStop(1, 'rgba(96, 74, 46, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, end ? canvas.height - endLen : 0, canvas.width, endLen);
  });

  // The printed spec band. Illegible at this size and meant to be: it is there
  // so the tube carries one hard machine-made edge among all the soft staining,
  // which is what stops the whole thing reading as hand-painted.
  ctx.fillStyle = 'rgba(88, 86, 78, 0.45)';
  ctx.fillRect(0, canvas.height * 0.17, canvas.width, 5);
  ctx.fillRect(0, canvas.height * 0.17 + 8, canvas.width, 2);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return finish(canvas, 1, 1);
}

const DIFFUSER_CELL = 16;

let _lensHeight = null;
function lensHeight() {
  return (_lensHeight ??= buildLensHeightCanvas());
}

function buildLensHeightCanvas() {
  const canvas = makeCanvas(512, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // The moulded prisms, as a height field. ONLY the prisms go in here: the
  // insects sit behind the acrylic, so embossing them would be wrong -- which
  // is also why one height canvas can serve every lens variant.
  for (let x = 0; x < canvas.width; x += DIFFUSER_CELL) {
    for (let y = 0; y < canvas.height; y += DIFFUSER_CELL) {
      const g = ctx.createLinearGradient(x, y, x + DIFFUSER_CELL, y + DIFFUSER_CELL);
      g.addColorStop(0, '#c8c8c8');
      g.addColorStop(0.5, '#8a8a8a');
      g.addColorStop(1, '#3c3c3c');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, DIFFUSER_CELL, DIFFUSER_CELL);
    }
  }
  ctx.strokeStyle = 'rgba(24, 24, 24, 0.55)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += DIFFUSER_CELL) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += DIFFUSER_CELL) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(canvas.width, y + 0.5); ctx.stroke();
  }
  return canvas;
}

/**
 * The prismatic lens across the front of a troffer, seen from below.
 *
 * Three things are doing the work, and the third is the one that matters:
 *
 *  1. The moulded prisms, which give the acrylic its glitter instead of a flat
 *     milky sheet, and which the torch catches when the fixture is dead.
 *  2. The two soft bands where the tubes sit behind it -- a lensed fixture
 *     shows you WHERE the light is without showing you the tube, and that is
 *     the whole visual difference from a bare one.
 *  3. THE DEAD INSECTS PILED IN THE PAN. Every fluorescent that has been up
 *     for a decade has them, they are visible only as silhouettes and only
 *     while the thing is lit, and nothing else in this game has them. They are
 *     what make a ceiling light read as abandoned rather than merely old.
 *
 * Used as both `map` and `emissiveMap`, so the silhouettes stay dark against
 * the glow instead of washing out with it.
 */
export function createTrofferLensTexture({ bugs = 30, grime = 0.5, cracked = false } = {}) {
  const canvas = makeCanvas(512, 256);
  const ctx = canvas.getContext('2d');

  // Aged acrylic: white when it went up, tea-coloured after twenty years of
  // being cooked from the inside.
  const r0 = Math.round(236 - grime * 30);
  const g0 = Math.round(230 - grime * 46);
  const b0 = Math.round(206 - grime * 76);
  ctx.fillStyle = `rgb(${r0}, ${g0}, ${b0})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // The tubes behind the lens. 0.274 / 0.726 is where the two of them actually
  // sit: 0.14 m either side of the centre of a 0.62 m fixture.
  [0.274, 0.726].forEach((t) => {
    const y = canvas.height * t;
    const g = ctx.createLinearGradient(0, y - 52, 0, y + 52);
    g.addColorStop(0, 'rgba(255, 251, 232, 0)');
    g.addColorStop(0.5, 'rgba(255, 251, 232, 0.6)');
    g.addColorStop(1, 'rgba(255, 251, 232, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 52, canvas.width, 104);
  });
  // ...and the shadow the pan's end walls throw on it, so the lens does not
  // glow right up to the frame.
  [[0, 1], [canvas.width, -1]].forEach(([x, dir]) => {
    const g = ctx.createLinearGradient(x, 0, x + dir * 54, 0);
    g.addColorStop(0, 'rgba(40, 36, 26, 0.45)');
    g.addColorStop(1, 'rgba(40, 36, 26, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x, x + dir * 54), 0, 54, canvas.height);
  });

  // The prisms.
  for (let x = 0; x < canvas.width; x += DIFFUSER_CELL) {
    for (let y = 0; y < canvas.height; y += DIFFUSER_CELL) {
      const g = ctx.createLinearGradient(x, y, x + DIFFUSER_CELL, y + DIFFUSER_CELL);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      g.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
      g.addColorStop(1, 'rgba(28, 26, 18, 0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, DIFFUSER_CELL, DIFFUSER_CELL);
    }
  }

  // The insects. Denser toward the middle, because that is where the pan sags
  // and they slide to; about half get wings, which is what separates a moth
  // from a fly once you are down to a silhouette.
  for (let i = 0; i < bugs; i++) {
    const pull = Math.random();
    const x = canvas.width * (0.5 + (Math.random() - 0.5) * (0.9 - pull * 0.35));
    const y = canvas.height * (0.5 + (Math.random() - 0.5) * (0.82 - pull * 0.35));
    const s = 3 + Math.random() * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = `rgba(26, 22, 15, ${0.45 + Math.random() * 0.4})`;
    if (Math.random() < 0.5) {
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(-s * 0.62, -s * 0.1, s * 0.52, s * 0.8, -0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.62, -s * 0.1, s * 0.52, s * 0.8, 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.38, s, 0, 0, Math.PI * 2); ctx.fill();
    // Legs on the bigger ones only -- under about six pixels they read as
    // noise around the body rather than as legs.
    if (s > 6) {
      ctx.strokeStyle = 'rgba(26, 22, 15, 0.5)';
      ctx.lineWidth = 0.8;
      for (let l = 0; l < 3; l++) {
        const ly = -s * 0.4 + l * s * 0.4;
        ctx.beginPath(); ctx.moveTo(-s * 0.3, ly); ctx.lineTo(-s * 0.95, ly - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.3, ly); ctx.lineTo(s * 0.95, ly - 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Dust and nicotine-coloured film, heaviest against the frame where nobody
  // has ever wiped.
  [0, 1].forEach((edge) => {
    const y = edge ? canvas.height : 0;
    const dir = edge ? -1 : 1;
    const g = ctx.createLinearGradient(0, y, 0, y + dir * 34);
    g.addColorStop(0, `rgba(74, 64, 42, ${0.20 + grime * 0.24})`);
    g.addColorStop(1, 'rgba(74, 64, 42, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y, y + dir * 34), canvas.width, 34);
  });
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 30 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(86, 74, 46, ${0.10 + grime * 0.16})`);
    g.addColorStop(1, 'rgba(86, 74, 46, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  if (cracked) {
    // A crack in a backlit lens reads BRIGHT, not dark: the fracture face
    // scatters the light behind it straight down at you.
    const path = () => {
      let x = canvas.width * (0.2 + Math.random() * 0.2);
      let y = 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < canvas.height) {
        x += (Math.random() - 0.45) * 46;
        y += 18 + Math.random() * 26;
        ctx.lineTo(x, y);
      }
    };
    path();
    ctx.strokeStyle = 'rgba(60, 54, 38, 0.45)';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 246, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  return finish(canvas, 1, 1);
}

export function createTrofferLensNormalTexture() {
  return finishBump(heightToNormalMap(lensHeight(), 1.0), 1, 1);
}

let _fixtureSteelHeight = null;
function fixtureSteelHeight() {
  return (_fixtureSteelHeight ??= buildFixtureSteelHeightCanvas());
}

function buildFixtureSteelHeightCanvas() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Orange peel -- the pebbled finish baked enamel gets on sheet steel, and the
  // whole reason the pan reads as painted metal rather than as plastic.
  ctx.globalAlpha = 0.5;
  ctx.drawImage(smoothNoiseCanvas(canvas.width, 64), 0, 0);
  ctx.globalAlpha = 1;

  // Shallow dents, because these get knocked every time a lamp is changed.
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 12 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(70, 70, 70, 0.55)');
    g.addColorStop(1, 'rgba(128, 128, 128, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Scratches, down to bare metal.
  ctx.strokeStyle = 'rgba(190, 190, 190, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const a = Math.random() * Math.PI * 2;
    const len = 6 + Math.random() * 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Baked white enamel on sheet steel, for the fixture pan and its frame.
 *
 * Tiles, because one map has to wrap the frame, the sloped reflector and the
 * end plates and none of them share a UV scale. Kept BRIGHT on purpose: the
 * pan is a reflector, and the reason a troffer throws a soft pool rather than
 * two hard stripes is that this surface bounces.
 */
export function createFixtureSteelTexture({ rust = 0.5 } = {}) {
  const height = fixtureSteelHeight();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;

  const canvas = makeCanvas(height.width, height.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < hData.length; i += 4) {
    const shade = 0.80 + (hData[i] / 255) * 0.34;
    out.data[i] = Math.min(255, 214 * shade);
    out.data[i + 1] = Math.min(255, 208 * shade);
    out.data[i + 2] = Math.min(255, 190 * shade);
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // Water has been through this ceiling: rust blooms out of the seams and runs
  // down. The same story the ceiling tiles already tell, retold on the one
  // surface up there close enough to the player to show it in detail.
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 10 + Math.random() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(122, 74, 34, ${0.24 + rust * 0.4})`);
    g.addColorStop(0.6, `rgba(104, 70, 40, ${0.10 + rust * 0.2})`);
    g.addColorStop(1, 'rgba(104, 70, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = 30 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(58, 54, 40, 0.22)');
    g.addColorStop(1, 'rgba(58, 54, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  return finish(canvas, 1, 1);
}

export function createFixtureSteelNormalTexture() {
  return finishBump(heightToNormalMap(fixtureSteelHeight(), 1.1), 1, 1);
}

/**
 * Worn paint on sheet steel, in any colour: the shared finish for painted
 * machinery. Built off the same height field as the fixture steel (orange
 * peel, dents, scratches), so createFixtureSteelNormalTexture is its normal
 * map too. The scratches go through to bare grey metal, rust blooms out of a
 * few of them and runs down, and grime gathers toward the bottom, where a
 * machine standing on a floor collects it.
 *
 * `base` is the paint as [r, g, b] in sRGB.
 */
export function createPaintedSteelTexture({ base = [52, 104, 98], rust = 0.6 } = {}) {
  const height = fixtureSteelHeight();
  const hData = height.getContext('2d').getImageData(0, 0, height.width, height.height).data;
  const S = height.width;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(S, S);
  for (let i = 0; i < hData.length; i += 4) {
    // The height field only shades the paint -- its orange peel is far too
    // busy to stand in for scratches, which read as camouflage when it did.
    const shade = 0.9 + (hData[i] / 255) * 0.16;
    out.data[i] = base[0] * shade;
    out.data[i + 1] = base[1] * shade;
    out.data[i + 2] = base[2] * shade;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // Scratches through to bare steel, and a few chips knocked out of the edges
  // of panels -- drawn on purpose, sparse, the way wear actually lands.
  ctx.strokeStyle = 'rgba(150, 150, 146, 0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const a = Math.random() * Math.PI * 2;
    const len = 8 + Math.random() * 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(132, 132, 128, 0.8)';
    blobPath(ctx, Math.random() * S, Math.random() * S, 2 + Math.random() * 4, 1.5 + Math.random() * 3);
    ctx.fill();
  }

  for (let i = 0; i < 6; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S * 0.8;
    const r = 6 + Math.random() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(112, 60, 26, ${0.35 + rust * 0.4})`);
    g.addColorStop(1, 'rgba(112, 60, 26, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // The run below it.
    const run = ctx.createLinearGradient(0, y, 0, y + 40 + Math.random() * 60);
    run.addColorStop(0, `rgba(104, 58, 28, ${0.25 * rust})`);
    run.addColorStop(1, 'rgba(104, 58, 28, 0)');
    ctx.fillStyle = run;
    ctx.fillRect(x - 1.5, y, 3, 100);
  }
  const grime = ctx.createLinearGradient(0, S, 0, S * 0.55);
  grime.addColorStop(0, 'rgba(40, 34, 24, 0.35)');
  grime.addColorStop(1, 'rgba(40, 34, 24, 0)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, S, S);

  return finish(canvas, 1, 1);
}

/**
 * An analogue panel gauge's face: cream, with a black scale sweeping 270
 * degrees from bottom-left to bottom-right, numbers every `step`, a red band
 * at the top of the range, and its unit printed under the pivot. Laid out for
 * a CircleGeometry, which maps the disc onto the whole canvas.
 *
 * The level turns its needle with the same 270-degree sweep, so a value on
 * the needle reads against the same number here.
 */
export function createGaugeFaceTexture({ label, max, step }) {
  const S = 256;
  const c = S / 2;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8e0c8';
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
  // Yellowed toward the rim, under forty years of a dirty glass.
  const age = ctx.createRadialGradient(c, c, c * 0.4, c, c, c);
  age.addColorStop(0, 'rgba(150, 120, 60, 0)');
  age.addColorStop(1, 'rgba(150, 120, 60, 0.35)');
  ctx.fillStyle = age;
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();

  // Angle 0 is straight up; the scale runs -135 to +135 degrees, clockwise.
  const toCanvas = (deg, r) => {
    const a = (deg - 90) * Math.PI / 180;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r];
  };
  const SWEEP = 135;
  ctx.strokeStyle = '#a11d16';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.78, (SWEEP * 0.72 - 90) * Math.PI / 180, (SWEEP - 90) * Math.PI / 180);
  ctx.stroke();

  ctx.strokeStyle = '#1a1712';
  ctx.fillStyle = '#1a1712';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px Arial, sans-serif';
  const minorEvery = step / 5;
  for (let v = 0; v <= max + 1e-6; v += minorEvery) {
    const deg = -SWEEP + (v / max) * 2 * SWEEP;
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const [x0, y0] = toCanvas(deg, c * (major ? 0.68 : 0.74));
    const [x1, y1] = toCanvas(deg, c * 0.84);
    ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (major) {
      const [tx, ty] = toCanvas(deg, c * 0.52);
      ctx.fillText(String(Math.round(v)), tx, ty);
    }
  }
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(label, c, c * 1.45);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#111';
  ctx.beginPath(); ctx.arc(c, c, c - 4, 0, Math.PI * 2); ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Ribbed flexible exhaust hose: bands of bright and shadowed metal running
 * round it. For a TubeGeometry, whose u runs along the hose -- set
 * `map.repeat.x` to the number of ribs along its length. Returns a colour map
 * and a bump map from the same bands.
 */
export function createRibbedHoseTexture() {
  const W = 64;
  const H = 16;
  const colour = makeCanvas(W, H);
  const cctx = colour.getContext('2d');
  const height = makeCanvas(W, H);
  const hctx = height.getContext('2d');
  for (let x = 0; x < W; x++) {
    const ridge = 0.5 + 0.5 * Math.cos((x / W) * Math.PI * 2);
    const v = Math.round(70 + ridge * 110);
    cctx.fillStyle = `rgb(${v}, ${v}, ${Math.round(v * 0.97)})`;
    cctx.fillRect(x, 0, 1, H);
    const hv = Math.round(ridge * 255);
    hctx.fillStyle = `rgb(${hv}, ${hv}, ${hv})`;
    hctx.fillRect(x, 0, 1, H);
  }
  return { map: finish(colour, 1, 1), bumpMap: finishBump(height, 1, 1) };
}

/**
 * The maker's plate riveted to the generator's door: stamped brushed
 * aluminium, with the date that puts the machine squarely in its decade.
 */
export function createDataPlateTexture(lines) {
  const W = 320;
  const H = 180;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a9aba8';
  ctx.fillRect(0, 0, W, H);
  // Brushed: fine horizontal streaks.
  for (let y = 0; y < H; y++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'}, ${Math.random() * 0.08})`;
    ctx.fillRect(0, y, W, 1);
  }
  ctx.strokeStyle = '#2a2a28';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = '#5a5c58';
  for (const [x, y] of [[20, 20], [W - 20, 20], [20, H - 20], [W - 20, H - 20]]) {
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#1e1e1c';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? 'bold 24px Arial, sans-serif' : '19px "Courier New", monospace';
    ctx.fillText(line, W / 2, 48 + i * 30);
  });
  return finish(canvas, 1, 1);
}


/**
 * The glare around a lit fixture -- a sprite, not geometry.
 *
 * There is no bloom in this game (world/Postprocessing.js is RenderPass, the
 * visor and OutputPass, and nothing else), so an emissive tube clamps at white
 * and stops. Every lit fixture in the corridor was therefore exactly as bright
 * as its own texture and no brighter, which is what made them read as light
 * painted onto a ceiling rather than as lamps.
 *
 * A billboarded additive sprite fakes the eye's own response for the cost of
 * one quad, and being billboarded it survives being looked at from down the
 * corridor -- a flat quad under the fixture would foreshorten to nothing at
 * exactly the angle the player spends most of their time at.
 */
export function createLampGlareTexture() {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 248, 222, 0.95)');
  g.addColorStop(0.12, 'rgba(255, 240, 194, 0.52)');
  g.addColorStop(0.32, 'rgba(255, 226, 152, 0.17)');
  g.addColorStop(0.62, 'rgba(255, 214, 122, 0.05)');
  g.addColorStop(1, 'rgba(255, 208, 110, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A horizontal streak, so the halo keeps some memory of the shape of the
  // thing making it instead of being a perfect circle over a long thin lamp.
  const s = ctx.createLinearGradient(0, 0, canvas.width, 0);
  s.addColorStop(0, 'rgba(255, 236, 186, 0)');
  s.addColorStop(0.5, 'rgba(255, 236, 186, 0.30)');
  s.addColorStop(1, 'rgba(255, 236, 186, 0)');
  ctx.fillStyle = s;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillRect(0, 116, canvas.width, 24);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Standing water
//
// A puddle is not a shape, it is a DEPTH FIELD, and everything the eye uses to
// call something water falls out of that one field:
//
//   how much water   ->  opacity      a shallow fringe you can see carpet
//                                     through, a deep middle you cannot
//   how much water   ->  roughness    the single biggest cue there is. The
//                                     deep middle takes a specular highlight
//                                     off the torch; the damp fringe does not,
//                                     because wet carpet is still carpet
//   where it stops   ->  a tide line  silt concentrates at the shoreline as a
//                                     puddle dries back, and a decal without
//                                     one always reads as a sticker
//   surface          ->  normals      low, broad undulation in the deep part.
//                                     This is what shatters the highlight into
//                                     something that moves like water instead
//                                     of a single sliding blob
//
// So each variant builds ONE greyscale mask and derives four maps from it, and
// the maps can never disagree about where the water is. What makes the
// variants different from each other is only how the mask is drawn.
//
// The old puddles were a single CircleGeometry with one flat translucent
// material -- same disc, same gloss edge to edge, twenty visible straight
// segments around the rim, and no answer to "why is there water here".
// ---------------------------------------------------------------------------

/**
 * The puddle patterns, in the order the level indexes them.
 *
 * Each is a different ANSWER to why there is water on this carpet, not just a
 * different outline -- which is what stops eight variants from reading as one
 * variant stretched eight ways:
 *
 *   pool    something dripped here for a long time and has not dried
 *   spill   it arrived moving, and stopped
 *   seep    it came up through the floor; almost all fringe, barely any pool
 *   drips   a scatter of separate splashes under a leak that spatters
 *   ring    it was much bigger once. Only the tide mark is still wet
 *   streak  it ran down a wall and out across the floor
 *   smear   something was dragged through it
 *   ripple  a live drip is still landing in it -- the only one with rings
 */
export const PUDDLE_PATTERNS = ['pool', 'spill', 'seep', 'drips', 'ring', 'streak', 'smear', 'ripple'];

const PUDDLE_SIZE = 256;

/**
 * The depth field for one pattern: white is deep, black is dry carpet.
 *
 * Every variant draws hard-edged shapes and then blurs, because the blur is
 * what produces the damp fringe -- the shoreline of a real puddle is a
 * gradient tens of millimetres wide where the pile has wicked, not an edge.
 * The blur radius is therefore how far the water has soaked out, and is the
 * one number that most changes a variant's character.
 */
function buildPuddleMask(variant) {
  const S = PUDDLE_SIZE;
  const C = S / 2;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';

  const blob = (cx, cy, rx, ry, opts) => {
    const rs = blobPath(ctx, cx, cy, rx, ry, opts);
    ctx.fill();
    return rs;
  };
  const spun = (angle, draw) => {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(angle);
    ctx.translate(-C, -C);
    draw();
    ctx.restore();
  };

  let blur = 9;

  if (variant === 'spill') {
    // A head that stopped, and the tail it came in on.
    spun(Math.random() * Math.PI * 2, () => {
      blob(C + 22, C, 62, 44, { lobes: 11, wobble: 0.45 });
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        blob(C - 14 - t * 76, C + (Math.random() - 0.5) * 18, 30 - t * 20, 21 - t * 14,
          { lobes: 8, wobble: 0.5 });
      }
    });
    blur = 8;
  } else if (variant === 'seep') {
    // Groundwater, not a leak: a wide damp stain with barely any standing
    // water in it. The mid-grey fill is what makes it mostly fringe.
    ctx.fillStyle = '#6e6e6e';
    blob(C, C, 100, 92, { lobes: 14, wobble: 0.38 });
    ctx.fillStyle = '#fff';
    blob(C - 10, C + 8, 32, 26, { lobes: 8, wobble: 0.6 });
    blob(C + 26, C - 18, 19, 15, { lobes: 7, wobble: 0.6 });
    blur = 17;
  } else if (variant === 'drips') {
    // A leak that spatters rather than runs, so it lands as separate splashes.
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.6) * 88;
      const r = 8 + Math.random() * 21;
      blob(C + Math.cos(a) * d, C + Math.sin(a) * d, r, r * (0.8 + Math.random() * 0.4),
        { lobes: 8, wobble: 0.4 });
    }
    blur = 6;
  } else if (variant === 'ring') {
    // A tide mark. Dropping to mid-grey inside the ring is the whole trick:
    // the middle has dried back to merely damp, and the shoreline the water
    // retreated from is the only part still holding any.
    const rot = Math.random() * Math.PI * 2;
    ctx.fillStyle = '#565656';
    const rs = blob(C, C, 94, 82, { lobes: 12, wobble: 0.35, rot });
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 17;
    ctx.lineJoin = 'round';
    // Same radii, traced smaller -- so the wet band follows this puddle's own
    // shoreline instead of being an unrelated second blob inside it.
    blobPath(ctx, C, C, 84, 73, { rot, radii: rs });
    ctx.stroke();
    blur = 11;
  } else if (variant === 'streak') {
    // Came down a wall and ran. Long, thin, and pooled at the far end.
    spun(Math.random() * Math.PI * 2, () => {
      blob(C, C, 106, 24, { lobes: 15, wobble: 0.5 });
      blob(C + 66, C + 6, 34, 30, { lobes: 9, wobble: 0.5 });
    });
    blur = 7;
  } else if (variant === 'smear') {
    // Something went through this one. The pool is still there; the drag marks
    // leaving it are thinner, which is why they get strokes rather than blobs.
    spun(Math.random() * Math.PI * 2, () => {
      blob(C - 34, C + 12, 44, 38, { lobes: 10, wobble: 0.5 });
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.lineWidth = 5 + Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(C - 34 + (Math.random() - 0.5) * 40, C + 12 + (Math.random() - 0.5) * 40);
        ctx.quadraticCurveTo(C + 30, C - 12 + (Math.random() - 0.5) * 52,
          C + 84 + (Math.random() - 0.5) * 22, C - 26 + (Math.random() - 0.5) * 60);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    });
    blur = 6;
  } else if (variant === 'ripple') {
    // Live: still being dripped into. Rounder than the rest, because it is
    // fed from one point and has never been walked through.
    blob(C, C, 78, 74, { lobes: 12, wobble: 0.22 });
    blur = 8;
  } else {
    // 'pool' -- the plain one, and still the most common.
    blob(C, C, 84, 70, { lobes: 12, wobble: 0.5, rot: Math.random() * Math.PI * 2 });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      blob(C + Math.cos(a) * 82, C + Math.sin(a) * 70, 20 + Math.random() * 15,
        18 + Math.random() * 13, { lobes: 7, wobble: 0.55 });
    }
    blur = 10;
  }

  // Rough the outline up BEFORE the blur. A blurred smooth curve is still a
  // smooth curve; a real shoreline is ragged at the millimetre scale because
  // carpet pile wicks unevenly, and this is the cheapest way to say so.
  const pre = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < pre.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 72;
    pre.data[i] += n; pre.data[i + 1] += n; pre.data[i + 2] += n;
  }
  ctx.putImageData(pre, 0, 0);
  blurCanvas(canvas, blur);
  return canvas;
}

let _puddleNoise = null;

/**
 * The four noise fields every puddle surface is built from, built ONCE.
 *
 * Three octaves, and the FINE one does most of the work. heightToNormalMap
 * reads a gradient across two texels, so how steep a normal it produces
 * depends on the FREQUENCY of the height field and not on its amplitude: the
 * first pass here used broad 25-texel swells and produced a normal map within
 * a degree of dead flat, which is why the water had no glint at all. 60 cells
 * over 256 texels is roughly a 30 mm ripple at the size these are placed,
 * which is about the scale standing water disturbed by a draught actually has.
 * Finer than that and the whole surface glitters wall to wall and reads as
 * gravel rather than as water.
 *
 * Shared across every pattern rather than rebuilt per pattern -- eight sets of
 * these was two thirds of the cost of building the puddles at boot, and since
 * each pattern masks the noise to a different shape and every puddle in the
 * level is turned to its own angle, no two of them show it the same way.
 */
function puddleNoise(S) {
  if (_puddleNoise) return _puddleNoise;
  const grab = (cells) => smoothNoiseCanvas(S, cells).getContext('2d').getImageData(0, 0, S, S).data;
  _puddleNoise = {
    ripple: grab(60),
    swell: grab(10),
    pile: grab(42),
    // Floating scum: patches where dust has settled on the surface and killed
    // the gloss. Without them the deep water is uniformly polished, which is
    // the one thing standing water in a derelict building never is.
    scum: grab(6)
  };
  return _puddleNoise;
}

/**
 * Every map one puddle needs, derived from a single depth field.
 *
 * Returns { map, alphaMap, roughnessMap, normalMap } -- one material's worth,
 * meant to be built once per pattern and shared by every puddle using it.
 *
 * On the colour: NOT the near-black, near-mirror this obviously wants to be.
 * There is no environment map in this scene, so a smooth dark surface has
 * nothing to reflect and renders as a flat black hole cut in the floor. What
 * sells water here instead is the roughness map -- a glossy middle inside a
 * matte fringe, lit by a torch that moves.
 */
export function createPuddleTextures(variant = 'pool') {
  const S = PUDDLE_SIZE;
  const mask = buildPuddleMask(variant);
  const m = mask.getContext('2d').getImageData(0, 0, S, S).data;

  const { ripple, swell, pile, scum } = puddleNoise(S);

  const albedo = makeCanvas(S, S);
  const alpha = makeCanvas(S, S);
  const rough = makeCanvas(S, S);
  const height = makeCanvas(S, S);
  const aCtx = albedo.getContext('2d');
  const tCtx = alpha.getContext('2d');
  const rCtx = rough.getContext('2d');
  const hCtx = height.getContext('2d');
  const aImg = aCtx.createImageData(S, S);
  const tImg = tCtx.createImageData(S, S);
  const rImg = rCtx.createImageData(S, S);
  const hImg = hCtx.createImageData(S, S);

  const SOAK = [64, 55, 34];    // carpet with water in it: the same fibres, darker
  const DEEP = [20, 18, 14];    // water over carpet, deep enough to hide it
  const SILT = [108, 95, 62];   // what the water left at the shoreline

  for (let i = 0; i < m.length; i += 4) {
    const v = m[i] / 255;
    const wet = smoothstep(0.05, 0.34, v);    // is there any water here
    const deep = smoothstep(0.34, 0.80, v);   // is it standing rather than soaked in
    // The tide line: a narrow band right where the water stops.
    const tide = Math.max(0, 1 - Math.abs(v - 0.33) / 0.10) * (1 - deep);

    let r = SOAK[0] + (DEEP[0] - SOAK[0]) * deep;
    let g = SOAK[1] + (DEEP[1] - SOAK[1]) * deep;
    let b = SOAK[2] + (DEEP[2] - SOAK[2]) * deep;
    r += (SILT[0] - r) * tide * 0.55;
    g += (SILT[1] - g) * tide * 0.55;
    b += (SILT[2] - b) * tide * 0.55;
    // Silt suspended in the deeper water, so the middle is not a flat wash.
    const cloud = (swell[i] / 255 - 0.5) * 22 * deep;
    aImg.data[i] = r + cloud;
    aImg.data[i + 1] = g + cloud;
    aImg.data[i + 2] = b + cloud;
    aImg.data[i + 3] = 255;

    // Opacity tops out well short of 1. Fully opaque water on a carpet loses
    // the fibres showing through, and with them the only thing telling you
    // what the water is sitting ON.
    const a = wet * 0.52 + deep * 0.34;
    tImg.data[i] = tImg.data[i + 1] = tImg.data[i + 2] = a * 255;
    tImg.data[i + 3] = 255;

    // Gloss only where there is standing water, dulled again under the scum --
    // and PATCHY across the rest of it. A uniform gloss gives one specular blob
    // sliding around the puddle like a spotlight on a floor; broken gloss gives
    // a scatter of glints that appear and go out as the torch swings, which is
    // what reads as a surface with something on it.
    const film = Math.max(0, scum[i] / 255 - 0.5) * 1.7;
    let ro = 0.96 - deep * 0.80 + film * 0.42 * deep;
    ro += (ripple[i] / 255 - 0.5) * 0.06 * deep;
    ro += (pile[i] / 255 - 0.5) * 0.06;
    rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.min(255, Math.max(0, ro * 255));
    rImg.data[i + 3] = 255;

    // Surface: a raised lip at the shoreline (water beads on carpet rather
    // than feathering to nothing), broad swell over the deep part, and pile
    // poking through the shallows.
    const h = 128
      + tide * 34
      + (ripple[i] / 255 - 0.5) * 18 * deep
      + (swell[i] / 255 - 0.5) * 34 * deep
      + (pile[i] / 255 - 0.5) * 22 * wet * (1 - deep);
    hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = h;
    hImg.data[i + 3] = 255;
  }

  aCtx.putImageData(aImg, 0, 0);
  tCtx.putImageData(tImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);

  // Debris, on the colour map only -- grit and carpet fluff floating on the
  // surface. Flat specks, so they are not embossed into the normal map: they
  // are lying ON the water, not deforming it.
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 0.55) * S * 0.34;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d;
    if (m[((y | 0) * S + (x | 0)) * 4] < 90) continue;   // only where there is water
    aCtx.strokeStyle = Math.random() < 0.55
      ? 'rgba(16, 15, 11, 0.55)'
      : 'rgba(126, 116, 88, 0.4)';
    aCtx.lineWidth = 0.8 + Math.random();
    aCtx.beginPath();
    aCtx.moveTo(x, y);
    const len = 1 + Math.random() * 6;
    const ang = Math.random() * Math.PI * 2;
    aCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    aCtx.stroke();
  }

  if (variant === 'ripple') {
    // The only variant with rings, and only because something is still landing
    // in it. Concentric ridges in the height map turn one sliding specular
    // blob into a set of arcs that break and re-form as the torch moves --
    // which is the closest this renderer gets to water actually moving.
    hCtx.lineWidth = 2;
    for (let r = 8; r < S * 0.30; r += 7) {
      const fade = 1 - r / (S * 0.30);
      hCtx.strokeStyle = `rgba(255, 255, 255, ${0.85 * fade})`;
      hCtx.beginPath();
      hCtx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      hCtx.stroke();
      hCtx.strokeStyle = `rgba(0, 0, 0, ${0.85 * fade})`;
      hCtx.beginPath();
      hCtx.arc(S / 2, S / 2, r + 3.5, 0, Math.PI * 2);
      hCtx.stroke();
    }
    blurCanvas(height, 1);
  }

  // Clamped, not tiled. These are decals on a single quad, and RepeatWrapping
  // lets a bilinear tap at u = 0 reach across and pull in the far edge -- which
  // on the normal map is a seam of wrong-facing water right at the shoreline.
  const decal = (tex) => {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };
  return {
    map: decal(finish(albedo, 1, 1)),
    alphaMap: decal(finishBump(alpha, 1, 1)),
    roughnessMap: decal(finishBump(rough, 1, 1)),
    // 1.9, against the 1.1-1.5 the wall and floor maps use. Those height
    // canvases are per-texel noise and are already about as steep as a normal
    // map can get; this one is deliberately smooth, so it needs the extra gain
    // to reach a slope that bounces the torch back at the player at all.
    normalMap: decal(finishBump(heightToNormalMap(height, 1.9), 1, 1))
  };
}

// ===========================================================================
// The creature
// ===========================================================================
//
// Five surfaces for src/assets/models/creature.glb, bound by MATERIAL NAME
// through applyTextureByMaterialName() -- the .glb ships flat PBR colours and
// no baked maps, exactly like the props.
//
// WHY THESE ARE TILED NOISE AND NOT PAINTED MAPS. The creature is unwrapped
// with Smart UV Project, so its UV islands are an arbitrary scatter -- there is
// no stable place to paint a collar or a stain, because the island that holds
// the collar moves the moment the geometry changes. What survives that is
// MATERIAL detail: weave, pores, strand direction. Tiled, seamless, and
// meaningful wherever it lands.
//
// Everything is driven off a seeded PRNG rather than Math.random(), so the
// albedo and the normal map are drawn from the same noise -- the memoisation
// note further up this file records what happens when they are not.

/** Deterministic LCG. Same seed, same cloth, every reload and both maps. */
function creatureRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Tileable value noise, summed over octaves. Wraps, so the cloth has no seam.
 *
 * `aspect` stretches the features along y: above 1 they get longer than they
 * are wide. The stretch is done by giving the noise GRID fewer rows rather
 * than by sampling a square grid with a scaled coordinate, which matters --
 * a scaled sample only tiles when the scale divides the grid exactly, and a
 * texture that does not tile shows a hard seam wherever Smart UV Project
 * happened to put an island edge. Each octave still wraps on its own row
 * count, so any aspect at all is safe.
 */
function creatureNoise(size, seed, octaves = 4, aspect = 1) {
  const rand = creatureRand(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const rows = Math.max(1, Math.round(cells / aspect));
    const grid = new Float32Array(cells * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const step = size / cells;
    const rowStep = size / rows;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const gy = y / rowStep;
        const x0 = Math.floor(gx) % cells;
        const y0 = Math.floor(gy) % rows;
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % rows;
        const fx = gx - Math.floor(gx);
        const fy = gy - Math.floor(gy);
        // smoothstep, so the octaves read as cloth rather than as a grid
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * sx;
        const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function grayCanvas(size, fn) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = Math.max(0, Math.min(255, fn(x, y) * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * A woven cloth height field. `skew` shears the weave into a twill diagonal,
 * which is what tells trousers apart from a lab coat at a glance.
 */
function buildCreatureWeave(size, thread, skew, seed) {
  const slub = creatureNoise(size, seed, 4);
  return grayCanvas(size, (x, y) => {
    const u = x + y * skew;
    const over = (Math.floor(u / thread) + Math.floor(y / thread)) % 2 === 0;
    const rise = over
      ? Math.sin((((u % thread) + thread) % thread) / thread * Math.PI)
      : Math.sin((y % thread) / thread * Math.PI);
    return 0.42 + rise * 0.34 + (slub[y * size + x] - 0.5) * 0.22;
  });
}

const CREATURE_HEIGHT_CACHE = new Map();
function creatureHeight(key, build) {
  if (!CREATURE_HEIGHT_CACHE.has(key)) CREATURE_HEIGHT_CACHE.set(key, build());
  return CREATURE_HEIGHT_CACHE.get(key);
}

/**
 * Colour from a height field: light where the weave rises, dark in the valleys,
 * plus a second low-frequency noise as grime. `grime` is how filthy it gets --
 * the coat has been in this house since 1987.
 */
function creatureAlbedo(height, size, rgb, { contrast = 0.30, grime = 0.0, grimeSeed = 7 } = {}) {
  const src = height.getContext('2d').getImageData(0, 0, size, size).data;
  const dirt = grime > 0 ? creatureNoise(size, grimeSeed, 3) : null;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < src.length; i += 4) {
    const t = src[i] / 255;
    let shade = 1 - contrast * 0.5 + t * contrast;
    if (dirt) {
      const d = dirt[i >> 2];
      shade *= 1 - grime * Math.max(0, d - 0.35);
    }
    img.data[i] = Math.min(255, rgb[0] * shade);
    img.data[i + 1] = Math.min(255, rgb[1] * shade);
    img.data[i + 2] = Math.min(255, rgb[2] * shade);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Every map the creature needs, keyed by the material name in the .glb.
 *
 * Returns { CreatureSkin: {map, normalMap}, ... } so main.js can bind the whole
 * set in one loop instead of five hand-written calls that can drift apart from
 * the names blender/build_creature.py writes.
 *
 * NOTE ON BRIGHTNESS. These albedos carry the colour, so the caller must set
 * material.color to white -- otherwise the .glb's own base colour multiplies
 * against the map and the creature comes out twice as dark as intended.
 * Creature.js then uses material.color purely as the correction/silhouette
 * dimmer, which is exactly what it wants it for.
 */
export function createCreatureTextures() {
  const BIG = 512;    // coat and skin: the two surfaces the reveal actually lights
  const SMALL = 256;  // shirt, trousers, hair: never seen in isolation

  const coatH = creatureHeight('coat', () => buildCreatureWeave(BIG, 9, 0, 21));
  // Skin is pores over mottling, not a weave -- two noise scales multiplied so
  // the fine grain only shows where the coarse one is already light.
  const skinH = creatureHeight('skin', () => {
    const pores = creatureNoise(BIG, 33, 5);
    const mottle = creatureNoise(BIG, 34, 2);
    return grayCanvas(BIG, (x, y) => {
      const i = y * BIG + x;
      return 0.52 + (pores[i] - 0.5) * 0.30 + (mottle[i] - 0.5) * 0.26;
    });
  });
  const shirtH = creatureHeight('shirt', () => buildCreatureWeave(SMALL, 5, 0, 55));
  const trouserH = creatureHeight('trousers', () => buildCreatureWeave(SMALL, 6, 0.6, 77));
  // HAIR IS MOULDED, NOT GROWN, and that is a deliberate reversal. The version
  // before this compressed the noise 4x in y to resolve individual strands,
  // which is the one thing the hair must not do: build_creature.py models the
  // hair as a single solid piece, so a strand texture on it reads as strands
  // PAINTED on a helmet, and at 5-15 m through FogExp2 a strand is finer than
  // a pixel anyway -- it aliases into grey mush and takes the shape's edges
  // with it.
  //
  // What a sculpted hair piece actually has is CLUMPS: a handful of broad
  // masses with narrow grooves between them, at roughly a centimetre, which is
  // a feature size that survives both the fog and the mip chain. So:
  //
  //   `clump` is three octaves at aspect 3.2 -- long in the sweep direction,
  //   narrow across it. Anisotropy WITHOUT resolving strands.
  //
  //   The ridge remap is what turns noise into clumps. Plain noise is
  //   symmetric: as much of it is groove as is crest, which reads as lumpy
  //   rather than as combed. Folding it about 0.5 and raising the result to a
  //   power above 1 makes the GROOVES NARROW and the CRESTS BROAD -- a few
  //   dark partings between wide lit masses, which is what hair does.
  //
  //   `grain` is a fine, very low amplitude wobble that only stops the crests
  //   looking extruded. It is 10% of the range; any more and it is strands
  //   again by the back door.
  const hairH = creatureHeight('hair', () => {
    const clump = creatureNoise(SMALL, 91, 3, 3.2);
    const grain = creatureNoise(SMALL, 92, 5, 1.6);
    return grayCanvas(SMALL, (x, y) => {
      const i = y * SMALL + x;
      const ridge = 1 - Math.min(1, Math.abs(clump[i] - 0.5) * 2.4) ** 1.7;
      return 0.26 + ridge * 0.54 + (grain[i] - 0.5) * 0.10;
    });
  });

  /**
   * Roughness from the same height field, inverted and remapped.
   *
   * This is the cheapest PS3-era cue there is and it costs one more canvas:
   * uniform roughness makes every surface respond to the torch identically, so
   * cloth, skin and hair all read as the same plastic. Raised threads and the
   * high points of skin catch more light (lower roughness) than the valleys
   * between them, and `lo`/`hi` set how glossy each surface is allowed to get
   * -- hair near 0.45, dry cloth barely below 1.
   */
  const roughFrom = (height, size, lo, hi) => {
    const src = height.getContext('2d').getImageData(0, 0, size, size).data;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < src.length; i += 4) {
      const t = src[i] / 255;
      const v = Math.max(0, Math.min(255, (hi - (hi - lo) * t) * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  const pack = (height, size, rgb, opts, strength, repeat, rough = [0.74, 0.98]) => ({
    map: finish(creatureAlbedo(height, size, rgb, opts), repeat, repeat),
    normalMap: finishBump(heightToNormalMap(height, strength), repeat, repeat),
    roughnessMap: finishBump(roughFrom(height, size, rough[0], rough[1]), repeat, repeat)
  });

  // REPEAT COUNTS ARE THE WHOLE BALLGAME AND THEY ARE NOT INTUITIVE. Smart UV
  // Project scales its islands to fill 0-1, so the coat -- the largest island
  // by far -- gets the full texture across roughly half a metre of cloth. At a
  // repeat of 4 that put the weave at about 3 cm a thread and the lab coat came
  // out looking like a hand-knitted jumper. A lab coat's weave is closer to
  // 1 mm, so these are deliberately high: the detail should be something you
  // read as a SURFACE, not as a pattern.
  return {
    // Pale, unhealthy, and grimier than a living person's -- she has been in
    // that basement since 1987.
    CreatureSkin: pack(skinH, BIG, [150, 124, 105], { contrast: 0.22, grime: 0.45, grimeSeed: 12 }, 1.1, 9),
    // #EFEDE8, never pure white, and heavily grimed: the coat is the brightest
    // thing on the figure, so it is the one that most needs to look OLD.
    CreatureCoat: pack(coatH, BIG, [239, 237, 232], { contrast: 0.26, grime: 0.62, grimeSeed: 5 }, 1.5, 16),
    // THE CORE IS MUCH DARKER THAN THE REFERENCE, ON PURPOSE. The source calls
    // the tee heather grey (#BDBCB7) and the slacks khaki (#AD9A74), which are
    // daylight values -- used literally they came out within a few percent of
    // the coat's own brightness and the figure read as one pale mass. The whole
    // design is a PALE COAT OVER A DARK CORE: the coat only reads as a garment
    // because there is something darker inside it. So the hue is kept and the
    // value is dropped by about 60%, which is also just what 1987 basement
    // clothing looks like.
    CreatureShirt: pack(shirtH, SMALL, [74, 74, 72], { contrast: 0.34, grime: 0.40, grimeSeed: 18 }, 1.4, 16),
    CreatureTrousers: pack(trouserH, SMALL, [82, 72, 55], { contrast: 0.32, grime: 0.50, grimeSeed: 23 }, 1.5, 14),
    // Repeat 3, not 6, and a roughness range that is actually GLOSSY at the
    // top of the range. Both follow from the clumps being clumps: at 6 the
    // masses came out around 5 mm, which is strand scale by another route, and
    // the docstring above has claimed hair sits "near 0.45" since it was
    // written while this entry quietly took the default 0.74-0.98 and rendered
    // as matte felt. A broad soft sheen sliding across the crests as the torch
    // moves is the single strongest cue that a dark mass is hair and not cloth
    // -- it is most of what sells real hair at a distance, and it costs one
    // canvas that is already being generated.
    CreatureHair: pack(hairH, SMALL, [27, 33, 28], { contrast: 0.50 }, 2.4, 3, [0.38, 0.88])
  };
}
