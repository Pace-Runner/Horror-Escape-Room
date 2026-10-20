import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  createScratchedMessageTexture,
  createScratchedMessageNormalTexture,
  createPolaroidTexture,
  createFurnitureWoodTexture,
  createFurnitureWoodNormalTexture,
  createCobwebTexture
} from '../world/textures.js';
import { addBaseboard } from '../world/trim.js';
import { createRainGlassMaterial } from '../world/RainGlassMaterial.js';
import { loadModel, applyTextureByMaterialName } from '../world/modelLoader.js';
import { line, linePicker } from '../dialogue/index.js';
import { cueInfo } from '../world/audio/assets.js';
import bedModelUrl from '../assets/models/bed.glb?url';
import bedsideTableModelUrl from '../assets/models/bedside_table.glb?url';
import bedsidePuzzleTableModelUrl from '../assets/models/bedside_puzzle_table.glb?url';
import bedsideLampModelUrl from '../assets/models/bedside_lamp.glb?url';
import bedsideAlarmClockModelUrl from '../assets/models/bedside_alarm_clock.glb?url';
import bedsideWornNotebookModelUrl from '../assets/models/bedside_worn_notebook.glb?url';
import bedsideCombinationLockModelUrl from '../assets/models/bedside_combination_lock.glb?url';
import projectHollowDrawerNoteModelUrl from '../assets/models/project_hollow_drawer_note.glb?url';
import vanityBaseUrl from '../assets/models/vanity/vanity_base.glb?url';
import vanityMirrorUrl from '../assets/models/vanity/vanity_mirror.glb?url';
import vanityCandlestickUrl from '../assets/models/vanity/vanity_candlestick.glb?url';
import vanityPerfumeUrl from '../assets/models/vanity/vanity_perfume.glb?url';
import vanityTrayUrl from '../assets/models/vanity/vanity_tray.glb?url';
import vanityStoolUrl from '../assets/models/vanity/vanity_stool.glb?url';
import pinboardModelUrl from '../assets/models/pinboard.glb?url';
import victorianRugModelUrl from '../assets/models/rug/level1_victorian_rug.glb?url';
import doorModelUrl from '../assets/models/door.glb?url';
import flashlightModelUrl from '../assets/models/flashlight.glb?url';
import pendantLightModelUrl from '../assets/models/ceiling_pendant.glb?url';
import wallHollowModelUrl from '../assets/models/wall_hollow.glb?url';
import antiqueLockboxModelUrl from '../assets/models/antique_lockbox.glb?url';
import level1ChairRemodelUrl from '../assets/models/level1_chair_remodel.glb?url';
import level1WastebasketRemodelUrl from '../assets/models/level1_wastebasket_remodel.glb?url';
import level1CrumpledPaperBallUrl from '../assets/models/level1_crumpled_paper_ball.glb?url';
import level1RadiatorRemodelUrl from '../assets/models/level1_radiator_remodel.glb?url';
import level1WindowFrameRemodelUrl from '../assets/models/level1_window_frame_remodel.glb?url';
import looseFloorboardRemodelUrl from '../assets/models/level1_loose_floorboard_remodel.glb?url';
import doorPlankAlbedoUrl from '../assets/textures/door/door_plank_albedo.png?url';
import doorPlankRoughnessUrl from '../assets/textures/door/door_plank_roughness.png?url';
import doorPlankNormalUrl from '../assets/textures/door/door_wood_normal_1k.png?url';
import wallpaperBaseUrl from '../assets/textures/bedroom/distressed_victorian_damask_wallpaper.png?url';
import clawRipUrl from '../assets/textures/bedroom/ripped_victorian_wallpaper_claw_marks.png?url';
import bedroomFloorUrl from '../assets/textures/bedroom/weathered_dark_wooden_floorboards.png?url';
import bedroomCeilingUrl from '../assets/textures/bedroom/grimy_cracked_plaster_texture.png?url';
import hauntedMansionSepiaUrl from '../assets/textures/bedroom/haunted_victorian_mansion_sepia.png?url';
import photo1984Url from '../assets/textures/bedroom/level_1_1984_pic.png?url';
import photo1985Url from '../assets/textures/bedroom/level_1_1985_pic.png?url';
import photo1986Url from '../assets/textures/bedroom/level_1_1986_pic.png?url';
import photo1987Url from '../assets/textures/bedroom/level_1_1987_pic.png?url';

// One image per year, shared by pickups, board thumbnails, and the board UI.
const PUZZLE_PHOTO_URLS = {
  1984: photo1984Url,
  1985: photo1985Url,
  1986: photo1986Url,
  1987: photo1987Url
};
// Preserve photo centers/heights and hitboxes; only correct the printed aspect.
const PUZZLE_PHOTO_ASPECT_RATIO = 1122 / 1402;
const PUZZLE_PHOTO_HEIGHT_METRES = 0.17;
/**
 * The lid takes exactly as long as its recording (sfx/lockbox_open -- see
 * src/assets/audio/SOURCES.md), read from the MEASURED manifest and not from a
 * decode, so a missing audio file can never change how long the box takes. The
 * fallbacks are those same measured values, for a build without the manifest.
 */
const LOCKBOX_SOUND = cueInfo('lockbox_open');
const LOCKBOX_OPEN_DURATION_SECONDS = LOCKBOX_SOUND?.duration ?? 4.74;
/** Where in it the latch lets go (the last of its clicks) and the lid lands (the final knock). */
const LOCKBOX_LATCH_SECONDS = LOCKBOX_SOUND?.events?.latchEnd ?? 1.05;
const LOCKBOX_SETTLE_SECONDS = LOCKBOX_SOUND?.events?.settle ?? 4.28;
/** How far the lid lifts while the latch is still working: cracked, not open. */
const LOCKBOX_LATCH_LIFT = 0.04;
/** The crowbar comes out once the lid is this far open -- not out of a closed box. */
const LOCKBOX_REACH_AT = 0.7;
const LOCKBOX_OPEN_ANGLE_RADIANS = -THREE.MathUtils.degToRad(85);

/**
 * Lid travel, 0..1, `t` seconds into the open, timed to the recording's own
 * shape: the latch's clicks (to 1.05 s) only crack it, the long creak (1.05 to
 * 4.28 s) is the lid swinging, eased in and out, and the knock at 4.28 is it
 * landing on its stop. The old 1 - (1 - p)^3 was front-loaded -- stretched over
 * nearly five seconds the lid would leap most of the way open and then creep.
 */
function lockboxLidTravel(t) {
  if (t <= 0) return 0;
  if (t < LOCKBOX_LATCH_SECONDS) return LOCKBOX_LATCH_LIFT * (t / LOCKBOX_LATCH_SECONDS);
  if (t >= LOCKBOX_SETTLE_SECONDS) return 1;
  const p = (t - LOCKBOX_LATCH_SECONDS) / (LOCKBOX_SETTLE_SECONDS - LOCKBOX_LATCH_SECONDS);
  return LOCKBOX_LATCH_LIFT + (1 - LOCKBOX_LATCH_LIFT) * p * p * (3 - 2 * p);
}

// The GLB's authored detail faces local +Z, while the bedroom camera approaches
// the doorway from local -Z. Mirroring only depth presents the detailed face to
// the room without changing its height, width, hinge side, or knob side.
const DOOR_MODEL_DEPTH_SCALE = -1;
const DOOR_BOARD_FRONT_OFFSET_METRES = -0.20;

/**
 * How much larger than life the paperclip is drawn.
 *
 * A real Gem clip is about 33 x 8 mm, which from the ~1.3m the chained player
 * views it at is a couple of dozen pixels of 1.6mm wire -- findable only if you
 * already know it is there. Scaling the whole group keeps the proportions and
 * takes the hitbox with it.
 *
 * This yields a 6.0cm-long pickup: delicate enough to feel real, with just
 * enough presence to catch a flashlight edge near a duvet fold.
 */
const PAPERCLIP_SCALE = 1.75;

// An even number of mirrored spans closes the pattern at the room's final
// corner. Each image covers the full wall height, eliminating square tile rows.
const WALL_TEXTURE_PERIMETER_SPANS = 10;
const CLAW_DAMAGE_WIDTH_METRES = 2.00;
const CLAW_DAMAGE_HEIGHT_METRES = 2.00;
const CLAW_DAMAGE_DOOR_OFFSET_X_METRES = 1.52;
const CLAW_DAMAGE_HEIGHT_ABOVE_FLOOR_METRES = 1.80;
const CLAW_DAMAGE_VISIBLE_WIDTH_METRES = 1.70;
const CLAW_DAMAGE_VISIBLE_HEIGHT_METRES = 1.90;
const CLAW_DAMAGE_DECAL_OPACITY = 0.95;
const CLAW_DAMAGE_TINT = 0xb9afa3;
const BEDROOM_FLOOR_TEXTURE_REPEAT_X = 1.8;
const BEDROOM_FLOOR_TEXTURE_REPEAT_Y = 2.0;

/**
 * Loads a bedroom texture with the same repeat setup used by every wall face.
 * Repetition is driven by geometry UVs, not per-wall texture transforms, so
 * window and pinboard cut-out slabs cannot drift from the room's base pattern.
 */
function loadBedroomWallTexture(url, shouldRepeat) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = shouldRepeat ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Loads the supplied bedroom floorboard image with a world-scale repeat.
 * The image's boards run along the plane's X axis, giving the room continuous
 * long boards instead of stretched pixels or dense square tiling.
 */
function loadBedroomFloorTexture(url) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(BEDROOM_FLOOR_TEXTURE_REPEAT_X, BEDROOM_FLOOR_TEXTURE_REPEAT_Y);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Loads one continuous cracked-plaster image across the bedroom ceiling.
 * Clamp wrapping removes the repeated square/seam pattern from the broad
 * ceiling surface while preserving the texture's subtle aged detail.
 */
function loadBedroomCeilingTexture(url) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Creates one skirting material from the bedroom floorboard image.
 * Each run gets its own UV repeat so the grain follows that run's length
 * instead of compressing the square floor texture into a narrow wall trim.
 */
function createBedroomSkirtingMaterial(floorTexture, skirtingLengthMetres) {
  const skirtingTexture = floorTexture.clone();
  skirtingTexture.repeat.set(Math.max(1, skirtingLengthMetres / 4), 0.12);
  // Use the mid-board strip of the same floor image: this keeps the skirting
  // visibly wood-toned rather than sampling the texture's near-black seam.
  skirtingTexture.offset.y = 0.37;
  skirtingTexture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: skirtingTexture,
    color: 0xc79b76,
    emissive: 0x120805,
    emissiveIntensity: 0.22,
    roughness: 0.72
  });
}

/**
 * Wire gauge, in metres, before PAPERCLIP_SCALE multiplies it.
 *
 * Real paperclip wire is about 0.8mm. Kept a little over that because at this
 * viewing distance a true-gauge wire is sub-pixel in places and breaks up into
 * dashes. Lower it for a finer, more delicate clip; raise it if it starts
 * disappearing against the blanket.
 */
const PAPERCLIP_WIRE_RADIUS = 0.0009;

// Pillow_Left and Pillow_Right leave a measured 5.1 cm centre gap. The wire
// rests in that gap at their lower edges; a 1.4 cm drift toward Pillow_Left
// tucks roughly one fifth beneath its soft edge without burying the pickup.
const PAPERCLIP_RESTING_HEIGHT_METRES = 0.783;
const PAPERCLIP_POSITION_X_OFFSET_METRES = -0.014;
const PAPERCLIP_POSITION_Z_OFFSET_METRES = -0.43;

const ROOM_W = 7.4;
const ROOM_D = 6.0;
const ROOM_H = 2.9;

// Keep the room's major gameplay landmarks together. The original bedroom
// grew organically around its props, leaving the board, door and furniture
// competing for the same few walkable metres. These anchors reserve a clear
// centre route without changing what any interaction does.
const WINDOW_POSITION_X = -2.35;
const PIN_RECESS_POSITION_Z = -1.35;
const PINBOARD_SCALE = 1.9;
const BED_POSITION_X = 1.65;
const BED_POSITION_Z = -1.9;
// The wake-up position is deliberately on the mattress. Once the cuff is
// released, main.js moves the player to this clear point at the foot of the
// bed before enabling movement, allowing the bed to keep one solid footprint.
const BED_EXIT_POSITION_Z = BED_POSITION_Z + 1.42;
const BEDSIDE_TABLE_POSITION_X = 3.3;
const BEDSIDE_TABLE_POSITION_Z = -1.72;
const BEDSIDE_TABLE_FOOTPRINT_METRES = 0.42;
const SEARCH_NIGHTSTAND_POSITION_X = 0.60;
const SEARCH_NIGHTSTAND_POSITION_Z = -2.2;
const VANITY_SCALE = 1.18;
const DRESSER_POSITION_X = ROOM_W / 2 - 0.275 * VANITY_SCALE;
const DRESSER_POSITION_Z = 1.35;
const VANITY_STOOL_SCALE = 1.03;
const VANITY_STOOL_POSITION_X = 2.80;
const DOOR_POSITION_X = 1.2;
const DOOR_SKIRTING_OPENING_WIDTH_METRES = 1.40;
const BED_SKIRTING_OPENING_WIDTH_METRES = 1.60;
const CHAIR_POSITION_X = -3.15;
const CHAIR_POSITION_Z = 2.2;
const BIN_POSITION_X = -1.6;
const BIN_POSITION_Z = -2.25;

/**
 * Builds Level 1: the bedroom the player wakes up in.
 *
 * Hierarchy notes (see docs/WORLD_DESIGN.md for the full write-up):
 *  - the ceiling light fixture and its cord are children of a ceiling
 *    anchor Object3D, because in the real fixture the bulb hangs FROM
 *    the cord which is fixed to the ceiling -- moving the anchor should
 *    move both together.
 *  - the restraint visuals are children of the bed group, so their fixed
 *    headboard-rail anchor remains aligned with the imported bed frame.
 *  - the two boarded planks and the polaroid are children of the door
 *    FRAME group (not the door slab) because the story places them
 *    nailed/stuck to the frame -- they must stay put even if the door
 *    slab itself were ever animated open.
 *  - drawer meshes are children of the dresser body, offset in local
 *    space, so the "left half-open" pose is defined once, relative to
 *    the dresser, rather than as loose world-space furniture.
 */
