import * as THREE from 'three';
import { loadModel } from '../world/modelLoader.js';
import annabelleChairUrl from '../assets/models/study/annabelle_wingback_chair.glb?url';
import {
  createWoodFloorTexture,
  createWoodFloorBumpTexture,
  createPlasterWallTexture,
  createPlasterBumpTexture,
  createFamilyPhotoTexture,
  createRugTexture
} from '../world/textures.js';
import { addBaseboard, makeHandle } from '../world/trim.js';
import { DOOR_PANEL_ROWS, getPanelSpans } from '../world/doorPanels.js';
import { gameState } from '../core/GameState.js';
import { createHiddenWritingTexture, createFootmarkTexture } from '../world/textures.js';
import { line } from '../dialogue/index.js';

const ROOM_W = 16;
const ROOM_D = 13;
const ROOM_H = 6.4;
const LOFT_Y = 3.1;
const LOFT_D = 5.8;

/** Level 3 study: the archive puzzles lead to the final front exit. */
export function createStudyLevel({
  showCaption = () => {},
  // The front door starting to swing, with its world position. Not the later
  // press that walks through it.
  onDoorOpening = () => {},
  onTakeVisor = () => {},
  onLookInMirror = () => {},
  onReadLetter = () => {},
  /** 'released' | 'contained'. The last decision in the game. */
  onChooseEnding = () => {},
  getPlayerPosition = () => null,
  /** A sound effect by name (AudioDirector's SFX); the level has no audio of its own. */
  onSfx = () => {}
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

  /**
   * THE FRONT WALL HAS A DOORWAY IN IT NOW.
   *
   * It used to be one unbroken plane with the door slab standing in front of
   * it like a prop leaning on a wall -- so the thing the entire game is about
   * reaching opened onto solid plaster, and there was nothing beyond z = 3.25
   * at all. Same two-jamb-and-lintel treatment as the basement doorway.
   */
  const DOOR_X = 0;
  const DOORWAY_W = 1.8;
  const DOORWAY_H = 3;
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
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: -ROOM_D / 2 - 0.1, maxZ: -ROOM_D / 2 + 0.15 }
  );

  // The right-hand doorway is the study entrance. The front doorway above is
  // intentionally left untouched: it remains the locked final-exit door.
  const ENTRY_DOOR_Z = 4.8;
  const ENTRY_DOOR_W = 1.5;
  const ENTRY_DOOR_H = 2.55;
  let entryDoor;
  {
    const rightX = ROOM_W / 2;
    const entryBackEnd = ENTRY_DOOR_Z - ENTRY_DOOR_W / 2;
    const entryFrontStart = ENTRY_DOOR_Z + ENTRY_DOOR_W / 2;
    const rightWallSections = [
      [entryBackEnd - (-ROOM_D / 2), (-ROOM_D / 2 + entryBackEnd) / 2],
      [ROOM_D / 2 - entryFrontStart, (entryFrontStart + ROOM_D / 2) / 2]
    ];
    for (const [length, z] of rightWallSections) {
      const section = new THREE.Mesh(new THREE.PlaneGeometry(length, ROOM_H), wallMat);
      section.position.set(rightX, ROOM_H / 2, z);
      section.rotation.y = -Math.PI / 2;
      group.add(section);
      colliders.push({ minX: rightX - 0.15, maxX: rightX + 0.1, minZ: z - length / 2, maxZ: z + length / 2 });
    }
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(ENTRY_DOOR_W, ROOM_H - ENTRY_DOOR_H), wallMat);
    lintel.position.set(rightX, ENTRY_DOOR_H + (ROOM_H - ENTRY_DOOR_H) / 2, ENTRY_DOOR_Z);
    lintel.rotation.y = -Math.PI / 2;
    group.add(lintel);

    entryDoor = new THREE.Group();
    entryDoor.position.set(rightX - 0.06, ENTRY_DOOR_H / 2, ENTRY_DOOR_Z);
    const doorSlab = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, ENTRY_DOOR_H, ENTRY_DOOR_W),
      new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.82 })
    );
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xa58343, metalness: 0.45, roughness: 0.42 })
    );
    handle.position.set(-0.07, -0.05, 0.48);
    entryDoor.add(doorSlab, handle);
    group.add(entryDoor);
    colliders.push({
      minX: rightX - 0.15,
      maxX: rightX + 0.1,
      minZ: ENTRY_DOOR_Z - ENTRY_DOOR_W / 2,
      maxZ: ENTRY_DOOR_Z + ENTRY_DOOR_W / 2
    });
  }

  addBaseboard(group, { width: ROOM_W, depth: ROOM_D, color: 0x161208 });

  // Deep stained casings make both openings read as part of the old house,
  // while leaving the authored slabs, hinges and collision untouched.
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x21170f, roughness: 0.78 });
  function addDoorCasing(x, z, width, height, facesFront) {
    const casing = new THREE.Group();
    casing.position.set(x, 0, z);
    const sideGeometry = new THREE.BoxGeometry(0.16, height + 0.22, 0.14);
    const topGeometry = new THREE.BoxGeometry(width + 0.38, 0.2, 0.16);
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(sideGeometry, trimMat);
      jamb.position.set(side * (width / 2 + 0.09), height / 2, 0);
      casing.add(jamb);
    }
    const lintelTrim = new THREE.Mesh(topGeometry, trimMat);
    lintelTrim.position.set(0, height + 0.06, 0);
    casing.add(lintelTrim);
    if (!facesFront) casing.rotation.y = Math.PI / 2;
    group.add(casing);
  }
  addDoorCasing(DOOR_X, frontZ - 0.04, DOORWAY_W, DOORWAY_H, true);
  addDoorCasing(ROOM_W / 2 - 0.04, ENTRY_DOOR_Z, ENTRY_DOOR_W, ENTRY_DOOR_H, false);

  // Temporary bright testing setup: navigation and puzzle faces need no torch.
  const ambient = new THREE.AmbientLight(0xfff4e5, 3.5);
  group.add(ambient);
  const lamp = new THREE.PointLight(0xffe0b0, 24, 20, 2);
  lamp.position.set(0, 4.8, 0.8);
  group.add(lamp);
  const doorLamp = new THREE.PointLight(0xffe0b0, 10, 11, 2);
  doorLamp.position.set(0, 2.8, 5.1);
  group.add(doorLamp);

  // Reuse the shadowless fills for strong downstairs and loft test coverage.
  const rearStudyFill = new THREE.PointLight(0xffe3ba, 16, 10, 2);
  rearStudyFill.position.set(-3.8, 2.35, -3.2);
  group.add(rearStudyFill);
  const loftFill = new THREE.PointLight(0xffe7c4, 18, 12, 2);
  loftFill.position.set(1.8, 4.9, -3.8);
  group.add(loftFill);

  // Graybox loft: the rear archive is a real second storey, leaving the front
  // half of the study open to the full ceiling height.
  const balconyMat = new THREE.MeshStandardMaterial({ color: 0x302820, roughness: 0.9 });
  const railingMat = new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 0.85 });
  const loftWidth = ROOM_W;
  const loftFrontZ = -ROOM_D / 2 + LOFT_D;
  const loft = new THREE.Mesh(new THREE.BoxGeometry(loftWidth, 0.28, LOFT_D), balconyMat);
  loft.position.set(0, LOFT_Y - 0.14, -ROOM_D / 2 + LOFT_D / 2);
  loft.receiveShadow = true;
  group.add(loft);

  function addRailing(length, x, z, alongX) {
    const railHeight = 1.05;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? length : 0.08, 0.08, alongX ? 0.08 : length),
      railingMat
    );
    rail.position.set(x, LOFT_Y + railHeight, z);
    group.add(rail);
    const lowerRail = rail.clone();
    lowerRail.position.y = LOFT_Y + 0.34;
    lowerRail.scale.y = 0.7;
    group.add(lowerRail);
    for (let offset = -length / 2; offset <= length / 2; offset += 1.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, railHeight, 0.08), railingMat);
      post.position.set(x + (alongX ? offset : 0), LOFT_Y + railHeight / 2, z + (alongX ? 0 : offset));
      group.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), railingMat);
      cap.position.set(post.position.x, LOFT_Y + railHeight + 0.08, post.position.z);
      group.add(cap);
    }
    colliders.push({
      minX: x - (alongX ? length / 2 : 0.04),
      maxX: x + (alongX ? length / 2 : 0.04),
      minZ: z - (alongX ? 0.04 : length / 2),
      maxZ: z + (alongX ? 0.04 : length / 2),
      minY: LOFT_Y - 0.1,
      maxY: LOFT_Y + railHeight + 0.04
    });
  }

  const stairBottomZ = 2.6;
  const stairWidth = 1.5;
  const stairCount = 16;
  const stairRun = 4.48;
  const stairDepth = stairRun / stairCount;
  const stairRise = LOFT_Y / stairCount;
  const stairX = ROOM_W / 2 - stairWidth / 2;
  const stairTopZ = stairBottomZ - stairRun;
  const stairHalfWidth = stairWidth / 2;
  // Join the mezzanine to both walls and leave a real opening over the flight.
  const loftMainRightX = stairX - stairHalfWidth;
  loft.geometry.dispose();
  loft.geometry = new THREE.BoxGeometry(loftMainRightX + loftWidth / 2, 0.28, LOFT_D);
  loft.position.x = (loftMainRightX - loftWidth / 2) / 2;
  const landingDepth = stairTopZ + ROOM_D / 2;
  const loftLanding = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, 0.28, landingDepth), balconyMat);
  loftLanding.position.set(stairX, LOFT_Y - 0.14, -ROOM_D / 2 + landingDepth / 2);
  loftLanding.receiveShadow = true;
  group.add(loftLanding);
  // A single front rail stops before the stair opening.
  const loftRailEndX = stairX - stairHalfWidth + 0.1;
  addRailing(loftRailEndX + loftWidth / 2, (loftRailEndX - loftWidth / 2) / 2, loftFrontZ, true);
  const loftEdgeTrim = new THREE.Mesh(
    new THREE.BoxGeometry(loftRailEndX + loftWidth / 2, 0.24, 0.18), trimMat
  );
  loftEdgeTrim.position.set((loftRailEndX - loftWidth / 2) / 2, LOFT_Y - 0.12, loftFrontZ + 0.03);
  group.add(loftEdgeTrim);

  // Stair sides remain solid while groundAt() supplies the walkable rise.
  // The loft rail above has vertical bounds so the ground floor stays open.
  const railingThickness = 0.12;
  colliders.push(
    { minX: stairX - stairHalfWidth - railingThickness, maxX: stairX - stairHalfWidth + railingThickness, minZ: stairTopZ, maxZ: stairBottomZ },
    { minX: stairX + stairHalfWidth - railingThickness, maxX: stairX + stairHalfWidth + railingThickness, minZ: stairTopZ, maxZ: stairBottomZ }
  );

  // Human-scale steps along the right wall: 0.19 m rise, 0.28 m tread.
  const stairGeometry = new THREE.BoxGeometry(stairWidth, 1, stairDepth);
  const treadGeometry = new THREE.BoxGeometry(stairWidth + 0.08, 0.055, stairDepth + 0.04);
  const treadMat = new THREE.MeshStandardMaterial({ color: 0x493526, roughness: 0.78 });
  for (let index = 0; index < stairCount; index++) {
    const stepHeight = stairRise * (index + 1);
    const step = new THREE.Mesh(stairGeometry, balconyMat);
    step.scale.y = stepHeight;
    step.position.set(stairX, stepHeight / 2, stairBottomZ - stairDepth * (index + 0.5));
    step.receiveShadow = true;
    group.add(step);
    const tread = new THREE.Mesh(treadGeometry, treadMat);
    tread.position.set(stairX, stepHeight + 0.028, step.position.z + 0.015);
    tread.receiveShadow = true;
    group.add(tread);
  }
  const stringerLength = Math.hypot(stairRun, LOFT_Y);
  const stringerAngle = Math.atan2(LOFT_Y, stairRun);
  const stringerGeometry = new THREE.BoxGeometry(0.12, 0.22, stringerLength);
  for (const side of [-1, 1]) {
    const stringer = new THREE.Mesh(stringerGeometry, trimMat);
    stringer.position.set(stairX + side * (stairHalfWidth - 0.05), LOFT_Y / 2, (stairBottomZ + stairTopZ) / 2);
    stringer.rotation.x = stringerAngle;
    group.add(stringer);
  }
  /** Resolve stacked floors using feet height, never just their shared X/Z. */
  function groundAt(x, z, currentGroundY = null) {
    const isOnStair = x >= stairX - stairHalfWidth && x <= stairX + stairHalfWidth
      && z >= stairTopZ && z <= stairBottomZ;
    if (isOnStair) {
      const stairY = ((stairBottomZ - z) / stairRun) * LOFT_Y;
      // A nearby tread is reachable; a flight overhead is not a new floor.
      if (currentGroundY === null || Math.abs(stairY - currentGroundY) <= 0.6) return stairY;
    }
    const onLoftFootprint = x >= -loftWidth / 2 && x <= loftWidth / 2
      && z >= -ROOM_D / 2 && z <= loftFrontZ;
    if (onLoftFootprint && (currentGroundY === null || currentGroundY >= LOFT_Y - 0.6)) return LOFT_Y;
    return 0;
  }

  // study desk + bookshelves
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.85 });
  const deskTopGeometry = new THREE.BoxGeometry(2.75, 0.16, 1.28);
  deskTopGeometry.translate(0, 0.295, 0);
  const desk = new THREE.Mesh(deskTopGeometry, woodMat);
  desk.position.set(0, 0.375, 1);
  group.add(desk);
  const deskPedestalGeometry = new THREE.BoxGeometry(0.58, 0.64, 1.02);
  for (const x of [-0.92, 0.92]) {
    const pedestal = new THREE.Mesh(deskPedestalGeometry, woodMat);
    pedestal.position.set(x, 0.32, desk.position.z);
    group.add(pedestal);
    for (const y of [0.18, 0.38, 0.58]) {
      const drawerPanel = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.035), trimMat);
      drawerPanel.position.set(x, y, desk.position.z + 0.53);
      group.add(drawerPanel);
    }
  }
  const deskApron = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.22, 0.12), trimMat);
  deskApron.position.set(0, 0.53, desk.position.z + 0.5);
  group.add(deskApron);
  colliders.push({ minX: desk.position.x - 1.4, maxX: desk.position.x + 1.4, minZ: desk.position.z - 0.65, maxZ: desk.position.z + 0.65 });

  /**
   * Level 3's own puzzle state. What crosses levels lives in GameState (the
   * open locks); what is only true inside this room lives here.
   */
  const puzzle = {
    clockHour: 10,
    clockMinute: 0,
    clockSolved: false,
    hasArchiveToken: false,
    crestSigilInserted: false,
    crestLampStates: [0, 0, 0],
    crestSolved: false,
    hasArchiveKey: false,
    memoryArchiveUnlocked: false,
    memoryRecordSelections: [0, 0, 0],
    memoryArchiveSolved: false,
    memoryVisorCollected: false,
    correctedTrailProgress: 0,
    correctedTrailSolved: false,
    truthRecordProgress: 0,
    truthRecordsSolved: false,
    truthRecordsComplete: false,
    mirrorUnlocked: false,
    mirrorRevealInProgress: false,
    mirrorRevealed: false,
    hasHollowOverrideKey: false,
    endingChoice: 'NONE',
    endingSequenceStarted: false
  };
  let mirrorRevealGeneration = 0;

  // Keep the original desk drawer as a closed, non-interactive room prop.
  const drawer = new THREE.Group();
  drawer.position.set(desk.position.x + 0.9, 0.5, desk.position.z + 0.61);
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

  // Shared brass material for the new Override Key reward.
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xb9a55e, metalness: 0.85, roughness: 0.35 });

  // desk chair, tucked in
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.8 });
  const chairGroup = new THREE.Group();
  chairGroup.position.set(desk.position.x, 0, desk.position.z + 0.9);
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

  // Puzzle 1: a deliberately plain incident clock. It occupies one left-wall
  // shelf bay so the player can approach its hands without blocking the room.
  const clockX = -7.74;
  const clockZ = 4.35;
  const clock = new THREE.Group();
  clock.name = 'IncidentClock';
  clock.position.set(clockX, 0, clockZ);
  group.add(clock);

  const clockWoodMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.9 });
  const clockFaceMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb5, roughness: 0.95 });
  const clockHandMat = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.75 });
  const clockBody = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.55, 0.9), clockWoodMat);
  clockBody.position.y = 1.275;
  clock.add(clockBody);

  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.31, 24), clockFaceMat);
  clockFace.position.set(0.23, 1.82, 0);
  clockFace.rotation.y = Math.PI / 2;
  clock.add(clockFace);

  const clockHands = new THREE.Group();
  clockHands.position.set(0.245, 1.82, 0);
  clockHands.rotation.y = Math.PI / 2;
  clock.add(clockHands);

  // Each hand pivots at the face centre. Keeping its mesh above that pivot
  // makes the visual rotation and the interaction target share one true axis.
  const hourHandPivot = new THREE.Group();
  const minuteHandPivot = new THREE.Group();
  clockHands.add(hourHandPivot, minuteHandPivot);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17, 0.025), clockHandMat);
  hourHand.position.y = 0.085;
  hourHandPivot.add(hourHand);
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.25, 0.02), clockHandMat);
  minuteHand.position.y = 0.125;
  minuteHandPivot.add(minuteHand);
  const clockPin = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), clockHandMat);
  clockPin.position.z = 0.018;
  clockHands.add(clockPin);

  const clockDrawer = new THREE.Group();
  clockDrawer.position.set(0.24, 0.58, 0);
  clock.add(clockDrawer);
  const clockDrawerFront = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.58), clockWoodMat);
  clockDrawer.add(clockDrawerFront);
  const clockDrawerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.05), clockHandMat);
  clockDrawerHandle.position.set(0.06, 0, 0);
  clockDrawer.add(clockDrawerHandle);

  const archiveTokenMat = new THREE.MeshStandardMaterial({ color: 0xb69a4d, metalness: 0.7, roughness: 0.35 });
  const archiveToken = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12), archiveTokenMat);
  archiveToken.position.set(0.1, 0.08, 0);
  archiveToken.rotation.z = Math.PI / 2;
  archiveToken.visible = false;
  clockDrawer.add(archiveToken);

  function setClockHands() {
    hourHandPivot.rotation.z = -puzzle.clockHour * (Math.PI * 2 / 12);
    minuteHandPivot.rotation.z = -puzzle.clockMinute * (Math.PI * 2 / 60);
  }

  function trySolveClock() {
    if (puzzle.clockSolved || puzzle.clockHour !== 11 || puzzle.clockMinute !== 15) return;
    puzzle.clockSolved = true;
    archiveToken.visible = !puzzle.hasArchiveToken;
    archiveTokenHitbox.visible = !puzzle.hasArchiveToken;
    if (!puzzle.hasArchiveToken && !interactables.includes(archiveTokenHitbox)) {
      interactables.push(archiveTokenHitbox);
    }
    onSfx('latch');
    showCaption('A hidden drawer clicks open.');
  }

  function rotateClockHand(part) {
    if (puzzle.clockSolved) return;
    if (part === 'hour') puzzle.clockHour = (puzzle.clockHour + 1) % 12;
    else puzzle.clockMinute = (puzzle.clockMinute + 5) % 60;
    setClockHands();
    trySolveClock();
  }

  const hourHandHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.24, 0.08),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  // Offset targets to opposite sides of the shared centre so they stay easy
  // to select even when the hands overlap at a particular time.
  hourHandHitbox.position.set(0.075, 0.09, 0);
  hourHandHitbox.userData.interact = {
    label: 'Turn hour hand (+1 hour)',
    onInteract: () => rotateClockHand('hour')
  };
  hourHandPivot.add(hourHandHitbox);
  interactables.push(hourHandHitbox);

  const minuteHandHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.42, 0.08),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  minuteHandHitbox.position.set(-0.075, 0.16, 0);
  minuteHandHitbox.userData.interact = {
    label: 'Turn minute hand (+5 minutes)',
    onInteract: () => rotateClockHand('minute')
  };
  minuteHandPivot.add(minuteHandHitbox);
  interactables.push(minuteHandHitbox);

  const archiveTokenHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.14),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  archiveTokenHitbox.position.set(0.11, 0.08, 0);
  archiveTokenHitbox.visible = false;
  archiveTokenHitbox.userData.interact = {
    label: 'Take the brass archive token',
    onInteract: () => {
      if (!puzzle.clockSolved || puzzle.hasArchiveToken) return;
      puzzle.hasArchiveToken = true;
      archiveToken.visible = false;
      archiveTokenHitbox.visible = false;
      gameState.inventory.add('archiveToken');
      const index = interactables.indexOf(archiveTokenHitbox);
      if (index >= 0) interactables.splice(index, 1);
      showCaption('Brass archive token acquired.');
    }
  };
  clockDrawer.add(archiveTokenHitbox);

  const incidentNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.26),
    new THREE.MeshStandardMaterial({ color: 0xcfc5aa, roughness: 1 })
  );
  incidentNote.rotation.x = -Math.PI / 2;
  incidentNote.rotation.z = -0.12;
  incidentNote.position.set(-0.52, 0.381, -0.22);
  incidentNote.userData.interact = {
    label: 'Read the incident note',
    onInteract: () => showCaption('Containment failure logged at 23:15.')
  };
  desk.add(incidentNote);
  interactables.push(incidentNote);

  colliders.push({ minX: clockX - 0.25, maxX: clockX + 0.25, minZ: clockZ - 0.5, maxZ: clockZ + 0.5 });
  setClockHands();

  // Puzzle 2: front-left wall, clear of the clock and the final-exit doorway.
  // Local +Z faces into the room; all shadows are meshes, never real lights.
  const shadowCrest = new THREE.Group();
  shadowCrest.name = 'ShadowCrest';
  shadowCrest.position.set(-4.3, 1.65, 6.36);
  shadowCrest.rotation.y = Math.PI;
  group.add(shadowCrest);
  const crestMat = new THREE.MeshStandardMaterial({ color: 0x8c8068, roughness: 0.9 });
  const crestBrassMat = new THREE.MeshStandardMaterial({ color: 0xb69a4d, metalness: 0.55, roughness: 0.5 });
  const crestDarkMat = new THREE.MeshStandardMaterial({ color: 0x211d18, roughness: 1 });
  const crestHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const compartment = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.24, 0.06), crestDarkMat);
  compartment.position.z = 0.02;
  shadowCrest.add(compartment);

  const crestCover = new THREE.Group();
  crestCover.position.z = 0.14;
  shadowCrest.add(crestCover);
  const crestPlate = new THREE.Mesh(new THREE.CircleGeometry(0.68, 32), crestMat);
  crestCover.add(crestPlate);
  const crestSocket = new THREE.Mesh(new THREE.RingGeometry(0.095, 0.14, 12), crestBrassMat);
  crestSocket.position.set(0, -0.36, 0.02);
  crestCover.add(crestSocket);
  const installedSigil = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), crestBrassMat);
  installedSigil.position.set(0, -0.36, 0.025);
  installedSigil.visible = false;
  crestCover.add(installedSigil);

  // Three disconnected strokes assemble a hollow triangular archive crest.
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x090806, transparent: true, opacity: 0.82, depthWrite: false });
  const shadowGeometry = new THREE.PlaneGeometry(0.065, 0.58);
  const shadowPieces = [];
  const shadowTargets = [
    { x: -0.145, y: 0.1, angle: -Math.PI / 6 },
    { x: 0, y: -0.15, angle: Math.PI / 2 },
    { x: 0.145, y: 0.1, angle: Math.PI / 6 }
  ];
  for (let index = 0; index < 3; index++) {
    const piece = new THREE.Mesh(shadowGeometry, shadowMat);
    crestCover.add(piece);
    shadowPieces.push(piece);
  }
  const crestAnswer = [2, 1, 2];
  const crestLampNames = ['LEFT', 'CENTRE', 'RIGHT'];
  const crestLamps = [];
  const crestLampHits = [];
  const lampGeometry = new THREE.BoxGeometry(0.22, 0.3, 0.14);
  const lampHitGeometry = new THREE.BoxGeometry(0.42, 0.44, 0.3);
  const lampFaceGeometry = new THREE.BoxGeometry(0.13, 0.16, 0.02);
  const lampFaceMat = new THREE.MeshStandardMaterial({ color: 0xd9ba77, emissive: 0x60401c, emissiveIntensity: 0.5 });

  function updateCrestShadows() {
    shadowPieces.forEach((piece, index) => {
      const target = shadowTargets[index];
      const offset = puzzle.crestLampStates[index] - crestAnswer[index];
      piece.visible = puzzle.crestSigilInserted;
      piece.position.set(target.x + offset * 0.075, target.y + offset * 0.055, 0.035);
      piece.rotation.z = target.angle + offset * 0.65;
      crestLamps[index].rotation.z = (puzzle.crestLampStates[index] - 1) * 0.4;
      crestLampHits[index].userData.interact.label = `${crestLampNames[index]} lamp: ${puzzle.crestLampStates[index]} — turn`;
    });
  }

  function trySolveCrest() {
    if (!puzzle.crestSigilInserted || puzzle.crestSolved
      || !crestAnswer.every((state, index) => puzzle.crestLampStates[index] === state)) return;
    puzzle.crestSolved = true;
    const crestIndex = interactables.indexOf(crestHit);
    if (crestIndex >= 0) interactables.splice(crestIndex, 1);
    archiveKey.visible = true;
    archiveKeyHit.visible = true;
    interactables.push(archiveKeyHit);
    for (const hit of crestLampHits) {
      const index = interactables.indexOf(hit);
      if (index >= 0) interactables.splice(index, 1);
    }
    onSfx('latch');
    showCaption('The shadows form one crest. A hidden compartment opens.');
  }

  [[1.05, 0.2], [0, 0.85], [-1.05, 0.2]].forEach(([x, y], index) => {
    const sconce = new THREE.Group();
    sconce.position.set(x, y, 0.15);
    const body = new THREE.Mesh(lampGeometry, crestBrassMat);
    const face = new THREE.Mesh(lampFaceGeometry, lampFaceMat);
    face.position.z = 0.08;
    sconce.add(body, face);
    shadowCrest.add(sconce);
    crestLamps.push(sconce);
    // Targets stay stationary while the small lamp bodies rotate.
    const hit = new THREE.Mesh(lampHitGeometry, crestHitMat);
    hit.position.copy(sconce.position);
    hit.userData.interact = {
      label: `${crestLampNames[index]} lamp`,
      onInteract: () => {
        if (!puzzle.crestSigilInserted || puzzle.crestSolved) return;
        puzzle.crestLampStates[index] = (puzzle.crestLampStates[index] + 1) % 3;
        updateCrestShadows();
        onSfx('metal_click');
        trySolveCrest();
      }
    };
    shadowCrest.add(hit);
    crestLampHits.push(hit);
  });

  const crestHit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.16), crestHitMat);
  crestHit.position.z = 0.15;
  crestHit.userData.interact = {
    label: 'Examine the brass socket',
    onInteract: () => {
      if (puzzle.crestSigilInserted) {
        showCaption(puzzle.crestSolved ? 'The archive crest is open.' : 'The sigil is installed. Three lamps can be turned.');
        return;
      }
      if (!gameState.inventory.has('archiveToken')) {
        showCaption('An empty brass socket.');
        return;
      }
      gameState.inventory.delete('archiveToken');
      puzzle.crestSigilInserted = true;
      installedSigil.visible = true;
      interactables.push(...crestLampHits);
      updateCrestShadows();
      onSfx('latch');
      showCaption('The brass sigil seats in the socket. The three lamps unlock.');
    }
  };
  shadowCrest.add(crestHit);
  interactables.push(crestHit);

  const crestClue = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.32, 0.05), crestMat);
  crestClue.position.set(0, -0.94, 0.07);
  crestClue.userData.interact = {
    label: 'Read the crest plaque',
    onInteract: () => showCaption('THREE LIGHTS GUARD THE ARCHIVE.\nTHE OUTER TWO TURN FROM THE CENTRE.\nTHE HEART REMAINS TRUE.')
  };
  shadowCrest.add(crestClue);
  interactables.push(crestClue);

  const archiveKey = new THREE.Group();
  archiveKey.position.set(0, 0, 0.08);
  const archiveKeyBow = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12), crestBrassMat);
  archiveKeyBow.position.y = 0.1;
  const archiveKeyShaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.025), crestBrassMat);
  archiveKeyShaft.position.y = -0.07;
  const archiveKeyBit = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.025), crestBrassMat);
  archiveKeyBit.position.set(0.03, -0.16, 0);
  archiveKey.add(archiveKeyBow, archiveKeyShaft, archiveKeyBit);
  archiveKey.visible = false;
  shadowCrest.add(archiveKey);
  const archiveKeyHit = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.09), crestHitMat);
  archiveKeyHit.position.copy(archiveKey.position);
  archiveKeyHit.visible = false;
  archiveKeyHit.userData.interact = {
    label: 'Take the Archive Key',
    onInteract: () => {
      if (!puzzle.crestSolved || puzzle.hasArchiveKey || crestCover.position.x < 0.8) return;
      puzzle.hasArchiveKey = true;
      gameState.inventory.add('archiveKey');
      archiveKey.visible = false;
      archiveKeyHit.visible = false;
      const index = interactables.indexOf(archiveKeyHit);
      if (index >= 0) interactables.splice(index, 1);
      showCaption('Archive Key acquired.');
    }
  };
  shadowCrest.add(archiveKeyHit);
  updateCrestShadows();

  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x251b14, roughness: 0.95 });
  const shelfAlongWallGeometry = new THREE.BoxGeometry(2.8, 2.8, 0.45);
  const shelfAcrossWallGeometry = new THREE.BoxGeometry(0.45, 2.8, 2.8);
  function addShelf(x, y, z, alongX, solid = false) {
    const shelf = new THREE.Mesh(alongX ? shelfAlongWallGeometry : shelfAcrossWallGeometry, shelfMat);
    shelf.position.set(x, y, z);
    group.add(shelf);
    // Applied pilasters, crown and shelf lines turn the simple collision block
    // into a built-in archive bay without multiplying book-sized meshes.
    const faceOffset = !alongX && x > 0 ? -0.24 : 0.24;
    const bayWidth = 2.8;
    for (const offset of [-bayWidth / 2, bayWidth / 2]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.9, 0.1), trimMat);
      pilaster.position.set(
        x + (alongX ? offset : faceOffset),
        y,
        z + (alongX ? faceOffset : offset)
      );
      if (!alongX) pilaster.rotation.y = Math.PI / 2;
      group.add(pilaster);
    }
    for (const shelfY of [-1.25, -0.42, 0.42, 1.25]) {
      const shelfLip = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? bayWidth : 0.1, 0.09, alongX ? 0.1 : bayWidth),
        trimMat
      );
      shelfLip.position.set(x + (alongX ? 0 : faceOffset), y + shelfY, z + (alongX ? faceOffset : 0));
      group.add(shelfLip);
    }
    if (solid) {
      const halfWidth = alongX ? 1.4 : 0.225;
      const halfDepth = alongX ? 0.225 : 1.4;
      colliders.push({
        minX: x - halfWidth, maxX: x + halfWidth,
        minZ: z - halfDepth, maxZ: z + halfDepth,
        minY: y - 1.4, maxY: y + 1.4
      });
    }
  }
  // Dressing bays leave the portrait, entry, stair approach and mirror clear.
  [-4.8, -2].forEach((z) => addShelf(-7.75, 1.4, z, false, true));
  [-2.4, 0.4].forEach((x) => addShelf(x, 1.4, -6.25, true, true));
  [-4.8, -2].forEach((z) => addShelf(-7.75, LOFT_Y + 1.4, z, false));
  addShelf(7.75, LOFT_Y + 1.4, -4.8, false);
  [-1.5, 1.3].forEach((x) => addShelf(x, LOFT_Y + 1.4, -6.25, true));

  // A broad Victorian mantel and dark firebox form a readable rear landmark.
  const fireplace = new THREE.Group();
  fireplace.position.set(-5.3, 0, -6.18);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x514941, roughness: 0.96 });
  const fireboxMat = new THREE.MeshStandardMaterial({ color: 0x100d0b, roughness: 1 });
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.16, 0.85), stoneMat);
  hearth.position.set(0, 0.08, 0.18);
  const firebox = new THREE.Mesh(new THREE.BoxGeometry(1.28, 1.3, 0.08), fireboxMat);
  firebox.position.set(0, 0.78, 0.34);
  fireplace.add(hearth, firebox);
  for (const x of [-0.82, 0.82]) {
    const surround = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.75, 0.42), stoneMat);
    surround.position.set(x, 0.96, 0.14);
    fireplace.add(surround);
  }
  const mantel = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.24, 0.72), woodMat);
  mantel.position.set(0, 1.88, 0.08);
  fireplace.add(mantel);
  const overmantel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 0.28), woodMat);
  overmantel.position.set(0, 2.23, 0.03);
  fireplace.add(overmantel);
  group.add(fireplace);
  colliders.push({ minX: -6.6, maxX: -4, minZ: -6.48, maxZ: -5.88, minY: 0, maxY: 2.4 });

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.8),
    new THREE.MeshStandardMaterial({ map: createRugTexture({ base: '#2e3a2a', border: '#1c241a', ring: '#3c4a30', trim: '#d8cfa0', core: '#8a6a2a' }), roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(desk.position.x, 0.008, desk.position.z + 0.35);
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
      showCaption(line(portraitMat.map === portraitTexTrue
        ? 'dialog_portrait_with_visor'
        : 'dialog_portrait_without_visor'));
    }
  };
  interactables.push(portrait);
  group.add(portrait);

  // Puzzle 3: loft records station, facing the open approach from the stairs.
  const memoryArchive = new THREE.Group();
  memoryArchive.name = 'MemoryArchive';
  memoryArchive.position.set(-5.4, LOFT_Y, -6.35);
  group.add(memoryArchive);
  const archiveCabinetMat = new THREE.MeshStandardMaterial({ color: 0x342f29, roughness: 0.9 });
  const archiveHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const cabinetBack = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.7, 0.12), archiveCabinetMat);
  cabinetBack.position.set(0, 0.95, 0);
  memoryArchive.add(cabinetBack);
  for (const x of [-1.55, 1.55]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.5), archiveCabinetMat);
    side.position.set(x, 0.95, 0.2);
    memoryArchive.add(side);
  }
  const cabinetShelf = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 0.5), archiveCabinetMat);
  cabinetShelf.position.set(0, 0.4, 0.2);
  memoryArchive.add(cabinetShelf);
  const cabinetCrown = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.16, 0.62), trimMat);
  cabinetCrown.position.set(0, 1.86, 0.18);
  memoryArchive.add(cabinetCrown);
  for (const x of [-1.46, 1.46]) {
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.72, 0.09), trimMat);
    stile.position.set(x, 0.95, 0.48);
    memoryArchive.add(stile);
  }
  const archiveDoorHinge = new THREE.Group();
  archiveDoorHinge.position.set(-1.55, 0, 0.5);
  memoryArchive.add(archiveDoorHinge);
  const archiveDoor = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.7, 0.08), archiveCabinetMat);
  archiveDoor.position.set(1.55, 0.95, 0);
  archiveDoorHinge.add(archiveDoor);
  const archiveLock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.04), crestBrassMat);
  archiveLock.position.set(2.85, 0.95, 0.06);
  archiveDoorHinge.add(archiveLock);
  const memoryContents = new THREE.Group();
  memoryContents.visible = false;
  memoryArchive.add(memoryContents);
  const recordCategories = ['SUBJECT', 'PROCEDURE', 'OUTCOME'];
  const recordOptions = [
    ['Subject 04 — A. Vale', 'Subject 06 — Mark', 'Subject 11 — Unknown'],
    ['Neural Mapping', 'Adaptive Restoration', 'Containment Sedation'],
    ['Stable recovery', 'Fatal rejection', 'Memory degradation / perceptual distortion']
  ];
  const memoryAnswer = [1, 1, 2];
  const memoryRecordHits = [];
  const memoryRecordDisplays = [];

  // Small canvas labels repaint only when a record changes, never per frame.
  function makeArchiveLabel(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 320;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
    function write(lines) {
      const context = canvas.getContext('2d');
      context.fillStyle = '#d8cfb5';
      context.fillRect(0, 0, 768, 320);
      context.fillStyle = '#211d18';
      context.font = '34px serif';
      context.textAlign = 'center';
      lines.forEach((text, index) => context.fillText(text, 384, 65 + index * 56, 730));
      texture.needsUpdate = true;
    }
    return { mesh, write };
  }

  function updateMemoryRecords() {
    memoryRecordDisplays.forEach((display, index) => {
      const selected = recordOptions[index][puzzle.memoryRecordSelections[index]];
      const lines = selected === recordOptions[2][2]
        ? ['Memory degradation /', 'perceptual distortion'] : [selected];
      display.write([recordCategories[index], ...lines, puzzle.memoryArchiveSolved ? 'CONFIRMED' : '[E] NEXT RECORD']);
      memoryRecordHits[index].userData.interact.label = `${recordCategories[index]}: ${selected}`;
    });
  }

  function trySolveMemoryArchive() {
    if (!puzzle.memoryArchiveUnlocked || puzzle.memoryArchiveSolved
      || !memoryAnswer.every((value, index) => puzzle.memoryRecordSelections[index] === value)) return;
    puzzle.memoryArchiveSolved = true;
    updateMemoryRecords();
    for (const hit of memoryRecordHits) {
      const index = interactables.indexOf(hit);
      if (index >= 0) interactables.splice(index, 1);
    }
    visorGroup.visible = true;
    visorHitbox.visible = true;
    if (!interactables.includes(visorHitbox)) interactables.push(visorHitbox);
    onSfx('latch');
    showCaption('Records reconstructed. The calibration compartment unlocks.');
  }

  for (let index = 0; index < 3; index++) {
    const x = (index - 1) * 1.02;
    const display = makeArchiveLabel(0.9, 0.56);
    display.mesh.position.set(x, 1.3, 0.21);
    memoryContents.add(display.mesh);
    memoryRecordDisplays.push(display);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.6, 0.16), archiveHitMat);
    hit.position.set(x, 1.3, 0.22);
    hit.userData.interact = {
      label: recordCategories[index],
      onInteract: () => {
        if (!puzzle.memoryArchiveUnlocked || puzzle.memoryArchiveSolved || archiveDoorHinge.position.x < 1.2) return;
        puzzle.memoryRecordSelections[index] = (puzzle.memoryRecordSelections[index] + 1) % 3;
        updateMemoryRecords();
        showCaption(`${recordCategories[index]}: ${recordOptions[index][puzzle.memoryRecordSelections[index]]}`);
        trySolveMemoryArchive();
      }
    };
    memoryContents.add(hit);
    memoryRecordHits.push(hit);
  }
  updateMemoryRecords();
  const memoryClues = [
    ['SUBJECT 06 approved for voluntary adaptation trial.', ['SUBJECT 06 approved', 'for voluntary', 'adaptation trial.']],
    ['Procedure designation: ADAPTIVE RESTORATION.', ['Procedure designation:', 'ADAPTIVE', 'RESTORATION.']],
    ['Post-procedure symptoms:\nmemory degradation,\nidentity instability,\nperceptual distortion.', ['Post-procedure symptoms:', 'memory degradation,', 'identity instability,', 'perceptual distortion.']]
  ];
  memoryClues.forEach(([text, lines], index) => {
    const display = makeArchiveLabel(0.9, 0.5);
    display.write(lines);
    display.mesh.position.set((index - 1) * 1.02, 2.12, 0.14);
    display.mesh.userData.interact = {
      label: `Read archive clue ${index + 1}`,
      onInteract: () => showCaption(text)
    };
    memoryArchive.add(display.mesh);
    interactables.push(display.mesh);
  });
  const archiveCabinetHit = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.7, 0.18), archiveHitMat);
  archiveCabinetHit.position.set(0, 0.95, 0.5);
  archiveCabinetHit.userData.interact = {
    label: 'Unlock the memory archive',
    onInteract: () => {
      if (puzzle.memoryArchiveUnlocked) return;
      if (!gameState.inventory.has('archiveKey')) {
        showCaption('Locked. Archive access required.');
        return;
      }
      gameState.inventory.delete('archiveKey');
      puzzle.memoryArchiveUnlocked = true;
      memoryContents.visible = true;
      const index = interactables.indexOf(archiveCabinetHit);
      if (index >= 0) interactables.splice(index, 1);
      interactables.push(...memoryRecordHits);
      onSfx('latch');
      showCaption('Archive unlocked. Reconstruct the subject, procedure and outcome.');
    }
  };
  memoryArchive.add(archiveCabinetHit);
  interactables.push(archiveCabinetHit);
  const visorCompartmentCover = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.38, 0.04), archiveCabinetMat);
  visorCompartmentCover.position.set(0, 0.68, 0.44);
  memoryContents.add(visorCompartmentCover);

  // The existing visor is the archive reward; its pickup hook owns V gating.
  const visorGroup = new THREE.Group();
  visorGroup.position.set(memoryArchive.position.x, LOFT_Y + 0.68, memoryArchive.position.z + 0.35);
  visorGroup.rotation.set(-Math.PI / 2, 0, 0.6);
  visorGroup.visible = false;
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
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  visorHitbox.position.copy(visorGroup.position);
  visorHitbox.visible = false;
  visorHitbox.userData.interact = {
    label: 'Pick up the visor',
    onInteract: () => {
      if (!puzzle.memoryArchiveSolved || puzzle.memoryVisorCollected || visorCompartmentCover.position.x < 0.6) return;
      puzzle.memoryVisorCollected = true;
      visorGroup.visible = false;
      visorHitbox.visible = false;
      const i = interactables.indexOf(visorHitbox);
      if (i >= 0) interactables.splice(i, 1);
      onTakeVisor();
      gameState.hasVisor = true;
      gameState.inventory.add('visor');
      showCaption('CALIBRATION VISOR ACQUIRED — Press V to toggle.');
    }
  };
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

  // Puzzle 4: the exact same stains read differently through corrected sight.
  const distortedTrail = new THREE.Group();
  distortedTrail.name = 'DistortedArchiveTrail';
  distortedTrail.visible = !gameState.visorWorn;
  group.add(distortedTrail);
  const bloodTrail = new THREE.Group();
  bloodTrail.name = 'CorrectedBloodTrail';
  visorOnly.add(bloodTrail);
  const stainGeometry = new THREE.CircleGeometry(1, 9);
  const blackStainMat = new THREE.MeshBasicMaterial({ color: 0x080709, transparent: true, opacity: 0.72, depthWrite: false });
  const bloodStainMat = new THREE.MeshBasicMaterial({ color: 0x671514, transparent: true, opacity: 0.85, depthWrite: false });
  const trailRoute = [
    [-1.8, 2.25], [1.9, 2.8], [4.9, 3.25], [stairX, stairBottomZ],
    [stairX, stairTopZ], [6.1, -3.3], [6.1, -4.5], [4.4, -4.95]
  ];
  let stainIndex = 0;
  for (let segment = 1; segment < trailRoute.length; segment++) {
    const [fromX, fromZ] = trailRoute[segment - 1];
    const [toX, toZ] = trailRoute[segment];
    const count = Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / 0.48);
    for (let step = 0; step < count; step++, stainIndex++) {
      const t = step / count;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      const onStairs = x >= stairX - stairHalfWidth && x <= stairX + stairHalfWidth
        && z >= stairTopZ && z <= stairBottomZ;
      const stain = new THREE.Mesh(stainGeometry, blackStainMat);
      stain.position.set(x, groundAt(x, z) + 0.025, z);
      stain.rotation.set(-Math.PI / 2 + (onStairs ? Math.atan(LOFT_Y / stairRun) : 0), 0, Math.sin(stainIndex * 2.1) * 0.5);
      stain.scale.set(0.07 + (stainIndex % 3) * 0.02, 0.16 + (stainIndex % 4) * 0.025, 1);
      distortedTrail.add(stain);
      const blood = new THREE.Mesh(stainGeometry, bloodStainMat);
      blood.position.copy(stain.position);
      blood.rotation.copy(stain.rotation);
      blood.scale.copy(stain.scale);
      bloodTrail.add(blood);
    }
  }

  const trailSymbolMat = new THREE.MeshBasicMaterial({ color: 0xbc9c83, side: THREE.DoubleSide });
  const trailLineGeometry = new THREE.PlaneGeometry(0.035, 0.32);
  function makeTrailSymbol(index) {
    const symbol = new THREE.Group();
    if (index === 1) {
      for (const x of [-0.11, 0, 0.11]) {
        const stroke = new THREE.Mesh(trailLineGeometry, trailSymbolMat);
        stroke.position.x = x;
        symbol.add(stroke);
      }
    } else {
      const outline = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, index === 0 ? 3 : 24), trailSymbolMat);
      if (index === 0) outline.rotation.z = Math.PI / 2;
      symbol.add(outline);
    }
    return symbol;
  }
  const hiddenTrailPositions = [
    [-1.8, 0.035, 2.25],
    [stairX, LOFT_Y + 0.035, -2.1],
    [6.1, LOFT_Y + 0.035, -4.5]
  ];
  hiddenTrailPositions.forEach((position, index) => {
    const clue = makeTrailSymbol(index);
    clue.position.set(...position);
    clue.rotation.x = -Math.PI / 2;
    const numeral = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.22),
      new THREE.MeshBasicMaterial({ map: createHiddenWritingTexture([['I', 'II', 'III'][index]]), transparent: true, depthWrite: false })
    );
    numeral.position.set(0.38, 0, 0.002);
    clue.add(numeral);
    visorOnly.add(clue);
  });

  // A shallow restricted archive alcove stands in front of the rear shelves;
  // no wall, shelf, or stair geometry needs to be moved to reveal it.
  const hollowAlcove = new THREE.Group();
  hollowAlcove.position.set(4.4, LOFT_Y, -5.85);
  group.add(hollowAlcove);
  const alcoveMat = new THREE.MeshStandardMaterial({ color: 0x211d19, roughness: 1 });
  for (const x of [-0.9, 0.9]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2, 1), alcoveMat);
    side.position.set(x, 1, 0.05);
    hollowAlcove.add(side);
  }
  for (const y of [0.04, 2]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1), alcoveMat);
    shelf.position.set(0, y, 0.05);
    hollowAlcove.add(shelf);
  }
  const alcoveBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2, 0.08), alcoveMat);
  alcoveBack.position.set(0, 1, -0.45);
  hollowAlcove.add(alcoveBack);
  const restrictedPlaque = makeArchiveLabel(1.35, 0.45);
  restrictedPlaque.write(['PROJECT HOLLOW', '— RESTRICTED RECORDS']);
  restrictedPlaque.mesh.position.set(0, 1.3, -0.39);
  restrictedPlaque.mesh.userData.interact = {
    label: 'Restricted archive records',
    onInteract: () => {
      if (puzzle.correctedTrailSolved) showCaption('PROJECT HOLLOW — RESTRICTED RECORDS');
    }
  };
  hollowAlcove.add(restrictedPlaque.mesh);
  const hollowArchivePanel = new THREE.Mesh(new THREE.BoxGeometry(1.82, 2, 0.1), shelfMat);
  hollowArchivePanel.position.set(0, 1, 0.6);
  hollowAlcove.add(hollowArchivePanel);

  // Puzzle 5 lives entirely inside the restricted alcove. The old letter
  // mesh below is reused as the drawer reward, rather than left accessible.
  const truthRecordNames = ['CONSENT', 'PROCEDURE', 'OUTCOME'];
  const truthNormalLines = [
    ['Subject transferred', 'under emergency', 'authorization.'],
    ['Adaptive Restoration', 'performed under', 'standard protocol.'],
    ['Subject missing after', 'containment failure.']
  ];
  const truthCorrectedLines = [
    ['SUBJECT 06 — MARK', 'VOLUNTARY CONSENT', 'CONFIRMED.'],
    ['ADAPTIVE RESTORATION', 'SELF-AUTHORIZED', 'PROTOCOL.'],
    ['POST-PROCEDURE:', 'MEMORY DEGRADATION.', 'IDENTITY INSTABILITY.', 'PERCEPTUAL DISTORTION.']
  ];
  const annabelleLetterBody = `Mark,

If you're reading this, you've forgotten again.

You knew what Project HOLLOW was.
You helped design the containment system.
You volunteered for the procedure because you believed it could work.

It did change you.
Just not in the way we hoped.

The memory loss came first.
Then the distortions.
You stopped recognising the rooms.
Then you stopped recognising me.

You made me promise that if you ever forgot who you were,
I would not let you leave.

You said the containment had to hold.

I stayed because I believed some part of you would remember.

If you can still understand this —
please remember me.

Annabelle`;
  const truthDesk = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.08, 0.65), shelfMat);
  truthDesk.position.set(0, 0.65, 0.05);
  hollowAlcove.add(truthDesk);
  for (const x of [-0.74, 0.74]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.57, 0.07), shelfMat);
    leg.position.set(x, 0.325, 0.24);
    hollowAlcove.add(leg);
  }
  const truthDrawer = new THREE.Group();
  truthDrawer.position.set(0, 0.45, 0.28);
  hollowAlcove.add(truthDrawer);
  const truthDrawerFront = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.26, 0.05), shelfMat);
  truthDrawerFront.position.z = 0.08;
  const truthDrawerFloor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.03, 0.36), shelfMat);
  truthDrawerFloor.position.set(0, -0.1, -0.1);
  const truthDrawerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), crestBrassMat);
  truthDrawerHandle.position.z = 0.12;
  truthDrawer.add(truthDrawerFront, truthDrawerFloor, truthDrawerHandle);
  const truthRecordDisplays = [];
  const truthRecordHits = [];
  function updateTruthRecords(corrected = gameState.visorWorn) {
    truthRecordDisplays.forEach((display, index) => {
      const selected = puzzle.truthRecordsSolved || index < puzzle.truthRecordProgress;
      const heading = `${selected ? `${index + 1}. ` : ''}${truthRecordNames[index]}`;
      display.write([heading, ...(corrected ? truthCorrectedLines[index] : truthNormalLines[index])]);
      truthRecordHits[index].userData.interact.label = `${selected ? 'Selected: ' : 'Select '}${truthRecordNames[index]}`;
    });
  }
  truthRecordNames.forEach((name, index) => {
    const x = (index - 1) * 0.56;
    const display = makeArchiveLabel(0.5, 0.48);
    display.mesh.position.set(x, 0.95, 0.24);
    hollowAlcove.add(display.mesh);
    truthRecordDisplays.push(display);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.5, 0.14), archiveHitMat);
    hit.position.copy(display.mesh.position);
    hit.userData.interact = {
      label: `Select ${name}`,
      onInteract: () => {
        if (!puzzle.correctedTrailSolved || hollowArchivePanel.position.x > -1.7 || puzzle.truthRecordsSolved) return;
        if (index !== puzzle.truthRecordProgress) {
          puzzle.truthRecordProgress = 0;
          updateTruthRecords();
          onSfx('metal_click');
          showCaption('The timeline resets.');
          return;
        }
        puzzle.truthRecordProgress++;
        showCaption((gameState.visorWorn ? truthCorrectedLines[index] : truthNormalLines[index]).join('\n'));
        if (puzzle.truthRecordProgress === 3) {
          if (!puzzle.memoryVisorCollected && !gameState.hasVisor) {
            puzzle.truthRecordProgress = 0;
            showCaption('Something about these records feels incomplete.');
          } else {
            puzzle.truthRecordsSolved = true;
            letterPaper.visible = true;
            letterHit.visible = true;
            if (!interactables.includes(letterHit)) interactables.push(letterHit);
            onSfx('latch');
            showCaption('The final records drawer unlocks.');
          }
        }
        updateTruthRecords();
      }
    };
    hollowAlcove.add(hit);
    truthRecordHits.push(hit);
    interactables.push(hit);
  });
  updateTruthRecords();

  const trailMarkerPositions = [
    [-7.46, LOFT_Y + 1.2, -3, Math.PI / 2],
    [0.3, LOFT_Y + 1.2, -5.97, 0],
    [7.46, LOFT_Y + 1.2, -4.6, -Math.PI / 2]
  ];
  const trailMarkerMaterials = [];
  function updateTrailMarkers() {
    trailMarkerMaterials.forEach((material, index) => {
      material.color.setHex(puzzle.correctedTrailSolved || index < puzzle.correctedTrailProgress ? 0x71654b : 0x39342d);
    });
  }
  trailMarkerPositions.forEach((position, index) => {
    const [x, y, z, rotation] = position;
    const material = new THREE.MeshStandardMaterial({ color: 0x39342d, roughness: 0.95 });
    trailMarkerMaterials.push(material);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.12), material);
    marker.position.set(x, y, z);
    marker.rotation.y = rotation;
    group.add(marker);
    const glyph = makeTrailSymbol(index);
    glyph.position.set(x + Math.sin(rotation) * 0.065, y, z + Math.cos(rotation) * 0.065);
    glyph.rotation.y = rotation;
    visorOnly.add(glyph);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.72, 0.24), archiveHitMat);
    hit.position.copy(marker.position);
    hit.rotation.y = rotation;
    hit.userData.interact = {
      label: 'Activate archive marker',
      onInteract: () => {
        if (puzzle.correctedTrailSolved) return;
        if (!gameState.hasVisor || !gameState.visorWorn) {
          showCaption('The marker is unreadable.');
          return;
        }
        if (index !== puzzle.correctedTrailProgress) {
          puzzle.correctedTrailProgress = 0;
          updateTrailMarkers();
          onSfx('metal_click');
          showCaption('The archive mechanism resets.');
          return;
        }
        puzzle.correctedTrailProgress++;
        onSfx('latch');
        if (puzzle.correctedTrailProgress === 3) {
          puzzle.correctedTrailSolved = true;
          interactables.push(restrictedPlaque.mesh);
          showCaption('A panel slides open in the upper archive.');
        }
        updateTrailMarkers();
      }
    };
    group.add(hit);
    interactables.push(hit);
  });

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
  letterPaper.position.set(0, -0.075, -0.1);
  letterPaper.visible = false;
  truthDrawer.add(letterPaper);

  const letterHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  letterHit.position.set(0, -0.02, -0.1);
  letterHit.visible = false;
  letterHit.userData.interact = {
    label: "Read Annabelle's letter",
    onInteract: () => {
      if (!puzzle.truthRecordsSolved || truthDrawer.position.z < 0.58) return;
      onReadLetter({
        body: annabelleLetterBody,
        onFinished: () => {
          if (puzzle.truthRecordsComplete || !puzzle.truthRecordsSolved) return;
          puzzle.truthRecordsComplete = true;
          puzzle.mirrorUnlocked = true;
          gameState.letterRead = true;
          if (!interactables.includes(mirrorGlass)) interactables.push(mirrorGlass);
          showCaption('The mirror feels different now.');
        }
      });
    }
  };
  truthDrawer.add(letterHit);

  // uncracked mirror (foreshadowing -- every other mirror in the house is broken)
  const mirrorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.6, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.6 })
  );
  mirrorFrame.position.set(4.8, 1.45, -ROOM_D / 2 + 0.05);
  group.add(mirrorFrame);
  const mirrorOuterMat = new THREE.MeshStandardMaterial({ color: 0x70532d, metalness: 0.18, roughness: 0.55 });
  const mirrorTrimGeometry = new THREE.BoxGeometry(0.16, 2.9, 0.13);
  for (const x of [-0.86, 0.86]) {
    const mirrorSide = new THREE.Mesh(mirrorTrimGeometry, mirrorOuterMat);
    mirrorSide.position.set(4.8 + x, 1.45, -ROOM_D / 2 + 0.13);
    group.add(mirrorSide);
  }
  for (const y of [0.04, 2.86]) {
    const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.18, 0.14), mirrorOuterMat);
    mirrorCap.position.set(4.8, y, -ROOM_D / 2 + 0.13);
    group.add(mirrorCap);
  }
  const mirrorPediment = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.2, 0.15), mirrorOuterMat);
  mirrorPediment.position.set(4.8, 3.02, -ROOM_D / 2 + 0.14);
  group.add(mirrorPediment);
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 2.25),
    new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 1, roughness: 0.05 })
  );
  mirrorGlass.position.set(4.8, 1.45, -ROOM_D / 2 + 0.1);
  mirrorGlass.userData.interact = {
    label: 'Look into the mirror',
    onInteract: async () => {
      if (!puzzle.mirrorUnlocked) {
        showCaption("The reflection won't settle.");
        return;
      }
      if (puzzle.mirrorRevealed || puzzle.mirrorRevealInProgress) return;
      const generation = ++mirrorRevealGeneration;
      puzzle.mirrorRevealInProgress = true;
      try {
        const completed = await onLookInMirror();
        if (generation !== mirrorRevealGeneration) return;
        if (!completed) {
          annabelle.visible = false;
          return;
        }
        puzzle.mirrorRevealed = true;
        annabelle.visible = true;
        hollowOverrideKey.visible = !puzzle.hasHollowOverrideKey;
        hollowOverrideKeyHit.visible = !puzzle.hasHollowOverrideKey;
        if (!puzzle.hasHollowOverrideKey && !interactables.includes(hollowOverrideKeyHit)) {
          interactables.push(hollowOverrideKeyHit);
        }
        mirrorGlass.userData.interact.label = 'The reflection is still';
      } finally {
        if (generation === mirrorRevealGeneration) puzzle.mirrorRevealInProgress = false;
      }
    }
  };
  group.add(mirrorGlass);

  // Temporary injured Annabelle, tucked under the loft in the planned corner.
  // Bent knees and a slumped torso communicate the pose without another rig.
  const annabelle = new THREE.Group();
  annabelle.name = 'Annabelle_Injured_Graybox';
  annabelle.position.set(-4.2, 0, -4.2);
  annabelle.rotation.y = -Math.PI / 2;
  annabelle.visible = false;
  group.add(annabelle);
  // The GLB is authored at metre scale, floor-centred, facing +Z into the study.
  // Keep Annabelle's position and the existing collision footprint unchanged.
  const concealmentChair = new THREE.Group();
  concealmentChair.name = 'Annabelle_Wingback_Chair';
  concealmentChair.position.set(-4.65, 0, -3.45);
  concealmentChair.scale.setScalar(1);
  concealmentChair.rotation.y = 0;
  group.add(concealmentChair);
  loadModel(annabelleChairUrl).then((model) => {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    concealmentChair.add(model);
  }).catch((error) => console.warn('Annabelle chair could not load:', error));
  colliders.push({ minX: -5.225, maxX: -4.075, minZ: -3.89, maxZ: -3.025, minY: 0, maxY: 1.6 });
  const annabelleCoatMat = new THREE.MeshStandardMaterial({ color: 0x5d5148, roughness: 1 });
  const annabelleSkinMat = new THREE.MeshStandardMaterial({ color: 0x9d8271, roughness: 0.95 });
  const annabelleTorso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.22), annabelleCoatMat);
  annabelleTorso.position.set(0, 0.66, 0.04);
  annabelleTorso.rotation.x = 0.35;
  annabelle.add(annabelleTorso);
  const annabelleHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), annabelleSkinMat);
  annabelleHead.scale.set(0.85, 1.1, 0.9);
  annabelleHead.position.set(0, 0.98, -0.09);
  annabelleHead.rotation.z = -0.2;
  annabelle.add(annabelleHead);
  const limbGeometry = new THREE.CylinderGeometry(0.055, 0.06, 1, 7);
  function addAnnabelleLimb(from, to, material) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const limb = new THREE.Mesh(limbGeometry, material);
    limb.position.copy(a).add(b).multiplyScalar(0.5);
    limb.scale.y = a.distanceTo(b);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    annabelle.add(limb);
  }
  for (const side of [-1, 1]) {
    addAnnabelleLimb([side * 0.12, 0.46, 0.06], [side * 0.2, 0.28, -0.28], annabelleCoatMat);
    addAnnabelleLimb([side * 0.2, 0.28, -0.28], [side * 0.2, 0.07, -0.02], annabelleCoatMat);
    addAnnabelleLimb([side * 0.2, 0.83, -0.02], [side * 0.22, 0.53, -0.13], annabelleCoatMat);
    addAnnabelleLimb([side * 0.22, 0.53, -0.13], [side * 0.07, 0.55, -0.23], annabelleSkinMat);
  }

  const hollowOverrideKey = new THREE.Group();
  hollowOverrideKey.name = 'HollowOverrideKey';
  hollowOverrideKey.position.set(-3.55, 0.055, -3.85);
  hollowOverrideKey.rotation.x = -Math.PI / 2;
  hollowOverrideKey.visible = false;
  const overrideBow = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 6, 12), keyMat);
  const overrideShaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.025), keyMat);
  overrideShaft.position.y = -0.14;
  const overrideBit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.025), keyMat);
  overrideBit.position.set(0.025, -0.22, 0);
  hollowOverrideKey.add(overrideBow, overrideShaft, overrideBit);
  group.add(hollowOverrideKey);
  const hollowOverrideKeyHit = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.48), archiveHitMat);
  hollowOverrideKeyHit.position.set(-3.55, 0.12, -3.85);
  hollowOverrideKeyHit.visible = false;
  hollowOverrideKeyHit.userData.interact = {
    label: 'Take the HOLLOW OVERRIDE KEY',
    onInteract: () => {
      if (!puzzle.mirrorRevealed || puzzle.hasHollowOverrideKey) return;
      puzzle.hasHollowOverrideKey = true;
      gameState.inventory.add('hollowOverrideKey');
      hollowOverrideKey.visible = false;
      hollowOverrideKeyHit.visible = false;
      const index = interactables.indexOf(hollowOverrideKeyHit);
      if (index >= 0) interactables.splice(index, 1);
      onSfx('keys_pickup');
      showCaption('HOLLOW OVERRIDE KEY ACQUIRED');
    }
  };
  group.add(hollowOverrideKeyHit);

  // The final front door is controlled by the Override Key sockets only.
  const frontDoor = new THREE.Group();
  frontDoor.position.set(DOOR_X, 0, ROOM_D / 2 - 0.05);
  group.add(frontDoor);

  const doorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 2.1, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x2c2015, roughness: 0.75 })
  );
  doorSlab.position.y = 1.05;
  frontDoor.add(doorSlab);

  // No legacy lock objects or interaction volumes remain on the door.
  const frontDoorSlabHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 2.1, 0.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  frontDoorSlabHit.position.set(-0.1, 1.05, 0.05);
  frontDoorSlabHit.userData.interact = {
    label: 'The front door',
    onInteract: () => {
      showCaption(puzzle.endingChoice === 'RELEASE'
        ? 'The exit is open. Walk through.'
        : puzzle.endingChoice === 'RESEALED'
          ? 'Containment is permanently sealed.'
          : 'Emergency release requires the HOLLOW OVERRIDE KEY.');
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
   * The door's panelling -- three rows of raised panels, and the security
   * code for Level 2's metal door.
   *
   * The player counted these rows off camera four before they ever got here.
   * This and the CCTV painter both read `DOOR_PANEL_ROWS` and both lay their
   * panels out with `getPanelSpans()`, so the door they were shown and the
   * door they finally stand in front of cannot disagree -- not in count and
   * not in rhythm.
   *
   * CHILDREN OF THE SLAB, not of `frontDoor`. The panels are the door; they
   * swing with it. The locks are children of `frontDoor` instead, because
   * those are bolts seated in the frame and stay where they are.
   *
   * Layout: the slab is 1.05 x 2.1 centred on its own origin. The panel field
   * takes the left 62% and the lock stile the right, which is how real
   * joinery does it -- a lock goes through the stile, never through a panel --
   * and which also keeps the lock bodies at x = +0.35 clear of every panel a
   * player has to count.
   */
  const PANEL_FIELD_WIDTH_FRACTION = 0.62;
  const SLAB_W = 1.05;
  const SLAB_H = 2.1;
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x33261a, roughness: 0.8 });

  {
    const fieldW = SLAB_W * PANEL_FIELD_WIDTH_FRACTION;
    const fieldX = -SLAB_W / 2 + SLAB_W * 0.06;   // left margin, in slab space
    const rowPitch = (SLAB_H * 0.9) / DOOR_PANEL_ROWS.length;
    const rowH = rowPitch * 0.68;
    const fieldTop = (SLAB_H * 0.9) / 2;

    DOOR_PANEL_ROWS.forEach((count, row) => {
      const rowCentreY = fieldTop - rowPitch * (row + 0.5);
      for (const span of getPanelSpans(count)) {
        // Proud of the slab rather than recessed into it: a raised panel
        // catches the study's lamp along its top edge, which is what makes it
        // legible as a separate rectangle from across the room. A recess
        // would read as shadow and merge with its neighbours.
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(span.width * fieldW, rowH, 0.014),
          panelMat
        );
        panel.position.set(
          fieldX + (span.x + span.width / 2) * fieldW,
          rowCentreY,
          -0.042
        );
        doorSlab.add(panel);
      }
    });
  }

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

  // One physical key, two irreversible sockets. The state is committed before
  // any callback, so repeated inputs cannot spend the key twice.
  const overrideSockets = [];
  const resealBolts = new THREE.Group();
  resealBolts.visible = false;
  frontDoor.add(resealBolts);
  for (const y of [0.45, 1.05, 1.65]) {
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.08), alcoveMat);
    bolt.position.set(0, y, -0.13);
    resealBolts.add(bolt);
  }
  function startCommittedEnding() {
    if (puzzle.endingChoice === 'NONE' || puzzle.endingSequenceStarted) return;
    puzzle.endingSequenceStarted = true;
    onChooseEnding(puzzle.endingChoice === 'RELEASE' ? 'released' : 'contained');
  }
  function updateOverrideLabels(corrected = gameState.visorWorn) {
    overrideSockets.forEach(({ display, choice }) => {
      display.write(corrected
        ? choice === 'RELEASE'
          ? ['OVERRIDE FUNCTION:', 'RELEASE ALL', 'CONTAINMENT LOCKS']
          : ['OVERRIDE FUNCTION:', 'PERMANENT', 'MANUAL RESEAL']
        : choice === 'RELEASE' ? ['EMERGENCY RELEASE'] : ['CONTAINMENT RESEAL', 'MANUAL LOCKDOWN']);
    });
  }
  function commitOverride(choice, socket) {
    if (puzzle.endingChoice !== 'NONE' || gameState.endingChosen) return;
    if (!puzzle.mirrorRevealed || !gameState.inventory.has('hollowOverrideKey')) {
      showCaption('A HOLLOW OVERRIDE KEY is required.');
      return;
    }
    puzzle.endingChoice = choice;
    gameState.inventory.delete('hollowOverrideKey');
    socket.installedKey.visible = true;
    for (const { hit } of overrideSockets) {
      const index = interactables.indexOf(hit);
      if (index >= 0) interactables.splice(index, 1);
    }
    // The new sockets replace the old porch choices completely.
    onSfx('latch');
    if (choice === 'RELEASE') {
      doorState.open = true;
      setDoorSolid(false);
      onDoorOpening(frontDoor.getWorldPosition(new THREE.Vector3()));
      showCaption('Emergency release engaged. Walk through the front exit.');
    } else {
      doorState.open = false;
      setDoorSolid(true);
      resealBolts.visible = true;
      resealBolts.scale.x = 0.05;
      startCommittedEnding();
    }
  }
  for (const [choice, x, z, rotation] of [
    ['RELEASE', 1.55, 6.34, Math.PI],
    ['RESEALED', 6.35, -6.32, 0]
  ]) {
    const socketGroup = new THREE.Group();
    socketGroup.position.set(x, 1.35, z);
    socketGroup.rotation.y = rotation;
    group.add(socketGroup);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), archiveCabinetMat);
    const keyway = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.015), crestBrassMat);
    keyway.position.z = 0.04;
    socketGroup.add(plate, keyway);
    const installedKey = hollowOverrideKey.clone();
    installedKey.position.set(0, 0.03, 0.09);
    installedKey.rotation.set(0, 0, 0);
    installedKey.scale.setScalar(0.75);
    installedKey.visible = false;
    socketGroup.add(installedKey);
    const display = makeArchiveLabel(1.05, 0.42);
    display.mesh.position.set(0, 0.5, 0.045);
    socketGroup.add(display.mesh);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.58, 0.18), archiveHitMat);
    hit.position.z = 0.06;
    const socket = { choice, display, hit, installedKey };
    hit.userData.interact = {
      get label() {
        const action = choice === 'RELEASE' ? 'Emergency Release' : 'Manual Reseal';
        return puzzle.mirrorRevealed && gameState.inventory.has('hollowOverrideKey')
          ? `Use Override Key — ${action}` : `Override socket — ${action}`;
      },
      onInteract: () => commitOverride(choice, socket)
    };
    socketGroup.add(hit);
    interactables.push(hit);
    overrideSockets.push(socket);
  }
  updateOverrideLabels();

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
  // The existing porch fence remains static scenery/collision.
  const gateCollider = {
    minX: DOOR_X - 1.4, maxX: DOOR_X + 1.4,
    minZ: ROOM_D / 2 + PORCH_D - 0.12, maxZ: ROOM_D / 2 + PORCH_D + 0.05
  };
  colliders.push(gateCollider);
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
  const SHELL_H = ROOM_H + 0.4;
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
    groundAt,
    // Just inside the new right-side entry, looking across the desk toward
    // the open study and loft rather than into the wall or final exit.
    spawn: [6.9, 4.8],
    spawnYaw: Math.PI / 2,
    refs: {
      lamp,
      doorLamp,
      entryDoor,
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
        distortedTrail.visible = !on;
        updateTruthRecords(on);
        updateOverrideLabels(on);
        annabelleCoatMat.color.setHex(on ? 0x5d5148 : 0x29232b);
        annabelleSkinMat.color.setHex(on ? 0x9d8271 : 0x4c414b);
      },
      visorGroup,
      visorHitbox,
      visorOnly,
      letterHit,
      exterior,
      /** Where Annabelle stands once the letter has been read. */
      annabelleSpot: [-4.2, -4.2],
      annabelle,
      mirrorGlass,
      revealAnnabelle() {
        if (puzzle.mirrorRevealInProgress || puzzle.mirrorRevealed) annabelle.visible = true;
      },
      hollowOverrideKey,
      overrideSockets,
      puzzle,
      doorState,
      frontDoorSlabHit,
      drawer,
      clock,
      clockDrawer,
      archiveToken,
      shadowCrest,
      archiveKey,
      memoryArchive,
      hollowArchivePanel,
      truthDrawer
    },
    /**
     * Absent until now, which is why a restart left this level with its locks
     * thrown, its drawer open and its front door standing wide.
     */
    reset() {
      puzzle.clockHour = 10;
      puzzle.clockMinute = 0;
      puzzle.clockSolved = false;
      puzzle.hasArchiveToken = false;
      setClockHands();
      clockDrawer.position.x = 0.24;
      archiveToken.visible = false;
      archiveTokenHitbox.visible = false;
      const tokenIndex = interactables.indexOf(archiveTokenHitbox);
      if (tokenIndex >= 0) interactables.splice(tokenIndex, 1);
      gameState.inventory.delete('archiveToken');
      puzzle.crestSigilInserted = false;
      puzzle.crestLampStates.fill(0);
      puzzle.crestSolved = false;
      puzzle.hasArchiveKey = false;
      installedSigil.visible = false;
      crestCover.position.x = 0;
      archiveKey.visible = false;
      archiveKeyHit.visible = false;
      gameState.inventory.delete('archiveKey');
      if (!interactables.includes(crestHit)) interactables.push(crestHit);
      for (const hit of [...crestLampHits, archiveKeyHit]) {
        const index = interactables.indexOf(hit);
        if (index >= 0) interactables.splice(index, 1);
      }
      updateCrestShadows();
      puzzle.memoryArchiveUnlocked = false;
      puzzle.memoryRecordSelections.fill(0);
      puzzle.memoryArchiveSolved = false;
      puzzle.memoryVisorCollected = false;
      memoryContents.visible = false;
      archiveDoorHinge.position.x = -1.55;
      visorCompartmentCover.position.x = 0;
      for (const hit of memoryRecordHits) {
        const index = interactables.indexOf(hit);
        if (index >= 0) interactables.splice(index, 1);
      }
      if (!interactables.includes(archiveCabinetHit)) interactables.push(archiveCabinetHit);
      updateMemoryRecords();
      frontDoorSlabHit.userData.interact.label = 'The front door';
      doorState.open = false;
      doorHinge.rotation.y = 0;
      setDoorSolid(true);
      portraitMat.map = portraitTexPlain;
      portraitMat.needsUpdate = true;

      visorOnly.visible = false;
      distortedTrail.visible = true;
      puzzle.correctedTrailProgress = 0;
      puzzle.correctedTrailSolved = false;
      hollowArchivePanel.position.x = 0;
      updateTrailMarkers();
      const restrictedIndex = interactables.indexOf(restrictedPlaque.mesh);
      if (restrictedIndex >= 0) interactables.splice(restrictedIndex, 1);
      puzzle.truthRecordProgress = 0;
      puzzle.truthRecordsSolved = false;
      puzzle.truthRecordsComplete = false;
      puzzle.mirrorUnlocked = false;
      mirrorRevealGeneration++;
      puzzle.mirrorRevealInProgress = false;
      puzzle.mirrorRevealed = false;
      puzzle.hasHollowOverrideKey = false;
      puzzle.endingChoice = 'NONE';
      puzzle.endingSequenceStarted = false;
      resealBolts.visible = false;
      resealBolts.scale.x = 1;
      for (const { hit, installedKey } of overrideSockets) {
        installedKey.visible = false;
        if (!interactables.includes(hit)) interactables.push(hit);
      }
      updateOverrideLabels(false);
      annabelle.visible = false;
      hollowOverrideKey.visible = false;
      hollowOverrideKeyHit.visible = false;
      gameState.inventory.delete('hollowOverrideKey');
      const overrideIndex = interactables.indexOf(hollowOverrideKeyHit);
      if (overrideIndex >= 0) interactables.splice(overrideIndex, 1);
      mirrorGlass.userData.interact.label = 'Look into the mirror';
      truthDrawer.position.z = 0.28;
      letterPaper.visible = false;
      letterHit.visible = false;
      for (const hit of [letterHit, mirrorGlass]) {
        const index = interactables.indexOf(hit);
        if (index >= 0) interactables.splice(index, 1);
      }
      updateTruthRecords(false);
      visorGroup.visible = false;
      visorHitbox.visible = false;
      const visorIndex = interactables.indexOf(visorHitbox);
      if (visorIndex >= 0) interactables.splice(visorIndex, 1);
      gate.rotation.y = 0;
    },

    update(dt) {
      if (resealBolts.visible) resealBolts.scale.x += (1 - resealBolts.scale.x) * Math.min(1, dt * 5);
      if (puzzle.endingChoice === 'RELEASE' && !puzzle.endingSequenceStarted && doorHinge.rotation.y < -0.8) {
        const position = getPlayerPosition();
        if (position && Math.abs(position.x - DOOR_X) < DOORWAY_W / 2
          && position.z >= frontZ + 0.2 && position.y < 2.5) startCommittedEnding();
      }
      const truthDrawerTarget = puzzle.truthRecordsSolved ? 0.7 : 0.28;
      truthDrawer.position.z += (truthDrawerTarget - truthDrawer.position.z) * Math.min(1, dt * 5);
      const hollowPanelTarget = puzzle.correctedTrailSolved ? -1.95 : 0;
      hollowArchivePanel.position.x += (hollowPanelTarget - hollowArchivePanel.position.x) * Math.min(1, dt * 3);
      const archiveDoorTarget = puzzle.memoryArchiveUnlocked ? 1.65 : -1.55;
      archiveDoorHinge.position.x += (archiveDoorTarget - archiveDoorHinge.position.x) * Math.min(1, dt * 5);
      const visorCoverTarget = puzzle.memoryArchiveSolved ? 0.78 : 0;
      visorCompartmentCover.position.x += (visorCoverTarget - visorCompartmentCover.position.x) * Math.min(1, dt * 5);
      // The drawer slides, and the door swings. Eased rather than snapped, the
      // same treatment the bedroom's door and corkboard get.
      const clockDrawerTargetX = 0.24 + (puzzle.clockSolved ? 0.28 : 0);
      clockDrawer.position.x += (clockDrawerTargetX - clockDrawer.position.x) * Math.min(1, dt * 6);
      const crestTargetX = puzzle.crestSolved ? 2.05 : 0;
      crestCover.position.x += (crestTargetX - crestCover.position.x) * Math.min(1, dt * 5);
      const doorTarget = doorState.open ? DOOR_OPEN_SWING : 0;
      doorHinge.rotation.y += (doorTarget - doorHinge.rotation.y) * Math.min(1, dt * 2.6);
    }
  };
}
