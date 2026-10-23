import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStaticMeshesByMaterial } from '../world/renderOptimizations.js';
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
  createDampStainTexture,
  createFloorStainTexture,
  createBloodPoolTexture,
  createBloodDryTexture,
  createBloodWallRunTexture,
  createBloodCeilingTexture,
  createBloodDripStrandTexture,
  PUDDLE_PATTERNS,
  tiled
} from '../world/textures.js';
import { loadModel, applyTextureByMaterialName } from '../world/modelLoader.js';
import { MINIMAP_ONLY, MAIN_ONLY } from '../core/RenderLayers.js';
import { gameState } from '../core/GameState.js';
import { line } from '../dialogue/index.js';
import doorModelUrl from '../assets/models/door.glb?url';
import {
  CORRIDORS, ROUTE, BOX, LEGS, CROSSINGS, DOORWAYS, buildWallRuns, runCollider,
  validateMaze, junctions, deadEnd, sideWall, legMid, spawnPoint, exitPoint, nameNoise, crossingFor,
  MAZE, drawCrossing, EXIT_SPOTS
} from './backroomsMaze.js';
import { dressAnnabelleRooms } from './annabelleRooms.js';

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

/**
 * THE EXIT DOORS SWING ON A HINGE WITH WEIGHT, and you leave by walking
 * through one. Each stands in an opening cut in the end wall behind it
 * (EXIT_DOORWAY), with a short dark passage beyond (EXIT_PASSAGE) for the leaf
 * to swing into and the player to step into -- the level ends once they are
 * EXIT_PASSAGE.exitDepth into it. Door 2's passage has 1.6 m of solid before
 * the corridor behind it (V2_2-6), so 1.24 m deep leaves a wall's width.
 *
 * EXIT_DOOR_SWING is the leaf, in radians and seconds. Unlatched, it is shoved
 * open at `unlatchSpeed`, slowed by `damping` (in proportion to its speed) and
 * `friction` (a constant drag, so it comes to rest rather than creeping), and
 * stopped at `open` -- short of square, so it clears the passage wall -- with
 * `stopBounce` of its speed back. The player is a `bodyRadius` circle it cannot
 * pass through: walked into, it is pushed ahead of them and keeps up to
 * `pushCarry` rad/s of the push. The wrong door does not open at all: it
 * jolts `rattleAngle` against its latch for `rattleSeconds` while the knob
 * turns `knobTurn` and snaps back.
 */
const EXIT_DOORWAY = { halfWidth: 0.55, height: 2.05 };
const EXIT_PASSAGE = { halfWidth: 0.6, depth: 1.24, exitDepth: 0.35 };
const EXIT_DOOR_SWING = {
  open: THREE.MathUtils.degToRad(92), unlatchSpeed: 2.2, nudge: 1.4,
  damping: 1.3, friction: 0.35, stopBounce: 0.3, frameBounce: 0.15,
  leafLength: 1.0, bodyRadius: 0.35, pushCarry: 3.5,
  rattleSeconds: 0.45, rattleAngle: 0.012, knobTurn: 0.45
};
/** In a door frame's own space: where the leaf's hinge is, and how far in front of the wall the frame stands. */
const EXIT_HINGE = { x: -0.5, z: 0.025 };
const EXIT_FRAME_PROUD = 0.06;

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

