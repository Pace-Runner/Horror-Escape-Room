import * as THREE from 'three';
import {
  createPlasterWallTexture,
  createPlasterBumpTexture,
  createConcreteTexture,
  createConcreteBumpTexture,
  createStickyNoteTexture,
  createHazardSignTexture,
  createPaperNoteTexture
} from '../world/textures.js';
import { createStaticScreenMaterial } from '../world/StaticScreenMaterial.js';
import { createCctvFeeds, FEED_IDS, FEED_LABELS } from '../world/CctvFeeds.js';
import { SECURITY_CODE } from '../world/doorPanels.js';
import { createCreatureSketchTexture } from '../world/textures.js';
import { addBaseboard } from '../world/trim.js';

const HALL_W = 2.4;
const HALL_LEN = 5.5;
const HALL_H = 2.7;
const LAB_W = 8;
const LAB_D = 6.5;
const LAB_H = 3.2;
const LAB_Z = HALL_LEN + LAB_D / 2 + 0.2;

/**
 * The metal door at the far end. Up here with the room dimensions rather than
 * beside the mesh, because things built long BEFORE the door have to be placed
 * around it -- the pipe run along that same wall being the reason this moved.
 * The door stands on the floor, so its top edge is simply its height.
 */
const DOOR_WIDTH_IN_METRES = 1.1;
const DOOR_HEIGHT_IN_METRES = 2.1;

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
const DESK_POSITION = { x: 1.6, z: LAB_D / 2 - 0.55 };
const DESK_TOP_SIZE = { width: 1.2, depth: 0.6, thickness: 0.06, standHeight: 0.75 };

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
  { x: 0.9, z: 1.5, stackY: 0, turn: 0.34 },
  { x: 0.9, z: 1.5, stackY: CRATE_SIZE, turn: 0 },   // carries the 45A fuse
  { x: -1.6, z: 2.2, stackY: 0, turn: 0.8 }
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

  const labFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(LAB_W, LAB_D),
    new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.3, roughness: 1 })
  );
  labFloor.rotation.x = -Math.PI / 2;
  labFloor.receiveShadow = true;
  lab.add(labFloor);

  const labCeil = labFloor.clone();
  labCeil.rotation.x = Math.PI / 2;
  labCeil.position.y = LAB_H;
  labCeil.material = new THREE.MeshStandardMaterial({ color: 0x121110 });
  lab.add(labCeil);

  const labWallMat = new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteBump, bumpScale: 0.3, roughness: 1 });
  function labWall(w, x, z, ry) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, LAB_H), labWallMat);
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
  const DOORWAY_W = HALL_W;
  const DOORWAY_H = 2.15;
  const jambW = (LAB_W - DOORWAY_W) / 2;
  for (const side of [-1, 1]) {
    const x = side * (DOORWAY_W / 2 + jambW / 2);
    const jamb = new THREE.Mesh(new THREE.PlaneGeometry(jambW, LAB_H), labWallMat);
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
    new THREE.PlaneGeometry(DOORWAY_W, LAB_H - DOORWAY_H),
    labWallMat
  );
  lintel.position.set(0, DOORWAY_H + (LAB_H - DOORWAY_H) / 2, -LAB_D / 2);
  lab.add(lintel);

  labWall(LAB_D, -LAB_W / 2, 0, Math.PI / 2);
  labWall(LAB_D, LAB_W / 2, 0, -Math.PI / 2);
  const backWall = labWall(LAB_W, 0, LAB_D / 2, Math.PI);

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
      color: 0xdfe8ff, emissive: 0x9fc0ff, emissiveIntensity: 0.06
    });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.1), tubeMat);
    tube.position.set(i * 2.4, LAB_H - 0.05, -1);
    fixturesGroup.add(tube);
    const tubeLight = new THREE.PointLight(0xaec4ff, 0, 9, 1.5);
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
  const LAB_AMBIENT_COLOR = new THREE.Color(0x3d4658);
  const OVERLOAD_AMBIENT_COLOR = new THREE.Color(0xe4f0ff); // cool white, matching the fluorescent tubes
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

  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a5f5a, metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < PIPE_COUNT; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(PIPE_RADIUS_IN_METRES, PIPE_RADIUS_IN_METRES, LAB_W - 1, 10),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, lowestPipeY + i * PIPE_SPACING_IN_METRES, LAB_D / 2 - 0.2);
    lab.add(pipe);
  }

  /**
   * Sanity, at build time: the pipe run has to clear the doorway below it and
   * still fit under the ceiling. Both ends matter -- raising the run far enough
   * to miss the door is only a fix if the top pipe does not end up inside the
   * slab above it.
   */
  {
    const highestPipeTopY = lowestPipeY + (PIPE_COUNT - 1) * PIPE_SPACING_IN_METRES + PIPE_RADIUS_IN_METRES;
    if (lowestPipeY - PIPE_RADIUS_IN_METRES < DOOR_HEIGHT_IN_METRES) {
      console.warn('[lab] the pipe run crosses the metal door -- the exit reads through bars');
    }
    if (highestPipeTopY > LAB_H) {
      console.warn(`[lab] the pipe run reaches ${highestPipeTopY.toFixed(2)}m, through a ${LAB_H}m ceiling`);
    }
  }

  // generators / fuse box against the side wall
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x33362f, roughness: 0.7, metalness: 0.3 });
  const generator = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.7), boxMat);
  generator.position.set(-LAB_W / 2 + 0.7, 0.6, -1.5);
  lab.add(generator);
  colliders.push({
    minX: generator.position.x - 0.55, maxX: generator.position.x + 0.55,
    minZ: LAB_Z + generator.position.z - 0.4, maxZ: LAB_Z + generator.position.z + 0.4
  });

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
    { id: 'fuse15', amps: '15A', radius: 0.025, color: 0xd8d8d8 },
    { id: 'fuse20', amps: '20A', radius: 0.03, color: 0xd8d8d8 },
    { id: 'fuse30', amps: '30A', radius: 0.035, color: 0xd8d8d8 }, // correct
    { id: 'fuse45', amps: '45A', radius: 0.045, color: 0xd8d8d8 }
  ];

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
   * The 30A and 45A spots are computed from the desk and the crate instead of
   * being written out, because those two are the ones that kept coming adrift
   * when their prop moved. The other two sit on the workbench and the floor,
   * neither of which has ever moved.
   */
  const fuseRestingSpots = [
    { x: 0.9, z: -0.55, surfaceY: WORKBENCH_TOP_Y },   // workbench top, clear of the four tool props
    { x: 1.3, z: -0.3, surfaceY: LAB_FLOOR_Y },        // floor, just outside the workbench's collider
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

  // A fuse cylinder is centred on its own origin, so resting it exactly at
  // the surface height would sink half of it into that surface -- its own
  // radius is added on top so it sits on the surface instead of in it.
  const fusePositions = fuseRestingSpots.map(
    (spot, i) => [spot.x, spot.surfaceY + fuseData[i].radius, spot.z]
  );

  const fuseBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.6 })
  );
  fuseBox.position.set(-LAB_W / 2 + 0.12, 1.4, 0);

  // Wrong fuses pulled back out of the box land in the next free slot of a
  // short row on the floor beside it, so earlier rejects stay visible
  // instead of every drop stacking on one shared coordinate. Only the three
  // wrong fuses (15A / 20A / 45A) can ever be dropped -- the correct 30A one
  // stays seated -- so three slots is exactly enough for a single run.
  const DROPPED_FUSE_Y = 0.05;
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
    label: 'Empty fuse slot',
    onInteract: () => {
      /**
       * Once the right fuse is seated it STAYS seated, in every later stage.
       *
       * The blackout further on is the main being thrown at the far wall, not
       * this fuse failing. Letting the player pull the 30A back out afterwards
       * would send them to re-solve a puzzle that was never the problem, and
       * the caption is worded to head that off before they try.
       */
      if (puzzleState.slotFuse === CORRECT_FUSE_AMPS) {
        showCaption('The 30A fuse is seated and holding. Whatever went wrong, it is further down the line.');
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
        showCaption(`You pull the ${removed} fuse back out. The lab settles back to normal.`);

        const dropped = fuseMeshes[removed];
        const slot = droppedFuseSlots[Math.min(droppedFuseCount, droppedFuseSlots.length - 1)];
        droppedFuseCount += 1;
        dropped.position.set(...slot);
        dropped.rotation.set(0, 0, 0);
        dropped.visible = true;

        const reason = fuseFailReason[removed];
        dropped.userData.interact = {
          label: reason === 'blown' ? 'Blown fuse' : 'Fuse (rating too high)',
          onInteract: () => {
            showCaption(
              reason === 'blown'
                ? 'This fuse is blown.'
                : "This fuse's rating is too high. Try another one."
            );
          }
        };
        if (!interactables.includes(dropped)) interactables.push(dropped);
        return;
      }

      // Slot is empty -- try installing whatever's in hand
      if (!puzzleState.heldFuse) {
        showCaption('An empty slot. It needs a fuse -- the right one.');
        return;
      }

      const installed = puzzleState.heldFuse;
      const amps = parseInt(installed, 10);
      puzzleState.heldFuse = null;

      if (installed === CORRECT_FUSE_AMPS) {
        powerStage = POWER_STAGE.LIT;
        puzzleState.slotFuse = CORRECT_FUSE_AMPS;
        showCaption('The fuse clicks in. The lights come up the length of the room, and the monitor wakes.');
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
        monitorBody.userData.interact.label = 'View camera feeds';
        feedButtons[0].mesh.material.emissive.setHex(0x2e6b3a);
        // The lab is lit, the house is not. Four of the five cameras come up
        // showing a dark room and naming the circuit that would fix it --
        // which is where the player first learns HOUSE is a thing to want.
        syncFeedRoomPower();
        onPowerRestored();
      } else if (amps < 30) {
        puzzleState.slotFuse = installed;
        fuseFailReason[installed] = 'blown';
        showCaption(`The ${installed} fuse can't take the load -- it flares and burns out.`);
        onSpark();
        sparkLight.intensity = 4;
        sparkTimer = 0.15;
        fuseBox.userData.interact.label = 'Remove fuse';
      } else {
        puzzleState.slotFuse = installed;
        fuseFailReason[installed] = 'overrated';
        showCaption(`The ${installed} fuse's rating is too high -- every light in the lab surges into a blinding white glare.`);
        puzzleState.overloaded = true;
        fuseBox.userData.interact.label = 'Remove fuse';
      }
    }
  };
  interactables.push(fuseBox);
  lab.add(fuseBox);

  fuseData.forEach((data, i) => {
    const fuse = new THREE.Mesh(
      new THREE.CylinderGeometry(data.radius, data.radius, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.4, metalness: 0.2 })
    );
    fuse.rotation.z = Math.PI / 2;
    fuse.position.set(...fusePositions[i]);
    fuse.userData.interact = {
      label: `Pick up fuse (${data.amps})`,
      onInteract: () => {
        if (puzzleState.heldFuse) {
          showCaption("You're already holding a fuse. Install or remove it at the fuse box first.");
          return;
        }
        puzzleState.heldFuse = data.amps;
        showCaption(`You take the ${data.amps} fuse.`);
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
    onInteract: () => showCaption('"REPLACE BLOWN FUSE. CORRECT RATING ONLY -- anything else will blow, or burn the line."')
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
  hazardSign.position.set(-LAB_W / 2 + 0.03, 1.62, -1.5);
  hazardSign.rotation.y = Math.PI / 2;
  lab.add(hazardSign);

  const cableMat = new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.6 });
  const cableStart = new THREE.Vector3(generator.position.x + 0.3, 1.0, generator.position.z + 0.1);
  const cableEnd = new THREE.Vector3(fuseBox.position.x, 1.1, fuseBox.position.z - 0.1);
  const cableSag = new THREE.Vector3(
    (cableStart.x + cableEnd.x) / 2,
    Math.min(cableStart.y, cableEnd.y) - 0.35,
    (cableStart.z + cableEnd.z) / 2
  );
  const cableCurve = new THREE.CatmullRomCurve3([cableStart, cableSag, cableEnd]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 12, 0.012, 6, false), cableMat);
  lab.add(cable);

  // ---------- puzzle 2a: restarting the generator ----------

  /**
   * The order the three controls on the generator's face have to be worked in,
   * which is exactly what the plate bolted above them says. Out of order and
   * the set resets, because a half-primed engine does not stay half-primed.
   */
  const GENERATOR_RESTART_SEQUENCE = ['valve', 'primer', 'starter'];
  /**
   * Each control's prompt, and what pressing it in the right order says.
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
      caption: 'The valve turns without a sound. Is it the last quiet thing you do down here?'
    },
    primer: {
      label: 'Primer pump',
      caption: 'The stroke of the primer bangs through the pipes.'
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
  const generatorControlMeshes = {};

  /**
   * Repaints the three controls so the player can see how far into the
   * sequence they are without having to remember. Green for a step already
   * taken, dark for one still outstanding.
   */
  function updateGeneratorControlLights() {
    GENERATOR_RESTART_SEQUENCE.forEach((controlId, stepIndex) => {
      generatorControlMeshes[controlId].material.emissive.setHex(
        stepIndex < generatorStepsCompleted
          ? GENERATOR_CONTROL_COLOR_DONE
          : GENERATOR_CONTROL_COLOR_IDLE
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
    showCaption('The engine catches and the noise of it fills everything. Then the breaker panel hums.');
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
      showCaption(
        powerStage === POWER_STAGE.RUNNING || powerStage === POWER_STAGE.ROUTED
          ? 'The generator is running. Leave it alone.'
          : 'The generator is turning over on its own. Nothing here needs restarting.'
      );
      return;
    }

    if (controlId !== GENERATOR_RESTART_SEQUENCE[generatorStepsCompleted]) {
      generatorStepsCompleted = 0;
      updateGeneratorControlLights();
      onSpark();
      showCaption('It coughs, floods and dies. Wrong order -- and the noise carried anyway.');
      return;
    }

    generatorStepsCompleted += 1;
    updateGeneratorControlLights();

    if (generatorStepsCompleted < GENERATOR_RESTART_SEQUENCE.length) {
      showCaption(GENERATOR_CONTROLS[controlId].caption);
      return;
    }
    startGenerator();
  }

  /**
   * The three controls, mounted in a row across the generator's front face.
   *
   * Each is pushed into `interactables` in its own right rather than under a
   * parent group, because Interaction raycasts NON-recursively -- see the note
   * on the CCTV remote further down for the full reasoning.
   */
  const GENERATOR_FACE_X = generator.position.x + 0.51;
  GENERATOR_RESTART_SEQUENCE.forEach((controlId, i) => {
    const control = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.09, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0x6a6257,
        emissive: GENERATOR_CONTROL_COLOR_IDLE,
        roughness: 0.5,
        metalness: 0.4
      })
    );
    control.position.set(GENERATOR_FACE_X, 0.82, generator.position.z - 0.2 + i * 0.2);
    control.userData.interact = {
      label: GENERATOR_CONTROLS[controlId].label,
      onInteract: () => pressGeneratorControl(controlId)
    };
    interactables.push(control);
    lab.add(control);
    generatorControlMeshes[controlId] = control;
  });

  const restartPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.24),
    new THREE.MeshStandardMaterial({
      map: createPaperNoteTexture(['RESTART ORDER', '1. FUEL VALVE', '2. PRIME', '3. STARTER']),
      roughness: 1
    })
  );
  restartPlate.position.set(GENERATOR_FACE_X + 0.005, 1.05, generator.position.z);
  restartPlate.rotation.y = Math.PI / 2;
  restartPlate.userData.interact = {
    label: 'Read the restart plate',
    onInteract: () => showCaption('"RESTART ORDER: 1. FUEL VALVE. 2. PRIME. 3. STARTER."')
  };
  interactables.push(restartPlate);
  lab.add(restartPlate);

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

  const BREAKER_ON_TILT_IN_RADIANS = -0.4;
  const BREAKER_OFF_TILT_IN_RADIANS = 0.4;
  const BREAKER_COLOR_ON = 0x2e6b3a;
  const BREAKER_COLOR_OFF = 0x000000;

  /** circuit id -> whether that breaker is currently closed. */
  const breakerIsOn = {};
  /** circuit id -> its switch mesh, so the panel can repaint or reset one. */
  const breakerMeshes = {};
  BREAKER_CIRCUITS.forEach(({ id }) => { breakerIsOn[id] = false; });

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

  /** Repaints and re-tilts one switch to match its state. */
  function updateBreakerSwitch(circuitId) {
    const mesh = breakerMeshes[circuitId];
    const isOn = breakerIsOn[circuitId];
    mesh.rotation.z = isOn ? BREAKER_ON_TILT_IN_RADIANS : BREAKER_OFF_TILT_IN_RADIANS;
    mesh.material.emissive.setHex(isOn ? BREAKER_COLOR_ON : BREAKER_COLOR_OFF);
    const circuit = BREAKER_CIRCUITS.find((c) => c.id === circuitId);
    mesh.userData.interact.label =
      `${circuit.label} (${circuit.loadInAmps}A) -- ${isOn ? 'ON' : 'OFF'}`;
  }

  /** Drops every breaker back to open and repaints the whole panel. */
  function resetAllBreakers() {
    BREAKER_CIRCUITS.forEach(({ id }) => {
      breakerIsOn[id] = false;
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
    resetAllBreakers();
    breakerTripTimeRemainingInSeconds = BREAKER_TRIP_GLARE_IN_SECONDS;
    onSpark();
    onOverload();
    showCaption(`Over ${PANEL_CAPACITY_IN_AMPS}A. The panel blows white and drops every breaker it has.`);
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
    monitorBody.userData.interact.label = 'View camera feeds';
    metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.ROUTED];
    mainSwitch.rotation.z = BREAKER_ON_TILT_IN_RADIANS;
    mainSwitch.material.emissive.setHex(BREAKER_COLOR_ON);
    mainSwitch.userData.interact.label = 'Main switch (in)';
    syncFeedRoomPower();

    showCaption('The panel takes the load. Light comes back the length of the room, and bolts move in the far wall.');
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
    if (powerStage === POWER_STAGE.ROUTED) {
      showCaption('Everything that needs feeding is fed. Leave it.');
      return;
    }
    if (powerStage !== POWER_STAGE.RUNNING) {
      showCaption('Dead switches. There is no current reaching this panel.');
      return;
    }
    // Locked out for as long as the trip glare lasts, so a player mashing the
    // key through the whiteout cannot queue up flicks they cannot see. It
    // still SAYS so -- swallowing the input silently reads as a broken switch.
    if (breakerTripTimeRemainingInSeconds > 0) {
      showCaption('The panel has not reset yet.');
      return;
    }

    breakerIsOn[circuitId] = !breakerIsOn[circuitId];
    updateBreakerSwitch(circuitId);

    const drawnInAmps = getTotalBreakerLoadInAmps();
    const remainingInAmps = PANEL_CAPACITY_IN_AMPS - drawnInAmps;
    showCaption(
      remainingInAmps < 0
        ? `${drawnInAmps}A set against a ${PANEL_CAPACITY_IN_AMPS}A panel. That will not hold.`
        : `${drawnInAmps}A set. ${remainingInAmps}A spare.`
    );
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
      showCaption('Already in. The panel is carrying everything it is going to.');
      return;
    }
    if (powerStage !== POWER_STAGE.RUNNING) {
      showCaption('The main will not move. Nothing is reaching this panel.');
      return;
    }
    if (breakerTripTimeRemainingInSeconds > 0) {
      showCaption('The panel has not reset yet.');
      return;
    }

    if (getTotalBreakerLoadInAmps() > PANEL_CAPACITY_IN_AMPS) {
      tripBreakerPanel();
      return;
    }

    const missing = getMissingRequiredLabels();
    if (missing.length > 0) {
      // Named, not withheld. The player can see which breakers are open; the
      // puzzle is the budget, not guessing which systems matter.
      showCaption(`The main goes in and nothing changes. ${missing.join(' and ')} still open.`);
      return;
    }
    routePower();
  }

  const breakerPanel = new THREE.Mesh(
    // Tall enough for the five breakers AND the main switch below them.
    new THREE.BoxGeometry(0.12, 0.86, 0.46),
    new THREE.MeshStandardMaterial({ color: 0x2b2e28, roughness: 0.65, metalness: 0.4 })
  );
  breakerPanel.position.set(-LAB_W / 2 + 0.12, 1.4, 1.7);
  breakerPanel.userData.interact = {
    label: 'Breaker panel',
    onInteract: () => showCaption(
      powerStage === POWER_STAGE.RUNNING
        ? `Five labelled breakers, all open. The panel is rated ${PANEL_CAPACITY_IN_AMPS}A.`
        : 'Five labelled breakers, all open. Nothing is reaching them.'
    )
  };
  interactables.push(breakerPanel);
  lab.add(breakerPanel);

  // A column of five switches down the panel's face. Individually interactable,
  // same non-recursive-raycast reason as the generator controls above.
  const BREAKER_FACE_X = breakerPanel.position.x + 0.07;
  const BREAKER_SPACING_IN_METRES = 0.115;
  const breakerColumnTopY =
    breakerPanel.position.y + ((BREAKER_CIRCUITS.length - 1) / 2) * BREAKER_SPACING_IN_METRES;

  BREAKER_CIRCUITS.forEach((circuit, i) => {
    const toggle = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.055, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0x8d8578,
        emissive: BREAKER_COLOR_OFF,
        roughness: 0.5,
        metalness: 0.3
      })
    );
    toggle.position.set(
      BREAKER_FACE_X,
      breakerColumnTopY - i * BREAKER_SPACING_IN_METRES,
      breakerPanel.position.z
    );
    toggle.userData.interact = {
      label: `${circuit.label} (${circuit.loadInAmps}A) -- OFF`,
      onInteract: () => flickBreaker(circuit.id)
    };
    interactables.push(toggle);
    lab.add(toggle);
    breakerMeshes[circuit.id] = toggle;
    updateBreakerSwitch(circuit.id);
  });

  /**
   * The main switch, mounted below the breaker column and deliberately bigger
   * than the five above it, so it reads as the thing you do LAST rather than
   * a sixth circuit.
   */
  const mainSwitch = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.09, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xa8452f, emissive: 0x000000, roughness: 0.45, metalness: 0.3 })
  );
  mainSwitch.position.set(
    BREAKER_FACE_X,
    breakerColumnTopY - BREAKER_CIRCUITS.length * BREAKER_SPACING_IN_METRES - 0.03,
    breakerPanel.position.z
  );
  mainSwitch.rotation.z = BREAKER_OFF_TILT_IN_RADIANS;
  mainSwitch.userData.interact = {
    label: 'Throw the main switch',
    onInteract: () => throwMainSwitch()
  };
  interactables.push(mainSwitch);
  lab.add(mainSwitch);

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
  loadChart.position.set(-LAB_W / 2 + 0.06, 1.42, 2.25);
  loadChart.rotation.y = Math.PI / 2;
  loadChart.userData.interact = {
    label: 'Read the load chart',
    onInteract: () => showCaption(
      `"MAX ${PANEL_CAPACITY_IN_AMPS}A TOTAL. ` +
      `${BREAKER_CIRCUITS.map((c) => `${c.label} ${c.loadInAmps}A`).join('. ')}. DO NOT EXCEED."`
    )
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

  // storage shelves
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.8, metalness: 0.4 });
  for (let s = 0; s < 2; s++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.5), shelfMat);
    shelf.position.set(LAB_W / 2 - 0.9, 1.1, -2 + s * 2.4);
    lab.add(shelf);
    colliders.push({
      minX: shelf.position.x - 0.8, maxX: shelf.position.x + 0.8,
      minZ: LAB_Z + shelf.position.z - 0.25, maxZ: LAB_Z + shelf.position.z + 0.25
    });
  }

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

  const monitorBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.42, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xcbc4ac, roughness: 0.6 })
  );
  monitorBody.position.set(0, 1.0, -0.05);
  desk.add(monitorBody);

  /**
   * The five feeds. Drawn onto canvases rather than rendered, because three of
   * the five cameras the storyline names look at rooms this game does not have
   * -- see world/CctvFeeds.js for the full argument.
   */
  const feeds = createCctvFeeds();
  const screenMaterial = createStaticScreenMaterial({
    noiseStrength: 1.0,
    feed: feeds.textures.kitchen
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), screenMaterial);
  screen.position.set(0, 1.0, 0.17);
  desk.add(screen);
  dynamics.push({
    update: (dt, elapsed) => {
      screenMaterial.uniforms.uTime.value = elapsed;
      // Only redraw a feed once there is power. Before that the screen is pure
      // static and the canvases would be painting for nobody.
      if (isCctvPowered()) feeds.update(dt);
    }
  });

  const screenGlow = new THREE.PointLight(0x8fd0ff, 0.5, 1.5, 2);
  screenGlow.position.set(0, 1.0, 0.3);
  desk.add(screenGlow);

  monitorBody.userData.interact = {
    // Reads "no power" until there is power, rather than inviting the player to
    // view feeds that cannot exist yet.
    label: 'Examine the monitor',
    onInteract: () => {
      if (!isCctvPowered()) {
        // Two different kinds of dead screen, and the player has earned the
        // difference: before the fuse it never worked, after the blackout it
        // was working a moment ago and something took it away.
        showCaption(
          powerStage === POWER_STAGE.DEAD
            ? 'Five camera feeds, and every one of them is static. No power.'
            : 'The screen is dark. It was showing you the house a minute ago.'
        );
        return;
      }
      // Said "No power" even after the breaker was flipped, which told the
      // player their one objective had not worked.
      showCaption('Five feeds, live now. The kitchen. A hallway. The porch. A study. And this room.');
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
          showCaption('The remote is dead. Nothing on this desk has power.');
          return;
        }
        feeds.setActive(id);
        screenMaterial.uniforms.uFeed.value = feeds.textures[id];
        feedButtons.forEach(({ mesh, feedId }) => {
          mesh.material.emissive.setHex(feedId === id ? 0x2e6b3a : 0x000000);
        });
        onViewFeed(id);
      }
    };
    desk.add(btn);
    // Individually, not as a group. See the note above.
    interactables.push(btn);
    feedButtons.push({ mesh: btn, feedId: id, material: lit });
  });

  const noteTex = createStickyNoteTexture("Restore power and pray it doesn't hear you.");
  /**
   * The sticky note, ON THE MONITOR'S BEZEL -- the storyline puts it "stuck on
   * the corner" of the screen, and that is where it now is.
   *
   * It used to float at x = -0.35, which is 0.10 m clear of the monitor casing
   * altogether: a note stuck to nothing, hanging in the air beside the screen.
   *
   * Sized to the bezel rather than placed on top of it. The casing is 0.5 wide
   * and the picture 0.36, so each side bezel is a 0.07 m strip; a 0.06 m note
   * centred at x = 0.215 sits inside that strip with the screen's edge at 0.18
   * left clear. Any bigger and it would either cover the picture -- which is
   * the one thing in this room the player has to be able to read -- or hang
   * off the side of the casing again.
   */
  const STICKY_SIZE = 0.06;
  const sticky = new THREE.Mesh(
    new THREE.PlaneGeometry(STICKY_SIZE, STICKY_SIZE),
    new THREE.MeshStandardMaterial({ map: noteTex })
  );
  sticky.position.set(0.215, 1.06, 0.172);
  sticky.rotation.z = 0.09;
  sticky.userData.interact = {
    label: 'Read sticky note',
    onInteract: () => showCaption("Restore power and pray it doesn't hear you.")
  };
  interactables.push(sticky);
  desk.add(sticky);

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
  const metalDoor = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_WIDTH_IN_METRES, DOOR_HEIGHT_IN_METRES, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x3a3d3f, metalness: 0.7, roughness: 0.4 })
  );
  metalDoor.position.set(0, DOOR_HEIGHT_IN_METRES / 2, LAB_D / 2 - 0.05);

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
        showCaption('Heavy bolts, seated deep in the frame. Nothing is feeding them.');
        return;
      }

      if (securityCleared) {
        showCaption('The door unlocks with a heavy clunk. You head deeper into the house.');
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
          showCaption('The lockout releases. Bolts run back into the frame.');
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
      showCaption('"SECURITY LOCKOUT. I will forget this. The study door will not. In what it wears, top row down, lies your way out."');
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

    screenMaterial.uniforms.uNoiseStrength.value = 1.0;
    screenMaterial.uniforms.uStaticMix.value = 1;
    feedButtons.forEach(({ mesh }) => mesh.material.emissive.setHex(0x000000));
    monitorBody.userData.interact.label = 'Examine the monitor';
    // The screen is pure static now so nothing is on show, but the feeds must
    // still be told the basement went dark -- leaving them believing this room
    // is lit means the first frame after power returns paints a stale image.
    syncFeedRoomPower();

    metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.BLACKOUT];
    // Terse and sensory on purpose. The BEATS.blackout script that onBlackout
    // fires is what tells the player it was a hand on a lever, not a fault --
    // they feel it here and understand it a second later.
    showCaption('The room goes out. All of it, in one snap.');
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
  blackPool.position.set(-LAB_W / 2 + 1.5, 0.014, -LAB_D / 2 + 1.2);
  blackPool.scale.set(0.85, 1.15, 1);
  blackPool.visible = false;
  blackPool.userData.interact = {
    label: 'Examine the pool',
    onInteract: () => showCaption('Whatever it is, it is not water, and it is still wet.')
  };
  lab.add(blackPool);

  // broken restraints / chair dressing near the middle of the lab
  const restraint = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.02, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x6b6b6b, metalness: 0.7, roughness: 0.5 })
  );
  // On the floor. It used to hang at y = 0.9 with nothing under it: that
  // height matches the workbench top, but x = -0.5 is west of the bench, which
  // starts at -0.3. Laid flat where a broken restraint would actually end up,
  // and turned within the floor plane so it does not read as placed.
  restraint.position.set(-0.7, 0.02, 0.35);
  restraint.rotation.x = Math.PI / 2;
  restraint.rotation.y = 0.4;
  lab.add(restraint);

  function frameWoodMat() {
    return new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.85 });
  }

  // ---------- central detail ----------
  // The lab is an 8x6.5m room with most of its dressing pushed against
  // the side walls (generator/fuse box on one side, shelves on the
  // other) -- a player walking straight in from the hallway down the
  // centre saw nothing but bare floor and ceiling. A workbench and crates
  // along that direct sightline fill the middle of the room instead of
  // leaving it as dead space between the two side walls.
  const workbench = new THREE.Group();
  workbench.position.set(0.4, 0, -0.3);
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
  sketch.position.set(-1.35, 0.013, 0.85);
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
    new THREE.MeshStandardMaterial({ map: tornNoteTex, roughness: 1 })
  );
  tornNotes.rotation.x = -Math.PI / 2;
  tornNotes.rotation.z = 0.15;
  tornNotes.position.set(-0.2, 0.845, 0.15); // local to the workbench, which is its parent
  tornNotes.userData.interact = {
    label: 'Read the torn notes',
    onInteract: () => showCaption('"SUBJECT UNSTABLE. CONTAINMENT REQUIRED. MEMORY DETERIORATION OBSERVED. VISUAL DISTORTION INCREASING."')
  };
  interactables.push(tornNotes);
  workbench.add(tornNotes);

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
      get powerStage() { return powerStage; }
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
      updateGeneratorControlLights();
      breakerTripTimeRemainingInSeconds = 0;
      resetAllBreakers();
      mainSwitch.rotation.z = BREAKER_OFF_TILT_IN_RADIANS;
      mainSwitch.material.emissive.setHex(BREAKER_COLOR_OFF);
      mainSwitch.userData.interact.label = 'Throw the main switch';
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
      feedButtons.forEach(({ mesh }) => mesh.material.emissive.setHex(0x000000));
      monitorBody.userData.interact.label = 'Examine the monitor';

      fuseBox.userData.interact.label = 'Empty fuse slot';
      metalDoor.userData.interact.label = DOOR_LABELS[POWER_STAGE.DEAD];

      fuseData.forEach((data, i) => {
        const fuse = fuseMeshes[data.amps];
        fuse.position.set(...fusePositions[i]);
        fuse.rotation.set(0, 0, 0);
        fuse.rotation.z = Math.PI / 2;
        fuse.visible = true;
        fuse.userData.interact = {
          label: `Pick up fuse (${data.amps})`,
          onInteract: () => {
            if (puzzleState.heldFuse) {
              showCaption("You're already holding a fuse. Install or remove it at the fuse box first.");
              return;
            }
            puzzleState.heldFuse = data.amps;
            showCaption(`You take the ${data.amps} fuse.`);
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