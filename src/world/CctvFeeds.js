import * as THREE from 'three';

/**
 * The five camera feeds, painted onto canvases.
 *
 * WHY NOT RENDER-TO-TEXTURE, which is the obvious answer. Three of the five
 * cameras the storyline names -- the kitchen, the front porch, and the exterior
 * -- LOOK AT ROOMS THIS GAME DOES NOT HAVE. There is no kitchen. Building three
 * rooms that exist only to be filmed, at the fidelity of the rooms you can walk
 * in, to be shown at 320x240 through heavy static, is a great deal of work for
 * something the player sees for thirty seconds.
 *
 * And RTT is not free here either: every level is built at boot and kept
 * hidden by group.visible, so filming one would mean un-hiding it, rendering,
 * and re-hiding it, five times a frame, plus five extra scene traversals. The
 * project also states plainly that it ships no image assets (main.js), and a
 * canvas keeps that true.
 *
 * So: each feed is drawn. That turns out to be the RIGHT answer rather than the
 * cheap one, because a 1987 CCTV feed is not a photograph. It is a low-contrast,
 * low-resolution, interlaced grey image where you can only just make out shapes
 * -- which is exactly what a canvas is good at, and exactly what makes "did
 * something just move across camera two" work. A crisp render would give the
 * game away.
 *
 * The creature crossing camera two is therefore not a physics event that
 * happens to be filmed. It is a shape drawn moving across a canvas, which means
 * it can be timed to the frame and can never fail to happen.
 */

/** Feed resolution. Deliberately low: this is a 1987 security camera. */
const W = 320;
const H = 240;

/**
 * Every feed is drawn in this palette. Green-grey phosphor, not colour.
 *
 * Brighter than a first pass at it, and deliberately so: a CRT EMITS light. In
 * a basement measured at 14/255 mean luminance with the power off, this screen
 * is the brightest object in the room and the only thing drawing the eye. A
 * period-accurate murky feed rendered onto a 0.36 m panel viewed from a metre
 * away was unreadable -- shapes have to survive being small, dim and behind
 * scanlines, so the contrast between floor, wall and figure carries the image
 * rather than the detail does.
 */
const INK = {
  black: '#04060a',
  darkest: '#141d21',
  dark: '#222f32',
  mid: '#3a4f4c',
  light: '#55706a',
  lightest: '#7d9c8f',
  hot: '#b6d8bd'
};

/**
 * Camera ids, in the order the remote's buttons are laid out. The storyline
 * names these five: "The kitchen, The hallway you saw the creature in, the
 * front porch, and the study", plus "the 5th and final camera, it's the same
 * basement you are in".
 */
export const FEED_IDS = ['kitchen', 'hallway', 'porch', 'study', 'basement'];

export const FEED_LABELS = {
  kitchen: 'CAM 1  KITCHEN',
  hallway: 'CAM 2  HALL',
  porch: 'CAM 3  PORCH',
  study: 'CAM 4  STUDY',
  basement: 'CAM 5  SUB-LEVEL'
};

/** Simple deterministic hash, so a feed's grain is stable frame to frame. */
function noise(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Wide-angle perspective helper. A security camera is mounted high in a corner
 * looking down, so every feed shares the same crude one-point projection: a
 * floor quad narrowing toward a horizon well above centre. Drawing all five
 * this way is most of what makes them read as the same system.
 */
function room(ctx, { horizon = 0.34, spread = 1.6 } = {}) {
  const hy = H * horizon;
  ctx.fillStyle = INK.darkest;
  ctx.fillRect(0, 0, W, H);

  // back wall
  ctx.fillStyle = INK.dark;
  ctx.fillRect(W * 0.5 - W / (2 * spread), 0, W / spread, hy);

  // floor, as a trapezium from the back wall's base out to the frame edges
  ctx.fillStyle = INK.mid;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 - W / (2 * spread), hy);
  ctx.lineTo(W * 0.5 + W / (2 * spread), hy);
  ctx.lineTo(W * 1.15, H);
  ctx.lineTo(-W * 0.15, H);
  ctx.closePath();
  ctx.fill();

  // side walls fall away either side of the back wall
  ctx.fillStyle = INK.darkest;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * 0.5 - W / (2 * spread), 0);
  ctx.lineTo(W * 0.5 - W / (2 * spread), hy);
  ctx.lineTo(-W * 0.15, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W * 0.5 + W / (2 * spread), 0);
  ctx.lineTo(W * 0.5 + W / (2 * spread), hy);
  ctx.lineTo(W * 1.15, H);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  return hy;
}

/** A box in the scene, drawn with fake perspective by depth. */
function box(ctx, cx, cy, w, h, shade = INK.light) {
  ctx.fillStyle = shade;
  ctx.fillRect(cx - w / 2, cy - h, w, h);
  ctx.fillStyle = INK.dark;
  ctx.fillRect(cx - w / 2, cy - h, w, 2);
}

