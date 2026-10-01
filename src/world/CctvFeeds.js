import * as THREE from 'three';
import { DOOR_PANEL_ROWS, getPanelSpans } from './doorPanels.js';

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
/**
 * Which part of the building each camera is pointed at.
 *
 * Four look upstairs; camera five looks at the basement the player is
 * standing in. Both zones end up on the same LIGHTING breaker, but they light
 * up at different MOMENTS -- the basement as soon as the 30A fuse is in, the
 * house only once the panel is routed -- so the feeds have to be able to
 * disagree with each other.
 *
 * The cameras themselves are on the CCTV circuit and keep working either way:
 * an unpowered feed shows a dark ROOM, not a dead camera, which is the
 * difference the player has to read off the screen.
 */
export const FEED_ROOM_ZONE = {
  kitchen: 'house',
  hallway: 'house',
  porch: 'house',
  study: 'house',
  basement: 'lab'
};

/** The breaker that fixes a dark room, named on screen so the player can go find it. */
const LIGHTING_CIRCUIT_LABEL = 'LIGHTING';

/**
 * How much of the study door's width is panel field rather than lock stile.
 * Shared with studyLevel.js by value, not by import, because the 3D door
 * derives its own from the same intent -- see the note in doorPanels.js about
 * why the SPANS are shared but the framing is not.
 */
const PANEL_FIELD_WIDTH_FRACTION = 0.62;

/** Locks on that door. Level 3 mounts three; the feed just needs the count. */
const LOCK_COUNT = 3;

