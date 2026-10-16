import '@fontsource/unifrakturmaguntia/latin-400.css';
import '@fontsource/playfair-display/latin-900.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import '@fontsource/old-standard-tt/latin-400.css';
import '@fontsource/old-standard-tt/latin-400-italic.css';
import '@fontsource/old-standard-tt/latin-700.css';

import houseUrl from '../assets/textures/bedroom/haunted_victorian_mansion_sepia.png?url';
import hallwayUrl from '../assets/textures/bedroom/level_1_1984_pic.png?url';
import bedroomDoorUrl from '../assets/textures/bedroom/level_1_1985_pic.png?url';
import clawMarksUrl from '../assets/textures/bedroom/level_1_1986_pic.png?url';
import chainedBedUrl from '../assets/textures/bedroom/level_1_1987_pic.png?url';

import { NEWSPAPERS } from '../story/newspapers.js';

/**
 * The newspaper interludes: a front page laid on a desk between the rooms.
 *
 * WHY A NEWSPAPER AND NOT A CUTSCENE. The house can only show the player what
 * is inside it. The papers carry the other half -- what the town saw from the
 * lane -- and they can be read at the player's own pace, which a camera move
 * cannot. The text lives in story/newspapers.js so it can be edited like the
 * dialogue files.
 *
 * THE PHOTOGRAPHS ARE THE ROOM-1 POLAROIDS, PRINTED. Each one is pushed through
 * a real halftone screen on a <canvas> -- round dots on a 45-degree grid, dot
 * area proportional to darkness, which is how a 1987 press reproduced a photo
 * -- so the papers cost no new image downloads (the bedroom already imports
 * every one of them) and look like the same photographs the player has been
 * holding, rather than new art in a different style.
 *
 * THE PAGE IS SIZED LIKE AN IMAGE. Every length inside it is in cqw (a
 * percentage of the page's own width), so the layout scales as one piece and a
 * column breaks at the same word on a laptop as on a projector.
 */

/** The polaroid frame and the handwritten year, cropped off: [x, y, w, h] as fractions. */
const POLAROID_CROP = [0.085, 0.085, 0.83, 0.67];

const PHOTOS = {
  house: { url: houseUrl, crop: [0.0, 0.04, 1.0, 0.86] },
  hallway: { url: hallwayUrl, crop: POLAROID_CROP },
  bedroomDoor: { url: bedroomDoorUrl, crop: POLAROID_CROP },
  clawMarks: { url: clawMarksUrl, crop: POLAROID_CROP },
  chainedBed: { url: chainedBedUrl, crop: POLAROID_CROP }
};

/** Width the halftone is printed at. Enough for a full-HD page at 2x without upscaling. */
const PRINT_WIDTH = 1100;
/** Distance between dot centres, in print pixels. ~200 dots across: coarse newsprint. */
const DOT_PITCH = 5.2;
/** Screen angle. Black ink is screened at 45 degrees so the grid does not read as rows. */
const SCREEN_ANGLE = Math.PI / 4;
const INK = 'rgba(22, 19, 15, 0.94)';

/** A press-ready page has to wait this long before Continue does anything, so a held key cannot skip it unread. */
const MIN_READ_MS = 1200;
const FONT_WAIT_MS = 1500;

const halftoneCache = new Map();

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

/**
 * Prints one photograph in halftone and resolves to an object URL of the plate.
 *
 * The tone is levelled first: these are night photographs, and printed straight
 * they come out as a black square with a few dots in it. Stretching between the
 * 2nd and 98th percentiles and lifting the mid-tones keeps the shapes readable
 * once every pixel has become a dot.
 */
