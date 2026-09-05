import * as THREE from 'three';
import {
  createBackroomsWallpaperTexture,
  createBackroomsWallpaperNormalTexture,
  createDampCarpetTexture,
  createDampCarpetNormalTexture,
  createCeilingTileTexture,
  createCeilingTileNormalTexture,
  createBloodArrowMaps,
  createPeelingWallpaperTexture,
  createCobwebTexture,
  createClawMarksTexture,
  createClawMarksNormalTexture,
  createFurnitureWoodTexture,
  createFurnitureWoodNormalTexture,
  tiled
} from '../world/textures.js';
import { loadModel, applyTextureByMaterialName } from '../world/modelLoader.js';
import doorModelUrl from '../assets/models/door.glb?url';

/**
 * The interstitial -- the corridor between levels.
 *
 * Not a numbered level. It is the one space every level-to-level crossing
 * passes through, armed with a destination by setRoute() immediately before
 * main.js makes it visible. One instance, reused: the corridor is deliberately
 * identical every time you walk it, and building a second copy per route would
 * leave N sets of geometry, lights and textures resident forever (every level
 * in this game is built at boot and never destroyed) for a space only one of
 * which can ever be on screen.
 *
 * Three ideas carry the design:
 *
 *  1. THE YELLOW LIVES IN THE ALBEDO, NOT THE LIGHTS. The wallpaper is
 *     genuinely bright (198,178,96), so a lit pool reads as unmistakable
 *     backrooms yellow and the same surface in an unlit gap falls to a murky
 *     olive-brown. One material, two moods. This is why the ambient here is
 *     0.14 against the 0.37-0.43 every other level uses -- see the note on it.
 *
 *  2. INFINITY IS FAKED FOUR DIFFERENT WAYS, one per branch, so it never reads
 *     as the same trick twice: too dark to see the end (B1), an opening at the
 *     end that isn't one (B2), it bends out of sight (B3), and it's marked as
 *     a mistake (B4). Darkness, fog and geometry each hide a different branch.
 *
 *  3. THE ARROWS ARE A TRAIL, AND THE TRAIL PANICS. They get lower, bigger,
 *     more frequent and more crooked toward the door, and the last three are
 *     still wet.
 *
 * Hierarchy note: everything is a direct child of `group`, with no intermediate
 * offset groups. worldRoot sits at the origin and levels never set
 * group.position, so level space IS world space and every collider number is
 * literally the number that placed the mesh. hallwayBasementLevel uses an
 * offset `hallway`/`lab` group and then has to write `LAB_Z + x` by hand in
 * every collider; with 26 colliders here, that is not a mistake worth
 * repeating.
 */

const HALL_W = 3.2;    // 2.2m of walkable width after bodyRadius 0.35 both sides
const HALL_LEN = 22.0; // ~11s at the player's 2.015 m/s -- an interstitial, not a level
const HALL_H = 2.35;   // 3.2:2.35 is WIDER than tall. The bedroom is 2.29:1 and the
                       // Level 2 hallway is 0.89:1 (taller than wide, the house-corridor
                       // proportion). Squat is the strongest proportional tell of a
                       // commercial drop-ceiling corridor.
                       //
                       // Dropped from 2.45 when the eye height came down 1.70 -> 1.60:
                       // the corridor was designed around 0.75m of headroom, and keeping
                       // the ceiling put would have made it feel taller, which is the
                       // opposite of the intent.

const T = 0.30;        // collider slab thickness, straddling the wall plane

// Bounding box of everything, including the branches -- the floor and ceiling
// are single planes across all of it, so the branches get both for free. Two
// oversized quads is cheaper than stitching a plane per branch.
// Grown west and east for the new branches. The floor and ceiling are single
// quads sized from these, and beyond them there is no floor at all -- and since
// nothing sets scene.background, FogExp2 does not fog it, so an overrun reads as
// a hard-edged black pit rather than a fogged fade.
//
// BOX_MIN_X moved by exactly 3.6m = 6 x 0.6m ON PURPOSE. The ceiling texture is
// a 4x4 grid of 0.6m tiles anchored to BOX_MIN_X, so any shift that is not a
// whole number of tiles slides the whole T-bar grid and desyncs it from the
// hand-placed tileHole. BOX_MAX_X has no such constraint -- growing east is free.
const BOX_MIN_X = -11.5;
const BOX_MAX_X = 8.0;
const BOX_MIN_Z = -0.2;
const BOX_MAX_Z = 22.2;

/**
 * EVERY wall in the level. Geometry and colliders are both generated from this
 * one table, so they cannot drift -- unlike bedroomLevel and
 * hallwayBasementLevel, where each plane and its AABB are two independent
 * literals that happen to agree. With four branch mouths and an L-bend there
 * are 52 of these, and a single mistyped digit is a hole in the world.
 *
 * Every run terminates at the OUTER FACE of the perpendicular slab it meets
 * (perpendicular.at +/- T/2), so corners always overlap and can never leave a
 * seam. A seam here does not show black void -- the floor and ceiling span the
 * whole bounding box, so it shows a lit, carpeted room the player can walk into
 * and then straight off the edge of the world.
 *
 *   axis 'x' -> a wall standing at x = at, running from z = from to z = to
 *   axis 'z' -> a wall standing at z = at, running from x = from to x = to
 *
 * Runs deliberately OVERLAP by ~0.15 at every corner: the collision resolver
 * (PointerLockPlayer.#resolveCollision) runs each box independently, so overlap
 * costs nothing and a 1cm seam would be a hole.
 */
