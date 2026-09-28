import * as THREE from 'three';
import creatureModelUrl from '../assets/models/creature.glb?url';
import { loadModel } from '../world/modelLoader.js';
import { createCreatureTextures } from '../world/textures.js';

/**
 * The thing in the house.
 *
 * THE ONE IDEA THIS FILE EXISTS TO EXPRESS. There is no creature and no
 * Annabelle. There is ONE figure, and the visor decides which one you are
 * looking at. Mark's letter: "I look at people and their faces aren't their
 * faces anymore. Their bodies look wrong." The player's sight is broken, so a
 * woman standing in a doorway renders as something with arms to its knees and
 * its head on wrong. Put the calibration lenses on and the same figure, in the
 * same place, mid-stride of the same animation, is a person.
 *
 * That is why this is one rig with two PROPORTION SETS rather than two models.
 * Two models would need to be swapped, and a swap is a cut -- the player would
 * see one thing replaced by another, which says "the game changed what is
 * there". Lerping bone lengths says "you are seeing it correctly now", and it
 * can happen continuously while the visor fades on, mid-walk, without the
 * figure ever stopping being itself. The twist is a rendering problem, and this
 * is the rendering.
 *
 * BUILT ON A .glb NOW -- and the argument that said it should not be is worth
 * recording, because it was right about the principle and wrong about the
 * mechanism. It said: "a rigged model would be a nicer creature and a worse
 * twist: the whole point is that both readings are the same body, and that is
 * trivially true when the body is one parametric rig and merely asserted when
 * it is two files."
 *
 * The principle holds and nothing below weakens it. There is still ONE body.
 * The Hollow is a shape KEY -- a per-vertex delta on the same mesh, the same
 * skeleton, the same UVs -- so "the same body" is still true by construction
 * rather than by assertion. What changed is that a parametric rig of capsules
 * cannot wear a lab coat, and the coat turned out to be the whole design:
 *
 *   in the HUMAN reading the hem runs 0.648-0.700 m and the fingertips sit at
 *   0.707, so the hands are AT pocket height and the arms vanish into one
 *   column;
 *   in the HOLLOW reading the torso grows, the hem rides up to 0.709-0.769,
 *   and the arms grow so the fingertips fall to 0.419.
 *
 * The hands end up hanging 29 cm clear of the hem's lowest point, 35 cm clear
 * of its highest, on a coat that has become a short jacket.
 *
 * THE HEM IS A RANGE, AND THESE NUMBERS HAVE MOVED TWICE. An early draft of
 * this comment claimed 40 cm from a design estimate that anchored the hem to
 * the shoulder; it does not, because the coat is weighted to the hips and the
 * coat bones, so it only partly follows the torso as that lengthens. That was
 * corrected to a measured 24 cm. Since then the hem stopped being one height
 * at all -- it was a dead-flat horizontal cut in profile until HEM_SWEEP gave
 * it 52 mm of uneven hang -- and the fingertips fell another 112 mm when the
 * monster's fingers were curled into a claw instead of left pointing, which
 * is what stopped the hand reading as a garden fork. Both are re-measured on
 * the posed rig, bones and morph together; a measurement from the shape key
 * alone reports the two readings as identical, because the Hollow's hem rides
 * up on the BONES and COAT_COLLAPSE deliberately leaves the hem at 1.00.
 *
 * The coat is a ruler the viewer measures the distortion against, and that
 * is a far stronger cue than long arms on a bare body, which has nothing to
 * be long RELATIVE TO. A knee-length coat would cover the fingertip/knee
 * relationship and throw it away, which is why the hem length is a constant
 * and not a taste.
 *
 * WHAT IS STILL PARAMETRIC, AND WHY IT HAS TO BE. Bone LENGTHS and rotations
 * are still lerped from the two tables below, exactly as before -- only now
 * they are written to bone translations instead of Object3D positions. A shape
 * key moves vertices and cannot move a joint: morph the arm half again as long
 * and the elbow BONE stays where it was, so the limb creases through the
 * middle of the forearm. So the work is split by what each tool can actually
 * do -- bones carry length and rotation, the key carries thinning and the
 * stretched skull -- and setCorrection drives both from one dial in lockstep,
 * so a half-corrected figure is still a coherent body.
 *
 * The coat is deliberately EXCLUDED from the key. The body inside it thins to
 * 0.65-0.76 while the garment keeps its own dimensions, so it starts hanging
 * visibly too big on a wasted frame. That is free, and thinning the coat with
 * the body would have thrown it away.
 *
 * THE PRIMITIVE RIG IS STILL HERE, as the fallback. Every other loadModel()
 * call in this repo degrades gracefully when its asset does not arrive, and a
 * creature is a worse thing to lose than a dresser: the scripted beats place it
 * synchronously at main.js:580 while the GLB is still in flight. So the capsule
 * rig builds first and the mesh takes over when it lands.
 *
 * DELIBERATELY NOT BUILT ON src/systems/hands/ -- that module is hard-wired to
 * two camera-parented hands. (An older note here said its clip playback was a
 * documented no-op. That stopped being true in 3d15d7c, and the
 * snapshot-and-slerp idea from its animator is exactly what the gait below
 * borrows: a pose is an OFFSET FROM REST, never an absolute local rotation,
 * because the rest orientation of a glTF bone carries the rig's own axes.)
 */

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

/**
 * Every length is in metres, so the numbers are checkable against the world:
 * the player's eye height is 1.6 and doorways are a little over 2.
 *
 * HUMAN is Annabelle: 1.68 m, ordinary. Nothing about it should read as
 * stylised, because the moment the visor goes on she has to look like a person
 * who has been hiding in a basement, not like a friendlier monster.
 */
const HUMAN = {
  hipHeight: 0.92,
  spine: 0.26,
  chest: 0.20,
  neck: 0.09,
  headRadius: 0.115,

  upperArm: 0.30,
  forearm: 0.27,
  hand: 0.10,

  thigh: 0.44,
  shin: 0.42,

  shoulderWidth: 0.19,
  hipWidth: 0.11,

  limbRadius: 0.052,
  torsoWidth: 0.165,
  torsoDepth: 0.105,

  /** Radians. Forward pitch of the spine; a person stands nearly straight. */
  hunch: 0.06,
  /** Radians. Sideways tilt of the head -- zero for a person. */
  headTilt: 0.0,
  /** Radians. Forward crane of the neck. */
  neckLean: 0.05,
  /** Radians. Shoulders rolled forward and up around the neck. */
  shoulderRoll: 0.04,
  /** Head shape. >1 is long and narrow, which is most of "wrong" on a face. */
  headStretch: 1.0,
  /** How much hair there is. She has the same hair in both readings. */
  hairSize: 1.0,
  footLength: 0.20
};

/**
 * HOLLOW is the same woman seen through broken sight. It has to be recognisably
 * the same figure -- same joint count, same walk -- and simply WRONG. The
 * distortions are the ones the basement sketch names: "Long arms. Thin body.
 * Hunched back. Long fingers. A head at the wrong angle."
 *
 * The legs stay close to human length on purpose. Stretching everything would
 * just read as a bigger person; keeping the legs and stretching the arms is
 * what makes it read as a body that has gone wrong rather than a giant.
 */
