import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  createWoodFloorTexture,
  createWoodFloorNormalTexture,
  createDamaskWallpaperTexture,
  createWallpaperNormalTexture,
  createScratchedMessageTexture,
  createScratchedMessageNormalTexture,
  createPolaroidTexture,
  createFamilyPhotoTexture,
  createRugTexture,
  createFabricTexture,
  createFabricNormalTexture,
  createClawMarksTexture,
  createClawMarksNormalTexture,
  createRugNormalTexture,
  createFurnitureWoodTexture,
  createFurnitureWoodNormalTexture,
  createCobwebTexture,
  createPeelingWallpaperTexture
} from '../world/textures.js';
import { addBaseboard } from '../world/trim.js';
import { createRainGlassMaterial } from '../world/RainGlassMaterial.js';
import { loadModel, applyTextureByMaterialName } from '../world/modelLoader.js';
import bedModelUrl from '../assets/models/bed.glb?url';
import dresserModelUrl from '../assets/models/dresser.glb?url';
import doorModelUrl from '../assets/models/door.glb?url';

const ROOM_W = 6.4;
const ROOM_D = 5.2;
const ROOM_H = 2.8;

/**
 * Builds Level 1: the bedroom the player wakes up in.
 *
 * Hierarchy notes (see docs/WORLD_DESIGN.md for the full write-up):
 *  - the ceiling light fixture and its cord are children of a ceiling
 *    anchor Object3D, because in the real fixture the bulb hangs FROM
 *    the cord which is fixed to the ceiling -- moving the anchor should
 *    move both together.
 *  - the chain and handcuff are children of the bed's headboard post,
 *    since they are bolted to the bed frame, not to the room.
 *  - the two boarded planks and the polaroid are children of the door
 *    FRAME group (not the door slab) because the story places them
 *    nailed/stuck to the frame -- they must stay put even if the door
 *    slab itself were ever animated open.
 *  - drawer meshes are children of the dresser body, offset in local
 *    space, so the "left half-open" pose is defined once, relative to
 *    the dresser, rather than as loose world-space furniture.
 */
