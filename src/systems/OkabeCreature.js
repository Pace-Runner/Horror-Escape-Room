import * as THREE from 'three';
import { loadModel } from '../world/modelLoader.js';
import okabeModelUrl from '../assets/models/okabe.glb?url';
import okabeCleanModelUrl from '../assets/models/okabe_clean.glb?url';

/**
 * The imported Okabe character, with the same public contract as Creature.js.
 *
 * WHY A SECOND FILE RATHER THAN A FLAG INSIDE Creature.js. That file builds a
 * primitive capsule rig AND drives a generated GLB, and every line of it is
 * tuned to bone names its own exporter chose. This asset arrives from a Unity
 * package with an MMD-derived skeleton -- 'Right elbow' is the forearm, the
 * lab coat has twenty-one of its own bones, and the rest pose is an A-pose
 * rather than the T-pose the generated rig uses. Threading two skeletons
 * through one set of functions would make both harder to read and neither
 * easier to fix.
 *
 * It exports the SAME shape, though, deliberately: group, refs, setPosition,
 * setYaw, setSpeed, setCorrection, setSilhouette, update, reset, dispose and
 * the visible/height/position/yaw accessors. main.js can swap the import and
 * change nothing else.
 *
 * ONE BODY, TWO READINGS, exactly as before. blender/import_okabe.py bakes a
 * single 'Monster' shape key onto the imported mesh, so correction 1 is the
 * man and correction 0 is the thing he became -- the same mesh, the same
 * skeleton, the same UVs. The reveal is true by construction rather than by
 * swapping one model for another.
 */

/**
 * How much longer each segment gets in the monster reading.
 *
 * THIS TABLE IS A COPY AND THE DUPLICATION IS THE POINT OF THIS COMMENT. The
 * authority is STRETCH in blender/import_okabe.py, which used it to bake the
 * shape key's vertex positions. A shape key moves vertices and cannot move a
 * joint, so the bones have to be told the same thing separately -- and if the
 * two tables ever disagree, the mesh stretches while the skeleton does not and
 * the limb creases through the middle of the forearm. Change one, change both.
 */
const STRETCH = {
  arm: 1.50, elbow: 1.63, wrist: 1.90,
  neck: 1.85, spine: 1.20, chest: 1.20,
  leg: 1.18, knee: 1.18, ankle: 1.00
};

/** Measured by blender/import_okabe.py at correction 0. */
const MONSTER_HEIGHT = 2.202;

/**
 * Radians the upper arms are brought IN from the imported A-pose.
 *
 * The model is authored with its arms 47.6 degrees off vertical, which is a
 * modelling pose and not a standing one -- left alone, the figure walks with
 * its fingertips 604 mm out to each side, a 1.25 m wide silhouette on a 1.85 m
 * body. At 10 m in fog that is a scarecrow, and it was wrong in BOTH readings.
 *
 * Applied on the measured LEAN axis, which is the frontal plane -- putting it
 * on swing would send the arms forward rather than down.
 *
 * THE MONSTER NEEDS MORE, NOT LESS, and I had this backwards first time on the
 * reasoning that longer arms want clearance from the coat. Lateral reach is
 * shoulderX + armLength * sin(angle), so at the SAME angle the monster's
 * 0.982 m arm projects much further than the man's 0.599 m one -- measured, it
 * sat at 454 mm against the man's 294. The angle has to close as the arm
 * lengthens just to hold the silhouette still.
 */
const ARM_DOWN_HUMAN = 0.62;
const ARM_DOWN_MONSTER = 0.72;
/**
 * Which way round the lean axis brings an arm IN rather than out.
 *
 * Measured, not reasoned: the sign depends on how the rig author built the
 * bone roll, and getting it backwards doubles the A-pose instead of undoing
 * it. Flip this and the fingertip spread in the check below goes UP.
 */
const ARM_DOWN_SIGN = 1;

/** Matches Creature.js, so the two figures dim identically. */
const SILHOUETTE_DIM = 0.18;

/**
 * Metres per full stride. Fallback only -- see STRIDE_PER_LEG.
 *
 * Creature.js uses a flat 1.55 and this file copied it, which is wrong for a
 * figure whose legs change length with the dial: the same 1.55 is a long reach
 * for the man's 0.804 m leg and an easy one for the monster's 1.006 m.
 */
const STRIDE = 1.55;

/**
 * Stride as a multiple of the leg's own length, which is what actually sets it.
 *
 * Solved rather than picked, and the solution is what limits it. The rig
 * STANDS WITH ITS KNEES LOCKED -- measured, the hip sits at 99.4% of the
 * hip-to-ankle length above the ankle -- so the foot cannot reach the ground
 * anywhere except directly below unless the hips come down and the foot rolls.
 * With the hip lowered by CROUCH and the ankle up by TOE_RISE at push-off, the
 * ankle is (0.994 - 0.100 - 0.125) = 0.769 leg lengths below the hip, so the
 * furthest it can be fore or aft and still touch is
 * sqrt(0.97^2 - 0.769^2) = 0.591, and a stance lasting WALK_DUTY of the cycle
 * covers twice that: stride = 2 * 0.591 / 0.60 = 1.97. Taking 1.95 leaves a
 * sliver of margin before solveLeg's clamp, which is where the foot would
 * start lifting off the floor again.
 *
 * LONGER STEPS COME FROM HERE AND FROM CROUCH TOGETHER, not from this alone:
 * raising it without lowering the hip just asks for a reach the leg has not
 * got, and the IK clamps rather than stretching. The binding case is HEEL
 * STRIKE, not toe-off, because the ankle rides lower there -- getting that
 * backwards is how the first attempt at a longer stride put the foot back in
 * the air at the front of every step.
 *
 * SPLIT BY READING, because the two bodies want opposite things. The monster
 * is asked to cover ground at the same speed while cycling 15% slower, and
 * cadence is speed/stride, so its stride has to grow 15% -- which only fits
 * behind a deep stalking crouch. The man has to keep walking like a man, and
 * he is about to be the player character, so he gets a normal 1.40 m stride
 * at 2.1 steps/s off a shallow crouch.
 *
 *   monster 2.30 m at 1.0 steps/s walking, 2.0 running
 *   man     1.40 m at 2.1 steps/s walking
 */
const STRIDE_PER_LEG_MONSTER = 2.29;
const STRIDE_PER_LEG_HUMAN = 1.74;

