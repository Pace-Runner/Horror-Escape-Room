import { createMarkThoughts } from './systems/MarkThoughts.js';
import { createSessionTapeFocus } from './cutscenes/session14.js';
import * as THREE from 'three';
// FIRST, before any module that might start a load: it has to be listening
// before the first model or texture is requested. See core/LoadTracker.js.
import { waitForAllLoads } from './core/LoadTracker.js';
import { PointerLockPlayer, SENSITIVITY_MIN, SENSITIVITY_MAX } from './core/PointerLockPlayer.js';
import { WALK_SPEED } from './core/MoveSpeeds.js';
import { SceneManager, createDeferredLevel } from './core/SceneManager.js';
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
import { ROOM_FLOORS } from './levels/annabelleRooms.js';
import { DOORWAYS, drawMonsterStart, roomInteriors } from './levels/backroomsMaze.js';
import { createUpstairsHallwayLevel } from './levels/upstairsHallwayLevel.js';
import { createScreenFade, wait } from './core/ScreenFade.js';
import { gameState, resetState, addItem, removeItem, ITEMS, HOTBAR_SLOTS, inventorySlots } from './core/GameState.js';
import { createHeldItems } from './core/HeldItems.js';
import { createLeftTorch } from './core/LeftTorch.js';
import { createItemMeshes, ITEM_MESH_IDS } from './world/itemMeshes.js';
import { MAIN_ONLY } from './core/RenderLayers.js';
import { createMinimap } from './core/Minimap.js';
import { CaptionSequencer } from './core/CaptionSequencer.js';
import { createDocumentUI } from './core/DocumentUI.js';
import { createTapeSubtitles } from './core/TapeSubtitles.js';
import { createPostFX } from './world/Postprocessing.js';
import { createContextualHints, getAvailableHintKeys, selectHintKey } from './core/ContextualHints.js';
import { enableSinglePassForFlatDecals, createDarkShadowSkipper, findShadowCastingLights } from './world/renderOptimizations.js';
import { createCutsceneRunner } from './core/Cutscene.js';
import { wakeUp } from './cutscenes/wakeUp.js';
import { comeRound } from './cutscenes/comeRound.js';
import { stairsBehind } from './cutscenes/stairsBehind.js';
import { createCutsceneExport } from './core/CutsceneExport.js';
import { createCutsceneSkip } from './core/CutsceneSkip.js';
import { createNewspaper } from './core/Newspaper.js';
import { createOpeningNewsCutscene } from './core/OpeningNewsCutscene.js';
import { createJumpScare } from './core/JumpScare.js';
import { createStairsScare } from './core/StairsScare.js';
import { createHallwayBlinks } from './core/HallwayBlinks.js';
import { createStairsFall } from './core/StairsFall.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY, createRunTimer } from './core/Difficulty.js';
import { FreeCamera } from './core/FreeCamera.js';
import { createScriptRunner } from './core/Script.js';
import { createOkabeCreature } from './systems/OkabeCreature.js';
import { createCreatureAI } from './systems/CreatureAI.js';
import { createBackroomsHunter } from './systems/BackroomsHunter.js';
import { createAudioDirector } from './systems/AudioDirector.js';
import { createBackroomsBarks } from './systems/BackroomsBarks.js';
import { createVisor } from './core/Visor.js';
import { DOCUMENTS } from './story/lines.js';
import { SESSION_TAPE_SUBTITLES, SESSION_TAPE_PLACEHOLDER_SOUNDS } from './story/sessionTape.js';
import { line, linePicker } from './dialogue/index.js';
import { installUnloadGuard } from './core/KeyboardGuard.js';
import { Hands } from './systems/hands/hands.js';
import { setHandAssetUrl } from './systems/hands/hand-mesh.js';
import handsModelUrl from './assets/models/hands.glb?url';
import { loadModel, preloadModel, preloadTexture, preloadFont, deferModelLoads, startModelLoads } from './world/modelLoader.js';
import { LEVEL_ASSETS } from './world/levelAssetDependencies.js';
import flashlightModelUrl from './assets/models/flashlight.glb?url';

console.time('APP_BOOT');
deferModelLoads();

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
const menuMainActions = document.getElementById('menu-main-actions');
const menuDifficulty = document.getElementById('menu-difficulty');
const menuDifficultyBack = document.getElementById('menu-difficulty-back');
const runTimerEl = document.getElementById('run-timer');
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
const hotbarEl = document.getElementById('hotbar');
/** Each item's slot as it looks carried (index.html's #item-icons), keyed by item id. */
const itemIconTemplates = new Map(
  [...document.getElementById('item-icons').content.querySelectorAll('.hotbar-slot')].map((el) => [el.dataset.item, el])
);
const minimapCanvas = document.getElementById('minimap');
const minimapArrowEl = document.getElementById('minimap-arrow');
const minimapWrapEl = document.getElementById('minimap-wrap');
const creditsScreen = document.getElementById('credits-screen');
const creditsEpilogue = document.getElementById('credits-epilogue');
const creditsSections = document.getElementById('credits-sections');
const staminaEl = document.getElementById('stamina');
const staminaFillEl = document.getElementById('stamina-fill');
const creditsCloseBtn = document.getElementById('credits-close');
const quitScreen = document.getElementById('quit-screen');
const quitBackButton = document.getElementById('quit-back');
const fadeOverlay = document.getElementById('fade-overlay');
const openingNewsContinue = document.getElementById('opening-news-continue');
const openingNewsLoading = document.getElementById('opening-news-loading');
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
  onShow: () => paperRustle()
});

// Only replaces the opening prologue. The Newspaper controller above remains
// responsible for every paper shown after Level 1.
const openingNewsCutscene = createOpeningNewsCutscene({
  root: document.getElementById('opening-news-cutscene')
});

/**
 * Medium and Hard's per-room clock -- see core/Difficulty.js. Set to the
 * chosen difficulty by beginGame() and every restart, refilled by
 * activateLevel() in each room, and counted down in tick() only while the
 * player is playing. Up here so it exists before any room is activated.
 */
const runTimer = createRunTimer({ el: runTimerEl, onExpire: () => playOutOfTime() });

// ---------- launch menu ----------
// This state belongs only to the DOM launch menu. It deliberately does not
// overlap the game's pause/end state, which continues to use the legacy start
// controls below after pointer lock has been released.
let menuOverlayState = 'main';
let selectedMenuOptionIndex = 0;

/** The buttons of whichever menu panel is showing: the main list, or difficulty. */
function readVisibleMenuButtons() {
  const panel = menuDifficulty.classList.contains('hidden') ? menuMainActions : menuDifficulty;
  return [...panel.querySelectorAll('.menu-option')];
}

function selectMenuOption(optionIndex) {
  const buttons = readVisibleMenuButtons();
  selectedMenuOptionIndex = (optionIndex + buttons.length) % buttons.length;
  buttons.forEach((button, index) => {
    button.classList.toggle('is-selected', index === selectedMenuOptionIndex);
  });
  buttons[selectedMenuOptionIndex].focus({ preventScroll: true });
}

/** Swaps the main list for the difficulty choice, or back. */
function showDifficultyChoice(show) {
  menuDifficulty.classList.toggle('hidden', !show);
  menuMainActions.classList.toggle('hidden', show);
  // Start on the difficulty last played, so a replay is one Enter away.
  const buttons = readVisibleMenuButtons();
  const lastPlayed = buttons.findIndex((button) => button.dataset.difficulty === currentDifficulty);
  selectMenuOption(show ? Math.max(0, lastPlayed) : 0);
}

/**
 * The difficulty of the run being played (a key of DIFFICULTIES). Up here
 * because the menu needs it before the settings are loaded further down;
 * loadSettings() fills it in with the one last played.
 */
let currentDifficulty = DEFAULT_DIFFICULTY;

function showMainMenu() {
  menuOverlayState = 'main';
  showDifficultyChoice(false);
  mainMenu.classList.remove('hidden');
  legacyStartControls.classList.add('hidden');
  creditsScreen.classList.add('hidden');
  quitScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
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

for (const panel of [menuMainActions, menuDifficulty]) {
  panel.querySelectorAll('.menu-option').forEach((button, index) => {
    button.addEventListener('mouseenter', () => selectMenuOption(index));
    button.addEventListener('focus', () => {
      if (!button.classList.contains('is-selected')) selectMenuOption(index);
    });
  });
}

// The time each difficulty gives, written once in core/Difficulty.js.
menuDifficulty.querySelectorAll('[data-difficulty]').forEach((button) => {
  const detail = button.querySelector('.menu-option-detail');
  if (detail) detail.textContent = DIFFICULTIES[button.dataset.difficulty].detail;
  button.addEventListener('click', () => {
    currentDifficulty = button.dataset.difficulty;
    settings.difficulty = currentDifficulty;
    saveSettings(settings);
    menuOverlayState = 'game';
    mainMenu.classList.add('hidden');
    // Keep this synchronous with the click so Pointer Lock retains the browser
    // user gesture that the existing Level 1 flow requires.
    startButton.click();
  });
});

menuStartButton.addEventListener('click', () => showDifficultyChoice(true));
menuDifficultyBack.addEventListener('click', () => showDifficultyChoice(false));
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
    readVisibleMenuButtons()[selectedMenuOptionIndex].click();
  } else if (event.code === 'Escape' && !menuDifficulty.classList.contains('hidden')) {
    event.preventDefault();
    showDifficultyChoice(false);
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

/**
 * A key light for scripted moments in the dark: the stairs scare's glow on the
 * hand while the torch is dead, and its shot of the monster behind the player
 * (ctx.keyLight in a scene). Off (intensity 0) the rest of the time.
 *
 * ALWAYS IN THE SCENE, never added for a moment and removed after: three.js
 * compiles the light count into every material's shader, so adding a light
 * mid-game recompiles everything and freezes the game for a moment, right as
 * the shot starts.
 */
const cinematicLight = new THREE.PointLight(0xbcd0ff, 0, 4.5, 2);
scene.add(cinematicLight);

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
// Deliberately deferred until a game begins: the hands are presentation, so
// the 167 KB model never holds up the menu. A load
// failure warns and leaves the game entirely playable -- every method on Hands
// is safe to call before init() has finished. Nothing has to be re-equipped
// when it lands: the held-item system reconciles every frame (see
// core/HeldItems.js), so whatever is selected appears the frame the hand does.
let handsReady = null;
function initializeHands() {
  if (!handsReady) {
    handsReady = hands.init().catch((err) => {
      console.error('Failed to initialise the first-person hands:', err);
    });
  }
  return handsReady;
}

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
let heldTorchReady = null;
function initializeHeldTorch() {
  if (!heldTorchReady) {
    heldTorchReady = loadModel(flashlightModelUrl).then((torch) => {
      itemMeshes.setTemplate('flashlight', torch);
    }).catch((err) => {
      console.error('Failed to load the held flashlight, it will not appear in hand:', err);
    });
  }
  return heldTorchReady;
}

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
/**
 * 0..1, how much of its light the torch is giving, on top of the fault below.
 * 1 normally; the stairs scare drops it to make the torch sputter and die on
 * cue WITHOUT touching the switch, so putting the power back needs no memory
 * of the switch.
 */
let torchPower = 1;

/** Sets torchPower and pushes it straight through to the beam. */
function setTorchPower(scale) {
  torchPower = THREE.MathUtils.clamp(scale, 0, 1);
  applyFlashlightBeam();
}

/** Flips the torch's switch. The beam follows it only while the torch is in hand. */
function setFlashlight(on) {
  flashlightSwitchOn = !!on;
  applyFlashlightBeam();
}

/** Pushes the switch and the hand through to the two lights, the dust and the HUD. */
function applyFlashlightBeam() {
  // `held`, not isHolding(): a torch on its way to the floor stays lit until the
  // fingers actually open.
  // Carried in the left hand from the moment it is found; the right hand's item
  // never affects it.
  const inHand = flashlightFound && gameState.inventory.has('flashlight');
  leftTorch.setCarried(inHand);
  flashlightOn = flashlightSwitchOn && inHand;
  // The spill drops well below the old 2.4: it is now filling AROUND a hot
  // spot rather than being the whole beam, and leaving both at full strength
  // would just be a brighter blob.
  const level = torchPower * (flashlightOn ? 1 : 0);
  flashlightSpot.intensity = 1.75 * level;
  flashlightHot.intensity = 3.35 * level;
  dustMotes.setBeamOn(level > 0);
  flashlightStateEl.textContent = !flashlightFound ? 'not found'
    : !inHand ? 'put away'
      : flashlightOn ? 'on' : 'off';
  flashlightStateEl.classList.toggle('on', flashlightOn);
}

// ---------- inventory, and what is in the hand ----------
/**
 * The torch rides in the LEFT hand (core/LeftTorch.js), independent of the
 * right-hand item: picking up or switching to another item leaves it out and lit.
 */
const leftTorch = createLeftTorch({ camera, itemMeshes });

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

/**
 * Draws the inventory bar from its slots (GameState.inventorySlots): never
 * fewer than HOTBAR_SLOTS, more only once every one is full. A slot whose item
 * has changed takes that item's icon, tint and title from #item-icons; the
 * rest are left alone.
 */
function refreshInventoryUI() {
  const selected = heldItems.selected;
  const slots = inventorySlots();
  const count = Math.max(HOTBAR_SLOTS, slots.length);
  while (hotbarEl.children.length < count) {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot';
    slot.dataset.item = '';
    hotbarEl.append(slot);
  }
  while (hotbarEl.children.length > count) hotbarEl.lastElementChild.remove();
  [...hotbarEl.children].forEach((slot, i) => {
    const id = slots[i] ?? '';
    if (slot.dataset.item !== id) {
      const icon = itemIconTemplates.get(id);
      slot.className = icon ? icon.className : 'hotbar-slot';
      slot.title = icon ? icon.title : '';
      slot.replaceChildren(...(icon ? [...icon.childNodes].map((node) => node.cloneNode(true)) : []));
      slot.dataset.item = id;
    }
    slot.classList.toggle('filled', id !== '');
    slot.classList.toggle('selected', id !== '' && id === selected);
  });
}
// The empty bar, from the first frame.
refreshInventoryUI();

/**
 * The mouse wheel steps through the owned items in the bar's slot order, wrapping.
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

/**
 * The recorded sound effects (AudioDirector's SFX table: free CC0 and public
 * domain clips, see src/assets/audio/SOURCES.md). The four the game used to
 * synthesise keep their synthesised version as a fallback, for the moment
 * before a file has decoded or a build without it.
 */
const sfx = (name, opts) => audioDirector.sfx(name, opts);
const creak = () => sfx('creak') || audio.creak();
const thunder = (opts) => sfx('thunder', opts) || audio.thunder();
const spark = () => sfx('spark') || audio.spark();
const paperRustle = () => sfx('paper') || audio.paperRustle();

// ---------- interaction / captions ----------
// One caption authority for the whole game. Interaction forwards examine text
// to it; story beats call captions.play([...]) and can await the result.
const markThoughts = createMarkThoughts(audio);
const thought = (key, options) => markThoughts.play(key, options);
const captions = new CaptionSequencer(captionEl);
const interaction = new Interaction(camera, promptEl, captions);
// Voice follows the caption rather than the other way round: the caption is
// the primary channel and always exists, the clip may not. A line with no
// `voice` key, or whose clip has not been recorded yet, is simply silent.
captions.onLineStart = (line) => {
  if (line.voice && !tapePlaying) audio.playVoice(line.voice);
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
const pickWrongCode = linePicker([
  'dialog_wrong_code_1', 'dialog_wrong_code_2', 'dialog_wrong_code_3',
  'dialog_wrong_code_4', 'dialog_wrong_code_5'
]);
const pinPadUI = createPinPadUI({
  onClose: () => player.lock(),
  // Every keypad in the game. say(), not play(): a wrong code must never cut
  // into a story line that happens to be running.
  onWrong: () => {
    sfx('keypad_wrong');
    captions.say(line(pickWrongCode()));
  },
  onKey: () => sfx('keypad_press'),
  onGranted: () => sfx('keypad_accept')
});

// The reading surface for every letter, note, file and transcript in the game.
// Same unlock-to-interact / re-lock-on-close contract as the two above.
const documentUI = createDocumentUI({
  onClose: () => player.lock()
});

/**
 * The session tape's subtitles, while the deck on the lab's desk plays it --
 * see core/TapeSubtitles.js. The tape plays in the room, so nothing is taken
 * from the player: they can stand and listen, or walk off.
 */
const tapeSubtitles = createTapeSubtitles({ subtitles: SESSION_TAPE_SUBTITLES });
/** The deck is running the tape, so its voices and stand-in sounds are due as its clock reaches them. */
let tapePlaying = false;

/**
 * Everything the host started for the tape, stopped: the stand-in's sounds,
 * a line cut off mid-sentence rather than left talking over the room, and the
 * subtitles.
 */
function silenceTape({ restoreFocus = true } = {}) {
  if (restoreFocus) {
    tapeFocus.cancel();
    markThoughts.setBlocked(false);
  }
  tapePlaying = false;
  audio.stopTapeSounds();
  audio.stopVoice();
  tapeSubtitles.stop();
}
/** Which of the stand-in tape's sounds have already played this time through. */
let tapeSoundsPlayed = 0;
/** The tape's spoken lines, in order, and how many have been started this time through. */
const TAPE_VOICE_CUES = SESSION_TAPE_SUBTITLES.filter((cue) => cue.voice);
let tapeVoicesPlayed = 0;

/**
 * Plays the tape's voices, and the stand-in's sound effects, as its clock
 * reaches them. The voices play over the recording too, since they are
 * recorded apart from it; the effects only over the stand-in, because the
 * recording carries its own.
 */
function updateTapeSounds() {
  if (!tapePlaying) return;
  const source = hallwayBasement.refs.sessionTape;
  const time = source.currentTimeInSeconds;
  // The voices, for the recording and the stand-in alike: they are recorded
  // apart from the tape's own sound, so each is started as it reaches its line.
  while (tapeVoicesPlayed < TAPE_VOICE_CUES.length && TAPE_VOICE_CUES[tapeVoicesPlayed].start <= time) {
    audio.playVoice(TAPE_VOICE_CUES[tapeVoicesPlayed].voice);
    tapeVoicesPlayed++;
  }
  if (source.hasRecording) return;
  while (tapeSoundsPlayed < SESSION_TAPE_PLACEHOLDER_SOUNDS.length
    && SESSION_TAPE_PLACEHOLDER_SOUNDS[tapeSoundsPlayed].at <= time) {
    audio.tapeSound(SESSION_TAPE_PLACEHOLDER_SOUNDS[tapeSoundsPlayed].sound);
    tapeSoundsPlayed++;
  }
}

// Scripted camera shots. Built here because it needs the hands and the dust
// motes, both of which have to be hidden for any shot that leaves the player's
// head -- see core/Cutscene.js.
//
// `targets` are the names a scene file can point the lens at without knowing
// anything about main.js. Functions, read on the frame that asks, so a target
// that moves is followed. 'player' (the player's eye) is built into the runner.
const _cutsceneTarget = new THREE.Vector3();
// The figures are built further down, hence a getter rather than the object.
const boneTarget = (getFigure, bone, fallbackHeight) => () => {
  const figure = getFigure();
  const b = figure.refs[bone];
  if (b) return b.getWorldPosition(_cutsceneTarget);
  return _cutsceneTarget.set(figure.position.x, fallbackHeight, figure.position.z);
};
const cutscene = createCutsceneRunner({
  camera, player, interaction, hands, dustMotes, captions, fade,
  targets: {
    'creature.head': boneTarget(() => creature, 'head', 1.9),
    'creature.chest': boneTarget(() => creature, 'chest', 1.4),
    'player.body.head': boneTarget(() => playerBody, 'head', 1.6),
    // From the body's own eyes, for a first-person shot of lying in it.
    'player.body.eyes': () => playerBody.getEyePosition(_cutsceneTarget)
  },
  // After every hand-back, the game's real state over the runner's snapshot:
  // which view the player is in, and whether their torch is actually lit. A
  // restart cancels a scene AFTER putting the torch away, and the snapshot
  // would light a dust cone in front of a player who has no torch.
  onHandBack: (def) => {
    cutsceneBodyShown = false;
    applyViewVisibility();
    if (def.restoreBeam !== false) applyFlashlightBeam();
    // The hand-back may have re-aimed the player after this frame's third-
    // person camera was placed; place it again so the first frame back is not
    // drawn from the old aim.
    poseThirdCam();
  }
});

const tapeFocus = createSessionTapeFocus({ cutscene, camera });

// Story beats. Every delayed beat in the game runs through this so a restart
// can cancel it -- see core/Script.js for the bug that made it necessary.
const script = createScriptRunner({ captions });
const bedroomHorrorScript = createScriptRunner({ captions });
const bedroomHorrorEvents = new Set();
// Level 1 is quiet by default. Breath only comes close enough to be heard for
// the two authored door beats; later levels keep their own intensity calls.
const LEVEL_ONE_BREATHING_BASE = 0.035;
const LEVEL_ONE_DOOR_BREATHING = 0.72;
/**
 * Level 2's breathing, on the same 0..1 dial. Was 0.6-0.95 and stayed there
 * for the rest of the level after the first beat, against Level 1's 0.035:
 * far too loud. Peaks are now about half that (-6 dB), and between beats it
 * settles near Level 1's background rather than holding the peak.
 */
const LEVEL_TWO_BREATHING = {
  /** Walking in: the same quiet background as Level 1. */
  base: 0.05,
  /** The blackout at the metal door: it is close. */
  blackout: 0.45,
  /** The CCTV hallway camera: something crosses the far end. */
  cctvDash: 0.4,
  /** Camera five: it is in this room. The loudest it gets. */
  cctvBasement: 0.5,
  /** After any of those, once it has gone. */
  settled: 0.18
};

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
/**
 * The monster is 15% bigger than the rig's own size, and then 15% bigger again,
 * in every appearance (user, 2026-10-17): 1.15 x 1.15.
 */
const MONSTER_SCALE = 1.15 * 1.15;
const creature = createOkabeCreature({ restCorrection: 0, scale: MONSTER_SCALE });
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
/**
 * 10% smaller than the house's (user, 2026-10-23): the backrooms ceiling is
 * 2.35 m, where the house's hall is 2.9, and at full size its head went
 * through the tiles.
 */
const BACKROOMS_MONSTER_SCALE = MONSTER_SCALE * 0.9;
const okabe = createOkabeCreature({ scale: BACKROOMS_MONSTER_SCALE });
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
  applyViewVisibility();
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
  // Switched on during a scene, it starts from the shot on screen rather than
  // cutting back to the player's eye -- so a framing seen in a scene can be
  // picked up, adjusted and marked (M).
  getStartCamera: () => (cutscene.isRunning ? cutscene.camera : camera),
  isInputLive: () => player.isLocked,
  getSensitivityMultiplier: () => player.sensitivity,
  onChange: applyFreeCameraVisibility
});
// The same eye-level-only geometry the player's camera draws.
freeCamera.camera.layers.enable(MAIN_ONLY);

