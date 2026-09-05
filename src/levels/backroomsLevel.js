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
 *  2. IT IS A MAZE THAT IS NOT ACTUALLY HARD. The route turns three times and
 *     every turn is a T-junction where carrying straight on is the mistake, so
 *     there are real decisions to get wrong -- but the corridor graph is a TREE,
 *     which means every wrong turn is a guaranteed dead end rather than a
 *     shortcut, and the wrong turns are mostly short. About 33m, ~16 seconds if
 *     you walk it straight.
 *
 *  3. THE ARROWS ARE THE SIGNAL, NOT THE DECORATION. There are five, one at
 *     each turn plus one to start you off and one at the door. The level used to
 *     carry twenty-seven along a corridor with no decisions in it, where they
 *     could only ever be scenery. Now the only places you can go wrong are the
 *     places that are marked, which is simultaneously far fewer arrows and
 *     impossible to get properly stuck on.
 *
 * Hierarchy note: everything is a direct child of `group`, with no intermediate
 * offset groups. worldRoot sits at the origin and levels never set
 * group.position, so level space IS world space and every collider number is
 * literally the number that placed the mesh. hallwayBasementLevel uses an
 * offset `hallway`/`lab` group and then has to write `LAB_Z + x` by hand in
 * every collider; that is not a mistake worth repeating.
 */

const CORRIDOR_W = 3.2;  // 2.2m of walkable width after the player's 0.35 body radius
const HALL_H = 2.35;     // 3.2:2.35 is WIDER than tall. The bedroom is 2.29:1 and the
                         // Level 2 hallway is 0.89:1 (taller than wide, the house-corridor
                         // proportion). Squat is the strongest proportional tell of a
                         // commercial drop-ceiling corridor.

const T = 0.30;          // collider slab thickness, straddling the wall plane

/**
 * THE MAZE, as corridor rectangles. `[x0, x1, z0, z1]` is the walkable interior.
 *
 * This is the only thing that describes the layout: the walls, their colliders
 * and the tide-line are all DERIVED from it by buildWallRuns() below. The level
 * used to hand-author 52 wall runs and cut each branch mouth as a manually
 * computed gap in one of them, which is what produced three decals floating in
 * mid-air last pass and two more the moment the walls moved. With a real maze --
 * openings on both sides of the route -- that does not scale.
 *
 * TWO RULES:
 *
 *  1. Corridors must genuinely OVERLAP at a junction, by more than the player's
 *     diameter on both axes. Merely touching is a zero-width seam the player
 *     cannot walk through.
 *
 *  2. The corridor graph must be a TREE -- exactly one junction fewer than there
 *     are corridors. That is what makes every wrong turn a guaranteed dead end
 *     rather than a shortcut, and assertCorridorTree() below checks it at boot.
 *     "No loops" stops being something to remember and becomes something the
 *     data cannot express.
 *
 * The route is NS1 -> EW1 -> NS2 -> EW2: north, west, north, east to the door.
 * Three turns, each a T-junction where carrying straight on is the mistake.
 * Measured at 32.6m, about 16 seconds' walk.
 */
const CORRIDORS = {
  NS1: [-1.6, 1.6, 0.0, 9.6],      // the spine, north from the sealed entry
  EW1: [-13.6, 8.0, 6.4, 9.6],     // TURN 1 -- route goes WEST; east is the long decoy
  NS2: [-10.4, -7.2, 6.4, 22.0],   // TURN 2 -- route goes NORTH; north past the turn decoys
  EW2: [-10.4, 2.4, 15.2, 18.4],   // TURN 3 -- route goes EAST, to the door
  sA: [0.6, 4.4, 2.0, 4.4],        // short stubs. They exist to make the maze look busier
  sB: [4.8, 7.6, 2.4, 7.4],        // than it is -- every one is visibly a dead end from
  sC: [-13.2, -9.4, 11.6, 14.0],   // its own mouth, so none of them costs real time.
  sD: [-3.6, -0.8, 17.4, 21.0]
};

/** The corridors the correct route passes through, in order. */
const ROUTE = ['NS1', 'EW1', 'NS2', 'EW2'];

