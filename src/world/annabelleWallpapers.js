import * as THREE from 'three';

/**
 * WALLPAPER FOR ANNABELLE'S ROOMS (annabelleRooms.js). One generator per age,
 * plus the decals that go on top: crayon on the five-year-old's clouds, the
 * ghosts of posters and a string of fairy lights on the plum paint she chose
 * at eighteen, a drop of damask peeling off at thirty, and the tear that shows
 * every older room still underneath the newer one.
 *
 * Wallpapers are 512 x 1024 canvases mapped floor to ceiling (repeatY = 1) on
 * a 2.35 m wall, 512 px = userData.periodM (1.175 m) across, and tile
 * seamlessly in X only. Decals are single transparent quads; userData.sizeM is
 * the real-world size each one is drawn for.
 */

// ===========================================================================
// Annabelle's rooms -- the nursery
// ===========================================================================

/** Small LCG, so the star scatter and the grain come out the same every boot. */
function nursery_rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Draw a motif at x, and again one canvas-width over if it hangs off either
 * edge. The half that falls off the right has to come back in on the left, or
 * every repeat along the wall shows a motif sliced in two.
 */
function nursery_wrapped(x, halfWidth, width, draw) {
  draw(x);
  if (x - halfWidth < 0) draw(x + width);
  if (x + halfWidth > width) draw(x - width);
}

/** Path builders return closures so nursery_silhouette can trace them twice. */
function nursery_oval(ctx, x, y, rx, ry, rot = 0) {
  return () => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  };
}

function nursery_poly(ctx, pts) {
  return () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
}

function nursery_starPath(ctx, x, y, outer, inner, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot - Math.PI / 2 + i * Math.PI / 5;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/**
 * A crescent: circle A less a same-size circle B shifted 0.6 r along +x,
 * traced as A's outer arc then B's inner arc between their two crossings.
 * A real path, so it fills and strokes like any other shape -- an erase with
 * destination-out would have punched through the paper underneath. Unrotated,
 * the hollow faces +x.
 */
function nursery_crescentPath(ctx, x, y, r, rot = 0) {
  const d = r * 0.6;
  const a = Math.atan2(Math.sqrt(r * r - d * d / 4), d / 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, r, a, Math.PI * 2 - a, false);
  ctx.arc(d, 0, r, Math.PI + a, Math.PI - a, true);
  ctx.closePath();
  ctx.restore();   // the path keeps the transform it was built under
}

/**
 * Fill several shapes as ONE printed silhouette with a single soft outline.
 * Every shape is stroked first at twice the line width, then all of them are
 * filled on top: that buries the inner half of each stroke and every line
 * where two shapes overlap, so the duck's head and body read as one duck
 * rather than two outlined circles.
 */
function nursery_silhouette(ctx, paths, fill, line, lineWidth = 1.6) {
  ctx.strokeStyle = line;
  ctx.lineWidth = lineWidth * 2;
  ctx.lineJoin = 'round';
  for (const p of paths) { p(); ctx.stroke(); }
  ctx.fillStyle = fill;
  for (const p of paths) { p(); ctx.fill(); }
}

/** Duckling on two ripples, facing right. (x, base) is the waterline centre. */
function nursery_duckling(ctx, x, base, c) {
  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const [x0, x1] of [[-24, -9], [-3, 15]]) {
    ctx.beginPath();
    ctx.moveTo(x + x0, base + 1.5);
    ctx.quadraticCurveTo(x + (x0 + x1) / 2, base - 1, x + x1, base + 1.5);
    ctx.stroke();
  }
  // Beak first, so the head's outline closes across its root.
  nursery_silhouette(ctx, [nursery_poly(ctx, [[x + 16, base - 29], [x + 27, base - 26.5], [x + 16, base - 23]])],
    c.beak, c.line);
  nursery_silhouette(ctx, [
    nursery_poly(ctx, [[x - 13, base - 19], [x - 25, base - 24], [x - 17, base - 8]]),   // tail tuft
    nursery_oval(ctx, x - 2, base - 11.5, 17, 11.5),
    nursery_oval(ctx, x + 10, base - 27, 9.5, 9.5)
  ], c.butter, c.line);
  ctx.fillStyle = c.butterDeep;
  nursery_oval(ctx, x - 4, base - 12, 8.5, 4.8, -0.25)();
  ctx.fill();
  ctx.fillStyle = c.blush;
  nursery_oval(ctx, x + 13, base - 23.5, 2.6, 1.8)();
  ctx.fill();
  ctx.fillStyle = c.eye;
  nursery_oval(ctx, x + 12, base - 29.5, 1.6, 1.8)();
  ctx.fill();
}

/** Bunny, sitting, facing left -- toward the duckling, across the star cloud. */
function nursery_bunny(ctx, x, base, c) {
  ctx.strokeStyle = c.grass;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const [gx, lean] of [[-22, -2], [-19, 1.5], [26, 2], [29, -1.5]]) {
    ctx.beginPath();
    ctx.moveTo(x + gx, base + 1.5);
    ctx.lineTo(x + gx + lean, base - 5);
    ctx.stroke();
  }
  // Ears lean back (tops to the right); both roots sit inside the head, so
  // the fill pass swallows their outlines there.
  nursery_silhouette(ctx, [
    nursery_oval(ctx, x - 6, base - 41, 4.2, 10, 0.18),
    nursery_oval(ctx, x - 1, base - 39, 4.2, 9.5, 0.45),
    nursery_oval(ctx, x + 4, base - 13, 17, 13),
    nursery_oval(ctx, x + 21, base - 9, 5.5, 5.5),     // tail
    nursery_oval(ctx, x - 10, base - 27, 10.5, 9.5),
    nursery_oval(ctx, x - 8, base - 2, 5.5, 2.8)       // front paw
  ], c.bunny, c.line);
  ctx.fillStyle = c.pink;
  nursery_oval(ctx, x - 6, base - 41.5, 1.8, 6.5, 0.18)();
  ctx.fill();
  nursery_oval(ctx, x - 1.2, base - 39.5, 1.8, 6, 0.45)();
  ctx.fill();
  // The haunch, one line, so the body isn't a featureless egg.
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x + 9, base - 8, 7, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();
  ctx.fillStyle = c.blush;
  nursery_oval(ctx, x - 13, base - 23, 2.6, 1.8)();
  ctx.fill();
  ctx.fillStyle = c.eye;
  nursery_oval(ctx, x - 14, base - 29, 1.6, 1.8)();
  ctx.fill();
  ctx.fillStyle = c.nose;
  nursery_oval(ctx, x - 19.6, base - 26.5, 1.4, 1.2)();
  ctx.fill();
}

function nursery_cloud(ctx, x, y, c) {
  nursery_silhouette(ctx, [
    nursery_oval(ctx, x - 14, y + 2, 8, 8),
    nursery_oval(ctx, x - 4, y - 4, 11, 11),
    nursery_oval(ctx, x + 9, y - 2, 9.5, 9.5),
    nursery_oval(ctx, x + 18, y + 3.5, 6.5, 6.5),
    nursery_oval(ctx, x + 1, y + 6, 22, 5.5)            // flat underside
  ], c.cloud, c.line);
}

function nursery_friezeStar(ctx, x, y, r, rot, c) {
  nursery_silhouette(ctx, [() => nursery_starPath(ctx, x, y, r, r * 0.45, rot)], c.gold, c.line, 1.2);
}

/**
 * NURSERY WALLPAPER. The one room that is nearly right, so its paper is the
 * cleanest surface in the level: candy stripes above, a frieze of ducklings
 * and bunnies at chair-rail height, plain pink ticking below. No stains and
 * no damp line -- every other wall in the maze has them, and their absence
 * here is the uncanny part.
 *
 * The canvas is 512 x 1024 and the level maps it floor-to-ceiling with
 * repeatY = 1, so on a 2.35 m wall one pixel is 2.3 mm in BOTH directions and
 * a height in metres converts straight to a row (yAt below):
 *
 *   2.35 m   ceiling      candy stripes; tiny stars and moons in the cream lanes
 *   1.235 m  frieze top   ducklings, clouds and bunnies on powder blue (17 cm)
 *   1.065 m  frieze foot  scalloped hem hanging to ~1.047 m
 *   0 m      floor        greyed pink with tone-on-tone ticking
 *
 * It only has to tile SIDEWAYS (repeatX = wallLength / periodM), so every
 * horizontal rhythm divides 512: stripes 64 px (colour cycle 256), frieze
 * slots 128, scallops 16, frieze dots 8, ticking 32. Anything that could
 * straddle x = 0 goes through nursery_wrapped() and is drawn on both sides,
 * and the grain filter runs round each row as a loop.
 */
export function createNurseryWallpaperTexture({ seed = 1 } = {}) {
  const W = 512, H = 1024, WALL_H = 2.35;
  const yAt = (m) => Math.round((1 - m / WALL_H) * H);
  const rand = nursery_rng(seed);

  // The brief's pastels, each pulled a few percent toward warm grey: shop-
  // fresh paper under 2700K bulbs, not a screen swatch. Stripes are
  // [band, pinstripe]; the pinstripe is the same hue a step deeper.
  const c = {
    cream: '#eee5d2',
    stripes: [['#e4b6c0', '#d39faa'], ['#b7cfe2', '#9db9cf'], ['#eed79e', '#dcc07e'], ['#c2dbba', '#a8c59f']],
    frieze: '#c0d5e5',
    rule: '#93abc0',
    pinkLine: '#dba7b3',
    line: '#838d99',
    butter: '#f0d07c',
    butterDeep: '#dcb45a',
    beak: '#e6a067',
    bunny: '#f4ede1',
    cloud: '#f4ede1',
    pink: '#e6b3bf',
    nose: '#cf8796',
    blush: 'rgba(226, 150, 160, 0.55)',
    eye: '#4a3d3a',
    grass: '#97b98d',
    gold: '#e0bc60',
    goldEdge: '#c29e48',
    moon: '#a9c3d9',
    moonEdge: '#8ea9c0',
    lower: '#e3c5ca',
    tick: 'rgba(250, 238, 236, 0.26)',
    tickFaint: 'rgba(196, 150, 160, 0.18)'
  };

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Snapped to whole rows so the printed rules stay crisp instead of smearing
  // across two texels.
  const top = yAt(1.235);   // 486
  const bot = yAt(1.065);   // 560

  // ---------- upper wall: candy stripes on cream ----------
  ctx.fillStyle = c.cream;
  ctx.fillRect(0, 0, W, top);
  // One 64 px period per stripe: a 24 px band with a 2 px pinstripe 5 px off
  // each side, which leaves a 26 px cream lane centred on every multiple of
  // 64. No band crosses the tile edge; the lane at x = 0 does.
  for (let k = 0; k < W / 64; k++) {
    const xc = 32 + k * 64;
    const [band, pin] = c.stripes[k % 4];
    ctx.fillStyle = band;
    ctx.fillRect(xc - 12, 0, 24, top);
    ctx.fillStyle = pin;
    ctx.fillRect(xc - 19, 0, 2, top);
    ctx.fillRect(xc + 17, 0, 2, top);
  }

  // Stars and moons, only in the cream lanes and staggered lane to lane so
  // they never line up into rows. ~3 cm across: a speckle at 3 m that turns
  // into stars as you walk up to it.
  for (let j = 0; j < W / 64; j++) {
    let isStar = j % 2 === 0;
    for (let y = 20 + rand() * 70; y < top - 18; y += 96 + rand() * 40) {
      const x = j * 64 + (rand() - 0.5) * 5;
      const rot = (rand() - 0.5) * 0.6;
      const star = isStar;
      nursery_wrapped(x, 10, W, (px) => {
        if (star) {
          nursery_starPath(ctx, px, y, 6.5, 2.8, rot);
          ctx.fillStyle = c.gold;
          ctx.fill();
          ctx.strokeStyle = c.goldEdge;
        } else {
          nursery_crescentPath(ctx, px, y, 5.8, rot - 0.6);
          ctx.fillStyle = c.moon;
          ctx.fill();
          ctx.strokeStyle = c.moonEdge;
        }
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.stroke();
      });
      isStar = !isStar;
    }
  }

  // ---------- lower wall: plain pink ticking ----------
  ctx.fillStyle = c.lower;
  ctx.fillRect(0, bot, W, H - bot);
  // Tone on tone: crisp at arm's length, a faint texture from the doorway, so
  // the lower wall reads as plain pink and the stripes above do the talking.
  ctx.fillStyle = c.tick;
  for (let x = 8; x < W; x += 32) ctx.fillRect(x, bot, 2, H - bot);
  ctx.fillStyle = c.tickFaint;
  for (let x = 24; x < W; x += 32) ctx.fillRect(x, bot, 1, H - bot);

  // ---------- the frieze ----------
  // Scalloped hem first, so the frieze's bottom rule covers each scallop's
  // chord. 16 px apart: 32 of them span the tile exactly, 0 to 512.
  for (let x = 8; x < W; x += 16) {
    ctx.beginPath();
    ctx.arc(x, bot, 8, 0, Math.PI);
    ctx.fillStyle = c.frieze;
    ctx.fill();
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // A cream margin and a pink hairline over the band, so the stripes stop at a
  // printed edge instead of running into the blue.
  ctx.fillStyle = c.cream;
  ctx.fillRect(0, top - 7, W, 7);
  ctx.fillStyle = c.pinkLine;
  ctx.fillRect(0, top - 5, W, 2);
  ctx.fillStyle = c.frieze;
  ctx.fillRect(0, top, W, bot - top);
  ctx.fillStyle = c.rule;
  ctx.fillRect(0, top, W, 4);
  ctx.fillRect(0, bot - 3, W, 3);
  ctx.fillStyle = c.cream;
  for (let x = 4; x < W; x += 8) {
    ctx.beginPath();
    ctx.arc(x, top + 8, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Four 128 px slots. The duckling faces right and the bunny left, so along
  // the wall they look at each other across the star cloud. Every motif is
  // about 12 cm, readable from the doorway.
  const base = bot - 8;
  const slots = [
    (x) => nursery_duckling(ctx, x, base, c),
    (x) => {
      nursery_cloud(ctx, x, base - 19, c);
      nursery_friezeStar(ctx, x + 25, base - 41, 7.5, -0.2, c);
      nursery_friezeStar(ctx, x - 23, base - 38, 4.5, 0.3, c);
    },
    (x) => nursery_bunny(ctx, x, base, c),
    (x) => {
      nursery_cloud(ctx, x, base - 19, c);
      nursery_silhouette(ctx, [() => nursery_crescentPath(ctx, x + 24, base - 39, 8, -0.7)], c.butter, c.line, 1.2);
      nursery_friezeStar(ctx, x - 23, base - 38, 4.5, -0.25, c);
    }
  ];
  slots.forEach((draw, i) => nursery_wrapped(64 + i * 128, 40, W, draw));

  // ---------- paper grain: the one full-canvas pixel pass ----------
  // Each pixel leans on the one to its left, so the noise comes out as short
  // horizontal fibres rather than TV static. About +-2 levels: felt, not seen.
  // The filter is primed on the tail of the row's own noise, so pixel 0 leans
  // on pixel 511 exactly as it does in the next tile along. A filter started
  // cold at x = 0 would cut every fibre at the tile edge and leave a faint
  // vertical seam each 1.175 m. 0.6^24 is ~5e-6, so a 24 px warm-up is exact
  // once the values are rounded to bytes.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const noise = new Float32Array(W);
  const WARM = 24;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) noise[x] = (rand() - 0.5) * 6;
    let fibre = 0;
    for (let x = W - WARM; x < W; x++) fibre = fibre * 0.6 + noise[x];
    for (let x = 0; x < W; x++) {
      fibre = fibre * 0.6 + noise[x];
      const i = (y * W + x) * 4;
      d[i] += fibre;
      d[i + 1] += fibre;
      d[i + 2] += fibre * 0.9;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  // Clamped vertically: one canvas is exactly floor to ceiling, and a repeat
  // would bleed the pink lower wall into the top row under linear filtering.
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.periodM = 1.175;   // 512 px of a 1024 px = 2.35 m canvas
  return tex;
}

// ---------------------------------------------------------------------------
// AGE FIVE. Cloud-and-balloon nursery paper, kicked along the bottom, with
// crayon drawn straight onto it.
// ---------------------------------------------------------------------------

const five_TAU = Math.PI * 2;
const five_WALL_M = 2.35;
// 512 px = 1.175 m across and 1024 px = 2.35 m up: the same ~436 px/m both
// ways, so a round puff stays round on the wall.
const five_W = 512;
const five_H = 1024;

/** Deterministic LCG, so a seed draws the same wall on every boot. */
function five_rand(seed) {
  let s = (Math.imul((seed | 0) + 1, 0x9e3779b1) ^ 0x2545f491) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function five_canvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Height above the floor in metres -> canvas row. One canvas height is floor to ceiling. */
function five_yAt(m) {
  return (1 - m / five_WALL_M) * five_H;
}

/**
 * Draws fn three times, one canvas-width apart. The wall repeats the canvas
 * along its length, so anything hanging over x=0 or x=W has to come back in
 * on the other side or every seam slices a cloud in half. fn must not call
 * a shared rand(): all three copies have to come out identical.
 */
function five_tiled(ctx, fn) {
  for (const dx of [-five_W, 0, five_W]) {
    ctx.save();
    ctx.translate(dx, 0);
    fn();
    ctx.restore();
  }
}

/**
 * One printed cloud: a flat-bottomed heap of puffs in four screen-printed
 * layers (drop shadow, key line, body, highlight), each a hair out of
 * register the way cheap roller-printed nursery paper always was. Draws from
 * its own seed so the tiled copies match.
 */
function five_cloud(ctx, cx, cy, w, seed) {
  const rand = five_rand(seed);
  const n = 5 + Math.floor(rand() * 3);
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Tallest in the middle, so it reads as a cumulus and not a caterpillar.
    const lift = Math.sin(t * Math.PI);
    puffs.push([
      (t - 0.5) * w * 0.74 + (rand() - 0.5) * w * 0.04,
      -lift * w * 0.13 - rand() * w * 0.03,
      w * (0.12 + 0.12 * lift + rand() * 0.035)
    ]);
  }
  const base = cy + w * 0.09;

  // A layer is the union of the puffs, sliced flat along the base line.
  const layer = (fill, dx, dy, grow, shrink = 1) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w, cy - w, w * 2, base + dy + grow - (cy - w));
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const [px, py, r] of puffs) {
      const rr = r * shrink + grow;
      ctx.moveTo(cx + px + dx + rr, cy + py + dy);
      ctx.arc(cx + px + dx, cy + py + dy, rr, 0, five_TAU);
    }
    ctx.fill();
    ctx.restore();
  };
  layer('rgba(104, 136, 174, 0.40)', w * 0.025, w * 0.04, 0);
  layer('#7193b8', 0.8, 0.8, 2.4);
  layer('#e9e5da', 0, 0, 0);
  layer('#f2efe6', -w * 0.03, -w * 0.05, 0, 0.6);
}