/** Shown by a cutscene that wants the player in its shot (showPlayerBody). Cleared at every hand-back. */
let cutsceneBodyShown = false;

/**
 * The view model -- hands, held item, dust motes -- is parented to the
 * player's camera, so from any other camera it is a pair of forearms hanging
 * in mid-air: from behind (third person), from the free camera, from a
 * cutscene's lens. The player's body is the reverse: shown for third person,
 * for the free camera's B, and for a scene that stages it.
 *
 * ONE function for all of them, derived from every view at once, because each
 * view used to write these flags itself -- and whichever wrote last won. T in
 * the middle of a scene, or N switched off during one, put the glove and torch
 * into the shot.
 */
function applyViewVisibility() {
  const isViewModelShown = !thirdPerson && !freeCamera.isActive && !cutscene.isRunning;
  hands.root.visible = isViewModelShown;
  dustMotes.points.visible = isViewModelShown;
  // While a scene is filming, the scene alone decides: its eye-level shots sit
  // inside the body's head, so third person must not leave it showing there.
  // The free camera, watching from outside, goes back to its own B.
  const sceneFilming = cutscene.isRunning && !freeCamera.isActive;
  playerBody.visible = sceneFilming
    ? cutsceneBodyShown
    : thirdPerson || (freeCamera.isActive && freeCamera.isPlayerBodyVisible);
}

/** The free camera's onChange: switching it on or off, or showing the body (B). */
function applyFreeCameraVisibility() {
  applyViewVisibility();
  // Nothing the player was holding down before the switch keeps walking them.
  player.clearKeys();
}

// ---------- cutscenes ----------
/**
 * Every scene the game can play, by name. Each one BUILDS its definition at the
 * moment it plays, from where things actually are -- the stairs shot is framed
 * off where the player is standing. See src/cutscenes/ and
 * docs/CUTSCENES.md.
 */
const SCENES = {
  wakeUp: () => {
    const [bedX, bedZ] = bedroom.refs.bedPosition;
    // A point straight ahead of the view play starts from (the bedroom's
    // spawn), level-ish: what the eyes settle on as they sit up.
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const ahead = [
      eye.x - Math.sin(player.yaw) * 3,
      eye.y - 0.35,
      eye.z - Math.cos(player.yaw) * 3
    ];
    return wakeUp({
      onThought: thought,
      bedX,
      bedZ,
      duvetTop: surfaceHeightAt(bedroom.group, bedX, bedZ + 0.18, 0.77),
      cuff: bedroom.refs.cuff.getWorldPosition(new THREE.Vector3()).toArray(),
      windowAt: bedroom.refs.windowGroup.getWorldPosition(new THREE.Vector3()).toArray(),
      bulbAt: bedroom.refs.bulbLight.getWorldPosition(new THREE.Vector3()).toArray(),
      ahead,
      baseFov: BASE_FOV
    });
  },
  /**
   * Coming round on the backrooms carpet where the player now stands: after
   * the fall down the hallway stairs, and after being caught. Framed off their
   * spawn, so it ends on exactly the view play starts from.
   */
  comeRound: ({ seconds } = {}) => {
    const yaw = player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const { x, z } = camera.position;
    // The crossing hangs a fixture just in front of where it puts you down.
    const lampY = (backrooms.refs.ceilingHeight ?? 2.35) - 0.1;
    return comeRound({
      spawn: { x, z, yaw },
      eyeHeight: player.eyeHeight,
      lampAt: [x + fx * 0.4, lampY, z + fz * 0.4],
      baseFov: BASE_FOV,
      seconds
    });
  },
  /** The stairs scare's shot of it behind the player. Stands it there, too. */
  stairsBehind: ({ standing }) => {
    const def = stairsBehind({
      standing,
      stairsYaw: upstairsHallway.refs.stairsYaw,
      wallX: upstairsHallway.refs.wallX
    });
    // No stalking breath: the growl is what the player hears.
    showCreatureAt({ ...def.monster, linger: null, stalkAudio: false });
    return def;
  }
};

/**
 * The height of whatever is highest under (x, z) in `root` -- a duvet, a
 * mattress -- for laying something on it. `fallback` if nothing is there.
 */
const _surfaceRay = new THREE.Raycaster();
function surfaceHeightAt(root, x, z, fallback) {
  _surfaceRay.set(new THREE.Vector3(x, 2.5, z), new THREE.Vector3(0, -1, 0));
  _surfaceRay.far = 2.5;
  const hit = _surfaceRay.intersectObject(root, true).find((h) => {
    if (!h.object.isMesh || h.object.material?.transparent) return false;
    for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
    return true;
  });
  return hit ? hit.point.y : fallback;
}

/**
 * What every scene acts with, handed to its cues and its onFrame -- so a scene
 * file never imports main.js, and everything it can touch is listed here.
 */
const cutsceneContext = {
  creature,
  playerBody,
  sfx,
  audio,
  captions,
  line,
  postFX,
  /** A lightning strike in the bedroom window on the next frame. */
  flashLightning: () => bedroomStorm.flashNow(),
  /** The bedroom's locked cuff, for a scene that tugs on it. */
  get cuff() { return bedroom.refs.cuff; },
  /** The breathing loop's level, 0..1 (ramped by the engine). */
  setBreathing: (level) => audio.setBreathing(level),
  /** The level the room being played normally breathes at, to settle back to. */
  restingBreath: () => (sceneManager.activeKey === 'bedroom' ? LEVEL_ONE_BREATHING_BASE : BREATH_BASE_LEVEL),
  /** A light that is always in the scene and off: a scene positions and lights it, and turns it off in onEnd. */
  keyLight: cinematicLight,
  /** Lifts the black a transition or a catch left up, from inside a scene that opens on closed eyes. */
  clearFade: () => fade.clear(),
  /** Puts the player's body in the shot (or takes it out); the views that show it anyway keep it. */
  showPlayerBody(on) {
    cutsceneBodyShown = !!on;
    applyViewVisibility();
  }
};

/** Hold Space to skip, for the scenes that allow it -- see core/CutsceneSkip.js. */
const cutsceneSkip = createCutsceneSkip({ cutscene, isInputLive: () => player.isLocked });

/**
 * Plays a scene from SCENES. Resolves as cutscene.playScene() does: true if it
 * played out.
 *
 * @param {string} name - a key of SCENES.
 * @param {object} [params] - handed to the scene's builder, for a scene framed
 *   off something only its caller knows (the stairs scare's standing spot).
 */
function playCutscene(name, params) {
  const build = SCENES[name];
  if (!build) {
    console.warn(`[cutscene] no scene called "${name}"`);
    return Promise.resolve(false);
  }
  const done = cutscene.playScene(build(params), cutsceneContext);
  // The scene has taken the view: the body goes until the scene asks for it.
  applyViewVisibility();
  return done;
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

  poseThirdCam();
}

/** Over the shoulder, from wherever the player's eye is and looks now. */
function poseThirdCam() {
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
  // Not once an ending is under way. The ending's shot is filmed through the
  // cutscene camera now, so the player's own camera -- what she hunts -- stays
  // standing on the porch instead of flying off over the trees, and she would
  // otherwise keep breathing down their neck under the bulletin.
  onBreathing: (level) => {
    if (endingInFlight || gameState.endingChosen) return;
    audio.setBreathing(level);
  },
  onCaught: () => {
    // Guards against the vanishingly small window where a level transition is
    // already mid-flight (e.g. the player solved the last lock in the same
    // frame) -- CreatureAI's own CATCH_COOLDOWN already stops this firing
    // twice in a row on its own. And never during an ending or a cutscene: the
    // player is frozen where they stood, and a catch would cut into the shot.
    if (caughtInFlight || transitionInFlight || endingInFlight || gameState.endingChosen || cutscene.isRunning) return;
    caughtInFlight = true;
    // Silent unless the director's STING.onStudyCatch is flipped: she is hauling
    // you back, not killing you, and a death sting here undercuts the ending.
    audioDirector.caught({ where: 'study' });
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

const bedroom = createDeferredLevel(() => createBedroomLevel({
  showCaption,
  onThought: thought,
  // Every item puzzle in the room asks the hand, not just the inventory.
  isHolding: (id) => heldItems.isHolding(id),
  isCarrying: (id) => gameState.inventory.has(id),
  onPhotoPinned: (id) => consumeItem(id),
  // Picked up first, into the hand; the cuff only takes it on a second press.
  onPaperclipPicked: () => { pickUpItem('paperclip'); thought('l1_03'); },

  // The paperclip's own 900ms delay before onFreed IS the time the player
  // spends picking the lock, so the loop plays for exactly as long as the
  // story already says it takes -- no separate duration to keep in sync.
  //
  // The paperclip is IN the hand while this plays (onFreed uses it up after).
  // It is held in grip-cylinder (see HELD_ITEM_FRAMING in core/HeldItems.js),
  // the very shape the loop is built on, so the loop's few degrees of wrist
  // work the clip in the cuff rather than swinging it off across the screen.
  onPaperclipUsed: () => {
    hands.play('right', 'lockpick', { fade: 0.2 });
    sfx('lockpick');
  },
  onFreed: () => {
    thought('l1_04');
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
    // The cuff opens and its chain drops off the bed frame.
    sfx('chain_drop');
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
        creak();
        audio.footsteps({ count: 1, pan: 0.55, level: 0.28 });
        // Arms the one glimpse at the window -- see the note above
        // bedroomStorm. Left until now rather than the moment the bulb goes,
        // so it lands as its own jolt instead of piling onto that beat.
        windowFlashArmed = true;
      });
    });
  },
  onFlashlightPicked: () => {
    thought('l1_06');
    flashlightFound = true;
    // Into the left hand, which leaves the right one alone.
    pickUpItem('flashlight');
    setFlashlight(true);
    // The storm goes back to a normal rhythm: the player can see for themselves
    // now, so the lightning stops being the only way to navigate.
    bedroomStorm.calm();
    captions.play(line('dialog_flashlight_on'));
    runBedroomHorrorEvent('flashlight-sound', (s) => {
      s.do(() => {
        bedroom.refs.disturbChair();
        sfx('chair_scrape', { gainDb: -6 });
        audio.footsteps({ count: 1, pan: -0.45, level: 0.24 });
      });
    });
  },
  onBrassKeyFound: () => {
    // The physical drawer key keeps the existing inventory grant; the pickup
    // gesture makes that transfer visible without introducing a held key mesh.
    hands.play('right', 'pickup', { fade: 0.15 });
    sfx('keys_pickup');
    pickUpItem('brassKey');
  },
  // Used up, not dropped: the key stays in the lockbox, the crowbar comes out
  // of it (and goes into the hand), the planks keep the crowbar, the door keeps
  // its key.
  onBrassKeyUsed: () => consumeItem('brassKey'),
  // Fired as the lockbox lid passes 70% -- a couple of seconds after the box
  // was opened. Not if the planks have been pried in the meantime (G's skip
  // can do that): that crowbar is already spent, and a second would sit in the
  // hotbar for the rest of the run.
  onCrowbarFound: () => {
    if (!bedroom.refs.puzzleState.planksRemoved) thought('l1_16');
    if (!bedroom.refs.puzzleState.planksRemoved) pickUpItem('crowbar');
  },
  onCrowbarUsed: () => consumeItem('crowbar'),
  onBedroomKeyFound: () => {
    thought('l1_18');
    sfx('keys_pickup');
    pickUpItem('bedroomKey');
  },
  onBedroomKeyUsed: () => {
    sfx('deadbolt_open');
    consumeItem('bedroomKey');
  },
  onPhotoCollected: (count, id) => {
    thought('l1_09');
    sfx('paper');
    // Into the inventory, to be pinned to the corkboard by hand.
    pickUpItem(id);
    if (count !== 2) return;
    runBedroomHorrorEvent('two-photos', (s) => {
      s.do(() => {
        bedroom.refs.disturbBin();
        creak();
      });
    });
  },
  onPhotoPuzzleSolved: () => {
    thought('l1_15');
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
    thought('l1_13');
    sfx('drawer_open');
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
      // Just after the lid lands, not in the middle of its creak -- the lid
      // takes as long as its recording now (see LOCKBOX_OPEN_DURATION_SECONDS).
      if (!await s.wait(bedroom.refs.lockboxOpenSeconds + 0.15)) return;
      // The recorded rattle is the whole beat; the two creaks are its stand-in.
      let rattled = false;
      s.do(() => {
        bedroom.refs.rattleDoor();
        rattled = !!sfx('door_locked_rattle');
        if (!rattled) creak();
      });
      if (!await s.wait(0.22)) return;
      s.do(() => { if (!rattled) creak(); });
    });
  },
  onFloorboardOpened: () => {
    sfx('creak');
    runBedroomHorrorEvent('key-footsteps-retreat', async (s) => {
      if (!await s.wait(0.18)) return;
      s.do(() => {
        bedroom.refs.playDoorPass();
        audio.footsteps({ count: 4, spacing: 0.32, pan: 0.55, panTo: -0.85, level: 0.42 });
      });
    });
  },
  onDoorPlankRemoved: () => {
    thought('l1_19');
    sfx('planks_pry');
    runBedroomHorrorEvent('plank-breathing-retreat', async (s) => {
      s.do(() => {
        bedroom.refs.rattleDoor();
        sfx('door_locked_rattle', { gainDb: -4 });
        audio.setBreathing(LEVEL_ONE_DOOR_BREATHING);
      });
      if (!await s.wait(0.8)) return;
      s.do(() => audio.footsteps({ count: 4, spacing: 0.36, pan: 0.3, panTo: -0.9, level: 0.45 }));
      if (!await s.wait(1.8)) return;
      s.do(() => audio.setBreathing(LEVEL_ONE_BREATHING_BASE));
    });
  },
  onReadDrawerClue: () => {
    thought('l1_11');
    player.unlock();
    documentUI.open({
      title: 'PROJECT HOLLOW — Drawer Note',
      body: 'HOLLOW archive reference: 06-1987. Do not move the family records from the house. The brass key remains with the sealed evidence.',
      variant: 'note'
    });
  },
  onReadSafeTag: () => {
    thought('l1_14');
    player.unlock();
    documentUI.open({
      title: 'PROJECT HOLLOW — Evidence Tag',
      body: 'Recovered item: pry bar. Location: upstairs bedroom. Status: retain on site. The original bedroom key is concealed below the loose floorboard.',
      variant: 'note'
    });
  },
  // No load: the door opens onto the hallway, which is built on the other
  // side of it, and the player walks through -- see openToHallway().
  onDoorOpened: () => {
    bedroomHorrorScript.cancel();
    openToHallway();
  },
  // The hallway is there from the first moment of the swing -- not the black
  // card the doorway used to show until the fade.
  onDoorOpening: (position) => {
    audioDirector.door(position);
    openToHallway();
  },
  onLockboxOpening: (position) => audioDirector.lockbox(position),

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
    thought('l1_07');
    script.run(async (s) => {
      if (!await s.play(line('dialog_scratches'))) return;
      if (!await s.wait(0.8)) return;
      s.do(() => {
        // Sound and picture start together. The steps sweep left to right past
        // the door, and the strip of light under it is broken as they pass.
        audio.footsteps({ count: 7, spacing: 0.62, pan: -0.8, panTo: 0.8, level: 0.55 });
        bedroom.refs.playDoorPass();
        // It is right outside.
        thought('l1_10'); // Nothing in the game has been this close yet.
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
  },
  onSfx: (name) => sfx(name)
}), (level) => {
  itemMeshes.setTemplate('paperclip', level.refs.paperclip);
  for (const { id, url, card } of level.refs.photoItems) {
    itemMeshes.setTemplate(id, card);
    const icon = itemIconTemplates.get(id)?.querySelector('.hotbar-photo');
    if (icon) icon.src = url;
  }
  initializeBedroomPresentation();
});
sceneManager.register('bedroom', bedroom);