const WALL_RUNS = [
  // --- main corridor, left wall (x = -1.6): B1, B6, B2 ---
  { axis: 'x', at: -1.6, from: -0.10, to: 5.20 },
  { axis: 'x', at: -1.6, from: 7.40, to: 8.40 },
  { axis: 'x', at: -1.6, from: 10.60, to: 12.40 },
  { axis: 'x', at: -1.6, from: 14.60, to: 22.10 },
  // --- main corridor, right wall (x = +1.6): B5, B3, B7, B4 ---
  { axis: 'x', at: 1.6, from: -0.10, to: 2.40 },
  { axis: 'x', at: 1.6, from: 4.60, to: 12.40 },
  { axis: 'x', at: 1.6, from: 14.60, to: 15.40 },
  { axis: 'x', at: 1.6, from: 17.40, to: 18.40 },
  { axis: 'x', at: 1.6, from: 20.60, to: 22.10 },
  // --- the two ends. NEVER break these: the exit door is decorative and the
  //     sealed entry is a panel, so these walls are what actually contain the
  //     player at both ends of the corridor. ---
  { axis: 'z', at: 0.0, from: -1.75, to: 1.75 },
  { axis: 'z', at: 22.0, from: -1.75, to: 1.75 },
  // --- B1: 6m deep, pitch dark. Hidden by darkness, not fog. Its south wall is
  //     split to open B8, a branch hanging off a branch. ---
  { axis: 'z', at: 5.20, from: -7.75, to: -4.60 },
  { axis: 'z', at: 5.20, from: -2.80, to: -1.45 },
  { axis: 'z', at: 7.40, from: -7.75, to: -1.45 },
  { axis: 'x', at: -7.60, from: 5.05, to: 7.55 },
  // --- B8 "the nested stub": hangs off B1's own south wall, runs south. ---
  { axis: 'x', at: -4.60, from: 2.45, to: 5.35 },
  { axis: 'x', at: -2.80, from: 2.45, to: 5.35 },
  { axis: 'z', at: 2.60, from: -4.75, to: -2.65 },
  // --- B2: 4.2m, with a false continuation onto a 0.9m alcove. ---
  { axis: 'z', at: 12.40, from: -5.95, to: -1.45 },
  { axis: 'z', at: 14.60, from: -5.95, to: -1.45 },
  { axis: 'x', at: -5.80, from: 12.25, to: 12.65 },
  { axis: 'x', at: -5.80, from: 14.35, to: 14.75 },
  { axis: 'z', at: 12.65, from: -6.85, to: -5.65 },
  { axis: 'z', at: 14.35, from: -6.85, to: -5.65 },
  { axis: 'x', at: -6.70, from: 12.50, to: 14.50 },
  // --- B6 "the snake": west, then SOUTH, then EAST. Three turns, ~39m2, and it
  //     ends pointing back at a corridor you can no longer see. ---
  { axis: 'z', at: 8.40, from: -8.30, to: -1.45 },
  { axis: 'z', at: 10.60, from: -10.65, to: -1.45 },
  { axis: 'x', at: -10.50, from: 1.85, to: 10.75 },
  { axis: 'x', at: -8.30, from: 4.20, to: 8.55 },
  { axis: 'z', at: 2.00, from: -10.65, to: -5.85 },
  { axis: 'z', at: 4.20, from: -8.45, to: -5.85 },
  { axis: 'x', at: -6.00, from: 1.85, to: 4.35 },
  // --- B3: a 3m stub that BENDS, running 3.2m back toward the entry. ---
  { axis: 'z', at: 12.40, from: 1.45, to: 2.40 },
  { axis: 'z', at: 14.60, from: 1.45, to: 4.75 },
  { axis: 'x', at: 4.60, from: 9.05, to: 14.75 },
  { axis: 'x', at: 2.40, from: 9.05, to: 12.55 },
  { axis: 'z', at: 9.20, from: 2.25, to: 4.75 },
  // --- B5 "the fork": a stem east into a north-south cross bar whose BOTH ends
  //     dead-end. The first branch that makes you choose, and punishes either. ---
  { axis: 'z', at: 2.40, from: 1.45, to: 3.95 },
  { axis: 'z', at: 4.60, from: 1.45, to: 3.95 },
  { axis: 'x', at: 3.80, from: 0.25, to: 2.55 },
  { axis: 'x', at: 3.80, from: 4.45, to: 7.75 },
  { axis: 'x', at: 6.00, from: 0.25, to: 7.75 },
  { axis: 'z', at: 0.40, from: 3.65, to: 6.15 },
  { axis: 'z', at: 7.60, from: 3.65, to: 6.15 },
  // --- B7 "the long hook": east, then north, running parallel to B4 with a
  //     sealed void between them so the two dead ends never connect. ---
  { axis: 'z', at: 15.40, from: 1.45, to: 7.65 },
  { axis: 'z', at: 17.40, from: 1.45, to: 5.30 },
  { axis: 'x', at: 7.50, from: 15.25, to: 20.75 },
  { axis: 'x', at: 5.30, from: 17.25, to: 20.75 },
  { axis: 'z', at: 20.60, from: 5.15, to: 7.65 },
  // --- B4: shallow and dark, with a floor arrow inside pointing back out. ---
  { axis: 'z', at: 18.40, from: 1.45, to: 4.35 },
  { axis: 'z', at: 20.60, from: 1.45, to: 4.35 },
  { axis: 'x', at: 4.20, from: 18.25, to: 20.75 }
];

