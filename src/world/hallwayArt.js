import * as THREE from 'three';
import '@fontsource/caveat/latin-500.css';
import '@fontsource/caveat/latin-700.css';

/**
 * The upstairs hallway's story pieces, drawn on canvas.
 *
 * Every piece here is a PRINTED OR WRITTEN THING -- a newspaper clipping, a
 * blueprint, a note, pencil marks, a broken mirror -- because those are what a
 * canvas can draw at full quality. Each one is drawn large (1000-2000 px), so it
 * stays sharp on the wall and when the player holds it up to read
 * (DocumentUI's image view uses the very same canvas).
 *
 * They use the game's own typefaces: Old Standard TT and Playfair Display (the
 * newspapers, loaded by core/Newspaper.js) and Caveat (handwriting, loaded
 * here). A canvas cannot wait for a web font, so each piece is drawn once
 * straight away with fallbacks and drawn again the moment the fonts arrive.
 *
 * What they say lives in story/hallway.js, next to the newspapers, so the
 * words can be edited without touching any drawing code.
 */

const FONT_WAIT_MS = 2500;

/** Resolves once the hallway's fonts are usable, or after FONT_WAIT_MS. */
const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load('500 40px "Caveat"'),
    document.fonts.load('700 40px "Caveat"'),
    document.fonts.load('900 40px "Playfair Display"'),
    document.fonts.load('400 20px "Old Standard TT"'),
    document.fonts.load('700 20px "Old Standard TT"'),
    document.fonts.load('italic 400 20px "Old Standard TT"')
  ]).catch(() => {}),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))
]);

const SERIF = '"Old Standard TT", Georgia, "Times New Roman", serif';
const DISPLAY = '"Playfair Display", Georgia, serif';
const HAND = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
const DRAFT = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/** Small deterministic random, so every load draws the same grain. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A canvas that draws itself twice -- now, and again once the fonts load --
 * and the texture that shows it.
 *
 * @param {number} width
 * @param {number} height
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @param {object} [options]
 * @param {boolean} [options.srgb] colour data (true) or a data map (false)
 */