/** A striped hot-air balloon: gores as nested ellipses clipped to the envelope. */
function five_balloon(ctx, x, y, r, a, b) {
  // Where the round dome hands over to the taper.
  const sx = Math.cos(Math.PI * 0.2) * r;
  const sy = Math.sin(Math.PI * 0.2) * r;
  const mouthY = y + r * 1.36;
  const mouthX = r * 0.26;
  const envelope = () => {
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.8, Math.PI * 2.2);
    ctx.quadraticCurveTo(x + r * 0.58, y + r * 1.08, x + mouthX, mouthY);
    ctx.lineTo(x - mouthX, mouthY);
    ctx.quadraticCurveTo(x - r * 0.58, y + r * 1.08, x - sx, y + sy);
    ctx.closePath();
  };

  // Ropes and basket first, so the envelope overlaps where they tie on.
  ctx.strokeStyle = 'rgba(78, 62, 50, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - mouthX, mouthY);
  ctx.lineTo(x - r * 0.2, y + r * 1.78);
  ctx.moveTo(x + mouthX, mouthY);
  ctx.lineTo(x + r * 0.2, y + r * 1.78);
  ctx.stroke();
  ctx.fillStyle = '#8c5d36';
  ctx.fillRect(x - r * 0.24, y + r * 1.76, r * 0.48, r * 0.34);
  ctx.fillStyle = 'rgba(60, 40, 24, 0.5)';
  ctx.fillRect(x - r * 0.24, y + r * 1.76, r * 0.48, r * 0.07);

  ctx.save();
  envelope();
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x - r * 1.1, y - r * 1.1, r * 2.2, r * 2.6);
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r * 0.62, r * 1.5, 0, 0, five_TAU);
  ctx.fill();
  ctx.fillStyle = a;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r * 0.22, r * 1.5, 0, 0, five_TAU);
  ctx.fill();
  // A printed sheen, upper left, is all that makes the dome read as round.
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 1.2);
  g.addColorStop(0, 'rgba(255, 248, 232, 0.35)');
  g.addColorStop(1, 'rgba(255, 248, 232, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 1.1, y - r * 1.1, r * 2.2, r * 2.6);
  ctx.fillStyle = 'rgba(70, 50, 40, 0.35)';
  ctx.fillRect(x - r, mouthY - r * 0.12, r * 2, r * 0.12);
  ctx.restore();

  envelope();
  ctx.strokeStyle = 'rgba(70, 58, 62, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** A diamond kite on a bow-tied tail. Rotated by hand so the tail can hang straight down. */
function five_kite(ctx, x, y, s, rot, a, b, bow) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  const top = P(0, -0.55);
  const right = P(0.36, -0.14);
  const bottom = P(0, 0.5);
  const left = P(-0.36, -0.14);
  const mid = P(0, -0.14);

  // Tail first, so the kite sits over its knot. It streams away from the tilt.
  const len = s * 2.1;
  const drift = -rot * s * 1.4;
  const tail = (t) => [bottom[0] + Math.sin(t * 7.2) * s * 0.13 + t * drift, bottom[1] + t * len];
  ctx.strokeStyle = 'rgba(72, 68, 84, 0.75)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(bottom[0], bottom[1]);
  for (let i = 1; i <= 20; i++) ctx.lineTo(...tail(i / 20));
  ctx.stroke();
  const k = s / 44;
  ctx.fillStyle = bow;
  for (const t of [0.3, 0.58, 0.86]) {
    const [bx, by] = tail(t);
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx - 6 * k, by - 4 * k); ctx.lineTo(bx - 6 * k, by + 4 * k); ctx.closePath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + 6 * k, by - 4 * k); ctx.lineTo(bx + 6 * k, by + 4 * k); ctx.closePath();
    ctx.fill();
  }

  // One colour for the whole diamond, then two opposite quarters over it:
  // four separate triangles leave hairline anti-alias gaps along the spars.
  const poly = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
  };
  poly([top, right, bottom, left], a);
  poly([top, right, mid], b);
  poly([bottom, left, mid], b);
  ctx.strokeStyle = 'rgba(78, 56, 40, 0.7)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(...top); ctx.lineTo(...bottom);
  ctx.moveTo(...left); ctx.lineTo(...right);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 50, 56, 0.5)';
  ctx.beginPath();
  ctx.moveTo(...top); ctx.lineTo(...right); ctx.lineTo(...bottom); ctx.lineTo(...left);
  ctx.closePath();
  ctx.stroke();
}

function five_bird(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.3);
  ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.6, x, y);
  ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.6, x + s, y - s * 0.3);
  ctx.stroke();
}

/**
 * A child's nursery wallpaper, about twenty-five years on: sky blue, printed
 * clouds, a few balloons and kites, sun-faded all over and kicked along the
 * bottom 30 cm where small shoes swung into it.
 *
 * 512 x 1024, floor to ceiling at repeatY = 1; tiles horizontally only.
 */
export function createCloudWallpaperTexture() {
  const W = five_W;
  const H = five_H;
  const canvas = five_canvas(W, H);
  const ctx = canvas.getContext('2d');
  const rand = five_rand(5);

  // Deeper blue at the ceiling, paler toward the floor: it reads as a sky, and
  // it is also how a wall ages -- the bottom is what gets touched and wiped.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#80aac7');
  sky.addColorStop(0.55, '#94b9cf');
  sky.addColorStop(1, '#a4c2d1');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // One 1.175 m repeat, laid out by hand rather than on a grid: a grid this
  // coarse reads as a grid the moment a wall repeats it four times. Every
  // spacing check is against this table -- nothing overlaps another cloud,
  // including the wrapped copies of 1, 4 and 5.
  const CLOUDS = [
    [92, 118, 190], [352, 232, 150], [214, 424, 200], [470, 522, 160],
    [62, 684, 170], [322, 784, 190], [300, 948, 140]
  ];
  // [x, y, r, colour, colour]: the envelope's centre; the basket hangs ~2r below.
  const BALLOONS = [
    [250, 100, 22, '#c94b3c', '#e2b94a'],
    [110, 250, 19, '#3f6aa8', '#ebe4d2'],
    [250, 562, 24, '#c94b3c', '#ebe4d2'],
    [440, 600, 17, '#e2b94a', '#3f6aa8']
  ];
  // [x, y, size, tilt, colour, colour, bows]
  const KITES = [
    [440, 62, 44, 0.3, '#3f6aa8', '#e2b94a', '#c94b3c'],
    [430, 330, 38, -0.18, '#c94b3c', '#3f6aa8', '#e2b94a'],
    [120, 758, 42, -0.25, '#e2b94a', '#c94b3c', '#3f6aa8']
  ];
  const BIRDS = [[188, 198], [204, 210], [345, 612], [328, 626], [470, 752], [486, 764]];

  five_tiled(ctx, () => {
    CLOUDS.forEach(([x, y, w], i) => five_cloud(ctx, x, y, w, 101 + i * 37));
    for (const [x, y, r, a, b] of BALLOONS) five_balloon(ctx, x, y, r, a, b);
    for (const [x, y, s, rot, a, b, bow] of KITES) five_kite(ctx, x, y, s, rot, a, b, bow);
    ctx.strokeStyle = 'rgba(74, 92, 120, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const [x, y] of BIRDS) five_bird(ctx, x, y, 7);
  });

  // Roll seams. 256 px is 0.59 m, near enough a real roll, and it divides the
  // repeat; both sit inside the canvas so neither needs a wrapped twin.
  for (const x of [128, 384]) {
    ctx.fillStyle = 'rgba(255, 250, 238, 0.12)';
    ctx.fillRect(x, 0, 1, H);
    ctx.fillStyle = 'rgba(52, 64, 78, 0.12)';
    ctx.fillRect(x + 1, 0, 1, H);
    // Lifting a little at the skirting, where the mop keeps catching it.
    ctx.fillStyle = 'rgba(52, 46, 40, 0.16)';
    ctx.fillRect(x + 1, H - 70, 1, 70);
  }

  // --- The bottom 30 cm -----------------------------------------------------
  const kickTop = five_yAt(0.30);
  const grime = ctx.createLinearGradient(0, kickTop - 40, 0, H);
  grime.addColorStop(0, 'rgba(96, 86, 70, 0)');
  grime.addColorStop(0.6, 'rgba(96, 86, 70, 0.10)');
  grime.addColorStop(1, 'rgba(84, 74, 60, 0.26)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, kickTop - 40, W, H - kickTop + 40);
  ctx.fillStyle = 'rgba(70, 62, 50, 0.28)';
  ctx.fillRect(0, H - 5, W, 5);

  // Marks cluster where a small child actually stands and swings her feet
  // (by the bed, by the toy box), so three spots take most of them. All of it
  // is rolled here, before five_tiled, so the wrapped copies agree.
  const wrap = (x) => ((x % W) + W) % W;
  const spots = [rand() * W, rand() * W, rand() * W];
  const smudges = [];
  for (let i = 0; i < 12; i++) {
    smudges.push([wrap(spots[i % 3] + (rand() - 0.5) * 160), five_yAt(0.04 + rand() * 0.16),
      18 + rand() * 34, 6 + rand() * 9, 0.06 + rand() * 0.08]);
  }
  // Where a toy or a shoe scraped the print off down to the paler backing.
  const scrapes = [];
  for (let i = 0; i < 7; i++) {
    scrapes.push([rand() * W, five_yAt(0.03 + rand() * 0.22), 8 + rand() * 26,
      (rand() - 0.5) * 0.25, 0.8 + rand(), 0.18 + rand() * 0.2]);
  }
  // Black rubber off shoe toes. Toe height of a kicking five-year-old: mostly
  // the bottom 15 cm, a few up to the full 30. Sparse on purpose: fifty of
  // these read as hatching, not as shoes.
  const kicks = [];
  for (let i = 0; i < 30; i++) {
    const x = i < 24 ? spots[i % 3] + (rand() - 0.5) * 120 : rand() * W;
    kicks.push([wrap(x), five_yAt(0.02 + Math.pow(rand(), 1.7) * 0.26), 4 + rand() * 18,
      (rand() - 0.5) * 0.9, (rand() - 0.5) * 6, 1 + rand() * 2.2, 0.14 + rand() * 0.24]);
  }

  five_tiled(ctx, () => {
    for (const [x, y, w, h, a] of smudges) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, h / w);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      g.addColorStop(0, `rgba(70, 64, 58, ${a})`);
      g.addColorStop(1, 'rgba(70, 64, 58, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, w, 0, five_TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineCap = 'round';
    for (const [x, y, len, ang, lw, a] of scrapes) {
      const dx = Math.cos(ang) * len / 2;
      const dy = Math.sin(ang) * len / 2;
      ctx.strokeStyle = `rgba(232, 228, 214, ${a})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }
    for (const [x, y, len, ang, bend, lw, a] of kicks) {
      const dx = Math.cos(ang) * len / 2;
      const dy = Math.sin(ang) * len / 2;
      ctx.strokeStyle = `rgba(38, 36, 40, ${a})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      // Bowed sideways: a toe skids in an arc, it does not rule a line.
      ctx.quadraticCurveTo(x - Math.sin(ang) * bend, y + Math.cos(ang) * bend, x + dx, y + dy);
      ctx.stroke();
    }
  });

  // --- One pixel pass: sun-fade, age, mottle, grain ---------------------------
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  let s = 0x7f4a7c15;
  for (let y = 0; y < H; y++) {
    // Faded most up top, where the window light lands on it for years.
    const fade = 0.10 + 0.08 * (1 - y / H);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Whole-number cycles per canvas width only, so the mottle repeats
      // exactly at the seam instead of stepping there.
      const m = Math.sin(five_TAU * 2 * x / W + y * 0.009) * 0.6
        + Math.sin(five_TAU * 3 * x / W - y * 0.006 + 1.7) * 0.4;
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const n = ((s >>> 24) - 127.5) * 0.055;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const f = fade + m * 0.035;
      // Toward grey, then a little yellow: old paper, not just a paler print.
      d[i] = r + (lum - r) * f + 6 + n + m * 3;
      d[i + 1] = g + (lum - g) * f + 3 + n + m * 3;
      d[i + 2] = b + (lum - b) * f - 4 + n + m * 3;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.periodM = 1.175;
  return tex;
}

// ---------------------------------------------------------------------------
// Crayon on the wall
// ---------------------------------------------------------------------------

const five_INK = {
  red: '#d03a2c',
  blue: '#2c5cb8',
  yellow: '#f2c22a',
  green: '#3a9a3c',
  orange: '#ec7a24',
  purple: '#7a3fb0',
  pink: '#e0609a',
  brown: '#8a5a2a',
  black: '#2a282c'
};

/**
 * Wax crayon: a few passes, each a little off the last, and each dragged as
 * three thin streaks so the line is grained along its length instead of
 * being a clean tube. The gaps come later, from five_waxTooth().
 */
function five_crayon(ctx, rand, color, width, pts, passes = 3) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let p = 0; p < passes; p++) {
    const ox = (rand() - 0.5) * width * 0.5;
    const oy = (rand() - 0.5) * width * 0.5;
    for (let k = -1; k <= 1; k++) {
      const off = k * width * 0.2;
      ctx.globalAlpha = 0.2 + rand() * 0.14;
      ctx.lineWidth = width * (0.4 + rand() * 0.3);
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const jx = x + ox + off + (rand() - 0.5) * 1.2;
        const jy = y + oy + off + (rand() - 0.5) * 1.2;
        if (i === 0) ctx.moveTo(jx, jy); else ctx.lineTo(jx, jy);
      });
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Resamples a polyline every ~5 px and bends it gently: nobody's line is straight at five. */
function five_wobble(rand, pts, amp) {
  const out = [];
  const ph = rand() * five_TAU;
  const fr = 0.03 + rand() * 0.03;
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const n = Math.max(1, Math.ceil(len / 5));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const w = Math.sin((dist + t * len) * fr + ph) * amp;
      out.push([x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w]);
    }
    dist += len;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function five_draw(ctx, rand, color, width, pts, amp = 1.6) {
  five_crayon(ctx, rand, color, width, five_wobble(rand, pts, amp));
}

/** A hand-drawn loop that does not quite close, and overshoots instead. */
function five_ring(rand, cx, cy, rx, ry, turns = 1.1) {
  const pts = [];
  const a0 = rand() * five_TAU;
  const p1 = rand() * 6;
  const p2 = rand() * 6;
  const n = Math.max(16, Math.ceil(Math.max(rx, ry) * turns * 1.3));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * turns * five_TAU;
    const k = 1 + 0.06 * Math.sin(2 * a + p1) + 0.04 * Math.sin(3 * a + p2) + (i / n) * 0.05;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/**
 * Colouring in: a slanted back-and-forth scrawl over a box, clipped to the
 * shape grown a few px past its outline -- at five you mostly stay inside the
 * lines. Spaced wider than the crayon so the ground shows between strokes.
 */
function five_colourIn(ctx, rand, color, width, box, shape, step = width * 2) {
  const [x0, y0, x1, y1] = box;
  const pts = [];
  let left = true;
  for (let y = y0 - step; y <= y1 + step; y += step * 0.5) {
    pts.push([(left ? x0 : x1) - 4 + rand() * 8, y + (rand() - 0.5) * step * 0.3]);
    left = !left;
  }
  ctx.save();
  if (shape) {
    ctx.beginPath();
    shape();
    ctx.clip();
  }
  five_crayon(ctx, rand, color, width, pts, 2);
  ctx.restore();
}

/** One of her people: circle head, stick body, arms straight out, rake fingers. */
function five_person(ctx, rand, x, foot, h, { ink, dress = null, hair = null, longHair = false }) {
  const hr = h * 0.12;
  const headY = foot - h + hr;
  const neck = headY + hr;
  const sh = neck + h * 0.08;
  const hip = foot - h * 0.4;
  const hem = hip + h * 0.06;

  if (hair && longHair) {
    for (const side of [-1, 1]) {
      five_draw(ctx, rand, hair, 4, [[x + side * hr * 0.8, headY - hr * 0.6],
        [x + side * hr * 1.25, headY + hr * 0.6], [x + side * hr * 1.4, sh + h * 0.06]], 1.2);
    }
  }
  if (dress) {
    const tri = [[x, neck + 2], [x - h * 0.2, hem], [x + h * 0.2, hem]];
    five_colourIn(ctx, rand, dress, 4, [x - h * 0.2, neck, x + h * 0.2, hem], () => {
      ctx.moveTo(tri[0][0], tri[0][1] - 3);
      ctx.lineTo(tri[1][0] - 4, tri[1][1] + 3);
      ctx.lineTo(tri[2][0] + 4, tri[2][1] + 3);
      ctx.closePath();
    });
    five_draw(ctx, rand, dress, 4, [...tri, tri[0]]);
  } else {
    five_draw(ctx, rand, ink, 4, [[x, neck], [x, hip]]);
  }
  const legTop = dress ? hem : hip;
  for (const side of [-1, 1]) {
    five_draw(ctx, rand, ink, 4, [[x + side * h * 0.05, legTop], [x + side * h * 0.11, foot],
      [x + side * h * 0.19, foot + 1]]);
  }
  // Arms are one line straight through the shoulders, as they always are.
  // [x, y, the arm's own direction], so the fingers fan around the arm.
  const hands = [[x - h * 0.32, sh + h * 0.1, Math.PI - 0.3], [x + h * 0.32, sh + h * 0.1, 0.3]];
  five_draw(ctx, rand, ink, 4, [[hands[0][0], hands[0][1]], [x, sh], [hands[1][0], hands[1][1]]]);
  for (const [hx, hy, dir] of hands) {
    for (let f = -1; f <= 1; f++) {
      const a = dir + f * 0.6;
      five_crayon(ctx, rand, ink, 3, [[hx, hy], [hx + Math.cos(a) * h * 0.06, hy + Math.sin(a) * h * 0.06]], 2);
    }
  }
  five_crayon(ctx, rand, ink, 4, five_ring(rand, x, headY, hr, hr * 1.05));
  // The face is what the tall one in the corridor does not get.
  for (const side of [-1, 1]) {
    const ex = x + side * hr * 0.38;
    const ey = headY - hr * 0.15;
    five_crayon(ctx, rand, ink, 4, [[ex, ey], [ex + 1, ey + 0.5]], 2);
  }
  const smile = [];
  for (let a = 0.2; a <= 0.81; a += 0.1) {
    smile.push([x + Math.cos(a * Math.PI) * hr * 0.5, headY + hr * 0.1 + Math.sin(a * Math.PI) * hr * 0.4]);
  }
  five_crayon(ctx, rand, ink, 3, smile, 2);
  if (hair) {
    const zig = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (1.08 + (i / 8) * 0.84);
      const r = hr * (i % 2 ? 1.45 : 1.05);
      zig.push([x + Math.cos(a) * r, headY + Math.sin(a) * r]);
    }
    five_crayon(ctx, rand, hair, 4, zig);
  }
}

function five_arcPts(cx, cy, rx, ry, a0, a1, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
// Letter strokes in a 1 x 1 box, y down. Her N is backwards, as most
// five-year-olds' are.
const five_GLYPHS = {
  A: [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.62], [0.78, 0.62]]],
  N: [[[1, 1], [1, 0], [0, 1], [0, 0]]],
  B: [[[0, 0], [0, 1]], five_arcPts(0, 0.25, 0.72, 0.25, -Math.PI / 2, Math.PI / 2),
    five_arcPts(0, 0.75, 0.9, 0.25, -Math.PI / 2, Math.PI / 2)],
  E: [[[0.9, 0], [0, 0], [0, 1], [0.9, 1]], [[0, 0.5], [0.7, 0.5]]],
  L: [[[0, 0], [0, 1], [0.85, 1]]]
};