/**
 * How far the hips drop while walking, and how high the ankle rides at each
 * end of stance, both as fractions of leg length.
 *
 * These are not decoration: without them the leg is asked to reach further
 * than it is long at every heel strike and toe-off, the IK clamps, and the
 * foot lifts off the floor and skates. The monster's bad leg measured 1.01 m/s
 * under a body doing 2.35 purely from that clamp. A real walk does both of
 * these things for the same reason.
 *
 * THEY ARE WHAT PAYS FOR THE STRIDE, so they are split by reading alongside
 * it. Solving the heel-strike triangle for each: the ankle sits
 * (0.994 - CROUCH - HEEL_RISE) leg lengths below the hip and
 * WALK_DUTY*stride/2 in front of it, and that has to stay inside 0.985 of the
 * leg's own length or the knee locks out and the foot leaves the floor.
 *
 *   monster  0.994-0.160-0.130 = 0.704 down, 0.687 forward -> 0.983  OK
 *   man      0.994-0.075-0.085 = 0.834 down, 0.522 forward -> 0.984  OK
 *
 * The monster's 160 mm crouch is also the point rather than a cost: it walks
 * hunched, which is what a thing stalking a corridor should look like. The
 * man's 60 mm is an ordinary walking hip drop and leaves his posture alone.
 */
/**
 * LEANING OUT FROM BEHIND A CORNER, in radians, shared down the spine.
 *
 * Split between spine, chest and neck rather than put on one joint, because a
 * body that pivots at a single point reads as a hinge. 0.16 + 0.22 + 0.09 is
 * 0.47 rad of total lateral lean. MEASURED at the head rather than estimated:
 * 217 mm sideways and 76 mm forward in the monster reading, 165 mm sideways in
 * the man's -- far enough to be unmistakably a figure looking at you, and not
 * so far that it has stepped out of cover.
 *
 * THE HIPS ARE DELIBERATELY NOT IN THIS LIST. The whole point is that the
 * body stays behind the corner and only the top of it comes out; leaning from
 * the hips would walk the whole silhouette into the open and lose the read.
 */
const PEEK_SPINE = 0.16;
const PEEK_CHEST = 0.22;
const PEEK_NECK = 0.09;
const PEEK_HEAD_TURN = 0.42;    // twist, so the face comes round to the player
const PEEK_HEAD_TILT = 0.14;    // counter-roll: the head stays nearer level
const PEEK_HEAD_DIP = 0.10;     // and drops a little, the way people peer
const PEEK_CRANE = 0.11;        // forward lean of the chest, craning to see

/**
 * How fast it leans out, and how fast it withdraws, in seconds.
 *
 * ASYMMETRIC ON PURPOSE, and this is the whole character of the move. Coming
 * out slowly is what makes it feel like something choosing to look; going back
 * quickly is what makes it feel like it knows it has been seen. Equal rates
 * read as a metronome.
 */
const PEEK_OUT_TAU = 0.38;
const PEEK_BACK_TAU = 0.15;

const CROUCH_MONSTER = 0.160;
const CROUCH_HUMAN = 0.075;
const HEEL_RISE_MONSTER = 0.130;
const HEEL_RISE_HUMAN = 0.085;
const TOE_RISE_MONSTER = 0.150;
const TOE_RISE_HUMAN = 0.110;

/**
 * Which row of STRETCH a bone belongs to.
 *
 * Ordered longest-key-first, and that ordering is load-bearing: this rig calls
 * the forearm 'Right elbow', so testing 'arm' before 'elbow' would classify
 * every forearm as an upper arm and stretch it by the wrong factor.
 */
const KIND_KEYS = ['fronthair', 'elbow', 'wrist', 'shoulder', 'ankle', 'knee',
  'neck', 'spine', 'chest', 'hips', 'head', 'arm', 'leg'];

/**
 * One spelling for a bone, whatever the loader did to it.
 *
 * GLTFLoader runs every node name through PropertyBinding.sanitizeNodeName,
 * which replaces whitespace with underscores -- so 'Left arm' in the FBX
 * arrives as 'Left_arm' in the scene. Every bone in this rig has a space in it
 * except Hips, which is why the first version of this file animated the pelvis
 * perfectly and nothing else at all: the bob and sway were visibly correct
 * while both legs, both arms and all twenty-one coat bones stayed at rest.
 *
 * Canonicalising on the way in and on every lookup makes the module work
 * against the raw FBX names and the sanitised glTF ones alike, so it cannot
 * break again if the export path changes.
 */