export function createBedroomLevel({ showCaption = () => {}, onFreed = () => {}, onFlashlightPicked = () => {}, onDoorOpened = () => {}, onExaminePhotos = () => {}, onExaminePinpad = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Level1_Bedroom';
  const interactables = [];
  const colliders = [];

  // Puzzle state tracking for bedroom mechanics
  const puzzleState = {
    chainsEscaped: false,
    hasFlashlight: false,
    foundPhotos: new Set(),
    photosArranged: false,
    hasKey: false,
    hasCrowbar: false,
    planksRemoved: false,
    doorUnlocked: false // true once the door has actually been swung open
  };

  // Darker stained wood + ornate damask wallpaper (both normal-mapped, not
  // just bump-mapped) in place of plain plaster -- the flat tinted-plaster
  // look read as too bare/generic for a lived-in, decades-old house.
  const floorTex = createWoodFloorTexture({ stain: 0.72 });
  const floorNormal = createWoodFloorNormalTexture();
  const wallTex = createDamaskWallpaperTexture();
  const wallNormal = createWallpaperNormalTexture();

  // Shared wood-grain texture for the Blender-authored furniture (bed
  // frame, dresser, door) -- those .glb exports only ever carried a flat
  // PBR colour (bmesh.ops geometry has no UV data by default, so there
  // was nothing to map a texture onto until the Blender scripts started
  // baking box-projected UVs). Applied post-load by material name below.
  const furnitureWoodTex = createFurnitureWoodTexture({ tint: [60, 44, 30] });
  const furnitureWoodNormal = createFurnitureWoodNormalTexture();

  // ---------- structure ----------
  const structure = new THREE.Group();
  structure.name = 'Structure';
  group.add(structure);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: floorTex, normalMap: floorNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.75 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  structure.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 1 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  structure.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, normalMap: wallNormal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.88 });

  function addWall(w, h, x, y, z, ry) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.y = ry;
    structure.add(wall);
    return wall;
  }

  // Back wall has an actual rectangular cut-out behind the window (built
  // from four slabs framing the gap) rather than a solid plane with a
  // window decal glued on top -- otherwise the wall would sit in front of
  // the rain outside and depth-test it away, so the window would never
  // show anything through the glass.
  function addWallWithGap(w, h, z, gapX, gapY, gapW, gapH) {
    const depth = 0.12;
    const gapX0 = gapX - gapW / 2;
    const gapX1 = gapX + gapW / 2;
    const gapY0 = gapY - gapH / 2;
    const gapY1 = gapY + gapH / 2;
    const wallZ = z + depth / 2;

    const slab = (sw, sh, sx, sy) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, depth), wallMat);
      mesh.position.set(sx, sy, wallZ);
      structure.add(mesh);
    };

    slab(gapX0 - (-w / 2), h, (-w / 2 + gapX0) / 2, h / 2); // left of gap
    slab(w / 2 - gapX1, h, (w / 2 + gapX1) / 2, h / 2); // right of gap
    slab(gapW, gapY0, gapX, gapY0 / 2); // below gap
    slab(gapW, h - gapY1, gapX, (gapY1 + h) / 2); // above gap
  }

  // back wall (has the window), front wall (has the door), right wall
  addWallWithGap(ROOM_W, ROOM_H, -ROOM_D / 2, -2.1, 1.5, 1.3, 1.5);
  addWall(ROOM_D, ROOM_H, ROOM_W / 2, ROOM_H / 2, 0, -Math.PI / 2);
  addWall(ROOM_W, ROOM_H, 0, ROOM_H / 2, ROOM_D / 2, Math.PI);

  // Left wall has a gap behind the pinboard (see the photo-arrangement
  // puzzle below) opening onto an actual recessed cavity -- built with the
  // same four-slab framing technique as the window cut-out above, just
  // rotated onto the Z axis, plus a hollow pocket (back panel + four
  // connecting sides) behind the gap so the reveal isn't a hole into the
  // void once the pinboard swings open.
  const pinRecess = { z: -1.7, y: 1.3, w: 0.74, h: 0.78, depth: 0.42 };
  {
    const wallThickness = 0.12;
    const wallX = -ROOM_W / 2;
    const slabCenterX = wallX + wallThickness / 2;
    const gapZ0 = pinRecess.z - pinRecess.w / 2;
    const gapZ1 = pinRecess.z + pinRecess.w / 2;
    const gapY0 = pinRecess.y - pinRecess.h / 2;
    const gapY1 = pinRecess.y + pinRecess.h / 2;

    const slab = (sw, sh, sy, sz) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, sh, sw), wallMat);
      mesh.position.set(slabCenterX, sy, sz);
      structure.add(mesh);
    };
    slab(gapZ0 - (-ROOM_D / 2), ROOM_H, ROOM_H / 2, (-ROOM_D / 2 + gapZ0) / 2); // before gap
    slab(ROOM_D / 2 - gapZ1, ROOM_H, ROOM_H / 2, (ROOM_D / 2 + gapZ1) / 2); // after gap
    slab(pinRecess.w, gapY0, gapY0 / 2, pinRecess.z); // below gap
    slab(pinRecess.w, ROOM_H - gapY1, (gapY1 + ROOM_H) / 2, pinRecess.z); // above gap

    const cavityMat = new THREE.MeshStandardMaterial({ color: 0x0c0906, roughness: 1 });
    const backX = wallX - pinRecess.depth;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(pinRecess.w, pinRecess.h), cavityMat);
    back.position.set(backX, pinRecess.y, pinRecess.z);
    back.rotation.y = Math.PI / 2;
    structure.add(back);

    const sideCenterX = (wallX + backX) / 2;
    const side = (sy, sz, sh, sw) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(pinRecess.depth, sh, sw), cavityMat);
      mesh.position.set(sideCenterX, sy, sz);
      structure.add(mesh);
    };
    side(gapY1, pinRecess.z, 0.02, pinRecess.w); // top
    side(gapY0, pinRecess.z, 0.02, pinRecess.w); // bottom
    side(pinRecess.y, gapZ0, pinRecess.h, 0.02); // near side
    side(pinRecess.y, gapZ1, pinRecess.h, 0.02); // far side
  }

  colliders.push(
    { minX: -ROOM_W / 2 - 0.1, maxX: -ROOM_W / 2 + 0.15, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: ROOM_W / 2 - 0.15, maxX: ROOM_W / 2 + 0.1, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: -ROOM_D / 2 - 0.1, maxZ: -ROOM_D / 2 + 0.15 },
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: ROOM_D / 2 - 0.15, maxZ: ROOM_D / 2 + 0.1 }
  );

  addBaseboard(structure, { width: ROOM_W, depth: ROOM_D, color: 0x1a140e });

  // ---------- ceiling light fixture ----------
  // A bare bulb (per the storyline's "dim yellow light") but with the
  // actual hardware a real fixture has -- a ceiling canopy where the cord
  // meets the ceiling, a socket with a visible screw base under the bulb,
  // and a dangling pull-chain -- instead of a sphere floating on a bare
  // cylinder cord.
  const ceilingAnchor = new THREE.Object3D();
  ceilingAnchor.position.set(0.6, ROOM_H, 0.2);
  group.add(ceilingAnchor);

  const fixtureMetal = new THREE.MeshStandardMaterial({ color: 0x1c1a16, metalness: 0.6, roughness: 0.5 });

  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 12), fixtureMetal);
  canopy.position.y = -0.01;
  ceilingAnchor.add(canopy);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.46, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  cord.position.y = -0.25;
  ceilingAnchor.add(cord);

  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.06, 10), fixtureMetal);
  socket.position.y = -0.47;
  ceilingAnchor.add(socket);

  const bulbBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.024, 0.03, 10),
    new THREE.MeshStandardMaterial({ color: 0xb8a870, metalness: 0.7, roughness: 0.4 })
  );
  bulbBase.position.y = -0.505;
  ceilingAnchor.add(bulbBase);

  const bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb347, emissiveIntensity: 1.4 })
  );
  bulbMesh.position.y = -0.565;
  ceilingAnchor.add(bulbMesh);

  // small pull-chain beside the socket, same torus-link technique as the
  // handcuff chain
  const chainLinkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.4 });
  const pullChain = new THREE.Group();
  pullChain.position.set(0.035, -0.44, 0);
  ceilingAnchor.add(pullChain);
  for (let i = 0; i < 5; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 10), chainLinkMat);
    link.position.y = -0.02 * i;
    link.rotation.set(0, i % 2 === 0 ? 0 : Math.PI / 2, 0);
    pullChain.add(link);
  }

  // Range/decay opened up a little (was 8/1.8) so objects at the far
  // side of the room -- the door, dresser -- get at least a dim
  // silhouette from the bulb before the flashlight is found, rather than
  // reading as pure flat black. Deliberately small: the per-level exposure
  // is measured/calibrated (see main.js), so this is a reach tweak, not a
  // brightness overhaul -- near-bulb areas barely change.
  const bulbLight = new THREE.PointLight(0xffb347, 1.23, 11, 1.5);
  bulbLight.position.y = -0.565;
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(512, 512);
  ceilingAnchor.add(bulbLight);

  // ---------- ambient / storm baseline ----------
  const ambient = new THREE.AmbientLight(0x2e3342, 0.31);
  group.add(ambient);

  const lightning = new THREE.DirectionalLight(0xbcd4ff, 0);
  lightning.position.set(-3, 2.4, -3.5);
  lightning.target.position.set(-3, 0, -ROOM_D / 2);
  group.add(lightning);
  group.add(lightning.target);

  // ---------- window (back-left wall) with rain seen through it ----------
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-2.1, 1.5, -ROOM_D / 2 + 0.02);
  group.add(windowGroup);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.8 });
  const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.08), frameMat);
  windowGroup.add(frameOuter);
  // Custom shader material (see world/RainGlassMaterial.js): streaks rain
  // down the pane and flashes with the storm's lightning, instead of a
  // static tinted-transparent built-in material.
  const glassMaterial = createRainGlassMaterial();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), glassMaterial);
  glass.position.z = 0.05;
  windowGroup.add(glass);
  // mullion cross
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x1c1712 });
  const mV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.06), mullionMat);
  mV.position.z = 0.06;
  windowGroup.add(mV);
  const mH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.06), mullionMat);
  mH.position.z = 0.06;
  windowGroup.add(mH);

  // ---------- old cast-iron radiator beneath the window ----------
  const radiatorGroup = new THREE.Group();
  radiatorGroup.position.set(-2.1, 0, -ROOM_D / 2 + 0.14);
  group.add(radiatorGroup);

  const radiatorMat = new THREE.MeshStandardMaterial({ color: 0x22231f, metalness: 0.6, roughness: 0.65 });
  const radiatorRustMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, metalness: 0.3, roughness: 0.8 });

  const RAD_W = 0.7;
  const RAD_H = 0.5;
  const RAD_FLOOR_Y = 0.08;
  const railTop = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, RAD_W, 8), radiatorMat);
  railTop.rotation.z = Math.PI / 2;
  railTop.position.set(0, RAD_FLOOR_Y + RAD_H, 0);
  radiatorGroup.add(railTop);
  const railBottom = railTop.clone();
  railBottom.position.y = RAD_FLOOR_Y;
  radiatorGroup.add(railBottom);

  const finCount = 9;
  for (let i = 0; i < finCount; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, RAD_H, 0.1), radiatorMat);
    fin.position.set(-RAD_W / 2 + 0.04 + (i * (RAD_W - 0.08)) / (finCount - 1), RAD_FLOOR_Y + RAD_H / 2, 0);
    fin.castShadow = true;
    radiatorGroup.add(fin);
    // streaks of rust bleeding down from a couple of the fin joints --
    // an old radiator that's sat unused/leaking for years, not a new one
    if (i % 3 === 0) {
      const rust = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.22), radiatorRustMat);
      rust.position.set(fin.position.x, RAD_FLOOR_Y + 0.11, 0.051);
      radiatorGroup.add(rust);
    }
  }

  [-1, 1].forEach((side) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, RAD_FLOOR_Y, 6), radiatorMat);
    leg.position.set(side * (RAD_W / 2 - 0.05), RAD_FLOOR_Y / 2, 0);
    radiatorGroup.add(leg);
  });

  radiatorGroup.userData.interact = {
    label: 'Examine radiator',
    onInteract: () => showCaption("An old cast-iron radiator, stone cold. Whatever heated this house stopped working a long time before the power did.")
  };
  const radiatorHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(RAD_W, RAD_H, 0.14),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  radiatorHitbox.position.set(0, RAD_FLOOR_Y + RAD_H / 2, 0);
  radiatorHitbox.userData.interact = radiatorGroup.userData.interact;
  radiatorGroup.add(radiatorHitbox);
  interactables.push(radiatorHitbox);

  colliders.push({
    minX: radiatorGroup.position.x - RAD_W / 2 - 0.05, maxX: radiatorGroup.position.x + RAD_W / 2 + 0.05,
    minZ: radiatorGroup.position.z - 0.1, maxZ: radiatorGroup.position.z + 0.1
  });

  // ---------- bed (headboard post is the parent of the chain + cuff) ----------
  const bedGroup = new THREE.Group();
  bedGroup.position.set(1.9, 0, -ROOM_D / 2 + 1.1);
  group.add(bedGroup);

  const frameMatWood = new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.85 });

  // Rounded-edge geometry (RoundedBoxGeometry, bundled with three.js) plus
  // a quilted fabric texture+normal map -- a plain sharp-edged BoxGeometry
  // with a flat solid colour was the flattest, most obviously "default CG
  // box" looking thing left in the room once the floor/walls/frame all got
  // real surface detail.
  const mattressTex = createFabricTexture({ color: [156, 148, 132], stitch: 18 });
  const mattressNormal = createFabricNormalTexture({ stitch: 18 });
  const mattress = new THREE.Mesh(
    new RoundedBoxGeometry(1.4, 0.22, 1.9, 3, 0.05),
    new THREE.MeshStandardMaterial({ map: mattressTex, normalMap: mattressNormal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.95 })
  );
  mattress.position.y = 0.63;
  mattress.castShadow = true;
  mattress.receiveShadow = true;
  bedGroup.add(mattress);

  // A real blanket's silhouette is a flat top plus fabric hanging down the
  // sides/foot under gravity -- not a taller box. Built as a top slab plus
  // three thin "drop" panels (left, right, foot; none at the head, since a
  // real blanket is pulled up to the pillows there, not hanging past them)
  // that actually extend below the mattress-top line, with a couple of
  // small ridge bumps on top so it doesn't read as perfectly rigid fabric.
  const blanketTex = createFabricTexture({ color: [122, 30, 34], stitch: 10 });
  const blanketNormal = createFabricNormalTexture({ stitch: 10 });
  const blanketMat = new THREE.MeshStandardMaterial({ map: blanketTex, normalMap: blanketNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 });

  const BLANKET_W = 1.5;
  const BLANKET_TOP_D = 1.5;
  const BLANKET_TOP_Z = 0.2; // leaves the pillow area (head, negative Z) uncovered
  const MATTRESS_TOP_Y = 0.74;
  const DROP_BOTTOM_Y = 0.32; // meets roughly where the wood base begins
  const DROP_H = MATTRESS_TOP_Y - DROP_BOTTOM_Y;
  const DROP_THICK = 0.05;

  const blanketTop = new THREE.Mesh(new RoundedBoxGeometry(BLANKET_W, 0.07, BLANKET_TOP_D, 3, 0.03), blanketMat);
  blanketTop.position.set(0, MATTRESS_TOP_Y + 0.02, BLANKET_TOP_Z);
  blanketTop.castShadow = true;
  bedGroup.add(blanketTop);

  // small ridge bumps -- rumpled folds instead of a perfectly taut sheet
  [[-0.35, 0.15, 0.06, -0.04], [0.28, -0.1, 0.055, 0.05], [-0.05, 0.55, 0.05, 0.02]].forEach(([fx, fz, fh, tilt]) => {
    const ridge = new THREE.Mesh(new RoundedBoxGeometry(0.4, fh, 0.35, 2, 0.03), blanketMat);
    ridge.position.set(fx, MATTRESS_TOP_Y + 0.05 + fh / 2, fz);
    ridge.rotation.set(tilt * 0.6, tilt, tilt * 0.4);
    bedGroup.add(ridge);
  });

  const blanketDropL = new THREE.Mesh(new RoundedBoxGeometry(DROP_THICK, DROP_H, BLANKET_TOP_D, 1, 0.02), blanketMat);
  blanketDropL.position.set(-BLANKET_W / 2, (MATTRESS_TOP_Y + DROP_BOTTOM_Y) / 2, BLANKET_TOP_Z);
  blanketDropL.rotation.z = 0.05;
  blanketDropL.castShadow = true;
  bedGroup.add(blanketDropL);

  const blanketDropR = blanketDropL.clone();
  blanketDropR.position.x = BLANKET_W / 2;
  blanketDropR.rotation.z = -0.05;
  bedGroup.add(blanketDropR);

  const blanketDropFoot = new THREE.Mesh(new RoundedBoxGeometry(BLANKET_W, DROP_H, DROP_THICK, 1, 0.02), blanketMat);
  blanketDropFoot.position.set(0, (MATTRESS_TOP_Y + DROP_BOTTOM_Y) / 2, BLANKET_TOP_Z + BLANKET_TOP_D / 2);
  blanketDropFoot.rotation.x = 0.05;
  blanketDropFoot.castShadow = true;
  bedGroup.add(blanketDropFoot);

  // Pillows propped against the headboard rather than lying flat in the
  // middle of the mattress -- tilted back onto the headboard panel (Z is
  // most negative there) instead of standing straight up.
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xcabfa0, roughness: 1 });
  // Y-scale flattened from 0.55 to 0.42 (and position dropped to match) --
  // still puffier than a pancake, but a lower profile reads more clearly
  // as separate from the bed frame's side rails/posts at a glance, in
  // addition to the rails themselves being raised in blender/build_bed.py.
  const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), pillowMat);
  pillow.scale.set(1.3, 0.42, 0.8);
  pillow.position.set(-0.24, 0.84, -0.68);
  pillow.rotation.set(-0.35, 0, 0.08);
  pillow.castShadow = true;
  bedGroup.add(pillow);

  const pillow2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), pillowMat);
  pillow2.scale.set(1.25, 0.42, 0.75);
  pillow2.position.set(0.3, 0.83, -0.7);
  pillow2.rotation.set(-0.3, 0, -0.1);
  pillow2.castShadow = true;
  bedGroup.add(pillow2);

  // ---------- bed frame (Blender-authored, see blender/build_bed.py) ----------
  // The rigid wood frame -- turned corner posts, raised-panel head/
  // footboard, side rails, base -- is generated in Blender (bmesh.ops:
  // spin for the lathe-turned posts, inset+bevel for the panel mouldings)
  // and exported as bed.glb, rather than hand-built from Three.js
  // primitives: Blender's modifiers give genuinely smooth/curved geometry
  // a box-and-cylinder approach can't match. headboardPost stays a plain
  // (invisible) Object3D anchor at the same spot the old visible post
  // mesh occupied, purely so the chain + handcuff below -- which must
  // stay script-driven for the pickup/unlock interaction -- have a
  // transform to parent onto that doesn't depend on the GLTF load timing.
  const headboardPost = new THREE.Object3D();
  headboardPost.position.set(-0.6, 0.55, -0.95);
  bedGroup.add(headboardPost);

  loadModel(bedModelUrl).then((bedFrame) => {
    bedFrame.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    applyTextureByMaterialName(bedFrame, 'BedWood', furnitureWoodTex, furnitureWoodNormal);
    bedGroup.add(bedFrame);

    // small objects resting on the headboard's shelf lip -- a candle
    // stub and a framed photo, echoing the nightstand's clutter
    const shelfCandle = new THREE.Group();
    shelfCandle.position.set(-0.45, 1.675, -0.89);
    bedGroup.add(shelfCandle);
    const shelfCandleHolder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.037, 0.018, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a8060, metalness: 0.5, roughness: 0.5 })
    );
    shelfCandleHolder.position.y = 0.009;
    shelfCandle.add(shelfCandleHolder);
    const shelfCandleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.015, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8dfc0, roughness: 0.8 })
    );
    shelfCandleBody.position.y = 0.068;
    shelfCandle.add(shelfCandleBody);

    const shelfFrame = new THREE.Mesh(
      new RoundedBoxGeometry(0.16, 0.2, 0.015, 2, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.6, metalness: 0.2 })
    );
    shelfFrame.position.set(0.4, 1.775, -0.89);
    shelfFrame.rotation.y = -0.15;
    bedGroup.add(shelfFrame);
  }).catch((err) => {
    console.error('Failed to load bed.glb, bed frame will be missing:', err);
  });

  // chain + handcuff, children of the post they're bolted to. A plain
  // circular torus looks identical from every angle around its own axis,
  // so the old per-link `Math.random() * 0.4` tilt never actually read as
  // alternating links -- it was just uniform rings in a random wobble.
  // Each link here is instead squashed into an oval (real links aren't
  // circular either) and tilted to face along a gently sagging run
  // between the post and the cuff, alternating 90 degrees so consecutive
  // links genuinely show a different silhouette -- flat oval, then
  // edge-on -- the way threaded links actually do.
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.78, roughness: 0.38 });
  // Slight per-link tint variation (still greys, just not identical) --
  // an old chain isn't uniformly machined, and it's a cheap way to break
  // up what would otherwise be flat repeated geometry.
  const chainLinkTints = [0x545454, 0x5c5c5c, 0x4c4c4c, 0x606060, 0x505050, 0x585858, 0x4e4e4e, 0x565656];

  const chain = new THREE.Group();
  chain.position.set(0.02, 0.75, 0.05);
  headboardPost.add(chain);

  const CHAIN_LINKS = 8;
  const CHAIN_SAG = 0.05;
  const chainRunEnd = new THREE.Vector3(0.58, -0.32, 0.05);
  function chainPoint(t) {
    const sag = CHAIN_SAG * 4 * t * (1 - t); // simple parabola, not a true catenary, but reads the same at this scale
    return new THREE.Vector3(chainRunEnd.x * t, chainRunEnd.y * t - sag, chainRunEnd.z * t);
  }

  const upAxis = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < CHAIN_LINKS; i++) {
    const t = i / (CHAIN_LINKS - 1);
    const p = chainPoint(t);
    const tangent = chainPoint(Math.min(1, t + 0.02)).sub(p).normalize();

    const link = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.009, 8, 12),
      new THREE.MeshStandardMaterial({ color: chainLinkTints[i % chainLinkTints.length], metalness: 0.78, roughness: 0.38 })
    );
    link.scale.set(1, 1.55, 1); // circle -> oval, in the link's own local space
    link.quaternion.setFromUnitVectors(upAxis, tangent); // face the ring along the run
    link.rotateZ((i % 2) * (Math.PI / 2)); // alternate flat/edge-on
    link.position.copy(p);
    link.castShadow = true;
    link.receiveShadow = true;
    chain.add(link);
  }

  // Handcuff: a ring plus a small hinge/lock block, rather than one bare
  // torus -- the block is what actually reads as "this is a cuff, not a
  // curtain ring" at a glance.
  const cuff = new THREE.Group();
  cuff.position.copy(chainRunEnd);
  chain.add(cuff);

  const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 10, 20), chainMat);
  cuffRing.rotation.x = Math.PI / 2;
  cuffRing.castShadow = true;
  cuffRing.receiveShadow = true;
  cuff.add(cuffRing);

  const cuffHinge = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.022), chainMat);
  cuffHinge.position.set(0.05, 0, 0);
  cuffHinge.castShadow = true;
  cuffHinge.receiveShadow = true;
  cuff.add(cuffHinge);

  // ---------- dresser (Blender-authored, see blender/build_dresser.py) ----------
  // Beveled body, small feet, and raised-panel drawer fronts pulled out at
  // different depths -- the middle one furthest -- generated the same way
  // as the bed frame, in place of a plain box with three flat rectangles
  // glued to its face. No gameplay hooks depend on its internal structure
  // (unlike the bed's headboardPost/chain), so it's just loaded and added
  // directly, no placeholder anchor needed.
  const dresser = new THREE.Group();
  dresser.position.set(2.7, 0, 1.6);
  dresser.rotation.y = -Math.PI / 2;
  group.add(dresser);

  loadModel(dresserModelUrl).then((dresserModel) => {
    dresserModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    applyTextureByMaterialName(dresserModel, 'DresserWood', furnitureWoodTex, furnitureWoodNormal);
    applyTextureByMaterialName(dresserModel, 'DrawerWood', furnitureWoodTex, furnitureWoodNormal);
    dresser.add(dresserModel);
  }).catch((err) => {
    console.error('Failed to load dresser.glb, dresser will be missing:', err);
  });

  colliders.push({
    minX: dresser.position.x - 0.3, maxX: dresser.position.x + 0.3,
    minZ: dresser.position.z - 0.6, maxZ: dresser.position.z + 0.6
  });

  // ---------- door with boarded planks + polaroid (children of the frame) ----------
  const doorFrame = new THREE.Group();
  doorFrame.position.set(-1.4, 0, ROOM_D / 2 - 0.02);
  group.add(doorFrame);

  // The actual door leaf (+ knob + the claw marks scratched into its
  // surface) gets reparented onto this hinge once the model loads, below
  // -- a vertical pivot sitting at the leaf's own left edge, opposite the
  // knob, so once the planks are gone, interacting again swings the whole
  // leaf open instead of just cutting to a caption. The frame, planks and
  // polaroid stay direct children of doorFrame and never move (see the
  // note at the top of this file on why those are deliberately parented
  // to the frame, not the slab).
  const doorHinge = new THREE.Object3D();
  doorHinge.position.set(-0.5, 1.0, 0.025);
  doorFrame.add(doorHinge);
  const doorOpenSwing = Math.PI / 2;

  // Blender-authored, see blender/build_door.py: a beveled frame around a
  // two-panel raised door (real stile-and-rail relief with a mid-rail gap,
  // not a flat slab) plus a turned knob. doorSlab stays a plain invisible
  // hitbox sized to the old slab's bounds -- same reasoning as the
  // flashlight/paperclip hitboxes -- so "examine boarded door" is
  // clickable immediately rather than waiting on the async model load.
  loadModel(doorModelUrl).then((doorModel) => {
    doorModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    applyTextureByMaterialName(doorModel, 'DoorWood', furnitureWoodTex, furnitureWoodNormal);
    applyTextureByMaterialName(doorModel, 'DoorFrameWood', furnitureWoodTex, furnitureWoodNormal);
    applyTextureByMaterialName(doorModel, 'DoorPanelWood', furnitureWoodTex, furnitureWoodNormal);
    doorFrame.add(doorModel);

    // Named nodes from the Blender export -- attach() keeps each part's
    // current world transform while moving it under the hinge, so nothing
    // jumps when this (async) resolves.
    ['doorPanel', 'knobHandle', 'knobPlate'].forEach((name) => {
      const part = doorModel.getObjectByName(name);
      if (part) doorHinge.attach(part);
    });
    doorHinge.attach(doorClawMarks);
  }).catch((err) => {
    console.error('Failed to load door.glb, door will be missing:', err);
  });

  const doorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.06),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  doorSlab.position.set(0, 1.0, 0);
  doorFrame.add(doorSlab);

  // claw marks raked into the lower door panel itself, not just the wall
  // beside it -- something was clawing at the one way out
  const doorClawTex = createClawMarksTexture();
  const doorClawNormal = createClawMarksNormalTexture();
  const doorClawMarks = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.45),
    new THREE.MeshStandardMaterial({
      map: doorClawTex,
      normalMap: doorClawNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      transparent: true,
      roughness: 0.95
    })
  );
  // z=0.13 (was 0.045) -- same bug as the planks below: the door's raised
  // panels extend to z=0.105 at their front-most point, so this was
  // sitting behind/inside the panel surface at that x/y, fully hidden.
  doorClawMarks.position.set(-0.15, 0.65, 0.13);
  doorFrame.add(doorClawMarks);

  // Boarded planks nailed across the door -- weathered pale grey-tan (not
  // the door's own dark stain, so they read as a clearly separate, cruder
  // repair rather than blending into the door surface) and bigger/thicker,
  // extending past the door's edges onto the surrounding frame the way
  // an actual "boarded shut in a hurry" plank would, plus dark nail heads
  // punched through each end.
  const plankTex = createFurnitureWoodTexture({ tint: [150, 138, 110] });
  const plankNormal = createFurnitureWoodNormalTexture();
  const plankMat = new THREE.MeshStandardMaterial({
    map: plankTex,
    normalMap: plankNormal,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.95
  });
  const nailMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.6, roughness: 0.5 });

  // Collected so the crowbar can hide every plank + nail in one go once
  // the door is pried open, rather than tracking them individually.
  const boardedPlankParts = [];

  // Z=0.14 (was 0.08) -- measured the actual exported door.glb's raised
  // panels and they now extend to Z=0.105 at their most-proud point (the
  // relief got pushed deeper in an earlier pass to fix a separate "door
  // looks flat" complaint). At 0.08 the planks were sitting entirely
  // behind/inside the panel surface -- not dim, not clipping, just fully
  // hidden -- which is exactly why they weren't visible at all.
  function addBoardedPlank(rotZ) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.2, 0.055), plankMat);
    plank.position.set(0, 1.05, 0.14);
    plank.rotation.z = rotZ;
    plank.castShadow = true;
    doorFrame.add(plank);
    boardedPlankParts.push(plank);

    [-0.68, 0.68].forEach((along) => {
      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), nailMat);
      const x = Math.cos(rotZ) * along;
      const y = 1.05 + Math.sin(rotZ) * along;
      nail.position.set(x, y, 0.17);
      doorFrame.add(nail);
      boardedPlankParts.push(nail);
    });
  }
  addBoardedPlank(Math.PI / 5);
  addBoardedPlank(-Math.PI / 5);

  const polaroidTex = createPolaroidTexture({ caption: 'PROJECT HOLLOW', date: 'JUNE 1987' });
  const polaroid = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.26),
    new THREE.MeshStandardMaterial({ map: polaroidTex, roughness: 1 })
  );
  polaroid.position.set(0.7, 1.55, 0.06);
  polaroid.rotation.z = 0.08;
  doorFrame.add(polaroid);
  polaroid.userData.interact = {
    label: 'Examine polaroid',
    onInteract: () => showCaption('A polaroid of a shadowy figure, stuck to the door frame. Written on it: "PROJECT HOLLOW", June 1987.')
  };
  interactables.push(polaroid);

  colliders.push({
    minX: doorFrame.position.x - 0.6, maxX: doorFrame.position.x + 0.6,
    minZ: doorFrame.position.z - 0.1, maxZ: doorFrame.position.z + 0.15
  });

  // ---------- claw marks beside the door (storyline: "signs that something
  // violent may have happened", same marks reappear in Level 2's basement) ----------
  const clawTex = createClawMarksTexture();
  const clawNormal = createClawMarksNormalTexture();
  const clawMarks = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshStandardMaterial({
      map: clawTex,
      normalMap: clawNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      transparent: true,
      roughness: 0.95
    })
  );
  clawMarks.position.set(doorFrame.position.x + 0.85, 1.35, ROOM_D / 2 - 0.03);
  clawMarks.rotation.y = Math.PI;
  clawMarks.userData.interact = {
    label: 'Examine the wall',
    onInteract: () => showCaption('Four deep gouges raked into the wallpaper, at roughly shoulder height. Whatever made them was clawing to get OUT.')
  };
  interactables.push(clawMarks);
  group.add(clawMarks);

  // Small canvas post-processing shared by the three puzzle photos below --
  // draws directly onto the already-generated family-photo canvas rather
  // than adding whole new texture-generator functions, since a date stamp
  // and a torn corner are each just a couple of extra canvas calls.
  function stampPhotoDate(tex, date) {
    const ctx = tex.image.getContext('2d');
    ctx.fillStyle = '#2a2118';
    ctx.font = 'italic 15px Georgia';
    ctx.textAlign = 'right';
    ctx.fillText(date, tex.image.width - 8, tex.image.height - 6);
    tex.needsUpdate = true;
    return tex;
  }
  function tearPhotoCorner(tex) {
    const w = tex.image.width;
    const h = tex.image.height;
    const ctx = tex.image.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.62, 0);
    ctx.lineTo(w * 0.8, h * 0.24);
    ctx.lineTo(w * 0.68, h * 0.42);
    ctx.lineTo(w, h * 0.52);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fillStyle = '#b99364'; // torn-away area shows bare cork, not empty black
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,15,10,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    tex.needsUpdate = true;
    return tex;
  }

  // ---------- scattered photographs + scratched floor message ----------
  const photoTex = createFamilyPhotoTexture({ scratchedFourth: true });
  for (let i = 0; i < 4; i++) {
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.17),
      new THREE.MeshStandardMaterial({ map: photoTex, roughness: 1 })
    );
    photo.rotation.x = -Math.PI / 2;
    photo.rotation.z = Math.random() * Math.PI;
    photo.position.set(0.4 + Math.random() * 1.2, 0.015, 0.4 + Math.random() * 0.8);
    photo.userData.interact = {
      label: i === 0 ? 'Examine family photograph' : 'Examine photograph',
      onInteract: () => showCaption(
        i === 0
          ? 'A family photo. Four people. The fourth has been scratched out with marker.'
          : 'An old photograph, face down among the mess.'
      )
    };
    interactables.push(photo);
    group.add(photo);
  }

  // The third puzzle photo (used to live in a second nightstand drawer
  // wedged awkwardly against the bed/wall corner -- removed, see the
  // drawer system below) lies loose on the floor with the rest of this
  // pile instead: the same family photo as the other two puzzle photos,
  // dated 1986 (between the other two), with a corner torn away so it
  // still reads as visually distinct from the purely decorative photos.
  const tornPhotoTex = tearPhotoCorner(stampPhotoDate(createFamilyPhotoTexture(), '1986'));
  const floorPhoto = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.17),
    new THREE.MeshStandardMaterial({ map: tornPhotoTex, roughness: 1 })
  );
  floorPhoto.rotation.x = -Math.PI / 2;
  floorPhoto.rotation.z = -0.4;
  floorPhoto.position.set(1.6, 0.016, 0.5);
  floorPhoto.userData.interact = {
    label: 'Pick up photograph',
    onInteract: () => {
      showCaption('A third photograph, torn at the corner. The family again -- dated 1986.');
      puzzleState.foundPhotos.add('floorPhoto');
      photoThumbMeshes.floorPhoto.visible = true;
      floorPhoto.visible = false;
      const idx = interactables.indexOf(floorPhoto);
      if (idx >= 0) interactables.splice(idx, 1);
    }
  };
  interactables.push(floorPhoto);
  group.add(floorPhoto);

  const messageTex = createScratchedMessageTexture("DON'T LET IT OUT");
  const messageNormal = createScratchedMessageNormalTexture("DON'T LET IT OUT");
  const message = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.55),
    new THREE.MeshStandardMaterial({
      map: messageTex,
      normalMap: messageNormal,
      normalScale: new THREE.Vector2(1.4, 1.4),
      transparent: true,
      roughness: 1
    })
  );
  message.rotation.x = -Math.PI / 2;
  message.position.set(1.35, 0.011, -1.0);
  message.userData.interact = {
    label: 'Read the floor',
    onInteract: () => showCaption('Scratched into the floorboards, in shaking letters: "Don\'t let it out."')
  };
  interactables.push(message);
  group.add(message);

  // ---------- flashlight prop (pickup handled by main.js via callback hook) ----------
  // Height matches the nightstand top below (0.72, close to the mattress's
  // own 0.74) -- was previously pinned to a knee-high 0.42 m table.
  const flashlight = new THREE.Group();
  flashlight.position.set(-2.5, 0.78, 1.7);
  const flashBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 })
  );
  flashBody.rotation.z = Math.PI / 2;
  flashlight.add(flashBody);
  const flashLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.02, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 0.4 })
  );
  flashLens.rotation.z = Math.PI / 2;
  flashLens.position.x = 0.12;
  flashlight.add(flashLens);
  group.add(flashlight);

  // The flashlight's visual meshes are a THREE.Group, which has no
  // raycast of its own (Object3D.raycast is a no-op; only Mesh/Line/
  // Points implement one), and the interaction system intersects its
  // target list non-recursively -- so the group itself can never be
  // hit-tested. A generous invisible sphere sitting on top of it is the
  // actual interactable, which also makes picking it up far more
  // forgiving than aiming at the thin cylinder mesh underneath.
  const flashlightHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  flashlightHitbox.position.copy(flashlight.position);
  flashlightHitbox.userData.interact = {
    label: 'Pick up flashlight',
    onInteract: () => {
      showCaption('You pick up the flashlight.');
      flashlight.visible = false;
      flashlightHitbox.visible = false;
      const idx = interactables.indexOf(flashlightHitbox);
      if (idx >= 0) interactables.splice(idx, 1);
      onFlashlightPicked();
    }
  };
  interactables.push(flashlightHitbox);
  group.add(flashlightHitbox);

  // nightstand the flashlight sits on -- raised again to sit close to the
  // mattress's own top (0.74) rather than well below it, with a thin top
  // slab overhanging the legs rather than a single block, and small
  // clutter so it doesn't read as bare
  const sideTable = new THREE.Group();
  sideTable.position.set(-2.5, 0, 1.7);
  group.add(sideTable);

  const tableLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.76, 0.04), frameMatWood);
  [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(([lx, lz]) => {
    const leg = tableLeg.clone();
    leg.position.set(lx, 0.38, lz);
    sideTable.add(leg);
  });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), frameMatWood);
  tableTop.position.y = 0.78;
  tableTop.castShadow = true;
  sideTable.add(tableTop);

  // A lamp prop that reads as dead at a glance -- no steady glow, matching
  // the storyline's "one working bulb, and it blows out" beat -- but isn't
  // actually off. A loose wire somewhere in this old house's failing power
  // is feeding it just enough to flicker, and the flicker isn't random: it
  // blinks the digits of the nightstand drawer's combination (see
  // drawerPinDigits below), the way a bad connection actually would if you
  // stood and counted the pulses. bulbLight/bulbMat below are the parts
  // update() drives every frame; everything else is static dressing.
  const lampGroup = new THREE.Group();
  lampGroup.position.set(-0.11, 0.8, -0.09);
  sideTable.add(lampGroup);
  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.02, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2016, metalness: 0.4, roughness: 0.5 })
  );
  lampBase.position.y = 0.01;
  lampGroup.add(lampBase);
  const lampPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2016, metalness: 0.5, roughness: 0.4 })
  );
  lampPole.position.y = 0.12;
  lampGroup.add(lampPole);
  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 0.11, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x9c8858, roughness: 0.9, side: THREE.DoubleSide })
  );
  lampShade.position.y = 0.28;
  lampGroup.add(lampShade);

  // The bulb itself, visible through the open top/bottom of the shade
  // cylinder, plus a short-range point light so the flicker actually
  // lights the nightstand rather than just changing the mesh's own colour.
  // Both start at their dim/"off" values -- update() below pushes them up
  // for each pulse.
  const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb347, emissiveIntensity: 0.12 });
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), lampBulbMat);
  lampBulb.position.y = 0.24;
  lampGroup.add(lampBulb);
  const lampLight = new THREE.PointLight(0xffb347, 0.04, 1.6, 2);
  lampLight.position.y = 0.24;
  lampGroup.add(lampLight);

  // The combination for the drawer below, as a flicker pattern: three
  // pulses, a pause, one pulse, a pause, five pulses, a longer pause,
  // then it repeats. buildFlickerIntervals turns that digit list into
  // concrete [start,end) time windows within one repeating cycle, once,
  // rather than driving a hand-rolled counter/state-machine in update().
  const drawerPinDigits = [3, 1, 5];
  const drawerPinCode = drawerPinDigits.join('');

  function buildFlickerIntervals(digits, { pulseOn = 0.16, pulseOff = 0.22, digitPause = 1.0, cyclePause = 3.2 } = {}) {
    const intervals = [];
    let t = 0;
    digits.forEach((count) => {
      for (let i = 0; i < count; i++) {
        intervals.push([t, t + pulseOn]);
        t += pulseOn + pulseOff;
      }
      t += digitPause - pulseOff; // stretch the trailing gap into the longer between-digit pause
    });
    t += cyclePause - digitPause; // and again at the end, before the whole thing loops
    return { intervals, total: t };
  }
  const lampFlicker = buildFlickerIntervals(drawerPinDigits);

  const nightstandBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.03, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x5a3c2a, roughness: 0.9 })
  );
  nightstandBook.position.set(0.13, 0.795, 0.11);
  nightstandBook.rotation.y = 0.3;
  sideTable.add(nightstandBook);

  // a small twin-bell alarm clock, stopped -- the kind of clutter a
  // nightstand actually has beyond one lamp and one book
  const clockMetal = new THREE.MeshStandardMaterial({ color: 0x8a8060, metalness: 0.5, roughness: 0.5 });
  const clockGroup = new THREE.Group();
  clockGroup.position.set(0.14, 0.8, -0.13);
  sideTable.add(clockGroup);
  const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 14), clockMetal);
  clockBody.rotation.z = Math.PI / 2;
  clockBody.position.y = 0.05;
  clockGroup.add(clockBody);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.042, 16),
    new THREE.MeshStandardMaterial({ color: 0xe8dfc0, roughness: 0.7 })
  );
  clockFace.rotation.y = Math.PI / 2;
  clockFace.position.set(0.036, 0.05, 0);
  clockGroup.add(clockFace);
  [-1, 1].forEach((side) => {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), clockMetal);
    bell.position.set(0, 0.1, side * 0.035);
    clockGroup.add(bell);
  });

  // A locked drawer under the tabletop -- the payoff for reading the
  // lamp's flicker. Same drawer-front-plus-knob construction as the other
  // nightstand's addNightstand() above, just built inline since this one
  // needs its own pin-lock interaction instead of a free "search" one.
  const lampDrawerFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.7 })
  );
  lampDrawerFront.position.set(0, 0.6, 0.19);
  sideTable.add(lampDrawerFront);

  const lampDrawerKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a7a50, metalness: 0.6, roughness: 0.4 })
  );
  lampDrawerKnob.position.set(0, 0.6, 0.205);
  sideTable.add(lampDrawerKnob);

  // Small keyhole/lock plate under the knob -- a plain drawer front reads
  // as freely searchable like the other nightstand's, so this needs its
  // own visible "this one's locked" cue.
  const lampDrawerLock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, metalness: 0.7, roughness: 0.4 })
  );
  lampDrawerLock.rotation.x = Math.PI / 2;
  lampDrawerLock.position.set(0, 0.575, 0.205);
  sideTable.add(lampDrawerLock);

  const lampDrawerHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.24, 0.16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  lampDrawerHitbox.position.set(0, 0.6, 0.15);
  sideTable.add(lampDrawerHitbox);
  lampDrawerHitbox.userData.interact = {
    label: 'Locked drawer',
    onInteract: () => {
      if (drawerStates.lampDrawer.isOpen) {
        showCaption('The drawer stands open, empty now.');
        return;
      }
      onExaminePinpad({
        length: drawerPinDigits.length,
        code: drawerPinCode,
        onSolved: () => {
          drawerStates.lampDrawer.isOpen = true;
          puzzleState.hasKey = true;
          showCaption('The lock gives with a click. Inside the drawer: an old brass key.');
        }
      });
    }
  };
  interactables.push(lampDrawerHitbox);

  colliders.push({
    minX: sideTable.position.x - 0.21, maxX: sideTable.position.x + 0.21,
    minZ: sideTable.position.z - 0.21, maxZ: sideTable.position.z + 0.21
  });

  // ---------- paperclip near the bed frame ----------
  // A single partial torus (the old geometry) is rotationally symmetric
  // and reads as a plain bent hook, not a paperclip -- a real one is a
  // doubled loop, one fold nested just inside the other. Approximated
  // here with two elongated (non-uniformly scaled, so oval rather than
  // circular) open torus arcs nested together, which at a glance reads
  // as the genuine doubled-wire shape instead of a single ring fragment.
  const paperclip = new THREE.Group();
  // On the floor beside the headboard, still roughly along the spawn's
  // facing direction so it's findable with a natural downward glance
  // rather than requiring the player to turn around. The old Y (0.69,
  // picked for a "35 degrees below eye line" angle from spawn) actually
  // sat *inside* the mattress's own bounding box (RoundedBoxGeometry
  // centred at y=0.63, +-0.11) -- geometrically embedded and invisible
  // regardless of material or lighting, which is the real reason it was
  // never visible. Floor level, just outside the mattress/frame footprint
  // in X, is the only place at this X/Z it can actually be seen.
  paperclip.position.set(1.13, 0.024, -2.4);
  paperclip.rotation.x = Math.PI / 2;
  group.add(paperclip);

  // Slightly less metallic/glossy than a true polished wire -- at this
  // scene's very low ambient light, a near-mirror material (the old
  // metalness 0.9 / roughness 0.3) only ever catches a razor-thin
  // specular glint and otherwise reads as black; a bit more roughness
  // picks up general room light instead of relying on a direct highlight.
  // Sized up from a real ~3cm paperclip too -- true-to-life scale was
  // still a barely-there fleck on the floor even once it was no longer
  // hidden inside the mattress.
  const paperclipMat = new THREE.MeshStandardMaterial({ color: 0xc2c2be, metalness: 0.7, roughness: 0.45 });
  const paperclipOuter = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0035, 8, 20, Math.PI * 1.7), paperclipMat);
  paperclipOuter.scale.set(1, 1.9, 1);
  paperclipOuter.rotation.z = Math.PI * 0.15;
  paperclipOuter.castShadow = true;
  paperclip.add(paperclipOuter);

  const paperclipInner = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0035, 8, 20, Math.PI * 1.7), paperclipMat);
  paperclipInner.scale.set(1, 1.9, 1);
  paperclipInner.rotation.z = Math.PI * 0.15;
  paperclipInner.position.set(0.0037, -0.0058, 0);
  paperclipInner.castShadow = true;
  paperclip.add(paperclipInner);

  // The paperclip's real geometry is two thin wire loops -- correct for
  // how a paperclip should look, but the ray has to pass almost exactly
  // through one of those slender tubes to register a hit, which makes it
  // effectively unclickable. A padded invisible sphere is the actual
  // interactable, same approach as the flashlight.
  const paperclipHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  paperclipHitbox.position.copy(paperclip.position);
  paperclipHitbox.userData.interact = {
    label: 'Pick up paperclip',
    onInteract: () => {
      showCaption("You work the paperclip into the cuff's lock... it clicks open.");
      paperclip.visible = false;
      paperclipHitbox.visible = false;
      const idx = interactables.indexOf(paperclipHitbox);
      if (idx >= 0) interactables.splice(idx, 1);
      chain.visible = false;
      setTimeout(onFreed, 900);
    }
  };
  interactables.push(paperclipHitbox);
  group.add(paperclipHitbox);

  // fallen chair for the "abandoned in a hurry" dressing
  const chairGroup = new THREE.Group();
  chairGroup.position.set(-1.6, 0, 0.4);
  chairGroup.rotation.set(0, 0.6, Math.PI / 2.2);
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), frameMatWood);
  chairSeat.position.y = 0.42;
  chairGroup.add(chairSeat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), frameMatWood);
  chairBack.position.set(0, 0.65, -0.2);
  chairGroup.add(chairBack);
  group.add(chairGroup);

  // ---------- knocked-over waste bin (abandoned-in-a-hurry dressing) ----------
  const binMat = new THREE.MeshStandardMaterial({ color: 0x34342f, metalness: 0.5, roughness: 0.6 });
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.28, 14, 1, true), binMat);
  bin.position.set(2.35, 0.11, 0.75);
  bin.rotation.set(0, 0.3, Math.PI / 2 + 0.12);
  bin.castShadow = true;
  group.add(bin);

  // a few crumpled balls of paper spilled out across the floor
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 1 });
  [[2.55, 0.025, 0.6], [2.62, 0.025, 0.88], [2.18, 0.025, 0.92], [2.4, 0.025, 1.02]].forEach(([x, y, z]) => {
    const paper = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032, 0), paperMat);
    paper.position.set(x, y, z);
    paper.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    paper.scale.set(1, 0.7, 1);
    group.add(paper);
  });

  // ---------- more claw-mark decals scattered around the room -- the
  // storyline's "signs something violent happened" reads as a pattern of
  // desperation throughout the room, not one isolated mark by the door ----------
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
  addClawMarks(-ROOM_W / 2 + 0.03, 1.15, -0.4, Math.PI / 2);
  addClawMarks(ROOM_W / 2 - 0.03, 1.4, 1.1, -Math.PI / 2, 0.8);
  addClawMarks(-0.75, 1.75, -ROOM_D / 2 + 0.03, 0, 1.1);
  addClawMarks(1.35, 1.9, -ROOM_D / 2 + 0.03, 0, 0.85);
  addClawMarks(-2.5, 0.5, ROOM_D / 2 - 0.03, Math.PI, 0.7);

  // ---------- cobwebs in neglected ceiling corners -- nobody's cleaned
  // this house in a long time, and it's a cheap detail no normal-mapped
  // wall/floor texture pass covers on its own ----------
  function addCobweb(x, y, z, rotY, tiltX = -0.3, tiltZ = 0.3) {
    const web = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshStandardMaterial({ map: createCobwebTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1 })
    );
    web.position.set(x, y, z);
    web.rotation.set(tiltX, rotY, tiltZ);
    group.add(web);
  }
  addCobweb(-ROOM_W / 2 + 0.08, ROOM_H - 0.15, -ROOM_D / 2 + 0.08, Math.PI / 4);
  addCobweb(ROOM_W / 2 - 0.08, ROOM_H - 0.15, ROOM_D / 2 - 0.08, Math.PI / 4 + Math.PI);
  addCobweb(-ROOM_W / 2 + 0.08, ROOM_H - 0.15, ROOM_D / 2 - 0.08, -Math.PI / 4, -0.3, -0.3);
  addCobweb(ROOM_W / 2 - 0.08, ROOM_H - 0.15, -ROOM_D / 2 + 0.08, -Math.PI / 4 + Math.PI, -0.3, -0.3);
  // a smaller one low in the corner behind the dresser -- webs collect at
  // floor level in undisturbed corners just as much as up at the ceiling
  addCobweb(ROOM_W / 2 - 0.06, 0.12, ROOM_D / 2 - 0.06, Math.PI / 4 + Math.PI, 0.3, -0.3);

  // ---------- peeling wallpaper -- transparent everywhere but the flap
  // itself, so the real wall (and its actual damask pattern) shows
  // through around it instead of a fake opaque "plaster" rectangle ----------
  function addPeelingWallpaper(x, y, z, rotY, scale = 1) {
    const flap = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5 * scale, 0.5 * scale),
      new THREE.MeshStandardMaterial({ map: createPeelingWallpaperTexture(), transparent: true, roughness: 0.95 })
    );
    // pulled a few cm off the wall and tilted slightly so it actually
    // reads as lifting away, not pasted flush against the surface
    flap.position.set(x + Math.sin(rotY) * 0.02, y, z + Math.cos(rotY) * 0.02);
    flap.rotation.y = rotY;
    flap.rotation.x = (Math.random() - 0.5) * 0.15;
    flap.rotation.z = (Math.random() - 0.5) * 0.08;
    group.add(flap);
  }
  addPeelingWallpaper(1.9, 1.85, -ROOM_D / 2 + 0.035, 0, 1.1);
  addPeelingWallpaper(-ROOM_W / 2 + 0.035, 0.9, 1.6, Math.PI / 2, 0.9);

  // Ornate Persian-style rug (filled border band, nested medallion, corner
  // motifs -- see textures.js) with a matching normal map for pile detail,
  // plus a fringe of small tassels along the two short ends. Bigger than
  // before (2.2x1.4, was 1.8x1.2) and using the richer default palette
  // (deep red field, dark teal border, cream trim, gold medallion core).
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshStandardMaterial({
      map: createRugTexture(),
      normalMap: createRugNormalTexture(),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 1
    })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = 0.05;
  rug.position.set(0.6, 0.008, 0.3);
  group.add(rug);

  // Tassels are children of the rug plane itself, so they inherit its
  // rotation for free and only need positioning in the plane's own local
  // (pre-rotation) XY -- width (2.2) along local X, the two short ends
  // (1.4 depth) at local Y = ±0.7.
  const fringeMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 1 });
  const fringeGeo = new THREE.BoxGeometry(0.014, 0.05, 0.004);
  [-0.7, 0.7].forEach((ey) => {
    for (let i = 0; i < 18; i++) {
      const tassel = new THREE.Mesh(fringeGeo, fringeMat);
      const along = -1.06 + (2.12 / 17) * i;
      tassel.position.set(along, ey + 0.025 * Math.sign(ey), 0.001);
      tassel.rotation.z = (Math.random() - 0.5) * 0.3;
      rug.add(tassel);
    }
  });

  interactables.push(doorSlab);
  doorSlab.userData.interact = {
    label: 'Open door',
    onInteract: () => {
      if (!puzzleState.planksRemoved) {
        if (puzzleState.hasCrowbar) {
          puzzleState.planksRemoved = true;
          puzzleState.hasCrowbar = false;
          boardedPlankParts.forEach((part) => { part.visible = false; });
          showCaption('You wedge the crowbar behind the planks and pry them off the door.');
        } else {
          showCaption('Two wooden planks, boarded diagonally. Whatever is in this house trapped you inside.');
        }
      } else if (!puzzleState.doorUnlocked) {
        puzzleState.doorUnlocked = true;
        showCaption('The door creaks open on its hinges. You slip out into the dark hallway...');
        // Give the hinge swing a beat to actually play out before cutting
        // to Level 2, rather than transitioning the instant it's unlocked.
        setTimeout(onDoorOpened, 1400);
      } else {
        showCaption('The door hangs open ahead of you.');
      }
    }
  };

  // ---------- interactive drawer system ----------
  const drawerStates = {
    nightstandLeft: { isOpen: false, contents: ['old photograph', 'battery'] },
    dresserTop: { isOpen: false, contents: ['family photo (scratched)'] },
    bin: { isOpen: false, contents: [] },
    // Locked -- see lampDrawerHitbox above. Opens once the pin pad is
    // solved with the code the nightstand lamp flickers out.
    lampDrawer: { isOpen: false, contents: ['key'] }
  };

  // The nightstand used to be a bare invisible hitbox with no furniture
  // marking it at all. It's now an actual small table (legs + top + a
  // drawer front you can see) standing in open floor, so there's
  // something to spot and something to aim at. (There used to be a
  // second one flanking the bed's other side, wedged into the tight
  // headboard/wall corner -- removed as redundant clutter; its photo now
  // just lies on the floor with the other scattered photographs below.)
  function addNightstand(x, z, rotY = 0) {
    const ns = new THREE.Group();
    ns.position.set(x, 0, z);
    ns.rotation.y = rotY;
    group.add(ns);

    const legGeo = new THREE.BoxGeometry(0.035, 0.42, 0.035);
    [[-0.16, -0.13], [0.16, -0.13], [-0.16, 0.13], [0.16, 0.13]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, frameMatWood);
      leg.position.set(lx, 0.21, lz);
      ns.add(leg);
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.32), frameMatWood);
    top.position.y = 0.435;
    top.castShadow = true;
    ns.add(top);

    const drawerFront = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.16, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.7 })
    );
    drawerFront.position.set(0, 0.32, 0.16);
    ns.add(drawerFront);

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a7a50, metalness: 0.6, roughness: 0.4 })
    );
    knob.position.set(0, 0.32, 0.175);
    ns.add(knob);

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.34),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.set(0, 0.32, 0.1);
    ns.add(hitbox);
    return hitbox;
  }

  // Nightstand left drawer (freely searchable) -- against the back wall
  // between the window and the bed, with clearance to walk up to it.
  const nightstandLeft = addNightstand(-0.3, -1.95);
  nightstandLeft.userData.interact = {
    label: '[E] Search drawer',
    onInteract: () => {
      if (!drawerStates.nightstandLeft.isOpen) {
        drawerStates.nightstandLeft.isOpen = true;
        showCaption('Inside the drawer you find a faded family photograph, dated 1985, and an old battery.');
        puzzleState.foundPhotos.add('nightstandLeft');
        photoThumbMeshes.nightstandLeft.visible = true;
      } else {
        showCaption('You already searched this drawer.');
      }
    }
  };
  interactables.push(nightstandLeft);

  // Knocked-over waste bin -- holds the key on its own, away from any of
  // the three photo drawers, so finding it isn't tangled up with the
  // photo count.
  const binHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.3, 0.35),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  binHitbox.position.copy(bin.position);
  binHitbox.position.y += 0.05;
  group.add(binHitbox);
  binHitbox.userData.interact = {
    label: '[E] Search bin',
    onInteract: () => {
      if (!drawerStates.bin.isOpen) {
        drawerStates.bin.isOpen = true;
        showCaption('Just crumpled paper, spilled out when it tipped over. Nothing else in here.');
      } else {
        showCaption('Just crumpled paper left in here.');
      }
    }
  };
  interactables.push(binHitbox);

  // Dresser top drawer (freely searchable)
  const dresserTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.2, 0.6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  dresserTop.position.set(2.7, 1.1, 1.6);
  group.add(dresserTop);
  dresserTop.userData.interact = {
    label: '[E] Search dresser',
    onInteract: () => {
      if (!drawerStates.dresserTop.isOpen) {
        drawerStates.dresserTop.isOpen = true;
        showCaption('Under some old trinkets you find another photograph, dated 1987. The fourth person has been scratched out completely.');
        puzzleState.foundPhotos.add('dresserTop');
        photoThumbMeshes.dresserTop.visible = true;
      } else {
        showCaption('You already searched this dresser.');
      }
    }
  };
  interactables.push(dresserTop);

  // ---------- photo arrangement puzzle ----------
  // A corkboard hinged flush onto the left wall, mounted directly over the
  // recessed cavity carved out above -- rather than a frame floating in
  // front of a solid wall (which read as a slab jutting out of it), its
  // thin axis is aligned with the wall's own normal so it lies flat, and
  // it's a swinging door on that recess: closed it looks like ordinary
  // wall decor, but once all three photos are arranged it hinges open
  // into the room to reveal the cavity -- and the locked box sitting
  // inside it -- the way a picture conceals a wall safe.
  const pinboardWidth = pinRecess.w + 0.06;
  const pinboardHeight = pinRecess.h + 0.06;
  const pinboardX = -ROOM_W / 2 + 0.12; // flush with the recess's inner (room-facing) face
  const pinboardHingeZ = pinRecess.z + pinboardWidth / 2; // hinge on the far edge of the gap
  const pinboardClosedRotY = Math.PI / 2; // matches the left wall's own rotation.y
  const pinboardOpenSwing = -Math.PI / 2; // swings 90 deg out into the room, clear of the cavity

  const pinboardHinge = new THREE.Object3D();
  pinboardHinge.position.set(pinboardX, pinRecess.y, pinboardHingeZ);
  pinboardHinge.rotation.y = pinboardClosedRotY;
  group.add(pinboardHinge);

  const photoHolderGroup = new THREE.Group();
  photoHolderGroup.position.x = pinboardWidth / 2; // recentre on the hinge's local origin
  pinboardHinge.add(photoHolderGroup);

  const pinboardFrame = new THREE.Mesh(
    new THREE.BoxGeometry(pinboardWidth, pinboardHeight, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.85 })
  );
  photoHolderGroup.add(pinboardFrame);

  const corkPanel = new THREE.Mesh(
    new THREE.BoxGeometry(pinboardWidth - 0.08, pinboardHeight - 0.08, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xb99364, roughness: 1 })
  );
  corkPanel.position.z = 0.02;
  photoHolderGroup.add(corkPanel);

  // Each of the three findable photos gets its own pin + a real photo
  // thumbnail underneath it (hidden until that photo is actually found),
  // so the corkboard fills in as you search the room instead of staying
  // an abstract counter. They're purely a preview here, though -- actually
  // solving the puzzle happens in a dedicated close-up board view (see
  // onExaminePhotos below) where the photos can be dragged into place,
  // rather than clicking each one in the 3D world.
  const pinGeo = new THREE.SphereGeometry(0.015, 8, 6);
  const photoSlots = {
    nightstandLeft: { pin: [-0.2, 0.28], pinColor: 0xa02020, photo: [-0.2, 0.16, -0.06], tex: stampPhotoDate(createFamilyPhotoTexture(), '1985'), date: 1985, w: 0.22, h: 0.17 },
    floorPhoto: { pin: [0.16, 0.31], pinColor: 0x1f4f8f, photo: [0.16, 0.19, 0.05], tex: tornPhotoTex, date: 1986, w: 0.22, h: 0.17 },
    dresserTop: { pin: [-0.02, -0.08], pinColor: 0xc9a227, photo: [-0.02, -0.2, 0.03], tex: stampPhotoDate(createFamilyPhotoTexture({ scratchedFourth: true }), '1987'), date: 1987, w: 0.22, h: 0.17 }
  };
  const photoThumbMeshes = {};
  Object.entries(photoSlots).forEach(([key, slot]) => {
    const pin = new THREE.Mesh(pinGeo, new THREE.MeshStandardMaterial({ color: slot.pinColor, roughness: 0.4, metalness: 0.5 }));
    pin.position.set(slot.pin[0], slot.pin[1], 0.045);
    photoHolderGroup.add(pin);

    const thumb = new THREE.Mesh(
      new THREE.PlaneGeometry(slot.w, slot.h),
      new THREE.MeshStandardMaterial({ map: slot.tex, roughness: 1 })
    );
    thumb.position.set(slot.photo[0], slot.photo[1], 0.033);
    thumb.rotation.z = slot.photo[2];
    thumb.visible = false;
    photoHolderGroup.add(thumb);
    photoThumbMeshes[key] = thumb;
  });

  const photoAreaHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(pinboardWidth - 0.05, pinboardHeight - 0.05, 0.15),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  photoAreaHitbox.userData.interact = {
    label: 'Examine corkboard',
    onInteract: () => {
      if (puzzleState.photosArranged) {
        showCaption('The corkboard hangs open.');
      } else if (puzzleState.foundPhotos.size < 3) {
        showCaption('A corkboard. You could pin photographs up here.');
      } else {
        // Hand off to the close-up board view -- dragging the photos into
        // place (and figuring out what order they actually belong in) is
        // the real puzzle, not this in-world interact.
        onExaminePhotos({
          photos: Object.entries(photoSlots).map(([key, slot]) => ({
            key,
            date: slot.date,
            dataUrl: slot.tex.image.toDataURL('image/png')
          })),
          onSolved: () => {
            showCaption('Something clicks nearby... The corkboard swings open on a hidden hinge, revealing a hollow in the wall.');
            puzzleState.photosArranged = true;
            boxBody.visible = true;
            boxLid.visible = true;
            lockPlate.visible = true;
          }
        });
      }
    }
  };
  photoHolderGroup.add(photoAreaHitbox);
  interactables.push(photoAreaHitbox);

  // ---------- locked box (sits in the wall cavity behind the pinboard, appears after photo puzzle is solved) ----------
  const lockedBoxGroup = new THREE.Group();
  lockedBoxGroup.position.set(-ROOM_W / 2 - pinRecess.depth * 0.55, pinRecess.y - pinRecess.h / 2 + 0.16, pinRecess.z);
  lockedBoxGroup.rotation.y = Math.PI / 2; // face the lock plate out toward the room
  group.add(lockedBoxGroup);

  const boxBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9, metalness: 0.2 })
  );
  boxBody.visible = false; // Hidden until photo puzzle is solved
  lockedBoxGroup.add(boxBody);

  const boxLid = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.08, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.8 })
  );
  boxLid.position.y = 0.19;
  boxLid.visible = false; // Hidden until photo puzzle is solved
  lockedBoxGroup.add(boxLid);

  // Lock indicator (small cylinder)
  const lockPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: 0.5, metalness: 0.7 })
  );
  lockPlate.rotation.x = Math.PI / 2;
  lockPlate.position.set(0, 0.08, 0.15);
  lockPlate.visible = false; // Hidden until photo puzzle is solved
  lockedBoxGroup.add(lockPlate);

  const boxHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.35, 0.35),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  boxHitbox.userData.interact = {
    label: '[E] Open box',
    onInteract: () => {
      if (puzzleState.photosArranged && puzzleState.hasKey) {
        showCaption('The key fits! Inside the box you find a crowbar. This should remove those wooden planks...');
        boxHitbox.visible = false;
        boxBody.visible = false;
        boxLid.visible = false;
        lockPlate.visible = false;
        puzzleState.hasKey = false;
        puzzleState.hasCrowbar = true;
      } else if (puzzleState.photosArranged) {
        showCaption('The box is locked. You need to find a key first.');
      } else {
        showCaption('The box is locked tight. Maybe clues elsewhere will help unlock it.');
      }
    }
  };
  lockedBoxGroup.add(boxHitbox);
  interactables.push(boxHitbox);

  return {
    group,
    interactables,
    colliders,
    spawn: [1.9, -ROOM_D / 2 + 1.6],
    // Face roughly toward the headboard/window/paperclip corner on wake
    // (matches the storyline's own beat order: storm/window first, then
    // adjusting to the room, then spotting the paperclip by the bed) --
    // not toward the door behind the player, which left the one prop
    // they must interact with while still chained out of view entirely.
    spawnYaw: 0.5,
    refs: {
      bulbLight,
      lightning,
      windowGroup,
      flashlight,
      flashlightHitbox,
      paperclip,
      paperclipHitbox,
      chain,
      doorSlab,
      messagePlane: message,
      ambient,
      glassMaterial,
      puzzleState
    },
    // Puts every piece of run-specific state this level owns back to its
    // starting point -- restart previously only touched the paperclip/
    // flashlight/chain (handled by main.js directly via refs), which left
    // the photo puzzle, the box, the boarded door and every drawer still
    // solved after a restart. Centralised here instead of duplicated in
    // main.js since most of this state (drawerStates, the hinges, the
    // photo thumbnails) isn't exposed via refs at all.
    reset() {
      paperclip.visible = true;
      paperclipHitbox.visible = true;
      if (!interactables.includes(paperclipHitbox)) interactables.push(paperclipHitbox);
      chain.visible = true;

      flashlight.visible = true;
      flashlightHitbox.visible = true;
      if (!interactables.includes(flashlightHitbox)) interactables.push(flashlightHitbox);

      drawerStates.nightstandLeft.isOpen = false;
      drawerStates.dresserTop.isOpen = false;
      drawerStates.bin.isOpen = false;
      drawerStates.lampDrawer.isOpen = false;

      floorPhoto.visible = true;
      if (!interactables.includes(floorPhoto)) interactables.push(floorPhoto);
      Object.values(photoThumbMeshes).forEach((thumb) => { thumb.visible = false; });
      pinboardHinge.rotation.y = pinboardClosedRotY;

      boxHitbox.visible = true;
      boxBody.visible = false;
      boxLid.visible = false;
      lockPlate.visible = false;

      boardedPlankParts.forEach((part) => { part.visible = true; });
      doorHinge.rotation.y = 0;

      puzzleState.chainsEscaped = false;
      puzzleState.hasFlashlight = false;
      puzzleState.foundPhotos.clear();
      puzzleState.photosArranged = false;
      puzzleState.hasKey = false;
      puzzleState.hasCrowbar = false;
      puzzleState.planksRemoved = false;
      puzzleState.doorUnlocked = false;
    },
    update(dt) {
      this._t = (this._t ?? 0) + dt;
      glassMaterial.uniforms.uTime.value = this._t;

      // Drive the nightstand lamp's flicker off the schedule built above --
      // a low, always-on glow (it never reads as fully "off") with brief
      // brighter pulses layered on top for each flash in the code.
      this._lampT = ((this._lampT ?? 0) + dt) % lampFlicker.total;
      const lampPulseOn = lampFlicker.intervals.some(([s, e]) => this._lampT >= s && this._lampT < e);
      lampLight.intensity = lampPulseOn ? 0.55 : 0.04;
      lampBulbMat.emissiveIntensity = lampPulseOn ? 1.1 : 0.12;
      // Storm.js drives `lightning`'s intensity up to ~3.2 during a flash;
      // feed that same value into the shader (normalised to 0-1) so the
      // window pane brightens in sync with the flash instead of on its
      // own separate timer.
      glassMaterial.uniforms.uFlash.value = Math.min(lightning.intensity / 3.2, 1.0);

      // Swing the pinboard open on its hinge once the photo puzzle is
      // solved, easing toward the target angle rather than snapping so
      // the reveal reads as a physical door swinging, not a cut.
      const targetSwing = puzzleState.photosArranged ? pinboardOpenSwing : 0;
      const targetRotY = pinboardClosedRotY + targetSwing;
      pinboardHinge.rotation.y += (targetRotY - pinboardHinge.rotation.y) * Math.min(1, dt * 3);

      // Same easing treatment for the front door once the planks are
      // pried off and it's actually been opened.
      const targetDoorRotY = puzzleState.doorUnlocked ? doorOpenSwing : 0;
      doorHinge.rotation.y += (targetDoorRotY - doorHinge.rotation.y) * Math.min(1, dt * 3);
    }
  };
}
