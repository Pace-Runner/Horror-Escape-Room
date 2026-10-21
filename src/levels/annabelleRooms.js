import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadModel } from '../world/modelLoader.js';
import { createRugTexture, createPolaroidTexture, createFamilyPhotoTexture, tiled } from '../world/textures.js';
import {
  createNurseryWallpaperTexture, createCloudWallpaperTexture, createCrayonScribbleTexture,
  createPlumPaintTexture, createPosterGhostTexture, createFairyLightsTexture,
  createDamaskWallpaperTexture, createPeelingSeamTexture, createTearRevealTexture
} from '../world/annabelleWallpapers.js';
import { LEGS, DOORWAYS, legRect, runCollider, buildWallRuns } from './backroomsMaze.js';
import bedUrl from '../assets/models/bed.glb?url';
import bedsideTableUrl from '../assets/models/bedside_table.glb?url';
import lampUrl from '../assets/models/bedside_lamp.glb?url';
import dresserUrl from '../assets/models/dresser.glb?url';
import crtUrl from '../assets/models/crt_monitor.glb?url';
import chairUrl from '../assets/models/level1_chair_remodel.glb?url';
import pinboardUrl from '../assets/models/pinboard.glb?url';
import wastebasketUrl from '../assets/models/level1_wastebasket_remodel.glb?url';
import paperBallUrl from '../assets/models/level1_crumpled_paper_ball.glb?url';
import lockboxUrl from '../assets/models/antique_lockbox.glb?url';
import clockUrl from '../assets/models/bedside_alarm_clock.glb?url';
import rugUrl from '../assets/models/rug/level1_victorian_rug.glb?url';
import vanityBaseUrl from '../assets/models/vanity/vanity_base.glb?url';
import vanityMirrorUrl from '../assets/models/vanity/vanity_mirror.glb?url';
import vanityStoolUrl from '../assets/models/vanity/vanity_stool.glb?url';
import vanityPerfumeUrl from '../assets/models/vanity/vanity_perfume.glb?url';
import vanityTrayUrl from '../assets/models/vanity/vanity_tray.glb?url';

/**
 * ANNABELLE'S ROOMS. Four of the maze's five rooms are one woman's bedroom at
 * four ages, in the order the player walks into them:
 *
 *   BL  baby      first crossing, just in from the stairs
 *   L   age 5     first crossing, off the west edge
 *   TR  age 18    first crossing, beside Door 1
 *   R   age 30    second crossing only -- the last one anybody sees
 *
 * Room C is left alone: Door 2 stands in it.
 *
 * Nothing in any of them sits quite where it should. Furniture goes into the
 * walls, floor and ceiling, and some pieces are there twice or three times,
 * the copies standing inside each other like a photo taken while it moved.
 * The teddy is the one thing never copied: it is how you know it is the same
 * room.
 *
 * The rooms get WORSE with age rather than scarier. The nursery is nearly
 * normal, which in a backrooms corridor is the strange part: one cot standing
 * a hand's width inside another, the rocking chair rocking into the wall. At five the scale
 * is off (blocks as big as the bed, a chair sinking into the carpet). At
 * eighteen the furniture has started losing to the building (a chair half
 * through the wall, the desk lamp on the ceiling, the baby mobile turning in a
 * corner it has no business in). At thirty the room is barely holding: a
 * dresser lying in the wall, the bed stood on end, the desk swallowed by the
 * partition, and the crib back again, adult-sized and empty except for the
 * same teddy that has been in every room, a little worse each time.
 *
 * Each room is halved by one partition wall in this level's own wallpaper, so
 * the furnished half is the half both doorways open into. The maze itself is
 * untouched -- backroomsMaze.js and its validator never hear about any of it.
 *
 * Each room's walls are papered for her age, on the room side only, so the
 * corridors outside stay yellow: nursery pastels, a five-year-old's clouds
 * (drawn on in crayon), the plum paint she chose at eighteen, a grown-up's
 * damask at thirty. Where the newer rooms are torn, the older ones are
 * underneath -- at thirty, all the way down to the yellow.
 *
 * Models face +Z (bed headboard at -Z); `rotY` turns that front to face
 * (sin rotY, cos rotY).
 */

// Out from the wall plane, in metres: paper, then the decals on the paper,
// then anything hung on it. Far enough apart that the level's own stain and
// blood decals (drawn ON the wall with polygonOffset) stay behind the paper
// even at grazing angles.
const PAPER_OFF = 0.008;
const DECAL_OFF = 0.013;
const HUNG_OFF = 0.018;

const WALL_RUNS = buildWallRuns();

/**
 * The walls of a room's furnished half, each with its inward normal `n` (+1 or
 * -1 along the axis it stands across): the maze's own wall runs on the room's
 * edges, which already stop at the doorways, cut at the partition -- plus the
 * partition itself.
 */
function roomWalls(def, rect) {
  const [x0, x1, z0, z1] = rect;
  const [ox0, ox1, oz0, oz1] = legRect(LEGS[def.room]);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const out = [];
  for (const r of WALL_RUNS) {
    const lo = r.axis === 'x' ? ox0 : oz0;
    const hi = r.axis === 'x' ? ox1 : oz1;
    const n = near(r.at, lo) ? 1 : near(r.at, hi) ? -1 : 0;
    const [a0, a1] = r.axis === 'x' ? [x0, x1] : [z0, z1];   // across
    const [b0, b1] = r.axis === 'x' ? [z0, z1] : [x0, x1];   // along
    if (!n || r.at < a0 - 0.01 || r.at > a1 + 0.01) continue;
    const from = Math.max(r.from, b0), to = Math.min(r.to, b1);
    if (to - from > 0.05) out.push({ axis: r.axis, at: r.at, from, to, n });
  }
  const { axis, at } = def.wall;
  const [from, to] = axis === 'x' ? [z0, z1] : [x0, x1];
  out.push({ axis, at, from, to, n: def.keep === 'min' ? -1 : 1 });
  return out;
}

/** rotY that turns a +Z-facing quad to face out of a wall along its inward normal. */
const facing = (axis, n) => (axis === 'x' ? (n > 0 ? Math.PI / 2 : -Math.PI / 2) : (n > 0 ? 0 : Math.PI));

// The partition for each room: a wall run in backroomsMaze's own terms, so
// runCollider() builds its collider exactly the way it builds every other wall.
const ROOMS = {
  baby: { room: 'room_BL', wall: { axis: 'x', at: 9.6 }, keep: 'min' },
  five: { room: 'room_L', wall: { axis: 'x', at: -7.2 }, keep: 'max' },
  teen: { room: 'room_TR', wall: { axis: 'z', at: -2.4 }, keep: 'max' },
  adult: { room: 'room_R', wall: { axis: 'x', at: 64.8 }, keep: 'min' }
};

