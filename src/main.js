import * as THREE from 'three';
// FIRST, before any module that might start a load: it has to be listening
// before the first model or texture is requested. See core/LoadTracker.js.
import { waitForAllLoads } from './core/LoadTracker.js';
import { PointerLockPlayer, SENSITIVITY_MIN, SENSITIVITY_MAX } from './core/PointerLockPlayer.js';
import { WALK_SPEED } from './core/MoveSpeeds.js';
import { SceneManager } from './core/SceneManager.js';
import { segmentBlocked } from './core/collision.js';
import { Interaction } from './core/Interaction.js';
import { createPhotoBoardUI } from './core/PhotoBoardUI.js';
import { createPinPadUI } from './core/PinPadUI.js';
import { Storm } from './world/Storm.js';
import { Rain } from './world/Rain.js';
import { createDustMotes } from './world/DustMotes.js';
import { AudioEngine, BREATH_BASE_LEVEL } from './world/AudioEngine.js';
import { createBedroomLevel } from './levels/bedroomLevel.js';
import { createHallwayBasementLevel } from './levels/hallwayBasementLevel.js';
import { createStudyLevel } from './levels/studyLevel.js';
import { createBackroomsLevel } from './levels/backroomsLevel.js';
import { createScreenFade, wait } from './core/ScreenFade.js';
import { gameState, resetState, addItem, removeItem, ITEMS } from './core/GameState.js';
import { createHeldItems } from './core/HeldItems.js';
import { createItemMeshes, ITEM_MESH_IDS } from './world/itemMeshes.js';
import { MAIN_ONLY } from './core/RenderLayers.js';
import { createMinimap } from './core/Minimap.js';
import { CaptionSequencer } from './core/CaptionSequencer.js';
import { createDocumentUI } from './core/DocumentUI.js';
import { createPostFX } from './world/Postprocessing.js';
import { createHintSystem } from './core/HintSystem.js';
import { BEDROOM_HINT_STAGES } from './levels/bedroomHints.js';
import { enableSinglePassForFlatDecals, createDarkShadowSkipper, findShadowCastingLights } from './world/renderOptimizations.js';
import { createCutsceneRunner } from './core/Cutscene.js';
import { createNewspaper } from './core/Newspaper.js';
import { FreeCamera } from './core/FreeCamera.js';
import { createScriptRunner } from './core/Script.js';
import { createOkabeCreature } from './systems/OkabeCreature.js';
import { createCreatureAI } from './systems/CreatureAI.js';
import { createBackroomsHunter } from './systems/BackroomsHunter.js';
import { createVisor } from './core/Visor.js';
import { DOCUMENTS } from './story/lines.js';
import { line } from './dialogue/index.js';
import { installUnloadGuard } from './core/KeyboardGuard.js';
import { Hands } from './systems/hands/hands.js';
import { setHandAssetUrl } from './systems/hands/hand-mesh.js';
import handsModelUrl from './assets/models/hands.glb?url';
import { loadModel } from './world/modelLoader.js';
import flashlightModelUrl from './assets/models/flashlight.glb?url';

// ---------- DOM ----------
const canvas = document.getElementById('scene');
const glareOverlay = document.getElementById('glare-overlay');
const loadingScreen = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingHintEl = document.getElementById('loading-hint');
const thirdPersonBtn = document.getElementById('third-person-toggle');
const startScreen = document.getElementById('start-screen');
const mainMenu = document.getElementById('main-menu');
const legacyStartControls = document.getElementById('legacy-start-controls');
const menuOptionButtons = [...document.querySelectorAll('.menu-option')];
const menuStartButton = document.getElementById('menu-start');
const menuCreditsButton = document.getElementById('menu-credits');
const menuQuitButton = document.getElementById('menu-quit');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const startTitle = document.getElementById('start-title');
const startSub = document.getElementById('start-sub');
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const objectiveEl = document.getElementById('objective');
const promptEl = document.getElementById('interact-prompt');
const captionEl = document.getElementById('caption-box');
const hintKeyEl = document.getElementById('hint-key');
const flashlightStateEl = document.getElementById('flashlight-state');
const hotbarSlots = document.querySelectorAll('#hotbar .hotbar-slot');
const minimapCanvas = document.getElementById('minimap');
const minimapArrowEl = document.getElementById('minimap-arrow');
const minimapWrapEl = document.getElementById('minimap-wrap');
const creditsScreen = document.getElementById('credits-screen');
const creditsList = document.getElementById('credits-list');
const staminaEl = document.getElementById('stamina');
const staminaFillEl = document.getElementById('stamina-fill');
const creditsCloseBtn = document.getElementById('credits-close');
const quitScreen = document.getElementById('quit-screen');
const quitBackButton = document.getElementById('quit-back');
const fadeOverlay = document.getElementById('fade-overlay');
const settingsButton = document.getElementById('settings-button');
const settingsScreen = document.getElementById('settings-screen');
const settingsCloseBtn = document.getElementById('settings-close');
const volumeInput = document.getElementById('settings-volume');
const volumeValueEl = document.getElementById('settings-volume-value');
const sensitivityInput = document.getElementById('settings-sensitivity');
const sensitivityValueEl = document.getElementById('settings-sensitivity-value');
const captionsCheckbox = document.getElementById('settings-captions');

// The black between levels. Deliberately not a `.hidden` toggle like every
// other overlay in this file -- see core/ScreenFade.js for why that would snap
// instead of fading.
const fade = createScreenFade(fadeOverlay);

// Every front page in the game -- see core/Newspaper.js and
// story/newspapers.js. Pages are only ever shown during play, long after this
// module has finished evaluating, so reading `audio` in onShow is safe.
const newspaperView = createNewspaper({
  root: document.getElementById('newspaper-view'),
  onShow: () => audio.paperRustle()
});

// ---------- launch menu ----------
// This state belongs only to the DOM launch menu. It deliberately does not
// overlap the game's pause/end state, which continues to use the legacy start
// controls below after pointer lock has been released.
let menuOverlayState = 'main';
let selectedMenuOptionIndex = 0;

function selectMenuOption(optionIndex) {
  selectedMenuOptionIndex = (optionIndex + menuOptionButtons.length) % menuOptionButtons.length;
  menuOptionButtons.forEach((button, index) => {
    button.classList.toggle('is-selected', index === selectedMenuOptionIndex);
  });
  menuOptionButtons[selectedMenuOptionIndex].focus({ preventScroll: true });
}

function showMainMenu() {
  menuOverlayState = 'main';
  mainMenu.classList.remove('hidden');
  legacyStartControls.classList.add('hidden');
  creditsScreen.classList.add('hidden');
  quitScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  selectMenuOption(0);
}

function showMenuCredits() {
  menuOverlayState = 'credits';
  mainMenu.classList.add('hidden');
  creditsScreen.classList.remove('hidden');
  quitScreen.classList.add('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  creditsCloseBtn.focus({ preventScroll: true });
}

function showQuitMessage() {
  menuOverlayState = 'quit';
  mainMenu.classList.add('hidden');
  quitScreen.classList.remove('hidden');
  quitBackButton.focus({ preventScroll: true });
}

/**
 * Attempts a browser close only while the Quit click is still a user gesture.
 * Regular browser tabs normally reject it; the existing thank-you panel is the
 * intentional fallback for that case.
 */
function requestQuit() {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) showQuitMessage();
  }, 50);
}

function showLegacyStartScreen() {
  mainMenu.classList.add('hidden');
  legacyStartControls.classList.remove('hidden');
}

menuOptionButtons.forEach((button, index) => {
  button.addEventListener('mouseenter', () => selectMenuOption(index));
  button.addEventListener('focus', () => selectMenuOption(index));
});

menuStartButton.addEventListener('click', () => {
  menuOverlayState = 'game';
  mainMenu.classList.add('hidden');
  // Keep this synchronous with the click so Pointer Lock retains the browser
  // user gesture that the existing Level 1 flow requires.
  startButton.click();
});
menuCreditsButton.addEventListener('click', showMenuCredits);
menuQuitButton.addEventListener('click', requestQuit);
quitBackButton.addEventListener('click', showMainMenu);

window.addEventListener('keydown', (event) => {
  if (menuOverlayState === 'credits' || menuOverlayState === 'quit') {
    if (event.code === 'Escape') {
      event.preventDefault();
      showMainMenu();
    }
    return;
  }

  if (menuOverlayState !== 'main') return;
  if (event.code === 'ArrowUp') {
    event.preventDefault();
    selectMenuOption(selectedMenuOptionIndex - 1);
  } else if (event.code === 'ArrowDown') {
    event.preventDefault();
    selectMenuOption(selectedMenuOptionIndex + 1);
  } else if (event.code === 'Enter') {
    event.preventDefault();
    menuOptionButtons[selectedMenuOptionIndex].click();
  }
});

// ---------- renderer / scene / camera ----------
// antialias is OFF on the canvas on purpose. Nothing draws the scene to the
// canvas: the composer renders into its own 4x MSAA target (see
// world/Postprocessing.js) and the canvas only ever receives OutputPass's
// one full-screen triangle, which has no edges on screen to smooth. MSAA here
// bought a second multisampled framebuffer and a resolve every frame for an
// identical picture.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Measured every level's actual rendered output at an average luminance
// of 9-26/255 (3.5-10% brightness) -- verified with real pixel data, not
// eyeballed. Tried ACESFilmic tone mapping first, expecting it to lift
// this; measured again and it made every level darker still (2.8-18.7),
// because ACES's filmic curve is calibrated for much higher-radiance HDR
// input than this scene's light intensities and crushes shadows further
// at low values instead of lifting them. Left on the plain sRGB output
// (Three's default, no tone mapping) and fixed the actual light energy
// per level instead -- see each level file.

/**
 * A dim environment, so metal has something to reflect.
 *
 * Every metallic material in this project was rendering far darker than
 * intended -- 23 of them, from the handcuff chain and the brass doorknob to the
 * study's "one uncracked mirror" at metalness 1.0 -- because a
 * MeshStandardMaterial sends roughly `metalness` of its response to a
 * reflection, and there was no environment anywhere to reflect. The same bug
 * turned the corridor's puddles into black holes and its exit door into a black
 * rectangle before it was caught there.
 *
 * Deliberately NOT three's RoomEnvironment, which ships with the library: it is
 * a bright neutral studio and would flatten a game whose per-level light energy
 * was measured and tuned by hand, and whose author already rejected ACES tone
 * mapping for making rooms darker (see the note above the renderer).
 *
 * Built instead from a tiny procedural gradient -- warm and dim above, near
 * black below, like an unlit room with one weak bulb in it. That also keeps the
 * project's stated invariant that every texture is generated at runtime with no
 * image assets, which the credits screen asserts.
 */
function buildDimEnvironment(rendererRef) {
  // 2:1 LANDSCAPE, and that ratio is not cosmetic. An equirectangular map puts
  // longitude across the width and latitude down the height, so it must be
  // twice as wide as it is tall. Built portrait first (16x64) and PMREM
  // produced a degenerate 336x16 atlas that contributed literally nothing --
  // a pure white environment at intensity 1 left a mirrored sphere at 0
  // luminance. Measured, not guessed.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0.00, '#2a2418');   // ceiling: the warm bulb bounce
  g.addColorStop(0.45, '#14131a');   // walls: cold and dim
  g.addColorStop(1.00, '#050505');   // floor: almost nothing comes back up
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(rendererRef);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

const scene = new THREE.Scene();
scene.environment = buildDimEnvironment(renderer);
// Scene-wide multiplier. The environment feeds diffuse image-based lighting as
// well as metal reflection, so at 1.0 it would lift every surface in the game
// and undo the per-level tuning. Low enough to give metal its definition back
// without brightening the rooms -- turn this down first if the mood shifts.
// Measured in the study, comparing the whole-room mean against the mirror glass
// (metalness 1.0, the worst-affected surface in the game):
//
//   intensity   room brightness   mirror
//     0.0         baseline          baseline (a flat black rectangle)
//     0.3          +13%              +200%
//     0.5          +25%              +350%
//     1.0          +47%              +690%
//     3.0         +137%             +1715%
//
// The environment feeds diffuse image-based lighting as well as metal
// reflection, so there is no setting that fixes metal for free -- the room
// always comes up with it. 0.5 buys most of the metal back while keeping the
// rooms within the deliberately low exposure the levels were tuned to. Turn it
// DOWN first if the mood ever feels lifted.
scene.environmentIntensity = 0.5;
const worldRoot = new THREE.Group();
scene.add(worldRoot);

/**
 * The camera's resting field of view, and how far sprinting widens it.
 *
 * +8 degrees, and no more, because THE HANDS AND THE TORCH ARE CHILDREN OF THIS
 * CAMERA -- a wider FOV shrinks them. tan(35)/tan(39) = 0.86, so the torch
 * reads about 14% smaller at full sprint, which passes as the arm dropping. At
 * +15 it would be 24% smaller, which reads as the torch physically shrinking,
 * and the proper fix for that is a separate fixed-FOV view-model pass this game
 * does not need.
 */
const BASE_FOV = 70;
const SPRINT_FOV_KICK = 8;

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 100);

/**
 * The third-person eye. See postFX.setCamera for why this is a second camera
 * rather than the first one moved backwards.
 *
 * Deliberately NOT added to the scene: it has no children, and adding it would
 * put a second camera in front of the hands and the torch, which are parented
 * to the real one.
 */
const thirdCam = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 100);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  thirdCam.aspect = camera.aspect;
  thirdCam.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // The composer keeps its own render targets, so resizing the renderer alone
  // leaves the whole game rendering at the old resolution and stretched.
  postFX.setSize(window.innerWidth, window.innerHeight);
});

// ---------- post-processing ----------
// Everything now draws through this rather than renderer.render(). See
// world/Postprocessing.js -- in particular why OutputPass and MSAA samples are
// both load-bearing rather than nice to have.
const postFX = createPostFX(renderer, scene, camera);

// ---------- minimap ----------
// Lives in core/Minimap.js now: it grew a second mode and a fog-of-war, and it
// was already the longest thing in this file that had nothing to do with the
// frame loop. See that file for why the backrooms needs a different scale.
const minimap = createMinimap({
  canvas: minimapCanvas,
  arrowEl: minimapArrowEl,
  wrapEl: minimapWrapEl,
  scene,
  camera
});

// The main camera's own reserved channel: real geometry a level wants shown at
// eye level but hidden from the map (see RenderLayers.js) -- the backrooms'
// oversized floor slab and its light-fixture housings, which read wrong from
// directly above. Layer 0 (everything else) stays shared by both cameras.
camera.layers.enable(MAIN_ONLY);

// ---------- player ----------
const player = new PointerLockPlayer(camera, renderer.domElement);

// The opening restraint is a presentation beat, not a frozen cutscene: the
// player can inspect the bedding and headboard but cannot turn toward the room.
const BEDROOM_RESTRAINED_LOOK_BOUNDS = Object.freeze({
  minYaw: -0.05,
  maxYaw: 0.95,
  minPitch: -0.95,
  maxPitch: 0.15
});

// handheld flashlight -- a spotlight attached to the camera so it always
// points wherever the player looks, only added to the camera once found
/**
 * THE TORCH IS TWO LIGHTS, not one.
 *
 * It used to be a single 56-degree cone at penumbra 0.4 -- one soft blob with no
 * centre, which gives the player nothing to aim. A real torch has a hot spot
 * thrown by the reflector and a much dimmer spill around it, and the hot spot
 * is the part you point at things.
 *
 * The spill stays wide so the player keeps their peripheral orientation in a
 * black room; the hot spot is narrow and hard-edged enough to pick a single
 * object out of the dark at four metres. Both hang off the camera, so they
 * stay aligned with each other for free.
 */
const flashlightSpot = new THREE.SpotLight(0xfff2c0, 0, 10.5, THREE.MathUtils.degToRad(36), 0.78, 1.4);
const flashlightHot = new THREE.SpotLight(0xfff6d8, 0, 12, THREE.MathUtils.degToRad(12.5), 0.28, 1.5);
// SpotLight is the one Object3D subclass that defaults its own local
// position to (0, 1, 0) instead of the origin (it's built to act like an
// overhead stage light pointing down at 0,0,0 by default). Left alone,
// that put the light a full unit above the camera it's parented to,
// aiming permanently ~45 degrees downward no matter where the camera
// looked. Pin it to the camera's exact origin.
flashlightSpot.position.set(0, 0, 0);
flashlightSpot.castShadow = true;
flashlightSpot.shadow.mapSize.set(512, 512);
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, 0, -1);
camera.add(flashlightTarget);
flashlightSpot.target = flashlightTarget;
camera.add(flashlightSpot);

// The hot spot shares the spill's target, so the two can never drift apart.
// Only the spill casts shadows: two shadow-casting spotlights on the camera is
// two 512-square renders a frame for one torch, and the wide one already covers
// everything the narrow one lights.
flashlightHot.position.set(0, 0, 0);
flashlightHot.target = flashlightTarget;
camera.add(flashlightHot);

// dust motes drifting through the flashlight cone (custom shader material,
// see world/DustMotes.js) -- shares the spotlight's own angle/distance so
// the visible dust field always matches the light it's supposedly floating
// in, and is a child of the camera for the same reason the spotlight is.
const dustMotes = createDustMotes({ coneAngleRad: THREE.MathUtils.degToRad(36), maxDistance: 10.5 });
camera.add(dustMotes.points);

scene.add(camera);

// ---------- first-person hands ----------
// A VIEW MODEL, not a physical object: two rigged hands parented to the
// camera, so they travel with the view, have no colliders and are not in any
// collision pass. Copied verbatim from the standalone hands module -- see
// systems/hands/README.md for the public API and systems/hands/HANDOVER.md
// for what is and is not implemented yet.
//
// The `scene.add(camera)` above is load-bearing for these, not just for the
// flashlight. WebGLRenderer.render() traverses from `scene` to decide what to
// draw, so a camera left outside that graph is never visited and everything
// parented to it is silently skipped -- no error, no warning, just no hands.
//
// The module's own default asset path is page-relative
// ('./models/characters/hands.glb'), which assumes a `public/` runtime asset
// root. This project keeps its models in src/assets/models and lets Vite hash
// and rewrite the URL instead, the same as bed/dresser/door -- so point the
// module's build-time seam at that rather than adding a second convention.
setHandAssetUrl(handsModelUrl);

const hands = new Hands({ camera, renderer });
// Deliberately not awaited: the hands are presentation, so they pop in when
// the 167 KB model lands rather than holding up the rest of the boot. A load
// failure warns and leaves the game entirely playable -- every method on Hands
// is safe to call before init() has finished. Nothing has to be re-equipped
// when it lands: the held-item system reconciles every frame (see
// core/HeldItems.js), so whatever is selected appears the frame the hand does.
// Kept so the loading screen can wait for it: the glove's shaders are built in
// warmUp(), which needs the glove to exist.
const handsReady = hands.init().catch((err) => {
  console.error('Failed to initialise the first-person hands:', err);
});

// ---------- the items in hand ----------
/**
 * One mesh factory for every inventory item, used both for the view model in
 * the hand and for a dropped copy on the floor -- see world/itemMeshes.js. The
 * levels hand their own meshes in as templates once they exist (after the
 * levels are built, below); the torch's comes from the load just under this.
 */
const itemMeshes = createItemMeshes();