/** Writes `text` letter by letter, each its own size, tilt and baseline, drifting uphill. */
function five_write(ctx, rand, text, x, base, size, colors) {
  let cx = x;
  [...text].forEach((ch, i) => {
    const glyph = five_GLYPHS[ch];
    const h = size * (0.9 + rand() * 0.2);
    const w = h * (ch === 'L' ? 0.5 : 0.6);
    const rot = (rand() - 0.5) * 0.24;
    const by = base - i * 1.5 + (rand() - 0.5) * size * 0.12;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const mx = cx + w / 2;
    const map = ([u, v]) => {
      const lx = (u - 0.5) * w;
      const ly = (v - 1) * h;
      return [mx + lx * c - ly * s, by + lx * s + ly * c];
    };
    for (const stroke of glyph) five_draw(ctx, rand, colors[i % colors.length], 6, stroke.map(map), 1.2);
    cx += w + 10 + rand() * 8;
  });
}

/** Variant 0: big looping spirals and zig-zags. */
function five_drawScribbles(ctx, rand) {
  const spiral = (cx, cy, r0, r1, turns, squash) => {
    const pts = [];
    const n = Math.ceil(turns * r1 * 0.9);
    const a0 = rand() * five_TAU;
    const ph = rand() * 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = a0 + t * turns * five_TAU;
      // Uneven gaps between the turns: drawn fast, round and round.
      const k = 1 + 0.07 * Math.sin(a * 2 + ph) + 0.04 * Math.sin(a * 0.7);
      const r = (r0 + (r1 - r0) * t) * k;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
    }
    return pts;
  };
  five_crayon(ctx, rand, five_INK.red, 6, spiral(126, 118, 4, 82, 3.3, 0.86));
  five_crayon(ctx, rand, five_INK.blue, 6, spiral(305, 92, 3, 58, 2.6, 0.92));

  // Loop-de-loops: what a crayon does when you just keep going.
  const coil = [];
  for (let a = 0; a <= 7 * five_TAU; a += 0.16) {
    coil.push([226 + a * 5.6 - Math.sin(a) * 20, 200 - Math.cos(a) * 20 + Math.sin(a * 0.31) * 5]);
  }
  five_crayon(ctx, rand, five_INK.purple, 5, coil);

  const zig = (x0, step, count, yA, yB) => {
    const pts = [];
    for (let i = 0; i < count; i++) pts.push([x0 + i * step + (rand() - 0.5) * 4, (i % 2 ? yA : yB) + (rand() - 0.5) * 5]);
    return pts;
  };
  five_draw(ctx, rand, five_INK.green, 6, zig(20, 15, 13, 214, 240), 1);
  five_draw(ctx, rand, five_INK.orange, 5, zig(388, 12, 10, 26, 56), 1);

  // A ball of yellow tangle, round and round with the radius breathing.
  const tangle = [];
  const ph = rand() * 6;
  for (let i = 0; i <= 150; i++) {
    const a = i * 0.25;
    const r = 6 + 34 * (0.5 + 0.5 * Math.sin(i * 0.11 + ph));
    tangle.push([440 + Math.cos(a) * r, 122 + Math.sin(a) * r * 0.9]);
  }
  five_crayon(ctx, rand, five_INK.yellow, 5, tangle);

  // Jabs: testing whether the next colour works.
  const inks = [five_INK.red, five_INK.blue, five_INK.green, five_INK.orange];
  for (let i = 0; i < 9; i++) {
    const x = 24 + rand() * 460;
    const y = 24 + rand() * 206;
    const a = rand() * Math.PI;
    five_crayon(ctx, rand, inks[i % inks.length], 5, [[x, y], [x + Math.cos(a) * 7, y + Math.sin(a) * 7]], 2);
  }
}

/** Variant 1: the family in front of the house, sun in the corner, sky along the top. */
function five_drawFamily(ctx, rand) {
  // Sky is a stripe along the top, and stops short of the sun.
  five_colourIn(ctx, rand, five_INK.blue, 5, [16, 12, 384, 26], () => ctx.rect(12, 9, 376, 20));

  const sx = 444;
  const sy = 62;
  const sr = 24;
  five_colourIn(ctx, rand, five_INK.yellow, 5, [sx - sr, sy - sr, sx + sr, sy + sr],
    () => ctx.arc(sx, sy, sr + 3, 0, five_TAU));
  five_crayon(ctx, rand, five_INK.orange, 4, five_ring(rand, sx, sy, sr, sr));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * five_TAU + rand() * 0.2;
    const r0 = sr + 6;
    const r1 = sr + 15 + rand() * 6;
    five_draw(ctx, rand, five_INK.yellow, 4,
      [[sx + Math.cos(a) * r0, sy + Math.sin(a) * r0], [sx + Math.cos(a) * r1, sy + Math.sin(a) * r1]], 0.8);
  }
  for (const side of [-1, 1]) five_crayon(ctx, rand, five_INK.orange, 4, [[sx + side * 8, sy - 6], [sx + side * 8 + 1, sy - 5]], 2);
  five_crayon(ctx, rand, five_INK.orange, 3, five_arcPts(sx, sy + 2, 10, 8, 0.2 * Math.PI, 0.8 * Math.PI, 6), 2);

  // Birds, the letter-m kind.
  for (const [bx, by] of [[262, 52], [300, 42]]) {
    five_draw(ctx, rand, five_INK.black, 3, [[bx - 10, by + 4], [bx - 5, by - 3], [bx, by + 2], [bx + 5, by - 3], [bx + 10, by + 4]], 0.5);
  }

  // The ground, then everything stands on it.
  const grass = [];
  for (let x = 16; x <= 496; x += 9) grass.push([x, (x / 9) % 2 < 1 ? 238 : 229]);
  five_draw(ctx, rand, five_INK.green, 4, grass, 0.8);

  // House: brown walls, red roof coloured in, windows with a cross, chimney smoke.
  five_colourIn(ctx, rand, five_INK.red, 5, [20, 64, 168, 136], () => {
    ctx.moveTo(14, 138); ctx.lineTo(94, 58); ctx.lineTo(174, 138); ctx.closePath();
  });
  five_draw(ctx, rand, five_INK.red, 5, [[20, 134], [94, 64], [168, 134], [20, 134]]);
  five_draw(ctx, rand, five_INK.brown, 5, [[128, 94], [128, 72], [144, 72], [144, 108]]);
  const smoke = [];
  for (let a = 0; a <= 2.2 * five_TAU; a += 0.25) smoke.push([136 + Math.sin(a) * 7 + a, 64 - a * 3 - Math.cos(a) * 6 + 6]);
  five_crayon(ctx, rand, '#6e6a70', 3, smoke, 2);
  five_draw(ctx, rand, five_INK.brown, 5, [[30, 134], [30, 232], [158, 232], [158, 134]]);
  five_draw(ctx, rand, five_INK.orange, 5, [[80, 232], [80, 190], [104, 190], [104, 232]]);
  five_crayon(ctx, rand, five_INK.brown, 4, [[98, 212], [99, 213]], 2);
  for (const wx of [42, 116]) {
    five_draw(ctx, rand, five_INK.blue, 4, [[wx, 150], [wx + 30, 150], [wx + 30, 176], [wx, 176], [wx, 150]]);
    five_draw(ctx, rand, five_INK.blue, 3, [[wx + 15, 150], [wx + 15, 176]], 0.6);
    five_draw(ctx, rand, five_INK.blue, 3, [[wx, 163], [wx + 30, 163]], 0.6);
  }

  // Dad, Mum, me -- holding hands, which is why the arms are that long.
  five_person(ctx, rand, 222, 230, 150, { ink: five_INK.blue, hair: '#6a4020' });
  five_person(ctx, rand, 292, 230, 140, { ink: '#b0306a', dress: five_INK.pink, hair: five_INK.yellow, longHair: true });
  five_person(ctx, rand, 360, 230, 94, { ink: five_INK.red, dress: five_INK.orange, hair: '#6a4020', longHair: true });

  // My balloon, the same as the ones on the wallpaper.
  five_draw(ctx, rand, five_INK.black, 2, [[390, 176], [394, 158], [397, 142]], 1.5);
  five_colourIn(ctx, rand, five_INK.red, 4, [384, 114, 412, 142], () => ctx.arc(398, 128, 16, 0, five_TAU));
  five_crayon(ctx, rand, five_INK.red, 4, five_ring(rand, 398, 128, 14, 15));
}

/**
 * Variant 2: her name, a heart, and -- small, in the corner -- a long yellow
 * corridor with a tall thin someone standing in it. The only drawing on any
 * of her walls that is not of home.
 */
function five_drawName(ctx, rand) {
  const rainbow = [five_INK.purple, five_INK.red, five_INK.blue, five_INK.green, five_INK.orange, five_INK.red, five_INK.purple];
  five_write(ctx, rand, 'ANABELL', 26, 102, 64, rainbow);

  const hcx = 432;
  const hcy = 66;
  const heartPt = (t, k) => [
    hcx + 16 * Math.pow(Math.sin(t), 3) * k,
    hcy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k
  ];
  five_colourIn(ctx, rand, five_INK.red, 5, [hcx - 28, hcy - 22, hcx + 28, hcy + 30], () => {
    for (let i = 0; i <= 48; i++) {
      const [x, y] = heartPt((i / 48) * five_TAU, 1.84);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  });
  const outline = [];
  for (let i = 0; i <= 52; i++) outline.push(heartPt((i / 48) * five_TAU, 1.7));
  five_crayon(ctx, rand, five_INK.red, 5, outline);

  // A flower, bottom left, to show what she usually drew.
  five_draw(ctx, rand, five_INK.green, 4, [[64, 236], [62, 210], [64, 188]]);
  five_draw(ctx, rand, five_INK.green, 4, [[63, 214], [50, 204], [62, 206]], 0.6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * five_TAU;
    five_crayon(ctx, rand, five_INK.pink, 4, five_ring(rand, 64 + Math.cos(a) * 12, 176 + Math.sin(a) * 12, 7, 7));
  }
  five_colourIn(ctx, rand, five_INK.yellow, 4, [58, 170, 70, 182], () => ctx.arc(64, 176, 7, 0, five_TAU));
  five_draw(ctx, rand, five_INK.green, 4, [[30, 238], [44, 230], [58, 238], [72, 230], [86, 238], [100, 230]], 0.5);

  // The corridor. One-point perspective, which no five-year-old is taught:
  // she drew it from somewhere she has stood. Taller than wide with a small
  // far end, or it reads as an envelope.
  const [x0, y0, x1, y1] = [370, 124, 456, 236];
  const [fx0, fy0, fx1, fy1] = [404, 172, 420, 194];
  const quad = (pts) => () => {
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
  };
  five_colourIn(ctx, rand, five_INK.yellow, 6, [x0, y0, x1, y1], () => ctx.rect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4), 9);
  five_colourIn(ctx, rand, '#e8c040', 5, [x0, y0, x1, y1], () => ctx.rect(x0, y0, x1 - x0, y1 - y0), 13);
  // Brown carpet and a paler ceiling: that is what makes the yellow walls.
  five_colourIn(ctx, rand, '#9a6a2a', 5, [x0, fy1, x1, y1], quad([[x0, y1], [x1, y1], [fx1, fy1], [fx0, fy1]]), 8);
  five_colourIn(ctx, rand, '#f8eaa8', 4, [x0, y0, x1, fy0], quad([[x0, y0], [x1, y0], [fx1, fy0], [fx0, fy0]]), 7);
  // The far end, coloured darker because it keeps going.
  five_colourIn(ctx, rand, '#b48c26', 4, [fx0, fy0, fx1, fy1], () => ctx.rect(fx0 - 1, fy0 - 1, fx1 - fx0 + 2, fy1 - fy0 + 2), 6);
  const edge = '#8a6a20';
  five_draw(ctx, rand, edge, 4, [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], 1);
  five_draw(ctx, rand, edge, 3, [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1], [fx0, fy0]], 0.5);
  for (const [ax, ay, bx, by] of [[x0, y0, fx0, fy0], [x1, y0, fx1, fy0], [x1, y1, fx1, fy1], [x0, y1, fx0, fy1]]) {
    five_draw(ctx, rand, edge, 3, [[ax, ay], [bx, by]], 0.6);
  }
  // Doorways down both walls, closer together as they go: the depth cue.
  for (const t of [0.35, 0.7]) {
    for (const [nearX, farX] of [[x0, fx0], [x1, fx1]]) {
      const wx = nearX + (farX - nearX) * t;
      five_draw(ctx, rand, edge, 2, [[wx, y0 + (fy0 - y0) * t + 2], [wx, y1 + (fy1 - y1) * t - 2]], 0.3);
    }
  }
  // Ceiling lights, smaller the further they go.
  for (const [lx, ly, lw, lh] of [[412, 134, 22, 5], [411, 150, 12, 4], [410, 163, 6, 3]]) {
    five_colourIn(ctx, rand, '#fffbe6', 3, [lx - lw / 2, ly - lh / 2, lx + lw / 2, ly + lh / 2],
      () => ctx.rect(lx - lw / 2, ly - lh / 2, lw, lh), 4);
    five_draw(ctx, rand, five_INK.orange, 2, [[lx - lw / 2, ly - lh / 2], [lx + lw / 2, ly - lh / 2],
      [lx + lw / 2, ly + lh / 2], [lx - lw / 2, ly + lh / 2], [lx - lw / 2, ly - lh / 2]], 0.3);
  }
  // Him. Partway down, a little off centre, and as tall as the corridor is
  // at that depth: the head touches the ceiling line. Thin crayon, arms
  // hanging past the hips, and a head left empty.
  const fx = 419;
  five_draw(ctx, rand, five_INK.black, 3, [[fx, 163], [fx, 192]], 0.4);
  five_draw(ctx, rand, five_INK.black, 3, [[fx - 1, 192], [fx - 4, 214]], 0.4);
  five_draw(ctx, rand, five_INK.black, 3, [[fx + 1, 192], [fx + 4, 214]], 0.4);
  five_draw(ctx, rand, five_INK.black, 3, [[fx - 7, 203], [fx - 4, 168], [fx, 166], [fx + 4, 168], [fx + 7, 203]], 0.4);
  five_crayon(ctx, rand, five_INK.black, 3, five_ring(rand, fx, 156.5, 4.5, 6.5, 1.05));
}

/**
 * Breaks the wax up. A crayon only touches the high points of whatever it is
 * dragged over, so the gaps belong to the WALL, not the stroke: one shared
 * grain decides where every colour drops out, and heavier wax (more passes,
 * more alpha) fills more of the low points. Also forces the border to zero
 * alpha so the quad's edge can never show.
 */