// Bounding box for the floor and ceiling quads. Beyond them there is no floor at
// all, and since nothing sets scene.background FogExp2 does not fog the void --
// an overrun reads as a hard-edged black pit rather than a fade.
//
// BOTH MINIMUMS move in whole multiples of 0.6m, and that is not optional: the
// ceiling texture is a 4x4 grid of 0.6m tiles whose UV origin is anchored at
// (BOX_MIN_X, BOX_MIN_Z), so any other shift slides the entire T-bar grid.
// (The old comment claimed only BOX_MIN_X carried this constraint. It does not.)
// The maximums only change the repeat count and both textures wrap, so growing
// north or east is free.
const BOX_MIN_X = -15.1;   // was -11.5, moved by 3.6 = 6 x 0.6
const BOX_MAX_X = 9.0;
const BOX_MIN_Z = -1.4;    // was -0.2, moved by 1.2 = 2 x 0.6
const BOX_MAX_Z = 23.0;

/**
 * Every wall in the level, derived as the boundary of the corridor union.
 *
 * Sweeps a 10cm grid, marks a wall wherever an inside cell meets an outside one,
 * merges collinear cells into runs, then pads each run by T/2 at both ends so
 * corners always overlap. That padding is load-bearing: the collision resolver
 * tests each AABB independently, so overlap costs nothing and a 1cm seam is a
 * hole -- and a hole here does not show black void, it shows the lit carpeted
 * room next door, which the player can walk into and then straight off the edge
 * of the world.
 */
function buildWallRuns() {
  const G = 0.10;
  const rects = Object.values(CORRIDORS);
  const minX = Math.min(...rects.map((r) => r[0])) - 1;
  const maxX = Math.max(...rects.map((r) => r[1])) + 1;
  const minZ = Math.min(...rects.map((r) => r[2])) - 1;
  const maxZ = Math.max(...rects.map((r) => r[3])) + 1;
  const nx = Math.round((maxX - minX) / G);
  const nz = Math.round((maxZ - minZ) / G);

  const inside = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = minX + (i + 0.5) * G;
      const z = minZ + (j + 0.5) * G;
      if (rects.some(([a, b, c, d]) => x > a && x < b && z > c && z < d)) inside[j * nx + i] = 1;
    }
  }

  const snap = (v) => Math.round(v * 100) / 100;
  const runs = [];
  // walls standing at constant x, on the boundary between columns i-1 and i
  for (let i = 1; i < nx; i++) {
    let start = null;
    for (let j = 0; j <= nz; j++) {
      const edge = j < nz && (inside[j * nx + i - 1] ^ inside[j * nx + i]);
      if (edge && start === null) start = j;
      else if (!edge && start !== null) {
        runs.push({ axis: 'x', at: snap(minX + i * G), from: snap(minZ + start * G - T / 2), to: snap(minZ + j * G + T / 2) });
        start = null;
      }
    }
  }
  // walls standing at constant z, on the boundary between rows j-1 and j
  for (let j = 1; j < nz; j++) {
    let start = null;
    for (let i = 0; i <= nx; i++) {
      const edge = i < nx && (inside[(j - 1) * nx + i] ^ inside[j * nx + i]);
      if (edge && start === null) start = i;
      else if (!edge && start !== null) {
        runs.push({ axis: 'z', at: snap(minZ + j * G), from: snap(minX + start * G - T / 2), to: snap(minX + i * G + T / 2) });
        start = null;
      }
    }
  }
  return runs;
}

/**
 * Fails loudly if the corridors form anything but a tree.
 *
 * A tree has exactly one junction fewer than it has corridors. One extra
 * junction means two corridors meet in a second place, i.e. some "dead end"
 * quietly loops back to the route and the maze has a shortcut. Cheap to check,
 * and impossible to spot by eye once there are more than a handful of rectangles.
 */
function assertCorridorTree() {
  const names = Object.keys(CORRIDORS);
  const R = 0.35;
  let junctions = 0;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = CORRIDORS[names[i]];
      const b = CORRIDORS[names[j]];
      const w = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
      const h = Math.min(a[3], b[3]) - Math.max(a[2], b[2]);
      if (w > 2 * R && h > 2 * R) junctions++;
    }
  }
  if (junctions !== names.length - 1) {
    console.error('backrooms: ' + names.length + ' corridors but ' + junctions + ' junctions -- '
      + 'the layout is not a tree, so at least one wrong turn loops back to the route.');
  }
}
assertCorridorTree();