// ---------- the upstairs hallway (between Level 1 and Level 2) ----------
// The bedroom door opens onto it, and its stairs lead down to the basement --
// see TRANSITIONS. Its framed pieces open full size in the document reader, so
// they read whether captions are on or off.
const upstairsHallway = createDeferredLevel(() => createUpstairsHallwayLevel({
  showCaption,
  // Built onto the bedroom's door: the two are one space, walked between.
  origin: bedroom.refs.doorway,
  onInspect: async ({ title, body, art }) => {
    const image = art ? await art.toImageUrl() : null;
    player.unlock();
    documentUI.open({ title, body, image, variant: 'exhibit' });
  },
  // Walked down the stairs and into the passage at their foot.
  onExit: () => exitLevel('upstairsHallway'),
  // The flash, then the thunder a moment later -- it is a few miles off.
  onLightning: () => setTimeout(() => thunder(), 350 + Math.random() * 900),
  onSfx: (name, opts) => sfx(name, opts),
  // Read at call time: the scare is built further down, once the jump scare is.
  onReachStairs: () => {
    thought('hallway_04');
    playStairsScare();
  }
}));
sceneManager.register('upstairsHallway', upstairsHallway);

// ---------- contextual H-key hints ----------
const contextualHints = createContextualHints();
const HINT_LEVELS = new Set(['bedroom', 'upstairsHallway', 'hallwayBasement', 'backrooms']);
const HINT_CONTEXT_RANGE_METRES = 3.2;
const hintPosition = new THREE.Vector3();

function readHintProgress() {
  if (sceneManager.activeKey === 'bedroom') {
    return { ...bedroom.refs.puzzleState, ...bedroom.refs.hintProgress, flashlightFound };
  }
  if (sceneManager.activeKey === 'hallwayBasement') {
    return { ...hallwayBasement.refs.hintProgress, cctvReviewed: cctvSeen.has('study') };
  }
  return {};
}

function readTargetHintKey(target) {
  const key = target?.userData.hintKey;
  return typeof key === 'function' ? key() : key;
}

/** Check nearby tagged interaction targets only when H is pressed. */
function readHintContext(available) {
  if (photoBoardUI.isOpen) return ['l1_polaroids'];
  const focused = readTargetHintKey(interaction.current);
  let nearest = null;
  let distanceInMetres = HINT_CONTEXT_RANGE_METRES;
  for (const target of interaction.targets) {
    const key = readTargetHintKey(target);
    if (!available.includes(key)) continue;
    let visible = true;
    for (let parent = target; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (!visible) continue;
    const distance = target.getWorldPosition(hintPosition).distanceTo(camera.position);
    if (distance < distanceInMetres) { distanceInMetres = distance; nearest = key; }
  }
  return [focused, nearest];
}

/** H never competes with a recording, document, keypad, or cutscene. */
function showHint(event) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target?.closest?.('input, textarea, select, [contenteditable], [role="textbox"]')
    || document.activeElement?.closest?.('input, textarea, select, [contenteditable], [role="textbox"]')) return;
  if (cutscene.isRunning || tapePlaying || transitionInFlight || documentUI.isOpen || pinPadUI.isOpen) return;
  if (!player.isLocked && !photoBoardUI.isOpen) return;
  const level = sceneManager.activeKey;
  const progress = readHintProgress();
  const available = getAvailableHintKeys(level, progress);
  contextualHints.show(selectHintKey(level, progress, readHintContext(available)));
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

/**
 * How long the creature stays in view when a beat puts it somewhere -- Level 2
 * and every level after it. Asked for at three seconds: long enough to be sure
 * of what you saw, which the old 0.45 s flash never was.
 */
const CREATURE_LINGER_SECONDS = 3;

/** The appearance under way: seconds left on the FRAME clock, and what to run when it goes. */
let creatureLinger = null;
/** Its stalking aura, from the audio director -- null when refused or not asked for. */
let creatureStalkToken = null;

/**
 * Put the house creature at (x, z), facing the player unless told otherwise, for
 * `linger` seconds -- null keeps it there until hideCreature(). With
 * `stalkAudio`, its breathing plays from its body while it is there. Counted
 * down in tick() on the frame clock, so the time it is seen is exact to a frame
 * and a restart (activateLevel clears this) cannot leave a timer behind.
 *
 * The shared way in for any future level that shows it, so each one gets the
 * three seconds and the sound without being told.
 */
function showCreatureAt({ x, z, yaw = null, linger = CREATURE_LINGER_SECONDS, stalkAudio = true, onGone = null }) {
  creature.reset();
  creature.setPosition(x, z);
  creature.setYaw(yaw ?? Math.atan2(-(camera.position.x - x), -(camera.position.z - z)));
  creature.setSpeed(0);
  creature.visible = true;
  creatureStanding = true;
  audioDirector.endStalk(creatureStalkToken, 0.3);
  // Asked here as well as inside the director: the aura is for a creature that
  // is stalking, and nothing is while the backrooms hunter is running.
  creatureStalkToken = stalkAudio && backroomsHunter.state === 'stopped'
    ? audioDirector.startStalk({ follow: () => creature.position, linger })
    : null;
  creatureLinger = linger === null ? null : { remaining: linger, onGone };
}

function hideCreature() {
  creature.visible = false;
  creatureStanding = false;
  creatureLinger = null;
  audioDirector.endStalk(creatureStalkToken);
  creatureStalkToken = null;
}

/**
 * THE BEDROOM AND THE UPSTAIRS HALLWAY ARE ONE SPACE. The hallway is built onto
 * the bedroom's door (its `origin`), so when the door opens there is no fade
 * and no load: both rooms are drawn, the doorway's colliders come out of both,
 * and the player walks through. HALL_ENTER_DEPTH into the hall it becomes the
 * active level -- seamlessly, without moving them (activateLevel's
 * `seamless`) -- and a moment later the door swings shut behind them, the
 * doorway is solid again and the bedroom stops being drawn.
 *
 * The two ambients are swapped by INTENSITY, never by switching one off: a
 * light count is part of every shader's key, so turning a light off mid-game
 * recompiles every material in view -- the very stall this is meant to avoid.
 * Both lit sets are warmed with the hallway (preloadLevel1) during the opening.
 */
const HALL_ENTER_DEPTH = 0.8;
const HALL_AMBIENT = 0.31;
let doorwayJoined = false;
/** Set by G: the player is carried through the door the moment it opens. */
let skipThroughDoor = false;
/** G's carry: the blinks start once the hall is the active level, not before. */
let rushAfterSwitch = false;
const joinedColliders = [];

function openToHallway() {
  if (doorwayJoined) return;
  doorwayJoined = true;
  bedroom.refs.setDoorwayOpen(true);
  upstairsHallway.refs.setDoorwayOpen(true);
  // Lit only once it is the room you are in; see the note above.
  upstairsHallway.refs.ambient.intensity = 0;
  upstairsHallway.group.visible = true;
  joinedColliders.length = 0;
  joinedColliders.push(...bedroom.colliders, ...upstairsHallway.colliders);
  player.setColliders(joinedColliders);
  if (skipThroughDoor) {
    skipThroughDoor = false;
    const [x, z] = upstairsHallway.spawn;
    // Facing down the hall, as walking in would be.
    player.spawn(x, z, upstairsHallway.spawnYaw ?? 0);
    // Carried straight into the hall, which activates it next frame -- and an
    // activation clears any creature on screen, so the rush waits for that.
    rushAfterSwitch = true;
  } else {
    // The door is opening onto the hall, and the lights are about to go.
    startHallwayBlinks();
  }
}

/** Once a frame: the hall becomes the active level when the player is in it. */
function updateDoorwayJoin(dt) {
  if (!doorwayJoined || sceneManager.activeKey !== 'bedroom') return;
  // Seen through the open door, the hall is alive -- its pendant, its rain,
  // and the lights the blinks put out -- though the bedroom is the active level.
  upstairsHallway.update(dt, camera.position);
  if (camera.position.z < upstairsHallway.refs.doorway.z + HALL_ENTER_DEPTH) return;
  bedroom.refs.ambient.intensity = 0;
  upstairsHallway.refs.ambient.intensity = HALL_AMBIENT;
  activateLevel('upstairsHallway', { seamless: true });
  // Both rooms stay solid until the door shuts behind them.
  player.setColliders(joinedColliders);
  if (rushAfterSwitch) {
    rushAfterSwitch = false;
    // Carried in, already facing down the hall: the same scene, from there.
    startHallwayBlinks();
  }
}

/** The door swings shut behind the player: the doorway is a wall again. */
function closeDoorwayBehind() {
  if (!doorwayJoined) return;
  doorwayJoined = false;
  bedroom.refs.shutDoor();
  bedroom.refs.setDoorwayOpen(false);
  upstairsHallway.refs.setDoorwayOpen(false);
  player.setColliders(upstairsHallway.colliders);
  // Anyone still standing in the doorway is on the hall side of it.
  const d = upstairsHallway.refs.doorway;
  if (camera.position.z < d.z + 0.45) player.teleport(camera.position.x, d.z + 0.5);
}

/** The bedroom stops being drawn once its door has shut. */
function hideBedroomBehind() {
  if (sceneManager.activeKey !== 'upstairsHallway') return;
  bedroom.group.visible = false;
}

/** Restart: the two rooms back to two rooms with a closed door between them. */
function resetDoorwayJoin() {
  doorwayJoined = false;
  skipThroughDoor = false;
  rushAfterSwitch = false;
  hallwayBlinksDone = false;
  bedroom.refs.setDoorwayOpen(false);
  upstairsHallway.refs.setDoorwayOpen(false);
  upstairsHallway.refs.ambient.intensity = HALL_AMBIENT;
  // The bedroom's own ambient is put back to lit by resetGame() itself.
}

/**
 * THE LIGHTS GO, AND IT COMES DOWN THE HALL. As the bedroom door opens, the
 * hall is lit and empty; then the lights go, and each time they come back it
 * is standing closer -- the far end, a fifth of the way, half way -- until
 * the last time, when the hall is empty. Only then does the singing start,
 * faint, from down the stairs (AudioDirector's startSinging). Once per run.
 * See core/HallwayBlinks.js, which runs it through the player's own eyes.
 */
let hallwayBlinksDone = false;

/**
 * THE HOUSE GOES DARK, for the rush: every light in the bedroom and the hall
 * -- the lamp blinking its code, the candles, the pendant, the glow up the
 * stairs, the lightning in both windows -- and every lit bulb, flame and pane
 * with them. Only the torch in your hand is left (it hangs off the camera, not
 * off either room), so what comes down the hall is whatever the beam finds.
 *
 * Held, not switched. Half these lights are driven every frame by their own
 * level or by the storm, so applyHouseBlackout() puts them back to nothing
 * after all of that, just before the draw; the rest are set once by an event,
 * so the snapshot taken here is what puts them back (a blown bulb stays
 * blown). Intensity only, never `visible`: a light count is part of every
 * shader's key, and the doorway note above says what changing one costs.
 *
 * The two ambients are main.js's own -- the doorway swaps them as the player
 * crosses, and the player is free to cross in the last of the dark -- so they
 * come back by whichever room is active, not from the snapshot.
 */
let houseBlackout = null;

function setHouseLightsOut(out) {
  upstairsHallway.refs.setLightsOut(out);
  if (out && !houseBlackout) {
    const ambients = [bedroom.refs.ambient, upstairsHallway.refs.ambient];
    const lights = new Map();
    const glows = new Map();
    const flashes = new Set();
    for (const room of [bedroom.group, upstairsHallway.group]) {
      room.traverse((o) => {
        if (o.isLight && !ambients.includes(o)) lights.set(o, o.intensity);
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m?.emissive && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) glows.set(m, m.emissiveIntensity);
          if (m?.uniforms?.uFlash) flashes.add(m.uniforms.uFlash);
        }
      });
    }
    houseBlackout = { lights, glows, flashes, ambients, bedroomAmbient: bedroom.refs.ambient.intensity };
  } else if (!out && houseBlackout) {
    for (const [light, v] of houseBlackout.lights) light.intensity = v;
    for (const [material, v] of houseBlackout.glows) material.emissiveIntensity = v;
    const inHall = sceneManager.activeKey === 'upstairsHallway';
    bedroom.refs.ambient.intensity = inHall ? 0 : houseBlackout.bedroomAmbient;
    upstairsHallway.refs.ambient.intensity = inHall ? HALL_AMBIENT : 0;
    houseBlackout = null;
  }
}

/** Once a frame, after everything else has set its lights: hold the house dark. */
function applyHouseBlackout() {
  if (!houseBlackout) return;
  for (const light of houseBlackout.lights.keys()) light.intensity = 0;
  for (const light of houseBlackout.ambients) light.intensity = 0;
  for (const material of houseBlackout.glows.keys()) material.emissiveIntensity = 0;
  for (const uniform of houseBlackout.flashes) uniform.value = 0;
}

/**
 * Its own script runner, as the stairs scare has: a new script.run() cancels
 * the one before, and nothing else starting a beat should cut this one off
 * half way with the camera taken.
 */
const hallwayBlinksScript = createScriptRunner({ captions });

function startHallwayBlinks() {
  if (hallwayBlinks.isRunning || hallwayBlinksDone) return;
  thought('hallway_01');
  thought('hallway_02');
  hallwayBlinksDone = true;
  hallwayBlinksScript.run(async (s) => {
    const finished = await hallwayBlinks.run({ isAlive: s.alive });
    if (!finished || !s.alive()) return;
    // The light is back, the hall is empty -- and someone is singing below.
    thought('hallway_03');
    audioDirector.startSinging();
  });
}

/**
 * Camera five comes up on the CCTV desk: the figure on the screen, and the
 * creature standing in the lab's corner behind the player.
 */
function playCameraFiveSighting() {
  const finishTurnCue = () => {
    if (labCreatureExit?.phase === 'stare') {
      labCreatureExit.cueFinished = true;
      labCreatureExit.t = 0;
      labCreatureExit.seenAt = null;
    }
    thought('l2_11');
  };
  thought('l2_09', { priority: true });
  thought('l2_10', { priority: true });
  thought('l2_25', { priority: true, delay: 0.55,
    onEnded: finishTurnCue, onFailed: finishTurnCue });
  // Camera five is this room. There is a figure standing in it -- the
  // creature itself, followed on the feed by updateLabCreatureExit().
  script.run(async (s) => {
    /**
     * And it is behind you -- the instant camera five comes up, not after
     * a beat: the figure on the screen and the thing in the corner are
     * there together.
     *
     * The storyline: "Turning around you see the creature standing in the
     * corner, staring at you, but not moving. Then it disappears back up
     * the stairs, leaving a black pool where it was standing."
     *
     * It is placed, not spawned into the AI -- it must NOT wander, flee or
     * block anything here. It stands for a few seconds, then runs out
     * through the doors the player came in by -- see updateLabCreatureExit().
     * The AI takes over in Level 3, where the player has room to be chased.
     */
    s.do(() => {
      // Where it stands -- the level owns the spot, so it moves with the
      // lab if the room is ever resized again.
      const CORNER = hallwayBasement.refs.creatureCorner;
      showCreatureAt({ x: CORNER[0], z: CORNER[1], linger: null });
      labCreatureExit = { phase: 'stare', t: 0, seenAt: null, leg: 0, doorsBurst: false, cueFinished: false };
      audio.setBreathing(LEVEL_TWO_BREATHING.cctvBasement);
      creak();
    });
    if (!await s.play(line('dialog_cctv_basement').slice(0, 1))) return;
    while (labCreatureExit?.phase === 'stare') if (!await s.wait(0.1)) return;
    // "Then it turns and goes, back the way you came."
    if (!await s.play(line('dialog_creature_corner').slice(-1))) return;
    while (labCreatureExit) if (!await s.wait(0.1)) return;
    // Back off: it has gone, and the room is only as bad as it was.
    s.do(() => audio.setBreathing(LEVEL_TWO_BREATHING.settled));
    if (!await s.wait(0.6)) return;
    await s.play(line('dialog_black_pool'));
  });
}

/**
 * Level 2, camera five: the creature in the lab's corner stands only a few
 * seconds, then runs out through the doors the player came in by, leaving its
 * black pool where it stood. The user asked for it to be quick -- it used to
 * stand there through two whole caption sequences.
 *
 * The stare is LAB_CREATURE_STARE_AFTER_SEEN once the player has turned to it,
 * but never less than _MIN nor more than _MAX, so a player who never turns
 * round still hears it go.
 */
const LAB_CREATURE_STARE_MIN = 2.5;
const LAB_CREATURE_STARE_MAX = 5;
const LAB_CREATURE_STARE_AFTER_SEEN = 1.5;
/** Within this angle of the view's centre, it counts as looked at. */
const LAB_CREATURE_SEEN_RADIANS = THREE.MathUtils.degToRad(35);
const LAB_CREATURE_RUN_SPEED = 5;
/** How fast it turns from the player to the way out, in radians a second. */
const LAB_CREATURE_TURN_RATE = 9;
/** This close to the doors, it throws them open. */
const LAB_CREATURE_DOOR_REACH = 1.4;
/** And they are held open this long, then left to swing back. */
const LAB_CREATURE_DOOR_HOLD = 1.1;
/** null, or { phase: 'stare' | 'run', t, seenAt, leg, doorsBurst }. */
let labCreatureExit = null;
const _labCreatureView = new THREE.Vector3();

/** Once it has gone, camera five holds the empty room this long, then breaks up into static. */
const LAB_CREATURE_FEED_STATIC_AFTER = 0.8;

