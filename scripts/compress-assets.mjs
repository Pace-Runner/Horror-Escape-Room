/**
 * Shrink the game's download without changing how it looks.  `npm run compress:assets`
 *
 * WHY. The build was 163 MB, and the game fetches nearly all of it before play
 * -- on a lab network, in front of a marker. Almost all of that was images
 * saved as PNG inside the models and beside them: photographed and painted
 * textures, which PNG (lossless) stores at several megabytes each.
 *
 * WHAT IT DOES. Re-encodes images as WebP. Same pixel dimensions, and every
 * one is MEASURED against its original before it is kept (see encodeWebp):
 *
 *   1. MODELS. Every .glb in src/assets/models has its embedded textures
 *      re-encoded in place (EXT_texture_webp, which three's GLTFLoader reads
 *      out of the box). The .glb files are build artefacts of the .blend files
 *      in blender/, so re-run this after any re-export. Textures that are
 *      already WebP are skipped, so running it twice changes nothing.
 *   2. LOOSE IMAGES. Every PNG the game's code or CSS references gets a .webp
 *      sibling, and the reference is pointed at it. The PNG STAYS: some are
 *      written by the Python build scripts (scripts/build_*.py), some are
 *      Blender's sources. A PNG newer than its .webp gets the .webp rebuilt,
 *      so regenerating a texture and re-running this is enough.
 *
 * QUALITY GATE. Colour images are tried as lossy WebP at quality 90 and kept
 * only if they measure at least MIN_PSNR_IN_DB against the original (alpha
 * included). Data maps -- normal, roughness, metalness, height, AO -- are read
 * as numbers by the lighting, where small errors show as shading noise, so
 * they go straight to near-lossless, as does anything that fails the gate.
 * Near-lossless measured ~50 dB on this project's maps: visually exact, about
 * half the PNG's size. An image whose WebP is not smaller stays a PNG.
 *
 * NOT TOUCHED. okabe.glb and okabe_clean.glb: scripts/check-okabe.mjs gates
 * their images in CI, and they are 2 MB between them. JPEGs: already small,
 * and re-encoding lossy as lossy only adds artefacts.
 *
 * `--check` changes nothing and exits non-zero if anything is uncompressed or
 * stale, for CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { listTextureSlots } from '@gltf-transform/functions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const MODELS = path.join(SRC, 'assets', 'models');
const SKIPPED_MODELS = new Set(['okabe.glb', 'okabe_clean.glb']);
/** Lossy quality for colour images. */
const COLOUR_QUALITY = 90;
/** sharp's near-lossless preprocessing level (lower = more exact). */
const NEAR_LOSSLESS_QUALITY = 60;
/** Below this, a lossy encode is visibly different and near-lossless is used. */
const MIN_PSNR_IN_DB = 36;
/** glTF texture slots that hold data rather than colour. */
const DATA_SLOTS = new Set(['normalTexture', 'metallicRoughnessTexture', 'occlusionTexture']);
/** Loose image names that hold data rather than colour. */
const DATA_NAME = /(normal|rough|metal|height|_ao[._]|_rm[._])/i;
/** A reference to an image under assets/, as written in JS imports and CSS url()s. */
const IMAGE_REFERENCE = /(['"(])((?:\.\.?\/)+(?:[\w-]+\/)*assets\/[^'"()?]+)\.(png|webp)((?:\?url)?['")])/g;

const isCheckOnly = process.argv.includes('--check');
const problems = [];

/** Every file under `dir` whose name passes `keep`, recursively. */
function readFilesUnder(dir, keep) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...readFilesUnder(full, keep));
    else if (keep(entry.name)) found.push(full);
  }
  return found;
}

const formatMegabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

/**
 * Peak signal-to-noise ratio between two encoded images, in dB, comparing
 * PREMULTIPLIED colour plus alpha. Premultiplied, because the colour under a
 * fully transparent pixel is never seen and WebP is free to discard it.
 *
 * @param {Buffer} original - encoded image (any format sharp reads).
 * @param {Buffer} candidate - encoded image of the same dimensions.
 * @returns {Promise<number>} dB; Infinity when identical.
 */
async function readPsnrInDb(original, candidate) {
  const a = await sharp(original).ensureAlpha().raw().toBuffer();
  const b = await sharp(candidate).ensureAlpha().raw().toBuffer();
  let squaredError = 0;
  for (let i = 0; i < a.length; i += 4) {
    const alphaA = a[i + 3] / 255;
    const alphaB = b[i + 3] / 255;
    for (let channel = 0; channel < 3; channel++) {
      const difference = a[i + channel] * alphaA - b[i + channel] * alphaB;
      squaredError += difference * difference;
    }
    const alphaDifference = a[i + 3] - b[i + 3];
    squaredError += alphaDifference * alphaDifference;
  }
  if (squaredError === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / (squaredError / a.length));
}

/**
 * Encodes one image as WebP under the quality gate described at the top.
 *
 * @param {Buffer} original - the encoded source image.
 * @param {boolean} isDataMap - normal/roughness/etc.: skip straight to near-lossless.
 * @returns {Promise<Buffer | null>} the WebP, or null if it would not be smaller.
 */
async function encodeWebp(original, isDataMap) {
  let encoded = null;
  if (!isDataMap) {
    encoded = await sharp(original).webp({ quality: COLOUR_QUALITY, alphaQuality: 100, effort: 6 }).toBuffer();
    if (await readPsnrInDb(original, encoded) < MIN_PSNR_IN_DB) encoded = null;
  }
  encoded ??= await sharp(original).webp({ nearLossless: true, quality: NEAR_LOSSLESS_QUALITY, effort: 6 }).toBuffer();
  return encoded.length < original.length ? encoded : null;
}