export function createBackroomsLevel({ showCaption = () => {}, onExit = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Level0_Backrooms';
  const interactables = [];
  const colliders = [];

  // ---------- materials ----------
  const wallpaperTex = createBackroomsWallpaperTexture();
  const wallpaperNormal = createBackroomsWallpaperNormalTexture();

  // One material per wall length, cached: tiled() clones the Texture but shares
  // the GPU-side Source, so thirteen differently-scaled wall runs cost thirteen
  // small objects and exactly one upload.
  const wallMatCache = new Map();
  function wallMatFor(len) {
    const key = len.toFixed(3);
    if (!wallMatCache.has(key)) {
      wallMatCache.set(key, new THREE.MeshStandardMaterial({
        // 512px == 2.12m horizontally, so the roll seams land every 0.53m.
        map: tiled(wallpaperTex, len / 2.12, 1),
        // repeatY is EXACTLY 1 so the canvas's stained top and bottom bands
        // land on the real ceiling and skirting lines rather than floating at
        // some arbitrary fraction of wall height. The 1.16x anisotropy that
        // introduces (2.12m across vs 2.45m up) is invisible on noise.
        normalMap: tiled(wallpaperNormal, len / 2.12, 1),
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: 0.93,
        // Every other level gets away with single-sided wall planes because it
        // has no branch mouths. Here a plane whose rotation.y has the wrong
        // sign means you see straight through the world at a corner, and
        // DoubleSide deletes that entire failure mode for nothing at this poly
        // count.
        side: THREE.DoubleSide
      }));
    }
    return wallMatCache.get(key);
  }

  // ---------- floor / ceiling ----------
  const boxW = BOX_MAX_X - BOX_MIN_X;
  const boxD = BOX_MAX_Z - BOX_MIN_Z;
  const boxCX = (BOX_MIN_X + BOX_MAX_X) / 2;
  const boxCZ = (BOX_MIN_Z + BOX_MAX_Z) / 2;

  const carpetTex = createDampCarpetTexture();
  const carpetNormal = createDampCarpetNormalTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(boxW, boxD),
    new THREE.MeshStandardMaterial({
      // 512px == 2.6m. Was 1.6m, which tiled this single floor plane 112 times
      // and made every feature in the canvas read as a repeating pattern rather
      // than as damage. 5mm per texel is still plenty for carpet pile.
      map: tiled(carpetTex, boxW / 2.6, boxD / 2.6),
      normalMap: tiled(carpetNormal, boxW / 2.6, boxD / 2.6),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.97
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(boxCX, 0, boxCZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceilTex = createCeilingTileTexture();
  const ceilNormal = createCeilingTileNormalTexture();
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(boxW, boxD),
    new THREE.MeshStandardMaterial({
      map: tiled(ceilTex, boxW / 2.4, boxD / 2.4),        // 512px == 2.4m -> 0.6m tiles
      normalMap: tiled(ceilNormal, boxW / 2.4, boxD / 2.4),
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.9
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(boxCX, HALL_H, boxCZ);
  group.add(ceiling);

  // ---------- walls + colliders, both from WALL_RUNS ----------
  // A damp tide-line at the base of every wall, generated here for free.
  // Deliberately instead of trim.js's addBaseboard: Level 0 has no skirting
  // (wallpaper straight to carpet is part of why it looks wrong), addBaseboard
  // can only draw a closed rectangle and would run straight across the branch
  // mouths, and a low-roughness wet strip catches a specular sheen off the
  // fluorescents that no colour texture can fake.
  const tideMat = new THREE.MeshStandardMaterial({ color: 0x453a24, roughness: 0.5 });

  WALL_RUNS.forEach(({ axis, at, from, to }) => {
    const len = to - from;
    const mid = (from + to) / 2;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, HALL_H), wallMatFor(len));
    const tide = new THREE.Mesh(new THREE.BoxGeometry(len, 0.10, 0.02), tideMat);

    if (axis === 'x') {
      wall.position.set(at, HALL_H / 2, mid);
      wall.rotation.y = Math.PI / 2;
      tide.position.set(at, 0.05, mid);
      tide.rotation.y = Math.PI / 2;
      colliders.push({ minX: at - T / 2, maxX: at + T / 2, minZ: from, maxZ: to });
    } else {
      wall.position.set(mid, HALL_H / 2, at);
      tide.position.set(mid, 0.05, at);
      colliders.push({ minX: from, maxX: to, minZ: at - T / 2, maxZ: at + T / 2 });
    }
    wall.receiveShadow = true;
    group.add(wall);
    group.add(tide);
  });

  // ---------- lighting ----------
  // 0.14, not the 0.37-0.43 every other level uses. This level's wallpaper
  // albedo (198,178,96) is roughly 2.7x brighter than the Level 2 hallway's
  // plaster (#4a453d), so identical ambient irradiance renders nearly three
  // times brighter here. The instinct on "the yellow level" is to crank this;
  // that flattens the dark gaps into flat mustard and kills the entire point.
  // There is no tone mapping in play (see main.js), so what is set is what is
  // rendered.
  group.add(new THREE.AmbientLight(0x5a4c2c, 0.14));

  const lamps = [];

  /**
   * One ceiling troffer. Mounted with its long axis ACROSS the corridor, which
   * is how real fixtures hang and which turns each pool into a bright BAND on
   * the carpet -- the classic backrooms floor pattern.
   */
  function addFixture(x, z, { mode, colour, base, dist, decay, emissive, emissiveIntensity }) {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.05, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.55 })
    );
    housing.position.set(x, HALL_H - 0.025, z);
    group.add(housing);

    // Each fixture gets its OWN material instance. hallwayBasementLevel shares
    // one tubeMat across all three of its tubes, which is fine there because
    // they flicker identically -- here a shared material would make the dead
    // fixtures strobe in sync with the living ones.
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xdfdac6,
      emissive,
      emissiveIntensity
    });
    [-0.14, 0.14].forEach((dz) => {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.035, 0.09), tubeMat);
      tube.position.set(x, HALL_H - 0.06, z + dz);
      group.add(tube);
    });

    if (!mode) return; // a dead fixture: dark tube, no light at all

    const light = new THREE.PointLight(colour, base, dist, decay);
    light.position.set(x, 2.10, z);
    group.add(light);

    lamps.push({
      light,
      mat: tubeMat,
      base,
      emissiveBase: emissiveIntensity,
      mode,
      seed: lamps.length * 2.3,
      lit: false,
      timer: 0
    });
  }

  // Three living pools at z 5.5 / 13.5 / 21.0, with ~8m dark gaps between them
  // and a physically-present dead fixture sitting in the middle of each gap.
  // Traversable with the flashlight (range 9, intensity 2.4), and the pools
  // read as glowing smears through the fog from ~14m.
  addFixture(0, 1.5, { mode: 'dying', colour: 0xffd07a, base: 1.5, dist: 8, decay: 1.7, emissive: 0xffdca0, emissiveIntensity: 1.9 });
  addFixture(0, 5.5, { mode: 'steady', colour: 0xffd98a, base: 1.7, dist: 10, decay: 1.55, emissive: 0xffe9a0, emissiveIntensity: 1.7 });
  addFixture(0, 9.5, { mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  addFixture(0, 13.5, { mode: 'flicker', colour: 0xffd07a, base: 1.6, dist: 10, decay: 1.6, emissive: 0xffe9a0, emissiveIntensity: 1.7 });
  addFixture(0, 17.5, { mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  // The only steady, warm, bright light in the level sits over the exit. The
  // destination is the one stable thing here -- no EXIT sign needed, the light
  // does the signage.
  addFixture(0, 21.0, { mode: 'steady', colour: 0xffe0a4, base: 1.95, dist: 12, decay: 1.5, emissive: 0xfff0c0, emissiveIntensity: 1.9 });
  // The tease at the back of B2's false continuation.
  addFixture(-6.25, 13.5, { mode: 'dying', colour: 0xffcf78, base: 0.8, dist: 5, decay: 1.8, emissive: 0xffcf78, emissiveIntensity: 1.2 });

  // ---------- blood arrows ----------
  // Three dry + three wet variants per direction, built once and cycled.
  // 17 arrows x a 256^2 normal-map pixel loop would be ~60ms of boot and 17 GPU
  // uploads for no visual gain -- and identical arrows would be wrong anyway.
  /**
   * Is there actually a wall behind a decal at (x, z) facing rotY?
   *
   * The corridor's side walls are deliberately broken wherever a branch opens
   * off, so a decal placed at a z inside one of those gaps hangs in mid-air over
   * the opening. Three shipped that way and were only found by walking into
   * them; with 52 wall runs and four more branches, eyeballing it does not
   * scale. WALL_RUNS is already the single source of truth for where walls are,
   * so ask it.
   *
   * A warning rather than a throw: a floating decal is a cosmetic bug and should
   * not stop the level building, but it should never again be something you find
   * by accident.
   */
  function wallBehind(rotY, x, z) {
    const facingX = Math.abs(Math.sin(rotY)) > 0.9;   // wall stands at constant x
    const EPS = 0.02;
    return WALL_RUNS.some((r) => (facingX
      ? r.axis === 'x' && Math.abs(r.at - x) < EPS && z >= r.from - EPS && z <= r.to + EPS
      : r.axis === 'z' && Math.abs(r.at - z) < EPS && x >= r.from - EPS && x <= r.to + EPS));
  }

  function warnIfFloating(kind, x, y, z, rotY) {
    if (wallBehind(rotY, x, z)) return;
    console.warn('backrooms: ' + kind + ' at (' + x + ', ' + y + ', ' + z +
      ') has no wall behind it -- it is floating in a branch mouth.');
  }

  const ARROW_VARIANTS = { dry: { 1: [], '-1': [] }, wet: { 1: [], '-1': [] } };
  [1, -1].forEach((dir) => {
    for (let i = 0; i < 3; i++) {
      ARROW_VARIANTS.dry[String(dir)].push(createBloodArrowMaps({ dir, wet: false }));
      ARROW_VARIANTS.wet[String(dir)].push(createBloodArrowMaps({ dir, wet: true }));
    }
  });
  let arrowPick = 0;
  function pickVariant(dir, wet) {
    const pool = ARROW_VARIANTS[wet ? 'wet' : 'dry'][String(dir)];
    return pool[arrowPick++ % pool.length];
  }

  const arrows = [];

  /**
   * A blood arrow on a wall. Mirrors addClawMarks (bedroomLevel.js:1222).
   *
   * `pointZ` is the WORLD direction it should indicate: +1 toward the exit, -1
   * back toward the sealed entry. It cannot be a scale.x = -1 flip -- a wall
   * plane's own local +X lands on world -Z at rotY = +PI/2 (the left wall) and
   * on world +Z at rotY = -PI/2 (the right wall), so one side needs the TEXTURE
   * mirrored, and a negative scale would invert the plane's normal and black
   * out its lighting.
   */
  function addBloodArrow(x, y, z, rotY, scale = 1, { point = [0, 1], wet = false, roll = 0 } = {}) {
    // The plane's local +X lands on world (cos rotY, 0, -sin rotY). Mirror the
    // TEXTURE when that is the wrong way round, rather than flipping the mesh:
    // a negative scale would invert the plane's normal and black out its
    // lighting.
    //
    // Expressed as a full (x, z) intent rather than a z-only one, because a
    // wall at rotY = 0 faces +Z and its local +X is world +X -- it can only
    // ever point along X, and a z-only intent degenerates to zero there.
    warnIfFloating('blood arrow', x, y, z, rotY);
    const localX = [Math.cos(rotY), -Math.sin(rotY)];
    const dot = point[0] * localX[0] + point[1] * localX[1];
    const dir = dot >= 0 ? 1 : -1;
    const maps = pickVariant(dir, wet);
    const a = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62 * scale, 0.62 * scale),
      new THREE.MeshStandardMaterial({
        map: maps.map,
        normalMap: maps.normalMap,
        normalScale: new THREE.Vector2(1.3, 1.3),
        transparent: true,
        // The last arrows before the door are still WET: 0.34 catches a
        // specular sheen off the flashlight where 0.92 stays matte. Twenty
        // metres of dry brown and then suddenly glistening is the level's best
        // single beat, and it costs one property.
        roughness: wet ? 0.34 : 0.92
      })
    );
    // 2.5cm proud along the wall's own normal -- addPeelingWallpaper's idiom
    // (bedroomLevel.js:1273). No polygonOffset or renderOrder anywhere in this
    // project; decal separation is purely positional.
    a.position.set(x + Math.sin(rotY) * 0.025, y, z + Math.cos(rotY) * 0.025);
    a.rotation.set(0, rotY, roll);
    // Intent, kept for debugging: the rendered direction is the plane's local
    // +X times `dir` (dir === -1 means the texture itself is mirrored), and it
    // should always come out agreeing in sign with pointZ.
    a.userData.arrow = { point, dir, kind: 'wall' };
    group.add(a);
    arrows.push(a);
  }

  /**
   * A blood arrow on the carpet. `heading` follows the same convention as rotY
   * (0 = +Z, PI/2 = +X).
   *
   * With rotation.x = -PI/2 and Three's default XYZ Euler order, the plane's
   * local +X ends up at world (cos rz, 0, -sin rz), so rz = heading - PI/2.
   */
  function addFloorArrow(x, z, heading, scale = 1, { wet = false } = {}) {
    const maps = pickVariant(1, wet);
    const a = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62 * scale, 0.62 * scale),
      new THREE.MeshStandardMaterial({
        map: maps.map,
        normalMap: maps.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        transparent: true,
        roughness: wet ? 0.30 : 0.95
      })
    );
    a.position.set(x, 0.018, z);
    a.rotation.set(-Math.PI / 2, 0, heading - Math.PI / 2);
    a.userData.arrow = { heading, dir: 1, kind: 'floor' };
    group.add(a);
    arrows.push(a);
  }

  const L = -1.6;  // left wall x
  const R = 1.6;   // right wall x
  const LROT = Math.PI / 2;
  const RROT = -Math.PI / 2;

  // Zone 1 -- sparse, neat, eye height. Whoever drew these was still upright.
  addBloodArrow(L, 1.50, 1.0, LROT, 0.50);
  // 5.2, not 4.4: opening B5's mouth (right wall now absent 2.40-4.60) left
  // this one hanging over the gap. Caught by warnIfFloating, not by eye.
  addBloodArrow(R, 1.52, 5.2, RROT, 0.50);
  // 7.9, not 6.8: 6.8 sat inside B1's mouth (the left wall is absent from
  // 5.20 to 7.40), so this arrow used to hang in mid-air over the opening.
  addBloodArrow(L, 1.45, 7.9, LROT, 0.55, { roll: 0.04 });

  // Zone 2 -- the cross-junction. The beat: they went the wrong way, came back.
  addBloodArrow(R, 1.42, 9.2, RROT, 0.60);
  addBloodArrow(L, 1.35, 11.6, LROT, 0.60, { roll: 0.07 });
  addFloorArrow(-2.5, 13.5, -Math.PI / 2, 0.7);              // into B2 -- the mistake
  addFloorArrow(-4.1, 13.5, Math.PI / 2, 0.8);               // 1.6m deeper, pointing back out
  // On B2's own side wall (rotY 0, so it faces +Z): points back out along
  // +X toward the branch mouth, not down the corridor.
  addBloodArrow(-4.1, 1.15, 12.4, 0, 0.6, { point: [1, 0], roll: 0.2 });
  addBloodArrow(L, 1.30, 14.9, LROT, 0.65);
  addBloodArrow(R, 1.25, 15.4, RROT, 0.65, { roll: -0.09 });

  // Zone 3 -- frantic. Lower, doubled up, crooked, then wet.
  addBloodArrow(L, 1.08, 16.8, LROT, 0.72, { roll: 0.14 });
  addBloodArrow(L, 1.58, 17.5, LROT, 0.48, { roll: -0.05 });
  // 17.8, not 19.0: 19.0 sat inside B4's mouth (right wall absent 18.40-20.60).
  addBloodArrow(R, 0.98, 17.8, RROT, 0.78, { roll: -0.19 });
  addBloodArrow(L, 1.30, 20.4, LROT, 0.72, { roll: 0.11, wet: true });
  addBloodArrow(R, 1.15, 21.2, RROT, 0.72, { roll: -0.13, wet: true });
  addFloorArrow(0.3, 18.4, 0, 0.9);
  addFloorArrow(2.9, 19.5, -Math.PI / 2, 0.7);               // inside B4: not this way
  addFloorArrow(0.0, 21.1, 0, 1.0, { wet: true });           // straight at the door

  // --- the new branches ---
  // Appended deliberately after the corridor trail: pickVariant cycles one
  // shared counter, so inserting these earlier would reshuffle which blood
  // variant every established arrow gets.
  //
  // Every one of these points BACK OUT. The trail in the corridor is someone
  // finding the door; these are the same person finding out a branch was wrong,
  // and they are the only reason a dead end reads as a mistake someone already
  // made rather than as level furniture.
  addBloodArrow(6.00, 1.30, 6.8, RROT, 0.60, { point: [0, -1], roll: 0.12 });   // B5 north prong
  addFloorArrow(4.9, 6.9, Math.PI, 0.7);                                        // B5 north prong
  addFloorArrow(4.9, 1.1, 0, 0.7);                                              // B5 south prong
  addBloodArrow(-10.50, 1.25, 5.5, LROT, 0.62, { point: [0, 1], roll: -0.15 }); // B6 leg B
  addFloorArrow(-6.6, 3.1, -Math.PI / 2, 0.7);                                  // B6 leg C
  addBloodArrow(5.30, 1.35, 19.5, LROT, 0.60, { point: [0, -1], roll: 0.10 });  // B7 leg B
  addFloorArrow(6.4, 19.8, Math.PI, 0.7);                                       // B7 leg B
  addBloodArrow(-2.80, 1.20, 3.4, RROT, 0.55, { point: [0, 1], roll: 0.18 });   // B8
  addFloorArrow(-3.7, 3.2, 0, 0.7);                                             // B8

  // ---------- the exit door ----------
  let opened = false;
  let route = null;
  let outFade = 1;
  // Handle on the pending exit, so setRoute()/reset() can cancel it.
  let exitTimer = null;

  // Deliberately lighter than createFurnitureWoodTexture's default (60,44,30),
  // which is tuned for the bedroom's warm bulb. This level's albedo is roughly
  // 3.5x brighter and its ambient is a third of everywhere else, so the default
  // tint rendered the door as a flat black rectangle with only the brass knob
  // catching any light -- the one object in the corridor the player has to be
  // able to see.
  const furnitureWoodTex = createFurnitureWoodTexture({ tint: [128, 96, 60] });
  const furnitureWoodNormal = createFurnitureWoodNormalTexture();

  const doorFrame = new THREE.Group();
  doorFrame.position.set(0, 0, HALL_LEN - 0.06);
  // door.glb is authored facing +Z: blender/build_door.py puts the knob at
  // Blender y = -0.035, and the glTF Y-up conversion lands that at +Z. So the
  // frame turns 180 degrees for its knob face to look back down the corridor at
  // the player, and its 0.06m frame depth then runs into the end wall.
  doorFrame.rotation.y = Math.PI;
  group.add(doorFrame);

  const doorHinge = new THREE.Object3D();
  doorHinge.position.set(-0.5, 1.0, 0.025); // the leaf's own edge, opposite the knob
  doorFrame.add(doorHinge);
  // +PI/2 swings the leaf into the frame's local -Z, which after the 180 above
  // is world +Z -- AWAY down the corridor, opening onto black rather than into
  // the player's face.
  const doorOpenSwing = Math.PI / 2;

  // Claw marks raked into the lower panel, same placement the bedroom door
  // uses. The 0.13 matters: bedroomLevel documents that the raised panels reach
  // z = 0.105, so anything shallower is buried inside the geometry.
  const doorClawMarks = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.45),
    new THREE.MeshStandardMaterial({
      map: createClawMarksTexture(),
      normalMap: createClawMarksNormalTexture(),
      normalScale: new THREE.Vector2(1.2, 1.2),
      transparent: true,
      roughness: 0.95
    })
  );
  doorClawMarks.position.set(-0.15, 0.68, 0.13);
  doorFrame.add(doorClawMarks);

  loadModel(doorModelUrl).then((doorModel) => {
    doorModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    applyTextureByMaterialName(doorModel, 'DoorWood', furnitureWoodTex, furnitureWoodNormal);
    applyTextureByMaterialName(doorModel, 'DoorFrameWood', furnitureWoodTex, furnitureWoodNormal);
    // Let the canvas texture actually BE the albedo.
    //
    // applyTextureByMaterialName only assigns .map, and a MeshStandardMaterial
    // renders map * color -- while blender/build_door.py bakes DOOR_WOOD
    // (0.13, 0.08, 0.05) into the glTF as baseColorFactor. Multiplying the wood
    // texture by that put the finished door at roughly 6% reflectance: against
    // this level's bright wallpaper it rendered as a flat black rectangle with
    // only the brass knob catching light, which is no good for the one object
    // the player has to find. Safe to mutate in place rather than clone --
    // loadModel parses a fresh glTF per call (THREE.Cache is off), so these
    // materials belong to this door alone and not to the bedroom's copy.
    doorModel.traverse((child) => {
      if (child.isMesh && child.material && child.material.map) {
        child.material.color.setScalar(1);
      }
    });
    doorFrame.add(doorModel);
    // attach(), not add(): it preserves world transform, so nothing jumps when
    // this async load resolves.
    ['doorPanel', 'knobHandle', 'knobPlate'].forEach((name) => {
      const part = doorModel.getObjectByName(name);
      if (part) doorHinge.attach(part);
    });
    doorHinge.attach(doorClawMarks);
  }).catch((err) => {
    console.error('Failed to load door.glb for the backrooms exit:', err);
  });

  // Invisible hitbox on the FRAME, not the hinge: it has to stay in the doorway
  // after the swing, and putting it here makes the door interactable
  // immediately instead of waiting on the async load. Interaction's raycast is
  // non-recursive, so a Group in the list would never be hit -- this Mesh is
  // what makes the door work at all.
  const doorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.06),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  doorSlab.position.set(0, 1.0, 0);
  doorFrame.add(doorSlab);
  doorSlab.userData.interact = {
    // No '[E] ' prefix -- Interaction.js prepends it. Four labels in
    // bedroomLevel.js get this wrong and render "[E] [E] Search drawer".
    label: 'Open the door',
    onInteract: () => {
      // Set SYNCHRONOUSLY, before the door-swing delay below. That delay is
      // exactly the window a second E press lands in, and main.js's
      // transitionInFlight guard does not cover it yet.
      if (opened) {
        showCaption('It hangs open. Whatever is past it is not yellow.');
        return;
      }
      opened = true;
      showCaption('The handle turns. Behind you, the humming stops all at once.');
      // The route is captured NOW, not read when the timer fires. Restarting
      // inside this delay calls setRoute(null), and a timer that read the live
      // variable would then hand onExit a null route -- which main.js would
      // fall back on and drop the player into Level 2 out of a bedroom they had
      // just reset.
      const bound = route;
      exitTimer = setTimeout(() => { exitTimer = null; onExit(bound); }, 1400);
    }
  };
  interactables.push(doorSlab);

  // ---------- the sealed entry ----------
  // Not a locked door: a locked door implies a key exists somewhere. This is
  // the SHAPE of a door with the wallpaper running straight across it. No
  // frame, no handle, no gap.
  const sealedMap = tiled(wallpaperTex, 1.16 / 2.12, 2.16 / 2.45);
  // Offset so the roll seams on the patch deliberately do NOT line up with the
  // seams on the wall behind it -- paper hung over a doorway never does.
  sealedMap.offset.set(0.31, 0.07);
  const sealed = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 2.16, 0.03),
    new THREE.MeshStandardMaterial({ map: sealedMap, roughness: 0.93 })
  );
  sealed.position.set(0, 1.08, 0.03);
  group.add(sealed);

  // Dark reveal around the edge, so the door-shape stays legible even when the
  // fixture above it is in one of its dead stretches.
  const revealMat = new THREE.MeshStandardMaterial({ color: 0x120e06, roughness: 0.8 });
  [[-0.58, 1.08, 0.02, 2.16], [0.58, 1.08, 0.02, 2.16]].forEach(([x, y, w, h]) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.032), revealMat);
    strip.position.set(x, y, 0.032);
    group.add(strip);
  });
  [[0, 0.0], [0, 2.16]].forEach(([x, y]) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.02, 0.032), revealMat);
    strip.position.set(x, y, 0.032);
    group.add(strip);
  });

  const sealedHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  sealedHitbox.position.set(0, 1.1, 0.08);
  sealedHitbox.userData.interact = {
    label: 'The door you came through',
    onInteract: () => showCaption(
      'The wallpaper runs straight across it. No frame, no handle, no seam. It was never a door.'
    )
  };
  group.add(sealedHitbox);
  interactables.push(sealedHitbox);

  // Someone before you already tried this.
  function addClawMarks(x, y, z, rotY, scale = 1) {
    const marks = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5 * scale, 0.5 * scale),
      new THREE.MeshStandardMaterial({
        map: createClawMarksTexture(),
        normalMap: createClawMarksNormalTexture(),
        normalScale: new THREE.Vector2(1.2, 1.2),
        transparent: true,
        roughness: 0.95
      })
    );
    marks.position.set(x, y, z);
    marks.rotation.y = rotY;
    group.add(marks);
  }
  addClawMarks(0.25, 1.15, 0.055, 0, 1.1);
  addClawMarks(-0.30, 1.45, 0.055, 0, 0.80);

  // ---------- dressing ----------
  // Deliberately sparse. Backrooms is defined by emptiness, and dressing this
  // like the basement lab is the main way the level could go wrong. No crates,
  // no desks, no chairs.

  // Peeling flaps, matched to THIS level's wallpaper via the existing
  // parameterised texture, concentrated in the dark gaps and at branch corners.
  // Three flap textures built once and cycled, rather than a fresh 256px canvas
  // and a fresh GPU upload per flap. The maze roughly doubled the number of
  // dressed dead ends, and createPeelingWallpaperTexture is randomised per call,
  // so a pool keeps the variety while capping the boot cost -- the same trick
  // ARROW_VARIANTS already uses.
  //
  // Notably darker than the wallpaper's own base (198,178,96): the wall surface
  // is shaded down substantially by its height map, so a flap painted the raw
  // base tone rendered BRIGHTER than the wall it is supposedly peeling off -- a
  // pale card stuck to the corridor. The underside of a lifting flap sits in its
  // own shadow anyway.
  const PEEL_VARIANTS = [0, 1, 2].map(() =>
    createPeelingWallpaperTexture({ paperColor: [124, 110, 60] }));
  let peelPick = 0;

  function addPeeling(x, y, z, rotY, scale = 1) {
    warnIfFloating('peeling flap', x, y, z, rotY);
    const flap = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5 * scale, 0.5 * scale),
      new THREE.MeshStandardMaterial({
        map: PEEL_VARIANTS[peelPick++ % PEEL_VARIANTS.length],
        transparent: true,
        roughness: 0.95
      })
    );
    flap.position.set(x + Math.sin(rotY) * 0.02, y, z + Math.cos(rotY) * 0.02);
    flap.rotation.y = rotY;
    flap.rotation.x = (Math.random() - 0.5) * 0.15;
    flap.rotation.z = (Math.random() - 0.5) * 0.08;
    group.add(flap);
  }
  // 19.3, not 8.6: opening B6's mouth (left wall now absent 8.40-10.60) left
  // this one floating too. Moved rather than nudged, so it is not crowding
  // the blood arrow that already sits on the short 7.40-8.40 stub.
  addPeeling(L, 1.78, 19.3, LROT, 0.85);
  addPeeling(R, 1.25, 10.4, RROT, 0.7);
  addPeeling(L, 1.90, 16.2, LROT, 0.8);
  addPeeling(R, 1.62, 17.9, RROT, 0.6);
  // 11.9, not 12.9: 12.9 sat inside B2's mouth (left wall absent 12.40-14.60).
  addPeeling(-1.6, 1.05, 11.9, LROT, 0.55);
  // New branches. rotY points along the wall's OUTWARD normal, i.e. into the
  // walkable side -- get the sign wrong and the flap is buried inside the wall,
  // and the DoubleSide wall material means there is no backwards-plane tell.
  addPeeling(-7.0, 1.60, 10.60, Math.PI, 0.80);        // B6 leg A, north wall
  addPeeling(6.00, 1.70, 5.20, RROT, 0.75);            // B5 cross bar, east wall
  addPeeling(5.5, 1.50, 15.40, 0, 0.70);               // B7 leg A, south wall

  // Cobwebs ONLY in the dead-end branches. Webs mean undisturbed; their absence
  // in the main corridor means traffic. That is the trail's whole backstory,
  // told with a texture that already exists.
  // Pooled for the same reason as the flaps -- createCobwebTexture randomises its
  // spoke count per call, so three is plenty of variety across nine corners.
  const WEB_VARIANTS = [0, 1, 2].map(() => createCobwebTexture());
  let webPick = 0;

  function addCobweb(x, y, z, rotY, tiltX = -0.3, tiltZ = 0.3) {
    const web = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshStandardMaterial({
        map: WEB_VARIANTS[webPick++ % WEB_VARIANTS.length],
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 1
      })
    );
    web.position.set(x, y, z);
    web.rotation.set(tiltX, rotY, tiltZ);
    group.add(web);
  }
  addCobweb(-7.5, HALL_H - 0.15, 5.35, Math.PI / 4);
  addCobweb(-7.5, HALL_H - 0.15, 7.25, -Math.PI / 4, -0.3, -0.3);
  addCobweb(4.5, HALL_H - 0.15, 9.35, Math.PI / 4);
  addCobweb(-6.6, HALL_H - 0.18, 13.5, Math.PI / 4, -0.3, -0.3);
  // The new dead ends. Still nothing in the main corridor -- webs mean
  // undisturbed, so their absence along the route is what says the trail is the
  // trafficked way through.
  addCobweb(5.9, HALL_H - 0.15, 7.45, -Math.PI / 4, -0.3, -0.3);   // B5 north prong
  addCobweb(5.9, HALL_H - 0.15, 0.55, Math.PI / 4);                // B5 south prong
  addCobweb(-6.1, HALL_H - 0.15, 4.05, -Math.PI / 4, -0.3, -0.3);  // B6 leg C
  addCobweb(-10.4, HALL_H - 0.15, 2.15, Math.PI / 4);              // B6 leg B corner
  addCobweb(7.4, HALL_H - 0.15, 20.45, -Math.PI / 4, -0.3, -0.3);  // B7 leg B
  addCobweb(-4.5, HALL_H - 0.15, 2.75, Math.PI / 4);               // B8

  // Dead flies under the living fixtures -- the single most fluorescent-lit
  // detail there is, and nothing else in this game has it.
  const flyGeo = new THREE.IcosahedronGeometry(0.008, 0);
  const flyMat = new THREE.MeshStandardMaterial({ color: 0x14120c, roughness: 0.6 });
  [1.5, 5.5, 13.5, 21.0].forEach((z) => {
    for (let i = 0; i < 6; i++) {
      const fly = new THREE.Mesh(flyGeo, flyMat);
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 0.45;
      fly.position.set(Math.cos(a) * d, 0.008, z + Math.sin(a) * d);
      group.add(fly);
    }
  });

  // A fallen ceiling tile under the first dead fixture, with the matching hole
  // above it. Instant "something came through here", and at 2cm tall it needs
  // no collider.
  const fallenTile = new THREE.Mesh(
    new THREE.BoxGeometry(0.60, 0.02, 0.60),
    new THREE.MeshStandardMaterial({
      map: tiled(ceilTex, 0.25, 0.25), roughness: 0.9
    })
  );
  fallenTile.position.set(0.42, 0.011, 9.35);
  fallenTile.rotation.y = 0.6;
  fallenTile.rotation.z = 0.04;
  group.add(fallenTile);

  const tileHole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x050403 })
  );
  tileHole.rotation.x = Math.PI / 2;
  tileHole.position.set(0, HALL_H - 0.01, 9.5);
  group.add(tileHole);

  // Water pooled on the carpet. Zero new textures -- under a moving flashlight
  // the specular highlight does the work.
  //
  // Not the near-black, near-mirror material this obviously wants to be: with
  // no environment map in the scene there is nothing for a smooth surface to
  // reflect, so roughness 0.08 + a dark colour rendered as a flat black hole in
  // the floor rather than as water. Semi-transparent over the carpet, with just
  // enough gloss to catch a highlight, reads as wet instead.
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x3a3020,
    roughness: 0.34,
    metalness: 0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  [[0.2, 5.6, 1.0, 0.7], [-0.5, 9.9, 1.3, 0.8], [0.6, 17.2, 0.9, 1.2]].forEach(([x, z, sx, sz]) => {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), puddleMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.012, z);
    pool.scale.set(sx, sz, 1);
    group.add(pool);
  });

  return {
    group,
    interactables,
    colliders,
    spawn: [0, 1.4],
    // The camera's local forward is -Z by default and the corridor runs +Z, so
    // it has to be turned 180 degrees to face down it -- same reasoning as
    // hallwayBasementLevel. It also means the player spawns with their back to
    // the sealed door, so finding it is a choice to turn around.
    spawnYaw: Math.PI,
    refs: { doorHinge, lamps, arrows, sealed },

    /**
     * Arms the corridor for one crossing.
     *
     * Called by main.js IMMEDIATELY BEFORE activateLevel, so anything it
     * changes is already in place when SceneManager reads spawn/spawnYaw. That
     * ordering is the contract.
     *
     * It also re-arms the exit door's one-shot guard, which makes "configure
     * for this crossing" and "reset for reuse" the SAME call -- there is no
     * second thing to remember, and no way to make the level visible unarmed.
     */
    setRoute(next) {
      // Cancel any exit still in flight from a previous crossing, so it cannot
      // fire into the freshly-armed one.
      clearTimeout(exitTimer);
      exitTimer = null;
      route = next ?? null;
      opened = false;
      outFade = 1;
      doorHinge.rotation.y = 0;
      lamps.forEach((l) => {
        l.light.intensity = l.base;
        l.mat.emissiveIntensity = l.emissiveBase;
        l.lit = false;
        l.timer = 0;
      });
    },
    get route() { return route; },

    reset() { this.setRoute(null); },

    update(dt) {
      this._t = (this._t ?? 0) + dt;

      // Exit punctuation: once the door is open every fluorescent fades out
      // over about a second, so the caption's "the humming stops all at once"
      // is literally true on screen during the beat before the level switches.
      if (opened) outFade = Math.max(0, outFade - dt * 1.1);

      lamps.forEach((l) => {
        let v;
        if (l.mode === 'steady') {
          // A barely-there mains ripple: never dark, but never dead-still.
          v = 0.94 + Math.sin(this._t * 11.3 + l.seed) * 0.03 + Math.random() * 0.03;
        } else if (l.mode === 'flicker') {
          // The lab's idiom, with deeper dips.
          v = (0.86 + Math.random() * 0.24) * (Math.random() < 0.06 ? 0.25 : 1);
        } else {
          // 'dying' -- a failing ballast, not white noise: short irregular
          // strikes separated by long dead stretches.
          l.timer -= dt;
          if (l.timer <= 0) {
            l.lit = !l.lit;
            l.timer = l.lit ? 0.03 + Math.random() * 0.10 : 0.25 + Math.random() * 1.90;
          }
          v = l.lit ? 0.55 + Math.random() * 0.60 : 0.015;
        }
        v *= outFade;
        l.light.intensity = l.base * v;
        // Driving emissiveIntensity alongside the light is what the lab's
        // flicker misses -- there the tube mesh glows steadily while the room
        // strobes around it.
        l.mat.emissiveIntensity = l.emissiveBase * v;
      });

      // Eased swing, same treatment and rate as the bedroom's front door.
      const target = opened ? doorOpenSwing : 0;
      doorHinge.rotation.y += (target - doorHinge.rotation.y) * Math.min(1, dt * 3);
    }
  };
}