// ---------- the torch ----------
// A SECOND instance of flashlight.glb, separate from the one dressed onto the
// nightstand in bedroomLevel.js. Two copies rather than re-parenting the world
// prop, because the level owns that one and its reset() puts it back on the
// table -- moving it into the hand would leave reset() restoring a torch that
// is no longer there. It genuinely is a second fetch, not a cache hit
// (THREE.Cache is off by default), but at 300 KB against an already-warm HTTP
// cache that is cheaper than the bookkeeping of sharing one instance between a
// world prop and a view model.
//
// It is the torch's TEMPLATE now rather than the view model itself: the hand
// shows a clone of it (magnified and stripped of shadows by itemMeshes.build),
// and a dropped torch is another clone at life size. How it sits in the hand --
// the hold-torch pose, the 60 degree roll and the framing offset, all exactly as
// measured -- lives in the per-item framing table in core/HeldItems.js, beside
// every other item's.
//
// RIGHT hand, not the left the README's handedness convention asks for: the
// game builds the right hand only (ACTIVE_SIDES in systems/hands/hands.js), and
// that file's own note says a torch then goes in the right hand's grip socket.
const heldTorchReady = loadModel(flashlightModelUrl).then((torch) => {
  itemMeshes.setTemplate('flashlight', torch);
}).catch((err) => {
  console.error('Failed to load the held flashlight, it will not appear in hand:', err);
});

/**
 * The frame's player motion, handed to the hands' procedural layers.
 *
 * One object reused every frame, not a fresh literal: this crosses into
 * per-frame code that the hands module holds to a zero-allocation rule, and a
 * new object here sixty times a second would defeat that from the outside.
 */
const handMotion = { lookDeltaX: 0, lookDeltaY: 0, bobPhase: 0, speed: 0, crouching: false };

/**
 * The torch's switch, kept apart from whether its beam is actually lit.
 *
 * Three things now that the torch can be put away or put down:
 *   flashlightFound     picked up at least once this run. The HUD reads "not
 *                       found" until then.
 *   flashlightSwitchOn  the switch -- what F flips. Putting the torch away
 *                       switches it OFF (see heldItems' onChange below), so
 *                       scrolling back to it brings it out dark; F lights it.
 *   flashlightOn        the beam actually lit: the switch, AND the torch being
 *                       the item in the hand.
 * The beam only ever shines from the hand. Scrolling to the crowbar puts the
 * light out, because a torch in a pocket lights nothing -- that is the price of
 * swapping, and in a game this dark it is a real one. F with something else in
 * hand brings the torch out already lit, so getting the light back is one key.
 *
 * The switch and the lit beam are still two flags, not one: a torch on its way
 * to the floor (Q, before the fingers open) or one whose hand has not loaded is
 * switched on without the beam necessarily being drawn from it yet.
 */
let flashlightFound = false;
let flashlightSwitchOn = false;
let flashlightOn = false;

/** Flips the torch's switch. The beam follows it only while the torch is in hand. */
function setFlashlight(on) {
  flashlightSwitchOn = !!on;
  applyFlashlightBeam();
}

/** Pushes the switch and the hand through to the two lights, the dust and the HUD. */
function applyFlashlightBeam() {
  // `held`, not isHolding(): a torch on its way to the floor stays lit until the
  // fingers actually open.
  const inHand = heldItems.held === 'flashlight';
  flashlightOn = flashlightSwitchOn && flashlightFound && inHand;
  // The spill drops well below the old 2.4: it is now filling AROUND a hot
  // spot rather than being the whole beam, and leaving both at full strength
  // would just be a brighter blob.
  flashlightSpot.intensity = flashlightOn ? 1.75 : 0;
  flashlightHot.intensity = flashlightOn ? 3.35 : 0;
  dustMotes.setBeamOn(flashlightOn);
  flashlightStateEl.textContent = !flashlightFound ? 'not found'
    : !gameState.inventory.has('flashlight') ? 'dropped'
      : !inHand ? 'put away'
        : flashlightOn ? 'on' : 'off';
  flashlightStateEl.classList.toggle('on', flashlightOn);
}

// ---------- inventory, and what is in the hand ----------
/**
 * One item in the hand at a time, chosen from the inventory. The system, and
 * the per-item framing table that says how each item sits in the fist, are in
 * core/HeldItems.js.
 */
const heldItems = createHeldItems({
  hands,
  camera,
  itemMeshes,
  // The beam and the hotbar follow the hand whatever moved it: the wheel, a
  // pickup, a drop, a key used up, or the visor going on.
  onChange: ({ held, previousHeld }) => {
    // Putting the torch away switches it off. Done HERE rather than in the
    // wheel handler because the wheel is only one of the ways the torch leaves
    // the hand -- a pickup puts the new item in it, a drop or a used-up key
    // hands it to the next item -- and every one of them should leave the torch
    // in the pocket dark, not lit again the moment it comes back out.
    if (previousHeld === 'flashlight' && held !== 'flashlight') flashlightSwitchOn = false;
    applyFlashlightBeam();
    refreshInventoryUI();
  }
});

/**
 * Adds an item to the inventory and puts it in the player's hand.
 *
 * Every pickup in the game comes through here, so "what you just picked up is
 * what you are holding" is one rule rather than something each level has to
 * remember. The empty glove plays the reach-and-grab and the item appears in it
 * as the clip ends; `animate: false` skips that, for silent grants.
 */
function pickUpItem(id, { animate = true } = {}) {
  addItem(id);
  // The visor's own flag, for one that was dropped and is coming back. A no-op
  // on the first pickup, where onTakeVisor has already called it.
  if (id === 'visor') visor.take();
  heldItems.take(id, { animate });
  refreshInventoryUI();
}

/**
 * An item has been USED UP -- the brass key in the lockbox, the crowbar on the
 * planks, the bedroom key in its door. This used to be called dropItem(), which
 * is what Q means now. If it was in hand, the next item takes its place.
 */
function consumeItem(id) {
  removeItem(id);
  heldItems.itemRemoved(id);
  refreshInventoryUI();
}

function refreshInventoryUI() {
  const selected = heldItems.selected;
  hotbarSlots.forEach((slot) => {
    const item = slot.dataset.item;
    const owned = gameState.inventory.has(item);
    slot.classList.toggle('filled', owned);
    slot.classList.toggle('selected', owned && item === selected);
  });
}

/**
 * The mouse wheel steps through the owned items in hotbar slot order, wrapping.
 *
 * THROTTLED to one step per WHEEL_STEP_MS. A single notch on a free-spinning or
 * high-resolution wheel -- and any trackpad -- arrives as a burst of small wheel
 * events, and stepping on every one would race straight past the item the player
 * wanted. Only while actually playing: every overlay that takes the mouse
 * (board, keypad, document, credits, pause) releases the pointer first, and the
 * isOpen checks are there for the frame in between.
 *
 * NOT passive. Crouch is held on Ctrl, and Ctrl+wheel -- which a trackpad pinch
 * also arrives as -- is the browser's page zoom, which pointer lock, fullscreen
 * and Keyboard Lock do not stop: scrolling to the torch while crouched zoomed
 * the whole page, and the browser remembered it. The same Ctrl-is-crouch
 * collision KeyboardGuard.js exists for, reached through the wheel, so every
 * wheel event is cancelled while the pointer is locked (the page never scrolls
 * anyway; html and body are overflow: hidden).
 */
const WHEEL_STEP_MS = 120;
let lastWheelStep = -Infinity;
window.addEventListener('wheel', (e) => {
  if (!player.isLocked) return;
  e.preventDefault();
  if (player.cinematic) return;
  if (photoBoardUI.isOpen || pinPadUI.isOpen || documentUI.isOpen) return;
  if (!creditsScreen.classList.contains('hidden')) return;
  // Sprint is held on Shift, and Chromium on Windows (and macOS for any mouse)
  // turns Shift+wheel into a sideways scroll: deltaY 0, the notch in deltaX.
  // Reading only deltaY threw every step away while sprinting. Unshifted, a
  // mostly sideways swipe is still not a step.
  const delta = e.shiftKey && e.deltaY === 0 ? e.deltaX : e.deltaY;
  if (delta === 0) return;
  if (!e.shiftKey && Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  const now = performance.now();
  if (now - lastWheelStep < WHEEL_STEP_MS) return;
  lastWheelStep = now;
  heldItems.cycle(delta > 0 ? 1 : -1);
}, { passive: false });

// ---------- dropping (Q) ----------
/**
 * Where a dropped item lands: centred DROP_DISTANCE in front of the player, or
 * the nearest spot to that where its whole floor footprint is clear.
 *
 * The item lies ACROSS the view, so one ray straight ahead could never see a
 * wall beside the player: walking along a wall on the right and dropping the
 * crowbar put its claw in the wall. So the item's real footprint -- its bounds
 * once lying flat, plus DROP_WALL_MARGIN -- is tested against every collider,
 * along with the line from the player to its centre (so it can never land on
 * the far side of a thin wall). Spots are tried nearest the ideal first: pulled
 * back toward the player in DROP_PULL_STEP steps, and at each distance nudged
 * sideways up to DROP_SIDE_MAX either way, which is what gets a long item off a
 * wall running alongside the player. Nowhere clear: at the player's feet.
 */
const DROP_DISTANCE = 0.8;
const DROP_WALL_MARGIN = 0.03;
const DROP_PULL_STEP = 0.05;
const DROP_SIDE_MAX = 0.3;
/**
 * Every floor in the game is at y = 0 -- the player's eye is pinned at one
 * height and there are no stairs anywhere (see core/collision.js) -- so a
 * dropped item is lifted until its lowest point touches that, plus a hair so it
 * does not z-fight with the boards or a rug.
 */
const DROP_FLOOR_Y = 0;
const DROP_FLOOR_LIFT = 0.002;
/**
 * ...except where something low and walk-over lies on the boards: a rug, a
 * floorboard. Those have no collider -- the player walks straight across them
 * -- so findDropSpot lands items on them, and at DROP_FLOOR_Y an item sank into
 * them: a torch dropped on the bedroom rug sat 1.6 cm into its 1.8 cm pile, a
 * third of the barrel gone. So the footprint is probed straight down from this
 * height, which is below every tabletop (the colliders keep items off
 * furniture anyway), and the item rests on the highest surface found.
 */
const DROP_SURFACE_PROBE_Y = 0.25;
const dropRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const _dropProbe = new THREE.Vector3();

/**
 * Everything on the floor that the player put there: id -> { levelKey, level,
 * holder, hitbox }. Keyed by id because an item can only be in one place --
 * once dropped it is not carried, and picking it up deletes the entry.
 */
const droppedItems = new Map();

/**
 * Q: lets go of whatever is in the hand.
 *
 * Refused whenever the player is not free to act -- chained, mid-transition,
 * caught, in a cutscene or an ending -- which is every case where
 * movementEnabled, lookEnabled or the interaction gate is already off, plus the
 * flags that guard the beats that set those.
 */
function dropHeldItem() {
  if (!player.movementEnabled || !player.lookEnabled || player.cinematic) return;
  if (transitionInFlight || caughtInFlight || endingInFlight || !interaction.enabled) return;
  const id = heldItems.held;
  if (!id || !sceneManager.active || !itemMeshes.has(id)) return;
  heldItems.drop((releasedId) => {
    // Nowhere to put it: it stays carried rather than vanishing.
    if (!placeDroppedItem(releasedId)) return;
    removeItem(releasedId);
    // A torch on the floor is switched off; picking it back up does not
    // relight it behind the player's back.
    if (releasedId === 'flashlight') setFlashlight(false);
    // V must not put on a visor that is lying on the floor.
    if (releasedId === 'visor') gameState.hasVisor = false;
    heldItems.itemRemoved(releasedId);
    refreshInventoryUI();
  });
}

/** Does a box of half-size (hx, hz) centred on (x, z) overlap any collider? */
function footprintBlocked(x, z, hx, hz, boxes) {
  for (const box of boxes) {
    if (x + hx > box.minX && x - hx < box.maxX && z + hz > box.minZ && z - hz < box.maxZ) return true;
  }
  return false;
}

/**
 * The height a dropped item centred on (x, z) rests at: the highest surface
 * under its centre and the four corners of its own footprint -- see
 * DROP_SURFACE_PROBE_Y. `across` and `along` are its half-size across and along
 * the view at `yaw`, i.e. measured in its OWN frame: the corners of the
 * world-aligned box would sit well off a crowbar lying diagonally, and could
 * find a rug the bar never touches and float it above the boards.
 *
 * Raycaster does not skip invisible objects, so the hits are filtered here:
 * anything hidden (a hidden prop, or one inside a hidden group), the levels'
 * invisible interaction hitboxes (opacity 0), and other dropped props, so one
 * item is never balanced on another that could then be picked up from under it.
 */
function dropSurfaceY(levelGroup, x, z, yaw, across, along) {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let top = DROP_FLOOR_Y;
  dropRay.far = DROP_SURFACE_PROBE_Y - DROP_FLOOR_Y + 0.01;
  for (const [sr, sf] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ox = rx * sr * across + fx * sf * along;
    const oz = rz * sr * across + fz * sf * along;
    dropRay.set(_dropProbe.set(x + ox, DROP_SURFACE_PROBE_Y, z + oz), DOWN);
    for (const hit of dropRay.intersectObject(levelGroup, true)) {
      if (hit.point.y <= top) break;
      if (isDropSurface(hit.object, levelGroup)) { top = hit.point.y; break; }
    }
  }
  return top;
}

function isDropSurface(object, levelGroup) {
  if (!object.isMesh) return false;
  const mat = Array.isArray(object.material) ? object.material[0] : object.material;
  if (!mat || mat.visible === false || (mat.transparent && mat.opacity === 0)) return false;
  for (let o = object; o && o !== levelGroup; o = o.parent) {
    if (!o.visible || o.name.startsWith('dropped:')) return false;
  }
  return true;
}

/** The floor spot for a dropped item of half-size (hx, hz) -- see DROP_DISTANCE. */
function findDropSpot(px, pz, yaw, hx, hz, boxes) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  // The camera's right, which is the way the item lies.
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const sideSteps = Math.round(DROP_SIDE_MAX / DROP_PULL_STEP);
  for (let back = 0; back * DROP_PULL_STEP < DROP_DISTANCE; back++) {
    const dist = DROP_DISTANCE - back * DROP_PULL_STEP;
    // 0, +1, -1, +2, -2 ... steps: straight ahead first.
    for (let i = 0; i <= 2 * sideSteps; i++) {
      const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * DROP_PULL_STEP;
      const x = px + fx * dist + rx * side;
      const z = pz + fz * dist + rz * side;
      if (!footprintBlocked(x, z, hx, hz, boxes) && !segmentBlocked(px, pz, x, z, boxes)) return [x, z];
    }
  }
  // Face to a wall: at the player's feet, which is still reachable by looking down.
  return [px, pz];
}

/**
 * Puts a world copy of `id` on the active level's floor in front of the player,
 * with an invisible hitbox to pick it up again (the same padded-sphere trick
 * every small prop in the game uses -- Interaction raycasts non-recursively, so
 * the meshes themselves could never be hit).
 *
 * Parented to the LEVEL's group, so it hides with the room. Levels sit at the
 * world origin, so the player's world position is also the level-space one.
 */
function placeDroppedItem(id) {
  // An item is in one place at a time: a stale floor copy of this id (one the
  // player was handed a fresh copy of) goes, rather than being orphaned by the
  // Map entry below -- left in the room with a prompt that does nothing, and
  // out of reach of clearDroppedItems().
  removeDroppedProp(id);
  const level = sceneManager.active;
  const prop = level ? itemMeshes.build(id, 'world') : null;
  if (!prop) return false;

  const yaw = player.yaw;
  const px = camera.position.x;
  const pz = camera.position.z;

  // Lying flat (the item's tilt is its own -- see REST_ROTATION in
  // world/itemMeshes.js), across the player's view rather than pointing away
  // from it, so it reads at a glance.
  const [rx, ry, rz] = itemMeshes.restRotation(id);
  prop.rotation.set(rx, ry, rz);
  const holder = new THREE.Group();
  holder.name = `dropped:${id}`;
  holder.add(prop);
  // Its own half-size across and along the view, measured before it is turned
  // to the player's yaw -- the footprint dropSurfaceY probes.
  holder.updateMatrixWorld(true);
  const own = new THREE.Box3().setFromObject(holder);
  holder.rotation.y = yaw;

  // Measured before it is placed or parented, so the box is relative to the
  // holder's own origin -- which is the item's GRIP point, not its middle (the
  // crowbar runs from just past it on one side to over half a metre on the
  // other). The holder is then shifted so the footprint is centred on the spot.
  holder.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(holder);
  const [x, z] = findDropSpot(px, pz, yaw,
    (bounds.max.x - bounds.min.x) / 2 + DROP_WALL_MARGIN,
    (bounds.max.z - bounds.min.z) / 2 + DROP_WALL_MARGIN,
    level.colliders ?? []);
  // Probed before the holder is parented, so it can never find itself.
  const floorY = dropSurfaceY(level.group, x, z, yaw,
    (own.max.x - own.min.x) / 2, (own.max.z - own.min.z) / 2);
  holder.position.set(
    x - (bounds.min.x + bounds.max.x) / 2,
    floorY + DROP_FLOOR_LIFT - bounds.min.y,
    z - (bounds.min.z + bounds.max.z) / 2
  );
  level.group.add(holder);
  holder.updateMatrixWorld(true);
  bounds.setFromObject(holder);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());

  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.16, sphere.radius + 0.06), 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitbox.name = `dropped:${id}:hitbox`;
  hitbox.position.copy(sphere.center);
  hitbox.userData.interact = {
    label: `Pick up ${ITEMS[id]?.name ?? id}`,
    onInteract: () => pickUpDroppedItem(id)
  };
  level.group.add(hitbox);
  // The level's own array, which Interaction holds by reference -- so the
  // prompt works the moment the item lands, with no setTargets() call.
  level.interactables.push(hitbox);
  droppedItems.set(id, { levelKey: sceneManager.activeKey, level, holder, hitbox });
  return true;
}

/** Takes a dropped prop and its hitbox out of the world. Does not touch the inventory. */
function removeDroppedProp(id) {
  const entry = droppedItems.get(id);
  if (!entry) return;
  droppedItems.delete(id);
  entry.holder.removeFromParent();
  entry.hitbox.removeFromParent();
  const index = entry.level.interactables.indexOf(entry.hitbox);
  if (index >= 0) entry.level.interactables.splice(index, 1);
  // Only the hitbox is this file's to free. The prop's geometry and materials
  // are SHARED with the level mesh it was cloned from -- see itemMeshes.js.
  entry.hitbox.geometry.dispose();
  entry.hitbox.material.dispose();
}

function pickUpDroppedItem(id) {
  // Interaction can stay latched on the hitbox for a frame after it goes.
  if (!droppedItems.has(id)) return;
  removeDroppedProp(id);
  pickUpItem(id);
}

/**
 * Hands back, silently, everything dropped anywhere but `keepKey`.
 *
 * Levels are linear and every exit is one-way, so an item left on the floor of
 * a room the player has walked out of would be gone for good -- and the torch
 * is the one thing the corridor and the basement cannot be crossed without. A
 * drop must never be able to softlock a run, so leaving a room brings its
 * floor with you.
 */
