import * as THREE from 'three';
import { PointerLockPlayer } from './core/PointerLockPlayer.js';
import { SceneManager } from './core/SceneManager.js';
import { Interaction } from './core/Interaction.js';
import { createPhotoBoardUI } from './core/PhotoBoardUI.js';
import { createPinPadUI } from './core/PinPadUI.js';
import { Storm } from './world/Storm.js';
import { Rain } from './world/Rain.js';
import { createDustMotes } from './world/DustMotes.js';
import { AudioEngine } from './world/AudioEngine.js';
import { createBedroomLevel } from './levels/bedroomLevel.js';
import { createHallwayBasementLevel } from './levels/hallwayBasementLevel.js';
import { createStudyLevel } from './levels/studyLevel.js';

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
    }, 4200);
    setTimeout(() => audio.creak(), 9000);
  },
  onFlashlightPicked: () => {
    flashlightFound = true;
    setFlashlight(true);
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
  'All sound is synthesised with the Web Audio API at runtime -- no audio files used.',
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
  sceneManager.update(dt);

  if (player.isLocked) {
    interaction.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
