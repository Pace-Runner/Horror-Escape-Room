import * as THREE from 'three';
import { PointerLockPlayer, SENSITIVITY_MIN, SENSITIVITY_MAX } from './core/PointerLockPlayer.js';
import { WALK_SPEED } from './core/MoveSpeeds.js';
import { SceneManager } from './core/SceneManager.js';
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
import { gameState, resetState, addItem, removeItem } from './core/GameState.js';
import { MAIN_ONLY } from './core/RenderLayers.js';
import { createMinimap } from './core/Minimap.js';
import { CaptionSequencer } from './core/CaptionSequencer.js';
import { createDocumentUI } from './core/DocumentUI.js';
import { createPostFX } from './world/Postprocessing.js';
import { createCutsceneRunner } from './core/Cutscene.js';
import { createScriptRunner } from './core/Script.js';
import { createCreature } from './systems/Creature.js';
import { createCreatureAI } from './systems/CreatureAI.js';
import { createBackroomsHunter } from './systems/BackroomsHunter.js';
import { createVisor } from './core/Visor.js';
import { BEATS, DOCUMENTS, ENDINGS } from './story/lines.js';
import { Hands } from './systems/hands/hands.js';
import { HELD_MAGNIFICATION } from './systems/hands/sockets.js';
import { setHandAssetUrl } from './systems/hands/hand-mesh.js';
import handsModelUrl from './assets/models/hands.glb?url';
import { loadModel } from './world/modelLoader.js';
import flashlightModelUrl from './assets/models/flashlight.glb?url';

// ---------- DOM ----------
const canvas = document.getElementById('scene');
const loadingScreen = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const startTitle = document.getElementById('start-title');
const startSub = document.getElementById('start-sub');
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const objectiveEl = document.getElementById('objective');
const promptEl = document.getElementById('interact-prompt');
const captionEl = document.getElementById('caption-box');
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

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
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
// is safe to call before init() has finished.
hands.init().then(equipTorch).catch((err) => {
  console.error('Failed to initialise the first-person hands:', err);
});

// ---------- the torch, once it is actually in hand ----------
// A SECOND instance of flashlight.glb, separate from the one dressed onto the
// nightstand in bedroomLevel.js. Two copies rather than re-parenting the world
// prop, because the level owns that one and its reset() puts it back on the
// table -- moving it into the hand would leave reset() restoring a torch that
// is no longer there. It genuinely is a second fetch, not a cache hit
// (THREE.Cache is off by default), but at 300 KB against an already-warm HTTP
// cache that is cheaper than the bookkeeping of sharing one instance between a
// world prop and a view model.
//
// RIGHT hand, not the left the README's handedness convention asks for: the
// game builds the right hand only (ACTIVE_SIDES in systems/hands/hands.js), and
// that file's own note says a torch then goes in the right hand's grip socket.
const TORCH_HAND = 'right';

/**
 * Where the hands sit while the torch is held, as a camera-space offset.
 *
 * hold-torch turns the wrist ~87 degrees to aim the beam forward, and a joint
 * rotation pivots about that joint. The wrist sits BELOW the bottom of the frame
 * (measured at -1.10 in normalised device coordinates), so rotating about it
 * swung the whole hand out of shot: every fingertip measured off screen, at
 * x 0.71..1.24 and y -1.04..-1.48, leaving just the torch head poking into the
 * corner. Aiming the torch and framing the hand are two different problems and
 * this is the second one.
 *
 * Hands.root exists for exactly this - its own docstring says "framing/
 * visibility is one transform" - and translating it moves hand and torch
 * together without touching the aim.
 *
 * Solved against the GRIP, not the fingertips: the glove is hidden while the
 * torch is held (see setGloveVisible), so the torch is the only thing on screen
 * and the only thing worth framing. This value puts the grip at roughly
 * (0.50, -0.56) in normalised device coordinates and the bezel at
 * (0.21, -0.15), which is the torch low in the bottom-right corner with its
 * head reaching back toward the middle of the frame and its tail running off
 * the corner.
 */