function five_waxTooth(canvas, rand) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  // The wall's bumps: random values on a 3 px lattice, read bilinearly.
  const C = 3;
  const gw = Math.ceil(W / C) + 2;
  const gh = Math.ceil(H / C) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  for (let y = 0; y < H; y++) {
    const gy = y / C;
    const iy = Math.floor(gy);
    const fy = gy - iy;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = d[i + 3] / 255;
      if (a === 0) continue;
      const gx = x / C;
      const ix = Math.floor(gx);
      const fx = gx - ix;
      const top = grid[iy * gw + ix] + (grid[iy * gw + ix + 1] - grid[iy * gw + ix]) * fx;
      const bot = grid[(iy + 1) * gw + ix] + (grid[(iy + 1) * gw + ix + 1] - grid[(iy + 1) * gw + ix]) * fx;
      // Contrast-stretched, so even the heaviest wax keeps some speckle.
      const bump = Math.min(1, Math.max(0, (top + (bot - top) * fy - 0.5) * 1.8 + 0.5));
      const t = bump * 0.65 + rand() * 0.35;
      const cover = Math.min(1, Math.max(0, (a + 0.1 - t) / 0.22));
      const border = Math.min(1, Math.min(x, W - 1 - x, y, H - 1 - y) / 6);
      d[i + 3] = 255 * Math.min(1, a * 1.3) * cover * border;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Crayon drawn straight onto the wallpaper by a five-year-old. A DECAL: a
 * transparent 512 x 256 canvas for a 1.2 x 0.6 m quad.
 *   0  big looping spirals and zig-zags
 *   1  the family, the house and the sun
 *   2  "ANABELL" and a heart, and a small tall figure in a yellow corridor
 */
export function createCrayonScribbleTexture(variant = 0) {
  const canvas = five_canvas(512, 256);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const v = ((Math.floor(variant) % 3) + 3) % 3 || 0;
  const rand = five_rand(0x5c1 + v * 977);
  if (v === 0) five_drawScribbles(ctx, rand);
  else if (v === 1) five_drawFamily(ctx, rand);
  else five_drawName(ctx, rand);
  five_waxTooth(canvas, rand);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.sizeM = [1.2, 0.6];
  return tex;
}

// ===========================================================================
// Age eighteen: plum emulsion, a poster's ghost, fairy lights
// ===========================================================================
//
// At eighteen she has painted over whatever was there before, herself, in an
// afternoon: one coat of something dark from a roller. So this wall is paint,
// not paper -- no motif, no roll seams -- and all of its detail is in how the
// paint went on. The decals are what a teenager's wall keeps once the posters
// come down.

const teen_W = 512;
const teen_H = 1024;
const teen_PERIOD_M = 1.175;
const teen_WALL_M = 2.35;

// What was on the wall before the plum: a pale warm grey, seen only where one
// coat was not enough and where blu-tack pulled a fleck of paint away.
const teen_UNDERCOAT = [196, 180, 172];
// The plum as it stayed behind a poster for two years: deeper and more
// saturated than the sun-faded wall round it. Every ghost is DARKER than the
// wall, never paler -- pick one and keep it.
const teen_GHOST = [60, 24, 66];
const teen_PUTTY = '#7b8d9f';

/** Small LCG: the same seed always paints the same wall. */
function teen_rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function teen_canvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function teen_rgba([r, g, b], a) {
  return `rgba(${r},${g},${b},${a})`;
}

/** Metres above the floor -> canvas row. Row 0 is the ceiling line. */
function teen_y(m) {
  return (1 - m / teen_WALL_M) * teen_H;
}

/**
 * Draws one shape at x - W, x and x + W. With every shape kept inside
 * [-W, 2W] that is exactly the endlessly tiled pattern cropped to one tile, so
 * nothing crossing x = 0 or x = W can leave a seam. Anything random has to be
 * rolled BEFORE calling this, or the three copies would differ.
 */
function teen_wrapped(draw) {
  for (const dx of [-teen_W, 0, teen_W]) draw(dx);
}

/**
 * Value-noise lattice whose columns wrap: nx cells span exactly the canvas
 * width, so the noise at x = W is the noise at x = 0. Rows do not wrap (the
 * wall never repeats vertically) and get one spare row to interpolate into.
 */
function teen_lattice(nx, ny, rand) {
  const g = new Float32Array(nx * (ny + 1));
  for (let i = 0; i < g.length; i++) g[i] = rand() * 2 - 1;
  return { g, nx, ny, cw: teen_W / nx, ch: teen_H / ny };
}

function teen_noise(l, x, y) {
  const fx = x / l.cw;
  const fy = y / l.ch;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const c0 = ix % l.nx;
  const c1 = (ix + 1) % l.nx;
  const r0 = iy * l.nx;
  const r1 = Math.min(iy + 1, l.ny) * l.nx;
  const top = l.g[r0 + c0] + (l.g[r0 + c1] - l.g[r0 + c0]) * tx;
  const bot = l.g[r1 + c0] + (l.g[r1 + c1] - l.g[r1 + c0]) * tx;
  return top + (bot - top) * ty;
}

function teen_wallTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.periodM = teen_PERIOD_M;
  return tex;
}

function teen_decalTexture(canvas, sizeM) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.sizeM = sizeM;
  return tex;
}

/** A fleck of plum lifted off, showing the paler wall it was rolled over. */
function teen_chip(ctx, rand, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const rr = r * (0.6 + rand() * 0.7);
    ctx.lineTo(x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = teen_rgba(teen_UNDERCOAT, 0.9);
  ctx.fill();
  // The paint's own thickness, as a dark lip round the hole.
  ctx.strokeStyle = 'rgba(40,18,42,0.5)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/**
 * Deep plum matt emulsion, rolled on by an eighteen-year-old.
 *
 * Lifted a touch above the #4a2a4a..#5a3458 it "should" be: the albedo is
 * shown dark under the level's 2700K points, and plum at that value reads as
 * black from three metres. Tiles every 1.175 m horizontally; the vertical
 * repeat must stay at exactly 1 so the brushed bands land on the real ceiling
 * and floor lines.
 */
export function createPlumPaintTexture({ base = [92, 56, 89], seed = 18 } = {}) {
  const rand = teen_rng(seed);
  const canvas = teen_canvas(teen_W, teen_H);
  const ctx = canvas.getContext('2d');
  const thick = base.map((c) => Math.round(c * 0.72));
  const ridge = base.map((c) => Math.min(255, Math.round(c * 1.35)));
  const thin = teen_UNDERCOAT;

  ctx.fillStyle = teen_rgba(base, 1);
  ctx.fillRect(0, 0, teen_W, teen_H);

  // 1. Roller passes. Five per tile (102.4 px = 0.235 m, a nine-inch roller),
  // each a band whose edges wander a little and run 8 px past the next pass's
  // start: that overlap is where two wet edges doubled the paint, which is all
  // a lap mark is. Each pass is thickest where she reloaded and thins towards
  // the ends. Pass 4 ends on pass 0's start + W, so the laps close across the
  // seam.
  const PASSES = 5;
  const starts = [];
  for (let k = 0; k < PASSES; k++) starts.push((k * teen_W) / PASSES + (rand() - 0.5) * 20);
  const edge = (x) => {
    const pts = [];
    for (let y = -32; y <= teen_H + 32; y += 64) pts.push([x + (rand() - 0.5) * 7, y]);
    return pts;
  };
  const passes = [];
  for (let k = 0; k < PASSES; k++) {
    const end = k < PASSES - 1 ? starts[k + 1] : starts[0] + teen_W;
    passes.push({
      left: edge(starts[k] - 8),
      right: edge(end + 8),
      reload: 0.2 + rand() * 0.6,
      top: 0.02 + rand() * 0.03,
      mid: 0.08 + rand() * 0.08,
      bot: 0.02 + rand() * 0.02
    });
  }
  for (const p of passes) {
    const g = ctx.createLinearGradient(0, 0, 0, teen_H);
    g.addColorStop(0, teen_rgba(thin, p.top));
    g.addColorStop(p.reload, teen_rgba(thick, p.mid));
    g.addColorStop(1, teen_rgba(thin, p.bot));
    ctx.fillStyle = g;
    teen_wrapped((dx) => {
      ctx.beginPath();
      for (const [x, y] of p.left) ctx.lineTo(x + dx, y);
      for (let i = p.right.length - 1; i >= 0; i--) ctx.lineTo(p.right[i][0] + dx, p.right[i][1]);
      ctx.closePath();
      ctx.fill();
    });
  }
  // Tramlines: each end of the roller squeezes out a thin ridge of paint, lit
  // on one side and shadowed a pixel over. Dashed, because the ridge comes and
  // goes with the pressure on the roller.
  ctx.lineWidth = 1;
  for (const p of passes) {
    for (const e of [p.left, p.right]) {
      const a = 0.05 + rand() * 0.05;
      ctx.setLineDash([90 + rand() * 160, 30 + rand() * 90, 60 + rand() * 200, 40 + rand() * 60]);
      ctx.lineDashOffset = rand() * 300;
      teen_wrapped((dx) => {
        for (const [col, off, k] of [[ridge, 0, 1], [thick, 1, 1.6]]) {
          ctx.strokeStyle = teen_rgba(col, a * k);
          ctx.beginPath();
          for (const [x, y] of e) ctx.lineTo(x + dx + off, y);
          ctx.stroke();
        }
      });
    }
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // 2. Coverage. One coat of dark over pale never quite hides it: soft patches
  // where the old wall grins through, a few where she went over twice. Tall,
  // because the roller ran up and down.
  for (let i = 0; i < 12; i++) {
    const pale = i < 7;
    const cx = rand() * teen_W;
    const cy = rand() * teen_H;
    const r = 30 + rand() * 60;
    const sy = 1.8 + rand() * 1.2;
    const col = pale ? thin : thick;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, teen_rgba(col, pale ? 0.07 : 0.2));
    g.addColorStop(1, teen_rgba(col, 0));
    ctx.fillStyle = g;
    teen_wrapped((dx) => {
      ctx.save();
      ctx.translate(cx + dx, cy);
      ctx.scale(1, sy);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // 3. Nap streaks: the roller drags faint vertical lines down each pass.
  for (let i = 0; i < 40; i++) {
    const x = rand() * teen_W;
    const y0 = rand() * teen_H;
    const len = 80 + rand() * 300;
    const drift = (rand() - 0.5) * 4;
    ctx.strokeStyle = teen_rgba(rand() < 0.5 ? thick : ridge, 0.03 + rand() * 0.03);
    ctx.lineWidth = 1 + rand() * 2;
    teen_wrapped((dx) => {
      ctx.beginPath();
      ctx.moveTo(x + dx, y0);
      ctx.lineTo(x + dx + drift, y0 + len);
      ctx.stroke();
    });
  }

  // 4. Cutting in. A roller cannot get into the last few centimetres at the
  // ceiling and floor, so those were brushed: a darker band of thicker paint
  // dragged sideways, fading out where brush gave way to roller.
  const cutTop = 26; // ~6 cm
  const cutBot = 22; // ~5 cm
  let band = ctx.createLinearGradient(0, 0, 0, cutTop + 16);
  band.addColorStop(0, teen_rgba(thick, 0.22));
  band.addColorStop(0.6, teen_rgba(thick, 0.12));
  band.addColorStop(1, teen_rgba(thick, 0));
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, teen_W, cutTop + 16);
  band = ctx.createLinearGradient(0, teen_H, 0, teen_H - cutBot - 14);
  band.addColorStop(0, teen_rgba(thick, 0.2));
  band.addColorStop(0.6, teen_rgba(thick, 0.1));
  band.addColorStop(1, teen_rgba(thick, 0));
  ctx.fillStyle = band;
  ctx.fillRect(0, teen_H - cutBot - 14, teen_W, cutBot + 14);
  ctx.lineCap = 'round';
  for (let i = 0; i < 80; i++) {
    const top = i < 45;
    const y = top ? 1 + rand() * cutTop : teen_H - 1 - rand() * cutBot;
    const x = rand() * teen_W;
    const len = 30 + rand() * 120;
    const drop = (rand() - 0.5) * 3;
    ctx.strokeStyle = rand() < 0.55
      ? teen_rgba(thick, 0.08 + rand() * 0.08)
      : teen_rgba(ridge, 0.04 + rand() * 0.05);
    ctx.lineWidth = 0.8 + rand() * 1.8;
    teen_wrapped((dx) => {
      ctx.beginPath();
      ctx.moveTo(x + dx, y);
      ctx.lineTo(x + dx + len, y + drop);
      ctx.stroke();
    });
  }
  // Two holidays: specks right at the ceiling line the brush never reached.
  ctx.fillStyle = teen_rgba(thin, 0.3);
  for (let i = 0; i < 2; i++) {
    const r = 1.5 + rand() * 2;
    ctx.beginPath();
    ctx.ellipse(30 + rand() * 450, 1.5 + rand() * 4, r * 1.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Scuffs: few, small and faint, because each one comes back every
  // 1.175 m down the wall. All kept clear of the tile edges, so none needs
  // wrapping. First a rub at chair-back height -- matt emulsion burnishes
  // paler where something keeps knocking it.
  {
    const x = 60 + rand() * 360;
    const y = teen_y(0.78 + rand() * 0.06);
    const rot = (rand() - 0.5) * 0.2;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    g.addColorStop(0, teen_rgba(ridge, 0.16));
    g.addColorStop(1, teen_rgba(ridge, 0));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1.6, 0.25);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Shoe rubber just above the floor: short dark curved marks.
  for (let i = 0; i < 3; i++) {
    const x = 40 + rand() * 420;
    const y = teen_y(0.07 + rand() * 0.16);
    const len = 6 + rand() * 12;
    const bend = (rand() - 0.5) * 5;
    ctx.strokeStyle = `rgba(22,16,20,${0.1 + rand() * 0.1})`;
    ctx.lineWidth = 1 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y + bend, x + len, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  // One fleck chipped off at poster-corner height: the same undercoat the
  // ghost decals' blu-tack exposes.
  teen_chip(ctx, rand, 50 + rand() * 410, teen_y(1.35 + rand() * 0.3), 2.6);

  // 6. The roller's stipple, in the one pixel pass this texture gets. Three
  // octaves of wrapping value noise -- 2 px and 4 px cells for the orange peel
  // the nap leaves, tall 32 x 102 px cells for pass-to-pass mottle -- and
  // plain grain on top, so no two texels are the same flat vector colour.
  const fine = teen_lattice(256, 512, rand);
  const nap = teen_lattice(128, 256, rand);
  const mottle = teen_lattice(16, 10, rand);
  const img = ctx.getImageData(0, 0, teen_W, teen_H);
  const d = img.data;
  for (let y = 0, i = 0; y < teen_H; y++) {
    for (let x = 0; x < teen_W; x++, i += 4) {
      const m = 1
        + teen_noise(fine, x, y) * 0.025
        + teen_noise(nap, x, y) * 0.035
        + teen_noise(mottle, x, y) * 0.03;
      const grain = (rand() - 0.5) * 5;
      d[i] = d[i] * m + grain;
      d[i + 1] = d[i + 1] * m + grain;
      d[i + 2] = d[i + 2] * m + grain;
    }
  }
  ctx.putImageData(img, 0, 0);
  return teen_wallTexture(canvas);
}

// Poster sizes that fit the 0.65 x 0.9 m quad, and how each one came down.
// Corners run clockwise from top-left (0 TL, 1 TR, 2 BR, 3 BL); `bow` is the
// edge (0 top, 1 right, 2 bottom, 3 left) that bowed off the wall between its
// blobs. Tilts are a hand's worth of crooked, and every tilted rectangle keeps
// at least 6 px of clear canvas round it.
const teen_GHOSTS = [
  { w: 0.62, h: 0.875, tilt: 0.01, torn: 1, tape: 3, bow: 2 },
  { w: 0.594, h: 0.841, tilt: -0.019, torn: 3, tape: 0, bow: 1 }, // A1
  { w: 0.508, h: 0.762, tilt: 0.006, torn: 0, tape: 2, bow: 2 }, // 20 x 30 in
  { w: 0.61, h: 0.46, tilt: -0.012, torn: 2, tape: 1, bow: 0 } // landscape
];

/** A lump of used blu-tack: blue-grey gone dull with dust, thumb-flattened. */
function teen_putty(ctx, rand, x, y, r) {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = r * (0.75 + rand() * 0.45);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]);
  }
  // A smooth blob: quadratic curves through the midpoints of a jittered ring.
  const outline = () => {
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let m = mid(pts[pts.length - 1], pts[0]);
    ctx.beginPath();
    ctx.moveTo(m[0], m[1]);
    pts.forEach((p, i) => {
      m = mid(p, pts[(i + 1) % pts.length]);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    });
    ctx.closePath();
  };
  outline();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,10,26,0.35)'; // contact shadow on the wall
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = teen_PUTTY;
  ctx.fill();
  ctx.strokeStyle = 'rgba(48,58,72,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  outline();
  ctx.clip();
  // Thumbprint ridges: the detail that says a hand pressed it there.
  ctx.strokeStyle = 'rgba(52,64,80,0.35)';
  ctx.lineWidth = 0.7;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y + r * 0.35, k * r * 0.32, Math.PI * 0.9, Math.PI * 1.9);
    ctx.stroke();
  }
  const sh = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x - r * 0.3, y - r * 0.35, r * 0.7);
  sh.addColorStop(0, 'rgba(225,232,240,0.35)');
  sh.addColorStop(1, 'rgba(225,232,240,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
  ctx.restore();
}

/**
 * The corner that tore off and stayed: a scrap of the poster itself, print
 * side out, held by the blob behind it. Faded white border, a bit of print,
 * and a white fibrous rim along the tear where the paper's core shows.
 */
function teen_tornScrap(ctx, rand) {
  const L1 = 50 + rand() * 12; // along one edge, ~8-9 cm
  const L2 = 42 + rand() * 12; // along the other
  const kx = L1 * 0.85;
  const ky = L2 * 0.85;
  const n = 14;
  const notch = 5 + Math.floor(rand() * 4);
  const tear = [];
  let lump = null;
  // The tear: a quadratic from one edge round to the other, bulging away from
  // the corner, jittered along its normal.
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * L1 + 2 * u * t * kx;
    const y = 2 * u * t * ky + t * t * L2;
    const dx = 2 * u * (kx - L1) - 2 * t * kx;
    const dy = 2 * u * ky + 2 * t * (L2 - ky);
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len; // outward, away from the corner
    const ny = -dx / len;
    let j = i === 0 || i === n ? 0 : (rand() - 0.5) * 4.4;
    // Where it tore round the blob: a bite inward, with the putty squeezed out
    // from behind showing in it.
    if (i === notch) {
      j -= 5;
      lump = [x - nx * 3, y - ny * 3];
    }
    tear.push([x + nx * j, y + ny * j]);
  }
  if (lump) teen_putty(ctx, rand, lump[0], lump[1], 5.5);

  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const [x, y] of tear) ctx.lineTo(x, y);
    ctx.closePath();
  };
  outline();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(18,8,22,0.38)'; // lifted a hair off the wall
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#e8e1d3';
  ctx.fill();

  ctx.save();
  outline();
  ctx.clip();
  const B = 9; // the poster's white border, ~1.4 cm, gone cream in the sun
  ctx.fillStyle = '#d6ccb8';
  ctx.fillRect(0, 0, L1 + 8, L2 + 8);
  const ink = ctx.createLinearGradient(B, B, L1, L2);
  ink.addColorStop(0, '#2e2036');
  ink.addColorStop(1, '#4b2340');
  ctx.fillStyle = ink;
  ctx.fillRect(B, B, L1, L2);
  // A sliver of whatever the design was.
  ctx.strokeStyle = 'rgba(184,74,116,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(B + 48, B + 48, 38 + rand() * 6, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
  // Paper core along the tear: half of this stroke lands inside the clip.
  ctx.strokeStyle = '#efe9dd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  tear.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();

  // Loose fibres standing off the torn edge.
  ctx.strokeStyle = 'rgba(238,232,220,0.7)';
  ctx.lineWidth = 0.6;
  for (let i = 1; i < n; i++) {
    if (rand() < 0.45) continue;
    const [px, py] = tear[i];
    const tx = tear[i + 1][0] - tear[i - 1][0];
    const ty = tear[i + 1][1] - tear[i - 1][1];
    const len = Math.hypot(tx, ty) || 1;
    const reach = 1 + rand() * 2.5;
    const skew = (rand() - 0.5) * 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (ty / len) * reach + skew, py - (tx / len) * reach + skew);
    ctx.stroke();
  }
}