/**
 * The figure. The SAME silhouette on every camera it appears on, because it is
 * the same person -- and drawn with the Hollow's proportions, because the
 * player's sight is what is broken and a camera cannot correct it.
 *
 * @param t 0..1 across its walk, used for the gait
 */
function figure(ctx, x, groundY, scale, t) {
  const s = scale;
  ctx.fillStyle = INK.black;
  const swing = Math.sin(t * Math.PI * 6) * 0.35;

  // legs
  ctx.save();
  ctx.translate(x, groundY);
  ctx.beginPath();
  ctx.moveTo(-2 * s, 0);
  ctx.lineTo(swing * 6 * s, -22 * s);
  ctx.lineTo(2 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2 * s, 0);
  ctx.lineTo(-swing * 6 * s, -22 * s);
  ctx.lineTo(2 * s, 0);
  ctx.closePath();
  ctx.fill();

  // torso, hunched forward
  ctx.beginPath();
  ctx.moveTo(-4 * s, -20 * s);
  ctx.lineTo(4 * s, -20 * s);
  ctx.lineTo(3 * s, -40 * s);
  ctx.lineTo(-3 * s, -40 * s);
  ctx.closePath();
  ctx.fill();

  // arms, far too long -- the one detail that has to survive 320x240
  ctx.lineWidth = 2.2 * s;
  ctx.strokeStyle = INK.black;
  ctx.beginPath();
  ctx.moveTo(-3 * s, -38 * s);
  ctx.lineTo(-6 * s, -14 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3 * s, -38 * s);
  ctx.lineTo(6 * s, -12 * s);
  ctx.stroke();

  // head, small and set forward of the shoulders
  ctx.beginPath();
  ctx.ellipse(1.5 * s, -44 * s, 3.2 * s, 4 * s, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Timestamp and camera label, burned in the way a real unit does. */
function overlay(ctx, label, seconds) {
  ctx.font = '11px monospace';
  ctx.fillStyle = INK.hot;
  ctx.fillText(label, 8, 18);
  const hh = 2;
  const mm = Math.floor((seconds / 60) % 60);
  const ss = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  ctx.fillText(`0${hh}:${pad(mm)}:${pad(ss)}`, W - 74, H - 10);
  ctx.fillText('JUN 1987', 8, H - 10);
}

/** Interlace + grain, drawn last so it sits over everything. */
function grain(ctx, seconds, amount) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const seed = Math.floor(seconds * 24);
  for (let y = 0; y < H; y++) {
    // Every other line dimmed: interlacing is most of "this is a CRT feed".
    const inter = y % 2 === 0 ? 1 : 0.82;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const g = (noise(x, y, seed) - 0.5) * amount * 90;
      d[i] = Math.max(0, Math.min(255, (d[i] + g) * inter));
      d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] + g) * inter));
      d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] + g) * inter));
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Builds all five feeds. Returns a texture per camera plus an update(dt) that
 * only redraws the ONE that is currently on screen -- redrawing five 320x240
 * canvases with per-pixel grain every frame would cost more than the entire
 * rest of this game's frame.
 */