function updateLabCreatureExit(dt) {
  const exit = labCreatureExit;
  if (!exit) return;
  if (sceneManager.activeKey !== 'hallwayBasement') {
    labCreatureExit = null;
    hideCreature();
    return;
  }
  exit.t += dt;
  const p = creature.position;
  // Camera five shows it where it is, standing or running, and only while it
  // is in the room.
  hallwayBasement.refs.setCameraFiveFigure(p, { running: exit.phase === 'run' });
  if (exit.phase === 'stare') {
    // Keep the real creature available until the spoken turn-around cue ends.
    if (!exit.cueFinished) return;
    if (exit.seenAt === null) {
      camera.getWorldDirection(_labCreatureView);
      const toX = p.x - camera.position.x;
      const toZ = p.z - camera.position.z;
      const cos = (_labCreatureView.x * toX + _labCreatureView.z * toZ)
        / (Math.hypot(_labCreatureView.x, _labCreatureView.z) * Math.hypot(toX, toZ) || 1);
      if (cos > Math.cos(LAB_CREATURE_SEEN_RADIANS)) {
        exit.seenAt = exit.t;
        thought('l2_17');
      }
    }
    const due = exit.seenAt === null
      ? LAB_CREATURE_STARE_MAX
      : Math.min(LAB_CREATURE_STARE_MAX, Math.max(LAB_CREATURE_STARE_MIN, exit.seenAt + LAB_CREATURE_STARE_AFTER_SEEN));
    if (exit.t < due) return;
    exit.phase = 'run';
    // It was standing in it.
    hallwayBasement.refs.revealPool();
    audio.footsteps({ count: 9, spacing: 0.24, pan: 0, level: 0.6 });
  }

  const route = hallwayBasement.refs.creatureExitRoute;
  const [tx, tz] = route[exit.leg];
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  const step = LAB_CREATURE_RUN_SPEED * dt;
  if (d <= step) {
    creature.setPosition(tx, tz);
    exit.leg += 1;
    if (exit.leg >= route.length) {
      labCreatureExit = null;
      hideCreature();
      hallwayBasement.refs.setCameraFiveFigure(null);
      hallwayBasement.refs.feeds.loseBasementSignal(LAB_CREATURE_FEED_STATIC_AFTER);
    }
    return;
  }
  creature.setPosition(p.x + (dx / d) * step, p.z + (dz / d) * step);
  const yaw = creature.yaw;
  const turn = Math.atan2(Math.sin(Math.atan2(-dx, -dz) - yaw), Math.cos(Math.atan2(-dx, -dz) - yaw));
  creature.setYaw(yaw + Math.sign(turn) * Math.min(Math.abs(turn), LAB_CREATURE_TURN_RATE * dt));
  creature.setSpeed(LAB_CREATURE_RUN_SPEED);

  const [doorX, doorZ] = hallwayBasement.refs.labDoorway;
  if (!exit.doorsBurst && Math.hypot(doorX - p.x, doorZ - p.z) < LAB_CREATURE_DOOR_REACH) {
    exit.doorsBurst = true;
    hallwayBasement.refs.burstLabDoors(LAB_CREATURE_DOOR_HOLD);
    sfx('metal_door_open', { position: { x: doorX, y: 1.1, z: doorZ }, spans: true });
  }
}

let generatorProgressStarted = false;
let breakerEngaged = false;
let breakerHintSeconds = null;
let levelTwoCriticalUntil = 0;
const generatorHintPosition = new THREE.Vector3();

const hallwayBasement = createDeferredLevel(() => createHallwayBasementLevel({
  showCaption,
  onThought: thought,
  onExit: () => exitLevel('hallwayBasement'),
  // Every press in the cleared branch calls onExit, and only the first one
  // starts a transition -- so only that one gets a door.
  // The lab's metal door, not the house's wooden creak.
  onDoorOpening: (position) => {
    if (transitionInFlight) return;
    if (!sfx('metal_door_open', { position: { x: position.x, y: 1.1, z: position.z }, spans: true })) audioDirector.door(position);
  },
  onSpark: () => spark(),
  onTrolleyRoll: (level) => audio.setTrolleyRattle(level),
  // The crash. Level 2's creature is scripted rather than hunting, so nothing
  // answers the noise yet -- this is where to hook it if something should.
  onTrolleyCrash: () => audio.trolleyCrash(),
  // The white-out, and the overload buzz that rides it.
  onGlare: (amount) => {
    setGlare(amount);
    audioDirector.glare(amount);
  },
  onSfx: (name) => sfx(name),

  // The session tape, carried in the shared inventory between the recorder and
  // the deck. The deck takes it from the inventory, whatever is in the hand.
  isCarrying: (id) => gameState.inventory.has(id),
  // The fuses go in the inventory too, and the box takes the one in the hand.
  isHolding: (id) => heldItems.isHolding(id),
  onFuseTaken: (id) => pickUpItem(id),
  onFuseSeated: (id) => consumeItem(id),
  onFuseLeft: (id) => consumeItem(id),
  onTapeTaken: () => pickUpItem('sessionTape'),
  onTapeInserted: () => consumeItem('sessionTape'),
  onTapeEjected: () => pickUpItem('sessionTape'),

  /**
   * The deck is playing the tape, in the room. Its sound -- the recording's
   * own once it exists -- is routed through the mixer, so the volume slider
   * and a pause both reach it; the voices and the subtitles follow its clock.
   */
  onPlayTape: ({ source, deck }) => {
    contextualHints.hide();
    captions.cancel();
    audio.stopVoice();
    markThoughts.setBlocked(true);
    tapeFocus.start(deck);
    void preloadBackroomsForTape();
    if (source.hasRecording) audio.connectMediaElement(source.audio);
    else audio.setTapeHiss(true);
    tapeSoundsPlayed = 0;
    tapeVoicesPlayed = 0;
    tapePlaying = true;
    tapeSubtitles.start(source);
  },
  /** STOP/EJECT pressed while it played, or the level put it back: everything it started stops. */
  onTapeStopped: () => silenceTape(),
  /** It ran to its end: the deck stops, and the player says what they make of it. */
  onTapeEnded: () => {
    silenceTape({ restoreFocus: false });
    tapeFocus.finish(() => {
      markThoughts.setBlocked(false);
      thought('l2_12', { priority: true });
      thought('l2_14', { priority: true });
      thought('l2_15', { priority: true });
      thought('l2_16', { priority: true });
      captions.play(line('dialog_tape_after'));
    });
  },

  onPowerRestored: () => {
    thought('l2_07');
    // The fuse seats, and the tubes strike as the lights ramp up.
    sfx('metal_click');
    sfx('tubes_start');
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
  // Thrown at the door, at the desk or by the clock running out (`cause`):
  // the same hand on the same lever, so the same beat.
  onBlackout: () => {
    levelTwoCriticalUntil = performance.now() + 2000;
    thought('l2_21', { onEnded: () => thought('l2_22', {
      delay: 3,
      when: () => sceneManager.activeKey === 'hallwayBasement'
        && !generatorProgressStarted && hallwayBasement.refs.powerStage === 'blackout'
    }) });
    script.run(async (s) => {
      s.do(() => {
        // A hand on the main lever, and the room running down with it.
        if (!sfx('main_lever')) creak();
        sfx('power_down');
        spark();
        // It is close. The breathing says so without showing anything.
        audio.setBreathing(LEVEL_TWO_BREATHING.blackout);
      });
      if (!await s.play(line('dialog_blackout'))) return;
      s.do(() => audio.setBreathing(LEVEL_TWO_BREATHING.settled));
    });
  },

  onGeneratorRunning: () => {
    breakerHintSeconds = breakerEngaged || hallwayBasement.refs.breakerCoverOpen ? null : 10;
    script.run(async (s) => {
      if (!await s.play(line('dialog_generator_running'))) return;
    });
  },

  onGeneratorProgress: () => { generatorProgressStarted = true; },
  onBreakerEngaged: () => {
    // Earlier panel inspections do not cancel the later generator lesson.
    if (!['blackout', 'running', 'routed'].includes(hallwayBasement.refs.powerStage)) return;
    breakerEngaged = true;
    breakerHintSeconds = null;
  },

  onOverload: () => {
    sfx('panel_trip');
    captions.play(line('dialog_breaker_overload'));
  },

  onPowerRouted: () => {
    breakerHintSeconds = null;
    thought('l2_24');
    sfx('main_lever');
    script.run(async (s) => {
      if (!await s.play(line('dialog_power_routed'))) return;
      // The tape is the lit window's story, and a player who went for the door
      // first never got it. One line, once, toward wherever it is.
      const refs = hallwayBasement.refs;
      if (refs.tapeWatched) return;
      await s.play(line(refs.tapePlace === 'recorder' ? 'dialog_tape_nudge_recorder' : 'dialog_tape_nudge_deck'));
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
    sfx('cctv_glitch');
    if (cctvSeen.has(id)) return;
    cctvSeen.add(id);

    if (id === 'hallway') {
      // Under a second, across the lit far end. Short enough to doubt.
      hallwayBasement.refs.feeds.scheduleHallwayDash(1.1);
      script.run(async (s) => {
        if (!await s.wait(1.2)) return;
        s.do(() => audio.setBreathing(LEVEL_TWO_BREATHING.cctvDash));
        await s.play(line('dialog_cctv_dash'));
      });
      return;
    }

    if (id === 'basement') playCameraFiveSighting();
  }
}), (level) => {
  level.refs.tapeModelReady.then((model) => itemMeshes.setTemplate('sessionTape', model)).catch(() => {});
  level.refs.fuseVisualsReady.then((visuals) => {
    for (const [id, visual] of Object.entries(visuals)) itemMeshes.setTemplate(id, visual);
  });
});
sceneManager.register('hallwayBasement', hallwayBasement);

/**
 * Where the free-roam creature AI stands to block the one way out of the
 * study once it takes over -- just inside the front doorway (DOOR_X=2.5,
 * frontZ=3.25 in studyLevel.js), clear of the door's own collider (which
 * spans z 3.1-3.35 while shut) so she is never spawned standing inside a wall.
 */
const STUDY_GUARD_POINT = [2.5, 2.9];

/** What each of the study's front-door locks sounds like as it gives. */
const STUDY_LOCK_SFX = { deadbolt: 'deadbolt_open', combination: 'padlock_open', containment: 'latch' };

const study = createDeferredLevel(() => createStudyLevel({
  showCaption,
  getPlayerPosition: () => camera.position,
  onDoorOpening: (position) => audioDirector.door(position),
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
  // Each of the front door's three locks, as itself.
  onLockOpened: (id) => sfx(STUDY_LOCK_SFX[id] ?? 'latch'),
  onSfx: (name) => sfx(name),
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
    sfx('cloth');
    visor.take();
    pickUpItem('visor');
    objectiveEl.textContent = 'Put the visor on. [V]';
    captions.play(line('dialog_visor_found'));
  },
  onTakeDoorKey: () => {
    sfx('keys_pickup');
    pickUpItem('doorKey');
  },

  /**
   * Mark's letter, which is where the game explains itself. It only says
   * anything with the visor on -- the writing is not hidden from the room, it
   * is hidden from the player, exactly like the fourth figure in the portrait.
   */
  onReadLetter: ({ body, onFinished } = {}) => {
    if (body) {
      player.unlock();
      documentUI.open({
        title: "Annabelle's letter",
        variant: 'letter',
        body,
        onClosed: () => {
          onFinished?.();
          objectiveEl.textContent = 'Look into the mirror.';
        }
      });
      return;
    }
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
    sfx('keys_pickup');
    pickUpItem('gateKey');
    captions.play(line('dialog_pickup_gate_key'));
  },

  // The study owns the once-only/letter gate; the shared runner owns input
  // and the shot camera, leaving the player's actual position untouched.
  onLookInMirror: () => {
    if (cutscene.isRunning || !study.refs.puzzle.mirrorUnlocked) return Promise.resolve(false);
    const wasVisorWorn = gameState.visorWorn;
    const playerPosition = camera.position.clone();
    const [annabelleX, annabelleZ] = study.refs.annabelleSpot;
    const annabelleTarget = [annabelleX, 0.7, annabelleZ];
    const externalCamera = [Math.min(7.1, playerPosition.x + 1.2), 1.65, playerPosition.z + 1.9];
    const playerTarget = [playerPosition.x, 1.05, playerPosition.z];
    setThirdPerson(false);
    player.clearKeys();
    return cutscene.playScene({
      name: 'studyMirrorReveal',
      letterbox: true,
      skippable: false,
      shots: [
        { at: 'player', lookAt: [4.8, 1.45, -6.4], fov: 48, seconds: 0.8 },
        { cut: true, at: externalCamera, lookAt: playerTarget, fov: [52, 43], seconds: 9.5, shake: 0.06 },
        { cut: true, at: [annabelleX + 2.4, 1.35, annabelleZ + 1.3], lookAt: annabelleTarget, fov: [48, 42], seconds: 3 },
        { cut: true, at: 'player', lookAt: annabelleTarget, fov: camera.fov, seconds: 1 }
      ],
      cues: [
        { t: 0, run: () => { captions.cancel(); fade.fadeOut(180); } },
        { t: 0.2, run: () => { visor.set(true); fade.fadeIn(400); } },
        { t: 0.85, run: () => captions.say({ text: 'Subject 06.', duration: 1.8 }) },
        { t: 3, run: () => captions.say({ text: 'Mark.', duration: 1.7 }) },
        { t: 5.2, run: () => captions.say({ text: 'You were never running from it.', duration: 2.1 }) },
        { t: 7.8, run: () => captions.say({ text: 'You were containing it.', duration: 2 }) },
        { t: 10.3, run: () => { study.refs.revealAnnabelle(); sfx('cloth'); } },
        { t: 10.5, run: () => captions.say({ text: 'Annabelle.', duration: 2 }) },
        { t: 13, run: () => fade.fadeOut(250) },
        { t: 13.4, run: () => fade.fadeIn(500) }
      ],
      onFrame: (_ctx, t) => {
        cutsceneContext.showPlayerBody(t >= 0.8 && t < 10.3);
        // The same rig as the corridor creature is Mark's own body. Its
        // existing correction morph supplies the altered-subject reveal.
        if (t >= 0.8 && t < 10.3) {
          playerBody.setCorrection(0);
          playerBody.setYaw(player.yaw);
          playerBody.setSpeed(0);
          playerBody.update(0);
        }
      },
      onEnd: (_ctx, completed) => {
        playerBody.setCorrection(1);
        cutsceneContext.showPlayerBody(false);
        visor.set(wasVisorWorn);
        player.clearKeys();
        fade.clear();
        captions.cancel();
        if (completed) objectiveEl.textContent = 'Take the HOLLOW OVERRIDE KEY beside Annabelle.';
      }
    });
  }
}), (level) => {
  itemMeshes.setTemplate('doorKey', level.refs.doorKey);
  itemMeshes.setTemplate('gateKey', level.refs.gateKey);
  itemMeshes.setTemplate('visor', level.refs.visorGroup);
});
sceneManager.register('study', study);

// Not a "level 4": ONE interstitial instance, re-armed per crossing by
// setRoute(). It hands its route back through onExit rather than reading a
// module-level global, so there is exactly one way to arm it and no way to
// activate it unarmed.
const backrooms = createDeferredLevel(() => createBackroomsLevel({
  showCaption,
  onThought: thought,
  onExit: (route) => transitionTo(route?.to ?? 'hallwayBasement'),
  onDoorOpening: (position) => audioDirector.door(position),
  onSfx: (name, opts) => sfx(name, opts)
}));
/**
 * The backrooms ceiling (backroomsLevel's HALL_H). A constant here, not read
 * off backrooms.refs: the level is built on demand, and nothing is in its refs
 * until then.
 */
const BACKROOMS_CEILING = 2.35;
// The backrooms figure stoops under the tiles rather than putting its head through them.
okabe.setCeiling(BACKROOMS_CEILING);
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
/**
 * Annabelle's rooms are SAFE (user, 2026-10-23): the hunter cannot go into them
 * or their doorways, and walking into one makes it roar. The four dressed
 * rooms, by their maze legs, and the necks that lead into them. The central
 * room, which is not hers, is not safe.
 */
const SAFE_ROOM_LEGS = Object.keys(ROOM_FLOORS);
const SAFE_LEGS = [
  ...SAFE_ROOM_LEGS,
  ...DOORWAYS.filter((d) => SAFE_ROOM_LEGS.includes(`room_${d.room}`)).map((d) => d.neck)
];

/**
 * Where the hunter starts: at least drawMonsterStart's distance from the
 * player ON FOOT, never in a safe room. The order a crossing is drawn in is
 * the player, then the way out, then it.
 */
/** Inside the safe rooms, and the tunnels through the wall into them. */
const SAFE_RECTS = roomInteriors(SAFE_ROOM_LEGS.map((n) => n.replace('room_', '')));
/** Inside one of the safe rooms or the doorway into it. */
function inSafeRoom(x, z) {
  return SAFE_RECTS.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
}

function startBackroomsHunter() {
  const at = drawMonsterStart(
    { x: camera.position.x, z: camera.position.z },
    { avoid: SAFE_LEGS }
  );
  backroomsHunter.start(at ? { at } : {});
}

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
    sprinting: player.sprint > 0.5,
    // Footsteps it can hear close by: walking, not crouched (see HEAR_WALK).
    walking: player.moving > 0.5 && player.crouch < 0.5
  }),
  colliders: backrooms.colliders,
  // Annabelle's rooms are partitioned; it must only ever aim for the open half.
  roomFloors: ROOM_FLOORS,
  safeLegs: SAFE_LEGS,
  safeArea: SAFE_RECTS,
  // In you went, and it cannot follow. Once as you go in; again, if it came,
  // when it reaches the door -- unless the first is still ringing.
  onEnraged: ({ x, z, atDoor }) => {
    if (atDoor && performance.now() - lastRoarAt < ROAR_AGAIN_AFTER_MS) return;
    lastRoarAt = performance.now();
    audioDirector.roar({ x, z });
  },
  safeFloors: ROOM_FLOORS,
  onBreathing: (level) => audio.setBreathing(level),
  onCaught: (context) => onHunterCaught(context)
});

/** The second roar, at the door, waits at least this long after the first. */
const ROAR_AGAIN_AFTER_MS = 4000;
let lastRoarAt = -Infinity;

/** Which level this crossing started from, or null when not crossing. */
let backroomsFrom = null;

/**
 * Who plays what, when -- the doors, the candles, the static, the bed, the
 * laughter and every sound the monster makes. See systems/AudioDirector.js;
 * main.js only tells it the things only main.js knows.
 */
const audioDirector = createAudioDirector({
  audio,
  THREE,
  // The player's own head -- never the third-person camera. The free camera
  // takes the ears with it, which is what a clip recorded from it wants, and so
  // does a cutscene's lens: sound follows the shot, as it does in a film.
  getListener: () => {
    if (freeCamera.isActive) return freeCamera.camera;
    return cutscene.isRunning ? cutscene.camera : camera;
  },
  player,
  captions,
  getLevel: () => ({ key: sceneManager.activeKey, level: sceneManager.active }),
  isBusy: () => transitionInFlight || caughtInFlight || cutscene.isRunning,
  hunter: backroomsHunter,
  // The SECOND crossing is the one it hunts on, start delay and respawns included.
  isHuntingCrossing: () => sceneManager.activeKey === 'backrooms' && backroomsFrom === 'hallwayBasement',
  candleAnchors: bedroom.refs.candleAnchors,
  basementRefs: hallwayBasement.refs,
  hallwayRefs: upstairsHallway.refs,
  backroomsRefs: backrooms.refs
});

/**
 * The player talking to themselves in the maze: wandering in, the first looks
 * at the thing in there, and the blind ends. See systems/BackroomsBarks.js.
 */