function makeArt(width, height, draw, { srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const render = () => {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    ctx.restore();
    texture.needsUpdate = true;
  };
  render();
  fontsReady.then(render);
  return {
    canvas,
    texture,
    /** A full-size image for the reading view, after the fonts are in. */
    async toImageUrl() {
      await fontsReady;
      return canvas.toDataURL('image/jpeg', 0.9);
    }
  };
}

/** Fibre grain and blotching over whatever paper colour is already down. */
function paperGrain(ctx, w, h, rand, { strength = 1, fibres = 1400, blotches = 26 } = {}) {
  for (let i = 0; i < blotches; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.05 + rand() * 0.18) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120, 88, 40, ${0.05 * strength * rand()})`);
    g.addColorStop(1, 'rgba(120, 88, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < fibres; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 3 + rand() * 9;
    const a = rand() * Math.PI;
    ctx.strokeStyle = rand() < 0.5
      ? `rgba(90, 64, 30, ${0.08 * strength})`
      : `rgba(255, 250, 235, ${0.1 * strength})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

/** Darker, browner edges: paper ages from the outside in. */
function edgeBurn(ctx, w, h, colour = '110, 74, 30', amount = 0.42) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.56);
  g.addColorStop(0, `rgba(${colour}, 0)`);
  g.addColorStop(1, `rgba(${colour}, ${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Lays out justified text in a column. Returns the y after the last line.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} lineHeight
 * @param {object} [options]
 * @param {boolean} [options.justify]
 * @param {number} [options.indent] first-line indent in px
 * @param {number} [options.maxY] stop before this y; returns { y, rest } with the unused words
 */
function wrapText(ctx, text, x, y, width, lineHeight, { justify = true, indent = 0, maxY = Infinity } = {}) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = [];
  let first = true;
  const lineWidth = () => (first ? width - indent : width);
  const flush = (isLast) => {
    const startX = x + (first ? indent : 0);
    if (!justify || isLast || line.length < 2) {
      ctx.fillText(line.join(' '), startX, y);
    } else {
      const wordsWidth = line.reduce((sum, word) => sum + ctx.measureText(word).width, 0);
      const gap = (lineWidth() - wordsWidth) / (line.length - 1);
      let cx = startX;
      for (const word of line) {
        ctx.fillText(word, cx, y);
        cx += ctx.measureText(word).width + gap;
      }
    }
    y += lineHeight;
    first = false;
    line = [];
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const trial = [...line, word].join(' ');
    if (line.length && ctx.measureText(trial).width > lineWidth()) {
      if (y + lineHeight > maxY) return { y, rest: words.slice(i - line.length).join(' ') };
      flush(false);
    }
    line.push(word);
  }
  if (line.length) {
    if (y > maxY) return { y, rest: line.join(' ') };
    flush(true);
  }
  return { y, rest: '' };
}

/** Centred, ragged lines (a headline's deck). Returns the y after the last line. */
function wrapCentred(ctx, text, cx, y, width, lineHeight) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  ctx.textAlign = 'center';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(trial).width > width) {
      ctx.fillText(line, cx, y);
      y += lineHeight;
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  }
  return y;
}

/* ------------------------------------------------------------ clipping ---- */

/**
 * A 1979 newspaper clipping, cut out with scissors and mounted on a cream mat.
 * Same masthead and typefaces as the front pages the player reads between the
 * rooms, so it is plainly the same paper, eight years earlier.
 */
export function createClippingArt(clip) {
  return makeArt(1000, 1360, (ctx, w, h) => {
    const rand = seeded(1979);
    // The mat.
    ctx.fillStyle = '#e6dcc4';
    ctx.fillRect(0, 0, w, h);
    paperGrain(ctx, w, h, rand, { strength: 0.5, fibres: 500, blotches: 8 });

    // The cutting: a little crooked, its edges slightly ragged.
    const pad = 70;
    const cut = [];
    const corners = [[pad, pad + 6], [w - pad, pad - 4], [w - pad + 5, h - pad], [pad - 3, h - pad + 4]];
    for (let side = 0; side < 4; side++) {
      const [ax, ay] = corners[side];
      const [bx, by] = corners[(side + 1) % 4];
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        cut.push([ax + (bx - ax) * t + (rand() - 0.5) * 2.4, ay + (by - ay) * t + (rand() - 0.5) * 2.4]);
      }
    }
    ctx.save();
    ctx.shadowColor = 'rgba(40, 28, 12, 0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    cut.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    const paper = ctx.createLinearGradient(0, 0, w, h);
    paper.addColorStop(0, '#d9c99f');
    paper.addColorStop(1, '#cdb98a');
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.clip();
    paperGrain(ctx, w, h, rand, { strength: 1.1 });
    const ink = '#241b10';
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    const left = pad + 42;
    const right = w - pad - 42;
    const colW = right - left;

    // Folio line, as cut from the top of the page.
    ctx.font = `700 19px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText(clip.folio.left.toUpperCase(), left, pad + 48);
    ctx.textAlign = 'right';
    ctx.fillText(clip.folio.right.toUpperCase(), right, pad + 48);
    ctx.fillRect(left, pad + 60, colW, 2);
    ctx.fillRect(left, pad + 66, colW, 1);

    ctx.textAlign = 'center';
    ctx.font = `700 18px ${SERIF}`;
    ctx.fillText(clip.kicker.toUpperCase().split('').join(String.fromCharCode(8202)), w / 2, pad + 106);
    ctx.font = `900 62px ${DISPLAY}`;
    let y = pad + 172;
    for (const headLine of clip.headline) {
      ctx.fillText(headLine, w / 2, y);
      y += 68;
    }
    ctx.font = `italic 400 25px ${SERIF}`;
    y = wrapCentred(ctx, clip.deck, w / 2, y + 6, colW - 80, 32);
    y += 8;
    ctx.fillRect(left + colW * 0.3, y, colW * 0.4, 1.5);
    y += 34;
    ctx.textAlign = 'left';
    ctx.font = `700 15px ${SERIF}`;
    ctx.fillText(clip.byline.toUpperCase(), left, y);
    y += 30;

    // Two columns of body.
    const gutter = 30;
    const columnW = (colW - gutter) / 2;
    const bottom = h - pad - 46;
    ctx.font = `400 21px ${SERIF}`;
    let column = 0;
    let cy = y;
    ctx.fillRect(left + columnW + gutter / 2, y - 18, 1, bottom - y + 4);
    for (let i = 0; i < clip.body.length && column < 2; i++) {
      let text = clip.body[i];
      while (text && column < 2) {
        const cx = left + column * (columnW + gutter);
        const result = wrapText(ctx, text, cx, cy, columnW, 27, { indent: i === 0 && cy === y && column === 0 ? 0 : 22, maxY: bottom });
        if (result.rest) {
          column++;
          cy = y;
          text = result.rest;
        } else {
          cy = result.y + 6;
          text = '';
        }
      }
    }
    // Ink is never even on newsprint.
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(217, 201, 159, ${0.18 * rand()})`;
      ctx.fillRect(rand() * w, rand() * h, 1.6, 1.6);
    }
    edgeBurn(ctx, w, h, '120, 82, 30', 0.38);
    ctx.restore();
  });
}

/* ----------------------------------------------------------- blueprint ---- */

/**
 * The conversion drawings for the house: a cyanotype, white line on Prussian
 * blue, with three rooms ringed and numbered and a note in pencil. On a first
 * playthrough it is a plan of the prison the player is escaping. After the
 * letter, it is the failsafe Mark drew before the procedure.
 */
export function createBlueprintArt(plan) {
  return makeArt(2000, 1400, (ctx, w, h) => {
    const rand = seeded(1983);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1d4a86');
    bg.addColorStop(0.55, '#1a4379');
    bg.addColorStop(1, '#173a68');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // Uneven exposure, and the sheet's fibre.
    for (let i = 0; i < 18; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 200 + rand() * 500;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rand() < 0.5 ? '120, 160, 210' : '8, 22, 48'}, ${0.08 * rand()})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(210, 228, 255, ${0.05 * rand()})`;
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }
    // Fold creases, where it was kept folded in eighths.
    ctx.lineWidth = 3;
    for (const [x0, y0, x1, y1] of [[w / 2, 0, w / 2, h], [w / 4, 0, w / 4, h], [w * 0.75, 0, w * 0.75, h], [0, h / 2, w, h / 2]]) {
      ctx.strokeStyle = 'rgba(200, 222, 255, 0.07)';
      ctx.beginPath(); ctx.moveTo(x0 + 2, y0 + 2); ctx.lineTo(x1 + 2, y1 + 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(5, 16, 36, 0.18)';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    const line = 'rgba(232, 241, 255, 0.92)';
    const faint = 'rgba(232, 241, 255, 0.55)';
    ctx.strokeStyle = line;
    ctx.fillStyle = line;

    // Sheet border.
    ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, w - 100, h - 100);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(64, 64, w - 128, h - 128);

    /** A wall: two lines with hatching between, the draughtsman's convention. */
    const wall = (x0, y0, x1, y1, t = 16) => {
      const horizontal = Math.abs(y1 - y0) < Math.abs(x1 - x0);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = line;
      if (horizontal) {
        ctx.strokeRect(Math.min(x0, x1), y0 - t / 2, Math.abs(x1 - x0), t);
        ctx.lineWidth = 1;
        ctx.strokeStyle = faint;
        for (let x = Math.min(x0, x1) + 6; x < Math.max(x0, x1); x += 12) {
          ctx.beginPath(); ctx.moveTo(x, y0 + t / 2); ctx.lineTo(x + t, y0 - t / 2); ctx.stroke();
        }
      } else {
        ctx.strokeRect(x0 - t / 2, Math.min(y0, y1), t, Math.abs(y1 - y0));
        ctx.lineWidth = 1;
        ctx.strokeStyle = faint;
        for (let y = Math.min(y0, y1) + 6; y < Math.max(y0, y1); y += 12) {
          ctx.beginPath(); ctx.moveTo(x0 - t / 2, y); ctx.lineTo(x0 + t / 2, y + t); ctx.stroke();
        }
      }
    };
    /** A door: a gap, a leaf and its swing. */
    const door = (x, y, size, angleStart, angleEnd) => {
      ctx.lineWidth = 2;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angleEnd) * size, y + Math.sin(angleEnd) * size);
      ctx.stroke();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, size, angleStart, angleEnd);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const label = (text, x, y, size = 24, align = 'center', weight = 700) => {
      ctx.fillStyle = line;
      ctx.font = `${weight} ${size}px ${DRAFT}`;
      ctx.textAlign = align;
      ctx.fillText(text, x, y);
    };
    /** A numbered ring and a leader line to its note. */
    const ring = (n, x, y, noteX, noteY, lines) => {
      ctx.strokeStyle = line;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 37, 0, Math.PI * 2); ctx.stroke();
      label(String(n), x, y + 12, 34);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + (noteX > x ? 38 : -38), y); ctx.lineTo(noteX, noteY - 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + (noteX > x ? 38 : -38), y, 4, 0, Math.PI * 2); ctx.fill();
      lines.forEach((text, i) => label(text, noteX + (noteX > x ? 8 : -8), noteY + i * 28, i === 0 ? 24 : 20, noteX > x ? 'left' : 'right', i === 0 ? 700 : 400));
    };

    // --- first floor: the bedroom and the hall --------------------------
    label(plan.panels.firstFloor, 140, 140, 28, 'left');
    ctx.fillRect(140, 150, 300, 2);
    const bx0 = 160, by0 = 200, bx1 = 640, by1 = 560;
    wall(bx0, by0, bx1, by0); wall(bx0, by1, bx0 + 210, by1); wall(bx0 + 330, by1, bx1, by1);
    wall(bx0, by0, bx0, by1); wall(bx1, by0, bx1, by1);
    // window, bed, restraint point
    ctx.lineWidth = 2; ctx.strokeStyle = line;
    ctx.strokeRect(bx0 + 60, by0 - 10, 130, 20);
    ctx.strokeRect(bx1 - 250, by0 + 30, 170, 230);
    ctx.strokeRect(bx1 - 250, by0 + 30, 170, 50);
    ctx.beginPath(); ctx.arc(bx1 - 165, by0 + 40, 9, 0, Math.PI * 2); ctx.fill();
    label(plan.rooms.bedroom, (bx0 + bx1) / 2 - 90, by0 + 220, 30);
    door(bx0 + 210, by1, 115, -Math.PI / 2, 0);
    // hall runs off down the sheet
    const hx0 = bx0 + 200, hx1 = bx0 + 340;
    wall(hx0, by1, hx0, 1090); wall(hx1, by1, hx1, 1090);
    label(plan.rooms.hall, (hx0 + hx1) / 2, 820, 24);
    // stair, treads and arrow
    for (let y = 930; y < 1090; y += 18) {
      ctx.lineWidth = 1.4; ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(hx0 + 8, y); ctx.lineTo(hx1 - 8, y); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo((hx0 + hx1) / 2, 940); ctx.lineTo((hx0 + hx1) / 2, 1080); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((hx0 + hx1) / 2 - 12, 1060); ctx.lineTo((hx0 + hx1) / 2, 1082); ctx.lineTo((hx0 + hx1) / 2 + 12, 1060); ctx.stroke();
    label(plan.rooms.stairDown, hx1 + 20, 1010, 20, 'left');
    ring(1, bx0 + 270, by1 + 70, 700, 640, plan.rings[0]);

    // --- the cellar: the laboratory ---------------------------------------
    label(plan.panels.cellar, 1060, 140, 28, 'left');
    ctx.fillRect(1060, 150, 220, 2);
    const lx0 = 1080, ly0 = 200, lx1 = 1820, ly1 = 600;
    wall(lx0, ly0, lx1, ly0); wall(lx0, ly1, lx1 - 180, ly1); wall(lx1 - 60, ly1, lx1, ly1);
    wall(lx0, ly0, lx0, ly1); wall(lx1, ly0, lx1, ly1);
    ctx.lineWidth = 2; ctx.strokeStyle = line;
    // benches, the table, the panel
    ctx.strokeRect(lx0 + 40, ly0 + 40, 300, 70);
    ctx.strokeRect(lx0 + 40, ly1 - 110, 220, 70);
    ctx.strokeRect(lx0 + 400, ly0 + 150, 200, 90);
    ctx.beginPath(); ctx.arc(lx0 + 500, ly0 + 195, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(lx1 - 70, ly0 + 40, 40, 110);
    label(plan.rooms.panel, lx1 - 80, ly0 + 100, 18, 'right', 400);
    label(plan.rooms.lab, (lx0 + lx1) / 2 + 40, ly0 + 330, 30);
    // the steel door, drawn heavier
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(lx1 - 180, ly1); ctx.lineTo(lx1 - 60, ly1); ctx.stroke();
    door(lx1 - 180, ly1, 120, 0, Math.PI / 2);
    ring(2, lx1 - 120, ly1 + 110, 1500, 760, plan.rings[1]);

    // --- ground floor: the study and the front door ---------------------
    label(plan.panels.groundFloor, 140, 1180, 28, 'left');
    ctx.fillRect(140, 1190, 330, 2);
    const sx0 = 620, sy0 = 900, sx1 = 1180, sy1 = 1240;
    wall(sx0, sy0, sx1, sy0); wall(sx0, sy1, sx1 - 220, sy1); wall(sx1 - 90, sy1, sx1, sy1);
    wall(sx0, sy0, sx0, sy1); wall(sx1, sy0, sx1, sy1);
    ctx.lineWidth = 2; ctx.strokeStyle = line;
    ctx.strokeRect(sx0 + 50, sy0 + 40, 220, 100);
    for (let i = 0; i < 3; i++) ctx.strokeRect(sx0 + 330 + i * 70, sy0 + 20, 54, 30);
    label(plan.rooms.study, (sx0 + sx1) / 2, sy0 + 230, 30);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(sx1 - 220, sy1); ctx.lineTo(sx1 - 90, sy1); ctx.stroke();
    // three locks on the leaf
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(sx1 - 110, sy1 - 18 - i * 20, 6, 0, Math.PI * 2); ctx.fill();
    }
    label(plan.rooms.frontDoor, sx1 - 155, sy1 + 40, 18, 'center', 400);
    ring(3, sx1 - 155, sy1 - 110, 1290, 1000, plan.rings[2]);

    // --- title block --------------------------------------------------------
    const tx = w - 640, ty = h - 330;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(tx, ty, 576, 266);
    ctx.lineWidth = 1.2;
    [62, 112, 162, 212].forEach((dy) => { ctx.beginPath(); ctx.moveTo(tx, ty + dy); ctx.lineTo(tx + 576, ty + dy); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(tx + 288, ty + 212); ctx.lineTo(tx + 288, ty + 266); ctx.stroke();
    plan.titleBlock.forEach((text, i) => label(text, tx + 18, ty + [44, 95, 145, 195][i], [30, 21, 21, 21][i], 'left', i === 0 ? 700 : 400));
    label(plan.drawnBy, tx + 18, ty + 248, 20, 'left', 400);
    label(plan.date, tx + 306, ty + 248, 20, 'left', 400);

    // --- in pencil, afterwards ----------------------------------------------
    // In the open middle of the sheet, between the first-floor plan and the
    // cellar's notes, where it is the first thing the eye lands on.
    ctx.save();
    ctx.translate(760, 770);
    ctx.rotate(-0.04);
    ctx.fillStyle = 'rgba(24, 26, 32, 0.82)';
    ctx.font = `700 54px ${HAND}`;
    ctx.textAlign = 'left';
    plan.pencil.forEach((text, i) => ctx.fillText(text, 0, i * 60));
    // the last line underlined twice, pressed hard
    const lastWidth = ctx.measureText(plan.pencil[plan.pencil.length - 1]).width;
    const underY = (plan.pencil.length - 1) * 60 + 16;
    ctx.strokeStyle = 'rgba(24, 26, 32, 0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-6, underY); ctx.quadraticCurveTo(lastWidth / 2, underY - 6, lastWidth + 10, underY - 4); ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(4, underY + 11); ctx.quadraticCurveTo(lastWidth / 2, underY + 6, lastWidth, underY + 7); ctx.stroke();
    ctx.restore();

    // Light-struck edge, where the sheet hung in a window before it was framed.
    const fade = ctx.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'rgba(180, 205, 235, 0.10)');
    fade.addColorStop(0.2, 'rgba(180, 205, 235, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
  });
}