function returnDroppedItems(keepKey) {
  let returned = null;
  for (const [id, entry] of droppedItems) {
    if (entry.levelKey === keepKey) continue;
    removeDroppedProp(id);
    addItem(id);
    if (id === 'visor') visor.take();
    returned ??= id;
  }
  if (!returned) return;
  // An empty hand gets the first of them back; a full one keeps what it has.
  if (!heldItems.selected) heldItems.select(returned);
  // The HUD's "dropped" has to become "put away" even when the hand is unchanged.
  applyFlashlightBeam();
  refreshInventoryUI();
}

/** A restart: every dropped prop goes, and nothing is handed back (resetState empties the inventory). */
function clearDroppedItems() {
  for (const id of [...droppedItems.keys()]) removeDroppedProp(id);
}

// ---------- audio ----------
const audio = new AudioEngine();

// ---------- interaction / captions ----------
// One caption authority for the whole game. Interaction forwards examine text
// to it; story beats call captions.play([...]) and can await the result.
const captions = new CaptionSequencer(captionEl);
const interaction = new Interaction(camera, promptEl, captions);
// Voice follows the caption rather than the other way round: the caption is
// the primary channel and always exists, the clip may not. A line with no
// `voice` key, or whose clip has not been recorded yet, is simply silent.
captions.onLineStart = (line) => {
  if (line.voice) audio.playVoice(line.voice);
};
function showCaption(text) {
  interaction.showCaption(text);
}

// ---------- levels ----------
const sceneManager = new SceneManager(worldRoot);

// Close-up photo board: unlocks the pointer so the mouse can drag photos
// normally, then re-locks on close. Pointer-unlock also drives the
// pause-screen UI elsewhere (see the `unlock` listener below), so that
// listener checks `photoBoardUI.isOpen` to skip showing the pause menu
// underneath the board.
const photoBoardUI = createPhotoBoardUI({
  onClose: () => player.lock()
});

// Same unlock-to-interact / re-lock-on-close pattern as the photo board,
// for the bedroom's lamp-drawer combination lock (and any future
// numeric-lock puzzle -- the UI itself doesn't know the code, see
// PinPadUI.js).
const pinPadUI = createPinPadUI({
  onClose: () => player.lock()
});

// The reading surface for every letter, note, file and transcript in the game.
// Same unlock-to-interact / re-lock-on-close contract as the two above.
const documentUI = createDocumentUI({
  onClose: () => player.lock()
});

// Scripted camera shots. Built here because it needs the hands and the dust
// motes, both of which have to be hidden for any shot that leaves the player's
// head -- see core/Cutscene.js.
const cutscene = createCutsceneRunner({
  camera, player, interaction, hands, dustMotes, captions, fade
});

// Story beats. Every delayed beat in the game runs through this so a restart
// can cancel it -- see core/Script.js for the bug that made it necessary.
const script = createScriptRunner({ captions });
const bedroomHorrorScript = createScriptRunner({ captions });
const bedroomHorrorEvents = new Set();
// Level 1 is quiet by default. Breath only comes close enough to be heard for
// the two authored door beats; later levels keep their own intensity calls.
const LEVEL_ONE_BREATHING_BASE = 0.035;
const LEVEL_ONE_DOOR_BREATHING = 0.72;

/** Runs each Level 1 environmental beat once and makes its delays reset-safe. */
function runBedroomHorrorEvent(id, sequence) {
  if (bedroomHorrorEvents.has(id)) return;
  bedroomHorrorEvents.add(id);
  bedroomHorrorScript.run(sequence);
}

/**
 * ONE creature for the house, parented to the world root rather than to any
 * level.
 *
 * It is the same person in every room -- that is the entire twist -- so giving
 * each level its own would be building the lie into the code. It lives here,
 * hidden, and a level's beats make it visible where they want it. Levels sit at
 * the world origin, so level coordinates and world coordinates are the same
 * numbers, which is what makes this safe.
 *
 * THE IMPORTED OKABE, bloodied, and the same model the backrooms and the
 * player's own body use, so the game has one monster rather than two. It used
 * to be the procedural capsule rig in Creature.js; that is gone.
 *
 * restCorrection 0 because every beat that shows it calls reset() and expects
 * the monster -- the window glimpse, the hallway strike, the corner, the chase.
 * The Level 3 reveal asks for the man explicitly, and the visor drives the dial
 * between the two.
 */
const creature = createOkabeCreature({ restCorrection: 0 });
creature.visible = false;
worldRoot.add(creature.group);

/**
 * A SECOND instance of the same figure, for the backrooms only.
 *
 * Not the house creature reused, because the backrooms drives state the house
 * beats would then have to undo: setSilhouette, the MAIN_ONLY layer that hides
 * it from the minimap, and a partial correction. Two instances keep each one's
 * state its own. They share the cached file, not a skeleton.
 */
const okabe = createOkabeCreature();
okabe.visible = false;
worldRoot.add(okabe.group);

/**
 * The player's own body, for the third-person view.
 *
 * THE SAME MODEL AS THE MONSTER, held at correction 1. That is the whole point
 * of the twist and it costs nothing to honour here: the thing in the corridor
 * and the person you are playing are one mesh with one shape key between them,
 * so seeing yourself from behind is seeing the body the Hollow is a distortion
 * of. setCorrection(1) is the man.
 *
 * A SECOND INSTANCE RATHER THAN A CLONE OF THE FIRST. Object3D.clone() on a
 * SkinnedMesh shares the skeleton with the original, so the player's body would
 * be posed by the monster's gait and walk on the monster's legs. SkeletonUtils
 * could deep-clone it, but a second createOkabeCreature() re-parses a file the
 * browser already has cached and keeps every bone, rest pose and measured axis
 * owned by one object -- which is also what makes the third-person body get the
 * gait work for free.
 */
// gait: 'player' asks OkabeCreature for the player's own walk rather than the
// monster's -- the same body, carried like a person who is trying not to be
// heard. It also takes the crouch and the turn rate, fed in updateThirdPerson().
const playerBody = createOkabeCreature({ clean: true, gait: 'player' });
playerBody.visible = false;
playerBody.setCorrection(1);
worldRoot.add(playerBody.group);

// ---------- third person ----------
/**
 * Over the left shoulder, in metres, measured from the player's eye.
 *
 * Left rather than right only because the torch is held right: from behind the
 * right shoulder the player's own arm sits in the middle of the beam.
 */
const TP_BACK = 2.45;
const TP_UP = 0.28;
const TP_SIDE = -0.42;
/** Never let the camera inside the body: at this it is still behind the head. */
const TP_MIN_BACK = 0.55;
/** How quickly the view swings between the two. Snapping is nauseating. */
const TP_BLEND_TAU = 0.14;

let thirdPerson = false;
/** 0 = first person, 1 = third. Eased, so the toggle is a move not a cut. */
let thirdAmount = 0;
const _tpFwd = new THREE.Vector3();
const _tpRight = new THREE.Vector3();
const _tpWant = new THREE.Vector3();
const _tpPrev = new THREE.Vector3();
const _tpStep = new THREE.Vector3();
let bodySpeed = 0;

/**
 * How fast the player is turning, for the body's gait (a lean into the turn, a
 * step that pivots rather than slides).
 *
 * Measured off player.yaw frame to frame, WRAP-SAFE: yaw is an accumulating
 * angle, and an atan2 of the difference keeps a turn across +/-PI from reading
 * as a full spin the other way. Lightly smoothed, because raw mouse deltas
 * arrive in uneven lumps and a gait following them frame by frame twitches.
 * A jump of more than TP_YAW_SNAP in one frame is ignored, because a spawn sets
 * yaw outright and would otherwise read as a frame of turning at hundreds of
 * radians a second; the clamp catches whatever fast flicks remain.
 */
const TP_TURN_TAU = 0.08;
const TP_MAX_TURN_RATE = 12;
const TP_YAW_SNAP = 1.0;
let prevBodyYaw = null;
let bodyTurnRate = 0;

/**
 * THE BODY FACES WHERE IT IS GOING, NOT WHERE THE CAMERA LOOKS -- the Dead by
 * Daylight survivor rule, and the only one under which this gait is honest.
 *
 * The foot path can only walk FORWARD along the body's own facing. With the
 * body glued to the camera's yaw, holding S played a forward walk while the
 * body slid backwards, and A or D skated it sideways -- measured at about
 * 4 m/s and 2.8 m/s of shoe slip respectively, against 6 mm per stance walking
 * forward. Turning the body toward the direction of travel makes every WASD
 * direction a forward walk, which is exactly what DbD does: backpedal and the
 * survivor turns round and runs at the camera.
 *
 * Eased rather than snapped (a survivor turns fast but not instantly), held
 * while standing so looking around does not spin the body, and snapped on a
 * teleport, which would otherwise read as one frame of sprinting somewhere.
 */
const TP_FACE_TAU = 0.11;        // ~9 rad/s at a right-angle turn
const TP_FACE_MIN_SPEED = 0.35;  // m/s; below this the body keeps its facing
const TP_TELEPORT = 1.0;         // metres in one frame = a spawn, not a step
let bodyFacing = null;

function setThirdPerson(on) {
  thirdPerson = !!on;
  // The hands are a VIEW MODEL parented to the camera -- from behind they are
  // two forearms hanging in the air where the head is. The dust motes are
  // parented there too and read as a swarm around the player's own skull.
  // Whatever is in the hand goes with them: it is parented into a socket, so it
  // lives under hands.root too.
  hands.root.visible = !thirdPerson;
  dustMotes.points.visible = !thirdPerson;
  playerBody.visible = thirdPerson;
  if (thirdPersonBtn) {
    thirdPersonBtn.textContent = thirdPerson ? 'View: 3rd' : 'View: 1st';
  }
}

thirdPersonBtn?.addEventListener('click', (e) => {
  setThirdPerson(!thirdPerson);
  // Or the click leaves focus on the button and the next SPACE or ENTER
  // presses it again instead of reaching the game.
  e.currentTarget.blur();
});

// ---------- free camera (N) ----------
/**
 * A fly-through camera for recording clips and the trailer -- see
 * core/FreeCamera.js. The player stays where they were standing and the game
 * keeps running round them.
 */
const freeCamera = new FreeCamera({
  sourceCamera: camera,
  isInputLive: () => player.isLocked,
  getSensitivityMultiplier: () => player.sensitivity,
  onChange: applyFreeCameraVisibility
});
// The same eye-level-only geometry the player's camera draws.
freeCamera.camera.layers.enable(MAIN_ONLY);

/**
 * The view model -- hands, held item, dust motes -- is parented to the
 * player's camera, so from the free camera it is a pair of forearms hanging in
 * mid-air. Hidden for the same reason setThirdPerson() hides it. The player's
 * body is optional (B), for shots that want the character in them.
 */
function applyFreeCameraVisibility() {
  const isViewModelShown = !thirdPerson && !freeCamera.isActive;
  hands.root.visible = isViewModelShown;
  dustMotes.points.visible = isViewModelShown;
  playerBody.visible = thirdPerson || (freeCamera.isActive && freeCamera.isPlayerBodyVisible);
  // Nothing the player was holding down before the switch keeps walking them.
  player.clearKeys();
}

/**
 * Put the third-person camera behind the player, and the player's body under it.
 *
 * Runs after player.update(), because both are read off where the player
 * actually ended this frame rather than where it started.
 */
function updateThirdPerson(dt) {
  thirdAmount += ((thirdPerson ? 1 : 0) - thirdAmount) * (1 - Math.exp(-dt / TP_BLEND_TAU));

  // The body tracks the player whether or not it is being drawn, so toggling
  // in never shows it catching up from wherever it was last seen.
  _tpStep.set(camera.position.x - _tpPrev.x, 0, camera.position.z - _tpPrev.z);
  const moved = Math.hypot(_tpStep.x, _tpStep.z);
  _tpPrev.copy(camera.position);
  // Measured from the move, not read off player.speed: that is the speed being
  // asked for, and the gait wants the one actually achieved -- a player walking
  // into a wall is not striding.
  bodySpeed += ((dt > 0 ? moved / dt : 0) - bodySpeed) * (1 - Math.exp(-dt / 0.08));
  if (bodyFacing === null || moved > TP_TELEPORT) {
    bodyFacing = player.yaw;
  } else if (dt > 0 && moved / dt > TP_FACE_MIN_SPEED) {
    // Yaw 0 looks down -Z, so the heading of a step (dx, dz) is atan2(-dx, -dz).
    const heading = Math.atan2(-_tpStep.x, -_tpStep.z);
    const d = Math.atan2(Math.sin(heading - bodyFacing), Math.cos(heading - bodyFacing));
    bodyFacing += d * (1 - Math.exp(-dt / TP_FACE_TAU));
  }
  // The turn rate is the BODY's, not the camera's: it is what leans the gait.
  const yawDelta = prevBodyYaw === null ? 0 : bodyFacing - prevBodyYaw;
  prevBodyYaw = bodyFacing;
  const yawStep = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
  // More than a radian in one frame is a spawn setting yaw, not a turn.
  const rawTurnRate = dt > 1e-4 && Math.abs(yawStep) < TP_YAW_SNAP
    ? THREE.MathUtils.clamp(yawStep / dt, -TP_MAX_TURN_RATE, TP_MAX_TURN_RATE)
    : 0;
  bodyTurnRate += (rawTurnRate - bodyTurnRate) * (1 - Math.exp(-dt / TP_TURN_TAU));
  playerBody.setPosition(camera.position.x, camera.position.z);
  playerBody.setYaw(bodyFacing);
  playerBody.setSpeed(bodySpeed);
  // Optional-chained: these arrive with the player gait in OkabeCreature.js,
  // and the body must keep walking on a build that predates them.
  playerBody.setCrouch?.(player.crouch);
  playerBody.setTurnRate?.(bodyTurnRate);
  playerBody.update(dt);

  if (thirdAmount < 0.001) return;

  camera.getWorldDirection(_tpFwd);
  _tpRight.set(-_tpFwd.z, 0, _tpFwd.x).normalize();
  // Straight back along the look vector, so looking down tilts the camera up
  // over the shoulder the way every third-person game does.
  _tpWant.copy(camera.position)
    .addScaledVector(_tpFwd, -TP_BACK * thirdAmount)
    .addScaledVector(_tpRight, TP_SIDE * thirdAmount);
  _tpWant.y += TP_UP * thirdAmount;

  // Pull in rather than clip through. The colliders are 2D boxes and the walls
  // are full height, so the flat test is exact here rather than an approximation
  // -- the same reasoning BackroomsHunter.canSee uses.
  const boxes = sceneManager.active?.colliders ?? [];
  if (segmentBlocked(camera.position.x, camera.position.z, _tpWant.x, _tpWant.z, boxes)) {
    // Walk back toward the head until it is clear. Sixteen steps over 2.45 m is
    // 15 cm, which is finer than the camera's own near plane matters at.
    let t = 1;
    for (let i = 0; i < 16; i++) {
      t -= 1 / 16;
      const x = camera.position.x + (_tpWant.x - camera.position.x) * t;
      const z = camera.position.z + (_tpWant.z - camera.position.z) * t;
      if (!segmentBlocked(camera.position.x, camera.position.z, x, z, boxes)) {
        _tpWant.set(x, camera.position.y + (_tpWant.y - camera.position.y) * t, z);
        break;
      }
      if (t <= TP_MIN_BACK / TP_BACK) {
        _tpWant.copy(camera.position).addScaledVector(_tpFwd, -TP_MIN_BACK);
        break;
      }
    }
  }
  thirdCam.position.copy(_tpWant);
  thirdCam.quaternion.copy(camera.quaternion);
  thirdCam.fov = camera.fov;
  thirdCam.updateProjectionMatrix();
}

/**
 * Being caught is being STOPPED, not killed -- see CreatureAI.js's header. The
 * player comes to a little further back in the room, having lost the ground
 * they just covered, rather than facing any kind of death or reload.
 */
let caughtInFlight = false;
const creatureAI = createCreatureAI({
  creature,
  getPlayer: () => ({ x: camera.position.x, z: camera.position.z, yaw: player.yaw }),
  onBreathing: (level) => audio.setBreathing(level),
  onCaught: () => {
    // Guards against the vanishingly small window where a level transition is
    // already mid-flight (e.g. the player solved the last lock in the same
    // frame) -- CreatureAI's own CATCH_COOLDOWN already stops this firing
    // twice in a row on its own.
    if (caughtInFlight || transitionInFlight) return;
    caughtInFlight = true;
    script.run(async (s) => {
      try {
        s.do(() => {
          player.movementEnabled = false;
          player.lookEnabled = false;
          interaction.setEnabled(false);
        });
        if (!await s.play(line('dialog_caught_hauled_back'))) return;
        // fade.fadeOut()/fadeIn() are not part of Script's cancellation system
        // (they always resolve, unlike s.wait()/s.play()) -- checking s.alive()
        // afterward is what stops a restart mid-fade from having this sequence
        // teleport the player or re-enable input into a level that has since
        // moved on. If a restart happened, resetGame()'s abortTransition()
        // already cleared the fade overlay itself.
        await fade.fadeOut(450);
        if (!s.alive()) return;
        s.do(() => {
          const [sx, sz] = study.spawn;
          player.spawn(sx, sz, study.spawnYaw ?? 0);
        });
        await fade.fadeIn(650);
        if (!s.alive()) return;
        s.do(() => {
          player.lookEnabled = true;
          player.movementEnabled = true;
          interaction.setEnabled(true);
        });
        await s.play(line('dialog_caught_back_by_door'));
      } finally {
        caughtInFlight = false;
      }
    });
  }
});

/**
 * The visor. One switch that has to move the render pass, the creature and the
 * room together -- see core/Visor.js for why they are wired in one place.
 */
const visor = createVisor({
  postFX,
  creature,
  getLevel: () => sceneManager.active
});

const BULB_BLOW_DELAY_AFTER_CUFF_UNLOCK_SECONDS = 3;

