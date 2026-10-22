import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createVisorGallery } from './studyVisorGallery.js';
import { createStudyDecor } from './studyDecor.js';
import { createStudySurfaces } from './studySurfaces.js';
import { createClockMechanism } from './clockMechanism.js';
import { createArchivePresentation, createArchiveRecord, buildArchiveVisor, createVisorGlassMap } from './studyArchivePresentation.js';
import { addStudyFootprints } from './studyFootprints.js';
import { addStudyArchitectureTrim } from './studyArchitectureTrim.js';
import { createStudyExterior } from './studyExterior.js';
import { hingeMotion, studyLabel, dressCrestControl, createCrestIndicatorGeometry, createCrestPanelCollision, fillStudyKey, dressStudyDoor, batchStudyPuzzleDetails } from './studyPuzzlePresentation.js';
import { loadModel } from '../world/modelLoader.js';
import annabelleChairUrl from '../assets/models/study/annabelle_wingback_chair.glb?url';
import centralDeskUrl from '../assets/models/study/central_victorian_desk.glb?url';
import archiveCabinetUrl from '../assets/models/study/victorian_archive_cabinet.glb?url';
import grandfatherClockUrl from '../assets/models/study/victorian_grandfather_clock.glb?url';
import victorianMirrorUrl from '../assets/models/study/victorian_full_length_mirror.glb?url';
import victorianFireplaceUrl from '../assets/models/study/victorian_fireplace.glb?url';
import shadowCrestHousingUrl from '../assets/models/study/shadow_crest_housing.glb?url';
import emergencyReleasePanelUrl from '../assets/models/study/emergency_release_panel.glb?url';
import manualResealPanelUrl from '../assets/models/study/manual_reseal_panel.glb?url';
import {
  createFamilyPhotoTexture,
  createRugTexture
} from '../world/textures.js';
import { makeHandle } from '../world/trim.js';
import { DOOR_PANEL_ROWS, getPanelSpans } from '../world/doorPanels.js';
import { gameState } from '../core/GameState.js';
import { createHiddenWritingTexture } from '../world/textures.js';
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

  const studySurfaces = createStudySurfaces();
  const loadStudyModel = (url) => loadModel(url).then(model => studySurfaces.harmoniseAsset(
    model, url === archiveCabinetUrl || url === annabelleChairUrl ? 'builtIn' : 'feature'
  ));
  const floorTex = studySurfaces.floorMap;
  const wallTex = studySurfaces.wallMap;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: floorTex, roughnessMap: studySurfaces.floorRoughness, roughness: 1, envMapIntensity: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  studySurfaces.floorSurface(floor);
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: studySurfaces.ceilingMap,
      roughnessMap: studySurfaces.wallRoughness, color: 0xd9d0c0, roughness: 1, envMapIntensity: 0.15 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  ceiling.geometry.attributes.uv.array.forEach((value, i, array) => { array[i] = value * (i % 2 ? ROOM_D : ROOM_W) / 4; });
  group.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughnessMap: studySurfaces.wallRoughness, color: 0xbbb4a7, roughness: 1, vertexColors: true });
  const wallGeometry = (w, h) => new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / 1.6)), Math.max(1, Math.ceil(h / 0.32)));
  function wall(w, x, z, ry) {
    const m = new THREE.Mesh(wallGeometry(w, ROOM_H), wallMat);
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
      const m = new THREE.Mesh(wallGeometry(w, ROOM_H), wallMat);
      m.position.set(x, ROOM_H / 2, frontZ);
      m.rotation.y = Math.PI;
      group.add(m);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: frontZ - 0.15, maxZ: frontZ + 0.1 });
    }
    const lintel = new THREE.Mesh(
      wallGeometry(DOORWAY_W, ROOM_H - DOORWAY_H), wallMat
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
      const section = new THREE.Mesh(wallGeometry(length, ROOM_H), wallMat);
      section.position.set(rightX, ROOM_H / 2, z);
      section.rotation.y = -Math.PI / 2;
      group.add(section);
      colliders.push({ minX: rightX - 0.15, maxX: rightX + 0.1, minZ: z - length / 2, maxZ: z + length / 2 });
    }
    const lintel = new THREE.Mesh(wallGeometry(ENTRY_DOOR_W, ROOM_H - ENTRY_DOOR_H), wallMat);
    lintel.position.set(rightX, ENTRY_DOOR_H + (ROOM_H - ENTRY_DOOR_H) / 2, ENTRY_DOOR_Z);
    lintel.rotation.y = -Math.PI / 2;
    group.add(lintel);

    entryDoor = new THREE.Group();
    entryDoor.position.set(rightX - 0.06, ENTRY_DOOR_H / 2, ENTRY_DOOR_Z);
    const doorSlab = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, ENTRY_DOOR_H, ENTRY_DOOR_W),
      studySurfaces.woodMaterial(0.86, 'trim')
    );
    entryDoor.add(doorSlab);
    group.add(entryDoor);
    colliders.push({
      minX: rightX - 0.15,
      maxX: rightX + 0.1,
      minZ: ENTRY_DOOR_Z - ENTRY_DOOR_W / 2,
      maxZ: ENTRY_DOOR_Z + ENTRY_DOOR_W / 2
    });
  }

  // Deep stained casings make both openings read as part of the old house,
  // while leaving the authored slabs, hinges and collision untouched.
  const trimMat = studySurfaces.woodMaterial(0.86, 'trim');
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

  // The rear archive is a real second storey, leaving the front
  // half of the study open to the full ceiling height.
  const balconyMat = studySurfaces.woodMaterial(0.82);
  // Compact straight-grained architectural walnut stays independent of furniture UVs.
  const architectureWoodMat = studySurfaces.woodMaterial(0.96);
  const handrailWoodMat = studySurfaces.woodMaterial(0.78, 'trim');
  const treadWoodMat = studySurfaces.woodMaterial(1.02, 'trim');
  const stairWoodMat = studySurfaces.woodMaterial(0.92, 'trim');
  const newelShaftGeometry = new RoundedBoxGeometry(0.13, 1.08, 0.13, 1, 0.006);
  const newelFootGeometry = new RoundedBoxGeometry(0.18, 0.13, 0.18, 1, 0.006);
  const newelCapGeometry = new RoundedBoxGeometry(0.19, 0.055, 0.19, 1, 0.008);
  const newelFinialGeometry = new THREE.SphereGeometry(0.055, 8, 6);
  const balusterGeometry = new THREE.LatheGeometry([
    [0.022, 0], [0.022, 0.08], [0.015, 0.13], [0.017, 0.36],
    [0.023, 0.43], [0.016, 0.51], [0.014, 0.70], [0.022, 0.77], [0.022, 0.84]
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), 8);
  const architectureMatrix = new THREE.Matrix4();
  const architectureRotation = new THREE.Quaternion();
  const architecturePosition = new THREE.Vector3();
  const architectureScale = new THREE.Vector3();
  function addTimber(geometry, x, y, z, material = architectureWoodMat) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function addNewel(x, floorY, z) {
    addTimber(newelShaftGeometry, x, floorY + 0.54, z, handrailWoodMat);
    addTimber(newelFootGeometry, x, floorY + 0.065, z, handrailWoodMat);
    addTimber(newelCapGeometry, x, floorY + 1.095, z, handrailWoodMat);
    addTimber(newelFinialGeometry, x, floorY + 1.165, z, handrailWoodMat);
  }
  function addTimberRail(from, to, width = 0.085, depth = 0.075) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mesh = addTimber(new RoundedBoxGeometry(width, a.distanceTo(b), depth, 1, 0.008), 0, 0, 0, handrailWoodMat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return mesh;
  }
  function addBalusters(placements) {
    const mesh = new THREE.InstancedMesh(balusterGeometry, handrailWoodMat, placements.length);
    placements.forEach(([x, bottom, z, height], index) => {
      architecturePosition.set(x, bottom, z);
      architectureScale.set(1, height / 0.84, 1);
      architectureMatrix.compose(architecturePosition, architectureRotation, architectureScale);
      mesh.setMatrixAt(index, architectureMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const loftWidth = ROOM_W;
  const loftFrontZ = -ROOM_D / 2 + LOFT_D;
  const loft = new THREE.Mesh(new THREE.BoxGeometry(loftWidth, 0.28, LOFT_D), balconyMat);
  loft.position.set(0, LOFT_Y - 0.14, -ROOM_D / 2 + LOFT_D / 2);
  loft.receiveShadow = true;
  group.add(loft);

  function addRailing(length, x, z, alongX) {
    const railHeight = 1.05;
    const at = (offset, height) => [x + (alongX ? offset : 0), height, z + (alongX ? 0 : offset)];
    addTimberRail(at(-length / 2, LOFT_Y + railHeight), at(length / 2, LOFT_Y + railHeight));
    addTimberRail(at(-length / 2, LOFT_Y + 0.13), at(length / 2, LOFT_Y + 0.13), 0.065, 0.055);
    const postSpan = length - 0.20;
    const bays = Math.ceil(postSpan / 2.4);
    for (let index = 0; index <= bays; index++) {
      const [postX, , postZ] = at(-postSpan / 2 + postSpan * index / bays, LOFT_Y);
      addNewel(postX, LOFT_Y, postZ);
    }
    const balusters = [];
    const count = Math.ceil((length - 0.26) / 0.15);
    for (let index = 0; index <= count; index++) {
      const offset = -(length - 0.26) / 2 + (length - 0.26) * index / count;
      // Let the thicker structural posts occupy their own bays.
      if (Array.from({ length: bays + 1 }, (_, i) => -postSpan / 2 + postSpan * i / bays)
        .some((post) => Math.abs(offset - post) < 0.11)) continue;
      const [bx, , bz] = at(offset, LOFT_Y);
      balusters.push([bx, LOFT_Y + 0.165, bz, 0.84]);
    }
    addBalusters(balusters);
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
  studySurfaces.floorSurface(loft, balconyMat);
  studySurfaces.floorSurface(loftLanding, balconyMat);
  addStudyArchitectureTrim(group, trimMat, {
    width: ROOM_W, depth: ROOM_D, height: ROOM_H, loftY: LOFT_Y,
    loftFrontZ, stairTopZ, entryZ: ENTRY_DOOR_Z, entryWidth: ENTRY_DOOR_W, exitWidth: DOORWAY_W
  });
  // A single front rail stops before the stair opening.
  const loftRailEndX = stairX - stairHalfWidth + 0.1;
  addRailing(loftRailEndX + loftWidth / 2, (loftRailEndX - loftWidth / 2) / 2, loftFrontZ, true);
  const galleryLength = loftRailEndX + loftWidth / 2;
  const galleryCentreX = (loftRailEndX - loftWidth / 2) / 2;
  // Cover the slab edge within its existing depth, with a shallow base bead and floor lip.
  addTimber(new THREE.BoxGeometry(galleryLength, 0.25, 0.12), galleryCentreX, LOFT_Y - 0.14, loftFrontZ + 0.055);
  addTimber(new RoundedBoxGeometry(galleryLength, 0.045, 0.14, 1, 0.007), galleryCentreX, LOFT_Y - 0.265, loftFrontZ + 0.05);
  addTimber(new RoundedBoxGeometry(galleryLength, 0.04, 0.13, 1, 0.006), galleryCentreX, LOFT_Y - 0.02, loftFrontZ + 0.05);
  const cutoutLength = loftFrontZ - stairTopZ;
  addTimber(new THREE.BoxGeometry(0.10, 0.25, cutoutLength), loftMainRightX, LOFT_Y - 0.14, (loftFrontZ + stairTopZ) / 2);
  addTimber(new THREE.BoxGeometry(stairWidth, 0.25, 0.10), stairX, LOFT_Y - 0.14, stairTopZ - 0.025);

  // Stair sides remain solid while groundAt() supplies the walkable rise.
  // The loft rail above has vertical bounds so the ground floor stays open.
  const railingThickness = 0.12;
  colliders.push(
    { minX: stairX - stairHalfWidth - railingThickness, maxX: stairX - stairHalfWidth + railingThickness, minZ: stairTopZ, maxZ: stairBottomZ },
    { minX: stairX + stairHalfWidth - railingThickness, maxX: stairX + stairHalfWidth + railingThickness, minZ: stairTopZ, maxZ: stairBottomZ }
  );

  // Human-scale steps along the right wall: 0.19 m rise, 0.28 m tread.
  const stairGeometry = new THREE.BoxGeometry(stairWidth, 1, stairDepth);
  const treadGeometry = new RoundedBoxGeometry(stairWidth - 0.04, 0.055, stairDepth + 0.04, 1, 0.008);
  const riserGeometry = new THREE.BoxGeometry(stairWidth - 0.07, stairRise - 0.015, 0.022);
  for (let index = 0; index < stairCount; index++) {
    const stepHeight = stairRise * (index + 1);
    const step = new THREE.Mesh(stairGeometry, stairWoodMat);
    step.scale.y = stepHeight;
    step.position.set(stairX, stepHeight / 2, stairBottomZ - stairDepth * (index + 0.5));
    step.receiveShadow = true;
    group.add(step);
    const tread = new THREE.Mesh(treadGeometry, treadWoodMat);
    tread.position.set(stairX, stepHeight + 0.028, step.position.z + 0.015);
    tread.receiveShadow = true;
    group.add(tread);
    addTimber(riserGeometry, stairX, stepHeight - stairRise / 2, stairBottomZ - stairDepth * index + 0.012, stairWoodMat);
  }
  const stringerLength = Math.hypot(stairRun, LOFT_Y);
  const stringerAngle = Math.atan2(LOFT_Y, stairRun);
  const stringerGeometry = new THREE.BoxGeometry(0.12, 0.25, stringerLength);
  const wallSkirtGeometry = new THREE.BoxGeometry(0.035, 0.28, stringerLength);
  for (const side of [-1, 1]) {
    const wallSide = side === 1;
    const stringer = addTimber(wallSide ? wallSkirtGeometry : stringerGeometry,
      wallSide ? ROOM_W / 2 - 0.018 : stairX - stairHalfWidth + 0.05,
      LOFT_Y / 2 + 0.025, (stairBottomZ + stairTopZ) / 2, stairWoodMat);
    stringer.rotation.x = stringerAngle;
  }
  const stairRailX = stairX - stairHalfWidth + 0.05;
  addNewel(stairRailX, 0, stairBottomZ);
  addNewel(stairRailX, LOFT_Y, stairTopZ);
  addTimberRail([stairRailX, 0.98, stairBottomZ], [stairRailX, LOFT_Y + 0.98, stairTopZ]);
  const stairBalusters = [];
  for (let index = 0; index < stairCount; index++) {
    for (const fraction of [0.25, 0.75]) {
      const progress = (index + fraction) / stairCount;
      const bottom = stairRise * (index + 1) + 0.0555;
      const top = LOFT_Y * progress + 0.94;
      stairBalusters.push([stairRailX, bottom, stairBottomZ - stairRun * progress, top - bottom]);
    }
  }
  addBalusters(stairBalusters);
  // Return the gallery handrail to the stair head, leaving the full landing opening clear.
  addTimberRail([stairRailX, LOFT_Y + 1.05, stairTopZ], [stairRailX, LOFT_Y + 1.05, loftFrontZ]);
  addTimberRail([stairRailX, LOFT_Y + 0.13, stairTopZ], [stairRailX, LOFT_Y + 0.13, loftFrontZ], 0.065, 0.055);
  const returnBalusters = [];
  const returnCount = Math.ceil(cutoutLength / 0.15);
  for (let index = 1; index < returnCount; index++) {
    returnBalusters.push([stairRailX, LOFT_Y + 0.165, stairTopZ + cutoutLength * index / returnCount, 0.84]);
  }
  addBalusters(returnBalusters);
  // A matching wall handrail is anchored by three small timber brackets.
  const wallRailX = ROOM_W / 2 - 0.065;
  addTimberRail([wallRailX, 0.98, stairBottomZ], [wallRailX, LOFT_Y + 0.98, stairTopZ], 0.055, 0.055);
  const bracketGeometry = new THREE.BoxGeometry(0.07, 0.06, 0.06);
  for (const progress of [0.15, 0.5, 0.85]) {
    addTimber(bracketGeometry, ROOM_W / 2 - 0.035, LOFT_Y * progress + 0.94, stairBottomZ - stairRun * progress);
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
  // Metre-scale GLB, with its writing side facing the existing chair (+Z).
  const desk = new THREE.Group();
  desk.name = 'Central_Victorian_Desk';
  desk.position.set(0, 0, 1.35);
  desk.rotation.y = 0;
  desk.scale.setScalar(1);
  group.add(desk);
  loadStudyModel(centralDeskUrl).then((model) => {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    desk.add(model);
  }).catch((error) => console.warn('Central study desk could not load:', error));
  colliders.push({
    minX: desk.position.x - 0.94, maxX: desk.position.x + 0.94,
    minZ: desk.position.z - 0.45, maxZ: desk.position.z + 0.45,
    minY: 0, maxY: 0.79
  });

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

  // Preserve the decorative drawer reference; its visible geometry is in the GLB.
  const drawer = new THREE.Group();
  drawer.position.set(0.651, 0.552, 0.374);
  desk.add(drawer);

  // Shared brass material for the new Override Key reward.
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x978258, metalness: 0.72, roughness: 0.66 });

  // desk chair, tucked in
  const chairMat = studySurfaces.woodMaterial(0.90, 'feature');
  const chairGroup = new THREE.Group();
  chairGroup.position.set(0, 0, 1.9);
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

  // Puzzle 1: the longcase clock faces into the study from the existing left-wall bay.
  const clockX = -7.74;
  const clockZ = 4.35;
  const clock = new THREE.Group();
  clock.name = 'IncidentClock';
  clock.position.set(clockX, 0, clockZ);
  group.add(clock);

  const clockWoodMat = studySurfaces.woodMaterial(0.82, 'feature');
  const clockHandMat = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.75 });
  // The GLB supplies only the static case/dial. Its authored +Z faces into +X here.
  loadStudyModel(grandfatherClockUrl).then((model) => {
    model.rotation.y = Math.PI / 2;
    model.getObjectByName('Clock_Reward_Service_Panel').visible = false;
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    clock.add(model);
  }).catch((error) => console.warn('Grandfather clock could not load:', error));

  const clockHands = new THREE.Group();
  clockHands.position.set(0.193, 1.735, 0);
  clockHands.rotation.y = Math.PI / 2;
  clock.add(clockHands);

  // Each hand pivots at the face centre. Keeping its mesh above that pivot
  // makes the visual rotation and the interaction target share one true axis.
  const hourHandPivot = new THREE.Group();
  const minuteHandPivot = new THREE.Group();
  clockHands.add(hourHandPivot, minuteHandPivot);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.135, 0.008), clockHandMat);
  hourHand.position.set(0, 0.0675, 0);
  hourHandPivot.add(hourHand);
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.193, 0.007), clockHandMat);
  minuteHand.position.set(0, 0.0965, 0.010);
  minuteHandPivot.add(minuteHand);
  const clockPin = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16), clockHandMat);
  clockPin.position.z = 0.018;
  clockHands.add(clockPin);

  const clockMechanism = createClockMechanism({
    woodMaterial: clockWoodMat,
    interiorMaterial: clockWoodMat,
    brassMaterial: keyMat
  });
  clock.add(clockMechanism.root);
  const clockDrawer = clockMechanism.doorPivot;
  const archiveToken = clockMechanism.sigil;

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
    showCaption('A hidden clock door clicks open.');
  }

  function rotateClockHand(part) {
    if (puzzle.clockSolved) return;
    if (part === 'hour') puzzle.clockHour = (puzzle.clockHour + 1) % 12;
    else puzzle.clockMinute = (puzzle.clockMinute + 5) % 60;
    setClockHands();
    trySolveClock();
  }

  const hourHandHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.15, 0.04),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  // Offset targets to opposite sides of the shared centre so they stay easy
  // to select even when the hands overlap at a particular time.
  hourHandHitbox.position.set(0.025, 0.072, 0);
  hourHandHitbox.userData.interact = {
    label: 'Turn hour hand (+1 hour)',
    onInteract: () => rotateClockHand('hour')
  };
  hourHandPivot.add(hourHandHitbox);
  interactables.push(hourHandHitbox);

  const minuteHandHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.070, 0.22, 0.04),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  minuteHandHitbox.position.set(-0.025, 0.11, 0.010);
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
  archiveTokenHitbox.position.copy(archiveToken.position);
  archiveTokenHitbox.visible = false;
  archiveTokenHitbox.userData.interact = {
    label: 'Take the Brass Sigil',
    onInteract: () => {
      if (!puzzle.clockSolved || puzzle.hasArchiveToken || !clockMechanism.canCollect) return;
      puzzle.hasArchiveToken = true;
      archiveToken.visible = false;
      archiveTokenHitbox.visible = false;
      gameState.inventory.add('archiveToken');
      const index = interactables.indexOf(archiveTokenHitbox);
      if (index >= 0) interactables.splice(index, 1);
      showCaption('Brass Sigil acquired.');
    }
  };
  clockMechanism.root.add(archiveTokenHitbox);

  const incidentNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.26),
    new THREE.MeshStandardMaterial({ color: 0xb8ac8f, roughness: 1 })
  );
  incidentNote.rotation.x = -Math.PI / 2;
  incidentNote.rotation.z = -0.12;
  incidentNote.position.set(-0.52, 0.791, -0.22);
  incidentNote.userData.interact = {
    label: 'Read the incident note',
    onInteract: () => showCaption('Containment failure logged at 23:15.')
  };
  desk.add(incidentNote);
  interactables.push(incidentNote);

  colliders.push({
    minX: clockX - 0.18, maxX: clockX + 0.198,
    minZ: clockZ - 0.31, maxZ: clockZ + 0.31,
    minY: 0, maxY: 2.16
  });
  setClockHands();

  // Puzzle 2: front-left wall, clear of the clock and the final-exit doorway.
  // Local +Z faces into the room; all shadows are meshes, never real lights.
  const shadowCrest = new THREE.Group();
  shadowCrest.name = 'ShadowCrest';
  shadowCrest.position.set(-4.3, 1.65, 6.36);
  shadowCrest.rotation.y = Math.PI;
  group.add(shadowCrest);
  const crestBrassMat = new THREE.MeshStandardMaterial({ color: 0xa38a53, metalness: 0.72, roughness: 0.5 });
  const crestWoodMat = studySurfaces.woodMaterial(0.95, 'feature');
  const crestHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  // Static housing mounts at the wall; the cover and reward remain separate game objects.
  loadStudyModel(shadowCrestHousingUrl).then((model) => {
    model.position.z = -0.13;
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const matchWood = (material) => /walnut/i.test(material.name) ? crestWoodMat : material;
      object.material = Array.isArray(object.material) ? object.material.map(matchWood) : matchWood(object.material);
    });
    shadowCrest.add(model);
  }).catch((error) => console.warn('Shadow Crest housing could not load:', error));
  colliders.push({
    minX: -4.84, maxX: -3.76, minZ: 6.27, maxZ: 6.49,
    minY: 1.2, maxY: 2.1
  });

  const crestHinge = new THREE.Group();
  crestHinge.position.set(-0.31, 0, 0.025);
  shadowCrest.add(crestHinge);
  const crestCover = new THREE.Group();
  crestCover.position.x = 0.31;
  // Preserve the closed pose and the original opening/pickup clock.
  let crestCoverTravel = 0;
  crestCover.scale.setScalar(0.45);
  crestHinge.add(crestCover);
  const syncCrestPanelCollision = createCrestPanelCollision(crestCover, colliders);
  const crestPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.665, 0.68, 0.05, 32), crestWoodMat);
  crestPlate.rotation.x = Math.PI / 2;
  const crestTrim = new THREE.Group();
  crestTrim.userData.studyStaticDetails = true;
  crestCover.add(crestTrim);
  const crestRim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.022, 6, 32), crestBrassMat);
  crestRim.position.z = 0.028;
  crestTrim.add(crestRim);
  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(0.588, 0.006, 4, 32), crestBrassMat);
  innerRim.position.z = 0.027;
  crestTrim.add(innerRim);
  crestCover.add(crestPlate);
  const socketProfile = new THREE.Shape();
  socketProfile.absarc(0, 0, 0.14, 0, Math.PI * 2, false);
  const socketHole = new THREE.Path();
  socketHole.absarc(0, 0, 0.095, 0, Math.PI * 2, true);
  socketProfile.holes.push(socketHole);
  const crestSocket = new THREE.Mesh(new THREE.ExtrudeGeometry(socketProfile, {
    depth: 0.018, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, steps: 1, curveSegments: 12
  }), crestBrassMat);
  crestSocket.position.set(0, -0.36, 0.02);
  crestTrim.add(crestSocket);
  const installedSigil = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), crestBrassMat);
  installedSigil.position.set(0, -0.36, 0.042);
  installedSigil.visible = false;
  crestCover.add(installedSigil);

  // Three disconnected strokes assemble a hollow triangular archive crest.
  const shadowMat = new THREE.MeshStandardMaterial({ color: 0x111310, metalness: 0.58, roughness: 0.48 });
  const shadowGeometry = createCrestIndicatorGeometry();
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
  const lampHitGeometry = new THREE.BoxGeometry(0.42, 0.44, 0.3);

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
    const dial = dressCrestControl(sconce, crestBrassMat);
    shadowCrest.add(sconce);
    crestLamps.push(dial);
    // Housing and targets stay stationary; only the circular dial rotates.
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
  crestHit.position.z = 0.04;
  crestHit.scale.set(0.55, 0.55, 0.5);
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

  const crestClue = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.32, 0.05, 1, 0.012), crestBrassMat);
  const crestInscription = studyLabel(0.71, 0.275, true, true);
  crestInscription.write(['THREE LIGHTS GUARD THE ARCHIVE.', 'THE OUTER TWO TURN FROM THE CENTRE.', 'THE HEART REMAINS TRUE.']);
  crestInscription.mesh.position.z = 0.027;
  crestClue.add(crestInscription.mesh);
  crestClue.position.set(0, -0.94, 0.07);
  crestClue.userData.interact = {
    label: 'Read the crest plaque',
    onInteract: () => showCaption('THREE LIGHTS GUARD THE ARCHIVE.\nTHE OUTER TWO TURN FROM THE CENTRE.\nTHE HEART REMAINS TRUE.')
  };
  shadowCrest.add(crestClue);
  interactables.push(crestClue);

  const archiveKey = new THREE.Group();
  archiveKey.position.set(0, 0, 0.08);
  // Reuse the sigil's existing 256px aged-brass maps without another texture.
  const archiveKeyMat = archiveToken.children[0].material.clone();
  archiveKeyMat.metalness = 0.78;
  archiveKeyMat.roughness = 0.6;
  fillStudyKey(archiveKey, archiveKeyMat);
  const crestBacking = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.035, 32), crestWoodMat);
  crestBacking.name = 'Permanent_Crest_Wood_Backing';
  crestBacking.rotation.x = Math.PI / 2;
  // Behind the closed door, independent of the reward's visibility and state.
  crestBacking.position.set(0, -0.025, -0.005);
  shadowCrest.add(crestBacking);
  archiveKey.visible = false;
  shadowCrest.add(archiveKey);
  const archiveKeyHit = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.09), crestHitMat);
  archiveKeyHit.position.copy(archiveKey.position);
  archiveKeyHit.visible = false;
  archiveKeyHit.userData.interact = {
    label: 'Take the Archive Key',
    onInteract: () => {
      if (!puzzle.crestSolved || puzzle.hasArchiveKey || crestCoverTravel < 0.8) return;
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

  const shelfMat = studySurfaces.woodMaterial(0.70);
  const studyDecor = createStudyDecor({ woodMaterial: architectureWoodMat, brassMaterial: crestBrassMat });
  const shelfAlongWallGeometry = new THREE.BoxGeometry(2.8, 2.8, 0.45);
  const shelfAcrossWallGeometry = new THREE.BoxGeometry(0.45, 2.8, 2.8);
  function addShelf(x, y, z, alongX, solid = false, dressing = null) {
    if (dressing) {
      const bookcase = studyDecor.createBookcase(dressing.index, dressing.loft);
      bookcase.position.set(x, y - 1.4, z);
      bookcase.rotation.y = alongX ? 0 : x < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(bookcase);
    } else {
      const shelf = new THREE.Mesh(alongX ? shelfAlongWallGeometry : shelfAcrossWallGeometry, shelfMat);
      const variation = Math.abs(Math.round(x * 7 + z * 13)) % 3;
      shelf.material = studySurfaces.woodMaterial([0.70, 0.76, 0.82][variation]);
      shelf.userData.studyGrainOffset = variation * 0.27;
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
    }
    if (solid) {
      // Upstairs collision includes the applied pilasters/lips as well as the body.
      const upstairs = y - 1.4 >= LOFT_Y - 0.001;
      const halfWidth = alongX ? (upstairs ? 1.455 : 1.4) : (upstairs ? 0.29 : 0.225);
      const halfDepth = alongX ? (upstairs ? 0.29 : 0.225) : (upstairs ? 1.455 : 1.4);
      colliders.push({
        minX: x - halfWidth, maxX: x + halfWidth,
        minZ: z - halfDepth, maxZ: z + halfDepth,
        minY: y - 1.4, maxY: y + 1.4
      });
    }
  }
  // Dressing bays leave the portrait, entry, stair approach and mirror clear.
  [-4.8, -2].forEach((z) => addShelf(-7.75, 1.4, z, false, true, z === -2 ? { index: 0 } : null));
  [-2.4, 0.4].forEach((x) => addShelf(x, 1.4, -6.25, true, true, x === 0.4 ? { index: 1 } : null));
  [-4.8, -2].forEach((z) => addShelf(-7.75, LOFT_Y + 1.4, z, false, true, z === -2 ? { index: 2, loft: true } : null));
  addShelf(7.75, LOFT_Y + 1.4, -4.8, false, true);
  [-1.5, 1.3].forEach((x) => addShelf(x, LOFT_Y + 1.4, -6.25, true, true, { index: 3, loft: true }));

  // Floor-centred metre-scale fireplace, facing into the room from the same wall slot.
  const fireplace = new THREE.Group();
  fireplace.name = 'Victorian_Fireplace';
  fireplace.position.set(-5.3, 0, -6.26);
  group.add(fireplace);
  loadStudyModel(victorianFireplaceUrl).then((model) => {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    fireplace.add(model);
  }).catch((error) => console.warn('Victorian fireplace could not load:', error));
  colliders.push({
    minX: -6.25, maxX: -4.35, minZ: -6.49, maxZ: -6.03,
    minY: 0, maxY: 1.46
  });

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.8),
    new THREE.MeshStandardMaterial({ map: studySurfaces.ageRug(createRugTexture({ base: '#354032', border: '#30362b', ring: '#46503c', trim: '#8f8467', core: '#72613e' })), color: 0xc6bca8, roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.008, 1.35);
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
  const portraitMat = new THREE.MeshStandardMaterial({ map: portraitTexPlain, color: 0xc0b6a4, roughness: 0.96 });
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
  memoryArchive.position.set(-5.4, LOFT_Y, -6.255);
  group.add(memoryArchive);
  const archiveCabinetMat = studySurfaces.woodMaterial(0.86);
  const memoryCabinetMat = studySurfaces.woodMaterial(0.78);
  const restrictedCabinetMat = studySurfaces.woodMaterial(0.80);
  const archiveHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const archiveDoorHinge = new THREE.Group();
  archiveDoorHinge.name = 'MemoryArchiveLeftHinge';
  archiveDoorHinge.position.set(-0.7, 0, 0.29);
  memoryArchive.add(archiveDoorHinge);
  const archiveDoor = new THREE.Mesh(new RoundedBoxGeometry(0.70, 1.7, 0.045, 1, 0.006), memoryCabinetMat);
  archiveDoor.position.set(0.35, 1, 0);
  archiveDoorHinge.add(archiveDoor);
  const archiveRightHinge = new THREE.Group();
  archiveRightHinge.name = 'MemoryArchiveRightHinge';
  archiveRightHinge.position.set(0.7, 0, 0.29);
  const archiveRightDoor = archiveDoor.clone();
  archiveRightDoor.position.x = -0.35;
  archiveRightHinge.add(archiveRightDoor);
  memoryArchive.add(archiveRightHinge);
  const memoryDoorMotion = hingeMotion([[archiveDoorHinge, -1], [archiveRightHinge, 1]]);
  const archiveLock = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.18, 0.04, 1, 0.008), crestBrassMat);
  archiveLock.position.set(0.61, 0.95, 0.04);
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
    return studyLabel(width, height);
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
    const x = (index - 1) * 0.46;
    const display = createArchiveRecord(0.404, 0.52, index);
    display.mesh.position.set(x, 1.3, 0.21);
    memoryContents.add(display.mesh);
    memoryRecordDisplays.push(display);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.12), archiveHitMat);
    hit.position.set(x, 1.3, 0.22);
    hit.userData.interact = {
      label: recordCategories[index],
      onInteract: () => {
        if (!puzzle.memoryArchiveUnlocked || puzzle.memoryArchiveSolved || !memoryDoorMotion.isOpen()) return;
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
    const display = createArchiveRecord(0.404, 0.20, index + 3);
    display.write(lines);
    display.mesh.position.set([1, -1, 0][index] * 0.46, 1.72, 0.24);
    display.mesh.userData.interact = {
      label: `Read archive clue ${index + 1}`,
      onInteract: () => showCaption(text)
    };
    memoryArchive.add(display.mesh);
    interactables.push(display.mesh);
  });
  const archiveCabinetHit = new THREE.Mesh(new THREE.BoxGeometry(1.40, 1.7, 0.12), archiveHitMat);
  archiveCabinetHit.position.set(0, 1, 0.29);
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
  const visorCompartmentCover = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.38, 0.04, 1, 0.005), memoryCabinetMat);
  const visorCoverHinge = new THREE.Group();
  visorCoverHinge.name = 'VisorCompartmentHinge';
  visorCoverHinge.position.set(-0.33, 0.68, 0.26);
  visorCompartmentCover.position.set(0.33, 0, 0);
  visorCoverHinge.add(visorCompartmentCover);
  memoryContents.add(visorCoverHinge);
  const visorCoverMotion = hingeMotion([[visorCoverHinge, -1]], 'y', Math.PI * 0.52);

  // The existing visor is the archive reward; its pickup hook owns V gating.
  const visorGroup = new THREE.Group();
  visorGroup.position.set(memoryArchive.position.x, LOFT_Y + 0.68, memoryArchive.position.z + 0.20);
  visorGroup.rotation.set(0, 0, 0);
  visorGroup.visible = false;
  group.add(visorGroup);

  const visorBandMat = new THREE.MeshStandardMaterial({
    color: 0x3c4243, roughness: 0.55, metalness: 0.82,
    roughnessMap: archiveToken.children[0].material.roughnessMap
  });
  const visorLensMat = new THREE.MeshPhysicalMaterial({
    color: 0xb1ddeb, map: createVisorGlassMap(), roughness: 0.10, metalness: 0,
    transparent: true, opacity: 0.68, depthWrite: false,
    clearcoat: 0.75, clearcoatRoughness: 0.08, ior: 1.46, transmission: 0
  });
  buildArchiveVisor(visorGroup, visorBandMat, visorLensMat, crestBrassMat);

  const visorHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  visorHitbox.position.copy(visorGroup.position);
  visorHitbox.visible = false;
  visorHitbox.userData.interact = {
    label: 'Pick up the visor',
    onInteract: () => {
      if (!puzzle.memoryArchiveSolved || puzzle.memoryVisorCollected || !visorCoverMotion.isOpen()) return;
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
  visorOnly.visible = !!gameState.visorWorn;
  group.add(visorOnly);

  // Puzzle 4: the exact same stains read differently through corrected sight.
  const distortedTrail = new THREE.Group();
  distortedTrail.name = 'DistortedArchiveTrail';
  distortedTrail.visible = !gameState.visorWorn;
  group.add(distortedTrail);
  const bloodTrail = new THREE.Group();
  bloodTrail.name = 'CorrectedBloodTrail';
  visorOnly.add(bloodTrail);
  addStudyFootprints({ distortedTrail, bloodTrail, visorOnly,
    stairX, stairBottomZ, stairCount, stairDepth, stairRise, loftY: LOFT_Y });

  // A shallow restricted archive alcove stands in front of the rear shelves;
  // no wall, shelf, or stair geometry needs to be moved to reveal it.
  const hollowAlcove = new THREE.Group();
  hollowAlcove.position.set(4.4, LOFT_Y, -6.255);
  group.add(hollowAlcove);
  // The final exit bolts still share this material with the former alcove shell.
  const alcoveMat = new THREE.MeshStandardMaterial({ color: 0x272725, metalness: 0.4, roughness: 0.88 });
  const restrictedPlaque = createArchiveRecord(1.28, 0.24, 6);
  restrictedPlaque.write(['PROJECT HOLLOW', '— RESTRICTED RECORDS']);
  restrictedPlaque.mesh.position.set(0, 1.97, -0.155);
  restrictedPlaque.mesh.userData.interact = {
    label: 'Restricted archive records',
    onInteract: () => {
      if (puzzle.correctedTrailSolved) showCaption('PROJECT HOLLOW — RESTRICTED RECORDS');
    }
  };
  const restrictedHeaderMount = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.28, 0.012, 1, 0.004), restrictedCabinetMat);
  restrictedHeaderMount.position.set(0, 1.97, -0.162);
  hollowAlcove.add(restrictedHeaderMount, restrictedPlaque.mesh);
  const chronologyNote = createArchiveRecord(1.22, 0.12, 11, { fontSize: 16, paddingY: 7, fontFamily: 'Courier New' });
  chronologyNote.write(['Authorization precedes the method;', 'the consequence closes the file.']);
  chronologyNote.mesh.position.set(0, 1.76, -0.155);
  hollowAlcove.add(chronologyNote.mesh);
  const hollowArchivePanel = new THREE.Mesh(new RoundedBoxGeometry(0.70, 2.04, 0.045, 1, 0.006), restrictedCabinetMat);
  const restrictedLeftHinge = new THREE.Group(), restrictedRightHinge = new THREE.Group();
  restrictedLeftHinge.name = 'RestrictedArchiveLeftHinge';
  restrictedRightHinge.name = 'RestrictedArchiveRightHinge';
  restrictedLeftHinge.position.set(-0.7, 0, 0.29);
  restrictedRightHinge.position.set(0.7, 0, 0.29);
  hollowArchivePanel.position.set(0.35, 1.12, 0);
  const restrictedRightDoor = hollowArchivePanel.clone();
  restrictedRightDoor.position.x = -0.35;
  restrictedLeftHinge.add(hollowArchivePanel);
  restrictedRightHinge.add(restrictedRightDoor);
  hollowAlcove.add(restrictedLeftHinge, restrictedRightHinge);
  const restrictedDoorMotion = hingeMotion([[restrictedLeftHinge, -1], [restrictedRightHinge, 1]]);

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
  const truthDrawer = new THREE.Group();
  truthDrawer.position.set(0, 0.45, 0.28);
  hollowAlcove.add(truthDrawer);
  const truthDrawerFront = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.26, 0.05, 1, 0.005), restrictedCabinetMat);
  truthDrawerFront.position.z = -0.01;
  const truthDrawerFloor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.03, 0.23), restrictedCabinetMat);
  truthDrawerFloor.position.set(0, -0.1, -0.155);
  const truthDrawerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), crestBrassMat);
  truthDrawerHandle.position.z = 0.03;
  const letterDoorHinge = new THREE.Group();
  letterDoorHinge.name = 'LetterCompartmentHinge';
  letterDoorHinge.position.set(0, -0.13, -0.01);
  truthDrawerFront.position.set(0, 0.13, 0);
  truthDrawerHandle.position.set(0, 0, 0.04);
  truthDrawerFront.add(truthDrawerHandle);
  letterDoorHinge.add(truthDrawerFront);
  truthDrawer.add(letterDoorHinge, truthDrawerFloor);
  const letterDoorMotion = hingeMotion([[letterDoorHinge, 1]], 'x', Math.PI * 0.51, 0.75);
  const truthRecordDisplays = [];
  const truthRecordHits = [];
  function updateTruthRecords(corrected = gameState.visorWorn) {
    truthRecordDisplays.forEach((display, index) => {
      const selected = puzzle.truthRecordsSolved || index < puzzle.truthRecordProgress;
      const heading = truthRecordNames[index];
      display.write([heading, ...(corrected ? truthCorrectedLines[index] : truthNormalLines[index])]);
      truthRecordHits[index].userData.interact.label = `${selected ? 'Selected: ' : 'Select '}${truthRecordNames[index]}`;
    });
  }
  truthRecordNames.forEach((name, index) => {
    // Keep logical indices intact; the physical slots read OUTCOME / CONSENT / PROCEDURE.
    const x = [0, 0.46, -0.46][index];
    const display = createArchiveRecord(0.404, 0.44, index + 7);
    display.mesh.position.set(x, 1.30, 0.24);
    hollowAlcove.add(display.mesh);
    truthRecordDisplays.push(display);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.12), archiveHitMat);
    hit.position.copy(display.mesh.position);
    hit.userData.interact = {
      label: `Select ${name}`,
      onInteract: () => {
        if (!puzzle.correctedTrailSolved || !restrictedDoorMotion.isOpen() || puzzle.truthRecordsSolved) return;
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

  // Furniture stays static. Original puzzle panels, hit targets and slide clocks stay separate.
  for (const station of [memoryArchive, hollowAlcove]) {
    colliders.push({
      minX: station.position.x - 0.82, maxX: station.position.x + 0.82,
      minZ: station.position.z - 0.235, maxZ: station.position.z + 0.285,
      minY: LOFT_Y, maxY: LOFT_Y + 2.26
    });
  }
  loadStudyModel(archiveCabinetUrl).then((model) => {
    // Existing visor cover / letter drawer occupy this service recess instead.
    model.getObjectByName('Archive_Service_Panel').visible = false;
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    // Both shells use the same worn wood family; clone before assigning materials.
    const restrictedModel = model.clone(true);
    function matchWood(root, wood) {
      root.traverse((object) => {
        if (!object.isMesh) return;
        const aged = material => /walnut/i.test(material.name) ? wood : material;
        object.material = Array.isArray(object.material) ? object.material.map(aged) : aged(object.material);
      });
    }
    matchWood(restrictedModel, restrictedCabinetMat);
    matchWood(model, memoryCabinetMat);
    hollowAlcove.add(restrictedModel);
    memoryArchive.add(model);
  }).catch((error) => console.warn('Archive cabinets could not load:', error));

  const memoryPresentation = createArchivePresentation(memoryCabinetMat, crestBrassMat);
  const restrictedPresentation = createArchivePresentation(restrictedCabinetMat, crestBrassMat);
  memoryPresentation.interior(memoryArchive, true);
  restrictedPresentation.interior(hollowAlcove, true, false);
  memoryPresentation.records(memoryContents, 0.21, 0.56, true);
  restrictedPresentation.records(hollowAlcove, 0.24, 0.48, true, false);
  memoryPresentation.memoryDoor(archiveDoor);
  memoryPresentation.memoryDoor(archiveRightDoor);
  restrictedPresentation.memoryDoor(hollowArchivePanel, 2.04);
  restrictedPresentation.memoryDoor(restrictedRightDoor, 2.04);

  const symbolGallery = createVisorGallery({ group, wood: archiveCabinetMat, brass: crestBrassMat, loftY: LOFT_Y });
  const trailMarkerHits = [];
  function setGallerySight(on) {
    symbolGallery.setVisor(on, puzzle.correctedTrailProgress, puzzle.correctedTrailSolved);
    for (const hit of trailMarkerHits) {
      const index = interactables.indexOf(hit);
      if (on && index < 0) interactables.push(hit);
      else if (!on && index >= 0) interactables.splice(index, 1);
    }
  }
  // No special frame tint gives the solution away in ordinary sight.
  function updateTrailMarkers() { symbolGallery.setVisor(!!gameState.visorWorn, puzzle.correctedTrailProgress, puzzle.correctedTrailSolved); }
  symbolGallery.targets.forEach((target, index) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(target.width, target.height, 0.06), archiveHitMat);
    hit.position.copy(target.position);
    hit.position.z += 0.025;
    hit.userData.interact = {
      label: 'Inspect symbol',
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
    trailMarkerHits.push(hit);
  });
  setGallerySight(!!gameState.visorWorn);

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

  // Correspondence is mounted inside the fixed compartment. The existing
  // document callback still owns reading completion and mirror progression.
  const letterSheet = createArchiveRecord(0.40, 0.20, 10, { fontSize: 34, fontStyle: 'italic', folded: true });
  letterSheet.write(['MARK']);
  const letterPaper = letterSheet.mesh;
  letterPaper.rotation.x = -0.10;
  letterPaper.position.set(0, 0.025, -0.075);
  letterPaper.visible = false;
  truthDrawer.add(letterPaper);
  let letterReading = false;

  const letterHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.34, 0.15),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  letterHit.position.set(0, 0.02, 0.10);
  letterHit.visible = false;
  letterHit.userData.interact = {
    label: "Read Annabelle's letter",
    onInteract: () => {
      if (!puzzle.truthRecordsSolved || !letterDoorMotion.isOpen() || letterReading || puzzle.truthRecordsComplete) return;
      letterReading = true;
      onReadLetter({
        body: annabelleLetterBody,
        onFinished: () => {
          if (puzzle.truthRecordsComplete || !puzzle.truthRecordsSolved) return;
          letterReading = false;
          letterHit.visible = false;
          const hitIndex = interactables.indexOf(letterHit);
          if (hitIndex >= 0) interactables.splice(hitIndex, 1);
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
  const mirrorFrame = new THREE.Group();
  mirrorFrame.name = 'Victorian_Full_Length_Mirror';
  mirrorFrame.position.set(4.8, 0, -6.425);
  group.add(mirrorFrame);
  loadStudyModel(victorianMirrorUrl).then((model) => {
    // Keep the game's existing interactive/reveal plane as the only mirror surface.
    model.getObjectByName('Neutral_Mirror_Surface').visible = false;
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    mirrorFrame.add(model);
  }).catch((error) => console.warn('Victorian mirror could not load:', error));
  colliders.push({
    minX: 4.33, maxX: 5.27, minZ: -6.496, maxZ: -6.35,
    minY: 0, maxY: 2.16
  });
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.674, 1.77),
    new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 1, roughness: 0.05 })
  );
  mirrorGlass.position.set(4.8, 1.08, mirrorFrame.position.z + 0.052);
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
  loadStudyModel(annabelleChairUrl).then((model) => {
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
  hollowOverrideKey.position.set(-3.55, 0.014, -3.85);
  hollowOverrideKey.rotation.x = -Math.PI / 2;
  hollowOverrideKey.visible = false;
  fillStudyKey(hollowOverrideKey, keyMat, true);
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
    new THREE.BoxGeometry(1.78, 2.98, 0.09),
    studySurfaces.woodMaterial(0.88)
  );
  doorSlab.position.y = 1.05;
  frontDoor.add(doorSlab);
  const doorStopMat = studySurfaces.woodMaterial(0.72, 'trim');
  for (const x of [-0.9, 0.9]) {
    const stop = new THREE.Mesh(new THREE.BoxGeometry(0.025, 3, 0.10), doorStopMat);
    stop.position.set(x, 1.5, 0.025);
    frontDoor.add(stop);
  }
  const doorHeadStop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.025, 0.10), doorStopMat);
  doorHeadStop.position.set(0, 2.995, 0.025);
  frontDoor.add(doorHeadStop);

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
  doorHinge.position.set(-0.89, 0, 0);
  frontDoor.add(doorHinge);
  doorHinge.add(doorSlab);
  doorSlab.position.set(0.89, 1.49, 0);
  dressStudyDoor(doorSlab, 1.78, 2.98, studySurfaces.woodMaterial(0.85, 'feature'), crestBrassMat, true);

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
   * Layout: the slab is 1.78 x 2.98 centred on its own origin. The panel field
   * takes the left 62% and the lock stile the right, which is how real
   * joinery does it -- a lock goes through the stile, never through a panel --
   * and which also keeps the lock bodies at x = +0.35 clear of every panel a
   * player has to count.
   */
  const PANEL_FIELD_WIDTH_FRACTION = 0.62;
  const SLAB_W = 1.78;
  const SLAB_H = 2.98;
  const panelMat = studySurfaces.woodMaterial(0.95);

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
          -0.054
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
      // The normal labels are engraved into the GLB; retain enhanced visor text in-panel.
      display.mesh.visible = corrected;
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
  for (const [choice, x, z, rotation, modelUrl] of [
    ['RELEASE', 1.55, 6.49, Math.PI, emergencyReleasePanelUrl],
    ['RESEALED', 6.35, -6.49, 0, manualResealPanelUrl]
  ]) {
    const socketGroup = new THREE.Group();
    socketGroup.position.set(x, 1.35, z);
    socketGroup.rotation.y = rotation;
    group.add(socketGroup);
    const isReleasePanel = choice === 'RELEASE';
    loadStudyModel(modelUrl).then((model) => {
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = true;
      });
      socketGroup.add(model);
    }).catch((error) => console.warn('Containment control panel could not load:', error));
    const panelDepth = isReleasePanel ? 0.164 : 0.176;
    const halfWidth = isReleasePanel ? 0.22 : 0.23;
    const halfHeight = isReleasePanel ? 0.29 : 0.30;
    const panelFrontZ = z + Math.cos(rotation) * panelDepth;
    colliders.push({
      minX: x - halfWidth, maxX: x + halfWidth,
      minZ: Math.min(z, panelFrontZ), maxZ: Math.max(z, panelFrontZ),
      minY: 1.35 - halfHeight, maxY: 1.35 + halfHeight
    });
    const installedKey = hollowOverrideKey.clone();
    installedKey.position.set(0, 0.03, isReleasePanel ? 0.147 : 0.159);
    installedKey.rotation.set(0, 0, 0);
    installedKey.scale.setScalar(0.75);
    installedKey.visible = false;
    socketGroup.add(installedKey);
    const display = makeArchiveLabel(0.345, 0.052);
    display.mesh.position.set(0, -0.220, isReleasePanel ? 0.132 : 0.144);
    socketGroup.add(display.mesh);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.22), archiveHitMat);
    hit.position.z = 0.09;
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

  // The porch, its gate, the house front and everything outside: the yard,
  // the woods, the night sky and the rain. See studyExterior.js.
  const { porch, gate, exterior, update: updateExterior } = createStudyExterior({
    roomW: ROOM_W, roomD: ROOM_D, roomH: ROOM_H, doorX: DOOR_X,
    doorwayW: DOORWAY_W, doorwayH: DOORWAY_H, colliders
  });
  group.add(porch, exterior);

  // Decorative meshes only: no interaction registrations, lights, physics or new colliders.
  group.userData.studyDecorPropCount = studyDecor.dressRoom({
    group, desk, fireplace, photoTexture: portraitTexPlain, loftY: LOFT_Y
  });
  const entryFinish = new THREE.Group();
  entryFinish.rotation.y = -Math.PI / 2;
  entryDoor.add(entryFinish);
  dressStudyDoor(entryFinish, ENTRY_DOOR_W, ENTRY_DOOR_H, trimMat, crestBrassMat);
  studySurfaces.alignSurfaces(group, wallMat, ROOM_H);
  batchStudyPuzzleDetails(group);

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
        setGallerySight(on);
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
      clockMechanism.reset();
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
      crestCoverTravel = 0;
      crestHinge.rotation.y = 0;
      syncCrestPanelCollision();
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
      memoryDoorMotion.reset();
      visorCoverMotion.reset();
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
      restrictedDoorMotion.reset();
      setGallerySight(false);
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
      letterDoorMotion.reset();
      letterReading = false;
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
      updateExterior(dt);
      if (resealBolts.visible) resealBolts.scale.x += (1 - resealBolts.scale.x) * Math.min(1, dt * 5);
      if (puzzle.endingChoice === 'RELEASE' && !puzzle.endingSequenceStarted && doorHinge.rotation.y < -0.8) {
        const position = getPlayerPosition();
        if (position && Math.abs(position.x - DOOR_X) < DOORWAY_W / 2
          && position.z >= frontZ + 0.2 && position.y < 2.5) startCommittedEnding();
      }
      memoryDoorMotion.update(dt, puzzle.memoryArchiveUnlocked);
      restrictedDoorMotion.update(dt, puzzle.correctedTrailSolved);
      visorCoverMotion.update(dt, puzzle.memoryArchiveSolved);
      letterDoorMotion.update(dt, puzzle.truthRecordsSolved);
      clockMechanism.update(dt, puzzle.clockSolved);
      const crestTargetX = puzzle.crestSolved ? 2.05 : 0;
      const previousCrestTravel = crestCoverTravel;
      crestCoverTravel += (crestTargetX - crestCoverTravel) * Math.min(1, dt * 5);
      crestHinge.rotation.y = -THREE.MathUtils.degToRad(100) * crestCoverTravel / 2.05;
      if (crestCoverTravel !== previousCrestTravel) syncCrestPanelCollision();
      const doorTarget = doorState.open ? DOOR_OPEN_SWING : 0;
      doorHinge.rotation.y += (doorTarget - doorHinge.rotation.y) * Math.min(1, dt * 2.6);
    }
  };
}
