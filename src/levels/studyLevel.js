import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createVisorGallery } from './studyVisorGallery.js';
import { createStudyDecor } from './studyDecor.js';
import { createCandleFlames } from '../world/CandleFlames.js';
import { createHearthFire } from '../world/HearthFire.js';
import { createStudyFireplaceDressing } from './studyFireplace.js';
import { createStudyBlackout } from './studyBlackout.js';
import { createStudyHideProps, createStudyThrowables } from './studyHideProps.js';
import { createBalustradeBuilder, railGeometry, RAIL_PROFILES } from './studyBalustrade.js';
import { createStudySurfaces } from './studySurfaces.js';
import { createAnnabelle } from './annabelleFigure.js';
import { createOkabeCreature } from '../systems/OkabeCreature.js';
import { poseStudyCreature, alignStudyCreature, updateStudyCreature, CHAIR_EYE, createStudyRevealTiming } from '../cutscenes/studyReveal.js';
import { createClockMechanism } from './clockMechanism.js';
import { createArchivePresentation, createArchiveRecord, buildArchiveVisor, createVisorGlassMap } from './studyArchivePresentation.js';
import { addStudyFootprints } from './studyFootprints.js';
import { addStudyArchitectureTrim } from './studyArchitectureTrim.js';
import { createStudyExterior } from './studyExterior.js';
import { createLeftWallWithWindows, STUDY_WINDOWS } from './studyWindows.js';
import { hingeMotion, studyLabel, dressCrestControl, createCrestPanelCollision, dressStudyDoor, batchStudyPuzzleDetails } from './studyPuzzlePresentation.js';
import { buildBrassKey } from '../world/keyModels.js';
import { createHollowCard, createHollowReader, createPhysicalCrestTile, createResealHandle } from './studyProgressionPresentation.js';
import { STUDY_RUG, dressStudyMirror, dressFinalStudyExit } from './studyHeroPresentation.js';
import victorianRugUrl from '../assets/textures/rug/victorian_rug_top_game.jpg?url';
import { loadModel } from '../world/modelLoader.js';
import { createHauntedMirror } from '../world/HauntedMirror.js';
import { createCrystalDecanter } from '../world/CrystalDecanter.js';
import annabelleChairUrl from '../assets/models/study/annabelle_wingback_chair.glb?url';
import centralDeskUrl from '../assets/models/study/central_victorian_desk.glb?url';
import archiveCabinetUrl from '../assets/models/study/victorian_archive_cabinet.glb?url';
import grandfatherClockUrl from '../assets/models/study/victorian_grandfather_clock.glb?url';
import victorianMirrorUrl from '../assets/models/study/victorian_full_length_mirror.glb?url';
import victorianFireplaceUrl from '../assets/models/study/victorian_fireplace.glb?url';
import shadowCrestHousingUrl from '../assets/models/study/shadow_crest_housing.glb?url';
import emergencyReleasePanelUrl from '../assets/models/study/emergency_release_panel.glb?url';
import manualResealPanelUrl from '../assets/models/study/manual_reseal_panel.glb?url';
import { makeHandle } from '../world/trim.js';
import { DOOR_PANEL_ROWS, getPanelSpans } from '../world/doorPanels.js';
import { gameState, canCarryMore } from '../core/GameState.js';
import { line } from '../dialogue/index.js';
import { ANNABELLE_FINAL_LETTER } from '../story/studyReveal.js';

const ROOM_W = 16;
const ROOM_D = 13;
const ROOM_H = 6.4;
const LOFT_Y = 3.1;
const LOFT_D = 5.8;