/**
 * Masking tape across the corner: a loop of it, flattened, that held the
 * poster from behind once the blu-tack gave up. Its outer face was stuck to
 * the poster's back, so it came away furred with white paper.
 */
function teen_tapeStrip(ctx, rand) {
  const L = 58 + rand() * 8; // ~9.5 cm
  const T = 15; // ~2.4 cm wide
  ctx.save();
  ctx.translate(34 + rand() * 4, 34 + rand() * 4);
  ctx.rotate(-Math.PI / 4 + (rand() - 0.5) * 0.3);
  // Masking tape tears in a fine zigzag, not a straight cut.
  const right = [];
  const left = [];
  for (let k = 0; k <= 6; k++) {
    const y = -T / 2 + (k / 6) * T;
    right.push([L / 2 + (k % 2 ? 1.6 : -1.2) + (rand() - 0.5), y]);
    left.push([-L / 2 + (k % 2 ? -1.6 : 1.2) + (rand() - 0.5), y]);
  }
  const outline = () => {
    ctx.beginPath();
    right.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let k = left.length - 1; k >= 0; k--) ctx.lineTo(left[k][0], left[k][1]);
    ctx.closePath();
  };
  outline();
  ctx.strokeStyle = 'rgba(20,10,24,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(212,197,152,0.92)';
  ctx.fill();

  ctx.save();
  outline();
  ctx.clip();
  // Crepe: masking tape is creped paper, finely ridged across its width.
  ctx.strokeStyle = 'rgba(140,120,80,0.16)';
  ctx.lineWidth = 0.6;
  for (let x = -L / 2 - 2; x < L / 2 + 2; x += 2.1) {
    ctx.beginPath();
    ctx.moveTo(x, -T / 2 - 1);
    ctx.lineTo(x + (rand() - 0.5) * 1.2, T / 2 + 1);
    ctx.stroke();
  }
  // Edges gone darker and yellower with age.
  const age = ctx.createLinearGradient(0, -T / 2, 0, T / 2);
  age.addColorStop(0, 'rgba(150,118,60,0.28)');
  age.addColorStop(0.25, 'rgba(150,118,60,0)');
  age.addColorStop(0.75, 'rgba(150,118,60,0)');
  age.addColorStop(1, 'rgba(150,118,60,0.28)');
  ctx.fillStyle = age;
  ctx.fillRect(-L / 2 - 3, -T / 2, L + 6, T);
  // The crease where the loop was flattened.
  const cy = (rand() - 0.5) * 3;
  ctx.strokeStyle = 'rgba(110,92,60,0.3)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-L / 2, cy);
  ctx.lineTo(L / 2, cy + (rand() - 0.5) * 2);
  ctx.stroke();
  // Paper torn off the poster's back, still stuck to it.
  ctx.fillStyle = 'rgba(236,230,216,0.8)';
  for (let k = 0; k < 3; k++) {
    const px = (rand() - 0.5) * L * 0.7;
    const py = (rand() - 0.5) * T * 0.5;
    const r = 2.5 + rand() * 3.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = r * (0.55 + rand() * 0.6);
      ctx.lineTo(px + Math.cos(a) * rr * 1.4, py + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  // And a grubby thumb at one end.
  const thumb = ctx.createRadialGradient(-L * 0.3, 0, 0, -L * 0.3, 0, 8);
  thumb.addColorStop(0, 'rgba(80,68,58,0.16)');
  thumb.addColorStop(1, 'rgba(80,68,58,0)');
  ctx.fillStyle = thumb;
  ctx.fillRect(-L / 2, -T / 2, L, T);
  ctx.restore();
  ctx.restore();
}

/**
 * One poster corner, in a frame where the corner is the origin and the poster
 * runs off into +x/+y; the caller mirrors it into place. The blu-tack sat
 * about 3 cm in from both edges.
 */
function teen_posterCorner(ctx, rand, role) {
  const tx = 17 + rand() * 8;
  const ty = 15 + rand() * 8;
  // Grease. The putty's oil soaks into matt emulsion and darkens it, and it
  // outlasts the putty -- the one mark every corner keeps.
  for (let i = 0; i < 2; i++) {
    const ox = tx + (rand() - 0.5) * 6;
    const oy = ty + (rand() - 0.5) * 6;
    const r = 11 + rand() * 7;
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    g.addColorStop(0, 'rgba(34,14,38,0.3)');
    g.addColorStop(0.6, 'rgba(34,14,38,0.15)');
    g.addColorStop(1, 'rgba(34,14,38,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (role === 'blob') {
    teen_putty(ctx, rand, tx, ty, 7 + rand() * 2.5);
  } else if (role === 'clean') {
    // The putty went with the poster: a thumb-drag where someone tried to
    // roll the rest off, a few crumbs, and a fleck of paint it pulled away.
    const ang = rand() * Math.PI * 0.5;
    ctx.strokeStyle = 'rgba(34,14,38,0.16)';
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = 5 - k * 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(ang) * (10 + k * 5), ty + Math.sin(ang) * (10 + k * 5));
      ctx.stroke();
    }
    ctx.fillStyle = teen_PUTTY;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.arc(tx + (rand() - 0.5) * 16, ty + (rand() - 0.5) * 14, 0.7 + rand() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    teen_chip(ctx, rand, tx + 3, ty - 2, 3.5);
  } else if (role === 'torn') {
    teen_tornScrap(ctx, rand);
  } else {
    teen_tapeStrip(ctx, rand);
  }
}

/**
 * DECAL: where a poster hung for two years and has just come down.
 *
 * The wall round it faded in the sun; the paint behind it did not. So the
 * ghost is the SAME plum, deeper and more saturated, at about 53% alpha so the
 * wall's own roller texture still shows through and it reads as paint rather
 * than a sticker. The corners keep what corners keep: blu-tack grease on all
 * four, a torn-off scrap of the poster held under one blob, a strip of masking
 * tape on another, putty left on a third, and a fleck of pulled-off paint.
 *
 * The quad is always 0.65 x 0.9 m (userData.sizeM). `variant` picks a poster
 * size inside it (userData.ghostM, centred), its tilt, and which corners tore
 * and taped; variants past 3 reuse those sizes with fresh jitter.
 */
export function createPosterGhostTexture(variant = 0) {
  const v = teen_GHOSTS[((variant % 4) + 4) % 4];
  const rand = teen_rng(0x9e37 + variant * 7919);
  const W = 416;
  const H = 576;
  const PX = 640; // px per metre on both axes: 416 / 0.65 = 576 / 0.9
  const canvas = teen_canvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const w = v.w * PX;
  const h = v.h * PX;

  // Everything below is clipped to the poster's own footprint, so whatever a
  // corner draws, nothing lands on the wall outside it.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(v.tilt);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();

  // 1. The protected paint. Four fills stepping in 1.5 px make a ~1 cm
  // penumbra: the poster lay flush, so the edge is nearly sharp, but light
  // crept a little way under it. 1 - 0.83^4 = 0.53 alpha in the middle.
  ctx.fillStyle = teen_rgba(teen_GHOST, 0.17);
  for (let i = 0; i < 4; i++) {
    const k = i * 1.5;
    ctx.fillRect(-w / 2 + k, -h / 2 + k, w - 2 * k, h - 2 * k);
  }

  // 2. The window is off to one side, so the wall faded unevenly and the
  // ghost's contrast falls away across it.
  const side = rand() < 0.5 ? -1 : 1;
  const sun = ctx.createLinearGradient((-w / 2) * side, 0, (w / 2) * side, 0);
  sun.addColorStop(0, teen_rgba(teen_GHOST, 0.1));
  sun.addColorStop(1, teen_rgba(teen_GHOST, 0));
  ctx.fillStyle = sun;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // 3. Between two blobs one edge bowed off the wall and light got in under
  // it, so the middle of that edge faded nearly as far as the wall did.
  const [ex, ey] = [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]][v.bow];
  const span = (v.bow % 2 ? h : w) * 0.32;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.translate(ex, ey);
  if (v.bow % 2) ctx.scale(1, span / 26);
  else ctx.scale(span / 26, 1);
  const leak = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
  leak.addColorStop(0, 'rgba(0,0,0,0.5)');
  leak.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leak;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. The corners, each in its own mirrored frame.
  const roles = [];
  roles[v.torn] = 'torn';
  roles[v.tape] = 'tape';
  const rest = [0, 1, 2, 3].filter((c) => c !== v.torn && c !== v.tape);
  if (rand() < 0.5) rest.reverse();
  roles[rest[0]] = 'blob';
  roles[rest[1]] = 'clean';
  [[-w / 2, -h / 2, 1, 1], [w / 2, -h / 2, -1, 1], [w / 2, h / 2, -1, -1], [-w / 2, h / 2, 1, -1]]
    .forEach(([cx, cy, sx, sy], c) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sx, sy);
      teen_posterCorner(ctx, rand, roles[c]);
      ctx.restore();
    });
  ctx.restore();

  // 5. Grain, so the ghost has the wall's tooth instead of a vector-flat fill,
  // and a hard zero on the outer two pixels so the quad's border can never
  // show, whatever the tilt did.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      if (d[i + 3] === 0) continue;
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) {
        d[i + 3] = 0;
        continue;
      }
      const n = rand() - 0.5;
      d[i] += n * 8;
      d[i + 1] += n * 8;
      d[i + 2] += n * 8;
      // Only the paint itself gets alpha grain; paper and tape stay solid.
      if (d[i + 3] < 200) d[i + 3] *= 1 + n * 0.16;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = teen_decalTexture(canvas, [0.65, 0.9]);
  tex.userData.ghostM = [v.w, v.h];
  return tex;
}

