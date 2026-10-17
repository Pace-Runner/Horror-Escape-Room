import * as THREE from 'three';
import {
  createPlasterWallTexture,
  createPlasterBumpTexture,
  createConcreteTexture,
  createConcreteBumpTexture,
  createStickyNoteTexture,
  createHazardSignTexture,
  createPaperNoteTexture,
  createFuseCapStampTexture,
  createFixtureSteelTexture,
  createFixtureSteelNormalTexture,
  createPaintedSteelTexture,
  createGaugeFaceTexture,
  createRibbedHoseTexture,
  createDataPlateTexture,
  createCrtVentTexture,
  createCrtTopVentTexture,
  createPowerSymbolTexture,
  createSwitchLabelTexture
} from '../world/textures.js';
import { loadModel } from '../world/modelLoader.js';
import labDoorModelUrl from '../assets/models/lab_door.glb?url';
import fuseBoxModelUrl from '../assets/models/fuse_box.glb?url';
import fuseModelUrl from '../assets/models/fuse.glb?url';
import crtMonitorModelUrl from '../assets/models/crt_monitor.glb?url';
import breakerPanelModelUrl from '../assets/models/breaker_panel.glb?url';
import generatorModelUrl from '../assets/models/generator.glb?url';
import operatingTableModelUrl from '../assets/models/operating_table.glb?url';
import surgicalLampModelUrl from '../assets/models/surgical_lamp.glb?url';
import instrumentTrolleyModelUrl from '../assets/models/instrument_trolley.glb?url';
import labChairModelUrl from '../assets/models/lab_chair.glb?url';
import storageShelfModelUrl from '../assets/models/storage_shelf.glb?url';
// TEXTURE PREVIEW (branch lvl2-texture-preview): photo textures the user found,
// to judge the look. Tiles141, Concrete030 and Metal055B are ambientCG (CC0);
// the rest are Texturelabs.
import tilesColorUrl from '../assets/textures/lab/tiles141_color.jpg?url';
import tilesNormalUrl from '../assets/textures/lab/tiles141_normal_gl.jpg?url';
import tilesRoughnessUrl from '../assets/textures/lab/tiles141_roughness.jpg?url';
import concreteColorUrl from '../assets/textures/lab/concrete030_color.jpg?url';
import concreteNormalUrl from '../assets/textures/lab/concrete030_normal_gl.jpg?url';
import concreteRoughnessUrl from '../assets/textures/lab/concrete030_roughness.jpg?url';
import concreteAoUrl from '../assets/textures/lab/concrete030_ao.jpg?url';
import crackedPaintUrl from '../assets/textures/lab/texturelabs_grunge_328.jpg?url';
import whiteRustMetalUrl from '../assets/textures/lab/texturelabs_metal_190.jpg?url';
import steelColorUrl from '../assets/textures/lab/metal055b_color.jpg?url';
import steelNormalUrl from '../assets/textures/lab/metal055b_normal_gl.jpg?url';
import steelRoughnessUrl from '../assets/textures/lab/metal055b_roughness.jpg?url';
import steelMetalnessUrl from '../assets/textures/lab/metal055b_metalness.jpg?url';
import scuffDecalUrl from '../assets/textures/lab/texturelabs_details_136.png?url';
// The rust cut out of Texturelabs_Metal_190: its white paint made transparent,
// so the rust alone can be laid over the generator's own paint.
import rustOverlayUrl from '../assets/textures/lab/texturelabs_metal_190_rust_overlay.png?url';
// Green-black damp grime, cut out of the water streaks in Texturelabs_Concrete_189:
// transparent where that concrete was pale, mossy where it was stained.
import greenGrimeUrl from '../assets/textures/lab/lab_green_grime_overlay.png?url';
import { createStaticScreenMaterial } from '../world/StaticScreenMaterial.js';
import { createCctvFeeds, FEED_IDS, FEED_LABELS } from '../world/CctvFeeds.js';
import { SECURITY_CODE } from '../world/doorPanels.js';
import { createCreatureSketchTexture } from '../world/textures.js';
import { addBaseboard } from '../world/trim.js';
import { line } from '../dialogue/index.js';
import { createInstrumentTrolley } from '../world/InstrumentTrolley.js';

const HALL_W = 2.4;
const HALL_LEN = 5.5;
const HALL_H = 2.7;
/**
 * How much bigger the lab is than the 8 x 6.5 m room it was laid out in. Every
 * free-standing prop is placed at its original spot times this, so it keeps
 * its place relative to the room as the room grows; anything hung on or pushed
 * against a wall is written against that wall and follows it on its own. The
 * ceiling stays where it was -- this is a basement, not a hall.
 */
const LAB_SCALE = 1.5;
const LAB_W = 8 * LAB_SCALE;
const LAB_D = 6.5 * LAB_SCALE;
const LAB_H = 3.2;
const LAB_Z = HALL_LEN + LAB_D / 2 + 0.2;
/**
 * The steel double doors between the hallway and the lab (lab_door.glb).
 * Mirrors blender/build_lab_door.py: the clear opening's half-width and
 * height, the frame's outside, and how far in front of its wall the leaves'
 * pivots stand. The frame's back sits on the hallway's end, z = HALL_LEN.
 */
const LAB_DOOR = { openHalf: 0.904, openH: 2.104, frameHalf: 0.994, frameTop: 2.194, pivotOffset: 0.06 };

/**
 * The metal door at the far end. Up here with the room dimensions rather than
 * beside the mesh, because things built long BEFORE the door have to be placed
 * around it -- the pipe run along that same wall being the reason this moved.
 * The door stands on the floor, so its top edge is simply its height.
 */
const DOOR_WIDTH_IN_METRES = 1.1;
const DOOR_HEIGHT_IN_METRES = 2.1;

/**
 * One glass cartridge fuse (fuse.glb). Every fuse in the level is this same
 * size -- about a toilet-roll tube -- so the rating stamped on its caps is
 * what tells them apart, not the thickness it used to be. Mirrors
 * FUSE_LENGTH and CAP_RADIUS in blender/glass_fuse.py.
 */
const FUSE_LENGTH = 0.10;
const FUSE_CAP_RADIUS = 0.024;

/**
 * The fuse box (fuse_box.glb) and where its four clips are, in the model's own
 * space: x across the face, y up, z out of the wall. Mirrors BOX_*, SLOT_X and
 * FUSE_AXIS_Y in blender/build_fuse_box.py. The level needs them before the
 * model has loaded -- the click target, the seated fuses and the cable run are
 * all placed synchronously -- which is why they are copied rather than read
 * off the loaded scene.
 */
const FUSE_BOX_WIDTH = 0.54;
const FUSE_BOX_HEIGHT = 0.50;
const FUSE_BOX_DEPTH = 0.13;
const FUSE_BOX_SLOT_X = [-0.15, -0.05, 0.05, 0.15];
const FUSE_BOX_FUSE_DEPTH = 0.062;
const FUSE_BOX_GROMMET_DEPTH = 0.07;
/** The cover's hinge line: its right-hand edge, just proud of the box's face. */
const FUSE_COVER_HINGE = { x: 0.274, z: 0.136 };

/**
 * The one slot the player ever fills -- third from the left, as in the
 * reference. The other three hold fuses that are part of fuse_box.glb itself
 * and never move. Mirrors EMPTY_SLOT in blender/build_fuse_box.py.
 */
const FUSE_BOX_EMPTY_SLOT = 2;

/**
 * The CRT on the CCTV desk (crt_monitor.glb), in the model's own space: x
 * across the face, y up from the desk, z out of the screen. Mirrors the
 * dimensions in blender/build_crt_monitor.py -- the picture, the power button
 * and the click target are all built here, around the model, and have to land
 * on the parts of it they belong to.
 */
const CRT_BODY = { width: 0.46, bottom: 0.03, top: 0.42, front: 0.18, back: -0.215 };
const CRT_SCREEN = { width: 0.36, height: 0.27, centreY: 0.244, z: 0.158 };
/** How far the middle of the glass bows out toward the player. */
const CRT_SCREEN_BULGE = 0.012;
const CRT_POWER_BUTTON = { x: 0.17, y: 0.066, radius: 0.0095, depth: 0.006, ringFront: 0.1824 };
/** The sockets on the CRT's back panel the cables plug into: across, up, and how far they stand out. */
const CRT_PORTS = {
  power: { x: 0.06, y: 0.13, depth: 0.006 },
  video: { x: -0.06, y: 0.15, depth: 0.012 },
  remote: { x: 0.0, y: 0.12, depth: 0.008 }
};
/** Seconds for the picture to open out from a line, and to collapse back to one. */
const CRT_WARM_UP_SECONDS = 0.7;
const CRT_SWITCH_OFF_SECONDS = 0.25;

/**
 * The breaker panel (breaker_panel.glb), in the model's own space: x across
 * the face, y up, z out of the wall. Mirrors build_breaker_panel.py -- the
 * toggles, flags, label strip and click targets are built here and have to
 * land on the modules, window and lever the model provides.
 */
const BREAKER_BOX = { width: 0.44, height: 0.32, depth: 0.10 };
const BREAKER_MODULE_X = [-0.132, -0.066, 0.0, 0.066, 0.132];
const BREAKER_MODULE_CENTRE_Y = 0.025;
const BREAKER_MODULE_FACE_Z = 0.108;
/** Where each lever comes out of its module: the front of the module's collar. */
const BREAKER_TOGGLE_BASE_Z = 0.114;
/** One black label plate under each module, between the window and the vent slots. */
const BREAKER_LABEL = { width: 0.05, height: 0.034, y: -0.056 };
const BREAKER_COVER = { width: 0.40, height: 0.17, hingeY: 0.10, hingeZ: 0.165 };
/** The cover swings up past square, so it stays open on its own. */
const BREAKER_COVER_OPEN_ANGLE = -1.75;
const BREAKER_COVER_OPEN_SECONDS = 0.5;
/** A lever tilts this far either way: tip up is ON. Pronounced, so the state reads from across the room. */
const BREAKER_TOGGLE_TILT = 0.6;
/**
 * The main lever's swing about its pivot. Up is ON: the arm leans a little
 * forward of vertical. Down swings it through the front to hang below.
 */
const MAIN_LEVER_UP_ANGLE = 0.3;
const MAIN_LEVER_DOWN_ANGLE = Math.PI - 0.3;
const MAIN_LEVER_HIT = { size: [0.075, 0.3, 0.2], centre: [0.258, -0.01, 0.1] };

/**
 * The generator (generator.glb), in the model's own space, which is also how
 * it stands in the lab: length along x with the control panel on the +X end,
 * door side to +Z, standing on y = 0. Mirrors build_generator.py.
 */
const GENERATOR_BODY = { length: 1.0, depth: 0.7, top: 0.85 };
/** The face of the control panel, and the rows on it. */
const GENERATOR_PANEL_X = 0.504;
const GENERATOR_ROW_Y = { gauge: 0.70, lamp: 0.60, control: 0.50 };
/** Across the panel: fuel valve on the room side, primer, then the pull-start toward the wall. */
const GENERATOR_CONTROL_Z = { valve: 0.18, primer: 0.0, starter: -0.18 };
const GENERATOR_EXHAUST_TOP = [-0.2, 0.925, -0.2];
const GENERATOR_CABLE_GLAND = [-0.524, 0.35, 0.27];
/** The three gauges over the controls, and what each reads. */
const GENERATOR_GAUGES = [
  { slot: 'valve', label: 'VOLTS', max: 300, step: 50, reads: 'volts' },
  { slot: 'primer', label: 'Hz', max: 70, step: 10, reads: 'hertz' },
  { slot: 'starter', label: 'AMPS', max: 80, step: 20, reads: 'amps' }
];
/**
 * How many pulls the starter takes to catch once it has been primed. The
 * first two cough and roar and die, each louder than the last, which is the
 * real price of restarting a diesel in a house you are hiding in.
 */
const STARTER_PULLS_TO_CATCH = 3;

/** How far the cover swings, and how long it takes. Past square, so it hangs open. */
const FUSE_COVER_OPEN_ANGLE_IN_RADIANS = 1.83;
const FUSE_COVER_OPEN_SECONDS = 0.6;

/**
 * Where the two props that fuses rest on actually stand, in lab space.
 *
 * Up here, and used BOTH by the prop that gets built and by the fuse resting
 * on it, because the alternative has now failed twice. The desk was turned
 * round and pushed against the wall, and the crates were moved west to open a
 * blocked route -- and both times the fuse lying on top kept its old
 * hand-copied coordinates and was left hanging in mid-air beside the thing it
 * was supposed to be on. Deriving the fuse from the prop means a prop can move
 * freely and take whatever is resting on it along.
 */
const DESK_POSITION = { x: 1.6 * LAB_SCALE, z: LAB_D / 2 - 0.55 };
const DESK_TOP_SIZE = { width: 1.2, depth: 0.6, thickness: 0.06, standHeight: 0.75 };
const WORKBENCH_POSITION = { x: 0.4 * LAB_SCALE, z: -0.3 * LAB_SCALE };

/** One unit of the steel shelving (storage_shelf.glb): length along x. Mirrors build_storage_shelf.py. */
const STORAGE_SHELF = { width: 1.2, depth: 0.5, height: 1.83 };

/** The breaker panel's place along the west wall. The load chart hangs beside it. */
const BREAKER_PANEL_Z = 1.7 * LAB_SCALE;

/**
 * Where the creature stands after camera five, in lab space: the far corner
 * on the opposite side from the desk, so turning round from the monitor puts
 * it in frame, and just behind where its black pool is left.
 */
const CREATURE_CORNER = { x: -2.6 * LAB_SCALE, z: -1.25 * LAB_SCALE };

/**
 * The restraint table (operating_table.glb), in lab space, and its size in
 * the model's own: length along x with the head end at -x, the torn-strap
 * side toward the entrance (-z). Mirrors build_operating_table.py.
 *
 * Out in the west half of the room, where the sketch and the black pool
 * already are -- the corner of the lab where it got
 * loose. The lamp, the trolley and the stool are all placed from the table,
 * so it can move and take them with it.
 */
const OPERATING_TABLE = {
  x: -1.75 * LAB_SCALE, z: 0.2 * LAB_SCALE,
  halfLength: 0.95, halfWidth: 0.28, padTop: 0.87,
  /** How far the hanging straps and grab hoops stand off each side. */
  sideReach: 0.33
};

/**
 * The surgical lamp (surgical_lamp.glb), in the model's own space: hung from
 * its ceiling mount at the origin, the arm reaching out along +x to the head.
 * Mirrors HEAD_X, HEAD_RADIUS, LENS_Z and HANDLE_BOTTOM in
 * build_surgical_lamp.py.
 */
const SURGICAL_LAMP = { headX: 0.55, headRadius: 0.32, lensY: -1.092, handleBottomY: -1.22, domeTopY: -0.93 };
/** The lamp's head hangs over the table this far toward its head end: over the chest. */
const SURGICAL_LAMP_OVER_TABLE_X = -0.2;

/** The instrument trolley (instrument_trolley.glb): push handle at -x. Mirrors build_instrument_trolley.py. */
const INSTRUMENT_TROLLEY = { length: 0.7, depth: 0.45, top: 0.85, handleReach: 0.07 };
/**
 * How far the trolley can be pushed from where it starts before it goes over,
 * in metres -- a radius, so the direction does not matter, only the distance.
 */
const TROLLEY_FALL_RADIUS = 1.2;
/**
 * How far the trolley stands off the table's side. Far enough out that a
 * player coming from the entrance can catch it and shove it before it jams
 * against the table; not so far that the gap reads as a way through (the
 * player needs 0.7 m).
 */
const TROLLEY_TABLE_GAP = 0.5;

/**
 * The stool (lab_chair.glb), in the model's own space, standing. Mirrors
 * build_lab_chair.py. Only the two things it rests on when knocked onto its
 * +x side matter here: the castor at the tip of the leg that points that
 * way, and the edge of the seat.
 */
const LAB_CHAIR = { castorReach: 0.295, castorHeight: 0.025, seatRadius: 0.212, seatEdgeHeight: 0.49 };

/**
 * The crates. `stackY` is the height of the crate's underside, so 0 sits on
 * the floor and CRATE_SIZE sits squarely on one that does.
 *
 * The stacked crate used to be at (1.15, 1.7) with stackY 0.4, which put it
 * 0.1 m DOWN INTO the crate below and only half over it -- two solid boxes
 * interpenetrating in plain view, with the 45A fuse sealed inside the join.
 * Sharing the lower crate's x/z and stacking by a full CRATE_SIZE is what
 * makes it a stack rather than a collision.
 *
 * `turn` is a yaw for character. The crate that carries the fuse is left
 * square: its top face is flat whichever way it is turned, but a fuse placed
 * by x/z on a turned crate drifts toward the edge of it.
 */
const CRATE_SIZE = 0.5;
const CRATE_LAYOUT = [
  { x: 0.9 * LAB_SCALE, z: 1.5 * LAB_SCALE, stackY: 0, turn: 0.34 },
  { x: 0.9 * LAB_SCALE, z: 1.5 * LAB_SCALE, stackY: CRATE_SIZE, turn: 0 },   // carries the 45A fuse
  { x: -1.6 * LAB_SCALE, z: 2.2 * LAB_SCALE, stackY: 0, turn: 0.8 }
];

/**
 * The crate the 45A rests on: the highest one, so nothing can be sitting on
 * the surface the fuse is supposed to be lying on -- which is exactly how it
 * ended up inside a crate before.
 */
const FUSE_CRATE = CRATE_LAYOUT.reduce((a, b) => (b.stackY > a.stackY ? b : a));

/**
 * Level 2: the hallway the creature is glimpsed in, leading down into the
 * industrial basement lab.
 *
 * The objective is a chain of four electrical puzzles, tracked by
 * `powerStage`. Seat the right fuse (30A among four) to light the lab and
 * wake the CCTV -- but NOT to open the door, which is the point. Walk to
 * the metal door and someone throws the main on you, killing the lights and
 * the cameras together. Restart the generator in the order on its plate to
 * get current back to the breaker panel, then route the panel's 60A across
 * the three circuits that matter without tripping it. Only that last step
 * feeds the door bolts.
 *
 * The camera feeds are sightings rather than a puzzle; the storyline's
 * "code from the CCTV" minigame is still unbuilt.
 *
 * Full reasoning -- why the blackout is caused rather than timed, why the
 * trigger volume is a box the width of the doorway, and every tuned number
 * -- is in docs/LEVEL2_POWER_CHAIN.md.
 *
 * Hierarchy notes:
 *  - the CCTV monitor mesh and its screen-glow point light are children
 *    of the desk group, since the monitor sits on the desk and should
 *    move with it as one prop.
 *  - the fluorescent tube meshes are children of a `fixturesGroup` so the
 *    whole strip can be repositioned or its material swapped in one place.
 *  - the generator controls and the breaker toggles are deliberately NOT
 *    children of the generator / panel they sit on: Interaction raycasts
 *    non-recursively, so a parent group's children never register a hit.
 */