const TORCH_FRAMING_OFFSET = new THREE.Vector3(-0.1536, 0.1506, 0.0500);

/**
 * How far the whole hand is spun about the beam while holding the torch.
 *
 * The beam leaves a closed fist along the pinky-to-index axis, so aiming it
 * forward decides WHERE it points but not which face of the fist the camera
 * ends up looking at - and at 0 the camera got the BACK of the hand, with the
 * hand itself hiding the barrel it was supposed to be showing off. Rolling
 * about the beam axis cannot change the beam direction (it is a rotation about
 * that very axis), so this buys the good read for free: the torch presented to
 * the camera, fingers wrapped visibly around the knurl, hand behind it.
 *
 * 60 degrees, chosen by rendering the player's actual view across a full sweep
 * and matching it against a reference frame the project owner supplied: the hand
 * grips from the right with the fingers wrapping visibly around the left of the
 * barrel. At 0 the camera gets the palm and splayed fingers; by 120 the hand has
 * swung around the socket far enough to sit between the lens and the torch.
 */
const TORCH_ROLL = THREE.MathUtils.degToRad(60);

const _torchVec = new THREE.Vector3();
const _torchQuat = new THREE.Quaternion();

/**
 * The frame's player motion, handed to the hands' procedural layers.
 *
 * One object reused every frame, not a fresh literal: this crosses into
 * per-frame code that the hands module holds to a zero-allocation rule, and a
 * new object here sixty times a second would defeat that from the outside.
 */
const handMotion = { lookDeltaX: 0, lookDeltaY: 0, bobPhase: 0, speed: 0, crouching: false };

/**
 * Spins the hand about the beam and re-frames it, keeping the torch put.
 *
 * The roll goes on `hands.root` as a RIGID rotation rather than into the wrist
 * pose, so it costs no extra skin shear on top of the 87 degrees hold-torch
 * already spends at that joint.
 *
 * The catch is that rotating hands.root turns everything about the CAMERA
 * origin, not about the hand - which swings the hand toward the lens and made it
 * balloon to fill the frame. So the translation is solved afterwards to put the
 * grip back exactly where it was before the roll (plus the framing offset),
 * which turns "rotate about the camera" into "rotate about the socket".
 *
 * Solved live rather than baked into constants: it reads the socket's real
 * position each time, so it stays correct if HAND_ROOT_POSITION, the pose or the
 * socket placement ever move.
 */
/**
 * Shows or hides the GLOVE, leaving whatever it is holding on screen.
 *
 * Not hands.setVisible(): that hides hands.root, and the torch is parented into
 * one of the hand's sockets, so it lives under hands.root too and would vanish
 * with it. Only the skinned meshes are toggled - the bones stay in the graph and
 * keep animating, which matters because socket.grip hangs off the wrist bone and
 * is what puts the torch where it is. Hide the geometry, keep the skeleton.
 */
function setGloveVisible(visible) {
  const heldMeshes = new Set();
  if (heldTorch) heldTorch.traverse((o) => { if (o.isMesh) heldMeshes.add(o); });
  hands.root.traverse((o) => {
    if (o.isMesh && !heldMeshes.has(o)) o.visible = visible;
  });
}

function frameTorch() {
  const socket = hands.getSocket(TORCH_HAND, 'grip');
  if (!socket) return;

  // Measure from a clean slate, so calling this twice is idempotent.
  hands.root.position.set(0, 0, 0);
  hands.root.quaternion.identity();
  camera.updateMatrixWorld(true);

  // hands.root is a child of the camera, so its parent space IS camera space -
  // which is the frame the roll axis and the offset have to be expressed in.
  const before = camera.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
  const beam = _torchVec.set(0, 1, 0)
    .applyQuaternion(socket.getWorldQuaternion(_torchQuat))
    .applyQuaternion(camera.getWorldQuaternion(_torchQuat).invert())
    .normalize()
    .clone();

  hands.root.quaternion.setFromAxisAngle(beam, TORCH_ROLL);
  camera.updateMatrixWorld(true);

  const after = camera.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
  hands.root.position.copy(before).add(TORCH_FRAMING_OFFSET).sub(after);
}