const _barkForward = new THREE.Vector3();
const backroomsBarks = createBackroomsBarks({
  // Never over a story line; an examine caption can give way.
  say: (key) => {
    if (captions.isPlaying) return false;
    captions.play(line(key));
    return true;
  },
  getPlayer: () => {
    camera.getWorldDirection(_barkForward);
    return {
      x: camera.position.x, z: camera.position.z,
      forwardX: _barkForward.x, forwardZ: _barkForward.z,
      moving: player.moving
    };
  },
  hunter: backroomsHunter,
  getFigure: () => (backroomsHunter.state !== 'stopped' ? backroomsHunter.position
    : okabe.visible ? okabe.position : null),
  colliders: backrooms.colliders,
  isBusy: () => transitionInFlight || caughtInFlight || jumpScareRunning
    || !(player.isLocked || audioDirector.forceActive)
});

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
const BACKROOMS_SHADOW_HIDE_RANGE = 10;   // closer than this (player closing the gap) and it is gone -- doubled from 5 at the user's ask
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
 * Seconds of play after it HIDES before it may come back: it haunts the first
 * crossing every 30 s, at the user's ask.
 *
 * Was 17 m walked. Time rather than distance now, so the rhythm is the same
 * whether the player is pressing on or hesitating at a junction -- the point
 * is that it keeps coming back. The clock only runs in updateBackroomsShadow(),
 * which only runs in the maze, and resetBackroomsShadow() restarts it.
 *
 * With HIDE_RANGE at 10 m against an 11 m trail it is only showable where the
 * last 11 m walked are nearly straight -- measured along the first crossing's
 * route, 28% of it in five separate stretches -- so some 30 s marks pass with
 * it out of view, and it surfaces at the next straight.
 */
const BACKROOMS_SHADOW_COOLDOWN = 30;

/** Recorded {x,z} player positions, oldest first, trimmed to stay bounded. */
let backroomsPath = [];
/** The figure's last computed position, so its speed can be read off its own movement. */
let backroomsShadowPos = null;
let backroomsShadowVisible = false;
/** Metres walked since entering, for BACKROOMS_SHADOW_GRACE. Not the trail length. */
let backroomsWalked = 0;
/** Seconds spent in the maze this crossing, for BACKROOMS_SHADOW_COOLDOWN. */
let backroomsShadowClock = 0;
/** backroomsShadowClock at the moment it last hid. */
let backroomsShadowHidAt = -Infinity;
/** The shadow's stalking aura while it is up, from the audio director. */
let backroomsShadowStalk = null;

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
  backroomsShadowClock = 0;
  // -Infinity, not 0: the cooldown must not gate the FIRST sighting as well,
  // which is what GRACE is for. At 0 the two would add up and the opening wait
  // would silently be GRACE + COOLDOWN.
  backroomsShadowHidAt = -Infinity;
  audioDirector.endStalk(backroomsShadowStalk, 0.3);
  backroomsShadowStalk = null;
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
  backroomsShadowClock += dt;
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
  // It does not follow you into Annabelle's rooms: where your trail goes in,
  // it is gone at the door.
  const shouldShow = !!found && !closeBy && !inSafeRoom(found.x, found.z)
    && backroomsWalked >= BACKROOMS_SHADOW_GRACE
    && backroomsShadowClock - backroomsShadowHidAt >= BACKROOMS_SHADOW_COOLDOWN
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
      backroomsShadowHidAt = backroomsShadowClock;
      audioDirector.endStalk(backroomsShadowStalk);
      backroomsShadowStalk = null;
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
    // It IS stalking you, on the first crossing -- so its aura comes with it,
    // from its body, a fresh stretch of breath each time it surfaces. Never on
    // the crossing the hunter hunts, where it can surface in the hunter's
    // start delay or a respawn gap: the director refuses that too.
    if (backroomsHunter.state === 'stopped' && backroomsFrom !== 'hallwayBasement') {
      backroomsShadowStalk = audioDirector.startStalk({ follow: () => okabe.position, linger: null });
    }
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

let bedroomStorm = null;
let rain = null;
function initializeBedroomPresentation() {
  bedroomStorm = new Storm({
    bulbLight: bedroom.refs.bulbLight,
    lightningLight: bedroom.refs.lightning,
    // The mesh as well as the light. Without it the glass keeps glowing.
    bulbMaterial: bedroom.refs.bulbMaterial,
    onFlash: () => {
      thunder();
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
        // For exactly the flash, not CREATURE_LINGER_SECONDS: this one is only
        // ever there while the lightning is. Its aura gets the flash plus the
        // usual second of tail.
        const shownFor = bedroomStorm?.flashDuration || 0.2;
        showCreatureAt({
          x: -2.1,
          z: wz - 0.9,
          yaw: Math.PI, // faces back through the window, into the room
          linger: shownFor,
          onGone: hideWindowReveal
        });
        creature.setCorrection(0);

        windowRevealLight.intensity = WINDOW_REVEAL_INTENSITY;
      }
    },
    onBlow: () => {
      thought('l1_05');
      bedroom.refs.pendantIntact.visible = false;
      bedroom.refs.pendantBroken.visible = true;
      audio.bulbPop();
    }
  });


  {
    const wz = bedroom.refs.windowGroup.position.z;
    windowRevealLight.position.set(-2.1, 1.9, wz - 0.15);
    windowRevealLight.target.position.set(-2.1, 1.2, wz - 0.9);
    bedroom.group.add(windowRevealLight, windowRevealLight.target);
  }

  rain = new Rain({
    count: 400,
    width: 1.6,
    height: 2.6,
    depth: 0.5,
    origin: new THREE.Vector3(-2.1, 0.4, bedroom.refs.windowGroup.position.z - 0.35)
  });
  bedroom.group.add(rain.points);
}

/** Hides the window-flash figure and tears down its dedicated light -- see the note above. */
function hideWindowReveal() {
  hideCreature();
  windowRevealLight.intensity = 0;
}
const LEVEL_OBJECTIVES = {
  bedroom: 'You wake up chained to the bed frame. Find a way free.',
  upstairsHallway: 'Find a way downstairs.',
  hallwayBasement: 'Restore power in the basement, then get through the locked door.',
  study: 'Preview: the study and front door (Level 3 blockout).',
  backrooms: 'Find the way through.'
};

/**
 * Levels where Shift does nothing. The bedroom and the upstairs hallway are
 * small and meant to be walked slowly; sprint comes back from the backrooms on.
 */
const SPRINTLESS_LEVELS = new Set(['bedroom', 'upstairsHallway']);

const LEVEL_FOG = {
  bedroom: new THREE.FogExp2(0x05070a, 0.065),
  // Thinner than the bedroom's, so the far end of the hall and the top of the
  // stairs are a shape in the dark from the bedroom door rather than nothing.
  upstairsHallway: new THREE.FogExp2(0x05070a, 0.05),
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
  // The stairs lead directly to Level 2. Only its exit enters the Backrooms,
  // using the existing crossing from the basement to the Level 3 study.
  bedroom: { to: 'upstairsHallway', via: null },
  upstairsHallway: { to: 'hallwayBasement', via: null },
  hallwayBasement: { to: 'study', via: 'backrooms' },
  study: { to: null, via: null }
};

/**
 * Beats that fire when a level is ENTERED, rather than when a prop is touched.
 * Keyed by level so activateLevel does not grow a switch statement.
 */