const bedroom = createBedroomLevel({
  showCaption,
  // Every item puzzle in the room asks the hand, not just the inventory.
  isHolding: (id) => heldItems.isHolding(id),
  // Picked up first, into the hand; the cuff only takes it on a second press.
  onPaperclipPicked: () => pickUpItem('paperclip'),
  // The paperclip's own 900ms delay before onFreed IS the time the player
  // spends picking the lock, so the loop plays for exactly as long as the
  // story already says it takes -- no separate duration to keep in sync.
  //
  // The paperclip is IN the hand while this plays (onFreed uses it up after).
  // It is held in grip-cylinder (see HELD_ITEM_FRAMING in core/HeldItems.js),
  // the very shape the loop is built on, so the loop's few degrees of wrist
  // work the clip in the cuff rather than swinging it off across the screen.
  onPaperclipUsed: () => hands.play('right', 'lockpick', { fade: 0.2 }),
  onFreed: () => {
    // The wake-up scene starts on the mattress. Leave it intact while chained,
    // then move to the clear foot-end position before the full bed collider is
    // allowed to resolve movement. teleport() retains the player's look state.
    const [bedExitPositionX, bedExitPositionZ] = bedroom.refs.bedExitPosition;
    player.teleport(bedExitPositionX, bedExitPositionZ);
    player.setLookBounds(null);
    player.movementEnabled = true;
    objectiveEl.textContent = 'Escape the house without getting caught.';
    // The lockpick loop has no natural end of its own (see clips/lockpick.js -
    // it is a loop, so nothing ever fires hands:clip-end for it), so being
    // freed is what stops it.
    hands.stop('right');
    // Used up, like the brass key and the crowbar: the clip stays in the
    // cuff's lock. Kept, it sat first in the hotbar for the whole run as a dead
    // wheel stop, and was what the hand fell back to when the bedroom key went
    // into its door -- so the player walked out holding a spent paperclip.
    consumeItem('paperclip');
    // Reconciled now rather than next frame, so the ease below heads for the
    // empty glove's relaxed shape and not the paperclip's grip. stop() left the
    // joints wherever the loop had them; this eases the rest of the way back to
    // however whatever is still in hand is held, rather than snapping.
    heldItems.update();
    heldItems.restorePose(0.3);
    // Was two bare setTimeouts at 4200 and 9000 ms that nothing cancelled, so
    // pressing R inside that window blew the bulb of the freshly restarted room
    // several seconds later with no way to work out why. Now a script: every
    // await returns false once a restart has bumped the generation.
    script.run(async (s) => {
      // The cuff caption stays on screen, but must not lengthen the measured
      // unlock-to-blow delay: `line('dialog_freed')` has two lines and used to push the
      // bulb event several seconds later than its intended beat.
      s.do(() => { captions.play(line('dialog_freed')); });
      if (!await s.wait(BULB_BLOW_DELAY_AFTER_CUFF_UNLOCK_SECONDS)) return;
      s.do(() => {
        bedroomStorm.blowBulb();
        audio.setBreathing(LEVEL_ONE_BREATHING_BASE);
      });
      // The caption waits for the filament to actually go, rather than
      // announcing it over the top of the surge.
      if (!await s.wait(0.9)) return;
      s.do(() => {
        // "Only the lightning now" has to mean something. The room's light
        // FLOOR drops with the bulb -- it was identical before and after, so
        // the darkness the line promises never arrived.
        bedroom.refs.ambient.intensity = AMBIENT_DARK;
      });
      if (!await s.play(line('dialog_bulb_blows'))) return;
      if (!await s.wait(1.8)) return;
      s.do(() => {
        audio.creak();
        audio.footsteps({ count: 1, pan: 0.55, level: 0.28 });
        // Arms the one glimpse at the window -- see the note above
        // bedroomStorm. Left until now rather than the moment the bulb goes,
        // so it lands as its own jolt instead of piling onto that beat.
        windowFlashArmed = true;
      });
    });
  },
  onFlashlightPicked: () => {
    flashlightFound = true;
    // Into the hand first: the beam only lights from the hand, so switching it
    // on before the torch was the held item would light nothing.
    pickUpItem('flashlight');
    setFlashlight(true);
    // The storm goes back to a normal rhythm: the player can see for themselves
    // now, so the lightning stops being the only way to navigate.
    bedroomStorm.calm();
    captions.play(line('dialog_flashlight_on'));
    runBedroomHorrorEvent('flashlight-sound', (s) => {
      s.do(() => {
        bedroom.refs.disturbChair();
        audio.footsteps({ count: 1, pan: -0.45, level: 0.24 });
      });
    });
  },
  onBrassKeyFound: () => {
    // The physical drawer key keeps the existing inventory grant; the pickup
    // gesture makes that transfer visible without introducing a held key mesh.
    hands.play('right', 'pickup', { fade: 0.15 });
    pickUpItem('brassKey');
  },
  // Used up, not dropped: the key stays in the lockbox, the crowbar comes out
  // of it (and goes into the hand), the planks keep the crowbar, the door keeps
  // its key.
  onBrassKeyUsed: () => consumeItem('brassKey'),
  onCrowbarFound: () => {
    pickUpItem('crowbar');
  },
  onCrowbarUsed: () => consumeItem('crowbar'),
  onBedroomKeyFound: () => {
    pickUpItem('bedroomKey');
  },
  onBedroomKeyUsed: () => {
    consumeItem('bedroomKey');
    // The door wanted the key IN the hand, which put the torch away -- and a
    // torch put away is switched off. Through this door is the dark of the
    // corridor, so the torch comes back out lit, as G's skip already does.
    if (gameState.inventory.has('flashlight') && heldItems.select('flashlight')) setFlashlight(true);
  },
  onPhotoCollected: (count) => {
    if (count !== 2) return;
    runBedroomHorrorEvent('two-photos', (s) => {
      s.do(() => {
        bedroom.refs.disturbBin();
        audio.creak();
      });
    });
  },
  onPhotoPuzzleSolved: () => {
    runBedroomHorrorEvent('photo-puzzle-perception-pulse', async (s) => {
      // The board UI has a close beat of its own. Wait until the player is
      // back in the bedroom so this reads as their perception of the room,
      // rather than tinting an interface panel.
      if (!await s.wait(0.4)) return;
      s.do(() => postFX.setCaught(0.22));
      if (!await s.wait(0.32)) return;
      s.do(() => postFX.setCaught(0));
    });
  },
  onDrawerUnlocked: () => {
    runBedroomHorrorEvent('drawer-thump', async (s) => {
      if (!await s.wait(0.55)) return;
      s.do(() => {
        bedroom.refs.flashLamp();
        audio.thump(0.8);
      });
    });
  },
  onSafeOpened: () => {
    runBedroomHorrorEvent('safe-door-rattle', async (s) => {
      if (!await s.wait(0.45)) return;
      s.do(() => {
        bedroom.refs.rattleDoor();
        audio.creak();
      });
      if (!await s.wait(0.22)) return;
      s.do(() => audio.creak());
    });
  },
  onFloorboardOpened: () => {
    runBedroomHorrorEvent('key-footsteps-retreat', async (s) => {
      if (!await s.wait(0.18)) return;
      s.do(() => {
        bedroom.refs.playDoorPass();
        audio.footsteps({ count: 4, spacing: 0.32, pan: 0.55, panTo: -0.85, level: 0.42 });
      });
    });
  },
  onDoorPlankRemoved: () => {
    runBedroomHorrorEvent('plank-breathing-retreat', async (s) => {
      s.do(() => {
        bedroom.refs.rattleDoor();
        audio.setBreathing(LEVEL_ONE_DOOR_BREATHING);
      });
      if (!await s.wait(0.8)) return;
      s.do(() => audio.footsteps({ count: 4, spacing: 0.36, pan: 0.3, panTo: -0.9, level: 0.45 }));
      if (!await s.wait(1.8)) return;
      s.do(() => audio.setBreathing(LEVEL_ONE_BREATHING_BASE));
    });
  },
  onReadDrawerClue: () => {
    player.unlock();
    documentUI.open({
      title: 'PROJECT HOLLOW — Drawer Note',
      body: 'HOLLOW archive reference: 06-1987. Do not move the family records from the house. The brass key remains with the sealed evidence.',
      variant: 'note'
    });
  },
  onReadSafeTag: () => {
    player.unlock();
    documentUI.open({
      title: 'PROJECT HOLLOW — Evidence Tag',
      body: 'Recovered item: pry bar. Location: upstairs bedroom. Status: retain on site. The original bedroom key is concealed below the loose floorboard.',
      variant: 'note'
    });
  },
  onDoorOpened: () => {
    bedroomHorrorScript.cancel();
    exitLevel('bedroom');
  },

  /**
   * The scratched floor message, and what it brings.
   *
   * This is the beat the storyline builds Level 1 around and it did not exist
   * in any form: "After reading this, you hear something move outside the door.
   * Footsteps. Floorboards creaking. Heavy breathing. Something moves past the
   * door." The objective changes here because this is the moment the game stops
   * being about a locked room and starts being about what else is in the house.
   */
  onReadMessage: () => {
    script.run(async (s) => {
      if (!await s.play(line('dialog_scratches'))) return;
      if (!await s.wait(0.8)) return;
      s.do(() => {
        // Sound and picture start together. The steps sweep left to right past
        // the door, and the strip of light under it is broken as they pass.
        audio.footsteps({ count: 7, spacing: 0.62, pan: -0.8, panTo: 0.8, level: 0.55 });
        bedroom.refs.playDoorPass();
        // It is right outside. Nothing in the game has been this close yet.
        audio.setBreathing(LEVEL_ONE_DOOR_BREATHING);
      });
      if (!await s.play(line('dialog_past_the_door'))) return;
      s.do(() => {
        objectiveEl.textContent = 'Escape the house without getting caught.';
        audio.setBreathing(LEVEL_ONE_BREATHING_BASE);
      });
    });
  },

  onExaminePolaroid: () => {
    captions.play(line('dialog_polaroid'));
  },
  onExaminePhotos: ({ photos, onSolved }) => {
    player.unlock();
    photoBoardUI.open(photos, onSolved);
  },
  onExaminePinpad: ({ length, code, onSolved }) => {
    player.unlock();
    pinPadUI.open({ length, code, onSolved });
  }
});
sceneManager.register('bedroom', bedroom);

// ---------- level 1 hints ----------
// H gives a hint for whichever bedroom puzzle the player is on, vaguer first
// and more direct on each press; see core/HintSystem.js and
// levels/bedroomHints.js. The wording is in dialogue/level1_bedroom.js.

/**
 * Snapshots the bedroom's puzzle progress for the hint system: the room's own
 * puzzleState, plus the two things it does not track itself (whether the
 * paperclip is carried, and whether the torch has been found) and the code the
 * lamp blinks.
 *
 * @returns {object} a fresh progress object; safe for the caller to keep.
 */
function readBedroomHintProgress() {
  return {
    ...bedroom.refs.puzzleState,
    hasPaperclip: gameState.inventory.has('paperclip'),
    flashlightFound,
    drawerPinDigits: bedroom.refs.drawerPinDigits
  };
}

/**
 * Marks lines as help rather than dialogue, so they show even with captions
 * turned off in Settings. A player who switched captions off still pressed H
 * because they wanted a hint -- hiding the answer made the key look broken.
 */
function alwaysShown(lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  return list.map((entry) => (typeof entry === 'string'
    ? { text: entry, always: true }
    : { ...entry, always: true }));
}

const bedroomHints = createHintSystem({
  stages: BEDROOM_HINT_STAGES,
  readProgress: readBedroomHintProgress,
  // interaction.showCaption, not the local showCaption(): the hint system needs
  // its answer, which is false while a story sequence holds the caption.
  // Every hint, the "press H" offer and the all-solved line go through here.
  showCaption: (lines) => interaction.showCaption(alwaysShown(lines)),
  readNudgeLines: () => line('dialog_hint_nudge'),
  readAllSolvedLines: () => line('dialog_hint_all_solved'),
  onNudge: pulseHintKey
});

/**
 * Pulses the on-screen hint key, so the "press H" offer points at something.
 * The class is taken off and put back with a reflow between, or a second
 * offer would find the animation already finished and do nothing.
 */
function pulseHintKey() {
  hintKeyEl.classList.remove('nudge');
  void hintKeyEl.offsetWidth;
  hintKeyEl.classList.add('nudge');
}

/** The H key: a hint in the bedroom, and a plain answer anywhere else. */
function showHint() {
  if (sceneManager.activeKey === 'bedroom') bedroomHints.showNextHint();
  else showCaption(alwaysShown(line('dialog_hint_unavailable')));
}

// Screen-space half of the basement's overload glare. The level drives the
// 0..1 amount; here it becomes a cool-white wash plus a backdrop blur, which
// is what actually takes the player's sight away -- bright lights on their
// own still leave the room legible. The overlay is taken out of the layout
// entirely at 0 so its backdrop filter costs nothing the rest of the time.
const GLARE_MAX_BLUR_IN_PIXELS = 2;
let currentGlareAmount = 0;

/**
 * Updates the full-screen glare wash.
 *
 * @param {number} amount - 0 for a normal room, 1 for a full whiteout.
 *   Values in between fade the tint and shrink the blur proportionally.
 */
function setGlare(amount) {
  if (amount === currentGlareAmount) return;
  currentGlareAmount = amount;
  glareOverlay.style.display = amount > 0 ? 'block' : 'none';
  glareOverlay.style.opacity = String(amount);
  glareOverlay.style.setProperty('--glare-blur', `${(amount * GLARE_MAX_BLUR_IN_PIXELS).toFixed(2)}px`);
}

/**
 * Which CCTV sightings have already played this run. Local rather than in
 * GameState because they do not cross a level boundary -- and a restart rebuilds
 * this level anyway, so its reset() clears them.
 */
const cctvSeen = new Set();

/** True while it is standing there, so the frame loop keeps it breathing. */
let creatureStanding = false;

const hallwayBasement = createHallwayBasementLevel({
  showCaption,
  onExit: () => exitLevel('hallwayBasement'),
  onSpark: () => audio.spark(),
  onTrolleyRoll: (level) => audio.setTrolleyRattle(level),
  // The crash. Level 2's creature is scripted rather than hunting, so nothing
  // answers the noise yet -- this is where to hook it if something should.
  onTrolleyCrash: () => audio.trolleyCrash(),
  onGlare: setGlare,

  onPowerRestored: () => {
    script.run(async (s) => {
      if (!await s.play(line('dialog_power_restored'))) return;
    });
  },

  /**
   * The main goes as the player reaches the metal door.
   *
   * The creature is NOT shown here, and that is the point of the beat: the
   * player only hears the lever and the room dying, and has to sit with the
   * fact that somebody was standing at that panel. On a second playthrough it
   * reads the other way round -- this is Annabelle cutting the power to keep
   * her brother away from the front door.
   */
  onBlackout: () => {
    script.run(async (s) => {
      s.do(() => {
        audio.creak();
        audio.spark();
        // It is close. The breathing says so without showing anything.
        audio.setBreathing(0.9);
      });
      if (!await s.play(line('dialog_blackout'))) return;
      s.do(() => audio.setBreathing(0.7));
    });
  },

  onGeneratorRunning: () => {
    script.run(async (s) => {
      if (!await s.play(line('dialog_generator_running'))) return;
    });
  },

  onOverload: () => captions.play(line('dialog_breaker_overload')),

  onPowerRouted: () => {
    script.run(async (s) => {
      if (!await s.play(line('dialog_power_routed'))) return;
    });
  },

  /**
   * The metal door's security lockout. Same contract as the study's
   * combination lock: unlock the player, hand the shared keypad the code the
   * level owns, and let PinPadUI's own onClose re-lock on the way out.
   */
  onEnterSecurityCode: ({ code, onSolved }) => {
    player.unlock();
    pinPadUI.open({ length: code.length, code, onSolved });
  },

  /**
   * The two sightings, both of which happen ON THE SCREEN rather than in the
   * world. That is the point: the player is looking at a monitor, so the game
   * can put the creature exactly where it wants, for exactly as long as it
   * wants, and be certain they saw it -- which is not true of anything that
   * happens behind them in a dark room.
   */
  onExamineSketch: () => {
    player.unlock();
    documentUI.open({
      title: 'A sketch, in pencil',
      variant: 'note',
      body: DOCUMENTS.creatureSketch.body,
      onRead: () => captions.play(line('dialog_creature_sketch'))
    });
  },

  onViewFeed: (id) => {
    if (cctvSeen.has(id)) return;
    cctvSeen.add(id);

    if (id === 'hallway') {
      // Under a second, across the lit far end. Short enough to doubt.
      hallwayBasement.refs.feeds.scheduleHallwayDash(1.1);
      script.run(async (s) => {
        if (!await s.wait(1.2)) return;
        s.do(() => audio.setBreathing(0.8));
        await s.play(line('dialog_cctv_dash'));
      });
      return;
    }

    if (id === 'basement') {
      // Camera five is this room. There is a figure standing in it.
      hallwayBasement.refs.feeds.showBasementFigure(3.4);
      script.run(async (s) => {
        if (!await s.wait(0.6)) return;
        s.do(() => audio.setBreathing(0.95));
        if (!await s.play(line('dialog_cctv_basement'))) return;
        s.do(() => audio.creak());

        /**
         * And then it is behind you.
         *
         * The storyline: "Turning around you see the creature standing in the
         * corner, staring at you, but not moving. Then it disappears back up
         * the stairs, leaving a black pool where it was standing."
         *
         * It is placed, not spawned into the AI -- it must NOT wander, flee or
         * block anything here. It stands, it is looked at, it goes. The AI takes
         * over in Level 3, where the player has room to be chased.
         */
        if (!await s.wait(0.7)) return;
        s.do(() => {
          // Where it stands after camera five -- the level owns the spot, so it
          // moves with the lab if the room is ever resized again.
          const CORNER = hallwayBasement.refs.creatureCorner;
          creature.reset();
          creature.setPosition(CORNER[0], CORNER[1]);
          creature.setYaw(Math.atan2(-(camera.position.x - CORNER[0]), -(camera.position.z - CORNER[1])));
          creature.setSpeed(0);
          creature.visible = true;
          creatureStanding = true;
        });
        if (!await s.play(line('dialog_creature_corner'))) return;
        s.do(() => {
          creature.visible = false;
          creatureStanding = false;
          hallwayBasement.refs.revealPool();
          // Back off: it has gone, and the room is only as bad as it was.
          audio.setBreathing(0.6);
        });
        if (!await s.wait(0.6)) return;
        await s.play(line('dialog_black_pool'));
      });
    }
  }
});
sceneManager.register('hallwayBasement', hallwayBasement);

/**
 * Where the free-roam creature AI stands to block the one way out of the
 * study once it takes over -- just inside the front doorway (DOOR_X=2.5,
 * frontZ=3.25 in studyLevel.js), clear of the door's own collider (which
 * spans z 3.1-3.35 while shut) so she is never spawned standing inside a wall.
 */
const STUDY_GUARD_POINT = [2.5, 2.9];