let heldTorch = null;
let torchEquipped = false;

/**
 * Puts the torch in the hand once BOTH halves are ready.
 *
 * Three independent things have to land first - the hand asset, the torch
 * asset, and the player actually picking it up - and they can finish in any
 * order, so every one of them calls this and whichever is last does the work.
 * Guarding on getSocket() rather than on a flag from init() also covers the
 * case where the hands failed to load: attach() would warn once and do nothing,
 * and the torch would silently never appear.
 */
function equipTorch() {
  if (torchEquipped || !heldTorch || !flashlightFound) return;
  if (!hands.getSocket(TORCH_HAND, 'grip')) return;
  hands.attach(TORCH_HAND, heldTorch, 'grip');
  // 'hold-torch', not 'grip-cylinder': the grip pose only shapes the hand
  // around the shaft, and on its own that leaves the beam pointing out to the
  // side. hold-torch layers the forearm and wrist rotation that aims it down
  // the eyeline. See systems/hands/poses/hold-torch.js.
  hands.setPose(TORCH_HAND, 'hold-torch');
  frameTorch();
  // The glove comes off screen once the torch is in hand: only the torch is
  // shown from here. The pose and the socket still do their work - they are what
  // puts the torch where it is - the geometry is just not drawn.
  setGloveVisible(false);
  torchEquipped = true;
}

function unequipTorch() {
  if (!torchEquipped) return;
  hands.detach(TORCH_HAND);
  // Detached first, so nothing is excluded and the whole glove comes back.
  setGloveVisible(true);
  hands.setPose(TORCH_HAND, 'relaxed');
  hands.root.position.set(0, 0, 0);
  hands.root.quaternion.identity();
  torchEquipped = false;
}

loadModel(flashlightModelUrl).then((torch) => {
  torch.traverse((child) => {
    if (!child.isMesh) return;
    // A view model casts no shadows: it is inches from the near plane, so its
    // own shadow would be an enormous smear across whatever the player is
    // looking at, and it is not in the physics world to begin with.
    child.castShadow = false;
    child.receiveShadow = false;
  });
  // Scaled up for legibility in the hand. The factor lives in sockets.js
  // because the grip socket's barrel placement and poses/grip-cylinder.js are
  // both fitted to the magnified radius -- see HELD_MAGNIFICATION there.
  torch.scale.setScalar(HELD_MAGNIFICATION);
  heldTorch = torch;
  equipTorch();
}).catch((err) => {
  console.error('Failed to load the held flashlight, it will stay unlit in hand:', err);
});

let flashlightFound = false;
let flashlightOn = false;
function setFlashlight(on) {
  flashlightOn = on && flashlightFound;
  // The spill drops well below the old 2.4: it is now filling AROUND a hot
  // spot rather than being the whole beam, and leaving both at full strength
  // would just be a brighter blob.
  flashlightSpot.intensity = flashlightOn ? 1.75 : 0;
  flashlightHot.intensity = flashlightOn ? 3.35 : 0;
  dustMotes.setBeamOn(flashlightOn);
  flashlightStateEl.textContent = !flashlightFound ? 'not found' : flashlightOn ? 'on' : 'off';
  flashlightStateEl.classList.toggle('on', flashlightOn);
}

// ---------- inventory ----------
// Inventory visibility and first-person presentation are intentionally
// separate. A hotbar item is not permission to parent an arbitrary world mesh
// into the hand rig; only the torch has an authored socket, scale and pose.
const FIRST_PERSON_HELD_ITEM_IDS = new Set(['flashlight']);

function equipSupportedFirstPersonItem(id) {
  if (!FIRST_PERSON_HELD_ITEM_IDS.has(id)) return;
  equipTorch();
}