/**
 * Re-encodes one model's non-WebP textures as WebP, in place.
 *
 * @param {NodeIO} io
 * @param {string} file - absolute path to a .glb.
 * @returns {Promise<{ before: number, after: number }>} file sizes in bytes.
 */
async function compressModel(io, file) {
  const before = fs.statSync(file).size;
  const document = await io.read(file);
  const pending = document.getRoot().listTextures().filter((texture) => texture.getMimeType() !== 'image/webp');
  if (pending.length === 0) return { before, after: before };
  let changed = 0;
  for (const texture of pending) {
    const isDataMap = listTextureSlots(texture).some((slot) => DATA_SLOTS.has(slot));
    // A texture left as it was because WebP was not smaller comes back here
    // every run; only one that WOULD shrink is unfinished work.
    const webp = await encodeWebp(Buffer.from(texture.getImage()), isDataMap);
    if (!webp) continue;
    if (isCheckOnly) {
      problems.push(`${path.relative(ROOT, file)}: texture "${texture.getName() || '?'}" not yet WebP`);
      continue;
    }
    texture.setImage(new Uint8Array(webp)).setMimeType('image/webp');
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.(png|jpe?g)$/i, '.webp'));
    changed++;
  }
  if (changed === 0 || isCheckOnly) return { before, after: before };
  // Required: a loader without WebP support must fail loudly, not draw white.
  document.createExtension(EXTTextureWebP).setRequired(true);
  const bytes = await io.writeBinary(document);
  if (bytes.byteLength >= before) return { before, after: before };
  fs.writeFileSync(file, bytes);
  return { before, after: bytes.byteLength };
}

/**
 * The PNGs the game references, and which source files reference each one.
 * A reference already pointing at a .webp counts too, so a regenerated PNG
 * gets its .webp rebuilt.
 *
 * @returns {Map<string, Set<string>>} absolute PNG path -> referencing files.
 */
function readReferencedPngs() {
  const referenced = new Map();
  const sources = [...readFilesUnder(SRC, (name) => /\.(js|css)$/.test(name)), path.join(ROOT, 'index.html')];
  for (const source of sources) {
    const text = fs.readFileSync(source, 'utf8');
    for (const match of text.matchAll(IMAGE_REFERENCE)) {
      const png = path.resolve(path.dirname(source), `${match[2]}.png`);
      if (!fs.existsSync(png)) continue;
      if (!referenced.has(png)) referenced.set(png, new Set());
      referenced.get(png).add(source);
    }
  }
  return referenced;
}

/**
 * Writes `png`'s .webp sibling if it is missing or older than the PNG, or
 * removes a stale one that is no longer worth keeping.
 *
 * @param {string} png - absolute path.
 * @returns {Promise<{ before: number, after: number }>} PNG and kept-image sizes in bytes.
 */
async function compressLooseImage(png) {
  const webp = png.replace(/\.png$/, '.webp');
  const before = fs.statSync(png).size;
  const isStale = !fs.existsSync(webp) || fs.statSync(webp).mtimeMs < fs.statSync(png).mtimeMs;
  if (isStale) {
    // A PNG kept because WebP was not smaller is re-tried every run, cheaply.
    const encoded = await encodeWebp(fs.readFileSync(png), DATA_NAME.test(path.basename(png)));
    if (isCheckOnly && (encoded || fs.existsSync(webp))) {
      problems.push(`${path.relative(ROOT, png)}: .webp missing or older than the PNG`);
    } else if (!isCheckOnly && encoded) {
      fs.writeFileSync(webp, encoded);
    } else if (!isCheckOnly) {
      fs.rmSync(webp, { force: true });
    }
  }
  return { before, after: fs.existsSync(webp) ? fs.statSync(webp).size : before };
}

/** Points each image reference in `source` at the .webp when one exists, else back at the .png. */
function updateReferences(source) {
  const text = fs.readFileSync(source, 'utf8');
  const updated = text.replace(IMAGE_REFERENCE, (whole, open, stem, extension, close) => {
    const png = path.resolve(path.dirname(source), `${stem}.png`);
    if (!fs.existsSync(png)) return whole;
    const target = fs.existsSync(png.replace(/\.png$/, '.webp')) ? 'webp' : 'png';
    return `${open}${stem}.${target}${close}`;
  });
  if (updated === text) return;
  if (isCheckOnly) problems.push(`${path.relative(ROOT, source)}: image references out of date`);
  else fs.writeFileSync(source, updated);
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let totalBefore = 0;
  let totalAfter = 0;

  const models = readFilesUnder(MODELS, (name) => name.endsWith('.glb') && !SKIPPED_MODELS.has(name));
  for (const file of models) {
    const { before, after } = await compressModel(io, file);
    totalBefore += before;
    totalAfter += after;
    if (after < before) console.log(`model  ${formatMegabytes(before).padStart(9)} -> ${formatMegabytes(after).padStart(9)}  ${path.relative(SRC, file)}`);
  }

  const referenced = readReferencedPngs();
  for (const [png, sources] of referenced) {
    const { before, after } = await compressLooseImage(png);
    totalBefore += before;
    totalAfter += after;
    if (after < before) console.log(`image  ${formatMegabytes(before).padStart(9)} -> ${formatMegabytes(after).padStart(9)}  ${path.relative(SRC, png)}`);
    for (const source of sources) updateReferences(source);
  }

  console.log(`\n${models.length} models, ${referenced.size} images: ${formatMegabytes(totalBefore)} -> ${formatMegabytes(totalAfter)}`);
  if (problems.length) {
    console.error(`\n${problems.length} asset(s) need \`npm run compress:assets\`:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
}

await main();