const study = createStudyLevel({
  showCaption,
  // The study is the last room, so its exit is the ENDING rather than another
  // level. Unit 17 replaces this; until then it says so plainly instead of
  // silently doing nothing, which is what an unimplemented exit used to do.
  onExit: () => {
    captions.play(line('dialog_porch_gate_locked'));
  },
  onExaminePinpad: ({ length, code, onSolved }) => {
    player.unlock();
    pinPadUI.open({ length, code, onSolved });
  },
  onReadNote: () => {
    player.unlock();
    documentUI.open({
      title: '',
      variant: 'note',
      body: DOCUMENTS.frontDoorNote.body
    });
  },
  onAllLocksOpen: () => {
    script.run(async (s) => {
      if (!await s.play(line('dialog_shadow_wrong'))) return;
    });
  },

  // The deadbolt and the porch gate want their keys in the hand.
  isHolding: (id) => heldItems.isHolding(id),

  // No hands.play('pickup') of their own any more: pickUpItem plays the reach on
  // the empty glove and puts the item in it as the clip ends.
  onTakeVisor: () => {
    visor.take();
    pickUpItem('visor');
    objectiveEl.textContent = 'Put the visor on. [V]';
    captions.play(line('dialog_visor_found'));
  },
  onTakeDoorKey: () => {
    pickUpItem('doorKey');
  },

  /**
   * Mark's letter, which is where the game explains itself. It only says
   * anything with the visor on -- the writing is not hidden from the room, it
   * is hidden from the player, exactly like the fourth figure in the portrait.
   */
  onReadLetter: () => {
    if (!gameState.visorWorn) {
      showCaption(line('dialog_letter_blank_without_visor'));
      return;
    }
    player.unlock();
    documentUI.open({
      title: DOCUMENTS.letter.title,
      variant: DOCUMENTS.letter.variant,
      body: DOCUMENTS.letter.body,
      // Only once they have actually reached the end of it.
      onRead: () => {
        gameState.letterRead = true;
        script.run(async (s) => {
          if (!await s.wait(0.6)) return;
          if (!await s.play(line('dialog_realisation'))) return;
          s.do(() => {
            /**
             * She has been in the corner the whole time. The same rig, at
             * correction 1 because the visor is on -- which is the entire point:
             * the player is looking at the thing they have spent the game running
             * from, and it is a woman.
             */
            const spot = study.refs.annabelleSpot;
            creature.reset();
            creature.setCorrection(1);
            creature.setPosition(spot[0], spot[1]);
            creature.setYaw(Math.atan2(-(camera.position.x - spot[0]), -(camera.position.z - spot[1])));
            creature.setSpeed(0);
            creature.visible = true;
            creatureStanding = true;
            objectiveEl.textContent = 'The figure in the corner has stood up.';
            // She is hurt and she is not hiding any more, so the breathing that
            // has been menace for the whole game becomes just a person breathing.
            audio.setBreathing(0.28);
          });
          if (!await s.play(line('dialog_annabelle'))) return;
          s.do(() => { objectiveEl.textContent = 'Decide.'; });
          if (!await s.play(line('dialog_the_choice'))) return;
          s.do(() => {
            /**
             * Hand off from "stands still and breathes" to the free-roam AI.
             * She now actively tries to keep the player from the front door
             * while staying out of reach -- see CreatureAI.js. creatureAI
             * owns creature.update() itself from here, which is why
             * creatureStanding (main.js's own "just breathe in place" path)
             * has to come off, or the two would fight over the same rig every
             * frame.
             */
            creatureStanding = false;
            creatureAI.setColliders(study.colliders);
            creatureAI.setGuardPoints([STUDY_GUARD_POINT]);
            const spot = study.refs.annabelleSpot;
            creatureAI.start(spot[0], spot[1]);
          });
        });
      }
    });
  },

  onChooseEnding: (which) => { playEnding(which); },

  onTakeGateKey: () => {
    pickUpItem('gateKey');
    captions.play(line('dialog_pickup_gate_key'));
  },

  /**
   * The mirror. The single most important interaction in the game, and it only
   * does its job with the visor on -- which is the point: the player has to
   * have chosen to look.
   */
  onLookInMirror: () => {
    if (!gameState.visorWorn) {
      showCaption(line('dialog_mirror_without_visor'));
      return;
    }
    script.run(async (s) => {
      if (!await s.play(line('dialog_mirror'))) return;
      s.do(() => {
        objectiveEl.textContent = 'Read the letter.';
        audio.setBreathing(0.35);
      });
    });
  }
});
sceneManager.register('study', study);

// The items the levels hand out are drawn with the levels' own meshes, in the
// hand and on the floor -- see world/itemMeshes.js. Registered here, once both
// levels exist; the crowbar and the brass key never had a mesh and are built
// from primitives there instead, and the torch's template arrives with its load.
itemMeshes.setTemplate('paperclip', bedroom.refs.paperclip);
itemMeshes.setTemplate('bedroomKey', bedroom.refs.bedroomKey);
itemMeshes.setTemplate('doorKey', study.refs.doorKey);
itemMeshes.setTemplate('gateKey', study.refs.gateKey);
itemMeshes.setTemplate('visor', study.refs.visorGroup);

// Not a "level 4": ONE interstitial instance, re-armed per crossing by
// setRoute(). It hands its route back through onExit rather than reading a
// module-level global, so there is exactly one way to arm it and no way to
// activate it unarmed.
const backrooms = createBackroomsLevel({
  showCaption,
  onExit: (route) => transitionTo(route?.to ?? 'hallwayBasement')
});
sceneManager.register('backrooms', backrooms);

// ---------- render-cost trims ----------
// Both leave the picture identical -- see world/renderOptimizations.js for why
// each one is invisible. Run here, once every level exists and BEFORE warmUp(),
// so the loading screen compiles the programs these materials will really use.
enableSinglePassForFlatDecals(scene);
const darkShadowSkipper = createDarkShadowSkipper(findShadowCastingLights(scene));

/**
 * The thing that hunts you on the SECOND crossing.
 *
 * Two crossings, two different scares, and they share one creature rig so they
 * can never both be running:
 *
 *   bedroom -> hallwayBasement   the trailing shadow, below. A glimpse you
 *                                cannot reach and that never reaches you.
 *   hallwayBasement -> study     this. It looks for you, and it catches you.
 *
 * That order is the escalation: the first crossing establishes that something
 * is back there, the second makes it a problem. `backroomsFrom` is what tells
 * them apart -- exitLevel already hands the interstitial the level it came
 * from, so nothing new has to be tracked to know which crossing this is.
 */
const backroomsHunter = createBackroomsHunter({
  // The imported figure, not the procedural one -- see the note at okabe's
  // construction for why the backrooms is the right place for it.
  creature: okabe,
  getPlayer: () => ({
    x: camera.position.x,
    z: camera.position.z,
    // player.sprint is a 0..1 blend, not a boolean -- it eases in over
    // SPRINT_BLEND so the FOV kick has something continuous to follow. Half way
    // is the point where the player has committed to the sprint.
    sprinting: player.sprint > 0.5
  }),
  colliders: backrooms.colliders,
  onBreathing: (level) => audio.setBreathing(level),
  onCaught: () => onHunterCaught()
});

/** Which level this crossing started from, or null when not crossing. */
let backroomsFrom = null;

/**
 * Something trailing behind you in the corridor between levels.
 *
 * Not the CreatureAI chase -- that only starts in Level 3, after the reveal
 * -- this is pure atmosphere, and it is built out of the same "keep away"
 * idea CreatureAI.js's header describes even though it does not use that
 * module: the same rough distance behind, always, and it recedes the moment
 * the player turns around and closes the gap rather than ever being caught
 * up to. It is never a threat here, only a glimpse.
 *
 * POSITIONED FROM THE PLAYER'S OWN WALKED PATH, not by steering toward a
 * target. A history of the player's last several metres of travel is kept,
 * and the figure sits at a fixed distance back along THAT recorded path --
 * so it can never be inside a wall or cut a corner the player did not, with
 * no collision code of its own needed. It simply retraces where the player
 * has already proven the floor is.
 *
 * CORRECTION IS DELIBERATELY PARTWAY, not the man and not the full monster
 * either -- see OkabeCreature.js's STRETCH table. A
 * partial blend gives a shape that reads as human (upright, ordinary limb
 * length) but subtly wrong up close, which is exactly "can only sort of make
 * it out" at the distance and light level this is ever seen at.
 */
const BACKROOMS_SHADOW_LAG = 11;          // metres behind the player it trails at
const BACKROOMS_SHADOW_MIN_PATH = 4;      // metres of recorded path before it may appear at all
const BACKROOMS_SHADOW_HIDE_RANGE = 5;    // closer than this (player closing the gap) and it is gone
const BACKROOMS_SHADOW_SAMPLE_DIST = 0.15; // metres between recorded path points
const BACKROOMS_SHADOW_CORRECTION = 0.35;  // human-ish, not clean -- see the header above

/**
 * Metres the player must cover before the figure may appear AT ALL.
 *
 * 1.5x the 11 m at which it used to turn up, measured by replaying a realistic
 * first crossing -- the route plus the detours into six decoy branches that a
 * player who does not know the maze actually walks. 11 m is about five and a
 * half seconds, which puts the figure behind them before they have worked out
 * the corridor goes anywhere.
 *
 * NOT the same knob as MIN_PATH above, and it cannot be. That one measures the
 * RECORDED trail, which is deliberately trimmed to LAG + 4 = 15 m to keep
 * pathLength() cheap, so it saturates almost immediately and can never express
 * a distance longer than the trim. This counts the crossing instead, and
 * resetBackroomsShadow() zeroes it, so walking through a second time starts the
 * wait again rather than inheriting it.
 */
const BACKROOMS_SHADOW_GRACE = 16.5;

/**
 * Metres the player must cover after it HIDES before it may come back.
 *
 * THE FIGURE IS NOT A ONE-OFF, which is easy to miss reading the code. It hides
 * whenever the point 11 m back along the TRAIL comes within HIDE_RANGE of the
 * player as the crow flies, and in a maze of ten turns that is constantly:
 * round a corner and the trail doubles back into the corridor beside you, so
 * the thing standing on it is suddenly 5 m away and blinks out; walk on and it
 * is far again and blinks back.
 *
 * 17 m, and the number is measured rather than picked. Replaying a realistic
 * first crossing -- the route plus detours into six decoy branches, 159 m
 * walked -- the untouched system showed the figure EIGHT times with a median
 * gap of 16.2 m and gaps as short as 7.4 m, which is under four seconds and is
 * why it read as ever-present rather than as a glimpse. At 17 the median gap
 * is 24.2 m: a ratio of 1.49, the 1.5x that was asked for.
 *
 * The response is lumpy, so do not expect fine control. Past about 19 the
 * cooldown starts MERGING sightings rather than spacing them -- two that were
 * 20 m apart become one -- and the median jumps to 34 m because the survivors
 * are sums of several old gaps. 13 and 15 undershoot at 1.12x and 1.22x. The
 * usable band for 1.5x is 16-18.
 *
 * DISTANCE, not seconds, like everything else in this system. Standing still
 * does not earn a reappearance -- it comes back when you press on, which is the
 * only version of this that is about the player's choice rather than about
 * waiting them out.
 */
const BACKROOMS_SHADOW_COOLDOWN = 17;

/** Recorded {x,z} player positions, oldest first, trimmed to stay bounded. */
let backroomsPath = [];
/** The figure's last computed position, so its speed can be read off its own movement. */
let backroomsShadowPos = null;
let backroomsShadowVisible = false;
/** Metres walked since entering, for BACKROOMS_SHADOW_GRACE. Not the trail length. */
let backroomsWalked = 0;
/** backroomsWalked at the moment it last hid, for BACKROOMS_SHADOW_COOLDOWN. */
let backroomsShadowHidAt = -Infinity;

/** Sum of consecutive segment lengths -- how much corridor is actually recorded. */
function pathLength(path) {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    sum += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return sum;
}

/** Walks backward along `path` from (x,z) until `distance` metres have accumulated. */
function pointBehindOnPath(path, x, z, distance) {
  let remaining = distance;
  let ax = x, az = z;
  for (let i = path.length - 1; i >= 0; i--) {
    const p = path[i];
    const segLen = Math.hypot(ax - p.x, az - p.z);
    if (segLen >= remaining) {
      const t = segLen > 1e-6 ? remaining / segLen : 0;
      return { x: ax + (p.x - ax) * t, z: az + (p.z - az) * t };
    }
    remaining -= segLen;
    ax = p.x; az = p.z;
  }
  return null; // not enough recorded path yet
}

/** Called on every level activation -- see activateLevel(). Hides it and drops the trail. */
function resetBackroomsShadow() {
  backroomsPath = [];
  backroomsShadowPos = null;
  backroomsWalked = 0;
  // -Infinity, not 0: the cooldown must not gate the FIRST sighting as well,
  // which is what GRACE is for. At 0 the two would add up and the opening wait
  // would silently be GRACE + COOLDOWN.
  backroomsShadowHidAt = -Infinity;
  if (backroomsShadowVisible) {
    okabe.visible = false;
    // Back to the default layer mask, or the AI chase / scripted placements
    // elsewhere would inherit this system's minimap-hiding trick.
    okabe.setLayer(0);
    // And back to a normally-lit figure, or the same leak happens with the
    // silhouette colour multiplier instead.
    okabe.setSilhouette(false);
    backroomsShadowVisible = false;
  }
}

function updateBackroomsShadow(dt) {
  const px = camera.position.x, pz = camera.position.z;

  const last = backroomsPath[backroomsPath.length - 1];
  if (!last || Math.hypot(px - last.x, pz - last.z) >= BACKROOMS_SHADOW_SAMPLE_DIST) {
    // Counted here rather than per frame, off the same sample the trail uses,
    // so the grace measures GROUND COVERED and not time spent standing still.
    // Doubling back counts too: the distance is what the wait is made of.
    if (last) backroomsWalked += Math.hypot(px - last.x, pz - last.z);
    backroomsPath.push({ x: px, z: pz });
    // Bounded: once the recorded trail comfortably exceeds the lag distance,
    // older points are dropped a few at a time rather than one by one, since
    // pathLength() is O(n) and this runs every sampled step.
    while (backroomsPath.length > 4 && pathLength(backroomsPath) > BACKROOMS_SHADOW_LAG + 4) {
      backroomsPath.splice(0, 4);
    }
  }

  const found = pointBehindOnPath(backroomsPath, px, pz, BACKROOMS_SHADOW_LAG);
  const closeBy = found && Math.hypot(px - found.x, pz - found.z) < BACKROOMS_SHADOW_HIDE_RANGE;
  const shouldShow = !!found && !closeBy
    && backroomsWalked >= BACKROOMS_SHADOW_GRACE
    && backroomsWalked - backroomsShadowHidAt >= BACKROOMS_SHADOW_COOLDOWN
    && pathLength(backroomsPath) >= BACKROOMS_SHADOW_MIN_PATH;

  if (found) {
    if (backroomsShadowVisible && backroomsShadowPos) {
      // Read off its own frame-to-frame movement rather than driving speed
      // from anything the player is doing -- it walks at whatever pace
      // keeps it at the recorded distance, capped at a normal walk so a
      // sudden jump in the trail (e.g. just having appeared) never reads as
      // a lunge.
      const speed = Math.min(WALK_SPEED, Math.hypot(found.x - backroomsShadowPos.x, found.z - backroomsShadowPos.z) / dt);
      okabe.setSpeed(speed);
    }
    backroomsShadowPos = found;
  }

  if (!shouldShow) {
    if (backroomsShadowVisible) {
      okabe.visible = false;
      okabe.setLayer(0);
      backroomsShadowVisible = false;
      // Stamped on the way OUT, so the cooldown measures the gap between
      // sightings rather than the time since some arbitrary frame.
      backroomsShadowHidAt = backroomsWalked;
    }
    return;
  }

  if (!backroomsShadowVisible) {
    okabe.reset();
    okabe.setCorrection(BACKROOMS_SHADOW_CORRECTION);
    // A lit, textured rig at corridor range reads as exactly what it is --
    // boxes and capsules. Silhouette mode multiplies the correction colour
    // down near-black regardless of nearby fixture light, so what shows is a
    // dark shape, not a small mannequin under a ceiling lamp.
    okabe.setSilhouette(true);
    // MAIN_ONLY: visible to the player, never to the minimap's own camera --
    // this is a glimpse, not something to confirm by checking the radar.
    okabe.setLayer(MAIN_ONLY);
    backroomsShadowVisible = true;
  }
  okabe.setPosition(found.x, found.z);
  // Faces the player, the same convention every other placement in this file
  // uses -- being looked back at is the entire point of it existing.
  okabe.setYaw(Math.atan2(-(px - found.x), -(pz - found.z)));
  okabe.visible = true;
  okabe.update(dt);
}

/**
 * The bedroom's ambient light floor, before and after the bulb.
 *
 * 0.31 is what the level builds with. Dropping to 0.13 is the only place this
 * game gets DARKER on purpose, and it is the right place: the caption says
 * "Only the lightning now", and until this the light floor after the bulb blew
 * was identical to the lit room.
 */
const AMBIENT_LIT = 0.31;
const AMBIENT_DARK = 0.13;

/**
 * One glimpse of it at the bedroom window.
 *
 * Armed once the bulb has blown and the room has settled (see onFreed) --
 * dark enough that the lightning is worth watching, and late enough that it
 * lands as a second jolt rather than piling onto the bulb beat itself.
 * Fires on the very next flash after that, for exactly that flash's own
 * duration, then never again this run: a repeated sighting would stop being
 * a shock and start being a schedule.
 *
 * Full Hollow reading (correction 0), not the partial blend the backrooms
 * figure uses -- this one is meant to read as unambiguously wrong the
 * instant the light catches it, not to leave the player wondering.
 *
 * NOT lit by the storm's own lightningLight, measured: at this distance
 * outside the window that light (peak ~3.2, the same value that also
 * brightens the rain-glass shader itself via its uFlash uniform) left her
 * completely invisible -- the glass's own flash brightening dominates the
 * blend long before a dark, distant figure reads through it at that
 * intensity. A dedicated light fixes this without touching the room.
 *
 * A NARROW SPOT JUST OUTSIDE THE GLASS, AIMED AWAY FROM THE ROOM. This used to
 * be a DirectionalLight on a private layer, on the belief that a layer scopes
 * a light to the objects that share it. three.js has no such thing: a light
 * is culled against the CAMERA's layers (WebGLRenderer's light pass tests
 * light.layers against camera.layers) and then lights every object. The camera
 * never had that layer, so the light was dropped every frame and the figure
 * was never lit at all. Measured after the Okabe swap: a barely-there smudge.
 * A spot sitting between the wall and the figure, pointing outward, reaches
 * the figure and the night behind it and nothing inside the room.
 *
 * Built ONCE and left in the scene at intensity 0. Adding a light at the
 * moment of the scare changes the light count, which recompiles every lit
 * material on screen -- a hitch on exactly the frame that must not have one.
 */
let windowFlashArmed = false;
let windowFlashUsed = false;
const WINDOW_REVEAL_INTENSITY = 16;
const windowRevealLight = new THREE.SpotLight(0xbcd4ff, 0, 4, 0.95, 0.7, 2);

const bedroomStorm = new Storm({
  bulbLight: bedroom.refs.bulbLight,
  lightningLight: bedroom.refs.lightning,
  // The mesh as well as the light. Without it the glass keeps glowing.
  bulbMaterial: bedroom.refs.bulbMaterial,
  onFlash: () => {
    audio.thunder();
    /**
     * The one frame the lightning's shadow map is rendered.
     *
     * The light keeps autoUpdate = false because it is dark for most of the
     * game and three.js would otherwise re-render its map every frame anyway.
     * The room is static for the flash's whole duration, so one render per
     * strike is exact rather than an approximation. This lives here rather than
     * in Storm.js because Storm has no business knowing a light has a shadow.
     */
    bedroom.refs.lightning.shadow.needsUpdate = true;

    if (windowFlashArmed && !windowFlashUsed) {
      windowFlashArmed = false;
      windowFlashUsed = true;
      const wz = bedroom.refs.windowGroup.position.z;
      creature.reset();
      creature.setCorrection(0);
      creature.setPosition(-2.1, wz - 0.9);
      creature.setYaw(Math.PI); // faces back through the window, into the room
      creature.setSpeed(0);
      creatureStanding = true;
      creature.visible = true;

      windowRevealLight.intensity = WINDOW_REVEAL_INTENSITY;

      const shownFor = bedroomStorm?.flashDuration || 0.2;
      script.run(async (s) => {
        if (!await s.wait(shownFor)) return;
        s.do(hideWindowReveal);
      });
    }
  },
  onBlow: () => {
    bedroom.refs.pendantIntact.visible = false;
    bedroom.refs.pendantBroken.visible = true;
    audio.bulbPop();
  }
});

