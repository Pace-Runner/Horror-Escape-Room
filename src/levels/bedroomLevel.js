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
export function createBedroomLevel({ showCaption = () => {}, onFreed = () => {}, onFlashlightPicked = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Level1_Bedroom';
  const interactables = [];
  const colliders = [];

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

  // back wall (has the window), front wall (has the door), left/right walls
  addWallWithGap(ROOM_W, ROOM_H, -ROOM_D / 2, -2.1, 1.5, 1.3, 1.5);
  addWall(ROOM_D, ROOM_H, -ROOM_W / 2, ROOM_H / 2, 0, Math.PI / 2);
  addWall(ROOM_D, ROOM_H, ROOM_W / 2, ROOM_H / 2, 0, -Math.PI / 2);
  addWall(ROOM_W, ROOM_H, 0, ROOM_H / 2, ROOM_D / 2, Math.PI);

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

  // chain + handcuff, children of the post they're bolted to
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.4 });
  const chain = new THREE.Group();
  chain.position.set(0.02, 0.75, 0.05);
  headboardPost.add(chain);
  for (let i = 0; i < 6; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10), chainMat);
    link.position.set(0.1 * i, -0.06 * i, 0);
    link.rotation.set(Math.random() * 0.4, i * 0.5, 0);
    chain.add(link);
  }
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 16), chainMat);
  cuff.position.set(0.58, -0.32, 0.05);
  cuff.rotation.x = Math.PI / 2;
  chain.add(cuff);

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

    [-0.68, 0.68].forEach((along) => {
      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), nailMat);
      const x = Math.cos(rotZ) * along;
      const y = 1.05 + Math.sin(rotZ) * along;
      nail.position.set(x, y, 0.17);
      doorFrame.add(nail);
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

  // A lamp prop, unlit -- the storyline is explicit that the house's power
  // is unstable and the one working bulb blows out shortly after the
  // player stands up, so an actually-glowing second light source here
  // would undercut that "left in darkness" beat. Purely a decorative,
  // powered-down fixture, same as everything else in the room.
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

  colliders.push({
    minX: sideTable.position.x - 0.21, maxX: sideTable.position.x + 0.21,
    minZ: sideTable.position.z - 0.21, maxZ: sideTable.position.z + 0.21
  });

  // ---------- paperclip near the bed frame ----------
  const paperclip = new THREE.Mesh(
    new THREE.TorusGeometry(0.025, 0.004, 6, 16, Math.PI * 1.5),
    new THREE.MeshStandardMaterial({ color: 0xbfbfbf, metalness: 0.9, roughness: 0.3 })
  );
  // Positioned along the bed, directly along the spawn's facing
  // direction and about 35 degrees below eye line -- "hidden next to
  // the bed frame", findable with a natural downward glance from where
  // the player wakes up rather than requiring them to turn around or
  // look at their own feet.
  paperclip.position.set(1.21, 0.69, -2.27);
  paperclip.rotation.x = Math.PI / 2;
  group.add(paperclip);

  // The paperclip's real geometry is a hairline torus (0.004 tube
  // radius) -- correct for how a paperclip should look, but the ray
  // has to pass almost exactly through that 8mm-wide tube to register
  // a hit, which makes it effectively unclickable. A padded invisible
  // sphere is the actual interactable, same approach as the flashlight.
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
    label: 'Examine boarded door',
    onInteract: () => showCaption('Two wooden planks, boarded diagonally. Whatever is in this house trapped you inside.')
  };

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
      glassMaterial
    },
    update(dt) {
      this._t = (this._t ?? 0) + dt;
      glassMaterial.uniforms.uTime.value = this._t;
      // Storm.js drives `lightning`'s intensity up to ~3.2 during a flash;
      // feed that same value into the shader (normalised to 0-1) so the
      // window pane brightens in sync with the flash instead of on its
      // own separate timer.
      glassMaterial.uniforms.uFlash.value = Math.min(lightning.intensity / 3.2, 1.0);
    }
  };
}