const ON_ENTER = {
  /** Out of the bedroom at last: the door shuts behind, and something moves below. */
  upstairsHallway: () => {
    // The backrooms are next, down the stairs: fetch their files now, while the
    // hall is walked. Asset-only -- it never borrows the scene or the camera.
    void preloadBackroomsForTape();
    script.run(async (s) => {
      // Through the door, and it swings shut behind you.
      if (!await s.wait(0.5)) return;
      s.do(() => { closeDoorwayBehind(); creak(); });
      // The bedroom goes once the door has shut, so it is not drawn for
      // nothing. The blinks have normally been and gone by now (they start as
      // the door opens -- see startHallwayBlinks); the caption waits if not.
      if (!await s.wait(0.6)) return;
      s.do(() => hideBedroomBehind());
      while (hallwayBlinks.isRunning) if (!await s.wait(0.1)) return;
      if (!await s.wait(0.8)) return;
      await s.play(line('dialog_hallway_enter'));
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
    // Wherever this crossing put them down, that dead end is the way they came in.
    const [sx, sz] = backrooms.spawn;
    backroomsBarks.ignoreNear(sx, sz);
    if (backroomsFrom !== 'hallwayBasement') return;
    script.run(async (s) => {
      if (!await s.wait(2.2)) return;
      s.do(() => startBackroomsHunter());
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
/**
 * What the player says as it gets them, and as they come round. In order the
 * first few times -- each one is a step further into not understanding what
 * is happening -- then at random. Reset by resetGame(): a new run starts the
 * order again.
 */
const pickCaughtLine = linePicker([
  'dialog_backrooms_caught_1', 'dialog_backrooms_caught_2', 'dialog_backrooms_caught_3',
  'dialog_backrooms_caught_4', 'dialog_backrooms_caught_5'
], { order: 'sequence' });
const pickRespawnLine = linePicker([
  'dialog_backrooms_respawn_1', 'dialog_backrooms_respawn_2',
  'dialog_backrooms_respawn_3', 'dialog_backrooms_respawn_4'
], { order: 'sequence' });

/** Seconds of coming round after a catch: the first, and every one after. */
const CAUGHT_COME_ROUND = 3.2;
const CAUGHT_COME_ROUND_AGAIN = 2.2;
/** Catches this run, for which of those it gets. */
let caughtTimes = 0;

let sprintCatchLessonPlayed = false;
let sprintCatchReminderIndex = 0;
let sprintCatchNextAt = 0;
let sprintCatchGeneration = 0;

function onHunterCaught({ sprintContributed = false } = {}) {
  if (caughtInFlight || transitionInFlight) return;
  const catchGeneration = ++sprintCatchGeneration;
  caughtInFlight = true;
  // First, so the sting lands on the catch and not on the caption after it --
  // and inside the guard above, so it is exactly once per catch.
  audioDirector.caught();
  script.run(async (s) => {
    const wasThirdPerson = thirdPerson;
    try {
      s.do(() => {
        player.movementEnabled = false;
        player.lookEnabled = false;
        interaction.setEnabled(false);
        // Stop it dead first: without this it keeps closing during the fade and
        // is standing on top of the spawn point when the screen comes back.
        backroomsHunter.stop();
        // The scare is seen through the player's own eyes, with nothing of
        // theirs in the way.
        if (thirdPerson) setThirdPerson(false);
        hands.setVisible(false);
        player.cinematic = true;
        jumpScareRunning = true;
      });
      // Its face, all at once -- one of the scares at random, never the same
      // one twice running. Ends on black -- see core/JumpScare.js.
      await jumpScare.run({
        creature: okabe,
        isAlive: s.alive,
        kind: 'random',
        ceiling: backrooms.refs.ceilingHeight,
        colliders: backrooms.colliders
      });
      jumpScareRunning = false;
      if (!s.alive()) return;
      // A beat of black and silence after the scream, before waking.
      if (!await s.wait(0.9)) return;
      let caughtLine = null;
      s.do(() => {
        player.cinematic = false;
        hands.setVisible(true);
        if (wasThirdPerson) setThirdPerson(true);
        const [sx, sz] = backrooms.spawn;
        player.spawn(sx, sz, backrooms.spawnYaw ?? 0);
        // Over the dark rather than waited out: after a scare the pace is
        // the point, and the respawn line takes over once the eyes open.
        caughtLine = captions.play(line(pickCaughtLine()));
      });
      // Coming round on the carpet where they went in, rather than a fade
      // back up: shorter each time, since they know where they are now.
      caughtTimes++;
      await playCutscene('comeRound', { seconds: caughtTimes > 1 ? CAUGHT_COME_ROUND_AGAIN : CAUGHT_COME_ROUND });
      if (!s.alive()) return;
      s.do(() => {
        player.lookEnabled = true;
        player.movementEnabled = true;
        interaction.setEnabled(true);
        // Re-drawn somewhere new, so a caught player is not handed the same
        // chase back -- far from them on foot, never in a safe room.
        startBackroomsHunter();
      });
      // The caught line is spoken now, and runs longer than the fade: let the
      // player finish the sentence before they come round, or the respawn
      // line's voice cuts it off half way.
      if (caughtLine) await caughtLine;
      if (!s.alive()) return;
      await s.play(line(pickRespawnLine()));
      if (!s.alive()) return;
      if (sprintContributed && performance.now() >= sprintCatchNextAt) {
        const key = sprintCatchLessonPlayed
          ? ['backrooms_09', 'backrooms_10', 'backrooms_11'][sprintCatchReminderIndex % 3]
          : 'backrooms_08';
        thought(key, { replayable: true, delay: 1,
          when: () => sceneManager.activeKey === 'backrooms' && catchGeneration === sprintCatchGeneration,
          onEnded: () => {
            if (sprintCatchLessonPlayed) sprintCatchReminderIndex++;
            sprintCatchLessonPlayed = true;
            sprintCatchNextAt = performance.now() + 45000;
          } });
      }
    } finally {
      caughtInFlight = false;
      // However it ended -- a restart mid-scream included -- the camera and
      // the hands go back to the player.
      if (jumpScareRunning || player.cinematic) {
        jumpScareRunning = false;
        player.cinematic = false;
        hands.setVisible(true);
      }
    }
  });
}

/** True while the catch's jump scare owns the backrooms figure and the camera. */
let jumpScareRunning = false;
const jumpScare = createJumpScare({ camera, fade, postFX, audio, playScream: () => audioDirector.scream() });

/**
 * Drops the player out of third person for a beat that has to be seen from
 * their own eyes, snapping rather than easing so it does not open on a swing.
 *
 * @returns {() => void} puts back whichever view the player had chosen.
 */
function forceFirstPerson() {
  const wasThirdPerson = thirdPerson;
  if (wasThirdPerson) {
    setThirdPerson(false);
    thirdAmount = 0;
  }
  return () => {
    if (wasThirdPerson) setThirdPerson(true);
  };
}

/**
 * The scare at the top of the upstairs hallway's stairs -- see
 * core/StairsScare.js. Its own script runner rather than `script`, because
 * any new script.run() cancels the one before, and nothing else starting a
 * beat should be able to cut this one off half way with the camera taken.
 */
const stairsScareScript = createScriptRunner({ captions });
/** The torch as the scares handle it: brought out, dimmed and mended without touching its switch. */
const scareTorch = {
  isAvailable: () => flashlightFound && gameState.inventory.has('flashlight'),
  // Into the hand and switched on, so there is a torch there to die.
  bringOut: () => {
    if (!flashlightFound || !gameState.inventory.has('flashlight')) return;
    setFlashlight(true);
  },
  setPower: setTorchPower,
  // It works again afterwards.
  repair: () => applyFlashlightBeam()
};
const stairsScare = createStairsScare({
  camera,
  player,
  interaction,
  hands,
  creature,
  jumpScare,
  audio,
  sfx,
  fade,
  handLight: cinematicLight,
  setHouseLightsOut,
  forceFirstPerson,
  torch: scareTorch,
  hallway: upstairsHallway.refs,
  playBehindShot: async (standing) => {
    const finished = await playCutscene('stairsBehind', { standing });
    hideCreature();
    return finished;
  },
  // The way down is next, and the maze's first frame is seconds of shader
  // compile. Paid here, on a black screen nobody is waiting on, instead of
  // after the fall (user, 2026-10-23: the backrooms took far too long to load).
  whileBlack: () => warmLevelForTransition('backrooms', { showProgress: false })
});

/** The door-1 scene -- see core/HallwayBlinks.js and startHallwayBlinks(). */
const hallwayBlinks = createHallwayBlinks({
  camera,
  player,
  interaction,
  creature,
  showCreature: ({ x, z }) => showCreatureAt({ x, z, linger: null }),
  hideCreature,
  setHouseLightsOut,
  forceFirstPerson,
  torch: scareTorch,
  sfx,
  audio,
  hallway: upstairsHallway.refs,
  getColliders: () => player.colliders
});

/** The way down from the hallway stairs into the maze -- see core/StairsFall.js. */
const stairsFall = createStairsFall({
  camera,
  player,
  hands,
  audio,
  sfx,
  fade,
  setHouseLightsOut,
  torch: scareTorch,
  forceFirstPerson
});

/** Plays the stairs scare, once, when the hallway says the player has reached the top step. */
function playStairsScare() {
  if (sceneManager.activeKey !== 'upstairsHallway') return;
  if (transitionInFlight || cutscene.isRunning || hallwayBlinks.isRunning || stairsScare.isRunning) return;
  // Before the scare starts, so whatever was being said does not carry on over it.
  script.cancel();
  captions.cancel();
  stairsScareScript.run((s) => stairsScare.run({ isAlive: s.alive }));
}

function activateLevel(key, { lockMovement = false, seamless = false } = {}) {
  startModelLoads();
  // A prior restrained bedroom view must never clamp the spawn orientation of
  // another level during SceneManager.activate()'s player.spawn() call.
  player.setLookBounds(null);
  const level = sceneManager.activate(key, player, { seamless });
  // Was a TypeError on an unregistered key -- a routing typo should cost a
  // wrong room, never a crash mid-transition.
  if (!level) return null;
  if (key !== 'upstairsHallway') markThoughts.clear();
  // Anything the player left on the floor of another level comes with them --
  // see returnDroppedItems() for why a drop must never be able to softlock.
  returnDroppedItems(key);
  setGlare(0); // the basement's overload wash must not follow the player into another level
  audio.setTrolleyRattle(0); // nor a trolley still rolling as they left
  // Level 2 walks on metal; everywhere else on the default recording.
  audio.setFootstepSurface(key);
  // Stops the room being left's candles, static, laughter and monster cues --
  // but not a door or the sting, which are meant to play across the fade.
  audioDirector.onLevelActivated(key);
  // An appearance in progress does not follow the player out. creatureAI.reset()
  // below hides the body; the director has already cut its aura.
  creatureLinger = null;
  creatureStalkToken = null;
  labCreatureExit = null;
  const isBedroomRestraintActive = key === 'bedroom' && !level.refs.puzzleState.chainsEscaped;
  player.setLookBounds(isBedroomRestraintActive ? BEDROOM_RESTRAINED_LOOK_BOUNDS : null);
  interaction.setTargets(level.interactables);
  // Again per level: GLB props stream in after the boot-time pass, and any flat
  // decal among them should get the same single-pass draw.
  enableSinglePassForFlatDecals(level.group);
  // The on-screen hint key, only where H actually gives hints.
  hintKeyEl.classList.toggle('visible', HINT_LEVELS.has(key));
  contextualHints.hide();
  // Each room gets its own full time on Medium and Hard; corridors none.
  runTimer.enterRoom(key);
  scene.fog = LEVEL_FOG[key] ?? null;
  objectiveEl.textContent = LEVEL_OBJECTIVES[key] ?? '';
  // Hard-cancel rather than just hiding the box: a queued sequence would
  // otherwise keep advancing and fade its next line in over the new room.
  captions.cancel();
  // Cancelling the captions has to take the voice with it, or the line that
  // was mid-sentence keeps talking over the freshly reset room.
  audio.stopVoice();
  documentUI.close();
  silenceTape();
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
  stairsScareScript.cancel();
  hallwayBlinksScript.cancel();
  if (key === 'bedroom') audio.setBreathing(LEVEL_ONE_BREATHING_BASE);
  if (key === 'hallwayBasement') audio.setBreathing(LEVEL_TWO_BREATHING.base);
  player.movementEnabled = !lockMovement;
  player.sprintEnabled = !SPRINTLESS_LEVELS.has(key);
  // postFX.reset() above zeroes the visor dial, and the level just activated has
  // never been told what the player can see. Without this, walking into a room
  // wearing the visor takes it off in everything except the player's inventory.
  visor.refresh();
  // AFTER script.cancel() above, or the beat this fires is cancelled by the
  // very activation that started it.
  ON_ENTER[key]?.();
  const prefixes = { bedroom: 'l1', upstairsHallway: 'hallway', hallwayBasement: 'l2', backrooms: 'backrooms', study: 'backrooms' };
  markThoughts.preload(prefixes[key]);
  if (key === 'hallwayBasement') {
    generatorProgressStarted = false;
    breakerEngaged = false;
    breakerHintSeconds = null;
    levelTwoCriticalUntil = 0;
    thought('l2_01');
    thought('l2_20', { delay: 1, when: () => hallwayBasement.refs.powerStage === 'dead' });
  }
  if (key === 'backrooms') thought('backrooms_01');
  if (key === 'study') { thought('backrooms_06', { delay: 0.8 }); thought('backrooms_07'); }
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
/**
 * @param {(isAlive: () => boolean) => Promise<boolean>} [options.out] played
 *   instead of the fade out; must end on black (the fall down the stairs).
 * @param {() => Promise<unknown>} [options.arrive] played instead of the fade
 *   in, once the next level is up behind the black (coming round on the floor).
 */
async function transitionTo(key, {
  lockMovement = false, outMs = 700, holdMs = 140, inMs = 900, interlude = null, out = null, arrive = null
} = {}) {
  if (transitionInFlight) return null;
  transitionInFlight = true;
  const mine = ++transitionGeneration;
  freezePlayerForTransition();

  try {
    const isCurrent = () => mine === transitionGeneration;
    // A scene that could not play (it was already running) falls back to the fade.
    if (!out || !await out(isCurrent)) {
      if (!isCurrent()) return null;
      await fade.fadeOut(outMs);
    }
    if (mine !== transitionGeneration) return null;   // aborted mid-fade
    if (interlude) {
      await newspaperView.show(interlude);
      if (mine !== transitionGeneration) return null;  // restarted while reading
    }
    await warmLevelForTransition(key);
    if (mine !== transitionGeneration) return null;
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
    if (arrive) await arrive();
    else await fade.fadeIn(inMs);
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
  await transitionTo(route.via, { interlude, ...(CROSSING_SCENES[fromKey] ?? {}) });
}

/**
 * Crossings that are played rather than faded, keyed like TRANSITIONS by the
 * room being LEFT. Down the hallway stairs, the stairs keep going and then
 * they are not there; the maze comes up with the player on its floor.
 */
/** Seconds of coming round after the fall: the long version, but not so long it reads as loading. */
const FALL_COME_ROUND = 4.2;

const CROSSING_SCENES = {
  upstairsHallway: {
    out: (isAlive) => stairsFall.run({ isAlive }),
    arrive: () => playCutscene('comeRound', { seconds: FALL_COME_ROUND })
  }
};

/**
 * The front page read on the way out of each room, keyed like TRANSITIONS by
 * the room being LEFT. Read on the black before the maze, so the walk through
 * it is spent thinking about what the paper said.
 */
const INTERLUDES = {
  bedroom: 'afterBedroom'
};

// ---------- game reset (restart without page refresh) ----------
function resetGame() {
  openingSequenceActive = false;
  markThoughts.clear({ reset: true });
  contextualHints.reset();
  // A restart from the pause menu can land mid-fade; without this the freshly
  // reset bedroom would come up behind a black overlay that never lifts.
  abortTransition();
  // Before anything below resets a light: lifting a blackout puts back what it
  // took, which must not land on top of the fresh run's lighting.
  setHouseLightsOut(false);
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
  // Every director cue goes, the door and the sting included -- except the
  // ambient bed, which is playing in the bedroom this lands in anyway, and is
  // left unbroken for the same reason the breathing is.
  audioDirector.reset();
  // A restart is a new run on the same difficulty; activateLevel() then gives
  // the bedroom its full time again.
  runTimer.configure(currentDifficulty);
  // Every "first time" line is a first time again, and being caught starts
  // its lines from the top.
  backroomsBarks.reset();
  hallwayBlinksScript.cancel();
  resetDoorwayJoin();
  pickCaughtLine.reset();
  pickRespawnLine.reset();
  caughtTimes = 0;
  sprintCatchLessonPlayed = false;
  sprintCatchReminderIndex = 0;
  sprintCatchNextAt = 0;
  sprintCatchGeneration++;
  activateLevel('bedroom', { lockMovement: true });
}

// ---------- level preview switching (debug / mentor demo) ----------
/**
 * G's bedroom branch: opens the bedroom door through its own interact, the
 * planks and then the key, exactly as playing to it would. With carryThrough
 * (G) the player is carried straight into the hall; without it
 * (__game.stageHallwayReveal) they are left at the door and the blinks play.
 */
function debugOpenBedroomDoor({ carryThrough = true } = {}) {
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
    // Opens it -> openToHallway(), which carries the player through -- or,
    // for stageHallwayReveal, leaves them at the door to watch the blinks.
    skipThroughDoor = carryThrough;
    door.onInteract();
  }
  // Lit for the corridor.
  setFlashlight(true);
}

/**
 * Keys that do nothing while a cutscene plays. Each acts through the hand or
 * the view the scene has borrowed: the torch (F), a drop (Q), the visor (V),
 * third person (T), a hint caption over the scene (H), the debug skip (G).
 * Restart, credits and the level jumps are NOT here: each cancels the scene
 * properly, which is what they are for.
 */
const KEYS_HELD_BY_CUTSCENES = new Set(['KeyF', 'KeyQ', 'KeyV', 'KeyT', 'KeyH', 'KeyG']);

window.addEventListener('keydown', (e) => {
  if (openingSequenceActive) return;
  if (e.code === 'KeyH') { showHint(e); return; }
  if (!player.isLocked) return;
  // A cutscene owns the view and the hand, so nothing that acts through either
  // reaches the game until it hands back -- see KEYS_HELD_BY_CUTSCENES.
  if (cutscene.isRunning && KEYS_HELD_BY_CUTSCENES.has(e.code)) return;
  // Deliberately INSTANT, not faded: these are a mentor-demo tool and 1.7s of
  // black per press is friction. But each one aborts first, or a jump taken
  // mid-fade lands behind an overlay that will never lift.
  // Preview shortcuts remain available in production/demo builds too.
  if (e.code === 'KeyL' || e.code === 'Digit2' || e.code === 'Numpad2') {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey
      || e.target?.closest?.('input, textarea, select, [contenteditable], [role="textbox"]')) return;
    e.preventDefault();
    abortTransition();
    activateLevel('hallwayBasement');
    return;
  }
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
    //
    // Every other level: G takes its real way out too, for testing --
    //   upstairsHallway  down the stairs (exitLevel, as walking down does)
    //   backrooms        through this crossing's exit door, unlatched by its own interact
    //   hallwayBasement  out through the metal door's exit, power puzzle skipped
    //   study            the released ending
    const key = sceneManager.activeKey;
    if (transitionInFlight || endingInFlight) {
      // A press during a fade would queue a second exit behind the first.
    } else if (key === 'upstairsHallway' || key === 'hallwayBasement') {
      showCaption('[debug] G: level skipped.');
      exitLevel(key);
    } else if (key === 'backrooms') {
      backrooms.refs.walkThroughExitDoor();
    } else if (key === 'study') {
      playEnding('released');
    } else if (key !== 'bedroom') {
      showCaption(`[debug] G does nothing in "${key}".`);
    } else {
      debugOpenBedroomDoor();
    }
  }
  // Neither Q nor F acts on key auto-repeat. Held Q dropped item after item --
  // each repeat that landed once the drop clip had finished let go of whatever
  // the hand had moved on to, the torch included, until the inventory was
  // empty -- and held F strobed the torch.
  if (e.code === 'KeyF' && !e.repeat) {
    // The torch is in the left hand whatever the right is holding.
    if (flashlightFound && gameState.inventory.has('flashlight')) setFlashlight(!flashlightSwitchOn);
  }
  // Q lets go of what is in the hand -- see dropHeldItem() for when it refuses.
  if (e.code === 'KeyQ' && !e.repeat) dropHeldItem();
  if (e.code === 'KeyT') setThirdPerson(!thirdPerson);
  if (e.code === 'KeyV') {
    const result = visor.toggle();
    if (result === 'none') {
      showCaption(line('dialog_visor_not_carried'));
    } else {
      sfx(result === 'on' ? 'visor_on' : 'visor_off');
      captions.play(result === 'on' ? line('dialog_visor_first_worn') : line('dialog_visor_removed'));
    }
  }
  if (e.code === 'KeyR' && !e.repeat) openRestartConfirm();
  // K, not C: C is crouch.
  if (e.code === 'KeyK' && !transitionInFlight) toggleCredits(true);
});

// ---------- right-click = E ----------
// For players who play with the mouse: right-click uses whatever the crosshair
// is on, exactly like E. Only while the game has the mouse -- on a menu or a
// pop-up the mouse is the menu's -- and never in the free camera, which is
// for filming. While a newspaper is up, that page takes the click instead.
window.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || !player.isLocked || freeCamera.isActive || newspaperView.isOpen) return;
  e.preventDefault();
  interaction.interact();
});
// No browser right-click menu over the game itself.
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('contextmenu', (e) => {
  if (player.isLocked) e.preventDefault();
});

// ---------- restart confirm (R) ----------
// R sits right next to the movement keys, so a stray press used to wipe the
// whole run with no warning. It now asks first. The pointer is released so the
// buttons can be clicked, and the game pauses behind it exactly like a pause.
// The pause menu's own Restart button does not ask: that is never an accident.
const restartConfirmEl = document.getElementById('restart-confirm');
const restartConfirmYes = document.getElementById('restart-confirm-yes');
const restartConfirmKeep = document.getElementById('restart-confirm-keep');
let restartConfirmOpen = false;

function openRestartConfirm() {
  if (restartConfirmOpen || endingInFlight || gameState.endingChosen) return;
  restartConfirmOpen = true;
  restartConfirmEl.classList.remove('hidden');
  player.unlock();
  // Keep playing is the default, so a reflexive Enter does nothing harmful.
  restartConfirmKeep.focus({ preventScroll: true });
}

/**
 * @param {boolean} restart - true to restart, false to go back to the game.
 * @param {object} [options]
 * @param {boolean} [options.toPauseMenu] - Esc: the browser will not hand the
 *   pointer back on Esc, so land on the pause menu ("Click to resume") instead.
 */
function closeRestartConfirm(restart, { toPauseMenu = false } = {}) {
  if (!restartConfirmOpen) return;
  restartConfirmOpen = false;
  restartConfirmEl.classList.add('hidden');
  if (restart) resetGame();
  if (toPauseMenu) showPauseScreen();
  else player.lock();
}

restartConfirmYes.addEventListener('click', () => closeRestartConfirm(true));
restartConfirmKeep.addEventListener('click', () => closeRestartConfirm(false));
window.addEventListener('keydown', (e) => {
  if (!restartConfirmOpen) return;
  // Y confirms; N or Esc backs out. Enter and Space press whichever button has
  // focus, which the browser does by itself. Not R: the very R press that
  // opened this reaches this listener too, and would confirm it on the spot.
  if (e.code === 'KeyY') { e.preventDefault(); closeRestartConfirm(true); }
  else if (e.code === 'KeyN') { e.preventDefault(); closeRestartConfirm(false); }
  else if (e.code === 'Escape') { e.preventDefault(); closeRestartConfirm(false, { toPauseMenu: true }); }
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
  released: 'ENDING: RELEASED',
  contained: 'ENDING: CONTAINED',
  timeout: 'OUT OF TIME'
};

/** The small line under the title. Only running out of time is not an ending. */
const ENDING_SUBTITLES = {
  timeout: 'The house kept you'
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

/**
 * Time ran out on Medium or Hard. Not a story ending, so no camera shot and
 * no newspaper: the room goes dark, a line says why, and the end screen offers
 * another go.
 */
async function playOutOfTime() {
  if (endingInFlight || gameState.endingChosen) return;
  endingInFlight = true;
  gameState.endingChosen = 'timeout';
  try {
    // Stop whatever beat was playing (a catch, a sighting), so nothing hands
    // the controls back while the screen is going dark.
    script.cancel();
    newspaperView.cancel();
    interaction.setEnabled(false);
    player.movementEnabled = false;
    player.lookEnabled = false;
    // Help, not story: shown even with captions off, like the hints.
    captions.play(alwaysShown(line('dialog_out_of_time')));
    await fade.fadeOut(2600);
    // R during the fade already started a new run; resetState() cleared the flag.
    if (gameState.endingChosen !== 'timeout') return;
    showEndScreen('timeout');
  } finally {
    endingInFlight = false;
  }
}

async function playEnding(which) {
  const committedChoice = study.refs.puzzle.endingChoice;
  if (endingInFlight || gameState.endingChosen || cutscene.isRunning
    || (which === 'released' ? committedChoice !== 'RELEASE'
      : which !== 'contained' || committedChoice !== 'RESEALED')) return;
  endingInFlight = true;
  gameState.endingChosen = which;
  let resealFadeTimer = null;
  let resealFinishTimer = null;
  let resolveResealFinish;
  const resealFinished = which === 'contained'
    ? new Promise((resolve) => { resolveResealFinish = resolve; }) : null;
  function continueAfterResealLine() {
    if (!resealFinished || resealFinishTimer !== null) return;
    // The ending's last beat must finish even if pointer-lock loss pauses the
    // shared caption/cutscene clock. Keep the original 10.2/11.6s timings.
    resealFadeTimer = window.setTimeout(() => {
      if (gameState.endingChosen === 'contained') fade.fadeOut(1200);
    }, 3600);
    resealFinishTimer = window.setTimeout(() => resolveResealFinish(true), 5000);
  }
  try {
    script.cancel();
    captions.cancel();
    audio.stopVoice();
    interaction.setEnabled(false);
    player.movementEnabled = false;
    player.lookEnabled = false;
    player.clearKeys();
    audio.setBreathing(BREATH_BASE_LEVEL);
    const text = which === 'released'
      ? ['CONTAINMENT RELEASED.', 'Annabelle may still have a chance.', 'But The Hollow is no longer contained.']
      : ['CONTAINMENT RESTORED.', 'You remembered what you asked her to do.', 'Annabelle cannot leave.'];
    const lookAt = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()));
    const sceneFinished = cutscene.playScene({
      name: `studyEnding_${which}`,
      letterbox: true,
      skippable: false,
      shots: [{ cut: true, at: 'player', lookAt, seconds: 11.6 }],
      cues: [
        { t: 0, run: () => captions.say({ text: text[0], duration: 2.4, always: true }) },
        { t: 3.1, run: () => captions.say({ text: text[1], duration: 2.9, always: true }) },
        { t: 6.6, run: () => {
          try {
            captions.say({ text: text[2], duration: 3, always: true });
          } finally {
            continueAfterResealLine();
          }
        } },
        { t: 10.2, run: () => fade.fadeOut(1200) }
      ],
      onEnd: (_ctx, completed) => {
        interaction.setEnabled(false);
        captions.cancel();
        if (!completed) fade.clear();
      }
    });
    const shotFinished = await (resealFinished
      ? Promise.race([sceneFinished, resealFinished]) : sceneFinished);
    if (!shotFinished || gameState.endingChosen !== which) return;
    // A stalled reseal timeline still owns input/camera until explicitly
    // cancelled. Its normal cleanup runs before the shared end screen opens.
    if (which === 'contained' && cutscene.name === 'studyEnding_contained') cutscene.cancel();
    showEndScreen(which, false);
    fade.clear();
  } finally {
    window.clearTimeout(resealFadeTimer);
    window.clearTimeout(resealFinishTimer);
    endingInFlight = false;
  }
}

/**
 * The end screen reuses #start-screen, which is already doing double duty as
 * the pause menu -- a third state rather than a third overlay.
 */
function showEndScreen(which, showCredits = true) {
  menuOverlayState = 'game';
  showLegacyStartScreen();
  creature.visible = false;
  creatureStanding = false;
  audio.setBreathing(BREATH_BASE_LEVEL);
  startTitle.textContent = ENDING_TITLES[which];
  startSub.textContent = ENDING_SUBTITLES[which] ?? 'THE END';
  startButton.textContent = 'Play again';
  restartButton.classList.add('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  promptEl.style.display = 'none';
  // Running out of time is not an ending, so no credits roll over it: the
  // title and Play again are what the player needs to see.
  if (!showCredits || !ENDING_CREDITS[which]) {
    buildCredits();
    if (player.isLocked) player.unlock();
    return;
  }
  buildCredits(which);
  toggleCredits(true);
}

// ---------- credits ----------
/**
 * The credits screen, as data: sections of [what, who and the licence] rows.
 *
 * THIS IS THE ATTRIBUTION THE LICENCES ASK FOR, so it is kept as complete as the
 * project's own records allow. Where a recording's source is stated here, the
 * full table (link, cut used, processing) is src/assets/audio/SOURCES.md.
 * hands.glb is CC BY 4.0 and the Annabelle, hunter-footstep and CRT-static
 * recordings are CC BY: those rows are the attribution the licences require, so
 * do not remove one without also removing its asset.
 *
 * Rows whose source was never recorded say so rather than guess. Fill them in
 * when the team knows, and delete the "to be confirmed" wording with them.
 */
const CREDIT_SECTIONS = [
  {
    title: 'Built With',
    rows: [
      ['Three.js', '3D rendering library, by the three.js authors. MIT licence. threejs.org'],
      ['PointerLockControls and the Three.js example modules', 'Three.js official examples. MIT licence.'],
      ['Vite', 'Build tool used to produce the deployed bundle. MIT licence.'],
      ['Web Audio API', 'Wind, distant footsteps, and the fallback thunder, creaks, sparks and paper are synthesised at runtime.']
    ]
  },
  {
    title: 'Typefaces',
    rows: [
      ['UnifrakturMaguntia, Playfair Display, Old Standard TT', 'The newspaper pages. By J. "Mach" Wust, Claus Eggers Sørensen and Alexey Kryukov. SIL Open Font License 1.1, bundled via Fontsource (fontsource.org).'],
      ['Caveat', 'Handwriting, by Impallari Type. SIL Open Font License 1.1, bundled via Fontsource.'],
      ['Kalam', 'Handwritten notes, by Indian Type Foundry. SIL Open Font License 1.1.']
    ]
  },
  {
    title: 'Models and Textures',
    rows: [
      ['First-person hands', '"First Person hands rigged" by davidfischer, via Sketchfab. CC BY 4.0 (creativecommons.org/licenses/by/4.0). Modified: left arm removed, wrist re-aligned, re-rigged for this project.'],
      ['The creature', 'An imported character mesh, reworked in Blender into the monster and the man it was. Original source and licence to be confirmed.'],
      ['Photographed surfaces', 'Concrete, steel and tile materials from ambientCG (ambientcg.com), CC0. Rust and grunge overlays from Texture Labs (texturelabs.org).'],
      ['Everything else', 'The remaining models, the textures drawn in code and the rusted keys were made for this project by the team. The Blender scripts and sources are in the blender/ folder.']
    ]
  },
  {
    title: 'Voice',
    rows: [
      ['The session tape', 'Both voices were generated with ElevenLabs.'],
      ['Spoken lines', 'Most lines are subtitled only for now. Recordings are added as they are made.']
    ]
  },
  {
    title: 'Recordings',
    note: 'Every file, with its link, cut and processing, is listed in src/assets/audio/SOURCES.md. Licences are as stated by each uploader.',
    rows: [
      ['Annabelle singing', '"Daisy Bell But I Made It Even More Unsettling" by LARA\'S HORROR SOUNDS (YouTube). CC BY (creativecommons.org/licenses/by/3.0). Trimmed, mono, filtered in game.'],
      ['Hunter footsteps', '"CREEPY FOOTSTEPS (& RUNNING), HORROR SOUND EFFECT" by DARKLIT STUDIO (YouTube). CC BY.'],
      ['CRT static', '"TV STATIC (4K 60FPS)" by The Fowl Owl (YouTube). CC BY.'],
      ['Monster breathing', '"Scary Sound Effect #3" by Best Sound Effects (YouTube), using "Cthulhu growl" by cyclon8472 from freesound.org. Creative Commons 4.0 according to the upload.'],
      ['Breathing', '"Sound Effect - Man Freezing Breathing" by FUNBOON (YouTube). Licence not stated.'],
      ['Distant laughter', '"Evil Laughing Woman Sound - Woman Laugh Sound Effect | Ver. 1" by Distorted Room (YouTube). The author asks for approval before use.'],
      ['Rain ambience', '"Night Rainstorm Over Quiet Town" by Cowboys in Rain (YouTube). Licence not stated.'],
      ['Stalking breath', '"Scary Breathing And Heartbeat Sound Effects" by Scary Sound Effects (YouTube). Licence not stated.'],
      ['Candle', '"Candle flicker // free sound effects" by Macc III Audio & Digital Production (YouTube). Licence not stated.'],
      ['Lockbox', '"Chest Opening SOUND Effect" by SOUND Effects Public Domain (YouTube). Public domain.'],
      ['Door creak', '"Creepy Wooden Door Creaking Sound Effect" by Sound Around (YouTube), from freesound_community via Pixabay. Royalty-free per the upload.'],
      ['Caught sting', '"BioShock 2 | Harvesting a Little Sister" uploaded by Bond Factory (YouTube). Game audio from BioShock 2 (2K Games).'],
      ['Level 2 footsteps', '"Gmod/TF2 SFX - Metal Footsteps Sound Effect" by Autisticblood5 (YouTube). Game audio from Team Fortress 2 / Garry\'s Mod (Valve).'],
      ['Player footsteps and the trolley', 'Source, author and licence to be confirmed.']
    ]
  },
  {
    title: 'Sound Effects, CC0',
    rows: [
      ['Kenney (kenney.nl)', 'The RPG Audio, Impact Sounds and Interface Sounds packs.'],
      ['freesound.org', '"Unlock Deadbolt" by alegemaate; "opening Padlock" and "Electricity Sound" by NachtmahrTV; "cemeterygate8" by celadon_noise; '
        + '"CHAIN & LOCK ON FENCE SOUND" by metrostock99; "Circuit Breaker 1 SP" and "2 DP" by sribubba; "Kill Switch (Large Breaker Switch)" by '
        + 'EchoCinematics; "Spark" by elliott.klein; "Lights Flicker On" by mmaruska; "Power Down" by peepholecircus; "engine2_down" by ReadeOnly; '
        + '"Fluorescent Lightbulb Hum" by ftpalad; "Diesel engine idling" by chungus43A; "Drawer Opening & Closing" by quantumriver; '
        + '"Planks Clattering" by Fission9; "Wood Creak Single V3" by Rudmer_Rotteveel; "Pushing chair" by santiagogra; "Picking Up Keys" by '
        + 'WeeJee_vdH; "Chains" by cribbler; "Tiny metal/lockpicking" by cappellacciocrew; "Gasp." by bacruz666; "Sniffing" by spookymodem; '
        + '"Water Drop 01" by LilMati.']
    ]
  },
  {
    title: 'Sound Effects, Public Domain',
    rows: [
      ['PDSounds.org, via Wikimedia Commons', '"Storm thunderbolts", "Door handle creaking" and "Aggressive electric buzzing" by stephan; "Open metallic door" by hc; '
        + '"Rain against the window" by cori; "Turning a page" by planish.']
    ]
  }
];

/**
 * Built through a function rather than appended once at module load, because an
 * ending prepends its own two lines and a player who reaches both endings in one
 * session would otherwise get the whole list twice, then three times.
 * Clearing first is the whole fix.
 */
function buildCredits(ending = null) {
  creditsEpilogue.replaceChildren();
  creditsEpilogue.classList.toggle('hidden', !ending);
  for (const line of ending ? ENDING_CREDITS[ending] : []) {
    const p = document.createElement('p');
    p.textContent = line;
    creditsEpilogue.appendChild(p);
  }
  creditsSections.replaceChildren();
  for (const { title, note, rows } of CREDIT_SECTIONS) {
    const section = document.createElement('section');
    section.className = 'credits-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    if (note) {
      const noteEl = document.createElement('p');
      noteEl.className = 'credits-note';
      noteEl.textContent = note;
      section.appendChild(noteEl);
    }
    const list = document.createElement('dl');
    for (const [what, detail] of rows) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = what;
      const description = document.createElement('dd');
      description.textContent = detail;
      row.append(term, description);
      list.appendChild(row);
    }
    section.appendChild(list);
    creditsSections.appendChild(section);
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
// `difficulty` is the one last played, so the menu can offer it first.
const DEFAULT_SETTINGS = { volume: 50, sensitivity: 100, captions: false, difficulty: DEFAULT_DIFFICULTY };

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
      captions: typeof parsed.captions === 'boolean' ? parsed.captions : DEFAULT_SETTINGS.captions,
      difficulty: Object.hasOwn(DIFFICULTIES, parsed.difficulty) ? parsed.difficulty : DEFAULT_SETTINGS.difficulty
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
currentDifficulty = settings.difficulty;
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

let openingSequenceActive = false;

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
  // Keep the focused menu button from treating Enter/Space as a second start
  // request while the opening sequence owns the screen.
  startButton.disabled = true;
  startScreen.classList.add('hidden');
  openingSequenceActive = true;
  player.movementEnabled = false;
  player.lookEnabled = false;
  interaction.setEnabled(false);
  audio.start();
  runTimer.configure(currentDifficulty);
  backroomsHunter.setReady(true);

  // Start playback in the original click gesture; construction yields to its first paint.
  const newsFinished = openingNewsCutscene.play();
  // Prepare only the opening pair while the report covers the canvas.
  const levelOneReady = preloadLevel1();
  const skipOpeningNews = (event) => {
    if (event.code === 'KeyK' && openingNewsCutscene.skip()) event.preventDefault();
  };
  window.addEventListener('keydown', skipOpeningNews);
  const run = script.run(async (s) => {
    const newsResult = await newsFinished;
    window.removeEventListener('keydown', skipOpeningNews);
    if (!s.alive()) return;
    // A skipped report rests on the same four photographs as a watched one.
    if (newsResult?.skipped) openingNewsCutscene.showAllPhotos();
    // Keep the photographs visible until the opening pair is ready.
    const hadToWait = !level1Ready;
    await levelOneReady;
    if (!s.alive()) return;
    // After a wait, K is no longer a fresh enough gesture for the pointer lock.
    if (newsResult?.skipped && level1Ready && !hadToWait) {
      startButton.disabled = false;
      player.lock();
    } else {
      await waitForOpeningNewsContinue(levelOneReady);
    }
    if (!s.alive()) return;
    await levelOneReady;
    if (!s.alive()) return;
    await Promise.all([openingNewsCutscene.close(), fade.fadeOut(420)]);
    if (!s.alive()) return;
    // Activation cancels the old room's scripts, so it must occur outside this runner.
    return true;
  });
  run.then(async (continueToBedroom) => {
    if (!continueToBedroom) return;
    activateLevel('bedroom', { lockMovement: true });
    audio.startBreathing();
    interaction.setEnabled(true);
    player.lookEnabled = true;
    // Wake-up restores this state; only onFreed may release the bed restraint.
    player.movementEnabled = false;
    const waking = playCutscene('wakeUp');
    openingSequenceActive = false;
    if (!cutscene.isRunning) {
      fade.fadeIn(2600);
      await captions.play(line('dialog_wake'));
      return;
    }
    // The authored first frame has closed eyes. Never expose the default room view.
    fade.clear();
    await waking;
  }).catch((error) => {
    console.error('Opening preparation failed:', error);
    openingSequenceActive = false;
  });

}

/** Restores pointer lock from a fresh click after the non-interactive opening. */
function waitForOpeningNewsContinue(levelOneReady = preloadLevel1()) {
  const button = openingNewsContinue.querySelector('button');
  openingNewsContinue.classList.add('is-open');
  openingNewsContinue.setAttribute('aria-hidden', 'false');
  button.focus();

  return new Promise((resolve) => {
    let hasContinued = false;
    const continueGame = async (event) => {
      if (hasContinued) return;
      hasContinued = true;
      event?.preventDefault();
      openingNewsContinue.removeEventListener('click', continueGame);
      window.removeEventListener('keydown', continueGame);
      // Acquire the pointer in this gesture even on a slow preparation fallback.
      // The collage stays visible and no gameplay ticks until preparation resolves.
      player.lock();
      const label = button.textContent;
      if (!level1Ready) { button.textContent = 'Preparing...'; button.disabled = true; }
      await levelOneReady;
      button.textContent = label;
      button.disabled = false;
      openingNewsContinue.classList.remove('is-open');
      openingNewsContinue.setAttribute('aria-hidden', 'true');
      startButton.disabled = false;
      resolve();
    };
    openingNewsContinue.addEventListener('click', continueGame, { once: true });
    window.addEventListener('keydown', continueGame, { once: true });
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
  if (tapePlaying) hallwayBasement.refs.sessionTape.setPaused(false);
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
  if (tapePlaying) hallwayBasement.refs.sessionTape.setPaused(true);
  captions.setPaused(true);

  // The restart question is a pause of its own; it brings the game back itself.
  if (restartConfirmOpen) return;
  if (!creditsScreen.classList.contains('hidden')) return;
  // A finished run (an ending, or out of time) is showing its end screen;
  // the pause menu must not replace it.
  if (gameState.endingChosen) return;
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
    hallwayBlinks,
    // Opens the bedroom onto the hall as the door would, without the puzzle chain.
    openToHallway,
    activateLevel,
    exitLevel,
    // The fade between rooms, so a harness can time a real room change.
    transitionTo,
    resetGame,
    // So a harness can run the clock out without waiting the whole limit.
    runTimer,
    // So a harness can light a room the way a player carrying the torch sees it.
    setFlashlight,
    // So a harness can see the backrooms catch and its jump scare without
    // having to be run down in the maze.
    onHunterCaught,
    // The stairs scare normally waits for the player to walk to the top step.
    playStairsScare,
    stairsScare,
    // Every jump scare on demand: jumpScare.run({ creature: okabe, kind }).
    jumpScare,
    stairsFall,
    backrooms,
    // Camera five normally needs the whole power chain and the CCTV desk.
    playCameraFiveSighting,
    get labCreatureExit() { return labCreatureExit; },
    hands,
    THREE,
    sceneManager,
    player,
    postFX,
    cutscene,
    playCutscene,
    SCENES,
    // The door-1 blinks staged the shipping way: freed, on the door's centre
    // line a metre back, door opened through its own interact (G's path,
    // without being carried through).
    stageHallwayReveal: () => {
      if (sceneManager.activeKey !== 'bedroom') activateLevel('bedroom');
      player.setLookBounds(null);
      const doorway = bedroom.refs.doorway;
      player.spawn(doorway.x, doorway.z - 1.0, Math.PI, 0);
      debugOpenBedroomDoor({ carryThrough: false });
      return hallwayBlinks.isRunning;
    },
    // Stills, turnarounds and recordings for AI-video references -- see
    // core/CutsceneExport.js. Saved to Downloads, never into the repo.
    ...createCutsceneExport({
      renderer,
      postFX,
      cutscene,
      playCutscene,
      figures: { creature, player: playerBody }
    }),
    script,
    creature,
    // The backrooms figure is a DIFFERENT creature from `creature` now -- a
    // harness asserting on the thing in the corridor has to reach this one, and
    // reaching the wrong one would pass against a figure nobody can see.
    okabe,
    creatureAI,
    backroomsHunter,
    backroomsBarks,
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
    equipTorch: () => { applyFlashlightBeam(); return leftTorch.carried; },
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
      setFlashlight(true);
    },
    pickUpItem,
    consumeItem,
    refreshInventoryUI,
    // The held item. heldItems.framing is the live per-item framing table --
    // edit a row, then heldItems.reframe() to see it -- and select()/cycle()
    // stand in for the wheel, which a headless harness cannot turn.
    heldItems,
    leftTorch,
    itemMeshes,
    // Q is in the pointer-lock-gated listener too.
    dropHeldItem,
    droppedItems,
    // The map: headless has no Pointer Lock, so the frame loop's own call to
    // setMode/revealAt/update never runs and a test drives it from here.
    minimap,
    get storm() { return bedroomStorm; },
    captions,
    // The crosshair's raycast. Headless has no pointer lock, so the frame loop
    // never calls update() itself -- a harness aims the camera and calls it.
    interaction,
    documentUI,
    tapeSubtitles,
    audio,
    // audition(name), debug(), state, forceActive -- see docs/AUDIO.md.
    audioDirector,
    showCreatureAt,
    hideCreature,
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
  upstairsHallway: 'hanging the pictures...',
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

/** The boot screen's bar, and the one over the opening's photographs. */
const loadBars = [
  { fill: loadingBarFill, hint: loadingHintEl },
  { fill: openingNewsLoading.querySelector('.onl-fill'), hint: openingNewsLoading.querySelector('.onl-hint') }
];

function setLoadProgress(fraction, hint) {
  const percent = Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
  const width = `${percent}%`;
  for (const bar of loadBars) {
    bar.fill.style.width = width;
    bar.fill.setAttribute('role', 'progressbar');
    bar.fill.setAttribute('aria-valuemin', '0');
    bar.fill.setAttribute('aria-valuemax', '100');
    bar.fill.setAttribute('aria-valuenow', String(percent));
    if (hint) bar.hint.textContent = hint;
  }
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

async function warmUp({
  keys = [...sceneManager.levels.keys()],
  waitForAssets = true,
  // How much of the loading bar these rooms fill, when more steps follow them.
  progressUpTo = 1,
  compileOnly = false,
  // Off when the warm-up queue owns the bar (see scheduleWarmStep).
  showProgress = true
} = {}) {
  const steps = keys.length / progressUpTo;
  let done = 0;
  const advance = async (hint) => {
    done++;
    if (showProgress) setLoadProgress(done / steps, hint);
    // Yield, or the bar's width change never reaches the screen -- the browser
    // cannot paint between two synchronous compiles.
    await nextFrame();
  };

  // The hands and the held torch are drawn in every room's warm-up below, so
  // they have to have arrived. Both promises already swallow a failed load,
  // so a missing model costs that model's warm-up, never the whole boot.
  await Promise.all([initializeHands(), initializeHeldTorch()]);
  // And every room's own models, which can bring lights with them: a room
  // warmed before its candles arrive is warmed for the wrong lighting.
  if (waitForAssets) await waitForAllLoads();

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
    if (showProgress) setLoadProgress(done / steps, LOAD_HINTS[key] ?? 'entering the house...');
    await nextFrame();
    level.group.visible = true;
    // Fog is part of the program key, so a room warmed under the wrong fog is
    // warmed for nothing.
    scene.fog = LEVEL_FOG[key] ?? null;
    // Stand where the player will stand, so the room is in front of the camera
    // rather than behind it.
    if (level.spawn) camera.position.set(level.spawn[0], 1.6, level.spawn[1]);
    // Later transitions retain their existing fade-owned draw. The opening
    // uses compile-only preparation plus tiny unlit asset-upload probes.
    const unculled = [];
    level.group.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { unculled.push(o); o.frustumCulled = false; }
    });
    try {
      // frustumCulled off for exactly this pass: a wall behind the camera is
      // clipped away but its draw call still issues, so its programs are built.
      // Without it, half of a room warms and the other half stalls on arrival.
      //
      // With the hands and every item on screen too, and every shadow drawn
      // whether its light is on or not -- see showViewModelsForWarmUp().
      //
      // postFX.compileVisible builds the shaders in the background for the
      // composer's target the RenderPass really draws into, with each light
      // counted once; renderer.compileAsync(level.group, camera, scene) built
      // every one of them for the canvas and for twice the room's lights, so
      // none was ever used. The draw then catches what compiling cannot (the
      // driver's own per-draw work), and is quick with the shaders ready.
      const restoreViewModels = showViewModelsForWarmUp();
      darkShadowSkipper.refreshAllShadowsOnce();
      try {
        await postFX.compileVisible(camera);
        if (compileOnly) await prepareGpuResources([level.group, camera]);
        else postFX.render();
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
}

/**
 * The backrooms monster, in the maze with only the maze showing, under the
 * maze's fog and lights and in front of the camera -- the exact conditions of
 * the frame it walks into view on. Warmed anywhere else, it compiles again on
 * arrival. The player's body (T) is drawn there too.
 *
 * Starting the hunter on a creature whose shaders have never been built is the
 * one stall a fade cannot cover, because it lands the moment the thing becomes
 * visible in the corridor -- so this runs on the fade into the maze.
 */
async function warmMazeCreature({ compileOnly = false } = {}) {
  const maze = sceneManager.get('backrooms');
  if (!maze) return;
  await Promise.all([okabe.ready, playerBody.ready]);
  const levelWasVisible = new Map([...sceneManager.levels].map(([key, level]) => [key, level.group.visible]));
  const creatureWasVisible = okabe.visible;
  const bodyWasVisible = playerBody.visible;
  const fogBefore = scene.fog;
  const posBefore = camera.position.clone();
  for (const level of sceneManager.levels.values()) level.group.visible = level === maze;
  scene.fog = LEVEL_FOG.backrooms ?? null;
  if (maze.spawn) {
    camera.position.set(maze.spawn[0], 1.6, maze.spawn[1]);
    okabe.setPosition(maze.spawn[0], maze.spawn[1] - 4);
  }
  okabe.visible = true;
  okabe.setCorrection(0);
  okabe.setSilhouette(true);
  okabe.update(1 / 60);
  okabe.setLayer(0);
  playerBody.visible = true;
  playerBody.setPosition(camera.position.x, camera.position.z);
  playerBody.update(1 / 60);
  const unculled = [];
  for (const figure of [okabe, playerBody]) {
    figure.group.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { unculled.push([o, o.frustumCulled]); o.frustumCulled = false; }
    });
  }
  try {
    await postFX.compileVisible(camera);
    if (compileOnly) await prepareGpuResources([okabe.group, playerBody.group]);
    else postFX.render();
  } catch (err) {
    console.warn('warmMazeCreature: could not warm the creature', err);
  }
  // Put back what each mesh HAD, not true: OkabeCreature turns culling off on
  // its skinned meshes on purpose (their bounding sphere freezes at the first
  // pose), and blanket-restoring true here quietly undid that.
  for (const [o, was] of unculled) o.frustumCulled = was;
  okabe.visible = creatureWasVisible;
  okabe.setSilhouette(false);
  playerBody.visible = bodyWasVisible;
  for (const [key, level] of sceneManager.levels) level.group.visible = levelWasVisible.get(key);
  scene.fog = fogBefore;
  camera.position.copy(posBefore);
}

/**
 * The house creature, at the monster reading every house beat shows, in each
 * of `houseSets`, with only those rooms showing. A set of more than one room
 * also draws every material in those rooms under their joined lights, or
 * opening the bedroom door stalls.
 *
 * A shader is built for one exact set of lights and fog. This used to be done
 * once, under the bedroom's fog but with the maze still switched on from the
 * hunter's warm-up -- a mix of two rooms' lights that play never produces --
 * so the creature built its shaders again on its first appearance in every
 * room: entering the basement froze for ~2-3 s. The player's body (T) is drawn
 * alongside it for the same reason.
 *
 * @param {string[][]} houseSets - level keys drawn together, one set at a time.
 */
async function warmHouseCreature(houseSets, { compileOnly = false } = {}) {
  await Promise.all([creature.ready, playerBody.ready]);
  const houseWasVisible = creature.visible;
  const bodyWasShown = playerBody.visible;
  const levelWasVisible = new Map([...sceneManager.levels].map(([key, level]) => [key, level.group.visible]));
  const fogBefore = scene.fog;
  const posBefore = camera.position.clone();
  const unculled = [];
  creature.visible = true;
  playerBody.visible = true;
  creature.group.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { unculled.push([o, o.frustumCulled]); o.frustumCulled = false; }
  });
  for (const houseKeys of houseSets) {
    const houseKey = houseKeys[houseKeys.length - 1];
    const houseLevel = sceneManager.get(houseKey);
    if (!houseLevel) continue;
    for (const [key, level] of sceneManager.levels) level.group.visible = houseKeys.includes(key);
    scene.fog = LEVEL_FOG[houseKeys[0]] ?? null;
    if (houseLevel.spawn) camera.position.set(houseLevel.spawn[0], 1.6, houseLevel.spawn[1]);
    creature.setPosition(camera.position.x, camera.position.z - 4);
    if (houseKeys.length > 1) {
      // Both rooms, whole, unculled, as the levels' own warm-up does.
      const both = [];
      for (const k of houseKeys) {
        sceneManager.get(k).group.traverse((o) => {
          if (o.isMesh || o.isSkinnedMesh) { both.push([o, o.frustumCulled]); o.frustumCulled = false; }
        });
      }
      try {
        await postFX.compileVisible(camera);
        darkShadowSkipper.refreshAllShadowsOnce();
        if (!compileOnly) postFX.render();
      } catch (err) {
        console.warn('warmUp: could not warm the bedroom and hallway together', err);
      }
      for (const [o, was] of both) o.frustumCulled = was;
    }
    creature.update(1 / 60);
    playerBody.setPosition(camera.position.x, camera.position.z);
    playerBody.update(1 / 60);
    try {
      await postFX.compileVisible(camera);
      if (compileOnly) await prepareGpuResources([creature.group, playerBody.group]);
      else postFX.render();
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
  for (const [o, was] of unculled) o.frustumCulled = was;
  scene.fog = fogBefore;
  camera.position.copy(posBefore);
}

const warmedLevelKeys = new Set();
let tapeBackroomsPreload = null;

/** Asset-only preparation: never borrows the live scene, camera or controls. */
function preloadBackroomsForTape() {
  if (!tapeBackroomsPreload) {
    tapeBackroomsPreload = preloadAssetGroups(['backrooms', 'common']).catch((error) => {
      tapeBackroomsPreload = null;
      console.warn('Session 14 Backrooms preload failed:', error);
    });
  }
  return tapeBackroomsPreload;
}

/** Upload textures and compile shadow variants without rendering a game level. */
async function prepareGpuResources(roots) {
  const textures = new Set();
  const shadowScene = new THREE.Scene();
  const shadowMaterials = [];
  for (const root of roots) root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms ?? {})) if (uniform.value?.isTexture) textures.add(uniform.value);
      if (!object.castShadow) continue;
      for (const point of [false, true]) {
        const depth = point
          ? new THREE.MeshDistanceMaterial()
          : new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        for (const key of ['map', 'alphaMap', 'alphaTest', 'displacementMap', 'displacementScale', 'displacementBias', 'wireframe']) depth[key] = material[key];
        depth.side = material.shadowSide ?? (material.side === THREE.FrontSide ? THREE.BackSide : material.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
        const copy = object.clone(false);
        copy.material = depth;
        copy.frustumCulled = false;
        copy.castShadow = false;
        shadowScene.add(copy);
        shadowMaterials.push(depth);
      }
    }
  });
  let uploads = 0;
  for (const texture of textures) {
    renderer.initTexture(texture);
    if (++uploads % 4 === 0) await nextFrame();
  }
  // Into a target, as the shadow pass draws them: a shader is built for its
  // render target, and one built for the canvas is never used there.
  const target = new THREE.WebGLRenderTarget(1, 1);
  const previousTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  let shadowShaders;
  try {
    shadowShaders = renderer.compileAsync(shadowScene, camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
  }
  await shadowShaders;
  // Tiny, unlit asset probes upload geometry/bone buffers. Never draw the live
  // room or its lights, and bound each batch so the news keeps getting frames.
  const probes = shadowScene.children.filter((object) => !object.material.isMeshDistanceMaterial);
  shadowScene.clear();
  try {
    renderer.setRenderTarget(target);
    for (let index = 0; index < probes.length; index += 16) {
      shadowScene.add(...probes.slice(index, index + 16));
      renderer.render(shadowScene, camera);
      shadowScene.clear();
      renderer.setRenderTarget(previousTarget);
      await nextFrame();
      renderer.setRenderTarget(target);
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
  }
  // Keep shader variants resident for the room's first shadow pass.
  openingShadowMaterials.push(...shadowMaterials);
}
const openingShadowMaterials = [];

// Resource jobs are cached independently of playable room handles.
const assetJobs = new Map();
const warmedAssetModels = new Map();
function resourceJobs(keys) {
  const jobs = new Map();
  const add = (type, url, run) => jobs.set(`${type}:${url}`, run);
  for (const key of keys) {
    const group = LEVEL_ASSETS[key];
    for (const url of group?.models ?? []) add('model', url, async () => {
      const gltf = await preloadModel(url);
      if (!warmedAssetModels.has(url)) {
        const warm = (async () => {
          // Isolated asset probes, never a playable scene or live camera.
          const probes = gltf.scene.clone(true);
          probes.traverse((node) => { if (node.isMesh) node.castShadow = true; });
          const resourceScene = new THREE.Scene();
          resourceScene.add(probes, new THREE.AmbientLight(0xffffff, 1));
          const resourceCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
          resourceCamera.position.z = 4;
          await renderer.compileAsync(resourceScene, resourceCamera);
          await prepareGpuResources([probes]);
          resourceScene.clear();
        })();
        warmedAssetModels.set(url, warm);
        warm.catch(() => warmedAssetModels.delete(url));
      }
      await warmedAssetModels.get(url);
    });
    for (const url of group?.textures ?? []) add('texture', url, async () => {
      const texture = await preloadTexture(url);
      renderer.initTexture(texture);
    });
    for (const url of group?.fonts ?? []) add('font', url, () => preloadFont(url));
  }
  return jobs;
}

/** Bounded work, real settled-job progress, and one promise per resource. */
async function preloadAssetGroups(keys, onProgress = () => {}) {
  startModelLoads();
  const jobs = [...resourceJobs(keys)];
  let completed = 0;
  let next = 0;
  onProgress(0, jobs.length);
  const worker = async () => {
    while (next < jobs.length) {
      const [id, run] = jobs[next++];
      if (!assetJobs.has(id)) {
        const ready = nextFrame().then(run);
        assetJobs.set(id, ready);
        ready.catch(() => assetJobs.delete(id));
      }
      await assetJobs.get(id);
      onProgress(++completed, jobs.length);
      await nextFrame();
    }
  };
  await Promise.all([worker(), worker()]);
}

let level1PreloadPromise = null;
let level1Ready = false;

/** Only the connected opening pair is constructed during the news report. */
function preloadLevel1() {
  if (!level1PreloadPromise) {
    level1PreloadPromise = (async () => {
      await preloadAssetGroups(['bedroom', 'upstairsHallway']);
      await Promise.all([initializeHands(), initializeHeldTorch(), audio.ready,
        markThoughts.preload('l1'), markThoughts.preload('hallway')]);
      postFX.prepare();
      for (const key of ['bedroom', 'upstairsHallway']) {
        await nextFrame();
        await sceneManager.get(key).prepare();
        enableSinglePassForFlatDecals(sceneManager.get(key).group);
        darkShadowSkipper.addLights(findShadowCastingLights(scene));
        await warmUp({ keys: [key], waitForAssets: false, compileOnly: true, showProgress: false });
        await warmHouseCreature(key === 'bedroom' ? [['bedroom']]
          : [['bedroom', 'upstairsHallway'], ['upstairsHallway']], { compileOnly: true });
        warmedLevelKeys.add(key);
      }
      level1Ready = true;
    })();
  }
  return level1PreloadPromise;
}

/** Level key -> its warm-up, while one is in flight: asked twice, it is paid once. */
const levelWarmUps = new Map();

/**
 * Warms exactly one destination level while something already owns the
 * screen -- a transition, or the stairs scare's beat of black, which warms the
 * backrooms ahead of the way down (user, 2026-10-23: it took far too long).
 */
function warmLevelForTransition(key, { showProgress = true } = {}) {
  if (warmedLevelKeys.has(key)) return Promise.resolve();
  if (!levelWarmUps.has(key)) {
    const warming = (async () => {
      await preloadAssetGroups([key]);
      await sceneManager.get(key)?.prepare?.();
      enableSinglePassForFlatDecals(sceneManager.get(key).group);
      darkShadowSkipper.addLights(findShadowCastingLights(scene));
      await warmUp({ keys: [key], waitForAssets: false, showProgress });
      // And whatever creature can show up there, or its first appearance is a
      // freeze of its own, seconds into the room.
      if (key === 'backrooms') await warmMazeCreature();
      else await warmHouseCreature([[key]]);
      warmedLevelKeys.add(key);
    })().catch((err) => console.warn(`warmLevelForTransition: "${key}"`, err))
      .finally(() => levelWarmUps.delete(key));
    levelWarmUps.set(key, warming);
  }
  return levelWarmUps.get(key);
}

// The menu remains covered until every counted resource job has settled.
const bootHints = ['the walls do not end...', 'it can hear me...', 'feeling along the wall...', 'entering the house...'];
let bootHintIndex = 0;
let nextBootHintAt = performance.now() + 2600;
setLoadProgress(0, bootHints[0]);
const openingAssetsReady = openingNewsCutscene.preload();
const bootJobs = resourceJobs(['common', 'hallwayBasement', 'study', 'backrooms']).size;
let bootAssetsDone = 0;
let openingBootReady = false;
let levelTwoBootReady = false;
const bootReady = Promise.all([
  openingAssetsReady.then(() => { openingBootReady = true; updateBootProgress(); }),
  preloadAssetGroups(['common', 'hallwayBasement', 'study', 'backrooms'], (done) => {
    bootAssetsDone = done;
    updateBootProgress();
  }).then(async () => {
    // Asset caching alone leaves scene creation and the first real lab draw
    // on the hallway exit. Pay that existing warm-up while boot still covers it.
    await warmLevelForTransition('hallwayBasement', { showProgress: false });
    levelTwoBootReady = true;
    updateBootProgress();
  })
]);
function updateBootProgress() {
  if (performance.now() >= nextBootHintAt) {
    bootHintIndex = (bootHintIndex + 1) % bootHints.length;
    nextBootHintAt = performance.now() + 2600;
  }
  setLoadProgress((bootAssetsDone + Number(openingBootReady) + Number(levelTwoBootReady)) / (bootJobs + 2),
    bootHints[bootHintIndex]);
}
bootReady.then(() => {
  setLoadProgress(1);
  showMainMenu();
  loadingScreen.classList.add('is-done');
  console.timeEnd('APP_BOOT');
}).catch((error) => {
  console.error('Initial asset preparation failed:', error);
  loadingHintEl.textContent = 'the way is closed. reload to try again.';
});

// ---------- render loop ----------
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  if (!sceneManager.activeKey || openingSequenceActive) {
    requestAnimationFrame(tick);
    return;
  }
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
  }
  // Only while actually playing; menus and front pages do not spend play time.
  const isPlaying = player.isLocked && !newspaperView.isOpen;
  // The difficulty's clock. Stopped by the same things, and by every moment
  // the player has no control: a fade between rooms, a cutscene, an ending.
  if (isPlaying && !transitionInFlight && !cutscene.isRunning && !stairsScare.isRunning && !hallwayBlinks.isRunning && !endingInFlight) runTimer.update(dt);
  captions.update(dt);
  // Only while it is actually on screen. The AI is not driving it in Level 2 --
  // it is placed by a script -- but it still has to breathe, or a figure
  // standing in a corner reads as a statue rather than as something watching.
  updateDoorwayJoin(dt);
  updateLabCreatureExit(dt);
  if (creatureStanding) creature.update(dt);
  // A scripted appearance's linger, on the frame clock -- see showCreatureAt().
  if (creatureLinger) {
    creatureLinger.remaining -= dt;
    if (creatureLinger.remaining <= 0) {
      const onGone = creatureLinger.onGone;
      hideCreature();
      onGone?.();
    }
  }
  creatureAI.update(dt);
  if (sceneManager.activeKey === 'backrooms') {
    // Never both: one rig, and the hunter owns it outright while it is running.
    // The scare borrows the same figure: leave it alone while that runs.
    if (backroomsHunter.state === 'stopped') { if (!jumpScareRunning) updateBackroomsShadow(dt); }
    else backroomsHunter.update(dt);
    // After the hunter has moved, so a look is judged on where it is now.
    backroomsBarks.update(dt);
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
   * wherever the shot started. A cutscene animates FOV on its OWN camera
   * (cutscene.camera, see core/Cutscene.js), so nothing here has to give way
   * to one.
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
  leftTorch.update(dt, handMotion, hands.root.visible);
  // The camera IS the player's position; the basement reads it to know when
  // they have walked up to the metal door.
  sceneManager.update(dt, camera.position);
  // Spoken captions are always shown for this forced listening moment,
  // following the same tape clock that schedules its recorded voices.
  tapeSubtitles.update();
  updateTapeSounds();

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
  // The scene's frame: after every figure has been posed this frame (the
  // creature, the hunter, the player's body), so its onFrame can act on top of
  // their poses; and held with the captions on Esc, so a shot and its voice
  // line never drift apart. HELD, not skipped: update(0) advances nothing but
  // still re-applies the scene's acting over the poses this frame just reset,
  // which the restart dialog's see-through backdrop would otherwise show
  // snapping upright. See core/Cutscene.js.
  cutscene.update(captions.paused ? 0 : dt);
  tapeFocus.update();
  // On the same clock, so Esc holds it too -- see core/StairsScare.js.
  stairsScare.update(captions.paused ? 0 : dt);
  // After the creature's own update, so the head it cocks is not reset under it.
  hallwayBlinks.update(captions.paused ? 0 : dt);
  stairsFall.update(captions.paused ? 0 : dt);
  // On real time: slow motion must not make a skip take longer.
  cutsceneSkip.update(captions.paused ? 0 : realDt);
  // Switched on the blend rather than the flag, so the swap happens once the
  // camera has actually left the head instead of on the frame the key is hit.
  // The free camera outranks a scene, so a scene can be watched from outside.
  if (freeCamera.isActive) postFX.setCamera(freeCamera.camera);
  else if (cutscene.isRunning) postFX.setCamera(cutscene.camera);
  else postFX.setCamera(thirdAmount > 0.001 ? thirdCam : camera);

  // After everything that moves the player, the hunter and the creature, so
  // the ears and every emitter are where this frame drew them.
  audioDirector.update(dt);
  if (sceneManager.activeKey === 'hallwayBasement' && !generatorProgressStarted
    && hallwayBasement.refs.powerStage === 'blackout' && player.moving > 0.5) {
    hallwayBasement.refs.generator.getWorldPosition(generatorHintPosition);
    if (Math.hypot(camera.position.x - generatorHintPosition.x,
      camera.position.z - generatorHintPosition.z) < 2.5) generatorProgressStarted = true;
  }
  if (sceneManager.activeKey === 'hallwayBasement' && player.isLocked
    && !transitionInFlight && !cutscene.isRunning && !captions.paused && breakerHintSeconds !== null) {
    breakerHintSeconds -= dt;
    if (breakerHintSeconds <= 0) {
      breakerHintSeconds = null;
      thought('l2_23', { when: () => !breakerEngaged
        && hallwayBasement.refs.powerStage === 'running' && !hallwayBasement.refs.breakerCoverOpen });
    }
  }
  markThoughts.update({ blocked: transitionInFlight || caughtInFlight || tapePlaying
    || cutscene.isRunning || jumpScareRunning || labCreatureExit?.phase === 'run' || !player.isLocked
    || (sceneManager.activeKey === 'hallwayBasement' && performance.now() < levelTwoCriticalUntil) });

  postFX.update(dt);
  // The rush's blackout overrides every light the levels and the storm set
  // above, so it goes after all of them.
  applyHouseBlackout();
  // After everything that sets a light's intensity this frame, so a light that
  // has just come on gets a fresh shadow in the very frame it lights.
  darkShadowSkipper.update();
  // Not under the opening report, which covers the whole screen: a room's
  // first draw blocks the page and would stall the report. The rooms are
  // warmed behind it and the loading bar instead (scheduleRoomWarmUp).
  if (!openingNewsCutscene.isOpen) postFX.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
