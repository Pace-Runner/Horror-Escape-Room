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
import { createHiddenWritingTexture, createFootmarkTexture } from '../world/textures.js';

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
  onTakeVisor = () => {},
  onTakeGateKey = () => {},
  onLookInMirror = () => {},
  onReadLetter = () => {},
  /** 'released' | 'contained'. The last decision in the game. */
  onChooseEnding = () => {},
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
    noteRead: false,
    hasGateKey: false,
    gateOpen: false
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

  /**
   * THE VISOR, lying face down on the floor where it was dropped.
   *
   * Deliberately not hidden behind a puzzle. Finding it is not the challenge --
   * putting it on and believing what it shows you is. It is placed in the open,
   * across the room from the door, so a player who is only looking for a way
   * out can walk past it several times before the third lock forces them back.
   */
  const visorGroup = new THREE.Group();
  visorGroup.position.set(-2.4, 0.02, 1.6);
  visorGroup.rotation.set(-Math.PI / 2, 0, 0.6);
  group.add(visorGroup);

  const visorBandMat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.55, metalness: 0.25 });
  const visorLensMat = new THREE.MeshStandardMaterial({
    color: 0x2f6fae,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
    // It is the only blue thing in the house, and it has to be findable in a
    // room lit at 8/255. A little emission keeps an edge alive on the glass.
    emissive: 0x123a5e,
    emissiveIntensity: 0.5
  });
  const visorBand = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.055), visorBandMat);
  visorBand.castShadow = true;
  visorGroup.add(visorBand);
  for (const lx of [-0.045, 0.045]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.016, 16), visorLensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(lx, -0.004, 0.03);
    visorGroup.add(lens);
  }
  for (const ax of [-0.095, 0.095]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.12), visorBandMat);
    arm.position.set(ax, 0, -0.08);
    visorGroup.add(arm);
  }

  const visorHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  visorHitbox.position.copy(visorGroup.position);
  visorHitbox.userData.interact = {
    label: 'Pick up the visor',
    onInteract: () => {
      visorGroup.visible = false;
      visorHitbox.visible = false;
      const i = interactables.indexOf(visorHitbox);
      if (i >= 0) interactables.splice(i, 1);
      onTakeVisor();
    }
  };
  interactables.push(visorHitbox);
  group.add(visorHitbox);

  /**
   * EVERYTHING A BROKEN EYE CANNOT RESOLVE.
   *
   * One group, hidden by default, shown by setCorrectedSight(). Keeping it as a
   * single group rather than a list of individually-toggled props is what makes
   * "the room corrects" a single operation that cannot get half-done -- and it
   * means adding another reveal later is one more child, not another line in a
   * toggle function somebody will forget to update.
   */
  const visorOnly = new THREE.Group();
  visorOnly.visible = false;
  group.add(visorOnly);

  // Writing on the walls, in the same hand as everything else Mark wrote.
  const wallInkMat = new THREE.MeshBasicMaterial({
    map: createHiddenWritingTexture(["DON'T LET IT OUT"]),
    transparent: true,
    depthWrite: false
  });
  const wallInk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), wallInkMat);
  wallInk.position.set(-1.0, 1.85, -ROOM_D / 2 + 0.06);
  visorOnly.add(wallInk);

  const wallInk2 = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.42),
    new THREE.MeshBasicMaterial({
      map: createHiddenWritingTexture(['SHE STAYED']),
      transparent: true,
      depthWrite: false
    })
  );
  wallInk2.position.set(ROOM_W / 2 - 0.06, 1.6, 0.4);
  wallInk2.rotation.y = -Math.PI / 2;
  visorOnly.add(wallInk2);

  /**
   * Footmarks. They run from the door to the corner and back, over and over --
   * somebody has been pacing this room for a long time. They are hers, and on a
   * second playthrough they are the clearest evidence in the game that she never
   * left.
   */
  const footMat = new THREE.MeshBasicMaterial({
    map: createFootmarkTexture(),
    transparent: true,
    depthWrite: false
  });
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.3), footMat);
    mark.rotation.x = -Math.PI / 2;
    // A wandering line from the front door across to the far corner.
    mark.position.set(
      2.2 - t * 4.6 + Math.sin(i * 1.7) * 0.12,
      0.006,
      2.7 - t * 5.0 + Math.cos(i * 2.1) * 0.1
    );
    mark.rotation.z = Math.atan2(-4.6, -5.0) + (i % 2 ? 0.18 : -0.18);
    visorOnly.add(mark);
  }

  /**
   * The letter, face up on the floor, and BLANK.
   *
   * The storyline is precise about this: "you see a piece of paper on the
   * floor, once blank, but with the visor on, writing becomes visible." So the
   * paper is always there and always pickupable -- the player can find it early,
   * read nothing, and put it down again. That is much crueller than hiding it,
   * because on a second playthrough they will remember doing exactly that.
   */
  const letterPaper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xbdb49c, roughness: 1 })
  );
  letterPaper.rotation.x = -Math.PI / 2;
  letterPaper.rotation.z = 0.24;
  letterPaper.position.set(0.9, 0.007, -1.5);
  group.add(letterPaper);

  const letterHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  letterHit.position.set(0.9, 0.06, -1.5);
  letterHit.userData.interact = {
    label: 'A sheet of paper',
    onInteract: () => onReadLetter()
  };
  interactables.push(letterHit);
  group.add(letterHit);

  // Ink for it, in the same hidden-writing treatment as the walls, so a player
  // holding it with the visor on can see there IS writing before they read it.
  const letterInk = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.3),
    new THREE.MeshBasicMaterial({
      map: createHiddenWritingTexture(['To Annabelle']),
      transparent: true,
      depthWrite: false
    })
  );
  letterInk.rotation.copy(letterPaper.rotation);
  letterInk.position.set(0.9, 0.009, -1.5);
  visorOnly.add(letterInk);

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
    onInteract: () => onLookInMirror()
  };
  interactables.push(mirrorGlass);
  group.add(mirrorGlass);

  /**
   * The gate key, hanging on the side of the mirror frame.
   *
   * The storyline puts it here exactly: "you find the key hidden on the side of
   * a mirror". It is in plain sight and has been the whole time -- the player
   * simply could not see it, which is the same thing the room has been doing to
   * them since they walked in. Visible only while the visor is on; taken, it
   * stays taken.
   */
  const gateKeyMat = new THREE.MeshStandardMaterial({
    color: 0xb9a55e, metalness: 0.85, roughness: 0.35,
    emissive: 0x2a2410, emissiveIntensity: 0.4
  });
  const gateKey = new THREE.Group();
  gateKey.position.set(0.5 + 0.37, 1.34, -ROOM_D / 2 + 0.07);
  gateKey.visible = false;
  group.add(gateKey);
  const gkShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 8), gateKeyMat);
  gateKey.add(gkShaft);
  const gkBow = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 12), gateKeyMat);
  gkBow.position.y = 0.055;
  gkBow.rotation.x = Math.PI / 2;
  gateKey.add(gkBow);
  const gkBit = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.005, 0.018), gateKeyMat);
  gkBit.position.set(0.009, -0.038, 0);
  gateKey.add(gkBit);

  const gateKeyHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  gateKeyHit.position.copy(gateKey.position);
  gateKeyHit.userData.interact = {
    label: 'Take the key',
    onInteract: () => {
      puzzle.hasGateKey = true;
      gateKey.visible = false;
      const i = interactables.indexOf(gateKeyHit);
      if (i >= 0) interactables.splice(i, 1);
      onTakeGateKey();
    }
  };
  group.add(gateKeyHit);

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
    onInteract: () => {
      if (puzzle.gateOpen) { onExit(); return; }
      if (!puzzle.hasGateKey) {
        showCaption(gameState.visorWorn
          ? 'Padlocked. The key is not on this side of it.'
          : 'A padlocked gate across the porch. The key is not in it, and not on the ground.');
        return;
      }
      puzzle.gateOpen = true;
      setGateSolid(false);
      showCaption('The padlock opens. The gate swings out into the rain.');
      offerTheChoice();
    }
  };
  interactables.push(gateHit);
  gate.add(gateHit);

  // Held so it can come out when the gate opens -- the same mistake the front
  // door's collider made, which left an unwalkable slab in an open doorway.
  const gateCollider = {
    minX: DOOR_X - 1.4, maxX: DOOR_X + 1.4,
    minZ: ROOM_D / 2 + PORCH_D - 0.12, maxZ: ROOM_D / 2 + PORCH_D + 0.05
  };
  colliders.push(gateCollider);
  function setGateSolid(solid) {
    const i = colliders.indexOf(gateCollider);
    if (solid && i < 0) colliders.push(gateCollider);
    if (!solid && i >= 0) colliders.splice(i, 1);
  }

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
  /**
   * THE CHOICE, and it is deliberately made of two things you can walk up to
   * rather than a menu.
   *
   * The storyline gives two endings: walk out, which saves Annabelle and puts
   * the Hollow into the world; or shut the door, which contains the Hollow and
   * leaves her to bleed. Both are on the porch, facing opposite ways -- forward
   * through the gate, or turn around and close what you just opened. Nothing
   * labels either of them as the good one, because neither is.
   *
   * They only appear once the gate is open, so the player cannot stumble into
   * the end of the game before they have been told what they are.
   */
  const leaveHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.0, 0.5),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  leaveHit.position.set(DOOR_X, 1.0, ROOM_D / 2 + PORCH_D + 0.35);
  leaveHit.userData.interact = {
    label: 'Walk out',
    onInteract: () => onChooseEnding('released')
  };
  group.add(leaveHit);

  const shutHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 2.1, 0.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  shutHit.position.set(DOOR_X, 1.05, ROOM_D / 2 + 0.42);
  shutHit.userData.interact = {
    label: 'Close the door behind you',
    onInteract: () => onChooseEnding('contained')
  };
  group.add(shutHit);

  function offerTheChoice() {
    for (const h of [leaveHit, shutHit]) {
      if (!interactables.includes(h)) interactables.push(h);
    }
  }
  function withdrawTheChoice() {
    for (const h of [leaveHit, shutHit]) {
      const i = interactables.indexOf(h);
      if (i >= 0) interactables.splice(i, 1);
    }
  }

  /**
   * THE OUTSIDE OF THE HOUSE.
   *
   * The closing shot flies the camera out over the treeline and looks back, and
   * until this there was nothing to look back AT: every wall in this level is a
   * single-sided plane facing inward, so from outside the study was an open
   * dollhouse with its furniture on display, floating in pure black. A camera
   * move is only as good as what it moves through.
   *
   * None of this is visible during play. The interior walls are opaque from the
   * inside, which is exactly what hides it -- so this costs the player nothing
   * and only exists for the twenty seconds at the end when it is the only thing
   * on screen.
   */
  const exterior = new THREE.Group();
  group.add(exterior);

  // Ground. Wet, dark, and big enough that the camera never reaches its edge.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.72, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  exterior.add(ground);

  // The shell: outward-facing walls just outside the interior ones, so the
  // house reads as a solid object from any angle the ending flies through.
  const sidingMat = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.95 });
  const OUT = 0.22;
  const SHELL_H = 3.4;
  const shellSpecs = [
    [ROOM_W + OUT * 2, 0, -ROOM_D / 2 - OUT, Math.PI],
    [ROOM_D + OUT * 2, -ROOM_W / 2 - OUT, 0, -Math.PI / 2],
    [ROOM_D + OUT * 2, ROOM_W / 2 + OUT, 0, Math.PI / 2]
  ];
  for (const [w, x, z, ry] of shellSpecs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, SHELL_H), sidingMat);
    m.position.set(x, SHELL_H / 2, z);
    m.rotation.y = ry;
    m.castShadow = true;
    exterior.add(m);
  }
  // The front, in two pieces so the porch opening stays open.
  for (const [w, x] of [
    [(DOOR_X - 1.55) - (-ROOM_W / 2 - OUT), (-ROOM_W / 2 - OUT + DOOR_X - 1.55) / 2],
    [(ROOM_W / 2 + OUT) - (DOOR_X + 1.55), (ROOM_W / 2 + OUT + DOOR_X + 1.55) / 2]
  ]) {
    if (w <= 0.01) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, SHELL_H), sidingMat);
    m.position.set(x, SHELL_H / 2, ROOM_D / 2 + OUT);
    m.castShadow = true;
    exterior.add(m);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_W + OUT * 3, 0.22, ROOM_D + OUT * 3),
    new THREE.MeshStandardMaterial({ color: 0x0f0d0b, roughness: 1 })
  );
  roof.position.set(0, SHELL_H + 0.11, 0);
  roof.castShadow = true;
  exterior.add(roof);

  /**
   * The treeline. Cones, because at the distance the ending views them from,
   * a pine is a triangle -- and forty triangles read as a forest where forty
   * modelled trees would read as forty models.
   */
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x0a0d0b, roughness: 1 });
  for (let i = 0; i < 44; i++) {
    // Deterministic placement: the same wood every time the game is played.
    const a = (i / 44) * Math.PI * 2 + Math.sin(i * 2.7) * 0.05;
    const r = 17 + ((Math.sin(i * 5.13) + 1) / 2) * 13;
    const h = 5.5 + ((Math.sin(i * 3.31) + 1) / 2) * 6.5;
    const tree = new THREE.Mesh(new THREE.ConeGeometry(1.15 + h * 0.055, h, 6), treeMat);
    tree.position.set(Math.cos(a) * r, h / 2 - 0.2, Math.sin(a) * r + 2.0);
    exterior.add(tree);
  }

  // A cold wash over the whole outside, so the house has a night to sit in
  // rather than a black void. Hemisphere rather than ambient: the ground reads
  // darker than the sky, which is most of what says "outdoors".
  const sky = new THREE.HemisphereLight(0x2a3550, 0x07090c, 0.55);
  exterior.add(sky);
  const moon = new THREE.DirectionalLight(0x93a8cc, 0.35);
  moon.position.set(-14, 20, -18);
  exterior.add(moon);

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
        // One group, one flag. Everything the broken eye cannot resolve is a
        // child of it, so the room cannot correct halfway.
        visorOnly.visible = on;
        gateKey.visible = on && !puzzle.hasGateKey;
        const ki = interactables.indexOf(gateKeyHit);
        if (on && !puzzle.hasGateKey && ki < 0) interactables.push(gateKeyHit);
        if (!on && ki >= 0) interactables.splice(ki, 1);
      },
      visorGroup,
      visorHitbox,
      visorOnly,
      gateKey,
      letterHit,
      exterior,
      leaveHit,
      shutHit,
      /** Where Annabelle stands once the letter has been read. */
      annabelleSpot: [-2.9, -2.4],
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

      withdrawTheChoice();
      puzzle.hasGateKey = false;
      puzzle.gateOpen = false;
      setGateSolid(true);
      gateKey.visible = false;
      const gi = interactables.indexOf(gateKeyHit);
      if (gi >= 0) interactables.splice(gi, 1);

      visorOnly.visible = false;
      visorGroup.visible = true;
      visorHitbox.visible = true;
      if (!interactables.includes(visorHitbox)) interactables.push(visorHitbox);
      gate.rotation.y = 0;
    },

    update(dt) {
      // The drawer slides, and the door swings. Eased rather than snapped, the
      // same treatment the bedroom's door and corkboard get.
      const drawerTargetZ = desk.position.z + 0.36 + (puzzle.drawerOpen ? 0.34 : 0);
      drawer.position.z += (drawerTargetZ - drawer.position.z) * Math.min(1, dt * 6);
      const doorTarget = doorState.open ? DOOR_OPEN_SWING : 0;
      doorHinge.rotation.y += (doorTarget - doorHinge.rotation.y) * Math.min(1, dt * 2.6);
      const gateTarget = puzzle.gateOpen ? -1.05 : 0;
      gate.rotation.y += (gateTarget - gate.rotation.y) * Math.min(1, dt * 2.2);
    }
  };
}
