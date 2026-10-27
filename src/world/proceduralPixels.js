import * as THREE from 'three';

/**
 * Small building blocks for textures painted pixel by pixel, at load time,
 * into a <canvas> -- the fireplace's glazed tiles, slate and cast iron, and the
 * fire's logs and ash (studyFireplace.js, HearthFire.js).
 *
 * WHY PIXEL BY PIXEL AND NOT WITH CANVAS PATHS. textures.js draws with the 2D
 * canvas API (arcs, strokes, gradients), which is quick to write but gives one
 * picture per call and nothing to derive from it. Here every texel is a small
 * function of its position, so ONE pass produces the colour, the height (for a
 * normal map) and the roughness of the same pixel, and the three can never
 * disagree about where a tile's edge or a crack is. It also needs nothing but
 * `document.createElement('canvas')` and ImageData, so the Node regression
 * check (scripts/check-study-reveal.mjs) can build the room with a stub canvas.
 *
 * Everything here is SEEDED: the same seed paints the same texture every run,
 * so the fireplace looks the same on every machine and in every screenshot.
 */

/**
 * mulberry32: a tiny, fast, seeded pseudo-random generator. Math.random() is
 * not seedable, and a texture that changes every load cannot be art-directed.
 *
 * @param {number} seed - any integer.
 * @returns {() => number} a generator of numbers in [0, 1).
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hermite ramp: 0 at or below `edge0`, 1 at or above `edge1`, smooth between. */
export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Value noise that WRAPS: a grid of random heights, smoothly interpolated, on
 * a lattice that repeats every `periodX` by `periodY` cells. A texture that
 * spans a whole number of periods therefore tiles with no seam.
 *
 * @param {() => number} random
 * @param {number} periodX - lattice cells across before it repeats.
 * @param {number} [periodY] - lattice cells down before it repeats.
 * @returns {(x: number, y: number) => number} noise in [0, 1], x/y in lattice cells.
 */
export function createTileableNoise(random, periodX, periodY = periodX) {
  const lattice = new Float32Array(periodX * periodY);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const wrap = (n, period) => ((n % period) + period) % period;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const x0 = wrap(xi, periodX), x1 = wrap(xi + 1, periodX);
    const y0 = wrap(yi, periodY) * periodX, y1 = wrap(yi + 1, periodY) * periodX;
    const top = lattice[y0 + x0] * (1 - u) + lattice[y0 + x1] * u;
    const bottom = lattice[y1 + x0] * (1 - u) + lattice[y1 + x1] * u;
    return top * (1 - v) + bottom * v;
  };
}

/**
 * Fractal sum of `noise` (fbm): octaves at double the frequency and half the
 * strength each time, normalised back into [0, 1]. Integer frequency steps
 * keep a wrapping noise wrapping.
 */
export function fbm(noise, x, y, octaves = 4) {
  let sum = 0, amplitude = 0.5, frequency = 1, total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * noise(x * frequency, y * frequency);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/**
 * Cellular (Worley) noise on a jittered grid that wraps every cellsX by cellsY
 * cells. For a point it returns the distance to the nearest cell centre (f1),
 * to the second nearest (f2) and which cell won (id, 0..1). Where f2 - f1 is
 * small the point sits on the border between two cells: that border network
 * is the crazing in a glaze and the cracks in burnt wood.
 *
 * @returns {(x: number, y: number, out: { f1: number, f2: number, id: number }) => typeof out}
 */
export function createCellNoise(random, cellsX, cellsY = cellsX) {
  const points = new Float32Array(cellsX * cellsY * 3);
  for (let i = 0; i < points.length; i++) points[i] = random();
  return (x, y, out) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let f1 = Infinity, f2 = Infinity, id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        const index = ((((gy % cellsY) + cellsY) % cellsY) * cellsX + (((gx % cellsX) + cellsX) % cellsX)) * 3;
        const px = gx + 0.1 + 0.8 * points[index];
        const py = gy + 0.1 + 0.8 * points[index + 1];
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < f1) { f2 = f1; f1 = d; id = points[index + 2]; } else if (d < f2) f2 = d;
      }
    }
    out.f1 = Math.sqrt(f1);
    out.f2 = Math.sqrt(f2);
    out.id = id;
    return out;
  };
}

/**
 * Paints a canvas one pixel at a time.
 *
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number, rgba: number[]) => void} paint - writes 0..255
 *   values into rgba[0..3] for pixel (x, y); y = 0 is the TOP row, which three
 *   shows at v = 1 (CanvasTexture flips Y).
 * @returns {HTMLCanvasElement}
 */
export function paintCanvas(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const rgba = [0, 0, 0, 255];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgba[3] = 255;
      paint(x, y, rgba);
      const index = (y * width + x) * 4;
      image.data[index] = rgba[0];
      image.data[index + 1] = rgba[1];
      image.data[index + 2] = rgba[2];
      image.data[index + 3] = rgba[3];
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Turns a height field into a tangent-space normal map (OpenGL convention,
 * green up, the way three reads it), from the slope between each texel's
 * neighbours. The field wraps, so a tiling height gives a tiling normal map.
 *
 * @param {Float32Array} heights - width * height values, row 0 at the top.
 * @param {number} strength - how steep a unit change of height over one texel is.
 */
export function normalCanvasFromHeights(heights, width, height, strength) {
  const at = (x, y) => heights[((y + height) % height) * width + ((x + width) % width)];
  return paintCanvas(width, height, (x, y, rgba) => {
    const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
    // Canvas rows run down the image while v runs up it: the row above is +v.
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const length = Math.sqrt(dx * dx + dy * dy + 1);
    rgba[0] = (dx / length * 0.5 + 0.5) * 255;
    rgba[1] = (dy / length * 0.5 + 0.5) * 255;
    rgba[2] = (1 / length * 0.5 + 0.5) * 255;
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {boolean} [options.isColour] - sRGB colour (true) or linear data (false):
 *   a normal or roughness map read through an sRGB decode would be bent.
 * @param {boolean} [options.repeat] - wrap (tiling textures) or clamp (atlases).
 */
export function canvasTexture(canvas, { isColour = true, repeat = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = isColour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}
