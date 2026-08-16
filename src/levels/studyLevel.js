import * as THREE from 'three';
import { createWoodFloorTexture, createPlasterWallTexture, createFamilyPhotoTexture } from '../world/textures.js';

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
  const wallTex = createPlasterWallTexture('#5c5648');

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ color: 0x1a1712 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  group.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
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

  const ambient = new THREE.AmbientLight(0x342c24, 0.7);
  group.add(ambient);
  const lamp = new THREE.PointLight(0xffcf8a, 1.6, 10, 2);
  lamp.position.set(0, 2.4, -0.5);
  group.add(lamp);
  const doorLamp = new THREE.PointLight(0xffcf8a, 0.8, 6, 2);
  doorLamp.position.set(1.5, 2.2, 2.2);
  group.add(doorLamp);

  // study desk + bookshelves
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.85 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 0.7), woodMat);
  desk.position.set(-2, 0.375, -2);
  group.add(desk);
  colliders.push({ minX: desk.position.x - 0.85, maxX: desk.position.x + 0.85, minZ: desk.position.z - 0.4, maxZ: desk.position.z + 0.4 });

  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.35), woodMat);
    shelf.position.set(ROOM_W / 2 - 0.9, 1.1, -2 + i * 1.6);
    group.add(shelf);
    colliders.push({ minX: shelf.position.x - 0.65, maxX: shelf.position.x + 0.65, minZ: shelf.position.z - 0.22, maxZ: shelf.position.z + 0.22 });
  }

  // portrait with the scratched-out fourth family member
  const portraitTex = createFamilyPhotoTexture({ scratchedFourth: true });
  const portrait = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.7),
    new THREE.MeshStandardMaterial({ map: portraitTex })
  );
  portrait.position.set(-ROOM_W / 2 + 0.05, 1.7, 1);
  portrait.rotation.y = Math.PI / 2;
  portrait.userData.interact = {
    label: 'Examine family portrait',
    onInteract: () => showCaption('The same family photo from the bedroom. Four people. The fourth scratched out.')
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
    refs: { lamp, doorLamp },
    update() {}
  };
}