export function createCctvFeeds() {
  const canvases = {};
  const textures = {};
  const contexts = {};

  for (const id of FEED_IDS) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvases[id] = canvas;
    contexts[id] = canvas.getContext('2d', { willReadFrequently: true });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    textures[id] = tex;
  }

  let elapsed = 0;
  let active = 'kitchen';
  /** Set by the level to script the two sightings. */
  let hallwayDashAt = null;
  let basementFigure = false;
  let basementLostAt = null;

  const DRAWERS = {
    kitchen(ctx) {
      const hy = room(ctx, { horizon: 0.36, spread: 1.7 });
      // counter along the back, a table, chairs knocked over
      ctx.fillStyle = INK.light;
      ctx.fillRect(W * 0.28, hy - 6, W * 0.44, 8);
      box(ctx, W * 0.5, H * 0.78, 96, 34, INK.light);
      box(ctx, W * 0.31, H * 0.86, 26, 40, INK.mid);
      // one chair on its side -- left in a hurry
      ctx.save();
      ctx.translate(W * 0.7, H * 0.84);
      ctx.rotate(1.35);
      box(ctx, 0, 0, 22, 36, INK.mid);
      ctx.restore();
    },

    hallway(ctx) {
      const hy = room(ctx, { horizon: 0.3, spread: 3.2 });
      // a long corridor: door frames receding down both walls
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + i * 0.22;
        const w = 26 * (1 - t * 0.5);
        const h = 90 * (1 - t * 0.5);
        const y = hy + (H - hy) * t * 0.7;
        ctx.fillStyle = INK.darkest;
        ctx.fillRect(W * (0.5 - 0.16 - t * 0.14) - w / 2, y - h, w, h);
        ctx.fillRect(W * (0.5 + 0.16 + t * 0.14) - w / 2, y - h, w, h);
      }
      // the far end, brighter, so anything crossing it is a silhouette
      ctx.fillStyle = INK.lightest;
      ctx.fillRect(W * 0.44, hy - 40, W * 0.12, 40);
    },

    porch(ctx) {
      room(ctx, { horizon: 0.44, spread: 1.2 });
      // looking OUT: railings, and rain streaking the lens
      ctx.strokeStyle = INK.light;
      ctx.lineWidth = 3;
      for (let i = 0; i <= 8; i++) {
        const x = W * (0.08 + i * 0.105);
        ctx.beginPath();
        ctx.moveTo(x, H * 0.52);
        ctx.lineTo(x, H * 0.86);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, H * 0.52);
      ctx.lineTo(W, H * 0.52);
      ctx.stroke();
      // treeline beyond
      ctx.fillStyle = INK.black;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.44);
      for (let i = 0; i <= 12; i++) {
        ctx.lineTo(W * (i / 12), H * (0.30 + 0.12 * noise(i, 3, 11)));
      }
      ctx.lineTo(W, H * 0.44);
      ctx.closePath();
      ctx.fill();
    },

    study(ctx) {
      const hy = room(ctx, { horizon: 0.32, spread: 1.5 });
      // bookshelves both sides, and THE FRONT DOOR, which is the point of
      // this feed: it is how the player learns there is a way out.
      ctx.fillStyle = INK.dark;
      ctx.fillRect(W * 0.06, hy - 10, W * 0.16, H * 0.52);
      ctx.fillRect(W * 0.78, hy - 10, W * 0.16, H * 0.52);
      ctx.fillStyle = INK.lightest;
      ctx.fillRect(W * 0.43, hy - 4, W * 0.14, H * 0.40);
      ctx.fillStyle = INK.black;
      // the three locks, as three dark bars across it
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(W * 0.43, hy + 14 + i * 26, W * 0.14, 5);
      }
      box(ctx, W * 0.5, H * 0.9, 110, 30, INK.mid);
    },

    basement(ctx) {
      const hy = room(ctx, { horizon: 0.34, spread: 1.9 });
      // pipes across the ceiling and the shelving, so it is recognisably the
      // room the player is standing in while they look at it
      ctx.strokeStyle = INK.light;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 18 + i * 9);
        ctx.lineTo(W, 18 + i * 9);
        ctx.stroke();
      }
      ctx.fillStyle = INK.dark;
      ctx.fillRect(W * 0.72, hy - 20, W * 0.2, H * 0.46);
      box(ctx, W * 0.3, H * 0.82, 60, 26, INK.light);
    }
  };

  function draw(id) {
    const ctx = contexts[id];
    ctx.save();
    DRAWERS[id](ctx);

    // --- the two scripted sightings ---------------------------------------
    if (id === 'hallway' && hallwayDashAt !== null) {
      const t = (elapsed - hallwayDashAt) / 0.75;
      if (t >= 0 && t <= 1) {
        // Straight across the bright far end, fast. Under a second, which is
        // the whole point: the player is not sure they saw it.
        figure(ctx, W * (0.12 + t * 0.78), H * 0.62, 1.15, t);
      }
    }
    if (id === 'basement' && basementFigure) {
      // Standing still, in the corner, facing the camera. It does not move.
      figure(ctx, W * 0.74, H * 0.80, 1.5, 0);
    }

    overlay(ctx, FEED_LABELS[id], 3600 * 2 + elapsed);

    // Camera five loses signal after the figure has been seen.
    let noiseAmount = 0.32;
    if (id === 'basement' && basementLostAt !== null && elapsed > basementLostAt) {
      noiseAmount = Math.min(1.6, 0.32 + (elapsed - basementLostAt) * 2.2);
    }
    grain(ctx, elapsed, noiseAmount);
    ctx.restore();
    textures[id].needsUpdate = true;
  }

  // Every feed drawn once up front, so switching to one is never a blank frame.
  for (const id of FEED_IDS) draw(id);

  return {
    textures,
    get active() {
      return active;
    },

    setActive(id) {
      if (!FEED_IDS.includes(id)) return false;
      active = id;
      draw(id);
      return true;
    },

    /** Arm the hallway dash to happen `delay` seconds from now. */
    scheduleHallwayDash(delay = 1.2) {
      hallwayDashAt = elapsed + delay;
    },

    /** The figure standing in the basement, and the feed dying after it. */
    showBasementFigure(loseSignalAfter = 2.6) {
      basementFigure = true;
      basementLostAt = elapsed + loseSignalAfter;
    },

    get basementSignalLost() {
      return basementLostAt !== null && elapsed > basementLostAt + 0.6;
    },

    update(dt) {
      elapsed += dt;
      // ONLY the visible feed. Five 320x240 canvases with per-pixel grain would
      // cost more per frame than everything else in this game put together.
      draw(active);
    },

    reset() {
      elapsed = 0;
      active = 'kitchen';
      hallwayDashAt = null;
      basementFigure = false;
      basementLostAt = null;
      for (const id of FEED_IDS) draw(id);
    },

    dispose() {
      for (const id of FEED_IDS) textures[id].dispose();
    }
  };
}