function printHalftone(key) {
  if (halftoneCache.has(key)) return halftoneCache.get(key);
  const spec = PHOTOS[key];
  const job = (async () => {
    const image = await loadImage(spec.url);
    const [cx, cy, cw, ch] = spec.crop;
    const sx = cx * image.naturalWidth;
    const sy = cy * image.naturalHeight;
    const sw = cw * image.naturalWidth;
    const sh = ch * image.naturalHeight;
    const outW = PRINT_WIDTH;
    const outH = Math.round(outW * (sh / sw));

    // Luminance at one sample per print pixel / 2: plenty for a dot every 5.
    const sampleScale = 0.5;
    const lumW = Math.round(outW * sampleScale);
    const lumH = Math.round(outH * sampleScale);
    const sampler = document.createElement('canvas');
    sampler.width = lumW;
    sampler.height = lumH;
    const sctx = sampler.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(image, sx, sy, sw, sh, 0, 0, lumW, lumH);
    const rgba = sctx.getImageData(0, 0, lumW, lumH).data;
    const lum = new Float32Array(lumW * lumH);
    for (let i = 0; i < lum.length; i++) {
      lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    }

    // Levels: 2nd..98th percentile to 0..1, then a gamma that opens the darks.
    const sorted = Float32Array.from(lum).sort();
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.floor(sorted.length * 0.98)];
    const span = Math.max(1e-3, hi - lo);

    const plate = document.createElement('canvas');
    plate.width = outW;
    plate.height = outH;
    const ctx = plate.getContext('2d');
    // White, not transparent: the page lays the plate on with multiply, so
    // white prints as bare paper -- and an opaque plate can be a JPEG, which
    // encodes in a fraction of the time a million-byte PNG of dots took.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.fillStyle = INK;
    ctx.beginPath();

    // Walk a rotated grid that covers the whole plate, and drop one dot per
    // cell sized by the tone under its centre. Dot AREA tracks darkness, so the
    // radius goes with its square root; past ~0.7 of the pitch neighbouring
    // dots merge, which is what a printed shadow looks like.
    const cos = Math.cos(SCREEN_ANGLE);
    const sin = Math.sin(SCREEN_ANGLE);
    const reach = Math.hypot(outW, outH);
    const steps = Math.ceil(reach / DOT_PITCH);
    const maxRadius = DOT_PITCH * 0.7;
    const midX = outW / 2;
    const midY = outH / 2;
    for (let j = -steps; j <= steps; j++) {
      for (let i = -steps; i <= steps; i++) {
        const gx = i * DOT_PITCH;
        const gy = j * DOT_PITCH;
        const x = midX + gx * cos - gy * sin;
        const y = midY + gx * sin + gy * cos;
        if (x < -DOT_PITCH || y < -DOT_PITCH || x > outW + DOT_PITCH || y > outH + DOT_PITCH) continue;
        const lx = Math.min(lumW - 1, Math.max(0, Math.round(x * sampleScale)));
        const ly = Math.min(lumH - 1, Math.max(0, Math.round(y * sampleScale)));
        const level = Math.min(1, Math.max(0, (lum[ly * lumW + lx] - lo) / span));
        const tone = Math.pow(level, 0.62);
        const darkness = 1 - tone;
        if (darkness < 0.04) continue;
        const radius = maxRadius * Math.sqrt(darkness);
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    const blob = await new Promise((resolve) => plate.toBlob(resolve, 'image/jpeg', 0.88));
    return blob ? URL.createObjectURL(blob) : plate.toDataURL('image/jpeg', 0.88);
  })();
  // A failed print must be retried next time, not cached as a failure forever.
  job.catch(() => halftoneCache.delete(key));
  halftoneCache.set(key, job);
  return job;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Builds the page's DOM from one entry of NEWSPAPERS. */
function buildPage(paper) {
  const page = el('article', 'np-page');
  page.setAttribute('aria-label', `${paper.paper}, ${paper.date}`);
  if (/special/i.test(paper.edition)) page.classList.add('is-special');

  const masthead = el('header', 'np-masthead');
  const leftEar = el('div', 'np-ear');
  leftEar.append(el('strong', null, paper.leftEar[0]), el('span', null, paper.leftEar[1]));
  const rightEar = el('div', 'np-ear');
  rightEar.append(el('strong', null, paper.rightEar[0]), el('span', null, paper.rightEar[1]));
  masthead.append(leftEar, el('h1', 'np-title', paper.paper), rightEar);

  const dateline = el('div', 'np-dateline');
  dateline.append(
    el('span', null, paper.volume),
    el('span', 'np-edition', paper.edition),
    el('span', null, paper.date),
    el('span', null, paper.price)
  );

  const lead = el('section', 'np-lead');
  if (paper.kicker) lead.append(el('div', 'np-kicker', paper.kicker));
  const headline = el('h2', 'np-headline', paper.headline);
  lead.append(headline, el('p', 'np-deck', paper.deck));

  const grid = el('div', 'np-grid');

  const figure = el('figure', 'np-figure');
  const plate = el('div', 'np-plate');
  const img = el('img', 'np-photo');
  img.alt = paper.photoCaption;
  plate.append(img);
  const caption = el('figcaption', 'np-caption');
  caption.append(document.createTextNode(paper.photoCaption + ' '));
  caption.append(el('span', 'np-credit', paper.photoCredit));
  figure.append(plate, caption);

  const story = el('div', 'np-story');
  story.append(el('div', 'np-byline', paper.byline));
  for (const paragraph of paper.body) {
    // "> " sets a paragraph as a pulled quote: centred, spaced capitals, ruled
    // above and below -- for words quoted from a document, which justify into
    // rivers of white if they are set as running text.
    if (paragraph.startsWith('> ')) story.append(el('p', 'np-pull', paragraph.slice(2)));
    else story.append(el('p', null, paragraph));
  }
  story.append(el('p', 'np-continued', paper.continued));

  const sidebar = el('aside', 'np-sidebar');
  const sideStory = el('div', 'np-side-story');
  sideStory.append(
    el('div', 'np-kicker', paper.sidebar.kicker),
    el('h3', 'np-side-headline', paper.sidebar.headline)
  );
  for (const paragraph of paper.sidebar.body) sideStory.append(el('p', null, paragraph));
  sidebar.append(sideStory);
  if (paper.advert) {
    const advert = el('div', 'np-advert');
    advert.append(el('div', 'np-advert-name', paper.advert.name));
    for (const advertLine of paper.advert.lines) advert.append(el('div', null, advertLine));
    sidebar.append(advert);
  }

  grid.append(figure, story, sidebar);

  const briefs = el('footer', 'np-briefs');
  for (const [title, body] of paper.briefs) {
    const brief = el('div', 'np-brief');
    brief.append(el('strong', null, title + '. '), document.createTextNode(body));
    briefs.append(brief);
  }

  page.append(masthead, dateline, lead, grid, briefs);
  return { page, headline, img, photoKey: paper.photo };
}

/**
 * Shrinks the headline until it sits on one line, the way a sub-editor would
 * re-set it in a smaller size rather than let it break. Below the floor it is
 * allowed to wrap onto two.
 */
function fitHeadline(headline) {
  headline.style.whiteSpace = 'nowrap';
  headline.style.fontSize = '';
  const pageWidth = headline.closest('.np-page')?.clientWidth || 1;
  let size = parseFloat(getComputedStyle(headline).fontSize) / pageWidth * 100;
  const floor = 3.4;
  while (headline.scrollWidth > headline.clientWidth + 1 && size > floor) {
    size -= 0.15;
    headline.style.fontSize = `${size}cqw`;
  }
  if (headline.scrollWidth > headline.clientWidth + 1) headline.style.whiteSpace = 'normal';
}

/**
 * The advert only runs if it fits whole under the sidebar story. Half an
 * advert sliced off by the page edge reads as a rendering bug, not a newspaper.
 */
function fitAdvert(page) {
  const advert = page.querySelector('.np-advert');
  if (!advert) return;
  advert.hidden = false;
  const sidebar = advert.parentElement;
  if (sidebar.scrollHeight > sidebar.clientHeight + 1) advert.hidden = true;
}

/**
 * Run once, when the page lands -- NOT again on resize. Every length on the
 * page is in cqw, so whether a headline fits on one line or an advert fits
 * under its story does not depend on the window size at all. Re-measuring on
 * resize only ever caught the layout half-way through a change (the jump to
 * fullscreen, measured) and hid an advert that fitted perfectly.
 */
function fitPage(page, headline) {
  fitHeadline(headline);
  fitAdvert(page);
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root     #newspaper-view
 * @param {() => void} [options.onShow]  a page has landed on the desk (rustle)
 * @returns the newspaper controller.
 */
export function createNewspaper({ root, onShow = null }) {
  const stage = root.querySelector('.np-stage');
  const progress = root.querySelector('.np-progress');
  const progressFill = root.querySelector('.np-progress-fill');
  const progressHint = root.querySelector('.np-progress-hint');
  const prompt = root.querySelector('.np-continue');

  let open = false;
  let bootMode = false;
  let ready = false;
  let shownAt = 0;
  let finish = null;

  const fontsReady = Promise.race([
    Promise.all([
      document.fonts.load('400 40px "UnifrakturMaguntia"'),
      document.fonts.load('900 40px "Playfair Display"'),
      document.fonts.load('400 16px "Old Standard TT"'),
      document.fonts.load('700 16px "Old Standard TT"')
    ]).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))
  ]);

  function canContinue() {
    return open && ready && performance.now() - shownAt >= MIN_READ_MS;
  }

  function close(result) {
    if (!open) return;
    open = false;
    bootMode = false;
    prompt.style.transitionDelay = '0ms';
    // is-boot too: the loading page goes away the same way every other page does.
    root.classList.remove('is-open', 'is-ready', 'is-boot');
    const done = finish;
    finish = null;
    done?.(result);
  }

  /**
   * Input is taken in the CAPTURE phase and swallowed, so nothing behind the
   * page reacts to it: Enter would otherwise start the game from the menu
   * hidden under the loading page, and E would interact with whatever the
   * frozen crosshair happened to be pointing at.
   *
   * In game it only listens while the pointer is locked. Without the lock the
   * pause menu is on top of the page, and its own buttons must get the click.
   */
  function accepts() {
    return open && (bootMode || document.pointerLockElement != null);
  }

  window.addEventListener('keydown', (event) => {
    if (!accepts()) return;
    if (event.code === 'Escape') return;   // pausing still works
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const isContinueKey = event.code === 'Space' || event.code === 'Enter'
      || event.code === 'NumpadEnter' || event.code === 'KeyE';
    if (isContinueKey && canContinue()) close(true);
  }, true);

  window.addEventListener('mousedown', (event) => {
    if (!accepts()) return;
    if (bootMode && !root.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button === 0 && canContinue()) close(true);
  }, true);

  function setReady(value) {
    ready = value;
    root.classList.toggle('is-ready', value);
    // The prompt may only appear once the minimum read time is up as well.
    if (value) {
      const wait = Math.max(0, MIN_READ_MS - (performance.now() - shownAt));
      prompt.style.transitionDelay = `${wait}ms`;
    }
  }

  return {
    get isOpen() { return open; },

    /**
     * Lays a page on the desk and resolves when the player continues past it.
     *
     * @param {string} id key in NEWSPAPERS
     * @param {object} [options]
     * @param {boolean} [options.boot] the loading-screen variant: shows a
     *   progress bar, and Continue waits for markLoaded().
     * @returns {Promise<boolean>} true when read, false when cancelled.
     */
    async show(id, { boot = false } = {}) {
      const paper = NEWSPAPERS[id];
      if (!paper) {
        console.warn(`[newspaper] no page called "${id}"`);
        return true;
      }
      if (open) close(false);

      await fontsReady;

      const { page, headline, img, photoKey } = buildPage(paper);
      stage.replaceChildren(page);
      bootMode = boot;
      root.classList.toggle('is-boot', boot);
      progress.hidden = !boot;
      prompt.textContent = boot ? 'Click or press Space to begin' : 'Click or press Space to continue';
      open = true;
      shownAt = performance.now();
      setReady(!boot);
      // Re-trigger the landing animation on every show, not just the first.
      root.classList.remove('is-open');
      void root.offsetWidth;
      root.classList.add('is-open');
      fitPage(page, headline);
      onShow?.();

      printHalftone(photoKey)
        .then((src) => {
          img.onload = () => img.classList.add('is-printed');
          img.src = src;
        })
        .catch((err) => console.warn(`[newspaper] could not print "${photoKey}"`, err));

      return new Promise((resolve) => { finish = resolve; });
    },

    /** Boot only: progress through the warm-up, 0..1. */
    setProgress(fraction, hint) {
      progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
      if (hint) progressHint.textContent = hint;
    },

    /** Boot only: everything has loaded, so Continue may now be pressed. */
    markLoaded() {
      progressHint.textContent = 'ready';
      progressFill.style.width = '100%';
      setReady(true);
    },

    /** Prints a page's photograph ahead of time, so it is on the plate when the page lands. */
    preload(id) {
      const key = NEWSPAPERS[id]?.photo;
      if (key) printHalftone(key).catch(() => {});
    },

    /** Restart, or a transition abandoned underneath the page. */
    cancel() {
      close(false);
    }
  };
}
