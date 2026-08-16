import * as THREE from 'three';
import {
  createWoodFloorTexture,
  createPlasterWallTexture,
  createScratchedMessageTexture,
  createPolaroidTexture,
  createFamilyPhotoTexture
} from '../world/textures.js';

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

  const floorTex = createWoodFloorTexture();
  const wallTex = createPlasterWallTexture('#726a5c');

  // ---------- structure ----------
  const structure = new THREE.Group();
  structure.name = 'Structure';
  group.add(structure);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
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

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });

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

  // ---------- ceiling light fixture ----------
  const ceilingAnchor = new THREE.Object3D();
  ceilingAnchor.position.set(0.6, ROOM_H, 0.2);
  group.add(ceilingAnchor);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  cord.position.y = -0.25;
  ceilingAnchor.add(cord);

  const bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb347, emissiveIntensity: 1.4 })
  );
  bulbMesh.position.y = -0.5;
  ceilingAnchor.add(bulbMesh);

  const bulbLight = new THREE.PointLight(0xffb347, 1.4, 7, 2);
  bulbLight.position.y = -0.5;
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(512, 512);
  ceilingAnchor.add(bulbLight);

  // ---------- ambient / storm baseline ----------
  const ambient = new THREE.AmbientLight(0x2a2f3a, 0.35);
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
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.3),
    new THREE.MeshPhysicalMaterial({
      color: 0x0c1420,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0,
      transmission: 0.4
    })
  );
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

  // ---------- bed (headboard post is the parent of the chain + cuff) ----------
  const bedGroup = new THREE.Group();
  bedGroup.position.set(1.9, 0, -ROOM_D / 2 + 1.1);
  group.add(bedGroup);

  const frameMatWood = new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.85 });
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.0), frameMatWood);
  bedBase.position.y = 0.35;
  bedBase.castShadow = true;
  bedBase.receiveShadow = true;
  bedGroup.add(bedBase);

  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.22, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x9c9484, roughness: 1 })
  );
  mattress.position.y = 0.63;
  mattress.receiveShadow = true;
  bedGroup.add(mattress);

  const blanket = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.08, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x54424a, roughness: 1 })
  );
  blanket.position.set(0, 0.78, 0.25);
  bedGroup.add(blanket);

  const headboardPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.1, 0.12),
    frameMatWood
  );
  headboardPost.position.set(-0.6, 0.55, -0.95);
  bedGroup.add(headboardPost);

  const headboard = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 0.08),
    frameMatWood
  );
  headboard.position.set(0, 0.9, -0.97);
  bedGroup.add(headboard);

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

  // ---------- dresser (drawers are children, offset for the half-open look) ----------
  const dresser = new THREE.Group();
  dresser.position.set(2.7, 0, 1.6);
  dresser.rotation.y = -Math.PI / 2;
  group.add(dresser);

  const dresserBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.9, 0.5),
    frameMatWood
  );
  dresserBody.position.y = 0.45;
  dresserBody.castShadow = true;
  dresser.add(dresserBody);

  const drawerMat = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.7 });
  [0.68, 0.42, 0.16].forEach((y, i) => {
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.42), drawerMat);
    drawer.position.set(0, y, i === 1 ? 0.28 : 0.2); // middle drawer left open further
    dresserBody.add(drawer);
  });

  colliders.push({
    minX: dresser.position.x - 0.3, maxX: dresser.position.x + 0.3,
    minZ: dresser.position.z - 0.6, maxZ: dresser.position.z + 0.6
  });

  // ---------- door with boarded planks + polaroid (children of the frame) ----------
  const doorFrame = new THREE.Group();
  doorFrame.position.set(-1.4, 0, ROOM_D / 2 - 0.02);
  group.add(doorFrame);

  const doorFrameMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.15, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x241b13, roughness: 0.8 })
  );
  doorFrameMesh.position.y = 1.075;
  doorFrame.add(doorFrameMesh);

  const doorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.75 })
  );
  doorSlab.position.set(0, 1.0, 0);
  doorFrame.add(doorSlab);

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x5b3f28, roughness: 0.9 });
  const plankA = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.04), plankMat);
  plankA.position.set(0, 1.1, 0.06);
  plankA.rotation.z = Math.PI / 5;
  doorFrame.add(plankA);
  const plankB = plankA.clone();
  plankB.rotation.z = -Math.PI / 5;
  doorFrame.add(plankB);

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
  const message = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.55),
    new THREE.MeshStandardMaterial({ map: messageTex, transparent: true, roughness: 1 })
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
  const flashlight = new THREE.Group();
  flashlight.position.set(-2.5, 0.42, 1.7);
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

  // small side table the flashlight sits on
  const sideTable = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.42, 0.4),
    frameMatWood
  );
  sideTable.position.set(-2.5, 0.21, 1.7);
  group.add(sideTable);
  colliders.push({
    minX: sideTable.position.x - 0.2, maxX: sideTable.position.x + 0.2,
    minZ: sideTable.position.z - 0.2, maxZ: sideTable.position.z + 0.2
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
      ambient
    },
    update() {}
  };
}