export function createBackroomsLevel({
  showCaption = () => {},
  onThought = () => {},
  onExit = () => {},
  // The exit door starting to swing, with its world position.
  onDoorOpening = () => {},
  // A sound effect by name (AudioDirector's SFX), with its world `position`.
  onSfx = () => {}
} = {}) {
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
  // A pair per crossing -- each comes in and goes out somewhere different --
  // and only the current crossing's pair is ever shown.
  const inFrom = (e, d) => ({ x: e.x + e.nx * d, z: e.z + e.nz * d });
  const marks = {};
  for (const key of Object.keys(CROSSINGS)) {
    marks[key] = {
      exitLeg: CROSSINGS[key].exit,
      entryLeg: CROSSINGS[key].enter,
      exit: addLandmark(inFrom(exitPoint(key), 1.1), 0xffd257, 2.2),
      entry: addLandmark(inFrom(spawnPoint(key).door, 0.9), 0x6b6355, 1.8)
    };
  }

  const CORRIDOR_LIST = Object.entries(CORRIDORS);
  let hereQuad = null;

  /**
   * The player is at (x, z) -- reveal whatever corridor that is, forever.
   *
   * Called from main.js's frame loop. A point-in-rect scan over 42 rectangles
   * per frame is nothing, and doing it here rather than in the map keeps the
   * rectangles owned by the level that generated them.
   */
  const thoughtCorridors = new Set();
  function revealAt(x, z) {
    let here = null;
    for (const [name, r] of CORRIDOR_LIST) {
      if (x < r[0] || x > r[1] || z < r[2] || z > r[3]) continue;
      here = here ?? mapQuads[name];
      // The way in and the way out are this crossing's own, drawn fresh each
      // time: shown once the player has stood in them THIS crossing, never
      // from a corridor the first crossing happened to reveal.
      const m = marks[crossing];
      if (name === m.exitLeg) m.exit.visible = true;
      if (name === m.entryLeg) m.entry.visible = true;
      if (gameState.corridorsSeen.has(name)) continue;
      gameState.corridorsSeen.add(name);
      mapQuads[name].visible = true;
    }
    if (here === hereQuad) return;
    // Reuse the map's corridor-entry event, rather than adding another scan.
    const name = Object.keys(mapQuads).find((key) => mapQuads[key] === here);
    if (name) {
      if (thoughtCorridors.has(name) && thoughtCorridors.size >= 3) onThought('backrooms_02');
      thoughtCorridors.add(name);
      if (thoughtCorridors.size >= 8) {
        onThought('backrooms_03');
        onThought('backrooms_04');
      }
      if (LEGS[name].kind === 'room' && thoughtCorridors.size >= 8) onThought('backrooms_05');
    }
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
    thoughtCorridors.clear();
    for (const [name, q] of Object.entries(mapQuads)) {
      q.visible = gameState.corridorsSeen.has(name);
      q.material = minimapFloorMat;
    }
    hereQuad = null;
    for (const m of Object.values(marks)) {
      m.exit.visible = false;
      m.entry.visible = false;
    }
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

  /**
   * The opening an exit door stands in, if the wall run (axis, at, from..to) is
   * the one behind an exit door: { from, to } along the run. The doors face
   * along their wall's normal, so a door whose `axis` is the run's axis and
   * whose position is on its line stands in it.
   */
  const EXIT_GAPS = EXIT_SPOTS.map((door) => {
    const along = door.axis === 'z' ? door.x : door.z;
    return {
      axis: door.axis,
      at: door.axis === 'z' ? door.z : door.x,
      from: along - EXIT_DOORWAY.halfWidth,
      to: along + EXIT_DOORWAY.halfWidth
    };
  });
  function exitGapOn(axis, at, from, to) {
    return EXIT_GAPS.find((g) => g.axis === axis && Math.abs(g.at - at) < 0.05 && g.from > from && g.to < to) ?? null;
  }

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
  // Collected so they can be merged into one draw call per material below.
  const wallAndTideMeshes = [];

  function addWallPiece(axis, at, from, to) {
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
    wallAndTideMeshes.push(wall, tide);
  }

  /**
   * The wall over an exit doorway, from the top of the opening to the ceiling:
   * the same paper, cropped to that band rather than squeezed into it, so it
   * runs on from the walls either side.
   */
  function addLintel(axis, at, from, to) {
    const len = to - from;
    const band = HALL_H - EXIT_DOORWAY.height;
    const crop = (tex) => {
      const t = tiled(tex, len / 2.12, band / HALL_H);
      t.offset.y = EXIT_DOORWAY.height / HALL_H;
      return t;
    };
    const lintel = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
      map: crop(wallpaperTex),
      normalMap: crop(wallpaperNormal),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.93,
      side: THREE.DoubleSide
    }));
    lintel.scale.set(len, band, 1);
    const mid = (from + to) / 2;
    const y = EXIT_DOORWAY.height + band / 2;
    if (axis === 'x') {
      lintel.position.set(at, y, mid);
      lintel.rotation.y = Math.PI / 2;
    } else {
      lintel.position.set(mid, y, at);
    }
    group.add(lintel);
  }

  WALL_RUNS.forEach(({ axis, at, from, to }) => {
    const gap = exitGapOn(axis, at, from, to);
    if (!gap) {
      addWallPiece(axis, at, from, to);
      return;
    }
    addWallPiece(axis, at, from, gap.from);
    addWallPiece(axis, at, gap.to, to);
    addLintel(axis, at, gap.from, gap.to);
  });
  // ~180 wall panels and as many skirting boards were a draw call each. One
  // per material now (the walls are pooled by length in wallMatFor, the
  // skirting all share tideMat). Nothing reads these meshes after this point:
  // the colliders above come from WALL_RUNS, not from the meshes.
  mergeStaticMeshesByMaterial(wallAndTideMeshes, group, 'Walls');

  // ---------- damp stains, per wall ----------
  // THESE USED TO LIVE IN THE WALLPAPER CANVAS, and that was the bug. One
  // texture is shared by every wall and tiles every 2.12 m, so three stains
  // baked into it came out as thirty on a 22 m corridor -- ten identical
  // groups of three, every one at the same height off the skirting. It read as
  // a printed pattern, and no amount of thinning fixed it, because the fault
  // was the repetition rather than the count.
  //
  // As decals they are placed per WALL RUN at real-world size, so "three max"
  // means three on that wall. Most walls get none.
  //
  // DETERMINISTIC, from the run's own geometry. Math.random() here would deal
  // a different level every reload and make "the wall by the third turn has two
  // stains" impossible to check -- the same reason nameNoise() exists for the
  // per-leg dressing. Wall runs have no names, so the seed is their
  // coordinates, quantised to the 0.1 grid the layout is already proved to sit
  // on (see validateMaze's isTenth rule).
  const STAIN_VARIANTS = [0, 1, 2, 3, 4, 5].map((i) => createDampStainTexture(i));
  const stainMats = STAIN_VARIANTS.map((map) => new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    // Coplanar with the wall, pulled forward in DEPTH only. The alternative --
    // offsetting along the wall normal -- needs to know which side the corridor
    // is on, and a run between two parallel corridors has two. polygonOffset
    // works from either side at once.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
    roughness: 0.92
  }));
  const stainGeo = new THREE.PlaneGeometry(1, 1);

  const runSeed = (axis, at, from, to) => {
    let h = axis === 'x' ? 0x9e3779b9 : 0x85ebca6b;
    for (const v of [at, from, to]) {
      h = (Math.imul(h ^ (Math.round(v * 10) + 0x27d4eb2f), 2654435761)) >>> 0;
    }
    return h;
  };
  const lcg = (seed) => {
    let t = seed >>> 0;
    return () => {
      t = (Math.imul(t, 1664525) + 1013904223) >>> 0;
      return t / 4294967296;
    };
  };

  /**
   * How many marks a surface of this span gets: nought to three, deterministic.
   *
   * ONE RULE FOR EVERY SURFACE. The walls, the floor, the ceiling and all four
   * kinds of blood call this, which is what makes "the same frequency as the
   * wall dirt stains" true by construction instead of by six sets of
   * hand-tuned numbers that drift the first time one of them is touched.
   *
   * `spacing` is the physical room one mark needs. A surface that cannot fit
   * three without them merging gets fewer -- two merged marks are one big
   * mark, which loses the count the whole design is about. It also sets the
   * threshold for three: at 2.2 m a wall needs 6.6 m, and at 2.6 it needed 7.8,
   * which only seventeen of the two hundred runs clear. That produced exactly
   * one three-stain wall in the level, and a variation the player never meets
   * is not a variation.
   *
   * CLEAN IS THE DEFAULT and it is a flat 45% whatever the span. A level where
   * every surface is marked has no marked surfaces in it -- the eye stops
   * reading damage the moment it stops being an exception.
   *
   * Among the surfaces that ARE marked, longer ones carry more, which is both
   * physically sensible and what keeps the top of the range reachable.
   */
  const decalCount = (rand, span, spacing, clean = 0.45) => {
    const cap = Math.min(3, Math.floor(span / spacing));
    if (cap <= 0 || rand() < clean) return 0;
    const lean = Math.min(1, (span - spacing) / 10);
    const r = rand();
    return Math.min(cap, r < 0.62 - 0.30 * lean ? 1 : r < 0.90 - 0.10 * lean ? 2 : 3);
  };

  let stainCount = 0;
  let stainMaxH = 0;
  WALL_RUNS.forEach(({ axis, at, from, to }) => {
    const len = to - from;
    const rand = lcg(runSeed(axis, at, from, to));
    const n = decalCount(rand, len, 2.2);
    for (let i = 0; i < n; i++) {
      const w = 0.72 + rand() * 0.62;
      // CLAMPED TO THE WALL. Height was derived from width alone, which let a
      // wide draw reach 2.9 m on a 2.35 m wall -- the quad ran through the
      // ceiling and the stain became a full-height smear instead of rising
      // damp. 0.72 of the hall height puts the top of the quad at 1.69 m, and
      // the gradient has faded out well before that.
      const h = Math.min(HALL_H * 0.72, w * (1.5 + rand() * 0.9));
      // Spread along the run in even bands with jitter inside each, rather
      // than independent uniform draws: two independent draws land on top of
      // each other often enough to matter at n = 3, and two merged stains are
      // one big stain, which loses the count the brief actually asked for.
      const band = (i + 0.5) / n;
      const along = from + len * Math.min(0.92, Math.max(0.08,
        band + (rand() - 0.5) * (0.7 / n)));
      // Not across an exit doorway, where there is no wall to stain.
      const gap = exitGapOn(axis, at, from, to);
      if (gap && along + w / 2 > gap.from && along - w / 2 < gap.to) continue;
      const stain = new THREE.Mesh(stainGeo, stainMats[Math.floor(rand() * stainMats.length)]);
      // Rising damp: the quad sits ON the skirting, so the stain's dense end
      // is at the floor where the canvas puts it.
      stain.scale.set(w * (rand() < 0.5 ? -1 : 1), h, 1);
      if (axis === 'x') {
        stain.position.set(at, h / 2, along);
        stain.rotation.y = Math.PI / 2;
      } else {
        stain.position.set(along, h / 2, at);
      }
      group.add(stain);
      stainCount++;
      stainMaxH = Math.max(stainMaxH, h);
    }
  });
  if (stainMaxH > HALL_H) {
    console.error('backroomsLevel: a damp stain is ' + stainMaxH.toFixed(2)
      + ' m tall on a ' + HALL_H + ' m wall, so it runs through the ceiling. '
      + 'Rising damp has to stay under the hall height -- check the clamp on h '
      + 'in the stain pass.');
  }
  if (stainCount === 0) {
    console.error('backroomsLevel: no damp stains were placed on any of the '
      + WALL_RUNS.length + ' wall runs. The wallpaper no longer carries them, '
      + 'so the corridor is now perfectly clean -- check the length gate in the '
      + 'stain pass against the actual run lengths.');
  }

  // ---------- decals: floor damp, and blood ----------
  //
  // Everything below hangs off decalCount() above, so the floor and the ceiling
  // are dirty at the SAME rate as the walls by construction rather than by
  // three sets of hand-tuned numbers that drift apart the first time one is
  // touched. The brief for the blood was explicitly "the same frequency as the
  // wall dirt stains", and that is what sharing the function means.
  //
  // WHY THE FLOOR NEEDED THIS AT ALL. The carpet had nine wet patches and six
  // mould blooms baked into a 512 canvas, and the floor is ONE plane spanning
  // the whole 53 x 53 m bounding box tiled every 2.6 m -- 424 tiles. Nine
  // became about 3,800, six became about 2,500, and all of them sat on a
  // dead-regular 2.6 m grid. Exactly the wallpaper's problem, an order of
  // magnitude worse.
  //
  // The UNIT of variation differs per surface and that is deliberate. A wall is
  // a run; a floor and a ceiling belong to a CORRIDOR, because that is the
  // thing a player walks down and forms an impression of. Necks are excluded --
  // a 1.4 m doorway cannot hold a 1.5 m pool.
  const stainableLegs = Object.keys(LEGS).filter((n) => LEGS[n].kind !== 'neck');
  const legSpan = (n) => Math.abs(LEGS[n].to - LEGS[n].from);

  /** FNV-1a over a name, full 32 bits. nameNoise() quantises to 10,000 buckets. */
  const hashName = (name, salt) => {
    let h = (2166136261 ^ salt) >>> 0;
    for (let i = 0; i < name.length; i++) {
      h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
    }
    return h;
  };

  /**
   * A point inside a leg's rectangle, inset far enough that a decal of `size`
   * cannot cross the wall. On a 3.2 m corridor a 1.5 m decal leaves only 0.3 m
   * of freedom across, so the across-axis collapses to the centre-line rather
   * than clamping to one side and stacking every decal against the same wall.
   */
  const pointInLeg = (name, rand, size) => {
    const [x0, x1, z0, z1] = CORRIDORS[name];
    const m = size / 2 + 0.1;
    const span = (lo, hi) => (hi - lo <= 2 * m ? (lo + hi) / 2 : lo + m + rand() * (hi - lo - 2 * m));
    return { x: span(x0, x1), z: span(z0, z1) };
  };

  const decalMat = (map, roughness, extra = {}) => new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    roughness,
    ...extra
  });

  // SIX VARIANTS OF EACH, not one. The brief asked for the blood specifically to
  // carry the most variation of anything in here, and a decal is only as varied
  // as its texture set -- placement jitter cannot hide that two marks are the
  // same shape, which is the whole lesson of the tiling wallpaper.
  const VARIANTS = 6;
  const seeds = Array.from({ length: VARIANTS }, (_, i) => i);
  // 0.82 against the carpet's own 0.97. Damp carpet is matted and slightly
  // glossier than dry pile, and since these decals are colour-only -- no normal
  // map of their own -- the roughness step is the only thing distinguishing a
  // damp patch from a painted one when the torch rakes across it.
  const floorStainMats = seeds.map((i) => decalMat(createFloorStainTexture(i), 0.82));
  // ROUGHNESS IS WHAT MAKES A POOL WET, and it is not a detail. Nothing painted
  // into an albedo map reads as liquid under a moving torch; a sharp specular
  // highlight sliding across it does. 0.18 against the carpet's 0.97 is the
  // single strongest cue in this whole pass -- a wet pool and a dry patch are
  // nearly the same colour and are told apart almost entirely by this number.
  const bloodPoolMats = seeds.map((i) => decalMat(createBloodPoolTexture(i), 0.18));
  const bloodDryMats = seeds.map((i) => decalMat(createBloodDryTexture(i), 0.95));
  const bloodRunMats = seeds.map((i) => decalMat(createBloodWallRunTexture(i), 0.38));
  const bloodCeilMats = seeds.map((i) => decalMat(createBloodCeilingTexture(i), 0.46));
  const bloodStrandMats = seeds.map((i) => decalMat(createBloodDripStrandTexture(i), 0.32,
    { side: THREE.DoubleSide }));

  const pick = (arr, rand) => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
  const flatGeo = new THREE.PlaneGeometry(1, 1);

  /** A quad lying flat at height y, face up or down. */
  const addFlat = (mat, x, y, z, size, spin, faceDown = false) => {
    const m = new THREE.Mesh(flatGeo, mat);
    m.position.set(x, y, z);
    m.rotation.set(faceDown ? Math.PI / 2 : -Math.PI / 2, 0, spin);
    m.scale.set(size, size, 1);
    group.add(m);
    return m;
  };

  /**
   * How often a surface is CLEAN of blood, against 0.45 for the damp stains.
   *
   * Blood started at the damp stains' own 0.45, which is what "the same
   * frequency as the wall dirt stains" literally produces -- and what it
   * produced was 218 marks, which is a massacre rather than a trace. Halved to
   * 109 by raising the clean rate rather than by capping the count, so the
   * places that DO have blood still carry one to three marks and still read as
   * something having happened there; there are simply half as many of them.
   * Thinning every scene instead would have left a level uniformly flecked with
   * single drops, which is the weaker picture.
   *
   * Blood being rarer than damp is also the right ordering: damp is what the
   * building does on its own, blood is an event.
   */
  const BLOOD_CLEAN = 0.74;

  const counts = { floorDamp: 0, pool: 0, dryFloor: 0, wallRun: 0, dryWall: 0, ceiling: 0, strand: 0 };

  // --- damp on the carpet, per corridor ---
  stainableLegs.forEach((name) => {
    const rand = lcg(hashName(name, 53));
    const n = decalCount(rand, legSpan(name), 3.0);
    for (let i = 0; i < n; i++) {
      const size = 1.05 + rand() * 0.95;
      const p = pointInLeg(name, rand, size);
      addFlat(pick(floorStainMats, rand), p.x, 0.006, p.z, size, rand() * Math.PI * 2);
      counts.floorDamp++;
    }
  });

  // --- blood on the carpet: pools and dry patches, per corridor ---
  stainableLegs.forEach((name) => {
    const rand = lcg(hashName(name, 59));
    const n = decalCount(rand, legSpan(name), 3.0, BLOOD_CLEAN);
    for (let i = 0; i < n; i++) {
      // Alternated rather than drawn independently, so a corridor that has
      // blood in it reliably shows BOTH states. Two independent coin flips give
      // an all-wet or all-dry corridor a quarter of the time, and the contrast
      // between fresh and old is the thing worth having.
      const wet = (i % 2 === 0) === (rand() < 0.62);
      const size = (wet ? 1.0 : 0.85) + rand() * 0.95;
      const p = pointInLeg(name, rand, size);
      // A pool sits fractionally higher than a dry patch so that where the two
      // overlap the wet one wins -- fresh blood runs over old, never under.
      addFlat(pick(wet ? bloodPoolMats : bloodDryMats, rand),
        p.x, wet ? 0.010 : 0.008, p.z, size, rand() * Math.PI * 2);
      if (wet) counts.pool++; else counts.dryFloor++;
    }
  });

  // --- blood on the ceiling, with drips still hanging off it ---
  stainableLegs.forEach((name) => {
    const rand = lcg(hashName(name, 61));
    const n = decalCount(rand, legSpan(name), 3.4, BLOOD_CLEAN);
    for (let i = 0; i < n; i++) {
      const size = 0.95 + rand() * 1.0;
      const p = pointInLeg(name, rand, size);
      addFlat(pick(bloodCeilMats, rand), p.x, HALL_H - 0.006, p.z, size,
        rand() * Math.PI * 2, true);
      counts.ceiling++;
      // The strands are what make it READ as dripping rather than as a stain on
      // the ceiling. They hang from inside the stain's own radius so the paint
      // and the geometry agree about where the drip is coming from.
      const strands = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < strands; k++) {
        const len = 0.14 + rand() * 0.34;
        const a = rand() * Math.PI * 2;
        const d = rand() * size * 0.3;
        const s = new THREE.Mesh(flatGeo, pick(bloodStrandMats, rand));
        s.position.set(p.x + Math.cos(a) * d, HALL_H - len / 2, p.z + Math.sin(a) * d);
        // Random yaw: a row of strands all facing the same way is a row of
        // billboards, and at 0.05 m wide the edge-on ones are the tell.
        s.rotation.y = rand() * Math.PI;
        s.scale.set(0.05 + rand() * 0.05, len, 1);
        group.add(s);
        counts.strand++;
      }
    }
  });

  // --- blood on the walls: runs coming down, and dry smears ---
  WALL_RUNS.forEach(({ axis, at, from, to }) => {
    const len = to - from;
    const rand = lcg(runSeed(axis, at, from, to) ^ 0x5bf03635);
    const n = decalCount(rand, len, 2.2, BLOOD_CLEAN);
    for (let i = 0; i < n; i++) {
      const running = rand() < 0.66;
      const w = (running ? 0.46 : 0.58) + rand() * 0.5;
      const h = running ? Math.min(HALL_H * 0.82, w * (2.0 + rand() * 1.7))
        : Math.min(HALL_H * 0.5, w * (0.85 + rand() * 0.5));
      const band = (i + 0.5) / n;
      const along = from + len * Math.min(0.92, Math.max(0.08,
        band + (rand() - 0.5) * (0.7 / n)));
      // A RUN HANGS FROM THE TOP, a smear sits where a body touched the wall.
      // createBloodWallRunTexture is top-anchored for exactly this reason, so
      // the quad's top edge goes near the ceiling and the rivulets fall out of
      // it; hanging one from the middle puts the source smear at waist height
      // with the blood running up out of nothing.
      const y = running ? HALL_H - 0.08 - h / 2 : 0.45 + rand() * 0.95;
      const mesh = new THREE.Mesh(flatGeo, pick(running ? bloodRunMats : bloodDryMats, rand));
      mesh.scale.set(w * (rand() < 0.5 ? -1 : 1), h, 1);
      if (axis === 'x') {
        mesh.position.set(at, y, along);
        mesh.rotation.y = Math.PI / 2;
      } else {
        mesh.position.set(along, y, at);
      }
      group.add(mesh);
      if (running) counts.wallRun++; else counts.dryWall++;
    }
  });

  // Every kind the brief named has to actually appear. These are cheap and they
  // fail loudly, which matters because a kind that silently never places looks
  // exactly like a kind that is merely rare -- and the maze's leg names are the
  // seed, so renaming one corridor is enough to shift every draw in here.
  for (const [kind, n] of Object.entries(counts)) {
    if (n === 0) {
      console.error('backroomsLevel: not one "' + kind + '" decal was placed across '
        + stainableLegs.length + ' corridors and ' + WALL_RUNS.length + ' wall runs. '
        + 'The brief asked for pools, dry patches, ceiling drips and wall runs to all '
        + 'be present -- check decalCount and the spacing gate for this pass.');
    }
  }

  // ---------- the room doorways ----------
  // WHAT MAKES AN ENTRANCE READ AS A DOOR IS ITS TOP EDGE, not its sides. The
  // neck legs in backroomsMaze already narrow the opening to 1.4 m and the wall
  // builder gives it jambs for free -- the boundary of the corridor union runs
  // down both sides of the neck where it pierces the 1.6 m wall. What the union
  // cannot produce is a HEADER, because the walls it builds are floor to
  // ceiling and the opening it leaves is too: a 1.4 m full-height slot reads as
  // a gap where a wall is missing, which is exactly the modelling-error look
  // this is supposed to avoid.
  //
  // So each neck gets a soffit dropped over its whole 1.6 m length. That gives
  // the opening a lintel at 2.05 m, a 0.30 m header above it, and a reveal deep
  // enough to be a doorway rather than a hole punched in a sheet.
  //
  // No collider. The player cannot leave the floor, so the only thing a
  // collider up there could do is snag them in the doorway.
  const DOOR_H = 2.05;
  DOORWAYS.forEach(({ neck, tunnel: [t0, t1] }) => {
    const L = LEGS[neck];
    // The tunnel is the stretch of the neck between the corridor's face and
    // the room's, measured along the neck's own axis -- derived by buildMaze(),
    // so moving a room cannot leave a soffit hanging in the corridor.
    const soffit = new THREE.Mesh(
      new THREE.BoxGeometry(
        L.axis === 'z' ? L.w : t1 - t0,
        HALL_H - DOOR_H,
        L.axis === 'z' ? t1 - t0 : L.w
      ),
      wallMatFor(t1 - t0)
    );
    soffit.position.set(
      L.axis === 'z' ? L.at : (t0 + t1) / 2,
      (DOOR_H + HALL_H) / 2,
      L.axis === 'z' ? (t0 + t1) / 2 : L.at
    );
    soffit.receiveShadow = true;
    group.add(soffit);
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
      mount,
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

  // One over each way in, so the corridor is not pitch black the instant you
  // step into it, and one over each way out. Two of each: the maze is crossed
  // twice, in and out at different places each time (CROSSINGS).
  const across = (axis) => (axis === 'z' ? 'x' : 'z');
  const spawnLamps = {};
  for (const key of Object.keys(CROSSINGS)) {
    const at = spawnPoint(key);
    // 0.4 m on past where the player stands, so it hangs just in front of them.
    addFixture(at.x + at.door.nx * 0.4, at.z + at.door.nz * 0.4, {
      along: across(at.door.axis), mode: 'dying', colour: 0xffd07a, base: 1.5, dist: 6.5, decay: 1.7,
      emissive: 0xffdca0, emissiveIntensity: 1.9, wear: 0.71
    });
    spawnLamps[key] = lamps[lamps.length - 1];
  }

  /**
   * Moves a lit fixture -- housing, light and glare -- to (x, z), its tubes
   * running across `along`. Position only: the light count never changes, so
   * no shader recompiles.
   */
  function moveFixture(lamp, x, z, along) {
    lamp.mount.position.set(x, HALL_H, z);
    lamp.mount.rotation.y = along !== 'x' ? Math.PI / 2 : 0;
    lamp.light.position.set(x, 2.10, z);
    lamp.glare.position.set(x, HALL_H - 0.21, z);
  }

  // The only bright steady light in the level sits over the exit, and it is the
  // one fixture exempt from the blackouts below. The destination is the one
  // stable thing here -- the light does the signage, and during a blackout it
  // becomes the only lit thing in the maze, which turns the blackout into a
  // direction rather than only a punishment.
  //
  // One per crossing; only the CURRENT crossing's exit lamp gets the signage
  // treatment (setRoute picks it). The other is an ordinary failing fixture,
  // so it never lures a player to the door that will not open for them.
  const exitLamps = {};
  for (const key of Object.keys(CROSSINGS)) {
    const at = exitPoint(key);
    addFixture(at.x + at.nx * 1.2, at.z + at.nz * 1.2, {
      along: across(at.axis), mode: 'steady', colour: 0xffe0a4, base: 1.95, dist: 9, decay: 1.5,
      emissive: 0xfff0c0, emissiveIntensity: 1.9,
      // The one fixture with an intact, barely-grimed lens, and a halo half
      // again as wide. It is signage: it has to be the thing you pick out from
      // the far end of a corridor, and during a blackout it is the only lit
      // object on the floor.
      wear: 0.32, glareSize: 1.45
    });
    exitLamps[key] = lamps[lamps.length - 1];
  }
  let exitLamp = exitLamps.first;

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

  // ---------- the exit doors ----------
  //
  // One per crossing, because the maze is left by a different door each time:
  // Door 1, at the top of the drawing, out to Level 2; Door 2, inside the
  // central room, out to Level 3. setRoute() says which crossing this is, and
  // the other door stays shut -- it is there, it is a door, and it is not the
  // way this time.
  let route = null;
  let crossing = 'first';
  let outFade = 1;
  /** The exit lamp's own fade: it stays lit until the player has gone through the door. */
  let exitFade = 1;

  // Deliberately lighter than createFurnitureWoodTexture's default (60,44,30),
  // which is tuned for the bedroom's warm bulb. This level's albedo is roughly
  // 3.5x brighter and its ambient is a third of everywhere else, so the default
  // tint rendered the door as a flat black rectangle with only the brass knob
  // catching any light -- the one object in the corridor the player has to be
  // able to see.
  const furnitureWoodTex = createFurnitureWoodTexture({ tint: [128, 96, 60] });
  const exitPassageMat = new THREE.MeshStandardMaterial({ color: 0x0b0906, roughness: 1, side: THREE.DoubleSide });
  const furnitureWoodNormal = createFurnitureWoodNormalTexture();

  /**
   * door.glb in this level's lighter wood. A fresh parse per call (THREE.Cache
   * is off), so each copy owns its materials and they are safe to mutate.
   */
  function loadDoorModel() {
    return loadModel(doorModelUrl).then((doorModel) => {
      doorModel.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      applyTextureByMaterialName(doorModel, 'DoorWood', furnitureWoodTex, furnitureWoodNormal);
      applyTextureByMaterialName(doorModel, 'DoorFrameWood', furnitureWoodTex, furnitureWoodNormal);
      // Let the canvas texture actually BE the albedo: blender/build_door.py
      // bakes DOOR_WOOD (0.13, 0.08, 0.05) into baseColorFactor, and map *
      // color put the door at ~6% reflectance -- a flat black rectangle against
      // this level's bright wallpaper.
      doorModel.traverse((child) => {
        if (child.isMesh && child.material && child.material.map) child.material.color.setScalar(1);
      });
      return doorModel;
    });
  }

  function clawMarksMesh(scale = 1) {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(0.5 * scale, 0.5 * scale),
      new THREE.MeshStandardMaterial({
        map: createClawMarksTexture(),
        normalMap: createClawMarksNormalTexture(),
        normalScale: new THREE.Vector2(1.2, 1.2),
        transparent: true,
        roughness: 0.95
      })
    );
  }

  /**
   * WALL PLUGS. Every spot a crossing can draw its exit at has its opening cut
   * (EXIT_GAPS), because the walls are merged into a few draw calls at boot
   * and cannot be re-cut later. Every opening not in use this crossing is
   * filled with a piece of the same wall, collider and all.
   */
  const exitPlugs = EXIT_GAPS.map(({ axis, at, from, to }) => {
    const len = to - from;
    const mid = (from + to) / 2;
    const plug = new THREE.Group();
    const wall = new THREE.Mesh(wallGeo, wallMatFor(len));
    wall.scale.set(len, EXIT_DOORWAY.height, 1);
    wall.position.y = EXIT_DOORWAY.height / 2;
    wall.receiveShadow = true;
    const tide = new THREE.Mesh(tideGeo, tideMat);
    tide.scale.set(len, 0.10, 0.02);
    tide.position.y = 0.05;
    plug.add(wall, tide);
    if (axis === 'x') {
      plug.position.set(at, 0, mid);
      plug.rotation.y = Math.PI / 2;
    } else {
      plug.position.set(mid, 0, at);
    }
    group.add(plug);
    const box = runCollider({ axis, at, from, to });
    const collider = { ...box };
    colliders.push(collider);
    return { plug, box, collider };
  });

  const exitDoors = {};
  for (const key of Object.keys(CROSSINGS)) {
    const at = exitPoint(key);
    const frame = new THREE.Group();
    frame.position.set(at.x + at.nx * 0.06, 0, at.z + at.nz * 0.06);
    // door.glb is authored facing +Z; turned to face back the way the player
    // comes, with its 0.06 m frame depth running into the wall behind it.
    frame.rotation.y = Math.atan2(at.nx, at.nz);
    group.add(frame);

    // The leaf's own edge, opposite the knob. A positive turn swings it into
    // the frame's local -Z: away from the player, into the passage.
    const hinge = new THREE.Object3D();
    hinge.position.set(EXIT_HINGE.x, 1.0, EXIT_HINGE.z);
    frame.add(hinge);

    // Claw marks raked into the lower panel, same placement the bedroom door
    // uses. The 0.13 matters: the raised panels reach z = 0.105, so anything
    // shallower is buried inside the geometry.
    const claws = clawMarksMesh(0.9);
    claws.position.set(-0.15, 0.68, 0.13);
    frame.add(claws);

    const door = {
      key, frame, hinge, nx: at.nx, nz: at.nz,
      /** Shut and latched until E unlatches it, on this crossing's door only. */
      opened: false,
      angle: 0,
      speed: 0,
      /** Which side of the leaf the player is on, +1 or -1, kept while they touch it. */
      playerSide: -1,
      exited: false,
      rattle: 0,
      knob: null
    };

    loadDoorModel().then((doorModel) => {
      frame.add(doorModel);
      // The WHOLE leaf -- panel, window, bars, rails, knob -- hangs off this one
      // empty in build_door.py. Only the panel and knob used to be moved onto
      // the hinge, so the rest of the door stayed in the frame as it opened.
      // attach(), not add(): it keeps the world transform, so nothing jumps
      // when this async load resolves, whatever angle the leaf is at.
      const leaf = doorModel.getObjectByName('doorLeaf');
      if (leaf) hinge.attach(leaf);
      door.knob = (leaf ?? doorModel).getObjectByName('knobHandle');
      hinge.attach(claws);
    }).catch((err) => console.error(`Failed to load door.glb for the backrooms exit (${key}):`, err));

    /**
     * The dark passage behind the opening, in the frame's space: the wall is
     * EXIT_FRAME_PROUD behind the frame, and the passage runs back from it.
     * Near-black rather than lit, because the corridor's lights cast no
     * shadows and would otherwise light it through the wall.
     */
    const back = -EXIT_FRAME_PROUD;
    const deep = back - EXIT_PASSAGE.depth;
    const mid = (back + deep) / 2;
    const width = EXIT_PASSAGE.halfWidth * 2;
    for (const [w, h, x, y, z, rx, ry] of [
      [EXIT_PASSAGE.depth, HALL_H, -EXIT_PASSAGE.halfWidth, HALL_H / 2, mid, 0, Math.PI / 2],
      [EXIT_PASSAGE.depth, HALL_H, EXIT_PASSAGE.halfWidth, HALL_H / 2, mid, 0, -Math.PI / 2],
      [width, HALL_H, 0, HALL_H / 2, deep, 0, 0],
      [width, EXIT_PASSAGE.depth, 0, 0.002, mid, -Math.PI / 2, 0],
      [width, EXIT_PASSAGE.depth, 0, HALL_H, mid, Math.PI / 2, 0]
    ]) {
      const piece = new THREE.Mesh(new THREE.PlaneGeometry(w, h), exitPassageMat);
      piece.position.set(x, y, z);
      piece.rotation.set(rx, ry, 0);
      frame.add(piece);
    }
    // The passage's walls, and across the opening while the door is latched
    // (parked out of the way once it is not, after which the leaf itself
    // stands in the player's way). Worked out by fitDoor(), again each time a
    // crossing moves the door onto its drawn spot.
    door.passageBoxes = [{}, {}, {}];
    door.latchBox = {};
    fitDoor(door);
    colliders.push(...door.passageBoxes);
    door.latchCollider = { ...door.latchBox };
    colliders.push(door.latchCollider);

    // Invisible hitbox on the leaf, so the prompt goes where the door goes and
    // an open doorway is not covered by an invisible door. Interaction's
    // raycast is non-recursive, so this Mesh is what makes the door work at
    // all, and it is here before the model has loaded.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 2.0, 0.06),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    slab.position.set(-EXIT_HINGE.x, 0, -EXIT_HINGE.z);
    hinge.add(slab);
    door.slab = slab;

    slab.userData.interact = {
      // No '[E] ' prefix -- Interaction.js prepends it.
      label: 'Open the door',
      onInteract: () => {
        if (key !== crossing) {
          // It is a door, and it will not open: the leaf jolts on its latch
          // and the knob turns and snaps back, with the sound.
          door.rattle = EXIT_DOOR_SWING.rattleSeconds;
          onSfx('door_locked_rattle', { position: slab.getWorldPosition(new THREE.Vector3()) });
          showCaption(line('dialog_exit_door_not_this_way'));
          return;
        }
        if (!door.opened) {
          // Unlatched and shoved: from here it is the hinge's to swing.
          door.opened = true;
          door.speed = EXIT_DOOR_SWING.unlatchSpeed;
          door.latchCollider.minX = door.latchCollider.maxX = -1000;
          onDoorOpening(slab.getWorldPosition(new THREE.Vector3()));
          showCaption(line('dialog_exit_door_opens'));
          return;
        }
        // Not far open yet: another push. Wide open: there is nothing to do but go through.
        if (door.angle < EXIT_DOOR_SWING.open / 2) {
          door.speed = Math.max(door.speed, EXIT_DOOR_SWING.nudge);
        } else {
          showCaption(line('dialog_exit_door_already_open'));
        }
      }
    };
    interactables.push(slab);
    exitDoors[key] = door;
  }

  /** A point in a door frame's own space (x across it, z out of the wall), in the world, as { x, z }. */
  function frameToWorld(door, lx, lz) {
    return {
      x: door.frame.position.x + lx * door.nz + lz * door.nx,
      z: door.frame.position.z - lx * door.nx + lz * door.nz
    };
  }
  /** The other way: a world point in a door frame's own space. */
  function worldToFrame(door, x, z) {
    const dx = x - door.frame.position.x;
    const dz = z - door.frame.position.z;
    return { x: dx * door.nz - dz * door.nx, z: dx * door.nx + dz * door.nz };
  }
  /**
   * The door's world-space boxes -- its passage's walls and its latch -- from
   * where its frame now stands. Written INTO the existing objects: they are in
   * `colliders` by reference.
   */
  function fitDoor(door) {
    const back = -EXIT_FRAME_PROUD;
    const deep = back - EXIT_PASSAGE.depth;
    const toWorld = (lx, lz) => frameToWorld(door, lx, lz);
    const boxes = [
      worldBox(toWorld(-EXIT_PASSAGE.halfWidth - 0.1, back), toWorld(-EXIT_PASSAGE.halfWidth, deep)),
      worldBox(toWorld(EXIT_PASSAGE.halfWidth, back), toWorld(EXIT_PASSAGE.halfWidth + 0.1, deep)),
      worldBox(toWorld(-EXIT_PASSAGE.halfWidth, deep), toWorld(EXIT_PASSAGE.halfWidth, deep - 0.1))
    ];
    boxes.forEach((b, i) => Object.assign(door.passageBoxes[i], b));
    Object.assign(door.latchBox, worldBox(toWorld(-EXIT_DOORWAY.halfWidth, back - 0.04), toWorld(EXIT_DOORWAY.halfWidth, 0.06)));
  }
  /** A box nothing can reach, for a collider that is not in use. */
  const PARKED_BOX = { minX: -1000, maxX: -1000, minZ: -1000, maxZ: -1000 };

  /** The collider box with two opposite corners at `a` and `b`. */
  function worldBox(a, b) {
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  }

  /**
   * One frame of an exit door: the rattle, or the hinge -- its speed bled off
   * by damping and friction, the player as a body it cannot pass through and
   * that pushes it, the stops at shut and at open -- and the player walking
   * through it, which is how the maze is left.
   */
  function updateExitDoor(door, dt, playerPosition) {
    const S = EXIT_DOOR_SWING;
    if (door.rattle > 0) {
      door.rattle = Math.max(0, door.rattle - dt);
      const fade = door.rattle / S.rattleSeconds;
      door.hinge.rotation.y = S.rattleAngle * Math.sin(door.rattle * 70) * fade;
      if (door.knob) door.knob.rotation.z = S.knobTurn * Math.sin(Math.min(1, (1 - fade) * 4) * Math.PI) * fade;
      if (door.rattle === 0) {
        door.hinge.rotation.y = 0;
        if (door.knob) door.knob.rotation.z = 0;
      }
    }
    if (!door.opened) return;

    const step = Math.min(dt, 1 / 30);
    door.speed *= Math.exp(-S.damping * step);
    const drag = S.friction * step;
    door.speed = Math.abs(door.speed) <= drag ? 0 : door.speed - Math.sign(door.speed) * drag;
    let angle = door.angle + door.speed * step;

    let local = null;
    if (playerPosition) {
      local = worldToFrame(door, playerPosition.x, playerPosition.z);
      // From the hinge: along the shut leaf, and out toward the corridor.
      const u = local.x - EXIT_HINGE.x;
      const w = local.z - EXIT_HINGE.z;
      const reach = Math.hypot(u, w);
      if (reach > S.bodyRadius * 0.5 && reach < S.leafLength + S.bodyRadius) {
        // The angle the leaf would point straight at the player, and how much
        // of an arc either side of that their body fills at this distance.
        const toward = Math.atan2(-w, u);
        const body = Math.asin(Math.min(1, S.bodyRadius / reach));
        if (Math.abs(door.angle - toward) > body) door.playerSide = Math.sign(toward - door.angle);
        if (door.playerSide < 0 && angle < toward + body) {
          // The player is on the shut side: the leaf is pushed open ahead of
          // them, and swings on with some of the push.
          const pushed = toward + body;
          door.speed = Math.min(S.pushCarry, Math.max(door.speed, (pushed - door.angle) / step));
          angle = pushed;
        } else if (door.playerSide > 0 && angle > toward - body) {
          // On the open side: it cannot swing shut through them.
          angle = toward - body;
          door.speed = Math.min(door.speed, 0);
        }
      }
    }

    if (angle > S.open) {
      angle = S.open;
      door.speed = -Math.abs(door.speed) * S.stopBounce;
    } else if (angle < 0) {
      angle = 0;
      door.speed = Math.abs(door.speed) * S.frameBounce;
    }
    door.angle = angle;
    door.hinge.rotation.y = angle;

    // Through it. Only this crossing's door was ever unlatched.
    if (local && !door.exited && local.z < -EXIT_FRAME_PROUD - EXIT_PASSAGE.exitDepth
      && Math.abs(local.x) < EXIT_PASSAGE.halfWidth) {
      door.exited = true;
      onExit(route);
    }
  }
  /** The door this crossing leaves by. */
  const activeDoor = () => exitDoors[crossing];
  const exitDoorAt = new THREE.Vector3();

  // ---------- the rooms' door frames ----------
  // Every doorway into a room gets a door frame on its corridor face -- the
  // two rooms inside the maze one to come in by and one to leave by. It is
  // door.glb's own frame with the leaf taken out: 1.28 m across its posts, so
  // it lines the 1.4 m neck like real trim, and a 1.0 m opening inside it.
  //
  // The posts get colliders (blender/build_door.py: 0.14 m wide at x = +-0.57,
  // standing 0.10 m proud of the wall). Without them a player cutting the
  // corner of the doorway walks straight through the wood.
  const FRAME_POST = { inner: 0.50, outer: 0.64, depth: 0.10 };
  DOORWAYS.forEach((d) => {
    for (const side of [-1, 1]) {
      // In the frame's own space (+Z out of the wall), then turned onto the wall.
      const corners = [[side * FRAME_POST.inner, 0], [side * FRAME_POST.outer, FRAME_POST.depth]].map(([lx, lz]) => {
        const yaw = Math.atan2(d.nx, d.nz);
        return [d.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), d.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
      });
      colliders.push({
        minX: Math.min(corners[0][0], corners[1][0]), maxX: Math.max(corners[0][0], corners[1][0]),
        minZ: Math.min(corners[0][1], corners[1][1]), maxZ: Math.max(corners[0][1], corners[1][1])
      });
    }
  });
  if (DOORWAYS.length) {
    loadDoorModel().then((model) => {
      // The whole moving leaf hangs off one empty (see build_door.py).
      const leaf = model.getObjectByName('doorLeaf');
      leaf?.parent?.remove(leaf);
      DOORWAYS.forEach((d, i) => {
        const frame = i === 0 ? model : model.clone(true);
        frame.position.set(d.x, 0, d.z);
        frame.rotation.y = Math.atan2(d.nx, d.nz);
        group.add(frame);
      });
    }).catch((err) => console.error('Failed to load door.glb for the backrooms door frames:', err));
  }

  // ---------- the sealed entries ----------
  // Not a locked door: a locked door implies a key exists somewhere. This is
  // the SHAPE of a door with the wallpaper running straight across it. No
  // frame, no handle, no gap. One at each way in -- the bottom of the drawing
  // on the first crossing, low on the right-hand wall on the second -- and both stay sealed:
  // there is no going back either way.
  const sealedMap = tiled(wallpaperTex, 1.16 / 2.12, 2.16 / 2.45);
  // Offset so the roll seams on the patch deliberately do NOT line up with the
  // seams on the wall behind it -- paper hung over a doorway never does.
  sealedMap.offset.set(0.31, 0.07);
  const sealedMat = new THREE.MeshStandardMaterial({ map: sealedMap, roughness: 0.93 });
  // Dark reveal around the edge, so the door-shape stays legible even when the
  // fixture above it is in one of its dead stretches.
  const revealMat = new THREE.MeshStandardMaterial({ color: 0x120e06, roughness: 0.8 });
  const sealedEntries = {};
  const sealedGroups = {};
  for (const key of Object.keys(CROSSINGS)) {
    const at = spawnPoint(key).door;
    // Built facing +Z at the origin, as it always was, then turned onto the
    // end wall of this crossing's way in.
    const entry = new THREE.Group();
    entry.position.set(at.x, 0, at.z);
    entry.rotation.y = Math.atan2(at.nx, at.nz);
    group.add(entry);

    const patch = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.16, 0.03), sealedMat);
    patch.position.set(0, 1.08, 0.03);
    entry.add(patch);
    [[-0.58, 1.08, 0.02, 2.16], [0.58, 1.08, 0.02, 2.16]].forEach(([x, y, w, h]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.032), revealMat);
      strip.position.set(x, y, 0.032);
      entry.add(strip);
    });
    [[0, 0.0], [0, 2.16]].forEach(([x, y]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.02, 0.032), revealMat);
      strip.position.set(x, y, 0.032);
      entry.add(strip);
    });
    // Someone before you already tried this.
    [[0.25, 1.15, 1.1], [-0.30, 1.45, 0.80]].forEach(([x, y, scale]) => {
      const marks = clawMarksMesh(scale);
      marks.position.set(x, y, 0.055);
      entry.add(marks);
    });

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 0.1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.set(0, 1.1, 0.08);
    hitbox.userData.interact = {
      label: 'The door you came through',
      onInteract: () => showCaption(line('dialog_sealed_door'))
    };
    entry.add(hitbox);
    interactables.push(hitbox);
    sealedEntries[key] = patch;
    sealedGroups[key] = entry;
  }
  const sealed = sealedEntries.first;


  // ---------- dressing ----------
  // The corridors stay deliberately sparse. Backrooms is defined by emptiness,
  // and dressing them like the basement lab is the main way the level could go
  // wrong: no crates, no desks, no chairs out here. The furniture is all in the
  // rooms, which are Annabelle's bedroom at four ages (annabelleRooms.js).
  const annabelleRooms = dressAnnabelleRooms({
    group, colliders, wallMatFor, hallH: HALL_H, backroomsWallpaper: wallpaperTex
  });

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
    // Her rooms are papered over; a yellow flap would be peeling off nothing.
    if (annabelleRooms.rooms.has(name)) return;
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
    return web;
  }
  const cobwebs = {};
  // In the dead ends of the WRONG turns only. Webs mean undisturbed; their
  // absence on the route means traffic. That is the trail's whole backstory,
  // told with a texture that already exists -- and it is the one wayfinding tell
  // the level keeps, because unlike darkness it survives the lights failing.
  Object.keys(LEGS).filter((n) => LEGS[n].kind === 'decoy').forEach((name) => {
    const e = deadEnd(name);
    const h = LEGS[name].w / 2 - 0.35;
    const n = nameNoise(name, 23);
    const side = n < 0.5 ? -1 : 1;
    cobwebs[name] = addCobweb(
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
  const flyMeshes = [];
  lamps.forEach(({ light }) => {
    const fx = light.position.x;
    const fz = light.position.z;
    for (let i = 0; i < 6; i++) {
      const fly = new THREE.Mesh(flyGeo, flyMat);
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 0.45;
      fly.position.set(fx + Math.cos(a) * d, 0.008, fz + Math.sin(a) * d);
      group.add(fly);
      flyMeshes.push(fly);
    }
  });
  // Over a hundred 8 mm specks were a draw call each; one in total now.
  mergeStaticMeshesByMaterial(flyMeshes, group, 'DeadFlies');

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


  // ---------- the drawn crossing ----------
  // Each crossing draws where the player comes round, then a way out far
  // enough from there (backroomsMaze.drawCrossing), and the pieces that mark
  // them -- the sealed door, its lamp, the exit door, its steady lamp, the
  // map's two marks -- are moved onto the draw. Nothing is built or thrown
  // away, so no light or material changes and nothing recompiles. A draw is
  // kept until a restart, so being caught does not move the door.
  let layouts = {};
  /** Where the pieces of the crossing not being played are put: under the floor. */
  const PUT_AWAY_Y = -50;

  function placeCrossing(key, { spawn, exit }) {
    for (const [k, entry] of Object.entries(sealedGroups)) {
      if (k === key) {
        entry.position.set(spawn.door.x, 0, spawn.door.z);
        entry.rotation.y = Math.atan2(spawn.door.nx, spawn.door.nz);
      } else {
        entry.position.set(0, PUT_AWAY_Y, 0);
      }
    }
    moveFixture(spawnLamps[key], spawn.x + spawn.door.nx * 0.4, spawn.z + spawn.door.nz * 0.4, across(spawn.door.axis));
    for (const [k, door] of Object.entries(exitDoors)) {
      if (k === key) {
        door.frame.position.set(exit.x + exit.nx * EXIT_FRAME_PROUD, 0, exit.z + exit.nz * EXIT_FRAME_PROUD);
        door.frame.rotation.y = Math.atan2(exit.nx, exit.nz);
        door.nx = exit.nx;
        door.nz = exit.nz;
        fitDoor(door);
      } else {
        // Out of reach and out of sight: Interaction raycasts invisible things too.
        door.frame.position.set(0, PUT_AWAY_Y, 0);
        for (const b of door.passageBoxes) Object.assign(b, PARKED_BOX);
        Object.assign(door.latchBox, PARKED_BOX);
      }
      door.frame.visible = k === key;
    }
    // The opening this crossing leaves by is open; every other one is wall.
    EXIT_SPOTS.forEach((spot, i) => {
      const open = spot === exit;
      exitPlugs[i].plug.visible = !open;
      Object.assign(exitPlugs[i].collider, open ? PARKED_BOX : exitPlugs[i].box);
    });
    moveFixture(exitLamps[key], exit.x + exit.nx * 1.2, exit.z + exit.nz * 1.2, across(exit.axis));
    const m = marks[key];
    m.exitLeg = MAZE.rooms[exit.room].leg;
    m.entryLeg = spawn.leg;
    m.exit.position.set(exit.x + exit.nx * 1.1, 0.02, exit.z + exit.nz * 1.1);
    m.entry.position.set(spawn.door.x + spawn.door.nx * 0.9, 0.02, spawn.door.z + spawn.door.nz * 0.9);
    // Webs mean nobody has been here. Somebody just has.
    for (const [name, web] of Object.entries(cobwebs)) web.visible = name !== spawn.leg;
  }

  return {
    group,
    interactables,
    colliders,
    // Where SceneManager puts the player. Rewritten by setRoute() for each
    // crossing, which main.js calls before activating the level -- the two
    // crossings come in at opposite ends of the maze.
    spawn: [spawnPoint('first').x, spawnPoint('first').z],
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
    // Facing into the maze from the way in, with their back to the sealed
    // door, so finding it is a choice to turn around. Per crossing, like spawn.
    spawnYaw: spawnPoint('first').yaw,
    refs: {
      /** Floor to ceiling, metres: a figure standing here must keep its head under it. */
      ceilingHeight: HALL_H,
      /** This crossing's draw: { spawn, exit, exitMetres } -- see backroomsMaze.drawCrossing. */
      get layout() { return layouts[crossing] ?? null; },
      /** The current crossing's exit door hinge (setRoute changes which). */
      get doorHinge() { return activeDoor().hinge; },
      /**
       * Where this crossing's exit door stands, at head height -- Annabelle
       * sings from it (AudioDirector). Null until its model has loaded.
       */
      get exitDoorPosition() {
        const door = activeDoor();
        if (!door?.slab) return null;
        door.slab.getWorldPosition(exitDoorAt);
        exitDoorAt.y = 1.5;
        return exitDoorAt;
      },
      exitDoors,
      /**
       * Unlatches this crossing's exit door and goes through it, for a debug
       * skip: the door is left by walking through it now, not by opening it.
       */
      walkThroughExitDoor() {
        const door = activeDoor();
        if (!door.opened) door.slab.userData.interact.onInteract();
        if (!door.exited) {
          door.exited = true;
          onExit(route);
        }
      },
      lamps,
      sealed,
      sealedEntries,
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
      route = next ?? null;
      // Which crossing: by the level it came from. The first goes up the
      // drawing to Door 1 and Level 2, the second to Door 2 and Level 3.
      crossing = crossingFor(route);
      // Drawn once per crossing per run, never in the room the other used.
      const other = Object.keys(CROSSINGS).find((k) => k !== crossing);
      layouts[crossing] ??= drawCrossing({ avoidRooms: layouts[other] ? [layouts[other].exit.room] : [] });
      const layout = layouts[crossing];
      placeCrossing(crossing, layout);
      this.spawn = [layout.spawn.x, layout.spawn.z];
      this.spawnYaw = layout.spawn.yaw;
      exitLamp = exitLamps[crossing];
      for (const door of Object.values(exitDoors)) {
        door.opened = false;
        door.angle = 0;
        door.speed = 0;
        door.playerSide = -1;
        door.exited = false;
        door.rattle = 0;
        door.hinge.rotation.y = 0;
        if (door.knob) door.knob.rotation.z = 0;
        Object.assign(door.latchCollider, door.latchBox);
      }
      outFade = 1;
      exitFade = 1;
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
    get crossing() { return crossing; },

    /** A restart: every crossing is drawn again. */
    reset() {
      layouts = {};
      this.setRoute(null);
    },

    update(dt, playerPosition) {
      this._t = (this._t ?? 0) + dt;
      annabelleRooms.update(dt);

      for (const door of Object.values(exitDoors)) updateExitDoor(door, dt, playerPosition);

      // Exit punctuation: once the door is open every fluorescent fades out
      // over about a second, so the caption's "the humming stops all at once"
      // is literally true on screen. The lamp over the door stays on, to see
      // the way through by, until the player has gone through.
      const opened = activeDoor().opened;
      if (opened) outFade = Math.max(0, outFade - dt * 1.1);
      if (activeDoor().exited) exitFade = Math.max(0, exitFade - dt * 1.1);

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
        // is exempt from `blackout` and `outLevel`, and only the player going
        // through the door can take it down.
        v *= l === exitLamp ? exitFade : outFade * l.outLevel * blackout;
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
    }
  };
}
