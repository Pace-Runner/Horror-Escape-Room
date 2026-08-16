import * as THREE from 'three';
import { createPlasterWallTexture, createConcreteTexture, createStickyNoteTexture } from '../world/textures.js';
import { createStaticScreenMaterial } from '../world/StaticScreenMaterial.js';

const HALL_W = 2.4;
const HALL_LEN = 5.5;
const HALL_H = 2.7;
const LAB_W = 8;
const LAB_D = 6.5;
const LAB_H = 3.2;
const LAB_Z = HALL_LEN + LAB_D / 2 + 0.2;

/**
 * Level 2 blockout: the hallway the creature is glimpsed in, leading down
 * into the industrial basement lab. This is an environment-only pass --
 * navigable and dressed, but the power-restore puzzle and camera-feed
 * interactions described in the storyline are not wired up yet.
 *
 * Hierarchy notes:
 *  - the CCTV monitor mesh and its screen-glow point light are children
 *    of the desk group, since the monitor sits on the desk and should
 *    move with it as one prop.
 *  - the fluorescent tube meshes are children of a `fixturesGroup` so the
 *    whole strip can be repositioned or its material swapped in one place.
 */
export function createHallwayBasementLevel({ showCaption = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Level2_HallwayBasement';
  const interactables = [];
  const colliders = [];
  const dynamics = [];

  const wallTex = createPlasterWallTexture('#4a453d');
  const concreteTex = createConcreteTexture();

  // ---------- hallway ----------
  const hallway = new THREE.Group();
  hallway.position.set(0, 0, HALL_LEN / 2);
  group.add(hallway);

  const hallFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W, HALL_LEN),
    new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95 })
  );
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.receiveShadow = true;
  hallway.add(hallFloor);

  const hallWallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const hallCeil = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W, HALL_LEN),
    new THREE.MeshStandardMaterial({ color: 0x161310 })
  );
  hallCeil.rotation.x = Math.PI / 2;
  hallCeil.position.y = HALL_H;
  hallway.add(hallCeil);

  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALL_LEN, HALL_H), hallWallMat);
    wall.position.set((HALL_W / 2) * side, HALL_H / 2, 0);
    wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    hallway.add(wall);
    colliders.push({
      minX: side > 0 ? HALL_W / 2 - 0.1 : -HALL_W / 2 - 0.1,
      maxX: side > 0 ? HALL_W / 2 + 0.1 : -HALL_W / 2 + 0.1,
      minZ: 0, maxZ: HALL_LEN
    });
  });

  // The hallway previously had only this one dim point light and no
  // ambient fill at all -- noticeably darker than every other room.
  // Brightened, and given a matching ambient light like the bedroom/lab/
  // study all already have.
  const hallAmbient = new THREE.AmbientLight(0x3a3f4c, 0.5);
  hallway.add(hallAmbient);

  const hallLight = new THREE.PointLight(0x8896b8, 1.3, 8, 1.6);
  hallLight.position.set(0, HALL_H - 0.3, HALL_LEN / 2 - 1);
  hallway.add(hallLight);

  const hallLight2 = new THREE.PointLight(0x9aa4c2, 1.1, 6, 1.6);
  hallLight2.position.set(0, HALL_H - 0.4, 1.4);
  hallway.add(hallLight2);

  // No staircase here: the hallway and lab are both at y=0 (see the note
  // on `lab.position` below for why), so there is no elevation change
  // left for stairs to actually bridge. Physical stair geometry sitting
  // on an otherwise flat floor only produced clipping artefacts with no
  // gameplay purpose -- removed rather than dressed up further. If a real
  // elevation change comes later (alongside stairs-climbing/ground-
  // following logic on the player controller), a staircase belongs here.

  // ---------- basement lab ----------
  const lab = new THREE.Group();
  // Kept level with the hallway (y=0), not sunk below it: the player
  // controller has a fixed eye height with no stairs-climbing/ground-
  // following logic yet, so a lower basement floor here previously left
  // the camera floating 1.5m above it looking down at everything from a
  // broken vantage point. The decorative staircase mesh still visually
  // implies "downstairs"; only the actual floor height was the problem.
  lab.position.set(0, 0, LAB_Z);
  group.add(lab);

  const labFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(LAB_W, LAB_D),
    new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 1 })
  );
  labFloor.rotation.x = -Math.PI / 2;
  lab.add(labFloor);

  const labCeil = labFloor.clone();
  labCeil.rotation.x = Math.PI / 2;
  labCeil.position.y = LAB_H;
  labCeil.material = new THREE.MeshStandardMaterial({ color: 0x121110 });
  lab.add(labCeil);

  const labWallMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 1 });
  function labWall(w, x, z, ry) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, LAB_H), labWallMat);
    wall.position.set(x, LAB_H / 2, z);
    wall.rotation.y = ry;
    lab.add(wall);
    return wall;
  }
  labWall(LAB_W, 0, -LAB_D / 2, 0);
  labWall(LAB_D, -LAB_W / 2, 0, Math.PI / 2);
  labWall(LAB_D, LAB_W / 2, 0, -Math.PI / 2);
  const backWall = labWall(LAB_W, 0, LAB_D / 2, Math.PI);

  colliders.push(
    { minX: -LAB_W / 2 - 0.1, maxX: -LAB_W / 2 + 0.15, minZ: LAB_Z - LAB_D / 2, maxZ: LAB_Z + LAB_D / 2 },
    { minX: LAB_W / 2 - 0.15, maxX: LAB_W / 2 + 0.1, minZ: LAB_Z - LAB_D / 2, maxZ: LAB_Z + LAB_D / 2 },
    { minX: -LAB_W / 2, maxX: LAB_W / 2, minZ: LAB_Z + LAB_D / 2 - 0.15, maxZ: LAB_Z + LAB_D / 2 + 0.1 }
  );

  // flickering fluorescent strip lights
  const fixturesGroup = new THREE.Group();
  lab.add(fixturesGroup);
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, emissive: 0x9fc0ff, emissiveIntensity: 1.6 });
  const fluorescents = [];
  for (let i = -1; i <= 1; i++) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.1), tubeMat);
    tube.position.set(i * 2.4, LAB_H - 0.05, -1);
    fixturesGroup.add(tube);
    const tubeLight = new THREE.PointLight(0xaec4ff, 2.2, 9, 1.5);
    tubeLight.position.copy(tube.position);
    tubeLight.position.y -= 0.3;
    fixturesGroup.add(tubeLight);
    fluorescents.push(tubeLight);
  }

  const labAmbient = new THREE.AmbientLight(0x3d4658, 0.65);
  lab.add(labAmbient);

  // exposed pipes along the back wall
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a5f5a, metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, LAB_W - 1, 10), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 2.2 - i * 0.25, LAB_Z + LAB_D / 2 - 0.2);
    lab.add(pipe);
  }

  // generators / fuse box against the side wall
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x33362f, roughness: 0.7, metalness: 0.3 });
  const generator = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.7), boxMat);
  generator.position.set(-LAB_W / 2 + 0.7, 0.6, LAB_Z - 1.5);
  lab.add(generator);
  colliders.push({
    minX: generator.position.x - 0.55, maxX: generator.position.x + 0.55,
    minZ: generator.position.z - 0.4, maxZ: generator.position.z + 0.4
  });

  const fuseBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.6 })
  );
  fuseBox.position.set(-LAB_W / 2 + 0.12, 1.4, LAB_Z);
  fuseBox.userData.interact = {
    label: 'Examine fuse box',
    onInteract: () => showCaption('SUBJECT UNSTABLE. CONTAINMENT REQUIRED. The fuse box is dead -- no power to the cameras.')
  };
  interactables.push(fuseBox);
  lab.add(fuseBox);

  // storage shelves
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.8, metalness: 0.4 });
  for (let s = 0; s < 2; s++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.5), shelfMat);
    shelf.position.set(LAB_W / 2 - 0.9, 1.1, LAB_Z - 2 + s * 2.4);
    lab.add(shelf);
    colliders.push({
      minX: shelf.position.x - 0.8, maxX: shelf.position.x + 0.8,
      minZ: shelf.position.z - 0.25, maxZ: shelf.position.z + 0.25
    });
  }

  // retro computer desk with the CCTV monitor (custom shader material)
  const desk = new THREE.Group();
  desk.position.set(1.6, 0, LAB_Z + LAB_D / 2 - 1.4);
  lab.add(desk);

  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), frameWoodMat());
  deskTop.position.y = 0.75;
  desk.add(deskTop);
  const deskLeg = (x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), frameWoodMat());
    leg.position.set(x, 0.375, 0);
    desk.add(leg);
  };
  deskLeg(-0.55);
  deskLeg(0.55);

  const monitorBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.42, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xcbc4ac, roughness: 0.6 })
  );
  monitorBody.position.set(0, 1.0, -0.05);
  desk.add(monitorBody);

  const screenMaterial = createStaticScreenMaterial({ noiseStrength: 1.0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), screenMaterial);
  screen.position.set(0, 1.0, 0.17);
  desk.add(screen);
  dynamics.push({ update: (dt, elapsed) => { screenMaterial.uniforms.uTime.value = elapsed; } });

  const screenGlow = new THREE.PointLight(0x8fd0ff, 0.5, 1.5, 2);
  screenGlow.position.set(0, 1.0, 0.3);
  desk.add(screenGlow);

  monitorBody.userData.interact = {
    label: 'View camera feeds',
    onInteract: () => showCaption('Five cameras. All static. No power.')
  };
  interactables.push(monitorBody);

  const noteTex = createStickyNoteTexture("Restore power and pray it doesn't hear you.");
  const sticky = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: noteTex }));
  sticky.position.set(-0.35, 1.05, 0.02);
  sticky.rotation.y = 0.3;
  sticky.userData.interact = {
    label: 'Read sticky note',
    onInteract: () => showCaption("Restore power and pray it doesn't hear you.")
  };
  interactables.push(sticky);
  desk.add(sticky);

  colliders.push({
    minX: desk.position.x - 0.65, maxX: desk.position.x + 0.65,
    minZ: desk.position.z - 0.35, maxZ: desk.position.z + 0.35
  });

  // locked metal door at the far end of the lab
  const metalDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x3a3d3f, metalness: 0.7, roughness: 0.4 })
  );
  metalDoor.position.set(0, 1.05, LAB_Z - LAB_D / 2 + 0.05);
  metalDoor.userData.interact = {
    label: 'Locked. Restore power first.',
    onInteract: () => showCaption('Heavy bolts. Locked tight until the power comes back on.')
  };
  interactables.push(metalDoor);
  lab.add(metalDoor);

  // broken restraints / chair dressing near the middle of the lab
  const restraint = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.02, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x6b6b6b, metalness: 0.7, roughness: 0.5 })
  );
  restraint.position.set(-0.5, 0.9, LAB_Z);
  restraint.rotation.x = Math.PI / 2.3;
  lab.add(restraint);

  function frameWoodMat() {
    return new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.85 });
  }

  return {
    group,
    interactables,
    colliders,
    spawn: [0, 0.4],
    // camera's local forward is -Z by default; the hallway/lab extend in
    // +Z from the spawn point, so it has to be turned 180 degrees to
    // actually face into the level rather than out through the void.
    spawnYaw: Math.PI,
    refs: { fluorescents, hallLight, screenMaterial },
    update(dt) {
      const elapsed = (this._t = (this._t ?? 0) + dt);
      dynamics.forEach((d) => d.update(dt, elapsed));
      fluorescents.forEach((l) => {
        const dip = Math.random() < 0.05 ? 0.3 : 1;
        l.intensity = (1.9 + Math.random() * 0.5) * dip;
      });
    }
  };
}