const HOLLOW = {
  hipHeight: 0.99,
  spine: 0.30,
  chest: 0.22,
  neck: 0.155,
  headRadius: 0.098,

  // The silhouette. Arms nearly half again as long, so the hands hang past
  // the knees -- the single most legible cue at a distance and in the dark.
  upperArm: 0.45,
  forearm: 0.44,
  hand: 0.20,

  thigh: 0.46,
  shin: 0.45,

  shoulderWidth: 0.175,
  hipWidth: 0.095,

  limbRadius: 0.034,
  torsoWidth: 0.125,
  torsoDepth: 0.072,

  hunch: 0.42,
  headTilt: 0.30,
  neckLean: 0.34,
  // Shoulders drawn up and forward around the neck, so the head sits INSIDE
  // the shoulder line. That silhouette is what makes a hunch read as a hunch
  // rather than as someone leaning over to pick something up.
  shoulderRoll: 0.30,
  headStretch: 1.34,
  // Unchanged. The hair is the one thing that is the same in both readings,
  // and it is the detail that should make a player who has seen the portrait
  // feel they have met this figure before.
  hairSize: 1.0,
  footLength: 0.24
};

const KEYS = Object.keys(HUMAN);

/** Total standing height, for placing it against doorways and camera pitch. */
function standingHeight(p) {
  return p.hipHeight + p.spine + p.chest + p.neck + p.headRadius * 2;
}

// ---------------------------------------------------------------------------
// Gait
// ---------------------------------------------------------------------------

/** Metres per full stride, matching PointerLockPlayer's STRIDE so gaits agree. */
/**
 * How far setSilhouette(true) dims the creature, as a multiplier on whatever
 * the correction dial already produced.
 *
 * RAISED from 0.05. At 0.05 the roaming hunter rendered at 0.42 x 0.05 = 0.021
 * linear, which is #282828 on screen -- not "a dark figure" but a hole in the
 * corridor you could lose against an unlit wall. The brief was to significantly
 * reduce that shadow, and this is the only knob that does it: rendered
 * brightness is albedo x irradiance, and the backrooms ambient is deliberately
 * 0.14 against the 0.37-0.43 every other level uses, so lifting the LIGHT
 * instead would raise the wallpaper (albedo 0.565 linear) about forty times
 * harder than it raises the creature (effective albedo 0.0147) -- the monster
 * would come out relatively DARKER against a brighter wall, which is the
 * opposite of what was asked. It would also flatten the dark gaps into mustard,
 * which the note on that AmbientLight exists to prevent.
 *
 * At 0.18 the hunter lands at 0.0756 linear = #4E4E4E, roughly double the
 * displayed brightness, and still around 8:1 darker than the lit wallpaper --
 * so it is a dark shape with an outline, not a lit mannequin. 0.20 is the
 * ceiling; past about 0.25 the coat texture comes through and it stops reading
 * as a silhouette at all.
 *
 * IT IS A CONSTANT BECAUSE IT IS USED TWICE -- the GLB path and the fallback
 * primitive rig each apply it, and the fallback is a supported state (see
 * check-creature.mjs, which passes when creature.glb is absent). Two literals
 * would let the two figures drift to different brightnesses, and the one that
 * drifted would be the one nobody looks at.
 */
const SILHOUETTE_DIM = 0.18;

const STRIDE = 1.55;
/**
 * Radians of hip swing at a walk. The Hollow's gait is wider and looser.
 *
 * RAISED, because the feet were skating and that is the loudest single thing
 * separating a procedural walk from an animated one. Measured, not estimated:
 * the foot's travel relative to the hips over one cycle is the distance the
 * body may advance before the planted foot has to slide. At 0.52/0.66 that
 * sweep was 0.98 m (human) and 1.04 m (Hollow) against a STRIDE of 1.55 -- so
 * roughly a third of every stride was the foot sliding along the floor.
 *
 * These do not remove it, and it is worth being exact about why rather than
 * implying they do. Closing the gap entirely needs a sweep of 1.55 m, which on
 * this leg (effective radius ~0.85 m) is asin(1.55 / 1.70) = 1.15 rad, a
 * 66-degree hip swing each way. That is not a walk, it is a parade march. The
 * honest options are a shorter STRIDE -- which raises the step RATE, and
 * PointerLockPlayer already records where that ends up ("273 steps a minute is
 * a comedy scurry") -- or foot IK, which is a different piece of work. These
 * values take the Hollow's skate from 0.51 m to 0.37 m and the human's from
 * 0.57 to 0.45, measured, without touching the cadence -- a 27% and 22% cut
 * rather than a fix. A longer stride suits a tall long-limbed thing anyway.
 * The residual is the honest cost of having no foot IK.
 */
const HIP_SWING_HUMAN = 0.64;
const HIP_SWING_HOLLOW = 0.82;
const ARM_SWING_HUMAN = 0.42;
/**
 * Under-swings, rather than not swinging at all.
 *
 * This was 0.13 -- about seven degrees, which is not a drag, it is a stall.
 * Combined with the bad-side multiplier it left one arm moving four degrees
 * over a whole stride, so at a silhouette the arms simply hung there while the
 * legs worked, and the figure read as being slid along rather than walking.
 *
 * 0.34 against the human 0.42 keeps the original intent -- it still swings
 * visibly LESS than a person does, which is the tell -- while actually moving.
 * The dead-arm asymmetry does the rest of that job now, and does it better,
 * because an arm that swings wrongly is stranger than an arm that does not
 * swing at all.
 */
const ARM_SWING_HOLLOW = 0.34;

// ---------------------------------------------------------------------------

function segment(material, radius, length) {
  // Capsule rather than cylinder so joints do not show a hard seam when a limb
  // bends, which at these radii would be visible even in this game's dark.
  const geo = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.01), 4, 8);
  const mesh = new THREE.Mesh(geo, material);
  // Bones point down the -Y of their parent, so the mesh is offset half a
  // length down and the joint sits at the bone's own origin. That is what lets
  // a length change be a single scale without moving the joint.
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  return mesh;
}

/**
 * One limb chain. Returns the joints so the animation can address them by name,
 * and the meshes so a proportion change can rescale them.
 */
function limb(material, parent, lengths, radius) {
  const joints = [];
  const meshes = [];
  let node = parent;
  for (const length of lengths) {
    const joint = new THREE.Object3D();
    joint.position.y = node === parent ? 0 : -lengths[joints.length - 1];
    node.add(joint);
    const mesh = segment(material, radius, length);
    joint.add(mesh);
    joints.push(joint);
    meshes.push(mesh);
    node = joint;
  }
  return { joints, meshes };
}

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------

/**
 * WHICH BONE CARRIES WHICH LENGTH.
 *
 * Every joint in creature.glb ships with its translation as (0, parentBoneLength, 0)
 * in the parent's bone space -- that is simply how the glTF exporter writes an
 * armature, and it was read back out of the exported file rather than assumed.
 * So lengthening a limb is one assignment: move the CHILD further down its
 * parent's axis.
 *
 *     chest.position.y  = p.spine        forearm.position.y = p.upperArm
 *     neck.position.y   = p.chest        hand.position.y    = p.forearm
 *     head.position.y   = p.neck         shin.position.y    = p.thigh
 *                                        foot.position.y    = p.shin
 *
 * THE NAMES HERE HAVE NO DOTS, AND THAT IS NOT A TYPO. The armature calls them
 * `forearm.L`; the GLB on disk stores `forearm.L`; and three.js renames it to
 * `forearmL` while loading, because GLTFLoader runs every node name through
 * PropertyBinding.sanitizeNodeName(), which strips the characters the animation
 * binding syntax reserves -- '.' among them. Verified in the running game, not
 * assumed: sanitizeNodeName('forearm.L') === 'forearmL'.
 *
 * src/systems/hands/HANDOVER.md records this same symptom and blames the
 * Blender exporter. The exporter is innocent -- the dots are present in the
 * file -- but the practical advice there was right, and anyone "fixing" it by
 * putting the dots back here will find every limb silently stops changing
 * length. Which is why the assertion below exists.
 *
 * THIS TABLE IS ALSO COUPLED TO blender/build_creature.py AND NOTHING ENFORCES
 * THAT. If a bone is renamed or re-parented there, the lookup finds nothing and
 * that limb stops changing length -- which reads as a weak twist, not as an
 * error. scripts/check-creature.mjs asserts the joint COUNT and the material
 * names; it cannot assert this.
 */