/** Adds an item, equips only supported view models, and redraws the HUD. */
function pickUpItem(id) {
  addItem(id);
  equipSupportedFirstPersonItem(id);
  refreshInventoryUI();
}
function dropItem(id) {
  removeItem(id);
  refreshInventoryUI();
}
function refreshInventoryUI() {
  hotbarSlots.forEach((slot) => {
    slot.classList.toggle('filled', gameState.inventory.has(slot.dataset.item));
  });
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
 * ONE creature for the whole game, parented to the world root rather than to
 * any level.
 *
 * It is the same person in every room -- that is the entire twist -- so giving
 * each level its own would be building the lie into the code. It lives here,
 * hidden, and a level's beats make it visible where they want it. Levels sit at
 * the world origin, so level coordinates and world coordinates are the same
 * numbers, which is what makes this safe.
 */
const creature = createCreature();
creature.visible = false;
worldRoot.add(creature.group);

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
        if (!await s.play('Something closes around your arm and hauls you back.')) return;
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
        await s.play("You're back by the door. Whatever had you has let go.");
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

const bedroom = createBedroomLevel({
  showCaption,
  // The paperclip's own 900ms delay before onFreed IS the time the player
  // spends picking the lock, so the loop plays for exactly as long as the
  // story already says it takes -- no separate duration to keep in sync.
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
    // freed is what stops it. stop() leaves the joints wherever the loop left
    // them; blendToPose eases the rest of the way back to a normal hand
    // rather than snapping.
    hands.stop('right');
    hands.blendToPose('right', 'relaxed', 0.3);
    // Was two bare setTimeouts at 4200 and 9000 ms that nothing cancelled, so
    // pressing R inside that window blew the bulb of the freshly restarted room
    // several seconds later with no way to work out why. Now a script: every
    // await returns false once a restart has bumped the generation.
    script.run(async (s) => {
      if (!await s.play(BEATS.freed)) return;
      if (!await s.wait(1.4)) return;
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
      if (!await s.play(BEATS.bulbBlows)) return;
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
    setFlashlight(true);
    equipTorch();
    pickUpItem('flashlight');
    // The storm goes back to a normal rhythm: the player can see for themselves
    // now, so the lightning stops being the only way to navigate.
    bedroomStorm.calm();
    captions.play(BEATS.flashlightOn);
    runBedroomHorrorEvent('flashlight-sound', (s) => {
      s.do(() => {
        bedroom.refs.disturbChair();
        audio.footsteps({ count: 1, pan: -0.45, level: 0.24 });
      });
    });
  },
  onBrassKeyFound: () => {
    // The right hand is already posed and framed around the held torch. The
    // generic pickup clip temporarily replaces that pose, even though the
    // brass key has no supported first-person mesh or socket presentation.
    // Keep this puzzle key inventory-only; the safe reads its game state.
    pickUpItem('brassKey');
  },
  onBrassKeyUsed: () => dropItem('brassKey'),
  onCrowbarFound: () => {
    pickUpItem('crowbar');
  },
  onCrowbarUsed: () => dropItem('crowbar'),
  onBedroomKeyFound: () => {
    pickUpItem('bedroomKey');
  },
  onBedroomKeyUsed: () => dropItem('bedroomKey'),
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
      if (!await s.play(BEATS.scratches)) return;
      if (!await s.wait(0.8)) return;
      s.do(() => {
        // Sound and picture start together. The steps sweep left to right past
        // the door, and the strip of light under it is broken as they pass.
        audio.footsteps({ count: 7, spacing: 0.62, pan: -0.8, panTo: 0.8, level: 0.55 });
        bedroom.refs.playDoorPass();
        // It is right outside. Nothing in the game has been this close yet.
        audio.setBreathing(LEVEL_ONE_DOOR_BREATHING);
      });
      if (!await s.play(BEATS.pastTheDoor)) return;
      s.do(() => {
        objectiveEl.textContent = 'Escape the house without getting caught.';
        audio.setBreathing(LEVEL_ONE_BREATHING_BASE);
      });
    });
  },

  onExaminePolaroid: () => {
    captions.play(BEATS.polaroid);
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

/**
 * Which CCTV sightings have already played this run. Local rather than in
 * GameState because they do not cross a level boundary -- and a restart rebuilds
 * this level anyway, so its reset() clears them.
 */
const cctvSeen = new Set();

/**
 * Where it stands after camera five. The far corner of the lab, on the opposite
 * side from the desk, so turning round from the monitor puts it in frame.
 */
const CORNER = [-2.6, 7.7];
/** True while it is standing there, so the frame loop keeps it breathing. */
let creatureStanding = false;

const hallwayBasement = createHallwayBasementLevel({
  showCaption,
  onExit: () => exitLevel('hallwayBasement'),

  onPowerRestored: () => {
    script.run(async (s) => {
      if (!await s.play(BEATS.powerRestored)) return;
    });
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
      onRead: () => captions.play(BEATS.creatureSketch)
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
        await s.play(BEATS.cctvDash);
      });
      return;
    }

    if (id === 'basement') {
      // Camera five is this room. There is a figure standing in it.
      hallwayBasement.refs.feeds.showBasementFigure(3.4);
      script.run(async (s) => {
        if (!await s.wait(0.6)) return;
        s.do(() => audio.setBreathing(0.95));
        if (!await s.play(BEATS.cctvBasement)) return;
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
          creature.reset();
          creature.setPosition(CORNER[0], CORNER[1]);
          creature.setYaw(Math.atan2(-(camera.position.x - CORNER[0]), -(camera.position.z - CORNER[1])));
          creature.setSpeed(0);
          creature.visible = true;
          creatureStanding = true;
        });
        if (!await s.play(BEATS.creatureCorner)) return;
        s.do(() => {
          creature.visible = false;
          creatureStanding = false;
          hallwayBasement.refs.revealPool();
          // Back off: it has gone, and the room is only as bad as it was.
          audio.setBreathing(0.6);
        });
        if (!await s.wait(0.6)) return;
        await s.play(BEATS.blackPool);
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
    captions.play([
      'The porch. Rain, and the treeline past the fence.',
      'The gate is padlocked, and the key is not on this side of it.'
    ]);
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
      if (!await s.play(BEATS.shadowWrong)) return;
    });
  },

  onTakeVisor: () => {
    hands.play('right', 'pickup', { fade: 0.15 });
    visor.take();
    pickUpItem('visor');
    objectiveEl.textContent = 'Put the visor on. [V]';
    captions.play(BEATS.visorFound);
  },
  onTakeDoorKey: () => {
    hands.play('right', 'pickup', { fade: 0.15 });
    pickUpItem('doorKey');
  },

  /**
   * Mark's letter, which is where the game explains itself. It only says
   * anything with the visor on -- the writing is not hidden from the room, it
   * is hidden from the player, exactly like the fourth figure in the portrait.
   */
  onReadLetter: () => {
    if (!gameState.visorWorn) {
      showCaption('A sheet of paper, face up on the boards. Blank on both sides.');
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
          if (!await s.play(BEATS.realisation)) return;
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
          if (!await s.play(BEATS.annabelle)) return;
          s.do(() => { objectiveEl.textContent = 'Decide.'; });
          if (!await s.play(BEATS.theChoice)) return;
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
    hands.play('right', 'pickup', { fade: 0.15 });
    pickUpItem('gateKey');
    captions.play([
      'A key, hanging on the side of the mirror frame.',
      'It has been there the whole time. You simply could not see it.'
    ]);
  },

  /**
   * The mirror. The single most important interaction in the game, and it only
   * does its job with the visor on -- which is the point: the player has to
   * have chosen to look.
   */
  onLookInMirror: () => {
    if (!gameState.visorWorn) {
      showCaption('The first mirror in this house that is not cracked. Your reflection looks like you.');
      return;
    }
    script.run(async (s) => {
      if (!await s.play(BEATS.mirror)) return;
      s.do(() => {
        objectiveEl.textContent = 'Read the letter.';
        audio.setBreathing(0.35);
      });
    });
  }
});
sceneManager.register('study', study);