/* ----------------------------------------------------------------- note ---- */

/** Annabelle's note on the hall table: lined paper, blue ink, in a hurry. */
export function createHallNoteArt(note) {
  return makeArt(900, 1200, (ctx, w, h) => {
    const rand = seeded(1987);
    const paper = ctx.createLinearGradient(0, 0, w, h);
    paper.addColorStop(0, '#efe7d2');
    paper.addColorStop(1, '#e2d6b8');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    paperGrain(ctx, w, h, rand, { strength: 0.7, fibres: 900, blotches: 12 });
    // feint ruling and the margin
    ctx.lineWidth = 2;
    for (let y = 170; y < h - 40; y += 64) {
      ctx.strokeStyle = 'rgba(80, 120, 170, 0.32)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(190, 70, 70, 0.4)';
    ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(110, h); ctx.stroke();
    // torn off a pad along the top
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, 14 + rand() * 16);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // folded in three to carry
    for (const y of [h / 3, (h * 2) / 3]) {
      const g = ctx.createLinearGradient(0, y - 14, 0, y + 14);
      g.addColorStop(0, 'rgba(120, 90, 50, 0)');
      g.addColorStop(0.5, 'rgba(120, 90, 50, 0.16)');
      g.addColorStop(0.55, 'rgba(255, 252, 240, 0.25)');
      g.addColorStop(1, 'rgba(120, 90, 50, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 14, w, 28);
    }
    // the writing, sitting on the lines
    ctx.fillStyle = '#1f2f5c';
    ctx.textAlign = 'left';
    let y = 160;
    note.lines.forEach((text, i) => {
      if (!text) { y += 64; return; }
      ctx.save();
      ctx.translate(140 + (rand() - 0.5) * 8, y - 10);
      ctx.rotate((rand() - 0.5) * 0.025);
      ctx.font = `${i === note.lines.length - 1 ? 700 : 500} ${i === 0 ? 62 : 58}px ${HAND}`;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      y += 64;
    });
    edgeBurn(ctx, w, h, '120, 90, 50', 0.22);
  });
}

/* --------------------------------------------------------- height marks ---- */

/**
 * Children's heights pencilled up the wall beside a bedroom door, laid out the
 * way a family does it: one child's marks to the left of the line with their
 * initial and age, the other's to the right. Drawn on a transparent canvas so
 * it sits on the wallpaper, at PX_PER_METRE so each mark is at the height it
 * says. The reading view draws the same marks bigger, on the paper itself.
 */
export const HEIGHT_MARKS_SIZE = { widthMetres: 0.56, heightMetres: 2.3 };
const HEIGHT_MARKS_PX_PER_METRE = 700;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} marks - HALLWAY.heightMarks.art
 * @param {object} layout
 * @param {(metres: number) => number} layout.yFor - wall height to canvas y
 * @param {number} layout.centreX - x of the line both children stood against
 * @param {number} layout.scale - 1 on the wall; bigger in the reading view
 * @param {number} layout.width - canvas width, for the gouge
 */
