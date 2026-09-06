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
import { createBackroomsLevel } from './levels/backroomsLevel.js';
import { createScreenFade, wait } from './core/ScreenFade.js';
import { gameState, resetState } from './core/GameState.js';
import { CaptionSequencer } from './core/CaptionSequencer.js';
import { createDocumentUI } from './core/DocumentUI.js';
import { createPostFX } from './world/Postprocessing.js';
import { createCutsceneRunner } from './core/Cutscene.js';
import { createScriptRunner } from './core/Script.js';
import { createCreature } from './systems/Creature.js';
import { createCreatureAI } from './systems/CreatureAI.js';
import { BEATS, DOCUMENTS } from './story/lines.js';
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
const fadeOverlay = document.getElementById('fade-overlay');

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

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

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
  flashlightSpot.intensity = flashlightOn ? 2.4 : 0;
  dustMotes.setBeamOn(flashlightOn);
  flashlightStateEl.textContent = !flashlightFound ? 'not found' : flashlightOn ? 'on' : 'off';
  flashlightStateEl.classList.toggle('on', flashlightOn);
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

const creatureAI = createCreatureAI({
  creature,
  getPlayer: () => ({ x: camera.position.x, z: camera.position.z, yaw: player.yaw }),
  onBreathing: (level) => audio.setBreathing(level)
});

const bedroom = createBedroomLevel({
  showCaption,
  onFreed: () => {
    player.movementEnabled = true;
    objectiveEl.textContent = 'Escape the house without getting caught.';
    // Was two bare setTimeouts at 4200 and 9000 ms that nothing cancelled, so
    // pressing R inside that window blew the bulb of the freshly restarted room
    // several seconds later with no way to work out why. Now a script: every
    // await returns false once a restart has bumped the generation.
    script.run(async (s) => {
      if (!await s.play(BEATS.freed)) return;
      if (!await s.wait(1.4)) return;
      s.do(() => {
        bedroomStorm.blowBulb();
        // Losing the bulb is the beat where the presence stops being background
        // texture, so the breathing comes up with the darkness.
        audio.setBreathing(0.8);
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
      s.do(() => audio.creak());
    });
  },
  onFlashlightPicked: () => {
    flashlightFound = true;
    setFlashlight(true);
    equipTorch();
    // The storm goes back to a normal rhythm: the player can see for themselves
    // now, so the lightning stops being the only way to navigate.
    bedroomStorm.calm();
    captions.play(BEATS.flashlightOn);
  },
  onDoorOpened: () => exitLevel('bedroom'),

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
        audio.setBreathing(0.95);
      });
      if (!await s.play(BEATS.pastTheDoor)) return;
      s.do(() => {
        objectiveEl.textContent = 'Escape the house without getting caught.';
        // Back down, but not to where it was: the house is worse now than it
        // was five minutes ago, and it stays that way.
        audio.setBreathing(0.55);
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

const study = createStudyLevel({ showCaption });
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
 * The bedroom's ambient light floor, before and after the bulb.
 *
 * 0.31 is what the level builds with. Dropping to 0.13 is the only place this
 * game gets DARKER on purpose, and it is the right place: the caption says
 * "Only the lightning now", and until this the light floor after the bulb blew
 * was identical to the lit room.
 */
const AMBIENT_LIT = 0.31;
const AMBIENT_DARK = 0.13;

const bedroomStorm = new Storm({
  bulbLight: bedroom.refs.bulbLight,
  lightningLight: bedroom.refs.lightning,
  // The mesh as well as the light. Without it the glass keeps glowing.
  bulbMaterial: bedroom.refs.bulbMaterial,
  onFlash: () => audio.thunder(),
  onBlow: () => audio.bulbPop()
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
  study: 'Preview: the study and front door (Level 3 blockout).',
  backrooms: 'Follow the arrows.'
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
  }
};

function activateLevel(key, { lockMovement = false } = {}) {
  const level = sceneManager.activate(key, player);
  // Was a TypeError on an unregistered key -- a routing typo should cost a
  // wrong room, never a crash mid-transition.
  if (!level) return null;
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
  // Same reason abortTransition() exists: a restart taken mid-shot must hand
  // the camera back, or the player restarts into a frozen third-person view.
  cutscene.cancel();
  // The whole reason Script.js exists: onFreed used to arm timers that nothing
  // cancelled, so a restart mid-beat blew the new room's bulb seconds later.
  script.cancel();
  player.movementEnabled = !lockMovement;
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
  interstitial.setRoute({ from: fromKey, ...route });
  await transitionTo(route.via);
}

// ---------- game reset (restart without page refresh) ----------
function resetGame() {
  // A restart from the pause menu can land mid-fade; without this the freshly
  // reset bedroom would come up behind a black overlay that never lifts.
  abortTransition();
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
  if (e.code === 'KeyR') resetGame();
  if (e.code === 'KeyC' && !transitionInFlight) toggleCredits(true);
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
    sceneManager,
    player,
    postFX,
    cutscene,
    script,
    creature,
    creatureAI,
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
  hands.setLayerWeight('walkbob', player.moving);
  // The player's smoothed crouch IS the layer weight, so the hands ease in and
  // out of the tucked pose with the camera's drop rather than snapping.
  hands.setLayerWeight('crouch-shift', player.crouch);
  hands.update(dt, elapsed, handMotion);
  sceneManager.update(dt);

  if (player.isLocked) {
    interaction.update();
  }

  postFX.update(dt);
  postFX.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