/** A bulb's glow: warm RGB throughout, with alpha carrying the falloff. */
function teen_halo(ctx, x, y, r, a) {
  if (r < 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,240,206,${a})`);
  g.addColorStop(0.3, `rgba(255,226,170,${a * 0.5})`);
  g.addColorStop(1, 'rgba(255,206,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * DECAL and emissiveMap: a string of warm fairy lights pinned across the wall
 * in four shallow swags, the lead hanging off the last pin to its battery box.
 *
 * Everything that must not glow is near-black (#18-#2e, which decodes from
 * sRGB to about 1% linear) and everything that must glow is warm and bright,
 * so one canvas serves as both map and emissiveMap. Halos fade by ALPHA, not
 * by darkening: three uploads canvases un-premultiplied, so their RGB stays
 * bright and the transparent blend does the falloff.
 *
 * userData.bulbsM lists the lit bulbs in metres from the quad's centre
 * (+x right, +y up), for anyone who wants a point light where the string is.
 */
export function createFairyLightsTexture({ seed = 7 } = {}) {
  const rand = teen_rng(seed);
  const W = 1024;
  const H = 128;
  const PX = W / 3; // 341 px per metre
  const canvas = teen_canvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Five drawing pins, not quite level: hung by hand, standing on the bed.
  const pins = [[34, 18], [268, 22], [492, 16], [736, 21], [956, 18]]
    .map(([x, y]) => [x + (rand() - 0.5) * 10, y + (rand() - 0.5) * 3]);
  const sags = [60, 72, 56, 68].map((s) => s + (rand() - 0.5) * 8);

  // Catenary swags: cosh, normalised to 0 at both pins and 1 mid-span. K = 1.4
  // sits between a parabola and a hairpin, which is what a light wire with
  // bulbs on it actually does.
  const K = 1.4;
  const ck = Math.cosh(K);
  const swag = [];
  for (let s = 0; s < 4; s++) {
    const [x1, y1] = pins[s];
    const [x2, y2] = pins[s + 1];
    for (let i = s ? 1 : 0; i <= 48; i++) {
      const t = i / 48;
      const f = (Math.cosh(K * (2 * t - 1)) - ck) / (1 - ck);
      swag.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + sags[s] * f]);
    }
  }
  // The lead, from the last pin down to the battery box.
  const [lx, ly] = pins[4];
  const lead = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    lead.push([lx + 14 * t + Math.sin(t * Math.PI) * 5, ly + 70 * t]);
  }

  // A bulb every 34 px (10 cm) of wire, each hanging off it at a loose angle.
  const bulbs = [];
  let next = 12;
  let walked = 0;
  for (let i = 1; i < swag.length; i++) {
    const [ax, ay] = swag[i - 1];
    const [bx, by] = swag[i];
    const seg = Math.hypot(bx - ax, by - ay);
    while (next <= walked + seg) {
      const t = (next - walked) / seg;
      const hang = Math.PI / 2 + (rand() - 0.5) * 1.0;
      const wx = ax + (bx - ax) * t;
      const wy = ay + (by - ay) * t;
      bulbs.push({ x: wx + Math.cos(hang) * 3, y: wy + Math.sin(hang) * 3, hang, lit: 1 });
      next += 34;
    }
    walked += seg;
  }
  // One dead and one going: a string this old never has all of them.
  const dead = 3 + Math.floor(rand() * (bulbs.length - 6));
  let dim = 3 + Math.floor(rand() * (bulbs.length - 6));
  if (dim === dead) dim = dead + 2;
  bulbs[dead].lit = 0;
  bulbs[dim].lit = 0.45;

  // Halos first, so the wire crosses in front of its own light and reads as a
  // silhouette: a wide faint wash (the bulb lighting the paint behind it)
  // under a tight bright glow. Radii clamp so the canvas border stays clear.
  for (const b of bulbs) {
    if (!b.lit) continue;
    const room = Math.min(b.y - 3, H - 3 - b.y, b.x - 3, W - 3 - b.x);
    teen_halo(ctx, b.x, b.y, Math.min(26, room), 0.16 * b.lit);
    teen_halo(ctx, b.x, b.y, Math.min(10, room), 0.85 * b.lit);
  }

  // The wire: dark green twisted pair. At 6 mm nobody resolves two strands,
  // but a dashed lighter line on top stops it reading as a flat ribbon.
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#18211a';
  ctx.lineWidth = 2.2;
  trace(swag);
  trace(lead);
  ctx.setLineDash([2.5, 3]);
  ctx.strokeStyle = 'rgba(58,72,54,0.7)';
  ctx.lineWidth = 0.9;
  trace(swag);
  trace(lead);
  ctx.setLineDash([]);

  // Drawing pins, the wire looped once round each.
  for (const [x, y] of pins) {
    ctx.strokeStyle = '#18211a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y + 1, 3.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2e2b30';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(110,104,100,0.6)';
    ctx.beginPath();
    ctx.arc(x - 0.9, y - 0.9, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // The bulbs: little rice LEDs on a dark sleeve.
  for (const b of bulbs) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.hang - Math.PI / 2); // local +y now points away from the wire
    ctx.fillStyle = '#20241e';
    ctx.fillRect(-1.2, -3.6, 2.4, 1.8);
    ctx.fillStyle = b.lit === 1 ? '#ffe6b0' : b.lit ? '#e2c48e' : '#4a4034';
    ctx.beginPath();
    ctx.ellipse(0, 0.6, 2.1, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (b.lit) {
      ctx.fillStyle = b.lit === 1 ? '#fff7e6' : '#f0dcb4';
      ctx.beginPath();
      ctx.ellipse(0, 0.2, 1.1, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The battery box on the end of the lead.
  const [bx, by] = lead[lead.length - 1];
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(0.06 + (rand() - 0.5) * 0.06);
  ctx.fillStyle = '#242428';
  ctx.fillRect(-7.5, 0, 15, 24);
  ctx.strokeStyle = 'rgba(86,86,92,0.6)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-7.5, 0, 15, 24);
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(-3, 5, 6, 3.5);
  ctx.restore();

  // Nothing above reaches the outer two pixels; this makes sure of it.
  ctx.clearRect(0, 0, W, 2);
  ctx.clearRect(0, H - 2, W, 2);
  ctx.clearRect(0, 0, 2, H);
  ctx.clearRect(W - 2, 0, 2, H);

  const tex = teen_decalTexture(canvas, [3.0, 0.375]);
  tex.userData.bulbsM = bulbs.filter((b) => b.lit).map((b) => [b.x / PX - 1.5, (H / 2 - b.y) / PX]);
  return tex;
}

// ---------------------------------------------------------------------------
// Age thirty: her own wallpaper, and the wall it is losing to
// ---------------------------------------------------------------------------

/**
 * Wallpaper scale, shared by the paper and its peeling decal so the two can
 * never disagree about how big the print is.
 *
 * One canvas is one pattern repeat across and floor-to-ceiling down: 512 px =
 * 1.175 m and 1024 px = 2.35 m, the same ~2.3 mm per pixel both ways, so a
 * shape drawn round on the canvas is round on the wall.
 */
const adult_TILE_W = 512;
const adult_TILE_H = 1024;
const adult_PERIOD_M = 1.175;
const adult_PX_PER_M = adult_TILE_W / adult_PERIOD_M;

/** One paper drop is half a tile (0.5875 m), so every seam lands on x = 0 or 256. */
const adult_DROP = 256;

/**
 * How far each drop's print was hung low, in px. With two drops per tile BOTH
 * seams -- 256, and 0/512 where the tile wraps -- carry the same 3 px (7 mm)
 * step: hung carefully, by someone who was not quite a decorator.
 */
const adult_DROP_DY = [0, 3];

/** Vertical pattern repeat: 0.87 m, a full-size grown-up damask. */
const adult_REPEAT_Y = 380;

/** Spare print above and below the motif layer, for the hung-low drop to shift down into. */
const adult_LAYER_PAD = 8;

// Sage, tone on tone. Kept mid-light on purpose: under the rooms' dim 2700K
// bulbs anything deeper goes to olive mud and the damask stops reading at all.
const adult_GROUND = [140, 151, 128];
const adult_SATIN = [161, 171, 147];
const adult_VEIN = [117, 128, 107];
const adult_BACKING = [212, 204, 184];
const adult_BACKROOMS = [198, 178, 96];

function adult_rgba([r, g, b], a = 1) {
  return `rgba(${r},${g},${b},${a})`;
}

/** Small LCG: same seed, same wall, every reload -- a room that redeals itself cannot be tested. */
function adult_rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function adult_canvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Runs `half` as the right half, then mirrored: damask is always bilaterally symmetric. */
function adult_mirrored(ctx, half) {
  half();
  ctx.save();
  ctx.scale(-1, 1);
  half();
  ctx.restore();
}

/**
 * Fill, then outline, one closed element. The thin darker outline is what keeps
 * a ~20-level tone-on-tone print legible from across the room; without it the
 * satin fill alone melts into the ground under warm light.
 */
function adult_element(ctx, trace) {
  ctx.beginPath();
  trace();
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** The pomegranate body, scaled by k about the origin and dropped by oy. */
function adult_fruitPath(ctx, k, oy) {
  ctx.moveTo(0, -58 * k + oy);
  ctx.bezierCurveTo(30 * k, -56 * k + oy, 46 * k, -28 * k + oy, 42 * k, 2 * k + oy);
  ctx.bezierCurveTo(38 * k, 32 * k + oy, 18 * k, 52 * k + oy, 0, 64 * k + oy);
  ctx.bezierCurveTo(-18 * k, 52 * k + oy, -38 * k, 32 * k + oy, -42 * k, 2 * k + oy);
  ctx.bezierCurveTo(-46 * k, -28 * k + oy, -30 * k, -56 * k + oy, 0, -58 * k + oy);
}

/**
 * One damask "pomegranate": crown, fruit, acanthus scrolls, pendant. About
 * 0.42 x 0.68 m on the wall, which is what lets a low-contrast print still read
 * as a shape from 2-3 m. Spans x +-96, y -146..150 around (cx, cy), so at the
 * drop centres (128, 384) it never touches a seam.
 */
function adult_drawDamask(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Tendrils first, so everything else sits over their roots.
  ctx.strokeStyle = adult_rgba(adult_SATIN);
  ctx.lineWidth = 3;
  adult_mirrored(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(36, -120);
    ctx.bezierCurveTo(56, -146, 88, -136, 82, -112);
    ctx.bezierCurveTo(78, -98, 62, -102, 66, -114);
    ctx.stroke();
  });

  ctx.fillStyle = adult_rgba(adult_SATIN);
  ctx.strokeStyle = adult_rgba(adult_VEIN, 0.55);
  ctx.lineWidth = 1.4;

  // Acanthus, laid down before the fruit so the leaf seems to grow from behind
  // it -- the way overlapping print blocks layer on real damask.
  adult_mirrored(ctx, () => {
    // Outer edge in scalloped lobes, meeting at notches: that broken edge is
    // what makes it acanthus rather than a smooth horn.
    adult_element(ctx, () => {
      ctx.moveTo(8, 50);
      ctx.quadraticCurveTo(22, 66, 40, 58);
      ctx.quadraticCurveTo(64, 60, 70, 40);
      ctx.quadraticCurveTo(94, 32, 90, 10);
      ctx.quadraticCurveTo(102, -10, 88, -24);
      ctx.quadraticCurveTo(86, -50, 66, -44);
      ctx.quadraticCurveTo(52, -52, 48, -32);
      ctx.bezierCurveTo(62, -30, 70, -10, 60, 8);
      ctx.bezierCurveTo(48, 28, 30, 34, 10, 36);
    });
    ctx.beginPath();
    ctx.moveTo(16, 44);
    ctx.quadraticCurveTo(64, 40, 76, -4);
    ctx.moveTo(34, 45);
    ctx.lineTo(40, 56);
    ctx.moveTo(56, 36);
    ctx.lineTo(68, 41);
    ctx.moveTo(70, 18);
    ctx.lineTo(88, 10);
    ctx.moveTo(76, -4);
    ctx.lineTo(87, -22);
    ctx.stroke();
  });

  // Crown: two flaring side petals and a tall centre lancet.
  adult_mirrored(ctx, () => adult_element(ctx, () => {
    ctx.moveTo(6, -60);
    ctx.bezierCurveTo(32, -74, 50, -100, 38, -128);
    ctx.bezierCurveTo(30, -106, 18, -86, 6, -70);
  }));
  adult_element(ctx, () => {
    ctx.moveTo(0, -56);
    ctx.bezierCurveTo(13, -78, 11, -114, 0, -142);
    ctx.bezierCurveTo(-11, -114, -13, -78, 0, -56);
  });

  // Pendant: stem, two drooping leaves, a bud, a finial.
  adult_element(ctx, () => {
    ctx.moveTo(-2.5, 58);
    ctx.lineTo(2.5, 58);
    ctx.lineTo(2, 116);
    ctx.lineTo(-2, 116);
  });
  adult_mirrored(ctx, () => adult_element(ctx, () => {
    ctx.moveTo(2, 74);
    ctx.bezierCurveTo(20, 76, 34, 94, 30, 112);
    ctx.bezierCurveTo(18, 104, 8, 92, 2, 86);
  }));
  adult_element(ctx, () => ctx.ellipse(0, 126, 9, 13, 0, 0, Math.PI * 2));
  adult_element(ctx, () => ctx.arc(0, 146, 4, 0, Math.PI * 2));

  // The fruit, last, over every root.
  adult_element(ctx, () => adult_fruitPath(ctx, 1, 0));

  // Its heart is CUT through to the ground rather than painted ground colour,
  // so the paper's own strie and fading show inside it like real ground would.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  adult_fruitPath(ctx, 0.55, 4);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  adult_fruitPath(ctx, 0.55, 4);
  ctx.stroke();

  // Seeds in one column: four in a diamond read as two eyes, a nose and a
  // mouth, and a face in her wallpaper is a louder note than this room wants.
  for (const [y, r] of [[-14, 3], [2, 4.2], [20, 3.4]]) {
    adult_element(ctx, () => ctx.ellipse(0, y, r, r * 1.5, 0, 0, Math.PI * 2));
  }
  ctx.restore();
}

/**
 * The small half-drop sprig that sits on every seam: a four-point star with a
 * leaf on each diagonal. It is the only motif a seam cuts through, so it is
 * where the hung-low drop's 3 px step actually shows.
 */
function adult_drawSprig(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.fillStyle = adult_rgba(adult_SATIN);
  ctx.strokeStyle = adult_rgba(adult_VEIN, 0.55);
  ctx.lineWidth = 1.4;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    ctx.save();
    ctx.scale(sx, sy);
    adult_element(ctx, () => {
      ctx.moveTo(5, 7);
      ctx.bezierCurveTo(16, 8, 34, 18, 38, 40);
      ctx.bezierCurveTo(20, 36, 9, 24, 5, 7);
    });
    ctx.restore();
  }
  adult_element(ctx, () => {
    ctx.moveTo(0, -54);
    ctx.quadraticCurveTo(4, -9, 15, 0);
    ctx.quadraticCurveTo(4, 9, 0, 54);
    ctx.quadraticCurveTo(-4, 9, -15, 0);
    ctx.quadraticCurveTo(-4, -9, 0, -54);
  });
  adult_element(ctx, () => ctx.arc(0, -64, 3.5, 0, Math.PI * 2));
  adult_element(ctx, () => ctx.arc(0, 64, 3.5, 0, Math.PI * 2));
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * All the print, on its own transparent canvas, so each drop can be pasted
 * from it at its own height. That one layer is what makes the seam mismatch
 * real rather than painted on: the two halves of every seam sprig really are
 * the same print, 3 px apart.
 */
function adult_buildMotifLayer() {
  const layer = adult_canvas(adult_TILE_W, adult_TILE_H + adult_LAYER_PAD * 2);
  const ctx = layer.getContext('2d');
  ctx.translate(0, adult_LAYER_PAD);
  for (let j = -1; j <= 3; j++) {
    const y = adult_REPEAT_Y / 2 + j * adult_REPEAT_Y;
    for (const x of [128, 384]) adult_drawDamask(ctx, x, y);
    // Sprigs ride the seams. 0 and 512 are the same sprig, drawn twice so its
    // halves meet when the tile wraps.
    for (const x of [0, adult_DROP, adult_TILE_W]) adult_drawSprig(ctx, x, y - adult_REPEAT_Y / 2);
  }

  // Satin: fine horizontal ribs over the print only (source-atop). Woven sheen
  // on a matte ground is what makes damask damask instead of a stencil.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(250, 246, 228, 0.07)';
  for (let y = 0; y < layer.height; y += 3) ctx.fillRect(0, y, layer.width, 1);
  ctx.globalCompositeOperation = 'source-over';
  return layer;
}

/**
 * One water run down from the ceiling: a faint tannin fill, a slightly darker
 * rim, and a scalloped front where it dried. The rim is the tell -- water
 * leaves its solute at the edge, which is what separates a tide-mark from a
 * smudge (the same detail createDampStainTexture hangs on). `ph` holds four
 * phases so the two edges wander independently.
 */
function adult_tideRun(ctx, cx, w, yEnd, ph, k) {
  const edge = (side, y) => {
    const half = (w / 2) * (1 - 0.35 * Math.max(0, y) / yEnd);
    const i = side < 0 ? 0 : 2;
    return cx + side * half + Math.sin(y * 0.021 + ph[i]) * 3 + Math.sin(y * 0.063 + ph[i + 1]) * 1.4;
  };
  const xl = edge(-1, yEnd);
  const xr = edge(1, yEnd);
  const front = () => {
    for (let i = 0; i < 3; i++) {
      const a = xl + (xr - xl) * (i / 3);
      const b = xl + (xr - xl) * ((i + 1) / 3);
      ctx.quadraticCurveTo((a + b) / 2, yEnd + 6 + 3 * Math.sin(ph[0] + i * 2.1), b, yEnd);
    }
  };
  const ys = [];
  for (let y = -4; y < yEnd; y += 16) ys.push(y);

  // Starts above the canvas, so the run comes out of the ceiling line itself.
  ctx.beginPath();
  ys.forEach((y, i) => (i ? ctx.lineTo(edge(-1, y), y) : ctx.moveTo(edge(-1, y), y)));
  ctx.lineTo(xl, yEnd);
  front();
  for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(edge(1, ys[i]), ys[i]);
  ctx.closePath();
  ctx.fillStyle = `rgba(150, 124, 62, ${0.07 * k})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(112, 90, 46, ${0.13 * k})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(xl, yEnd);
  front();
  ctx.strokeStyle = `rgba(100, 80, 38, ${0.24 * k})`;
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

/**
 * Age thirty: muted sage damask, tone on tone -- the first wallpaper in these
 * rooms she would have chosen herself. And it is losing: yellowed toward the
 * ceiling, water run down it in faint tide-marks, and the drops hung a few
 * millimetres out of true at every seam.
 *
 * Tiles horizontally every 1.175 m (userData.periodM); the vertical repeat must
 * stay at exactly 1 so the yellowing lands on the real ceiling line.
 */
export function createDamaskWallpaperTexture() {
  const W = adult_TILE_W;
  const H = adult_TILE_H;
  const rand = adult_rand(0x5a6e30);
  const canvas = adult_canvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = adult_rgba(adult_GROUND);
  ctx.fillRect(0, 0, W, H);

  // Strie: hairline vertical drag in the ground coat, the matte the satin
  // print is meant to be seen against. One whole column each, so none can
  // straddle the wrap.
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rand() * W);
    const a = 0.025 + rand() * 0.035;
    ctx.fillStyle = rand() < 0.5 ? `rgba(236, 240, 222, ${a})` : `rgba(60, 68, 50, ${a})`;
    ctx.fillRect(x, rand() * H * 0.6, 1, H * (0.3 + rand() * 0.7));
  }

  // The print, pasted per drop at that drop's own height.
  const layer = adult_buildMotifLayer();
  for (let d = 0; d < 2; d++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(d * adult_DROP, 0, adult_DROP, H);
    ctx.clip();
    ctx.drawImage(layer, 0, -adult_LAYER_PAD + adult_DROP_DY[d]);
    ctx.restore();
  }

  // Rolls from one batch are never quite one colour: the second drop is a
  // shade paler, which is what makes the eye read "strips of paper".
  ctx.fillStyle = 'rgba(230, 228, 204, 0.03)';
  ctx.fillRect(adult_DROP, 0, adult_DROP, H);

  // Seams: a dried-paste stain either side, a dark butt line, a pale lifted
  // lip, and a gap opening toward the ceiling where the paste is giving up
  // first. x = 512 repeats x = 0 for the half of each mark left of the wrap.
  for (const x of [0, adult_DROP, W]) {
    ctx.fillStyle = 'rgba(150, 128, 72, 0.05)';
    ctx.fillRect(x - 3, 0, 6, H);
    ctx.fillStyle = 'rgba(62, 66, 50, 0.30)';
    ctx.fillRect(x, 0, 1, H);
    ctx.fillStyle = 'rgba(228, 228, 210, 0.10)';
    ctx.fillRect(x + 1, 0, 1, H);
    const lift = ctx.createLinearGradient(0, 0, 0, H * 0.2);
    lift.addColorStop(0, 'rgba(48, 46, 34, 0.30)');
    lift.addColorStop(1, 'rgba(48, 46, 34, 0)');
    ctx.fillStyle = lift;
    ctx.fillRect(x - 1, 0, 3, H * 0.2);
  }

  // Uneven fading -- sun and years, not dirt. Huge and faint so it never
  // resolves into a shape that could be seen to repeat.
  for (let i = 0; i < 6; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 90 + rand() * 80;
    for (const wrap of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + wrap, y, 0, x + wrap, y, r);
      g.addColorStop(0, 'rgba(226, 228, 206, 0.06)');
      g.addColorStop(1, 'rgba(226, 228, 206, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + wrap - r, y - r, r * 2, r * 2);
    }
  }

  // Tide-marks, kept to three faint runs. This canvas repeats every 1.175 m,
  // so anything stronger turns into a printed stripe of identical stains down
  // the wall -- the lesson createBackroomsWallpaperTexture already paid for.
  // The first rides a seam: water finds the paste line and follows it.
  const runs = [
    { x: 262, w: 26, end: 0.58 },
    { x: 74, w: 40, end: 0.34 },
    { x: 420, w: 16, end: 0.76 }
  ];
  for (const run of runs) {
    const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
    for (const wrap of [-W, 0, W]) {
      adult_tideRun(ctx, run.x + wrap, run.w, H * run.end, ph, 1);
      // An older, shorter wetting inside the newer one.
      adult_tideRun(ctx, run.x + wrap + 2, run.w * 0.7, H * run.end * 0.62, ph, 0.6);
    }
  }

  // Age, multiplied rather than painted over, so it browns the print and the
  // ground together the way nicotine and years actually do: strongest at the
  // ceiling, where warm air and smoke collect, gone by two-thirds down.
  ctx.globalCompositeOperation = 'multiply';
  const age = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  age.addColorStop(0, 'rgba(214, 180, 100, 0.62)');
  age.addColorStop(0.3, 'rgba(214, 180, 100, 0.30)');
  age.addColorStop(1, 'rgba(214, 180, 100, 0)');
  ctx.fillStyle = age;
  ctx.fillRect(0, 0, W, H * 0.7);
  const smoke = ctx.createLinearGradient(0, 0, 0, H * 0.035);
  smoke.addColorStop(0, 'rgba(150, 128, 90, 0.40)');
  smoke.addColorStop(1, 'rgba(150, 128, 90, 0)');
  ctx.fillStyle = smoke;
  ctx.fillRect(0, 0, W, H * 0.035);
  const scuff = ctx.createLinearGradient(0, H * 0.88, 0, H);
  scuff.addColorStop(0, 'rgba(176, 166, 146, 0)');
  scuff.addColorStop(1, 'rgba(176, 166, 146, 0.40)');
  ctx.fillStyle = scuff;
  ctx.fillRect(0, H * 0.88, W, H * 0.12);
  ctx.globalCompositeOperation = 'source-over';

  // Paper grain: the one pixel pass. Blue moves a little less than red and
  // green so the grain reads warm, like paper, not grey, like render noise.
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = (rand() - 0.5) * 10;
    px[i] += g;
    px[i + 1] += g;
    px[i + 2] += g * 0.8;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.periodM = adult_PERIOD_M;
  return tex;
}