function drawHeightMarks(ctx, marks, { yFor, centreX, scale, width }) {
  const rand = seeded(1966);
  const lineLength = 105 * scale;
  // Years of small hands against the wall have rubbed the paper paler: a
  // soft smudge, never a rectangle, which would read as a sheet of paper.
  const lowest = yFor(1.8);
  const highest = yFor(0.9);
  ctx.save();
  ctx.filter = `blur(${Math.round(28 * scale)}px)`;
  ctx.fillStyle = 'rgba(240, 222, 186, 0.09)';
  ctx.beginPath();
  ctx.ellipse(centreX, (lowest + highest) / 2, 150 * scale, (highest - lowest) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.font = `700 ${Math.round(40 * scale)}px ${HAND}`;
  ctx.textBaseline = 'middle';
  for (const mark of marks.pencil) {
    const y = yFor(mark.height);
    const left = mark.who === 'M';
    const x0 = left ? centreX - lineLength : centreX;
    const x1 = left ? centreX : centreX + lineLength;
    // Graphite catches the light: a dark line with a faint sheen under it.
    ctx.strokeStyle = 'rgba(200, 196, 188, 0.25)';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath(); ctx.moveTo(x0, y + 2 * scale); ctx.lineTo(x1, y + 2 * scale); ctx.stroke();
    ctx.strokeStyle = `rgba(18, 17, 16, ${0.8 + rand() * 0.15})`;
    ctx.lineWidth = 4 * scale;
    ctx.beginPath(); ctx.moveTo(x0, y + (rand() - 0.5) * 2 * scale); ctx.lineTo(x1, y + (rand() - 0.5) * 3 * scale); ctx.stroke();
    ctx.textAlign = left ? 'right' : 'left';
    const tx = left ? x0 - 12 * scale : x1 + 12 * scale;
    ctx.fillStyle = 'rgba(200, 196, 188, 0.22)';
    ctx.fillText(mark.label, tx + scale, y + 2 * scale);
    ctx.fillStyle = 'rgba(18, 17, 16, 0.92)';
    ctx.fillText(mark.label, tx, y);
  }
  ctx.textBaseline = 'alphabetic';

  // The last mark is not pencil. It is gouged, well above either child.
  const top = yFor(marks.gouge.height);
  ctx.strokeStyle = 'rgba(20, 14, 10, 0.85)';
  ctx.lineWidth = 7 * scale;
  ctx.beginPath(); ctx.moveTo(width * 0.08, top + 4 * scale); ctx.lineTo(width * 0.92, top - 3 * scale); ctx.stroke();
  ctx.strokeStyle = 'rgba(205, 190, 160, 0.55)';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath(); ctx.moveTo(width * 0.08 + 2, top + 8 * scale); ctx.lineTo(width * 0.92 - 2, top + scale); ctx.stroke();
}

export function createHeightMarksArt(marks) {
  const W = Math.round(HEIGHT_MARKS_SIZE.widthMetres * HEIGHT_MARKS_PX_PER_METRE);
  const H = Math.round(HEIGHT_MARKS_SIZE.heightMetres * HEIGHT_MARKS_PX_PER_METRE);
  return makeArt(W, H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    drawHeightMarks(ctx, marks, {
      yFor: (metres) => h - metres * HEIGHT_MARKS_PX_PER_METRE,
      centreX: w / 2,
      scale: 1,
      width: w
    });
  });
}

