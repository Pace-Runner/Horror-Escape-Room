import * as THREE from 'three';
import oldPaperUrl from '../assets/textures/notes/old_paper.jpg?url';
import paperWear1Url from '../assets/textures/notes/paper_wear_1.png?url';
import paperWear2Url from '../assets/textures/notes/paper_wear_2.png?url';
import paperWear3Url from '../assets/textures/notes/paper_wear_3.png?url';
import paperWear4Url from '../assets/textures/notes/paper_wear_4.png?url';
import handwritingFontUrl from '../assets/fonts/Kalam-Regular.ttf?url';

/**
 * Handwritten notes on real paper: the notes taped up round the basement lab.
 *
 * Every note is a photo of old, folded, stained office paper
 * (textures/notes/old_paper.jpg), a different part of it each time so no two
 * sheets match; its words written into it in blue ballpoint, each line a
 * little off true; one of four wear photos (paper_wear_*.png) over it as the
 * scuffs and grime of a sheet that has been handled and left in a damp
 * basement; and a ragged edge, so it is not a clean rectangle. The words stay
 * live text, so a note can be reworded without touching an image.
 *
 * The handwriting is Kalam (fonts/Kalam-Regular.ttf, SIL Open Font Licence,
 * fonts/Kalam-OFL.txt): a ballpoint hand that stays readable from a step away,
 * which matters -- with captions off the notes are the only place their words
 * are. To change the hand, drop another font in and point HANDWRITING_FONT_URL
 * at it.
 *
 * createPaperSheet() makes a note's sheet: bowed off the wall, one bottom
 * corner lifting, masking tape across the top corners.
 */
const HANDWRITING_FONT_URL = handwritingFontUrl;
const HANDWRITING_FAMILY = 'NoteHandwriting';
const PAPER_WEAR_URLS = [paperWear1Url, paperWear2Url, paperWear3Url, paperWear4Url];
/** Ballpoint blue, as it looks after years on a basement wall. */
const INK = '#1f2b62';
/** The paper colour shown for the moment before the photo has loaded. */
const BLANK_PAPER = '#cfc2a3';
/** A note's texture is this tall, in pixels; its width follows the note's shape. */
const NOTE_HEIGHT_IN_PIXELS = 1024;

/** A small seeded random generator, so a note comes out the same every time it is built. */
function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each image is fetched and decoded once, however many notes use it. */
const loadedImages = new Map();
function loadImage(url) {
  if (!loadedImages.has(url)) {
    loadedImages.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    }));
  }
  return loadedImages.get(url);
}

/** The handwriting font, loaded once. A note written before it arrives is written again after. */
let handwritingLoaded = null;
function loadHandwriting() {
  if (!handwritingLoaded) {
    const face = new FontFace(HANDWRITING_FAMILY, `url(${HANDWRITING_FONT_URL})`);
    handwritingLoaded = face.load()
      .then((loaded) => { document.fonts.add(loaded); })
      .catch((err) => console.warn('[notes] the handwriting font did not load -- using a fallback', err));
  }
  return handwritingLoaded;
}

/**
 * Paints one note: the paper, the writing pressed into it, the wear over it,
 * and the torn edge.
 */
