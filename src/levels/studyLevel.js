import * as THREE from 'three';
import {
  createWoodFloorTexture,
  createWoodFloorBumpTexture,
  createPlasterWallTexture,
  createPlasterBumpTexture,
  createFamilyPhotoTexture,
  createRugTexture
} from '../world/textures.js';
import { addBaseboard, makeHandle } from '../world/trim.js';

const ROOM_W = 7.5;
const ROOM_D = 6.5;
const ROOM_H = 3.0;

/**
 * Level 3 blockout: the study, biggest room in the house, ending in the
 * front door. Environment + dressing only -- the three-lock sequence,
 * the visor reveal and the branching ending are not implemented yet.
 *
 * Hierarchy note: the three door locks are children of the front-door
 * group itself (not the frame), since each lock is mounted to the door
 * slab and needs to move if the door is ever animated swinging open.
 */
export function createStudyLevel({ showCaption = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Level3_Study';
  const interactables = [];
  const colliders = [];

  const floorTex = createWoodFloorTexture();
  const floorBump = createWoodFloorBumpTexture();
  const wallTex = createPlasterWallTexture('#5c5648');
  const wallBump = createPlasterBumpTexture();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorBump, bumpScale: 0.4, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ color: 0x1a1712 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  group.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallBump, bumpScale: 0.15, roughness: 0.9 });
  function wall(w, x, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM_H), wallMat);
    m.position.set(x, ROOM_H / 2, z);
    m.rotation.y = ry;
    group.add(m);
  }
  wall(ROOM_W, 0, -ROOM_D / 2, 0);
  wall(ROOM_D, -ROOM_W / 2, 0, Math.PI / 2);
  wall(ROOM_D, ROOM_W / 2, 0, -Math.PI / 2);
  wall(ROOM_W, 0, ROOM_D / 2, Math.PI); // front wall -- the door sits in front of it

  colliders.push(
    { minX: -ROOM_W / 2 - 0.1, maxX: -ROOM_W / 2 + 0.15, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: ROOM_W / 2 - 0.15, maxX: ROOM_W / 2 + 0.1, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: -ROOM_D / 2 - 0.1, maxZ: -ROOM_D / 2 + 0.15 },
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: ROOM_D / 2 - 0.15, maxZ: ROOM_D / 2 + 0.1 }
  );

  addBaseboard(group, { width: ROOM_W, depth: ROOM_D, color: 0x161208 });

  const ambient = new THREE.AmbientLight(0x342c24, 0.43);
  group.add(ambient);
  const lamp = new THREE.PointLight(0xffcf8a, 0.99, 10, 2);
  lamp.position.set(0, 2.4, -0.5);
  group.add(lamp);
  const doorLamp = new THREE.PointLight(0xffcf8a, 0.49, 6, 2);
  doorLamp.position.set(1.5, 2.2, 2.2);
  group.add(doorLamp);

  // study desk + bookshelves
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.85 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 0.7), woodMat);
  desk.position.set(-2, 0.375, -2);
  group.add(desk);
  colliders.push({ minX: desk.position.x - 0.85, maxX: desk.position.x + 0.85, minZ: desk.position.z - 0.4, maxZ: desk.position.z + 0.4 });

  const deskHandle = makeHandle({ length: 0.12 });
  deskHandle.position.set(desk.position.x + 0.5, 0.55, desk.position.z + 0.36);
  group.add(deskHandle);

  // desk chair, tucked in
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.8 });
  const chairGroup = new THREE.Group();
  chairGroup.position.set(desk.position.x, 0, desk.position.z + 0.65);
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), chairMat);
  chairSeat.position.y = 0.45;
  chairGroup.add(chairSeat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), chairMat);
  chairBack.position.set(0, 0.7, 0.19);
  chairGroup.add(chairBack);
  [-0.18, 0.18].forEach((x) => {
    [-0.18, 0.18].forEach((z) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), chairMat);
      leg.position.set(x, 0.225, z);
      chairGroup.add(leg);
    });
  });
  group.add(chairGroup);

  const bookMat = [0x6b2e2a, 0x2e4a3a, 0x3a3560, 0x6b5620, 0x2a2a2a].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
  );
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.35), woodMat);
    shelf.position.set(ROOM_W / 2 - 0.9, 1.1, -2 + i * 1.6);
    group.add(shelf);
    colliders.push({ minX: shelf.position.x - 0.65, maxX: shelf.position.x + 0.65, minZ: shelf.position.z - 0.22, maxZ: shelf.position.z + 0.22 });

    // a row of books on each of three shelf boards per case, leaning at
    // slightly random angles so the shelves don't read as solid blocks
    [-0.7, 0, 0.7].forEach((shelfY) => {
      let x = -0.5;
      while (x < 0.5) {
        const w = 0.04 + Math.random() * 0.04;
        const h = 0.22 + Math.random() * 0.08;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 0.22),
          bookMat[Math.floor(Math.random() * bookMat.length)]
        );
        book.position.set(x, shelfY + h / 2, 0); // local to the shelf, which is its parent
        book.rotation.z = (Math.random() - 0.5) * 0.08;
        shelf.add(book);
        x += w + 0.005;
      }
    });
  }

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.6),
    new THREE.MeshStandardMaterial({ map: createRugTexture({ base: '#2e3a2a', border: '#1c241a', ring: '#3c4a30', trim: '#d8cfa0', core: '#8a6a2a' }), roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(desk.position.x + 0.7, 0.008, desk.position.z + 0.9);
  group.add(rug);

  /**
   * The portrait, in two states.
   *
   * Uncorrected it is the same three people the bedroom's photographs show.
   * Through the visor there are four, and the fourth is scratched out -- which
   * is the storyline's reveal: "the same family picture seen in the first room,
   * this time with a 4th person, scratched out with marker."
   *
   * Both textures are built up front and swapped, rather than one being redrawn,
   * so putting the visor on and taking it off is instant and can be done as many
   * times as the player likes without repainting a canvas.
   */
  const portraitTexPlain = createFamilyPhotoTexture();
  const portraitTexTrue = createFamilyPhotoTexture({ figures: 4, scratchedFourth: true });
  const portraitMat = new THREE.MeshStandardMaterial({ map: portraitTexPlain });
  const portrait = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), portraitMat);
  portrait.position.set(-ROOM_W / 2 + 0.05, 1.7, 1);
  portrait.rotation.y = Math.PI / 2;
  portrait.userData.interact = {
    label: 'Examine family portrait',
    onInteract: () => {
      showCaption(portraitMat.map === portraitTexTrue
        ? 'The same photograph from the bedroom. Four people now. The fourth has been scratched out with marker.'
        : 'The same family photo from the bedroom. Three people, and the same gap on the end.');
    }
  };
  interactables.push(portrait);
  group.add(portrait);

  // uncracked mirror (foreshadowing -- every other mirror in the house is broken)
  const mirrorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.1, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.6 })
  );
  mirrorFrame.position.set(0.5, 1.4, -ROOM_D / 2 + 0.05);
  group.add(mirrorFrame);
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 1, roughness: 0.05 })
  );
  mirrorGlass.position.set(0.5, 1.4, -ROOM_D / 2 + 0.09);
  mirrorGlass.userData.interact = {
    label: 'Look into the mirror',
    onInteract: () => showCaption('The first mirror in the whole house that is not cracked.')
  };
  interactables.push(mirrorGlass);
  group.add(mirrorGlass);

  // front door, three locks mounted to the slab (children of the door group)
  const frontDoor = new THREE.Group();
  frontDoor.position.set(2.5, 0, ROOM_D / 2 - 0.05);
  group.add(frontDoor);

  const doorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 2.1, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x2c2015, roughness: 0.75 })
  );
  doorSlab.position.y = 1.05;
  frontDoor.add(doorSlab);

  const lockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.8, roughness: 0.3 });
  [0.5, 1.0, 1.5].forEach((y, i) => {
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), lockMat);
    lock.position.set(0.35, y, 0.05);
    lock.userData.interact = {
      label: `Examine lock ${i + 1} of 3`,
      onInteract: () => showCaption(`Lock ${i + 1} of 3. All three have to open before this door will.`)
    };
    interactables.push(lock);
    frontDoor.add(lock);
  });

  colliders.push({
    minX: frontDoor.position.x - 0.6, maxX: frontDoor.position.x + 0.6,
    minZ: frontDoor.position.z - 0.1, maxZ: frontDoor.position.z + 0.15
  });

  return {
    group,
    interactables,
    colliders,
    spawn: [-1, 2],
    // face -Z, back toward the desk/bookshelves/mirror rather than out
    // through the front door, so the room reads immediately on entry.
    spawnYaw: 0,
    refs: {
      lamp,
      doorLamp,
      portraitMat,
      portraitTexPlain,
      portraitTexTrue,
      /**
       * What the visor does to this room. Unit 15 will grow this; today it is
       * the portrait, which is the one reveal already built.
       */
      setCorrectedSight(on) {
        portraitMat.map = on ? portraitTexTrue : portraitTexPlain;
        portraitMat.needsUpdate = true;
      }
    },
    update() {}
  };
}