/**
 * The marks as the reader shows them: drawn again at reading size on the
 * wallpaper they are on, cropped to the stretch of wall the children reached.
 * The wall decal is transparent, which on the reader's dark panel is nothing.
 *
 * @param {object} marks - HALLWAY.heightMarks.art
 * @param {string} wallpaperUrl
 */
export function composeHeightMarksImage(marks, wallpaperUrl) {
  return {
    async toImageUrl() {
      await fontsReady;
      const paper = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = wallpaperUrl;
      });
      // 0.85 m to 2.3 m of wall, 1.1 m wide.
      const fromMetres = 0.85;
      const toMetres = 2.3;
      const out = document.createElement('canvas');
      out.width = 1000;
      const pxPerMetre = out.width / 1.1;
      out.height = Math.round((toMetres - fromMetres) * pxPerMetre);
      const ctx = out.getContext('2d');
      // The paper at the scale it hangs at: one repeat is 2.68 m across.
      const tileW = 2.68 * pxPerMetre;
      const tileH = tileW * (paper.height / paper.width);
      for (let x = -tileW * 0.3; x < out.width; x += tileW) {
        for (let y = -tileH * 0.2; y < out.height; y += tileH) ctx.drawImage(paper, x, y, tileW, tileH);
      }
      // Darkened to how it reads under the pendant.
      ctx.fillStyle = 'rgba(20, 12, 6, 0.42)';
      ctx.fillRect(0, 0, out.width, out.height);
      drawHeightMarks(ctx, marks, {
        yFor: (metres) => (toMetres - metres) * pxPerMetre,
        centreX: out.width / 2,
        scale: pxPerMetre / HEIGHT_MARKS_PX_PER_METRE * 1.15,
        width: out.width
      });
      return out.toDataURL('image/jpeg', 0.9);
    }
  };
}