function canon(name) {
  return name.toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

function kindOf(name) {
  const n = canon(name);
  if (n.includes('white clothes') || n.includes('belt')) return null;
  for (const k of KIND_KEYS) if (n.includes(k)) return k;
  return null;
}

/** Phase warp: stretches stance, compresses swing. See Creature.js's GAIT_DUTY. */
const GAIT_DUTY = 0.35;
const gaitWarp = (u, duty = GAIT_DUTY) => u + duty * Math.sin(u);
const TAU = Math.PI * 2;

/**
 * Share of a cycle each foot spends ON THE GROUND.
 *
 * This is the one number that separates a walk from a run, and expressing it
 * as a stance FRACTION rather than as a phase-warp coefficient is what makes
 * it safe to change: the foot path below plants the foot for exactly this
 * share of the cycle and moves it backward at exactly the body's speed while
 * it is down, so the gait cannot slide no matter what this is set to. A walk
 * is about 60% stance and a run about 37%; below 50% both feet are off the
 * ground at once, which is the definition of a run.
 */
const WALK_DUTY = 0.60;
const RUN_DUTY = 0.37;

/** Metres the ankle clears the floor at mid-swing. Measured on real walks at 0.10-0.15. */
const WALK_LIFT = 0.13;
const RUN_LIFT = 0.27;

/**
 * Where the run begins and ends, in metres per second.
 *
 * Chosen against the speeds the game actually asks for: BackroomsHunter's
 * search is 1.451 and its chase 2.353, so these put searching at a pure walk
 * and chasing at a pure run with the whole blend in between and nothing
 * sitting on a boundary where it would flicker.
 */
const RUN_FROM = 1.55;
const RUN_TO = 2.30;

/**
 * The monster's bad leg: LESS TIME ON THE GROUND, and a higher, later swing.
 *
 * BAD_DUTY scales that leg's stance fraction, and its step length follows from
 * it, so the foot still travels at the body's speed while it is down -- see
 * the note at the call site. The limp therefore reads as weight being taken
 * off one side early, which is what a limp is, rather than as one leg quietly
 * skating.
 *
 * The limp used to be joint multipliers -- 1.55x on one knee's flexion -- and
 * that is what put the left ankle 497 mm above its own knee. Expressed on the
 * foot PATH instead it stays anatomically possible however far it is pushed,
 * because the joints are solved to reach it rather than driven open.
 */
const BAD_STEP = 0.72;
const BAD_LIFT = 1.50;
const BAD_LAG = 0.06;

/**
 * Where the foot should BE, in the body's own frame, at phase t of the cycle.
 *
 * THE GAIT IS WRITTEN HERE AND NOWHERE ELSE, and that is the point. Driving
 * hip and knee angles with sinusoids and hoping produced a figure whose foot
 * rose and fell TWICE per cycle and whose fore/aft speed swung between -2.1
 * and +3.8 m/s while the body travelled a steady 1.45 -- the feet paddled.
 * Stating the path and solving the joints to reach it makes contact exact:
 * during stance z advances by duty*STRIDE over duty*T seconds, which is
 * STRIDE/T = the body's speed, for every duty and every speed.
 *
 * t = 0 is touchdown. z is metres BEHIND the hip, y is metres above the floor
 * the foot stands on.
 */
function footPath(t, duty, step, lift, heel, toe) {
  const u = ((t % 1) + 1) % 1;
  const sUp = (x) => { const c = THREE.MathUtils.clamp(x, 0, 1); return c * c * (3 - 2 * c); };
  if (u < duty) {
    const uu = u / duty;
    return {
      // Planted. Linear in z is not a stylistic choice -- any other curve here
      // is a foot sliding on the floor. Note the ANKLE rises at both ends
      // while z stays linear, so rolling onto the heel and up onto the toes
      // costs nothing in slip: only the vertical changes.
      z: -step / 2 + step * uu,
      y: heel * sUp((0.42 - uu) / 0.42) + toe * sUp((uu - 0.58) / 0.42)
    };
  }
  const s = (u - duty) / (1 - duty);
  // Cubic Hermite from back to front with h(0)=0, h(1)=1, h'(0)=0 and a
  // NEGATIVE end slope, so the foot reaches a little past the landing point
  // and is already travelling backward when it touches down. Without that it
  // lands dead and jumps to speed, which reads as a skid at every step.
  const endSlope = -(1 - duty) / duty;
  const h = (-2 * s ** 3 + 3 * s ** 2) + (s ** 3 - s ** 2) * endSlope;
  return {
    z: step / 2 - step * h,
    // Starts where toe-off left the ankle and ends where heel strike wants it,
    // so y is continuous all the way round the cycle; the arch is clearance on
    // top of that. Skewed early, because a foot clears the ground just after
    // toe-off and is already reaching by mid-swing.
    y: toe + (heel - toe) * sUp(s)
      + lift * Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 1.3
  };
}

/**
 * Two-bone IK in the sagittal plane: where must hip and knee be to put the
 * ankle at (dz, dy) relative to the hip?
 *
 * dz is BEHIND, dy is up (so a foot on the floor is negative). Returns the
 * absolute hip swing from straight-down and the knee flexion from straight;
 * the caller subtracts the rest pose's own values, because this rig does not
 * stand with its legs perfectly vertical.
 */
function solveLeg(L1, L2, dz, dy) {
  const reach = (L1 + L2) * 0.999;      // never ask for a locked, dead-straight knee
  const D = Math.min(Math.hypot(dz, dy), reach);
  const psi = Math.atan2(dz, -dy);      // 0 = straight down, + = behind
  const cosK = THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1);
  const thetaK = Math.acos(cosK);       // interior angle at the knee
  const alpha = Math.asin(THREE.MathUtils.clamp(
    L2 * Math.sin(thetaK) / Math.max(D, 1e-6), -1, 1));
  // psi - alpha puts the knee IN FRONT of the hip-to-ankle line, which is the
  // only way a knee bends. psi + alpha solves the same triangle backwards.
  return { swing: psi - alpha, flex: Math.PI - thetaK };
}

/** 0 outside [a, b], a smooth arch peaking at 1 in the middle. */
function arch(t, a, b) {
  const u = (t - a) / (b - a);
  return (u <= 0 || u >= 1) ? 0 : Math.sin(Math.PI * u) ** 2;
}

/** Radians each joint trails the one before it, so the body is a chain. */
const LAG = { knee: 0.14, ankle: 0.30, spine: 0.16, chest: 0.26, neck: 0.44, arm: 0.30, elbow: 0.62 };

/**
 * @param clean {boolean} load the UNBEFOULED body -- the man, not the monster.
 *
 * The two files are the same mesh, the same skeleton, the same Monster shape
 * key and the same UVs; only the textures differ. blender/import_okabe.py
 * writes the clean one before befoul() is allowed near the images, which is
 * the only way to have both: a glTF material carries ONE base colour texture,
 * so the blood cannot be on a dial the way the proportions are.
 */