/** The furnished half of a room: its legRect cut at the partition. */
function furnishedRect({ room, wall, keep }) {
  const [x0, x1, z0, z1] = legRect(LEGS[room]);
  if (wall.axis === 'x') return keep === 'min' ? [x0, wall.at, z0, z1] : [wall.at, x1, z0, z1];
  return keep === 'min' ? [x0, x1, z0, wall.at] : [x0, x1, wall.at, z1];
}

/**
 * The floor anything can actually stand on in each dressed room, keyed by maze
 * leg name. The far side of a partition is sealed off, so anything that picks
 * a spot in a room (the backrooms hunter's spawns and wander targets) has to
 * pick it here, not from the leg's own midpoint -- which, for three of these
 * rooms, is exactly where the partition stands.
 */
export const ROOM_FLOORS = Object.fromEntries(
  Object.values(ROOMS).map((def) => [def.room, furnishedRect(def)])
);

// Every doorway into a dressed room has to land in the furnished half, or the
// partition has sealed a way through the maze.
if (import.meta.env?.DEV) {
  for (const [key, def] of Object.entries(ROOMS)) {
    const [x0, x1, z0, z1] = furnishedRect(def);
    const id = def.room.replace('room_', '');
    for (const d of DOORWAYS.filter((dw) => dw.room === id)) {
      if (d.x < x0 - 1.7 || d.x > x1 + 1.7 || d.z < z0 - 1.7 || d.z > z1 + 1.7) {
        console.error(`annabelleRooms: the ${key} partition cuts off doorway ${d.neck}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pictures, drawn once
// ---------------------------------------------------------------------------

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A crayon stroke: a few slightly-offset passes, the way wax actually lays down. */
function crayon(ctx, color, width, pts) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = width * (0.7 + pass * 0.2);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (Math.random() - 0.5) * 3;
      const jy = y + (Math.random() - 0.5) * 3;
      if (i === 0) ctx.moveTo(jx, jy); else ctx.lineTo(jx, jy);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function crayonText(ctx, text, x, y, size, color) {
  ctx.font = `bold ${size}px "Comic Sans MS", "Chalkboard SE", sans-serif`;
  ctx.fillStyle = color;
  [...text].forEach((ch, i) => {
    ctx.save();
    ctx.translate(x + i * size * 0.72, y + (Math.random() - 0.5) * size * 0.25);
    ctx.rotate((Math.random() - 0.5) * 0.35);
    ctx.globalAlpha = 0.85;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function paper(ctx, w, h, fill = '#f4efe2') {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

function stickFigure(ctx, x, y, s, color, dress = null) {
  crayon(ctx, color, 5, [[x, y - s * 0.55], [x, y - s * 0.1]]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.7, s * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  crayon(ctx, color, 5, [[x - s * 0.25, y - s * 0.4], [x + s * 0.25, y - s * 0.4]]);
  crayon(ctx, color, 5, [[x - s * 0.18, y + s * 0.3], [x, y - s * 0.1], [x + s * 0.18, y + s * 0.3]]);
  if (dress) crayon(ctx, dress, 9, [[x - s * 0.15, y], [x, y - s * 0.3], [x + s * 0.15, y], [x - s * 0.15, y]]);
}

const PICTURES = {
  // Painted wooden letters over the crib. A shade deeper than the wallpaper's
  // pastels, with a cream edge, or they disappear into its stripes.
  nurseryName: () => canvasTexture(1024, 220, (ctx, w, h) => {
    const cols = ['#c97c90', '#6f97bd', '#cfa043', '#7fae74'];
    ctx.lineJoin = 'round';
    ctx.font = 'bold 150px Georgia, serif';
    ctx.textBaseline = 'middle';
    [...'ANNABELLE'].forEach((ch, i) => {
      const x = 40 + i * 106;
      ctx.save();
      ctx.translate(x, h / 2 + (i % 2 ? 8 : -8));
      ctx.rotate((i % 3 - 1) * 0.05);
      ctx.fillStyle = 'rgba(60,40,30,0.45)';
      ctx.fillText(ch, 6, 7);
      ctx.strokeStyle = '#f4ecdc';
      ctx.lineWidth = 10;
      ctx.strokeText(ch, 0, 0);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }),
  // Age five: mum, dad, me.
  family: () => canvasTexture(512, 384, (ctx, w, h) => {
    paper(ctx, w, h);
    crayon(ctx, '#3b9c3b', 14, [[0, 330], [120, 325], [260, 335], [400, 326], [512, 332]]);
    ctx.fillStyle = 'rgba(245,200,40,0.8)';
    ctx.beginPath(); ctx.arc(430, 70, 40, 0, Math.PI * 2); ctx.fill();
    for (let a = 0; a < 8; a++) {
      const c = Math.cos(a * Math.PI / 4), s = Math.sin(a * Math.PI / 4);
      crayon(ctx, '#f0c020', 5, [[430 + c * 52, 70 + s * 52], [430 + c * 75, 70 + s * 75]]);
    }
    stickFigure(ctx, 120, 260, 150, '#2a4fa0');
    stickFigure(ctx, 210, 260, 140, '#b0306a', '#d0508a');
    stickFigure(ctx, 290, 285, 90, '#c03030', '#e86a2a');
    crayonText(ctx, 'ME', 272, 345, 34, '#c03030');
    crayonText(ctx, 'ANABELL', 40, 50, 46, '#7a3fb0');
  }),
  house: () => canvasTexture(512, 384, (ctx, w, h) => {
    paper(ctx, w, h);
    crayon(ctx, '#3b9c3b', 14, [[0, 340], [512, 336]]);
    crayon(ctx, '#8a5a2a', 8, [[150, 330], [150, 190], [360, 190], [360, 330], [150, 330]]);
    crayon(ctx, '#c02a2a', 10, [[130, 195], [255, 90], [380, 195], [130, 195]]);
    crayon(ctx, '#2a4fa0', 6, [[190, 220], [240, 220], [240, 265], [190, 265], [190, 220]]);
    crayon(ctx, '#e0a020', 8, [[290, 330], [290, 260], [330, 260], [330, 330]]);
    crayonText(ctx, 'MY HOUSE', 120, 50, 44, '#2a4fa0');
  }),
  // The one that should not exist: the corridors outside, drawn from memory.
  corridor: () => canvasTexture(512, 384, (ctx, w, h) => {
    paper(ctx, w, h, '#f2e3a0');
    const cx = 256, cy = 190;
    crayon(ctx, '#8a7a30', 6, [[0, 0], [cx - 60, cy - 50]]);
    crayon(ctx, '#8a7a30', 6, [[512, 0], [cx + 60, cy - 50]]);
    crayon(ctx, '#8a7a30', 6, [[0, 384], [cx - 60, cy + 60]]);
    crayon(ctx, '#8a7a30', 6, [[512, 384], [cx + 60, cy + 60]]);
    crayon(ctx, '#5a4a20', 6, [[cx - 60, cy - 50], [cx + 60, cy - 50], [cx + 60, cy + 60], [cx - 60, cy + 60], [cx - 60, cy - 50]]);
    for (const [y, s] of [[30, 1], [80, 0.6], [115, 0.35]]) {
      ctx.fillStyle = 'rgba(255,255,230,0.9)';
      ctx.fillRect(cx - 70 * s, y, 140 * s, 18 * s);
    }
    stickFigure(ctx, cx, cy + 40, 50, '#c03030', '#e86a2a');
    crayonText(ctx, 'MY ROOM', 150, 360, 40, '#5a4a20');
  }),
  bandPoster: () => canvasTexture(400, 560, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b1030'); g.addColorStop(1, '#4a1030');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e04a7a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(200, 230, 120, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f2e8d8';
    ctx.font = 'bold 86px Impact, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DEAD', 200, 215);
    ctx.fillText('AIR', 200, 300);
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillText('NO SIGNAL TOUR', 200, 440);
    ctx.font = '22px Arial, sans-serif';
    ctx.fillStyle = '#e04a7a';
    ctx.fillText('ONE NIGHT ONLY', 200, 480);
  }),
  keepOut: () => canvasTexture(512, 300, (ctx, w, h) => {
    ctx.fillStyle = '#f6f0e6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8304a'; ctx.fillRect(0, 0, w, 16); ctx.fillRect(0, h - 16, w, 16);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#222';
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.fillText("ANNABELLE'S", w / 2, 100);
    ctx.fillText('ROOM', w / 2, 160);
    ctx.fillStyle = '#d8304a';
    ctx.font = 'bold 66px Impact, sans-serif';
    ctx.fillText('KEEP OUT!!', w / 2, 250);
  }),
  letter: (ch, bg, fg) => canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg; ctx.font = 'bold 180px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, w / 2, h / 2 + 10);
  })
};

// ---------------------------------------------------------------------------
// The dressing
// ---------------------------------------------------------------------------

export function dressAnnabelleRooms({ group, colliders, wallMatFor, hallH, backroomsWallpaper }) {
  const root = new THREE.Group();
  root.name = 'AnnabelleRooms';
  group.add(root);
  const spinners = [];   // { obj, speed }
  const rockers = [];    // { obj, phase, amp, rate }
  let t = 0;

  const mat = (color, roughness = 0.75, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, ...extra });

  const shadowed = (obj) => {
    obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return obj;
  };

  /** Many boxes in one material, merged into one mesh. Parts: [w,h,d, x,y,z, rx,ry,rz]. */
  function solid(material, parts) {
    const geos = parts.map(([w, h, d, x, y, z, rx = 0, ry = 0, rz = 0]) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1)));
      return g;
    });
    return shadowed(new THREE.Mesh(mergeGeometries(geos), material));
  }

  function clipTo(rect, b) {
    const [x0, x1, z0, z1] = rect;
    const c = {
      minX: Math.max(b.minX, x0), maxX: Math.min(b.maxX, x1),
      minZ: Math.max(b.minZ, z0), maxZ: Math.min(b.maxZ, z1)
    };
    // Entirely inside a wall: nothing to bump into.
    if (c.minX >= c.maxX || c.minZ >= c.maxZ) return { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 };
    return c;
  }

  /** A collider from an object's world bounds, clipped to the furnished half. */
  function collideWith(obj, rect, shrink = 0.02) {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    const col = clipTo(rect, {
      minX: b.min.x + shrink, maxX: b.max.x - shrink, minZ: b.min.z + shrink, maxZ: b.max.z - shrink
    });
    colliders.push(col);
    return col;
  }

  // One parse per URL; every placement takes a clone.
  const cache = new Map();
  const model = (url) => {
    if (!cache.has(url)) cache.set(url, loadModel(url));
    return cache.get(url).then((m) => m.clone(true));
  };

  /**
   * Place a GLB. Its collider goes in straight away (parked out of reach) and
   * takes its real footprint once the model is measured, so the push order of
   * `colliders` never depends on load order.
   *
   * floor: lift so its lowest point sits at `y` minus `sink`. Without it the
   * model's own origin goes at `y` (for things hung from the ceiling or set on
   * a table top).
   */
  function place(url, {
    rect, x, z, y = 0, rotY = 0, rot = null, scale = 1, sink = 0,
    floor = true, collide = true, then
  }) {
    const host = new THREE.Group();
    host.position.set(x, y, z);
    host.rotation.y = rotY;
    host.scale.setScalar(scale);
    root.add(host);
    const col = collide ? { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 } : null;
    if (col) colliders.push(col);
    model(url).then((m) => {
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      shadowed(m);
      host.add(m);
      host.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(host);
      if (floor) host.position.y += y - b.min.y - sink;
      if (col) {
        host.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(host);
        Object.assign(col, clipTo(rect, {
          minX: bb.min.x + 0.02, maxX: bb.max.x - 0.02, minZ: bb.min.z + 0.02, maxZ: bb.max.z - 0.02
        }));
      }
      then?.(m, host);
    }).catch((err) => console.error(`annabelleRooms: could not load ${url}:`, err));
    return host;
  }

  /** A flat picture on a wall. rotY is the wall's inward normal, as sideWall() gives it. */
  function onWall(tex, w, h, x, y, z, rotY, tilt = 0, transparent = false) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent })
    );
    m.position.set(x + Math.sin(rotY) * HUNG_OFF, y, z + Math.cos(rotY) * HUNG_OFF);
    m.rotation.set(0, rotY, tilt);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }

  function rug(x, z, w, d, colours, rotY = 0) {
    const tex = createRugTexture(colours);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98 }));
    m.rotation.set(-Math.PI / 2, 0, rotY);
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    root.add(m);
  }

  function lamp(x, y, z, color, intensity, distance) {
    const l = new THREE.PointLight(color, intensity * 2, distance, 1.6);
    l.position.set(x, y, z);
    root.add(l);
    return l;
  }

  // ---------- procedural props ----------

  /** A cot, 1.3 m long along X at scale 1. */
  function crib(scale = 1, paint = 0xe9e3d7) {
    const wood = mat(paint, 0.65);
    const parts = [];
    const L = 1.3, W = 0.72, H = 1.0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([0.05, H, 0.05, sx * L / 2, H / 2, sz * W / 2]);
    for (const sz of [-1, 1]) {
      parts.push([L, 0.045, 0.05, 0, H - 0.04, sz * W / 2]);
      parts.push([L, 0.04, 0.04, 0, 0.3, sz * W / 2]);
      for (let i = 1; i < 14; i++) parts.push([0.022, 0.62, 0.022, -L / 2 + i * L / 14, 0.62, sz * W / 2]);
    }
    for (const sx of [-1, 1]) {
      parts.push([0.05, 0.045, W, sx * L / 2, H - 0.04, 0]);
      parts.push([0.04, 0.04, W, sx * L / 2, 0.3, 0]);
      for (let i = 1; i < 7; i++) parts.push([0.022, 0.62, 0.022, sx * L / 2, 0.62, -W / 2 + i * W / 7]);
    }
    const g = new THREE.Group();
    g.add(solid(wood, parts));
    g.add(solid(mat(0xdfe6ee, 0.95), [[L - 0.06, 0.12, W - 0.06, 0, 0.37, 0]]));
    g.scale.setScalar(scale);
    return g;
  }

  /** Stars and moons on threads, from a hook in the ceiling. Spins in update(). */
  function mobile(x, z, drop = 0.75) {
    const hang = new THREE.Group();
    hang.position.set(x, hallH, z);
    root.add(hang);
    const thread = mat(0xd8d0c0, 0.9);
    hang.add(solid(thread, [[0.006, drop, 0.006, 0, -drop / 2, 0]]));
    const spin = new THREE.Group();
    spin.position.y = -drop;
    hang.add(spin);
    spin.add(solid(mat(0xf2eee6, 0.6), [[0.46, 0.012, 0.012, 0, 0, 0], [0.012, 0.012, 0.46, 0, 0, 0]]));
    const shapes = [
      [new THREE.OctahedronGeometry(0.05), 0xf1dca0],
      [new THREE.TorusGeometry(0.045, 0.016, 8, 16, Math.PI * 1.3), 0xb9d4e8],
      [new THREE.SphereGeometry(0.04, 12, 10), 0xe9b8c4],
      [new THREE.OctahedronGeometry(0.05), 0xc6e0bf]
    ];
    shapes.forEach(([geo, col], i) => {
      const a = i * Math.PI / 2;
      const len = 0.14 + (i % 2) * 0.08;
      const px = Math.cos(a) * 0.22, pz = Math.sin(a) * 0.22;
      spin.add(solid(thread, [[0.004, len, 0.004, px, -len / 2, pz]]));
      const m = new THREE.Mesh(geo, mat(col, 0.6));
      m.position.set(px, -len - 0.05, pz);
      m.castShadow = true;
      spin.add(m);
    });
    spinners.push({ obj: spin, speed: 0.22 });
    return hang;
  }

  /** Rocks on its own, very slowly. Faces +Z. */
  function rockingChair(x, z, rotY, rect) {
    const wood = mat(0xd9cdb8, 0.7);
    const R = 0.95;
    const pivot = new THREE.Group();
    pivot.position.set(x, R, z);
    pivot.rotation.y = rotY;
    root.add(pivot);
    const body = new THREE.Group();
    body.position.y = -R;
    pivot.add(body);
    const parts = [
      [0.48, 0.04, 0.44, 0, 0.44, 0],
      // legs down to the rockers
      [0.04, 0.38, 0.04, -0.21, 0.24, 0.17], [0.04, 0.38, 0.04, 0.21, 0.24, 0.17],
      [0.04, 0.38, 0.04, -0.21, 0.24, -0.17], [0.04, 0.38, 0.04, 0.21, 0.24, -0.17],
      // back posts and spindles, leaning back
      [0.045, 0.62, 0.045, -0.21, 0.76, -0.24, -0.15], [0.045, 0.62, 0.045, 0.21, 0.76, -0.24, -0.15],
      [0.46, 0.06, 0.04, 0, 1.06, -0.29, -0.15],
      ...[-0.12, -0.04, 0.04, 0.12].map((sx) => [0.025, 0.56, 0.025, sx, 0.76, -0.25, -0.15]),
      // arms
      [0.04, 0.04, 0.46, -0.24, 0.66, -0.01], [0.04, 0.04, 0.46, 0.24, 0.66, -0.01],
      [0.035, 0.22, 0.035, -0.24, 0.55, 0.19], [0.035, 0.22, 0.035, 0.24, 0.55, 0.19]
    ];
    body.add(solid(wood, parts));
    body.add(solid(mat(0xe7c9cf, 0.95), [[0.42, 0.05, 0.38, 0, 0.485, 0.01]]));
    for (const sx of [-0.21, 0.21]) {
      const rocker = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 6, 24, 0.7), wood);
      rocker.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.35);
      rocker.position.set(sx, R, 0);
      rocker.castShadow = true;
      body.add(rocker);
    }
    rockers.push({ obj: pivot, phase: 0, amp: 0.07, rate: 0.9 });
    colliders.push(clipTo(rect, { minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 }));
    return pivot;
  }

  /**
   * The teddy. The same bear in every room, worse each time: `wear` 0..1 greys
   * the fur, `eyes` drops to one at five, and the oldest has lost an ear and
   * is coming open at the arm.
   */
  function teddy({ wear = 0, eyes = 2, ear = true, stuffing = false } = {}) {
    const fur = new THREE.Color(0xb07d4a).lerp(new THREE.Color(0x4f473c), wear);
    const furMat = mat(fur, 0.98);
    const pale = mat(new THREE.Color(0xe2c49a).lerp(new THREE.Color(0x6a6052), wear), 0.98);
    const black = mat(0x111111, 0.3);
    const g = new THREE.Group();
    const ball = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
      s.position.set(x, y, z);
      s.scale.set(sx, sy, sz);
      s.castShadow = true;
      g.add(s);
    };
    ball(0.1, furMat, 0, 0.11, 0, 1, 1.15, 0.9);
    ball(0.055, pale, 0, 0.11, 0.06, 1, 1.2, 0.5);
    ball(0.078, furMat, 0, 0.27, 0.01);
    ball(0.032, pale, 0, 0.255, 0.07, 1, 0.8, 0.8);
    ball(0.01, black, 0, 0.265, 0.098);
    ball(0.03, furMat, -0.058, 0.33, 0);
    if (ear) ball(0.03, furMat, 0.058, 0.33, 0);
    ball(0.011, black, -0.03, 0.29, 0.068);
    if (eyes > 1) ball(0.011, black, 0.03, 0.29, 0.068);
    else ball(0.012, mat(0x2a1a10, 0.95), 0.03, 0.29, 0.069, 1, 0.3, 0.4);   // the thread where it was
    ball(0.035, furMat, -0.1, 0.14, 0.03, 0.9, 1.5, 0.9);
    ball(0.035, furMat, 0.1, 0.14, 0.03, 0.9, 1.5, 0.9);
    ball(0.042, furMat, -0.06, 0.035, 0.08, 1, 0.8, 1.4);
    ball(0.042, furMat, 0.06, 0.035, 0.08, 1, 0.8, 1.4);
    if (stuffing) ball(0.022, mat(0xd8d4c8, 1), 0.085, 0.19, 0.04);
    root.add(g);
    return g;
  }

  function block(ch, size, bg, fg) {
    const tex = PICTURES.letter(ch, bg, fg);
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  }

  function tinyChair(color) {
    const c = solid(mat(color, 0.6), [
      [0.26, 0.03, 0.26, 0, 0.26, 0],
      [0.26, 0.24, 0.03, 0, 0.4, -0.12],
      [0.03, 0.26, 0.03, -0.11, 0.13, 0.11], [0.03, 0.26, 0.03, 0.11, 0.13, 0.11],
      [0.03, 0.26, 0.03, -0.11, 0.13, -0.11], [0.03, 0.26, 0.03, 0.11, 0.13, -0.11]
    ]);
    root.add(c);
    return c;
  }

  function desk(w, d, h, color = 0x6b4a32) {
    const wood = mat(color, 0.7);
    const g = solid(wood, [
      [w, 0.04, d, 0, h - 0.02, 0],
      [0.05, h - 0.04, 0.05, -w / 2 + 0.04, (h - 0.04) / 2, -d / 2 + 0.04],
      [0.05, h - 0.04, 0.05, w / 2 - 0.04, (h - 0.04) / 2, -d / 2 + 0.04],
      [0.05, h - 0.04, 0.05, -w / 2 + 0.04, (h - 0.04) / 2, d / 2 - 0.04],
      [0.05, h - 0.04, 0.05, w / 2 - 0.04, (h - 0.04) / 2, d / 2 - 0.04],
      [w * 0.35, 0.14, d - 0.06, w / 2 - w * 0.2, h - 0.11, 0]
    ]);
    root.add(g);
    return g;
  }

  function deadPlant(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.28, 16), mat(0x9a5a3a, 0.9));
    pot.position.y = 0.14;
    pot.castShadow = true;
    g.add(pot);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.02, 16), mat(0x2a2018, 1));
    soil.position.y = 0.27;
    g.add(soil);
    const stalk = mat(0x5a4a30, 1);
    [[0.0, 0.0, 0.1], [0.05, 0.03, -0.5], [-0.04, -0.03, 0.7], [0.02, -0.05, 1.3], [-0.03, 0.04, -1.1]].forEach(([sx, sz, lean]) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.5, 5), stalk);
      s.position.set(sx + Math.sin(lean) * 0.12, 0.5, sz);
      s.rotation.z = -lean * 0.45;
      s.castShadow = true;
      g.add(s);
    });
    root.add(g);
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15 });
    return g;
  }

  function photoFrame(tex, x, y, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    g.add(solid(mat(0x3a2a1c, 0.5), [[0.2, 0.16, 0.015, 0, 0.08, 0, -0.18], [0.02, 0.12, 0.08, 0, 0.06, -0.04, 0.5]]));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.13), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    pic.position.set(0, 0.08, 0.009);
    pic.rotation.x = -0.18;
    g.add(pic);
    root.add(g);
    return g;
  }

  // ---------- partitions ----------
  const tideMat = mat(0x453a24, 0.5);
  const rects = {};
  for (const [key, def] of Object.entries(ROOMS)) {
    const rect = furnishedRect(def);
    rects[key] = rect;
    const [ox0, ox1, oz0, oz1] = legRect(LEGS[def.room]);
    const { axis, at } = def.wall;
    const [from, to] = axis === 'x' ? [oz0, oz1] : [ox0, ox1];
    const len = to - from;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, hallH), wallMatFor(len));
    const tide = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.02), tideMat);
    if (axis === 'x') {
      wall.position.set(at, hallH / 2, (from + to) / 2);
      wall.rotation.y = Math.PI / 2;
      tide.position.set(at, 0.05, (from + to) / 2);
      tide.rotation.y = Math.PI / 2;
    } else {
      wall.position.set((from + to) / 2, hallH / 2, at);
      tide.position.set((from + to) / 2, 0.05, at);
    }
    wall.receiveShadow = true;
    root.add(wall, tide);
    colliders.push(runCollider({ axis, at, from, to }));
  }

  // ---------- wallpaper ----------
  const PAPERS = {
    baby: { tex: createNurseryWallpaperTexture(), skirting: 0xeee6d8 },
    five: { tex: createCloudWallpaperTexture(), skirting: 0xe2dccd },
    // A third lighter than the generator's own plum, which read as black under
    // this room's two lamps.
    teen: { tex: createPlumPaintTexture({ base: [124, 78, 118] }), skirting: 0x2e2028 },
    adult: { tex: createDamaskWallpaperTexture(), skirting: 0x5a4636 }
  };
  const skirtingGeo = new THREE.BoxGeometry(1, 0.11, 0.018);
  for (const [key, def] of Object.entries(ROOMS)) {
    const { tex, skirting } = PAPERS[key];
    const skirtMat = mat(skirting, 0.55);
    for (const seg of roomWalls(def, rects[key])) {
      const len = seg.to - seg.from;
      const mid = (seg.from + seg.to) / 2;
      const rotY = facing(seg.axis, seg.n);
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(len, hallH),
        new THREE.MeshStandardMaterial({ map: tiled(tex, len / tex.userData.periodM, 1), roughness: 0.92 })
      );
      const skirt = new THREE.Mesh(skirtingGeo, skirtMat);
      skirt.scale.x = len;
      const d = PAPER_OFF + 0.009;   // the board's centre, so its back sits on the paper
      if (seg.axis === 'x') {
        sheet.position.set(seg.at + seg.n * PAPER_OFF, hallH / 2, mid);
        skirt.position.set(seg.at + seg.n * d, 0.055, mid);
      } else {
        sheet.position.set(mid, hallH / 2, seg.at + seg.n * PAPER_OFF);
        skirt.position.set(mid, 0.055, seg.at + seg.n * d);
      }
      sheet.rotation.y = skirt.rotation.y = rotY;
      sheet.receiveShadow = skirt.receiveShadow = true;
      root.add(sheet, skirt);
    }
  }

  /**
   * A decal on a room wall, at its own real-world size (tex.userData.sizeM).
   * (axis, at, n) name the wall the way roomWalls() does; `along` is the
   * position along it and `y` the height of the decal's centre.
   */
  function paperDecal(tex, { axis, at, n }, along, y, { tilt = 0, emissive = null } = {}) {
    const [w, h] = tex.userData.sizeM;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false, roughness: 0.9,
        ...(emissive ? { emissive, emissiveMap: tex, emissiveIntensity: 1.3 } : {})
      })
    );
    if (axis === 'x') m.position.set(at + n * DECAL_OFF, y, along);
    else m.position.set(along, y, at + n * DECAL_OFF);
    m.rotation.set(0, facing(axis, n), tilt);
    root.add(m);
    return m;
  }
  const layer = (key) => PAPERS[key].tex.image;

  // =========================================================================
  // 1. THE NURSERY (BL, x 3.2..9.6, z 48..54.4). Almost nothing wrong with it.
  // Doorways at x 6.4 on both short walls; the lane between them stays clear.
  // =========================================================================
  {
    const R = rects.baby;
    const wx = 9.6;   // the partition, behind the cot
    rug(6.4, 51.2, 2.4, 3.0, { base: '#e8d6d2', border: '#b9cfe0', trim: '#f6efe4', ring: '#e2b8c2', core: '#f1dca0' });
    const cot = crib(1);
    cot.position.set(wx - 0.42, 0, 51.2);
    cot.rotation.y = Math.PI / 2;
    root.add(cot);
    collideWith(cot, R);
    // A second cot, a hand's width out of step with the first.
    const echo = crib(1);
    echo.position.set(wx - 0.5, 0, 51.38);
    echo.rotation.y = Math.PI / 2 + 0.07;
    root.add(echo);
    collideWith(echo, R);
    mobile(wx - 0.42, 51.2, 0.7);
    // The name, printed twice and not quite on top of itself.
    const name = PICTURES.nurseryName();
    onWall(name, 2.3, 0.5, wx, 1.75, 51.2, -Math.PI / 2, 0, true);
    onWall(name, 2.3, 0.5, wx - 0.006, 1.79, 51.25, -Math.PI / 2, 0.015, true).material.opacity = 0.45;
    const bear = teddy({ wear: 0 });
    bear.position.set(wx - 0.42, 0.43, 50.85);
    bear.rotation.y = -Math.PI / 2 - 0.3;
    // Close enough to the wall that every rock puts its back through it.
    rockingChair(3.45, 50.2, Math.PI / 2 - 0.25, R);
    place(bedsideTableUrl, { rect: R, x: 3.48, z: 53.6, rotY: Math.PI / 2 });
    place(lampUrl, { rect: R, x: 3.48, z: 53.6, y: 0.55, rotY: Math.PI / 2, collide: false });
    // Three small blocks on the rug: the next room's, at the size they should be.
    [['A', 4.75, 52.3, 0.2], ['B', 4.92, 52.42, -0.3]].forEach(([ch, x, z, r], i) => {
      const b = block(ch, 0.11, i ? '#b9d4e8' : '#e9b8c4', '#ffffff');
      b.position.set(x, 0.061, z);
      b.rotation.y = r;
    });
    const c = block('C', 0.11, '#f1dca0', '#ffffff');
    c.position.set(4.82, 0.171, 52.36);
    c.rotation.y = 0.5;
    lamp(3.6, 0.95, 53.4, 0xffc9b0, 1.5, 6.5);
    lamp(8.4, 2.0, 51.2, 0xffe2c8, 0.6, 4.5);
  }

  // =========================================================================
  // 2. AGE FIVE (L, x -7.2..-3.2, z 8..17.6). The scale is wrong.
  // One doorway, east wall at z 12.8; the partition faces whoever comes in.
  // =========================================================================
  {
    const R = rects.five;
    const wx = -7.2;
    rug(-5.2, 12.8, 2.6, 3.2, { base: '#2a5fa8', border: '#d8302a', trim: '#f2d23a', ring: '#3b9c3b', core: '#f2d23a' });
    place(bedUrl, { rect: R, x: -5.5, z: 8.78, scale: 0.72 });
    // The same bed again, turned and half under the carpet, through the first.
    place(bedUrl, { rect: R, x: -5.35, z: 9.15, rotY: 0.22, scale: 0.72, sink: 0.38 });
    place(bedsideTableUrl, { rect: R, x: -4.45, z: 8.3 });
    place(lampUrl, { rect: R, x: -4.45, z: 8.3, y: 0.55, collide: false });
    lamp(-4.45, 1.0, 8.5, 0xffd2a0, 1.5, 6.5);
    lamp(-5.0, 2.0, 14.6, 0xffe6c0, 0.6, 4.5);

    // Drawings taped to the partition, at a child's eye height.
    onWall(PICTURES.family(), 0.68, 0.51, wx, 1.12, 11.0, Math.PI / 2, 0.06);
    onWall(PICTURES.house(), 0.68, 0.51, wx, 1.22, 12.8, Math.PI / 2, -0.04);
    onWall(PICTURES.corridor(), 0.68, 0.51, wx, 1.05, 14.6, Math.PI / 2, 0.09);
    // ...and straight onto the wallpaper, at the height she could reach.
    paperDecal(createCrayonScribbleTexture(0), { axis: 'x', at: -3.2, n: -1 }, 10.0, 0.6, { tilt: 0.04 });
    paperDecal(createCrayonScribbleTexture(1), { axis: 'z', at: 17.6, n: -1 }, -4.05, 0.55);
    paperDecal(createCrayonScribbleTexture(2), { axis: 'x', at: wx, n: 1 }, 15.85, 0.5, { tilt: -0.03 });

    // Toy blocks as big as the bed: one sunk into the floor, one twice over,
    // the copies inside each other, and the C up in the ceiling tiles.
    const giant = [
      ['A', -6.55, 0.18, 17.05, 0.12, 0.1, '#d8302a'],
      ['B', -5.5, 0.45, 16.95, -0.22, 0, '#2a5fa8'],
      ['B', -5.22, 0.52, 16.7, 0.31, 0.12, '#2a5fa8'],
      ['C', -5.1, hallH - 0.22, 11.4, 0.6, 0.35, '#3b9c3b']
    ];
    for (const [ch, x, y, z, r, tilt, bg] of giant) {
      const b = block(ch, 0.9, bg, '#f6efe4');
      b.position.set(x, y, z);
      b.rotation.set(tilt, r, tilt * 0.5);
      if (y < 1) collideWith(b, R);
    }

    // A tea party for three, one guest sinking through the carpet.
    const table = new THREE.Group();
    table.position.set(-5.4, 0, 14.6);
    table.add(solid(mat(0xf2eee6, 0.6), [[0.05, 0.4, 0.05, 0, 0.2, 0]]));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24), mat(0xf6d6de, 0.6));
    top.position.y = 0.41;
    top.castShadow = true;
    table.add(top);
    for (const [cx, cz] of [[0.1, 0.05], [-0.12, -0.04]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 12), mat(0xffffff, 0.3));
      cup.position.set(cx, 0.45, cz);
      table.add(cup);
    }
    root.add(table);
    colliders.push({ minX: -5.7, maxX: -5.1, minZ: 14.3, maxZ: 14.9 });
    const c1 = tinyChair(0xe9b8c4);
    c1.position.set(-5.4, 0, 14.05);
    // ...and the same pink chair twice more, standing inside itself.
    for (const [dx, dz, r] of [[0.05, -0.06, 0.18], [0.1, -0.1, 0.38]]) {
      const ghost = tinyChair(0xe9b8c4);
      ghost.position.set(-5.4 + dx, 0, 14.05 + dz);
      ghost.rotation.y = r;
    }
    const c2 = tinyChair(0xb9d4e8);
    c2.position.set(-4.85, -0.17, 14.6);   // half under the carpet
    c2.rotation.set(0.08, -Math.PI / 2, 0.05);
    const c3 = tinyChair(0xf1dca0);
    c3.position.set(-5.95, 0, 14.6);
    c3.rotation.y = Math.PI / 2;
    const bear = teddy({ wear: 0.25, eyes: 1 });
    bear.position.set(-5.92, 0.275, 14.6);
    bear.rotation.y = Math.PI / 2;
  }

  // =========================================================================
  // 3. AGE EIGHTEEN (TR, x 41.6..54.4, z -2.4..3.2). Things are in the walls.
  // Doorways at both ends, on z 0; the lane runs straight through.
  // =========================================================================
  {
    const R = rects.teen;
    const wz = -2.4;      // the partition, north
    const southZ = 3.2;
    rug(47.6, 0.4, 2.8, 2.0, { base: '#3a2a4a', border: '#1e5a5a', trim: '#d8c8b0', ring: '#6a3a6a', core: '#2e7a7a' });
    // Bed along the south wall, headboard to the west.
    // Tipped, the foot end sinking into the floor.
    place(bedUrl, { rect: R, x: 42.62, z: 2.42, rotY: Math.PI / 2, rot: [-0.11, 0, 0.03], sink: 0.28 });
    // Desk on the partition, and its chair most of the way through it.
    const d = desk(1.3, 0.6, 0.75, 0x4a3a30);
    d.position.set(49.5, 0, wz + 0.32);
    collideWith(d, R);
    // Three of the same monitor, each partly inside the last.
    place(crtUrl, { rect: R, x: 49.35, z: wz + 0.3, y: 0.75, floor: false, collide: false });
    place(crtUrl, { rect: R, x: 49.52, z: wz + 0.34, y: 0.79, rotY: 0.28, floor: false, collide: false });
    place(crtUrl, { rect: R, x: 49.45, z: wz + 0.28, y: 1.02, rotY: -0.2, rot: [0, 0, 0.14], floor: false, collide: false });
    // The same desk again, standing on the ceiling.
    const dUp = desk(1.3, 0.6, 0.75, 0x4a3a30);
    dUp.position.set(49.7, hallH, wz + 0.32);
    dUp.rotation.set(Math.PI, 0.12, 0);
    // The chair, side-on so the wall visibly cuts it, then coming back out of
    // it in two more copies, each through the one before.
    [[51.1, 0.02, 0.15], [51.28, 0.22, 0.42], [51.46, 0.44, 0.7]].forEach(([x, dz, r]) => {
      place(chairUrl, { rect: R, x, z: wz + dz, rotY: Math.PI / 2 + r, rot: [Math.PI / 2, 0, 0] });
    });
    // The desk lamp, upside down on the ceiling, and still on.
    place(lampUrl, { rect: R, x: 48.6, z: wz + 0.45, y: hallH, rot: [Math.PI, 0, 0], floor: false, collide: false });
    lamp(48.6, hallH - 0.45, wz + 0.5, 0xffd8a8, 1.4, 6.5);
    lamp(45.2, 1.6, 1.2, 0xffe0c0, 0.5, 4.5);
    lamp(52.8, 1.6, 0.6, 0xffe0c0, 0.45, 4.5);
    // Pinboard and a poster on the south wall, a sign on the partition.
    place(pinboardUrl, { rect: R, x: 47.2, z: southZ - 0.035, y: 1.45, rotY: Math.PI, floor: false, collide: false });
    place(pinboardUrl, { rect: R, x: 47.45, z: southZ - 0.03, y: 1.6, rotY: Math.PI, rot: [0, 0, 0.26], floor: false, collide: false });
    [['prom', 'MAY'], ['me + jess', 'AUG'], ['graduation!!', 'JUNE']].forEach(([caption, date], i) => {
      onWall(createPolaroidTexture({ caption, date }), 0.14, 0.165, 46.95 + i * 0.24, 1.42 + (i % 2) * 0.12, southZ - 0.06, Math.PI, (i - 1) * 0.12);
    });
    onWall(PICTURES.bandPoster(), 0.6, 0.84, 51.4, 1.45, southZ, Math.PI);
    onWall(PICTURES.keepOut(), 0.55, 0.32, 44.6, 1.5, wz, 0, -0.03);
    const north = { axis: 'z', at: wz, n: 1 };
    const south = { axis: 'z', at: southZ, n: -1 };
    paperDecal(createPosterGhostTexture(0), north, 46.4, 1.5, { tilt: 0.02 });
    paperDecal(createPosterGhostTexture(1), north, 52.7, 1.45);
    paperDecal(createFairyLightsTexture(), south, 48.2, hallH - 0.26, { emissive: 0xffe6b0 });
    // Under the paint, the clouds -- and under those, the nursery.
    paperDecal(createTearRevealTexture([layer('five'), layer('baby')], { seed: 3 }), north, 43.3, 1.05);
    // The bear went in the bin.
    place(wastebasketUrl, { rect: R, x: 52.7, z: wz + 0.3 });
    const bear = teddy({ wear: 0.5, eyes: 1 });
    bear.scale.setScalar(0.72);
    bear.position.set(52.7, 0.14, wz + 0.3);
    bear.rotation.set(0.45, 0.4, 0.2);
    for (const [x, z] of [[52.15, -1.55], [52.95, -1.45], [51.85, -1.9]]) {
      place(paperBallUrl, { rect: R, x, z, collide: false });
    }
    // The nursery's mobile, in a corner it has no business in.
    mobile(54.0, wz + 0.4, 0.7);
  }

  // =========================================================================
  // 4. AGE THIRTY (R, x 60.8..64.8, z 33.6..43.2). Only on the second
  // crossing. One doorway, west wall at z 38.4.
  // =========================================================================
  {
    const R = rects.adult;
    const wx = 64.8;
    place(rugUrl, { rect: R, x: 62.6, z: 38.4, rotY: Math.PI / 2, scale: 0.72, collide: false });
    // The dresser has gone over on its side and into the north wall.
    place(dresserUrl, { rect: R, x: 62.3, z: 33.62, rot: [0, 0, Math.PI / 2] });
    // And again, upside down, half into the ceiling over the middle of the room.
    place(dresserUrl, { rect: R, x: 62.1, z: 39.6, y: hallH + 0.4, rotY: 0.35, rot: [Math.PI, 0, 0.12], floor: false, collide: false });
    // A chair hanging by its legs from the ceiling tiles.
    place(chairUrl, { rect: R, x: 61.5, z: 37.4, y: hallH + 0.18, rotY: 2.2, rot: [-Math.PI / 2, 0, 0.1], floor: false, collide: false });
    deadPlant(61.25, 34.15);
    // The crib again, adult-sized, empty but for the bear.
    const cot = crib(1.45, 0xd8d2c6);
    cot.position.set(62.35, 0, 35.75);
    root.add(cot);
    collideWith(cot, R);
    // Two of it, crossed through each other.
    const cot2 = crib(1.45, 0xd8d2c6);
    cot2.position.set(62.25, -0.12, 35.95);
    cot2.rotation.set(0, 0.42, 0.04);
    root.add(cot2);
    collideWith(cot2, R);
    const bear = teddy({ wear: 0.85, eyes: 1, ear: false, stuffing: true });
    bear.scale.setScalar(1.05);
    bear.position.set(62.35, 0.62, 35.75);
    bear.rotation.set(0, -Math.PI / 2 + 0.2, 0.12);
    // A desk swallowed by the partition, straight ahead of the doorway, and its
    // chair going the same way.
    const d = desk(1.3, 0.6, 0.75, 0x3a2c22);
    d.position.set(wx - 0.05, 0, 37.6);
    d.rotation.y = -Math.PI / 2;
    collideWith(d, R);
    place(clockUrl, { rect: R, x: wx - 0.2, z: 37.2, y: 0.75, rotY: -Math.PI / 2, collide: false });
    photoFrame(createFamilyPhotoTexture({ figures: 3 }), wx - 0.2, 0.75, 37.9, -Math.PI / 2 - 0.25);
    place(lockboxUrl, { rect: R, x: wx - 0.15, z: 38.1, y: 0.75, rotY: -Math.PI / 2 + 0.2, collide: false });
    place(chairUrl, { rect: R, x: wx - 0.1, z: 38.95, rotY: -Math.PI / 2 - 0.3, rot: [Math.PI / 2, 0, 0.25] });
    place(chairUrl, { rect: R, x: wx - 0.22, z: 39.2, rotY: -Math.PI / 2 - 0.62, rot: [Math.PI / 2, 0, 0.25], sink: 0.12 });
    // The bed, stood on its end against the partition.
    place(bedUrl, { rect: R, x: wx - 0.85, z: 42.25, rotY: Math.PI / 2, rot: [-Math.PI / 2, 0, 0] });
    // Her vanity on the south wall, its stool half into the floor.
    const vz = 43.2 - 0.3;
    place(vanityBaseUrl, { rect: R, x: 61.55, z: vz, rotY: Math.PI });
    // Three of the mirror, fanned through one another.
    [0, 0.32, -0.3].forEach((r) => {
      place(vanityMirrorUrl, { rect: R, x: 61.55, z: vz + 0.08, y: 0.81, rotY: Math.PI + r, floor: false, collide: false });
    });
    place(vanityTrayUrl, { rect: R, x: 61.15, z: vz - 0.08, y: 0.81, rotY: Math.PI, floor: false, collide: false });
    place(vanityPerfumeUrl, { rect: R, x: 61.95, z: vz - 0.1, y: 0.81, floor: false, collide: false });
    place(lampUrl, { rect: R, x: 62.05, z: vz + 0.05, y: 0.81, floor: false, collide: false });
    place(vanityStoolUrl, { rect: R, x: 61.55, z: vz - 0.7, rotY: Math.PI + 0.4, sink: 0.24 });
    lamp(62.0, 1.3, 42.6, 0xffc89a, 1.4, 6.5);
    // Every room she had is still under this one, and at the bottom of every
    // tear, the yellow.
    const strata = [layer('teen'), layer('five'), layer('baby'), backroomsWallpaper.image];
    const west = { axis: 'x', at: 60.8, n: 1 };
    paperDecal(createTearRevealTexture(strata, { seed: 7 }), west, 35.0, 1.75, { tilt: 0.2 });
    paperDecal(createTearRevealTexture(strata, { seed: 11 }), { axis: 'z', at: 33.6, n: 1 }, 61.0, 1.85);
    paperDecal(createTearRevealTexture(strata.slice(1), { seed: 19 }), { axis: 'x', at: wx, n: -1 }, 39.9, 1.3, { tilt: -0.5 });
    paperDecal(createPeelingSeamTexture(layer('adult')), west, 41.4, hallH / 2);
    lamp(62.6, 2.0, 37.0, 0xd8dcff, 0.35, 5);
  }

  return {
    rects,
    /** The maze legs these rooms are, so the level can keep its own dressing out. */
    rooms: new Set(Object.values(ROOMS).map((d) => d.room)),
    update(dt) {
      t += dt;
      for (const s of spinners) s.obj.rotation.y += s.speed * dt;
      for (const r of rockers) r.obj.rotation.x = Math.sin(t * r.rate + r.phase) * r.amp;
    }
  };
}
