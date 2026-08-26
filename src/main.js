import * as THREE from 'three';
import { PointerLockPlayer } from './core/PointerLockPlayer.js';
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
const creditsScreen = document.getElementById('credits-screen');
const creditsList = document.getElementById('credits-list');
const creditsCloseBtn = document.getElementById('credits-close');

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

const scene = new THREE.Scene();
const worldRoot = new THREE.Group();
scene.add(worldRoot);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- player ----------
const player = new PointerLockPlayer(camera, renderer.domElement);

// handheld flashlight -- a spotlight attached to the camera so it always
// points wherever the player looks, only added to the camera once found
const flashlightSpot = new THREE.SpotLight(0xfff2c0, 0, 9, THREE.MathUtils.degToRad(28), 0.4, 1.4);
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

// dust motes drifting through the flashlight cone (custom shader material,
// see world/DustMotes.js) -- shares the spotlight's own angle/distance so
// the visible dust field always matches the light it's supposedly floating
// in, and is a child of the camera for the same reason the spotlight is.
const dustMotes = createDustMotes({ coneAngleRad: THREE.MathUtils.degToRad(28), maxDistance: 9 });
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
  flashlightSpot.intensity = flashlightOn ? 2.4 : 0;
  dustMotes.setBeamOn(flashlightOn);
  flashlightStateEl.textContent = !flashlightFound ? 'not found' : flashlightOn ? 'on' : 'off';
  flashlightStateEl.classList.toggle('on', flashlightOn);
}

// ---------- audio ----------
const audio = new AudioEngine();

// ---------- interaction / captions ----------
const interaction = new Interaction(camera, promptEl, captionEl);
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

const bedroom = createBedroomLevel({
  showCaption,
  onFreed: () => {
    player.movementEnabled = true;
    objectiveEl.textContent = 'Escape the house without getting caught.';
    showCaption('You stand up. Somewhere in the dark, floorboards creak.');
    setTimeout(() => {
      bedroomStorm.blowBulb();
      showCaption('The bulb flickers and blows. You are in the dark.');
      // Losing the bulb is the beat where the presence stops being background
      // texture, so the breathing comes up with the darkness.
      audio.setBreathing(0.8);
    }, 4200);
    setTimeout(() => audio.creak(), 9000);
  },
  onFlashlightPicked: () => {
    flashlightFound = true;
    setFlashlight(true);
    equipTorch();
  },
  onDoorOpened: () => activateLevel('hallwayBasement'),
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

const hallwayBasement = createHallwayBasementLevel({
  showCaption,
  onExit: () => activateLevel('study')
});
sceneManager.register('hallwayBasement', hallwayBasement);

const study = createStudyLevel({ showCaption });
sceneManager.register('study', study);

const bedroomStorm = new Storm({
  bulbLight: bedroom.refs.bulbLight,
  lightningLight: bedroom.refs.lightning,
  onFlash: () => audio.thunder()
});

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
  study: 'Preview: the study and front door (Level 3 blockout).'
};

const LEVEL_FOG = {
  bedroom: new THREE.FogExp2(0x05070a, 0.065),
  hallwayBasement: new THREE.FogExp2(0x0a0c0a, 0.03),
  study: new THREE.FogExp2(0x0c0a06, 0.02)
};

function activateLevel(key, { lockMovement = false } = {}) {
  const level = sceneManager.activate(key, player);
  interaction.setTargets(level.interactables);
  scene.fog = LEVEL_FOG[key];
  objectiveEl.textContent = LEVEL_OBJECTIVES[key];
  captionEl.classList.remove('visible');
  player.movementEnabled = !lockMovement;
  return level;
}

// ---------- game reset (restart without page refresh) ----------
function resetGame() {
  bedroom.reset();
  bedroom.refs.bulbLight.intensity = bedroomStorm.bulbBaseIntensity;
  bedroomStorm.bulbBlown = false;
  flashlightFound = false;
  setFlashlight(false);
  unequipTorch();
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
  if (e.code === 'Digit1') activateLevel('bedroom', { lockMovement: false });
  if (e.code === 'Digit2') {
    // Gated on the bedroom's own front door actually being open (planks
    // pried off + door interacted with again) rather than jumping
    // straight to Level 2 regardless of progress.
    if (bedroom.refs.puzzleState.doorUnlocked) {
      activateLevel('hallwayBasement');
    } else {
      showCaption("You haven't opened the door yet.");
    }
  }
  if (e.code === 'Digit3') activateLevel('study');
  if (e.code === 'KeyF') setFlashlight(!flashlightOn);
  if (e.code === 'KeyR') resetGame();
  if (e.code === 'KeyC') toggleCredits(true);
});

// ---------- credits ----------
const CREDITS = [
  'Three.js -- 3D rendering library (three.js authors, MIT licence) -- threejs.org',
  'PointerLockControls -- Three.js official examples module (MIT licence)',
  'Vite -- build tool used to produce the deployment bundle (MIT licence)',
  'All textures are generated procedurally on <canvas> at runtime -- no image assets used.',
  'Wind, thunder and creaks are synthesised with the Web Audio API at runtime -- no audio files used.',
  'The looping breathing track is the one audio file in the project (src/assets/audio/breathing.m4a).',
  // TODO: replace this line with the real source, author and licence of the
  // breathing loop that gets dropped into src/assets/audio -- or delete it if
  // the loop was recorded by the team.
  'Breathing loop -- [SOURCE / AUTHOR / LICENCE TO BE FILLED IN].',
  'Game concept, story, world and code: the project team, for COMS3006A/COMS3025A.'
];
CREDITS.forEach((line) => {
  const li = document.createElement('li');
  li.textContent = line;
  creditsList.appendChild(li);
});
function toggleCredits(show) {
  creditsScreen.classList.toggle('hidden', !show);
  if (show && player.isLocked) player.unlock();
}
creditsCloseBtn.addEventListener('click', () => toggleCredits(false));

// ---------- pointer lock flow ----------
function beginGame() {
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
}

let gameStarted = false;
startButton.addEventListener('click', () => {
  toggleCredits(false);
  if (!gameStarted) {
    gameStarted = true;
    beginGame();
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
  startScreen.classList.add('hidden');
  hud.style.display = 'block';
  crosshair.style.display = 'block';
});

player.controls.addEventListener('unlock', () => {
  audio.pause();
  if (!creditsScreen.classList.contains('hidden')) return;
  if (photoBoardUI.isOpen) return;
  if (pinPadUI.isOpen) return;
  startTitle.textContent = 'PAUSED';
  startSub.textContent = '';
  startButton.textContent = 'Click to resume';
  restartButton.classList.remove('hidden');
  startScreen.classList.remove('hidden');
  hud.style.display = 'none';
  crosshair.style.display = 'none';
  promptEl.style.display = 'none';
});

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

  if (sceneManager.activeKey === 'bedroom') {
    bedroomStorm.update(dt);
    rain.update(dt);
  }
  dustMotes.update(dt, elapsed);
  // Per rendered frame rather than on a fixed step: the hands are
  // presentation, and pinning them to 60 Hz on a 144 Hz display would throw
  // away smoothness the display can actually show.
  hands.update(dt);
  sceneManager.update(dt);

  if (player.isLocked) {
    interaction.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