// Not a "level 4": ONE interstitial instance, re-armed per crossing by
// setRoute(). It hands its route back through onExit rather than reading a
// module-level global, so there is exactly one way to arm it and no way to
// activate it unarmed.
const backrooms = createBackroomsLevel({
  showCaption,
  onExit: (route) => transitionTo(route?.to ?? 'hallwayBasement')
});
sceneManager.register('backrooms', backrooms);

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
  creature,
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
 * CORRECTION IS DELIBERATELY PARTWAY, not the clean Annabelle reading and
 * not the full Hollow either -- see Creature.js's two proportion sets. A
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
    creature.visible = false;
    // Back to the default layer mask, or the AI chase / scripted placements
    // elsewhere would inherit this system's minimap-hiding trick.
    creature.group.layers.set(0);
    // And back to a normally-lit figure, or the same leak happens with the
    // silhouette colour multiplier instead.
    creature.setSilhouette(false);
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
      creature.setSpeed(speed);
    }
    backroomsShadowPos = found;
  }

  if (!shouldShow) {
    if (backroomsShadowVisible) {
      creature.visible = false;
      creature.group.layers.set(0);
      backroomsShadowVisible = false;
      // Stamped on the way OUT, so the cooldown measures the gap between
      // sightings rather than the time since some arbitrary frame.
      backroomsShadowHidAt = backroomsWalked;
    }
    return;
  }

  if (!backroomsShadowVisible) {
    creature.reset();
    creature.setCorrection(BACKROOMS_SHADOW_CORRECTION);
    // A lit, textured rig at corridor range reads as exactly what it is --
    // boxes and capsules. Silhouette mode multiplies the correction colour
    // down near-black regardless of nearby fixture light, so what shows is a
    // dark shape, not a small mannequin under a ceiling lamp.
    creature.setSilhouette(true);
    // MAIN_ONLY: visible to the player, never to the minimap's own camera --
    // this is a glimpse, not something to confirm by checking the radar.
    creature.group.layers.set(MAIN_ONLY);
    backroomsShadowVisible = true;
  }
  creature.setPosition(found.x, found.z);
  // Faces the player, the same convention every other placement in this file
  // uses -- being looked back at is the entire point of it existing.
  creature.setYaw(Math.atan2(-(px - found.x), -(pz - found.z)));
  creature.visible = true;
  creature.update(dt);
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
 * intensity. A dedicated light fixes this without touching the room: it is
 * scoped to REVEAL_LAYER, which only the creature is ever put on, so it
 * illuminates her and nothing else -- the walls stay exactly as dark as
 * they already were.
 */
