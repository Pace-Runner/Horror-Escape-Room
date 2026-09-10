import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createBackroomsWallpaperTexture,
  createBackroomsWallpaperNormalTexture,
  createDampCarpetTexture,
  createDampCarpetNormalTexture,
  createCeilingTileTexture,
  createCeilingTileNormalTexture,
  createPeelingWallpaperTexture,
  createCobwebTexture,
  createClawMarksTexture,
  createClawMarksNormalTexture,
  createFurnitureWoodTexture,
  createFurnitureWoodNormalTexture,
  createFluorescentTubeTexture,
  createTrofferLensTexture,
  createTrofferLensNormalTexture,
  createFixtureSteelTexture,
  createFixtureSteelNormalTexture,
  createLampGlareTexture,
  createPuddleTextures,
  PUDDLE_PATTERNS,
  tiled
} from '../world/textures.js';
import { loadModel, applyTextureByMaterialName } from '../world/modelLoader.js';
import { MINIMAP_ONLY, MAIN_ONLY } from '../core/RenderLayers.js';
import { gameState } from '../core/GameState.js';
import doorModelUrl from '../assets/models/door.glb?url';
import {
  CORRIDOR_W, T, CORRIDORS, ROUTE, BOX, LEGS, buildWallRuns, runCollider, validateMaze,
  junctions, deadEnd, sideWall, legMid, spawnPoint, exitPoint, nameNoise
} from './backroomsMaze.js';

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
 *  2. IT IS A WARREN THAT STAYS SOLVABLE. The route turns TEN times and every
 *     turn is a T where carrying straight on is the mistake, so there are real
 *     decisions to get wrong -- and thirty-one wrong turns fork four deep, so a
 *     mistake can present a choice of its own. But the corridor graph is a TREE,
 *     which means every wrong turn is a guaranteed dead end rather than a
 *     shortcut, and backroomsMaze.js's validator is what keeps it one. 72m,
 *     ~36 seconds walking if you never take one, ~20 sprinting.
 *
 *     The maze grew threefold in FLOOR AREA and in corridors, and by eleven
 *     seconds in route. That asymmetry is deliberate: this corridor is walked
 *     twice per playthrough and is identical both times, so route length is a
 *     toll every player pays twice while decoy volume is paid only by players
 *     who choose to explore. Tripling the route would have been eighty seconds
 *     of mandatory yellow corridor, twice, with the same turns both times.
 *
 *  3. NO ARROWS. The corridor used to mark its route with blood-drawn arrows at
 *     every turn; the maze is unguided now, so the player finds the way out (or
 *     doesn't, and backtracks) on sight alone. The tree property from point 2 is
 *     what keeps that fair rather than punishing -- a wrong turn always dead-ends
 *     rather than losing the player somewhere they cannot recover from.
 *
 * Hierarchy note: everything is a direct child of `group`, with no intermediate
 * offset groups. worldRoot sits at the origin and levels never set
 * group.position, so level space IS world space and every collider number is
 * literally the number that placed the mesh. hallwayBasementLevel uses an
 * offset `hallway`/`lab` group and then has to write `LAB_Z + x` by hand in
 * every collider; that is not a mistake worth repeating.
 */

const HALL_H = 2.35;     // 3.2:2.35 is WIDER than tall. The bedroom is 2.29:1 and the
                         // Level 2 hallway is 0.89:1 (taller than wide, the house-corridor
                         // proportion). Squat is the strongest proportional tell of a
                         // commercial drop-ceiling corridor.


/**
 * THE MAZE lives in backroomsMaze.js, which imports nothing from three.
 *
 * It is data plus pure functions -- corridors, the route, the wall runs and the
 * room box -- so `npm run check:maze` can validate the layout in plain node
 * without a browser. That split is what makes a hand-authored maze this size
 * safe to edit: a wrong rectangle fails a command instead of a playthrough.
 *
 * Everything below is about how the corridors LOOK. Where they ARE is over
 * there.
 */

// Bounding box for the floor and ceiling quads. Beyond them there is no floor at
// all, and since nothing sets scene.background FogExp2 does not fog the void --
// an overrun reads as a hard-edged black pit rather than a fade.
//
// DERIVED now, from the corridors themselves. It used to be four hand-maintained
// numbers that nothing cross-checked, which is only survivable while the maze is
// small enough to eyeball. buildBox() steps both minimums down from an anchor in
// whole 0.6m multiples, because the ceiling texture is a 4x4 grid of 0.6m tiles
// with its UV origin at (BOX_MIN_X, BOX_MIN_Z) -- so the constraint is CONGRUENCE
// to the anchor, not divisibility by 0.6. (-18.7 is not a multiple of 0.6.)
// Rounding to a multiple would slide the entire T-bar grid by up to half a tile
// and look like nothing at all in a diff. validateMaze() asserts both.
const { minX: BOX_MIN_X, maxX: BOX_MAX_X, minZ: BOX_MIN_Z, maxZ: BOX_MAX_Z } = BOX;

// The layout check runs at boot in dev as a backstop, but the real gate is
// `npm run check:maze`, which reports every fault at once and by name. What it
// replaced counted junctions and checked `count === n - 1`: that cannot say
// WHICH pair is at fault, and a detached corridor plus an accidental loop cancel
// out and pass it in silence.
if (import.meta.env.DEV) {
  const { errors, warnings } = validateMaze();
  for (const w of warnings) console.warn('backrooms maze: ' + w);
  for (const e of errors) console.error('backrooms maze: ' + e);
}

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
  // Hidden from the minimap camera (see MAIN_ONLY in RenderLayers.js): this
  // one plane spans the whole bounding box, which is correct at eye level --
  // nothing outside a corridor is ever reachable -- but from straight above it
  // reads as walkable floor well past the actual walls. minimapFloor below is
  // its replacement for that camera only.
  floor.layers.set(MAIN_ONLY);
  group.add(floor);

  // The map's own floor: one flat quad per CORRIDORS rectangle rather than the
  // single oversized plane above, so the minimap's floor colour stops at the
  // real walls instead of filling the whole bounding box. Shown to the
  // minimap camera only (see MINIMAP_ONLY) -- the two floors never share a
  // camera, so they never compete for the same pixel.
  const minimapFloorMat = new THREE.MeshBasicMaterial({ color: 0x8a7a52 });
  // The corridor you are standing in, so a 42-rectangle floor plan still tells
  // you which of its rooms is you.
  const minimapHereMat = new THREE.MeshBasicMaterial({ color: 0xc4ad72 });
  const mapQuads = {};
  Object.entries(CORRIDORS).forEach(([name, [x0, x1, z0, z1]], i) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), minimapFloorMat);
    mapQuads[name] = q;
    // FOG OF WAR, and it is exactly this cheap: the level already drew one flat
    // quad per corridor for the map, which is precisely the granularity the fog
    // wants, so hiding a corridor is `visible = false`. No mask canvas, no
    // render target, no per-pixel anything.
    //
    // Unexplored draws NOTHING -- the wrap's own black shows through the
    // alpha canvas. Deliberately not a dim silhouette: with a tree of 42
    // corridors an outline hands the player the shape of the solution, and the
    // level is over.
    q.visible = false;
    q.rotation.x = -Math.PI / 2;
    // A tiny per-quad rise, not a shared height: junctions genuinely overlap
    // two corridor rectangles by design (see the file header's rule 1), and
    // two perfectly coplanar quads z-fight under a camera that moves every
    // frame. Nothing here is visible at this scale; it only fixes draw order.
    q.position.set((x0 + x1) / 2, 0.005 + i * 0.0002, (z0 + z1) / 2);
    q.layers.set(MINIMAP_ONLY);
    group.add(q);
  });

  // Two landmarks, each revealed with the corridor it stands in rather than
  // drawn from the start: the exit marker is then a REWARD for having found the
  // corridor, not a spoiler pointing at it from the first step. The map is
  // schematic (see `exclusive` in Minimap.js), so the door model itself never
  // appears on it and something has to say which end is which.
  function addLandmark(at, colour, size) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: colour })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, 0.02, at.z);
    m.layers.set(MINIMAP_ONLY);
    m.visible = false;
    group.add(m);
    return m;
  }
  const exitLeg = Object.keys(LEGS).find((n) => LEGS[n].exit);
  const rootLeg = Object.keys(LEGS).find((n) => LEGS[n].parent === null);
  const exitMark = addLandmark(exitPoint(), 0xffd257, 2.2);
  const entryMark = addLandmark(spawnPoint(), 0x6b6355, 1.8);

  const CORRIDOR_LIST = Object.entries(CORRIDORS);
  let hereQuad = null;

  /**
   * The player is at (x, z) -- reveal whatever corridor that is, forever.
   *
   * Called from main.js's frame loop. A point-in-rect scan over 42 rectangles
   * per frame is nothing, and doing it here rather than in the map keeps the
   * rectangles owned by the level that generated them.
   */
  function revealAt(x, z) {
    let here = null;
    for (const [name, r] of CORRIDOR_LIST) {
      if (x < r[0] || x > r[1] || z < r[2] || z > r[3]) continue;
      here = here ?? mapQuads[name];
      if (gameState.corridorsSeen.has(name)) continue;
      gameState.corridorsSeen.add(name);
      mapQuads[name].visible = true;
      if (name === exitLeg) exitMark.visible = true;
      if (name === rootLeg) entryMark.visible = true;
    }
    if (here === hereQuad) return;
    if (hereQuad) hereQuad.material = minimapFloorMat;
    hereQuad = here;
    if (hereQuad) hereQuad.material = minimapHereMat;
  }

  /**
   * Push gameState's set back onto the meshes.
   *
   * Called from setRoute(), which main.js calls immediately before this level
   * is made visible -- and that ordering is what makes a restart re-fog the map
   * correctly. resetGame() runs sceneManager.resetAll() BEFORE resetState(), so
   * syncing from reset() alone would read the old set and leave the map
   * revealed; by the next setRoute() the set has been cleared and this is right
   * again. It is also the cheapest place to be correct after any other path
   * that touches the set.
   */
  function syncFog() {
    for (const [name, q] of Object.entries(mapQuads)) {
      q.visible = gameState.corridorsSeen.has(name);
      q.material = minimapFloorMat;
    }
    hereQuad = null;
    exitMark.visible = gameState.corridorsSeen.has(exitLeg);
    entryMark.visible = gameState.corridorsSeen.has(rootLeg);
  }

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

  // ONE geometry each, scaled per run, rather than a fresh one per wall. The
  // materials were already pooled by length (see wallMatFor) but the geometry
  // was not, so 178 runs meant 356 buffer allocations and 356 GPU uploads at
  // boot for two distinct shapes. Scaling is safe here for a specific reason:
  // UVs are untouched by a mesh scale, and the wallpaper's repeat is baked into
  // the per-length material, so the seams still land where wallMatFor put them.
  const wallGeo = new THREE.PlaneGeometry(1, 1);
  const tideGeo = new THREE.BoxGeometry(1, 1, 1);

  WALL_RUNS.forEach(({ axis, at, from, to }) => {
    const len = to - from;
    const mid = (from + to) / 2;
    const wall = new THREE.Mesh(wallGeo, wallMatFor(len));
    wall.scale.set(len, HALL_H, 1);
    const tide = new THREE.Mesh(tideGeo, tideMat);
    tide.scale.set(len, 0.10, 0.02);

    if (axis === 'x') {
      wall.position.set(at, HALL_H / 2, mid);
      wall.rotation.y = Math.PI / 2;
      tide.position.set(at, 0.05, mid);
      tide.rotation.y = Math.PI / 2;
      colliders.push(runCollider({ axis, at, from, to }));
    } else {
      wall.position.set(mid, HALL_H / 2, at);
      tide.position.set(mid, 0.05, at);
      colliders.push(runCollider({ axis, at, from, to }));
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

  // ---------- the lights fail, on purpose ----------
  //
  // Three independent failures, layered as multipliers over whatever the lamp's
  // own mode is doing (see update()):
  //
  //   mode    the tube's own character -- always moving, never dead-still
  //   outage  this ONE fixture gone, for seconds at a time
  //   blackout  the whole floor gone at once
  //
  // Why: the corridor is 42 corridors deep now and the torch is the only thing
  // the player carries into it. A maze that is reliably lit is a maze you read
  // off the ceiling; one where any given corridor might be dark when you reach
  // it is a maze you have to light yourself. It also means the level plays
  // differently on the second crossing without being a different level.
  //
  // The EXIT LAMP IS EXEMPT from both outage and blackout. It is deliberate
  // signage -- "the light does the signage" -- so during a blackout it becomes
  // the only lit thing on the floor, which turns a blackout into a direction
  // rather than only a punishment. Being the one thing that never fails is also
  // how the player learns to trust it.
  const OUTAGE_OUT = [2.0, 6.0];    // seconds this fixture stays gone
  const OUTAGE_LIT = [8.0, 20.0];   // seconds before it goes again
  const BLACKOUT_GAP = [45.0, 90.0];
  const BLACKOUT_LEN = [4.0, 7.0];
  const OUT_EASE = 7.0;             // 1/s -- roughly a 0.15s ramp either way
  const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);

  let blackout = 1;                 // level-wide multiplier, eased
  let blackoutOn = false;
  let blackoutTimer = rand(BLACKOUT_GAP);

  // ---------- the fixture, built once ----------
  //
  // Every troffer in the corridor is the same object, so it is ONE set of
  // geometry shared by all forty-three of them and turned a quarter turn for
  // the corridors that run the other way. That matters more here than it looks:
  // this level already shares its wall geometry for the same reason, and a
  // fixture detailed enough to be worth looking at is a dozen boxes, which at
  // forty-three copies would be five hundred buffers for one repeated prop.
  //
  // The pan hangs BELOW the grid rather than being recessed into it. It has to:
  // the ceiling is a single unbroken plane with no holes cut in it, so anything
  // modelled above y = HALL_H sits behind an opaque surface and is simply never
  // seen. Surface-mounted is also what these buildings actually end up with
  // once the original recessed cans have been replaced once or twice.
  const FIX_L = 1.22;    // along the fixture
  const FIX_W = 0.62;    // across it
  const DROP = 0.115;    // how far the pan hangs under the grid
  const LIP = 0.036;     // the flange around the opening
  const HX0 = 0.50;      // half-extents at the ceiling...
  const HZ0 = 0.16;
  const HX1 = FIX_L / 2 - LIP;   // ...and at the opening, which is WIDER: the
  const HZ1 = FIX_W / 2 - LIP;   // pan flares out, and that flare is why a
                                 // troffer throws a soft pool and not a slot

  /**
   * Draw a box's top edge in along one axis, so its long faces become
   * trapezoids.
   *
   * The pan is a frustum: its opening is wider than its back on BOTH axes, so
   * a wall that is a plain rectangle is the right width at the opening and too
   * wide at the ceiling. Left as boxes, each of the four walls stuck a bright
   * lit triangle out past its neighbours at the top -- four wings around every
   * fixture in the corridor, and the shape the eye landed on before it landed
   * on the lamp.
   */
  function pinchTop(geo, axis, ratio) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) <= 0) continue;
      if (axis === 'x') p.setX(i, p.getX(i) * ratio);
      else p.setZ(i, p.getZ(i) * ratio);
    }
    return geo;
  }

  /**
   * One wall of the reflector pan, as a box tilted onto the slope between the
   * ceiling rectangle and the wider opening below it.
   *
   * `axis` is the axis the wall SPANS. The tilt is derived rather than
   * eyeballed so the wall's top edge lands exactly on the ceiling rectangle and
   * its bottom edge exactly on the opening: a degree out and the pan shows a
   * hairline gap at all four corners, from every angle at once.
   */
  function panWall(axis, sign) {
    const run = axis === 'x' ? HZ1 - HZ0 : HX1 - HX0;
    const h = Math.hypot(run, DROP);
    const angle = -sign * Math.atan2(run, DROP);
    return axis === 'x'
      ? pinchTop(new THREE.BoxGeometry(HX1 * 2, h, 0.01), 'x', HX0 / HX1)
        .rotateX(angle).translate(0, -DROP / 2, sign * (HZ0 + HZ1) / 2)
      : pinchTop(new THREE.BoxGeometry(0.01, h, HZ1 * 2), 'z', HZ0 / HZ1)
        .rotateZ(-angle).translate(sign * (HX0 + HX1) / 2, -DROP / 2, 0);
  }

  const trofferGeo = mergeGeometries([
    // The reflector back, flush under the grid.
    new THREE.BoxGeometry(HX0 * 2, 0.01, HZ0 * 2).translate(0, -0.005, 0),
    panWall('x', 1), panWall('x', -1), panWall('z', 1), panWall('z', -1),
    // The flange around the opening. The long pair runs the full length so it
    // closes the corners; the short pair only fills in between them.
    new THREE.BoxGeometry(FIX_L, 0.022, LIP).translate(0, -DROP + 0.011, HZ1 + LIP / 2),
    new THREE.BoxGeometry(FIX_L, 0.022, LIP).translate(0, -DROP + 0.011, -(HZ1 + LIP / 2)),
    new THREE.BoxGeometry(LIP, 0.022, HZ1 * 2).translate(HX1 + LIP / 2, -DROP + 0.011, 0),
    new THREE.BoxGeometry(LIP, 0.022, HZ1 * 2).translate(-(HX1 + LIP / 2), -DROP + 0.011, 0),
    // The ballast cover down the spine and the four lampholders. Interior
    // detail, and only ever seen on the fixtures whose lens is gone -- which is
    // exactly where the eye goes, because those are the ones with a hole in
    // them.
    new THREE.BoxGeometry(0.90, 0.032, 0.10).translate(0, -0.026, 0),
    ...[-1, 1].flatMap((ex) => [-0.14, 0.14].map((tz) =>
      new THREE.BoxGeometry(0.030, 0.058, 0.075).translate(ex * 0.548, -0.062, tz)
    ))
  ]);

  const steelMat = new THREE.MeshStandardMaterial({
    map: createFixtureSteelTexture(),
    normalMap: createFixtureSteelNormalTexture(),
    roughness: 0.6,
    metalness: 0
  });

  // Tubes laid along X, so the whole fixture turns as one piece for the
  // corridors running the other way. Rotating a geometry leaves its UVs alone,
  // so v still runs along the tube and the blackened ends stay at the ends.
  const tubeBar = () => new THREE.CylinderGeometry(0.019, 0.019, 1.10, 14, 1, false)
    .rotateZ(Math.PI / 2);
  const tubePairGeo = mergeGeometries([
    tubeBar().translate(0, -0.062, 0.14),
    tubeBar().translate(0, -0.062, -0.14)
  ]);
  // Fixtures that have lost a lamp altogether. Only worth modelling because the
  // empty holder beside the survivor is already there to be seen.
  const tubeSoloGeo = tubeBar().translate(0, -0.062, -0.14);

  const lensGeo = new THREE.PlaneGeometry(HX1 * 2, HZ1 * 2).rotateX(Math.PI / 2);
  // Three lenses rather than one: a corridor of forty-three fixtures showing
  // the identical arrangement of dead insects is worse than showing none.
  const LENS_TEX = [
    createTrofferLensTexture({ bugs: 32, grime: 0.55 }),
    createTrofferLensTexture({ bugs: 17, grime: 0.3 }),
    createTrofferLensTexture({ bugs: 46, grime: 0.85, cracked: true })
  ];
  const lensNormal = createTrofferLensNormalTexture();
  const glareTex = createLampGlareTexture();

  // How far the mercury has blackened each tube back from its electrodes: the
  // fixture's own failure mode, written on the glass even while it is off.
  const TUBE_AGE = { steady: 0.3, flicker: 0.62, dying: 0.86, dead: 1 };
  const tubeTexCache = new Map();
  const tubeTexture = (age) => {
    if (!tubeTexCache.has(age)) tubeTexCache.set(age, createFluorescentTubeTexture({ age }));
    return tubeTexCache.get(age);
  };

  /**
   * One ceiling troffer. Mounted with its long axis ACROSS the corridor, which
   * is how real fixtures hang and which turns each pool into a bright BAND on
   * the carpet -- the classic backrooms floor pattern.
   *
   * `wear` is a 0..1 number taken from the junction's name, so which fixtures
   * still have a lens, which are missing a lamp and which are hanging open is
   * fixed for a given maze instead of reshuffling every crossing. The corridor
   * is walked twice per playthrough and has to be the same corridor both times.
   */
  function addFixture(x, z, {
    along = 'x', mode, colour, base, dist, decay, emissive, emissiveIntensity,
    wear = 0.5, glareSize = 1
  }) {
    const mount = new THREE.Group();
    mount.position.set(x, HALL_H, z);
    if (along !== 'x') mount.rotation.y = Math.PI / 2;
    group.add(mount);

    // Hidden from the minimap camera: an emissive tube glowing under the map's
    // own bright ambient light reads as a stray bright blob on the floorplan,
    // not a light fixture -- see MAIN_ONLY in RenderLayers.js.
    const housing = new THREE.Mesh(trofferGeo, steelMat);
    housing.layers.set(MAIN_ONLY);
    mount.add(housing);

    // Each fixture gets its OWN tube material. hallwayBasementLevel shares one
    // tubeMat across all three of its tubes, which is fine there because they
    // flicker identically -- here a shared material would make the dead
    // fixtures strobe in sync with the living ones.
    const tubeTex = tubeTexture(TUBE_AGE[mode ?? 'dead']);
    const tubeMat = new THREE.MeshStandardMaterial({
      map: tubeTex,
      emissive,
      // The map doubles as the emissive map, which is the entire point of
      // painting the electrode ends dark: a worn tube glows as a bright bar
      // with dead stubs, not as an evenly lit stick.
      emissiveMap: tubeTex,
      emissiveIntensity,
      roughness: 0.35
    });
    // A missing lamp only ever on a dead fixture: half a lit fixture reads as a
    // lighting bug, half a dark one reads as a building nobody maintains.
    const tubes = new THREE.Mesh(!mode && wear > 0.78 ? tubeSoloGeo : tubePairGeo, tubeMat);
    tubes.layers.set(MAIN_ONLY);
    mount.add(tubes);

    // Roughly three in five keep their lens. The rest are the interesting ones:
    // a bare pan shows the tubes, the holders and the ballast cover, and the
    // worst of them still have theirs hanging off one long edge.
    let lensMat = null;
    if (wear < 0.62) {
      const lensTex = LENS_TEX[Math.min(2, Math.floor(wear / 0.62 * 3))];
      lensMat = new THREE.MeshStandardMaterial({
        map: lensTex,
        emissive: 0xffe6a8,
        emissiveMap: lensTex,
        emissiveIntensity: (emissiveIntensity ?? 0) * 0.6,
        normalMap: lensNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.42,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.layers.set(MAIN_ONLY);
      lens.position.y = -DROP + 0.014;
      mount.add(lens);
    } else if (!mode && wear > 0.9) {
      // Hanging open on one long edge. Hinged rather than merely tilted, so the
      // edge it swings from stays welded to the frame instead of floating a
      // centimetre clear of it. 0.6 rad and no further: the far edge is then at
      // 1.94 m, which is the last angle that still clears a walking player.
      const hinge = new THREE.Object3D();
      hinge.position.set(0, -DROP + 0.014, -HZ1);
      hinge.rotation.x = 0.6;
      mount.add(hinge);
      // Dark, and deliberately not registered as a lamp lens below: there is
      // nothing behind it to glow through any more.
      const lens = new THREE.Mesh(lensGeo, new THREE.MeshStandardMaterial({
        map: LENS_TEX[2],
        normalMap: lensNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.42,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
      }));
      lens.layers.set(MAIN_ONLY);
      lens.position.z = HZ1;
      hinge.add(lens);
    }

    if (!mode) return; // a dead fixture: dark tubes, no light at all

    const light = new THREE.PointLight(colour, base, dist, decay);
    light.position.set(x, 2.10, z);
    group.add(light);

    // The glare. See createLampGlareTexture(): there is no bloom in the render
    // chain, so without this a lit fixture is exactly as bright as its own
    // texture and reads as light painted onto a ceiling rather than as a lamp.
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glareTex,
      color: colour,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.5
    }));
    glare.scale.set(1.9 * glareSize, 1.0 * glareSize, 1);
    glare.position.set(x, HALL_H - 0.21, z);
    glare.layers.set(MAIN_ONLY);
    group.add(glare);

    lamps.push({
      light,
      mat: tubeMat,
      // Null on the fixtures whose lens is gone; the update loop drives it
      // alongside the tube so the two never disagree about how lit the fixture
      // is, which is the mistake the lab's flicker makes with its tube mesh.
      lens: lensMat,
      lensBase: lensMat ? lensMat.emissiveIntensity : 0,
      glare,
      glareBase: 0.5,
      base,
      emissiveBase: emissiveIntensity,
      mode,
      seed: lamps.length * 2.3,
      lit: false,
      timer: 0,
      // Its own independent failure clock -- see OUTAGE below. Staggered by
      // index so they do not all first drop out on the same second of the
      // first crossing, which is what a shared start time looks like.
      out: false,
      outTimer: OUTAGE_LIT[0] + (lamps.length * 3.1) % (OUTAGE_LIT[1] - OUTAGE_LIT[0]),
      // Eased rather than switched: a fluorescent does not go from full to
      // nothing in one frame, and a hard cut on a point light reads as a bug.
      outLevel: 1
    });
  }

  // A fixture at every junction; a WORKING one at roughly every third.
  //
  // This used to say that decoys get no fixture at all, so darkness was the
  // wrong-turn tell. That policy is gone, and deliberately: with the blood
  // arrows removed and the maze at forty-two corridors, a lit/unlit split would
  // hand the solution to anyone who noticed it, and the failing lights below
  // would break it anyway. The fog map is the guide now. The lights are weather.
  //
  // `dist` is 6.5 rather than the old 8-12 because MIN_WALL is 1.6 m and these
  // fluorescents cast no shadows: a 10 m pool reaches straight through a wall
  // and lights the corridor on the other side, which at this corridor density
  // would glow the whole maze into one continuous smear.
  //
  // `along` is the axis the housing runs across: a corridor running east-west
  // needs its tube turned 90 degrees or it lies ALONG the corridor instead of
  // banding across it, and the band on the carpet is the whole backrooms look.
  const LAMP_MODES = ['steady', 'flicker', 'steady', 'dying'];
  junctions().forEach((j, i) => {
    const along = j.axis === 'z' ? 'x' : 'z';
    // Every third junction is lit, offset so the route's own turns alternate
    // rather than all landing on the same side of the pattern.
    const lit = j.onRoute ? i % 2 === 0 : nameNoise(j.name) < 0.34;
    if (!lit) {
      addFixture(j.x, j.z, {
        along, mode: null, emissive: 0x24221c, emissiveIntensity: 0,
        wear: nameNoise(j.name, 11)
      });
      return;
    }
    const mode = LAMP_MODES[Math.floor(nameNoise(j.name, 7) * LAMP_MODES.length)];
    addFixture(j.x, j.z, {
      along,
      mode,
      colour: mode === 'dying' ? 0xffd07a : 0xffd98a,
      base: 1.55 + nameNoise(j.name, 3) * 0.2,
      dist: 6.5,
      decay: 1.6,
      emissive: 0xffe9a0,
      emissiveIntensity: 1.7,
      wear: nameNoise(j.name, 11)
    });
  });

  // One over the arrival, so the corridor is not pitch black the instant you
  // step into it, and one over the exit.
  const spawnAt = spawnPoint();
  addFixture(spawnAt.x, spawnAt.z + 0.4, {
    along: 'x', mode: 'dying', colour: 0xffd07a, base: 1.5, dist: 6.5, decay: 1.7,
    emissive: 0xffdca0, emissiveIntensity: 1.9, wear: 0.71
  });

  // The only bright steady light in the level sits over the exit, and it is the
  // one fixture exempt from the blackouts below. The destination is the one
  // stable thing here -- the light does the signage, and during a blackout it
  // becomes the only lit thing in the maze, which turns the blackout into a
  // direction rather than only a punishment.
  const exitAt = exitPoint();
  addFixture(exitAt.x, exitAt.z + exitAt.nz * 1.2, {
    along: 'x', mode: 'steady', colour: 0xffe0a4, base: 1.95, dist: 9, decay: 1.5,
    emissive: 0xfff0c0, emissiveIntensity: 1.9,
    // The one fixture in the level with an intact, barely-grimed lens, and a
    // halo half again as wide. It is signage: it has to be the thing you pick
    // out from the far end of a corridor, and during a blackout it is the only
    // lit object on the floor.
    wear: 0.32, glareSize: 1.45
  });
  const exitLamp = lamps[lamps.length - 1];

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
  doorFrame.position.set(exitAt.x + exitAt.nx * 0.06, 0, exitAt.z + exitAt.nz * 0.06);
  // door.glb is authored facing +Z: blender/build_door.py puts the knob at
  // Blender y = -0.035, and the glTF Y-up conversion lands that at +Z. DERIVED
  // now from the exit leg's own dead end, so the door turns to face back down
  // whichever corridor the route finishes in, and its 0.06m frame depth runs
  // into the end wall behind it. atan2 of the inward normal is that angle.
  doorFrame.rotation.y = Math.atan2(exitAt.nx, exitAt.nz);
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
  // WEB_VARIANTS below uses for the cobwebs.
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
  // Placed against the DEAD END of a corridor rather than at an arbitrary z.
  // Past the last junction a leg's side walls are unbroken by definition, which
  // is what stops a flap landing in a branch mouth -- three shipped that way
  // once and were found only by walking into them. rotY is the wall's inward
  // normal; get the sign wrong and the flap is buried inside the wall, and
  // because the wall material is DoubleSide there is no backwards-plane tell,
  // it simply vanishes. warnIfFloating catches the wrong WALL; only sideWall()
  // returning the normal with the point catches the wrong FACE.
  Object.keys(LEGS).forEach((name) => {
    const n = nameNoise(name, 11);
    if (n > 0.42) return;
    // ASK wallBehind rather than assuming. The first version placed the flap a
    // fixed distance in from the dead end on the theory that nothing branches
    // past the last junction -- but a child can hang at the very END of a leg
    // (d3a does, off EW3), which puts a branch mouth exactly where the theory
    // says the wall is. Four flaps floated, and only warnIfFloating found them.
    for (let k = 0; k < 10; k++) {
      const w = sideWall(name, { back: 0.9 + (k >> 1) * 1.4, side: k % 2 ? -1 : 1 });
      if (!wallBehind(w.rotY, w.x, w.z)) continue;
      addPeeling(w.x, 1.45 + n * 0.8, w.z, w.rotY, 0.70 + n * 0.5);
      return;
    }
  });

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
  // In the dead ends of the WRONG turns only. Webs mean undisturbed; their
  // absence on the route means traffic. That is the trail's whole backstory,
  // told with a texture that already exists -- and it is the one wayfinding tell
  // the level keeps, because unlike darkness it survives the lights failing.
  Object.keys(LEGS).filter((n) => LEGS[n].kind === 'decoy').forEach((name) => {
    const e = deadEnd(name);
    const h = LEGS[name].w / 2 - 0.35;
    const n = nameNoise(name, 23);
    const side = n < 0.5 ? -1 : 1;
    addCobweb(
      e.x + e.nx * 0.45 + (e.axis === 'z' ? side * h : 0),
      HALL_H - 0.15,
      e.z + e.nz * 0.45 + (e.axis === 'x' ? side * h : 0),
      side * Math.PI / 4,
      -0.3,
      side * 0.3
    );
  });

  // Dead flies under the living fixtures -- the single most fluorescent-lit
  // detail there is, and nothing else in this game has it.
  const flyGeo = new THREE.IcosahedronGeometry(0.008, 0);
  const flyMat = new THREE.MeshStandardMaterial({ color: 0x14120c, roughness: 0.6 });
  // Under the LIVING fixtures only, and now taking an (x, z) pair -- the old
  // loop took a z list and hardcoded x = 0, which only worked while every
  // fixture sat on one straight centreline.
  lamps.forEach(({ light }) => {
    const fx = light.position.x;
    const fz = light.position.z;
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
  const tileAt = legMid(ROUTE[2]);
  fallenTile.position.set(tileAt.x - 0.35, 0.011, tileAt.z);
  fallenTile.rotation.y = 0.6;
  fallenTile.rotation.z = 0.04;
  group.add(fallenTile);

  const tileHole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x050403 })
  );
  tileHole.rotation.x = Math.PI / 2;
  tileHole.position.set(tileAt.x, HALL_H - 0.01, tileAt.z + 0.4);
  group.add(tileHole);

  // Water pooled on the carpet.
  //
  // Still NOT the near-black, near-mirror material this obviously wants to be:
  // there is no environment map in this scene, so a smooth dark surface has
  // nothing to reflect and renders as a flat black hole cut in the floor. What
  // sells it instead is a ROUGHNESS MAP -- a glossy middle inside a matte damp
  // fringe -- lit by a torch that moves. See createPuddleTextures().
  //
  // One material per pattern, shared by every puddle using it: eight materials
  // for however many puddles the maze turns out to want, and the per-puddle
  // variety comes from rotation and scale on top of the pattern.
  const puddleGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const puddleMats = new Map();
  function puddleMaterial(pattern) {
    if (!puddleMats.has(pattern)) {
      const t = createPuddleTextures(pattern);
      puddleMats.set(pattern, new THREE.MeshStandardMaterial({
        map: t.map,
        alphaMap: t.alphaMap,
        roughnessMap: t.roughnessMap,
        normalMap: t.normalMap,
        // Full strength. The map is already tuned (see createPuddleTextures):
        // dialled down, the ripples stop catching the torch at all, which is
        // the difference between water and a dark decal.
        normalScale: new THREE.Vector2(1, 1),
        // 1, so the roughness map is used as authored rather than scaled down.
        roughness: 1,
        metalness: 0,
        transparent: true,
        depthWrite: false
      }));
    }
    return puddleMats.get(pattern);
  }

  /**
   * Drop one puddle in a corridor.
   *
   * Sized to the corridor rather than to a fixed number, and kept square in
   * plan: the plane is free to spin on Y for variety, and an oblong one turned
   * 90 degrees in a 1.6 m corridor puts half the water inside a wall. The
   * elongated patterns get their shape from the MASK instead, which is inside
   * the square and rotates safely with it.
   */
  function addPuddle(pattern, x, z, span, spin) {
    const pool = new THREE.Mesh(puddleGeo, puddleMaterial(pattern));
    pool.position.set(x, 0.012, z);
    pool.rotation.y = spin;
    pool.scale.set(span, 1, span);
    group.add(pool);
    return pool;
  }

  // Up from 22% of corridors to 30%. The old threshold predates there being
  // more than one thing to see: eight patterns spread over ten puddles meant
  // most of them were never placed at all.
  Object.keys(LEGS).filter((name) => nameNoise(name, 31) < 0.30).forEach((name) => {
    const m = legMid(name);
    const n = nameNoise(name, 37);
    // Jitter scaled to the corridor, not a fixed 1.5 m: on a 2.4 m closet a
    // fixed offset walked the pool straight through the end wall, and a puddle
    // half inside a wall is invisible rather than obviously wrong.
    const L = LEGS[name];
    const jAlong = Math.max(0, (L.to - L.from) / 2 - 0.9) * (n - 0.5) * 2;
    const jAcross = Math.max(0, L.w / 2 - 0.9) * (n - 0.5) * 2;
    const x = m.x + (L.axis === 'z' ? jAcross : jAlong);
    const z = m.z + (L.axis === 'z' ? jAlong : jAcross);
    // 'ripple' is left out of the draw: it is the one pattern that claims
    // something is still dripping into it, and it is placed by hand under the
    // hole in the ceiling grid rather than wherever the hash lands.
    const pick = PUDDLE_PATTERNS.filter((p) => p !== 'ripple');
    const pattern = pick[Math.min(pick.length - 1, Math.floor(nameNoise(name, 41) * pick.length))];
    const room = Math.min(L.w, L.to - L.from) - 0.3;
    addPuddle(pattern, x, z, Math.min(2.0, room) * (0.66 + n * 0.34),
      nameNoise(name, 43) * Math.PI * 2);
  });

  // The leak under the hole in the grid, and the drop still coming out of it.
  //
  // This is the one thing in the corridor that moves while the player is
  // standing still, and it is worth the twenty lines for that alone: a maze
  // this quiet needs something that is not either the player or the lights.
  // It also answers the fallen tile above -- water came through here, which is
  // why the tile is on the floor and not on the ceiling.
  addPuddle('ripple', tileAt.x, tileAt.z + 0.4, 1.15, 0.4);
  const drip = new THREE.Mesh(
    new THREE.SphereGeometry(0.013, 8, 6),
    // Rough 0.05 with nothing to reflect would be a black speck; what makes it
    // visible is the torch's own highlight sliding over it as it falls.
    new THREE.MeshStandardMaterial({
      color: 0x2b2820, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.9
    })
  );
  drip.layers.set(MAIN_ONLY);
  group.add(drip);
  const DRIP_FALL = 0.62;    // seconds from the tile to the carpet
  const DRIP_WAIT = 1.6;     // and how long before the next one gathers
  let dripT = 0;

  return {
    group,
    interactables,
    colliders,
    spawn: [spawnAt.x, spawnAt.z],
    /**
     * The map frames this whole level instead of 14m around the player.
     *
     * At 52 x 49m the follow view is a keyhole, and a keyhole with fog over it
     * is not navigation. `exclusive` draws the map from MINIMAP_ONLY geometry
     * ONLY -- see Minimap.js for why that is a correctness fix and not a
     * micro-optimisation.
     */
    minimap: { mode: 'overview', bounds: BOX, exclusive: true },
    revealAt,
    // The camera's local forward is -Z by default and the corridor runs +Z, so
    // it has to be turned 180 degrees to face down it -- same reasoning as
    // hallwayBasementLevel. It also means the player spawns with their back to
    // the sealed door, so finding it is a choice to turn around.
    spawnYaw: Math.PI,
    refs: {
      doorHinge,
      lamps,
      sealed,
      /**
       * The corridor rectangles this maze is generated from. Exposed because
       * "is anywhere standable unreachable?" is meaningless here without them:
       * the solid space BETWEEN corridors has no collider in it, so a generic
       * audit sees acres of walkable floor that is not floor at all. With these
       * it can ask the only question that matters -- is any part of an actual
       * corridor cut off?
       */
      corridors: CORRIDORS
    },

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
      lamps.forEach((l, i) => {
        l.light.intensity = l.base;
        l.mat.emissiveIntensity = l.emissiveBase;
        if (l.lens) l.lens.emissiveIntensity = l.lensBase;
        l.glare.material.opacity = l.glareBase;
        l.lit = false;
        l.timer = 0;
        // Every crossing starts lit. Walking INTO a blackout you did not see
        // begin is disorienting in the wrong way -- it reads as the game
        // breaking rather than as the building failing.
        l.out = false;
        l.outLevel = 1;
        l.outTimer = OUTAGE_LIT[0] + (i * 3.1) % (OUTAGE_LIT[1] - OUTAGE_LIT[0]);
      });
      blackout = 1;
      blackoutOn = false;
      blackoutTimer = rand(BLACKOUT_GAP);
      // Re-read the explored set. This is the moment that matters: main.js
      // calls setRoute immediately before making the level visible, so the map
      // is always correct at the instant the player can see it -- including
      // after a restart, which clears the set only AFTER every level's reset()
      // has already run.
      syncFog();
    },
    get route() { return route; },

    reset() { this.setRoute(null); },

    update(dt) {
      this._t = (this._t ?? 0) + dt;

      // Exit punctuation: once the door is open every fluorescent fades out
      // over about a second, so the caption's "the humming stops all at once"
      // is literally true on screen during the beat before the level switches.
      if (opened) outFade = Math.max(0, outFade - dt * 1.1);

      // Level-wide blackout. Not driven off this._t, because that clock is
      // reset per crossing and the player would learn the schedule.
      if (!opened) {
        blackoutTimer -= dt;
        if (blackoutTimer <= 0) {
          blackoutOn = !blackoutOn;
          blackoutTimer = rand(blackoutOn ? BLACKOUT_LEN : BLACKOUT_GAP);
        }
      }
      blackout += ((blackoutOn ? 0 : 1) - blackout) * Math.min(1, dt * OUT_EASE);

      lamps.forEach((l) => {
        // Per-fixture dropout, independent of every other fixture, so no
        // corridor is reliably lit and the darkness never arrives in a pattern.
        if (l !== exitLamp && !opened) {
          l.outTimer -= dt;
          if (l.outTimer <= 0) {
            l.out = !l.out;
            l.outTimer = rand(l.out ? OUTAGE_OUT : OUTAGE_LIT);
          }
        }
        l.outLevel += ((l.out ? 0 : 1) - l.outLevel) * Math.min(1, dt * OUT_EASE);

        let v;
        if (l.mode === 'steady') {
          // A visible mains ripple. Was 0.94 +-0.03 -- so shallow that "steady"
          // meant "static", and a static fluorescent in a level built on
          // unreliable light was the one thing on the ceiling holding still.
          v = 0.86 + Math.sin(this._t * 11.3 + l.seed) * 0.07
                   + Math.sin(this._t * 2.7 + l.seed * 1.7) * 0.04
                   + Math.random() * 0.05;
          // An occasional single-frame stumble, rare enough to be startling
          // rather than strobing -- but NOT on the exit lamp. That fixture is
          // signage, and signage that twitches is signage you stop trusting.
          if (l !== exitLamp && Math.random() < 0.004) v *= 0.35;
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
        // The exit lamp keeps its own steady character through everything: it
        // is exempt from `blackout` and `outLevel`, and only the door's own
        // fade-out can take it down.
        v *= outFade * (l === exitLamp ? 1 : l.outLevel * blackout);
        l.light.intensity = l.base * v;
        // Driving emissiveIntensity alongside the light is what the lab's
        // flicker misses -- there the tube mesh glows steadily while the room
        // strobes around it. The lens and the halo ride the same v for the same
        // reason: three surfaces that disagree about how lit one fixture is
        // read as three separate things stacked on the ceiling.
        l.mat.emissiveIntensity = l.emissiveBase * v;
        if (l.lens) l.lens.emissiveIntensity = l.lensBase * v;
        // Non-linear, and deliberately: glare is the eye's own response, and it
        // falls away faster than the light does. A halo that dims in lockstep
        // reads as a decal stuck to the fixture.
        l.glare.material.opacity = l.glareBase * Math.max(0, v) * Math.max(0, v);
      });

      // The leak. One drop at a time, falling from the hole in the grid into the
      // puddle under it. Quadratic, not linear: a drop that falls at a constant
      // speed reads as being lowered on a string, and the whole reason this is
      // here is to be the one thing in the corridor moving under its own weight.
      dripT += dt;
      if (dripT > DRIP_FALL + DRIP_WAIT) dripT -= DRIP_FALL + DRIP_WAIT;
      const fall = Math.min(1, dripT / DRIP_FALL);
      drip.visible = dripT <= DRIP_FALL;
      drip.position.set(tileAt.x, (HALL_H - 0.06) - fall * fall * (HALL_H - 0.09), tileAt.z + 0.4);
      // Stretched by its own acceleration, which is what a falling drop does
      // and what stops it reading as a bead sliding down glass.
      drip.scale.set(1 - fall * 0.25, 1 + fall * 1.4, 1 - fall * 0.25);

      // Eased swing, same treatment and rate as the bedroom's front door.
      const target = opened ? doorOpenSwing : 0;
      doorHinge.rotation.y += (target - doorHinge.rotation.y) * Math.min(1, dt * 3);
    }
  };
}