export function createBedroomLevel({
  showCaption = () => {},
  onFreed = () => {},
  // Fired the instant the paperclip goes into the lock, not when onFreed
  // fires 900ms later -- main.js uses the gap between the two to time a hand
  // animation against exactly how long the story already says picking the
  // lock takes.
  onPaperclipUsed = () => {},
  // The paperclip is picked up FIRST, into the inventory, and only then used on
  // the cuff -- see cuffLockHitbox below.
  onPaperclipPicked = () => {},
  /**
   * Is this item in the player's hand right now? Every item puzzle here asks,
   * not just whether the item was ever found: the crowbar has to be the thing
   * you are holding to pry with it. main.js owns the hand (core/HeldItems.js);
   * the level only asks. Defaults to "yes" so a caller that does not wire it
   * gets the old found-is-enough behaviour rather than a level that can never
   * be finished.
   */
  isHolding = () => true,
  onFlashlightPicked = () => {},
  onBrassKeyFound = () => {},
  onBrassKeyUsed = () => {},
  onCrowbarFound = () => {},
  onCrowbarUsed = () => {},
  onBedroomKeyFound = () => {},
  onBedroomKeyUsed = () => {},
  onReadDrawerClue = () => {},
  onReadSafeTag = () => {},
  onPhotoCollected = () => {},
  onPhotoPuzzleSolved = () => {},
  onDrawerUnlocked = () => {},
  onSafeOpened = () => {},
  onFloorboardOpened = () => {},
  onDoorPlankRemoved = () => {},
  onDoorOpened = () => {},
  // The instant the door starts to swing, with its world position -- for the
  // creak. onDoorOpened is 600 ms later, when the swing hands over to the fade.
  onDoorOpening = () => {},
  // The instant the lockbox lid starts to move, with the box's world position.
  onLockboxOpening = () => {},
  onExaminePhotos = () => {},
  onExaminePinpad = () => {},
  // The scratched floor message is a STORY beat, not just a caption: reading it
  // is what brings the thing past the door. The level reports the read and
  // main.js decides what happens, the same split every other callback here uses.
  onReadMessage = () => {},
  onExaminePolaroid = () => {},
  // A sound effect by name (AudioDirector's SFX) -- the level has no audio of
  // its own, so it says what made a noise and main.js plays it.
  onSfx = () => {}
} = {}) {
  const group = new THREE.Group();
  group.name = 'Level1_Bedroom';
  const interactables = [];
  const colliders = [];

  // Puzzle state tracking for bedroom mechanics
  const puzzleState = {
    chainsEscaped: false,
    hasFlashlight: false,
    foundPhotos: new Set(),
    photosArranged: false,
    hasBrassKey: false,
    hasCrowbar: false,
    floorboardPried: false,
    hasBedroomKey: false,
    planksRemoved: false,
    doorUnlocked: false, // true once the door has actually been swung open
    // Story beats, tracked so each fires once. Examining a prop a second time
    // should give you the description again, not replay the scene.
    messageRead: false,
    polaroidRead: false
  };

  // Bedroom-specific photographic wallpaper replaces the generic procedural
  // pattern. Every wall face and cut-out slab shares this exact texture family.
  const floorTex = loadBedroomFloorTexture(bedroomFloorUrl);
  const ceilingTex = loadBedroomCeilingTexture(bedroomCeilingUrl);
  const wallTex = loadBedroomWallTexture(wallpaperBaseUrl, true);
  const clawRipTex = loadBedroomWallTexture(clawRipUrl, false);
  // Fit the supplied alpha inside the existing examination plane so the torn
  // pixels stay clear of the door and corner without moving its interaction.
  clawRipTex.repeat.set(
    CLAW_DAMAGE_WIDTH_METRES / CLAW_DAMAGE_VISIBLE_WIDTH_METRES,
    CLAW_DAMAGE_HEIGHT_METRES / CLAW_DAMAGE_VISIBLE_HEIGHT_METRES
  );
  clawRipTex.offset.set((1 - clawRipTex.repeat.x) / 2, (1 - clawRipTex.repeat.y) / 2);

  // Shared wood-grain texture for the Blender-authored furniture (bed
  // frame, dresser, door) -- those .glb exports only ever carried a flat
  // PBR colour (bmesh.ops geometry has no UV data by default, so there
  // was nothing to map a texture onto until the Blender scripts started
  // baking box-projected UVs). Applied post-load by material name below.
  const furnitureWoodTex = createFurnitureWoodTexture({ tint: [60, 44, 30] });
  const furnitureWoodNormal = createFurnitureWoodNormalTexture();

  // ---------- structure ----------
  const structure = new THREE.Group();
  structure.name = 'Structure';
  group.add(structure);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  structure.add(floor);

  /** Dark, cracked plaster gives flashlight and lightning a subtle ceiling response. */
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({
      map: ceilingTex,
      color: 0x7a6b58,
      roughness: 0.96
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  // The nearby hanging fixture's point-light shadow map produced a hard
  // triangular block across this single ceiling plane. Keep normal lighting
  // and the plaster texture, but disable only that broken shadow receiver.
  ceiling.receiveShadow = false;
  structure.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({
    name: 'Level1_DistressedVictorianWallpaper',
    map: wallTex,
    roughness: 0.92
  });

  /**
   * WALLS CAST AND RECEIVE NOW, and they did neither.
   *
   * `grep receiveShadow` over this file used to find the floor and a handful of
   * props -- no wall, ever. In three.js a surface absent from that list is not
   * lit by any shadow calculation at all, so every shadow in this room fell on
   * the floorboards and stopped. The torch could not throw the bed up the wall;
   * the bulb could not put the door frame across the plaster; and the lightning
   * (below) could not have cast the window even if it had been asked to,
   * because there was nothing to catch it and nothing to block it.
   *
   * castShadow matters just as much: a mesh missing from the shadow map does
   * not OCCLUDE, so light passed straight through these walls as though they
   * were glass.
   */
  /**
   * Unwraps the room perimeter as one continuous strip, with floor-to-ceiling
   * V coordinates shared by every slab. Window/pinboard pieces sample their
   * actual room positions rather than restarting the image at each edge.
   */
  function alignBedroomWallUVs(mesh, side) {
    const perimeterMetres = 2 * (ROOM_W + ROOM_D);
    const spanWidthMetres = perimeterMetres / WALL_TEXTURE_PERIMETER_SPANS;
    const coordinates = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const point = new THREE.Vector3();
    mesh.updateMatrix();
    for (let i = 0; i < uv.count; i++) {
      point.fromBufferAttribute(coordinates, i).applyMatrix4(mesh.matrix);
      let perimeterDistanceMetres;
      if (side === 'back') perimeterDistanceMetres = point.x + ROOM_W / 2;
      else if (side === 'right') perimeterDistanceMetres = ROOM_W + point.z + ROOM_D / 2;
      else if (side === 'front') perimeterDistanceMetres = ROOM_W + ROOM_D + ROOM_W / 2 - point.x;
      else perimeterDistanceMetres = 2 * ROOM_W + ROOM_D + ROOM_D / 2 - point.z;
      uv.setXY(i, perimeterDistanceMetres / spanWidthMetres, point.y / ROOM_H);
    }
    uv.needsUpdate = true;
  }

  function addWall(w, h, x, y, z, ry, side) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.y = ry;
    alignBedroomWallUVs(wall, side);
    wall.castShadow = true;
    wall.receiveShadow = true;
    structure.add(wall);
    return wall;
  }

  // Back wall has an actual rectangular cut-out behind the window (built
  // from four slabs framing the gap) rather than a solid plane with a
  // window decal glued on top -- otherwise the wall would sit in front of
  // the rain outside and depth-test it away, so the window would never
  // show anything through the glass.
  function addWallWithGap(w, h, z, gapX, gapY, gapW, gapH) {
    const depth = 0.12;
    const gapX0 = gapX - gapW / 2;
    const gapX1 = gapX + gapW / 2;
    const gapY0 = gapY - gapH / 2;
    const gapY1 = gapY + gapH / 2;
    const wallZ = z + depth / 2;

    const slab = (sw, sh, sx, sy) => {
      // Same treatment for the four slabs framing the window. Their front faces
      // are the ones that meet the plain walls, and they were the worst
      // offenders -- the strip above the window is 1.3 m wide by 0.75 m tall and
      // was showing a whole damask repeat squeezed into it.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, depth), wallMat);
      mesh.position.set(sx, sy, wallZ);
      alignBedroomWallUVs(mesh, 'back');
      // The four slabs around the window are what actually CUT the window
      // shape out of the lightning. Without castShadow the flash pours through
      // the wall as if it were not there, and the aperture means nothing.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      structure.add(mesh);
    };

    slab(gapX0 - (-w / 2), h, (-w / 2 + gapX0) / 2, h / 2); // left of gap
    slab(w / 2 - gapX1, h, (w / 2 + gapX1) / 2, h / 2); // right of gap
    slab(gapW, gapY0, gapX, gapY0 / 2); // below gap
    slab(gapW, h - gapY1, gapX, (gapY1 + h) / 2); // above gap
  }

  /**
   * Leaves the existing door's visual opening empty and places one unlit,
   * near-black backing plane beyond it. The door itself remains the only
   * animated/puzzle object; these are static wall segments and a background.
   */
  function addFrontWallDoorway() {
    const doorwayWidthMetres = 1.0;
    const doorwayHeightMetres = 2.0;
    const doorwayLeftMetres = DOOR_POSITION_X - doorwayWidthMetres / 2;
    const doorwayRightMetres = DOOR_POSITION_X + doorwayWidthMetres / 2;
    const createWallSlab = (widthMetres, heightMetres, xMetres, yMetres) => {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(widthMetres, heightMetres), wallMat);
      slab.position.set(xMetres, yMetres, ROOM_D / 2);
      slab.rotation.y = Math.PI;
      alignBedroomWallUVs(slab, 'front');
      slab.castShadow = true;
      slab.receiveShadow = true;
      structure.add(slab);
    };
    createWallSlab(doorwayLeftMetres - (-ROOM_W / 2), ROOM_H,
      (-ROOM_W / 2 + doorwayLeftMetres) / 2, ROOM_H / 2);
    createWallSlab(ROOM_W / 2 - doorwayRightMetres, ROOM_H,
      (ROOM_W / 2 + doorwayRightMetres) / 2, ROOM_H / 2);
    createWallSlab(doorwayWidthMetres, ROOM_H - doorwayHeightMetres,
      DOOR_POSITION_X, doorwayHeightMetres + (ROOM_H - doorwayHeightMetres) / 2);

    const hallwayVoid = new THREE.Mesh(
      new THREE.PlaneGeometry(doorwayWidthMetres, doorwayHeightMetres),
      new THREE.MeshBasicMaterial({ color: 0x020202, fog: false })
    );
    hallwayVoid.name = 'Level1BedroomDoorwayVoid';
    hallwayVoid.position.set(DOOR_POSITION_X, doorwayHeightMetres / 2, ROOM_D / 2 + 0.26);
    hallwayVoid.rotation.y = Math.PI;
    structure.add(hallwayVoid);
    doorwayVoid = hallwayVoid;
  }
  /** The black card in the doorway, hidden while the real hallway stands behind it. */
  let doorwayVoid = null;
  /** Open: the doorway can be walked through and seen through. Closed: as built. */
  function setDoorwayOpen(open) {
    // The wall's plug AND the closed door's own footprint: either alone and
    // the doorway is still solid.
    for (const blocker of doorwayBlockers) {
      const i = colliders.indexOf(blocker);
      if (open && i >= 0) colliders.splice(i, 1);
      if (!open && i < 0) colliders.push(blocker);
    }
    if (doorwayVoid) doorwayVoid.visible = !open;
  }

  // back wall (has the window), front wall (has the door), right wall
  addWallWithGap(ROOM_W, ROOM_H, -ROOM_D / 2, WINDOW_POSITION_X, 1.5, 1.3, 1.5);
  addWall(ROOM_D, ROOM_H, ROOM_W / 2, ROOM_H / 2, 0, -Math.PI / 2, 'right');
  addFrontWallDoorway();

  // Left wall has a gap behind the pinboard (see the photo-arrangement
  // puzzle below) opening onto an actual recessed cavity -- built with the
  // same four-slab framing technique as the window cut-out above, just
  // rotated onto the Z axis, plus a hollow pocket (back panel + four
  // connecting sides) behind the gap so the reveal isn't a hole into the
  // void once the pinboard swings open.
  const pinRecess = {
    z: PIN_RECESS_POSITION_Z,
    y: 1.45,
    w: 0.74 * PINBOARD_SCALE,
    h: 0.78 * PINBOARD_SCALE,
    depth: 0.42 * PINBOARD_SCALE
  };
  const cubbyFloorSurfaceY = pinRecess.y - 0.38 * 1.7;
  {
    const wallThickness = 0.12;
    const wallX = -ROOM_W / 2;
    const slabCenterX = wallX + wallThickness / 2;
    const gapZ0 = pinRecess.z - pinRecess.w / 2;
    const gapZ1 = pinRecess.z + pinRecess.w / 2;
    const gapY0 = pinRecess.y - pinRecess.h / 2;
    const gapY1 = pinRecess.y + pinRecess.h / 2;

    const slab = (sw, sh, sy, sz) => {
      // The pinboard-wall slabs use the same world-sized UV repeat as every
      // other wall; without it, this wall showed one stretched motif per slab.
      const geometry = new THREE.BoxGeometry(wallThickness, sh, sw);
      const mesh = new THREE.Mesh(geometry, wallMat);
      mesh.position.set(slabCenterX, sy, sz);
      alignBedroomWallUVs(mesh, 'left');
      structure.add(mesh);
    };
    slab(gapZ0 - (-ROOM_D / 2), ROOM_H, ROOM_H / 2, (-ROOM_D / 2 + gapZ0) / 2); // before gap
    slab(ROOM_D / 2 - gapZ1, ROOM_H, ROOM_H / 2, (ROOM_D / 2 + gapZ1) / 2); // after gap
    slab(pinRecess.w, gapY0, gapY0 / 2, pinRecess.z); // below gap
    slab(pinRecess.w, ROOM_H - gapY1, (gapY1 + ROOM_H) / 2, pinRecess.z); // above gap

    const cavityMat = new THREE.MeshStandardMaterial({ color: 0x0c0906, roughness: 1 });
    // Retain the original liners until the Blender visual has loaded safely.
    const cavityFallback = new THREE.Group();
    cavityFallback.name = 'Level1_HollowFallback';
    structure.add(cavityFallback);
    const backX = wallX - pinRecess.depth;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(pinRecess.w, pinRecess.h), cavityMat);
    back.position.set(backX, pinRecess.y, pinRecess.z);
    back.rotation.y = Math.PI / 2;
    cavityFallback.add(back);

    const sideCenterX = (wallX + backX) / 2;
    const side = (sy, sz, sh, sw) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(pinRecess.depth, sh, sw), cavityMat);
      mesh.position.set(sideCenterX, sy, sz);
      cavityFallback.add(mesh);
    };
    side(gapY1, pinRecess.z, 0.02, pinRecess.w); // top
    side(cubbyFloorSurfaceY - 0.01, pinRecess.z, 0.02, pinRecess.w); // bottom
    side(pinRecess.y, gapZ0, pinRecess.h, 0.02); // near side
    side(pinRecess.y, gapZ1, pinRecess.h, 0.02); // far side

    // Visual-only insert: exact existing opening, depth, and wall orientation.
    // No interactables, colliders, or compartment state belong to this asset.
    loadModel(wallHollowModelUrl).then((hollowVisual) => {
      hollowVisual.name = 'Level1_HollowInterior';
      hollowVisual.position.set(wallX - 0.046, pinRecess.y, pinRecess.z);
      hollowVisual.rotation.y = Math.PI / 2;
      // The authored liner already overhangs the original aperture. Its face
      // scales a little less than the cut-out to keep the trim under the board;
      // its depth reaches the new rear wall.
      hollowVisual.scale.set(1.7, 1.7, 1.79);
      hollowVisual.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = true;
        if (child.material.transparent) child.material.depthWrite = false;
        if (child.material.map) child.material.map.anisotropy = 4;
      });
      structure.add(hollowVisual);
      cavityFallback.visible = false;
    }).catch((error) => console.warn('Bedroom hollow visual could not load:', error));
  }

  const doorwayPlug = { minX: DOOR_POSITION_X - 0.5, maxX: DOOR_POSITION_X + 0.5, minZ: ROOM_D / 2 - 0.15, maxZ: ROOM_D / 2 + 0.1 };
  /** Everything that closes the doorway: setDoorwayOpen takes them all out. */
  const doorwayBlockers = [doorwayPlug];
  colliders.push(
    { minX: -ROOM_W / 2 - 0.1, maxX: -ROOM_W / 2 + 0.15, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: ROOM_W / 2 - 0.15, maxX: ROOM_W / 2 + 0.1, minZ: -ROOM_D / 2, maxZ: ROOM_D / 2 },
    { minX: -ROOM_W / 2, maxX: ROOM_W / 2, minZ: -ROOM_D / 2 - 0.1, maxZ: -ROOM_D / 2 + 0.15 },
    // The door wall, either side of the doorway, and the doorway itself as a
    // plug that comes out while the door stands open (setDoorwayOpen): the
    // upstairs hallway is built onto the other side of it, one space.
    { minX: -ROOM_W / 2, maxX: DOOR_POSITION_X - 0.5, minZ: ROOM_D / 2 - 0.15, maxZ: ROOM_D / 2 + 0.1 },
    { minX: DOOR_POSITION_X + 0.5, maxX: ROOM_W / 2, minZ: ROOM_D / 2 - 0.15, maxZ: ROOM_D / 2 + 0.1 },
    doorwayPlug
  );

  addBaseboard(structure, {
    width: ROOM_W,
    depth: ROOM_D,
    materialFactory: (skirtingLengthMetres) => createBedroomSkirtingMaterial(floorTex, skirtingLengthMetres),
    frontOpenings: [{ center: DOOR_POSITION_X, width: DOOR_SKIRTING_OPENING_WIDTH_METRES }],
    // The raised radiator clears this run completely, so the skirting remains
    // continuous beneath it. The bed headboard still needs its own opening.
    backOpenings: [
      { center: BED_POSITION_X, width: BED_SKIRTING_OPENING_WIDTH_METRES }
    ],
    // The left wall uses recessed, thicker pinboard-wall geometry, so it
    // needs a deeper room-facing offset than the three plane-wall sides.
    // The back wall is a 12cm thick window slab, unlike the right/front planes.
    // Its trim needs the larger inset to sit in front of the interior wall face.
    wallInsets: { front: 0.04, back: 0.12, left: 0.15, right: 0.04 },
    height: 0.16,
    thickness: 0.045
  });

  // ---------- ceiling light fixture ----------
  // A bare bulb (per the storyline's "dim yellow light") but with the
  // actual hardware a real fixture has -- a ceiling canopy where the cord
  // meets the ceiling, a socket with a visible screw base under the bulb,
  // and a dangling pull-chain -- instead of a sphere floating on a bare
  // cylinder cord.
  const ceilingAnchor = new THREE.Object3D();
  ceilingAnchor.position.set(0.6, ROOM_H, 0.2);
  group.add(ceilingAnchor);

  const fixtureMetal = new THREE.MeshStandardMaterial({ color: 0x1c1a16, metalness: 0.6, roughness: 0.5 });

  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 12), fixtureMetal);
  canopy.position.y = -0.01;
  ceilingAnchor.add(canopy);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.46, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  cord.position.y = -0.25;
  ceilingAnchor.add(cord);

  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.06, 10), fixtureMetal);
  socket.position.y = -0.47;
  ceilingAnchor.add(socket);

  const bulbBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.024, 0.03, 10),
    new THREE.MeshStandardMaterial({ color: 0xb8a870, metalness: 0.7, roughness: 0.4 })
  );
  bulbBase.position.y = -0.505;
  ceilingAnchor.add(bulbBase);

  // Held in its own const so Storm can put it out. Without this the light goes
  // to zero and the glass keeps glowing at emissive 1.4 -- the brightest object
  // in a room the player has just been told is dark.
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdca0, emissive: 0xffb347, emissiveIntensity: 1.4
  });
  const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), bulbMaterial);
  bulbMesh.position.y = -0.565;
  ceilingAnchor.add(bulbMesh);

  // Blender-authored pendant replaces only the legacy visual dressing; the
  // original bulb material/light remain the authoritative gameplay objects.
  const pendantVisual = new THREE.Group();
  const pendantIntact = new THREE.Group();
  const pendantBroken = new THREE.Group();
  pendantBroken.visible = false;
  pendantVisual.add(pendantIntact, pendantBroken);
  // The authored canopy extends 2.25 cm above the asset origin. Seat its top
  // flush against the ceiling rather than placing the origin on the plaster.
  pendantVisual.position.y = -0.0225;
  ceilingAnchor.add(pendantVisual);
  [canopy, cord, socket, bulbBase, bulbMesh].forEach((mesh) => { mesh.visible = false; });
  loadModel(pendantLightModelUrl).then((pendantModel) => {
    const intactModel = pendantModel.getObjectByName('PendantIntact');
    const brokenModel = pendantModel.getObjectByName('PendantBroken');
    pendantModel.traverse((child) => {
      if (!child.isMesh) return;
      // Frosted glass diffuses the bulb; an opaque shadow here trapped all
      // its light inside the shade. Keep metal shadows but let glass and the
      // bulb pass light through to the bedroom.
      const isGlassOrBulb = /Glass|Bulb/.test(child.material?.name ?? '');
      child.castShadow = !isGlassOrBulb;
      child.receiveShadow = !isGlassOrBulb;
    });
    if (intactModel) pendantIntact.add(intactModel);
    if (brokenModel) pendantBroken.add(brokenModel);
    // The canopy and hanging chain are shared siblings of the two states.
    // Retain this root after moving the states into their visibility wrappers.
    pendantVisual.add(pendantModel);
  }).catch((error) => console.error('Failed to load ceiling pendant:', error));

  // small pull-chain beside the socket, same torus-link technique as the
  // handcuff chain
  const chainLinkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.4 });
  const pullChain = new THREE.Group();
  pullChain.visible = false; // Replaced by the GLB's complete hanging chain.
  pullChain.position.set(0.035, -0.44, 0);
  ceilingAnchor.add(pullChain);
  for (let i = 0; i < 5; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 10), chainLinkMat);
    link.position.y = -0.02 * i;
    link.rotation.set(0, i % 2 === 0 ? 0 : Math.PI / 2, 0);
    pullChain.add(link);
  }

  // Range/decay opened up a little (was 8/1.8) so objects at the far
  // side of the room -- the door, dresser -- get at least a dim
  // silhouette from the bulb before the flashlight is found, rather than
  // reading as pure flat black. Deliberately small: the per-level exposure
  // is measured/calibrated (see main.js), so this is a reach tweak, not a
  // brightness overhaul -- near-bulb areas barely change.
  const bulbLight = new THREE.PointLight(0xffb347, 1.23, 11, 1.5);
  // Place the existing point light at the authored bulb, below the opaque
  // holder, so the metal socket no longer confines illumination to a spot.
  bulbLight.position.y = pendantVisual.position.y - 0.501;
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(512, 512);
  /**
   * A PointLight's shadow camera defaults to far = 500. In a room 6.4 m across
   * that spreads the depth buffer's precision over eighty times the distance it
   * needs, which is where shadow acne and peter-panning come from -- and it is
   * six cube faces being rendered at that range every frame. Sized to the room.
   */
  bulbLight.shadow.camera.near = 0.08;
  bulbLight.shadow.camera.far = 9;
  bulbLight.shadow.bias = -0.0015;
  ceilingAnchor.add(bulbLight);

  // ---------- ambient / storm baseline ----------
  const ambient = new THREE.AmbientLight(0x2e3342, 0.31);
  group.add(ambient);

  /**
   * LIGHTNING THAT ACTUALLY COMES THROUGH THE WINDOW.
   *
   * It stayed a DirectionalLight -- its flat parallel fill is what reads as sky
   * rather than as a searchlight -- but it now casts, and it is aimed along a
   * line that puts the window's shadow somewhere worth looking.
   *
   * The old aim was (-3, 2.4, -3.5) toward (-3, 0, -2.6): 21 degrees off
   * VERTICAL, so even with shadows on, the window's patch would have landed
   * about half a metre from the wall base, behind the radiator. It now comes in
   * at roughly 25 degrees above horizontal, which throws the mullion cross
   * several metres across the floorboards and up the far wall.
   *
   * autoUpdate = false is what makes it affordable. three.js re-renders a
   * casting light's shadow map EVERY FRAME regardless of its intensity being
   * zero, and this light is dark for 5 to 14 seconds at a time. main.js sets
   * needsUpdate on the frame a flash begins (see the onFlash callback); the
   * room is static for the flash's whole 0.12-0.3 s, so one 1024-square render
   * per strike is the entire cost.
   */
  const lightning = new THREE.DirectionalLight(0xbcd4ff, 0);
  lightning.position.set(-4.2, 3.4, -7.5);
  lightning.target.position.set(-0.6, 0, -0.4);
  lightning.castShadow = true;
  lightning.shadow.mapSize.set(1024, 1024);
  lightning.shadow.camera.left = -3.4;
  lightning.shadow.camera.right = 3.4;
  lightning.shadow.camera.top = 3.0;
  lightning.shadow.camera.bottom = -3.0;
  lightning.shadow.camera.near = 0.5;
  lightning.shadow.camera.far = 16;
  // Negative bias, or the floorboards acne under PCFSoftShadowMap.
  lightning.shadow.bias = -0.0006;
  lightning.shadow.autoUpdate = false;
  group.add(lightning);
  group.add(lightning.target);

  // ---------- window (back-left wall) with rain seen through it ----------
  const windowGroup = new THREE.Group();
  windowGroup.position.set(WINDOW_POSITION_X, 1.5, -ROOM_D / 2 + 0.02);
  group.add(windowGroup);

  /**
   * THE FRAME IS A FRAME. It used to be one solid BoxGeometry(1.3, 1.5, 0.08)
   * -- an opaque slab exactly filling the aperture that addWallWithGap had gone
   * to the trouble of cutting.
   *
   * The consequences were the whole reason this room has a storm at all. Behind
   * that slab sat 400 rain particles, a rain-streaked glass shader and a
   * lightning light, none of which the player could see: the window showed a
   * pane of glass with a brown board behind it. Every atmosphere system in
   * Level 1 was aimed through a hole that had been filled in.
   *
   * Four bars now, leaving the aperture genuinely open. The board was probably
   * meant as the outside seen through the glass -- but the outside is the storm,
   * and the storm was already built.
   */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.8 });
  const FRAME_W = 1.3;
  const FRAME_H = 1.5;
  const APERTURE_W = 1.1;
  const APERTURE_H = 1.3;
  const FRAME_D = 0.08;
  const barX = (FRAME_W - APERTURE_W) / 2;
  const barY = (FRAME_H - APERTURE_H) / 2;
  const frameParts = [
    [FRAME_W, barY, 0, (APERTURE_H + barY) / 2],       // head
    [FRAME_W, barY, 0, -(APERTURE_H + barY) / 2],      // sill
    [barX, APERTURE_H, -(APERTURE_W + barX) / 2, 0],   // left jamb
    [barX, APERTURE_H, (APERTURE_W + barX) / 2, 0]     // right jamb
  ];
  for (const [w, h, x, y] of frameParts) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, FRAME_D), frameMat);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    bar.receiveShadow = true;
    windowGroup.add(bar);
  }
  // Custom shader material (see world/RainGlassMaterial.js): streaks rain
  // down the pane and flashes with the storm's lightning, instead of a
  // static tinted-transparent built-in material.
  const glassMaterial = createRainGlassMaterial();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), glassMaterial);
  glass.position.z = 0.05;
  windowGroup.add(glass);
  // mullion cross
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x1c1712 });
  // The cross has to CAST, or a flash throws a plain bright rectangle on the
  // floor instead of a window. This pair of boxes is the whole image.
  const mV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.06), mullionMat);
  mV.position.z = 0.06;
  mV.castShadow = true;
  windowGroup.add(mV);
  const mH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.06), mullionMat);
  mH.position.z = 0.06;
  mH.castShadow = true;
  windowGroup.add(mH);
  loadModel(level1WindowFrameRemodelUrl).then((windowFrameVisual) => {
    frameParts.forEach((_, index) => { windowGroup.children[index].visible = false; });
    mV.visible = false;
    mH.visible = false;
    windowFrameVisual.name = 'Level1WindowFrameRemodelVisual';
    // Blender exports its Z-up window assembly sideways in Three's Y-up
    // scene. Rotate only this visual root; rain glass and the window opening
    // keep their existing transforms and storm behavior.
    windowFrameVisual.rotation.x = Math.PI / 2;
    windowFrameVisual.position.z = 0.01;
    windowFrameVisual.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    windowGroup.add(windowFrameVisual);
  }).catch((error) => console.error('Could not load the Level 1 window frame remodel:', error));

  // ---------- old cast-iron radiator beneath the window ----------
  const radiatorGroup = new THREE.Group();
  radiatorGroup.position.set(WINDOW_POSITION_X, 0, -ROOM_D / 2 + 0.14);
  group.add(radiatorGroup);

  const RAD_W = 0.7;
  const RAD_H = 0.52;
  const RAD_FLOOR_Y = 0.19;
  loadModel(level1RadiatorRemodelUrl).then((radiatorVisual) => {
    radiatorVisual.name = 'Level1RadiatorRemodelVisual';
    radiatorVisual.position.y = RAD_FLOOR_Y;
    // Correct the Blender Z-up asset to the wall's vertical plane and place
    // its full cast-iron body ahead of the back-wall surface.
    radiatorVisual.rotation.x = Math.PI / 2;
    radiatorVisual.position.z = 0.06;
    radiatorVisual.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    radiatorGroup.add(radiatorVisual);
  }).catch((error) => console.error('Could not load the Level 1 radiator remodel:', error));

  radiatorGroup.userData.interact = {
    label: 'Examine radiator',
    onInteract: () => showCaption(line('dialog_radiator'))
  };
  const radiatorHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(RAD_W, RAD_H, 0.14),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  radiatorHitbox.position.set(0, RAD_FLOOR_Y + RAD_H / 2, 0);
  radiatorHitbox.userData.interact = radiatorGroup.userData.interact;
  radiatorGroup.add(radiatorHitbox);
  interactables.push(radiatorHitbox);

  colliders.push({
    minX: radiatorGroup.position.x - RAD_W / 2 - 0.05, maxX: radiatorGroup.position.x + RAD_W / 2 + 0.05,
    minZ: radiatorGroup.position.z - 0.1, maxZ: radiatorGroup.position.z + 0.1
  });

  // ---------- bed ----------
  const bedGroup = new THREE.Group();
  bedGroup.position.set(BED_POSITION_X, 0, BED_POSITION_Z);
  group.add(bedGroup);

  // The two candle flames, for their crackle: main.js's audio director reads a
  // world position off each. Both are built in model-load callbacks, so each
  // adds itself when it exists, and the sound starts when its candle does.
  const candleAnchors = [];

  // Shared dark timber placeholder for the room's script-built furniture.
  // The imported bed carries its own refined, embedded materials.
  const frameMatWood = new THREE.MeshStandardMaterial({ color: 0x3c2c1e, roughness: 0.85 });

  // Mattress, duvet and pillows now ship with bed.glb. Keeping no legacy
  // primitive stand-ins here prevents them from covering the refined asset.

  // ---------- bed frame (Blender-authored, see blender/build_bed.py) ----------
  // The rigid wood frame -- turned corner posts, raised-panel head/
  // footboard, side rails, base -- is generated in Blender (bmesh.ops:
  // spin for the lathe-turned posts, inset+bevel for the panel mouldings)
  // and exported as bed.glb, rather than hand-built from Three.js
  // primitives: Blender's modifiers give genuinely smooth/curved geometry
  // a box-and-cylinder approach can't match.

  // Keep the whole physical mattress/frame footprint solid. The player wakes
  // on the mattress, so main.js moves them to BED_EXIT_POSITION_Z immediately
  // before restoring movement after the cuff release.
  const bedColliderMinX = BED_POSITION_X - 0.8;
  const bedColliderMaxX = BED_POSITION_X + 0.8;
  const bedColliderMinZ = BED_POSITION_Z - 1.05;
  const bedColliderMaxZ = BED_POSITION_Z + 1.05;
  colliders.push({
    minX: bedColliderMinX,
    maxX: bedColliderMaxX,
    minZ: bedColliderMinZ,
    maxZ: bedColliderMaxZ
  });

  let shelfFlame = null;
  let shelfFlameMaterial = null;
  let shelfCandleLight = null;

  loadModel(bedModelUrl).then((bedFrame) => {
    bedFrame.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    applyTextureByMaterialName(bedFrame, 'BedWood', furnitureWoodTex, furnitureWoodNormal);
    // The duvet's side and foot drape is authored in bed.glb; keep its UVs and
    // measured alignment intact rather than stretching it again at runtime.
    bedGroup.add(bedFrame);

    // A shallow ledge gives the tiny headboard props a real support surface.
    // It is deliberately separate from bed.glb, so the approved asset stays
    // unchanged while the props can be tuned to its rendered top height.
    const bedTopShelfHeightMetres = 1.625;
    const bedTopShelf = new THREE.Mesh(
      new RoundedBoxGeometry(0.70, 0.028, 0.13, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x2d1d12, roughness: 0.76 })
    );
    bedTopShelf.position.set(0, bedTopShelfHeightMetres, -0.91);
    bedTopShelf.castShadow = true;
    bedTopShelf.receiveShadow = true;
    bedGroup.add(bedTopShelf);

    // Small dressing resting directly on the new ledge: a candle and the
    // mansion photograph establish the house without adding a puzzle object.
    const shelfCandle = new THREE.Group();
    shelfCandle.position.set(-0.24, bedTopShelfHeightMetres + 0.014, -0.91);
    bedGroup.add(shelfCandle);
    const candleHolderMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3926, metalness: 0.18, roughness: 0.66
    });
    const candleWaxMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8c9a8, roughness: 0.92
    });
    const shelfCandleHolder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.037, 0.018, 10),
      candleHolderMaterial
    );
    shelfCandleHolder.position.y = 0.009;
    shelfCandle.add(shelfCandleHolder);
    const shelfCandleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.015, 0.085, 10),
      candleWaxMaterial
    );
    shelfCandleBody.position.y = 0.0605;
    shelfCandle.add(shelfCandleBody);

    const candleWick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0018, 0.018, 6),
      new THREE.MeshStandardMaterial({ color: 0x16110e, roughness: 1 })
    );
    candleWick.position.y = 0.112;
    shelfCandle.add(candleWick);

    shelfFlame = new THREE.Group();
    shelfFlame.position.y = 0.136;
    shelfCandle.add(shelfFlame);
    candleAnchors.push(shelfFlame);
    shelfFlameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa347, transparent: true, opacity: 0.86,
      depthWrite: false, side: THREE.DoubleSide
    });
    const flameGeometry = new THREE.PlaneGeometry(0.026, 0.052);
    const flameA = new THREE.Mesh(flameGeometry, shelfFlameMaterial);
    const flameB = new THREE.Mesh(flameGeometry, shelfFlameMaterial);
    flameB.rotation.y = Math.PI / 2;
    shelfFlame.add(flameA, flameB);
    shelfCandleLight = new THREE.PointLight(0xff9b4a, 0.13, 0.72, 2);
    shelfCandleLight.position.y = 0.13;
    shelfCandle.add(shelfCandleLight);

    const shelfFrameGroup = new THREE.Group();
    shelfFrameGroup.name = 'Level1MansionFrameVisual';
    shelfFrameGroup.position.set(0.20, bedTopShelfHeightMetres + 0.014, -0.91);
    shelfFrameGroup.rotation.y = -0.08;
    bedGroup.add(shelfFrameGroup);
    const mansionFrameWidthMetres = 0.225;
    const mansionFrameHeightMetres = 0.225;
    const mansionFrameRailMetres = 0.024;
    const mansionFrameCenterYMetres = 0.122;
    const mansionFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x25120a, roughness: 0.83
    });
    const mansionTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x785128, metalness: 0.36, roughness: 0.66
    });
    const mansionFrameBack = new THREE.Mesh(
      new RoundedBoxGeometry(mansionFrameWidthMetres, mansionFrameHeightMetres, 0.014, 2, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x160d08, roughness: 0.92 })
    );
    mansionFrameBack.position.set(0, mansionFrameCenterYMetres, 0.005);
    mansionFrameBack.castShadow = true;
    mansionFrameBack.receiveShadow = true;
    shelfFrameGroup.add(mansionFrameBack);

    const addFrameRail = (widthMetres, heightMetres, xMetres, yMetres, material) => {
      const rail = new THREE.Mesh(
        new RoundedBoxGeometry(widthMetres, heightMetres, 0.018, 2, 0.003),
        material
      );
      rail.position.set(xMetres, yMetres, 0.017);
      rail.castShadow = true;
      shelfFrameGroup.add(rail);
    };
    const outerHalfWidthMetres = mansionFrameWidthMetres / 2;
    const outerHalfHeightMetres = mansionFrameHeightMetres / 2;
    addFrameRail(mansionFrameWidthMetres, mansionFrameRailMetres, 0,
      mansionFrameCenterYMetres + outerHalfHeightMetres - mansionFrameRailMetres / 2, mansionFrameMaterial);
    addFrameRail(mansionFrameWidthMetres, mansionFrameRailMetres, 0,
      mansionFrameCenterYMetres - outerHalfHeightMetres + mansionFrameRailMetres / 2, mansionFrameMaterial);
    addFrameRail(mansionFrameRailMetres, mansionFrameHeightMetres, -outerHalfWidthMetres + mansionFrameRailMetres / 2,
      mansionFrameCenterYMetres, mansionFrameMaterial);
    addFrameRail(mansionFrameRailMetres, mansionFrameHeightMetres, outerHalfWidthMetres - mansionFrameRailMetres / 2,
      mansionFrameCenterYMetres, mansionFrameMaterial);

    const mansionInnerWidthMetres = mansionFrameWidthMetres - mansionFrameRailMetres * 1.75;
    const mansionInnerHeightMetres = mansionFrameHeightMetres - mansionFrameRailMetres * 1.75;
    const mansionTrimMetres = 0.006;
    addFrameRail(mansionInnerWidthMetres, mansionTrimMetres, 0,
      mansionFrameCenterYMetres + mansionInnerHeightMetres / 2, mansionTrimMaterial);
    addFrameRail(mansionInnerWidthMetres, mansionTrimMetres, 0,
      mansionFrameCenterYMetres - mansionInnerHeightMetres / 2, mansionTrimMaterial);
    addFrameRail(mansionTrimMetres, mansionInnerHeightMetres, -mansionInnerWidthMetres / 2,
      mansionFrameCenterYMetres, mansionTrimMaterial);
    addFrameRail(mansionTrimMetres, mansionInnerHeightMetres, mansionInnerWidthMetres / 2,
      mansionFrameCenterYMetres, mansionTrimMaterial);

    const mansionTexture = new THREE.TextureLoader().load(hauntedMansionSepiaUrl);
    mansionTexture.colorSpace = THREE.SRGBColorSpace;
    mansionTexture.anisotropy = 4;
    const mansionPhoto = new THREE.Mesh(
      new THREE.PlaneGeometry(mansionInnerWidthMetres - 0.008, mansionInnerHeightMetres - 0.008),
      new THREE.MeshStandardMaterial({ map: mansionTexture, roughness: 0.94 })
    );
    mansionPhoto.name = 'Level1HauntedMansionPhotograph';
    mansionPhoto.position.set(0, mansionFrameCenterYMetres, 0.015);
    shelfFrameGroup.add(mansionPhoto);
  }).catch((err) => {
    console.error('Failed to load bed.glb, bed frame will be missing:', err);
  });

  // World-space restraint dressing only. Its shared oval link geometry keeps
  // this lightweight while alternating each link's plane makes the run read as
  // a real interlocked chain, never as a row of disconnected rings.
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x68645c, metalness: 0.86, roughness: 0.42 });
  const chainLinkGeometry = new THREE.TorusGeometry(0.032, 0.0058, 8, 14);
  const chainLinkLongAxis = new THREE.Vector3(0, 1, 0);

  function createInterlockedChainLink(tangent, index) {
    const link = new THREE.Mesh(chainLinkGeometry, chainMat);
    link.scale.set(1, 1.55, 1);
    link.quaternion.setFromUnitVectors(chainLinkLongAxis, tangent);
    // Local-Y is the run direction; every other link rotates its ring plane
    // around that axis and therefore visibly threads through its neighbours.
    link.rotateY((index % 2) * (Math.PI / 2));
    link.castShadow = true;
    link.receiveShadow = true;
    return link;
  }

  // At 7 cm, adjacent 10 cm-long oval links overlap enough to visibly thread
  // through one another instead of reading as disconnected rings.
  const CHAIN_LINK_SPACING_METRES = 0.07;

  /** Adds one continuous, alternating-orientation chain along a placed path. */
  function addInterlockedChainPath(chainGroup, chainPoints) {
    let linkIndex = 0;
    for (let segmentIndex = 0; segmentIndex < chainPoints.length - 1; segmentIndex++) {
      const startPoint = chainPoints[segmentIndex];
      const endPoint = chainPoints[segmentIndex + 1];
      const tangent = endPoint.clone().sub(startPoint).normalize();
      const linkCount = Math.max(1, Math.ceil(startPoint.distanceTo(endPoint) / CHAIN_LINK_SPACING_METRES));
      const firstLinkIndex = segmentIndex === 0 ? 0 : 1;
      for (let pathIndex = firstLinkIndex; pathIndex <= linkCount; pathIndex++) {
        const link = createInterlockedChainLink(tangent, linkIndex++);
        link.position.lerpVectors(startPoint, endPoint, pathIndex / linkCount);
        chainGroup.add(link);
      }
    }
  }

  // The only restraint anchor is the visible horizontal Headboard_BottomRail
  // behind the right pillow. Its actual bed-local bounds are X -0.674..0.674,
  // Y 0.825..0.935, Z -0.997..-0.889. Two vertical oval links encircle that
  // rail; a horizontal link threads them, making the attachment read as a
  // wrapped chain rather than a lone ring. The shared group persists through
  // both restraint states.
  const headboardRailWrap = new THREE.Group();
  const headboardRailWrapLinks = [
    { position: new THREE.Vector3(0.590, 0.880, -0.943), rotation: new THREE.Euler(0, Math.PI / 2, 0) },
    { position: new THREE.Vector3(0.630, 0.968, -0.943), rotation: new THREE.Euler(Math.PI / 2, 0.18, 0) },
    { position: new THREE.Vector3(0.670, 0.880, -0.943), rotation: new THREE.Euler(0, Math.PI / 2, 0.06) }
  ];
  for (const { position, rotation } of headboardRailWrapLinks) {
    const wrapLink = new THREE.Mesh(chainLinkGeometry, chainMat);
    wrapLink.position.copy(position);
    wrapLink.scale.set(2.4, 3.72, 2.4);
    wrapLink.rotation.copy(rotation);
    wrapLink.castShadow = true;
    wrapLink.receiveShadow = true;
    headboardRailWrap.add(wrapLink);
  }
  bedGroup.add(headboardRailWrap);

  const chain = new THREE.Group();
  // The locked run leaves the headboard wrap and crosses forward over the
  // duvet to the existing world-space cuff position.
  chain.position.set(0.665, 0.97, -0.82);
  bedGroup.add(chain);

  const CHAIN_SAG = 0.018;
  // End near the lower-right wake-up frame, close enough to imply the cuffed
  // wrist without attaching anything to the first-person hand rig.
  const chainRunEnd = new THREE.Vector3(-0.17, -0.15, 1.18);
  const chainRunMidpoint = new THREE.Vector3(
    chainRunEnd.x * 0.5,
    chainRunEnd.y * 0.5 - CHAIN_SAG,
    chainRunEnd.z * 0.5
  );
  addInterlockedChainPath(chain, [new THREE.Vector3(), chainRunMidpoint, chainRunEnd]);

  const cuff = new THREE.Group();
  cuff.position.copy(chainRunEnd);
  chain.add(cuff);
  const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.011, 8, 18), chainMat);
  cuffRing.rotation.x = Math.PI / 2;
  cuff.add(cuffRing);
  const cuffHinge = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.020), chainMat);
  cuffHinge.position.set(0.047, 0, 0);
  cuff.add(cuffHinge);

  // A post-unlock visual swap: the tensioned run disappears, but the open
  // cuff and loose links remain on the duvet and lead back to the same rail.
  const restraintRemnant = new THREE.Group();
  // The dropped cuff begins by the released wrist; its loose run follows the
  // duvet's right edge before joining the permanent headboard-rail wrap.
  restraintRemnant.position.set(0.495, 0.82, 0.36);
  restraintRemnant.rotation.y = 0;
  restraintRemnant.scale.setScalar(1);
  restraintRemnant.visible = false;
  bedGroup.add(restraintRemnant);
  const openCuff = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.011, 8, 18, Math.PI * 1.62), chainMat);
  openCuff.rotation.x = Math.PI / 2;
  restraintRemnant.add(openCuff);
  const openCuffHinge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.021), chainMat);
  openCuffHinge.position.set(-0.052, 0.003, 0);
  restraintRemnant.add(openCuffHinge);
  const slackChainPoints = [
    new THREE.Vector3(0.060, 0.012, 0.000),
    new THREE.Vector3(0.110, 0.018, -0.100),
    new THREE.Vector3(0.150, 0.012, -0.220),
    new THREE.Vector3(0.180, 0.022, -0.380),
    new THREE.Vector3(0.190, 0.014, -0.550),
    new THREE.Vector3(0.185, 0.025, -0.720),
    new THREE.Vector3(0.180, 0.042, -0.900),
    new THREE.Vector3(0.175, 0.070, -1.100),
    // The final loose link enters the right-hand headboard-rail wrap.
    new THREE.Vector3(0.175, 0.060, -1.303)
  ];
  addInterlockedChainPath(restraintRemnant, slackChainPoints);

  // ---------- vanity and its existing 1987 photo drawer ----------
  const dresser = new THREE.Group();
  dresser.position.set(DRESSER_POSITION_X, 0, DRESSER_POSITION_Z);
  dresser.rotation.y = -Math.PI / 2;
  dresser.scale.setScalar(VANITY_SCALE);
  group.add(dresser);
  const vanityDrawerTravelMetres = 0.26;
  const vanityDrawerOpenSeconds = 0.65;
  let vanityDrawer = null;
  let vanityDrawerClosedPosition = null;
  let vanityDrawerProgress = 0;
  let vanityDrawerMotion = 0;
  let vanityPhotoRevealed = false;
  const vanityPhotoAnchor = new THREE.Group();
  dresser.add(vanityPhotoAnchor);

  /** Loads an authored vanity part at its measured tabletop position. */
  function addVanityPart(url, position, { isBase = false, isCandlestick = false } = {}) {
    loadModel(url).then((model) => {
      model.position.set(...position);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = child.name !== 'VanityMirror_CloudedGlass';
          child.receiveShadow = true;
          if (child.name === 'VanityMirror_CloudedGlass') {
            // The supplied cloudy glass texture remains visible without a live
            // reflection pass or a shiny environment response.
            child.material = child.material.clone();
            child.material.metalness = 0;
            child.material.roughness = 0.88;
            child.material.envMapIntensity = 0;
          }
        }
      });
      if (isBase) {
        const middleDrawer = model.getObjectByName('VanityDrawer_Middle');
        if (!middleDrawer) throw new Error('Vanity base is missing VanityDrawer_Middle');
        vanityDrawer = middleDrawer;
        vanityDrawerClosedPosition = middleDrawer.position.clone();
        dresserTop.visible = true;
      }
      if (isCandlestick) {
        // Two crossed tapered faces keep the small flame legible from either
        // side of the vanity without a particle system or shadow map.
        const flameGeometry = new THREE.BufferGeometry();
        flameGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
          -0.014, 0, 0, 0.014, 0, 0, 0, 0.067, 0
        ], 3));
        flameGeometry.computeVertexNormals();
        const flameMaterial = new THREE.MeshBasicMaterial({
          color: 0xffb45e, side: THREE.DoubleSide, transparent: true,
          opacity: 0.88, depthWrite: false
        });
        const flame = new THREE.Group();
        flame.position.y = 0.395;
        const flameFront = new THREE.Mesh(flameGeometry, flameMaterial);
        const flameSide = new THREE.Mesh(flameGeometry, flameMaterial);
        flameSide.rotation.y = Math.PI / 2;
        flame.add(flameFront, flameSide);
        model.add(flame);
        candleAnchors.push(flame);
        const candleGlow = new THREE.PointLight(0xffa65a, 0.18, 0.9, 2);
        candleGlow.position.y = 0.43;
        model.add(candleGlow);
      }
      dresser.add(model);
    }).catch((err) => {
      console.error('Failed to load vanity part:', url, err);
    });
  }

  addVanityPart(vanityBaseUrl, [0, 0, 0], { isBase: true });
  addVanityPart(vanityMirrorUrl, [0, 0.807, -0.105]);
  addVanityPart(vanityCandlestickUrl, [-0.46, 0.807, 0.13], { isCandlestick: true });
  addVanityPart(vanityPerfumeUrl, [0.46, 0.807, 0.15]);
  addVanityPart(vanityTrayUrl, [0.20, 0.807, 0.13]);

  colliders.push({
    minX: dresser.position.x - 0.307 * VANITY_SCALE,
    maxX: dresser.position.x + 0.275 * VANITY_SCALE,
    minZ: dresser.position.z - 0.65 * VANITY_SCALE,
    maxZ: dresser.position.z + 0.65 * VANITY_SCALE
  });

  // A separate low-cost stool collider leaves the vanity's animated drawer
  // and its photograph unobstructed; the GLB remains a visual-only asset.
  loadModel(vanityStoolUrl).then((stool) => {
    stool.position.set(VANITY_STOOL_POSITION_X, 0, DRESSER_POSITION_Z);
    stool.rotation.y = -Math.PI / 2;
    stool.scale.setScalar(VANITY_STOOL_SCALE);
    stool.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(stool);
  }).catch((err) => {
    console.error('Failed to load vanity stool:', err);
  });
  colliders.push({
    minX: VANITY_STOOL_POSITION_X - 0.25 * VANITY_STOOL_SCALE,
    maxX: VANITY_STOOL_POSITION_X + 0.25 * VANITY_STOOL_SCALE,
    minZ: DRESSER_POSITION_Z - 0.30 * VANITY_STOOL_SCALE,
    maxZ: DRESSER_POSITION_Z + 0.30 * VANITY_STOOL_SCALE
  });

  // ---------- door with boarded planks + polaroid (children of the frame) ----------
  const doorFrame = new THREE.Group();
  doorFrame.position.set(DOOR_POSITION_X, 0, ROOM_D / 2 - 0.02);
  group.add(doorFrame);

  // The actual door leaf (+ knob + the claw marks scratched into its
  // surface) gets reparented onto this hinge once the model loads, below
  // -- a vertical pivot sitting at the leaf's own left edge, opposite the
  // knob, so once the planks are gone, interacting again swings the whole
  // leaf open instead of just cutting to a caption. The frame, planks and
  // polaroid stay direct children of doorFrame and never move (see the
  // note at the top of this file on why those are deliberately parented
  // to the frame, not the slab).
  const doorHinge = new THREE.Object3D();
  doorHinge.position.set(-0.5, 1.0, 0.025);
  doorFrame.add(doorHinge);
  const doorOpenSwing = Math.PI / 2;
  /** Set once the player is through: the open door swings shut behind them (shutDoor). */
  let doorShutBehind = false;
  const doorRattleDurationSeconds = 0.28;
  const doorRattleAmplitudeRadians = 0.045;
  let doorRattleRemainingSeconds = 0;

  /** Briefly nudges the locked slab without changing its puzzle-open state. */
  function rattleDoor() {
    doorRattleRemainingSeconds = doorRattleDurationSeconds;
  }

  /**
   * "Something moves past the door."
   *
   * The storyline's beat, and it did not exist in any form. The door is shut
   * and boarded, so there is nothing to SEE past it -- which is the whole
   * problem and also the answer: what you see is the strip of light under the
   * door, and what happens is that something breaks it.
   *
   * Two meshes. A thin emissive strip along the threshold, off until the beat
   * runs, and a black quad that slides across it. No lights and no shadow
   * casting: a real light in the hallway would have to be occluded by real
   * geometry that does not exist out there, and at this scale the strip reads
   * better anyway because the eye is drawn to the one bright thing in a room
   * that is otherwise at 6/255.
   *
   * Deliberately understated. The strip is dim, the pass is slow, and it
   * happens once. A player who is looking at the door sees it clearly; a player
   * who is not hears the footsteps and turns around too late, which is the
   * better version of the beat.
   */
  const DOOR_LEAF_W = 1.0;
  const gapGroup = new THREE.Group();
  // Just inside the room from the door plane, a centimetre off the floor.
  gapGroup.position.set(0, 0.012, -0.06);
  doorFrame.add(gapGroup);

  const doorGapMat = new THREE.MeshBasicMaterial({
    color: 0xb08a3c,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const doorGap = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_LEAF_W, 0.055), doorGapMat);
  doorGap.rotation.x = -Math.PI / 2;
  gapGroup.add(doorGap);

  // The blocker. Wider than a leg on purpose: it is a body's worth of shadow
  // seen edge-on through a 5 cm gap, not a silhouette.
  const doorGapBlockMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const doorGapBlock = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.075), doorGapBlockMat);
  doorGapBlock.rotation.x = -Math.PI / 2;
  doorGapBlock.position.y = 0.002;
  // Explicit, because the two planes are 2 mm apart with depthWrite off, and
  // three sorts transparent objects by camera distance -- at that separation
  // the order is a coin toss, and losing it draws the shadow UNDER the light.
  doorGap.renderOrder = 1;
  doorGapBlock.renderOrder = 2;
  gapGroup.add(doorGapBlock);

  /**
   * Beat state. `phase` runs 0..1 across the whole pass; the light comes up,
   * the shadow crosses, the light goes out again.
   */
  const doorPass = { active: false, phase: 0, duration: 5.4 };

  // Blender-authored: a detailed wood leaf, barred frosted-glass window and
  // lock hardware. doorSlab stays a plain invisible
  // hitbox sized to the old slab's bounds -- same reasoning as the
  // flashlight/paperclip hitboxes -- so "examine boarded door" is
  // clickable immediately rather than waiting on the async model load.
  // Keep the imported GLB distinct from the invisible interaction slab and
  // replace its contents if this loader ever resolves again. This guarantees
  // no earlier imported door clone can remain visible alongside the remodel.
  const doorVisualRoot = new THREE.Group();
  doorVisualRoot.name = 'BedroomDoorRemodelVisual';
  doorFrame.add(doorVisualRoot);
  loadModel(doorModelUrl).then((doorModel) => {
    doorModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    doorModel.scale.z = DOOR_MODEL_DEPTH_SCALE;
    doorVisualRoot.clear();
    doorVisualRoot.add(doorModel);

    // The rebuilt asset exports one named hierarchy for every moving leaf part
    // (panel, window, bars and lock furniture). attach() keeps its world pose
    // while moving the entire visual leaf under the pre-existing hinge.
    const doorLeaf = doorModel.getObjectByName('doorLeaf');
    if (doorLeaf) {
      doorHinge.attach(doorLeaf);
    } else {
      // Compatibility with the old lightweight GLB if an asset replacement is
      // interrupted: preserve the established panel/knob-only attachment.
      ['doorPanel', 'knobHandle', 'knobPlate'].forEach((name) => {
        const part = doorModel.getObjectByName(name);
        if (part) doorHinge.attach(part);
      });
    }
  }).catch((err) => {
    console.error('Failed to load door.glb, door will be missing:', err);
  });

  const doorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.06),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  doorSlab.position.set(0, 1.0, 0);
  doorFrame.add(doorSlab);

  // Boarded planks nailed across the door -- weathered pale grey-tan (not
  // the door's own dark stain, so they read as a clearly separate, cruder
  // repair rather than blending into the door surface) and bigger/thicker,
  // extending past the door's edges onto the surrounding frame the way
  // an actual "boarded shut in a hurry" plank would, plus dark nail heads
  // punched through each end.
  const plankTextureLoader = new THREE.TextureLoader();
  const plankTex = plankTextureLoader.load(doorPlankAlbedoUrl);
  plankTex.colorSpace = THREE.SRGBColorSpace;
  plankTex.wrapS = THREE.RepeatWrapping;
  plankTex.wrapT = THREE.RepeatWrapping;
  plankTex.repeat.set(2.2, 1);
  const plankRoughness = plankTextureLoader.load(doorPlankRoughnessUrl);
  plankRoughness.wrapS = THREE.RepeatWrapping;
  plankRoughness.wrapT = THREE.RepeatWrapping;
  plankRoughness.repeat.set(2.2, 1);
  const plankNormal = plankTextureLoader.load(doorPlankNormalUrl);
  plankNormal.wrapS = THREE.RepeatWrapping;
  plankNormal.wrapT = THREE.RepeatWrapping;
  plankNormal.repeat.set(2.2, 1);
  const plankMat = new THREE.MeshStandardMaterial({
    map: plankTex,
    roughnessMap: plankRoughness,
    normalMap: plankNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.88
  });
  const nailMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.6, roughness: 0.5 });

  // One group per board lets the crowbar play a small deterministic pry/fall
  // motion, while the puzzle state continues to own when they are removable.
  const boardedPlankParts = [];
  const boardedPlankGroups = [];
  const plankPryDurationSeconds = 0.36;
  let plankPryElapsedSeconds = -1;

  // The door depth is mirrored to present its authored front to the room, so
  // locked-state planks sit on local -Z: visibly in front of the door rather
  // than buried on its rear side.
  function addBoardedPlank(rotationZ, heightMetres, pryDirection) {
    const plankGroup = new THREE.Group();
    plankGroup.position.set(0, heightMetres, DOOR_BOARD_FRONT_OFFSET_METRES);
    plankGroup.rotation.z = rotationZ;
    plankGroup.userData.restPosition = plankGroup.position.clone();
    plankGroup.userData.restRotationZ = rotationZ;
    plankGroup.userData.pryDirection = pryDirection;
    doorFrame.add(plankGroup);

    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.2, 0.055), plankMat);
    plank.castShadow = true;
    plankGroup.add(plank);
    boardedPlankParts.push(plankGroup);
    boardedPlankGroups.push(plankGroup);

    [-0.68, 0.68].forEach((along) => {
      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), nailMat);
      nail.position.set(along, 0, -0.04);
      plankGroup.add(nail);
    });
  }
  addBoardedPlank(-0.14, 1.27, -1);
  addBoardedPlank(0.10, 0.63, 1);

  /** Starts the crowbar's short scripted plank pry without involving physics. */
  function startDoorPlankPryAnimation() {
    plankPryElapsedSeconds = 0;
  }

  /** Restores board transforms for the level reset path. */
  function resetDoorPlankPresentation() {
    plankPryElapsedSeconds = -1;
    for (const plankGroup of boardedPlankGroups) {
      plankGroup.visible = true;
      plankGroup.position.copy(plankGroup.userData.restPosition);
      plankGroup.rotation.set(0, 0, plankGroup.userData.restRotationZ);
    }
  }

  const polaroidTex = createPolaroidTexture({ caption: 'PROJECT HOLLOW', date: 'JUNE 1987' });
  const polaroid = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.26),
    new THREE.MeshStandardMaterial({ map: polaroidTex, roughness: 1 })
  );
  polaroid.position.set(0.7, 1.55, 0.06);
  polaroid.rotation.z = 0.08;
  doorFrame.add(polaroid);
  polaroid.userData.interact = {
    label: 'Examine polaroid',
    onInteract: () => {
      if (puzzleState.polaroidRead) {
        showCaption(line('dialog_polaroid_examine'));
        return;
      }
      puzzleState.polaroidRead = true;
      onExaminePolaroid();
    }
  };
  interactables.push(polaroid);

  // The closed door. It comes out with the wall's plug (setDoorwayOpen).
  const closedDoorCollider = {
    minX: doorFrame.position.x - 0.6, maxX: doorFrame.position.x + 0.6,
    minZ: doorFrame.position.z - 0.1, maxZ: doorFrame.position.z + 0.15
  };
  colliders.push(closedDoorCollider);
  doorwayBlockers.push(closedDoorCollider);

  // ---------- hero wallpaper tear beside the door ----------
  // Use the supplied tears' real colour, dark interior and irregular alpha.
  // One lit surface replaces the old plaster and synthetic groove overlays,
  // retaining the source's upper-right-to-lower-left slash direction.
  const heroWallDamage = new THREE.Group();
  heroWallDamage.name = 'Level1_HeroWallpaperTear';
  heroWallDamage.position.set(
    doorFrame.position.x + CLAW_DAMAGE_DOOR_OFFSET_X_METRES,
    CLAW_DAMAGE_HEIGHT_ABOVE_FLOOR_METRES,
    ROOM_D / 2 - 0.02
  );
  heroWallDamage.rotation.y = Math.PI;
  group.add(heroWallDamage);

  // Keep the existing examination target, dimensions and callback. Only its
  // material changes; transparent margins expose the intact wallpaper beneath.
  const clawMarks = new THREE.Mesh(
    new THREE.PlaneGeometry(CLAW_DAMAGE_WIDTH_METRES, CLAW_DAMAGE_HEIGHT_METRES),
    new THREE.MeshStandardMaterial({
      name: 'Level1_RippedVictorianWallpaper',
      map: clawRipTex,
      bumpMap: clawRipTex,
      bumpScale: 0.006,
      color: CLAW_DAMAGE_TINT,
      roughness: 1,
      transparent: true,
      opacity: CLAW_DAMAGE_DECAL_OPACITY,
      alphaTest: 0.015,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })
  );
  clawMarks.position.z = 0.014;
  clawMarks.userData.interact = {
    label: 'Examine the wall',
    onInteract: () => showCaption(line('dialog_claw_marks'))
  };
  interactables.push(clawMarks);
  heroWallDamage.add(clawMarks);

  // The supplied photos already include their borders, wear, and year labels.
  const puzzlePhotoTextures = Object.fromEntries(
    Object.entries(PUZZLE_PHOTO_URLS).map(([year, url]) => {
      const texture = new THREE.TextureLoader().load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return [year, texture];
    })
  );

  // ---------- scattered photographs + scratched floor message ----------
  // The third puzzle photo (used to live in a second nightstand drawer
  // wedged awkwardly against the bed/wall corner -- removed, see the
  // drawer system below) lies as one clear, loose photograph beside the
  // board. Keeping decorative duplicates out of this spot means nothing
  // visually or in the flat interaction target list can obscure this pickup.
  const tornPhotoTex = puzzlePhotoTextures[1986];
  const floorPhoto = new THREE.Mesh(
    new THREE.PlaneGeometry(PUZZLE_PHOTO_HEIGHT_METRES * PUZZLE_PHOTO_ASPECT_RATIO, PUZZLE_PHOTO_HEIGHT_METRES),
    new THREE.MeshStandardMaterial({ map: tornPhotoTex, roughness: 1, side: THREE.DoubleSide })
  );
  floorPhoto.name = 'Level1_1986FloorPhoto';
  floorPhoto.rotation.x = -Math.PI / 2;
  floorPhoto.rotation.z = -0.4;
  floorPhoto.position.set(-2.7, 0.018, -0.85);
  const floorPhotoHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.16, 0.25),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  floorPhotoHitbox.name = 'Level1_1986FloorPhotoHitbox';
  // This is the exact flat-raycast target; Interaction.js never traverses a
  // group, so the visible photo and its dedicated hitbox stay co-located.
  floorPhotoHitbox.position.set(floorPhoto.position.x, 0.09, floorPhoto.position.z);
  floorPhotoHitbox.userData.interact = {
    label: 'Pick up photograph',
    onInteract: () => {
      showCaption(line('dialog_pickup_floor_photo'));
      puzzleState.foundPhotos.add('floorPhoto');
      onPhotoCollected(puzzleState.foundPhotos.size);
      photoThumbMeshes.floorPhoto.visible = true;
      floorPhoto.visible = false;
      floorPhotoHitbox.visible = false;
      const idx = interactables.indexOf(floorPhotoHitbox);
      if (idx >= 0) interactables.splice(idx, 1);
    }
  };
  group.add(floorPhoto);
  group.add(floorPhotoHitbox);
  interactables.push(floorPhotoHitbox);

  // The fourth dated photograph lives beside the window/radiator. It pulls the
  // collection into a separate exploration zone without adding another puzzle
  // type; its 1984 stamp makes it the first photo in the board sequence.
  const windowPhotoTex = puzzlePhotoTextures[1984];
  const windowPhoto = new THREE.Mesh(
    new THREE.PlaneGeometry(PUZZLE_PHOTO_HEIGHT_METRES * PUZZLE_PHOTO_ASPECT_RATIO, PUZZLE_PHOTO_HEIGHT_METRES),
    new THREE.MeshStandardMaterial({ map: windowPhotoTex, roughness: 1, side: THREE.DoubleSide })
  );
  windowPhoto.name = 'Level1_1984RadiatorPhoto';
  const radiatorPhotoLeanRadians = -0.61;
  const radiatorPhotoHalfHeight = 0.17 / 2;
  const radiatorPhotoBottomY = 0.012;
  const radiatorPhotoBottomZ = radiatorGroup.position.z + 0.16;
  // The photo leans from the floor against the radiator's front face: its
  // lower edge rests on the boards and its upper edge meets the fins. This
  // gives it two obvious supports instead of a flat plane hovering on one rail.
  windowPhoto.position.set(
    WINDOW_POSITION_X,
    radiatorPhotoBottomY + radiatorPhotoHalfHeight * Math.cos(radiatorPhotoLeanRadians),
    radiatorPhotoBottomZ + radiatorPhotoHalfHeight * Math.sin(radiatorPhotoLeanRadians)
  );
  windowPhoto.rotation.set(radiatorPhotoLeanRadians, 0, 0);
  const windowPhotoHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.24, 0.05),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  windowPhotoHitbox.name = 'Level1_1984RadiatorPhotoHitbox';
  windowPhotoHitbox.position.copy(windowPhoto.position);
  windowPhotoHitbox.rotation.copy(windowPhoto.rotation);
  windowPhotoHitbox.userData.interact = {
    label: 'Pick up photograph',
    onInteract: () => {
      showCaption(line('dialog_pickup_radiator_photo'));
      puzzleState.foundPhotos.add('windowPhoto');
      onPhotoCollected(puzzleState.foundPhotos.size);
      photoThumbMeshes.windowPhoto.visible = true;
      windowPhoto.visible = false;
      windowPhotoHitbox.visible = false;
      const index = interactables.indexOf(windowPhotoHitbox);
      if (index >= 0) interactables.splice(index, 1);
    }
  };
  group.add(windowPhoto);
  group.add(windowPhotoHitbox);
  interactables.push(windowPhotoHitbox);

  const messageTex = createScratchedMessageTexture("DON'T LET IT OUT");
  const messageNormal = createScratchedMessageNormalTexture("DON'T LET IT OUT");
  const message = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.55),
    new THREE.MeshStandardMaterial({
      map: messageTex,
      normalMap: messageNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      transparent: true,
      alphaTest: 0.03,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })
  );
  message.name = 'Level1EtchedFloorWordsDecal';
  message.rotation.x = -Math.PI / 2;
  message.position.set(-0.85, 0.0025, -2.35);
  message.userData.interact = {
    label: 'Read the floor',
    onInteract: () => {
      // First read is the story beat; afterwards it is just a thing on the
      // floor, so re-examining does not replay the whole sequence.
      if (puzzleState.messageRead) {
        showCaption(line('dialog_scratches_examine'));
        return;
      }
      puzzleState.messageRead = true;
      onReadMessage();
    }
  };
  interactables.push(message);
  group.add(message);

  // ---------- flashlight prop (pickup handled by main.js via callback hook) ----------
  // Height matches the nightstand top below (0.72, close to the mattress's
  // own 0.74) -- was previously pinned to a knee-high 0.42 m table.
  // The prop is blender/build_flashlight.py -> flashlight.glb, replacing the
  // two primitive cylinders that used to stand in for it. Still a Group with
  // the same name and the same role, so the hitbox below, the refs block and
  // reset() are all untouched by the swap -- only what is inside the group
  // changed.
  //
  // Resting height, not the old 0.78: the nightstand's top slab is centred at
  // 0.78 and 0.04 thick, so its surface is at 0.80, and the placeholder was
  // sitting half sunk into it. 0.025 is the bezel radius, which is the widest
  // point and therefore what a torch lying on a table actually rests on, so
  // 0.825 puts it exactly flush.
  //
  // It also can no longer sit dead centre. The old placeholder was a 0.22 m
  // cylinder at the middle of the top, which was already clipping the lamp;
  // the real model has to thread between the lamp (back left), the alarm
  // clock (back right) and the book (front right). This spot is the one with
  // the largest clearance from all three -- 36 mm to the nearest, 40 mm
  // inside the table edge -- so the torch reads as set down in the free
  // corner rather than floating through the dressing.
  const flashlight = new THREE.Group();
  flashlight.position.set(BEDSIDE_TABLE_POSITION_X - 0.052, 0.836, BEDSIDE_TABLE_POSITION_Z + 0.076);
  // The model is authored beam-down-+Y per the socket convention in
  // systems/hands/sockets.js, i.e. standing on its tail. Rolling -90 degrees
  // about Z lays that axis into the horizontal plane, and the Y term then
  // aims it across the nightstand. Euler order is three's default XYZ, so Z
  // is applied first and Y swings the already-horizontal torch.
  flashlight.rotation.set(0, 0.873, -Math.PI / 2);
  group.add(flashlight);

  loadModel(flashlightModelUrl).then((flashlightModel) => {
    flashlightModel.traverse((child) => {
      if (!child.isMesh) return;
      child.receiveShadow = true;
      // Everything casts except the glass: TorchLens exports as alphaMode
      // BLEND, and a transparent caster is resolved against the shadow map as
      // if it were solid, which would stamp an opaque black disc across the
      // reflector it is supposed to be showing through.
      child.castShadow = child.material.name !== 'TorchLens';
    });
    flashlight.add(flashlightModel);
  }).catch((err) => {
    console.error('Failed to load flashlight.glb, the flashlight prop will be missing:', err);
  });

  // The flashlight's visual meshes are a THREE.Group, which has no
  // raycast of its own (Object3D.raycast is a no-op; only Mesh/Line/
  // Points implement one), and the interaction system intersects its
  // target list non-recursively -- so the group itself can never be
  // hit-tested. A generous invisible sphere sitting on top of it is the
  // actual interactable, which also makes picking it up far more
  // forgiving than aiming at the thin cylinder mesh underneath.
  const flashlightHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  flashlightHitbox.position.copy(flashlight.position);

  /** Registers the flashlight only once the cuff has actually released. */
  function setFlashlightPickupEnabled(enabled) {
    const hitboxIndex = interactables.indexOf(flashlightHitbox);
    if (enabled && hitboxIndex < 0) interactables.push(flashlightHitbox);
    if (!enabled && hitboxIndex >= 0) interactables.splice(hitboxIndex, 1);
  }

  flashlightHitbox.userData.interact = {
    label: 'Pick up flashlight',
    onInteract: () => {
      // Defence in depth: the hitbox is not registered while chained, but this
      // prevents a future caller from bypassing that interaction-state gate.
      if (!puzzleState.chainsEscaped) return;
      showCaption(line('dialog_pickup_flashlight'));
      flashlight.visible = false;
      flashlightHitbox.visible = false;
      const idx = interactables.indexOf(flashlightHitbox);
      if (idx >= 0) interactables.splice(idx, 1);
      onFlashlightPicked();
    }
  };
  group.add(flashlightHitbox);

  /* Legacy primitive dressing retained only as a source reference while the
   * active implementation below loads the authored, named bedside assets. */
  if (false) {
  // nightstand the flashlight sits on -- raised again to sit close to the
  // mattress's own top (0.74) rather than well below it, with a thin top
  // slab overhanging the legs rather than a single block, and small
  // clutter so it doesn't read as bare
  const sideTable = new THREE.Group();
  sideTable.position.set(BEDSIDE_TABLE_POSITION_X, 0, BEDSIDE_TABLE_POSITION_Z);
  group.add(sideTable);

  const tableLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.76, 0.04), frameMatWood);
  [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(([lx, lz]) => {
    const leg = tableLeg.clone();
    leg.position.set(lx, 0.38, lz);
    sideTable.add(leg);
  });
  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(BEDSIDE_TABLE_FOOTPRINT_METRES, 0.04, BEDSIDE_TABLE_FOOTPRINT_METRES),
    frameMatWood
  );
  tableTop.position.y = 0.78;
  tableTop.castShadow = true;
  sideTable.add(tableTop);

  // A lamp prop that reads as dead at a glance -- no steady glow, matching
  // the storyline's "one working bulb, and it blows out" beat -- but isn't
  // actually off. A loose wire somewhere in this old house's failing power
  // is feeding it just enough to flicker, and the flicker isn't random: it
  // blinks the digits of the nightstand drawer's combination (see
  // drawerPinDigits below), the way a bad connection actually would if you
  // stood and counted the pulses. bulbLight/bulbMat below are the parts
  // update() drives every frame; everything else is static dressing.
  const lampGroup = new THREE.Group();
  lampGroup.position.set(-0.11, 0.8, -0.09);
  sideTable.add(lampGroup);
  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.02, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2016, metalness: 0.4, roughness: 0.5 })
  );
  lampBase.position.y = 0.01;
  lampGroup.add(lampBase);
  const lampPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2016, metalness: 0.5, roughness: 0.4 })
  );
  lampPole.position.y = 0.12;
  lampGroup.add(lampPole);
  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 0.11, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x9c8858, roughness: 0.9, side: THREE.DoubleSide })
  );
  lampShade.position.y = 0.28;
  lampGroup.add(lampShade);

  // The bulb itself, visible through the open top/bottom of the shade
  // cylinder, plus a short-range point light so the flicker actually
  // lights the nightstand rather than just changing the mesh's own colour.
  // Both start at their dim/"off" values -- update() below pushes them up
  // for each pulse.
  const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb347, emissiveIntensity: 0.12 });
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), lampBulbMat);
  lampBulb.position.y = 0.24;
  lampGroup.add(lampBulb);
  const lampLight = new THREE.PointLight(0xffb347, 0.04, 1.6, 2);
  lampLight.position.y = 0.24;
  lampGroup.add(lampLight);
  const lampShockDurationSeconds = 0.32;
  const lampShockIntervalSeconds = 0.055;
  let lampShockRemainingSeconds = 0;

  /** Flashes the bedside lamp once without changing its repeating code clue. */
  function flashLamp() {
    lampShockRemainingSeconds = lampShockDurationSeconds;
  }

  // The combination for the drawer below, as a flicker pattern: three
  // pulses, a pause, one pulse, a pause, five pulses, a longer pause,
  // then it repeats. buildFlickerIntervals turns that digit list into
  // concrete [start,end) time windows within one repeating cycle, once,
  // rather than driving a hand-rolled counter/state-machine in update().
  const drawerPinDigits = [3, 1, 5];
  const drawerPinCode = drawerPinDigits.join('');

  function buildFlickerIntervals(digits, { pulseOn = 0.16, pulseOff = 0.22, digitPause = 1.0, cyclePause = 3.2 } = {}) {
    const intervals = [];
    let t = 0;
    digits.forEach((count) => {
      for (let i = 0; i < count; i++) {
        intervals.push([t, t + pulseOn]);
        t += pulseOn + pulseOff;
      }
      t += digitPause - pulseOff; // stretch the trailing gap into the longer between-digit pause
    });
    t += cyclePause - digitPause; // and again at the end, before the whole thing loops
    return { intervals, total: t };
  }
  const lampFlicker = buildFlickerIntervals(drawerPinDigits);

  // The lamp can be looked at, so a player who has noticed it flickering gets
  // told, in the room's own voice, that the flicker means something. A box
  // around the shade only: the flashlight's pickup sphere sits lower on the
  // same tabletop and the locked drawer's hitbox is below it.
  const lampHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.16, 0.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  lampHitbox.position.y = lampShade.position.y;
  lampHitbox.userData.interact = {
    label: 'Examine lamp',
    onInteract: () => showCaption(line('dialog_lamp_examine'))
  };
  lampGroup.add(lampHitbox);
  interactables.push(lampHitbox);

  const nightstandBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.03, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x5a3c2a, roughness: 0.9 })
  );
  nightstandBook.position.set(0.13, 0.795, 0.11);
  nightstandBook.rotation.y = 0.3;
  sideTable.add(nightstandBook);

  // a small twin-bell alarm clock, stopped -- the kind of clutter a
  // nightstand actually has beyond one lamp and one book
  const clockMetal = new THREE.MeshStandardMaterial({ color: 0x8a8060, metalness: 0.5, roughness: 0.5 });
  const clockGroup = new THREE.Group();
  clockGroup.position.set(0.14, 0.8, -0.13);
  sideTable.add(clockGroup);
  const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 14), clockMetal);
  clockBody.rotation.z = Math.PI / 2;
  clockBody.position.y = 0.05;
  clockGroup.add(clockBody);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.042, 16),
    new THREE.MeshStandardMaterial({ color: 0xe8dfc0, roughness: 0.7 })
  );
  clockFace.rotation.y = Math.PI / 2;
  clockFace.position.set(0.036, 0.05, 0);
  clockGroup.add(clockFace);
  [-1, 1].forEach((side) => {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), clockMetal);
    bell.position.set(0, 0.1, side * 0.035);
    clockGroup.add(bell);
  });

  // A locked drawer under the tabletop -- the payoff for reading the
  // lamp's flicker. Same drawer-front-plus-knob construction as the other
  // nightstand's addNightstand() above, just built inline since this one
  // needs its own pin-lock interaction instead of a free "search" one.
  const lampDrawerFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.7 })
  );
  lampDrawerFront.position.set(0, 0.6, 0.19);
  sideTable.add(lampDrawerFront);

  const lampDrawerKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a7a50, metalness: 0.6, roughness: 0.4 })
  );
  lampDrawerKnob.position.set(0, 0.6, 0.205);
  sideTable.add(lampDrawerKnob);

  // Small keyhole/lock plate under the knob -- a plain drawer front reads
  // as freely searchable like the other nightstand's, so this needs its
  // own visible "this one's locked" cue.
  const lampDrawerLock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, metalness: 0.7, roughness: 0.4 })
  );
  lampDrawerLock.rotation.x = Math.PI / 2;
  lampDrawerLock.position.set(0, 0.575, 0.205);
  sideTable.add(lampDrawerLock);

  const lampDrawerHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.24, 0.16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  lampDrawerHitbox.position.set(0, 0.6, 0.15);
  sideTable.add(lampDrawerHitbox);
  lampDrawerHitbox.userData.interact = {
    label: 'Locked drawer',
    onInteract: () => {
      if (drawerStates.lampDrawer.isOpen) {
        showCaption(line('dialog_lamp_drawer_empty'));
        return;
      }
      onExaminePinpad({
        length: drawerPinDigits.length,
        code: drawerPinCode,
        onSolved: () => {
          drawerStates.lampDrawer.isOpen = true;
          puzzleState.hasBrassKey = true;
          onBrassKeyFound();
          onDrawerUnlocked();
        }
      });
    }
  };
  interactables.push(lampDrawerHitbox);

  // Build this collider from the rendered tabletop's final world bounds rather
  // than reconstructing them from layout constants. sideTable is currently a
  // direct child of the bedroom group, but this remains correct if that parent
  // gains a transform later. SceneManager forwards this exact list to the
  // active PointerLockPlayer during bedroom activation.
  sideTable.updateMatrixWorld(true);
  const bedsideTableWorldBounds = new THREE.Box3().setFromObject(tableTop);
  const bedsideTableCollider = {
    minX: bedsideTableWorldBounds.min.x,
    maxX: bedsideTableWorldBounds.max.x,
    minZ: bedsideTableWorldBounds.min.z,
    maxZ: bedsideTableWorldBounds.max.z
  };
  colliders.push(bedsideTableCollider);
  }

  // ---------- Level 1 authored bedside puzzle visuals ----------
  // The gameplay state, PIN (315), callbacks and item IDs stay below exactly
  // as they were. These named GLB parts replace only the former primitive
  // presentation, and the drawer remains the parent of every moving visual.
  const LAMP_DRAWER_TRAVEL_METRES = 0.22;
  const LAMP_DRAWER_OPEN_SECONDS = 0.55;
  const LAMP_DRAWER_HITBOX_CLOSED_Z_METRES = 0.20;
  const LAMP_LIGHT_OFF_INTENSITY = 0;
  const LAMP_LIGHT_PULSE_INTENSITY = 0.8;
  const LAMP_LIGHT_SHOCK_INTENSITY = 1.1;
  const LAMP_LIGHT_RANGE_METRES = 1.25;
  const LAMP_BULB_OFF_EMISSIVE_INTENSITY = 0.005;
  const LAMP_BULB_PULSE_EMISSIVE_INTENSITY = 2.1;
  const LAMP_BULB_SHOCK_EMISSIVE_INTENSITY = 2.5;
  const LAMP_SHADE_OFF_EMISSIVE_INTENSITY = 0.015;
  const LAMP_SHADE_PULSE_EMISSIVE_INTENSITY = 0.85;
  const LAMP_SHADE_SHOCK_EMISSIVE_INTENSITY = 1.1;
  const LOCK_FALL_GRAVITY_METRES_PER_SECOND_SQUARED = 5.2;
  const LOCK_FALL_FLOOR_HEIGHT_METRES = 0.035;
  const sideTable = new THREE.Group();
  sideTable.name = 'Level1_BedsidePuzzleTable';
  sideTable.position.set(BEDSIDE_TABLE_POSITION_X, 0, BEDSIDE_TABLE_POSITION_Z);
  group.add(sideTable);

  // The broad cabinet footprint is intentionally the only collider; small
  // props, the falling lock and the open drawer do not add collision noise.
  const bedsideTableCollider = {
    minX: BEDSIDE_TABLE_POSITION_X - 0.25,
    maxX: BEDSIDE_TABLE_POSITION_X + 0.25,
    minZ: BEDSIDE_TABLE_POSITION_Z - 0.25,
    maxZ: BEDSIDE_TABLE_POSITION_Z + 0.25
  };
  colliders.push(bedsideTableCollider);

  let lampDrawerVisual = null;
  let lampDrawerClosedPosition = null;
  let lampDrawerProgress = 0;
  let lampDrawerMotion = 0;
  let lampDrawerLockAnchor = null;
  let lampDrawerContentsAnchor = null;
  let lampDrawerLockVisual = null;
  let lampDrawerKeyVisual = null;
  let lampDrawerNoteVisual = null;
  let lampDrawerKeyHitbox = null;
  let lampDrawerNoteHitbox = null;
  let lampDrawerLockFalling = false;
  let lampDrawerLockVelocityY = 0;

  function setLampDrawerContentsVisible(visible) {
    const contentsVisible = visible && drawerStates.lampDrawer.isOpen;
    if (lampDrawerKeyVisual && !puzzleState.hasBrassKey) lampDrawerKeyVisual.visible = contentsVisible;
    if (lampDrawerNoteVisual) lampDrawerNoteVisual.visible = contentsVisible;
    if (lampDrawerKeyHitbox) lampDrawerKeyHitbox.visible = contentsVisible && !puzzleState.hasBrassKey;
    if (lampDrawerNoteHitbox) lampDrawerNoteHitbox.visible = contentsVisible;
    [lampDrawerKeyHitbox, lampDrawerNoteHitbox].forEach((hitbox) => {
      if (!hitbox) return;
      const index = interactables.indexOf(hitbox);
      if (hitbox.visible && index < 0) interactables.push(hitbox);
      if (!hitbox.visible && index >= 0) interactables.splice(index, 1);
    });
  }

  function startLampDrawerLockFall() {
    if (!lampDrawerLockVisual || lampDrawerLockFalling) return;
    // Object3D.attach preserves the locked visual's current world transform
    // while moving it out of the animated drawer hierarchy.
    sideTable.attach(lampDrawerLockVisual);
    lampDrawerLockFalling = true;
    lampDrawerLockVelocityY = 0;
  }

  function restoreLampDrawerLock() {
    if (!lampDrawerLockVisual || !lampDrawerLockAnchor) return;
    lampDrawerLockAnchor.attach(lampDrawerLockVisual);
    lampDrawerLockVisual.position.set(0, 0, 0);
    lampDrawerLockVisual.rotation.set(0, 0, 0);
    lampDrawerLockVisual.visible = true;
    lampDrawerLockFalling = false;
    lampDrawerLockVelocityY = 0;
  }

  loadModel(bedsidePuzzleTableModelUrl).then((tableModel) => {
    tableModel.name = 'Level1BedsidePuzzleTableVisual';
    tableModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    lampDrawerVisual = tableModel.getObjectByName('Level1BedsideDrawer');
    lampDrawerLockAnchor = tableModel.getObjectByName('Level1DrawerLockAnchor');
    lampDrawerContentsAnchor = tableModel.getObjectByName('Level1DrawerContentsAnchor');
    lampDrawerKeyVisual = tableModel.getObjectByName('Level1DrawerBrassKey');
    if (!lampDrawerVisual || !lampDrawerLockAnchor || !lampDrawerContentsAnchor || !lampDrawerKeyVisual) {
      throw new Error('Level 1 bedside table is missing a required drawer hierarchy node.');
    }
    lampDrawerClosedPosition = lampDrawerVisual.position.clone();
    sideTable.add(tableModel);
    if (lampDrawerLockVisual && !lampDrawerLockVisual.parent) {
      lampDrawerLockAnchor.add(lampDrawerLockVisual);
    }
    if (lampDrawerNoteVisual && lampDrawerNoteHitbox && !lampDrawerNoteVisual.parent) {
      lampDrawerNoteVisual.add(lampDrawerNoteHitbox);
      lampDrawerContentsAnchor.add(lampDrawerNoteVisual);
    }

    lampDrawerKeyHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.045, 0.06),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    lampDrawerKeyHitbox.name = 'Level1DrawerBrassKeyInteraction';
    lampDrawerKeyHitbox.position.set(-0.075, 0.02, 0.025);
    lampDrawerKeyHitbox.userData.interact = {
      label: 'Pick up brass key',
      priority: 10,
      onInteract: () => {
        if (!drawerStates.lampDrawer.isOpen || puzzleState.hasBrassKey) return;
        puzzleState.hasBrassKey = true;
        lampDrawerKeyVisual.visible = false;
        lampDrawerKeyHitbox.visible = false;
        const index = interactables.indexOf(lampDrawerKeyHitbox);
        if (index >= 0) interactables.splice(index, 1);
        onBrassKeyFound();
      }
    };
    lampDrawerContentsAnchor.add(lampDrawerKeyHitbox);
    setLampDrawerContentsVisible(lampDrawerProgress === 1);
  }).catch((error) => console.error('Could not load the Level 1 bedside puzzle table:', error));

  loadModel(bedsideCombinationLockModelUrl).then((lockModel) => {
    lampDrawerLockVisual = lockModel;
    lampDrawerLockVisual.name = 'Level1DrawerCombinationLockVisual';
    if (lampDrawerLockAnchor) lampDrawerLockAnchor.add(lampDrawerLockVisual);
  }).catch((error) => console.error('Could not load the Level 1 drawer combination lock:', error));

  loadModel(projectHollowDrawerNoteModelUrl).then((noteModel) => {
    lampDrawerNoteVisual = noteModel;
    lampDrawerNoteVisual.name = 'Level1ProjectHollowDrawerNoteVisual';
    // Leave an even margin inside the 31cm drawer tray, so the full archive
    // sheet remains visible and reachable after the drawer has opened.
    lampDrawerNoteVisual.position.set(0.052, 0.014, 0.006);
    lampDrawerNoteVisual.rotation.y = -0.08;
    lampDrawerNoteVisual.scale.setScalar(0.78);
    lampDrawerNoteVisual.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    lampDrawerNoteHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.06, 0.15),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    lampDrawerNoteHitbox.name = 'Level1ProjectHollowDrawerNoteInteraction';
    lampDrawerNoteHitbox.position.set(0, 0.018, 0);
    lampDrawerNoteHitbox.userData.interact = {
      label: 'Read PROJECT HOLLOW note',
      priority: 10,
      onInteract: () => {
        if (!drawerStates.lampDrawer.isOpen) return;
        onReadDrawerClue();
      }
    };
    if (lampDrawerContentsAnchor) {
      lampDrawerNoteVisual.add(lampDrawerNoteHitbox);
      lampDrawerContentsAnchor.add(lampDrawerNoteVisual);
      setLampDrawerContentsVisible(lampDrawerProgress === 1);
    }
  }).catch((error) => console.error('Could not load the PROJECT HOLLOW drawer note:', error));

  const lampGroup = new THREE.Group();
  lampGroup.name = 'Level1BedsideLampVisual';
  lampGroup.position.set(-0.13, 0.81, -0.11);
  sideTable.add(lampGroup);
  const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb347, emissiveIntensity: 0.12 });
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), lampBulbMat);
  lampBulb.position.y = 0.385;
  lampGroup.add(lampBulb);
  // A compact unshadowed point light supports the pulse without washing the
  // nearby wall. The emissive bulb remains the primary readable signal.
  const lampLight = new THREE.PointLight(0xffb347, LAMP_LIGHT_OFF_INTENSITY, LAMP_LIGHT_RANGE_METRES, 2);
  lampLight.position.y = 0.385;
  lampGroup.add(lampLight);
  let lampShadeMaterial = null;
  loadModel(bedsideLampModelUrl).then((lampModel) => {
    lampModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.name !== 'LampShade' || !child.material?.emissive) return;
      lampShadeMaterial = child.material.clone();
      lampShadeMaterial.emissive.setHex(0xffa64d);
      lampShadeMaterial.emissiveIntensity = LAMP_SHADE_OFF_EMISSIVE_INTENSITY;
      child.material = lampShadeMaterial;
    });
    lampGroup.add(lampModel);
  }).catch((error) => console.error('Could not load the Level 1 bedside lamp:', error));

  const lampShockDurationSeconds = 0.32;
  const lampShockIntervalSeconds = 0.055;
  let lampShockRemainingSeconds = 0;
  function flashLamp() { lampShockRemainingSeconds = lampShockDurationSeconds; }
  const drawerPinDigits = [3, 1, 5];
  const drawerPinCode = drawerPinDigits.join('');
  function buildFlickerIntervals(digits, { pulseOn = 0.16, pulseOff = 0.22, digitPause = 1.0, cyclePause = 3.2 } = {}) {
    const intervals = [];
    let elapsedSeconds = 0;
    digits.forEach((count) => {
      for (let index = 0; index < count; index++) {
        intervals.push([elapsedSeconds, elapsedSeconds + pulseOn]);
        elapsedSeconds += pulseOn + pulseOff;
      }
      elapsedSeconds += digitPause - pulseOff;
    });
    elapsedSeconds += cyclePause - digitPause;
    return { intervals, total: elapsedSeconds };
  }
  const lampFlicker = buildFlickerIntervals(drawerPinDigits);

  const clockGroup = new THREE.Group();
  clockGroup.name = 'Level1AlarmClockVisual';
  clockGroup.position.set(0.13, 0.81, -0.12);
  sideTable.add(clockGroup);
  loadModel(bedsideAlarmClockModelUrl).then((clockModel) => {
    clockModel.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    clockGroup.add(clockModel);
  }).catch((error) => console.error('Could not load the Level 1 alarm clock:', error));

  const bookGroup = new THREE.Group();
  bookGroup.name = 'Level1WornNotebookVisual';
  bookGroup.position.set(0.12, 0.813, 0.105);
  bookGroup.rotation.y = 0.3;
  sideTable.add(bookGroup);
  const bedsideJournalHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.06, 0.14),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  bedsideJournalHitbox.name = 'Level1BedsideJournalInteraction';
  bedsideJournalHitbox.position.y = 0.025;
  bedsideJournalHitbox.userData.interact = {
    label: 'Examine old journal',
    priority: 5,
    onInteract: () => showCaption("An old journal. Whoever was in here must've kept accounts.")
  };
  bookGroup.add(bedsideJournalHitbox);
  interactables.push(bedsideJournalHitbox);
  loadModel(bedsideWornNotebookModelUrl).then((bookModel) => {
    bookModel.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    bookGroup.add(bookModel);
  }).catch((error) => console.error('Could not load the Level 1 worn notebook:', error));

  const lampDrawerHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.40, 0.23, 0.18),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  lampDrawerHitbox.name = 'Level1BedsideDrawerInteraction';
  lampDrawerHitbox.position.set(0, 0.61, LAMP_DRAWER_HITBOX_CLOSED_Z_METRES);
  lampDrawerHitbox.userData.interact = {
    label: 'Locked drawer',
    onInteract: () => {
      if (lampDrawerMotion !== 0 || !lampDrawerVisual) return;
      if (drawerStates.lampDrawer.isOpen) {
        drawerStates.lampDrawer.isOpen = false;
        lampDrawerMotion = -1;
        setLampDrawerContentsVisible(false);
        showCaption('The drawer slides shut.');
        return;
      }
      if (drawerStates.lampDrawer.isUnlocked) {
        drawerStates.lampDrawer.isOpen = true;
        lampDrawerMotion = 1;
        showCaption('The unlocked drawer slides open.');
        return;
      }
      onExaminePinpad({
        length: drawerPinDigits.length,
        code: drawerPinCode,
        onSolved: () => {
          if (drawerStates.lampDrawer.isOpen) return;
          drawerStates.lampDrawer.isUnlocked = true;
          drawerStates.lampDrawer.isOpen = true;
          lampDrawerMotion = 1;
          lampDrawerHitbox.userData.interact.label = 'Open/close drawer';
          startLampDrawerLockFall();
          onDrawerUnlocked();
        }
      });
    }
  };
  sideTable.add(lampDrawerHitbox);
  interactables.push(lampDrawerHitbox);

  // ---------- paperclip, on the blanket within reach of the cuffed hand ----------
  //
  // WHY IT USED TO BE INVISIBLE, since the previous two attempts both got this
  // wrong: it was never a material or a lighting problem. The spawn point
  // (1.65, -1.4) is inside the bed's footprint (x 0.9..2.4, z -2.9..-0.9)
  // -- there is no bed collider, so the player wakes up standing in it -- and
  // from that eye position the sightline to the old floor spot passed straight
  // through the blanket, then the mattress, then the bed base. Interaction
  // raycasts only the interactables list (Interaction.js), so nothing occludes
  // the hitbox and E kept working while the player was looking at red blanket.
  // That mismatch is the whole "interactable but invisible" signature.
  //
  // This spot was chosen by ray-marching the sightline from the spawn eye
  // against every solid on the bed (blanket slab, the three ridge bumps, the
  // mattress, the base, the left rail, the headboard and both pillow
  // ellipsoids). At y 0.80 / z -1.95 the clear band runs the full 140cm width
  // of the bed; the bare mattress at the head end, which is where this
  // obviously wants to go, has only an 8-13cm slot beside the near pillow and
  // would break the moment anyone nudged the pillow.
  //
  // 1.29m from the eye, 38 degrees below the horizon -- which is past the 35
  // degree half-FOV, so the bedroom also sets a spawnPitch (see the returned
  // contract) to wake the player looking slightly down. That is the right beat
  // anyway: you come to cuffed to a bed, so you look at your own hand.
  //
  // 0.56m from the cuff at (1.90, 0.98, -2.35), i.e. inside the reach of the
  // hand that is actually chained -- the old floor position was 1.23m away and
  // under the bed frame, which no cuffed person could have got to.
  const paperclip = new THREE.Group();
  // The hitbox below copies this transform, keeping the usable target aligned
  // with the actual wire while preserving the original reachable X/Z location.
  paperclip.position.set(
    BED_POSITION_X + PAPERCLIP_POSITION_X_OFFSET_METRES,
    PAPERCLIP_RESTING_HEIGHT_METRES,
    BED_POSITION_Z + PAPERCLIP_POSITION_Z_OFFSET_METRES
  );
  paperclip.rotation.y = 0.7;
  paperclip.scale.setScalar(PAPERCLIP_SCALE);
  group.add(paperclip);

  // One open, continuous bent wire forms the recognisable outer loop and
  // folded-in return of an ordinary Gem paperclip. Keeping the curve open is
  // important: closing the tube draws a spurious diagonal across the opening.
  const CLIP_HALF_LENGTH_METRES = 0.017;
  const CLIP_OUTER_HALF_WIDTH_METRES = 0.0055;
  const CLIP_INNER_HALF_WIDTH_METRES = 0.0032;
  const clipPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-CLIP_INNER_HALF_WIDTH_METRES * 0.55, 0, -CLIP_HALF_LENGTH_METRES * 0.72),
    new THREE.Vector3(-CLIP_INNER_HALF_WIDTH_METRES, 0, -CLIP_HALF_LENGTH_METRES * 0.40),
    new THREE.Vector3(-CLIP_INNER_HALF_WIDTH_METRES, 0, CLIP_HALF_LENGTH_METRES * 0.48),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES * 0.68, 0, CLIP_HALF_LENGTH_METRES * 0.78),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES, 0, CLIP_HALF_LENGTH_METRES * 0.52),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES, 0, -CLIP_HALF_LENGTH_METRES * 0.68),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES * 0.55, 0, -CLIP_HALF_LENGTH_METRES),
    new THREE.Vector3(0, 0, -CLIP_HALF_LENGTH_METRES),
    new THREE.Vector3(CLIP_OUTER_HALF_WIDTH_METRES * 0.55, 0, -CLIP_HALF_LENGTH_METRES),
    new THREE.Vector3(CLIP_OUTER_HALF_WIDTH_METRES, 0, -CLIP_HALF_LENGTH_METRES * 0.68),
    new THREE.Vector3(CLIP_OUTER_HALF_WIDTH_METRES, 0, CLIP_HALF_LENGTH_METRES * 0.58),
    new THREE.Vector3(CLIP_OUTER_HALF_WIDTH_METRES * 0.58, 0, CLIP_HALF_LENGTH_METRES * 0.94),
    new THREE.Vector3(0, 0, CLIP_HALF_LENGTH_METRES),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES * 0.58, 0, CLIP_HALF_LENGTH_METRES * 0.94),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES * 0.68, 0, CLIP_HALF_LENGTH_METRES * 0.62),
    new THREE.Vector3(-CLIP_OUTER_HALF_WIDTH_METRES * 0.68, 0, -CLIP_HALF_LENGTH_METRES * 0.42),
    new THREE.Vector3(-CLIP_INNER_HALF_WIDTH_METRES * 0.55, 0, -CLIP_HALF_LENGTH_METRES * 0.72)
  ], false, 'centripetal', 0.5);

  // Nickel-plated steel wire. A high metalness is only correct here because
  // main.js now installs an environment for metal to reflect -- this same
  // material at 0.7 metalness was rendering near-black back when the scene had
  // no environment at all, since a MeshStandardMaterial sends roughly
  // `metalness` of its response to a reflection and there was nothing there.
  //
  // The colour on a metal is the SPECULAR tint, not a diffuse albedo: a slightly
  // cool near-white is what reads as plated steel rather than as gold or copper.
  //
  // A trace of emissive, and no more. It is the only non-light-source emissive
  // in the project and it exists purely so a thin wire keeps an edge alive when
  // the bulb is behind it -- push it any higher and the surface goes flat and
  // stops looking like metal at all, because emission is view-independent and
  // metal is nothing but view-dependent reflection.
  const paperclipMat = new THREE.MeshStandardMaterial({
    color: 0xd5d7d4,
    metalness: 0.92,
    roughness: 0.29,
    emissive: 0x1d1e1c,
    emissiveIntensity: 0.10
  });
  const paperclipWire = new THREE.Mesh(
    new THREE.TubeGeometry(clipPath, 72, PAPERCLIP_WIRE_RADIUS, 8, false),
    paperclipMat
  );
  paperclipWire.castShadow = true;
  paperclipWire.receiveShadow = true;
  paperclipWire.frustumCulled = false;
  paperclipWire.visible = true;
  paperclip.add(paperclipWire);

  // The wire is 1.6mm thick, so the ray would have to thread the tube itself to
  // register -- effectively unclickable. A padded invisible sphere is the real
  // interactable, same approach as the flashlight. Derived from the same
  // constant as the model so the two can never drift apart: turning
  // PAPERCLIP_SCALE up must grow what you aim at, not just what you see.
  const paperclipHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.055 + 0.03 * PAPERCLIP_SCALE, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  paperclipHitbox.position.copy(paperclip.position);
  paperclipHitbox.userData.interact = {
    label: 'Pick up paperclip',
    onInteract: () => {
      // Into the inventory, and into the hand -- it is not used yet. Using it is
      // a second, deliberate press on the cuff, which only exists from here on.
      paperclip.visible = false;
      paperclipHitbox.visible = false;
      const idx = interactables.indexOf(paperclipHitbox);
      if (idx >= 0) interactables.splice(idx, 1);
      if (!interactables.includes(cuffLockHitbox)) interactables.push(cuffLockHitbox);
      onPaperclipPicked();
      showCaption(line('dialog_pickup_paperclip'));
    }
  };
  interactables.push(paperclipHitbox);
  group.add(paperclipHitbox);

  /**
   * The cuff's lock, which the paperclip is used ON.
   *
   * NOT AT THE CUFF, and that is measured rather than lazy. The cuff ring really
   * sits at about (2.15, 0.82, -1.54) -- bed-local (0.495, 0.82, 0.36), the
   * chain's run end -- which is some 74 degrees to the right of the restrained
   * view's forward axis. BEDROOM_RESTRAINED_LOOK_BOUNDS in main.js lets the
   * chained player turn at most about 3 degrees right of -Z, and Interaction
   * casts from the centre of the screen, so a hitbox on the cuff could never be
   * aimed at; the same goes for every link of the run back to the headboard.
   * (The "(1.90, 0.98, -2.35)" quoted for the cuff above the paperclip is from
   * an older chain layout.)
   *
   * So it sits where the paperclip was: in the middle of the bounded view, at
   * exactly the spot the player is already looking at when they pick the clip
   * up -- the prompt simply changes under the crosshair from "Pick up
   * paperclip" to "Pick the cuff lock". A little larger than the clip's own
   * hitbox, since there is nothing small left there to aim at.
   */
  const cuffLockHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  cuffLockHitbox.name = 'CuffLockInteraction';
  cuffLockHitbox.position.copy(paperclip.position);
  cuffLockHitbox.userData.interact = {
    label: 'Pick the cuff lock',
    onInteract: () => {
      // Once only: E spammed through the 900 ms below must not restart it.
      if (puzzleState.chainsEscaped || freeTimer) return;
      if (!isHolding('paperclip')) {
        showCaption(line('dialog_cuff_hold_paperclip'));
        return;
      }
      onPaperclipUsed();
      showCaption(line('dialog_paperclip_unlocks_cuff'));
      const idx = interactables.indexOf(cuffLockHitbox);
      if (idx >= 0) interactables.splice(idx, 1);
      chain.visible = false;
      restraintRemnant.visible = true;
      // TRACKED, like the door's exit timer below. A bare setTimeout here
      // meant pressing R inside the 900 ms window fired onFreed against the
      // freshly restarted room -- unchaining a player who is supposed to be
      // chained and starting the bulb beat on a game that had just reset.
      freeTimer = setTimeout(() => {
        freeTimer = null;
        puzzleState.chainsEscaped = true;
        setFlashlightPickupEnabled(true);
        onFreed();
      }, 900);
    }
  };
  // Registered by the paperclip pickup above, not here: before then there is
  // nothing to pick the lock with, and the clip's own prompt owns this spot.
  group.add(cuffLockHitbox);

  /**
   * The fallen chair -- which had no legs.
   *
   * A seat slab and a back slab, tipped on their side. Lying down, that is two
   * planks on the floor, and the one piece of dressing whose whole job is to say
   * "somebody left in a hurry" read as debris. It also sat low enough that the
   * seat's corner passed through the floorboards.
   *
   * Four turned legs and a pair of stretchers now, and the group is lifted so
   * the lowest point of the rotated frame rests ON the boards rather than in
   * them. Lying on its side is exactly the pose that shows a chair's legs off,
   * which is why it was the worst place in the room to leave them out.
   */
  const chairGroup = new THREE.Group();
  chairGroup.name = 'Level1ChairVisualHost';
  chairGroup.rotation.set(0, 0.6, Math.PI / 2.2);
  group.add(chairGroup);
  chairGroup.position.set(CHAIR_POSITION_X, 0, CHAIR_POSITION_Z);
  const chairRestPosition = chairGroup.position.clone();
  const chairRestRotation = chairGroup.rotation.clone();
  loadModel(level1ChairRemodelUrl).then((chairVisual) => {
    chairVisual.name = 'Level1ChairRemodelVisual';
    chairVisual.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    chairGroup.add(chairVisual);
    chairGroup.updateMatrixWorld(true);
    const chairBounds = new THREE.Box3().setFromObject(chairGroup);
    chairGroup.position.y += Math.max(0, -chairBounds.min.y) + 0.004;
    chairRestPosition.copy(chairGroup.position);
  }).catch((error) => console.error('Could not load the Level 1 chair remodel:', error));

  /** A small, local shift that reads as uncertain memory rather than a teleport. */
  function disturbChair() {
    chairGroup.position.x = chairRestPosition.x + 0.08;
    chairGroup.position.z = chairRestPosition.z - 0.05;
    chairGroup.rotation.y = chairRestRotation.y + 0.16;
  }

  // ---------- tipped waste bin (abandoned-in-a-hurry dressing) ----------
  const bin = new THREE.Group();
  bin.name = 'Level1WastebasketVisualHost';
  bin.position.set(BIN_POSITION_X, 0.11, BIN_POSITION_Z);
  const binRestRotationY = 0.3;
  const binRestRotationZ = Math.PI / 2 + 0.12;
  bin.rotation.set(0, binRestRotationY, binRestRotationZ);
  group.add(bin);
  loadModel(level1WastebasketRemodelUrl).then((wastebasketVisual) => {
    wastebasketVisual.name = 'Level1WastebasketRemodelVisual';
    wastebasketVisual.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    bin.add(wastebasketVisual);
  }).catch((error) => console.error('Could not load the Level 1 wastebasket remodel:', error));
  const binRestPosition = bin.position.clone();
  const binPapers = [];
  const binPaperRestPositions = [];

  /** A resettable nudge and one displaced paper for the two-photo beat. */
  function disturbBin() {
    bin.position.set(binRestPosition.x - 0.09, binRestPosition.y, binRestPosition.z + 0.06);
    bin.rotation.set(0, binRestRotationY + 0.36, binRestRotationZ + 0.08);
    const displacedPaper = binPapers[0];
    const displacedPaperRestPosition = binPaperRestPositions[0];
    if (displacedPaper && displacedPaperRestPosition) {
      displacedPaper.position.set(
        displacedPaperRestPosition.x - 0.16,
        displacedPaperRestPosition.y,
        displacedPaperRestPosition.z + 0.09
      );
    }
  }

  // A few authored paper-ball instances keep the existing reset and movement
  // positions while replacing only their former primitive visuals.
  [[-0.25, 0.025, -0.20], [0.02, 0.025, -0.32], [-0.18, 0.025, 0.15], [-0.45, 0.025, 0.05]].forEach(([dx, y, dz]) => {
    const paper = new THREE.Group();
    paper.name = 'Level1CrumpledPaperBallHost';
    paper.position.set(BIN_POSITION_X + dx, y, BIN_POSITION_Z + dz);
    paper.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    group.add(paper);
    binPapers.push(paper);
    binPaperRestPositions.push(paper.position.clone());
  });
  loadModel(level1CrumpledPaperBallUrl).then((paperBallVisual) => {
    paperBallVisual.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    binPapers.forEach((paper, index) => {
      const paperVisual = index === 0 ? paperBallVisual : paperBallVisual.clone(true);
      paperVisual.name = `Level1CrumpledPaperBallVisual_${index + 1}`;
      paper.add(paperVisual);
    });
  }).catch((error) => console.error('Could not load the Level 1 crumpled paper remodel:', error));

  // ---------- cobwebs in neglected ceiling corners -- nobody's cleaned
  // this house in a long time, and it's a cheap detail no normal-mapped
  // wall/floor texture pass covers on its own ----------
  function addCobweb(x, y, z, rotY, tiltX = -0.3, tiltZ = 0.3) {
    const web = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshStandardMaterial({ map: createCobwebTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1 })
    );
    web.position.set(x, y, z);
    web.rotation.set(tiltX, rotY, tiltZ);
    group.add(web);
  }
  addCobweb(-ROOM_W / 2 + 0.08, ROOM_H - 0.15, -ROOM_D / 2 + 0.08, Math.PI / 4);
  addCobweb(ROOM_W / 2 - 0.08, ROOM_H - 0.15, ROOM_D / 2 - 0.08, Math.PI / 4 + Math.PI);
  addCobweb(-ROOM_W / 2 + 0.08, ROOM_H - 0.15, ROOM_D / 2 - 0.08, -Math.PI / 4, -0.3, -0.3);
  addCobweb(ROOM_W / 2 - 0.08, ROOM_H - 0.15, -ROOM_D / 2 + 0.08, -Math.PI / 4 + Math.PI, -0.3, -0.3);
  // a smaller one low in the corner behind the dresser -- webs collect at
  // floor level in undisturbed corners just as much as up at the ceiling
  addCobweb(ROOM_W / 2 - 0.06, 0.12, ROOM_D / 2 - 0.06, Math.PI / 4 + Math.PI, 0.3, -0.3);

  // A larger Blender-authored rug sits diagonally in the open floor area.
  // Only its separate corner overlaps the loose board's existing puzzle spot.
  const rugGroup = new THREE.Group();
  rugGroup.position.set(-0.60, 0.006, 0.54);
  rugGroup.rotation.y = THREE.MathUtils.degToRad(25);
  group.add(rugGroup);
  const rugFoldAxis = new THREE.Vector3(-1, 0, -1).normalize();
  const rugFoldAngle = THREE.MathUtils.degToRad(150);
  const rugFoldDurationSeconds = 0.65;
  let rugFoldCorner = null;
  let rugCornerOpen = false;
  let rugCornerOpening = false;
  let rugFoldProgress = 0;
  const rugCornerHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.12, 0.62),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  rugCornerHitbox.name = 'RugFoldCornerInteraction';
  rugCornerHitbox.position.set(-1.55, 0.09, 2.30);
  rugCornerHitbox.visible = false;
  group.add(rugCornerHitbox);
  rugCornerHitbox.userData.interact = {
    label: 'Lift rug corner',
    onInteract: () => {
      if (!rugFoldCorner || rugCornerOpening || rugCornerOpen) return;
      rugCornerOpening = true;
      rugCornerHitbox.visible = false;
      const index = interactables.indexOf(rugCornerHitbox);
      if (index >= 0) interactables.splice(index, 1);
      showCaption(line('dialog_rug_folded_back'));
    }
  };
  loadModel(victorianRugModelUrl).then((rugModel) => {
    rugFoldCorner = rugModel.getObjectByName('RugFoldCorner');
    if (!rugFoldCorner || !rugModel.getObjectByName('RugMain')) {
      throw new Error('Victorian rug is missing RugMain or RugFoldCorner');
    }
    rugModel.traverse((child) => {
      if (child.isMesh) child.receiveShadow = true;
    });
    rugGroup.add(rugModel);
    rugFoldCorner.quaternion.setFromAxisAngle(rugFoldAxis, rugFoldAngle * rugFoldProgress);
    rugCornerHitbox.visible = !rugCornerOpen && !rugCornerOpening;
    if (rugCornerHitbox.visible && !interactables.includes(rugCornerHitbox)) interactables.push(rugCornerHitbox);
  }).catch((error) => console.error('Could not load Victorian rug:', error));

  // The loose board sits partly beneath the rug corner. Folding that corner
  // reveals its existing crowbar interaction and the same key reward.
  const looseFloorboard = new THREE.Group();
  looseFloorboard.name = 'Level1LooseFloorboardVisualHost';
  looseFloorboard.position.set(-1.55, 0.013, 2.3);
  looseFloorboard.visible = false;
  group.add(looseFloorboard);

  // The remodel is the same 72 cm board footprint as the old interaction,
  // with UVs sampling the matching patch from the room's existing floor map.
  // That preserves the floor's grain direction and darkness without adding a
  // second wood bitmap to the game.
  const looseBoardTexture = floorTex.clone();
  looseBoardTexture.repeat.set(0.216, 0.0933);
  looseBoardTexture.offset.set(0.327, 0.86);
  looseBoardTexture.needsUpdate = true;
  loadModel(looseFloorboardRemodelUrl).then((floorboardModel) => {
    floorboardModel.name = 'Level1LooseFloorboardRemodelVisual';
    applyTextureByMaterialName(floorboardModel, 'LooseFloorboardWood', looseBoardTexture);
    floorboardModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    looseFloorboard.add(floorboardModel);
  }).catch((error) => console.error('Could not load the Level 1 loose floorboard remodel:', error));

  const looseFloorboardHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.16, 0.36),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  looseFloorboardHitbox.position.copy(looseFloorboard.position);
  looseFloorboardHitbox.userData.interact = {
    label: 'Examine loose floorboard',
    onInteract: () => {
      if (!puzzleState.hasCrowbar) {
        showCaption(line('dialog_floorboard_needs_crowbar'));
        return;
      }
      // Found is not enough: it has to be the thing in your hand.
      if (!isHolding('crowbar')) {
        showCaption(line('dialog_hold_crowbar'));
        return;
      }
      puzzleState.floorboardPried = true;
      looseFloorboard.visible = false;
      looseFloorboardHitbox.visible = false;
      const floorboardIndex = interactables.indexOf(looseFloorboardHitbox);
      if (floorboardIndex >= 0) interactables.splice(floorboardIndex, 1);
      bedroomKey.visible = true;
      bedroomKeyHitbox.visible = true;
      if (!interactables.includes(bedroomKeyHitbox)) interactables.push(bedroomKeyHitbox);
      onFloorboardOpened();
      showCaption(line('dialog_floorboard_pried_up'));
    }
  };
  group.add(looseFloorboardHitbox);
  looseFloorboardHitbox.visible = false;

  const bedroomKey = new THREE.Group();
  bedroomKey.position.set(-1.55, 0.07, 2.3);
  bedroomKey.rotation.y = 0.5;
  bedroomKey.visible = false;
  const bedroomKeyMetal = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.8, roughness: 0.35 });
  const bedroomKeyShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), bedroomKeyMetal);
  bedroomKeyShaft.rotation.z = Math.PI / 2;
  bedroomKey.add(bedroomKeyShaft);
  const bedroomKeyBow = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 12), bedroomKeyMetal);
  bedroomKeyBow.position.x = -0.08;
  bedroomKey.add(bedroomKeyBow);
  const bedroomKeyBit = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.03), bedroomKeyMetal);
  bedroomKeyBit.position.set(0.07, -0.018, 0);
  bedroomKey.add(bedroomKeyBit);
  group.add(bedroomKey);

  const bedroomKeyHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  bedroomKeyHitbox.position.copy(bedroomKey.position);
  bedroomKeyHitbox.visible = false;
  bedroomKeyHitbox.userData.interact = {
    label: 'Pick up bedroom key',
    onInteract: () => {
      puzzleState.hasBedroomKey = true;
      bedroomKey.visible = false;
      bedroomKeyHitbox.visible = false;
      const keyIndex = interactables.indexOf(bedroomKeyHitbox);
      if (keyIndex >= 0) interactables.splice(keyIndex, 1);
      onBedroomKeyFound();
      showCaption(line('dialog_pickup_bedroom_key'));
    }
  };
  group.add(bedroomKeyHitbox);

  interactables.push(doorSlab);

  /**
   * Trying the door while it is still locked. The first try in each state says
   * what is wrong with it (the planks, then the missing key); every try after
   * that is the player muttering one of the "still locked" takes, at random and
   * never the same twice running -- the same sentence on every press of E is a
   * recording, not a person. Only the takes that make sense now are offered:
   * the one about the planks while they are on, the one about the key once
   * they are off.
   */
  const lockedTries = { planks: 0, key: 0 };
  const pickLockedLine = linePicker([
    'dialog_open_door_locked_1', 'dialog_open_door_locked_2', 'dialog_open_door_locked_3'
  ]);

  doorSlab.userData.interact = {
    label: 'Open door',
    onInteract: () => {
      if (!puzzleState.planksRemoved) {
        if (puzzleState.hasCrowbar) {
          if (!puzzleState.floorboardPried) {
            showCaption(line('dialog_door_planks_floorboard_first'));
            return;
          }
          if (!isHolding('crowbar')) {
            showCaption(line('dialog_hold_crowbar'));
            return;
          }
          puzzleState.planksRemoved = true;
          onCrowbarUsed();
          startDoorPlankPryAnimation();
          onDoorPlankRemoved();
          showCaption(line('dialog_door_planks_pried_off'));
        } else {
          onSfx('door_locked_rattle');
          showCaption(line(lockedTries.planks++ === 0
            ? 'dialog_door_planks_examine'
            : pickLockedLine(['dialog_open_door_locked_1', 'dialog_open_door_locked_2'])));
        }
      } else if (!puzzleState.doorUnlocked) {
        if (!puzzleState.hasBedroomKey) {
          onSfx('door_locked_rattle');
          showCaption(line(lockedTries.key++ === 0
            ? 'dialog_door_locked_needs_key'
            : pickLockedLine(['dialog_open_door_locked_1', 'dialog_open_door_locked_3'])));
          return;
        }
        if (!isHolding('bedroomKey')) {
          showCaption(line('dialog_hold_bedroom_key'));
          return;
        }
        // Set synchronously, which is what makes spamming E safe: the third
        // branch below catches every press after the first.
        puzzleState.doorUnlocked = true;
        puzzleState.hasBedroomKey = false;
        onBedroomKeyUsed();
        onDoorOpening(doorSlab.getWorldPosition(new THREE.Vector3()));
        showCaption(line('dialog_door_opens'));
        // Enough of the hinge swing to read as a door opening, and no more.
        // This used to be 1400ms and cut straight to Level 2; now a 700ms fade
        // follows it, so at 1400 the pair was over two seconds of dead air.
        // At 600 the fade runs over the TAIL of the swing and the player
        // watches the door open into the dark, which is the beat worth having.
        //
        // Not hoisted into the transition system: this delay is specific to
        // this door's hinge, and another level's exit may want none at all.
        // Making transitionTo aware of it would make it content-aware.
        exitTimer = setTimeout(() => { exitTimer = null; onDoorOpened(); }, 600);
      } else {
        showCaption(line('dialog_door_hangs_open'));
      }
    }
  };

  // ---------- interactive drawer system ----------
  // Handle on the pending exit, so reset() can cancel it -- see reset() below.
  let exitTimer = null;
  /** The paperclip's delay before the player is actually freed. */
  let freeTimer = null;

  const drawerStates = {
    nightstandLeft: { isOpen: false, contents: ['old photograph', 'battery'] },
    dresserTop: { isOpen: false, contents: ['family photo (scratched)'] },
    bin: { isOpen: false, contents: [] },
    // Locked -- see lampDrawerHitbox above. Opens once the pin pad is
    // solved with the code the nightstand lamp flickers out.
    lampDrawer: { isOpen: false, isUnlocked: false, contents: ['key'] }
  };

  // The custom Blender table beside the bed carries the searchable 1985
  // photo drawer. Its cabinet and drawer are separate parts in the GLB.
  const NIGHTSTAND_DRAWER_TRAVEL_METRES = 0.246;
  const NIGHTSTAND_DRAWER_OPEN_SECONDS = 0.65;
  let nightstandDrawer = null;
  let nightstandDrawerClosedPosition = null;
  let nightstandDrawerProgress = 0;
  let nightstandDrawerMotion = 0;
  let nightstandPhotoRevealed = false;
  const nightstandPhotoAnchor = new THREE.Group();

  function addNightstand(x, z, rotY = 0) {
    const ns = new THREE.Group();
    ns.position.set(x, 0, z);
    ns.rotation.y = rotY;
    group.add(ns);

    ns.name = 'CustomBedsideTable';
    ns.add(nightstandPhotoAnchor);
    // Solid, stationary cabinet footprint; the decorative drawer never blocks
    // the player. Bounds match the enlarged custom Blender model.
    colliders.push({
      minX: x - 0.26964, maxX: x + 0.26964,
      minZ: z - 0.23968, maxZ: z + 0.2722
    });

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.415, 0.065, 0.062),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.name = 'BedsideDrawerInteraction';
    hitbox.position.set(0, 0.43, 0.252);
    hitbox.visible = false;
    ns.add(hitbox);
    loadModel(bedsideTableModelUrl).then((tableModel) => {
      const drawer = tableModel.getObjectByName('BedsideDrawer');
      if (!drawer) throw new Error('Custom bedside table is missing BedsideDrawer');
      nightstandDrawer = drawer;
      nightstandDrawerClosedPosition = drawer.position.clone();
      tableModel.traverse((child) => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      ns.add(tableModel);
      hitbox.visible = true;
    }).catch((error) => console.error('Could not load custom bedside table:', error));
    return hitbox;
  }

  // Nightstand left drawer (freely searchable) -- against the back wall
  // between the window and the bed, with clearance to walk up to it.
  function createDrawerPhotoPickup({ key, texture, position, parent = group, height = PUZZLE_PHOTO_HEIGHT_METRES, canCollect = () => true }) {
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(height * PUZZLE_PHOTO_ASPECT_RATIO, height),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })
    );
    photo.position.copy(position);
    photo.rotation.x = -Math.PI / 2;
    photo.visible = false;
    parent.add(photo);

    const hitbox = new THREE.Mesh(
      key === 'nightstandLeft' || key === 'dresserTop'
        ? new THREE.BoxGeometry(height * PUZZLE_PHOTO_ASPECT_RATIO, 0.04, height)
        : new THREE.BoxGeometry(0.32, 0.12, 0.27),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.copy(position);
    hitbox.position.y += key === 'nightstandLeft' || key === 'dresserTop' ? 0.02 : 0.06;
    hitbox.visible = false;
    hitbox.userData.interact = {
      label: 'Pick up photograph',
      onInteract: () => {
        if (!canCollect() || puzzleState.foundPhotos.has(key)) return;
        puzzleState.foundPhotos.add(key);
        onPhotoCollected(puzzleState.foundPhotos.size);
        photoThumbMeshes[key].visible = true;
        photo.visible = false;
        hitbox.visible = false;
        const index = interactables.indexOf(hitbox);
        if (index >= 0) interactables.splice(index, 1);
      }
    };
    parent.add(hitbox);

    return {
      reveal() {
        if (puzzleState.foundPhotos.has(key)) return;
        photo.visible = true;
        hitbox.visible = true;
        if (!interactables.includes(hitbox)) interactables.push(hitbox);
      },
      hide() {
        photo.visible = false;
        hitbox.visible = false;
        const index = interactables.indexOf(hitbox);
        if (index >= 0) interactables.splice(index, 1);
      },
      reset() {
        this.hide();
      }
    };
  }

  const nightstandPhotoPickup = createDrawerPhotoPickup({
    key: 'nightstandLeft',
    texture: puzzlePhotoTextures[1985],
    position: new THREE.Vector3(0, 0.338, 0.112),
    parent: nightstandPhotoAnchor,
    height: 0.18,
    canCollect: () => drawerStates.nightstandLeft.isOpen && nightstandPhotoRevealed
  });
  const nightstandLeft = addNightstand(SEARCH_NIGHTSTAND_POSITION_X, SEARCH_NIGHTSTAND_POSITION_Z);
  nightstandLeft.userData.interact = {
    label: 'Open/close drawer',
    onInteract: () => {
      if (!nightstandDrawer || nightstandDrawerMotion !== 0) return;
      const opening = !drawerStates.nightstandLeft.isOpen;
      drawerStates.nightstandLeft.isOpen = opening;
      nightstandDrawerMotion = opening ? 1 : -1;
      nightstandPhotoRevealed = false;
      if (!opening) nightstandPhotoPickup.hide();
      showCaption(line(opening ? 'dialog_bedside_drawer_open' : 'dialog_bedside_drawer_shut'));
    }
  };
  interactables.push(nightstandLeft);

  // Knocked-over waste bin -- holds the key on its own, away from any of
  // the three photo drawers, so finding it isn't tangled up with the
  // photo count.
  const binHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.3, 0.35),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  binHitbox.position.copy(bin.position);
  binHitbox.position.y += 0.05;
  group.add(binHitbox);
  binHitbox.userData.interact = {
    label: 'Search bin',
    onInteract: () => {
      if (!drawerStates.bin.isOpen) {
        drawerStates.bin.isOpen = true;
        showCaption(line('dialog_bin_search'));
      } else {
        showCaption(line('dialog_bin_search_again'));
      }
    }
  };
  interactables.push(binHitbox);

  // The portrait stays attached to the moving middle drawer. Opening the
  // drawer reveals it; its existing pickup callback still owns progression.
  const dresserPhotoPickup = createDrawerPhotoPickup({
    key: 'dresserTop',
    texture: puzzlePhotoTextures[1987],
    position: new THREE.Vector3(0, 0.625, 0.14),
    parent: vanityPhotoAnchor,
    height: 0.16,
    canCollect: () => drawerStates.dresserTop.isOpen && vanityPhotoRevealed
  });
  const dresserTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.07, 0.10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  dresserTop.name = 'VanityMiddleDrawerInteraction';
  dresserTop.position.set(0, 0.72, 0.33);
  dresserTop.visible = false;
  dresser.add(dresserTop);
  dresserTop.userData.interact = {
    label: 'Open/close middle drawer',
    onInteract: () => {
      if (!vanityDrawer || vanityDrawerMotion !== 0) return;
      const opening = !drawerStates.dresserTop.isOpen;
      drawerStates.dresserTop.isOpen = opening;
      vanityDrawerMotion = opening ? 1 : -1;
      vanityPhotoRevealed = false;
      if (!opening) dresserPhotoPickup.hide();
      showCaption(line(opening ? 'dialog_middle_drawer_open' : 'dialog_middle_drawer_shut'));
    }
  };
  interactables.push(dresserTop);

  // ---------- photo arrangement puzzle ----------
  // A corkboard hinged flush onto the left wall, mounted directly over the
  // recessed cavity carved out above -- rather than a frame floating in
  // front of a solid wall (which read as a slab jutting out of it), its
  // thin axis is aligned with the wall's own normal so it lies flat, and
  // it's a swinging door on that recess: closed it looks like ordinary
  // wall decor, but once all three photos are arranged it hinges open
  // into the room to reveal the cavity -- and the locked box sitting
  // inside it -- the way a picture conceals a wall safe.
  const pinboardWidth = 0.80 * PINBOARD_SCALE;
  const pinboardHeight = 0.84 * PINBOARD_SCALE;
  const pinboardX = -ROOM_W / 2 + 0.12; // flush with the recess's inner (room-facing) face
  const pinboardHingeZ = pinRecess.z + pinboardWidth / 2; // hinge on the far edge of the gap
  const pinboardClosedRotY = Math.PI / 2; // matches the left wall's own rotation.y
  const pinboardOpenSwing = -Math.PI / 2; // swings 90 deg out into the room, clear of the cavity

  const pinboardHinge = new THREE.Object3D();
  pinboardHinge.position.set(pinboardX, pinRecess.y, pinboardHingeZ);
  pinboardHinge.rotation.y = pinboardClosedRotY;
  group.add(pinboardHinge);

  const photoHolderGroup = new THREE.Group();
  photoHolderGroup.position.x = pinboardWidth / 2; // recentre on the hinge's local origin
  photoHolderGroup.scale.setScalar(PINBOARD_SCALE);
  pinboardHinge.add(photoHolderGroup);
  loadModel(pinboardModelUrl).then((board) => {
    board.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    photoHolderGroup.add(board);
  }).catch((err) => {
    console.error('Failed to load Level 1 pinboard:', err);
  });

  // The player's collision system uses world-space rectangles. One moving
  // footprint follows the hinge, so the open board stays solid without
  // leaving a closed-position obstacle over the revealed cubby.
  const pinboardCollider = {
    minX: 0, maxX: 0, minZ: 0, maxZ: 0
  };
  colliders.push(pinboardCollider);
  function updatePinboardCollision() {
    const angle = pinboardHinge.rotation.y;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const halfThickness = 0.09; // enlarged frame and raised pin heads
    const farX = pinboardX + cosine * pinboardWidth;
    const farZ = pinboardHingeZ - sine * pinboardWidth;
    pinboardCollider.minX = Math.min(pinboardX, farX) - halfThickness;
    pinboardCollider.maxX = Math.max(pinboardX, farX) + halfThickness;
    pinboardCollider.minZ = Math.min(pinboardHingeZ, farZ) - halfThickness;
    pinboardCollider.maxZ = Math.max(pinboardHingeZ, farZ) + halfThickness;
  }
  updatePinboardCollision();

  // Each of the four findable photos gets its own pin + a real photo
  // thumbnail underneath it (hidden until that photo is actually found),
  // so the corkboard fills in as you search the room instead of staying
  // an abstract counter. They're purely a preview here, though -- actually
  // solving the puzzle happens in a dedicated close-up board view (see
  // onExaminePhotos below) where the photos can be dragged into place,
  // rather than clicking each one in the 3D world.
  const photoSlots = {
    windowPhoto: { pin: [-0.2, 0.3], pinColor: 0x477a96, photo: [-0.2, 0.18, -0.04], tex: windowPhotoTex, date: 1984, w: 0.19, h: 0.19 },
    nightstandLeft: { pin: [0.2, 0.3], pinColor: 0xa02020, photo: [0.2, 0.18, 0.05], tex: puzzlePhotoTextures[1985], date: 1985, w: 0.19, h: 0.19 },
    floorPhoto: { pin: [-0.2, -0.1], pinColor: 0x1f4f8f, photo: [-0.2, -0.22, -0.06], tex: tornPhotoTex, date: 1986, w: 0.19, h: 0.19 },
    dresserTop: { pin: [0.2, -0.1], pinColor: 0xc9a227, photo: [0.2, -0.22, 0.03], tex: puzzlePhotoTextures[1987], date: 1987, w: 0.19, h: 0.19 }
  };
  const photoThumbMeshes = {};
  Object.entries(photoSlots).forEach(([key, slot]) => {
    const thumb = new THREE.Mesh(
      new THREE.PlaneGeometry(slot.h * PUZZLE_PHOTO_ASPECT_RATIO, slot.h),
      new THREE.MeshStandardMaterial({ map: slot.tex, roughness: 1 })
    );
    thumb.position.set(slot.photo[0], slot.photo[1], 0.033);
    thumb.rotation.z = slot.photo[2];
    thumb.visible = false;
    photoHolderGroup.add(thumb);
    photoThumbMeshes[key] = thumb;
  });

  const photoAreaHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.79, 0.15 / PINBOARD_SCALE),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  photoAreaHitbox.userData.interact = {
    label: 'Examine corkboard',
    onInteract: () => {
      if (puzzleState.photosArranged) {
        showCaption(line('dialog_corkboard_open'));
      } else if (puzzleState.foundPhotos.size < 4) {
        showCaption(line('dialog_corkboard_needs_photos'));
      } else {
        // Hand off to the close-up board view -- dragging the photos into
        // place (and figuring out what order they actually belong in) is
        // the real puzzle, not this in-world interact.
        onExaminePhotos({
          photos: Object.entries(photoSlots).map(([key, slot]) => ({
            key,
            date: slot.date,
            dataUrl: PUZZLE_PHOTO_URLS[slot.date]
          })),
          onSolved: () => {
            showCaption(line('dialog_corkboard_solved'));
            puzzleState.photosArranged = true;
            updateLockedBoxPresentation(0);
            onPhotoPuzzleSolved();
          }
        });
      }
    }
  };
  photoHolderGroup.add(photoAreaHitbox);
  interactables.push(photoAreaHitbox);

  // ---------- locked box (sits in the wall cavity behind the pinboard, appears after photo puzzle is solved) ----------
  const lockedBoxGroup = new THREE.Group();
  lockedBoxGroup.position.set(
    -ROOM_W / 2 - pinRecess.depth * 0.43,
    cubbyFloorSurfaceY + 0.15 * PINBOARD_SCALE + 0.005,
    pinRecess.z
  );
  lockedBoxGroup.rotation.y = Math.PI / 2; // face the lock plate out toward the room
  lockedBoxGroup.scale.setScalar(PINBOARD_SCALE);
  lockedBoxGroup.name = 'Level1_LockedBox';
  group.add(lockedBoxGroup);

  // Presentation state only; the existing photo/key gates and inventory
  // callbacks below remain authoritative. No reward pickup mesh is exposed.
  let boxOpened = false;
  let boxOpenElapsedSeconds = 0;
  /** Whether the crowbar has gone into the hand yet -- see updateLockedBoxPresentation(). */
  let crowbarHandedOver = false;
  let importedBoxHinge = null;
  const boxVisual = new THREE.Group();
  boxVisual.name = 'Level1_LockboxVisual';
  boxVisual.visible = false;
  lockedBoxGroup.add(boxVisual);
  const boxFallback = new THREE.Group();
  boxFallback.position.z = 0.03; // same rear-wall clearance as the GLB
  boxVisual.add(boxFallback);
  const fallbackBoxHinge = new THREE.Group();
  fallbackBoxHinge.position.set(0, 0.15, -0.15);
  boxFallback.add(fallbackBoxHinge);

  const boxBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9, metalness: 0.2 })
  );
  boxFallback.add(boxBody);

  const boxLid = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.08, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.8 })
  );
  boxLid.position.set(0, 0.04, 0.15);
  fallbackBoxHinge.add(boxLid);

  // Lock indicator (small cylinder)
  const lockPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: 0.5, metalness: 0.7 })
  );
  lockPlate.rotation.x = Math.PI / 2;
  lockPlate.position.set(0, 0.08, 0.15);
  boxFallback.add(lockPlate);

  /** Synchronizes both fallback and imported lids, including late asset loads. */
  function updateLockedBoxPresentation(dt) {
    boxVisual.visible = puzzleState.photosArranged;
    if (boxOpened) boxOpenElapsedSeconds = Math.min(LOCKBOX_OPEN_DURATION_SECONDS, boxOpenElapsedSeconds + dt);
    const travel = boxOpened ? lockboxLidTravel(boxOpenElapsedSeconds) : 0;
    const angle = LOCKBOX_OPEN_ANGLE_RADIANS * travel;
    fallbackBoxHinge.rotation.x = angle;
    if (importedBoxHinge) importedBoxHinge.rotation.x = angle;
    // The glove reaches in once there is an opening to reach into. Fired from
    // here, on the frame clock, rather than from the open itself: with a lid
    // that takes most of five seconds the grab used to go into a closed box.
    // The puzzle flags were already set when the box opened, so spamming E or
    // restarting mid-lid is still safe -- reset() clears boxOpened, and with it
    // any grant that had not happened yet.
    if (boxOpened && !crowbarHandedOver && travel >= LOCKBOX_REACH_AT) {
      crowbarHandedOver = true;
      onCrowbarFound();
    }
  }

  loadModel(antiqueLockboxModelUrl).then((chestModel) => {
    const hinge = chestModel.getObjectByName('ChestLidHinge');
    if (!hinge || !chestModel.getObjectByName('ChestBase') || !chestModel.getObjectByName('ChestLid')) {
      throw new Error('Lockbox asset is missing its named base/lid/hinge');
    }
    chestModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = true;
      if (child.material.map) child.material.map.anisotropy = 4;
    });
    boxVisual.add(chestModel);
    importedBoxHinge = hinge;
    boxFallback.visible = false;
    updateLockedBoxPresentation(0);
  }).catch((error) => console.warn('Bedroom lockbox visual could not load:', error));

  const boxHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.35, 0.35),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  boxHitbox.userData.interact = {
    label: 'Open box',
    onInteract: () => {
      if (boxOpened) return; // Never replay the inventory grant during animation.
      if (puzzleState.photosArranged && puzzleState.hasBrassKey && !isHolding('brassKey')) {
        showCaption(line('dialog_hold_brass_key'));
      } else if (puzzleState.photosArranged && puzzleState.hasBrassKey) {
        showCaption(line('dialog_lockbox_opened'));
        boxHitbox.visible = false;
        boxOpened = true;
        boxOpenElapsedSeconds = 0;
        puzzleState.hasBrassKey = false;
        onBrassKeyUsed();
        // The crowbar is the box's from this moment; the HAND gets it at 70% lid.
        puzzleState.hasCrowbar = true;
        onLockboxOpening(lockedBoxGroup.getWorldPosition(new THREE.Vector3()));
        onReadSafeTag();
        onSafeOpened();
      } else if (puzzleState.photosArranged) {
        showCaption(line('dialog_lockbox_needs_key'));
      } else {
        showCaption(line('dialog_lockbox_locked_tight'));
      }
    }
  };
  lockedBoxGroup.add(boxHitbox);
  interactables.push(boxHitbox);

  return {
    group,
    interactables,
    colliders,
    spawn: [BED_POSITION_X, BED_POSITION_Z + 0.5],
    // Face roughly toward the headboard/window/paperclip corner on wake
    // (matches the storyline's own beat order: storm/window first, then
    // adjusting to the room, then spotting the paperclip by the bed) --
    // not toward the door behind the player, which left the one prop
    // they must interact with while still chained out of view entirely.
    spawnYaw: 0.5,
    // Wake up looking slightly DOWN. The paperclip sits 38 degrees below the
    // horizon and the camera's half-FOV is 35, so at a level pitch it would be
    // just off the bottom edge of the screen -- the geometry is genuinely tight
    // here, with the eye only 0.85m above the bed and the bed 1.3m away.
    //
    // It is also simply the right beat: you come round cuffed to a bed frame,
    // and the first thing anyone would do is look at their own hand. Every other
    // level omits spawnPitch and is unaffected.
    spawnPitch: -0.30,
    refs: {
      /** The door, world space: where the upstairs hallway is built on. */
      doorway: { x: DOOR_POSITION_X, z: ROOM_D / 2 },
      setDoorwayOpen,
      /** The open door swings shut (the player has gone through). */
      shutDoor() { doorShutBehind = true; },
      bedExitPosition: [BED_POSITION_X, BED_EXIT_POSITION_Z],
      /** The bed's centre on the floor, and the locked cuff: what the wake-up scene is framed on. */
      bedPosition: [BED_POSITION_X, BED_POSITION_Z],
      cuff,
      bedsideTableCollider,
      disturbChair,
      disturbBin,
      flashLamp,
      // Read by the hint system (levels/bedroomHints.js), so its most direct
      // lamp hint always gives the code the lamp is actually blinking.
      drawerPinDigits,
      rattleDoor,
      bulbLight,
      bulbMaterial,
      pendantIntact,
      pendantBroken,
      lightning,
      windowGroup,
      flashlight,
      flashlightHitbox,
      paperclip,
      paperclipHitbox,
      cuffLockHitbox,
      // The key under the floorboard. main.js clones it (and the paperclip) for
      // the item in the hand and for a dropped copy -- see world/itemMeshes.js.
      bedroomKey,
      chain,
      doorSlab,
      // For the audio director: where the candles burn, and how long the
      // lockbox takes to open (main.js waits that long before the door rattles).
      candleAnchors,
      lockboxOpenSeconds: LOCKBOX_OPEN_DURATION_SECONDS,
      /**
       * Runs the "something moves past the door" beat once. Returns how long it
       * takes, so a script can wait exactly that long instead of guessing.
       */
      playDoorPass: () => {
        doorPass.active = true;
        doorPass.phase = 0;
        return doorPass.duration;
      },
      doorPass,
      messagePlane: message,
      ambient,
      glassMaterial,
      puzzleState
    },
    // Puts every piece of run-specific state this level owns back to its
    // starting point -- restart previously only touched the paperclip/
    // flashlight/chain (handled by main.js directly via refs), which left
    // the photo puzzle, the box, the boarded door and every drawer still
    // solved after a restart. Centralised here instead of duplicated in
    // main.js since most of this state (drawerStates, the hinges, the
    // photo thumbnails) isn't exposed via refs at all.
    reset() {
      // Cancel a pending exit. Pressing E on the door and then R inside the
      // delay above used to let the timeout fire and yank the player straight
      // back out of the bedroom it had just reset.
      clearTimeout(exitTimer);
      exitTimer = null;
      clearTimeout(freeTimer);
      freeTimer = null;
      lockedTries.planks = 0;
      lockedTries.key = 0;
      pickLockedLine.reset();

      paperclip.visible = true;
      paperclipHitbox.visible = true;
      if (!interactables.includes(paperclipHitbox)) interactables.push(paperclipHitbox);
      // Back to "nothing to pick the lock with": the cuff only offers itself
      // once the paperclip is in hand again.
      const cuffLockIndex = interactables.indexOf(cuffLockHitbox);
      if (cuffLockIndex >= 0) interactables.splice(cuffLockIndex, 1);
      chain.visible = true;
      restraintRemnant.visible = false;

      flashlight.visible = true;
      flashlightHitbox.visible = true;
      setFlashlightPickupEnabled(false);

      drawerStates.nightstandLeft.isOpen = false;
      nightstandDrawerProgress = 0;
      nightstandDrawerMotion = 0;
      nightstandPhotoRevealed = false;
      nightstandPhotoAnchor.position.z = 0;
      if (nightstandDrawer) nightstandDrawer.position.copy(nightstandDrawerClosedPosition);
      nightstandLeft.position.z = 0.252;
      drawerStates.dresserTop.isOpen = false;
      vanityDrawerProgress = 0;
      vanityDrawerMotion = 0;
      vanityPhotoRevealed = false;
      vanityPhotoAnchor.position.z = 0;
      if (vanityDrawer) vanityDrawer.position.copy(vanityDrawerClosedPosition);
      dresserTop.position.z = 0.33;
      drawerStates.bin.isOpen = false;
      drawerStates.lampDrawer.isOpen = false;
      drawerStates.lampDrawer.isUnlocked = false;
      lampDrawerHitbox.userData.interact.label = 'Locked drawer';
      lampDrawerProgress = 0;
      lampDrawerMotion = 0;
      if (lampDrawerVisual && lampDrawerClosedPosition) {
        lampDrawerVisual.position.copy(lampDrawerClosedPosition);
      }
      lampDrawerHitbox.position.z = LAMP_DRAWER_HITBOX_CLOSED_Z_METRES;
      restoreLampDrawerLock();
      if (lampDrawerKeyVisual) lampDrawerKeyVisual.visible = true;
      setLampDrawerContentsVisible(false);
      chairGroup.position.copy(chairRestPosition);
      chairGroup.rotation.copy(chairRestRotation);
      bin.position.copy(binRestPosition);
      bin.rotation.set(0, binRestRotationY, binRestRotationZ);
      binPapers.forEach((paper, index) => paper.position.copy(binPaperRestPositions[index]));
      lampShockRemainingSeconds = 0;
      if (!interactables.includes(nightstandLeft)) interactables.push(nightstandLeft);
      if (!interactables.includes(dresserTop)) interactables.push(dresserTop);

      floorPhoto.visible = true;
      floorPhotoHitbox.visible = true;
      if (!interactables.includes(floorPhotoHitbox)) interactables.push(floorPhotoHitbox);
      windowPhoto.visible = true;
      windowPhotoHitbox.visible = true;
      if (!interactables.includes(windowPhotoHitbox)) interactables.push(windowPhotoHitbox);
      nightstandPhotoPickup.reset();
      dresserPhotoPickup.reset();
      Object.values(photoThumbMeshes).forEach((thumb) => { thumb.visible = false; });
      pinboardHinge.rotation.y = pinboardClosedRotY;
      updatePinboardCollision();

      boxHitbox.visible = true;
      boxOpened = false;
      boxOpenElapsedSeconds = 0;
      crowbarHandedOver = false;
      updateLockedBoxPresentation(0);
      boxVisual.visible = false;

      rugCornerOpen = false;
      rugCornerOpening = false;
      rugFoldProgress = 0;
      if (rugFoldCorner) rugFoldCorner.quaternion.identity();
      rugCornerHitbox.visible = Boolean(rugFoldCorner);
      if (rugCornerHitbox.visible && !interactables.includes(rugCornerHitbox)) interactables.push(rugCornerHitbox);
      looseFloorboard.visible = false;
      looseFloorboardHitbox.visible = false;
      const hiddenFloorboardIndex = interactables.indexOf(looseFloorboardHitbox);
      if (hiddenFloorboardIndex >= 0) interactables.splice(hiddenFloorboardIndex, 1);
      bedroomKey.visible = false;
      bedroomKeyHitbox.visible = false;
      const bedroomKeyIndex = interactables.indexOf(bedroomKeyHitbox);
      if (bedroomKeyIndex >= 0) interactables.splice(bedroomKeyIndex, 1);

      resetDoorPlankPresentation();
      doorHinge.rotation.y = 0;
      doorShutBehind = false;
      setDoorwayOpen(false);
      doorRattleRemainingSeconds = 0;

      doorPass.active = false;
      doorPass.phase = 0;
      doorGapMat.opacity = 0;
      doorGapBlockMat.opacity = 0;

      puzzleState.chainsEscaped = false;
      puzzleState.hasFlashlight = false;
      puzzleState.foundPhotos.clear();
      puzzleState.photosArranged = false;
      puzzleState.hasBrassKey = false;
      puzzleState.hasCrowbar = false;
      puzzleState.floorboardPried = false;
      puzzleState.hasBedroomKey = false;
      puzzleState.planksRemoved = false;
      puzzleState.doorUnlocked = false;
      puzzleState.messageRead = false;
      puzzleState.polaroidRead = false;
    },
    update(dt) {
      if (rugCornerOpening && rugFoldCorner) {
        rugFoldProgress = Math.min(1, rugFoldProgress + dt / rugFoldDurationSeconds);
        const eased = rugFoldProgress * rugFoldProgress * (3 - 2 * rugFoldProgress);
        rugFoldCorner.quaternion.setFromAxisAngle(rugFoldAxis, rugFoldAngle * eased);
        if (rugFoldProgress === 1) {
          rugCornerOpening = false;
          rugCornerOpen = true;
          if (!puzzleState.floorboardPried) {
            looseFloorboard.visible = true;
            looseFloorboardHitbox.visible = true;
            if (!interactables.includes(looseFloorboardHitbox)) interactables.push(looseFloorboardHitbox);
          }
        }
      }
      if (vanityDrawer && vanityDrawerMotion !== 0) {
        vanityDrawerProgress = THREE.MathUtils.clamp(
          vanityDrawerProgress + vanityDrawerMotion * dt / vanityDrawerOpenSeconds, 0, 1
        );
        const progress = vanityDrawerProgress;
        const travel = vanityDrawerTravelMetres * progress * progress * (3 - 2 * progress);
        vanityDrawer.position.z = vanityDrawerClosedPosition.z + travel;
        vanityPhotoAnchor.position.z = travel;
        dresserTop.position.z = 0.33 + travel;
        if (progress === 1) {
          vanityDrawerMotion = 0;
          vanityPhotoRevealed = true;
          dresserPhotoPickup.reveal();
        } else if (progress === 0) {
          vanityDrawerMotion = 0;
        }
      }
      if (nightstandDrawer && nightstandDrawerMotion !== 0) {
        nightstandDrawerProgress = THREE.MathUtils.clamp(
          nightstandDrawerProgress + nightstandDrawerMotion * dt / NIGHTSTAND_DRAWER_OPEN_SECONDS, 0, 1
        );
        const progress = nightstandDrawerProgress;
        const travel = NIGHTSTAND_DRAWER_TRAVEL_METRES * progress * progress * (3 - 2 * progress);
        nightstandDrawer.position.z = nightstandDrawerClosedPosition.z + travel;
        nightstandPhotoAnchor.position.z = travel;
        nightstandLeft.position.z = 0.252 + travel;
        if (progress === 1) {
          nightstandDrawerMotion = 0;
          nightstandPhotoRevealed = true;
          nightstandPhotoPickup.reveal();
        } else if (progress === 0) {
          nightstandDrawerMotion = 0;
        }
      }
      if (lampDrawerVisual && lampDrawerMotion !== 0) {
        lampDrawerProgress = THREE.MathUtils.clamp(
          lampDrawerProgress + lampDrawerMotion * dt / LAMP_DRAWER_OPEN_SECONDS, 0, 1
        );
        const progress = lampDrawerProgress;
        const travel = LAMP_DRAWER_TRAVEL_METRES * progress * progress * (3 - 2 * progress);
        lampDrawerVisual.position.z = lampDrawerClosedPosition.z + travel;
        lampDrawerHitbox.position.z = LAMP_DRAWER_HITBOX_CLOSED_Z_METRES + travel;
        if (progress === 1) {
          lampDrawerMotion = 0;
          setLampDrawerContentsVisible(true);
        } else if (progress === 0) {
          lampDrawerMotion = 0;
          setLampDrawerContentsVisible(false);
        }
      }
      if (lampDrawerLockFalling && lampDrawerLockVisual) {
        lampDrawerLockVelocityY += LOCK_FALL_GRAVITY_METRES_PER_SECOND_SQUARED * dt;
        lampDrawerLockVisual.position.y -= lampDrawerLockVelocityY * dt;
        lampDrawerLockVisual.rotation.x += dt * 4.5;
        lampDrawerLockVisual.rotation.z += dt * 3.2;
        if (lampDrawerLockVisual.position.y <= LOCK_FALL_FLOOR_HEIGHT_METRES) {
          lampDrawerLockVisual.position.y = LOCK_FALL_FLOOR_HEIGHT_METRES;
          lampDrawerLockFalling = false;
        }
      }
      this._t = (this._t ?? 0) + dt;
      glassMaterial.uniforms.uTime.value = this._t;

      // Drive the nightstand lamp from the retained 3-1-5 schedule. It is
      // genuinely dark between windows, making each group countable without
      // adding another light or a shader-based effect.
      this._lampT = ((this._lampT ?? 0) + dt) % lampFlicker.total;
      const lampPulseOn = lampFlicker.intervals.some(([s, e]) => this._lampT >= s && this._lampT < e);
      const lampShockOn = lampShockRemainingSeconds > 0
        && Math.floor(lampShockRemainingSeconds / lampShockIntervalSeconds) % 2 === 0;
      lampShockRemainingSeconds = Math.max(0, lampShockRemainingSeconds - dt);
      lampLight.intensity = lampShockOn
        ? LAMP_LIGHT_SHOCK_INTENSITY
        : (lampPulseOn ? LAMP_LIGHT_PULSE_INTENSITY : LAMP_LIGHT_OFF_INTENSITY);
      lampBulbMat.emissiveIntensity = lampShockOn
        ? LAMP_BULB_SHOCK_EMISSIVE_INTENSITY
        : (lampPulseOn ? LAMP_BULB_PULSE_EMISSIVE_INTENSITY : LAMP_BULB_OFF_EMISSIVE_INTENSITY);
      if (lampShadeMaterial) {
        lampShadeMaterial.emissiveIntensity = lampShockOn
          ? LAMP_SHADE_SHOCK_EMISSIVE_INTENSITY
          : (lampPulseOn ? LAMP_SHADE_PULSE_EMISSIVE_INTENSITY : LAMP_SHADE_OFF_EMISSIVE_INTENSITY);
      }

      // The headboard candle is visual dressing only: two crossed planes and
      // one unshadowed local light give it a quiet, inexpensive live flame.
      if (shelfFlame && shelfFlameMaterial && shelfCandleLight) {
        const shelfFlameFlicker = 0.90 + 0.10 * Math.sin(this._t * 7.3)
          + 0.04 * Math.sin(this._t * 18.7);
        shelfFlame.scale.set(0.96 + 0.04 * shelfFlameFlicker, shelfFlameFlicker, 1);
        shelfFlameMaterial.opacity = 0.76 + 0.12 * shelfFlameFlicker;
        shelfCandleLight.intensity = 0.11 + 0.04 * shelfFlameFlicker;
      }

      // Storm.js drives `lightning`'s intensity up to ~3.2 during a flash;
      // feed that same value into the shader (normalised to 0-1) so the
      // window pane brightens in sync with the flash instead of on its
      // own separate timer.
      glassMaterial.uniforms.uFlash.value = Math.min(lightning.intensity / 3.2, 1.0);

      // Swing the pinboard open on its hinge once the photo puzzle is
      // solved, easing toward the target angle rather than snapping so
      // the reveal reads as a physical door swinging, not a cut.
      const targetSwing = puzzleState.photosArranged ? pinboardOpenSwing : 0;
      const targetRotY = pinboardClosedRotY + targetSwing;
      pinboardHinge.rotation.y += (targetRotY - pinboardHinge.rotation.y) * Math.min(1, dt * 3);
      updatePinboardCollision();
      updateLockedBoxPresentation(dt);

      // Same easing treatment for the front door once the planks are
      // pried off and it's actually been opened.
      const doorRattlePhase = 1 - doorRattleRemainingSeconds / doorRattleDurationSeconds;
      const doorRattleOffset = doorRattleRemainingSeconds > 0
        ? Math.sin(doorRattlePhase * Math.PI * 3) * doorRattleAmplitudeRadians * (1 - doorRattlePhase)
        : 0;
      doorRattleRemainingSeconds = Math.max(0, doorRattleRemainingSeconds - dt);
      const targetDoorRotY = (puzzleState.doorUnlocked && !doorShutBehind ? doorOpenSwing : 0) + doorRattleOffset;
      doorHinge.rotation.y += (targetDoorRotY - doorHinge.rotation.y) * Math.min(1, dt * 3);

      // The planks remain puzzle-state-driven: this is presentation only. A
      // short deterministic pull and drop plays once, then the same meshes are
      // hidden exactly as they were before the visual upgrade.
      if (plankPryElapsedSeconds >= 0) {
        plankPryElapsedSeconds += dt;
        const pryProgress = Math.min(1, plankPryElapsedSeconds / plankPryDurationSeconds);
        const easedProgress = 1 - (1 - pryProgress) * (1 - pryProgress);
        for (const plankGroup of boardedPlankGroups) {
          const restPosition = plankGroup.userData.restPosition;
          const direction = plankGroup.userData.pryDirection;
          plankGroup.position.set(
            restPosition.x + direction * 0.14 * easedProgress,
            restPosition.y - 0.32 * easedProgress,
            restPosition.z + 0.08 * easedProgress
          );
          plankGroup.rotation.set(
            direction * 0.24 * easedProgress,
            0,
            plankGroup.userData.restRotationZ + direction * 0.30 * easedProgress
          );
        }
        if (pryProgress >= 1) {
          plankPryElapsedSeconds = -1;
          boardedPlankParts.forEach((part) => { part.visible = false; });
        }
      }

      // "Something moves past the door." See the note where these were built.
      if (doorPass.active) {
        doorPass.phase += dt / doorPass.duration;
        if (doorPass.phase >= 1) {
          doorPass.active = false;
          doorPass.phase = 0;
          doorGapMat.opacity = 0;
          doorGapBlockMat.opacity = 0;
        } else {
          const p = doorPass.phase;
          // Light in over the first fifth, out over the last fifth, so it does
          // not switch on and off -- the hall light was always on, the player
          // simply had no reason to look at the floor until now.
          const up = Math.min(1, p / 0.2);
          const down = Math.min(1, (1 - p) / 0.2);
          doorGapMat.opacity = 0.5 * Math.min(up, down);
          // The crossing occupies the middle 45% of the beat, so there is a
          // beat of steady light before and after. The pause is what makes the
          // interruption read as something rather than as a flicker.
          const cross = (p - 0.32) / 0.45;
          if (cross >= 0 && cross <= 1) {
            // Fully opaque at the strip's full brightness, not merely as
            // opaque as the strip -- black at 0.5 over light at 0.5 only
            // HALVES it, which on screen is a dip rather than a shadow. It
            // still fades with the strip so the beat can end cleanly.
            doorGapBlockMat.opacity = Math.min(1, doorGapMat.opacity / 0.5);
            doorGapBlock.position.x = -DOOR_LEAF_W * 0.75 + cross * DOOR_LEAF_W * 1.5;
          } else {
            doorGapBlockMat.opacity = 0;
          }
        }
      }
    }
  };
}