/* -------------------------------------------------------------- mirror ---- */

/**
 * A tall hall mirror, struck in the middle and struck again. Returns the glass
 * colour and a roughness map from the same crack layout, so the light catches
 * the cracks and the missing pieces go matte black.
 */
export function createShatteredMirrorArt() {
  const W = 700;
  const H = 1500;
  const rand = seeded(87);
  const impact = { x: W * 0.47, y: H * 0.36 };
  // The crack layout, made once and drawn into both maps.
  const spokes = [];
  const spokeCount = 17;
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const pts = [[impact.x, impact.y]];
    let x = impact.x;
    let y = impact.y;
    let a = angle;
    const reach = 500 + rand() * 900;
    for (let d = 0; d < reach; d += 30 + rand() * 40) {
      a += (rand() - 0.5) * 0.28;
      x += Math.cos(a) * 40;
      y += Math.sin(a) * 40;
      pts.push([x, y]);
      if (x < 0 || x > W || y < 0 || y > H) break;
    }
    spokes.push(pts);
  }
  const rings = [60, 140, 250, 390].map((r) => r * (0.85 + rand() * 0.3));
  // Shards knocked out near the impact: wedges between neighbouring spokes.
  const missing = [];
  for (let i = 0; i < spokeCount; i++) {
    if (rand() < 0.42) {
      const r0 = rand() < 0.5 ? 0 : rings[0];
      const r1 = rings[rand() < 0.6 ? 1 : 2];
      missing.push({ i, r0, r1 });
    }
  }
  const angleOf = (i) => {
    const p = spokes[i][1] ?? spokes[i][0];
    return Math.atan2(p[1] - impact.y, p[0] - impact.x);
  };
  const traceWedge = (ctx, { i, r0, r1 }) => {
    const a0 = angleOf(i);
    const a1 = angleOf((i + 1) % spokeCount);
    const span = ((a1 - a0) + Math.PI * 4) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(impact.x + Math.cos(a0) * r0, impact.y + Math.sin(a0) * r0);
    for (let t = 0; t <= 1.0001; t += 0.25) ctx.lineTo(impact.x + Math.cos(a0 + span * t) * r1 * (0.92 + rand() * 0.12), impact.y + Math.sin(a0 + span * t) * r1 * (0.92 + rand() * 0.12));
    for (let t = 1; t >= -0.0001; t -= 0.5) ctx.lineTo(impact.x + Math.cos(a0 + span * t) * r0, impact.y + Math.sin(a0 + span * t) * r0);
    ctx.closePath();
  };
  const drawCracks = (ctx, colour, width) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    for (const pts of spokes) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    for (const r of rings) {
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.12) {
        const rr = r * (0.9 + rand() * 0.2);
        const x = impact.x + Math.cos(a) * rr;
        const y = impact.y + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };

  const colour = makeArt(W, H, (ctx, w, h) => {
    const r = seeded(9);
    // Old silvering: dark, faintly green, foxed brown where the backing failed.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#3d433f');
    g.addColorStop(0.5, '#2a2f2d');
    g.addColorStop(1, '#1f2322');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = r() * w;
      const y = r() < 0.6 ? (r() < 0.5 ? r() * 160 : h - r() * 220) : r() * h;
      const rad = 8 + r() * 46;
      const f = ctx.createRadialGradient(x, y, 0, x, y, rad);
      f.addColorStop(0, `rgba(122, 96, 60, ${0.25 + r() * 0.3})`);
      f.addColorStop(1, 'rgba(122, 96, 60, 0)');
      ctx.fillStyle = f;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // a soft sheen down the glass
    const sheen = ctx.createLinearGradient(0, 0, w, 0);
    sheen.addColorStop(0.15, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.3, 'rgba(220, 230, 225, 0.08)');
    sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    // missing pieces show the board behind
    for (const piece of missing) {
      traceWedge(ctx, piece);
      ctx.fillStyle = '#100c09';
      ctx.fill();
    }
    drawCracks(ctx, 'rgba(225, 232, 228, 0.55)', 2.2);
    drawCracks(ctx, 'rgba(10, 12, 12, 0.6)', 1);
    // the blow itself
    const hit = ctx.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, 60);
    hit.addColorStop(0, 'rgba(230, 236, 232, 0.6)');
    hit.addColorStop(1, 'rgba(230, 236, 232, 0)');
    ctx.fillStyle = hit;
    ctx.fillRect(impact.x - 60, impact.y - 60, 120, 120);
  });
  const roughness = makeArt(W, H, (ctx, w, h) => {
    ctx.fillStyle = 'rgb(46, 46, 46)';
    ctx.fillRect(0, 0, w, h);
    for (const piece of missing) {
      traceWedge(ctx, piece);
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fill();
    }
    drawCracks(ctx, 'rgb(150, 150, 150)', 3);
  }, { srgb: false });
  return { colour, roughness };
}

