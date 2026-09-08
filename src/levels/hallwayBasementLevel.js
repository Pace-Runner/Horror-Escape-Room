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
 * Level 2: the hallway the creature is glimpsed in, leading down into the
 * industrial basement lab. The camera-feed minigame from the storyline
 * isn't built, but there's a real objective: find the correct fuse
 * (30A) among several decoys, install it in the fuse box to restore
 * power, which unlocks the locked door at the far end of the lab and
 * lets the player continue on to the study.
 *
 * Hierarchy notes:
 *  - the CCTV monitor mesh and its screen-glow point light are children
 *    of the desk group, since the monitor sits on the desk and should
 *    move with it as one prop.
 *  - the fluorescent tube meshes are children of a `fixturesGroup` so the
 *    whole strip can be repositioned or its material swapped in one place.
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

  // exposed pipes along the back wall
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a5f5a, metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, LAB_W - 1, 10), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 2.2 - i * 0.25, LAB_D / 2 - 0.2);
    lab.add(pipe);
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
  let powerRestored = false;
  let sparkTimer = 0;

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
  const DESK_TOP_Y = 0.78;         // desk y=0 + deskTop y=0.75 + half of its 0.06 thickness
  const LAB_FLOOR_Y = 0;
  const FLOOR_CRATE_TOP_Y = 0.5;   // the un-stacked crate at (1.5, 1.5) is a 0.5m cube on the floor

  // Where each fuse lies, index-matched to `fuseData`. Coordinates are
  // local to the `lab` group, which is what the fuse meshes are added to.
  const fuseRestingSpots = [
    { x: 0.9, z: -0.55, surfaceY: WORKBENCH_TOP_Y },   // workbench top, clear of the four tool props
    { x: 1.3, z: -0.3, surfaceY: LAB_FLOOR_Y },        // floor, just outside the workbench's collider
    { x: 2.0, z: 2.0, surfaceY: DESK_TOP_Y },          // desk top, clear of the monitor and sticky note
    { x: 1.38, z: 1.38, surfaceY: FLOOR_CRATE_TOP_Y }  // flat top face of the floor-level crate
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
      if (powerRestored) {
        showCaption('The fuse box is live. Power is already restored.');
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

      if (installed === '30A') {
        powerRestored = true;
        puzzleState.slotFuse = '30A';
        showCaption('The fuse clicks in. Power surges through the lab -- something unlocks at the far end.');
        fuseBox.userData.interact.label = 'Power restored';
        metalDoor.userData.interact.label = 'Open the door';
        // The screen stops being pure static. The picture fights its way
        // through the interference rather than appearing; uStaticMix is what
        // the shader crossfades on. The lab's own lights are NOT set here --
        // updateLabLighting ramps them off powerRestored, so they come up over
        // POWER_RAMP_IN_SECONDS instead of snapping on.
        screenMaterial.uniforms.uNoiseStrength.value = 0.35;
        screenMaterial.uniforms.uStaticMix.value = 0.18;
        monitorBody.userData.interact.label = 'View camera feeds';
        feedButtons[0].mesh.material.emissive.setHex(0x2e6b3a);
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
    'RATING: 30A ONLY',
    'DO NOT SUBSTITUTE'
  ]);
  const maintenanceNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.38),
    new THREE.MeshStandardMaterial({ map: maintenanceNoteTex, roughness: 1 })
  );
  maintenanceNote.position.set(-LAB_W / 2 + 0.7, 1.4, -1.2);
  maintenanceNote.userData.interact = {
    label: 'Read maintenance log',
    onInteract: () => showCaption('"REPLACE BLOWN FUSE. RATING: 30A ONLY. DO NOT SUBSTITUTE."')
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
  hazardSign.position.set(-LAB_W / 2 + 0.71, 1.35, -1.86);
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
  desk.position.set(1.6, 0, LAB_D / 2 - 0.55);
  desk.rotation.y = Math.PI;
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
      if (powerRestored) feeds.update(dt);
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
      if (!powerRestored) {
        showCaption('Five camera feeds, and every one of them is static. No power.');
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
        if (!powerRestored) {
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
    new THREE.BoxGeometry(1.1, 2.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x3a3d3f, metalness: 0.7, roughness: 0.4 })
  );
  metalDoor.position.set(0, 1.05, LAB_D / 2 - 0.05);
  metalDoor.userData.interact = {
    label: 'Locked. Restore power first.',
    onInteract: () => {
      if (!powerRestored) {
        showCaption('Heavy bolts. Locked tight until the power comes back on.');
        return;
      }
      showCaption('The door unlocks with a heavy clunk. You head deeper into the house.');
      onExit();
    }
  };
  interactables.push(metalDoor);
  lab.add(metalDoor);

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
  restraint.position.set(-0.5, 0.9, 0);
  restraint.rotation.x = Math.PI / 2.3;
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
  [[0.9, 1.5, 0], [1.15, 1.7, 0.4], [-1.6, 2.2, 0]].forEach(([x, z, stackY], i) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), crateMat);
    crate.position.set(x, 0.25 + stackY, z);
    crate.rotation.y = i * 0.6;
    lab.add(crate);
    if (stackY === 0) {
      colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: LAB_Z + z - 0.3, maxZ: LAB_Z + z + 0.3 });
    }
  });

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
    overloadGlare = easeToward(
      overloadGlare,
      puzzleState.overloaded ? 1 : 0,
      deltaTimeInSeconds / OVERLOAD_GLARE_RAMP_IN_SECONDS
    );
    powerLevel = easeToward(
      powerLevel,
      powerRestored ? 1 : 0,
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
      /** Read by tests and by main.js; the level owns the flag itself. */
      get powerRestored() { return powerRestored; }
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
      powerRestored = false;
      puzzleState.heldFuse = null;
      puzzleState.slotFuse = null;
      puzzleState.overloaded = false;
      sparkTimer = 0;
      sparkLight.intensity = 0;
      droppedFuseCount = 0;
      overloadGlare = 0;
      powerLevel = 0;
      onGlare(0);

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
      metalDoor.userData.interact.label = 'Locked. Restore power first.';

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
    update(dt) {
      const elapsed = (this._t = (this._t ?? 0) + dt);
      dynamics.forEach((d) => d.update(dt, elapsed));

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