/** Short paper fibres standing off a torn edge, each pointing along `angleAt(x, y)`. */
function adult_fibres(ctx, rand, pts, angleAt, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [x, y] of pts) {
    const a = angleAt(x, y) + (rand() - 0.5) * 0.9;
    const l = 1.5 + rand() * 3;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  ctx.stroke();
}

/** A scrap of backing paper left stuck in the paste when the drop came away. */
function adult_tornScrap(ctx, rand, cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const rr = r * (0.55 + rand() * 0.6);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.4]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = adult_rgba(adult_BACKING, 0.72);
  ctx.fill();
  adult_fibres(ctx, rand, pts, (x, y) => Math.atan2(y - cy, x - cx), 'rgba(226, 220, 200, 0.35)');
}

/**
 * DECAL: one drop of the age-thirty paper coming away at its seam, curling off
 * the wall from the top-right corner.
 *
 * Only what has moved is drawn: the bowed-out print, the roll of off-white
 * backing, the shadow under it, and the bare wall where the paper was --
 * dried paste, scraps of backing, and a torn sliver of the corridor's own
 * yellow underneath. Everywhere the drop still lies flat is transparent, so
 * the real wallpaper carries on through it.
 *
 * Lining it up: the strip is drop 0 of createDamaskWallpaperTexture's tile
 * (texture u 0..0.5 of a period). userData.dropM gives that drop's edges in
 * metres from the quad's left edge; put the right one on a wall seam and the
 * print in the lifted part continues the paper beside it.
 *
 * Accepts the damask canvas (createDamaskWallpaperTexture().image) or the
 * texture itself.
 */