/* --------------------------------------------------- pale picture marks ---- */

/**
 * Where pictures used to hang: paler rectangles of wallpaper the light never
 * reached, a rim of dust along their tops, and the hooks left in the wall.
 */
export function createPaleMarksArt(rects) {
  return makeArt(1200, 900, (ctx, w, h) => {
    const rand = seeded(1980);
    ctx.clearRect(0, 0, w, h);
    for (const [x, y, rw, rh] of rects) {
      const px = x * w;
      const py = y * h;
      const pw = rw * w;
      const ph = rh * h;
      // Barely paler: unfaded paper, not a card stuck on the wall. Most of
      // what says "a frame hung here" is the grime that settled round it.
      ctx.fillStyle = 'rgba(255, 236, 196, 0.055)';
      ctx.fillRect(px, py, pw, ph);
      const inner = ctx.createLinearGradient(px, py, px, py + ph);
      inner.addColorStop(0, 'rgba(255, 240, 210, 0.035)');
      inner.addColorStop(1, 'rgba(255, 240, 210, 0)');
      ctx.fillStyle = inner;
      ctx.fillRect(px, py, pw, ph);
      // A soft band of grime just outside the edge, heaviest along the top.
      for (let i = 0; i < 4; i++) {
        const spread = 4 + i * 5;
        ctx.strokeStyle = `rgba(30, 20, 12, ${0.09 - i * 0.018})`;
        ctx.lineWidth = 5;
        ctx.strokeRect(px - spread, py - spread, pw + spread * 2, ph + spread * 2);
      }
      ctx.fillStyle = 'rgba(30, 20, 12, 0.22)';
      ctx.fillRect(px - 6, py - 7, pw + 12, 6);
      // the hook, a brass curl
      const hx = px + pw / 2;
      const hy = py - 46 - rand() * 10;
      ctx.strokeStyle = 'rgba(120, 92, 44, 0.95)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 14);
      ctx.lineTo(hx, hy + 6);
      ctx.arc(hx + 9, hy + 6, 9, Math.PI, 0, true);
      ctx.stroke();
      ctx.fillStyle = 'rgba(70, 50, 22, 0.95)';
      ctx.beginPath(); ctx.arc(hx, hy - 16, 6, 0, Math.PI * 2); ctx.fill();
    }
  });
}