const BONE_LENGTH = {
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  forearmL: 'upperArm',
  forearmR: 'upperArm',
  handL: 'forearm',
  handR: 'forearm',
  shinL: 'thigh',
  shinR: 'thigh',
  footL: 'shin',
  footR: 'shin'
};

/**
 * Constants baked into the armature by build_creature.py that the runtime has
 * to agree with. They are here rather than inlined so the coupling is at least
 * visible in one place -- a .py and a .js cannot share a module, which is the
 * one case where this project's "two files must not invent two numbers" rule
 * has no clean answer.
 */
const HIPS_BONE_LENGTH = 0.06;   // hips bone head sits at hipHeight - this
const CLAVICLE_ROOT_X = 0.03;    // clavicle head offset from the spine axis
const SHOULDER_OF_CHEST = 0.86;  // shoulder joint height, as a fraction of chest

/** Blender's .L is +X. Creature.js's `l` is -X. They are opposite on purpose. */
const SIDE_SUFFIX = { l: 'R', r: 'L' };

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const WORLD_Z = new THREE.Vector3(0, 0, 1);
const _q2 = new THREE.Quaternion();

/**
 * Deterministic smooth noise on one axis, for gait layers that must not repeat.
 *
 * A walk built from one sine at one frequency is a walk that lines up exactly
 * with itself every stride, and a viewer reads that as a machine long before
 * they could say why. The cure is a slow layer whose period does not divide the
 * stride -- but it has to be the same on every frame, every machine and across
 * a reload, so Math.random() is out: sampled per frame it fizzes rather than
 * drifts, and it would make the gait untestable.
 *
 * Integer hash, quintic fade. The quintic matters: a linear or cubic fade leaves
 * a velocity discontinuity at each cell boundary, which on a limb shows up as a
 * tick once a second.
 */