export function createHallwayBasementLevel({
  showCaption = () => {},
  onExit = () => {},
  onSpark = () => {},
  onGlare = () => {},  // called with 0..1 each frame so the host can drive a screen-space wash
  // Fired when the breaker goes in. The level changes its own lights and its
  // own screen; this is for everything OUTSIDE the level that the beat drives
  // -- the story captions, the CCTV sighting, the creature.
  onPowerRestored = () => {},
  /**
   * Fired when the main is thrown as the player reaches the metal door. The
   * level handles its own lights and screen; this is the sound and the story
   * beat, and the nearness of whoever pulled it.
   */
  onBlackout = () => {},
  /** Fired when the generator restart sequence completes. */
  onGeneratorRunning = () => {},
  /** Fired once the breakers are set and the door bolts finally have power. */
  onPowerRouted = () => {},
  /** Fired when a breaker trips the panel by asking for more than it can carry. */
  onOverload = () => {},
  /**
   * Asked to put the security keypad in front of the player. Called with the
   * expected `code` and an `onSolved` callback.
   *
   * The level does not own a keypad: `core/PinPadUI.js` is a shared DOM
   * component that has to be handed the player lock/unlock, which lives in
   * main.js. So the level says WHAT the code is and what happens when it is
   * right, and the host decides how it is typed.
   */
  onEnterSecurityCode = () => {},
  /** Fired with a camera id each time a feed is selected. Drives the sightings. */
  onViewFeed = () => {},
  /**
   * Called every frame with how hard the instrument trolley is rolling, 0 to
   * 1, so the host can play its castors. The level has no audio of its own.
   */
  onTrolleyRoll = () => {},
  /**
   * Fired once when the instrument trolley hits the floor. The level shows
   * the caption; this is for the crash itself, and for anything that should
   * react to a noise that loud.
   */
  onTrolleyCrash = () => {},
  onExamineSketch = () => {}
} = {}) {
  const group = new THREE.Group();
  group.name = 'Level2_HallwayBasement';
  const interactables = [];
  const colliders = [];
  const dynamics = [];

  const wallTex = createPlasterWallTexture('#4a453d');
  const wallBump = createPlasterBumpTexture();
  const concreteTex = createConcreteTexture();
  const concreteBump = createConcreteBumpTexture();

  // ---------- hallway ----------
  const hallway = new THREE.Group();
  hallway.position.set(0, 0, HALL_LEN / 2);
  group.add(hallway);

  const hallFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W, HALL_LEN),
    new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.3, roughness: 0.95 })
  );
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.receiveShadow = true;
  hallway.add(hallFloor);

  const hallWallMat = new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallBump, bumpScale: 0.15, roughness: 0.95 });
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

  // The hallway previously had no ambient light source at all (just one
  // dim point light) -- a real oversight, not a deliberate darkness
  // choice, since every other room has ambient fill. Given a modest one
  // to match; the low overall light level everywhere else is intentional
  // (this is a flashlight-driven horror game) and left alone.
  const hallAmbient = new THREE.AmbientLight(0x3a3f4c, 0.37);
  hallway.add(hallAmbient);

  const hallLight = new THREE.PointLight(0x8896b8, 1.05, 8, 1.6);
  hallLight.position.set(0, HALL_H - 0.3, HALL_LEN / 2 - 1);
  hallway.add(hallLight);

  const hallLight2 = new THREE.PointLight(0x9aa4c2, 0.86, 6, 1.6);
  hallLight2.position.set(0, HALL_H - 0.4, 1.4);

  /**
   * One flash, on demand. NOT a Storm.
   *
   * The storyline's beat is "the creature standing at the end of the hallway,
   * only visible for a second when the thunder crashes". A running storm would
   * make that a coin toss -- the flash has to land while the player is looking
   * down the corridor, and a random one will usually not. Firing a single flash
   * from the script that also places the creature guarantees the player is
   * shown the thing the whole level is about.
   *
   * It is also cheaper and simpler than a second Storm instance, which would
   * need a window to justify it, in a hallway that has none.
   */
  const hallLightning = new THREE.PointLight(0xbcd0ff, 0, 14, 1.4);
  hallLightning.position.set(0, HALL_H - 0.2, HALL_LEN * 0.75);
  hallway.add(hallLightning);
  const flash = { t: 0, duration: 0 };
  hallway.add(hallLight2);

  /**
   * The end cap. The hallway had walls down both sides and nothing at all
   * behind the spawn point, so walking backwards took the player straight out
   * of the level and into the void -- there was no collider and nothing drawn.
   * This is the door they came in through, so it should be shut behind them.
   */
  const hallEndWall = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W, HALL_H),
    hallWallMat
  );
  hallEndWall.position.set(0, HALL_H / 2, -HALL_LEN / 2);
  hallway.add(hallEndWall);
  colliders.push({ minX: -HALL_W / 2, maxX: HALL_W / 2, minZ: -0.2, maxZ: 0 });

  addBaseboard(hallway, { width: HALL_W, depth: HALL_LEN, color: 0x141210 });

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

  /**
   * The concrete is drawn to tile a set number of times across a surface, which
   * suited the room it was tuned in. Tiled up by the same factor the room grew
   * along each side, so the blocks stay the size they were instead of
   * stretching. The walls only grew along their length, not their height.
   */
  function tiledForLab(texture, scaleU, scaleV) {
    const tiled = texture.clone();
    tiled.repeat.set(texture.repeat.x * scaleU, texture.repeat.y * scaleV);
    tiled.needsUpdate = true;
    return tiled;
  }

  /**
   * TEXTURE PREVIEW: loads one photo texture. Only colour images are tagged
   * sRGB; normal, roughness and bump maps are data and stay linear, or they
   * wash out. Mirrored wrapping for the photos that are not seamless, so each
   * copy meets a flipped copy of itself rather than a hard seam.
   */
  const photoLoader = new THREE.TextureLoader();
  /**
   * Each image is downloaded and decoded ONCE, however many materials use it.
   * Every loadPhoto() hands back a clone, which can tile at its own repeat but
   * shares the original's pixels -- and three.js keeps a single copy on the
   * graphics card for every clone that also shares its wrap and colour-space
   * settings. Loading per use put the bare-steel set on the card three times
   * over (pipes, door, instruments).
   *
   * A clone made before the image arrives is held back (version 0), so it is
   * not uploaded empty, and released when the image loads.
   */
  const loadedPhotos = new Map();
  function loadPhoto(url, { colour = true, repeat = [1, 1], wrap = THREE.RepeatWrapping, wrapT = wrap } = {}) {
    let photo = loadedPhotos.get(url);
    if (!photo) {
      photo = { waiting: [] };
      photo.texture = photoLoader.load(url, () => {
        photo.waiting.forEach((clone) => { clone.needsUpdate = true; });
        photo.waiting = null;
      });
      loadedPhotos.set(url, photo);
    }
    const texture = photo.texture.clone();
    if (photo.waiting) {
      texture.version = 0;
      photo.waiting.push(texture);
    }
    if (colour) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = wrap;
    texture.wrapT = wrapT;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = 8;
    return texture;
  }

  // The floor: Tiles141, a full seamless set. One copy of it holds two or three
  // staggered tiles across, so this is how big the tiles come out: at 4 m a
  // copy each tile is roughly 1.4-1.8 m. Raise it for bigger tiles, lower it
  // for smaller ones.
  const TILE_TEXTURE_METRES = 4.0;
  const floorRepeat = [LAB_W / TILE_TEXTURE_METRES, LAB_D / TILE_TEXTURE_METRES];
  const labFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(LAB_W, LAB_D),
    new THREE.MeshStandardMaterial({
      map: loadPhoto(tilesColorUrl, { repeat: floorRepeat }),
      normalMap: loadPhoto(tilesNormalUrl, { colour: false, repeat: floorRepeat }),
      roughnessMap: loadPhoto(tilesRoughnessUrl, { colour: false, repeat: floorRepeat }),
      roughness: 1,
      // A shade down from the photo's clean white: this floor has not been
      // mopped in years, and white tile at full brightness glares under the tubes.
      color: 0xb8b8ae
    })
  );
  labFloor.rotation.x = -Math.PI / 2;
  labFloor.receiveShadow = true;
  lab.add(labFloor);

  const labCeil = labFloor.clone();
  labCeil.rotation.x = Math.PI / 2;
  labCeil.position.y = LAB_H;
  // The ceiling: old paint crazed into cracks, its own image used as a bump
  // map too so the cracks catch the light.
  const ceilingRepeat = [LAB_W / 3, LAB_D / 2];
  // The same texture as both: a bump map only needs light and dark, so it
  // does not need a second, linear copy of the image on the graphics card.
  const crackedPaintMap = loadPhoto(crackedPaintUrl, { repeat: ceilingRepeat, wrap: THREE.MirroredRepeatWrapping });
  labCeil.material = new THREE.MeshStandardMaterial({
    map: crackedPaintMap,
    bumpMap: crackedPaintMap,
    bumpScale: 1.5,
    color: 0x9a9a92,
    roughness: 1
  });
  lab.add(labCeil);

  /**
   * TEXTURE PREVIEW: green grime over the tiles. A second, transparent layer
   * on the floor carrying the damp stains cut out of a photo, much larger
   * than the tiles (one copy per FLOOR_GRIME_METRES) and weaker than on the
   * walls, so it reads as patches of damp rather than as part of the tile
   * pattern. Added after the ceiling is cloned from the floor, or the ceiling
   * would come out grimy too.
   */
  const FLOOR_GRIME_METRES = [6, 4];
  const floorGrime = new THREE.Mesh(
    labFloor.geometry,
    new THREE.MeshStandardMaterial({
      map: loadPhoto(greenGrimeUrl, {
        repeat: [LAB_W / FLOOR_GRIME_METRES[0], LAB_D / FLOOR_GRIME_METRES[1]],
        wrap: THREE.MirroredRepeatWrapping
      }),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      roughness: 0.9
    })
  );
  floorGrime.receiveShadow = true;
  labFloor.add(floorGrime);

  /**
   * The walls: Concrete030, plain grey poured concrete, a full seamless set --
   * colour, normal, roughness and ambient occlusion (the dark in its pits and
   * pores). Tiled at its real size in both directions, CONCRETE_TEXTURE_METRES
   * a copy.
   *
   * The walls are different widths and share this one material, so each
   * wall's UVs are measured in metres instead (wallGeometry), rather than one
   * texture being stretched across all of them.
   */
  const CONCRETE_TEXTURE_METRES = 2.0;
  const labWallMat = new THREE.MeshStandardMaterial({
    map: loadPhoto(concreteColorUrl),
    normalMap: loadPhoto(concreteNormalUrl, { colour: false }),
    roughnessMap: loadPhoto(concreteRoughnessUrl, { colour: false }),
    aoMap: loadPhoto(concreteAoUrl, { colour: false }),
    roughness: 1
  });
  /**
   * A wall plane with UVs in texture-copies, measured from the floor, so a
   * short piece (the lintel over the doorway, `bottom` metres up) carries on
   * the walls beside it instead of starting the texture over.
   */
  function wallGeometry(width, height = LAB_H, bottom = 0) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, uv.getX(i) * width / CONCRETE_TEXTURE_METRES);
      uv.setY(i, (bottom + uv.getY(i) * height) / CONCRETE_TEXTURE_METRES);
    }
    return geometry;
  }
  function labWall(w, x, z, ry) {
    const wall = new THREE.Mesh(wallGeometry(w), labWallMat);
    wall.position.set(x, LAB_H / 2, z);
    wall.rotation.y = ry;
    lab.add(wall);
    return wall;
  }
  /**
   * THE ENTRANCE WALL, which used to be one solid opaque plane spanning all 8 m
   * with no doorway cut in it and no collider behind it. The player walked
   * straight THROUGH the wall out of the hallway, and once inside could not see
   * the hallway they had come from at all -- a PlaneGeometry is single-sided,
   * so from the lab side the hallway's own walls are back-faces and simply are
   * not drawn. The room the storyline describes you walking into was a room you
   * arrived in by clipping through a wall.
   *
   * Now: two segments with a doorway between them the width of the hallway, a
   * lintel over it, and colliders on both segments so the wall is real.
   */
  // Cut to the lab doors' opening, plus a little each side so a leaf swung
  // right round into the lab clears the reveal.
  const DOORWAY_W = (LAB_DOOR.openHalf + 0.02) * 2;
  const DOORWAY_H = LAB_DOOR.openH;
  const jambW = (LAB_W - DOORWAY_W) / 2;
  for (const side of [-1, 1]) {
    const x = side * (DOORWAY_W / 2 + jambW / 2);
    const jamb = new THREE.Mesh(wallGeometry(jambW), labWallMat);
    jamb.position.set(x, LAB_H / 2, -LAB_D / 2);
    // DoubleSide, unlike every other wall here: this is the one the player
    // stands in the doorway of and looks at from both directions.
    jamb.material = labWallMat;
    lab.add(jamb);
    colliders.push({
      minX: x - jambW / 2, maxX: x + jambW / 2,
      minZ: LAB_Z - LAB_D / 2 - 0.1, maxZ: LAB_Z - LAB_D / 2 + 0.15
    });
  }
  const lintel = new THREE.Mesh(
    wallGeometry(DOORWAY_W, LAB_H - DOORWAY_H, DOORWAY_H),
    labWallMat
  );
  lintel.position.set(0, DOORWAY_H + (LAB_H - DOORWAY_H) / 2, -LAB_D / 2);
  lab.add(lintel);

  const westWall = labWall(LAB_D, -LAB_W / 2, 0, Math.PI / 2);
  const eastWall = labWall(LAB_D, LAB_W / 2, 0, -Math.PI / 2);
  const backWall = labWall(LAB_W, 0, LAB_D / 2, Math.PI);

  /**
   * TEXTURE PREVIEW: green grime down the walls -- a second, transparent layer
   * on every wall surface, carrying damp streaks cut out of a photo of stained
   * concrete. One copy is the full wall height, darkest at the top, so the
   * streaks run down from the ceiling the way damp does, and GRIME_PHOTO_WIDTH
   * wide. Each wall's copy starts somewhere different along it, so no two
   * walls show the same streaks; that is done in each layer's own UVs, since
   * the layers share one material.
   */
  const GRIME_PHOTO_WIDTH = LAB_H * 1024 / 683;   // the image's own proportions at full wall height
  const wallGrimeMat = new THREE.MeshStandardMaterial({
    map: loadPhoto(greenGrimeUrl, {
      repeat: [CONCRETE_TEXTURE_METRES / GRIME_PHOTO_WIDTH, CONCRETE_TEXTURE_METRES / LAB_H],
      // Mirrored both ways like the floor's, so the two share one copy on the
      // graphics card. Up the wall it makes no difference: a wall is exactly
      // one copy tall, so it never reaches the repeat.
      wrap: THREE.MirroredRepeatWrapping
    }),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    roughness: 0.9
  });
  lab.children
    .filter((mesh) => mesh.isMesh && mesh.material === labWallMat)
    .forEach((wall, i) => {
      const geometry = wall.geometry.clone();
      const uv = geometry.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) + i * 1.37);
      wall.add(new THREE.Mesh(geometry, wallGrimeMat));
    });

  /**
   * Scuff marks low on the walls, where trolleys and beds have been banged
   * into them: a transparent PNG laid just off the wall. Each wall's x runs
   * left to right seen from the room.
   */
  const scuffMat = new THREE.MeshStandardMaterial({
    map: loadPhoto(scuffDecalUrl, { wrap: THREE.ClampToEdgeWrapping }),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    roughness: 1
  });
  for (const [wall, x, y, flip] of [
    [eastWall, 1.9, 0.75, 1], [westWall, -3.4, 0.65, -1], [backWall, 3.6, 0.7, 1], [backWall, -4.4, 0.6, -1]
  ]) {
    const scuff = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.45), scuffMat);
    scuff.position.set(x, y - LAB_H / 2, 0.01);
    scuff.scale.x = flip;
    wall.add(scuff);
  }

  colliders.push(
    { minX: -LAB_W / 2 - 0.1, maxX: -LAB_W / 2 + 0.15, minZ: LAB_Z - LAB_D / 2, maxZ: LAB_Z + LAB_D / 2 },
    { minX: LAB_W / 2 - 0.15, maxX: LAB_W / 2 + 0.1, minZ: LAB_Z - LAB_D / 2, maxZ: LAB_Z + LAB_D / 2 },
    { minX: -LAB_W / 2, maxX: LAB_W / 2, minZ: LAB_Z + LAB_D / 2 - 0.15, maxZ: LAB_Z + LAB_D / 2 + 0.1 }
  );

  /**
   * The threshold. The hallway floor ends at z = HALL_LEN and the lab floor
   * starts at z = LAB_Z - LAB_D/2, which is 0.2 m further on -- so there was a
   * strip of nothing between the two rooms that the player walked across,
   * looking down into the void under the level.
   *
   * Patched with a strip rather than by moving LAB_Z, because LAB_Z is the
   * origin every collider in this file is written against and shifting it would
   * silently move all of them.
   */
  const threshold = new THREE.Mesh(
    new THREE.PlaneGeometry(DOORWAY_W + 0.4, (LAB_Z - LAB_D / 2) - HALL_LEN + 0.1),
    new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.3, roughness: 1 })
  );
  threshold.rotation.x = -Math.PI / 2;
  threshold.position.set(0, 0.001, (HALL_LEN + (LAB_Z - LAB_D / 2)) / 2 - 0.025);
  threshold.receiveShadow = true;
  group.add(threshold);

  /**
   * The lab doors: a pair of double-acting steel doors with lime laser-safety
   * glass (lab_door.glb, blender/build_lab_door.py), set in the end of the
   * hallway where it meets the lab. The hallway's end is walled up round
   * their frame, and the 0.2 m between that and the lab's entrance wall is
   * lined like the depth of a real wall.
   *
   * They swing both ways on sprung hinges. From the hallway they are easy: E
   * pushes them open and they stay, E again lets them go and they flap shut.
   * Walk on into the lab and they are let go behind you. From the lab side
   * they fight back -- each E only shoves them a little against a heavy
   * spring, and it takes a quick, sustained run of presses to force them far
   * enough to give. Shut, they are solid; there is a collider across them.
   */
  {
    const piece = (x0, x1, y0, y1) => {
      const cx = (x0 + x1) / 2;
      const geometry = new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate(-cx, (y0 + y1) / 2, 0);
      // UVs as if this were part of one whole end wall, like the far one.
      const position = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (position.getX(i) + HALL_W / 2) / HALL_W, position.getY(i) / HALL_H);
      }
      const mesh = new THREE.Mesh(geometry, hallWallMat);
      mesh.position.set(0, 0, HALL_LEN / 2);
      // Facing back down the hallway; turning it mirrors x, hence the -cx.
      mesh.rotation.y = Math.PI;
      mesh.receiveShadow = true;
      hallway.add(mesh);
    };
    piece(-HALL_W / 2, -LAB_DOOR.frameHalf, 0, HALL_H);
    piece(LAB_DOOR.frameHalf, HALL_W / 2, 0, HALL_H);
    piece(-LAB_DOOR.frameHalf, LAB_DOOR.frameHalf, LAB_DOOR.frameTop, HALL_H);
    for (const side of [-1, 1]) {
      const inner = side * LAB_DOOR.openHalf;
      const outer = side * HALL_W / 2;
      colliders.push({ minX: Math.min(inner, outer), maxX: Math.max(inner, outer), minZ: HALL_LEN - 0.14, maxZ: HALL_LEN + 0.1 });
    }

    // The reveal, between the hallway's end and the lab's entrance wall.
    const revealDepth = (LAB_Z - LAB_D / 2) - HALL_LEN;
    const revealZ = -LAB_D / 2 - revealDepth / 2;
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(wallGeometry(revealDepth, DOORWAY_H), labWallMat);
      cheek.position.set(side * DOORWAY_W / 2, DOORWAY_H / 2, revealZ);
      cheek.rotation.y = -side * Math.PI / 2;
      lab.add(cheek);
    }
    const soffit = new THREE.Mesh(wallGeometry(DOORWAY_W, revealDepth), labWallMat);
    soffit.position.set(0, DOORWAY_H, revealZ);
    soffit.rotation.x = Math.PI / 2;
    lab.add(soffit);
  }

  const labDoorHost = new THREE.Group();
  labDoorHost.name = 'LabDoors';
  labDoorHost.position.set(0, 0, HALL_LEN);
  // The model's front is its +Z; turned to face down the hallway.
  labDoorHost.rotation.y = Math.PI;
  group.add(labDoorHost);

  /**
   * One hitbox per leaf, made now so they are in `interactables` before the
   * level is first shown, and moved onto the leaves when the model arrives --
   * so the prompt follows a leaf as it swings, and an open doorway is not
   * still covered by an invisible door. Until then they stand where the shut
   * leaves will be, in the model's own frame.
   */
  const LAB_DOOR_LEAF_CENTRE_X = 0.45;
  const LAB_DOOR_LEAF_CENTRE_Y = LAB_DOOR.openH / 2;
  const labDoorHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const labDoorHits = new Map([['labDoorLeafLeft', 1], ['labDoorLeafRight', -1]].map(([name, sign]) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.88, LAB_DOOR.openH - 0.05, 0.14), labDoorHitMat);
    hit.position.set(-sign * (LAB_DOOR.openHalf - 0.01 - LAB_DOOR_LEAF_CENTRE_X), LAB_DOOR_LEAF_CENTRE_Y, LAB_DOOR.pivotOffset);
    hit.userData.interact = { label: 'Push the doors open', onInteract: () => useLabDoors() };
    labDoorHost.add(hit);
    interactables.push(hit);
    return [name, hit];
  }));

  const labLeaves = [];
  loadModel(labDoorModelUrl).then((model) => {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material.name === 'LabDoorGlass') {
        // Laser-safety glass: tinted lime, but clear enough to see the room
        // beyond -- the glow is kept faint, since an emissive pane hazes over
        // whatever is behind it.
        child.material = new THREE.MeshStandardMaterial({
          color: 0xa6d12a,
          emissive: 0x4d6a08,
          emissiveIntensity: 0.12,
          roughness: 0.05,
          transparent: true,
          opacity: 0.32,
          depthWrite: false
        });
        child.castShadow = false;
      } else if (child.material.name === 'LabDoorSteel') {
        // Kept only half metallic, as the shelving is: nothing here for a true
        // metal to reflect, and at full it renders near black.
        child.material.metalness = 0.55;
        child.material.roughness = 0.32;
      }
    });
    // +1 turns the left leaf away from the model's front -- into the lab; the
    // right leaf mirrors it.
    for (const [name, sign] of [['labDoorLeafLeft', 1], ['labDoorLeafRight', -1]]) {
      const node = model.getObjectByName(name);
      if (!node) continue;
      labLeaves.push({ node, sign, rest: node.rotation.y, angle: 0, speed: 0 });
      const hit = labDoorHits.get(name);
      hit.position.set(sign * LAB_DOOR_LEAF_CENTRE_X, LAB_DOOR_LEAF_CENTRE_Y, 0);
      node.add(hit);
    }
    labDoorHost.add(model);
  }).catch((err) => console.error('[lab] lab_door.glb failed to load', err));

  /**
   * The leaves are springs: an angle and a speed each, positive into the lab.
   * Held, they are driven stiffly to openAngle; free, a soft spring pulls them
   * shut and lets them overshoot. From the lab side the spring is a heavy,
   * overdamped one that each shove only dents: about four presses a second,
   * kept up for three seconds, forces them past giveAngle, and anything slower
   * never does.
   */
  const LAB_DOOR_SWING = {
    openAngle: 1.35, heldStiffness: 30, heldDamping: 8,
    stiffness: 10, damping: 1.4,
    heavyStiffness: 4, heavyDamping: 6, shove: 1.2, giveAngle: 0.95,
    passableAngle: 0.9, maxAngle: 1.45
  };
  const labDoorPivotZ = HALL_LEN - LAB_DOOR.pivotOffset;
  /** This far into the lab, doors opened from the hallway are let go behind the player. */
  const LAB_DOOR_SHUT_BEHIND_Z = labDoorPivotZ + 1.3;
  /** And this far, doors forced from the lab side are. */
  const LAB_DOOR_FORCED_RELEASE_Z = labDoorPivotZ + 2.5;
  /** 0 free on their springs; +1 held open into the lab; -1 held open toward the hallway. */
  let labDoorHeld = 0;
  /** -1 on the hallway side of the doors, +1 on the lab side; refreshed every frame. */
  let labDoorPlayerSide = -1;
  let labDoorHeavyHintShown = false;
  // Across the doorway while the doors are shut; parked out of the way while
  // they stand open far enough to walk through.
  const LAB_DOOR_COLLIDER_SHUT = { minZ: labDoorPivotZ - 0.06, maxZ: labDoorPivotZ + 0.06 };
  const labDoorCollider = { minX: -LAB_DOOR.openHalf, maxX: LAB_DOOR.openHalf, ...LAB_DOOR_COLLIDER_SHUT };
  colliders.push(labDoorCollider);

  function useLabDoors() {
    if (labDoorHeld !== 0) {
      labDoorHeld = 0;
      return;
    }
    if (labDoorPlayerSide < 0) {
      labDoorHeld = 1;
      return;
    }
    if (!labDoorHeavyHintShown) {
      labDoorHeavyHintShown = true;
      showCaption(line('dialog_lab_doors_heavy'));
    }
    for (const leaf of labLeaves) leaf.speed -= LAB_DOOR_SWING.shove * (0.9 + Math.random() * 0.2);
  }

  function labDoorLabel() {
    if (labDoorHeld !== 0) return labDoorPlayerSide < 0 ? 'Close the doors' : 'Let the doors go';
    return labDoorPlayerSide < 0 ? 'Push the doors open' : 'Force the doors (keep pressing)';
  }

  function updateLabDoors(dt, playerPosition) {
    const swing = LAB_DOOR_SWING;
    let inDoorway = false;
    if (playerPosition) {
      labDoorPlayerSide = playerPosition.z > labDoorPivotZ ? 1 : -1;
      // Only once they are open: leaning on them shut must not count, or
      // walking into them would open them.
      const isOpen = labDoorCollider.minZ !== LAB_DOOR_COLLIDER_SHUT.minZ;
      inDoorway = isOpen && Math.abs(playerPosition.x) < LAB_DOOR.openHalf + 0.1 && Math.abs(playerPosition.z - labDoorPivotZ) < 0.55;
      if (labDoorHeld === 1 && playerPosition.z > LAB_DOOR_SHUT_BEHIND_Z) labDoorHeld = 0;
      if (labDoorHeld === -1 && playerPosition.z > LAB_DOOR_FORCED_RELEASE_Z) labDoorHeld = 0;
    }
    const label = labDoorLabel();
    for (const hit of labDoorHits.values()) hit.userData.interact.label = label;

    const meanAngle = labLeaves.reduce((sum, leaf) => sum + leaf.angle, 0) / Math.max(1, labLeaves.length);
    // Forced far enough from the lab side, they give, and are held open.
    if (labDoorHeld === 0 && labDoorPlayerSide > 0 && meanAngle < -swing.giveAngle) labDoorHeld = -1;

    let target = labDoorHeld * swing.openAngle;
    let stiffness = swing.stiffness;
    let damping = swing.damping;
    if (labDoorHeld !== 0) {
      stiffness = swing.heldStiffness;
      damping = swing.heldDamping;
    } else if (inDoorway) {
      // Never shut on the player: standing in the doorway holds them open
      // whichever way they already lean.
      target = Math.sign(meanAngle || 1) * swing.openAngle;
      stiffness = swing.heldStiffness;
      damping = swing.heldDamping;
    }
    // Heavy only while being shoved toward the hallway from the lab side, so
    // they still swing shut behind the player rather than creeping to.
    const isHeavy = labDoorHeld === 0 && !inDoorway && labDoorPlayerSide > 0;
    const step = Math.min(dt, 1 / 30);
    for (const leaf of labLeaves) {
      const heavy = isHeavy && leaf.angle <= 0;
      const k = heavy ? swing.heavyStiffness : stiffness;
      const c = heavy ? swing.heavyDamping : damping;
      leaf.speed += (-k * (leaf.angle - target) - c * leaf.speed) * step;
      leaf.angle += leaf.speed * step;
      if (Math.abs(leaf.angle) > swing.maxAngle) {
        leaf.angle = Math.sign(leaf.angle) * swing.maxAngle;
        leaf.speed = 0;
      }
      leaf.node.rotation.y = leaf.rest + leaf.sign * leaf.angle;
    }

    const passable = labLeaves.length > 0 && labLeaves.every((leaf) => Math.abs(leaf.angle) > swing.passableAngle);
    if (passable || inDoorway) {
      labDoorCollider.minZ = labDoorCollider.maxZ = -1000;
    } else {
      Object.assign(labDoorCollider, LAB_DOOR_COLLIDER_SHUT);
    }
  }

  function resetLabDoors() {
    labDoorHeld = 0;
    labDoorHeavyHintShown = false;
    Object.assign(labDoorCollider, LAB_DOOR_COLLIDER_SHUT);
    for (const leaf of labLeaves) {
      leaf.angle = 0;
      leaf.speed = 0;
      leaf.node.rotation.y = leaf.rest;
    }
  }

  // flickering fluorescent strip lights
  const fixturesGroup = new THREE.Group();
  lab.add(fixturesGroup);
  // Normal-running values for the strip lights, and the far harsher values
  // they are driven to while an overrated fuse is seated -- seating the 45A
  // fuse pushes the circuit way past its rating, so the lab is supposed to
  // wash out into a glare the player can barely see through until they pull
  // it back out.
  const TUBE_EMISSIVE_INTENSITY = 1.6;
  const OVERLOAD_TUBE_EMISSIVE_INTENSITY = 9;
  // Dead-circuit values. The lab starts with no power at all, so the tubes
  // give off nothing and the glass only catches what little light reaches
  // it -- a faint emissive keeps the fixtures readable as objects overhead
  // instead of vanishing into the ceiling.
  const UNPOWERED_TUBE_LIGHT_INTENSITY = 0;
  const UNPOWERED_TUBE_EMISSIVE_INTENSITY = 0.06;
  const OVERLOAD_TUBE_LIGHT_INTENSITY = 26;
  const OVERLOAD_TUBE_LIGHT_JITTER = 8;

  /**
   * Each tube gets its OWN material clone: one shared material cannot show two
   * tubes at different brightnesses, so the emissive would have stayed a single
   * global value while the lights underneath it diverged. That matters for the
   * dying tube, which stutters alone while the other two stay dark.
   */
  const fluorescents = [];
  for (let i = -1; i <= 1; i++) {
    const tubeMat = new THREE.MeshStandardMaterial({
      // Pale green: old fluorescent tubes, gone the colour of the room.
      color: 0xe2f0d8, emissive: 0xb6e0a2, emissiveIntensity: 0.06
    });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.1), tubeMat);
    tube.position.set(i * 2.4 * LAB_SCALE, LAB_H - 0.05, -1 * LAB_SCALE);
    fixturesGroup.add(tube);
    // Reach grown with the room, so the light still falls off at the same
    // point relative to the walls rather than leaving the corners black.
    const tubeLight = new THREE.PointLight(0xcfeabf, 0, 9 * LAB_SCALE, 1.5);
    tubeLight.position.copy(tube.position);
    tubeLight.position.y -= 0.3;
    fixturesGroup.add(tubeLight);
    // The middle tube is the one that stutters before the power is on.
    fluorescents.push({ light: tubeLight, mat: tubeMat, isDying: i === 0 });
  }

  // The ambient term is what actually blinds the player during an overload:
  // point lights alone still leave shadowed corners readable, whereas a
  // strong white ambient blows out every surface in the room at once.
  //
  // Note the unpowered level is a floor, not a blackout: an AmbientLight is
  // global to the scene no matter which group it is added to, so the
  // hallway's own ambient reaches the lab as well and the room can never go
  // fully dark while the two share a level. At a quarter of the lit value it
  // is enough to move by with a torch, not enough to read the room -- so
  // restoring the power visibly changes something.
  // Green-grey, the colour shadows go under old fluorescent tubes.
  const LAB_AMBIENT_COLOR = new THREE.Color(0x3a4636);
  const OVERLOAD_AMBIENT_COLOR = new THREE.Color(0xeaf6e2); // the tubes' own pale green-white
  const LAB_AMBIENT_ON = 0.40;
  const LAB_AMBIENT_OFF = 0.10;
  const OVERLOAD_AMBIENT_INTENSITY = 3.4;

  const labAmbient = new THREE.AmbientLight(LAB_AMBIENT_COLOR.getHex(), LAB_AMBIENT_OFF);
  lab.add(labAmbient);

  /**
   * Exposed pipes along the back wall -- the same wall the metal door is in.
   *
   * The run is placed from the DOOR'S TOP EDGE UPWARD rather than from a hand
   * -picked height. It used to sit at y = 2.2 / 1.95 / 1.7, which put two of
   * the three pipes straight across a doorway whose top is at 2.1: from the
   * middle of the room the exit the whole level is about was read through a
   * set of bars, and the note taped to the door at eye level was behind one of
   * them.
   *
   * Deriving the lowest pipe from `DOOR_HEIGHT_IN_METRES` means the run cannot
   * drift back down over the door if either is ever retuned.
   */
  const PIPE_RADIUS_IN_METRES = 0.06;
  const PIPE_SPACING_IN_METRES = 0.25;
  const PIPE_CLEARANCE_ABOVE_DOOR_IN_METRES = 0.18;
  const PIPE_COUNT = 3;
  const lowestPipeY =
    DOOR_HEIGHT_IN_METRES + PIPE_CLEARANCE_ABOVE_DOOR_IN_METRES + PIPE_RADIUS_IN_METRES;
  const highestPipeY = lowestPipeY + (PIPE_COUNT - 1) * PIPE_SPACING_IN_METRES;
  /** The run's centre line, out from the back wall. */
  const PIPE_Z = LAB_D / 2 - 0.2;
  /**
   * The run goes wall to wall and on into both side walls a little, so its
   * ends are hidden behind them. It used to stop half a metre short of each
   * wall, cut off in mid-air.
   */
  const PIPE_INTO_WALL_IN_METRES = 0.1;
  const PIPE_RUN_LENGTH = LAB_W + 2 * PIPE_INTO_WALL_IN_METRES;

  /**
   * Bare steel, streaked and spotted with rust: Metal055B, a full set whose
   * metalness map marks the rust as NOT metal, so the steel reflects and the
   * rust stays dull. `repeat` is how many copies across each way -- one copy
   * is about a metre -- and belongs to the textures, so each tiling is its
   * own set.
   */
  function bareSteelMaterial(repeat = [1, 1]) {
    return new THREE.MeshStandardMaterial({
      map: loadPhoto(steelColorUrl, { repeat }),
      normalMap: loadPhoto(steelNormalUrl, { colour: false, repeat }),
      roughnessMap: loadPhoto(steelRoughnessUrl, { colour: false, repeat }),
      metalnessMap: loadPhoto(steelMetalnessUrl, { colour: false, repeat }),
      roughness: 1,
      metalness: 1
    });
  }
  // Round a 6 cm pipe is about 0.4 m; along it, the run's whole length.
  const pipeMat = bareSteelMaterial([0.4, PIPE_RUN_LENGTH]);

  /**
   * TEXTURE PREVIEW: hospital-white paint with rust coming through, for the lab
   * equipment, given to a loaded model's named materials. Shared, so every
   * prop wears one texture.
   */
  const whiteRustMap = loadPhoto(whiteRustMetalUrl, { wrap: THREE.MirroredRepeatWrapping });
  function applyWhiteRust(model, materialNames) {
    model.traverse((child) => {
      if (!child.isMesh || !materialNames.includes(child.material.name)) return;
      child.material.color.set(0xffffff);
      child.material.map = whiteRustMap;
      child.material.metalness = 0.15;
      child.material.roughness = 0.7;
      child.material.needsUpdate = true;
    });
    return model;
  }

  /** TEXTURE PREVIEW: the bare steel, for a loaded model's named materials -- the instruments. */
  const toolSteelMat = bareSteelMaterial();
  function applyBareSteel(model, materialNames) {
    model.traverse((child) => {
      if (child.isMesh && materialNames.includes(child.material.name)) child.material = toolSteelMat;
    });
    return model;
  }
  // Each pipe goes through a round plate on the side wall, as pipes through a
  // wall are finished off.
  const pipeWallPlateGeometry = new THREE.CylinderGeometry(
    PIPE_RADIUS_IN_METRES + 0.035, PIPE_RADIUS_IN_METRES + 0.035, 0.012, 20
  );
  for (let i = 0; i < PIPE_COUNT; i++) {
    const y = lowestPipeY + i * PIPE_SPACING_IN_METRES;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(PIPE_RADIUS_IN_METRES, PIPE_RADIUS_IN_METRES, PIPE_RUN_LENGTH, 10),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, PIPE_Z);
    lab.add(pipe);
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(pipeWallPlateGeometry, toolSteelMat);
      plate.rotation.z = Math.PI / 2;
      plate.position.set(side * (LAB_W / 2 - 0.006), y, PIPE_Z);
      lab.add(plate);
    }
  }

  /**
   * Sanity, at build time: the pipe run has to clear the doorway below it and
   * still fit under the ceiling. Both ends matter -- raising the run far enough
   * to miss the door is only a fix if the top pipe does not end up inside the
   * slab above it.
   */
  {
    const highestPipeTopY = highestPipeY + PIPE_RADIUS_IN_METRES;
    if (lowestPipeY - PIPE_RADIUS_IN_METRES < DOOR_HEIGHT_IN_METRES) {
      console.warn('[lab] the pipe run crosses the metal door -- the exit reads through bars');
    }
    if (highestPipeTopY > LAB_H) {
      console.warn(`[lab] the pipe run reaches ${highestPipeTopY.toFixed(2)}m, through a ${LAB_H}m ceiling`);
    }
  }

  /**
   * The generator: generator.glb (blender/build_generator.py), an enclosed
   * 1980s diesel standby set, long side to the room with its control panel on
   * the end that faces into the lab. The model is built standing the way it
   * stands here, so it is placed without being turned.
   *
   * `generator` is its frame. Inside it, `generatorShake` carries everything
   * that vibrates while the engine runs -- the cabinet and every control on
   * it. The exhaust hose stays outside it: it is fixed to the wall at its far
   * end.
   */
  const generator = new THREE.Group();
  // Pushed into the corner beside the doorway rather than standing mid-wall.
  // Its front edge stops 0.8 m off the entrance wall, which keeps it clear of
  // the black pool's footprint and of the corner the creature is shown
  // standing in after camera five.
  generator.position.set(-LAB_W / 2 + 0.55, 0, -LAB_D / 2 + 0.4);
  lab.add(generator);
  const generatorShake = new THREE.Group();
  generator.add(generatorShake);
  colliders.push({
    minX: generator.position.x - 0.55, maxX: generator.position.x + 0.55,
    minZ: LAB_Z + generator.position.z - 0.4, maxZ: LAB_Z + generator.position.z + 0.4
  });

  loadModel(generatorModelUrl).then((model) => {
    const paintMap = createPaintedSteelTexture({ base: [62, 112, 106], rust: 0.7 });
    const paintNormal = createFixtureSteelNormalTexture();

    /**
     * TEXTURE PREVIEW: real rust over the paint. A second, transparent layer on
     * each painted or skid surface, carrying the rust cut out of a photo of
     * rusting paint -- so the teal stays teal and only the rust is laid on top.
     * Rust is dead matte, and pulled forward in the depth test so it never
     * fights the paint it sits on.
     *
     * The model's UVs run 2.2 to the metre (blender/common.py), so one copy of
     * the photo spans RUST_OVERLAY_METRES across and the rust does not repeat
     * across a machine barely a metre long.
     */
    const RUST_OVERLAY_METRES = 1.5;
    const RUST_OVERLAY_ASPECT = 699 / 1024;   // the overlay image's height over its width
    const rustOverlayMat = new THREE.MeshStandardMaterial({
      map: loadPhoto(rustOverlayUrl, {
        repeat: [1 / (2.2 * RUST_OVERLAY_METRES), 1 / (2.2 * RUST_OVERLAY_METRES * RUST_OVERLAY_ASPECT)],
        wrap: THREE.MirroredRepeatWrapping
      }),
      normalMap: paintNormal,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      roughness: 0.95,
      metalness: 0
    });

    const rusting = [];
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.material.name === 'GenPaint' || child.material.name === 'GenSkid') rusting.push(child);
      if (child.material.name !== 'GenPaint') return;
      // White, so the texture's own paint colour is not tinted twice.
      child.material.color.set(0xffffff);
      child.material.map = paintMap;
      child.material.normalMap = paintNormal;
      child.material.needsUpdate = true;
    });
    // Added after the walk, so it does not walk into the layers it is adding.
    // A child of the surface it rusts, so it shakes with the engine too.
    for (const mesh of rusting) {
      const rust = new THREE.Mesh(mesh.geometry, rustOverlayMat);
      rust.receiveShadow = true;
      mesh.add(rust);
    }
    generatorShake.add(model);
  }).catch((err) => console.error('[lab] generator.glb failed to load', err));

  /**
   * The exhaust: a ribbed flexible hose from the outlet on the roof up to a
   * vent high on the wall behind -- a diesel run indoors has to breathe
   * somewhere, and the hose says someone set this machine up to run down here.
   */
  {
    const wallZ = -LAB_D / 2 - generator.position.z;   // the entrance wall, in the generator's frame
    const [ex, ey, ez] = GENERATOR_EXHAUST_TOP;
    // Up under the ceiling, where flue outlets go: a square wall plate with a
    // round spigot standing off it, and the hose clamped over the spigot. The
    // hose rises up the wall and only turns in at the very top.
    const VENT = { x: ex - 0.05, size: 0.2, spigotRadius: 0.045, spigotLength: 0.05 };
    VENT.y = LAB_H - VENT.size / 2 - 0.04;
    const spigotEndZ = wallZ + 0.012 + VENT.spigotLength;
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ex, ey - 0.01, ez),
      new THREE.Vector3(ex, ey + 0.25, ez - 0.01),
      new THREE.Vector3(ex - 0.03, 1.9, ez - 0.05),
      new THREE.Vector3(VENT.x, 2.7, wallZ + 0.16),
      new THREE.Vector3(VENT.x, VENT.y - 0.08, wallZ + 0.17),
      new THREE.Vector3(VENT.x, VENT.y, spigotEndZ + 0.06),
      new THREE.Vector3(VENT.x, VENT.y, spigotEndZ - 0.01)
    ]);
    const ribs = createRibbedHoseTexture();
    const ribCount = Math.round(hoseCurve.getLength() / 0.022);
    ribs.map.repeat.set(ribCount, 1);
    ribs.bumpMap.repeat.set(ribCount, 1);
    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(hoseCurve, 110, 0.038, 12, false),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: ribs.map, bumpMap: ribs.bumpMap, bumpScale: 2,
        metalness: 0.7, roughness: 0.45
      })
    );
    generator.add(hose);

    const ventMat = new THREE.MeshStandardMaterial({ color: 0x3b3d3c, metalness: 0.6, roughness: 0.55 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(VENT.size, VENT.size, 0.012), ventMat);
    plate.position.set(VENT.x, VENT.y, wallZ + 0.006);
    generator.add(plate);
    const spigot = new THREE.Mesh(
      new THREE.CylinderGeometry(VENT.spigotRadius, VENT.spigotRadius, VENT.spigotLength, 18, 1, true),
      ventMat
    );
    spigot.rotation.x = Math.PI / 2;
    spigot.position.set(VENT.x, VENT.y, wallZ + 0.012 + VENT.spigotLength / 2);
    generator.add(spigot);
    // The clamp band round the end of the hose, over the spigot.
    const clamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.043, 0.043, 0.014, 18),
      new THREE.MeshStandardMaterial({ color: 0x9a9c98, metalness: 0.85, roughness: 0.3 })
    );
    clamp.rotation.x = Math.PI / 2;
    clamp.position.set(VENT.x, VENT.y, spigotEndZ - 0.012);
    generator.add(clamp);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), clamp.material);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(VENT.x + dx * (VENT.size / 2 - 0.018), VENT.y + dy * (VENT.size / 2 - 0.018), wallZ + 0.013);
      generator.add(screw);
    }
  }

  /** The maker's plate on the door: the date that puts the machine in its decade. */
  const dataPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.09),
    new THREE.MeshStandardMaterial({
      map: createDataPlateTexture(['DIESEL GENERATING SET', 'MODEL DG-15  15 kVA', '230 V  50 Hz  1500 RPM', 'SERIAL 0471  1983']),
      metalness: 0.6,
      roughness: 0.5
    })
  );
  dataPlate.position.set(0.185, 0.72, GENERATOR_BODY.depth / 2 + 0.0065);
  generatorShake.add(dataPlate);

  // ---------- power / fuse puzzle / locked-door objective ----------

  /**
   * The five states the lab's electrical system moves through, in order.
   * Walking this chain end to end IS Level 2's objective, so it is a named
   * stage rather than the single `powerRestored` boolean this used to be --
   * "has power" and "the door bolts are fed" stopped being the same question
   * the moment the fuse alone was no longer enough to get out.
   *
   *  DEAD     - no fuse seated, or a wrong one. Nothing in the lab runs.
   *  LIT      - the 30A fuse is in. The strip lights and the CCTV desk come
   *             up, but the door bolts stay dead: the fuse only ever fed one
   *             section of the lab.
   *  BLACKOUT - the main was thrown, by hand, at the far wall, the moment the
   *             player went for the door. Lights and cameras die together.
   *  RUNNING  - the generator has been restarted, so there is current at the
   *             breaker panel again -- but nothing is routed to anything yet.
   *  ROUTED   - the breakers are set. Lights, CCTV and the door bolts are live.
   */
  const POWER_STAGE = {
    DEAD: 'dead',
    LIT: 'lit',
    BLACKOUT: 'blackout',
    RUNNING: 'running',
    ROUTED: 'routed'
  };
  let powerStage = POWER_STAGE.DEAD;
  let sparkTimer = 0;

  /** True once the code read off camera four has been entered at the door. */
  let securityCleared = false;

  /**
   * Whether anything in the lab is live at all.
   *
   * Both live stages are listed explicitly rather than testing "not one of the
   * dead ones", so a stage added later cannot silently switch the lights on in
   * itself by default.
   *
   * @returns {boolean} true in LIT and ROUTED, false in every other stage.
   */
  function hasMainsPower() {
    return powerStage === POWER_STAGE.LIT || powerStage === POWER_STAGE.ROUTED;
  }

  /**
   * Whether one named breaker circuit is feeding its system right now.
   *
   * Before the panel is routed there are no circuits to speak of -- the 30A
   * fuse feeds this one section of the lab wholesale, so LIGHTING and CCTV
   * are both effectively closed and everything else is open. After it, the
   * breakers themselves are the answer.
   *
   * @param {string} circuitId - 'door', 'cctv', 'lighting', 'locks' or 'vent'.
   * @returns {boolean} whether that system currently has power.
   */
  function isCircuitLive(circuitId) {
    if (powerStage === POWER_STAGE.ROUTED) return breakerIsOn[circuitId] === true;
    if (powerStage === POWER_STAGE.LIT) return circuitId === 'lighting' || circuitId === 'cctv';
    return false;
  }

  /** @returns {boolean} whether the lab's strip lights are burning. */
  function isLabLightingOn() {
    return isCircuitLive('lighting');
  }

  /** @returns {boolean} whether the monitor, the remote and the feeds work. */
  function isCctvPowered() {
    return isCircuitLive('cctv');
  }

  /**
   * Whether the metal door's bolts have been fed. Only the final stage does
   * it -- the fuse on its own was never going to open the way out.
   *
   * @returns {boolean} true only once the panel is routed with DOOR closed.
   */
  function isDoorPowered() {
    return isCircuitLive('door');
  }

  // 0 while the circuit is behaving, 1 at full whiteout. The overload glare
  // eases between the two instead of snapping, so the lights swell into the
  // blinding state (and fade back out of it) over a fraction of a second.
  let overloadGlare = 0;
  const OVERLOAD_GLARE_RAMP_IN_SECONDS = 0.35;

  // 0 while the lab is running on a dead circuit, 1 once the 30A fuse has
  // restored power. Eased like the glare so the strip lights swell up when
  // the fuse clicks in rather than popping to full brightness in one frame.
  let powerLevel = 0;
  const POWER_RAMP_IN_SECONDS = 0.6;

  const puzzleState = {
    heldFuse: null,   // amps string currently in the player's hand, or null
    slotFuse: null,   // amps string currently seated in the fuse box, or null
    overloaded: false // true while an overrated fuse is seated (drives the light-glare effect)
  };

  const fuseFailReason = {}; // amps -> 'blown' | 'overrated', keyed per fuse for the dropped-fuse inspect prompt
  const fuseMeshes = {};     // amps -> mesh, so fuse box logic can move/reset a specific fuse

  /** The one rating the maintenance log calls for. Named because four
   *  separate branches used to test the bare string '30A'. */
  const CORRECT_FUSE_AMPS = '30A';

  const fuseData = [
    { id: 'fuse15', amps: '15A' },
    { id: 'fuse20', amps: '20A' },
    { id: 'fuse30', amps: '30A' }, // correct
    { id: 'fuse45', amps: '45A' }
  ];

  /**
   * The four loose fuses are all clones of fuse.glb. Loaded once, here; each
   * fuse attaches its own copy when the download lands.
   */
  const fuseModelPromise = loadModel(fuseModelUrl);
  fuseModelPromise.catch((err) => console.error('[lab] fuse.glb failed to load', err));

  /**
   * A fuse's click target: an invisible cylinder the size of the whole fuse,
   * with the glass model as its child.
   *
   * Interaction raycasts non-recursively, so the thing in `interactables` has
   * to be a single mesh -- the loaded model is a group of five. The cylinder
   * is hidden through its MATERIAL, not `visible`: hiding the object would
   * hide its children too, and the raycaster ignores material visibility, so
   * it still takes the hit. Moving, hiding or seating this mesh carries the
   * model with it, which is all the puzzle code ever does to a fuse.
   */
  const fuseHitGeometry = new THREE.CylinderGeometry(FUSE_CAP_RADIUS, FUSE_CAP_RADIUS, FUSE_LENGTH, 12);
  const fuseHitMaterial = new THREE.MeshBasicMaterial({ visible: false });

  /** What the glass becomes once the element has burned out inside it. */
  const sootedGlassMat = new THREE.MeshStandardMaterial({
    color: 0x24180f, roughness: 0.6, transparent: true, opacity: 0.78, depthWrite: false
  });

  function createGlassFuse(amps) {
    const fuse = new THREE.Mesh(fuseHitGeometry, fuseHitMaterial);
    fuse.userData.scorched = false;
    fuse.userData.visual = null;
    fuseModelPromise.then((model) => {
      const visual = model.clone();
      // The stamps face the model's own +/-Z. A quarter turn about the fuse's
      // axis points one of them up when the fuse lies on its side, and out of
      // the box when it stands in the clips. The hit cylinder is round, so
      // turning the model inside it changes nothing else.
      visual.rotation.y = Math.PI / 2;
      const stamp = createFuseCapStampTexture(amps);
      visual.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material.name === 'FuseCapMetal') {
          child.material = child.material.clone();
          child.material.color.set(0xffffff);
          child.material.map = stamp.map;
          child.material.bumpMap = stamp.bumpMap;
          child.material.bumpScale = 0.6;
        } else if (child.material.name === 'FuseGlass') {
          visual.userData.glass = child;
          visual.userData.cleanGlassMat = child.material;
        } else if (child.name === 'FuseElementWire') {
          visual.userData.wire = child;
        } else if (child.name === 'FuseElementWireBroken') {
          visual.userData.brokenWire = child;
        }
      });
      fuse.userData.visual = visual;
      fuse.add(visual);
      applyFuseScorch(fuse);
    });
    return fuse;
  }

  function applyFuseScorch(fuse) {
    const visual = fuse.userData.visual;
    if (!visual) return;
    const scorched = fuse.userData.scorched;
    visual.userData.glass.material = scorched ? sootedGlassMat : visual.userData.cleanGlassMat;
    visual.userData.wire.visible = !scorched;
    visual.userData.brokenWire.visible = scorched;
  }

  /**
   * Blows a fuse that was too weak for the line, or restores it: soot on the
   * inside of the glass and the element snapped in two, which is how a real
   * glass fuse shows it has gone. Recorded on the fuse rather than only
   * applied, so a fuse that blows before its model has loaded still comes in
   * blown.
   */
  function setFuseScorched(fuse, scorched) {
    fuse.userData.scorched = scorched;
    applyFuseScorch(fuse);
  }

  // Heights of the surfaces the fuses rest on, taken from the geometry
  // built further down this file rather than eyeballed -- the fuses used
  // to sit at hand-picked Y values that matched no real surface, so they
  // hung in mid-air beside the props they were supposed to be lying on.
  const WORKBENCH_TOP_Y = 0.845;   // workbench y=0 + benchTop y=0.82 + half of its 0.05 thickness
  const LAB_FLOOR_Y = 0;
  const DESK_TOP_Y = DESK_TOP_SIZE.standHeight + DESK_TOP_SIZE.thickness / 2;

  // Top face of the crate the 45A rests on, taken from CRATE_LAYOUT rather
  // than copied out of it -- see the note on that constant.
  const FUSE_CRATE_TOP_Y = FUSE_CRATE.stackY + CRATE_SIZE;

  /**
   * Where each fuse lies, index-matched to `fuseData`, in `lab` space.
   *
   * Every spot is computed from the prop it lies on or beside instead of being
   * written out, because fuses with hand-copied coordinates kept coming adrift
   * whenever their prop moved -- and the room growing moves all of them.
   */
  const fuseRestingSpots = [
    // workbench top, clear of the four tool props
    { x: WORKBENCH_POSITION.x + 0.5, z: WORKBENCH_POSITION.z - 0.25, surfaceY: WORKBENCH_TOP_Y },
    // floor, just outside the workbench's collider
    { x: WORKBENCH_POSITION.x + 0.9, z: WORKBENCH_POSITION.z, surfaceY: LAB_FLOOR_Y },
    {
      // Desk top, on the right of the monitor and clear of both it and the
      // remote. The monitor body is 0.5 wide on the desk's centreline, so
      // anything past +0.25 of centre is free surface.
      x: DESK_POSITION.x + 0.4,
      z: DESK_POSITION.z + 0.05,
      surfaceY: DESK_TOP_Y
    },
    {
      // Flat top face of the crate stack, just off its centre.
      x: FUSE_CRATE.x + 0.05,
      z: FUSE_CRATE.z + 0.05,
      surfaceY: FUSE_CRATE_TOP_Y
    }
  ];

  // A fuse is centred on its own origin, so resting it exactly at the surface
  // height would sink half of it into that surface. Lying on its side it rests
  // on its caps, the widest part of it, so their radius is what is added.
  const fusePositions = fuseRestingSpots.map(
    (spot) => [spot.x, spot.surfaceY + FUSE_CAP_RADIUS, spot.z]
  );

  /**
   * A collider that only exists while something is swung out into the room --
   * an open cover. `holder.box` is the live entry in `colliders`, which the
   * player reads every frame, so adding or removing it takes effect at once.
   */
  function setSwingCollider(holder, pointsInLab) {
    if (holder.box) {
      const i = colliders.indexOf(holder.box);
      if (i >= 0) colliders.splice(i, 1);
      holder.box = null;
    }
    if (!pointsInLab) return;
    const PAD = 0.02;
    const xs = pointsInLab.map((p) => p.x);
    const zs = pointsInLab.map((p) => p.z);
    holder.box = {
      minX: Math.min(...xs) - PAD, maxX: Math.max(...xs) + PAD,
      minZ: LAB_Z + Math.min(...zs) - PAD, maxZ: LAB_Z + Math.max(...zs) + PAD
    };
    colliders.push(holder.box);
  }

  /**
   * The fuse box, after a four-way cartridge board: see
   * blender/build_fuse_box.py. Its back sits on the west wall and it faces
   * into the room -- the model faces its own +Z, and a quarter turn takes that
   * to +X.
   *
   * The loaded model is only the look, three permanent fuses included.
   * Everything the puzzle touches is built here, synchronously, so none of it
   * waits on a download -- `fuseBox` itself is an invisible click target over
   * the front of the box. It keeps its old name and stays in
   * `lab` space because the spark light, the dropped-fuse row and the cable
   * run all read its position.
   */
  const fuseBoxModel = new THREE.Group();
  fuseBoxModel.position.set(-LAB_W / 2, 1.4, 0);
  fuseBoxModel.rotation.y = Math.PI / 2;
  fuseBoxModel.updateMatrix();
  lab.add(fuseBoxModel);

  /** A point given in the fuse box's own space, in `lab` space. */
  function fuseBoxPointInLab(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(fuseBoxModel.matrix);
  }

  /** Where a fuse the player installs ends up: standing in the empty clips. */
  const emptySlotPosition = fuseBoxPointInLab(FUSE_BOX_SLOT_X[FUSE_BOX_EMPTY_SLOT], 0, FUSE_BOX_FUSE_DEPTH);

  const fuseBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, FUSE_BOX_HEIGHT, FUSE_BOX_WIDTH),
    new THREE.MeshBasicMaterial()
  );
  // Hidden, not removed: the raycaster tests hidden meshes all the same. Just
  // proud of the closed cover, so it is what the player's ray meets first.
  fuseBox.visible = false;
  fuseBox.position.set(-LAB_W / 2 + FUSE_BOX_DEPTH + 0.02, 1.4, 0);

  /**
   * The hinged perspex cover. Opening it is its own click, before the slot is
   * any use -- it gives the player a beat at the box, and the dirty pane lets
   * them see the empty clip before they have touched anything.
   *
   * `pivot` is the model's hinge node, and stays null until the model has
   * loaded. The open/closed state does not wait for it; the cover simply
   * appears in whichever state the player has already put it in.
   */
  const fuseCover = { open: false, pivot: null, closedRotationY: 0, angle: 0, everOpened: false };
  const FUSE_COVER_CLOSED_LABEL = 'Open the fuse box cover';
  const fuseCoverCollider = { box: null };

  /**
   * A stand-in for the cover's hinge, built here so it exists before the model
   * does, turned in step with the real one. The open cover's click target
   * rides on it -- so it is wherever the cover is -- and is only in the target
   * list while the cover is open: closed, the box's front target opens it.
   */
  const fuseCoverHinge = new THREE.Group();
  fuseCoverHinge.position.set(FUSE_COVER_HINGE.x, 0, FUSE_COVER_HINGE.z);
  fuseBoxModel.add(fuseCoverHinge);
  const fuseCoverHit = new THREE.Mesh(
    new THREE.BoxGeometry(FUSE_BOX_WIDTH, FUSE_BOX_HEIGHT, 0.02),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  fuseCoverHit.position.x = -FUSE_BOX_WIDTH / 2;
  fuseCoverHinge.add(fuseCoverHit);
  fuseCoverHit.userData.interact = {
    label: 'Close the fuse box cover',
    onInteract: () => setFuseCoverOpen(false)
  };

  /** What the slot offers once the cover is out of the way, from what is in it. */
  function fuseSlotLabel() {
    if (puzzleState.slotFuse === CORRECT_FUSE_AMPS) return 'Fuse seated (30A)';
    if (puzzleState.slotFuse) return 'Remove fuse';
    return 'Empty fuse slot';
  }

  /**
   * Opens or shuts the cover. Open, it swings out into the room, so it gets a
   * collider for as long as it stands there -- the player used to walk
   * straight through it. `quiet` skips the caption, for a restart.
   */
  function setFuseCoverOpen(open, { quiet = false } = {}) {
    fuseCover.open = open;
    const i = interactables.indexOf(fuseCoverHit);
    if (open && i < 0) interactables.push(fuseCoverHit);
    if (!open && i >= 0) interactables.splice(i, 1);
    fuseBox.userData.interact.label = open ? fuseSlotLabel() : FUSE_COVER_CLOSED_LABEL;

    if (open) {
      // The swung-out cover, hinge to free edge, in lab space.
      const reach = FUSE_BOX_WIDTH;
      const a = FUSE_COVER_OPEN_ANGLE_IN_RADIANS;
      setSwingCollider(fuseCoverCollider, [
        fuseBoxPointInLab(FUSE_COVER_HINGE.x, 0, FUSE_COVER_HINGE.z),
        fuseBoxPointInLab(FUSE_COVER_HINGE.x - reach * Math.cos(a), 0, FUSE_COVER_HINGE.z + reach * Math.sin(a))
      ]);
    } else {
      setSwingCollider(fuseCoverCollider, null);
    }

    if (quiet) return;
    if (open && !fuseCover.everOpened) {
      showCaption(line('dialog_fuse_cover_first_open'));
    } else {
      showCaption(line(open ? 'dialog_fuse_cover_open' : 'dialog_fuse_cover_shut'));
    }
    if (open) fuseCover.everOpened = true;
  }

  dynamics.push({
    update(dt) {
      const target = fuseCover.open ? FUSE_COVER_OPEN_ANGLE_IN_RADIANS : 0;
      if (fuseCover.angle === target) return;
      const step = (FUSE_COVER_OPEN_ANGLE_IN_RADIANS / FUSE_COVER_OPEN_SECONDS) * dt;
      fuseCover.angle = target > fuseCover.angle
        ? Math.min(target, fuseCover.angle + step)
        : Math.max(target, fuseCover.angle - step);
      if (fuseCover.pivot) fuseCover.pivot.rotation.y = fuseCover.closedRotationY + fuseCover.angle;
      fuseCoverHinge.rotation.y = fuseCover.angle;
    }
  });

  loadModel(fuseBoxModelUrl).then((model) => {
    const paintMap = createFixtureSteelTexture({ rust: 0.9 });
    const paintNormal = createFixtureSteelNormalTexture();
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.material.name === 'FuseBoxPaint') {
        // White, so the texture's own yellowed enamel is not tinted twice.
        child.material.color.set(0xffffff);
        child.material.map = paintMap;
        child.material.normalMap = paintNormal;
        child.material.needsUpdate = true;
      } else if (child.material.name === 'FuseBoxPerspex') {
        child.material.transparent = true;
        child.material.opacity = 0.16;
        child.material.roughness = 0.1;
        // Without this the pane hides the fuses behind it from the depth
        // test, transparent or not.
        child.material.depthWrite = false;
      }
    });

    fuseCover.pivot = model.getObjectByName('FuseBoxCoverPivot');
    if (fuseCover.pivot) {
      fuseCover.closedRotationY = fuseCover.pivot.rotation.y;
      fuseCover.pivot.rotation.y = fuseCover.closedRotationY + fuseCover.angle;
    } else {
      console.warn('[lab] fuse_box.glb has no FuseBoxCoverPivot -- the cover cannot open');
    }
    fuseBoxModel.add(model);
  }).catch((err) => console.error('[lab] fuse_box.glb failed to load', err));

  // Wrong fuses pulled back out of the box land in the next free slot of a
  // short row on the floor beside it, so earlier rejects stay visible
  // instead of every drop stacking on one shared coordinate. Only the three
  // wrong fuses (15A / 20A / 45A) can ever be dropped -- the correct 30A one
  // stays seated -- so three slots is exactly enough for a single run.
  // Lying on its side, so it rests on its caps.
  const DROPPED_FUSE_Y = FUSE_CAP_RADIUS;
  const DROPPED_FUSE_SPACING_IN_METRES = 0.2;
  const droppedFuseSlots = [-1, 0, 1].map((step) => [
    fuseBox.position.x + 0.1,
    DROPPED_FUSE_Y,
    fuseBox.position.z + step * DROPPED_FUSE_SPACING_IN_METRES
  ]);
  let droppedFuseCount = 0;

  const sparkLight = new THREE.PointLight(0xfff2b0, 0, 1.0, 2);
  sparkLight.position.copy(fuseBox.position);
  lab.add(sparkLight);

  fuseBox.userData.interact = {
    label: FUSE_COVER_CLOSED_LABEL,
    onInteract: () => {
      if (!fuseCover.open) {
        setFuseCoverOpen(true);
        return;
      }

      /**
       * Once the right fuse is seated it STAYS seated, in every later stage.
       *
       * The blackout further on is the main being thrown at the far wall, not
       * this fuse failing. Letting the player pull the 30A back out afterwards
       * would send them to re-solve a puzzle that was never the problem, and
       * the caption is worded to head that off before they try.
       */
      if (puzzleState.slotFuse === CORRECT_FUSE_AMPS) {
        showCaption(line('dialog_fuse_already_seated'));
        return;
      }

      // A fuse is already seated -- remove it instead of installing
      if (puzzleState.slotFuse) {
        const removed = puzzleState.slotFuse;
        puzzleState.slotFuse = null;
        puzzleState.overloaded = false;
        sparkTimer = 0;
        sparkLight.intensity = 0;
        fuseBox.userData.interact.label = 'Empty fuse slot';
        showCaption(line('dialog_fuse_pulled_out', { amps: removed }));

        const dropped = fuseMeshes[removed];
        const slot = droppedFuseSlots[Math.min(droppedFuseCount, droppedFuseSlots.length - 1)];
        droppedFuseCount += 1;
        dropped.position.set(...slot);
        dropped.rotation.set(0, 0, Math.PI / 2);
        dropped.visible = true;

        const reason = fuseFailReason[removed];
        dropped.userData.interact = {
          label: reason === 'blown' ? 'Blown fuse' : 'Fuse (rating too high)',
          onInteract: () => {
            showCaption(line(
              reason === 'blown'
                ? 'dialog_dropped_fuse_blown'
                : 'dialog_dropped_fuse_overrated'
            ));
          }
        };
        if (!interactables.includes(dropped)) interactables.push(dropped);
        return;
      }

      // Slot is empty -- try installing whatever's in hand
      if (!puzzleState.heldFuse) {
        showCaption(line('dialog_fuse_slot_empty'));
        return;
      }

      const installed = puzzleState.heldFuse;
      const amps = parseInt(installed, 10);
      puzzleState.heldFuse = null;

      // Whatever goes in is seen to go in: the fuse the player carried over
      // stands in the empty clips, right or wrong, until it is pulled out.
      const seatedFuse = fuseMeshes[installed];
      seatedFuse.position.copy(emptySlotPosition);
      seatedFuse.rotation.set(0, 0, 0);
      seatedFuse.visible = true;

      if (installed === CORRECT_FUSE_AMPS) {
        powerStage = POWER_STAGE.LIT;
        puzzleState.slotFuse = CORRECT_FUSE_AMPS;
        showCaption(line('dialog_fuse_clicks_in'));
        fuseBox.userData.interact.label = 'Fuse seated (30A)';
        // NOT 'Open the door'. The fuse feeds this section of the lab only --
        // the bolts are on a circuit that has not been fed yet, and the whole
        // rest of the level is about finding out why.
        metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.LIT];
        // The screen stops being pure static. The picture fights its way
        // through the interference rather than appearing; uStaticMix is what
        // the shader crossfades on. The lab's own lights are NOT set here --
        // updateLabLighting ramps them off the power stage, so they come up over
        // POWER_RAMP_IN_SECONDS instead of snapping on.
        screenMaterial.uniforms.uNoiseStrength.value = 0.35;
        screenMaterial.uniforms.uStaticMix.value = 0.18;
        syncMonitor();
        // The lab is lit, the house is not. Four of the five cameras come up
        // showing a dark room and naming the circuit that would fix it --
        // which is where the player first learns HOUSE is a thing to want.
        syncFeedRoomPower();
        onPowerRestored();
      } else if (amps < 30) {
        puzzleState.slotFuse = installed;
        fuseFailReason[installed] = 'blown';
        showCaption(line('dialog_fuse_burns_out', { amps: installed }));
        // Only a fuse too weak for the line burns. The 45A whites the lab out
        // but comes back out clean -- nothing in it gave way.
        setFuseScorched(seatedFuse, true);
        onSpark();
        sparkLight.intensity = 4;
        sparkTimer = 0.15;
        fuseBox.userData.interact.label = 'Remove fuse';
      } else {
        puzzleState.slotFuse = installed;
        fuseFailReason[installed] = 'overrated';
        showCaption(line('dialog_fuse_rating_too_high', { amps: installed }));
        puzzleState.overloaded = true;
        fuseBox.userData.interact.label = 'Remove fuse';
      }
    }
  };
  interactables.push(fuseBox);
  lab.add(fuseBox);

  fuseData.forEach((data, i) => {
    const fuse = createGlassFuse(data.amps);
    fuse.rotation.z = Math.PI / 2;
    fuse.position.set(...fusePositions[i]);
    fuse.userData.interact = {
      label: `Pick up fuse (${data.amps})`,
      onInteract: () => {
        if (puzzleState.heldFuse) {
          showCaption(line('dialog_fuse_already_holding'));
          return;
        }
        puzzleState.heldFuse = data.amps;
        showCaption(line('dialog_fuse_taken', { amps: data.amps }));
        fuse.visible = false;
        const idx = interactables.indexOf(fuse);
        if (idx !== -1) interactables.splice(idx, 1);
      }
    };
    interactables.push(fuse);
    lab.add(fuse);
    fuseMeshes[data.amps] = fuse;
  });

  const maintenanceNoteTex = createPaperNoteTexture([
    'MAINTENANCE LOG',
    'REPLACE BLOWN FUSE',
    'CORRECT RATING',
    'ONLY. ANYTHING',
    'ELSE WILL BLOW',
    'OR BURN THE LINE'
  ]);
  const maintenanceNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.38),
    new THREE.MeshStandardMaterial({ map: maintenanceNoteTex, roughness: 1 })
  );
  /**
   * Taped to the wall beside the fuse box, rather than hanging in open air
   * 0.7 m off it as it used to. Turned to face into the room: a PlaneGeometry
   * fronts +Z and this wall runs along Z, so an unrotated note would have
   * presented its edge to the player and its back to the room.
   *
   * It no longer names the rating. Saying "30A ONLY" made the fuse puzzle a
   * lookup -- read the note, take the matching cylinder -- when the room
   * already tells the player everything they need by failing loudly: an
   * under-rated fuse blows with a spark, an over-rated one whites the lab out
   * until it is pulled. The note now says only that the rating matters.
   */
  maintenanceNote.position.set(-LAB_W / 2 + 0.03, 1.4, 0.55);
  maintenanceNote.rotation.y = Math.PI / 2;
  maintenanceNote.userData.interact = {
    label: 'Read maintenance log',
    onInteract: () => showCaption(line('dialog_maintenance_log'))
  };
  interactables.push(maintenanceNote);
  lab.add(maintenanceNote);

  // a hazard sign bolted above the generator, and a couple of cable runs
  // slung between it and the fuse box -- small clutter that sells "this
  // was a working piece of industrial equipment" far better than a bare box
  const hazardSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.26),
    new THREE.MeshStandardMaterial({ map: createHazardSignTexture('HIGH VOLTAGE'), roughness: 0.8 })
  );
  // On the WALL above the generator, not hovering behind it. It used to sit at
  // x = -3.29, which is 0.7 m out from the wall and 0.15 m above the
  // generator's top face -- bolted to nothing, in the middle of the air.
  hazardSign.position.set(-LAB_W / 2 + 0.03, GENERATOR_BODY.top + 0.35, generator.position.z);
  hazardSign.rotation.y = Math.PI / 2;
  lab.add(hazardSign);

  /**
   * The feed from the generator to the fuse box, now a 2.4 m run along the
   * wall from the corner. It leaves the generator's side panel (the face
   * pointing at the fuse box) at the wall-side edge and enters the fuse box low
   * on the same side, so the whole run hangs within 0.2 m of the wall -- the
   * player's camera can get no closer than 0.5 m, so it never ends up inside it.
   *
   * The dangle is a parabola dropped below the straight line between the two
   * ends, sampled into enough points that the spline follows it instead of
   * cutting the corner. A three-point curve, which was enough for the old
   * 1.5 m run, kinks at its one low point over this length.
   */
  const CABLE_SAG_IN_METRES = 0.55;
  const CABLE_SAMPLE_COUNT = 9;
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.6 });
  const cableStart = new THREE.Vector3(...GENERATOR_CABLE_GLAND).add(generator.position);
  // Into the grommet in the fuse box's underside, where its incoming wires go.
  const cableEnd = fuseBoxPointInLab(0, -FUSE_BOX_HEIGHT / 2 - 0.012, FUSE_BOX_GROMMET_DEPTH);
  const cablePoints = [];
  for (let i = 0; i < CABLE_SAMPLE_COUNT; i++) {
    const t = i / (CABLE_SAMPLE_COUNT - 1);
    const point = cableStart.clone().lerp(cableEnd, t);
    point.y -= 4 * CABLE_SAG_IN_METRES * t * (1 - t);
    cablePoints.push(point);
  }
  const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 40, 0.012, 6, false), cableMat);
  lab.add(cable);

  // The box's outgoing wires leave through the top grommet in a conduit up to
  // the ceiling, so the lab's circuits visibly go somewhere.
  const conduitBottom = fuseBoxPointInLab(0, FUSE_BOX_HEIGHT / 2, FUSE_BOX_GROMMET_DEPTH);
  const conduitLength = LAB_H - conduitBottom.y;
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, conduitLength, 10), pipeMat);
  conduit.position.set(conduitBottom.x, conduitBottom.y + conduitLength / 2, conduitBottom.z);
  lab.add(conduit);

  // ---------- puzzle 2a: restarting the generator ----------

  /**
   * The order the three controls on the generator's face have to be worked in,
   * which is exactly what the plate bolted above them says. Out of order and
   * the set resets, because a half-primed engine does not stay half-primed.
   */
  const GENERATOR_RESTART_SEQUENCE = ['valve', 'primer', 'starter'];
  /**
   * Each control's prompt, and the dialogue key for what pressing it in the
   * right order says (the text is in src/dialogue/level2_basement.js).
   *
   * The caption is PER CONTROL rather than one template with the label
   * substituted in. It used to read "<label>. It is waiting for the next one."
   * for every step, which told the player only which button they had just
   * pressed and then narrated the state machine at them. These say what the
   * control physically did, so progress is legible without a status report --
   * and they get louder as the sequence goes on, because that is the real cost
   * of restarting a generator in a house you are trying not to be found in.
   *
   * The starter has no caption here: finishing the sequence is startGenerator's
   * beat, not a step's.
   */
  const GENERATOR_CONTROLS = {
    valve: {
      label: 'Fuel valve',
      caption: 'dialog_generator_valve'
    },
    primer: {
      label: 'Primer pump',
      caption: 'dialog_generator_primer'
    },
    starter: {
      label: 'Starter',
      caption: null
    }
  };
  const GENERATOR_CONTROL_COLOR_DONE = 0x2e6b3a;
  const GENERATOR_CONTROL_COLOR_IDLE = 0x000000;

  /** How many steps of the sequence are currently satisfied, 0..3. */
  let generatorStepsCompleted = 0;
  /** Pull-start attempts since the engine was primed; it catches on STARTER_PULLS_TO_CATCH. */
  let starterPulls = 0;
  /** control id -> its pilot lamp. */
  const generatorControlMeshes = {};

  /**
   * Whether the engine is turning. It is in every stage but the blackout:
   * before it, it runs on its own; the blackout kills it; the restart is what
   * brings it back.
   */
  function isGeneratorRunning() {
    return powerStage !== POWER_STAGE.BLACKOUT;
  }

  /**
   * Repaints the three pilot lamps so the player can see how far into the
   * sequence they are without having to remember. Green for a step already
   * taken, dark for one still outstanding -- and all three green while the
   * engine runs.
   */
  function updateGeneratorControlLights() {
    const lit = isGeneratorRunning() ? GENERATOR_RESTART_SEQUENCE.length : generatorStepsCompleted;
    GENERATOR_RESTART_SEQUENCE.forEach((controlId, stepIndex) => {
      generatorControlMeshes[controlId].material.emissive.setHex(
        stepIndex < lit ? GENERATOR_CONTROL_COLOR_DONE : GENERATOR_CONTROL_COLOR_IDLE
      );
    });
  }

  /**
   * The engine catches. Current reaches the breaker panel, and nothing else --
   * the lights and the cameras stay dark until something is routed to them,
   * which is the point of the panel puzzle waiting on the other side of this.
   */
  function startGenerator() {
    powerStage = POWER_STAGE.RUNNING;
    metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.RUNNING];
    showCaption(line('dialog_generator_catches'));
    onGeneratorRunning();
  }

  /**
   * Handles one press of one generator control.
   *
   * @param {string} controlId - which control was pressed: 'valve', 'primer'
   *   or 'starter'.
   *
   * Silently does nothing but talk in every stage except BLACKOUT: before the
   * main is thrown the generator is already turning over, and afterwards it is
   * running, so there is nothing to restart in either case.
   */
  function pressGeneratorControl(controlId) {
    if (powerStage !== POWER_STAGE.BLACKOUT) {
      showCaption(line(
        powerStage === POWER_STAGE.RUNNING || powerStage === POWER_STAGE.ROUTED
          ? 'dialog_generator_leave_it_alone'
          : 'dialog_generator_turning_over'
      ));
      return;
    }

    // Whatever the puzzle makes of it, the control moves.
    animateGeneratorControl(controlId);

    if (controlId !== GENERATOR_RESTART_SEQUENCE[generatorStepsCompleted]) {
      generatorStepsCompleted = 0;
      starterPulls = 0;
      updateGeneratorControlLights();
      onSpark();
      showCaption(line('dialog_generator_wrong_order'));
      return;
    }

    // Primed and pulled, it still takes more than one go. Each failed pull
    // shakes the cabinet harder and is louder than the last.
    if (controlId === 'starter') {
      starterPulls += 1;
      if (starterPulls < STARTER_PULLS_TO_CATCH) {
        generatorSputterSeconds = 0.4 + starterPulls * 0.5;
        showCaption(line(starterPulls === 1
          ? 'dialog_starter_first_pull'
          : 'dialog_starter_later_pull'));
        return;
      }
    }

    generatorStepsCompleted += 1;
    updateGeneratorControlLights();

    if (generatorStepsCompleted < GENERATOR_RESTART_SEQUENCE.length) {
      showCaption(line(GENERATOR_CONTROLS[controlId].caption));
      return;
    }
    startGenerator();
  }

  /**
   * The control panel on the generator's room-facing end, built for 1980s
   * hardware: three analogue gauges, a pilot lamp over each control, and the
   * three controls in the order the plate gives them -- fuel valve, primer,
   * pull-start. The model supplies their mountings; the moving parts are built
   * here so the puzzle can move them.
   *
   * Each control's click target is an invisible box round it rather than the
   * part itself: the parts are small, they move, and Interaction raycasts
   * non-recursively, so a part with children would never register a hit.
   */
  const panelX = GENERATOR_PANEL_X;
  const rowY = GENERATOR_ROW_Y;

  // The gauges. A needle sweeps the same 270 degrees its face is printed for.
  const GAUGE_SWEEP_RADIANS = (135 * Math.PI) / 180;
  const gaugeNeedleGeometry = new THREE.BoxGeometry(0.002, 0.036, 0.0025);
  gaugeNeedleGeometry.translate(0, 0.016, 0);
  const gaugeNeedleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const gauges = GENERATOR_GAUGES.map((def) => {
    const z = GENERATOR_CONTROL_Z[def.slot];
    const faceGeometry = new THREE.CircleGeometry(0.042, 32);
    faceGeometry.rotateY(Math.PI / 2);
    const face = new THREE.Mesh(
      faceGeometry,
      new THREE.MeshStandardMaterial({ map: createGaugeFaceTexture(def), roughness: 0.4 })
    );
    face.position.set(panelX + 0.0125, rowY.gauge, z);
    const needle = new THREE.Mesh(gaugeNeedleGeometry, gaugeNeedleMat);
    needle.position.set(panelX + 0.0145, rowY.gauge, z);
    generatorShake.add(face, needle);
    return { def, needle, value: 0 };
  });

  /** What each gauge should read right now, from the power stage. */
  function gaugeTarget(def) {
    if (!isGeneratorRunning()) return 0;
    if (def.reads === 'volts') return 230;
    if (def.reads === 'hertz') return 50;
    if (powerStage === POWER_STAGE.ROUTED) return getTotalBreakerLoadInAmps();
    if (powerStage === POWER_STAGE.LIT) return 35;   // the lab's lights and cameras, off the fuse
    return 0;
  }

  // The fuel valve: a red lever on its boss, pointing up when shut and turned
  // a quarter toward the room when open.
  const valveLever = new THREE.Group();
  valveLever.position.set(panelX + 0.016, rowY.control, GENERATOR_CONTROL_Z.valve);
  {
    const red = new THREE.MeshStandardMaterial({ color: 0xa8261c, roughness: 0.45 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), red);
    hub.rotation.z = Math.PI / 2;
    const armGeometry = new THREE.BoxGeometry(0.01, 0.075, 0.018);
    armGeometry.translate(0, 0.032, 0);
    valveLever.add(hub, new THREE.Mesh(armGeometry, red));
  }
  generatorShake.add(valveLever);
  let valveAngle = 0;

  // The primer: a black plunger that goes in when pressed and springs back.
  const primerKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.03, 20),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.6 })
  );
  primerKnob.rotation.z = Math.PI / 2;
  const PRIMER_REST_X = panelX + 0.035;
  primerKnob.position.set(PRIMER_REST_X, rowY.control, GENERATOR_CONTROL_Z.primer);
  generatorShake.add(primerKnob);
  let primerPressSeconds = 0;

  // The pull-start: a T-handle resting in its cup, on a rope that comes out
  // of the grommet behind it. A pull rips it out along the rope and lets it
  // snap back.
  const ROPE_EXIT = new THREE.Vector3(panelX + 0.012, rowY.control, GENERATOR_CONTROL_Z.starter);
  const pullHandle = new THREE.Group();
  {
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.014), black);
    stem.position.x = 0.015;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 14), black);
    grip.rotation.x = Math.PI / 2;
    grip.position.x = 0.036;
    pullHandle.add(stem, grip);
  }
  pullHandle.position.copy(ROPE_EXIT);
  generatorShake.add(pullHandle);
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0xc9bfa0, roughness: 0.9 })
  );
  rope.rotation.z = Math.PI / 2;
  rope.visible = false;
  generatorShake.add(rope);
  /** Seconds into the current pull, or -1 when the handle is at rest. */
  let pullSeconds = -1;
  const PULL_OUT_SECONDS = 0.22;
  const PULL_BACK_SECONDS = 0.35;
  const PULL_LENGTH = 0.38;

  /** Seconds of rough shuddering left after a pull that failed to catch. */
  let generatorSputterSeconds = 0;

  /** Sets one of the three moving controls going, whatever the puzzle makes of it. */
  function animateGeneratorControl(controlId) {
    if (controlId === 'primer') primerPressSeconds = 0.25;
    if (controlId === 'starter') pullSeconds = 0;
  }

  // The pilot lamps, one over each control, lit green for a step taken.
  // updateGeneratorControlLights repaints them through generatorControlMeshes.
  GENERATOR_RESTART_SEQUENCE.forEach((controlId) => {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 0.3, emissive: GENERATOR_CONTROL_COLOR_IDLE })
    );
    lamp.position.set(panelX + 0.008, rowY.lamp, GENERATOR_CONTROL_Z[controlId]);
    generatorShake.add(lamp);
    generatorControlMeshes[controlId] = lamp;

    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.11), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(panelX + 0.035, rowY.control, GENERATOR_CONTROL_Z[controlId]);
    hit.userData.interact = {
      label: GENERATOR_CONTROLS[controlId].label,
      onInteract: () => pressGeneratorControl(controlId)
    };
    generatorShake.add(hit);
    interactables.push(hit);
  });
  updateGeneratorControlLights();

  const restartPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.16),
    new THREE.MeshStandardMaterial({
      map: createPaperNoteTexture(['RESTART ORDER', '1. FUEL VALVE', '2. PRIME', '3. STARTER']),
      roughness: 1
    })
  );
  restartPlate.position.set(panelX + 0.0015, 0.32, 0);
  restartPlate.rotation.y = Math.PI / 2;
  restartPlate.userData.interact = {
    label: 'Read the restart plate',
    onInteract: () => showCaption(line('dialog_restart_plate'))
  };
  interactables.push(restartPlate);
  generatorShake.add(restartPlate);

  dynamics.push({
    update(dt, elapsed) {
      // Running, it hums through the floor; a failed pull shakes it hard.
      if (generatorSputterSeconds > 0) generatorSputterSeconds = Math.max(0, generatorSputterSeconds - dt);
      const shake = (isGeneratorRunning() ? 1 : 0) + Math.min(1, generatorSputterSeconds) * 3;
      generatorShake.position.x = Math.sin(elapsed * 97) * 0.0006 * shake;
      generatorShake.position.z = Math.sin(elapsed * 83 + 1.3) * 0.0006 * shake;
      generatorShake.rotation.z = Math.sin(elapsed * 71 + 0.4) * 0.0012 * shake;

      gauges.forEach((gauge) => {
        const target = gaugeTarget(gauge.def);
        gauge.value += (target - gauge.value) * Math.min(1, dt * 2.5);
        // A running engine never holds a needle perfectly still.
        const jitter = isGeneratorRunning() ? Math.sin(elapsed * 23 + gauge.def.max) * gauge.def.max * 0.004 : 0;
        const frac = THREE.MathUtils.clamp((gauge.value + jitter) / gauge.def.max, 0, 1);
        gauge.needle.rotation.x = GAUGE_SWEEP_RADIANS * (1 - 2 * frac);
      });

      const valveOpen = isGeneratorRunning() || generatorStepsCompleted >= 1;
      const valveTarget = valveOpen ? Math.PI / 2 : 0;
      valveAngle += (valveTarget - valveAngle) * Math.min(1, dt * 12);
      valveLever.rotation.x = valveAngle;

      if (primerPressSeconds > 0) primerPressSeconds = Math.max(0, primerPressSeconds - dt);
      primerKnob.position.x = PRIMER_REST_X - (primerPressSeconds > 0 ? 0.014 : 0);

      let pulled = 0;
      if (pullSeconds >= 0) {
        pullSeconds += dt;
        if (pullSeconds < PULL_OUT_SECONDS) {
          const t = pullSeconds / PULL_OUT_SECONDS;
          pulled = 1 - (1 - t) * (1 - t);
        } else if (pullSeconds < PULL_OUT_SECONDS + PULL_BACK_SECONDS) {
          const t = (pullSeconds - PULL_OUT_SECONDS) / PULL_BACK_SECONDS;
          pulled = 1 - t * t;
        } else {
          pullSeconds = -1;
        }
      }
      const reach = pulled * PULL_LENGTH;
      pullHandle.position.set(ROPE_EXIT.x + reach, ROPE_EXIT.y - pulled * 0.03, ROPE_EXIT.z);
      rope.visible = reach > 0.004;
      if (rope.visible) {
        rope.scale.y = reach;
        rope.position.set(ROPE_EXIT.x + reach / 2, ROPE_EXIT.y - pulled * 0.015, ROPE_EXIT.z);
        rope.rotation.z = Math.PI / 2 - Math.atan2(pulled * 0.03, reach);
      }
    }
  });

  // ---------- puzzle 2b: the breaker panel ----------

  /**
   * The five labelled circuits, and what each one draws.
   *
   * Every entry is a distinct SYSTEM. An earlier pass had a circuit called
   * LAB sitting alongside CCTV and LIGHTING, which was incoherent -- LAB is a
   * room, and it contains the other two, so "LAB off, CCTV on" meant nothing.
   * It also had a SECURITY circuit that referred to nothing in the game at
   * all. Both are gone.
   *
   * The shape of the puzzle:
   *
   *  - DOOR, CCTV and LIGHTING are all required and come to exactly the
   *    panel's capacity. There is no slack, so the decoys are not merely
   *    unnecessary, they are unaffordable.
   *  - LOCKS draws 40A, so LOCKS + DOOR is 65A and the panel physically
   *    cannot carry both. Nothing special-cases that; it falls out of the
   *    arithmetic. A player who wants out switches off the system holding
   *    the house shut, without being asked to think about it, which is the
   *    entire ending rehearsed three levels early.
   *
   * LIGHTING deliberately covers the WHOLE house, this lab included, rather
   * than being split into a lab circuit and a house circuit the player has to
   * choose between. An earlier pass did split them, which meant a player could
   * leave the basement dark -- and the basement is where camera five shows a
   * figure standing exactly where the player is standing. Making the game's
   * best reveal switchable-off was a bad trade for a choice nobody asked for.
   */
  const PANEL_CAPACITY_IN_AMPS = 60;
  const BREAKER_CIRCUITS = [
    { id: 'door', label: 'DOOR', loadInAmps: 25, isRequired: true },
    { id: 'cctv', label: 'CCTV', loadInAmps: 15, isRequired: true },
    { id: 'lighting', label: 'LIGHTING', loadInAmps: 20, isRequired: true },
    { id: 'locks', label: 'LOCKS', loadInAmps: 40, isRequired: false },
    { id: 'vent', label: 'VENT', loadInAmps: 30, isRequired: false }
  ];

  /**
   * circuit id -> whether that breaker is currently closed.
   *
   * Every breaker starts UP. Until the blackout the panel is simply a working
   * panel the fuse problem was upstream of; the blackout is what knocks them
   * all down, along with the main lever, and the player finds the panel that
   * way -- the clearest sign that a hand, not a fault, did it.
   */
  const breakerIsOn = {};
  /** circuit id -> its toggle mesh, so the panel can repaint or reset one. */
  const breakerMeshes = {};
  BREAKER_CIRCUITS.forEach(({ id }) => { breakerIsOn[id] = true; });

  /**
   * How long the lights stay blown out after the panel trips. Long enough that
   * the player cannot miss what they did, short enough that they are not made
   * to stand in it.
   */
  const BREAKER_TRIP_GLARE_IN_SECONDS = 1.1;
  let breakerTripTimeRemainingInSeconds = 0;

  /**
   * @returns {number} the total draw of every breaker currently closed, in amps.
   */
  function getTotalBreakerLoadInAmps() {
    return BREAKER_CIRCUITS.reduce(
      (total, circuit) => total + (breakerIsOn[circuit.id] ? circuit.loadInAmps : 0),
      0
    );
  }

  /**
   * The circuits the player cannot leave without. DOOR gets them out; CCTV is
   * required rather than optional because the camera feeds carry story the
   * level should never let a player lose to a breaker they misread.
   *
   * @returns {string[]} labels of the required circuits still open, empty when
   *   the panel is ready to take the main.
   */
  function getMissingRequiredLabels() {
    return BREAKER_CIRCUITS
      .filter((circuit) => circuit.isRequired && !breakerIsOn[circuit.id])
      .map((circuit) => circuit.label);
  }

  /** Tilts one lever and repaints its flag to match its state. */
  function updateBreakerSwitch(circuitId) {
    const mesh = breakerMeshes[circuitId];
    const isOn = breakerIsOn[circuitId];
    // A lever sticks out along +Z; tilting it about X by a negative angle
    // lifts its tip.
    mesh.rotation.x = isOn ? -BREAKER_TOGGLE_TILT : BREAKER_TOGGLE_TILT;
    const flag = mesh.userData.flag.material;
    flag.color.setHex(isOn ? 0x2fbf4a : 0xb3261e);
    flag.emissive.setHex(isOn ? 0x1a6b2a : 0x4a0e0a);
    const circuit = BREAKER_CIRCUITS.find((c) => c.id === circuitId);
    mesh.userData.interact.label =
      `${circuit.label} (${circuit.loadInAmps}A) -- ${isOn ? 'ON' : 'OFF'}`;
  }

  /** Puts every breaker up or down and repaints the whole panel. */
  function setAllBreakers(isOn) {
    BREAKER_CIRCUITS.forEach(({ id }) => {
      breakerIsOn[id] = isOn;
      updateBreakerSwitch(id);
    });
  }

  /**
   * The panel asked for more than it can carry. Everything opens, and the
   * lights blow out white on the way down -- the same glare the over-rated
   * fuse produces, deliberately, so the player only ever has to learn one
   * visual for "you pushed this circuit too hard".
   */
  function tripBreakerPanel() {
    setAllBreakers(false);
    setMainLever(false);
    breakerTripTimeRemainingInSeconds = BREAKER_TRIP_GLARE_IN_SECONDS;
    onSpark();
    onOverload();
    showCaption(line('dialog_breaker_panel_trips', { capacity: PANEL_CAPACITY_IN_AMPS }));
  }

  /**
   * Power finally reaches the door bolts. This is the stage the level has been
   * walking towards: the lights and the cameras come back with it, so the
   * player gets the CCTV they lost at the blackout AND the way out at once.
   */
  function routePower() {
    powerStage = POWER_STAGE.ROUTED;
    screenMaterial.uniforms.uNoiseStrength.value = 0.35;
    screenMaterial.uniforms.uStaticMix.value = 0.18;
    syncMonitor();
    metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.ROUTED];
    setMainLever(true);
    syncFeedRoomPower();

    showCaption(line('dialog_breaker_panel_takes_load'));
    onPowerRouted();
  }

  /**
   * Pushes the current circuit states into the camera feeds, so the rooms on
   * screen are lit exactly when their breaker says they are.
   */
  /**
   * Pushes the current circuit state into the camera feeds.
   *
   * One breaker, two zones. LIGHTING feeds the whole house once the panel is
   * routed, but the 30A fuse before it only ever fed THIS section of the lab
   * -- so at the `LIT` stage the basement camera shows a lit room while the
   * four upstairs cameras show dark ones. That gap is what tells the player
   * the house has its own power to find, long before they see a panel.
   */
  function syncFeedRoomPower() {
    const lightingLive = isCircuitLive('lighting');
    feeds.setRoomPower({
      lab: lightingLive,
      house: lightingLive && powerStage === POWER_STAGE.ROUTED
    });
  }

  /**
   * Handles one flick of one breaker.
   *
   * @param {string} circuitId - the circuit whose breaker was flicked.
   *
   * Flicking NEVER trips and never routes anything. The panel is dead until
   * the main switch goes in, so setting breakers is a plan the player lays
   * out against the load chart rather than a live experiment -- which is what
   * makes the choice between LIGHTING and HOUSE a decision they commit to
   * rather than one they stumble into by closing a switch.
   */
  function flickBreaker(circuitId) {
    // The toggles sit behind the cover. Its own click target catches a press
    // while it is down, but one aimed past its edge must not reach through.
    if (!breakerCover.open) {
      openBreakerCover();
      return;
    }
    if (powerStage === POWER_STAGE.ROUTED) {
      showCaption(line('dialog_breakers_all_fed'));
      return;
    }
    if (powerStage === POWER_STAGE.DEAD || powerStage === POWER_STAGE.LIT) {
      showCaption(line('dialog_breakers_already_up'));
      return;
    }
    if (powerStage !== POWER_STAGE.RUNNING) {
      showCaption(line('dialog_breakers_dead'));
      return;
    }
    // Locked out for as long as the trip glare lasts, so a player mashing the
    // key through the whiteout cannot queue up flicks they cannot see. It
    // still SAYS so -- swallowing the input silently reads as a broken switch.
    if (breakerTripTimeRemainingInSeconds > 0) {
      showCaption(line('dialog_breaker_panel_not_reset'));
      return;
    }

    breakerIsOn[circuitId] = !breakerIsOn[circuitId];
    updateBreakerSwitch(circuitId);

    const drawnInAmps = getTotalBreakerLoadInAmps();
    const remainingInAmps = PANEL_CAPACITY_IN_AMPS - drawnInAmps;
    showCaption(line(
      remainingInAmps < 0 ? 'dialog_breaker_load_over' : 'dialog_breaker_load_spare',
      { drawn: drawnInAmps, capacity: PANEL_CAPACITY_IN_AMPS, spare: remainingInAmps }
    ));
  }

  /**
   * The main switch. Commits whatever the breakers are currently set to.
   *
   * This exists because the decision needs a moment the player chooses to
   * take. Without it the panel would go live the instant the last required
   * breaker closed, and the LIGHTING-or-HOUSE choice -- the only real decision
   * in Level 2 -- would resolve itself before the player knew it was there.
   */
  function throwMainSwitch() {
    if (powerStage === POWER_STAGE.ROUTED) {
      showCaption(line('dialog_main_lever_already_routed'));
      return;
    }
    if (powerStage === POWER_STAGE.DEAD || powerStage === POWER_STAGE.LIT) {
      showCaption(line('dialog_main_lever_already_up'));
      return;
    }
    if (powerStage !== POWER_STAGE.RUNNING) {
      showCaption(line('dialog_main_lever_dead'));
      return;
    }
    if (breakerTripTimeRemainingInSeconds > 0) {
      showCaption(line('dialog_breaker_panel_not_reset'));
      return;
    }

    if (getTotalBreakerLoadInAmps() > PANEL_CAPACITY_IN_AMPS) {
      // The lever goes up, the panel blows, and the trip throws it back down.
      setMainLever(true);
      tripBreakerPanel();
      return;
    }

    const missing = getMissingRequiredLabels();
    if (missing.length > 0) {
      // Named, not withheld. The player can see which breakers are open; the
      // puzzle is the budget, not guessing which systems matter. The lever
      // goes up and will not stay: it falls back on its own a moment later.
      setMainLever(true);
      mainLever.springBackInSeconds = 0.45;
      showCaption(line('dialog_main_lever_drops_back', { missing: missing.join(' and ') }));
      return;
    }
    routePower();
  }

  /**
   * The consumer unit: breaker_panel.glb (blender/build_breaker_panel.py) on
   * the west wall, facing into the room -- the model faces its own +Z, and a
   * quarter turn takes that to +X, exactly as the fuse box is hung.
   *
   * The model is the look, the cover and the lever. Everything the puzzle
   * touches is built here, in the model's frame, so none of it waits on the
   * download: the five toggles and their flags, the label strip, and the
   * click targets, which are invisible boxes because Interaction raycasts
   * non-recursively and never reaches inside a loaded .glb.
   */
  const breakerPanelModel = new THREE.Group();
  breakerPanelModel.position.set(-LAB_W / 2, 1.4, BREAKER_PANEL_Z);
  breakerPanelModel.rotation.y = Math.PI / 2;
  breakerPanelModel.updateMatrix();
  lab.add(breakerPanelModel);

  const hiddenHitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitBox = (size, centre) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), hiddenHitMat);
    mesh.position.set(...centre);
    breakerPanelModel.add(mesh);
    return mesh;
  };

  /** The cover and the lever. Their pivots stay null until the model loads; their state does not wait. */
  const breakerCover = { open: false, pivot: null, angle: 0 };
  const mainLever = {
    pivot: null,
    up: true,
    angle: MAIN_LEVER_UP_ANGLE,
    /** Seconds until a lever the panel refused falls back down, or 0. */
    springBackInSeconds: 0
  };

  loadModel(breakerPanelModelUrl).then((model) => {
    const paintMap = createFixtureSteelTexture({ rust: 0.7 });
    const paintNormal = createFixtureSteelNormalTexture();
    model.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (mat.name === 'BreakerPaint') {
          // White, so the texture's own yellowed enamel is not tinted twice.
          mat.color.set(0xffffff);
          mat.map = paintMap;
          mat.normalMap = paintNormal;
          mat.needsUpdate = true;
        } else if (mat.name === 'BreakerCover') {
          mat.transparent = true;
          mat.opacity = 0.42;
          mat.depthWrite = false;
        }
      });
    });
    breakerCover.pivot = model.getObjectByName('BreakerCoverPivot');
    mainLever.pivot = model.getObjectByName('BreakerLeverPivot');
    if (!breakerCover.pivot || !mainLever.pivot) {
      console.warn('[lab] breaker_panel.glb is missing its cover or lever pivot -- they cannot move');
    }
    if (breakerCover.pivot) breakerCover.pivot.rotation.x = breakerCover.angle;
    if (mainLever.pivot) mainLever.pivot.rotation.x = mainLever.angle;
    breakerPanelModel.add(model);
  }).catch((err) => console.error('[lab] breaker_panel.glb failed to load', err));

  /** The panel as a whole, for examining it. Stops behind the modules' faces, so the toggles win. */
  const breakerPanel = hitBox(
    [BREAKER_BOX.width, BREAKER_BOX.height, BREAKER_BOX.depth - 0.002],
    [0, 0, (BREAKER_BOX.depth - 0.002) / 2]
  );
  breakerPanel.userData.interact = {
    label: 'Breaker panel',
    onInteract: () => {
      if (powerStage === POWER_STAGE.ROUTED) {
        showCaption(line('dialog_breaker_panel_hums'));
      } else if (powerStage === POWER_STAGE.RUNNING) {
        showCaption(line('dialog_breaker_panel_examine', { capacity: PANEL_CAPACITY_IN_AMPS }));
      } else if (powerStage === POWER_STAGE.BLACKOUT) {
        showCaption(line('dialog_breaker_panel_knocked_down'));
      } else {
        showCaption(line('dialog_breaker_panel_all_up'));
      }
    }
  };
  interactables.push(breakerPanel);

  /**
   * The cover's click target rides on a stand-in for its hinge, turned in step
   * with the real one, so it is always wherever the cover is: down in front of
   * the levers to lift it, up above them to close it. Closed, it sits in front
   * of the levers, so the first press anywhere over them lifts the cover.
   */
  const breakerCoverHinge = new THREE.Group();
  breakerCoverHinge.position.set(0, BREAKER_COVER.hingeY, BREAKER_COVER.hingeZ);
  breakerPanelModel.add(breakerCoverHinge);
  const breakerCoverHit = new THREE.Mesh(
    new THREE.BoxGeometry(BREAKER_COVER.width, BREAKER_COVER.height, 0.012),
    hiddenHitMat
  );
  breakerCoverHit.position.set(0, -BREAKER_COVER.height / 2, 0.006);
  breakerCoverHinge.add(breakerCoverHit);
  breakerCoverHit.userData.interact = {
    label: 'Lift the breaker cover',
    onInteract: () => setBreakerCoverOpen(!breakerCover.open)
  };
  interactables.push(breakerCoverHit);
  const breakerCoverCollider = { box: null };

  /**
   * Lifts or lowers the cover. Up, it stands out into the room at head
   * height, so it gets a collider for as long as it is up. `quiet` skips the
   * caption, for a restart.
   */
  function setBreakerCoverOpen(open, { quiet = false } = {}) {
    breakerCover.open = open;
    breakerCoverHit.userData.interact.label = open ? 'Close the breaker cover' : 'Lift the breaker cover';
    if (open) {
      // The raised cover, hinge line to free edge, across its whole width.
      const a = BREAKER_COVER_OPEN_ANGLE;
      const tipY = BREAKER_COVER.hingeY - BREAKER_COVER.height * Math.cos(a);
      const tipZ = BREAKER_COVER.hingeZ - BREAKER_COVER.height * Math.sin(a);
      const half = BREAKER_COVER.width / 2;
      setSwingCollider(breakerCoverCollider, [
        [-half, BREAKER_COVER.hingeY, BREAKER_COVER.hingeZ], [half, BREAKER_COVER.hingeY, BREAKER_COVER.hingeZ],
        [-half, tipY, tipZ], [half, tipY, tipZ]
      ].map((p) => new THREE.Vector3(...p).applyMatrix4(breakerPanelModel.matrix)));
    } else {
      setSwingCollider(breakerCoverCollider, null);
    }
    if (!quiet) {
      showCaption(line(open ? 'dialog_breaker_cover_lift' : 'dialog_breaker_cover_lower'));
    }
  }

  function openBreakerCover() {
    if (!breakerCover.open) setBreakerCoverOpen(true);
  }

  /**
   * The five levers, one per module, after a modern RCD's: a chunky green
   * lever nearly the width of its module, standing well proud of it, with a
   * sloped face and a rounded tip. Each has the little window above it that
   * shows green when the breaker is on and red when it is off. Individually
   * interactable, same non-recursive-raycast reason as above.
   *
   * Built as a side profile extruded across the lever's width. The profile's
   * x is how far out from the module, so the extrusion is turned to put that
   * along +Z, and the pivot is the lever's root -- tilting it about X swings
   * the tip up or down.
   */
  const breakerLeverGeometry = (() => {
    const WIDTH = 0.026;
    const profile = new THREE.Shape();
    profile.moveTo(0, -0.016);
    profile.lineTo(0.024, -0.012);
    profile.quadraticCurveTo(0.032, -0.01, 0.032, -0.003);
    profile.lineTo(0.032, 0.006);
    profile.quadraticCurveTo(0.032, 0.012, 0.025, 0.013);
    profile.lineTo(0, 0.016);
    profile.closePath();
    const geometry = new THREE.ExtrudeGeometry(profile, {
      depth: WIDTH, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6
    });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(WIDTH / 2, 0, 0);
    return geometry;
  })();
  const breakerLeverMat = new THREE.MeshStandardMaterial({ color: 0x1e8a38, roughness: 0.4 });
  const breakerFlagGeometry = new THREE.PlaneGeometry(0.012, 0.008);
  const breakerLabelGeometry = new THREE.PlaneGeometry(BREAKER_LABEL.width, BREAKER_LABEL.height);
  const breakerLabelBackGeometry = new THREE.BoxGeometry(BREAKER_LABEL.width + 0.002, BREAKER_LABEL.height + 0.002, 0.002);
  const breakerLabelBackMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.7 });

  BREAKER_CIRCUITS.forEach((circuit, i) => {
    const x = BREAKER_MODULE_X[i];
    const toggle = new THREE.Mesh(breakerLeverGeometry, breakerLeverMat);
    toggle.position.set(x, BREAKER_MODULE_CENTRE_Y, BREAKER_TOGGLE_BASE_Z);
    toggle.userData.interact = {
      label: `${circuit.label} (${circuit.loadInAmps}A)`,
      onInteract: () => flickBreaker(circuit.id)
    };
    const flag = new THREE.Mesh(breakerFlagGeometry, new THREE.MeshStandardMaterial({ roughness: 0.4 }));
    flag.position.set(x, BREAKER_MODULE_CENTRE_Y + 0.035, BREAKER_MODULE_FACE_Z + 0.0005);
    toggle.userData.flag = flag;

    // Its own black label plate underneath.
    const labelBack = new THREE.Mesh(breakerLabelBackGeometry, breakerLabelBackMat);
    labelBack.position.set(x, BREAKER_LABEL.y, BREAKER_BOX.depth + 0.001);
    const label = new THREE.Mesh(
      breakerLabelGeometry,
      new THREE.MeshStandardMaterial({ map: createSwitchLabelTexture(circuit.label, circuit.loadInAmps), roughness: 0.75 })
    );
    label.position.set(x, BREAKER_LABEL.y, BREAKER_BOX.depth + 0.0021);

    breakerPanelModel.add(toggle, flag, labelBack, label);
    interactables.push(toggle);
    breakerMeshes[circuit.id] = toggle;
    updateBreakerSwitch(circuit.id);
  });

  /**
   * The main lever, on the right-hand side of the box. Its click target is a
   * box round the whole of its swing, because the arm moves and the target
   * cannot. Keeps the old `mainSwitch` name.
   */
  const mainSwitch = hitBox(MAIN_LEVER_HIT.size, MAIN_LEVER_HIT.centre);
  mainSwitch.userData.interact = {
    label: 'Main lever (up)',
    onInteract: () => throwMainSwitch()
  };
  interactables.push(mainSwitch);

  /**
   * Swings the lever up or down. Up is ON, as on the reference. `instant`
   * skips the swing, for a restart.
   */
  function setMainLever(up, { instant = false } = {}) {
    mainLever.up = up;
    mainLever.springBackInSeconds = 0;
    if (instant) {
      mainLever.angle = up ? MAIN_LEVER_UP_ANGLE : MAIN_LEVER_DOWN_ANGLE;
      if (mainLever.pivot) mainLever.pivot.rotation.x = mainLever.angle;
    }
    mainSwitch.userData.interact.label = up ? 'Main lever (up)' : 'Push the main lever up';
  }

  /** Puts the cover back down at once, for a restart. */
  function closeBreakerCover() {
    setBreakerCoverOpen(false, { quiet: true });
    breakerCover.angle = 0;
    breakerCoverHinge.rotation.x = 0;
    if (breakerCover.pivot) breakerCover.pivot.rotation.x = 0;
  }

  dynamics.push({
    update(dt) {
      const coverTarget = breakerCover.open ? BREAKER_COVER_OPEN_ANGLE : 0;
      if (breakerCover.angle !== coverTarget) {
        const step = (Math.abs(BREAKER_COVER_OPEN_ANGLE) / BREAKER_COVER_OPEN_SECONDS) * dt;
        breakerCover.angle = coverTarget < breakerCover.angle
          ? Math.max(coverTarget, breakerCover.angle - step)
          : Math.min(coverTarget, breakerCover.angle + step);
        if (breakerCover.pivot) breakerCover.pivot.rotation.x = breakerCover.angle;
        breakerCoverHinge.rotation.x = breakerCover.angle;
      }

      // A lever the panel would not take, falling back.
      if (mainLever.springBackInSeconds > 0) {
        mainLever.springBackInSeconds -= dt;
        if (mainLever.springBackInSeconds <= 0) setMainLever(false);
      }

      const leverTarget = mainLever.up ? MAIN_LEVER_UP_ANGLE : MAIN_LEVER_DOWN_ANGLE;
      if (mainLever.angle !== leverTarget) {
        // Thrown up by hand, but DROPPED under its own weight -- twice as fast.
        const speed = (MAIN_LEVER_DOWN_ANGLE - MAIN_LEVER_UP_ANGLE) / (mainLever.up ? 0.35 : 0.18);
        mainLever.angle = leverTarget > mainLever.angle
          ? Math.min(leverTarget, mainLever.angle + speed * dt)
          : Math.max(leverTarget, mainLever.angle - speed * dt);
        if (mainLever.pivot) mainLever.pivot.rotation.x = mainLever.angle;
      }
    }
  });

  const loadChart = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.38),
    new THREE.MeshStandardMaterial({
      map: createPaperNoteTexture([
        'PANEL LOAD CHART',
        `MAX ${PANEL_CAPACITY_IN_AMPS}A TOTAL`,
        ...BREAKER_CIRCUITS.map((c) => `${c.label} — ${c.loadInAmps}A`),
        'DO NOT EXCEED'
      ]),
      roughness: 1
    })
  );
  loadChart.position.set(-LAB_W / 2 + 0.06, 1.42, BREAKER_PANEL_Z + 0.55);
  loadChart.rotation.y = Math.PI / 2;
  loadChart.userData.interact = {
    label: 'Read the load chart',
    onInteract: () => showCaption(line('dialog_load_chart', {
      capacity: PANEL_CAPACITY_IN_AMPS,
      circuits: BREAKER_CIRCUITS.map((c) => `${c.label} ${c.loadInAmps}A`).join('. ')
    }))
  };
  interactables.push(loadChart);
  lab.add(loadChart);

  /**
   * Sanity, at build time. Two properties have to hold for this panel to be
   * the puzzle it is meant to be, and both are arithmetic on the table above,
   * so neither should be discovered by playtesting:
   *
   *  1. the required circuits must come to EXACTLY the capacity -- over and
   *     the level cannot be finished, under and a decoy can be left closed
   *     and still solve it;
   *  2. LOCKS must not fit alongside DOOR, or the ending's rehearsal quietly
   *     stops happening.
   */
  {
    const loadOf = (id) => BREAKER_CIRCUITS.find((c) => c.id === id).loadInAmps;
    const requiredLoadInAmps = BREAKER_CIRCUITS
      .filter((c) => c.isRequired)
      .reduce((total, c) => total + c.loadInAmps, 0);
    const warn = (message) => console.warn(`[lab] breaker panel: ${message}`);

    if (requiredLoadInAmps !== PANEL_CAPACITY_IN_AMPS) {
      warn(
        `the required circuits draw ${requiredLoadInAmps}A against a ${PANEL_CAPACITY_IN_AMPS}A panel -- ` +
        (requiredLoadInAmps > PANEL_CAPACITY_IN_AMPS
          ? 'unsolvable'
          : 'there is slack, so a decoy can be left on and still solve it')
      );
    }
    if (loadOf('locks') + loadOf('door') <= PANEL_CAPACITY_IN_AMPS) {
      warn('LOCKS fits alongside DOOR -- the player is never made to switch the house locks off');
    }
  }

  /**
   * Storage shelving along the east wall: three units of storage_shelf.glb
   * (blender/build_storage_shelf.py), boltless steel rivet shelving with
   * slotted uprights. The two end units stand with a short side to the wall
   * and run out into the room; the middle one stands with its long side to
   * the wall. They replace two plain dark boxes.
   *
   * One model, loaded once and cloned: the clones share its geometry, so the
   * slotted uprights -- which are real holes, and a lot of small parts --
   * are only uploaded to the GPU once.
   */
  const SHELF_WALL_GAP = 0.02;
  const shelfPlacements = [
    // [z along the wall, true if the long side is against it]
    [-2 * LAB_SCALE, false],
    [0, true],
    [2 * LAB_SCALE, false]
  ];
  const shelfUnits = shelfPlacements.map(([z, longSideToWall]) => {
    // Long side to the wall means the unit's length runs along the wall (z),
    // so it is turned a quarter; out from the wall, its depth is what it takes up.
    const reachFromWall = longSideToWall ? STORAGE_SHELF.depth : STORAGE_SHELF.width;
    const alongWall = longSideToWall ? STORAGE_SHELF.width : STORAGE_SHELF.depth;
    const unit = new THREE.Group();
    unit.position.set(LAB_W / 2 - SHELF_WALL_GAP - reachFromWall / 2, 0, z);
    unit.rotation.y = longSideToWall ? Math.PI / 2 : 0;
    lab.add(unit);
    colliders.push({
      minX: unit.position.x - reachFromWall / 2, maxX: LAB_W / 2,
      minZ: LAB_Z + z - alongWall / 2, maxZ: LAB_Z + z + alongWall / 2
    });
    return unit;
  });
  loadModel(storageShelfModelUrl).then((model) => {
    // Light galvanised grey gone dull and spotted with rust, rather than the
    // flat grey the model carries.
    const steelMap = createPaintedSteelTexture({ base: [150, 152, 148], rust: 0.6 });
    const steelNormal = createFixtureSteelNormalTexture();
    model.traverse((child) => {
      if (!child.isMesh || !['ShelfUpright', 'ShelfBoard'].includes(child.material.name)) return;
      child.material.color.set(0xffffff);
      child.material.map = whiteRustMap;
      child.material.normalMap = steelNormal;
      child.material.needsUpdate = true;
    });
    shelfUnits.forEach((unit, i) => unit.add(shadowed(i === 0 ? model : model.clone())));
  }).catch((err) => console.error('[lab] storage_shelf.glb failed to load', err));

  // retro computer desk with the CCTV monitor (custom shader material)
  /**
   * The desk USED TO FACE THE BACK WALL. The monitor and its screen sat on the
   * +Z side of the desk group, and the desk stood 1.4 m off the back wall, so
   * the only place to read the screen from was a 0.90 m slot between the desk's
   * collider and the wall's -- 0.20 m of actual standing room once the player's
   * 0.35 m radius is taken off both sides. Reaching the one interactable the
   * whole level is built around meant squeezing behind the furniture.
   *
   * Turned round to face into the room and pushed back against the wall, so it
   * is approached from the open floor like every other prop in the game.
   */
  const desk = new THREE.Group();
  desk.position.set(DESK_POSITION.x, 0, DESK_POSITION.z);
  desk.rotation.y = Math.PI;
  lab.add(desk);

  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(DESK_TOP_SIZE.width, DESK_TOP_SIZE.thickness, DESK_TOP_SIZE.depth),
    frameWoodMat()
  );
  deskTop.position.y = DESK_TOP_SIZE.standHeight;
  desk.add(deskTop);
  const deskLeg = (x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), frameWoodMat());
    leg.position.set(x, 0.375, 0);
    desk.add(leg);
  };
  deskLeg(-0.55);
  deskLeg(0.55);

  /**
   * The CRT: crt_monitor.glb, sitting on the desk with its screen to the room.
   * `monitor` is the model's frame -- every part the level builds around the
   * model (picture, power button, click target, sticky note) is placed in it,
   * so they all move with the monitor if the monitor moves.
   */
  const monitor = new THREE.Group();
  monitor.position.set(0, DESK_TOP_Y, -0.02);
  desk.add(monitor);

  loadModel(crtMonitorModelUrl).then((model) => {
    // The holes down the sides and the slots on top, painted on in the
    // plastic's own colour so the panels match the rest of the casing.
    const ventTextures = { CrtVents: createCrtVentTexture, CrtTopVents: createCrtTopVentTexture };
    model.traverse((child) => {
      if (!child.isMesh || !ventTextures[child.material.name]) return;
      const vents = ventTextures[child.material.name](
        `#${child.material.color.getHexString(THREE.SRGBColorSpace)}`
      );
      child.material.color.set(0xffffff);
      child.material.map = vents.map;
      child.material.bumpMap = vents.bumpMap;
      child.material.bumpScale = 2;
      child.material.needsUpdate = true;
    });
    monitor.add(model);
  }).catch((err) => console.error('[lab] crt_monitor.glb failed to load', err));

  /**
   * The click target for the monitor as a whole: an invisible box over the
   * casing. It stops just behind the bezel's face so the power button and the
   * sticky note, which stand proud of it, are hit before it is. Keeps the old
   * `monitorBody` name, which the rest of the level and its refs use.
   */
  const monitorBody = new THREE.Mesh(
    new THREE.BoxGeometry(CRT_BODY.width, CRT_BODY.top - CRT_BODY.bottom, CRT_BODY.front - CRT_BODY.back),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  monitorBody.position.set(
    0,
    (CRT_BODY.top + CRT_BODY.bottom) / 2,
    (CRT_BODY.front + CRT_BODY.back) / 2 - 0.002
  );
  monitor.add(monitorBody);

  /**
   * The five feeds. Drawn onto canvases rather than rendered, because three of
   * the five cameras the storyline names look at rooms this game does not have
   * -- see world/CctvFeeds.js for the full argument.
   */
  const feeds = createCctvFeeds();
  const screenMaterial = createStaticScreenMaterial({
    noiseStrength: 1.0,
    feed: feeds.textures.kitchen,
    power: 0
  });

  /** The glass, bowed toward the player the way a CRT tube's face is. */
  const screenGeometry = new THREE.PlaneGeometry(CRT_SCREEN.width, CRT_SCREEN.height, 24, 18);
  {
    const pos = screenGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / (CRT_SCREEN.width / 2);
      const v = pos.getY(i) / (CRT_SCREEN.height / 2);
      pos.setZ(i, CRT_SCREEN_BULGE * (1 - u * u) * (1 - v * v));
    }
    screenGeometry.computeVertexNormals();
  }
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.position.set(0, CRT_SCREEN.centreY, CRT_SCREEN.z + 0.001);
  monitor.add(screen);

  const screenGlow = new THREE.PointLight(0x8fd0ff, 0, 1.5, 2);
  screenGlow.position.set(0, CRT_SCREEN.centreY, CRT_BODY.front + 0.14);
  monitor.add(screenGlow);
  const SCREEN_GLOW_INTENSITY = 0.5;

  /**
   * The monitor starts OFF and has to be switched on at its power button.
   *
   * `monitorSwitchedOn` is the button's own state; whether there is a picture
   * is that AND whether the CCTV circuit is live. The button only latches when
   * there is power to feel it -- pressed on a dead lab it does nothing, which
   * is the clearest way to say "no power" -- but once on it STAYS on, so a
   * monitor that dies in the blackout comes back by itself when the power does.
   */
  let monitorSwitchedOn = false;
  /** Which feed the remote last picked, lit on the remote while the picture is up. */
  let activeFeedId = FEED_IDS[0];

  function isMonitorShowing() {
    return monitorSwitchedOn && isCctvPowered();
  }

  const POWER_GLOW_COLOR = 0x2bff52;
  const powerButtonCapMat = new THREE.MeshStandardMaterial({
    color: 0xc9c1a8, roughness: 0.5, emissive: POWER_GLOW_COLOR, emissiveIntensity: 0,
    emissiveMap: createPowerSymbolTexture()
  });
  const powerButtonRimMat = new THREE.MeshStandardMaterial({
    color: 0xb8b097, roughness: 0.5, emissive: POWER_GLOW_COLOR, emissiveIntensity: 0
  });
  const powerButton = new THREE.Mesh(
    new THREE.CylinderGeometry(CRT_POWER_BUTTON.radius, CRT_POWER_BUTTON.radius, CRT_POWER_BUTTON.depth, 24),
    // Side, front face (the symbol), back face.
    [powerButtonRimMat, powerButtonCapMat, powerButtonRimMat]
  );
  // A cylinder stands along Y; a quarter turn about X faces its top -- the
  // face carrying the symbol -- out of the screen.
  powerButton.rotation.x = Math.PI / 2;
  powerButton.position.set(
    CRT_POWER_BUTTON.x, CRT_POWER_BUTTON.y, CRT_POWER_BUTTON.ringFront + CRT_POWER_BUTTON.depth / 2
  );
  monitor.add(powerButton);

  const powerLedMat = new THREE.MeshStandardMaterial({
    color: 0x1d2a1f, roughness: 0.3, emissive: POWER_GLOW_COLOR, emissiveIntensity: 0
  });
  const powerLed = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), powerLedMat);
  powerLed.position.set(CRT_POWER_BUTTON.x + 0.025, CRT_POWER_BUTTON.y, CRT_BODY.front);
  monitor.add(powerLed);

  // A faint green cast on the bezel round the button, since there is no bloom
  // to make an emissive glow spill.
  const powerGlow = new THREE.PointLight(POWER_GLOW_COLOR, 0, 0.18, 2);
  powerGlow.position.set(CRT_POWER_BUTTON.x, CRT_POWER_BUTTON.y, CRT_BODY.front + 0.03);
  monitor.add(powerGlow);

  /**
   * Puts the button, the remote and both prompts in line with whether the
   * monitor is showing a picture. The picture itself warms up and cools down
   * in the frame loop below, so this never snaps the screen.
   */
  function syncMonitor() {
    const showing = isMonitorShowing();
    powerButtonCapMat.emissiveIntensity = showing ? 1.6 : 0;
    powerButtonRimMat.emissiveIntensity = showing ? 0.35 : 0;
    powerLedMat.emissiveIntensity = showing ? 2.2 : 0;
    powerGlow.intensity = showing ? 0.04 : 0;
    feedButtons.forEach(({ mesh, feedId }) => {
      mesh.material.emissive.setHex(showing && feedId === activeFeedId ? 0x2e6b3a : 0x000000);
    });
    monitorBody.userData.interact.label = showing ? 'View camera feeds' : 'Examine the monitor';
    powerButton.userData.interact.label = monitorSwitchedOn ? 'Switch the monitor off' : 'Switch the monitor on';
  }

  powerButton.userData.interact = {
    label: 'Switch the monitor on',
    onInteract: () => {
      if (!isCctvPowered()) {
        showCaption(line(
          powerStage === POWER_STAGE.DEAD
            ? 'dialog_monitor_button_no_power'
            : 'dialog_monitor_button_power_gone'
        ));
        return;
      }
      monitorSwitchedOn = !monitorSwitchedOn;
      syncMonitor();
      if (monitorSwitchedOn) {
        showCaption(line('dialog_monitor_switched_on'));
      }
    }
  };
  interactables.push(powerButton);

  dynamics.push({
    update: (dt, elapsed) => {
      screenMaterial.uniforms.uTime.value = elapsed;
      const power = screenMaterial.uniforms.uPower;
      if (isMonitorShowing()) {
        power.value = Math.min(1, power.value + dt / CRT_WARM_UP_SECONDS);
      } else {
        power.value = Math.max(0, power.value - dt / CRT_SWITCH_OFF_SECONDS);
      }
      screenGlow.intensity = SCREEN_GLOW_INTENSITY * power.value;
      // Only redraw a feed while there is a picture. Otherwise the canvases
      // would be painting for nobody.
      if (power.value > 0) feeds.update(dt);
    }
  });

  monitorBody.userData.interact = {
    // Reads as a thing to examine until there is a picture, rather than
    // inviting the player to view feeds that cannot exist yet.
    label: 'Examine the monitor',
    onInteract: () => {
      if (!isCctvPowered()) {
        // Two different kinds of dead screen, and the player has earned the
        // difference: before the fuse it never worked, after the blackout it
        // was working a moment ago and something took it away.
        showCaption(line(
          powerStage === POWER_STAGE.DEAD
            ? 'dialog_monitor_dead'
            : 'dialog_monitor_dark_again'
        ));
        return;
      }
      if (!monitorSwitchedOn) {
        showCaption(line('dialog_monitor_off'));
        return;
      }
      // Said "No power" even after the breaker was flipped, which told the
      // player their one objective had not worked.
      showCaption(line('dialog_monitor_feeds_live'));
    }
  };
  interactables.push(monitorBody);

  /**
   * The remote. Five buttons on the front edge of the desk.
   *
   * Each button is pushed into `interactables` SEPARATELY and none of them is a
   * child of a shared hitbox, because Interaction raycasts NON-recursively --
   * `intersectObjects(this.targets, false)`. A parent group with five children
   * would never register a hit at all.
   */
  const remoteBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.025, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x1e1f1c, roughness: 0.7 })
  );
  remoteBase.position.set(0, 0.79, 0.22);
  desk.add(remoteBase);

  const feedButtons = [];
  FEED_IDS.forEach((id, i) => {
    const lit = new THREE.MeshStandardMaterial({
      color: 0x2a2c26,
      emissive: 0x000000,
      roughness: 0.5
    });
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.016, 0.05), lit);
    btn.position.set(-0.11 + i * 0.055, 0.806, 0.22);
    btn.userData.interact = {
      label: FEED_LABELS[id],
      onInteract: () => {
        if (!isCctvPowered()) {
          showCaption(line('dialog_remote_dead'));
          return;
        }
        if (!monitorSwitchedOn) {
          showCaption(line('dialog_remote_monitor_off'));
          return;
        }
        feeds.setActive(id);
        screenMaterial.uniforms.uFeed.value = feeds.textures[id];
        activeFeedId = id;
        syncMonitor();
        onViewFeed(id);
      }
    };
    desk.add(btn);
    // Individually, not as a group. See the note above.
    interactables.push(btn);
    feedButtons.push({ mesh: btn, feedId: id, material: lit });
  });

  /**
   * The monitor's three cables, in desk space -- the desk is turned to face
   * the room, so the wall behind it is at -Z here.
   *
   *  - power, off the back of the desk, down the leg side and along the floor
   *    to a socket low on the wall;
   *  - video, back and up the wall into a conduit to the ceiling, where the
   *    camera lines come down from;
   *  - the remote's lead, along the desk top round the monitor's right side.
   *
   * Each one starts at its socket on the CRT's back panel (CRT_PORTS), which
   * the model carries, and is a tube along a hand-placed curve.
   */
  {
    const WALL_Z = -(LAB_D / 2 - DESK_POSITION.z);
    const DESK_BACK_Z = -DESK_TOP_SIZE.depth / 2;
    const portInDesk = ({ x, y, depth }) => new THREE.Vector3(
      x, DESK_TOP_Y + y, monitor.position.z + CRT_BODY.back - depth
    );
    const cableTube = (points, radius, material) => {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, radius, 6, false), material);
      desk.add(mesh);
      return mesh;
    };
    const powerCableMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.65 });
    const videoCableMat = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.55 });
    const plugMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });

    // Power.
    const powerPort = portInDesk(CRT_PORTS.power);
    const SOCKET = { x: 0.11, y: 0.3 };
    cableTube([
      powerPort,
      [0.062, powerPort.y - 0.005, powerPort.z - 0.03],
      [0.07, DESK_TOP_Y + 0.006, DESK_BACK_Z + 0.01],
      [0.075, DESK_TOP_Y - 0.004, DESK_BACK_Z - 0.015],
      [0.085, 0.45, DESK_BACK_Z - 0.05],
      [0.095, 0.08, DESK_BACK_Z - 0.1],
      [0.1, 0.012, (DESK_BACK_Z + WALL_Z) / 2 + 0.03],
      [SOCKET.x, 0.012, WALL_Z + 0.015],
      [SOCKET.x, 0.15, WALL_Z + 0.012],
      [SOCKET.x, SOCKET.y - 0.018, WALL_Z + 0.015]
    ], 0.0045, powerCableMat);
    const powerPlug = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.016), plugMat);
    powerPlug.position.set(powerPort.x, powerPort.y, powerPort.z - 0.006);
    desk.add(powerPlug);

    const socketPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.6 })
    );
    socketPlate.position.set(SOCKET.x, SOCKET.y, WALL_Z + 0.004);
    desk.add(socketPlate);
    const wallPlug = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.034, 0.022), plugMat);
    wallPlug.position.set(SOCKET.x, SOCKET.y, WALL_Z + 0.019);
    desk.add(wallPlug);

    // Video, up into the conduit.
    const videoPort = portInDesk(CRT_PORTS.video);
    const CONDUIT = { x: -0.09, bottom: 1.25, radius: 0.014 };
    const conduitZ = WALL_Z + CONDUIT.radius + 0.002;
    cableTube([
      videoPort,
      [videoPort.x - 0.005, videoPort.y + 0.005, videoPort.z - 0.045],
      [-0.075, 0.98, -0.42],
      [-0.085, 1.06, conduitZ + 0.012],
      [CONDUIT.x, 1.15, conduitZ],
      [CONDUIT.x, CONDUIT.bottom + 0.02, conduitZ]
    ], 0.004, videoCableMat);
    const videoPlug = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.016, 12), plugMat);
    videoPlug.rotation.x = Math.PI / 2;
    videoPlug.position.set(videoPort.x, videoPort.y, videoPort.z - 0.006);
    desk.add(videoPlug);

    const conduitLength = LAB_H - CONDUIT.bottom;
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(CONDUIT.radius, CONDUIT.radius, conduitLength, 10),
      pipeMat
    );
    conduit.position.set(CONDUIT.x, CONDUIT.bottom + conduitLength / 2, conduitZ);
    desk.add(conduit);
    const conduitMouth = new THREE.Mesh(
      new THREE.CylinderGeometry(CONDUIT.radius + 0.005, CONDUIT.radius + 0.005, 0.03, 10),
      pipeMat
    );
    conduitMouth.position.set(CONDUIT.x, CONDUIT.bottom + 0.015, conduitZ);
    desk.add(conduitMouth);

    // The remote's lead, lying on the desk round the monitor's right side and
    // clear of its stand.
    const remotePort = portInDesk(CRT_PORTS.remote);
    const onDesk = DESK_TOP_Y + 0.003;
    cableTube([
      // Out of the remote's right end, wide of the monitor's front corner.
      [0.15, onDesk + 0.006, 0.2],
      [0.2, onDesk, 0.2],
      [0.27, onDesk, 0.13],
      [0.285, onDesk, -0.05],
      [0.23, onDesk, -0.2],
      [0.08, onDesk + 0.015, -0.25],
      [0.02, remotePort.y - 0.02, remotePort.z - 0.01],
      remotePort
    ], 0.003, powerCableMat);
  }

  const noteTex = createStickyNoteTexture("Restore power and pray it doesn't hear you.");
  /**
   * The sticky note, ON THE MONITOR'S BEZEL -- the storyline puts it "stuck on
   * the corner" of the screen, and that is where it now is.
   *
   * It used to float at x = -0.35, which is 0.10 m clear of the monitor casing
   * altogether: a note stuck to nothing, hanging in the air beside the screen.
   *
   * Sized to the bezel rather than placed on top of it. The CRT's side border
   * runs from the picture opening at x = 0.186 to the casing's edge at 0.23, a
   * 0.044 m strip; a 0.04 m note centred in it leaves the picture clear. Any
   * bigger and it would either cover the picture -- which is the one thing in
   * this room the player has to be able to read -- or hang off the side of the
   * casing again.
   */
  const STICKY_SIZE = 0.04;
  const sticky = new THREE.Mesh(
    new THREE.PlaneGeometry(STICKY_SIZE, STICKY_SIZE),
    new THREE.MeshStandardMaterial({ map: noteTex })
  );
  sticky.position.set(0.208, CRT_SCREEN.centreY + 0.105, CRT_BODY.front + 0.001);
  sticky.rotation.z = 0.09;
  sticky.userData.interact = {
    label: 'Read sticky note',
    onInteract: () => showCaption(line('dialog_sticky_note_examine'))
  };
  interactables.push(sticky);
  monitor.add(sticky);

  colliders.push({
    minX: desk.position.x - 0.65, maxX: desk.position.x + 0.65,
    minZ: LAB_Z + desk.position.z - 0.35, maxZ: LAB_Z + desk.position.z + 0.35
  });
  // Sanity, checked at build time rather than discovered by walking into it:
  // the desk must not leave a gap against the back wall that is too narrow to
  // stand in but wide enough to look like a route. Either flush, or wide enough.
  {
    const gap = (LAB_D / 2 - 0.15) - (desk.position.z + 0.35);
    const standing = gap - 0.7;   // the player is 0.35 in radius
    if (standing > 0 && standing < 0.6) {
      console.warn(`[lab] ${standing.toFixed(2)}m of standing room behind the desk -- too narrow to use, wide enough to look like a way through`);
    }
  }

  // Locked metal door at the far end of the lab -- opposite the entrance
  // from the hallway, per the storyline ("at the opposite end of the
  // room, a locked metal door"). Previously placed on the entrance-facing
  // wall instead, which meant the player would walk straight past it on
  // the way in rather than having to cross the room to reach it.
  /**
   * TEXTURE PREVIEW: the door is steel under dark grey paint, rusting through.
   *
   * The paint is the bare-steel photo tinted dark, not a flat colour: the
   * steel's brush streaks and dents still show through it as wear, and its
   * normal map keeps the surface relief. Paint is not metal, so metalness is
   * low. Over it, the same transparent rust layer the generator wears, laid
   * larger here (one copy of the photo across DOOR_RUST_METRES) so it does not
   * repeat down a door twice the generator's height, and a little lighter.
   */
  const doorFace = [DOOR_WIDTH_IN_METRES, DOOR_HEIGHT_IN_METRES];   // about a metre a copy
  const metalDoor = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_WIDTH_IN_METRES, DOOR_HEIGHT_IN_METRES, 0.08),
    new THREE.MeshStandardMaterial({
      map: loadPhoto(steelColorUrl, { repeat: doorFace }),
      normalMap: loadPhoto(steelNormalUrl, { colour: false, repeat: doorFace }),
      color: 0x4a4d4d,
      metalness: 0.15,
      roughness: 0.6
    })
  );
  metalDoor.position.set(0, DOOR_HEIGHT_IN_METRES / 2, LAB_D / 2 - 0.05);
  {
    // A box's UVs run 0..1 across each face, so the rust is scaled by the
    // door's own size: DOOR_RUST_METRES of photo across, its height to match.
    const DOOR_RUST_METRES = 2.2;
    const rustAspect = 524 / 768;   // the overlay image's height over its width
    const doorRust = new THREE.Mesh(
      metalDoor.geometry,
      new THREE.MeshStandardMaterial({
        map: loadPhoto(rustOverlayUrl, {
          repeat: [DOOR_WIDTH_IN_METRES / DOOR_RUST_METRES, DOOR_HEIGHT_IN_METRES / (DOOR_RUST_METRES * rustAspect)],
          wrap: THREE.MirroredRepeatWrapping
        }),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        roughness: 0.95,
        metalness: 0
      })
    );
    // A child, so it goes wherever the door goes when it opens.
    metalDoor.add(doorRust);
  }

  /** What the door says at each stage, so the label always names the real
   *  obstacle instead of a generic "restore power" the player already did. */
  const DOOR_LABELS = {
    [POWER_STAGE.DEAD]: 'Locked. Restore power first.',
    [POWER_STAGE.LIT]: 'Locked. Heavy bolts.',
    [POWER_STAGE.BLACKOUT]: 'Locked. The bolts are dead.',
    [POWER_STAGE.RUNNING]: 'Locked. Nothing is routed to the bolts.',
    [POWER_STAGE.ROUTED]: 'Security lockout'
  };

  metalDoor.userData.interact = {
    label: DOOR_LABELS[POWER_STAGE.DEAD],
    onInteract: () => {
      /**
       * Reaching for the door counts as going for it, exactly like walking
       * into the lane does.
       *
       * Without this there is a hole: the interaction raycast reaches 3.2 m,
       * so a player standing off to one side -- past the lane, which is only
       * as wide as the doorway -- can look at the door and press E from
       * outside the trigger volume, and the blackout never fires.
       */
      if (powerStage === POWER_STAGE.LIT) {
        triggerBlackout();
        return;
      }
      if (!isDoorPowered()) {
        showCaption(line('dialog_door_bolts_unpowered'));
        return;
      }

      if (securityCleared) {
        showCaption(line('dialog_metal_door_opens'));
        onExit();
        return;
      }

      /**
       * The security lockout. Power alone was never going to be enough.
       *
       * This replaced a one-time "your hand stops on the bolt" nudge that
       * existed only to push players toward the cameras, which were optional
       * and therefore skippable. They are not optional any more: the code is
       * on camera four and nowhere else, so the nudge has nothing left to do.
       *
       * The house feeds stay dark until the panel is routed, so the study
       * camera is unreadable before this point and readable after it. The
       * ordering the puzzle needs falls out of the wiring already in place.
       */
      onEnterSecurityCode({
        code: SECURITY_CODE,
        onSolved: () => {
          securityCleared = true;
          metalDoor.userData.interact.label = 'Open the door';
          showCaption(line('dialog_security_lockout_released'));
        }
      });
    }
  };
  interactables.push(metalDoor);
  lab.add(metalDoor);

  /**
   * A note taped beside the door, readable from the moment the player first
   * crosses the lab -- long before it can be acted on.
   *
   * It is the standing version of the door's one-time hesitation: whoever
   * worked down here treated the cameras as the thing you check before you
   * open anything, and says so in the flat voice of a workplace procedure.
   * On a second playthrough it is Mark's own handwriting telling himself not
   * to walk out without looking.
   */
  const doorNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.32),
    new THREE.MeshStandardMaterial({
      map: createPaperNoteTexture([
        'SECURITY LOCKOUT',
        'I WILL FORGET',
        'THIS. THE STUDY',
        'DOOR WILL NOT.',
        'IN WHAT IT WEARS,',
        'TOP ROW DOWN,',
        'LIES YOUR WAY OUT.'
      ]),
      roughness: 1
    })
  );
  /**
   * Taped to the middle of the door at eye level -- the one place the player
   * cannot walk up to this door without reading it.
   *
   * It used to nag ("CHECK ALL FIVE CAMERAS") because the cameras were
   * optional and the game wanted them looked at. They are mandatory now, so
   * the note does real work instead: it is the only statement anywhere of the
   * RULE -- that the study door's panelling is a number, and which way to read
   * it. Without it a player sees a perfectly ordinary panelled door and has no
   * reason to count anything, which is exactly the point of hiding the code in
   * something that needs no explanation for being there.
   *
   * PHRASED AS A RIDDLE, but only in one place. A security note that spelt out
   * "count the panels" would be a note that defeats the lock it belongs to,
   * which is reason enough in the fiction for it to be oblique -- so the WHAT
   * is riddled ("in what it wears") and left for the player to see for
   * themselves, since panels are obvious the moment anyone looks at that door.
   *
   * What is NOT riddled: "the study" and "top row down". Those are the two
   * facts a player cannot recover by looking harder -- there are five cameras
   * and two directions to read in, and being refused after counting correctly
   * is the worst failure this puzzle can produce. Atmosphere is worth a
   * player's second look; it is not worth their being stuck. The direction is
   * set INSIDE the sentence rather than appended to it, so the one plain
   * instruction still reads as part of the riddle.
   *
   * And it is in Mark's voice, which is the point of the first line. It gives
   * the note a reason to exist -- a man who knows his memory is going, leaving
   * himself a way back in -- and it lands twice: procedure on a first read,
   * and on a second the player's own handwriting, from before they forgot.
   *
   * It does NOT name the camera. There are five and only one shows the study,
   * so saying "the study door" is already enough to find it -- and leaving the
   * player to make that one connection is the difference between a clue and an
   * instruction.
   *
   * 1.55 m is head height for a 1.7 m eye position looking slightly down at a
   * door they are standing in front of. The note sits 0.05 m proud of the
   * slab's front face so it never z-fights with it.
   */
  const DOOR_NOTE_EYE_LEVEL_IN_METRES = 1.55;
  const DOOR_SLAB_HALF_DEPTH_IN_METRES = 0.04;
  doorNote.position.set(
    metalDoor.position.x,
    DOOR_NOTE_EYE_LEVEL_IN_METRES,
    metalDoor.position.z - DOOR_SLAB_HALF_DEPTH_IN_METRES - 0.01
  );
  // Turned to face back down the room. A PlaneGeometry's front is +Z and the
  // player always approaches this wall walking in the +Z direction, so an
  // unrotated note would present its back and, on a single-sided material,
  // not render at all.
  doorNote.rotation.y = Math.PI;
  doorNote.userData.interact = {
    label: 'Read the note on the door',
    onInteract: () => {
      showCaption(line('dialog_door_note'));
      /**
       * Read once, then it stops being a target.
       *
       * It has to. The note hangs dead centre of the door at eye level, which
       * is exactly where the crosshair lands when the player walks up to
       * open it -- and Interaction takes the nearest hit, so a permanently
       * interactable note would stand between the player and the door
       * forever. Splicing it out leaves the paper visible on the slab and
       * hands the crosshair back to the door, the same trick the fuses use
       * once they have been picked up.
       */
      const index = interactables.indexOf(doorNote);
      if (index !== -1) interactables.splice(index, 1);
    }
  };
  interactables.push(doorNote);
  lab.add(doorNote);

  /**
   * The volume in front of the metal door that trips the blackout.
   *
   * A BOX, not a radius, and no wider than the doorway itself. The CCTV desk
   * stands about 2 m from the door, so any sphere large enough to catch a
   * player walking up to the door also catches one standing at the monitor --
   * which would fire the blackout in the middle of the camera sightings, the
   * best thing in the level. Half the door's width plus the player's own body
   * radius is the narrowest volume they cannot walk through without their
   * shoulders crossing the doorway, so it only ever fires on someone actually
   * going for the exit.
   */
  const PLAYER_BODY_RADIUS_IN_METRES = 0.35;
  const DOOR_APPROACH_HALF_WIDTH_IN_METRES =
    DOOR_WIDTH_IN_METRES / 2 + PLAYER_BODY_RADIUS_IN_METRES;
  const DOOR_APPROACH_DEPTH_IN_METRES = 1.6;
  const doorWorldZ = LAB_Z + metalDoor.position.z;

  /**
   * Whether the player is standing in the door's approach lane.
   *
   * @param {THREE.Vector3} playerPosition - the player's WORLD position; the
   *   lane is stored in world coordinates for exactly this reason, since
   *   everything else in this file is written in lab-local ones.
   * @returns {boolean} true while they are in front of the door and within the
   *   doorway's own width. Height is ignored -- the player never leaves the floor.
   */
  function isPlayerAtDoor(playerPosition) {
    return (
      Math.abs(playerPosition.x) <= DOOR_APPROACH_HALF_WIDTH_IN_METRES &&
      playerPosition.z >= doorWorldZ - DOOR_APPROACH_DEPTH_IN_METRES
    );
  }

  /**
   * Sanity, checked at build time rather than discovered by a playtester
   * losing the CCTV sightings to a blackout: the desk must sit outside the
   * door's approach lane, or standing at the monitor trips it.
   */
  {
    const deskNearEdgeX = Math.abs(desk.position.x) - 0.65;
    if (deskNearEdgeX < DOOR_APPROACH_HALF_WIDTH_IN_METRES) {
      console.warn(
        `[lab] the CCTV desk reaches x=${deskNearEdgeX.toFixed(2)}, inside the ` +
        `${DOOR_APPROACH_HALF_WIDTH_IN_METRES.toFixed(2)}m door approach lane -- ` +
        'the blackout can fire while the player is using the monitor'
      );
    }
  }

  /**
   * Kills the lab the moment the player reaches the door.
   *
   * Fires once, only out of LIT -- so it can never happen before the 30A fuse
   * is in (there would be nothing to take away) and can never happen twice.
   *
   * The lights and the screen are dropped to zero HERE rather than left to the
   * ramp in updateLabLighting, because a hand pulling a main breaker is not a
   * fade. The ramp then simply holds them down. What the player keeps is the
   * fifteen-odd seconds of lit room they crossed to get here: long enough to
   * have seen the generator and the breaker panel, which is the whole reason
   * the trip waits until they have walked the length of the lab.
   */
  function triggerBlackout() {
    powerStage = POWER_STAGE.BLACKOUT;
    powerLevel = 0;

    // Whoever threw the main took every breaker down with it. The player
    // finds the panel this way, having seen it all up on the way in.
    setAllBreakers(false);
    setMainLever(false);
    // And the engine dies with it: its lamps go out, its needles fall, and
    // its fuel valve is found shut -- someone was at that too.
    generatorStepsCompleted = 0;
    starterPulls = 0;
    updateGeneratorControlLights();

    screenMaterial.uniforms.uNoiseStrength.value = 1.0;
    screenMaterial.uniforms.uStaticMix.value = 1;
    // Still switched on -- the picture collapses because the power went, and
    // returns with it.
    syncMonitor();
    // The screen is pure static now so nothing is on show, but the feeds must
    // still be told the basement went dark -- leaving them believing this room
    // is lit means the first frame after power returns paints a stale image.
    syncFeedRoomPower();

    metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.BLACKOUT];
    // Terse and sensory on purpose. The BEATS.blackout script that onBlackout
    // fires is what tells the player it was a hand on a lever, not a fault --
    // they feel it here and understand it a second later.
    showCaption(line('dialog_room_goes_out'));
    onBlackout();
  }

  /**
   * The pool it leaves behind. Same recipe as the corridor's puddles: no new
   * texture, semi-transparent with just enough gloss that a moving torch beam
   * finds a highlight in it. Darker and less transparent than water, because
   * this is not water.
   *
   * Hidden until the creature has stood there and gone. It is the evidence --
   * "It must be injured" -- and on a second playthrough it is the moment the
   * player realises they were the one who hurt her.
   */
  const poolMat = new THREE.MeshStandardMaterial({
    color: 0x0d0b0c,
    roughness: 0.22,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  });
  const blackPool = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), poolMat);
  blackPool.rotation.x = -Math.PI / 2;
  blackPool.position.set(-2.5 * LAB_SCALE, 0.014, -2.05 * LAB_SCALE);
  blackPool.scale.set(0.85, 1.15, 1);
  blackPool.visible = false;
  blackPool.userData.interact = {
    label: 'Examine the pool',
    onInteract: () => showCaption(line('dialog_black_pool_examine'))
  };
  lab.add(blackPool);

  function frameWoodMat() {
    return new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.85 });
  }

  // ---------- central detail ----------
  // The lab is a 12x9.75m room with most of its dressing pushed against
  // the side walls (generator/fuse box on one side, shelves on the
  // other) -- a player walking straight in from the hallway down the
  // centre saw nothing but bare floor and ceiling. A workbench and crates
  // along that direct sightline fill the middle of the room instead of
  // leaving it as dead space between the two side walls.
  const workbench = new THREE.Group();
  workbench.position.set(WORKBENCH_POSITION.x, 0, WORKBENCH_POSITION.z);
  lab.add(workbench);
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.8), frameWoodMat());
  benchTop.position.y = 0.82;
  workbench.add(benchTop);
  [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.06), frameWoodMat());
    leg.position.set(x, 0.41, z);
    workbench.add(leg);
  });
  const toolMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.06), toolMat);
    tool.position.set(-0.4 + i * 0.22, 0.865, -0.15 + (i % 2) * 0.3);
    tool.rotation.y = Math.random() * Math.PI;
    workbench.add(tool);
  }
  colliders.push({
    minX: workbench.position.x - 0.75, maxX: workbench.position.x + 0.75,
    minZ: LAB_Z + workbench.position.z - 0.45, maxZ: LAB_Z + workbench.position.z + 0.45
  });

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x2e2418, roughness: 0.9 });
  /**
   * The stacked crates used to stand at x=1.5, which left a 0.50 m gap between
   * their collider and the shelving at x=2.3. The player is 0.70 m across, so
   * that gap was impassable -- and it was the ONLY way into the back-right
   * quarter of the lab. 4.7 square metres of room, including the floor in front
   * of the CCTV desk, could never be reached at all. Found by flood-filling the
   * level's real colliders rather than by looking at it.
   *
   * Moved west to x=0.9, which opens the gap to 1.10 m.
   */
  CRATE_LAYOUT.forEach(({ x, z, stackY, turn }) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE), crateMat);
    crate.position.set(x, CRATE_SIZE / 2 + stackY, z);
    crate.rotation.y = turn;
    lab.add(crate);
    // Only what stands on the floor blocks the player. A crate stacked on
    // another is above head-height of the collider system, which is 2D.
    if (stackY === 0) {
      colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: LAB_Z + z - 0.3, maxZ: LAB_Z + z + 0.3 });
    }
  });

  /**
   * Sanity, at build time: no two crates may occupy the same space.
   *
   * A stack is boxes that TOUCH -- one's underside exactly on another's top.
   * Overlap in all three axes at once is interpenetration, which is what the
   * old hand-picked stackY of 0.4 against a 0.5 m crate produced, and which is
   * obvious in a screenshot and invisible in the source.
   */
  {
    const half = CRATE_SIZE / 2;
    const extent = (c) => ({
      x: [c.x - half, c.x + half],
      y: [c.stackY, c.stackY + CRATE_SIZE],
      z: [c.z - half, c.z + half]
    });
    const spanOverlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
    for (let i = 0; i < CRATE_LAYOUT.length; i++) {
      for (let j = i + 1; j < CRATE_LAYOUT.length; j++) {
        const a = extent(CRATE_LAYOUT[i]);
        const b = extent(CRATE_LAYOUT[j]);
        const ox = spanOverlap(a.x, b.x);
        const oy = spanOverlap(a.y, b.y);
        const oz = spanOverlap(a.z, b.z);
        if (ox > 1e-6 && oy > 1e-6 && oz > 1e-6) {
          console.warn(
            `[lab] crates ${i} and ${j} interpenetrate by ` +
            `${ox.toFixed(2)} x ${oy.toFixed(2)} x ${oz.toFixed(2)} m`
          );
        }
      }
    }
  }

  /**
   * The sketch. The storyline is specific: "on the floor is what seems to be a
   * sketch of the creature. It looks human, yet monstrous. Long arms, thin body,
   * hunched back, long fingers, crooked head."
   *
   * This is the single most important prop in the basement, because it is the
   * player's first good look at the shape -- and on a second playthrough it is
   * a drawing of the player, made by someone trying to describe what they were
   * living with.
   */
  const sketch = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.44),
    new THREE.MeshStandardMaterial({ map: createCreatureSketchTexture(), roughness: 1 })
  );
  sketch.rotation.x = -Math.PI / 2;
  sketch.rotation.z = -0.32;
  sketch.position.set(-1.35 * LAB_SCALE, 0.013, 0.85 * LAB_SCALE);
  sketch.userData.interact = {
    label: 'Pick up the sketch',
    onInteract: () => onExamineSketch()
  };
  interactables.push(sketch);
  lab.add(sketch);

  // torn pages of notes on the workbench -- the creature's own case file,
  // called out in the storyline but previously missing from the world
  const tornNoteTex = createPaperNoteTexture([
    'SUBJECT UNSTABLE.',
    'CONTAINMENT REQUIRED.',
    'MEMORY DETERIORATION',
    'OBSERVED.',
    'VISUAL DISTORTION',
    'INCREASING.'
  ]);
  const tornNotes = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.38),
    // Pulled toward the camera in the depth test as well as lifted: at the
    // shallow angle a player looks across the bench from, 3 mm alone can
    // still lose to the bench top on some depth buffers.
    new THREE.MeshStandardMaterial({
      map: tornNoteTex,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })
  );
  tornNotes.rotation.x = -Math.PI / 2;
  tornNotes.rotation.z = 0.15;
  // Local to the workbench, which is its parent. Lifted 3 mm off the bench
  // top (0.845) -- sitting exactly on it, the two faces shared one depth and
  // z-fought into a jagged staircase across the page.
  tornNotes.position.set(-0.2, 0.848, 0.15);
  tornNotes.userData.interact = {
    label: 'Read the torn notes',
    onInteract: () => showCaption(line('dialog_torn_notes'))
  };
  interactables.push(tornNotes);
  workbench.add(tornNotes);

  // ---------- the operating corner ----------

  /** Loaded props cast and catch the lamp's shadow: the straps across the pad are the point of it. */
  function shadowed(model) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return model;
  }

  /**
   * The restraint table: operating_table.glb (blender/build_operating_table.py),
   * a pedestal table with leather restraints at the wrists, chest and ankles.
   * The far wrist and ankle cuffs lie open, unbuckled; the near wrist strap
   * was torn through and the chest strap snapped; and a dried stain runs off
   * the pad onto the floor.
   */
  const operatingTable = new THREE.Group();
  operatingTable.position.set(OPERATING_TABLE.x, 0, OPERATING_TABLE.z);
  lab.add(operatingTable);
  loadModel(operatingTableModelUrl)
    .then((model) => operatingTable.add(shadowed(applyWhiteRust(model, ['TableSteel', 'TableBase']))))
    .catch((err) => console.error('[lab] operating_table.glb failed to load', err));
  colliders.push({
    minX: OPERATING_TABLE.x - OPERATING_TABLE.halfLength - 0.03,
    maxX: OPERATING_TABLE.x + OPERATING_TABLE.halfLength + 0.03,
    minZ: LAB_Z + OPERATING_TABLE.z - OPERATING_TABLE.sideReach,
    maxZ: LAB_Z + OPERATING_TABLE.z + OPERATING_TABLE.sideReach
  });

  // The click target: an invisible slab over the pad, since Interaction
  // never reaches inside a loaded model.
  const operatingTableHit = new THREE.Mesh(
    new THREE.BoxGeometry(OPERATING_TABLE.halfLength * 2, 0.12, OPERATING_TABLE.halfWidth * 2),
    hiddenHitMat
  );
  operatingTableHit.position.set(OPERATING_TABLE.x, OPERATING_TABLE.padTop - 0.03, OPERATING_TABLE.z);
  operatingTableHit.userData.interact = {
    label: 'Examine the table',
    onInteract: () => showCaption(line('dialog_operating_table'))
  };
  interactables.push(operatingTableHit);
  lab.add(operatingTableHit);

  /**
   * The surgical lamp, hung from the ceiling so its head is over the chest of
   * whoever was on the table. The player can switch it on and off by the
   * handle once the lab's lights have power, and it remembers being on: a
   * blackout puts it out, and it comes back with the power, like the monitor.
   */
  const lampHeadX = OPERATING_TABLE.x + SURGICAL_LAMP_OVER_TABLE_X;
  const surgicalLamp = new THREE.Group();
  surgicalLamp.position.set(lampHeadX - SURGICAL_LAMP.headX, LAB_H, OPERATING_TABLE.z);
  lab.add(surgicalLamp);

  const LAMP_COLOR = 0xe6fff0;            // a cold, faintly green white
  const LAMP_LIGHT_INTENSITY = 7;
  const LAMP_LENS_EMISSIVE_INTENSITY = 2.4;
  /** How long the lamp stutters when it comes on, before it holds. */
  const LAMP_STRIKE_SECONDS = 0.5;
  const lampLensY = LAB_H + SURGICAL_LAMP.lensY;

  // A material to drive until the model arrives, swapped for the model's own
  // lens material once it has loaded.
  let lampLensMat = new THREE.MeshStandardMaterial({ emissive: LAMP_COLOR });
  loadModel(surgicalLampModelUrl).then((model) => {
    applyWhiteRust(model, ['LampEnamel', 'LampSteel']);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;           // it is the light: its own head would shadow the whole table
      if (child.material.name === 'LampLens') {
        child.material.emissive.setHex(LAMP_COLOR);
        child.material.emissiveIntensity = lampLensMat.emissiveIntensity;
        lampLensMat = child.material;
      }
    });
    surgicalLamp.add(model);
  }).catch((err) => console.error('[lab] surgical_lamp.glb failed to load', err));

  const lampLight = new THREE.SpotLight(LAMP_COLOR, 0, 5, 0.62, 0.5, 1.5);
  lampLight.position.set(lampHeadX, lampLensY - 0.01, OPERATING_TABLE.z);
  lampLight.target.position.set(lampHeadX, 0, OPERATING_TABLE.z);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.0005;
  lampLight.shadow.normalBias = 0.02;
  lampLight.shadow.camera.near = 0.1;
  lampLight.shadow.camera.far = 3;
  lab.add(lampLight, lampLight.target);

  // The click target: the head, handle and all.
  const lampHeadHeight = SURGICAL_LAMP.domeTopY - SURGICAL_LAMP.handleBottomY;
  const lampHit = new THREE.Mesh(
    new THREE.CylinderGeometry(SURGICAL_LAMP.headRadius, SURGICAL_LAMP.headRadius, lampHeadHeight, 16),
    hiddenHitMat
  );
  lampHit.position.set(lampHeadX, LAB_H + SURGICAL_LAMP.handleBottomY + lampHeadHeight / 2, OPERATING_TABLE.z);
  lab.add(lampHit);

  let lampSwitchedOn = false;
  let lampHasBeenLit = false;
  let lampWasLit = false;
  let lampStrikeSecondsLeft = 0;

  function isLampLit() {
    return lampSwitchedOn && isLabLightingOn();
  }

  lampHit.userData.interact = {
    label: 'Switch on the operating lamp',
    onInteract: () => {
      lampSwitchedOn = !lampSwitchedOn;
      lampHit.userData.interact.label = lampSwitchedOn ? 'Switch off the operating lamp' : 'Switch on the operating lamp';
      if (!lampSwitchedOn) return;
      if (!isLabLightingOn()) {
        showCaption(line(
          powerStage === POWER_STAGE.DEAD
            ? 'dialog_surgical_lamp_no_power'
            : 'dialog_surgical_lamp_dead'
        ));
        return;
      }
      if (!lampHasBeenLit) {
        lampHasBeenLit = true;
        showCaption(line('dialog_surgical_lamp_lit'));
      }
    }
  };
  interactables.push(lampHit);

  dynamics.push({
    update: (dt) => {
      const lit = isLampLit();
      if (lit && !lampWasLit) lampStrikeSecondsLeft = LAMP_STRIKE_SECONDS;
      lampWasLit = lit;
      let level = lit ? 1 : 0;
      if (lit && lampStrikeSecondsLeft > 0) {
        // Striking: catching and dropping out a few times before it holds.
        lampStrikeSecondsLeft -= dt;
        level = Math.random() < 0.45 ? 0.12 : 1;
      }
      lampLight.intensity = LAMP_LIGHT_INTENSITY * level;
      lampLensMat.emissiveIntensity = LAMP_LENS_EMISSIVE_INTENSITY * level;
    }
  });

  /**
   * The instrument trolley, pulled up at the head of the table, on castors:
   * world/InstrumentTrolley.js. Walk into it and it rolls away from you;
   * shove it more than TROLLEY_FALL_RADIUS from where it starts and it goes
   * over, throwing the instruments across the floor with a crash the whole
   * basement hears. It stays down until the level restarts.
   */
  const instrumentTrolley = createInstrumentTrolley({
    parent: lab,
    parentWorldZ: LAB_Z,
    position: {
      x: OPERATING_TABLE.x - OPERATING_TABLE.halfLength + 0.1,
      z: OPERATING_TABLE.z - OPERATING_TABLE.sideReach - INSTRUMENT_TROLLEY.depth / 2 - TROLLEY_TABLE_GAP
    },
    // Turned a little, as if shoved aside.
    yaw: 0.25,
    size: INSTRUMENT_TROLLEY,
    fallRadius: TROLLEY_FALL_RADIUS,
    colliders,
    onRoll: onTrolleyRoll,
    onCrash: () => {
      trolleyHit.userData.interact.label = 'Examine the trolley';
      showCaption(line('dialog_trolley_crash'));
      onTrolleyCrash();
    }
  });
  loadModel(instrumentTrolleyModelUrl)
    .then((model) => instrumentTrolley.setModel(shadowed(
      applyBareSteel(applyWhiteRust(model, ['TrolleySteel']), ['TrolleyTool'])
    )))
    .catch((err) => console.error('[lab] instrument_trolley.glb failed to load', err));
  dynamics.push({ update: (dt) => instrumentTrolley.update(dt) });

  const trolleyHit = new THREE.Mesh(
    new THREE.BoxGeometry(INSTRUMENT_TROLLEY.length, 0.08, INSTRUMENT_TROLLEY.depth),
    hiddenHitMat
  );
  trolleyHit.position.set(0, INSTRUMENT_TROLLEY.top + 0.03, 0);
  trolleyHit.userData.interact = {
    label: 'Examine the instruments',
    onInteract: () => showCaption(line(
      instrumentTrolley.fallen ? 'dialog_instrument_trolley_fallen' : 'dialog_instrument_trolley'
    ))
  };
  // Inside the trolley's body, so it rolls with it and goes over with it --
  // it is still raycast directly, since it is listed in interactables itself.
  instrumentTrolley.body.add(trolleyHit);
  interactables.push(trolleyHit);

  /**
   * The stool, knocked over beside the head of the table: lab_chair.glb,
   * modelled standing and tipped over here onto its +x side.
   *
   * It does not lie flat. It rests on two things -- the castor of the leg
   * pointing down, and the edge of the seat -- so the column leans this far
   * short of horizontal: the slope of the line between those two points.
   */
  const chairRestTilt = Math.atan2(
    LAB_CHAIR.castorReach - LAB_CHAIR.seatRadius,
    LAB_CHAIR.seatEdgeHeight - LAB_CHAIR.castorHeight
  );
  const labChair = new THREE.Group();
  labChair.position.set(OPERATING_TABLE.x - 0.35, 0, OPERATING_TABLE.z + OPERATING_TABLE.sideReach + 0.55);
  // Fallen toward the west wall, the seat turned half away from the table.
  labChair.rotation.y = Math.PI + 0.45;
  lab.add(labChair);
  loadModel(labChairModelUrl).then((model) => {
    const tipped = new THREE.Group();
    // A turn about z takes the chair's up (+y) over toward +x.
    tipped.rotation.z = -(Math.PI / 2 - chairRestTilt);
    tipped.add(shadowed(applyWhiteRust(model, ['ChairSteel'])));
    labChair.add(tipped);
    // Sat back down on the floor: whatever now hangs lowest is lifted to it.
    // The lab floor is world y = 0, and the chair is only ever turned about
    // y, so a world height is a local one.
    labChair.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(tipped, true);
    tipped.position.y = -bounds.min.y;
    // Its collider comes from the model as it lies, since a tipped-over
    // chair is not a shape worth working out by hand. Box3 is in world
    // space, which is what colliders are in.
    labChair.updateWorldMatrix(true, true);
    const lying = new THREE.Box3().setFromObject(tipped, true);
    colliders.push({ minX: lying.min.x, maxX: lying.max.x, minZ: lying.min.z, maxZ: lying.max.z });
  }).catch((err) => console.error('[lab] lab_chair.glb failed to load', err));

  /**
   * Eases a ramp value toward a target at a fixed rate.
   *
   * @param {number} current - the ramp's value this frame.
   * @param {number} target - 0 or 1, whichever state the circuit is in.
   * @param {number} step - how far the ramp may travel this frame.
   * @returns {number} the eased value, never overshooting the target.
   */
  function easeToward(current, target, step) {
    return target > current
      ? Math.min(target, current + step)
      : Math.max(target, current - step);
  }

  /**
   * Drives the lab lighting through the three states the fuse box can put
   * the circuit in, easing between them rather than snapping.
   *
   * @param {number} deltaTimeInSeconds - frame time, used for the ramp rates.
   *
   * Dead circuit (no fuse, or an under-rated one): the strip lights are off
   * and the room sits at its unpowered floor, so the player has to search
   * the lab by flashlight. Powered (30A seated): the tubes flicker gently
   * around their rated output with the occasional dip. Overloaded (45A
   * seated): the tubes run ~20x their rated output and the ambient term is
   * swapped to a strong cool white, washing every surface out far enough
   * that the player can barely make the lab out until they pull the fuse.
   *
   * The two ramps compose in that order -- power first, then glare on top --
   * because an overload happens on a circuit that was never restored, so the
   * glare has to be able to override the dead-circuit darkness.
   */
  function updateLabLighting(deltaTimeInSeconds) {
    // Two different things drive the glare -- an over-rated fuse, which lasts
    // as long as it is seated, and a tripped breaker panel, which is on a
    // timer. They share one ramp and one look on purpose: the player should
    // only ever have to learn a single visual for "too much current".
    if (breakerTripTimeRemainingInSeconds > 0) {
      breakerTripTimeRemainingInSeconds = Math.max(0, breakerTripTimeRemainingInSeconds - deltaTimeInSeconds);
    }
    const isOverloaded = puzzleState.overloaded || breakerTripTimeRemainingInSeconds > 0;

    overloadGlare = easeToward(
      overloadGlare,
      isOverloaded ? 1 : 0,
      deltaTimeInSeconds / OVERLOAD_GLARE_RAMP_IN_SECONDS
    );
    powerLevel = easeToward(
      powerLevel,
      isLabLightingOn() ? 1 : 0,
      deltaTimeInSeconds / POWER_RAMP_IN_SECONDS
    );

    fluorescents.forEach(({ light, mat, isDying }) => {
      const dip = Math.random() < 0.05 ? 0.3 : 1;
      const ratedIntensity = (1.17 + Math.random() * 0.31) * dip;
      // One tube keeps trying on a dead circuit, which is what a failing
      // fluorescent actually does. Rare and brief -- a 3% chance per frame is
      // roughly twice a second, reading as a struggle rather than a strobe --
      // and the power ramp fades it out as the real lights come up.
      const stuttering = isDying && Math.random() < 0.03;
      const deadIntensity = stuttering ? 0.5 + Math.random() * 0.35 : UNPOWERED_TUBE_LIGHT_INTENSITY;
      const deadEmissive = stuttering ? 0.9 : UNPOWERED_TUBE_EMISSIVE_INTENSITY;

      const overloadIntensity = OVERLOAD_TUBE_LIGHT_INTENSITY + Math.random() * OVERLOAD_TUBE_LIGHT_JITTER;
      light.intensity = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(deadIntensity, ratedIntensity, powerLevel),
        overloadIntensity,
        overloadGlare
      );
      // Per-tube, not one shared material: the dying tube has to be able to
      // glow while the other two stay dark.
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(deadEmissive, TUBE_EMISSIVE_INTENSITY, powerLevel),
        OVERLOAD_TUBE_EMISSIVE_INTENSITY,
        overloadGlare
      );
    });

    const poweredAmbient = THREE.MathUtils.lerp(
      LAB_AMBIENT_OFF,
      LAB_AMBIENT_ON,
      powerLevel
    );
    labAmbient.intensity = THREE.MathUtils.lerp(
      poweredAmbient,
      OVERLOAD_AMBIENT_INTENSITY,
      overloadGlare
    );
    labAmbient.color.copy(LAB_AMBIENT_COLOR).lerp(OVERLOAD_AMBIENT_COLOR, overloadGlare);

    // The in-scene lights alone still resolve into a readable room; the
    // screen-space wash is what actually costs the player their sight.
    onGlare(overloadGlare);
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
    refs: {
      fluorescents,
      hallLight,
      screenMaterial,
      labAmbient,
      monitorBody,
      metalDoor,
      feeds,
      feedButtons,
      hallLightning,
      blackPool,
      /** Where the creature stands after camera five, as world [x, z]. */
      creatureCorner: [CREATURE_CORNER.x, LAB_Z + CREATURE_CORNER.z],
      /** One lightning strike down the hallway. Returns how long it lasts. */
      strike: (duration = 0.55) => {
        flash.duration = duration;
        flash.t = duration;
        return duration;
      },
      /** Reveals the pool and makes it examinable. Once the creature has gone. */
      revealPool: () => {
        if (blackPool.visible) return;
        blackPool.visible = true;
        interactables.push(blackPool);
      },
      /** True while the lab's lights and CCTV are live. The level owns the state. */
      get powerRestored() { return hasMainsPower(); },
      /** The full electrical stage, for anything that needs more than on/off. */
      get powerStage() { return powerStage; },
      /**
       * A fresh snapshot of how far the player is, for the H-key hints (see
       * basementHints.js). Read-only copies: nothing outside may change these.
       */
      get hintProgress() {
        return {
          powerStage,
          slotFuse: puzzleState.slotFuse,
          monitorSwitchedOn,
          securityCleared,
          securityCode: SECURITY_CODE
        };
      }
    },

    /**
     * Puts every piece of run-specific state this level owns back to its
     * starting point. SceneManager.resetAll() calls this, without which a
     * restart left the breaker flipped and the exit door still reading "Open
     * the door".
     *
     * Two halves: the fuse puzzle (held/seated fuse, overload glare, spark
     * flash, the dropped-fuse row, and the four fuse meshes with fresh pickup
     * handlers), and everything restoring the power changed (lights, screen,
     * feeds, the creature's pool).
     */
    reset() {
      powerStage = POWER_STAGE.DEAD;
      resetLabDoors();
      puzzleState.heldFuse = null;
      puzzleState.slotFuse = null;
      puzzleState.overloaded = false;
      sparkTimer = 0;
      sparkLight.intensity = 0;
      droppedFuseCount = 0;
      overloadGlare = 0;
      powerLevel = 0;
      onGlare(0);

      // The two restoration puzzles, back to untouched. Without these an R
      // after a solved panel would restart the level with the generator's
      // sequence half-entered and every breaker still showing green.
      generatorStepsCompleted = 0;
      starterPulls = 0;
      generatorSputterSeconds = 0;
      updateGeneratorControlLights();
      breakerTripTimeRemainingInSeconds = 0;
      setAllBreakers(true);
      setMainLever(true, { instant: true });
      closeBreakerCover();
      securityCleared = false;
      // The door note splices itself out of the target list once read, so a
      // restart has to put it back or the second run never shows the prompt.
      if (!interactables.includes(doorNote)) interactables.push(doorNote);

      labAmbient.intensity = LAB_AMBIENT_OFF;
      labAmbient.color.copy(LAB_AMBIENT_COLOR);
      fluorescents.forEach(({ light, mat }) => {
        light.intensity = UNPOWERED_TUBE_LIGHT_INTENSITY;
        mat.emissiveIntensity = UNPOWERED_TUBE_EMISSIVE_INTENSITY;
      });

      screenMaterial.uniforms.uNoiseStrength.value = 1.0;
      screenMaterial.uniforms.uStaticMix.value = 1;
      screenMaterial.uniforms.uFeed.value = feeds.textures.kitchen;
      feeds.reset();
      flash.t = 0;
      hallLightning.intensity = 0;
      if (blackPool.visible) {
        blackPool.visible = false;
        const i = interactables.indexOf(blackPool);
        if (i >= 0) interactables.splice(i, 1);
      }
      monitorSwitchedOn = false;
      activeFeedId = FEED_IDS[0];
      screenMaterial.uniforms.uPower.value = 0;
      syncMonitor();

      lampSwitchedOn = false;
      lampHasBeenLit = false;
      lampHit.userData.interact.label = 'Switch on the operating lamp';

      instrumentTrolley.reset();
      trolleyHit.userData.interact.label = 'Examine the instruments';

      setFuseCoverOpen(false, { quiet: true });
      fuseCover.everOpened = false;
      fuseCover.angle = 0;
      fuseCoverHinge.rotation.y = 0;
      if (fuseCover.pivot) fuseCover.pivot.rotation.y = fuseCover.closedRotationY;
      metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.DEAD];

      fuseData.forEach((data, i) => {
        const fuse = fuseMeshes[data.amps];
        fuse.position.set(...fusePositions[i]);
        fuse.rotation.set(0, 0, 0);
        fuse.rotation.z = Math.PI / 2;
        fuse.visible = true;
        setFuseScorched(fuse, false);
        fuse.userData.interact = {
          label: `Pick up fuse (${data.amps})`,
          onInteract: () => {
            if (puzzleState.heldFuse) {
              showCaption(line('dialog_fuse_already_holding'));
              return;
            }
            puzzleState.heldFuse = data.amps;
            showCaption(line('dialog_fuse_taken', { amps: data.amps }));
            fuse.visible = false;
            const idx = interactables.indexOf(fuse);
            if (idx !== -1) interactables.splice(idx, 1);
          }
        };
        if (!interactables.includes(fuse)) interactables.push(fuse);
      });
    },
    /**
     * @param {number} dt - frame time in seconds.
     * @param {THREE.Vector3} [playerPosition] - the player's world position.
     *   Optional, because the proximity trip is the only thing in this level
     *   that needs it and a caller that does not pass it simply never fires it.
     */
    update(dt, playerPosition) {
      const elapsed = (this._t = (this._t ?? 0) + dt);
      dynamics.forEach((d) => d.update(dt, elapsed));
      updateLabDoors(dt, playerPosition);

      // The blackout. Gated on LIT, so it cannot fire before the 30A fuse has
      // given the player something to lose, and cannot fire twice.
      if (powerStage === POWER_STAGE.LIT && playerPosition && isPlayerAtDoor(playerPosition)) {
        triggerBlackout();
      }

      // The scripted lightning. Fast up, slower down, with the intensity
      // jittered so it reads as a strike rather than a lamp being switched.
      if (flash.t > 0) {
        flash.t = Math.max(0, flash.t - dt);
        const k = flash.t / flash.duration;
        hallLightning.intensity = k * k * 5.2 * (0.55 + Math.random() * 0.45);
      } else if (hallLightning.intensity !== 0) {
        hallLightning.intensity = 0;
      }

      // Sole owner of the fluorescents and the lab ambient -- it folds the
      // dying-tube stutter, the powered flicker and the overload glare into a
      // single pass, so nothing else in here may drive those lights.
      updateLabLighting(dt);

      if (sparkTimer > 0) {
        sparkTimer -= dt;
        sparkLight.intensity = Math.max(0, sparkTimer / 0.15) * 4;
      }
    }
  };
}