export function createOkabeCreature({ clean = false } = {}) {
  const group = new THREE.Group();
  group.name = 'okabe';

  const root = new THREE.Group();
  group.add(root);

  let skin = null;              // the SkinnedMeshes (one per material)
  let bones = null;             // name -> Bone
  let restPos = null;           // name -> original bone.position
  let restQuat = null;          // name -> original bone.quaternion
  let swingAxis = null;         // name -> sagittal axis, MEASURED; see measureAxes
  let twistAxis = null;
  let leanAxis = null;
  let legRig = null;            // side -> bone lengths and rest angles; see measureLegs
  let morphMeshes = [];         // meshes carrying the Monster target
  let baseColors = null;        // material -> original colour, for silhouette

  let correction = 1;           // 1 = the man, 0 = the monster
  let speed = 0;
  let gaitPhase = 0;
  let elapsed = 0;
  let silhouette = false;
  let peekTarget = 0;           // -1 leans to its left, +1 to its right
  let peekNow = 0;              // what the body is actually doing, smoothed
  let visible = true;
  let height = 1.849;           // measured by import_okabe.py; updated on load
  let hipLift = 0;              // metres the hips rise at correction 0; see attach()

  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  /**
   * The imported model faces the wrong way, by exactly half a turn.
   *
   * MMD characters are authored looking down Blender's -Y. export_yup maps
   * Blender (x, y, z) to glTF (x, z, -y), so that -Y becomes +Z -- while this
   * game's convention, set by Creature.js, is that yaw 0 looks down -Z. The
   * model therefore spawns with its back to whatever it is pointed at, which
   * is a hard thing to spot on a figure seen as a silhouette in fog: it walks
   * towards you perfectly happily, facing away.
   *
   * Corrected on the loaded SCENE rather than inside setYaw() so that `yaw`
   * keeps exactly the meaning it has everywhere else in the codebase. A +pi
   * hidden in the setter would leak the moment anything compared this
   * creature's yaw against the player's, or against the procedural one's.
   */
  const MODEL_FACES_PLUS_Z = Math.PI;

  function attach(scene) {
    scene.rotation.y = MODEL_FACES_PLUS_Z;
    root.add(scene);
    bones = new Map();
    restPos = new Map();
    restQuat = new Map();
    swingAxis = new Map();
    twistAxis = new Map();
    leanAxis = new Map();
    skin = [];
    morphMeshes = [];
    baseColors = new Map();

    scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        skin.push(o);
        // SkinnedMesh declares boundingSphere = null and Frustum computes it
        // ONCE, then nothing invalidates it -- so the sphere freezes at
        // whatever pose and morph weight held on the first culled frame and
        // the character pops out of view at glancing angles, precisely when
        // the morph is driving. Same fix as hands/hand-mesh.js.
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.morphTargetDictionary && 'Monster' in o.morphTargetDictionary) {
          morphMeshes.push({ mesh: o, idx: o.morphTargetDictionary.Monster });
        }
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (m && m.color && !baseColors.has(m)) baseColors.set(m, m.color.clone());
        }
      }
      if (o.isBone) {
        const k = canon(o.name);
        bones.set(k, o);
        restPos.set(k, o.position.clone());
        restQuat.set(k, o.quaternion.clone());
      }
    });

    // Boot-time assertions rather than silent wrongness later. console.error,
    // never throw -- the same contract every other loadModel() call here has:
    // the level still runs, it just looks worse.
    if (!skin.length) console.error('OkabeCreature: okabe.glb has no SkinnedMesh.');
    if (!morphMeshes.length) {
      console.error('OkabeCreature: no "Monster" morph target. The correction '
        + 'dial will do nothing -- check that extras.targetNames survived the '
        + 'export, because without it morphTargetDictionary degrades to {"0":0}.');
    }
    const want = ['Hips', 'Spine', 'Chest', 'Neck', 'Head',
      'Left arm', 'Left elbow', 'Right arm', 'Right elbow',
      'Left leg', 'Left knee', 'Left ankle', 'Right leg', 'Right knee', 'Right ankle'];
    const missing = want.filter((n) => !bones.has(canon(n)));
    if (missing.length) {
      console.error('OkabeCreature: missing bones: ' + missing.join(', ')
        + '. Those joints will not move.');
    }

    measureAxes(scene);

    // HOW FAR THE HIPS HAVE TO RISE so the feet stay on the floor.
    //
    // The monster's legs lengthen 18%, measured DOWNWARD from a hip joint that
    // nothing moves -- so without this the ankles end up 156 mm below the floor
    // and the figure walks shin-deep in it. (This said 56 mm, which was simply
    // wrong by 100: the morph puts the untreated feet at y = -0.156. The code
    // was always right to within 4 mm; only the number in this comment was
    // not.) The procedural creature never had
    // the problem because its HOLLOW table raises hipHeight 0.92 -> 0.99 for
    // exactly this reason; this rig has no such table, so the lift is derived
    // from the bones themselves.
    //
    // A child bone's rest position IS its parent's length, so the thigh's
    // length is the knee's offset and the shin's is the ankle's. Deriving it
    // means the two stay in step if STRETCH ever changes, which a hardcoded
    // number would not.
    const knee = restPos.get(canon('Left knee'));
    const ankle = restPos.get(canon('Left ankle'));
    hipLift = (knee ? knee.length() * (STRETCH.leg - 1) : 0)
      + (ankle ? ankle.length() * (STRETCH.knee - 1) : 0);

    const box = new THREE.Box3().setFromObject(scene);
    height = box.max.y - box.min.y;
    applyCorrection();
    assertGaitIsPossible();
  }

  /**
   * Write the correction dial onto the morph AND the bone lengths.
   *
   * The two halves are not interchangeable. The morph carries thickness and
   * the baked lengthening of the FLESH; the bones carry where the joints
   * actually are. Drive only the morph and the mesh stretches past a skeleton
   * that stayed put, which creases the limb at mid-forearm; drive only the
   * bones and the mesh tears off its own joints.
   */
  function applyCorrection() {
    const wrong = 1 - correction;
    for (const { mesh, idx } of morphMeshes) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = wrong;
    }
    if (!bones) return;
    for (const [name, bone] of bones) {
      const rest = restPos.get(name);
      void name;
      if (!rest) continue;
      const parent = bone.parent && bone.parent.isBone ? bone.parent.name : null;
      const k = parent ? kindOf(parent) : null;
      // A child's position IS the parent's length, expressed in the parent's
      // space -- so lengthening the parent is a scale on the child's offset,
      // whatever direction the bone happens to point. That matters here: this
      // rig is an A-pose, so no limb is axis-aligned and the nudge-one-axis
      // trick the generated rig uses would shear every arm.
      // DEFAULT TO 1, and the `?? 1` is the whole of this comment's reason for
      // existing. kindOf() classifies far more than STRETCH has rows for --
      // shoulder, head, hips, finger, thumb, eye and tongue all come back as a
      // kind and none of them lengthens. Reading STRETCH[k] for those gives
      // undefined, `undefined - 1` is NaN, and a NaN bone position propagates
      // down the entire chain through matrixWorld. The arms, hands and head
      // ended up at NaN while Hips -- whose parent is nothing -- stayed valid,
      // so the figure collapsed into a blob hanging at hip height.
      //
      // It survived every check I had because the gait is written in
      // QUATERNIONS and those were all correct; nothing was reading positions.
      const stretch = STRETCH[k] ?? 1;
      const s = 1 + (stretch - 1) * wrong;
      bone.position.copy(rest).multiplyScalar(s);
      // The hips carry the lift, not a scale -- they have no parent bone to
      // lengthen, and the legs below them grew downward.
      if (name === canon('Hips')) bone.position.y = rest.y + hipLift * wrong;
      if (!Number.isFinite(bone.position.x)) {
        console.error('OkabeCreature: non-finite position on bone "' + name
          + '" (parent kind "' + k + '"). The chain below it will be garbage.');
      }
    }
    // The legs just changed length, so the IK's idea of them is now stale.
    measureLegs();
  }

  /** rest * offset, never an absolute rotation -- the rest quaternion IS the axis. */
  /**
   * Rotate a bone about a MEASURED world axis, not about its raw local X.
   *
   * This is the single largest correctness bug this file had, and it hid
   * because it is right by accident on most of the skeleton. Measured as the
   * dot of each bone's local X against world X at rest:
   *
   *   hips, spine, chest, neck, head, leg, knee, ankle   >= 0.994   (fine)
   *   'Left arm'    0.462      'Left elbow'  0.423
   *   'Left wrist'  0.261      'Left shoulder' 0.056
   *
   * The arm bones are built along the A-pose limb, which runs down and out, so
   * their local X is 62.5 degrees off the sagittal plane. Commanding a forward
   * swing on it delivered 46% of the motion forward and 74% of it SIDEWAYS --
   * the arms were flapping outward rather than swinging, which at silhouette
   * distance is the whole read.
   *
   * The recipe is Creature.js's: take the bone's rest WORLD quaternion, invert
   * it, and pull the three world axes back through it. swing is the sagittal
   * plane (forward/back, what a limb does when it walks), twist is yaw about
   * the vertical, lean is roll about the forward axis.
   */
  function measureAxes(scene) {
    // MEASURED WITH THE MODEL'S OWN FACING UNDONE. attach() rotates the scene
    // by pi to meet the game's yaw convention, and measuring through that would
    // flip the sign of swing and lean on every bone -- which would invert a
    // gait that is currently correct everywhere except the arms.
    const saved = scene.rotation.y;
    scene.rotation.y = 0;
    scene.updateMatrixWorld(true);
    const wq = new THREE.Quaternion();
    for (const [key, b] of bones) {
      b.getWorldQuaternion(wq);
      const inv = wq.clone().invert();
      swingAxis.set(key, new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize());
      twistAxis.set(key, new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize());
      leanAxis.set(key, new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize());
    }
    scene.rotation.y = saved;
    scene.updateMatrixWorld(true);
  }

  /**
   * Thigh and shin LENGTHS, and the angles the rest pose is already holding.
   *
   * Re-measured whenever the dial moves, because STRETCH rewrites both bone
   * offsets: the monster's leg is 1.006 m against the man's 0.804, and solving
   * against the wrong length puts the foot through the floor or leaves it
   * hanging. Measuring beats reading STRETCH here -- the table says what the
   * bones were multiplied BY, this says what they now ARE.
   */
  function measureLegs() {
    legRig = null;
    if (!bones || !restQuat) return;
    const out = {};
    root.updateWorldMatrix(true, false);
    for (const side of ['left', 'right']) {
      const parts = [side + ' leg', side + ' knee', side + ' ankle'].map((n) => bones.get(n));
      if (parts.some((b) => !b)) return;
      const [thigh, shin, foot] = parts;
      // Measure off the REST pose, not whatever animate() left behind.
      for (let i = 0; i < 3; i++) {
        const r = restQuat.get([side + ' leg', side + ' knee', side + ' ankle'][i]);
        if (r) parts[i].quaternion.copy(r);
      }
      // A child's offset IS its parent's length. See applyCorrection.
      const L1 = shin.position.length();
      const L2 = foot.position.length();
      const hip = root.worldToLocal(thigh.getWorldPosition(_v));
      const ank = root.worldToLocal(foot.getWorldPosition(_v2));
      const rest = solveLeg(L1, L2, ank.z - hip.z, ank.y - hip.y);
      out[side] = {
        L1, L2, restSwing: rest.swing, restFlex: rest.flex,
        // Where the ankle sits when the figure simply stands. The foot path's
        // y = 0 means HERE, not the world origin -- the ankle joint is 115 mm
        // up inside the foot and aiming it at the floor buries the shoe.
        groundY: ank.y
      };
    }
    legRig = out;
  }

  /**
   * Walk the gait once at boot and fail loudly on the two things that cannot be
   * true of a leg.
   *
   * WHY THIS EXISTS, AND WHY IT IS A SWEEP RATHER THAN AN INSPECTION. Both of
   * the bugs it catches shipped, and both survived a file full of correct
   * measurements, because the measurements were of the wrong quantity: the
   * gait was checked in quaternions while the knee bent BACKWARDS, and the
   * skeleton was checked in rotations while the bone POSITIONS were NaN. The
   * only way to catch that class of thing is to run the animation and look at
   * where the joints actually ended up.
   *
   *   1. The ankle is never at or above its own knee. A shin cannot point up
   *      out of a knee at any flexion. The inverted knee sign put it 497 mm
   *      above at correction 0 and this is what it fails on.
   *   2. While a foot is down it travels backward at the body's own speed.
   *      Anything else is the figure skating, which is what driving joints
   *      with sinusoids did -- fore/aft foot speed swung between -2.1 and
   *      +3.8 m/s under a body doing a steady 1.45.
   *
   * console.error, never throw, like every other assertion in this file.
   */
  function assertGaitIsPossible() {
    if (!bones || !legRig) return;
    const savedCorrection = correction;
    const savedSpeed = speed;
    const savedPhase = gaitPhase;
    const report = [];
    for (const corr of [0, 1]) {
      correction = corr;
      applyCorrection();
      speed = 1.45;
      let worstAbove = -Infinity;
      let bestRun = { left: 0, right: 0 };
      const prevZ = {};
      const run = { left: 0, right: 0 };
      const N = 240;
      const dt = (strideNow() / speed) / N;
      gaitPhase = 0;
      for (let i = 0; i <= N; i++) {
        gaitPhase += (speed / strideNow()) * TAU * dt;
        animate();
        root.updateWorldMatrix(true, false);
        for (const side of ['left', 'right']) {
          const ank = root.worldToLocal(bones.get(side + ' ankle').getWorldPosition(_v));
          const kne = root.worldToLocal(bones.get(side + ' knee').getWorldPosition(_v2));
          worstAbove = Math.max(worstAbove, ank.y - kne.y);
          if (i > 0) {
            const v = (ank.z - prevZ[side]) / dt;
            run[side] = Math.abs(v - speed) <= 0.2 * speed ? run[side] + 1 : 0;
            bestRun[side] = Math.max(bestRun[side], run[side]);
          }
          prevZ[side] = ank.z;
        }
      }
      if (worstAbove >= 0) {
        report.push('at correction ' + corr + ' an ankle rose ' + (worstAbove * 1000).toFixed(0)
          + ' mm ABOVE its own knee, which no knee can do -- the flexion sign is inverted');
      }
      // The bad leg is deliberately down for less of the cycle, so the floor
      // here is the limp's share and not WALK_DUTY.
      const floor = 0.6 * WALK_DUTY * N;
      for (const side of ['left', 'right']) {
        if (bestRun[side] < floor) {
          report.push('at correction ' + corr + ' the ' + side + ' foot is only planted at '
            + 'body speed for ' + (100 * bestRun[side] / N).toFixed(0) + '% of a cycle '
            + '(want at least ' + (100 * floor / N).toFixed(0) + '%) -- it is skating');
        }
      }
    }
    if (report.length) console.error('OkabeCreature gait: ' + report.join('; ') + '.');
    correction = savedCorrection;
    speed = savedSpeed;
    gaitPhase = savedPhase;
    applyCorrection();
    animate();
  }

  /**
   * Metres the body covers per gait cycle, for the legs it currently has.
   *
   * update() advances the phase by speed/stride and animate() lays the foot
   * path out over stride, so these two MUST read the same number in the same
   * frame -- disagree and the feet move at a different speed from the body,
   * which is the whole failure this rewrite exists to remove.
   */
  function strideNow() {
    if (!legRig) return STRIDE;
    return (legRig.left.L1 + legRig.left.L2)
      * THREE.MathUtils.lerp(STRIDE_PER_LEG_MONSTER, STRIDE_PER_LEG_HUMAN, correction);
  }

  /** rest * swing * twist * lean, composed in a fixed order so it is stable. */
  function pose3(name, sw, tw, ln) {
    const k = canon(name);
    const b = bones && bones.get(k);
    const r = restQuat && restQuat.get(k);
    if (!b || !r) return;
    b.quaternion.copy(r);
    if (sw) b.quaternion.multiply(_q.setFromAxisAngle(swingAxis.get(k), sw));
    if (tw) b.quaternion.multiply(_q2.setFromAxisAngle(twistAxis.get(k), tw));
    if (ln) b.quaternion.multiply(_q2.setFromAxisAngle(leanAxis.get(k), ln));
  }

  function pose(name, axis, angle) {
    const k = canon(name);
    const b = bones && bones.get(k);
    const r = restQuat && restQuat.get(k);
    if (!b || !r || !angle) return;
    b.quaternion.copy(r).multiply(_q.setFromAxisAngle(axis, angle));
  }

  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  function animate() {
    if (!bones) return;
    // Smoothstep rather than a linear ramp: a gait that fades in linearly
    // spends its first half-second barely moving, which reads as a stutter.
    const walking = THREE.MathUtils.smoothstep(speed, 0.12, 0.95);
    const wrong = 1 - correction;

    // Reset every driven bone to rest, then add. Without this a frame that
    // skips a joint leaves last frame's pose on it forever.
    for (const [name, bone] of bones) {
      const r = restQuat.get(name);
      if (r) bone.quaternion.copy(r);
    }

    const gp = gaitWarp(gaitPhase);
    const at = (k) => gaitWarp(gaitPhase - (LAG[k] || 0));
    const armSwing = THREE.MathUtils.lerp(0.34, 0.42, correction) * walking;
    // The bad side under-steps; lerped away as correction rises, because the
    // man in the photograph walks like a person.
    const g = (v) => THREE.MathUtils.lerp(v, 1, correction);

    // ONE PARAMETER MAKES THE RUN. Below RUN_FROM the foot is down for 60% of
    // the cycle and at least one foot is always planted; above RUN_TO it is
    // down for 37% and there is a flight phase. Nothing else has to change,
    // and because the path plants the foot at the body's own speed whatever
    // the duty is, the run cannot slide any more than the walk can.
    const running = THREE.MathUtils.smoothstep(speed, RUN_FROM, RUN_TO);
    const duty = THREE.MathUtils.lerp(WALK_DUTY, RUN_DUTY, running);
    const lift = THREE.MathUtils.lerp(WALK_LIFT, RUN_LIFT, running)
      * THREE.MathUtils.lerp(1.25, 1.0, correction) * walking;

    // --- pelvis FIRST -------------------------------------------------------
    // Ordering is load-bearing now: the legs are solved against where the hip
    // ACTUALLY is this frame, and the pelvis is what moves it. Solve the legs
    // first and every bob and sway becomes a few centimetres of foot slide.
    // LATERAL TILT IS THE EXPENSIVE CHANNEL ON THIS BODY and it was set as if
    // it were not. A pelvis rolling 0.17 rad is a believable amount on a
    // normal figure, but the monster carries its head 0.84 m above the hip on
    // a neck stretched 1.85x, and that lever turns the roll into 0.84*sin(0.17)
    // = 142 mm of head sway each way. Measured at the head, the walk was
    // swinging through 224 mm side to side -- it read as a stagger rather than
    // a stalk. Cut to roughly a third; the gait keeps its weight from the
    // vertical bob and the pelvic twist, neither of which costs a silhouette.
    const drop = THREE.MathUtils.lerp(0.055, 0.045, correction) * walking * Math.sin(gp + 0.4);
    const prot = THREE.MathUtils.lerp(0.05, 0.10, correction) * walking * Math.sin(gp - 0.20);
    const hips = bones.get(canon('Hips'));
    if (hips) {
      hips.quaternion.copy(restQuat.get(canon('Hips')))
        .multiply(_q.setFromAxisAngle(Y, prot))
        .multiply(_q2.setFromAxisAngle(Z, drop));
      // Two peaks per stride and no cusp: abs(sin) has a corner at every
      // footfall which shows on a silhouette as a tick. Highest at mid-stance,
      // which is where a walking body really is highest.
      const bob = 0.024 * Math.cos(2 * gaitPhase) * walking
        - 0.016 * Math.max(0, -Math.sin(gp)) * wrong * walking;
      const breath = Math.sin(elapsed * 1.4) * 0.008 * (1 - walking);
      // Hip translation side to side, cut with `drop` above and for the same
      // reason -- it adds directly to the head sway rather than averaging out.
      const sway = THREE.MathUtils.lerp(0.010, 0.012, correction) * walking * Math.sin(gp + 0.25);
      // Scaled by `walking`, so a figure standing still stands up straight.
      const crouch = legRig
        ? THREE.MathUtils.lerp(CROUCH_MONSTER, CROUCH_HUMAN, correction)
          * (legRig.left.L1 + legRig.left.L2) * walking
        : 0;
      const rest = restPos.get(canon('Hips'));
      if (rest) {
        hips.position.set(rest.x + sway,
          rest.y + hipLift * wrong + bob + breath - crouch, rest.z);
      }
    }

    // --- legs: the FOOT is driven and the joints are solved ------------------
    if (legRig) {
      root.updateWorldMatrix(true, false);
      const phase = gaitPhase / TAU;
      const stride = strideNow();
      for (const side of ['left', 'right']) {
        const L = legRig[side];
        const bad = side === 'left';          // the monster favours one side
        const t = phase + (side === 'right' ? 0.5 : 0)
          + (bad ? BAD_LAG * wrong : 0);
        // A LIMP IS LESS TIME ON THE GROUND, NOT A SHORTER STRIDE AT THE SAME
        // CADENCE. Scaling only the step was the first thing I tried and it
        // reintroduced exactly the slide this rewrite removed: the bad foot
        // was planted for 60% of the cycle but only travelled 72% as far, so
        // it skated at 1.31 m/s under a body doing 2.35. Deriving the step
        // FROM the duty keeps planted speed equal to the body's on both legs,
        // whatever the limp is set to.
        const legDuty = duty * (bad ? g(BAD_STEP) : 1);
        const legLen = L.L1 + L.L2;
        const p = footPath(
          t, legDuty, legDuty * stride, lift * (bad ? g(BAD_LIFT) : 1),
          THREE.MathUtils.lerp(HEEL_RISE_MONSTER, HEEL_RISE_HUMAN, correction) * legLen,
          THREE.MathUtils.lerp(TOE_RISE_MONSTER, TOE_RISE_HUMAN, correction) * legLen
        );
        const hip = root.worldToLocal(bones.get(side + ' leg').getWorldPosition(_v));
        // walking scales the whole path toward the rest pose, so standing
        // still is the rest pose rather than a permanent crouch.
        const dz = p.z * walking - hip.z;
        const dy = (L.groundY + p.y * walking) - hip.y;
        const s = solveLeg(L.L1, L.L2, dz, dy);
        pose3(side + ' leg', s.swing - L.restSwing, 0, 0);
        pose3(side + ' knee', s.flex - L.restFlex, 0, 0);
        // Ankle: toes down as the foot leaves the ground, up as it reaches.
        // Follows the path rather than its own sine, so it cannot drift out of
        // phase with the foot it belongs to.
        const u = ((t % 1) + 1) % 1;
        const swingU = u < legDuty ? -1 : (u - legDuty) / (1 - legDuty);
        const toe = swingU < 0
          ? 0.22 * arch(u / legDuty, 0.55, 1.00)
          : -0.26 * arch(swingU, 0.10, 0.95);
        pose3(side + ' ankle', toe * walking * (bad ? g(0.45) : 1), 0, 0);
      }
    }
    // Counter-rotation, with ONE coupling deliberately broken: at correction 0
    // the lag is about pi, which flips the sign, so the monster's shoulders
    // rotate WITH its hips. Every human walks with the opposite arm forward;
    // a body that does not is wrong in a way people feel before they name it.
    const torsoLag = THREE.MathUtils.lerp(2.05, 0.0, correction);
    const srot = -THREE.MathUtils.lerp(0.09, 0.12, correction) * walking
      * Math.sin(at('chest') - 0.20 + torsoLag);
    // ON MEASURED AXES, and composed with the peek rather than overwritten.
    // pose3 writes rest * swing * twist * lean in one go, so the lean of a
    // body leaning out from a corner and the twist of its own walk cannot
    // clobber one another the way two separate pose() calls would.
    const pk = peekNow;
    const crane = -PEEK_CRANE * Math.abs(pk);      // negative swing = forward
    pose3('Spine', crane * 0.40, srot * 0.35, pk * PEEK_SPINE);
    pose3('Chest', crane, srot, pk * PEEK_CHEST);
    // The head hangs almost still while the body works underneath it.
    pose3('Neck', 0, -srot * THREE.MathUtils.lerp(1.15, 0.65, correction)
      + pk * PEEK_HEAD_TURN * 0.35, pk * PEEK_NECK);
    // AND THEN IT LOOKS AT YOU. The torso leaning out of cover is the motion
    // that catches the eye; the head coming round afterwards is what makes it
    // a thing that has seen you rather than a thing that is swaying. The turn
    // is on TWIST and the counter-tilt on LEAN, both measured, because this
    // neck is stretched 1.85x in the monster reading and a few degrees of
    // error at the base is a long way at the top of it.
    pose3('Head', -PEEK_HEAD_DIP * Math.abs(pk), pk * PEEK_HEAD_TURN, -pk * PEEK_HEAD_TILT);

    // --- arms ---------------------------------------------------------------
    // ARMS: swing on the MEASURED sagittal axis, and brought DOWN out of the
    // imported A-pose on the lean axis. Before this they rotated about raw
    // local X, which on these bones is 62.5 degrees off sagittal -- so most of
    // the "swing" went sideways and the figure flapped instead of walking.
    const sa = Math.sin(at('arm'));
    const armDown = THREE.MathUtils.lerp(ARM_DOWN_MONSTER, ARM_DOWN_HUMAN, correction);
    pose3('Left arm', -sa * armSwing * g(1.00), 0, -armDown * ARM_DOWN_SIGN);
    pose3('Right arm', sa * armSwing * g(0.55), 0, armDown * ARM_DOWN_SIGN);
    const elbow = THREE.MathUtils.lerp(0.30, 0.45, correction) * walking;
    const hang = THREE.MathUtils.lerp(0.10, 0.28, correction);
    const elb = Math.sin(at('elbow'));
    pose3('Left elbow', hang - elbow * elb * g(1.00), 0, 0);
    pose3('Right elbow', hang + elbow * elb * g(0.55), 0, 0);

    // --- the coat -----------------------------------------------------------
    // THIS RIG CAME WITH ITS COAT ALREADY BONED -- twenty-one bones in Back,
    // BackB and Side chains of three segments each. Motion survives fog long
    // after value contrast has gone, so a hem that swings is the long-range
    // read, and each segment trails the one above it so the panel ripples
    // rather than swinging as a board.
    const swingPh = Math.sin(gaitWarp(gaitPhase - 1.25)) * 0.10 * walking;
    for (const [name, bone] of bones) {
      if (!name.startsWith('white clothes')) continue;
      const seg = /(\d)/.exec(name);
      const depth = seg ? Number(seg[1]) : 1;
      const r = restQuat.get(name);
      if (r) {
        bone.quaternion.copy(r).multiply(
          _q.setFromAxisAngle(X, swingPh * (0.5 + 0.35 * depth))
        );
      }
    }

  }

  /**
   * Resolves once the GLB is attached, or once it has failed to.
   *
   * RESOLVES EITHER WAY, never rejects. The loading screen awaits this before
   * it lets the player into the maze, and a creature that failed to load must
   * not be able to hang the game behind a progress bar -- the level still runs
   * without it, exactly as the catch below has always allowed.
   */
  const url = clean ? okabeCleanModelUrl : okabeModelUrl;
  const ready = loadModel(url)
    .then(attach)
    .catch((err) => {
      console.warn(`OkabeCreature: ${clean ? 'okabe_clean' : 'okabe'}.glb `
        + 'failed to load.', err);
    });

  return {
    group,
    refs: {
      get root() { return root; },
      get hips() { return bones && bones.get(canon('Hips')); },
      get chest() { return bones && bones.get(canon('Chest')); },
      get head() { return bones && bones.get(canon('Head')); },
      get hands() {
        return {
          l: bones && bones.get(canon('Left wrist')),
          r: bones && bones.get(canon('Right wrist'))
        };
      },
      get feet() {
        return {
          l: bones && bones.get(canon('Left ankle')),
          r: bones && bones.get(canon('Right ankle'))
        };
      }
    },
    /**
     * Put every drawable on a layer, which setting it on the group does NOT do.
     *
     * WebGLRenderer tests `object.layers` per OBJECT as it walks the graph, and
     * for a Group the test gates nothing -- it recurses into the children
     * either way. So `okabe.group.layers.set(MAIN_ONLY)` reads like it hides
     * the figure from the minimap camera and in fact hides nothing at all; the
     * fourteen SkinnedMeshes keep whatever layer they loaded on. The bones get
     * it too, because a SkinnedMesh with its skeleton on another layer is the
     * kind of thing that renders correctly until something culls.
     */
    setLayer(n) {
      group.traverse((o) => o.layers.set(n));
    },
    setPosition(x, z) { root.position.set(x, 0, z); },
    get position() { return root.position; },
    setYaw(yaw) { root.rotation.y = yaw; },
    get yaw() { return root.rotation.y; },
    setSpeed(v) { speed = Math.max(0, v); },
    setCorrection(value) {
      correction = THREE.MathUtils.clamp(value, 0, 1);
      applyCorrection();
    },
    get correction() { return correction; },
    /**
     * Multiply every material's colour down, the way Creature.js does, so the
     * two figures read at the same brightness in the backrooms.
     */
    setSilhouette(on) {
      if (on === silhouette || !baseColors) return;
      silhouette = on;
      for (const [m, base] of baseColors) {
        if (on) m.color.copy(base).multiplyScalar(SILHOUETTE_DIM);
        else m.color.copy(base);
      }
    },
    get isSilhouette() { return silhouette; },
    /**
     * Lean out from behind a corner and look at the player.
     *
     * -1 leans to the creature's LEFT, +1 to its right, 0 stands up straight.
     * Measured rather than asserted: at +1 the head moves +217 mm in the
     * creature's own local X and the face turns 29 degrees after it, so a
     * caller that knows which side of the corner the player is on can pass
     * Math.sign of that and be right.
     *
     * Set it and leave it -- the lean is smoothed internally, slowly on the
     * way out and quickly on the way back, so callers can flip it on the frame
     * the player's sightline changes without the body snapping.
     */
    setPeek(v) { peekTarget = THREE.MathUtils.clamp(v, -1, 1); },
    get peek() { return peekNow; },
    /** Settles when the GLB is in, or has failed to be. Never rejects. */
    get ready() { return ready; },
    /**
     * Metres, and it MOVES WITH THE DIAL. The monster is 353 mm taller than
     * the man (2.202 against 1.849, measured by import_okabe.py), so anything
     * placing a light, a sightline or a camera off this has to be told which
     * reading it is looking at.
     *
     * THIS IS THE STANDING HEIGHT AND THE THING CROUCHES WHEN IT MOVES. The
     * stalking crouch that pays for the long stride takes CROUCH_MONSTER of a
     * leg length off the hips while walking, measured at the head as 1.949 m
     * standing against 1.808 m moving. Nothing reads this getter today, so
     * nothing is wrong yet; whoever hangs a sightline off it should either
     * accept 141 mm or ask the hips where they actually are.
     */
    get height() { return THREE.MathUtils.lerp(MONSTER_HEIGHT, height, correction); },
    get visible() { return visible; },
    set visible(v) { visible = v; group.visible = v; },
    update(dt) {
      elapsed += dt;
      // Driven by DISTANCE, not by time, so the feet keep up with the body.
      gaitPhase += (speed / strideNow()) * TAU * dt;
      // Exponential rather than linear, and framerate-independent: a linear
      // approach crosses the target and jitters on it at small dt.
      const tau = Math.abs(peekTarget) > Math.abs(peekNow) ? PEEK_OUT_TAU : PEEK_BACK_TAU;
      peekNow += (peekTarget - peekNow) * (1 - Math.exp(-dt / tau));
      animate();
    },
    reset() {
      gaitPhase = 0;
      elapsed = 0;
      speed = 0;
      peekTarget = 0;
      peekNow = 0;
      correction = 1;
      applyCorrection();
    },
    dispose() {
      for (const mesh of skin || []) {
        if (mesh.geometry) mesh.geometry.dispose();
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
          if (!m) continue;
          for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
            'aoMap', 'emissiveMap', 'alphaMap']) {
            if (m[slot]) m[slot].dispose();
          }
          m.dispose();
        }
      }
    }
  };
}