let windowFlashArmed = false;
let windowFlashUsed = false;
const WINDOW_REVEAL_LAYER = 6;
let windowRevealLight = null;

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

      // layers are NOT inherited by children in three.js -- every mesh in the
      // rig needs the bit set directly, or a light scoped to this layer would
      // illuminate nothing (the top-level group has no geometry of its own).
      creature.group.traverse((o) => o.layers?.enable(WINDOW_REVEAL_LAYER));
      windowRevealLight = new THREE.DirectionalLight(0xbcd4ff, 8);
      windowRevealLight.layers.set(WINDOW_REVEAL_LAYER);
      windowRevealLight.position.set(-2.1, 2.3, wz - 0.1);
      windowRevealLight.target.position.set(-2.1, 1.6, wz - 0.9);
      bedroom.group.add(windowRevealLight, windowRevealLight.target);

      const shownFor = bedroomStorm?.flashDuration || 0.2;
      script.run(async (s) => {
        if (!await s.wait(shownFor)) return;
        s.do(hideWindowReveal);
      });
    }
  },
  onBlow: () => audio.bulbPop()
});

/** Hides the window-flash figure and tears down its dedicated light -- see the note above. */
function hideWindowReveal() {
  creature.visible = false;
  creatureStanding = false;
  if (windowRevealLight) {
    bedroom.group.remove(windowRevealLight, windowRevealLight.target);
    windowRevealLight = null;
  }
  creature.group.traverse((o) => o.layers?.disable(WINDOW_REVEAL_LAYER));
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
        creature.setYaw(Math.PI);        // facing back down the hallway at you
        creature.setSpeed(0);
        creature.visible = true;
        hallwayBasement.refs.strike(0.55);
        audio.thunder();
      });
      // Gone before the light is. It was only ever there for the flash.
      if (!await s.wait(0.45)) return;
      s.do(() => { creature.visible = false; });
      await s.play(BEATS.hallwaySighting);
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
      if (!await s.play('It has you. The corridor goes out like a bulb.')) return;
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
      await s.play('Back at the mouth of the corridor. It is still in here.');
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
  const isBedroomRestraintActive = key === 'bedroom' && !level.refs.puzzleState.chainsEscaped;
  player.setLookBounds(isBedroomRestraintActive ? BEDROOM_RESTRAINED_LOOK_BOUNDS : null);
  interaction.setTargets(level.interactables);
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
  // activated. Harmless when nothing was playing, and safe even with the
  // torch equipped -- that pose is set directly via setPose(), which the
  // animator's clip player never touches (see animator.js).
  hands.stop('right');
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
  fade.clear();
  interaction.setEnabled(true);
  player.lookEnabled = true;
}