function paintNote(ctx, w, h, lines, { paper, wear, seed }) {
  const random = seeded(seed);
  // A part of the photo, at the note's own shape, so each sheet is different.
  const scale = 0.55 + random() * 0.3;
  const cropW = Math.min(paper.width, paper.height * (w / h)) * scale;
  const cropH = cropW * (h / w);
  const cropX = random() * (paper.width - cropW);
  const cropY = random() * (paper.height - cropH);
  ctx.drawImage(paper, cropX, cropY, cropW, cropH, 0, 0, w, h);

  // The writing: as big as fits, each line a little off true and the ink a
  // little uneven, multiplied into the paper so its stains show through it.
  const margin = w * 0.085;
  const top = h * 0.13;
  const fontSize = Math.min(w * 0.072, (h - top - h * 0.06) / (lines.length * 1.38));
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${fontSize}px "${HANDWRITING_FAMILY}", "Segoe Print", cursive`;
  lines.forEach((text, i) => {
    ctx.save();
    ctx.globalAlpha = 0.82 + random() * 0.15;
    ctx.translate(margin + (random() - 0.5) * w * 0.012, top + i * fontSize * 1.38 + fontSize * 0.8);
    ctx.rotate((random() - 0.5) * 0.035);
    ctx.fillText(text, 0, 0, w - margin * 2);
    ctx.restore();
  });
  ctx.restore();

  // Handling and damp: the wear photo, and the edges gone darker than the middle.
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.drawImage(wear, 0, 0, w, h);
  ctx.globalCompositeOperation = 'multiply';
  const grime = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  grime.addColorStop(0, 'rgba(255,255,255,1)');
  grime.addColorStop(1, 'rgba(150,128,95,1)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // The ragged edge: everything outside a hand-torn outline goes clear.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  const step = 14;
  const bite = Math.min(w, h) * 0.012;
  const edge = (x, y, inX, inY) => ctx.lineTo(x + inX * random() * bite, y + inY * random() * bite);
  ctx.moveTo(bite, bite);
  for (let x = 0; x <= w; x += step) edge(x, 0, 0, 1);
  for (let y = 0; y <= h; y += step) edge(w, y, -1, 0);
  for (let x = w; x >= 0; x -= step) edge(x, h, 0, -1);
  for (let y = h; y >= 0; y -= step) edge(0, y, 1, 0);
  ctx.closePath();
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
}

/**
 * A handwritten note on old paper, as a texture.
 *
 * @param {string[]} lines - what is written on it, a line each.
 * @param {object} [options]
 * @param {number} [options.aspect] - the note's width over its height, so the paper is not stretched.
 * @param {number} [options.wear] - which of the four wear photos it carries, 1 to 4.
 * @param {number} [options.seed] - picks its part of the paper and its wobble; one per note.
 * @returns {THREE.CanvasTexture} blank paper at first, the note once its images and font are in.
 *   It has transparency at its torn edge: use it with `alphaTest`.
 */
export function createPaperNoteTexture(lines = [], { aspect = 0.79, wear = 1, seed = 1 } = {}) {
  const h = NOTE_HEIGHT_IN_PIXELS;
  const w = Math.round(h * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BLANK_PAPER;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  Promise.all([
    loadImage(oldPaperUrl),
    loadImage(PAPER_WEAR_URLS[(wear - 1) % PAPER_WEAR_URLS.length]),
    loadHandwriting()
  ]).then(([paper, wearImage]) => {
    ctx.clearRect(0, 0, w, h);
    paintNote(ctx, w, h, lines, { paper, wear: wearImage, seed });
    texture.needsUpdate = true;
  }).catch((err) => console.warn('[notes] a note could not be painted', err));
  return texture;
}

/** The masking tape over a note's corners: the paper photo, tinted, a little see-through. */
let tapeMaterial = null;
function getTapeMaterial() {
  if (!tapeMaterial) {
    const map = new THREE.TextureLoader().load(oldPaperUrl);
    map.colorSpace = THREE.SRGBColorSpace;
    map.repeat.set(0.06, 0.02);
    map.offset.set(0.4, 0.5);
    tapeMaterial = new THREE.MeshStandardMaterial({
      map,
      color: 0xf2e2b8,
      roughness: 0.75,
      transparent: true,
      opacity: 0.86,
      depthWrite: false
    });
  }
  return tapeMaterial;
}

/**
 * A note's sheet, ready to place: the paper not flat but bellied a little off
 * the wall, one bottom corner peeling away from it, and -- if `tape` -- a
 * strip of masking tape across each top corner. Its front is +z, as a
 * PlaneGeometry's is; the tape is part of it, so it moves and turns with it.
 *
 * @param {number} width - in metres.
 * @param {number} height - in metres.
 * @param {THREE.Material} material - the note's own material.
 * @param {object} [options]
 * @param {number} [options.seed] - which corner peels, and by how much.
 * @param {boolean} [options.tape] - taped up (true), or lying loose (false).
 * @returns {THREE.Mesh}
 */
export function createPaperSheet(width, height, material, { seed = 1, tape = true } = {}) {
  const random = seeded(seed * 7919);
  const geometry = new THREE.PlaneGeometry(width, height, 12, 14);
  const position = geometry.attributes.position;
  const peelSide = random() < 0.5 ? -1 : 1;
  const peel = 0.01 + random() * 0.008;
  const bow = 0.0015 + random() * 0.0015;
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / (width / 2);
    const v = position.getY(i) / (height / 2);
    // Bellied out across its width, held flat along the taped top.
    let z = bow * (1 - u * u) * (1 - Math.max(0, v));
    // The loose bottom corner, curling away from the wall.
    const cu = Math.max(0, (u * peelSide - 0.3) / 0.7);
    const cv = Math.max(0, (-v - 0.3) / 0.7);
    z += peel * (cu * cv) ** 1.7;
    position.setZ(i, z);
  }
  geometry.computeVertexNormals();
  const sheet = new THREE.Mesh(geometry, material);
  if (tape) {
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.022), getTapeMaterial());
      strip.position.set(side * (width / 2 - 0.012), height / 2 - 0.006, 0.0012);
      strip.rotation.z = -side * (0.6 + random() * 0.2);
      sheet.add(strip);
    }
  }
  return sheet;
}