function _hash1(i) {
  let h = Math.imul(i | 0, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const TAU = Math.PI * 2;

/**
 * Depth of the gait's phase warp. 0 is the old pure sine; below 1 the warp
 * stays monotone (d/dphi = 1 + DUTY*cos, minimum 1 - DUTY).
 *
 * 0.35 puts roughly 60% of the cycle in stance, which is what a human walk
 * does and what a raw sine cannot express at any amplitude -- sin is 50/50 by
 * construction. Because sin has zero mean over a cycle, the average stride
 * RATE is untouched, which is what keeps the feet under a body whose position
 * is driven externally.
 */
const GAIT_DUTY = 0.35;

/**
 * How much deeper the warp runs on the bad leg than the good one.
 *
 * WITHOUT THIS THERE IS NO LIMP, and the reason is structural rather than a
 * matter of tuning -- which is worth writing down, because the first version
 * of this gait had a per-side amplitude asymmetry and looked like it had one.
 * A single warp is monotone and satisfies gp(u + 2pi) = gp(u) + 2pi, so if the
 * two legs are driven from ONE warped phase offset by pi, leg B's footfall
 * solves its threshold at exactly leg A's time minus pi. Always. The strikes
 * come out perfectly evenly spaced no matter how hard the warp is pushed:
 * measured footfall intervals were 3.142, 3.142, 3.142 with the asymmetry on
 * and identical with it off.
 *
 * Amplitude asymmetry is still real and still shows -- a shorter step and a
 * stiffer knee are visible. What it cannot do is make the RHYTHM uneven, and
 * an unpredictable footfall is the thing that makes an approaching figure
 * unbearable rather than merely odd.
 *
 * Two warps fixes it. Each leg keeps its own depth, each is individually
 * monotone (needs depth < 1; 0.35 +/- 0.18 stays well inside) and each still
 * has zero mean over a cycle, so neither leg's average stride rate moves and
 * the feet stay under the body.
 */
const GAIT_LIMP = 0.18;

/** Phase warp at an explicit depth. See GAIT_DUTY and GAIT_LIMP. */
const gaitWarp = (u, duty = GAIT_DUTY) => u + duty * Math.sin(u);

/**
 * Radians of phase each joint trails the one before it.
 *
 * Without these the entire body arrives at every pose on the same frame, which
 * is what a puppet on a single rod does. Propagation outward from the hips is
 * most of the difference between a figure that walks and a figure that is
 * being moved.
 */
const GAIT_LAG = {
  shin: 0.14, foot: 0.30,
  spine: 0.16, chest: 0.26, neck: 0.44, head: 0.60,
  upper_arm: 0.30, forearm: 0.62,
  coat: 1.25
};

/** 0 outside [a, b], a smooth arch peaking at 1 in the middle. */
function _arch(t, a, b) {
  const u = (t - a) / (b - a);
  return (u <= 0 || u >= 1) ? 0 : Math.sin(Math.PI * u);
}

/** Smooth noise in -1..1 with a period of 1 in `t`. */
function _noise1(t) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = _hash1(i);
  const b = _hash1(i + 1);
  return (a + (b - a) * u) * 2 - 1;
}

export function createCreature() {
  const group = new THREE.Group();
  group.name = 'creature';

  /**
   * Two materials cross-faded by the same dial as the proportions, because
   * shape alone is not enough: the Hollow reads as a silhouette with no
   * surface, and Annabelle has to read as cloth and skin. Both are dark enough
   * to belong in this game's 6-35/255 levels.
   */
  const skin = new THREE.MeshStandardMaterial({
    color: 0x1b1714,
    roughness: 0.92,
    metalness: 0.0
  });
  const clothes = new THREE.MeshStandardMaterial({
    color: 0x2b3038,
    roughness: 0.88,
    metalness: 0.0
  });
  // Hair is its own material because it must stay dark in BOTH readings -- it
  // is the one part of her that broken sight gets right.
  const hair = new THREE.MeshStandardMaterial({
    color: 0x14100e,
    roughness: 0.96,
    metalness: 0.0
  });

  // --- rig ------------------------------------------------------------------
  const root = new THREE.Object3D();          // on the floor, faces -Z
  group.add(root);

  const hips = new THREE.Object3D();
  root.add(hips);

  const spine = new THREE.Object3D();
  hips.add(spine);
  const spineMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clothes);
  spineMesh.castShadow = true;
  spine.add(spineMesh);

  const chest = new THREE.Object3D();
  spine.add(chest);
  const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clothes);
  chestMesh.castShadow = true;
  chest.add(chestMesh);

  const neck = new THREE.Object3D();
  chest.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 3, 6), skin);
  neck.add(neckMesh);

  const head = new THREE.Object3D();
  neck.add(head);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
  headMesh.castShadow = true;
  head.add(headMesh);

  // Hair. Deliberately identical in both readings and never lerped away: it is
  // the thread between the monster and the woman in the family photograph, and
  // a player who notices it before the reveal has been given the reveal
  // honestly. A half-sphere set back and slightly low, so it reads as hair
  // falling rather than as a helmet.
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hair
  );
  hairMesh.castShadow = true;
  head.add(hairMesh);

  const arms = {
    l: limb(skin, chest, [HUMAN.upperArm, HUMAN.forearm, HUMAN.hand], HUMAN.limbRadius),
    r: limb(skin, chest, [HUMAN.upperArm, HUMAN.forearm, HUMAN.hand], HUMAN.limbRadius)
  };
  const legs = {
    l: limb(clothes, hips, [HUMAN.thigh, HUMAN.shin], HUMAN.limbRadius * 1.15),
    r: limb(clothes, hips, [HUMAN.thigh, HUMAN.shin], HUMAN.limbRadius * 1.15)
  };

  // Feet. Small, but without them the legs end in a rounded capsule cap that
  // reads as an amputation -- and they are what plants the figure on the floor
  // instead of leaving it hovering just above it.
  const feet = {};
  for (const side of ['l', 'r']) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), clothes);
    foot.castShadow = true;
    legs[side].joints[1].add(foot);
    feet[side] = foot;
  }

  // --- state ----------------------------------------------------------------
  /** 0 = seen through broken sight (the Hollow), 1 = corrected (Annabelle). */
  let correction = 0;
  /** Blended proportions, rebuilt each frame the dial moves. */
  const p = { ...HUMAN };
  let dirty = true;
  /**
   * True for glimpses that are meant to read as a shadow, not a lit body --
   * the backrooms figure trailing at a distance, seen under ordinary corridor
   * light. At normal size a lit, textured rig at that range reads as exactly
   * what it is: a small set of boxes and capsules. Multiplying the correction
   * colour down hard (independent of the correction/proportion dial, so it
   * survives whatever else calls setCorrection()) hides that geometry in its
   * own shadow instead, the same way a real backlit figure loses its surface
   * detail long before it loses its outline. Not "near-black" any more -- see
   * SILHOUETTE_DIM, which was raised because at 0.05 it had gone past losing
   * surface detail and was losing the figure.
   */
  let silhouette = false;

  /** Distance walked, so the gait is driven by movement like the player's. */
  let gaitPhase = 0;
  let speed = 0;
  let elapsed = 0;

  /**
   * The loaded mesh, or null while creature.glb is still in flight or if it
   * never arrives. Everything below branches on this rather than assuming it:
   * main.js:580 builds the creature synchronously and the Level 1 window beat
   * can fire before a 150 KB asset has landed.
   */
  let glb = null;

  function applyProportions() {
    for (const key of KEYS) p[key] = THREE.MathUtils.lerp(HOLLOW[key], HUMAN[key], correction);

    hips.position.y = p.hipHeight;
    // NEGATIVE. The rig faces -Z, and rotating +Y about +X carries it toward
    // +Z, so a positive hunch arched the figure backwards -- it stood to
    // attention instead of stooping. Caught by looking at a render.
    spine.rotation.x = -p.hunch;
    chest.position.y = p.spine;
    neck.position.y = p.chest;
    neck.rotation.x = -p.neckLean;
    head.position.y = p.neck;
    head.rotation.z = p.headTilt;

    // Torso blocks are unit geometry scaled, so a proportion change is three
    // numbers rather than a rebuilt BufferGeometry every frame.
    spineMesh.scale.set(p.torsoWidth, p.spine, p.torsoDepth);
    spineMesh.position.y = p.spine / 2;
    chestMesh.scale.set(p.torsoWidth * 1.08, p.chest, p.torsoDepth * 1.05);
    chestMesh.position.y = p.chest / 2;
    // CapsuleGeometry(1, 1) is three units tall (two unit caps plus the unit
    // body), so Y scales by neck/3 to fill the bone exactly. Scaling it by a
    // single scalar tied the neck's LENGTH to its RADIUS -- 0.09 m of mesh
    // spanning a 0.155 m bone -- and left a visible gap under the head.
    neckMesh.scale.set(p.limbRadius * 0.9, p.neck / 3, p.limbRadius * 0.9);
    neckMesh.position.y = p.neck / 2;
    headMesh.scale.set(p.headRadius * 0.92, p.headRadius * p.headStretch, p.headRadius * 0.96);
    hairMesh.scale.set(
      p.headRadius * 1.06 * p.hairSize,
      p.headRadius * p.headStretch * 1.02 * p.hairSize,
      p.headRadius * 1.12 * p.hairSize
    );
    // Back and down a little, so the face stays clear of it.
    hairMesh.position.set(0, p.headRadius * 0.08, p.headRadius * 0.10);

    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? -1 : 1;
      const arm = arms[side];
      arm.joints[0].position.set(
        sign * p.shoulderWidth,
        // Shoulders ride UP toward the neck as they roll forward, which is what
        // sinks the head into them.
        p.chest * 0.86 + p.shoulderRoll * 0.10,
        -p.shoulderRoll * 0.14
      );
      arm.joints[1].position.y = -p.upperArm;
      arm.joints[2].position.y = -p.forearm;
      const armLengths = [p.upperArm, p.forearm, p.hand];
      arm.meshes.forEach((mesh, i) => {
        // Capsule geometry is built at HUMAN length; scaling Y stretches it to
        // the blended length. X/Z carry the limb thinning.
        const s = p.limbRadius / HUMAN.limbRadius;
        mesh.scale.set(s, armLengths[i] / [HUMAN.upperArm, HUMAN.forearm, HUMAN.hand][i], s);
        mesh.position.y = -armLengths[i] / 2;
      });

      const foot = feet[side];
      foot.scale.set(p.limbRadius * 2.0, p.limbRadius * 1.1, p.footLength);
      // At the ankle, offset forward by half its length so the heel sits under
      // the leg and the toes point the way the figure faces (-Z).
      foot.position.set(0, -p.shin + p.limbRadius * 0.4, -p.footLength * 0.28);

      const leg = legs[side];
      leg.joints[0].position.set(sign * p.hipWidth, 0, 0);
      leg.joints[1].position.y = -p.thigh;
      const legLengths = [p.thigh, p.shin];
      leg.meshes.forEach((mesh, i) => {
        const s = (p.limbRadius * 1.15) / (HUMAN.limbRadius * 1.15);
        mesh.scale.set(s, legLengths[i] / [HUMAN.thigh, HUMAN.shin][i], s);
        mesh.position.y = -legLengths[i] / 2;
      });
    }

    // Colour follows shape. The Hollow is nearly unlit black -- a hole in the
    // room -- and Annabelle is cloth and skin. Lerped in the same dial so a
    // half-corrected figure is coherent rather than a black shape in a coat.
    // silhouette scales the RESULT down further still, after the lerp, so it
    // composes with whatever correction is set rather than replacing it.
    const sMul = silhouette ? SILHOUETTE_DIM : 1;
    skin.color.setRGB(
      THREE.MathUtils.lerp(0.055, 0.34, correction) * sMul,
      THREE.MathUtils.lerp(0.048, 0.26, correction) * sMul,
      THREE.MathUtils.lerp(0.045, 0.22, correction) * sMul
    );
    clothes.color.setRGB(
      THREE.MathUtils.lerp(0.048, 0.17, correction) * sMul,
      THREE.MathUtils.lerp(0.044, 0.19, correction) * sMul,
      THREE.MathUtils.lerp(0.042, 0.22, correction) * sMul
    );
    // Hair is already near-black and does not lerp with correction, but it
    // still needs the silhouette multiplier or it would be the one part of a
    // "shadow" that visibly has a colour.
    hair.color.setRGB(0.078 * sMul, 0.063 * sMul, 0.055 * sMul);

    // The same dial, pushed into the mesh. Both run: the primitive rig stays
    // live but invisible so `refs` keep meaning something -- see attachGlb().
    if (glb) applyGlb();

    dirty = false;
  }

  function animate(dt) {
    elapsed += dt;
    gaitPhase += (speed / STRIDE) * Math.PI * 2 * dt;

    // THE SAME TIMING THE GLB GAIT USES, deliberately. This rig only ever shows
    // when creature.glb fails to load -- a supported state, see the loadModel
    // catch below and check-creature.mjs -- and letting the two drift to
    // different curves is exactly the class of bug that makes a fallback look
    // like a different creature. It does NOT get the rest of animateGlb's
    // work: this rig is capsules and boxes with no pelvis, chest or feet to
    // rotate, so there is nothing here for pelvic drop or a held head to
    // write to.
    const walking = THREE.MathUtils.smoothstep(speed, 0.12, 0.95);
    const hipSwing = THREE.MathUtils.lerp(HIP_SWING_HOLLOW, HIP_SWING_HUMAN, correction) * walking;
    const armSwing = THREE.MathUtils.lerp(ARM_SWING_HOLLOW, ARM_SWING_HUMAN, correction) * walking;

    const gp = gaitWarp(gaitPhase);
    const s = Math.sin(gp);
    const c = Math.cos(gp);

    legs.l.joints[0].rotation.x = s * hipSwing;
    legs.r.joints[0].rotation.x = -s * hipSwing;
    // Knees only bend one way. max(0, ...) is what stops the shin passing
    // through the thigh on the back half of the stride.
    legs.l.joints[1].rotation.x = -Math.max(0, -c) * hipSwing * 1.5;
    legs.r.joints[1].rotation.x = -Math.max(0, c) * hipSwing * 1.5;

    // Arms counter the legs. The Hollow's barely move, which is most of why its
    // walk reads as wrong before you have consciously noticed the length.
    arms.l.joints[0].rotation.x = -s * armSwing;
    arms.r.joints[0].rotation.x = s * armSwing;
    // Hanging elbows, more so the less corrected it is.
    // Positive: same sign convention as the hunch above. An elbow brings the
    // hand forward, and negative here folded both forearms out behind the back.
    //
    // The Hollow's elbows are nearly STRAIGHT and the human's are slightly
    // bent, which is the opposite of the first attempt. A bent elbow
    // foreshortens the forearm from almost every angle, and the one thing this
    // silhouette has to communicate is that the arms are far too long -- an arm
    // folded up in front of the chest communicates nothing about its length.
    // Straight, dangling arms are also simply what the basement sketch draws.
    const hang = THREE.MathUtils.lerp(0.10, 0.28, correction);
    arms.l.joints[1].rotation.x = hang;
    arms.r.joints[1].rotation.x = hang;
    // Arms held slightly away from the body, so the silhouette reads.
    arms.l.joints[0].rotation.z = THREE.MathUtils.lerp(0.18, 0.09, correction);
    arms.r.joints[0].rotation.z = THREE.MathUtils.lerp(-0.18, -0.09, correction);
    // ...and rolled forward with the shoulders, on top of the swing. Half the
    // shoulder's roll, not all of it: the shoulder joint moving forward should
    // carry the arm with it, but the arm still hangs under gravity rather than
    // being pinned to the chest.
    arms.l.joints[0].rotation.x -= p.shoulderRoll * 0.5;
    arms.r.joints[0].rotation.x -= p.shoulderRoll * 0.5;

    // Bob with the stride, and breathe when standing still, so it is never a
    // statue -- a figure that holds perfectly still reads as scenery.
    const bob = Math.abs(Math.sin(gp)) * 0.022 * walking;
    const breath = Math.sin(elapsed * 1.4) * 0.008 * (1 - walking);
    hips.position.y = p.hipHeight + bob + breath;

    // The head keeps its crooked set but drifts, which at a distance is what
    // makes it look like it is deciding something.
    head.rotation.y = Math.sin(elapsed * 0.55) * 0.14 * (1 - walking);

    if (glb) animateGlb();
  }

  // --- the mesh -------------------------------------------------------------

  /**
   * Take over the rendering with creature.glb.
   *
   * THE PRIMITIVE RIG KEEPS RUNNING, INVISIBLY, AND THAT IS DELIBERATE. `refs`
   * hands out live Object3Ds -- CreatureAI starts its sightline at refs.head,
   * because a creature that decides what it can see from between its own feet
   * will happily stare through a table. Those refs are handed out once, at
   * construction, before this asset exists. Re-pointing them at glTF bones
   * afterwards would mean every holder of a ref was silently holding the wrong
   * object. Driving both instead costs a few dozen Object3D writes a frame,
   * which is nothing, and keeps the whole public surface honest.
   */
  function attachGlb(scene) {
    const bones = {};
    /**
     * ALL of them, not the first.
     *
     * GLTFLoader splits a multi-material mesh into one SkinnedMesh PER
     * PRIMITIVE, so five materials means five meshes sharing one skeleton and
     * each carrying its own copy of the Hollow morph. Driving only the first
     * one was the bug this comment exists to stop coming back: the head and
     * arms thinned while the coat, shirt, trousers and hair did not, which does
     * not look like a bug -- it looks like a body shrinking inside its clothes,
     * which is a thing that could plausibly be intended.
     */
    const meshes = [];
    scene.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) meshes.push(o);
    });
    if (!meshes.length) {
      console.warn('Creature: creature.glb has no SkinnedMesh; keeping the primitive rig.');
      return null;
    }

    // SkinnedMesh sets boundingSphere = null, and Frustum.intersectsObject
    // computes it ONCE and nothing in three ever invalidates it -- so it
    // freezes at whatever pose and morph weight held on the first frame it was
    // culled. With setCorrection continuously reshaping the silhouette that
    // means the creature pops out of view at glancing angles ONLY while the
    // visor is on, which is precisely the moment the set-piece depends on.
    // Culling one character saves nothing measurable; this fixes the camera
    // and the shadow pass together. hand-mesh.js does the same thing.
    scene.traverse((o) => {
      o.frustumCulled = false;
      if (o.isMesh) o.castShadow = true;
    });

    const rest = new Map();
    for (const [name, b] of Object.entries(bones)) {
      rest.set(name, { pos: b.position.clone(), quat: b.quaternion.clone() });
    }

    // The local axis that swings a limb forward, MEASURED from the rest pose
    // rather than assumed. Every bone carries a baked rest rotation from the
    // exporter, so "rotate about local X" means a different thing on a thigh
    // than on a clavicle -- hardcoding it is how you get a leg that swings
    // sideways and a shoulder that folds into the chest.
    //
    // THREE axes now, not one. swing is the sagittal plane -- the forward/back
    // rotation a leg or an arm makes -- and it was all the old gait had, which
    // is a large part of why that gait read as a toy: a pelvis that never drops,
    // shoulders that never counter-rotate against the hips and a head that is
    // welded to the chest are not stylisation, they are three whole channels of
    // human motion that were simply absent. twist is about the world vertical
    // (rotation in the transverse plane) and lean about the world forward axis
    // (the frontal plane). All three are MEASURED off the rest pose for the
    // same reason the first one was: every bone carries a baked rest rotation,
    // so "local Y" means something different on a thigh than on a clavicle.
    scene.updateMatrixWorld(true);
    const swing = new Map();
    const twist = new Map();
    const lean = new Map();
    for (const [name, b] of Object.entries(bones)) {
      b.getWorldQuaternion(_q);
      // invert() is IN PLACE, so _q is the inverse from here on -- take all
      // three axes off the same inverse rather than re-fetching it.
      _q.invert();
      swing.set(name, WORLD_X.clone().applyQuaternion(_q).normalize());
      twist.set(name, WORLD_Y.clone().applyQuaternion(_q).normalize());
      lean.set(name, WORLD_Z.clone().applyQuaternion(_q).normalize());
    }

    // Every primitive carries the same dictionary, so the first is enough to
    // read the index from -- but the influence has to be written to all of them.
    const morphIndex = meshes[0].morphTargetDictionary?.Hollow;
    if (morphIndex === undefined) {
      console.warn('Creature: creature.glb has no "Hollow" morph target. Check that '
        + 'extras.targetNames survived the export -- without it GLTFLoader falls '
        + 'back to a numeric morphTargetDictionary and the twist does not read.');
    }

    // Canvas textures, bound by the material NAME the .glb carries. The names
    // come from blender/build_creature.py and are asserted by
    // scripts/check-creature.mjs, so this lookup is the one place the two
    // halves of the pipeline actually meet.
    const textures = createCreatureTextures();
    const materials = [];
    const textured = [];
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (materials.includes(m)) continue;
        materials.push(m);
        const set = textures[m.name];
        if (set) {
          m.map = set.map;
          m.normalMap = set.normalMap;
          if (set.roughnessMap) {
            m.roughnessMap = set.roughnessMap;
            // three MULTIPLIES roughnessMap by material.roughness, and the .glb
            // carries whatever Blender exported. Left alone, a 0.9 base would
            // scale the whole map down and flatten the variation the map exists
            // to provide.
            m.roughness = 1.0;
          }
          // THE ALBEDO CARRIES THE COLOUR NOW, so the base has to go white.
          // three multiplies map by color, and the .glb ships a flat base
          // colour of its own -- leaving it in place would darken the creature
          // by roughly its own albedo a second time. Handing material.color
          // over to the dimmer is what lets setCorrection and setSilhouette
          // keep working as pure multipliers.
          m.color.setRGB(1, 1, 1);
          m.needsUpdate = true;
          textured.push(m.name);
        }
        m.userData.baseColor = m.color ? m.color.clone() : null;
      }
    });
    const untextured = materials.map((m) => m.name).filter((n) => !textured.includes(n));
    if (untextured.length) {
      console.warn('Creature: no canvas texture for material(s) ' + untextured.join(', ')
        + '. createCreatureTextures() and build_creature.py disagree on names.');
    }

    // Warn at boot, do not throw, so a renamed bone costs a console line rather
    // than the whole app -- the same rule CreatureAI.js's speed assertions use.
    // This is the only thing standing between "somebody renamed a bone in
    // build_creature.py" and a twist that quietly stops working.
    const missing = [
      ...Object.keys(BONE_LENGTH),
      'hips', 'spine',
      ...['L', 'R'].flatMap((s) => ['clavicle' + s, 'upper_arm' + s, 'thigh' + s]),
      'coat_frontL', 'coat_frontR', 'coat_back'
    ].filter((n) => !bones[n]);
    if (missing.length) {
      console.error('Creature: creature.glb is missing bones the runtime drives: '
        + missing.join(', ') + '. These limbs will not change length or swing. '
        + 'Names are sanitised by THREE.PropertyBinding on load, so "forearm.L" '
        + 'in Blender is "forearmL" here. Found: ' + Object.keys(bones).join(', '));
    }

    root.add(scene);
    hips.visible = false;   // the primitive rig keeps updating, unseen
    return { scene, meshes, bones, rest, swing, twist, lean, morphIndex, materials };
  }

  /** Push the blended proportions and the correction dial into the loaded mesh. */
  function applyGlb() {
    const { bones, morphIndex, meshes, materials } = glb;

    for (const [boneName, key] of Object.entries(BONE_LENGTH)) {
      const b = bones[boneName];
      if (b) b.position.y = p[key];
    }
    // The handful that are not a plain parent-bone length.
    if (bones.hips) bones.hips.position.y = p.hipHeight - HIPS_BONE_LENGTH;
    for (const suffix of ['L', 'R']) {
      const sign = suffix === 'L' ? 1 : -1;
      const clav = bones['clavicle' + suffix];
      if (clav) {
        clav.position.set(sign * CLAVICLE_ROOT_X, p.chest * SHOULDER_OF_CHEST, 0);
      }
      const upper = bones['upper_arm' + suffix];
      if (upper) upper.position.y = p.shoulderWidth - CLAVICLE_ROOT_X;
      const thigh = bones['thigh' + suffix];
      if (thigh) thigh.position.set(sign * p.hipWidth, HIPS_BONE_LENGTH, 0);

    }

    // NOTHING HERE SCALES A BONE, and that is deliberate.
    //
    // The bones above move the JOINTS. They do not, and cannot, stretch the
    // flesh between them: in a skinned mesh, moving a child bone moves only
    // the vertices weighted to that child, so lengthening the forearm this way
    // leaves a 0.27 m forearm with its hand floating 0.17 m past the end of
    // it. An earlier pass tried to patch the visible half of that by scaling
    // the hand bone, which fixed the fingers and left the same hole at every
    // other joint.
    //
    // Scaling the bones generally is worse, not better -- a non-uniform scale
    // shears every child sitting at an angle to its parent, which is most of
    // an arm. So the stretch lives in the Hollow shape key, keyed off the same
    // HOLLOW/HUMAN ratios (see SEGMENT_STRETCH in blender/build_creature.py),
    // and the two halves agree because they are read off one table.

    // The key carries what bones cannot: thinning, the stretched skull. Note
    // the inversion -- correction 1 is Annabelle, which is the BASE shape, so
    // the morph is fully ON at correction 0.
    if (morphIndex !== undefined) {
      for (const m of meshes) {
        if (m.morphTargetInfluences) m.morphTargetInfluences[morphIndex] = 1 - correction;
      }
    }

    // Colour. The shape does most of the work now, so this is a much lighter
    // touch than the primitive rig's full black-to-flesh lerp -- but the Hollow
    // still has to sit darker, and setSilhouette still has to crush everything
    // to a shadow. silhouette multiplies the RESULT so the two compose.
    const dim = THREE.MathUtils.lerp(0.42, 1.0, correction) * (silhouette ? SILHOUETTE_DIM : 1);
    for (const m of materials) {
      const base = m.userData.baseColor;
      if (base && m.color) m.color.copy(base).multiplyScalar(dim);
    }
  }

  /**
   * Write the gait onto bones, as OFFSETS FROM REST.
   *
   * WHAT WAS WRONG WITH THE OLD ONE, because "robloxy" turns out to be a
   * precise complaint rather than a vague one. It was a single sine, at a
   * single frequency, phase-locked across every joint, perfectly symmetric
   * left to right, with the pelvis, chest, head and both feet not moving at
   * all. Every one of those is a separate tell and they compound:
   *
   *   one sine          -> stance and swing take equal time. Real walking is
   *                        about 60/40, and the ear-equivalent is a drum
   *                        machine with swing turned off.
   *   perfect symmetry  -> nothing alive is bilaterally identical. This is the
   *                        single loudest "machine" cue there is.
   *   phase-locked      -> the whole body arrives at once, like a puppet on
   *                        one rod, instead of a chain propagating outward.
   *   exact periodicity -> stride N is stride N+1 to the pixel.
   *   dead pelvis/chest -> the three channels that carry WEIGHT are missing,
   *                        so nothing looks heavy.
   *
   * At 5-15 m through FogExp2 with setSilhouette on, surface detail is gone
   * and only SILHOUETTE and TIMING survive -- so every fix below is aimed at
   * one of those two and nothing is spent on anything else.
   *
   * NONE OF IT CAN MOVE THE FEET OUT FROM UNDER THE BODY. The creature's world
   * position is driven externally (BackroomsHunter, CreatureAI), and gaitPhase
   * advances with DISTANCE via speed/STRIDE -- so anything that changes the
   * average step rate slides the feet. The warp below is monotone and its
   * added term has zero mean over a cycle, so the average rate is exactly
   * unchanged; the asymmetry is amplitude-only for the same reason.
   */
  function animateGlb() {
    const { bones, rest, swing, twist, lean } = glb;

    // Smoothstep, not a linear ramp: a gait that fades in linearly spends its
    // first half-second as a barely-moving figure, which reads as a stutter.
    const walking = THREE.MathUtils.smoothstep(speed, 0.12, 0.95);
    const wrong = 1 - correction;

    // PHASE WARP. gp = gaitPhase + DUTY*sin(gaitPhase) stretches the half of
    // the cycle where the foot is planted and compresses the half where it
    // swings through -- 60/40 at DUTY 0.35, against the 50/50 a raw sine gives.
    // Monotone for DUTY < 1 (d/dphi = 1 + DUTY*cos, minimum 0.65), so the phase
    // never runs backwards, and sin has zero mean so the stride rate is
    // untouched. One line, and it is the largest single improvement here.
    // TWO WARPED PHASES, one per leg, at different depths -- see GAIT_LIMP for
    // why one shared phase cannot produce a limp however hard it is pushed.
    // At limp 0 they collapse to exact mirrors, because gpB(u) = gpA(u + pi)
    // identically when the depths match, which is what keeps Annabelle even.
    const limp = GAIT_LIMP * wrong;
    const gpA = gaitWarp(gaitPhase, GAIT_DUTY + limp);
    const gpB = gaitWarp(gaitPhase + Math.PI, GAIT_DUTY - limp);
    // The torso, arms and coat ride the mean of the two, so they do not inherit
    // either leg's limp wholesale.
    const gp = gaitWarp(gaitPhase);
    // Per-joint lag, so the body is a CHAIN rather than one rigid piece: the
    // shin follows the thigh, the chest follows the hips, the hand is last.
    const at = (k) => gaitWarp(gaitPhase - (GAIT_LAG[k] || 0));

    const s = Math.sin(gp);

    // ASYMMETRY. A fixed bad side -- shorter step, a knee that barely folds, an
    // arm that hardly swings -- lerped away as correction rises, because
    // Annabelle in the family portrait walks like a person and only the Hollow
    // drags. g() is the lerp: 1 means "no limp".
    const g = (v) => THREE.MathUtils.lerp(v, 1, correction);
    const HIP = { l: g(1.00), r: g(0.74) };
    const KNEE = { l: g(1.55), r: g(1.02) };
    // 0.55, not 0.30. At 0.30 the bad arm was frozen rather than lagging, and
    // a frozen limb reads as a rig that is broken rather than as a body that
    // is wrong.
    const ARM = { l: g(1.00), r: g(0.55) };

    // SLOW DRIFT on an incommensurate period, so stride N is not stride N+1.
    // _noise1 is deterministic (see its note) -- this must not fizz per frame.
    const drift = 1 + 0.085 * _noise1(elapsed * 0.17) + 0.05 * Math.cos(elapsed * 0.41);

    const hipSwing = THREE.MathUtils.lerp(HIP_SWING_HOLLOW, HIP_SWING_HUMAN, correction)
      * walking * drift;
    const armSwing = THREE.MathUtils.lerp(ARM_SWING_HOLLOW, ARM_SWING_HUMAN, correction)
      * walking;
    const hang = THREE.MathUtils.lerp(0.10, 0.28, correction);

    // A pose is rest * offset, never an absolute local rotation: the rest
    // quaternion IS the rig's axes, and overwriting it throws the bone's
    // orientation away. Borrowed straight from src/systems/hands/animator.js.
    //
    // Three axes now. sw is the sagittal swing the old bend() had; tw is yaw
    // about the world vertical (pelvic and thoracic rotation); ln is roll about
    // the world forward axis (pelvic drop, the head's list). They compose in a
    // fixed order so the result is stable frame to frame.
    const pose = (name, sw, tw, ln) => {
      const b = bones[name];
      const r = rest.get(name);
      if (!b || !r) return;
      b.quaternion.copy(r.quat);
      if (sw) b.quaternion.multiply(_q.setFromAxisAngle(swing.get(name), sw));
      if (tw) b.quaternion.multiply(_q2.setFromAxisAngle(twist.get(name), tw));
      if (ln) b.quaternion.multiply(_q2.setFromAxisAngle(lean.get(name), ln));
    };
    const bend = (name, angle) => pose(name, angle, 0, 0);

    // --- legs ---------------------------------------------------------------
    // Creature.js's `l` is -X, which is Blender's .R -- see SIDE_SUFFIX.
    bend('thigh' + SIDE_SUFFIX.l, Math.sin(gpA) * hipSwing * HIP.l);
    bend('thigh' + SIDE_SUFFIX.r, Math.sin(gpB) * hipSwing * HIP.r);

    // THE KNEE FLEXES TWICE A CYCLE, which the old max(0, cos) could not do: a
    // small absorption right after the foot lands (taking the body's weight)
    // and a large one through swing (clearing the ground). One bend per cycle
    // is a stilt, and a stilt is most of what made the legs read as plastic.
    // The Hollow barely absorbs -- it does not care about its own joints.
    const kStance = THREE.MathUtils.lerp(0.05, 0.30, correction);
    const kSwing = THREE.MathUtils.lerp(1.30, 1.15, correction);
    const knee = (ph) => {
      const t = ((ph / TAU) % 1 + 1) % 1;
      return (kStance * _arch(t, 0.00, 0.30) + kSwing * _arch(t, 0.55, 1.00)) * walking;
    };
    // Each knee follows ITS OWN leg's warped phase, or the limp would be in the
    // hips and not in the knees, which reads as a hitch rather than a limp.
    const lag = GAIT_LAG.shin;
    bend('shin' + SIDE_SUFFIX.l, -knee(gaitWarp(gaitPhase - lag, GAIT_DUTY + limp)) * KNEE.l);
    bend('shin' + SIDE_SUFFIX.r, -knee(gaitWarp(gaitPhase + Math.PI - lag, GAIT_DUTY - limp)) * KNEE.r);

    // FEET, which were never animated at all -- they hung rigid off the shins
    // like a doll's. A foot that rolls is the difference between walking and
    // being slid along the floor, and the bad side does not roll: it scuffs.
    const roll = (ph) => {
      const t = ((ph / TAU) % 1 + 1) % 1;
      return (0.30 * _arch(t, 0.30, 0.62) - 0.16 * _arch(t, 0.62, 1.00)) * walking;
    };
    const fl = GAIT_LAG.foot;
    bend('foot' + SIDE_SUFFIX.l, roll(gaitWarp(gaitPhase - fl, GAIT_DUTY + limp)) * g(1.0));
    bend('foot' + SIDE_SUFFIX.r,
      roll(gaitWarp(gaitPhase + Math.PI - fl, GAIT_DUTY - limp)) * g(0.25) + 0.16 * walking * wrong);

    // --- pelvis and torso ---------------------------------------------------
    // THE THREE MISSING CHANNELS. A walking pelvis drops on whichever side has
    // no foot under it, rotates in the transverse plane, and the ribcage
    // counter-rotates against it. Without them the torso is cargo; with them
    // the figure has weight, and weight is what reads at distance.
    const drop = THREE.MathUtils.lerp(0.17, 0.08, correction) * walking
      * Math.sin(gp + THREE.MathUtils.lerp(0.55, 0.20, correction));
    const prot = THREE.MathUtils.lerp(0.05, 0.10, correction) * walking * Math.sin(gp - 0.20);
    pose('hips', 0, prot, drop);

    // Counter-rotation, and then ONE coupling deliberately broken: at
    // correction 0 the lag is ~pi, which flips the sign, so the Hollow's
    // shoulders rotate WITH its hips instead of against them. Every human
    // walks with the opposite arm forward; a body that does not is wrong in a
    // way most people feel before they can name it.
    const torsoLag = THREE.MathUtils.lerp(2.05, 0.0, correction);
    const srot = -THREE.MathUtils.lerp(0.09, 0.12, correction) * walking
      * Math.sin(gp - 0.20 + torsoLag);
    pose('chest', 0, srot, 0);
    pose('spine', -p.hunch, 0, srot * 0.35);

    // --- the head that will not bob ----------------------------------------
    // The neck undoes what the torso is doing, so the skull hangs almost still
    // in space while the body works underneath it. Over-corrected at
    // correction 0 (stab > 1): TOO still is the effect -- a head that tracks
    // you with none of the sway a real one would have.
    const stab = THREE.MathUtils.lerp(1.15, 0.65, correction);
    pose('neck', -p.neckLean, -srot * stab, -drop * stab);
    // headTilt finally reaches the GLB. It is a frontal-plane list, so it goes
    // on the LEAN axis; putting it on swing would nod rather than tilt.
    pose('head', 0, 0, p.headTilt * wrong * 0.6 + _noise1(elapsed * 0.23 + 7.1) * 0.05 * wrong);

    // --- arms ---------------------------------------------------------------
    const armPh = at('upper_arm');
    const sa = Math.sin(armPh);
    bend('upper_arm' + SIDE_SUFFIX.l, -sa * armSwing * ARM.l - p.shoulderRoll * 0.5);
    bend('upper_arm' + SIDE_SUFFIX.r, sa * armSwing * ARM.r - p.shoulderRoll * 0.5);
    // THE SHOULDER GIRDLE MOVES TOO. The clavicles were in the rig, named in
    // the boot-time bone check, and never written to -- so the arm rotated out
    // of a shoulder that stayed perfectly still, which is the single clearest
    // way to make a limb look bolted on. A real shoulder rides forward and up
    // a little with its own arm, about a fifth of what the arm does, and a
    // beat behind it.
    const clav = Math.sin(at('upper_arm') - 0.35) * armSwing * 0.22;
    bend('clavicle' + SIDE_SUFFIX.l, -clav * ARM.l);
    bend('clavicle' + SIDE_SUFFIX.r, clav * ARM.r);
    // The elbows were a CONSTANT. A forearm welded at a fixed angle through a
    // whole stride is the clearest single giveaway in the old gait, because
    // the eye tracks hands. They now trail the shoulder by GAIT_LAG.forearm.
    const elb = Math.sin(at('forearm'));
    // 0.30 at the Hollow end, up from 0.12. An elbow that moves a seventh of a
    // radian over a stride is an elbow nobody can see move.
    const elbow = THREE.MathUtils.lerp(0.30, 0.45, correction) * walking;
    bend('forearm' + SIDE_SUFFIX.l, hang - elbow * elb * ARM.l);
    bend('forearm' + SIDE_SUFFIX.r, hang + elbow * elb * ARM.r);

    // The coat panels lag behind the stride. Motion survives fog long after
    // value contrast has gone, so a hem that swings is the long-range read.
    const lagPh = Math.sin(at('coat')) * 0.12 * walking;
    bend('coat_frontL', lagPh);
    bend('coat_frontR', lagPh);
    bend('coat_back', -lagPh * 0.6);

    // --- weight -------------------------------------------------------------
    // TWO peaks per stride, not one, and no cusp. abs(sin) has a corner at
    // every footfall, which on a silhouette is a visible tick; cos(2*gp) is
    // smooth and peaks at mid-stance where the body really is highest. The
    // extra drop on the bad side is the lurch, and it is most of the limp's
    // read at distance.
    const bob = (0.024 * Math.cos(2 * gp - 3.77) - 0.016 * Math.max(0, -s) * wrong) * walking;
    const breath = Math.sin(elapsed * 1.4) * 0.008 * (1 - walking);
    // Lateral weight shift. hips.position is in the armature root's space, the
    // same space applyGlb() places the thigh roots in, so X is safe to write.
    const sway = THREE.MathUtils.lerp(0.034, 0.022, correction) * walking * Math.sin(gp + 0.25);
    if (bones.hips) {
      bones.hips.position.set(sway, p.hipHeight - HIPS_BONE_LENGTH + bob + breath, 0);
    }
  }

  loadModel(creatureModelUrl)
    .then((scene) => {
      glb = attachGlb(scene);
      dirty = true;
    })
    .catch((err) => {
      // Same contract as every other loadModel() call in this repo: the level
      // still runs, it just looks worse. A creature is a worse thing to lose
      // than a dresser, which is exactly why the primitive rig is still here.
      console.warn('Creature: creature.glb failed to load; keeping the primitive rig.', err);
    });

  applyProportions();

  return {
    group,
    /**
     * Named joints, for anything that needs a point on the body rather than a
     * point on the floor. The AI sightline starts at `head`, not at the root --
     * a creature that decides what it can see from between its own feet will
     * happily stare through a table. Also what lets a test assert the arms are
     * long instead of measuring the shins by accident.
     */
    refs: {
      root,
      hips,
      chest,
      head,
      hands: { l: arms.l.joints[2], r: arms.r.joints[2] },
      feet
    },
    /** Where it stands. Kept as x/z like every other position in this game. */
    setPosition(x, z) {
      root.position.set(x, 0, z);
    },
    get position() {
      return root.position;
    },
    /** Facing, radians. 0 looks down -Z, matching the player's yaw convention. */
    setYaw(yaw) {
      root.rotation.y = yaw;
    },
    get yaw() {
      return root.rotation.y;
    },
    /** Metres per second. Drives the gait; 0 is a standing idle, not a freeze. */
    setSpeed(v) {
      speed = Math.max(0, v);
    },
    /**
     * 0 = the Hollow, 1 = Annabelle. Drive it straight from the visor amount.
     * Continuous on purpose: half way through is a real, coherent in-between,
     * which is what makes putting the visor on read as focusing rather than as
     * the game swapping the model out.
     */
    setCorrection(value) {
      const next = THREE.MathUtils.clamp(value, 0, 1);
      if (Math.abs(next - correction) < 0.001) return;
      correction = next;
      dirty = true;
    },
    get correction() {
      return correction;
    },
    /**
     * Toggles the shadow-only colour multiplier -- see the note above
     * `silhouette`'s declaration. Independent of setCorrection(): a caller
     * can turn this on and off without disturbing whatever proportion blend
     * is currently set, and vice versa.
     */
    setSilhouette(on) {
      const next = !!on;
      if (next === silhouette) return;
      silhouette = next;
      dirty = true;
    },
    get isSilhouette() {
      return silhouette;
    },
    /** Standing height at the current blend, for door and sightline checks. */
    get height() {
      return standingHeight(p);
    },
    set visible(v) {
      group.visible = v;
    },
    get visible() {
      return group.visible;
    },
    update(dt) {
      if (dirty) applyProportions();
      animate(dt);
    },
    /** Back to a standing, uncorrected, non-silhouette figure. Called on restart. */
    reset() {
      correction = 0;
      silhouette = false;
      speed = 0;
      gaitPhase = 0;
      elapsed = 0;
      dirty = true;
      applyProportions();
      animate(0);
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      skin.dispose();
      clothes.dispose();
      hair.dispose();
      // The loaded materials too -- traverse() above only reaches geometry, and
      // the GLB brings five of its own.
      if (glb) {
        for (const m of glb.materials) m.dispose();
        glb = null;
      }
    }
  };
}