/** Level 3 study: the archive puzzles lead to the final front exit. */
export function createStudyLevel({
  showCaption = () => {},
  onThought = () => {},
  onVoiceProgress = () => {},
  canAutoThought = () => true,
  // The front door starting to swing, with its world position. Not the later
  // press that walks through it.
  onDoorOpening = () => {},
  onTakeVisor = () => {},
  /** The crest is solved and exposes its reward; collecting it is a separate event. */
  onCrestSolved = () => {},
  /** The physical crest reward was collected, not merely revealed. */
  onCrestKeyTaken = () => {},
  /** E on a hide spot (the wardrobe): main.js puts Mark inside it. */
  onEnterHideSpot = () => {},
  /** The loft breaker thrown: the power is back. 'teaser' | 'hunt'. */
  onBreakerThrown = () => {},
  onLookInMirror = () => {},
  onReadLetter = () => {},
  onResetLetter = () => {},
  // Batch 1 stops at these physical-choice hooks; no ending sequence starts.
  onReleaseChosen = () => {},
  onResealChosen = () => {},
  getPlayerPosition = () => null,
  /** A sound effect by name (AudioDirector's SFX); the level has no audio of its own. */
  onSfx = () => {},
  /** An item taken: into the inventory and the hand, as every other level's pickups go. */
  onPickUpItem = (id) => gameState.inventory.add(id),
  /** An item used up -- the sigil seated, a key turned. */
  onUseItem = (id) => gameState.inventory.delete(id)
} = {}) {
  const group = new THREE.Group();
  group.name = 'Level3_Study';
  const interactables = [];
  const colliders = [];

  const studySurfaces = createStudySurfaces();
  const loadStudyModel = (url) => loadModel(url).then(model => studySurfaces.harmoniseAsset(
    model, url === archiveCabinetUrl || url === annabelleChairUrl ? 'builtIn'
      // The fireplace in the espresso of the trim, not the red 'feature' mahogany.
      : url === victorianFireplaceUrl ? 'trim' : 'feature'
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
      color: 0xb4b0a5, roughness: 1, metalness: 0, envMapIntensity: 0.15 })
  );
  ceiling.material.color.multiply(studySurfaces.ceilingTint);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  ceiling.name='Study_Shadowed_Plaster';ceiling.castShadow=true;ceiling.receiveShadow=true;
  // Default 0..1 UVs cover the room with one continuous plaster image.
  group.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xe1dbc9, roughness: 1, metalness: 0, emissive: 0, envMapIntensity: 0.1, vertexColors: true });
  wallMat.color.multiply(studySurfaces.wallTint);
  const wallGeometry = (w, h) => new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / 1.6)), Math.max(1, Math.ceil(h / 0.32)));
  function wall(w, x, z, ry) {
    const m = new THREE.Mesh(wallGeometry(w, ROOM_H), wallMat);
    m.position.set(x, ROOM_H / 2, z);
    m.rotation.y = ry;
    m.castShadow=true;m.receiveShadow=true;
    group.add(m);
  }
  wall(ROOM_W, 0, -ROOM_D / 2, 0);
  // The left wall has windows in it: the yard and the night sky show through.
  const windowWall=createLeftWallWithWindows({
    roomD: ROOM_D, roomH: ROOM_H, wallMat, wallGeometry, trimMat: studySurfaces.woodMaterial(0.86, 'trim')
  });
  windowWall.traverse(mesh=>{if(mesh.isMesh&&mesh.material===wallMat){mesh.castShadow=true;mesh.receiveShadow=true;}});
  group.add(windowWall);

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
  // The front exit has its own frame now (dressFinalStudyExit); a second
  // casing here sat inside it and showed as slivers of a different wood.
  addDoorCasing(ROOM_W / 2 - 0.04, ENTRY_DOOR_Z, ENTRY_DOOR_W, ENTRY_DOOR_H, false);

  // A readable night floor; local sources carry the room instead of ceiling fills.
  const ambient = new THREE.AmbientLight(0xa7adb6, .85);
  ambient.name='Study_Ambient';group.add(ambient);
  // The existing desk lamp's shade sits 30cm above its desk-local .79m base.
  const lamp = new THREE.PointLight(0xffd7aa, 2.4, 3, 2);
  lamp.name='Study_Desk_Lamp';lamp.position.set(.64,1.06,1.15);
  lamp.castShadow=false;group.add(lamp);

  // The rear archive is a real second storey, leaving the front
  // half of the study open to the full ceiling height.
  const balconyMat = studySurfaces.woodMaterial(0.82);
  // Compact straight-grained architectural walnut stays independent of furniture UVs.
  const architectureWoodMat = studySurfaces.woodMaterial(0.96);
  const handrailWoodMat = studySurfaces.woodMaterial(0.66, 'trim');
  const treadWoodMat = studySurfaces.woodMaterial(1.02, 'trim');
  const stairWoodMat = studySurfaces.woodMaterial(0.92, 'trim');
  // The balustrade (studyBalustrade.js): turned newels and balusters and
  // moulded rails, in a darker espresso than the trim.
  const balustrade = createBalustradeBuilder(group, handrailWoodMat);
  function addTimber(geometry, x, y, z, material = architectureWoodMat) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const loftWidth = ROOM_W;
  const loftFrontZ = -ROOM_D / 2 + LOFT_D;
  const loft = new THREE.Mesh(new THREE.BoxGeometry(loftWidth, 0.28, LOFT_D), balconyMat);
  loft.position.set(0, LOFT_Y - 0.14, -ROOM_D / 2 + LOFT_D / 2);
  loft.receiveShadow = true;loft.castShadow=true;
  group.add(loft);

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
  loftLanding.receiveShadow = true;loftLanding.castShadow=true;
  group.add(loftLanding);
  studySurfaces.floorSurface(loft, balconyMat);
  studySurfaces.floorSurface(loftLanding, balconyMat);
  addStudyArchitectureTrim(group, trimMat, {
    width: ROOM_W, depth: ROOM_D, height: ROOM_H, loftY: LOFT_Y,
    loftFrontZ, stairTopZ, entryZ: ENTRY_DOOR_Z, entryWidth: ENTRY_DOOR_W, exitWidth: DOORWAY_W
  });
  // The gallery balustrade runs from the left bookcase to the corner newel
  // over the stair head; its collider is the old one, unchanged.
  const loftRailStartX = -loftWidth / 2 + 0.475;
  const loftRailEndX = stairX - stairHalfWidth + 0.15;
  colliders.push({
    minX: loftRailStartX, maxX: loftRailEndX, minZ: loftFrontZ - 0.04, maxZ: loftFrontZ + 0.04,
    minY: LOFT_Y - 0.1, maxY: LOFT_Y + 1.09
  });
  const stairRailX = stairX - stairHalfWidth + 0.05;
  const RAIL_CROWN = LOFT_Y + 1.025;
  const BOTTOM_RAIL_Y = LOFT_Y + 0.105;
  const GALLERY_BALUSTER = { height: 0.834, footY: LOFT_Y + 0.137 };
  const DIE_HALF = 0.0825;
  {
    // Seven newels, evenly spaced; the first clears the bookcase stile by
    // 7.5 mm at its cap, the last is the corner newel on the stair line.
    const firstX = -7.415;
    const spacing = (stairRailX - firstX) / 6;
    const galleryNewels = Array.from({ length: 7 }, (_, index) => firstX + spacing * index);
    galleryNewels.forEach((x, index) => balustrade.newel(x, LOFT_Y, loftFrontZ,
      // The corner newel overhangs the stairwell: its block drops below the
      // loft edge to take the stair's string and capping.
      index === 6 ? { dropFrom: 2.12 } : {}));
    const length = stairRailX - firstX;
    balustrade.rail(railGeometry(RAIL_PROFILES.HANDRAIL, length).rotateY(Math.PI / 2).translate(firstX, RAIL_CROWN, loftFrontZ));
    balustrade.rail(railGeometry(RAIL_PROFILES.BOTTOM_RAIL, length).rotateY(Math.PI / 2).translate(firstX, BOTTOM_RAIL_Y, loftFrontZ));
    const feet = [];
    for (let index = 0; index < 6; index++) {
      const from = galleryNewels[index] + DIE_HALF;
      const gap = (galleryNewels[index + 1] - DIE_HALF - from) / 18;
      for (let k = 1; k <= 17; k++) feet.push([from + gap * k, GALLERY_BALUSTER.footY, loftFrontZ]);
    }
    // The return along the stair head, from the landing newel to the corner newel.
    balustrade.newel(stairRailX, LOFT_Y, stairTopZ);
    const returnLength = loftFrontZ - stairTopZ;
    balustrade.rail(railGeometry(RAIL_PROFILES.HANDRAIL, returnLength).translate(stairRailX, RAIL_CROWN, stairTopZ));
    balustrade.rail(railGeometry(RAIL_PROFILES.BOTTOM_RAIL, returnLength).translate(stairRailX, BOTTOM_RAIL_Y, stairTopZ));
    const returnFrom = stairTopZ + DIE_HALF;
    const returnGap = (loftFrontZ - DIE_HALF - returnFrom) / 9;
    for (let k = 1; k <= 8; k++) feet.push([stairRailX, GALLERY_BALUSTER.footY, returnFrom + returnGap * k]);
    balustrade.balusters(GALLERY_BALUSTER.height, feet);
  }
  // The slab edge's fascia, base bead and floor lip, ending staggered inside
  // the corner newel (6.48 / 6.49 / 6.50) so no two end faces share a plane.
  // The lip stands 7.5 mm proud of the fascia: they used to share its front.
  for (const [endX, height, depth, y, z, rounded] of [
    [6.48, 0.25, 0.12, LOFT_Y - 0.14, loftFrontZ + 0.055, false],
    [6.49, 0.045, 0.14, LOFT_Y - 0.265, loftFrontZ + 0.05, true],
    // Keep the lip top 3 mm below the slab top instead of sharing its plane.
    [6.50, 0.04, 0.145, LOFT_Y - 0.023, loftFrontZ + 0.05, true]
  ]) {
    const length = endX + loftWidth / 2;
    addTimber(rounded ? new RoundedBoxGeometry(length, height, depth, 1, 0.006) : new THREE.BoxGeometry(length, height, depth),
      (endX - loftWidth / 2) / 2, y, z);
  }
  const cutoutLength = loftFrontZ - stairTopZ;
  // Wide enough to hide the closed string's flat top under the landing.
  addTimber(new THREE.BoxGeometry(0.175, 0.25, cutoutLength), 6.5375, LOFT_Y - 0.14, (loftFrontZ + stairTopZ) / 2);
  addTimber(new THREE.BoxGeometry(stairWidth, 0.25, 0.10), stairX, LOFT_Y - 0.14, stairTopZ - 0.025);

  // Stair sides remain solid while groundAt() supplies the walkable rise.
  // The loft rail above has vertical bounds so the ground floor stays open.
  const railingThickness = 0.12;
  colliders.push(
    { minX: stairX - stairHalfWidth - railingThickness, maxX: stairX - stairHalfWidth + railingThickness, minZ: stairTopZ, maxZ: stairBottomZ + 0.09 },
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
  // The wall side keeps its skirt board.
  const stringerLength = Math.hypot(stairRun, LOFT_Y);
  const wallSkirt = addTimber(new THREE.BoxGeometry(0.035, 0.28, stringerLength),
    ROOM_W / 2 - 0.018, LOFT_Y / 2 + 0.025, (stairBottomZ + stairTopZ) / 2, stairWoodMat);
  wallSkirt.rotation.x = Math.atan2(LOFT_Y, stairRun);
  {
    // The open side: a CLOSED STRING parallel to the treads' nosings, deep
    // enough to bury every tread end and riser (the old stringer was 9.6 cm
    // too low, so the steps saw-toothed through it), with a capping on top
    // for the balusters to stand in. The stair balustrade ends at the corner
    // newel: from there to the landing the loft's return balustrade alone
    // guards the top treads, instead of both standing in one plane.
    const pitch = LOFT_Y / stairRun;
    const nosingY = (z) => stairRise + 0.0555 + pitch * (stairBottomZ + 0.035 - z);
    const stringTop = (z) => nosingY(z) + 0.045;
    const stringBottom = (z) => stringTop(z) - 0.36;
    const footZ = stairBottomZ - 0.07;
    const cornerZ = loftFrontZ;
    const flatY = 2.86;
    const shape = new THREE.Shape();
    shape.moveTo(footZ, stringBottom(footZ));
    shape.lineTo(footZ, stringTop(footZ));
    shape.lineTo(cornerZ, stringTop(cornerZ));
    shape.lineTo(cornerZ, flatY);
    shape.lineTo(footZ - (flatY - stringBottom(footZ)) / pitch, flatY);
    shape.closePath();
    const string = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false })
      .rotateY(-Math.PI / 2).translate(stairRailX + 0.06, 0, 0), stairWoodMat);
    string.name = 'Study_Stair_Closed_String';
    string.receiveShadow = true;
    group.add(string);

    balustrade.newel(stairRailX, 0, stairBottomZ, { blockHeight: 0.45, shaftScale: 1.0588 });
    const runStart = stairBottomZ - 0.06;
    const runLength = runStart - (cornerZ + 0.0725);
    balustrade.rail(railGeometry(RAIL_PROFILES.HANDRAIL, runLength, { pitch, yScale: Math.hypot(1, pitch) })
      .rotateY(Math.PI).translate(stairRailX, nosingY(runStart) + 0.80, runStart));
    balustrade.rail(railGeometry(RAIL_PROFILES.CAPPING, runLength, { pitch })
      .rotateY(Math.PI).translate(stairRailX, stringTop(runStart) - 0.004, runStart));
    const feet = [];
    for (let index = 0; index < stairCount; index++) {
      for (const fraction of [0.25, 0.75]) {
        const z = stairBottomZ - stairDepth * (index + fraction);
        if (z < cornerZ + 0.13 || z > stairBottomZ - 0.13) continue;
        feet.push([stairRailX, nosingY(z) + 0.064, z]);
      }
    }
    balustrade.balusters(0.6704, feet);
  }
  // Return the gallery handrail to the stair head, leaving the full landing opening clear.
  colliders.push({
    minX: stairRailX - 0.06, maxX: stairRailX + 0.06,
    minZ: stairTopZ, maxZ: loftFrontZ,
    minY: LOFT_Y - 0.1, maxY: LOFT_Y + 1.09
  });
  balustrade.finish();
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
    endingChoiceComplete: false,
    endingSequenceStarted: false,
    /**
     * The hide-and-seek's single blackout (studyBlackout.js, main.js):
     * none -> teaser -> teaserDone. The crest key starts the only encounter.
     */
    blackoutStage: 'none'
  };
  let mirrorRevealGeneration = 0;

  // Voice timing is presentation-only; puzzle state remains authoritative.
  let spokenPuzzle = null, stuckSeconds = 0;
  const spokenHints = new Set(), evidenceRead = new Set();
  function voiceProgress(next = null) {
    spokenPuzzle = next; stuckSeconds = 0; onVoiceProgress();
  }
  function readEvidence(id) {
    evidenceRead.add(id);
    if (evidenceRead.size >= 3) onThought('l3_07', { priority: 50 });
  }
  function correctedEvidence() {
    if (puzzle.memoryVisorCollected && gameState.visorWorn) onThought('l3_05', { priority: 50 });
  }


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

  // Right rear wall, facing -X: clear of the mirror, reseal panel and stair flight.
  const clockX = 7.74;
  const clockZ = -5.30; // 25 cm to the viewer's right along the same wall.
  const clock = new THREE.Group();
  clock.name = 'IncidentClock';
  clock.position.set(clockX, 0, clockZ);
  clock.rotation.y = Math.PI;
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
    voiceProgress();
    onThought('l3_02', { priority: 40 });
  }

  function rotateClockHand(part) {
    if (puzzle.clockSolved) return;
    voiceProgress('clock');
    onThought('l3_01');
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
      onPickUpItem('archiveToken');
      const index = interactables.indexOf(archiveTokenHitbox);
      if (index >= 0) interactables.splice(index, 1);
      showCaption('Brass Sigil acquired.');
      voiceProgress(); onThought('l3_03', { priority: 40 });
    }
  };
  clockMechanism.root.add(archiveTokenHitbox);

  const incidentRecord = createArchiveRecord(0.42, 0.26, 12);
  incidentRecord.write(['Containment failure', 'logged at 23:15.']);
  const incidentNote = incidentRecord.mesh;
  incidentNote.rotation.x = -Math.PI / 2;
  incidentNote.rotation.z = -0.12;
  incidentNote.position.set(-0.52, 0.791, -0.22);
  incidentNote.userData.interact = {
    label: 'Read the incident note',
    onInteract: () => showCaption('Containment failure logged at 23:15.')
  };
  desk.add(incidentNote);
  interactables.push(incidentNote);

  // A cut-crystal decanter and its tumbler on the free right-front corner of
  // the desk (the lamp, ink and papers sit behind and left of it -- see
  // studyDecor.js's dressRoom). Refractive glass with its own shader, and a
  // flat-shaded stopper: see world/CrystalDecanter.js.
  const decanter = createCrystalDecanter();
  decanter.root.position.set(0.74, 0.79, 0.16);
  desk.add(decanter.root);

  colliders.push({
    minX: clockX - 0.198, maxX: clockX + 0.18,
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
  const shadowPieces = [];
  const shadowTargets = [
    { x: -0.145, y: 0.1, angle: -Math.PI / 6 },
    { x: 0, y: -0.15, angle: Math.PI / 2 },
    { x: 0.145, y: 0.1, angle: Math.PI / 6 }
  ];
  for (let index = 0; index < 3; index++) {
    const piece = createPhysicalCrestTile(crestBrassMat, shadowMat);
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
    voiceProgress();
    onCrestSolved();
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
        voiceProgress('shadow');
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
      if (!puzzle.crestSolved) voiceProgress('shadow');
      if (puzzle.crestSigilInserted) {
        showCaption(puzzle.crestSolved ? 'The archive crest is open.' : 'The sigil is installed. Three lamps can be turned.');
        return;
      }
      if (!gameState.inventory.has('archiveToken')) {
        showCaption('An empty brass socket.');
        return;
      }
      onUseItem('archiveToken');
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
  const crestPlaqueLines = ['THREE LIGHTS GUARD THE ARCHIVE.', 'THE OUTER TWO TURN FROM THE HEART.', 'THE CENTRE REMAINS TRUE.'];
  crestInscription.write(crestPlaqueLines);
  crestInscription.mesh.position.z = 0.027;
  crestClue.add(crestInscription.mesh);
  crestClue.position.set(0, -0.84, 0.07);
  crestClue.userData.interact = {
    label: 'Read the crest plaque',
    onInteract: () => showCaption(crestPlaqueLines.join('\n'))
  };
  shadowCrest.add(crestClue);
  interactables.push(crestClue);

  // The key hangs bow-up from a brass hook on the compartment's back board.
  // Rotating PI about Z puts the bow on top, its hole (key-local y -0.0215)
  // exactly on the hook's pin at local y 0.07, broad face to the room. It used
  // to lie on a wooden tray that stuck out through the closed cover.
  const archiveKey = new THREE.Group();
  archiveKey.position.set(0, 0.0485, -0.004);
  archiveKey.rotation.set(0, 0, Math.PI);
  archiveKey.add(buildBrassKey());
  const crestBacking = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.035, 32), crestWoodMat);
  crestBacking.name = 'Permanent_Crest_Wood_Backing';
  crestBacking.rotation.x = Math.PI / 2;
  // Behind the closed door, independent of the reward's visibility and state.
  // Set back into the housing's recess to leave the hook and key room in
  // front of it: everything stays behind the closed cover (its back at 0.01375).
  crestBacking.position.set(0, -0.025, -0.03);
  shadowCrest.add(crestBacking);
  // A sibling of the key, never its child: the held key is a clone of
  // archiveKey, and the hook must stay on the wall when it is taken.
  const archiveKeyHook = new THREE.Group();
  archiveKeyHook.name = 'Archive_Key_Hook';
  archiveKeyHook.userData.studyStaticDetails = true;
  archiveKeyHook.position.set(0, 0.07, 0);
  const hookRosette = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 16), crestBrassMat);
  hookRosette.rotation.x = Math.PI / 2;
  hookRosette.position.z = -0.011;
  const hookPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.018, 8), crestBrassMat);
  hookPin.rotation.x = Math.PI / 2;
  hookPin.position.z = -0.0005;
  // The upturned end that stops the bow sliding off.
  const hookTip = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.010, 8), crestBrassMat);
  hookTip.position.set(0, 0.004, 0.0085);
  archiveKeyHook.add(hookRosette, hookPin, hookTip);
  shadowCrest.add(archiveKeyHook);
  archiveKey.visible = false;
  shadowCrest.add(archiveKey);
  const archiveKeyHit = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.34, 0.08), crestHitMat);
  archiveKeyHit.position.set(0, 0.035, 0.02);
  archiveKeyHit.visible = false;
  archiveKeyHit.userData.interact = {
    label: 'Take the Archive Key',
    onInteract: () => {
      if (!puzzle.crestSolved || puzzle.hasArchiveKey || crestCoverTravel < 0.8) return;
      puzzle.hasArchiveKey = true;
      onPickUpItem('archiveKey');
      archiveKey.visible = false;
      archiveKeyHit.visible = false;
      const index = interactables.indexOf(archiveKeyHit);
      if (index >= 0) interactables.splice(index, 1);
      showCaption('Archive Key acquired.');
      onCrestKeyTaken();
    }
  };
  shadowCrest.add(archiveKeyHit);
  updateCrestShadows();

  const shelfMat = studySurfaces.woodMaterial(0.70);
  // Every candle flame in the room is one batch; a few of them own a real
  // flickering light. The pool is fixed here, at build time, so the boot
  // warm-up compiles the room with exactly the lights it will ever have.
  // Two shared shadowless pools near the player; all other flames remain visual.
  const studyCandles = createCandleFlames({ parent: group, capacity: 48, lightCount: 2, steadyLight: true, lightDistanceFade: {full:4,off:7,handoverSeconds:1.1}, name: 'Study_Candle_Flames' });
  // The three casements in the left wall are old and leak: a draught falls
  // off the cold glass and spills into the room at each sill, so the sconces
  // below them always lean a little away from the wall, more when the wind
  // outside gets up. (The level sits at the world origin, so these room
  // coordinates are the world ones CandleFlames wants.)
  for (const z of STUDY_WINDOWS.zs) {
    studyCandles.addDraft(new THREE.Vector3(STUDY_WINDOWS.wallX, STUDY_WINDOWS.bottom - 0.05, z),
      { direction: { x: 1, z: 0 }, strength: 0.13, radius: 1.6, unsteadiness: 0.6 });
  }
  const studyDecor = createStudyDecor({ woodMaterial: architectureWoodMat, brassMaterial: crestBrassMat, candles: studyCandles });
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
  // Dressing bays leave the entry, stair approach and mirror clear.
  // The rear-left downstairs bay is reserved for Annabelle and her chair.
  addShelf(-7.75, 1.4, -2, false, true, { index: 0 });
  [-2.4, 0.4].forEach((x) => addShelf(x, 1.4, -6.25, true, true, { index: x === 0.4 ? 1 : 5 }));
  [-4.8, -2].forEach((z) => addShelf(-7.75, LOFT_Y + 1.4, z, false, true, { index: z === -2 ? 2 : 6, loft: true }));
  addShelf(7.75, LOFT_Y + 1.4, -4.8, false, true, { index: 4, loft: true });
  [-1.5, 1.3].forEach((x) => addShelf(x, LOFT_Y + 1.4, -6.25, true, true, { index: 3, loft: true }));

  // Floor-centred metre-scale fireplace, facing into the room from the same wall slot.
  const fireplace = new THREE.Group();
  fireplace.name = 'Victorian_Fireplace';
  fireplace.position.set(-5.3, 0, -6.26);
  group.add(fireplace);
  // Slips, slate, iron and the fender (studyFireplace.js), and a low fire in
  // the grate (world/HearthFire.js). Both built now, so the warm-up sees the
  // fire's light and shaders; only the GLB's re-surfacing waits for its load.
  const fireplaceDressing = createStudyFireplaceDressing({ brassMaterial: crestBrassMat });
  fireplace.add(fireplaceDressing.group);
  const hearthFire = createHearthFire();
  fireplace.add(hearthFire.group);
  // The storm's blackout (studyBlackout.js): the moon and the lightning
  // are made here, with every other light, so the warm-up sees all of them.
  const blackout = createStudyBlackout({
    // The desk lamp is the room's one electric light now (the ceiling fills
    // went with main's 2026-10-28 lighting pass); the candles and the fire
    // are the blackout's own business.
    group, interactables, roomLights: [lamp], ambient,
    candles: studyCandles, hearth: hearthFire, loftY: LOFT_Y,
    loadBoard: loadStudyModel, loadFuse: loadModel,
    showCaption, onSfx,
    onBreakerThrown: (kind) => onBreakerThrown(kind),
    hasFuse: () => gameState.inventory.has('studyFuse'),
    onFuseTaken: () => { onSfx('metal_click'); onPickUpItem('studyFuse'); },
    onFuseFitted: () => onUseItem('studyFuse')
  });
  {
    const fender = fireplaceDressing.fenderBounds;
    colliders.push({
      minX: fireplace.position.x + fender.minX, maxX: fireplace.position.x + fender.maxX,
      minZ: fireplace.position.z + fender.minZ, maxZ: fireplace.position.z + fender.maxZ,
      minY: 0, maxY: fender.maxY
    });
  }
  loadStudyModel(victorianFireplaceUrl).then((model) => {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    fireplaceDressing.dressModel(model);
    fireplace.add(model);
  }).catch((error) => console.warn('Victorian fireplace could not load:', error));
  colliders.push({
    minX: -6.25, maxX: -4.35, minZ: -6.49, maxZ: -6.03,
    minY: 0, maxY: 1.46
  });

  const rugMap = new THREE.TextureLoader().load(victorianRugUrl);
  rugMap.colorSpace = THREE.SRGBColorSpace; rugMap.anisotropy = 4;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(STUDY_RUG.width, STUDY_RUG.depth),
    new THREE.MeshStandardMaterial({ map: rugMap, color: 0xddd1bc, roughness: 1 }));
  rug.name = 'Study_Large_Worn_Persian_Carpet';
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(STUDY_RUG.x, STUDY_RUG.y, STUDY_RUG.z);
  group.add(rug);

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
  const keyholeShape = new THREE.Shape();
  const keyholeJoin = Math.acos(0.004 / 0.009);
  keyholeShape.moveTo(0.004, -0.025);
  keyholeShape.lineTo(0.004, -Math.sqrt(0.009 ** 2 - 0.004 ** 2));
  keyholeShape.absarc(0, 0, 0.009, -keyholeJoin, Math.PI + keyholeJoin, false);
  keyholeShape.lineTo(-0.004, -0.025);
  keyholeShape.closePath();
  // A real opening in one thin plate, rather than a dark decal over brass.
  // Mount on the outward (+Z) face, near the meeting stile of the closed doors.
  const lockOutline = new THREE.Shape();
  lockOutline.moveTo(-0.0185, -0.0375);
  lockOutline.lineTo(0.0185, -0.0375);
  lockOutline.quadraticCurveTo(0.0225, -0.0375, 0.0225, -0.0335);
  lockOutline.lineTo(0.0225, 0.0335);
  lockOutline.quadraticCurveTo(0.0225, 0.0375, 0.0185, 0.0375);
  lockOutline.lineTo(-0.0185, 0.0375);
  lockOutline.quadraticCurveTo(-0.0225, 0.0375, -0.0225, 0.0335);
  lockOutline.lineTo(-0.0225, -0.0335);
  lockOutline.quadraticCurveTo(-0.0225, -0.0375, -0.0185, -0.0375);
  lockOutline.holes.push(new THREE.Path(keyholeShape.getPoints().reverse()));
  const archiveLock = new THREE.Mesh(new THREE.ExtrudeGeometry(lockOutline, {
    depth: 0.003, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0002,
    bevelSegments: 1, curveSegments: 12, steps: 1
  }), crestBrassMat);
  archiveLock.position.set(0.22, -0.15, 0.0232);
  archiveDoor.add(archiveLock);
  for (const y of [-0.031, 0.031]) {
    const screw = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), crestBrassMat);
    screw.scale.z = 0.35;
    screw.position.set(0, y, 0.0035);
    archiveLock.add(screw);
  }
  const archiveKeyhole = new THREE.Group();
  archiveKeyhole.name = 'MemoryArchive_Keyhole';
  archiveKeyhole.position.z = -0.0005;
  archiveLock.add(archiveKeyhole);
  archiveKeyhole.add(new THREE.Mesh(new THREE.ShapeGeometry(keyholeShape), clockHandMat));
  const archiveUsedKey = buildBrassKey();
  archiveUsedKey.name = 'MemoryArchive_Used_Key_In_Lock';
  // The shaft enters along -Z; the bow stays outside. Parenting to the lock
  // keeps the inserted key seated as the door swings open.
  archiveUsedKey.position.z = 0.020;
  archiveUsedKey.rotation.x = -Math.PI / 2;
  archiveUsedKey.rotateY(0.65);
  archiveUsedKey.visible = false;
  archiveLock.add(archiveUsedKey);
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
    return createArchiveRecord(width, height, 13, { fontSize: 17, paddingY: 6 });
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
        voiceProgress(); readEvidence(`memory-record-${index}`);
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
      onInteract: () => { showCaption(text); voiceProgress(); readEvidence(`memory-clue-${index}`); }
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
      onUseItem('archiveKey');
      puzzle.memoryArchiveUnlocked = true;
      archiveUsedKey.visible = true;
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
  visorHitbox.userData.hintKey = 'l3_visor';
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
      voiceProgress();
      showCaption('CALIBRATION VISOR ACQUIRED — Press V to toggle.');
      onThought('l3_04', { priority: 40 });
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
  for (const trail of [distortedTrail, bloodTrail]) trail.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.userData.hintKey = 'l3_trail';
    mesh.userData.interact = { label: 'Examine the trail', onInteract: () => {
      if (!puzzle.memoryVisorCollected || puzzle.mirrorRevealInProgress) return;
      onThought('l3_06', { replayable: true, priority: 30 });
    }};
    interactables.push(mesh);
  });


  // A shallow restricted archive alcove stands in front of the rear shelves;
  // no wall, shelf, or stair geometry needs to be moved to reveal it.
  const hollowAlcove = new THREE.Group();
  hollowAlcove.position.set(4.4, LOFT_Y, -6.255);
  group.add(hollowAlcove);
  const restrictedContents = new THREE.Group();
  restrictedContents.name = 'RestrictedArchiveContents';
  restrictedContents.visible = false;
  hollowAlcove.add(restrictedContents);
  // The final exit bolts still share this material with the former alcove shell.
  const alcoveMat = new THREE.MeshStandardMaterial({ color: 0x272725, metalness: 0.4, roughness: 0.88 });
  const restrictedPlaque = createArchiveRecord(1.28, 0.24, 6, { fontSize: 18, paddingY: 10 });
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
  restrictedContents.add(restrictedHeaderMount, restrictedPlaque.mesh);
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
  const annabelleLetterBody = ANNABELLE_FINAL_LETTER;
  const truthDrawer = new THREE.Group();
  // Recess the complete compartment behind the outer doors (rear z = 0.2675),
  // including the pull and its mounting posts.
  truthDrawer.position.set(0, 0.45, 0.17);
  restrictedContents.add(truthDrawer);
  const truthDrawerFront = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.26, 0.05, 1, 0.005), restrictedCabinetMat);
  truthDrawerFront.position.z = -0.01;
  const truthDrawerFloor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.03, 0.23), restrictedCabinetMat);
  truthDrawerFloor.position.set(0, -0.1, -0.155);
  const truthDrawerHandle = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.018, 0.018, 1, 0.004), crestBrassMat);
  truthDrawerHandle.name = 'LetterCompartmentPull';
  const letterDoorHinge = new THREE.Group();
  letterDoorHinge.name = 'LetterCompartmentHinge';
  letterDoorHinge.position.set(0, -0.13, -0.01);
  truthDrawerFront.position.set(0, 0.13, 0);
  truthDrawerHandle.position.set(0, 0, 0.052);
  for (const x of [-0.065, 0.065]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.028, 10), crestBrassMat);
    post.rotation.x = Math.PI / 2;
    post.position.set(x, 0, 0.038);
    truthDrawerFront.add(post);
  }
  truthDrawerFront.add(truthDrawerHandle);
  letterDoorHinge.add(truthDrawerFront);
  truthDrawer.add(letterDoorHinge, truthDrawerFloor);
  const letterDoorMotion = hingeMotion([[letterDoorHinge, 1]], 'x', Math.PI * 0.51, 0.75);
  const truthRecordDisplays = [];
  const truthRecordHits = [];
  /**
   * A lit border round each record while it is selected, so the order picked
   * so far can be seen and not only read off the prompt. Just outside the
   * record's frame (0.444 x 0.48, its face at z 0.25).
   */
  const truthRecordBorders = [];
  const truthRecordBorderMat = new THREE.MeshBasicMaterial({ color: 0xf0c878, toneMapped: false });
  function truthRecordBorder() {
    const [outerW, outerH, innerW, innerH] = [0.444 / 2 + 0.022, 0.48 / 2 + 0.022, 0.444 / 2 + 0.006, 0.48 / 2 + 0.006];
    const shape = new THREE.Shape([
      new THREE.Vector2(-outerW, -outerH), new THREE.Vector2(outerW, -outerH),
      new THREE.Vector2(outerW, outerH), new THREE.Vector2(-outerW, outerH)
    ]);
    shape.holes.push(new THREE.Path([
      new THREE.Vector2(-innerW, -innerH), new THREE.Vector2(-innerW, innerH),
      new THREE.Vector2(innerW, innerH), new THREE.Vector2(innerW, -innerH)
    ]));
    const border = new THREE.Mesh(new THREE.ShapeGeometry(shape), truthRecordBorderMat);
    border.name = 'Restricted_Record_Selected_Border';
    border.visible = false;
    return border;
  }
  function updateTruthRecords(corrected = gameState.visorWorn) {
    // The same mounted title card reveals the clue; the lower pages stay fixed.
    restrictedPlaque.write(corrected
      ? ['Authorization precedes the method;', 'the consequence closes the file.']
      : ['PROJECT HOLLOW', '\u2014 RESTRICTED RECORDS']);
    truthRecordDisplays.forEach((display, index) => {
      const selected = puzzle.truthRecordsSolved || index < puzzle.truthRecordProgress;
      const heading = truthRecordNames[index];
      display.write([heading, ...truthNormalLines[index]]);
      truthRecordHits[index].userData.interact.label = `${selected ? 'Selected: ' : 'Select '}${truthRecordNames[index]}`;
      truthRecordBorders[index].visible = selected;
    });
  }
  truthRecordNames.forEach((name, index) => {
    // Keep logical indices intact; the physical slots read OUTCOME / CONSENT / PROCEDURE.
    const x = [0, 0.46, -0.46][index];
    const display = createArchiveRecord(0.404, 0.44, index + 7);
    display.mesh.position.set(x, 1.30, 0.24);
    restrictedContents.add(display.mesh);
    truthRecordDisplays.push(display);
    const border = truthRecordBorder();
    border.position.set(x, 1.30, 0.255);
    restrictedContents.add(border);
    truthRecordBorders.push(border);
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
        voiceProgress();
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
        readEvidence(`truth-record-${index}`); correctedEvidence();
        if (puzzle.truthRecordsSolved) voiceProgress('letter');
      }
    };
    restrictedContents.add(hit);
    truthRecordHits.push(hit);
  });
  updateTruthRecords();

  function syncTruthRecordTargets() {
    // Interaction raycasts a flat target list, even under hidden parents.
    // Register selectors only after the cabinet has actually swung open.
    const accessible = puzzle.correctedTrailSolved && restrictedDoorMotion.isOpen();
    for (const hit of truthRecordHits) {
      const index = interactables.indexOf(hit);
      if (accessible && index < 0) interactables.push(hit);
      else if (!accessible && index >= 0) interactables.splice(index, 1);
    }
  }

  // Furniture stays static. Original puzzle panels, hit targets and slide clocks stay separate.
  let restrictedCabinetCollider;
  for (const station of [memoryArchive, hollowAlcove]) {
    const collider = {
      minX: station.position.x - 0.82, maxX: station.position.x + 0.82,
      minZ: station.position.z - 0.235, maxZ: station.position.z + 0.285,
      minY: LOFT_Y, maxY: LOFT_Y + 2.26
    };
    colliders.push(collider);
    if (station === hollowAlcove) restrictedCabinetCollider = collider;
  }
  function syncRestrictedCabinetCollision() {
    // Camera-mounted hands extend beyond the player's 35 cm body radius.
    // Leave another 25 cm around this cabinet, including the opening leaves.
    const handClearance = 0.25;
    const doorReach = 0.70 * Math.max(
      Math.abs(Math.sin(restrictedLeftHinge.rotation.y)),
      Math.abs(Math.sin(restrictedRightHinge.rotation.y))
    );
    Object.assign(restrictedCabinetCollider, {
      minX: hollowAlcove.position.x - 0.82 - handClearance,
      maxX: hollowAlcove.position.x + 0.82 + handClearance,
      maxZ: hollowAlcove.position.z + 0.29 + doorReach + 0.045 + handClearance
    });
  }
  syncRestrictedCabinetCollision();
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
  restrictedPresentation.records(restrictedContents, 0.24, 0.48, true, false);
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
        correctedEvidence();
        voiceProgress();
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
      voiceProgress();
      letterReading = true;
      const letterGeneration = mirrorRevealGeneration;
      onReadLetter({
        body: annabelleLetterBody,
        onFinished: () => {
          if (letterGeneration !== mirrorRevealGeneration || puzzle.truthRecordsComplete || !puzzle.truthRecordsSolved) return;
          letterReading = false;
          letterHit.visible = false;
          const hitIndex = interactables.indexOf(letterHit);
          if (hitIndex >= 0) interactables.splice(hitIndex, 1);
          puzzle.truthRecordsComplete = true;
          puzzle.mirrorUnlocked = true;
          gameState.letterRead = true;
          if (!interactables.includes(mirrorGlass)) interactables.push(mirrorGlass);
          // Start directly from closing the letter; the mirror target remains a retry
          // only if a cancelled/failed scene could not finish this generation.
          void mirrorGlass.userData.interact.onInteract();
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
    minX: 4.33, maxX: 5.27, minZ: -6.496, maxZ: -6.28,
    minY: 0, maxY: 2.32
  });
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.674, 1.77),
    new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 1, roughness: 0.05 })
  );
  // The real reflection, laid a millimetre in front of the dull glass above and
  // hidden until the last cupboard's letter is read -- the moment the player is
  // meant to look into it. See world/HauntedMirror.js. Not an interactable:
  // the prompt stays on mirrorGlass, which the Interaction raycast still hits.
  const mirror = createHauntedMirror({ widthInMetres: 0.674, heightInMetres: 1.77 });
  mirror.mesh.position.z = 0.001;
  mirrorGlass.add(mirror.mesh);
  mirrorGlass.position.set(4.8, 1.08, mirrorFrame.position.z + 0.052);
  let mirrorPresentation = null;
  function setMirrorRevealSight() {
    mirrorPresentation?.setCorrected(gameState.visorWorn);
  }
  dressStudyMirror(mirrorFrame, mirrorGlass, studySurfaces.woodMaterial(0.78, 'feature'), crestBrassMat);
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
          showAnnabelle(false);
          return;
        }
        puzzle.mirrorRevealed = true;
        syncRevealedFigure();
        hollowOverrideKey.visible = !puzzle.hasHollowOverrideKey;
        hollowOverrideKeyHit.visible = !puzzle.hasHollowOverrideKey;
        if (!puzzle.hasHollowOverrideKey && !interactables.includes(hollowOverrideKeyHit)) {
          interactables.push(hollowOverrideKeyHit);
        }
        mirrorGlass.userData.interact.label = 'The reflection is still';
      } catch (error) {
        showAnnabelle(false);
        console.error('Study reveal could not complete:', error);
      } finally {
        if (generation === mirrorRevealGeneration) puzzle.mirrorRevealInProgress = false;
      }
    }
  };
  group.add(mirrorGlass);

  // The two perceptions share a guarded adult silhouette behind the chair.
  // See annabelleFigure.js. Hidden until the mirror shows her.
  const annabelleFigure = createAnnabelle();
  const annabelle = annabelleFigure.root;
  annabelle.position.set(-7.38,0,-6.06);
  // The source is 1.55m tall: a modest uniform fit gives an adult ~1.70m figure.
  annabelle.scale.setScalar(1.1);
  // Facing out of the corner, toward where the reveal's camera stands
  // (2.4 m along x and 1.3 m along z from her; main.js, onLookInMirror).
  annabelle.rotation.y = Math.atan2(CHAIR_EYE[0]-annabelle.position.x,CHAIR_EYE[2]-annabelle.position.z);
  annabelle.visible = false;
  const annabelleStart=annabelle.position.clone(),annabelleStartYaw=annabelle.rotation.y;
  group.add(annabelle);
  // One logical person; independent skeletons prevent mirror posing from
  // leaking into the corner. Only one representation is ever drawn.
  const annabelleMonster=createOkabeCreature({restCorrection:0,gait:'player',scale:.9,personProportions:true});
  annabelleMonster.visible=false;annabelleMonster.setTwitches(false);
  group.add(annabelleMonster.group);
  const cornerReady=Promise.all([annabelleMonster.ready,annabelleFigure.ready]).then(()=>{
    annabelleMonster.setYaw(annabelle.rotation.y-Math.PI);
    updateStudyCreature(annabelleMonster,0);
    annabelleFigure.setCrouched(true);
    alignStudyCreature(annabelleMonster,[annabelle.position.x,annabelle.position.z],annabelleFigure.getPoseAnchors());
    annabelleFigure.setCrouched(false);
    attachCardToHand(false);
  });
  /** Solid only while she is there to bump into: parked out of reach when hidden. */
  const ANNABELLE_BOX = { minX: annabelle.position.x - 0.22, maxX: annabelle.position.x + 0.22,
    minZ: annabelle.position.z - 0.22, maxZ: annabelle.position.z + 0.22, minY: 0, maxY: 1.72 };
  const annabelleCollider = { minX: -1000, maxX: -1000, minZ: -1000, maxZ: -1000, minY: 0, maxY: 0 };
  colliders.push(annabelleCollider);
  function showAnnabelle(on) {
    annabelle.visible = on;
    Object.assign(annabelleCollider, on ? ANNABELLE_BOX
      : { minX: -1000, maxX: -1000, minZ: -1000, maxZ: -1000, minY: 0, maxY: 0 });
  }
  let revealChairActive=false;
  function syncRevealedFigure() {
    mirrorPresentation?.setCorrected(gameState.visorWorn);
    if(!puzzle.mirrorRevealed&&!revealChairActive)return;
    const on=gameState.visorWorn;
    annabelleFigure.setCrouched(true);annabelleFigure.setCorrectedSight(on);
    if(on&&!annabelle.visible&&!puzzle.mirrorRevealed)annabelleFigure.beginReveal();
    showAnnabelle(on);annabelleMonster.visible=!on;
    syncPersonRoots();
    if(cardPerformance)syncOfferedCard();
    Object.assign(annabelleCollider,ANNABELLE_BOX);
    mirrorPresentation?.setCorrected(on);
  }
  // The chair's GLB is authored at metre scale, floor-centred, facing +Z into
  // the study. Leave a pocket behind it and a clear approach past the fireplace.
  const concealmentChair = new THREE.Group();
  concealmentChair.name = 'Annabelle_Wingback_Chair';
  concealmentChair.position.set(-6.98, 0, -4.98);
  concealmentChair.scale.setScalar(1);
  concealmentChair.rotation.y = 0.52;
  // Her open hand rests on the rear shoulder of the existing chair shell.
  concealmentChair.updateMatrixWorld(true);
  const injuredBracePoint=annabelle.localToWorld(new THREE.Vector3(-.23,.94,.12));
  annabelleFigure.setBracePoint(injuredBracePoint);
  annabelleMonster.studyBracePoint=injuredBracePoint;
  group.add(concealmentChair);
  const chairReady=loadModel(annabelleChairUrl).then((model) => {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    // Keep the chair's authored UVs and opaque textile/wood assignments intact.
    model.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of [].concat(object.material)){
        material.side=THREE.FrontSide;material.transparent=false;material.opacity=1;
        material.depthWrite=true;material.depthTest=true;material.roughness=Math.max(.82,material.roughness);
        for(const texture of [material.map,material.roughnessMap])if(texture){
          texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
          texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;
        }
        material.needsUpdate=true;
      }
    });
    if(!concealmentChair.children.length)concealmentChair.add(model);
  }).catch((error) => console.warn('Annabelle chair could not load:', error));
  // Transform the authored footprint so no collision remains at the old position.
  concealmentChair.updateMatrixWorld(true);
  const chairBounds = new THREE.Box3(new THREE.Vector3(-0.575, 0, -0.459),
    new THREE.Vector3(0.575, 1.6, 0.471)).applyMatrix4(concealmentChair.matrixWorld);
  colliders.push({ minX: chairBounds.min.x, maxX: chairBounds.max.x,
    minZ: chairBounds.min.z, maxZ: chairBounds.max.z, minY: 0, maxY: 1.6 });

  const hollowOverrideKey = createHollowCard();
  hollowOverrideKey.name = 'HollowOverrideKey';
  hollowOverrideKey.scale.setScalar(1.12);
  hollowOverrideKey.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.material=mesh.material.clone();mesh.material.side=THREE.DoubleSide;
    // Modest albedo lift on this reveal prop only; no extra lights or global mix changes.
    mesh.material.emissive.setHex(0x484438);mesh.material.emissiveIntensity=.18;
    if(mesh.material.map)mesh.material.emissiveMap=mesh.material.map;
  });
  let cardPerformance=null,offerAmount=0;
  const personFinal=new THREE.Vector3(.86,0,-.77).applyAxisAngle(new THREE.Vector3(0,1,0),.52).add(new THREE.Vector3(-6.98,0,-4.98));
  const eased=value=>THREE.MathUtils.smoothstep(value,0,1);
  function freeHandTarget(){return annabelle.localToWorld(new THREE.Vector3(-.23,.94,.12));}
  function offeredHandTarget(){return annabelle.localToWorld(new THREE.Vector3(-.18,1.06,.25));}
  function syncPersonRoots(){
    const offset=annabelleMonster.studyPositionOffset||[0,0];
    annabelleMonster.setPosition(annabelle.position.x+offset[0],annabelle.position.z+offset[1]);
    annabelleMonster.setYaw(annabelle.rotation.y-Math.PI);
    annabelleMonster.studyBracePoint=annabelleFigure.getHandPosition()||freeHandTarget();
    updateStudyCreature(annabelleMonster,0);
    Object.assign(ANNABELLE_BOX,{minX:annabelle.position.x-.22,maxX:annabelle.position.x+.22,
      minZ:annabelle.position.z-.22,maxZ:annabelle.position.z+.22});
    if(puzzle.mirrorRevealed||revealChairActive)Object.assign(annabelleCollider,ANNABELLE_BOX);
  }
  function attachCardToHand(visible){
    const hand=gameState.visorWorn?annabelleFigure.getHandBone():annabelleMonster.refs?.hands?.r;
    if(!hand)return;
    // The single physical card follows whichever perception is drawn.
    hand.updateWorldMatrix(true,false);
    if(hollowOverrideKey.parent!==hand)hand.attach(hollowOverrideKey);
    // Pinch the lower corner at the index phalanx instead of balancing the
    // card over an open palm. The same grip point follows the monster wrist.
    const index=annabelleFigure.getCardGripBone();
    const sourceHand=annabelleFigure.getHandBone();
    const offset=index&&sourceHand?index.getWorldPosition(new THREE.Vector3()).sub(sourceHand.getWorldPosition(new THREE.Vector3())):new THREE.Vector3();
    const world=hand.getWorldPosition(new THREE.Vector3()).add(offset)
      .add(new THREE.Vector3(.035,.022,.003).applyQuaternion(annabelle.quaternion));
    hollowOverrideKey.position.copy(hand.worldToLocal(world));
    hollowOverrideKey.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(annabelle.quaternion));
    const worldScale=hand.getWorldScale(new THREE.Vector3());
    hollowOverrideKey.scale.set(1.12/worldScale.x,1.12/worldScale.y,1.12/worldScale.z);
    hollowOverrideKey.visible=visible&&!puzzle.hasHollowOverrideKey;
    hollowOverrideKey.updateWorldMatrix(false,true);
  }
  function syncOfferedCard(){
    if(!cardPerformance)return;
    attachCardToHand(true);
    hollowOverrideKey.getWorldPosition(hollowOverrideKeyHit.position);
    hollowOverrideKeyHit.position.add(new THREE.Vector3(0,0,.025).applyQuaternion(annabelle.quaternion));
    hollowOverrideKeyHit.quaternion.copy(annabelle.quaternion);
    hollowOverrideKeyHit.visible=offerAmount>.97&&!puzzle.hasHollowOverrideKey;
    if(hollowOverrideKeyHit.visible&&!interactables.includes(hollowOverrideKeyHit))interactables.push(hollowOverrideKeyHit);
  }
  function resetCardPerformance(){
    cardPerformance=null;offerAmount=0;
    annabelleFigure.setLocomotion(0,0);annabelleMonster.studyWalkSpeed=annabelleMonster.studyWalkPhase=0;
    annabelle.position.copy(annabelleStart);annabelle.rotation.y=annabelleStartYaw;
    annabelleFigure.setHandOffer(0);annabelleFigure.setOfferTarget(null,0);
    annabelleFigure.setBracePoint(freeHandTarget());
    annabelleMonster.studyBracePoint=freeHandTarget();syncPersonRoots();
    attachCardToHand(false);
  }
  function prepareCardPerformance(options){
    if(cardPerformance||puzzle.hasHollowOverrideKey)return;
    cardPerformance={...options,lastTime:options.audioAt,lastPosition:annabelle.position.clone(),phase:0};attachCardToHand(true);
  }
  function updateCardPerformance(t){
    const beat=cardPerformance;if(!beat)return;
    // A single small shift forward; no circling, crouch or reach into the chair.
    const move=eased((t-beat.audioAt)/1.25);
    annabelle.position.copy(annabelleStart).lerp(personFinal,move);
    const delta=t-beat.lastTime,distance=annabelle.position.distanceTo(beat.lastPosition);
    const speed=delta>0&&delta<.25?distance/delta:0;
    beat.phase+=distance/.85*Math.PI*2;beat.lastTime=t;beat.lastPosition.copy(annabelle.position);
    annabelleFigure.setLocomotion(speed,beat.phase);
    annabelleMonster.studyWalkSpeed=speed;annabelleMonster.studyWalkPhase=beat.phase;
    annabelle.rotation.y=Math.atan2(CHAIR_EYE[0]-annabelle.position.x,CHAIR_EYE[2]-annabelle.position.z);
    offerAmount=eased((t-beat.audioAt+.10)/Math.max(.7,beat.decideAt-.15));
    annabelleFigure.setRestHandTarget(freeHandTarget());
    annabelleFigure.setHandOffer(offerAmount);
    annabelleFigure.setOfferTarget(offeredHandTarget(),offerAmount);
    annabelleFigure.setAttention(null,0);
    annabelleFigure.update(0,getPlayerPosition()||new THREE.Vector3(...CHAIR_EYE));
    syncPersonRoots();syncOfferedCard();
  }
  hollowOverrideKey.visible=false;
  group.add(hollowOverrideKey);
  const hollowOverrideKeyHit=new THREE.Mesh(new THREE.BoxGeometry(.22,.18,.14),archiveHitMat);
  hollowOverrideKeyHit.visible=false;
  hollowOverrideKeyHit.userData.interact = {
    label: 'Take the PROJECT HOLLOW ACCESS KEYCARD',
    onInteract: () => {
      if (!puzzle.mirrorRevealed || puzzle.hasHollowOverrideKey) return;
      puzzle.hasHollowOverrideKey = true;
      onPickUpItem('hollowOverrideKey');
      hollowOverrideKey.visible = false;
      hollowOverrideKeyHit.visible = false;
      const index = interactables.indexOf(hollowOverrideKeyHit);
      if (index >= 0) interactables.splice(index, 1);
      onSfx('keys_pickup');
      showCaption('PROJECT HOLLOW ACCESS KEYCARD ACQUIRED');
    }
  };
  group.add(hollowOverrideKeyHit);

  // The final front door is controlled by the Override Key sockets only.
  const frontDoor = new THREE.Group();
  frontDoor.name = 'Final_Exit_Door';
  frontDoor.position.set(DOOR_X, 0, ROOM_D / 2 - 0.05);
  group.add(frontDoor);

  /**
   * THE LEAF, AND WHY IT NO LONGER FILLS THE DOORWAY.
   *
   * It was a 1.78 x 2.98 slab: the whole 3 m opening, floor to lintel, in one
   * piece. No front door is built like that. A leaf that tall is out of all
   * proportion to the person walking through it, and it is what made this
   * door read as a board standing in a hole. A Victorian front door is a leaf
   * of about 2.4 m under a transom rail, with a fanlight above that lit the
   * hall of a house with no electric light. So the leaf is 2.42 m now; the
   * frame (dressFinalStudyExit) supplies the rail and the glass, and the
   * opening itself is unchanged -- the walls, colliders and porch outside all
   * still meet a 1.8 x 3.0 doorway.
   *
   * ONE WOOD. The doorway used to show six wood materials in three textures,
   * which is a large part of why it looked patched together. Leaf, frame and
   * mouldings are all trimMat now: the espresso of the skirting, the entry
   * door and the window trims, so the skirting runs into plinths of its own
   * wood. Only the nine panels are a tone lighter (the stair treads' cached
   * material, so nothing new is compiled), because they are the security code
   * and have to stay countable from across the room.
   */
  const SLAB_W = 1.78;
  const SLAB_H = 2.42;
  const SLAB_T = 0.09;
  /** 5 mm clear of the floor, so the leaf's underside never lies in the floor's plane. */
  const LEAF_BOTTOM = 0.005;
  const exitWood = trimMat;
  // The old panels' own lighter wood: they are the keypad code and must stand out.
  const panelWood = studySurfaces.woodMaterial(0.95);
  const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W, SLAB_H, SLAB_T), exitWood);
  doorSlab.name = 'Final_Exit_Leaf';

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
  /**
   * THE PIN IS ON THE LEAF'S PORCH-SIDE EDGE, not its centre line.
   *
   * Turning about the centre line swung the outer half of the 9 cm leaf back
   * past the pin as it opened -- 4.5 cm of door through the lining, the porch
   * reveal and the casing outside, every time. A door that opens outward is
   * hung on its outside face, and turning about that corner keeps the whole
   * leaf on the opening's side of the pin at every angle: the room-face corner
   * moves in by 9 cm x sin(angle) and never out. The slab is offset back by the
   * same half thickness, so the closed door stands exactly where it did.
   */
  const doorHinge = new THREE.Object3D();
  doorHinge.name = 'Final_Exit_Hinge';
  doorHinge.position.set(-SLAB_W / 2, 0, SLAB_T / 2);
  frontDoor.add(doorHinge);
  doorHinge.add(doorSlab);
  doorSlab.position.set(SLAB_W / 2, LEAF_BOTTOM + SLAB_H / 2, -SLAB_T / 2);

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
   * swing with it, and so do the knob and the three lock escutcheons on the
   * stile. The reseal bolts are children of `frontDoor` instead, because those
   * are bars thrown across the frame and stay where they are.
   *
   * Layout: the slab is SLAB_W x SLAB_H centred on its own origin. The panel
   * field takes the hinge-side 62% (slab -x) and the lock stile the rest,
   * which is how real joinery does it -- a lock goes through the stile, never
   * through a panel -- and which also keeps every lock and the knob clear of
   * every panel a player has to count.
   */
  const PANEL_FIELD_WIDTH_FRACTION = 0.62;

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
        // 1.1 cm proud of the room face, its back 3 mm inside the leaf.
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(span.width * fieldW, rowH, 0.014),
          panelWood
        );
        panel.position.set(
          fieldX + (span.x + span.width / 2) * fieldW,
          rowCentreY,
          -(SLAB_T / 2 + 0.004)
        );
        panel.userData.finalExitPanel = true;
        doorSlab.add(panel);
      }
    });
  }

  // The frame, fanlight, mouldings and brass. See studyHeroPresentation.js.
  const { lockHeights } = dressFinalStudyExit({
    frontDoor, hinge: doorHinge, slab: doorSlab,
    opening: { width: DOORWAY_W, height: DOORWAY_H, wallZ: frontZ - frontDoor.position.z },
    wood: exitWood, panelWood, brass: crestBrassMat
  });

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

  // One physical card, two irreversible readers. State commits before callbacks.
  const overrideSockets = [];
  let overrideAuthorization = null;
  let overrideTurning = null;
  let overrideTurnProgress = 0;
  const resealBolts = new THREE.Group();
  resealBolts.name='Study_Containment_Bolts';
  frontDoor.add(resealBolts);
  // Forged steel crossbars in fixed, bolted sleeves. No extra lights or shadows.
  const steel=new THREE.MeshStandardMaterial({color:0x7c8388,metalness:.82,roughness:.34,
    roughnessMap:archiveToken.children[0].material.roughnessMap});
  const darkSteel=new THREE.MeshStandardMaterial({color:0x41474b,metalness:.74,roughness:.46});
  const bars=[];let barRelease=0;
  for(const y of lockHeights){
    const bar=new THREE.Mesh(new RoundedBoxGeometry(1.90,.105,.055,1,.012),steel);
    bar.position.set(0,y,-.102);bar.castShadow=false;bar.receiveShadow=true;
    resealBolts.add(bar);bars.push(bar);
    for(const x of [-.87,.87]){
      const sleeve=new THREE.Mesh(new THREE.BoxGeometry(.20,.24,.085),darkSteel);
      sleeve.position.set(x,y,-.104);frontDoor.add(sleeve);
      for(const dy of [-.085,.085]){
        const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.019,.019,.014,6),steel);
        bolt.rotation.x=Math.PI/2;bolt.position.set(x,y+dy,-.153);frontDoor.add(bolt);
      }
    }
  }
  function setContainmentBars(progress){
    barRelease=THREE.MathUtils.clamp(progress,0,1);
    resealBolts.visible=barRelease<1;
    for(const bar of bars)bar.position.x=-2.05*barRelease;
  }
  setContainmentBars(0);
  function updateOverrideLabels() {
    overrideSockets.forEach(socket=>{
      const {display,choice,reader,handle}=socket;
      const committed=puzzle.endingChoice!=='NONE';
      const locked=(committed&&puzzle.endingChoice!==choice)||(!committed&&overrideAuthorization&&overrideAuthorization!==choice);
      socket.state=locked?'locked':committed?'committed':overrideAuthorization===choice?'authorized':'ready';
      reader.setAuthorized(socket.state==='authorized'||socket.state==='committed');
      reader.setLocked(!!locked);
      handle.root.userData.locked=!!locked;
      display.mesh.visible=true;
      display.write(locked?['LOCKED','OTHER CONTROL SELECTED']:committed?
        [choice==='RELEASE'?'RELEASE ENGAGED':'CONTAINMENT SEALED']:overrideAuthorization===choice?
        ['CARD ACCEPTED',choice==='RELEASE'?'TURN TO RELEASE':'TURN TO LOCK']:['PROJECT HOLLOW','ACCESS KEYCARD REQUIRED']);
    });
  }
  function authorizeOverride(choice,socket) {
    if(overrideAuthorization!==null||puzzle.endingChoice!=='NONE'||gameState.endingChosen)return;
    if(!puzzle.mirrorRevealed||!gameState.inventory.has('hollowOverrideKey')){
      showCaption('A PROJECT HOLLOW ACCESS KEYCARD is required.');return;
    }
    overrideAuthorization=choice;onUseItem('hollowOverrideKey');
    socket.installedKey.visible=true;socket.insertProgress=0;
    socket.installedKey.position.y=socket.cardY+.06;
    for(const {hit} of overrideSockets){const i=interactables.indexOf(hit);if(i>=0)interactables.splice(i,1);}
    if(!interactables.includes(socket.handleHit))interactables.push(socket.handleHit);
    onSfx('latch');updateOverrideLabels();
    showCaption(choice==='RELEASE'?'Emergency release authorized. Turn the control to release.':'Manual reseal authorized. Turn the handle to lock.');
  }
  function operateOverride(socket){
    if(overrideAuthorization!==socket.choice||socket.insertProgress<1||overrideTurning||puzzle.endingChoice!=='NONE'||gameState.endingChosen)return;
    // Physical handle operation is the irrevocable choice, before any callback.
    puzzle.endingChoice=socket.choice;puzzle.endingChoiceComplete=false;
    overrideTurning=socket;overrideTurnProgress=0;
    for(const panel of overrideSockets)for(const target of [panel.hit,panel.handleHit]){
      const i=interactables.indexOf(target);if(i>=0)interactables.splice(i,1);
    }
    updateOverrideLabels();onSfx('latch');
  }
  function completeOverride(socket){
    if(puzzle.endingChoiceComplete)return;
    puzzle.endingChoiceComplete=true;
    const detail={choice:socket.choice};
    if(socket.choice==='RELEASE'){
      doorState.open=true;setDoorSolid(false);
      onDoorOpening(frontDoor.getWorldPosition(new THREE.Vector3()));
      studyCandles.gust(frontDoor.getWorldPosition(new THREE.Vector3()),{strength:.85,radius:5,life:3.2});
      showCaption('Emergency release engaged.');onReleaseChosen(detail);
    }else{
      doorState.open=false;setDoorSolid(true);setContainmentBars(0);
      showCaption('Manual reseal engaged.');onResealChosen(detail);
    }
  }
  for (const [choice, x, z, rotation, modelUrl] of [
    ['RELEASE', 1.55, 6.49, Math.PI, emergencyReleasePanelUrl],
    ['RESEALED', -1.55, 6.49, Math.PI, manualResealPanelUrl]
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
    // Retrofit face covers the old generic lock opening, retaining the original housing.
    const faceZ = panelDepth + 0.017;
    const retrofit = new THREE.Mesh(new RoundedBoxGeometry(0.40, 0.30, 0.016, 1, 0.004), alcoveMat);
    retrofit.position.set(0, 0.025, panelDepth + 0.009); socketGroup.add(retrofit);
    const reader = createHollowReader(faceZ + 0.0005);
    reader.root.position.x = -0.113; reader.root.position.y = -0.01;
    socketGroup.add(reader.root);
    const header = studyLabel(0.34, 0.072, true, true);
    header.write(['PROJECT HOLLOW', isReleasePanel ? 'EMERGENCY RELEASE' : 'MANUAL RESEAL']);
    header.mesh.position.set(0, 0.220, panelDepth + 0.0025);
    for (const y of [0.220, -0.220]) {
      const mount = new THREE.Mesh(new RoundedBoxGeometry(0.355, 0.080, 0.028, 1, 0.003), alcoveMat);
      mount.position.set(0, y, panelDepth - 0.012); socketGroup.add(mount);
    }
    socketGroup.add(header.mesh);
    const handle = createResealHandle(faceZ + 0.001,isReleasePanel?'TURN TO RELEASE':'TURN TO LOCK');
    if (handle) socketGroup.add(handle.root);
    const panelFrontZ = z + Math.cos(rotation) * (panelDepth + (handle ? 0.073 : 0.046));
    colliders.push({
      minX: x - halfWidth, maxX: x + halfWidth,
      minZ: Math.min(z, panelFrontZ), maxZ: Math.max(z, panelFrontZ),
      minY: 1.35 - halfHeight, maxY: 1.35 + halfHeight
    });
    const installedKey = reader.installedCard;
    const display = studyLabel(0.345, 0.052, true, true);
    display.mesh.position.set(0, -0.220, panelDepth + 0.0025);
    socketGroup.add(display.mesh);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.22), archiveHitMat);
    hit.position.z = 0.09;
    const handleHit = handle ? new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.29, 0.075), archiveHitMat) : null;
    if (handleHit) {
      handleHit.position.set(0.085, 0.025, faceZ + 0.034);
      handleHit.userData.interact = {
        get label(){return choice==='RELEASE'?'Turn Emergency Release control - TURN TO RELEASE':'Turn Manual Reseal handle - TURN TO LOCK';},
        onInteract:()=>operateOverride(socket)
      };
      socketGroup.add(handleHit);
    }
    const socket = { choice,group:socketGroup,display,hit,installedKey,reader,handle,handleHit,cardY:installedKey.position.y,insertProgress:1,state:'ready' };
    hit.userData.interact = {
      get label() {
        const action = choice === 'RELEASE' ? 'Emergency Release' : 'Manual Reseal';
        return puzzle.mirrorRevealed && gameState.inventory.has('hollowOverrideKey')
          ? `Insert PROJECT HOLLOW access keycard - ${action}` : `${action} - requires PROJECT HOLLOW access keycard`;
      },
      onInteract: () => authorizeOverride(choice, socket)
    };
    socketGroup.add(hit);
    interactables.push(hit);
    overrideSockets.push(socket);
  }
  updateOverrideLabels();

  // The porch, its gate, the house front and everything outside: the yard,
  // the woods, the night sky and the rain. See studyExterior.js.
  const { porch, gate, exterior, nightLights, windowLight, update: updateExterior } = createStudyExterior({
    roomW: ROOM_W, roomD: ROOM_D, roomH: ROOM_H, doorX: DOOR_X,
    doorwayW: DOORWAY_W, doorwayH: DOORWAY_H, colliders
  });
  // The night outside lights the room too: a blackout turns it down with the rest.
  blackout.setFills(nightLights, { flash: windowLight });
  // The porch lamp and the map's picture light are on the house's power too.
  blackout.addRoomLights([porch.getObjectByName('Study_Porch_Lamp'), group.getObjectByName('Project_Hollow_Map_Wash')]);
  group.add(porch, exterior);

  // Decorative meshes only: no interaction registrations, lights, physics or new colliders.
  group.userData.studyDecorPropCount = studyDecor.dressRoom({
    group, desk, fireplace, concealmentChair, loftY: LOFT_Y
  });
  const entryFinish = new THREE.Group();
  entryFinish.rotation.y = -Math.PI / 2;
  entryDoor.add(entryFinish);
  dressStudyDoor(entryFinish, ENTRY_DOOR_W, ENTRY_DOOR_H, trimMat, crestBrassMat);
  studySurfaces.alignSurfaces(group, wallMat, ROOM_H);
  batchStudyPuzzleDetails(group);

  for (const [targets, key] of [
    [[hourHandHitbox, minuteHandHitbox], 'l3_clock'],
    [[crestHit, ...crestLampHits, crestClue], 'l3_crest'],
    [[archiveCabinetHit, ...memoryRecordHits], 'l3_memory'],
    [truthRecordHits, 'l3_restricted'], [[letterHit], 'l3_letter']
  ]) for (const target of targets) target.userData.hintKey = key;

  /**
   * AIR PUSHED OUT BY A SWINGING DOOR. A door or flap opening towards you
   * shoves the air in front of it into the room, and the candles near it lean
   * away and gutter for a second. One gust per opening, fired the frame the
   * hinge has visibly started to move (an edge on the hinge's own angle, so it
   * fires however the door was opened, and again after a restart closes it).
   *
   * Sized to the door, and short-ranged: the archives' tall double doors move
   * the most air and reach the sconces either side of them, about 1.5 m off;
   * the visor's cover and the letter flap are small and barely stir anything.
   * `at` and `offset` put the gust a little in front of the door, in the frame
   * of the cabinet it belongs to (which never moves, unlike the hinge itself).
   */
  const doorDraughts = [
    { hinge: archiveDoorHinge, axis: 'y', at: memoryArchive, offset: [0, 1.0, 0.75], strength: 0.5, radius: 2.2 },
    { hinge: restrictedLeftHinge, axis: 'y', at: hollowAlcove, offset: [0, 1.1, 0.75], strength: 0.55, radius: 2.3 },
    { hinge: visorCoverHinge, axis: 'y', at: memoryArchive, offset: [0, 0.68, 0.56], strength: 0.3, radius: 1.3 },
    { hinge: letterDoorHinge, axis: 'x', at: truthDrawer, offset: [0, 0, 0.35], strength: 0.25, radius: 1.2 },
    // The Shadow Crest's cover, when the puzzle is solved.
    { hinge: crestHinge, axis: 'y', at: shadowCrest, offset: [0, 0, 0.5], strength: 0.3, radius: 1.6 }
  ].map((door) => ({ ...door, open: false }));
  const draughtPoint = new THREE.Vector3();
  function updateDoorDraughts() {
    for (const door of doorDraughts) {
      const open = Math.abs(door.hinge.rotation[door.axis]) > 0.15;
      if (open && !door.open) {
        studyCandles.gust(door.at.localToWorld(draughtPoint.fromArray(door.offset)),
          { strength: door.strength, radius: door.radius, life: 1.8 });
      }
      door.open = open;
    }
  }

  function prepareRevealTest(direct=false){
          onResetLetter();
          // Invalidate a previously opened letter before its UI is closed.
          mirrorRevealGeneration++;letterReading=false;
          Object.assign(puzzle,{correctedTrailSolved:true,truthRecordsSolved:true,
            truthRecordsComplete:direct,mirrorUnlocked:direct,mirrorRevealInProgress:false,
            mirrorRevealed:false,hasHollowOverrideKey:false,endingChoice:'NONE',endingSequenceStarted:false});
          mirrorPresentation?.reset?.();mirror.reset();
          annabelleFigure.reset();showAnnabelle(false);annabelleMonster.visible=false;
          revealChairActive=false;resetCardPerformance();
            hollowOverrideKey.visible=false;hollowOverrideKeyHit.visible=false;
          const cardIndex=interactables.indexOf(hollowOverrideKeyHit);
          if(cardIndex>=0)interactables.splice(cardIndex,1);
          const mirrorIndex=interactables.indexOf(mirrorGlass);
          if(mirrorIndex>=0)interactables.splice(mirrorIndex,1);
          mirrorGlass.userData.interact.label='Look into the mirror';
          overrideAuthorization=null;overrideTurning=null;overrideTurnProgress=0;puzzle.endingChoiceComplete=false;
          setContainmentBars(0);
          for(const socket of overrideSockets){
            socket.insertProgress=1;socket.installedKey.position.y=socket.cardY;
            if(!interactables.includes(socket.hit))interactables.push(socket.hit);
            socket.installedKey.visible=false;socket.reader.setAuthorized(false);
            if(socket.handle)socket.handle.pivot.rotation.z=0;
            const i=interactables.indexOf(socket.handleHit);if(i>=0)interactables.splice(i,1);
          }
          doorState.open=false;doorHinge.rotation.y=0;setDoorSolid(true);
          restrictedDoorMotion.update(1,true);letterDoorMotion.update(1,true);
          restrictedContents.visible = true;
          syncTruthRecordTargets();
          syncRestrictedCabinetCollision();
          letterPaper.visible=!direct;letterHit.visible=!direct;
          const letterIndex=interactables.indexOf(letterHit);
          if(direct&&letterIndex>=0)interactables.splice(letterIndex,1);
          if(!direct&&letterIndex<0)interactables.push(letterHit);
          if(direct)interactables.push(mirrorGlass);
          updateTruthRecords(gameState.visorWorn);updateOverrideLabels(gameState.visorWorn);
  }

  // The hide-and-seek's cover, hide spots and throwables: placeholders until
  // pass 2's models (studyHideProps.js, docs/LEVEL3_HIDE_AND_SEEK.md).
  const hideProps = createStudyHideProps({
    group, colliders, interactables, loftY: LOFT_Y,
    loadModel: loadStudyModel,
    onEnterHideSpot: (spot) => onEnterHideSpot(spot)
  });
  const throwables = createStudyThrowables({
    group, interactables, loftY: LOFT_Y, loadModel: loadStudyModel,
    canTake: (id) => canCarryMore(id),
    onTake: (id) => { onSfx('cloth'); onPickUpItem(id); },
    showCaption
  });

  return {
    group,
    interactables,
    colliders,
    groundAt,
    loftY: LOFT_Y,
    // Just inside the new right-side entry, looking across the desk toward
    // the open study and loft rather than into the wall or final exit.
    spawn: [6.9, 4.8],
    spawnYaw: Math.PI / 2,
    refs: {
      lamp,ambient,
      lighting:{ambient,desk:lamp},
      /** studyBlackout.js: the storm's power cuts, the moon, the lightning and the loft breaker. */
      blackout,
      /** studyHideProps.js: cover boxes, hide spots, the wardrobe. */
      hideProps,
      throwables,
      /** For world/itemMeshes.js: the models the hand holds, as they load (main.js). */
      hideAndSeekItemsReady: Promise.all([throwables.bookTemplate, throwables.glassTemplate, blackout.fuseTemplate])
        .then(([studyBook, studyGlass, studyFuse]) => ({ studyBook, studyGlass, studyFuse })),
      /** world/CandleFlames.js: every flame in the room, and its light pool. */
      candles: studyCandles,
      entryDoor,
      setCorrectedSight(on) {
        // One group, one flag. Everything the broken eye cannot resolve is a
        // child of it, so the room cannot correct halfway.
        visorOnly.visible = on;
        setGallerySight(on);
        distortedTrail.visible = !on;
        updateTruthRecords(on);
        updateOverrideLabels(on);
        annabelleFigure.setCorrectedSight(on);
        syncRevealedFigure();
      },
      visorGroup,
      visorHitbox,
      visorOnly,
      letterHit,
      exterior,
      /** Where Annabelle stands once the letter has been read. */
      annabelleSpot: [annabelle.position.x, annabelle.position.z],
      annabelle,
      annabelleMonster,cornerReady,chairReady,
      /** Settles once her model is in, so the warm-up draws her and not an empty group. */
      warmUpReady: annabelleFigure.ready,
      /**
       * Shows her for the loading screen's warm-up, which only builds shaders
       * for what it can see: hidden until the mirror, she would otherwise build
       * hers in the middle of the reveal. Returns the undo.
       */
      showForWarmUp() {
        const was = annabelle.visible;
        // The mirror's reflection layer too: hidden until the letter, it would
        // otherwise build its shader at the very moment it comes alive.
        const mirrorWas = mirror.mesh.visible;
        annabelle.visible = true;
        mirror.mesh.visible = true;
        return () => {
          annabelle.visible = was;
          mirror.mesh.visible = mirrorWas;
        };
      },
      mirrorGlass,
      /** The glass's reflection controls: main.js sizes it and swaps the view model out of it. */
      mirror,
      /** See world/CrystalDecanter.js: main.js films the room into it once it is lit. */
      decanter,
      /** world/HearthFire.js: the fire in the study grate. */
      fire: hearthFire,
      installMirrorReflection(presentation) {
        mirrorPresentation?.dispose();
        mirrorPresentation = presentation;
      },
      get mirrorPresentation() { return mirrorPresentation; },
      setMirrorRevealSight,
      syncRevealVisor:syncRevealedFigure,
      setRevealChairActive(on) {revealChairActive=on;syncRevealedFigure();},
      setMirrorPerformanceTime(t,position) { mirrorPresentation?.setTime?.(t,position?new THREE.Vector3(...position):null); },
      initializeRevealVisor() {mirrorPresentation?.setCorrected?.(false);mirrorPresentation?.initializeVisorInHand?.();},
      setRevealVisorHeld(on) {mirrorPresentation?.setVisorHeld?.(on);},
      animateRevealVisor(on,options) {mirrorPresentation?.animateVisor?.(on,options);},
      finishRevealVisor() {mirrorPresentation?.finishVisor?.();},
      performAnnabelleLine(id,hold) { annabelleFigure.perform(id,hold); },
      setAnnabelleCardGlance(weight) {
        if(cardPerformance)return;
        annabelleFigure.setAttention(null,0);
        // The offer stays directed toward Mark; no cushion glance/reach.
      },
      setMirrorRevealActive(on) {
        mirrorPresentation?.setEnabled(true);
        mirrorPresentation?.setCinematic?.(on);
        if (on) mirror.mesh.visible = false;
      },
      cancelRevealPresentation() {
        if (puzzle.mirrorRevealed) return;
        showAnnabelle(false);
        annabelleMonster.visible=false;
        revealChairActive=false;resetCardPerformance();
        hollowOverrideKey.visible = false;
        hollowOverrideKeyHit.visible = false;
        const index = interactables.indexOf(hollowOverrideKeyHit);
        if (index >= 0) interactables.splice(index, 1);
        mirrorPresentation?.reset?.();
      },
      setRevealAnnabelle(on) {
        revealChairActive=on;
        if(on)syncRevealedFigure();else showAnnabelle(false);
      },
      prepareRevealKeycard(options) {prepareCardPerformance(options);},
      updateRevealKeycard(t) {updateCardPerformance(t);},
      offerRevealKeycard() {syncOfferedCard();return true;},
      showRevealKeycard() {
        if ((!puzzle.mirrorRevealInProgress && !puzzle.mirrorRevealed) || puzzle.hasHollowOverrideKey) return;
        if(cardPerformance)updateCardPerformance(cardPerformance.audioAt+cardPerformance.duration+1);
        syncOfferedCard();
      },
      revealAnnabelle() {
        if (puzzle.mirrorRevealInProgress || puzzle.mirrorRevealed) showAnnabelle(true);
      },
      hollowOverrideKey,
      overrideSockets,
      puzzle,
      ...(import.meta.env.DEV ? {prepareRevealTest} : {}),
      prepareHandoffTest(){
        prepareRevealTest(true);
        puzzle.mirrorRevealed=true;revealChairActive=true;
        annabelleFigure.setCrouched(true);annabelleFigure.perform('tried',0);
        const timing=createStudyRevealTiming(),beat=timing.dialogue.find(b=>b.id==='override');
        prepareCardPerformance({start:beat.t,audioAt:beat.t,duration:beat.hold,
          decideAt:timing.reactions.find(b=>b.id==='decide').t-beat.t});
        updateCardPerformance(beat.t+beat.hold+1);
        syncRevealedFigure();syncOfferedCard();
        mirrorGlass.userData.interact.label='The reflection is still';
      },
      setResealLockdown(progress){
        if(puzzle.endingChoice!=='RESEALED')return;
        doorState.open=false;setDoorSolid(true);setContainmentBars(0);
      },
      setEndingSeated(progress){
        const w=THREE.MathUtils.smoothstep(progress,0,1);
        annabelle.position.copy(personFinal);
        annabelleFigure.setEndingSeated(w);annabelleFigure.setLocomotion(0,0);
      },
      setResealReaction(point,weight){annabelleFigure.setAttention(point,weight);},
      getEndingFocus(){return annabelleFigure.getPoseAnchors().head??annabelle.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.98,0));},
      setResealResignation(weight){annabelleFigure.setEndingResignation(weight);},
      setReleaseBarsProgress(progress){
        if(puzzle.endingChoice==='RELEASE')setContainmentBars(progress);
      },
      setReleaseDoorOpen(open){
        if(puzzle.endingChoice!=='RELEASE')return;
        doorState.open=!!open;setDoorSolid(!open);
      },
      setReleaseConcern(weight){annabelleFigure.setEndingConcern(weight);},
      setReleaseReaction(point,weight,soften=false){
        annabelleFigure.setAttention(point,weight);
        if(soften)annabelleFigure.perform('remember',1.4);
      },
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
      onResetLetter();
      spokenPuzzle = null; stuckSeconds = 0; spokenHints.clear(); evidenceRead.clear(); onVoiceProgress();
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
      archiveUsedKey.visible = false;
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

      visorOnly.visible = false;
      distortedTrail.visible = true;
      puzzle.correctedTrailProgress = 0;
      puzzle.correctedTrailSolved = false;
      restrictedContents.visible = false;
      restrictedDoorMotion.reset();
      syncTruthRecordTargets();
      syncRestrictedCabinetCollision();
      setGallerySight(false);
      const restrictedIndex = interactables.indexOf(restrictedPlaque.mesh);
      if (restrictedIndex >= 0) interactables.splice(restrictedIndex, 1);
      puzzle.truthRecordProgress = 0;
      puzzle.truthRecordsSolved = false;
      puzzle.truthRecordsComplete = false;
      puzzle.mirrorUnlocked = false;
      mirrorRevealGeneration++;
      mirrorPresentation?.reset?.();
      annabelleFigure.reset();
      puzzle.mirrorRevealInProgress = false;
      puzzle.mirrorRevealed = false;
      annabelleMonster.visible=false;
      puzzle.hasHollowOverrideKey = false;
      puzzle.endingChoice = 'NONE';
      puzzle.endingSequenceStarted = false;
      overrideAuthorization = null;
      overrideTurning = null;
      overrideTurnProgress = 0;
      puzzle.endingChoiceComplete=false;
      setContainmentBars(0);
      for (const socket of overrideSockets) {
        const {hit,installedKey,reader,handle,handleHit}=socket;
        socket.insertProgress=1;installedKey.position.y=socket.cardY;
        installedKey.visible = false;
        reader.setAuthorized(false);
        if (handle) handle.pivot.rotation.z = 0;
        const handleIndex = interactables.indexOf(handleHit);
        if (handleIndex >= 0) interactables.splice(handleIndex, 1);
        if (!interactables.includes(hit)) interactables.push(hit);
      }
      updateOverrideLabels(false);
      showAnnabelle(false);
      revealChairActive=false;resetCardPerformance();
      hollowOverrideKey.visible = false;
      hollowOverrideKeyHit.visible = false;
      gameState.inventory.delete('hollowOverrideKey');
      const overrideIndex = interactables.indexOf(hollowOverrideKeyHit);
      if (overrideIndex >= 0) interactables.splice(overrideIndex, 1);
      mirrorGlass.userData.interact.label = 'Look into the mirror';
      mirror.reset();
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
      // Every candle relit and upright, no gust still in flight, the pool's
      // lights released; the window draughts are part of the room and stay.
      studyCandles.reset();
      for (const door of doorDraughts) door.open = false;
      // The power back on and every pile of books where it was.
      blackout.reset();
      throwables.reset();
      hideProps.reset();
      puzzle.blackoutStage = 'none';
    },

    update(dt) {
      if (spokenPuzzle) {
        const solved = spokenPuzzle === 'clock' ? puzzle.clockSolved
          : spokenPuzzle === 'shadow' ? puzzle.crestSolved : puzzle.truthRecordsComplete;
        if (solved) voiceProgress();
        else if (canAutoThought()) {
          stuckSeconds += Math.max(0, dt);
          const limit = spokenPuzzle === 'letter' ? 60 : 55;
          if (stuckSeconds >= limit && !spokenHints.has(spokenPuzzle)) {
            spokenHints.add(spokenPuzzle);
            if (spokenPuzzle === 'letter') showCaption(line('dialog_study_letter_read_it'));
            // Spoken hints are requested with H, never unsolicited puzzle thoughts.
          }
        }
      }
      updateExterior(dt);
      studyCandles.update(dt, { playerPosition: getPlayerPosition() });
      if(puzzle.mirrorRevealed){
        syncRevealedFigure();
        if(annabelleMonster.visible)updateStudyCreature(annabelleMonster,dt);
      }
      if(mirrorPresentation&&!puzzle.mirrorRevealInProgress){
        mirrorPresentation.setEnabled(true);
        mirrorPresentation.setCorrected(puzzle.mirrorRevealed&&gameState.visorWorn);
        mirrorPresentation.setTime?.(performance.now()/1000);
      }
      mirror.setReflective(puzzle.mirrorUnlocked);
      mirror.update(dt);
      // The cutscene owns the glass while its dedicated actors are staged.
      // Keep one planar renderer active to avoid nested mirror renders.
      if (puzzle.mirrorRevealInProgress || mirrorPresentation) mirror.mesh.visible = false;
      if(cardPerformance&&puzzle.hasHollowOverrideKey){
        offerAmount=Math.max(0,offerAmount-Math.max(0,dt)/.6);
        annabelleFigure.setHandOffer(eased(offerAmount));
        annabelleFigure.setOfferTarget(offeredHandTarget(),eased(offerAmount));
      }
      if (annabelle.visible||cardPerformance) annabelleFigure.update(dt, getPlayerPosition());
      if(cardPerformance){syncPersonRoots();syncOfferedCard();}
      for(const socket of overrideSockets)if(socket.insertProgress<1){
        socket.insertProgress=Math.min(1,socket.insertProgress+Math.max(0,dt)/.25);
        socket.installedKey.position.y=socket.cardY+.06*(1-THREE.MathUtils.smoothstep(socket.insertProgress,0,1));
      }
      if(overrideTurning){
        overrideTurnProgress=Math.min(1,overrideTurnProgress+Math.max(0,dt));
        const socket=overrideTurning;
        const angle=socket.choice==='RELEASE'?Math.PI/2:-THREE.MathUtils.degToRad(110);
        socket.handle.pivot.rotation.z=angle*THREE.MathUtils.smoothstep(overrideTurnProgress,0,1);
        if(overrideTurnProgress===1){overrideTurning=null;completeOverride(socket);}
      }

      memoryDoorMotion.update(dt, puzzle.memoryArchiveUnlocked);
      restrictedDoorMotion.update(dt, puzzle.correctedTrailSolved);
      syncTruthRecordTargets();
      syncRestrictedCabinetCollision();
      restrictedContents.visible = puzzle.correctedTrailSolved;
      visorCoverMotion.update(dt, puzzle.memoryArchiveSolved);
      letterDoorMotion.update(dt, puzzle.truthRecordsSolved);
      clockMechanism.update(dt, puzzle.clockSolved);
      hearthFire.update(dt);
      blackout.update(dt);
      hideProps.update(dt);
      const crestTargetX = puzzle.crestSolved ? 2.05 : 0;
      const previousCrestTravel = crestCoverTravel;
      crestCoverTravel += (crestTargetX - crestCoverTravel) * Math.min(1, dt * 5);
      crestHinge.rotation.y = -THREE.MathUtils.degToRad(100) * crestCoverTravel / 2.05;
      if (crestCoverTravel !== previousCrestTravel) syncCrestPanelCollision();
      // After every hinge above has moved this frame; the candles feel it next frame.
      updateDoorDraughts();
      const doorTarget = doorState.open ? DOOR_OPEN_SWING : 0;
      doorHinge.rotation.y += (doorTarget - doorHinge.rotation.y) * Math.min(1, dt * 2.6);
    }
  };
}