/** Hides the window-flash figure and tears down its dedicated light -- see the note above. */
function hideWindowReveal() {
  creature.visible = false;
  creatureStanding = false;
  windowRevealLight.intensity = 0;
}
{
  const wz = bedroom.refs.windowGroup.position.z;
  windowRevealLight.position.set(-2.1, 1.9, wz - 0.15);
  windowRevealLight.target.position.set(-2.1, 1.2, wz - 0.9);
  bedroom.group.add(windowRevealLight, windowRevealLight.target);
}

const rain = new Rain({
  count: 400,
  width: 1.6,
  height: 2.6,
  depth: 0.5,
  origin: new THREE.Vector3(-2.1, 0.4, bedroom.refs.windowGroup.position.z - 0.35)
});
bedroom.group.add(rain.points);

const LEVEL_OBJECTIVES = {
  bedroom: 'You wake up chained to the bed frame. Find a way free.',
  hallwayBasement: 'Restore power in the basement, then get through the locked door.',
  study: 'Preview: the study and front door (Level 3 blockout).',
  backrooms: 'Find the way through.'
};

const LEVEL_FOG = {
  bedroom: new THREE.FogExp2(0x05070a, 0.065),
  hallwayBasement: new THREE.FogExp2(0x0a0c0a, 0.03),
  study: new THREE.FogExp2(0x0c0a06, 0.02),
  // A murky olive-brown rather than near-black: distant geometry fades into a
  // dim yellow haze instead of into nothing, which is what makes the corridor
  // read as receding forever rather than ending in a dark wall. At 0.075 the
  // 22m far end is ~93% fogged, so the exit is invisible from the spawn and
  // the lit pools resolve as smears from about 14m.
  backrooms: new THREE.FogExp2(0x161206, 0.075)
};

// Where each level's exit leads. Keyed by the level you are LEAVING, because
// in this game every level has exactly one exit -- so an exit callback only
// ever has to say "I am done", never "and here is where I go", which is the
// coupling the interstitial exists to remove.
//   via: which registered level to pass through, or null for a direct cut
//   to:  the level on the far side of the interstitial's exit door
const TRANSITIONS = {
  bedroom: { to: 'hallwayBasement', via: 'backrooms' },
  hallwayBasement: { to: 'study', via: 'backrooms' },
  study: { to: null, via: null }
};

/**
 * Beats that fire when a level is ENTERED, rather than when a prop is touched.
 * Keyed by level so activateLevel does not grow a switch statement.
 */
const ON_ENTER = {
  /**
   * The hallway sighting. One strike, and it is standing at the far end.
   *
   * A running storm would make this a coin toss -- the flash has to land while
   * the player is looking down the corridor, and a random one usually will not.
   * Firing the strike from the same script that places the creature is what
   * guarantees the player is shown the thing the level is about.
   */
  hallwayBasement: () => {
    script.run(async (s) => {
      if (!await s.wait(1.6)) return;
      s.do(() => {
        creature.reset();
        creature.setPosition(0, 5.0);
        // AT the player, worked out rather than written down. This was a
        // hardcoded PI, which looks down +Z -- straight away from a player who
        // stands at smaller z -- so the one-flash sighting showed its back.
        creature.setYaw(Math.atan2(-(camera.position.x - 0), -(camera.position.z - 5.0)));
        creature.setSpeed(0);
        creature.visible = true;
        hallwayBasement.refs.strike(0.55);
        audio.thunder();
      });
      // Gone before the light is. It was only ever there for the flash.
      if (!await s.wait(0.45)) return;
      s.do(() => { creature.visible = false; });
      await s.play(line('dialog_hallway_sighting'));
    });
  },

  /**
   * The second crossing, and the only one that hunts.
   *
   * Started on a delay rather than the instant the level comes up: spawning it
   * while the fade is still lifting means the first thing a player hears is
   * breathing, before they have worked out they are somewhere new. The pause is
   * the difference between a threat and a jump scare.
   */
  backrooms: () => {
    if (backroomsFrom !== 'hallwayBasement') return;
    script.run(async (s) => {
      if (!await s.wait(2.2)) return;
      s.do(() => backroomsHunter.start());
    });
  }
};

/**
 * Caught in the corridor.
 *
 * STOPPED, NOT KILLED -- the same rule CreatureAI.js sets out and for the same
 * reason. The cost is the crossing: you wake at the mouth of the maze with the
 * whole route to walk again, and it is somewhere else by the time you do. That
 * is a real penalty measured in the thing this level trades in, which is time,
 * without ever being a death.
 */
function onHunterCaught() {
  if (caughtInFlight || transitionInFlight) return;
  caughtInFlight = true;
  script.run(async (s) => {
    try {
      s.do(() => {
        player.movementEnabled = false;
        player.lookEnabled = false;
        interaction.setEnabled(false);
        // Stop it dead first: without this it keeps closing during the fade and
        // is standing on top of the spawn point when the screen comes back.
        backroomsHunter.stop();
      });
      if (!await s.play(line('dialog_backrooms_caught'))) return;
      await fade.fadeOut(450);
      if (!s.alive()) return;
      s.do(() => {
        const [sx, sz] = backrooms.spawn;
        player.spawn(sx, sz, backrooms.spawnYaw ?? 0);
      });
      await fade.fadeIn(650);
      if (!s.alive()) return;
      s.do(() => {
        player.lookEnabled = true;
        player.movementEnabled = true;
        interaction.setEnabled(true);
        // Re-drawn somewhere new, so a caught player is not handed the same
        // chase back. start() already biases the draw away from the player.
        backroomsHunter.start();
      });
      await s.play(line('dialog_backrooms_respawn'));
    } finally {
      caughtInFlight = false;
    }
  });
}

function activateLevel(key, { lockMovement = false } = {}) {
  // A prior restrained bedroom view must never clamp the spawn orientation of
  // another level during SceneManager.activate()'s player.spawn() call.
  player.setLookBounds(null);
  const level = sceneManager.activate(key, player);
  // Was a TypeError on an unregistered key -- a routing typo should cost a
  // wrong room, never a crash mid-transition.
  if (!level) return null;
  // Anything the player left on the floor of another level comes with them --
  // see returnDroppedItems() for why a drop must never be able to softlock.
  returnDroppedItems(key);
  setGlare(0); // the basement's overload wash must not follow the player into another level
  audio.setTrolleyRattle(0); // nor a trolley still rolling as they left
  const isBedroomRestraintActive = key === 'bedroom' && !level.refs.puzzleState.chainsEscaped;
  player.setLookBounds(isBedroomRestraintActive ? BEDROOM_RESTRAINED_LOOK_BOUNDS : null);
  interaction.setTargets(level.interactables);
  // Again per level: GLB props stream in after the boot-time pass, and any flat
  // decal among them should get the same single-pass draw.
  enableSinglePassForFlatDecals(level.group);
  // The on-screen hint key, only where H actually gives hints.
  hintKeyEl.classList.toggle('visible', key === 'bedroom');
  scene.fog = LEVEL_FOG[key] ?? null;
  objectiveEl.textContent = LEVEL_OBJECTIVES[key] ?? '';
  // Hard-cancel rather than just hiding the box: a queued sequence would
  // otherwise keep advancing and fade its next line in over the new room.
  captions.cancel();
  // Cancelling the captions has to take the voice with it, or the line that
  // was mid-sentence keeps talking over the freshly reset room.
  audio.stopVoice();
  documentUI.close();
  // Snapped rather than eased: a restart should not show the visor fading off.
  postFX.reset();
  // Otherwise a second run flicks to camera two and nothing crosses it.
  cctvSeen.clear();
  creatureStanding = false;
  creatureAI.reset();
  resetBackroomsShadow();
  backroomsHunter.reset();
  // A leftover animator clip (the lockpick loop, if a debug level-jump key is
  // pressed mid-lockpick) must not survive into whatever level just
  // activated. Harmless when nothing was playing. stop() leaves the joints
  // wherever the clip had them, though, so the held item's own pose goes back
  // on after it; and a drop caught half way is abandoned with its clip, the
  // item staying in hand rather than landing in a room being left.
  hands.stop('right');
  heldItems.cancelDrop();
  heldItems.restorePose();
  // resetState() has already cleared the flags; this pushes that through to the
  // pass, the creature and the room, none of which read GameState themselves.
  visor.reset();
  // Back to the licence list on its own, or a second run's credits carry the
  // first run's ending.
  buildCredits();
  // Same reason abortTransition() exists: a restart taken mid-shot must hand
  // the camera back, or the player restarts into a frozen third-person view.
  cutscene.cancel();
  // The whole reason Script.js exists: onFreed used to arm timers that nothing
  // cancelled, so a restart mid-beat blew the new room's bulb seconds later.
  script.cancel();
  bedroomHorrorScript.cancel();
  bedroomHorrorEvents.clear();
  if (key === 'bedroom') audio.setBreathing(LEVEL_ONE_BREATHING_BASE);
  player.movementEnabled = !lockMovement;
  // postFX.reset() above zeroes the visor dial, and the level just activated has
  // never been told what the player can see. Without this, walking into a room
  // wearing the visor takes it off in everything except the player's inventory.
  visor.refresh();
  // AFTER script.cancel() above, or the beat this fires is cancelled by the
  // very activation that started it.
  ON_ENTER[key]?.();
  return level;
}

// ---------- level transitions (fade -> swap -> fade) ----------
// A layer ON TOP of activateLevel, never a replacement for it: activateLevel
// stays synchronous because beginGame calls player.lock() on the very next
// line, resetGame has to have the level swapped before it returns to its click
// handler, and the debug keys are fire-and-forget. Making it async would
// silently turn all of those into races.

let transitionInFlight = false;
let transitionGeneration = 0;

function freezePlayerForTransition() {
  // Frozen BEFORE the screen darkens: the fade-out is 700ms of still-visible
  // world, and drifting into a wall during it reads as a bug.
  player.movementEnabled = false;
  interaction.setEnabled(false);
  // Freezes LOOKING without dropping pointer lock -- player.unlock() would fire
  // the 'unlock' listener and pop the pause menu up over the transition. It also
  // stops the player rotating away from the new level's spawnYaw during the
  // fade-in and arriving face-first into a wall.
  //
  // The flag DISCARDS movement rather than banking it, which is the point: the
  // player cannot see anything for 1.7s, and releasing every mouse count made
  // behind the black screen in one go on fade-in would be a lurch.
  player.lookEnabled = false;
}

function unfreezePlayerAfterTransition() {
  interaction.setEnabled(true);
  player.lookEnabled = true;
  // movementEnabled is restored by transitionTo's finally, from its own
  // lockMovement argument -- one owner, not two.
}

/**
 * Cancels whatever the transition system is mid-way through and puts the player
 * back in a playable state. Every instant jump (the debug keys, restart) calls
 * this FIRST -- a jump taken while the screen is black would otherwise strand
 * the player behind an overlay that is no longer going to lift.
 */
function abortTransition() {
  transitionGeneration++;
  transitionInFlight = false;
  newspaperView.cancel();
  fade.clear();
  interaction.setEnabled(true);
  player.lookEnabled = true;
}

/**
 * @param {string} key level to go to
 * @param {object} [options]
 * @param {string|null} [options.interlude] a front page from story/newspapers.js
 *   read on the black between the two rooms. The next room is not switched on
 *   until the player continues past it, so its entry beat cannot start behind
 *   the page.
 */
async function transitionTo(key, { lockMovement = false, outMs = 700, holdMs = 140, inMs = 900, interlude = null } = {}) {
  if (transitionInFlight) return null;
  transitionInFlight = true;
  const mine = ++transitionGeneration;
  freezePlayerForTransition();

  try {
    await fade.fadeOut(outMs);
    if (mine !== transitionGeneration) return null;   // aborted mid-fade
    if (interlude) {
      await newspaperView.show(interlude);
      if (mine !== transitionGeneration) return null;  // restarted while reading
    }
    const level = activateLevel(key, { lockMovement: true });
    if (!level) {
      // Fade back in rather than leaving a black screen: a bad route must never
      // be able to brick the run.
      console.error('transitionTo: no level registered under "' + key + '"');
      await fade.fadeIn(inMs);
      return null;
    }
    await wait(holdMs);
    if (mine !== transitionGeneration) return null;
    await fade.fadeIn(inMs);
    return level;
  } finally {
    // finally, not the happy path: an exception in here would otherwise leave
    // transitionInFlight stuck true and kill every door in the game. Guarded on
    // the generation so an abort that already restored state is not stomped by
    // a stale transition unwinding behind it.
    if (mine === transitionGeneration) {
      transitionInFlight = false;
      unfreezePlayerAfterTransition();
      player.movementEnabled = !lockMovement;
    }
  }
}

/** "I am finished with this level" -- the only thing an exit callback says. */
async function exitLevel(fromKey) {
  if (transitionInFlight) return;
  const route = TRANSITIONS[fromKey];
  if (!route?.to) {
    console.warn('exitLevel: no route out of "' + fromKey + '"');
    return;
  }
  const interlude = INTERLUDES[fromKey] ?? null;
  if (!route.via) { await transitionTo(route.to, { interlude }); return; }

  const interstitial = sceneManager.get(route.via);
  // Degrade to a plain cut rather than trapping the player, if the interstitial
  // is ever missing or does not implement the arming contract.
  if (!interstitial?.setRoute) { await transitionTo(route.to, { interlude }); return; }
  // Armed BEFORE activateLevel, so the destination, the re-armed exit door and
  // spawn/spawnYaw are all in place by the time SceneManager reads them.
  backroomsFrom = fromKey;
  interstitial.setRoute({ from: fromKey, ...route });
  await transitionTo(route.via, { interlude });
}

/**
 * The front page read on the way out of each room, keyed like TRANSITIONS by
 * the room being LEFT. Read on the black before the maze, so the walk through
 * it is spent thinking about what the paper said.
 */
const INTERLUDES = {
  bedroom: 'afterBedroom',
  hallwayBasement: 'afterBasement'
};

// ---------- game reset (restart without page refresh) ----------
function resetGame() {
  bedroomHints.reset();
  // A restart from the pause menu can land mid-fade; without this the freshly
  // reset bedroom would come up behind a black overlay that never lifts.
  abortTransition();
  bedroomHorrorScript.cancel();
  bedroomHorrorEvents.clear();
  // Was bedroom.reset() alone, which left Level 2's breaker flipped and its
  // door still reading "Open the door" across an R.
  sceneManager.resetAll();
  // Everything the STORY carries across levels -- the visor, the locks, the
  // tapes, the ending. One call rather than a growing list of hand-resets,
  // which is the mistake the comment above records.
  resetState();
  // One call, and it puts the mesh back too -- setting bulbBlown by hand from
  // out here left the glass dark on the second run.
  bedroomStorm.relight();
  bedroom.refs.pendantIntact.visible = true;
  bedroom.refs.pendantBroken.visible = false;
  bedroom.refs.ambient.intensity = AMBIENT_LIT;
  // A fresh run gets to see the window glimpse again. hideWindowReveal() also
  // covers a restart landing mid-flash, which would otherwise leave its
  // dedicated light and the creature's extra render layer behind forever.
  windowFlashArmed = false;
  windowFlashUsed = false;
  hideWindowReveal();
  // A restart mid-clip (R pressed while, say, the lockpick loop is still
  // going) must not carry an animator clip across into the freshly reset
  // room. Then nothing in the hand, the empty glove back and relaxed, and no
  // drop left pending; resetState() above has already emptied the inventory.
  hands.stop('right');
  heldItems.reset();
  // Every prop the player dropped, in any room. Not handed back: there is
  // nothing to hand it back to. Before activateLevel, which would otherwise
  // return them into the fresh inventory.
  clearDroppedItems();
  flashlightFound = false;
  setFlashlight(false);
  refreshInventoryUI();
  // The breathing is deliberately NOT stopped and restarted here: it is meant
  // to run unbroken for the whole session, and cycling it would put a hole in
  // the one sound that is supposed to never leave. Only the intensity goes
  // back to where the game opens, since the restart replays the beat that
  // raises it. startBreathing() is here for the case where the player hits
  // restart before the file finished decoding -- it is a no-op once the loop
  // is already running, so it can never stack a second copy.
  audio.setBreathing(BREATH_BASE_LEVEL);
  audio.startBreathing();
  activateLevel('bedroom', { lockMovement: true });
}

// ---------- level preview switching (debug / mentor demo) ----------
window.addEventListener('keydown', (e) => {
  if (!player.isLocked) return;
  // Deliberately INSTANT, not faded: these are a mentor-demo tool and 1.7s of
  // black per press is friction. But each one aborts first, or a jump taken
  // mid-fade lands behind an overlay that will never lift.
  // Levels 1 and 2 have no shortcut keys: they are only reached by playing.
  if (e.code === 'Digit3') { abortTransition(); activateLevel('study'); }
  if (e.code === 'Digit4') {
    // Routed off the CURRENT level, so the debug key exercises the same table
    // the real exits do. Falls back when jumped to from inside the corridor.
    const route = TRANSITIONS[sceneManager.activeKey] ?? { to: 'hallwayBasement' };
    abortTransition();
    backrooms.setRoute({ from: sceneManager.activeKey, ...route });
    activateLevel('backrooms');
  }
  if (e.code === 'KeyG') {
    // Debug: skip the whole Level 1 puzzle chain and take the REAL exit.
    //
    // Different from Digit4, which teleports into the corridor instantly:
    // this drives the actual door -> hinge swing -> fade -> corridor path, so
    // it is the one that tests the transition rather than the destination.
    //
    // Works by handing the player the door's own crowbar and key and calling
    // its real interact twice (first press pries the planks, second opens it)
    // rather than reaching in and setting puzzleState.doorUnlocked directly --
    // that way the plank meshes, captions and exit timing all come from the
    // shipping code path instead of a debug copy of it that could drift.
    //
    // The door asks for each tool IN THE HAND, so each is put there before its
    // press; and it wants the floorboard pried before the planks, so that flag
    // is set rather than playing the rug and the board through too.
    if (sceneManager.activeKey !== 'bedroom') {
      showCaption('[debug] G only works from the bedroom.');
    } else {
      // A drop caught half way would land under the grants below (take()
      // finishes a pending drop first), so it is abandoned, item in hand, the
      // way a level change abandons one.
      if (heldItems.dropping) {
        hands.stop('right');
        heldItems.cancelDrop();
      }
      // Each grant below first takes that item's copy off the floor, if the
      // player dropped one. Otherwise the door uses up the fresh copy and
      // leaving the room hands the dropped one back (returnDroppedItems): a
      // spent crowbar or key carried for the rest of the run, or a second torch.
      //
      // The corridor's dark gaps are designed around having a torch, and
      // skipping the chain means never picking one up.
      flashlightFound = true;
      removeDroppedProp('flashlight');
      if (!gameState.inventory.has('flashlight')) pickUpItem('flashlight', { animate: false });
      setFlashlight(true);
      // The opening beat leaves the player chained; the door does not free
      // them, onFreed does.
      player.movementEnabled = true;
      const puzzleState = bedroom.refs.puzzleState;
      const door = bedroom.refs.doorSlab.userData.interact;
      // Only the steps not already done. A crowbar granted after the planks
      // were pried is never used up -- the door goes straight to wanting the
      // key -- and sat in the hotbar for the rest of the run.
      if (!puzzleState.planksRemoved) {
        puzzleState.hasCrowbar = true;
        puzzleState.floorboardPried = true;
        removeDroppedProp('crowbar');
        pickUpItem('crowbar', { animate: false });
        door.onInteract();   // pries the planks off (and uses the crowbar up)
      }
      if (!puzzleState.doorUnlocked) {
        puzzleState.hasBedroomKey = true;
        removeDroppedProp('bedroomKey');
        pickUpItem('bedroomKey', { animate: false });
        door.onInteract();   // opens it -> exitLevel('bedroom')
      }
      // Taking the crowbar and the key out put the torch away, and a torch put
      // away is switched off -- so it comes back out, lit, for the corridor.
      heldItems.select('flashlight');
      setFlashlight(true);
    }
  }
  // Neither Q nor F acts on key auto-repeat. Held Q dropped item after item --
  // each repeat that landed once the drop clip had finished let go of whatever
  // the hand had moved on to, the torch included, until the inventory was
  // empty -- and held F strobed the torch.
  if (e.code === 'KeyF' && !e.repeat) {
    if (heldItems.isHolding('flashlight')) {
      setFlashlight(!flashlightSwitchOn);
    } else if (gameState.inventory.has('flashlight') && heldItems.select('flashlight')) {
      // F with something else in hand means "I want light": the torch comes
      // out, already on, rather than F silently doing nothing.
      setFlashlight(true);
    }
  }
  // Q lets go of what is in the hand -- see dropHeldItem() for when it refuses.
  if (e.code === 'KeyQ' && !e.repeat) dropHeldItem();
  if (e.code === 'KeyH' && !e.repeat) showHint();
  if (e.code === 'KeyT') setThirdPerson(!thirdPerson);
  if (e.code === 'KeyV') {
    const result = visor.toggle();
    if (result === 'none') {
      showCaption(line('dialog_visor_not_carried'));
    } else {
      captions.play(result === 'on' ? line('dialog_visor_first_worn') : line('dialog_visor_removed'));
    }
  }
  if (e.code === 'KeyR') resetGame();
  if (e.code === 'KeyC' && !transitionInFlight) toggleCredits(true);
});