/* ----------------------------------------------------------- frame back ---- */

/** The back of the frame left face down: framer's paper, a sticker and a label. */
export function createFrameBackArt(back) {
  return makeArt(800, 1000, (ctx, w, h) => {
    const rand = seeded(1225);
    ctx.fillStyle = '#7c5a36';
    ctx.fillRect(0, 0, w, h);
    paperGrain(ctx, w, h, rand, { strength: 1.4, fibres: 2200, blotches: 30 });
    // gummed tape round the edge
    ctx.fillStyle = 'rgba(150, 118, 70, 0.85)';
    for (const [x, y, rw, rh] of [[0, 0, w, 60], [0, h - 60, w, 60], [0, 0, 60, h], [w - 60, 0, 60, h]]) ctx.fillRect(x, y, rw, rh);
    ctx.strokeStyle = 'rgba(60, 40, 18, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 60, w - 120, h - 120);
    // a split where the paper was torn to get the photograph out
    ctx.fillStyle = '#1a120b';
    ctx.beginPath();
    ctx.moveTo(250, 380);
    for (let i = 0; i <= 12; i++) ctx.lineTo(250 + i * 28, 380 + Math.sin(i * 1.7) * 14 + (rand() - 0.5) * 10);
    for (let i = 12; i >= 0; i--) ctx.lineTo(250 + i * 28, 430 + Math.cos(i * 1.3) * 12 + (rand() - 0.5) * 10);
    ctx.closePath();
    ctx.fill();
    // the framer's sticker
    ctx.fillStyle = '#e8dfc8';
    ctx.fillRect(470, 760, 240, 120);
    ctx.strokeStyle = '#7a1f16';
    ctx.lineWidth = 3;
    ctx.strokeRect(480, 770, 220, 100);
    ctx.fillStyle = '#7a1f16';
    ctx.textAlign = 'center';
    ctx.font = `900 24px ${DISPLAY}`;
    ctx.fillText(back.framer[0], 590, 808);
    ctx.font = `400 16px ${SERIF}`;
    ctx.fillText(back.framer[1], 590, 834);
    ctx.fillText(back.framer[2], 590, 856);
    // the label, in a mother's hand
    ctx.save();
    ctx.translate(170, 610);
    ctx.rotate(-0.04);
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(-20, -70, 470, 150);
    ctx.fillStyle = '#2a2420';
    ctx.font = `700 54px ${HAND}`;
    ctx.textAlign = 'left';
    ctx.fillText(back.label[0], 0, -8);
    ctx.font = `500 44px ${HAND}`;
    ctx.fillText(back.label[1], 0, 50);
    ctx.restore();
    edgeBurn(ctx, w, h, '40, 26, 10', 0.45);
  });
}

/* ---------------------------------------------------------------- plaque ---- */

/** An engraved brass plate for under the house photograph. */
export function createPlaqueArt(text) {
  return makeArt(1024, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b08d4a');
    g.addColorStop(0.45, '#8b6a32');
    g.addColorStop(1, '#5e4720');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(1891);
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '40, 28, 10' : '255, 230, 170'}, ${0.08 * rand()})`;
      ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 30, 1);
    }
    ctx.strokeStyle = 'rgba(40, 28, 10, 0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = 'center';
    ctx.font = `700 62px ${SERIF}`;
    ctx.fillStyle = 'rgba(255, 228, 160, 0.35)';
    ctx.fillText(text, w / 2 + 1, h / 2 + 23);
    ctx.fillStyle = 'rgba(36, 24, 8, 0.92)';
    ctx.fillText(text, w / 2, h / 2 + 21);
  });
}
