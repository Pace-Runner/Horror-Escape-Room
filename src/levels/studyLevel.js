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
import { gameState } from '../core/GameState.js';

/**
 * The combination on lock 2. Written on the note in the desk drawer, so it is
 * discoverable in the room rather than guessable -- and it is the date on the
 * polaroid from Level 1, which is the first thing tying the two rooms together.
 */
const FRONT_DOOR_CODE = '0687';

/** Lock ids, in the order they are mounted up the door. */
const LOCK_IDS = ['deadbolt', 'combination', 'containment'];

const ROOM_W = 7.5;
const ROOM_D = 6.5;
const ROOM_H = 3.0;

/**
 * Level 3: the study, the biggest room in the house, ending in the front door.
 *
 * THE THREE LOCKS, which used to be caption-only stubs that checked nothing and
 * set nothing. They are now a real sequence, and the order is the storyline's:
 * two can be opened by an ordinary search of the room, and the third cannot be
 * opened at all until the player has worn the visor -- "before they open the 3rd
 * lock, they have to wear the visor".
 *
 *   1. DEADBOLT     - keyed. The key is in the desk drawer.
 *   2. COMBINATION  - four digits, written on the note beside the key.
 *   3. CONTAINMENT  - has no keyway a broken eye can resolve. This is the one
 *                     that forces the visor on, and therefore the one that
 *                     forces the player to look at the room properly.
 *
 * Lock state lives in GameState rather than in this closure, because it crosses
 * a level boundary: the ending needs to know how the door came open, and
 * resetState() already clears it on a restart so there is nothing to remember.
 *
 * Hierarchy note: the three locks are children of the front-door GROUP, not of
 * the frame, since each is mounted to the slab and has to travel with it when
 * the door swings.
 */