export function createPeelingSeamTexture(damaskCanvas) {
  // Take the texture as readily as its canvas: the call site will usually be
  // holding the texture, and passing it must not silently draw nothing.
  const src = damaskCanvas?.isTexture ? damaskCanvas.image : damaskCanvas;
  const W = 256;
  const H = 1024;
  const SIZE_M = [0.6, 2.35];
  const pxPerM = W / SIZE_M[0];
  // Across, the quad packs 426.7 px/m against the paper's 435.7, so the print
  // is squeezed by 0.979 to land at true size. Down, both are 1024 px over
  // 2.35 m, so rows map one to one.
  const sx = pxPerM / adult_PX_PER_M;
  const rand = adult_rand(0x5ea30);
  const canvas = adult_canvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // The drop as it hung: left edge 1 px in, right-hand seam ~251.7 px in.
  // TOP keeps the ceiling line 3 px down. Both leave the quad's border at
  // zero alpha.
  const L = 1;
  const R = L + adult_DROP * sx;
  const TOP = 3;

  // The paper has let go above a diagonal from P1 (on the ceiling line) to P2
  // (half way down the seam). n is the unit normal pointing into the lost
  // corner C, and everything below is laid out in (s, t): s across that line,
  // t along it.
  const P1 = [64, TOP];
  const P2 = [R, 540];
  const C = [R, TOP];
  const len = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
  const d = [(P2[0] - P1[0]) / len, (P2[1] - P1[1]) / len];
  const n = [d[1], -d[0]];
  const sOf = ([x, y]) => (x - P1[0]) * n[0] + (y - P1[1]) * n[1];
  const at = (s, t) => [P1[0] + n[0] * s + d[0] * t, P1[1] + n[1] * s + d[1] * t];

  // The lifted paper tilts off the wall about that line, so seen face-on it is
  // foreshortened across it by K. `squash` is that projection; where it sends
  // C bounds everything the paper can still cover.
  const K = 0.82;
  const squash = (p) => {
    const s = sOf(p) * (1 - K);
    return [p[0] - n[0] * s, p[1] - n[1] * s];
  };
  const Cq = squash(C);

  // Lifted but still face-out: 10 cm of bowed print before it rolls over.
  const FACE = 44;
  // The roll: 4 cm across at the ceiling, 7.5 cm by the seam. A corner curl is
  // a cone, tight where it started. Linear in t, so its outer edge is straight.
  const rollW = (t) => 18 + 14 * Math.min(1, Math.max(0, t / len));
  const T0 = -40;
  const T1 = len + 40;

  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  // A band between two s-offsets that may vary along t.
  const band = (sIn, sOut) => {
    const pts = [];
    for (let t = T0; t <= T1; t += 10) pts.push(at(sIn(t), t));
    for (let t = T1; t >= T0; t -= 10) pts.push(at(sOut(t), t));
    poly(pts);
  };
  // A polyline that follows s(t).
  const trace = (sAt, t0 = T0, t1 = T1) => {
    ctx.beginPath();
    for (let t = t0; ; t = Math.min(t1, t + 10)) {
      const [x, y] = at(sAt(t), t);
      if (t === t0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (t >= t1) break;
    }
  };

  // --- 1. The bare wall: everywhere the paper used to be ---------------------
  ctx.save();
  poly([P1, C, P2]);
  ctx.clip();

  // Lining paper / skim, mottled: wall that was only ever meant to be covered.
  ctx.fillStyle = 'rgb(168, 160, 138)';
  ctx.fillRect(0, 0, W, P2[1] + 4);
  for (let i = 0; i < 24; i++) {
    const x = P1[0] + rand() * (R - P1[0]);
    const y = TOP + rand() * (P2[1] - TOP);
    const r = 10 + rand() * 30;
    const c = rand() < 0.5 ? '120, 110, 86' : '196, 188, 166';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c}, 0.18)`);
    g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Dried paste: an amber film laid on in sweeping brush strokes, with the
  // bristle drag still in it. The sweep is what says "paste" rather than
  // "stain" -- nothing else on a wall is curved and parallel like that.
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = P1[0] + 20 + rand() * (R - P1[0] - 10);
    const y = TOP + rand() * (P2[1] - 60);
    const reach = 50 + rand() * 90;
    const a = -0.9 + rand() * 0.5 + Math.PI * (rand() < 0.5 ? 0 : 1);
    const ex = x + Math.cos(a) * reach;
    const ey = y + Math.sin(a) * reach;
    const bow = (rand() - 0.5) * 40;
    const qx = (x + ex) / 2 - Math.sin(a) * bow;
    const qy = (y + ey) / 2 + Math.cos(a) * bow;
    const lw = 7 + rand() * 12;
    ctx.strokeStyle = `rgba(196, 172, 112, ${0.14 + rand() * 0.1})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(qx, qy, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110, 94, 56, 0.16)';
    ctx.lineWidth = 1;
    for (const k of [-0.35, 0, 0.3]) {
      const ox = -Math.sin(a) * lw * k;
      const oy = Math.cos(a) * lw * k;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(qx + ox, qy + oy, ex + ox, ey + oy);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(222, 206, 160, ${0.2 + rand() * 0.25})`;
    ctx.beginPath();
    ctx.arc(P1[0] + rand() * (R - P1[0]), TOP + rand() * P2[1], 0.8 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Backing torn off and left behind in the paste -- mostly near where the
  // paper only just let go, because that is where it fought hardest.
  for (let i = 0; i < 6; i++) {
    const [x, y] = at(80 + rand() * 80, 20 + rand() * len * 0.5);
    adult_tornScrap(ctx, rand, x, y, 5 + rand() * 13);
  }

  // Under her paper, under the lining: the corridor's own yellow. Only a
  // sliver, torn open along the seam where the lining went with the drop.
  const tearBottom = 280;
  const edge = [];
  for (let y = tearBottom; y > TOP; y -= 12) {
    const u = (tearBottom - y) / (tearBottom - TOP);
    edge.push([R - 3 - u * (R - 3 - 226) + (rand() - 0.5) * 7, y]);
  }
  edge.push([226, TOP - 2]);
  ctx.save();
  poly([[R + 1, TOP - 2], [R + 1, tearBottom], ...edge]);
  ctx.fillStyle = adult_rgba(adult_BACKROOMS);
  ctx.fill();
  ctx.clip();
  // Its own roll seam and orange-peel, so it reads as THAT wallpaper and not
  // just as a yellow mark.
  ctx.fillStyle = 'rgba(88, 74, 30, 0.40)';
  ctx.fillRect(236, 0, 2, H);
  ctx.fillStyle = 'rgba(232, 214, 140, 0.35)';
  ctx.fillRect(238, 0, 1, H);
  for (let i = 0; i < 90; i++) {
    const x = 200 + rand() * 56;
    const y = TOP + rand() * tearBottom;
    const r = 1.5 + rand() * 2.5;
    const c = rand() < 0.5 ? '255, 240, 170' : '90, 74, 30';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c}, 0.25)`);
    g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const damp = ctx.createLinearGradient(0, 160, 0, tearBottom);
  damp.addColorStop(0, 'rgba(96, 76, 30, 0)');
  damp.addColorStop(1, 'rgba(96, 76, 30, 0.35)');
  ctx.fillStyle = damp;
  ctx.fillRect(196, 160, 60, tearBottom - 158);
  ctx.restore();
  // The torn lining's edge: white fibre standing proud of the yellow.
  ctx.strokeStyle = 'rgba(224, 216, 194, 0.85)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  adult_fibres(ctx, rand, edge, () => 0, 'rgba(226, 220, 200, 0.6)');

  // Shadow under the curl. The roll stands in front of this wall, so the wall
  // right beside it gets almost no light; the gaps the lifted paper leaves
  // behind itself (at the ceiling, and down the seam) sit fully in it. The
  // roll's outer edge is straight, so one linear gradient across it is exact;
  // everything on the roll's side of it is in its shade.
  const q0 = at(FACE + rollW(0), 0);
  const q1 = at(FACE + rollW(len), len);
  const el = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
  let m = [(q1[1] - q0[1]) / el, -(q1[0] - q0[0]) / el];
  if (m[0] * n[0] + m[1] * n[1] < 0) m = [-m[0], -m[1]];
  const shade = ctx.createLinearGradient(q0[0] - m[0] * 2, q0[1] - m[1] * 2, q0[0] + m[0] * 20, q0[1] + m[1] * 20);
  shade.addColorStop(0, 'rgba(18, 14, 8, 0.58)');
  shade.addColorStop(0.3, 'rgba(18, 14, 8, 0.30)');
  shade.addColorStop(1, 'rgba(18, 14, 8, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, P2[1] + 4);
  ctx.restore();

  // The neighbouring drop's edge, bared at the seam: a pale cut line that
  // fades out as the gap closes toward P2.
  const cut = ctx.createLinearGradient(0, TOP, 0, P2[1]);
  cut.addColorStop(0, 'rgba(232, 226, 206, 0.5)');
  cut.addColorStop(1, 'rgba(232, 226, 206, 0)');
  ctx.fillStyle = cut;
  ctx.fillRect(R, TOP, 1, P2[1] - TOP);

  // --- 2. The lifted print -------------------------------------------------
  // The same pixels as the wall's own drop 0, pushed through the tilt about
  // the detach line: one affine, I - (1 - K) n n^T, fixed on P1.
  ctx.save();
  band(() => 0, () => FACE);
  ctx.clip();
  const a = 1 - (1 - K) * n[0] * n[0];
  const b = -(1 - K) * n[0] * n[1];
  const dd = 1 - (1 - K) * n[1] * n[1];
  ctx.transform(a, b, b, dd, P1[0] - (a * P1[0] + b * P1[1]), P1[1] - (b * P1[0] + dd * P1[1]));
  poly([P1, C, P2]);
  ctx.clip();
  if (src) {
    ctx.drawImage(src, 0, 0, src.width, src.height, L, 0, src.width * sx, H);
  } else {
    ctx.fillStyle = adult_rgba(adult_GROUND);
    ctx.fill();
  }
  ctx.restore();

  // Tilt shading: the bend catches the light, then the paper turns away from
  // the bulbs and darkens into the roll's shadow.
  ctx.save();
  band(() => 0, () => FACE);
  ctx.clip();
  poly([P1, Cq, P2]);
  ctx.clip();
  const g0 = at(0, 0);
  const g1 = at(FACE, 0);
  const tilt = ctx.createLinearGradient(g0[0], g0[1], g1[0], g1[1]);
  tilt.addColorStop(0, 'rgba(255, 248, 226, 0.14)');
  tilt.addColorStop(0.1, 'rgba(255, 248, 226, 0)');
  tilt.addColorStop(0.55, 'rgba(26, 22, 12, 0.18)');
  tilt.addColorStop(1, 'rgba(18, 14, 8, 0.55)');
  ctx.fillStyle = tilt;
  ctx.fillRect(0, 0, W, P2[1] + 4);
  ctx.restore();

  // The crease where it still holds: a hairline of shadow on the flat side,
  // a hairline of light on the lifted side. It also hides any phase mismatch
  // between this print and the wall's, because paper bends there anyway.
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(40, 36, 22, 0.32)';
  ctx.lineWidth = 1.2;
  trace(() => -0.6, 0, len);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240, 234, 214, 0.16)';
  ctx.lineWidth = 1.4;
  trace(() => 1.6, 0, len);
  ctx.stroke();

  // The lifted seam edge, catching the light along its cut.
  const sCq = sOf(Cq);
  const e1 = [P2[0] + (Cq[0] - P2[0]) * (FACE / sCq), P2[1] + (Cq[1] - P2[1]) * (FACE / sCq)];
  ctx.strokeStyle = 'rgba(230, 224, 204, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(P2[0], P2[1]);
  ctx.lineTo(e1[0], e1[1]);
  ctx.stroke();

  // --- 3. The roll ------------------------------------------------------------
  // Backing outward, shaded as a cylinder lying in the wall plane: lit from
  // above and in front, so the underside where the print rolls in is darkest.
  // Lofted from parallel strokes, which leave faint curl lines along it.
  ctx.save();
  band(() => FACE, (t) => FACE + rollW(t));
  ctx.clip();
  poly([P1, Cq, P2]);
  ctx.clip();
  const STRIPS = 16;
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  for (let j = 0; j < STRIPS; j++) {
    const f = (j + 0.5) / STRIPS;
    const u = f * 2 - 1;
    const lambert = Math.max(0, u * 0.35 + Math.sqrt(1 - u * u) * 0.94);
    const k = 0.34 + 0.66 * lambert;
    ctx.strokeStyle = `rgb(${adult_BACKING.map((c) => Math.round(c * k)).join(',')})`;
    trace((t) => FACE + f * rollW(t));
    ctx.stroke();
  }
  // Paste dried on the back of the paper, in streaks along the roll.
  const axis = Math.atan2(d[1], d[0]);
  for (let i = 0; i < 10; i++) {
    const t = rand() * len;
    const [x, y] = at(FACE + (0.2 + rand() * 0.6) * rollW(t), t);
    ctx.fillStyle = `rgba(170, 146, 88, ${0.10 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + rand() * 9, 2 + rand() * 3, axis, 0, Math.PI * 2);
    ctx.fill();
  }
  // Crevice where the print tucks under, silhouette on the wall side, and the
  // two cut ends of the roll seen edge-on.
  ctx.strokeStyle = 'rgba(26, 22, 12, 0.6)';
  ctx.lineWidth = 2;
  trace(() => FACE + 0.8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(80, 72, 52, 0.55)';
  ctx.lineWidth = 1.2;
  trace((t) => FACE + rollW(t) - 0.6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90, 80, 58, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(P1[0], P1[1]);
  ctx.lineTo(Cq[0], Cq[1]);
  ctx.lineTo(P2[0], P2[1]);
  ctx.stroke();
  ctx.restore();

  // Grain: the one pixel pass, skipping untouched pixels so the border stays
  // at exactly zero alpha.
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const g = (rand() - 0.5) * 12;
    px[i] += g;
    px[i + 1] += g;
    px[i + 2] += g;
  }
  ctx.putImageData(img, 0, 0);

  // ClampToEdge both ways: a decal on its own quad, never tiled.
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.sizeM = SIZE_M;
  tex.userData.dropM = [L / pxPerM, R / pxPerM];
  return tex;
}

// ---------------------------------------------------------------------------
// Tear reveal: the older rooms showing through hand-torn holes
// ---------------------------------------------------------------------------

/**
 * The tears are where the rooms admit they are the SAME room. Pick at the
 * plum paint at eighteen and the clouds from five are still under it; dig at
 * thirty and it goes plum, clouds, nursery pastels, and then the maze's own
 * yellow paper at the very bottom, as if that had been there first.
 *
 * Every layer is sampled at its real-world scale (a wallpaper canvas spans
 * 2.35 m floor to ceiling, this decal spans 0.8 m), so a cloud seen through
 * the hole is the size of a cloud on the age-5 room's wall. Scaled to fit the
 * hole instead, it reads as a picture OF wallpaper rather than as wallpaper.
 */
const tear_WALL_H = 2.35;
const tear_SIZE_M = 0.8;
const tear_PX = 512;
// Sampled finely enough that a rip only a few degrees wide still gets several
// points down each side and comes to a real point instead of a notch.
const tear_STEPS = 480;

/** Deterministic LCG: the same seed tears the same hole on every boot. */
function tear_rand(seed) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x7e4a1c3) >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // Neighbouring seeds start out correlated in an LCG; a few discards
  // decorrelate seed 1 from seed 2 before anything is drawn.
  next(); next(); next();
  return next;
}

/**
 * Smooth 1D value noise over t in [0, 1) that WRAPS, so an outline built from
 * it closes on itself without a kink where the last point meets the first.
 */
function tear_loopNoise(rand, cells) {
  const v = Array.from({ length: cells }, () => rand() * 2 - 1);
  return (t) => {
    const f = (((t % 1) + 1) % 1) * cells;
    const i = Math.floor(f);
    const u = f - i;
    const s = u * u * (3 - 2 * u);
    return v[i % cells] * (1 - s) + v[(i + 1) % cells] * s;
  };
}

/**
 * Pulls a radius in under `lim` without a hard clamp. A clamp leaves a dead
 * straight run wherever the outline hits it, and a straight edge is the one
 * thing torn paper never has.
 */
function tear_softCap(d, lim) {
  const soft = Math.min(22, lim * 0.5);
  const knee = lim - soft;
  if (d <= knee) return d;
  return knee + soft * Math.tanh((d - knee) / soft);
}

/** Distance from (x, y) along (dx, dy) to the inset canvas border. */
function tear_boxLimit(lo, hi) {
  return (x, y, dx, dy) => {
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (hi - x) / dx);
    else if (dx < -1e-6) t = Math.min(t, (lo - x) / dx);
    if (dy > 1e-6) t = Math.min(t, (hi - y) / dy);
    else if (dy < -1e-6) t = Math.min(t, (lo - y) / dy);
    return t;
  };
}

/**
 * Distance from (x, y) along (dx, dy) to the FIRST crossing of a closed
 * polygon, less a margin. This is what keeps each hole inside the one above
 * it: the ray stops at the nearest edge, so it also respects the parent's rips.
 */
function tear_polyLimit(poly, margin) {
  return (x, y, dx, dy) => {
    let best = Infinity;
    for (let i = 0, n = poly.length; i < n; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % n];
      const ex = bx - ax, ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const wx = ax - x, wy = ay - y;
      const t = (wx * ey - wy * ex) / den;
      const u = (wx * dy - wy * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best - margin;
  };
}

/**
 * One hand-torn hole as a closed polygon of [x, y, rip] points. Low harmonics
 * give the lopsided overall shape, looped noise the wander and the ragged
 * small-scale edge, and a few tapering wedges the rips
 * where the tear ran on further than the hand meant it to. `rip` (0..1) marks
 * how deep into a rip each point is, so the rim can thin out there. Slightly
 * taller than wide: paper pulled off a wall tears downward.
 */
function tear_outline(rand, cx, cy, R, ripCount, limit) {
  const harm = [2, 3, 5].map((k, i) => [k, (0.05 - i * 0.015) * (0.6 + rand() * 0.8), rand() * Math.PI * 2]);
  const broad = tear_loopNoise(rand, 9);
  const fine = tear_loopNoise(rand, 31);
  const crisp = tear_loopNoise(rand, 110);
  // Wide enough at the root to show the layer beneath: narrower than this,
  // the rim swallowed the crack and each rip read as a white thorn.
  const rips = [];
  for (let i = 0; i < ripCount; i++) {
    rips.push([rand() * Math.PI * 2, 0.04 + rand() * 0.06, R * (0.12 + rand() * 0.22)]);
  }
  const stretch = 1.04 + rand() * 0.14;
  const rot = (rand() - 0.5) * 0.6;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  // Most of the small-scale roughness comes from `crisp`, not per-point
  // jitter: jitter at this sampling alternates point to point and reads as
  // pinking shears, not as a tear.
  const jag = 0.6 + R * 0.004;

  const pts = [];
  for (let j = 0; j < tear_STEPS; j++) {
    const t = j / tear_STEPS;
    const a = t * Math.PI * 2;
    let r = 1 + 0.07 * broad(t) + 0.03 * fine(t) + 0.02 * crisp(t);
    for (const [k, amp, ph] of harm) r += amp * Math.cos(k * a + ph);
    r = r * R + (rand() * 2 - 1) * jag;
    let rip = 0;
    for (const [ra, w, len] of rips) {
      const d = Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra)));
      if (d < w) {
        const p = (1 - d / w) ** 1.5;
        r += len * p;
        rip = Math.max(rip, p);
      }
    }
    const lx = Math.cos(a) * r;
    const ly = Math.sin(a) * r * stretch;
    const x = lx * cr - ly * sr;
    const y = lx * sr + ly * cr;
    const dist = Math.hypot(x, y) || 1;
    const dx = x / dist, dy = y / dist;
    const capped = tear_softCap(dist, Math.max(4, limit(cx, cy, dx, dy)));
    pts.push([cx + dx * capped, cy + dy * capped, rip]);
  }
  return pts;
}

/**
 * The outline of the white core band just outside a hole. Its width wanders,
 * and in a few stretches it runs wide: that is where the printed face peeled
 * back further than the paper under it, which every real wallpaper tear has.
 */
function tear_band(rand, pts, cx, cy) {
  const wander = tear_loopNoise(rand, 23);
  const peel = tear_loopNoise(rand, 7);
  return pts.map(([x, y, rip], j) => {
    const t = j / pts.length;
    const p = Math.max(0, peel(t));
    // Thinned along a rip: a crack's edges are the barest line of core, and a
    // full-width band pushed out radially would fill the crack in.
    const w = (2 + 2.5 * (1 + wander(t)) + p * p * 8 + rand() * 0.6) * (1 - 0.85 * rip);
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * w, y + (dy / d) * w];
  });
}

function tear_path(pts) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

/**
 * Fills the whole canvas with one layer at true scale; the caller's clip cuts
 * it to the hole. The pattern is anchored to the WALL, not to the hole, so an
 * inner hole sitting off-centre shows a different part of the same sheet
 * rather than the same sticker slid sideways.
 */
function tear_fillLayer(ctx, src, rand, heightM) {
  const S = tear_PX;
  const k = (S / tear_SIZE_M) / (src.height / tear_WALL_H);
  const lx = rand() * src.width;
  // Mid-wall, well clear of the skirting and ceiling bands the wallpapers
  // carry, so a tear at chest height never shows a floor stripe.
  const ly = (1 - (heightM + (rand() - 0.5) * 0.1) / tear_WALL_H) * src.height;
  const pat = ctx.createPattern(src, 'repeat');
  // A source that has no pixels yet (an image still loading) gives no pattern;
  // leave the hole as the age tint rather than throw at level boot.
  if (!pat) return;
  pat.setTransform(new DOMMatrix([k, 0, 0, k, S / 2 - lx * k, S / 2 - ly * k]));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, S, S);
}

/**
 * The deeper the sheet, the longer it has been behind glue in the dark:
 * multiply in a little warm grey per layer so the stack reads as a sequence
 * of years, not four stickers.
 */
function tear_age(ctx, depth) {
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${250 - depth * 6}, ${245 - depth * 8}, ${236 - depth * 12})`;
  ctx.fillRect(0, 0, tear_PX, tear_PX);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * What a sheet looks like once the one over it has been ripped away: dried
 * paste blooms, and scraps of the upper sheet's backing still glued down near
 * the edge. Without the scraps the layers read as printed rings.
 */
function tear_residue(ctx, rand, h, backing) {
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * h.R * 0.6;
    const x = h.cx + Math.cos(a) * d;
    const y = h.cy + Math.sin(a) * d;
    const r = h.R * (0.3 + rand() * 0.4);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(132, 104, 58, 0.10)');
    g.addColorStop(1, 'rgba(132, 104, 58, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.fillStyle = backing;
  const scraps = 10 + Math.floor(rand() * 12);
  for (let i = 0; i < scraps; i++) {
    const [px, py] = h.pts[Math.floor(rand() * h.pts.length)];
    const ix = h.cx - px, iy = h.cy - py;
    const id = Math.hypot(ix, iy) || 1;
    const inset = 2 + rand() * 12;
    const x = px + (ix / id) * inset;
    const y = py + (iy / id) * inset;
    const r = 1.5 + rand() * 4;
    const sides = 4 + Math.floor(rand() * 3);
    ctx.globalAlpha = 0.45 + rand() * 0.4;
    ctx.beginPath();
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + rand() * 0.6;
      const rr = r * (0.5 + rand() * 0.7);
      if (s === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Shadow of the upper sheet falling into the hole: the usual inner-shadow
 * trick of filling everything OUTSIDE the hole while clipped to the hole, so
 * only the shadow lands. Offset downward because the room's lights hang from
 * the ceiling; this is what gives each sheet a thickness rather than a ring.
 */
function tear_innerShadow(ctx, hole) {
  const S = tear_PX;
  const outside = new Path2D();
  outside.rect(-S, -S, S * 3, S * 3);
  outside.addPath(hole);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.shadowColor = 'rgba(16, 9, 3, 0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 6;
  ctx.fill(outside, 'evenodd');
  // Then a tight contact line all the way round, where sheet sits on sheet.
  ctx.shadowColor = 'rgba(16, 9, 3, 0.4)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fill(outside, 'evenodd');
  ctx.restore();
}

/** The torn sheet's white core, with the faint lift-shadow of a loose edge. */
function tear_rim(ctx, h, core) {
  ctx.save();
  ctx.shadowColor = 'rgba(22, 14, 6, 0.32)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = core;
  ctx.fill(h.rim);
  ctx.restore();
  // The band is thinned to nothing along rips, so a thin stroke keeps a line
  // of core down both sides of the crack.
  ctx.strokeStyle = core;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke(h.hole);
  // The printed face ends in a hairline where it parted from its core.
  ctx.strokeStyle = 'rgba(64, 52, 38, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke(h.rim);
}

/** Loose fibres poking out over the hole: what makes an edge torn, not cut. */
function tear_fibres(ctx, rand, h, core) {
  ctx.strokeStyle = core;
  ctx.lineCap = 'round';
  const n = Math.round(h.R * 0.9);
  for (let i = 0; i < n; i++) {
    const [px, py] = h.pts[Math.floor(rand() * h.pts.length)];
    const ix = h.cx - px, iy = h.cy - py;
    const id = Math.hypot(ix, iy) || 1;
    const back = rand() * 2.5;
    const sx = px - (ix / id) * back;
    const sy = py - (iy / id) * back;
    const a = Math.atan2(iy, ix) + (rand() - 0.5) * 1.4;
    const len = rand() < 0.1 ? 7 + rand() * 9 : 1.5 + rand() * 5;
    const curl = (rand() - 0.5) * len * 0.6;
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    ctx.globalAlpha = 0.5 + rand() * 0.4;
    ctx.lineWidth = 0.6 + rand() * 0.9;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2 - Math.sin(a) * curl, (sy + ey) / 2 + Math.cos(a) * curl, ex, ey);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Strips of the upper sheet still attached at the rim and hanging into the
 * hole. They peel from the TOP of a tear and droop, because gravity is what
 * makes a sliver read as paper rather than as a drawn line. They show the
 * sheet's plain back, which is also what lets the outermost one exist at all:
 * this decal never sees the room's own wallpaper, only the hole in it.
 */
function tear_strands(ctx, rand, h, depth, back) {
  const count = depth === 0 ? 1 + Math.floor(rand() * 2) : Math.floor(rand() * 2);
  for (let s = 0; s < count; s++) {
    const a = Math.PI * (1.15 + rand() * 0.7);
    const j = Math.floor((a / (Math.PI * 2)) * h.pts.length) % h.pts.length;
    const [px, py] = h.pts[j];
    let ix = h.cx - px, iy = h.cy - py;
    const id = Math.hypot(ix, iy) || 1;
    ix /= id; iy /= id;
    let dx = ix * 0.5 + (rand() - 0.5) * 0.5;
    let dy = iy * 0.5 + 0.5;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;

    const L = h.R * (0.22 + rand() * 0.22);
    const w0 = 5 + rand() * 8 * Math.min(1, h.R / 120);
    // Rooted a few px back inside the rim, so the strip grows out of the sheet.
    const x0 = px - ix * 3, y0 = py - iy * 3;
    const x2 = x0 + dx * L, y2 = y0 + dy * L;
    const bend = (rand() - 0.5) * L * 0.45;
    const x1 = (x0 + x2) / 2 - dy * bend, y1 = (y0 + y2) / 2 + dx * bend;

    const left = [], right = [];
    const steps = 14;
    let tipX = x2, tipY = y2, tdx = dx, tdy = dy;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      const bx = u * u * x0 + 2 * u * t * x1 + t * t * x2;
      const by = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      let tx = 2 * u * (x1 - x0) + 2 * t * (x2 - x1);
      let ty = 2 * u * (y1 - y0) + 2 * t * (y2 - y1);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const hw = Math.max(0.5, (w0 / 2) * (1 - 0.8 * t) + (rand() - 0.5) * 1.4);
      left.push([bx - ty * hw, by + tx * hw]);
      right.push([bx + ty * hw, by - tx * hw]);
      tipX = bx; tipY = by; tdx = tx; tdy = ty;
    }
    const tipLen = 2 + rand() * 4;
    const strip = tear_path([...left, [tipX + tdx * tipLen, tipY + tdy * tipLen], ...[...right].reverse()]);

    ctx.save();
    ctx.shadowColor = 'rgba(14, 8, 3, 0.5)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = back;
    ctx.fill(strip);
    ctx.restore();
    // The crease where it folds away from the wall.
    const [lx, ly] = left[2];
    const [rx, ry] = right[2];
    ctx.strokeStyle = 'rgba(70, 58, 44, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
}

/**
 * One pixel pass: paper grain over everything drawn, and a hard zero on the
 * outer 2 px so no shadow tail can ever show the quad's border.
 */
function tear_grain(ctx, rand) {
  const S = tear_PX;
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (x < 2 || y < 2 || x >= S - 2 || y >= S - 2) {
        d[i + 3] = 0;
        continue;
      }
      if (d[i + 3] === 0) continue;
      const n = (rand() - 0.5) * 12;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n * 0.9;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Nested torn holes revealing older wallpapers, as a transparent wall decal.
 *
 * `layers` are wallpaper canvases (512 x 1024, floor to ceiling) ordered from
 * the OUTERMOST ring -- the sheet just under the room's current wallpaper --
 * to the innermost, which shows at the centre. Each is a hole torn in the one
 * before it. Outside the outermost tear the decal is transparent: that is the
 * room's own wallpaper, and the rim drawn there is its torn edge.
 *
 * The quad should be tex.userData.sizeM = [0.8, 0.8]. `sampleHeightM` is the
 * wall height the centre of the decal is assumed to sit at, so the layers show
 * the stretch of wall that would really be behind it.
 */
export function createTearRevealTexture(layers, { seed = 1, sampleHeightM = 1.3 } = {}) {
  const S = tear_PX;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rand = tear_rand(seed);

  // Textures are accepted too, since the wallpaper generators hand those out,
  // and so is a lone canvas for the one-layer tear in the eighteen room.
  const srcs = [].concat(layers || [])
    .map((l) => (l && l.isTexture ? l.image : l))
    .filter((c) => c && c.width > 0 && c.height > 0);

  // The quad is 0.8 m tall on a 2.35 m wall, so its centre can only sit
  // between 0.4 m and 1.95 m. Kept inside that (less the 0.05 m sampling
  // wobble) because the pattern repeats vertically too: a centre outside it
  // would wrap the ceiling band of a layer round onto its skirting.
  const heightM = Number.isFinite(sampleHeightM)
    ? Math.min(tear_WALL_H - tear_SIZE_M / 2 - 0.05, Math.max(tear_SIZE_M / 2 + 0.05, sampleHeightM))
    : 1.3;

  // All outlines first: each hole is fitted inside the one above it, so the
  // geometry has to exist before anything is drawn.
  const holes = [];
  let R = S * (0.34 + rand() * 0.03);
  let cx = S / 2 + (rand() - 0.5) * 16;
  let cy = S / 2 + (rand() - 0.5) * 16;
  // 34 px keeps the rim, its widest peel and its shadow clear of the border.
  let limit = tear_boxLimit(34, S - 34);
  for (let i = 0; i < srcs.length; i++) {
    if (i > 0) {
      const childR = R * (0.68 + rand() * 0.05);
      const a = rand() * Math.PI * 2;
      // Off-centre, so every ring is wide on one side and nearly gone on the
      // other -- the wide side is where each pattern actually gets read.
      const mag = (R - childR) * (0.15 + rand() * 0.3);
      cx += Math.cos(a) * mag;
      cy += Math.sin(a) * mag;
      R = childR;
      limit = tear_polyLimit(holes[i - 1].pts, 7);
    }
    const rips = i === 0 ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2);
    const pts = tear_outline(rand, cx, cy, R, rips, limit);
    const band = tear_band(rand, pts, cx, cy);
    holes.push({ cx, cy, R, pts, hole: tear_path(pts), rim: tear_path(band) });
  }

  // Recursion mirrors the stack: each hole is drawn inside its parent's clip,
  // and its fibres and strands go on after everything beneath it, because they
  // belong to the sheet ABOVE and lie over the whole well.
  const draw = (i) => {
    const h = holes[i];
    // Hole i is torn in sheet i-1 (or the room's own paper for i = 0), and
    // older paper has yellowed further, so both its colours drift with depth.
    const v = rand() * 6;
    const core = `rgb(${Math.round(232 - i * 5 + v)}, ${Math.round(225 - i * 7 + v)}, ${Math.round(208 - i * 11 + v)})`;
    const back = `rgb(${Math.round(206 - i * 6 + v)}, ${Math.round(196 - i * 8 + v)}, ${Math.round(176 - i * 11 + v)})`;

    tear_rim(ctx, h, core);
    ctx.save();
    ctx.clip(h.hole);
    tear_fillLayer(ctx, srcs[i], rand, heightM);
    tear_age(ctx, i);
    tear_residue(ctx, rand, h, back);
    tear_innerShadow(ctx, h.hole);
    if (i + 1 < holes.length) draw(i + 1);
    ctx.restore();
    tear_fibres(ctx, rand, h, core);
    tear_strands(ctx, rand, h, i, back);
  };
  if (holes.length) draw(0);

  tear_grain(ctx, rand);

  // ClampToEdge both ways: a decal on its own quad, never tiled.
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.sizeM = [tear_SIZE_M, tear_SIZE_M];
  return tex;
}