/** How much of the image survives when the room it looks at has no power. */
const UNPOWERED_FEED_VEIL = 'rgba(4, 6, 10, 0.86)';

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

  /**
   * Which breaker circuits are currently feeding the rooms on camera.
   *
   * The house starts dark, which is the whole point: the player looks at four
   * black rooms long before they ever see a HOUSE breaker, so when they do
   * find one they already know what it is for. The basement starts lit
   * because the 30A fuse is what turned this screen on in the first place.
   */
  const roomZoneLit = { house: false, lab: true };

  /** @returns {boolean} whether the room this camera looks at has its lights on. */
  function isFeedRoomLit(id) {
    return roomZoneLit[FEED_ROOM_ZONE[id]] === true;
  }

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

    /**
     * Camera four. The most important frame in the set: it is how the player
     * learns there is a way out, and -- since the claw tally went onto that
     * door -- it is the only place the basement's security code can be read.
     *
     * THE DOOR USED TO BE UNREADABLE. It was 45px wide with the three locks
     * drawn as 5px bars at 26px spacing, so the thin dark bars left four fat
     * light gaps and the eye read the GAPS as the objects: a stack of pale
     * blocks, no door, no locks. Widened to 96px and the bars thickened to
     * 11px, which inverts it back -- the door reads as a door, and the locks
     * read as hardware bolted across it.
     *
     * That was cosmetic while the feed was scenery. It is load-bearing now:
     * gouges cannot be counted on a 45px door.
     */
    study(ctx) {
      const hy = room(ctx, { horizon: 0.32, spread: 1.5 });
      ctx.fillStyle = INK.dark;
      ctx.fillRect(W * 0.02, hy - 10, W * 0.13, H * 0.52);
      ctx.fillRect(W * 0.85, hy - 10, W * 0.13, H * 0.52);

      const doorX = W * 0.35;
      const doorW = W * 0.30;
      const doorY = hy - 8;
      const doorH = H * 0.52;
      ctx.fillStyle = INK.lightest;
      ctx.fillRect(doorX, doorY, doorW, doorH);

      /**
       * The panel field on the left, the lock stile on the right.
       *
       * Splitting the door that way is what real joinery does -- locks go
       * through the stile, never through a panel -- and it is also what keeps
       * the puzzle readable: a lock bar crossing a panel would break the
       * rectangle the player is trying to count, and an uncountable row is
       * worse than no row at all.
       */
      const fieldX = doorX + doorW * 0.06;
      const fieldW = doorW * PANEL_FIELD_WIDTH_FRACTION;
      const rowPitch = doorH / DOOR_PANEL_ROWS.length;
      const rowH = rowPitch * 0.62;

      DOOR_PANEL_ROWS.forEach((count, row) => {
        const rowY = doorY + rowPitch * row + (rowPitch - rowH) / 2;
        for (const span of getPanelSpans(count)) {
          const px = fieldX + span.x * fieldW;
          const pw = span.width * fieldW;
          // Raised panel: a slightly darker face with one lit top-left edge.
          // Two tones is all it takes for a rectangle to read as proud of the
          // surface rather than painted on it, and edges survive the grain
          // far better than any shading gradient would.
          ctx.fillStyle = INK.light;
          ctx.fillRect(px, rowY, pw, rowH);
          ctx.fillStyle = INK.lightest;
          ctx.fillRect(px, rowY, pw, 2);
          ctx.fillRect(px, rowY, 2, rowH);
        }
      });

      /**
       * The three locks, on the stile.
       *
       * Deliberately slimmer and softer than they were: at 11px of INK.black
       * they were the loudest thing in the frame and pulled the eye off the
       * panels, which are what the player actually has to read now. Hardware
       * should register as hardware and then get out of the way.
       */
      const lockPitch = doorH / (LOCK_COUNT + 1);
      for (let i = 0; i < LOCK_COUNT; i++) {
        const lockY = doorY + lockPitch * (i + 1);
        ctx.fillStyle = INK.dark;
        ctx.fillRect(doorX + doorW * 0.72, lockY - 3, doorW * 0.22, 6);
      }

      box(ctx, W * 0.5, H * 0.94, 110, 26, INK.mid);
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

    /**
     * A dark room, drawn over the render but UNDER the camera's own OSD.
     *
     * That ordering is the whole trick: the label and timestamp stay bright
     * because the camera has power, while the room behind them does not. A
     * feed that dimmed everything would read as a failing camera instead of
     * an unlit room, and the player would go looking for the wrong fix.
     *
     * The circuit is named on screen on purpose. It is the most direct
     * pointer the game can give toward the HOUSE breaker without a caption
     * telling the player what to do -- they read the word here, then find it
     * printed on a switch two puzzles later.
     */
    if (!isFeedRoomLit(id)) {
      ctx.fillStyle = UNPOWERED_FEED_VEIL;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = '13px monospace';
      ctx.fillStyle = INK.light;
      ctx.fillText('-- NO POWER --', W / 2, H / 2 - 6);
      ctx.font = '11px monospace';
      ctx.fillStyle = INK.mid;
      ctx.fillText(`CIRCUIT: ${LIGHTING_CIRCUIT_LABEL}`, W / 2, H / 2 + 12);
      // overlay() draws left-aligned and inherits this, so put it back.
      ctx.textAlign = 'left';
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

    /**
     * Says which parts of the building currently have their lights on.
     *
     * @param {{house?: boolean, lab?: boolean}} zones - only the keys given
     *   are changed, so a caller can flip one without restating the other.
     *
     * Redraws every feed rather than just the visible one: the player switches
     * cameras with the remote and each one has to be correct the instant it
     * appears, and this runs on a breaker flick rather than per frame.
     */
    setRoomPower(zones = {}) {
      for (const [zone, isLit] of Object.entries(zones)) {
        if (zone in roomZoneLit) roomZoneLit[zone] = isLit === true;
      }
      for (const id of FEED_IDS) draw(id);
    },

    /** @returns {boolean} whether the upstairs rooms are lit on camera. */
    get houseLit() {
      return roomZoneLit.house;
    },

    /** @returns {boolean} whether the basement is lit on camera five. */
    get labLit() {
      return roomZoneLit.lab;
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
      roomZoneLit.house = false;
      roomZoneLit.lab = true;
      for (const id of FEED_IDS) draw(id);
    },

    dispose() {
      for (const id of FEED_IDS) textures[id].dispose();
    }
  };
}