async function transitionTo(key, { lockMovement = false, outMs = 700, holdMs = 140, inMs = 900 } = {}) {
  if (transitionInFlight) return null;
  transitionInFlight = true;
  const mine = ++transitionGeneration;
  freezePlayerForTransition();

  try {
    await fade.fadeOut(outMs);
    if (mine !== transitionGeneration) return null;   // aborted mid-fade
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
  if (!route.via) { await transitionTo(route.to); return; }

  const interstitial = sceneManager.get(route.via);
  // Degrade to a plain cut rather than trapping the player, if the interstitial
  // is ever missing or does not implement the arming contract.
  if (!interstitial?.setRoute) { await transitionTo(route.to); return; }
  // Armed BEFORE activateLevel, so the destination, the re-armed exit door and
  // spawn/spawnYaw are all in place by the time SceneManager reads them.
  backroomsFrom = fromKey;
  interstitial.setRoute({ from: fromKey, ...route });
  await transitionTo(route.via);
}

// ---------- game reset (restart without page refresh) ----------
function resetGame() {
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
  bedroom.refs.ambient.intensity = AMBIENT_LIT;
  // A fresh run gets to see the window glimpse again. hideWindowReveal() also
  // covers a restart landing mid-flash, which would otherwise leave its
  // dedicated light and the creature's extra render layer behind forever.
  windowFlashArmed = false;
  windowFlashUsed = false;
  hideWindowReveal();
  flashlightFound = false;
  setFlashlight(false);
  // A restart mid-clip (R pressed while, say, the lockpick loop is still
  // going) must not carry an animator clip across into the freshly reset
  // room -- unequipTorch() below only resets the hand when a torch was
  // actually equipped, which the lockpick beat predates.
  hands.stop('right');
  hands.setPose('right', 'relaxed');
  unequipTorch();
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
  if (e.code === 'Digit1') { abortTransition(); activateLevel('bedroom', { lockMovement: false }); }
  if (e.code === 'Digit2') {
    // Gated on the bedroom's own front door actually being open (planks
    // pried off + door interacted with again) rather than jumping
    // straight to Level 2 regardless of progress. With the interstitial in
    // place, 2 now means "put me in Level 2 NOW", skipping the corridor.
    if (bedroom.refs.puzzleState.doorUnlocked) {
      abortTransition();
      activateLevel('hallwayBasement');
    } else {
      showCaption("You haven't opened the door yet.");
    }
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
    // Works by handing the door its own crowbar and calling its real interact
    // twice (first press pries the planks, second opens it) rather than
    // reaching in and setting puzzleState.doorUnlocked directly -- that way the
    // plank meshes, captions and exit timing all come from the shipping code
    // path instead of a debug copy of it that could drift.
    if (sceneManager.activeKey !== 'bedroom') {
      showCaption('[debug] G only works from the bedroom.');
    } else {
      // The corridor's dark gaps are designed around having a torch, and
      // skipping the chain means never picking one up.
      flashlightFound = true;
      setFlashlight(true);
      equipTorch();
      // The opening beat leaves the player chained; the door does not free
      // them, onFreed does.
      player.movementEnabled = true;
      bedroom.refs.puzzleState.hasCrowbar = true;
      const door = bedroom.refs.doorSlab.userData.interact;
      door.onInteract();   // pries the planks off
      door.onInteract();   // opens it -> exitLevel('bedroom')
    }
  }
  if (e.code === 'KeyF') setFlashlight(!flashlightOn);
  if (e.code === 'KeyV') {
    const result = visor.toggle();
    if (result === 'none') {
      showCaption('You are not carrying anything to see with.');
    } else {
      captions.play(result === 'on' ? BEATS.visorFirstWorn : BEATS.visorRemoved);
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
    await cutscene.playToBlack({
      points: [from, [2.2, 3.2, 12.0], [0.6, 7.5, 20.0], [-1.5, 12.0, 30.0]],
      lookAt: (t) => [2.5, 1.4 + t * 1.2, 3.0],
      seconds: 13,
      fadeMs: 2200,
      body: () => captions.play(ENDINGS[which])
    });

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
creditsCloseBtn.addEventListener('click', () => toggleCredits(false));

// ---------- settings ----------
// Volume, mouse sensitivity and captions, persisted in localStorage so they
// survive a page reload -- the only thing in this project that does, since
// there is otherwise no save system. Loaded and applied once at boot, well
// before beginGame(): a player who opens Settings from the start screen
// before ever clicking "begin" still hears/feels the right values from their
// very first frame.
const SETTINGS_STORAGE_KEY = 'dontLetItOut.settings';
const DEFAULT_SETTINGS = { volume: 50, sensitivity: 100, captions: true };

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
    if (!await s.wait(0.9)) return;
    fade.fadeIn(2600);
    await s.play(BEATS.wake);
  });
}

let gameStarted = false;
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
  startTitle.textContent = 'PAUSED';
  startSub.textContent = '';
  startButton.textContent = 'Click to resume';
  restartButton.classList.remove('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  promptEl.style.display = 'none';
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
    creatureAI,
    backroomsHunter,
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
    equipTorch,
    // Sprint is on a held key the harness cannot press meaningfully, and the
    // FOV/stamina are the observable results, so tests reach them here.
    get fov() { return camera.fov; },
    BASE_FOV,
    // Flips the same flag the bedroom's flashlight pickup does, so a headless
    // test can put the torch view-model in hand without faking pointer lock
    // and the real pickup interaction.
    forceFlashlightFound: () => { flashlightFound = true; setFlashlight(true); equipTorch(); },
    pickUpItem,
    refreshInventoryUI,
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

// ---------- loading screen (procedural world, so this is a short polish beat) ----------
let progress = 0;
const loadTimer = setInterval(() => {
  progress = Math.min(100, progress + 12 + Math.random() * 18);
  loadingBarFill.style.width = `${progress}%`;
  if (progress >= 100) {
    clearInterval(loadTimer);
    setTimeout(() => loadingScreen.classList.add('hidden'), 250);
  }
}, 110);

// ---------- render loop ----------
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
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
  // The torch is what the player actually sees move here - the glove is hidden
  // once it is picked up - and it moves because these layers offset the hand
  // root, which the grip socket hangs off. walkbob's weight follows the player's
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
  hands.update(dt, elapsed, handMotion);
  sceneManager.update(dt);

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

  postFX.update(dt);
  postFX.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