export function createStudyLevel({
  showCaption = () => {},
  onExit = () => {},
  onExaminePinpad = () => {},
  onReadNote = () => {},
  /** Fired with the lock id each time one opens, and again when all three are. */
  onLockOpened = () => {},
  onAllLocksOpen = () => {}
} = {}) {
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

  /**
   * THE FRONT WALL HAS A DOORWAY IN IT NOW.
   *
   * It used to be one unbroken plane with the door slab standing in front of
   * it like a prop leaning on a wall -- so the thing the entire game is about
   * reaching opened onto solid plaster, and there was nothing beyond z = 3.25
   * at all. Same two-jamb-and-lintel treatment as the basement doorway.
   */
  const DOOR_X = 2.5;
  const DOORWAY_W = 1.15;
  const DOORWAY_H = 2.15;
  const frontZ = ROOM_D / 2;
  {
    const leftW = (DOOR_X - DOORWAY_W / 2) - (-ROOM_W / 2);
    const rightW = (ROOM_W / 2) - (DOOR_X + DOORWAY_W / 2);
    const leftX = -ROOM_W / 2 + leftW / 2;
    const rightX = ROOM_W / 2 - rightW / 2;
    for (const [w, x] of [[leftW, leftX], [rightW, rightX]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM_H), wallMat);
      m.position.set(x, ROOM_H / 2, frontZ);
      m.rotation.y = Math.PI;
      group.add(m);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: frontZ - 0.15, maxZ: frontZ + 0.1 });
    }
    const lintel = new THREE.Mesh(
      new THREE.PlaneGeometry(DOORWAY_W, ROOM_H - DOORWAY_H), wallMat
    );
    lintel.position.set(DOOR_X, DOORWAY_H + (ROOM_H - DOORWAY_H) / 2, frontZ);
    lintel.rotation.y = Math.PI;
    group.add(lintel);
  }

  colliders.push(
    { minX: -ROOM_W / 2 - 0.1, maxX: -ROOM_W / 2 + 0.15, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: ROOM_W / 2 - 0.15, maxX: ROOM_W / 2 + 0.1, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: -ROOM_D / 2 - 0.1, maxZ: -ROOM_D / 2 + 0.15 }
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

  /**
   * Level 3's own puzzle state. What crosses levels lives in GameState (the
   * open locks); what is only true inside this room lives here.
   */
  const puzzle = {
    drawerOpen: false,
    hasDoorKey: false,
    noteRead: false
  };

  /**
   * The desk drawer, which actually opens. A handle glued to a solid box is
   * the sort of thing that reads fine in a screenshot and badly the moment a
   * player pulls on it -- and this drawer holds the key to the first lock, so
   * it has to be a drawer.
   */
  const drawer = new THREE.Group();
  drawer.position.set(desk.position.x + 0.5, 0.5, desk.position.z + 0.36);
  group.add(drawer);
  const drawerFront = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.03), woodMat);
  drawer.add(drawerFront);
  const drawerBoxMat = new THREE.MeshStandardMaterial({ color: 0x241a11, roughness: 0.95 });
  // Sides and floor, so an open drawer is a container rather than a facade.
  const drawerFloor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), drawerBoxMat);
  drawerFloor.position.set(0, -0.09, -0.26);
  drawer.add(drawerFloor);
  for (const sx of [-0.25, 0.25]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.5), drawerBoxMat);
    side.position.set(sx, 0, -0.26);
    drawer.add(side);
  }

  const deskHandle = makeHandle({ length: 0.12 });
  deskHandle.position.set(0, 0, 0.03);
  drawer.add(deskHandle);

  /** What is in it. Hidden until it is open, so nothing floats in a shut drawer. */
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xb9a55e, metalness: 0.85, roughness: 0.35 });
  const doorKey = new THREE.Group();
  doorKey.position.set(-0.12, -0.06, -0.2);
  doorKey.visible = false;
  drawer.add(doorKey);
  const keyShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8), keyMat);
  keyShaft.rotation.z = Math.PI / 2;
  doorKey.add(keyShaft);
  const keyBow = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 14), keyMat);
  keyBow.position.x = -0.07;
  keyBow.rotation.y = Math.PI / 2;
  doorKey.add(keyBow);
  const keyBit = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.005), keyMat);
  keyBit.position.set(0.045, -0.011, 0);
  doorKey.add(keyBit);

  const drawerNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xcfc5aa, roughness: 1 })
  );
  drawerNote.rotation.x = -Math.PI / 2;
  drawerNote.rotation.z = 0.2;
  drawerNote.position.set(0.11, -0.07, -0.24);
  drawerNote.visible = false;
  drawer.add(drawerNote);

  const drawerHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.24, 0.12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  drawerHitbox.position.set(desk.position.x + 0.5, 0.5, desk.position.z + 0.4);
  drawerHitbox.userData.interact = {
    label: 'Open the desk drawer',
    onInteract: () => {
      if (puzzle.drawerOpen) {
        showCaption('Empty now, apart from paperclips and a dried-out pen.');
        return;
      }
      puzzle.drawerOpen = true;
      puzzle.hasDoorKey = true;
      doorKey.visible = true;
      drawerNote.visible = true;
      drawerHitbox.userData.interact.label = 'Search the drawer';
      interactables.push(drawerNoteHitbox);
      showCaption('The drawer sticks, then gives. A door key, and a note folded in half.');
    }
  };
  interactables.push(drawerHitbox);
  group.add(drawerHitbox);

  const drawerNoteHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.1, 0.16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  drawerNoteHitbox.position.set(desk.position.x + 0.61, 0.44, desk.position.z + 0.16);
  drawerNoteHitbox.userData.interact = {
    label: 'Read the note',
    onInteract: () => {
      puzzle.noteRead = true;
      onReadNote();
    }
  };

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
  const openLockMat = new THREE.MeshStandardMaterial({ color: 0x4f6b4a, metalness: 0.7, roughness: 0.45 });
  const lockMeshes = {};

  function openLock(id) {
    if (gameState.locksOpen.has(id)) return;
    gameState.locksOpen.add(id);
    const mesh = lockMeshes[id];
    if (mesh) {
      mesh.material = openLockMat;
      // Thrown back: the bolt visibly moves, so progress is legible from across
      // the room rather than only in a caption the player may have missed.
      mesh.position.x = 0.24;
    }
    onLockOpened(id);
    if (gameState.locksOpen.size === LOCK_IDS.length) {
      frontDoorSlabHit.userData.interact.label = 'Open the front door';
      onAllLocksOpen();
    }
  }

  /**
   * The three locks. Each one CHECKS something and SETS something -- they used
   * to do neither, printing "all three have to open before this door will" and
   * then never opening.
   */
  const LOCKS = [
    {
      id: 'deadbolt',
      y: 0.5,
      label: 'Deadbolt',
      try: () => {
        if (!puzzle.hasDoorKey) {
          showCaption('A keyed deadbolt. There is no key in it.');
          return false;
        }
        showCaption('The key turns. The deadbolt comes back with a clack.');
        return true;
      }
    },
    {
      id: 'combination',
      y: 1.0,
      label: 'Combination lock',
      try: () => {
        // Hands off to the same keypad the bedroom's drawer uses. The UI does
        // not know the code; see core/PinPadUI.js.
        onExaminePinpad({
          length: FRONT_DOOR_CODE.length,
          code: FRONT_DOOR_CODE,
          onSolved: () => {
            showCaption('Four digits, and the shackle springs.');
            openLock('combination');
          }
        });
        return false;   // opened asynchronously, by the keypad
      }
    },
    {
      id: 'containment',
      y: 1.5,
      label: 'The third lock',
      try: () => {
        /**
         * THE LOCK THAT FORCES THE VISOR ON.
         *
         * There is nothing wrong with this lock. There is something wrong with
         * the player's eyes, and this is the first time the game makes that
         * cost them something -- the storyline is explicit that the third lock
         * cannot be opened until the visor is worn.
         */
        if (!gameState.visorWorn) {
          showCaption(
            gameState.hasVisor
              ? 'You cannot find the keyway. You know it is there. Put the visor on.'
              : 'Your hand goes to the lock and finds nothing to put it in. There is no keyhole on this one.'
          );
          return false;
        }
        showCaption('Through the lenses there is a keyway, exactly where your hand kept going. It turns.');
        return true;
      }
    }
  ];

  LOCKS.forEach(({ id, y, label, try: attempt }) => {
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), lockMat);
    lock.position.set(0.35, y, 0.05);
    lock.userData.interact = {
      get label() {
        return gameState.locksOpen.has(id) ? `${label} (open)` : label;
      },
      onInteract: () => {
        if (gameState.locksOpen.has(id)) {
          showCaption('Already open.');
          return;
        }
        if (attempt()) openLock(id);
      }
    };
    interactables.push(lock);
    frontDoor.add(lock);
    lockMeshes[id] = lock;
  });

  /**
   * The door itself. Separate from the locks, because "the locks are off" and
   * "you have walked through it" are different moments and the second is the
   * one the whole game has been about.
   */
  const frontDoorSlabHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 2.1, 0.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  frontDoorSlabHit.position.set(-0.1, 1.05, 0.05);
  frontDoorSlabHit.userData.interact = {
    label: 'The front door',
    onInteract: () => {
      const left = LOCK_IDS.filter((k) => !gameState.locksOpen.has(k)).length;
      if (left > 0) {
        showCaption(left === 1
          ? 'One lock still holds it.'
          : `${left} of the three locks still hold it.`);
        return;
      }
      if (!doorState.open) {
        doorState.open = true;
        // The doorway becomes walkable at the same moment it becomes open.
        setDoorSolid(false);
        showCaption('Every bolt is back. The door comes off its frame and swings in.');
        return;
      }
      onExit();
    }
  };
  interactables.push(frontDoorSlabHit);
  frontDoor.add(frontDoorSlabHit);

  /** Eased open by update(), the same treatment the bedroom door gets. */
  const doorState = { open: false };
  const DOOR_OPEN_SWING = -Math.PI / 2.1;
  const doorHinge = new THREE.Object3D();
  doorHinge.position.set(-0.525, 0, 0);
  frontDoor.add(doorHinge);
  doorHinge.add(doorSlab);
  doorSlab.position.set(0.525, 1.05, 0);

  /**
   * The shut door's collider, held so it can be TAKEN AWAY again.
   *
   * Pushing it and forgetting about it meant the door could swing wide open and
   * the player would still walk into an invisible slab in the doorway -- the
   * exit the whole game is about was unwalkable even once every lock was off.
   * Spliced in and out of the same array the player already holds a reference
   * to, so the change lands on the next frame with nothing to re-register.
   */
  const doorCollider = {
    minX: frontDoor.position.x - 0.6, maxX: frontDoor.position.x + 0.6,
    minZ: frontDoor.position.z - 0.1, maxZ: frontDoor.position.z + 0.15
  };
  colliders.push(doorCollider);

  function setDoorSolid(solid) {
    const i = colliders.indexOf(doorCollider);
    if (solid && i < 0) colliders.push(doorCollider);
    if (!solid && i >= 0) colliders.splice(i, 1);
  }

  /**
   * THE PORCH. Nothing existed past z = 3.25 at all, so the front door -- the
   * object the entire game is spent trying to reach -- opened onto the void.
   *
   * Beyond it: boards, a rail, and the fence gate the storyline puts across it
   * ("a fence door sealing the porch off"). The gate is the last obstacle and
   * it is deliberately NOT openable yet: its key is hidden where only the visor
   * can find it, which is Unit 15.
   */
  const PORCH_D = 2.6;
  const porch = new THREE.Group();
  porch.position.set(DOOR_X, 0, ROOM_D / 2 + PORCH_D / 2);
  group.add(porch);

  const porchBoardMat = new THREE.MeshStandardMaterial({
    map: floorTex, bumpMap: floorBump, bumpScale: 0.5, roughness: 0.95, color: 0x6a6156
  });
  const porchFloor = new THREE.Mesh(new THREE.PlaneGeometry(3.0, PORCH_D), porchBoardMat);
  porchFloor.rotation.x = -Math.PI / 2;
  porchFloor.position.y = 0.002;
  porchFloor.receiveShadow = true;
  porch.add(porchFloor);

  const porchRoof = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, PORCH_D),
    new THREE.MeshStandardMaterial({ color: 0x14110d, side: THREE.DoubleSide })
  );
  porchRoof.rotation.x = Math.PI / 2;
  porchRoof.position.y = 2.6;
  porch.add(porchRoof);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  for (const px of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), postMat);
    post.position.set(px, 1.3, PORCH_D / 2 - 0.1);
    post.castShadow = true;
    porch.add(post);
    // Side rails, so the porch is enclosed rather than a floating deck.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, PORCH_D - 0.2), postMat);
    rail.position.set(px, 0.55, 0);
    porch.add(rail);
    colliders.push({
      minX: DOOR_X + px - 0.1, maxX: DOOR_X + px + 0.1,
      minZ: ROOM_D / 2 + 0.05, maxZ: ROOM_D / 2 + PORCH_D - 0.05
    });
  }

  // The fence gate across the far end.
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x3f4144, metalness: 0.75, roughness: 0.5 });
  const gate = new THREE.Group();
  gate.position.set(0, 0, PORCH_D / 2 - 0.04);
  porch.add(gate);
  for (let i = 0; i < 9; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.9, 6), gateMat);
    bar.position.set(-1.2 + i * 0.3, 0.95, 0);
    bar.castShadow = true;
    gate.add(bar);
  }
  for (const by of [0.15, 1.85]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 0.04), gateMat);
    rail.position.set(0, by, 0);
    gate.add(rail);
  }
  const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.04), gateMat);
  padlock.position.set(0.16, 1.0, 0.03);
  gate.add(padlock);

  const gateHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 1.9, 0.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  gateHit.position.set(0, 0.95, 0);
  gateHit.userData.interact = {
    label: 'The fence gate',
    onInteract: () => showCaption(
      gameState.visorWorn
        ? 'Padlocked. The key is not on this side of it.'
        : 'A padlocked gate across the porch. The key is not in it, and not on the ground.'
    )
  };
  interactables.push(gateHit);
  gate.add(gateHit);

  colliders.push({
    minX: DOOR_X - 1.4, maxX: DOOR_X + 1.4,
    minZ: ROOM_D / 2 + PORCH_D - 0.12, maxZ: ROOM_D / 2 + PORCH_D + 0.05
  });

  /**
   * Porch lighting, and it has to be brighter than instinct says.
   *
   * At 0.34 the whole porch rendered as a black void with a few faint vertical
   * lines in it -- and those lines are the gate, which is the thing stopping
   * the player leaving. An obstacle the player cannot see is not an obstacle,
   * it is a wall they walk into.
   *
   * Two sources, because one warm bulb makes the porch read as another room.
   * The lamp over the door is the house; the cold fill from beyond the gate is
   * the night, and having them disagree in colour is what says "outside".
   */
  const porchLight = new THREE.PointLight(0xffd8a0, 1.15, 7, 2);
  porchLight.position.set(0, 2.35, -0.5);
  porchLight.castShadow = true;
  porchLight.shadow.mapSize.set(512, 512);
  porch.add(porchLight);

  const nightFill = new THREE.PointLight(0x8fa6c8, 0.55, 9, 1.6);
  nightFill.position.set(0, 2.0, PORCH_D / 2 + 1.6);
  porch.add(nightFill);

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
      },
      puzzle,
      lockMeshes,
      doorState,
      frontDoorSlabHit,
      drawer,
      drawerHitbox,
      gateHit,
      /** The four digits on lock 2, so a test never has to hardcode them. */
      code: FRONT_DOOR_CODE
    },
    /**
     * Absent until now, which is why a restart left this level with its locks
     * thrown, its drawer open and its front door standing wide.
     */
    reset() {
      // gameState.locksOpen is cleared centrally by resetState(); this puts the
      // level's own view of that back in step.
      puzzle.drawerOpen = false;
      puzzle.hasDoorKey = false;
      puzzle.noteRead = false;
      doorKey.visible = false;
      drawerNote.visible = false;
      drawer.position.z = desk.position.z + 0.36;
      drawerHitbox.userData.interact.label = 'Open the desk drawer';
      const ni = interactables.indexOf(drawerNoteHitbox);
      if (ni >= 0) interactables.splice(ni, 1);

      for (const id of LOCK_IDS) {
        const mesh = lockMeshes[id];
        if (!mesh) continue;
        mesh.material = lockMat;
        mesh.position.x = 0.35;
      }
      frontDoorSlabHit.userData.interact.label = 'The front door';
      doorState.open = false;
      doorHinge.rotation.y = 0;
      setDoorSolid(true);
      portraitMat.map = portraitTexPlain;
      portraitMat.needsUpdate = true;
    },

    update(dt) {
      // The drawer slides, and the door swings. Eased rather than snapped, the
      // same treatment the bedroom's door and corkboard get.
      const drawerTargetZ = desk.position.z + 0.36 + (puzzle.drawerOpen ? 0.34 : 0);
      drawer.position.z += (drawerTargetZ - drawer.position.z) * Math.min(1, dt * 6);
      const doorTarget = doorState.open ? DOOR_OPEN_SWING : 0;
      doorHinge.rotation.y += (doorTarget - doorHinge.rotation.y) * Math.min(1, dt * 2.6);
    }
  };
}