/**
 * THE TWO ENDINGS.
 *
 * Both are the same shot -- the camera leaving the house and climbing away over
 * the trees while a news bulletin plays -- and they differ in what the player
 * did a second earlier and in what the reporter says happened. That symmetry is
 * the argument: the game does not editorialise about which one was right,
 * because the storyline does not either.
 *
 * `restoreBeam: false` and a fade to black are the default in playToBlack(),
 * which matters here because the hands and the torch are camera children and a
 * third-person pan would otherwise fly a disembodied glove over the treeline.
 */
const ENDING_TITLES = {
  released: 'THE HOLLOW IS OUT',
  contained: 'THE HOUSE HELD'
};

const ENDING_CREDITS = {
  released: [
    'She got out. So did you.',
    'Nobody outside this house knows what you are, and by morning everybody will.'
  ],
  contained: [
    'You shut the door, and the three locks your own hands designed went home.',
    'Annabelle stayed. She always did.'
  ]
};

let endingInFlight = false;

async function playEnding(which) {
  if (endingInFlight) return;
  endingInFlight = true;
  gameState.endingChosen = which;
  try {
    // Take the choice away immediately: both hitboxes are still in front of the
    // player and a second E during the fade would start the other ending.
    interaction.setEnabled(false);

    if (which === 'contained') {
      // The door shuts, and the bolts go across. Heard, not just described.
      study.refs.doorState.open = false;
      audio.creak();
      script.run(async (s) => {
        for (let i = 0; i < 3; i++) {
          if (!await s.wait(0.55)) return;
          s.do(() => audio.creak());
        }
      });
      await wait(900);
    }

    // Out through the gate and up over the treeline, looking back at the house.
    const from = which === 'released'
      ? [2.5, 1.6, 7.2]
      : [2.5, 1.6, 6.4];
    const shotFinished = await cutscene.playToBlack({
      points: [from, [2.2, 3.2, 12.0], [0.6, 7.5, 20.0], [-1.5, 12.0, 30.0]],
      lookAt: (t) => [2.5, 1.4 + t * 1.2, 3.0],
      seconds: 13,
      fadeMs: 2200,
      body: () => captions.play(line(`dialog_ending_${which}`))
    });

    // The morning's paper, on the black after the shot: the bulletin the player
    // just heard, as the town will read it. Skipped only by a restart, which
    // has already put the game somewhere an end screen must not appear over.
    if (shotFinished && !await newspaperView.show(`ending_${which}`)) return;

    showEndScreen(which);
  } finally {
    endingInFlight = false;
  }
}

/**
 * The end screen reuses #start-screen, which is already doing double duty as
 * the pause menu -- a third state rather than a third overlay.
 */
function showEndScreen(which) {
  menuOverlayState = 'game';
  showLegacyStartScreen();
  creature.visible = false;
  creatureStanding = false;
  audio.setBreathing(BREATH_BASE_LEVEL);
  startTitle.textContent = ENDING_TITLES[which];
  startSub.textContent = 'THE END';
  startButton.textContent = 'Play again';
  restartButton.classList.add('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  promptEl.style.display = 'none';
  buildCredits(which);
  toggleCredits(true);
}

// ---------- credits ----------
const CREDITS = [
  'Three.js -- 3D rendering library (three.js authors, MIT licence) -- threejs.org',
  'PointerLockControls -- Three.js official examples module (MIT licence)',
  'Vite -- build tool used to produce the deployment bundle (MIT licence)',
  'Newspaper typefaces -- UnifrakturMaguntia (J. "Mach" Wust), Playfair Display (Claus Eggers Sørensen) '
    + 'and Old Standard TT (Alexey Kryukov), all SIL Open Font License 1.1, bundled via Fontsource (fontsource.org).',
  'All textures are generated procedurally on <canvas> at runtime -- no image assets used.',
  // CC-BY REQUIRES ATTRIBUTION AND THIS IS IT. hands.glb is the one piece of
  // third-party geometry in the project; everything else under
  // src/assets/models/ is generated by the scripts in blender/. This line was
  // missing while the game was already deployed publicly, which is a licence
  // breach rather than an oversight -- do not remove it without also removing
  // the asset.
  'Hands model -- "First Person hands rigged" by davidfischer, via Sketchfab, '
    + 'licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0). Modified: '
    + 'left arm removed, wrist re-aligned, re-rigged for this project.',
  'All other models (bed, door, dresser, flashlight, creature) are generated '
    + 'from the Python scripts in blender/ -- see blender/build_*.py.',
  'Wind, thunder and creaks are synthesised with the Web Audio API at runtime -- no audio files used for those.',
  'Three audio files ship with the project, all in src/assets/audio: breathing.m4a, '
    + 'walking_audio.mp3 and running_audio.mp3.',
  // TODO: replace these lines with the real source, author and licence of each
  // recording -- or delete a line if that one was recorded by the team.
  // THIS IS NOT A FORMALITY. hands.glb above is CC-BY and the attribution
  // beside it is what keeps using it legal; the same applies to anything here
  // that came from a library. The game deploys publicly to GitHub Pages.
  'Breathing loop -- [SOURCE / AUTHOR / LICENCE TO BE FILLED IN].',
  'Footstep recordings (walking, running) -- [SOURCE / AUTHOR / LICENCE TO BE FILLED IN].',
  'Game concept, story, world and code: the project team, for COMS3006A/COMS3025A.'
];
/**
 * Built through a function rather than appended once at module load, because an
 * ending prepends its own two lines and a player who reaches both endings in one
 * session would otherwise get the licence list twice, then three times.
 * Clearing first is the whole fix.
 */
function buildCredits(ending = null) {
  creditsList.innerHTML = '';
  const lines = ending ? [...ENDING_CREDITS[ending], '', ...CREDITS] : CREDITS;
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    // A blank entry is a spacer between the ending's own lines and the licences.
    if (!line) li.style.height = '0.9rem';
    creditsList.appendChild(li);
  }
}
buildCredits();
function toggleCredits(show) {
  creditsScreen.classList.toggle('hidden', !show);
  if (show && player.isLocked) player.unlock();
}
creditsCloseBtn.addEventListener('click', () => {
  if (menuOverlayState === 'credits') {
    showMainMenu();
    return;
  }
  toggleCredits(false);
  if (gameStarted && !gameState.endingChosen) showPauseScreen();
});

// ---------- settings ----------
// Volume, mouse sensitivity and captions, persisted in localStorage so they
// survive a page reload -- the only thing in this project that does, since
// there is otherwise no save system. Loaded and applied once at boot, well
// before beginGame(): a player who opens Settings from the start screen
// before ever clicking "begin" still hears/feels the right values from their
// very first frame.
const SETTINGS_STORAGE_KEY = 'dontLetItOut.settings';
// Captions start off: hints (H) and the front pages still show either way.
const DEFAULT_SETTINGS = { volume: 50, sensitivity: 100, captions: false };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      volume: Number.isFinite(parsed.volume) ? Math.min(100, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      sensitivity: Number.isFinite(parsed.sensitivity)
        ? Math.min(SENSITIVITY_MAX * 100, Math.max(SENSITIVITY_MIN * 100, parsed.sensitivity))
        : DEFAULT_SETTINGS.sensitivity,
      captions: typeof parsed.captions === 'boolean' ? parsed.captions : DEFAULT_SETTINGS.captions
    };
  } catch {
    // Private browsing (Safari) throws on localStorage access rather than
    // just returning null, and a corrupt/hand-edited value can fail JSON.parse
    // -- either way, falling back to defaults keeps the menu usable.
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings simply do not persist this session; nothing else depends on it.
  }
}

function applySettings(settings) {
  audio.setMasterVolume(settings.volume / 100);
  player.setSensitivity(settings.sensitivity / 100);
  captions.setEnabled(settings.captions);
}

const settings = loadSettings();
volumeInput.value = String(settings.volume);
volumeValueEl.textContent = `${settings.volume}%`;
sensitivityInput.value = String(settings.sensitivity);
sensitivityValueEl.textContent = `${settings.sensitivity}%`;
captionsCheckbox.checked = settings.captions;
applySettings(settings);

volumeInput.addEventListener('input', () => {
  settings.volume = Number(volumeInput.value);
  volumeValueEl.textContent = `${settings.volume}%`;
  audio.setMasterVolume(settings.volume / 100);
  saveSettings(settings);
});

sensitivityInput.addEventListener('input', () => {
  settings.sensitivity = Number(sensitivityInput.value);
  sensitivityValueEl.textContent = `${settings.sensitivity}%`;
  player.setSensitivity(settings.sensitivity / 100);
  saveSettings(settings);
});

captionsCheckbox.addEventListener('change', () => {
  settings.captions = captionsCheckbox.checked;
  captions.setEnabled(settings.captions);
  saveSettings(settings);
});

// Opened only from the start/pause/end screen, which has already unlocked the
// pointer to show itself -- so, unlike toggleCredits(), this never has to call
// player.unlock() itself or worry about re-triggering the 'unlock' listener's
// pause-menu logic.
settingsButton.addEventListener('click', () => settingsScreen.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsScreen.classList.add('hidden'));

// ---------- pointer lock flow ----------
function showPauseScreen() {
  menuOverlayState = 'game';
  showLegacyStartScreen();
  startTitle.textContent = 'PAUSED';
  startSub.textContent = '';
  startButton.textContent = 'Click to resume';
  restartButton.classList.remove('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  promptEl.style.display = 'none';
}

function beginGame() {
  // A fresh run by definition, so it starts from fresh story state. Without
  // this the only thing that ever cleared endingChosen was resetGame(), and a
  // first play that somehow followed an ending would carry it in.
  resetState();
  refreshInventoryUI();
  buildCredits();
  startTitle.textContent = "DON'T LET IT OUT";
  startSub.textContent = 'Project HOLLOW -- June 1987';
  startButton.textContent = 'Click to begin';
  audio.start();
  // Something in the house is already breathing when the player wakes up, so
  // this comes in with the wind rather than at a puzzle beat, and then runs
  // unbroken for the rest of the session -- it is deliberately not tied to a
  // level or an event, only its intensity is. Safe whether or not the loop
  // file is actually there, and safe before it has decoded -- see AudioEngine.
  audio.startBreathing();
  activateLevel('bedroom', { lockMovement: true });
  player.lock();

  /**
   * The wake-up. The fade overlay has existed since the transition system went
   * in and beginGame() never used it -- the game simply cut to a lit room with
   * the player already in it, which is not waking up, it is loading a save.
   *
   * Black first, then the room arrives around them while the first three lines
   * play. Slow: 2.6s is long for a fade and exactly right for eyes opening.
   */
  script.run(async (s) => {
    s.do(() => fade.snapToBlack());
    // The first front page, on the black before the eyes open: what the town
    // read in January, before the player knows where they are. A restart
    // while it is up cancels it, and the wake-up then does not run on top of
    // the restarted room.
    if (!await newspaperView.show('prologue') || !s.alive()) return;
    if (!await s.wait(0.9)) return;
    fade.fadeIn(2600);
    await s.play(line('dialog_wake'));
  });
}

let gameStarted = false;
// "Leave site?" instead of a silent close if Ctrl+W (crouch + forward) gets
// past Keyboard Lock -- Firefox, Safari, or a player out of fullscreen. Only
// while actually playing; see core/KeyboardGuard.js for why not on reloads.
installUnloadGuard(() => gameStarted && player.isLocked && !gameState.endingChosen);
startButton.addEventListener('click', () => {
  toggleCredits(false);
  if (!gameStarted) {
    gameStarted = true;
    beginGame();
  } else if (gameState.endingChosen) {
    // The end screen reuses this button as "Play again", and this branch is
    // what makes that true -- without it the click just re-locked the pointer
    // and dropped the player back into the finished game behind the credits.
    restartButton.classList.remove('hidden');
    resetGame();
    player.lock();
  } else {
    player.lock();
  }
});

restartButton.addEventListener('click', () => {
  toggleCredits(false);
  resetGame();
  player.lock();
});

player.controls.addEventListener('lock', () => {
  audio.resume();
  captions.setPaused(false);
  startScreen.classList.add('hidden');
  hud.style.display = 'block';
  crosshair.style.display = 'block';
});

player.controls.addEventListener('unlock', () => {
  // Three reasons the pointer unlocks, and they are NOT the same thing.
  //
  // 1. A diegetic close-up -- the photo board, the keypad, a document. The
  //    pointer is released so the mouse can be used; the game is still running
  //    behind it. audio.pause() used to run at the top of this listener, ahead
  //    of these checks, so opening any of them killed the sound and froze the
  //    captions. A tape playing while you read the letter it came with is
  //    exactly the beat the story wants, and it was impossible.
  if (photoBoardUI.isOpen) return;
  if (pinPadUI.isOpen) return;
  if (documentUI.isOpen) return;

  // 2. and 3. are both real pauses -- the credits screen and Esc -- and both
  //    should suspend everything. Captions pause on the same event as the
  //    audio, which is the whole reason they run on the frame clock rather
  //    than setTimeout: a voiced line and its caption cannot drift apart.
  audio.pause();
  captions.setPaused(true);

  if (!creditsScreen.classList.contains('hidden')) return;
  showPauseScreen();
});

// ---------- dev-only test hook ----------
//
// Stripped from production builds: import.meta.env.DEV is a compile-time
// constant, so this whole block is dead code that Rollup removes.
//
// It exists because the level-preview number keys are gated on
// `player.isLocked`, and a headless browser has no Pointer Lock API at all --
// so the smoke harness could reach the bedroom and nothing else. That was worse
// than it sounds: the level-jump assertion in the harness was passing while
// silently testing the same room four times.
//
// Nothing here grants a capability a player does not have with the keyboard.
if (import.meta.env.DEV) {
  window.__game = {
    activateLevel,
    exitLevel,
    resetGame,
    hands,
    THREE,
    sceneManager,
    player,
    postFX,
    cutscene,
    script,
    creature,
    // The backrooms figure is a DIFFERENT creature from `creature` now -- a
    // harness asserting on the thing in the corridor has to reach this one, and
    // reaching the wrong one would pass against a figure nobody can see.
    okabe,
    creatureAI,
    backroomsHunter,
    playerBody,
    thirdCam,
    setThirdPerson,
    get thirdPerson() { return thirdPerson; },
    updateThirdPerson,
    freeCamera,
    visor,
    // Test-only access to the backrooms trailing shadow and the bedroom
    // window flash, neither of which has a keyboard trigger of its own to
    // drive from a headless harness.
    updateBackroomsShadow,
    resetBackroomsShadow,
    armWindowFlash: () => { windowFlashArmed = true; windowFlashUsed = false; },
    get windowFlashUsed() { return windowFlashUsed; },
    // The F key is in the pointer-lock-gated listener, so a headless harness
    // has no way to turn the torch on -- and the torch is what the player sees
    // by for most of the game.
    setFlashlight,
    // Kept under its old name for any harness that still calls it: puts the
    // torch in hand the way the F key would.
    equipTorch: () => heldItems.select('flashlight'),
    // Sprint is on a held key the harness cannot press meaningfully, and the
    // FOV/stamina are the observable results, so tests reach them here.
    get fov() { return camera.fov; },
    BASE_FOV,
    // Flips the same flag the bedroom's flashlight pickup does, so a headless
    // test can put the torch view-model in hand without faking pointer lock
    // and the real pickup interaction.
    forceFlashlightFound: () => {
      flashlightFound = true;
      if (!gameState.inventory.has('flashlight')) pickUpItem('flashlight', { animate: false });
      else heldItems.select('flashlight');
      setFlashlight(true);
    },
    pickUpItem,
    consumeItem,
    refreshInventoryUI,
    // The held item. heldItems.framing is the live per-item framing table --
    // edit a row, then heldItems.reframe() to see it -- and select()/cycle()
    // stand in for the wheel, which a headless harness cannot turn.
    heldItems,
    itemMeshes,
    // Q is in the pointer-lock-gated listener too.
    dropHeldItem,
    droppedItems,
    // The map: headless has no Pointer Lock, so the frame loop's own call to
    // setMode/revealAt/update never runs and a test drives it from here.
    minimap,
    storm: bedroomStorm,
    captions,
    documentUI,
    audio,
    gameState,
    get level() { return sceneManager.activeKey; }
  };
}

// ---------- loading screen ----------
/**
 * REAL WORK NOW, and the measurement is why.
 *
 * This bar used to be a setInterval adding 12-30% every 110 ms -- it filled in
 * about seven hundred milliseconds, hid itself, and had done nothing at all.
 * Meanwhile the actual cost was still sitting there waiting for the player:
 *
 *   level              activate()   FIRST render   second render
 *   bedroom               1.3 ms       3024.7 ms        2.1 ms
 *   hallwayBasement       0.5 ms       1580.9 ms        1.0 ms
 *   study                 0.3 ms       1982.0 ms        1.4 ms
 *   backrooms             0.2 ms       1912.0 ms        6.7 ms
 *
 * SceneManager builds every level up front and activate() is only a visibility
 * swap, so switching rooms is genuinely free -- 0.2 to 1.3 ms. What froze the
 * game was the FIRST FRAME a level was ever drawn in, where three.js compiles
 * every shader program that room needs and uploads its textures. About eight
 * and a half seconds of it, paid in whole-second lumps at whichever door the
 * player happened to open first.
 *
 * So the bar now pays it, once, here. renderer.compileAsync() builds the
 * programs without drawing anything, and on a driver with
 * KHR_parallel_shader_compile it does most of that off the main thread, which
 * is what lets this bar actually animate while it happens.
 *
 * Hiding the freeze behind a longer fade would have been the other option. It
 * is worse: the fade is 1.74 s and the bedroom alone needs 3.0, so the stall
 * would still show, and it would show every run instead of once.
 */
/**
 * Yield long enough for the browser to paint the bar, WITHOUT depending on it.
 *
 * requestAnimationFrame alone deadlocks the loading screen. A background or
 * minimised tab does not animate, so rAF simply never fires and the warm-up
 * stops forever on whichever step it had reached -- measured, stuck at 17%
 * with document.hidden true. Anyone who opened the game in a second tab and
 * went to look at something else would come back to a progress bar that had
 * given up.
 *
 * Racing it against a timer keeps the fast path (paint, then continue) and
 * makes the hidden-tab path merely slow instead of broken: setTimeout is
 * throttled in a background tab but it does still fire.
 */
/** Flavour, keyed by level, so the longest steps say what they are waiting on. */
const LOAD_HINTS = {
  bedroom: 'entering the house...',
  hallwayBasement: 'feeling along the wall...',
  study: 'finding the study...',
  backrooms: 'the walls do not end...'
};

const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(finish);
  setTimeout(finish, 50);
});