const WALL_RUNS = buildWallRuns();

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
  function addFixture(x, z, { along = 'x', mode, colour, base, dist, decay, emissive, emissiveIntensity }) {
    const acrossX = along === 'x';
    const housing = new THREE.Mesh(
      acrossX ? new THREE.BoxGeometry(1.22, 0.05, 0.62) : new THREE.BoxGeometry(0.62, 0.05, 1.22),
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
    [-0.14, 0.14].forEach((d) => {
      const tube = new THREE.Mesh(
        acrossX ? new THREE.BoxGeometry(1.14, 0.035, 0.09) : new THREE.BoxGeometry(0.09, 0.035, 1.14),
        tubeMat
      );
      tube.position.set(acrossX ? x : x + d, HALL_H - 0.06, acrossX ? z + d : z);
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

  // A lit pool at every junction, and darkness between them.
  //
  // The turns are the only places the player can go wrong, so they are the only
  // places that get light -- you arrive at a decision already able to see it.
  // The stretches between are dark, which is what makes a wrong turn read as
  // wrong before you have walked it, and the decoys get no fixture at all.
  //
  // `along` is the axis the fixture's housing runs across: an east-west corridor
  // needs the tube turned 90 degrees or it lies ALONG the corridor instead of
  // banding across it, and the band on the carpet is the whole backrooms look.
  addFixture(0, 2.0, { along: 'x', mode: 'dying', colour: 0xffd07a, base: 1.5, dist: 8, decay: 1.7, emissive: 0xffdca0, emissiveIntensity: 1.9 });
  addFixture(0, 8.0, { along: 'x', mode: 'steady', colour: 0xffd98a, base: 1.7, dist: 10, decay: 1.55, emissive: 0xffe9a0, emissiveIntensity: 1.7 });   // TURN 1
  addFixture(-4.0, 8.0, { along: 'z', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  addFixture(-8.8, 8.0, { along: 'x', mode: 'flicker', colour: 0xffd07a, base: 1.6, dist: 10, decay: 1.6, emissive: 0xffe9a0, emissiveIntensity: 1.7 }); // TURN 2
  addFixture(-8.8, 13.0, { along: 'x', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  addFixture(-8.8, 16.8, { along: 'x', mode: 'steady', colour: 0xffe0a4, base: 1.7, dist: 10, decay: 1.55, emissive: 0xffe9a0, emissiveIntensity: 1.7 }); // TURN 3
  addFixture(-2.0, 16.8, { along: 'z', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  // The only bright steady light in the level sits over the exit. The
  // destination is the one stable thing here -- the light does the signage.
  addFixture(1.4, 16.8, { along: 'z', mode: 'steady', colour: 0xffe0a4, base: 1.95, dist: 12, decay: 1.5, emissive: 0xfff0c0, emissiveIntensity: 1.9 });

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
    // A wall arrow can ONLY point along the wall, because the art runs along the
    // plane's local +X and the plane is flat against the wall. So a wall at
    // rotY 0 or PI (facing +/-Z) can express east and west and nothing else, and
    // a wall at +/-PI/2 can express north and south and nothing else. Asking for
    // a perpendicular direction does not fail -- `dir` just rounds to +/-1 and
    // you silently get an arrow pointing 90 degrees away from where you meant.
    // Use a floor arrow there instead; it has no such constraint.
    if (Math.abs(dot) < 0.7) {
      console.warn('backrooms: blood arrow at (' + x + ', ' + y + ', ' + z + ') asks to point ['
        + point + '] but the wall it is on can only point along [' + localX.map((v) => v.toFixed(0))
        + ']. It will point the wrong way -- use addFloorArrow for this direction.');
    }
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

  // FIVE arrows, where there used to be twenty-seven.
  //
  // The old trail lined a straight corridor you could not possibly get lost in,
  // so every arrow was decoration. Now there is exactly one at each place the
  // route turns, plus one to start you off and one at the door -- which is both
  // far fewer arrows AND impossible to get properly stuck on, because the only
  // places you can make a mistake are the places that are marked.
  //
  // `point` is passed explicitly on every one. Its default is [0, 1], documented
  // as "toward the exit", which was true when the exit was always +Z; on a maze
  // with east-west legs that default is silently WRONG rather than merely absent.
  addBloodArrow(-1.6, 1.42, 2.5, Math.PI / 2, 0.55, { point: [0, 1], roll: 0.04 });        // go north
  addBloodArrow(0, 1.38, 9.6, Math.PI, 0.62, { point: [-1, 0], roll: -0.06 });             // TURN 1: west
  addFloorArrow(-8.8, 7.6, 0, 0.85);                                                       // TURN 2: north
  addBloodArrow(-6.8, 1.30, 15.2, 0, 0.7, { point: [1, 0], roll: -0.12, wet: true });       // TURN 3: east
  addFloorArrow(1.2, 16.8, Math.PI / 2, 1.0, { wet: true });                               // at the door

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
  doorFrame.position.set(2.34, 0, 16.8);
  // door.glb is authored facing +Z: blender/build_door.py puts the knob at
  // Blender y = -0.035, and the glTF Y-up conversion lands that at +Z. The door
  // now sits at the EAST end of EW2, so it turns -90 degrees for its knob face
  // to look back west down the corridor at the approaching player, and its 0.06m
  // frame depth runs into the end wall behind it.
  doorFrame.rotation.y = -Math.PI / 2;
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
  // rotY points along the wall's OUTWARD normal, i.e. into the walkable side.
  // Get the sign wrong and the flap is buried inside the wall, and because the
  // wall material is DoubleSide there is no backwards-plane tell -- it simply
  // vanishes. warnIfFloating catches the wrong WALL; only care catches the wrong
  // FACE.
  addPeeling(-1.6, 1.60, 4.2, Math.PI / 2, 0.80);      // NS1 west wall
  addPeeling(1.6, 1.30, 5.2, -Math.PI / 2, 0.70);      // NS1 east wall
  addPeeling(-5.0, 1.80, 9.6, Math.PI, 0.80);          // EW1 north wall
  addPeeling(-10.4, 1.55, 19.5, Math.PI / 2, 0.75);    // NS2 west wall
  addPeeling(-3.0, 1.45, 15.2, 0, 0.70);               // EW2 south wall

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
  addCobweb(7.85, HALL_H - 0.15, 9.45, -Math.PI / 4, -0.3, -0.3);  // EW1 east dead end
  addCobweb(7.85, HALL_H - 0.15, 6.55, Math.PI / 4);               // EW1 east dead end
  addCobweb(-13.45, HALL_H - 0.15, 9.45, -Math.PI / 4, -0.3, -0.3);// EW1 west dead end
  addCobweb(-10.25, HALL_H - 0.15, 21.85, Math.PI / 4);            // NS2 north dead end
  addCobweb(-7.35, HALL_H - 0.15, 21.85, -Math.PI / 4, -0.3, -0.3);// NS2 north dead end
  addCobweb(4.25, HALL_H - 0.15, 4.25, -Math.PI / 4, -0.3, -0.3);  // sA
  addCobweb(7.45, HALL_H - 0.15, 2.55, Math.PI / 4);               // sB
  addCobweb(-13.05, HALL_H - 0.15, 13.85, -Math.PI / 4, -0.3, -0.3);// sC
  addCobweb(-3.45, HALL_H - 0.15, 20.85, Math.PI / 4);             // sD

  // Dead flies under the living fixtures -- the single most fluorescent-lit
  // detail there is, and nothing else in this game has it.
  const flyGeo = new THREE.IcosahedronGeometry(0.008, 0);
  const flyMat = new THREE.MeshStandardMaterial({ color: 0x14120c, roughness: 0.6 });
  // Under the LIVING fixtures only, and now taking an (x, z) pair -- the old
  // loop took a z list and hardcoded x = 0, which only worked while every
  // fixture sat on one straight centreline.
  [[0, 2.0], [0, 8.0], [-8.8, 8.0], [-8.8, 16.8], [1.4, 16.8]].forEach(([fx, fz]) => {
    for (let i = 0; i < 6; i++) {
      const fly = new THREE.Mesh(flyGeo, flyMat);
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 0.45;
      fly.position.set(fx + Math.cos(a) * d, 0.008, fz + Math.sin(a) * d);
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
  fallenTile.position.set(-4.35, 0.011, 7.6);
  fallenTile.rotation.y = 0.6;
  fallenTile.rotation.z = 0.04;
  group.add(fallenTile);

  const tileHole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x050403 })
  );
  tileHole.rotation.x = Math.PI / 2;
  tileHole.position.set(-4.0, HALL_H - 0.01, 8.0);
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
  [[0.2, 3.5, 1.0, 0.7], [-5.6, 8.6, 1.3, 0.8], [-8.8, 12.2, 0.9, 1.2], [-3.4, 17.4, 1.1, 0.8]].forEach(([x, z, sx, sz]) => {
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
