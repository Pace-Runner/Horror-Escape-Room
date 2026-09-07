import * as THREE from 'three';
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
  tiled
} from '../world/textures.js';
import { loadModel, applyTextureByMaterialName } from '../world/modelLoader.js';
import { MINIMAP_ONLY, MAIN_ONLY } from '../core/RenderLayers.js';
import doorModelUrl from '../assets/models/door.glb?url';
import {
  CORRIDOR_W, T, CORRIDORS, ROUTE, BOX, buildWallRuns, runCollider, validateMaze
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
 *  2. IT IS A WARREN THAT STAYS SOLVABLE. The route turns SEVEN times and every
 *     turn is a T where carrying straight on is the mistake, so there are real
 *     decisions to get wrong -- and some decoys fork, so a wrong turn can present
 *     a choice of its own. But the corridor graph is a TREE, which means every
 *     wrong turn is a guaranteed dead end rather than a shortcut. About 54m,
 *     ~27 seconds if you never take one.
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
  Object.values(CORRIDORS).forEach(([x0, x1, z0, z1], i) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), minimapFloorMat);
    q.rotation.x = -Math.PI / 2;
    // A tiny per-quad rise, not a shared height: junctions genuinely overlap
    // two corridor rectangles by design (see the file header's rule 1), and
    // two perfectly coplanar quads z-fight under a camera that moves every
    // frame. Nothing here is visible at this scale; it only fixes draw order.
    q.position.set((x0 + x1) / 2, 0.005 + i * 0.0002, (z0 + z1) / 2);
    q.layers.set(MINIMAP_ONLY);
    group.add(q);
  });

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
    // Hidden from the minimap camera: an emissive tube glowing under the map's
    // own bright ambient light reads as a stray bright blob on the floorplan,
    // not a light fixture -- see MAIN_ONLY in RenderLayers.js.
    housing.layers.set(MAIN_ONLY);
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
      tube.layers.set(MAIN_ONLY);
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

  // A lit pool at roughly every OTHER junction, and darkness between.
  //
  // Lighting all seven turns would flatten the maze into a lit path you simply
  // follow; lighting none would make it a flashlight crawl. Alternating means
  // about half the turns are found by torchlight with nothing else to go on,
  // which is where the tension is. Decoys get no fixture at all -- that darkness
  // is what makes a wrong turn read as wrong before you have walked it.
  //
  // `along` is the axis the housing runs across: an east-west corridor needs the
  // tube turned 90 degrees or it lies ALONG the corridor instead of banding
  // across it, and the band on the carpet is the whole backrooms look.
  addFixture(0, 1.8, { along: 'x', mode: 'dying', colour: 0xffd07a, base: 1.5, dist: 8, decay: 1.7, emissive: 0xffdca0, emissiveIntensity: 1.9 });
  addFixture(0, 4.8, { along: 'z', mode: 'steady', colour: 0xffd98a, base: 1.7, dist: 10, decay: 1.55, emissive: 0xffe9a0, emissiveIntensity: 1.7 });
  addFixture(-10.4, 4.8, { along: 'x', mode: 'flicker', colour: 0xffd07a, base: 1.6, dist: 10, decay: 1.6, emissive: 0xffe9a0, emissiveIntensity: 1.7 });
  addFixture(-10.4, 10.4, { along: 'z', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  addFixture(-7.0, 10.4, { along: 'z', mode: 'steady', colour: 0xffd98a, base: 1.6, dist: 9, decay: 1.6, emissive: 0xffe9a0, emissiveIntensity: 1.6 });
  addFixture(-3.6, 13.2, { along: 'x', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  addFixture(-3.6, 16.0, { along: 'z', mode: 'flicker', colour: 0xffd07a, base: 1.6, dist: 10, decay: 1.6, emissive: 0xffe9a0, emissiveIntensity: 1.7 });
  addFixture(-12.4, 16.0, { along: 'x', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  addFixture(-12.4, 21.4, { along: 'z', mode: 'steady', colour: 0xffe0a4, base: 1.7, dist: 10, decay: 1.55, emissive: 0xffe9a0, emissiveIntensity: 1.7 });
  addFixture(-6.0, 21.4, { along: 'z', mode: null, emissive: 0x24221c, emissiveIntensity: 0 });
  // The only bright steady light in the level sits over the exit. The
  // destination is the one stable thing here -- the light does the signage.
  addFixture(0.6, 21.4, { along: 'z', mode: 'steady', colour: 0xffe0a4, base: 1.95, dist: 12, decay: 1.5, emissive: 0xfff0c0, emissiveIntensity: 1.9 });

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
  doorFrame.position.set(1.94, 0, 21.4);
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
  // 19.3, not 8.6: opening B6's mouth (left wall now absent 8.40-10.60) left
  // this one floating too. Moved rather than nudged, so it is not crowding
  // the rest of the dressing on the short 7.40-8.40 stub.
  // rotY points along the wall's OUTWARD normal, i.e. into the walkable side.
  // Get the sign wrong and the flap is buried inside the wall, and because the
  // wall material is DoubleSide there is no backwards-plane tell -- it simply
  // vanishes. warnIfFloating catches the wrong WALL; only care catches the wrong
  // FACE.
  addPeeling(-1.6, 1.60, 2.4, Math.PI / 2, 0.80);
  addPeeling(-6.0, 1.80, 6.4, Math.PI, 0.80);
  addPeeling(-12.0, 1.55, 7.4, Math.PI / 2, 0.75);
  addPeeling(-8.0, 1.45, 8.8, 0, 0.70);
  addPeeling(-5.2, 1.65, 13.2, Math.PI / 2, 0.70);
  addPeeling(-9.0, 1.50, 14.4, 0, 0.75);
  addPeeling(-14.0, 1.70, 22.0, Math.PI / 2, 0.70);

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
  addCobweb(6.85, HALL_H - 0.15, 6.25, -Math.PI / 4, -0.3, -0.3);   // EW1 east dead end
  addCobweb(6.85, HALL_H - 0.15, 3.35, Math.PI / 4);                // EW1 east dead end
  addCobweb(-14.85, HALL_H - 0.15, 11.85, Math.PI / 4);             // EW2 west dead end
  addCobweb(0.85, HALL_H - 0.15, 11.85, -Math.PI / 4, -0.3, -0.3);  // EW2 east dead end
  addCobweb(-11.85, HALL_H - 0.15, 13.45, Math.PI / 4);             // NS2 north dead end
  addCobweb(-2.15, HALL_H - 0.15, 18.85, -Math.PI / 4, -0.3, -0.3); // NS3 north dead end
  addCobweb(0.85, HALL_H - 0.15, 17.45, -Math.PI / 4, -0.3, -0.3);  // EW3 east dead end
  addCobweb(-13.85, HALL_H - 0.15, 24.85, Math.PI / 4);             // NS4 north dead end
  addCobweb(-16.85, HALL_H - 0.15, 25.85, Math.PI / 4);             // fC
  addCobweb(8.85, HALL_H - 0.15, 9.85, -Math.PI / 4, -0.3, -0.3);   // fA2, two wrong turns deep
  addCobweb(1.85, HALL_H - 0.15, 18.35, -Math.PI / 4, -0.3, -0.3);  // fB
  addCobweb(4.25, HALL_H - 0.15, 2.45, Math.PI / 4);                // sA
  addCobweb(-8.35, HALL_H - 0.15, 18.15, Math.PI / 4);              // sD

  // Dead flies under the living fixtures -- the single most fluorescent-lit
  // detail there is, and nothing else in this game has it.
  const flyGeo = new THREE.IcosahedronGeometry(0.008, 0);
  const flyMat = new THREE.MeshStandardMaterial({ color: 0x14120c, roughness: 0.6 });
  // Under the LIVING fixtures only, and now taking an (x, z) pair -- the old
  // loop took a z list and hardcoded x = 0, which only worked while every
  // fixture sat on one straight centreline.
  [[0, 1.8], [0, 4.8], [-10.4, 4.8], [-7.0, 10.4], [-3.6, 16.0], [-12.4, 21.4], [0.6, 21.4]].forEach(([fx, fz]) => {
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
  fallenTile.position.set(-10.75, 0.011, 10.0);
  fallenTile.rotation.y = 0.6;
  fallenTile.rotation.z = 0.04;
  group.add(fallenTile);

  const tileHole = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x050403 })
  );
  tileHole.rotation.x = Math.PI / 2;
  tileHole.position.set(-10.4, HALL_H - 0.01, 10.4);
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
  [[0.2, 3.0, 1.0, 0.7], [-9.5, 7.0, 1.3, 0.8], [-3.6, 12.6, 0.9, 1.2], [-11.0, 18.0, 1.1, 0.8], [-4.5, 21.4, 1.2, 0.9]].forEach(([x, z, sx, sz]) => {
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