function setLoadProgress(fraction, hint) {
  loadingBarFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  if (hint) loadingHintEl.textContent = hint;
}

/**
 * Puts every view-model piece on screen for one warm-up draw, and returns a
 * function that puts everything back.
 *
 * WHY. three.js builds a separate shader for each lighting setup, so the hands
 * and every held item need one per room. The warm-up draw only builds what is
 * visible at that moment -- and the bare glove is hidden while anything is in
 * hand, and an item not yet picked up has no mesh at all. So each of them
 * built its shaders mid-game instead, the first time it appeared in each room:
 * opening the bedroom's lockbox froze the game for ~2 s (the glove showing as
 * the brass key left the hand) and cut the sound with it.
 *
 * Shown here: every hidden mesh under the camera (the bare glove and nails
 * among them), plus a held AND a dropped copy of every item that can be built
 * yet. Dropped copies receive shadows, which is a different shader again.
 * Lights under the camera are never touched -- turning one on would change the
 * very lighting setup the shaders are being built for.
 *
 * @returns {() => void} restores visibility and removes the temporary copies.
 */
function showViewModelsForWarmUp() {
  const shownObjects = [];
  camera.traverse((object) => {
    if (object === camera || object.isLight || object.visible) return;
    object.visible = true;
    shownObjects.push(object);
  });
  const WARM_COPY_POSITION = [0, -0.15, -0.7];
  const warmCopies = [];
  for (const itemId of ITEM_MESH_IDS) {
    for (const view of ['held', 'world']) {
      const copy = itemMeshes.build(itemId, view);
      if (!copy) continue;
      copy.position.set(...WARM_COPY_POSITION);
      copy.traverse((object) => { if (object.isMesh) object.frustumCulled = false; });
      camera.add(copy);
      warmCopies.push(copy);
    }
  }
  return () => {
    for (const copy of warmCopies) camera.remove(copy);
    for (const object of shownObjects) object.visible = false;
  };
}

async function warmUp() {
  const keys = [...sceneManager.levels.keys()];
  // The creature counts as a step of its own: it is a network fetch rather
  // than a compile, and it is the one the maze cannot open without.
  const steps = keys.length + 2;
  let done = 0;
  const advance = async (hint) => {
    done++;
    setLoadProgress(done / steps, hint);
    // Yield, or the bar's width change never reaches the screen -- the browser
    // cannot paint between two synchronous compiles.
    await nextFrame();
  };

  // The hands and the held torch are drawn in every room's warm-up below, so
  // they have to have arrived. Both promises already swallow a failed load,
  // so a missing model costs that model's warm-up, never the whole boot.
  await Promise.all([handsReady, heldTorchReady]);
  // And every room's own models, which can bring lights with them: a room
  // warmed before its candles arrive is warmed for the wrong lighting.
  await waitForAllLoads();

  // Everything off, so each room is warmed on its own and nothing is paid
  // twice. Restored at the end from what it actually was.
  const wasVisible = new Map();
  for (const key of keys) {
    const level = sceneManager.get(key);
    if (level) { wasVisible.set(key, level.group.visible); level.group.visible = false; }
  }
  const wasFog = scene.fog;
  const camPos = camera.position.clone();
  const camQuat = camera.quaternion.clone();

  for (const key of keys) {
    const level = sceneManager.get(key);
    if (!level) { await advance('entering the house...'); continue; }
    // The hint changes BEFORE the work, not after. The maze takes about three
    // seconds on its own, and a bar that sits still under a stale caption for
    // that long reads as a hang rather than as loading.
    setLoadProgress(done / steps, LOAD_HINTS[key] ?? 'entering the house...');
    await nextFrame();
    level.group.visible = true;
    // Fog is part of the program key, so a room warmed under the wrong fog is
    // warmed for nothing.
    scene.fog = LEVEL_FOG[key] ?? null;
    // Stand where the player will stand, so the room is in front of the camera
    // rather than behind it.
    if (level.spawn) camera.position.set(level.spawn[0], 1.6, level.spawn[1]);
    // AND THEN ACTUALLY DRAW IT, which is the only thing that provably pays
    // the cost. compileAsync alone got bedroom 3025 -> 871 ms and left the
    // backrooms at 2272, because it builds the base material programs and not
    // whatever else the first real frame does -- the shadow depth variants for
    // a casting spotlight among them. Rather than keep guessing at what it
    // misses, draw the frame. Whatever the first frame costs, it costs it
    // here, behind the bar, once.
    const unculled = [];
    level.group.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { unculled.push(o); o.frustumCulled = false; }
    });
    try {
      await renderer.compileAsync(level.group, camera, scene);
      // frustumCulled off for exactly this draw: a wall behind the camera is
      // clipped away but its draw call still issues, so its programs are built.
      // Without it, half of a room warms and the other half stalls on arrival.
      //
      // With the hands and every item on screen too, and every shadow drawn
      // whether its light is on or not -- see showViewModelsForWarmUp().
      const restoreViewModels = showViewModelsForWarmUp();
      darkShadowSkipper.refreshAllShadowsOnce();
      try {
        postFX.render();
      } finally {
        restoreViewModels();
      }
      // The map is a separate WebGL context with programs of its own, and it
      // used to build them on its first frame in each room -- after this bar
      // had finished. Warmed here, under this same unculled draw, in the mode
      // the level will actually ask for.
      minimap.setMode(level.minimap);
      await minimap.warmUp();
    } catch (err) {
      console.warn(`warmUp: could not warm "${key}"`, err);
    }
    for (const o of unculled) o.frustumCulled = true;
    level.group.visible = false;
    await advance('entering the house...');
  }

  for (const [key, v] of wasVisible) {
    const level = sceneManager.get(key);
    if (level) level.group.visible = v;
  }
  scene.fog = wasFog;
  camera.position.copy(camPos);
  camera.quaternion.copy(camQuat);

  // Both bodies: the monster, and the player's own, which is the same mesh at
  // the other end of the dial. Waiting on each is a 1.8 MB fetch the browser
  // serves the second one from cache, then its own pile of programs.
  setLoadProgress(done / steps, 'something is already inside...');
  await nextFrame();
  await Promise.all([okabe.ready, playerBody.ready, creature.ready]);
  await advance('something is already inside...');
  const creatureWasVisible = okabe.visible;
  const fogBefore = scene.fog;
  const posBefore = camera.position.clone();
  const maze = sceneManager.get('backrooms');
  const mazeWasVisible = maze ? maze.group.visible : false;
  okabe.visible = true;
  // In the maze, under the maze's fog, lit by the maze's lights and with the
  // creature in front of the camera -- the exact conditions of the frame it
  // walks into view on. Warmed anywhere else and it compiles again on arrival.
  if (maze) maze.group.visible = true;
  scene.fog = LEVEL_FOG.backrooms ?? null;
  if (maze?.spawn) {
    camera.position.set(maze.spawn[0], 1.6, maze.spawn[1]);
    okabe.setPosition(maze.spawn[0], maze.spawn[1] - 4);
  }
  okabe.setCorrection(0);
  okabe.setSilhouette(true);
  okabe.update(1 / 60);
  okabe.setLayer(0);
  const unculled = [];
  okabe.group.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { unculled.push([o, o.frustumCulled]); o.frustumCulled = false; }
  });
  try {
    await renderer.compileAsync(okabe.group, camera, scene);
    postFX.render();
  } catch (err) {
    console.warn('warmUp: could not warm the creature', err);
  }
  // And the player's body, in the bedroom where the view is first switched,
  // so the first press of T is not its own half-second stall.
  const bodyWasVisible = playerBody.visible;
  playerBody.visible = true;
  playerBody.setPosition(camera.position.x, camera.position.z);
  playerBody.update(1 / 60);
  playerBody.group.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { unculled.push([o, o.frustumCulled]); o.frustumCulled = false; }
  });
  try {
    await renderer.compileAsync(playerBody.group, camera, scene);
    postFX.render();
  } catch (err) {
    console.warn('warmUp: could not warm the player body', err);
  }
  playerBody.visible = bodyWasVisible;

  // And the house creature, at the monster reading every house beat shows, in
  // EACH house room it can appear in, with only that room showing.
  //
  // A shader is built for one exact set of lights and fog. This used to be done
  // once, under the bedroom's fog but with the maze still switched on from the
  // hunter's warm-up above -- a mix of two rooms' lights that play never
  // produces -- so the creature built its shaders again on its first
  // appearance in every room: entering the basement froze for ~2-3 s. The
  // player's body (T) is drawn alongside it for the same reason.
  const houseWasVisible = creature.visible;
  const bodyWasShown = playerBody.visible;
  const levelWasVisible = new Map([...sceneManager.levels].map(([key, level]) => [key, level.group.visible]));
  creature.visible = true;
  playerBody.visible = true;
  creature.group.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { unculled.push([o, o.frustumCulled]); o.frustumCulled = false; }
  });
  for (const houseKey of ['bedroom', 'hallwayBasement', 'study']) {
    const houseLevel = sceneManager.get(houseKey);
    if (!houseLevel) continue;
    for (const [key, level] of sceneManager.levels) level.group.visible = key === houseKey;
    scene.fog = LEVEL_FOG[houseKey] ?? null;
    if (houseLevel.spawn) camera.position.set(houseLevel.spawn[0], 1.6, houseLevel.spawn[1]);
    creature.setPosition(camera.position.x, camera.position.z - 4);
    creature.update(1 / 60);
    playerBody.setPosition(camera.position.x, camera.position.z);
    playerBody.update(1 / 60);
    try {
      await renderer.compileAsync(creature.group, camera, scene);
      postFX.render();
      // It shows on the house map too, which has programs of its own.
      minimap.setMode(houseLevel.minimap);
      await minimap.warmUp();
    } catch (err) {
      console.warn(`warmUp: could not warm the house creature in "${houseKey}"`, err);
    }
  }
  for (const [key, level] of sceneManager.levels) level.group.visible = levelWasVisible.get(key);
  creature.visible = houseWasVisible;
  playerBody.visible = bodyWasShown;

  // Put back what each mesh HAD, not true: OkabeCreature turns culling off on
  // its skinned meshes on purpose (their bounding sphere freezes at the first
  // pose), and blanket-restoring true here quietly undid that.
  for (const [o, was] of unculled) o.frustumCulled = was;
  okabe.visible = creatureWasVisible;
  okabe.setSilhouette(false);
  if (maze) maze.group.visible = mazeWasVisible;
  scene.fog = fogBefore;
  camera.position.copy(posBefore);
  // Leave the map showing the room the game actually opens in, not whichever
  // level was warmed last.
  minimap.setMode(sceneManager.active?.minimap);
  await minimap.warmUp();
  // IT MAY HUNT NOW, and not before. Starting the hunter on a creature whose
  // shaders have never been built is the one stall a fade cannot cover,
  // because it lands the moment the thing becomes visible in the corridor.
  backroomsHunter.setReady(true);
  await advance('something is already inside...');
}

warmUp()
  .catch((err) => console.error('warmUp failed; starting anyway', err))
  .finally(() => {
    setLoadProgress(1);
    // The world is ready either way: a warm-up that failed costs stutter, not
    // a game nobody can start.
    backroomsHunter.setReady(true);
    setTimeout(() => loadingScreen.classList.add('is-done'), 250);
    // Print every page's photograph now, while the player is on the menu, so
    // each one is already on its plate when its page lands.
    for (const id of ['prologue', 'afterBedroom', 'afterBasement', 'ending_released', 'ending_contained']) {
      newspaperView.preload(id);
    }
  });

// ---------- render loop ----------
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  // On real time, so it flies smoothly through a slowed or frozen world.
  freeCamera.update(realDt);
  // Frozen means the world is not updated at all, rather than updated with a
  // dt of 0: several systems divide by dt.
  if (freeCamera.isWorldFrozen) {
    postFX.setCamera(freeCamera.camera);
    postFX.render();
    requestAnimationFrame(tick);
    return;
  }
  // Slow motion for the free camera. Exactly realDt the rest of the time.
  const dt = realDt * freeCamera.timeScale;
  elapsed += dt;

  player.update(dt);
  // Footsteps ride the player's own bob clock, so they land with the visual dip
  // and stop dead when a wall does. See AudioEngine.updateFootsteps.
  audio.updateFootsteps(player.bobPhase, {
    moving: player.moving,
    sprint: player.sprint,
    crouch: player.crouch
  });

  if (sceneManager.activeKey === 'bedroom') {
    bedroomStorm.update(dt);
    rain.update(dt);
    // Only while actually playing: a paused game is not a stuck player.
    // Nor is one reading the front page laid over the room.
    if (player.isLocked && !newspaperView.isOpen) bedroomHints.update(dt);
  }
  captions.update(dt);
  // Only while it is actually on screen. The AI is not driving it in Level 2 --
  // it is placed by a script -- but it still has to breathe, or a figure
  // standing in a corner reads as a statue rather than as something watching.
  if (creatureStanding) creature.update(dt);
  creatureAI.update(dt);
  if (sceneManager.activeKey === 'backrooms') {
    // Never both: one rig, and the hunter owns it outright while it is running.
    if (backroomsHunter.state === 'stopped') updateBackroomsShadow(dt);
    else backroomsHunter.update(dt);
  }
  dustMotes.update(dt, elapsed);
  // Per rendered frame rather than on a fixed step: the hands are
  // presentation, and pinning them to 60 Hz on a 144 Hz display would throw
  // away smoothness the display can actually show.
  //
  // The held item is what the player actually sees move here - the glove is
  // hidden while anything is in hand - and it moves because these layers offset
  // the hand root, which the grip socket hangs off. walkbob's weight follows the player's
  // own smoothed movement so it fades in and out with walking rather than
  // snapping; breathe and sway are on by default and never switch off, which is
  // what keeps the torch alive when standing still.
  handMotion.lookDeltaX = player.lookDeltaX;
  handMotion.lookDeltaY = player.lookDeltaY;
  handMotion.bobPhase = player.bobPhase;
  handMotion.speed = player.moving;
  handMotion.crouching = player.crouch > 0.5;

  /**
   * THE SPRINT FOV KICK -- the project's first FOV animation, and the reason
   * sprinting reads as fast rather than just as a bigger number. Peripheral
   * geometry pulls into frame and the corridor walls appear to rush past, which
   * is the strongest "I am moving" cue available in first person.
   *
   * It costs one line because postFX's RenderPass holds this camera by
   * reference and reads it live, so the change flows through the composer with
   * nothing to notify.
   *
   * Driven straight off player.sprint, which is already exponentially smoothed
   * over SPRINT_BLEND -- easing it a second time here would only add latency.
   *
   * Zeroed while `cinematic`, because player.update() returns before touching
   * sprint during a scripted shot, so the FOV would otherwise sit frozen
   * wherever the shot started. If a cutscene ever wants to animate FOV itself,
   * THIS is the line it has to take ownership of.
   */
  const wantFov = BASE_FOV + SPRINT_FOV_KICK * (player.cinematic ? 0 : player.sprint);
  if (Math.abs(wantFov - camera.fov) > 0.02) {
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  } else if (camera.fov !== wantFov) {
    // Snap the tail. Without this the projection matrix is left rebuilt at
    // 70.019 forever and a test can never assert exactly BASE_FOV.
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }

  /**
   * A CROSSFADE, not two layers stacked. The animator SUMS layers, so leaving
   * walkbob at full weight while runbob comes up would double the bob at full
   * sprint. `moving` gates both on actually walking; `sprint` splits the gate
   * between them.
   */
  hands.setLayerWeight('walkbob', player.moving * (1 - player.sprint));
  hands.setLayerWeight('runbob', player.moving * player.sprint);

  /**
   * The stamina bar, shown only while it matters.
   *
   * A permanently-full bar is a permanent reminder of a resource the player is
   * not spending, so it fades in once it drops and fades out again once it is
   * back. scaleX rather than width, because this runs every frame and a
   * transform does not trigger layout.
   */
  const stam = player.staminaFraction;
  staminaFillEl.style.transform = `scaleX(${stam})`;
  staminaEl.classList.toggle('visible', stam < 0.995);
  staminaEl.classList.toggle('spent', player.winded);
  // The player's smoothed crouch IS the layer weight, so the hands ease in and
  // out of the tucked pose with the camera's drop rather than snapping.
  hands.setLayerWeight('crouch-shift', player.crouch);
  // Before the hands update, so an item swapped in this frame is posed and
  // framed before the layers move it -- never drawn for a frame in the old pose.
  heldItems.update();
  hands.update(dt, elapsed, handMotion);
  // The camera IS the player's position; the basement reads it to know when
  // they have walked up to the metal door.
  sceneManager.update(dt, camera.position);

  if (player.isLocked) {
    interaction.update();
    // Mode comes from the level, read every frame rather than hooked into each
    // of activate()'s call sites; setMode() guards on identity so this is a
    // pointer compare on the frames it does not change.
    const lvl = sceneManager.active;
    minimap.setMode(lvl?.minimap);
    // Fog of war. The level owns its own rectangles, so it decides what the
    // player has now seen -- this only tells it where they are.
    lvl?.revealAt?.(camera.position.x, camera.position.z);
    minimap.update();
  }

  // AFTER everything that moves the player and BEFORE the draw, because the
  // third-person camera is derived from where the player ended this frame.
  updateThirdPerson(dt);
  // Switched on the blend rather than the flag, so the swap happens once the
  // camera has actually left the head instead of on the frame the key is hit.
  if (freeCamera.isActive) postFX.setCamera(freeCamera.camera);
  else postFX.setCamera(thirdAmount > 0.001 ? thirdCam : camera);

  postFX.update(dt);
  // After everything that sets a light's intensity this frame, so a light that
  // has just come on gets a fresh shadow in the very frame it lights.
  darkShadowSkipper.update();
  postFX.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
