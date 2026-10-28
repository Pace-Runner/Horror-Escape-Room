import * as THREE from 'three';
import { loadModel } from '../world/modelLoader.js';
import okabeModelUrl from '../assets/models/okabe.glb?url';
import okabeCleanModelUrl from '../assets/models/okabe_clean.glb?url';

/** Scratch for getEyePosition(), which runs every frame a lens follows the eyes. */
const _eyeOther = new THREE.Vector3();
const _crown = new THREE.Vector3();

/**
 * UNDER A LOW CEILING (setCeiling). The backrooms ceiling is 2.35 m and this
 * figure's crown reaches about 2.5 m standing even at the backrooms' 90% size,
 * so it stoops: a curl down the spine that grows while the crown is over the
 * line and relaxes once it is clear -- a body ducking under something, not
 * one shrunk to fit. Measured off the head bone every frame, after the gait.
 */
/** Head bone (base of the skull) to the crown, metres per unit of scale -- an estimate off the Hollow's 1.36x skull. */
const CROWN_ABOVE_HEAD_BONE = 0.29;
const CEILING_MARGIN = 0.06;
/** How fast the stoop grows per metre over the line, per second; and the most it bends. */
const CEILING_GAIN = 14;
const CEILING_CURL_MAX = 0.9;
const CEILING_RELAX = 1.2;
/** How the stoop is shared down the spine, and the head lifted back so it still looks ahead. */
const CEILING_SHARE = { Spine: 0.3, Chest: 0.4, Neck: 0.3, Head: -0.35 };

/**
 * The imported Okabe character -- the only monster in the game, and the
 * player's own body.
 *
 * It replaced Creature.js, a procedural capsule rig driving a generated GLB,
 * and kept that file's public contract on purpose: group, refs, setPosition,
 * setYaw, setSpeed, setCorrection, setSilhouette, update, reset, dispose and
 * the visible/height/position/yaw accessors. That is why CreatureAI, the visor
 * and every scripted beat in main.js took the swap without changing. Comments
 * below that cite "Creature.js" are recording where a number or a recipe came
 * from; that file is deleted and lives on in git history.
 *
 * This asset arrives from a Unity package with an MMD-derived skeleton --
 * 'Right elbow' is the forearm, the lab coat has twenty-one of its own bones,
 * and the rest pose is an A-pose rather than a T-pose.
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

/**
 * How far the backrooms hunting silhouette multiplies its colours down: not
 * at all, now. It was 0.18 from the old capsule figure, and any dimming over
 * the re-skinned monster left a flat shadow cut-out that read as a ghost
 * (user, 2026-10-23: "more solid, not ghostly"). Its own dark paint is the
 * darkness; lit, it is a body. setSilhouette() stays so callers need not change.
 */
const SILHOUETTE_DIM = 1;

/**
 * The monster's empty sockets catch light that is not there: a faint, cold
 * glint on the eye material, so in a blackout two points are all that show
 * where it is. The monster file only; the player's own eyes are left alone.
 * Colour and intensity only -- every MeshStandardMaterial already carries an
 * emissive term, so this costs no shader recompile.
 */
const EYE_GLINT_COLOUR = 0x9fb4d8;
const EYE_GLINT_INTENSITY = 0.18;
const EYE_TEXTURE = 'okarin04';
/**
 * The monster's specular, against the 1.6 every material exports with. At 1.6
 * a grazing light puts a pale sheen over the whole figure -- skin, coat and
 * all -- which washes the dark paint out to grey and is half of why it read
 * as ghostly. Matte, it reads as something with weight. A uniform, not a
 * define: no recompile.
 */
const MONSTER_SPECULAR = 0.55;

/**
 * Metres per full stride. Fallback only, for the frames before the legs are
 * measured -- the real stride is a multiple of leg length, see GAITS.
 *
 * Creature.js uses a flat 1.55 and this file copied it, which is wrong for a
 * figure whose legs change length with the dial: the same 1.55 is a long reach
 * for the man's 0.845 m leg and an easy one for the monster's 0.997 m.
 */
const STRIDE = 1.55;

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

/**
 * THE SHOE, measured off okabe.glb's ankle-weighted vertices at rest: a flat
 * sole 95.5 mm below the ankle joint, running from 54 mm behind it to 231 mm
 * in front. The monster reading does not change it -- STRETCH.ankle is 1.
 *
 * WHY THE GAIT NEEDS TO KNOW. The contact with the floor is the heel at
 * touchdown and the toe at push-off, never the ankle, and the ankle is what
 * the legs are solved to. This file used to keep the ANKLE still through
 * stance and fake the roll by hoisting it -- 130 mm at touchdown on the
 * monster -- which paid for the stride but left the shoe hovering where it
 * was meant to land, since a shoe rolled onto its heel lifts its ankle 14 mm
 * at most. The rocker below rolls the shoe about whichever edge is down
 * instead, so the contact is what stays planted, and the ankle rises and
 * travels exactly as far as a rigid shoe of this size really lets it.
 *
 * The toe pivots 11 mm short of the tip, which sinks the tip 9 mm at the
 * run's steepest push: this shoe has no toe joint, so it rocks on its front
 * edge, and a pivot at the ball would bury the toe cap 45 mm at a walk.
 */
const FOOT_SOLE = 0.0955;
const FOOT_HEEL = 0.054;
const FOOT_TOE = 0.22;

/** Phase warp: stretches stance, compresses swing. See Creature.js's GAIT_DUTY. */
const GAIT_DUTY = 0.35;
const gaitWarp = (u, duty = GAIT_DUTY) => u + duty * Math.sin(u);
const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
/** 0 below 0, 1 above 1, an S between -- no corner at either end. */
const smooth01 = (x) => { const c = THREE.MathUtils.clamp(x, 0, 1); return c * c * (3 - 2 * c); };

/**
 * GAIT PROFILES: every number a gait is tuned by, one table per body.
 *
 * WHY THERE ARE TWO. This factory drives the monster AND the player's own
 * third-person body, and until the table was split the player walked on the
 * monster's numbers. Its run blend sat at 1.55-2.30 m/s, so the player's
 * ordinary 2.0 m/s walk was 60% of the way into a run; its stride was fixed,
 * so the 3.5 m/s sprint was the walk cycled at five steps a second; and it had
 * no crouch at all. Those numbers were right for what they were chosen
 * against -- BackroomsHunter's 1.451 search and 2.353 chase -- and wrong for
 * a body that walks at 2.015, sprints at 3.53 and crouches at 0.91
 * (core/MoveSpeeds.js, PointerLockPlayer.js). Picked with the factory's
 * `gait` option.
 *
 * FIVE COLUMNS PER ENTRY, blended continuously and never switched:
 *
 *   idle        standing still
 *   walk, run   moving, mixed by the run blend (runFrom..runTo)
 *   crouch      crouch-walking
 *   crouchIdle  crouched and still
 *
 * `walking` (walkFrom..walkTo) fades each from its still column to its moving
 * one, and setCrouch() mixes the standing result with the crouched one -- see
 * blendColumns. P() is a POSTURE, which holds a value at rest; M() is a
 * MOTION, an amplitude that is nothing at rest; K() never changes.
 *
 * A VALUE MAY BE A [monster, man] PAIR, lerped by the correction dial. Only
 * the monster profile uses pairs: it is one body read two ways, and the man's
 * half of each pair is the walk he shipped with before this table existed
 * (plus the stance shift that replaced its ankle hoist). The player profile
 * is only worn at correction 1 and states single numbers.
 *
 * "x leg" is a multiple of hip-to-ankle length -- 0.845 m for the man and
 * 0.997 m for the monster, re-measured off the current okabe.glb -- so the
 * gait follows the dial when the legs stretch. Everything else is metres or
 * radians as stated.
 */
const P = (idle, walk, run, crouch = walk, crouchIdle = crouch) => ({ idle, walk, run, crouch, crouchIdle });
const M = (walk, run = walk, crouch = walk) => ({ idle: 0, walk, run, crouch, crouchIdle: 0 });
const K = (v) => P(v, v, v, v, v);

const GAITS = {
  /**
   * THE MONSTER, AND THE MAN IT IS A DISTORTION OF.
   *
   * The legs are made physically possible: the shoe rolls on the floor
   * instead of the ankle being hoisted (rockAnkle), so the stance moved back
   * (stanceShift) and the bob to mid-stance to pay for the reach the hoist
   * used to fake; the bad foot lands late instead of early, so the walk no
   * longer hops; and it stands on soft knees, so its breath stops lifting its
   * feet.
   *
   * AND THEN THE WALK WAS STOOD UP. It used to keep the stride every AI was
   * first tuned against -- 2.29 leg at 1.27 steps a second -- and that only
   * fits a leg bent 56-67 degrees through the WHOLE stance: side on it was a
   * Groucho creep, a cartoon tiptoe, not something heavy. The stride is
   * 1.90 now, 1.53 steps a second, and the crouch half what it was, so the
   * planted knee straightens to 26 degrees late in stance and only folds past
   * 50 in the beat after each heel strike, when the weight lands
   * (impact). Nothing reads the gait's cadence -- CreatureAI and the hunter
   * set speed, never stride -- so this is purely how it looks.
   *
   * EVERYTHING ABOVE THE HIPS IS A DEAD BY DAYLIGHT KILLER, after THE DOCTOR
   * -- another twisted scientist in a lab coat. A heavy, deliberate stalk:
   * the trunk hunched forward and rolling with the stride, the head jutting
   * out on the 1.85x neck and nodding a beat behind each heavy footfall, the
   * stretched arms hanging forward and swinging like dead weight, forearms and
   * hands trailing the shoulder. On top of that THE SPIRIT's wrongness: brief
   * involuntary twitches on their own clock (see twitchAt). The chase is a
   * lurching lope: much quicker strides, the trunk pitched hard forward
   * and folding at every landing, the arms reaching. See MONSTER LAYERS below
   * the GAITS table for how each layer is built.
   *
   * EVERY ONE OF THOSE NUMBERS IS A [monster, man] PAIR that calms to a
   * person at correction 1 -- an injured one: the man keeps 30% of the limp
   * (LIMP_MAN), because the figure the visor shows is hurt. The notes below
   * are the reasoning each number was found by; they are kept because each
   * records a failure that actually happened.
   *
   * MEASURED at correction 0: trunk is the hips-to-neck line forward of
   * vertical, head is the Head bone (the base of the skull) and how far it
   * sits in front of the hips, knee is a planted leg's bend.
   *
   *   standing      trunk 19-22 deg  head 1.75-1.80 m, 0.33 ahead  knee 30-39
   *   walk 1.451    trunk 27         head 1.62-1.70 m, 0.42 ahead  knee 26-56
   *   chase 2.353   trunk 35         head 1.48-1.67 m, 0.51 ahead  knee 52-64
   *
   * At correction 0.5 the walk's trunk is 14 degrees; at 1 it is upright.
   */
  monster: {
    /**
     * Where the gait fades in from standing, m/s. Below walkTo the stride
     * also shortens (see strideFade), so a slow walk is small steps rather
     * than full strides played slowly.
     */
    walkFrom: 0.12, walkTo: 0.95,
    /**
     * Where the run begins and ends, m/s. Chosen against the speeds the game
     * actually asks for: BackroomsHunter's search is 1.451 and its chase
     * 2.353, so these put searching at a pure walk and chasing at a pure run
     * with the whole blend in between and nothing sitting on a boundary where
     * it would flicker.
     */
    runFrom: 1.55, runTo: 2.30,
    /** setCrouch() is ignored: nothing has given this body a crouch yet. */
    crouches: false,
    /**
     * Elbows bend on the measured hinge, like the player's. They used to bend
     * on the sagittal axis, which was fine for the 0.1 rad they were given and
     * is wrong for the chase's reaching 0.7 -- see the player's note.
     */
    elbowHinge: true,
    /** Collarbones turn about the world's axes, not the hunched chest's; see poseCollar. */
    levelCollar: true,
    /**
     * The bad leg: LESS TIME ON THE GROUND, and a later, slightly higher swing.
     *
     * `step` scales that leg's stance fraction, and its step length follows
     * from it, so the foot still travels at the body's speed while it is down
     * -- see the note at the call site. The limp therefore reads as weight
     * being taken off one side early, which is what a limp is, rather than as
     * one leg quietly skating. Every one of these is lerped to nothing as
     * correction rises: the man in the photograph walks like a person.
     *
     * The limp used to be joint multipliers -- 1.55x on one knee's flexion --
     * and that is what put the left ankle 497 mm above its own knee.
     * Expressed on the foot PATH instead it stays anatomically possible
     * however far it is pushed, because the joints are solved to reach it.
     *
     * `impact` is how much harder the bad foot lands: the footfall's drop in
     * the hips and everything it sends up the spine (see footfall()).
     *
     * `lift` WAS 1.50, and on top of the old 163 mm swing that carried the bad
     * ankle 245 mm off the floor: from the side the foot came up behind the
     * other knee every stride, a high-stepping march rather than a limp. A
     * hurt leg is swung low and stiff, so it barely clears more than the good
     * one now.
     */
    limp: { step: 0.72, lift: 1.15, lag: 0.08, ankle: 0.45, arm: 0.55, impact: 1.7 },
    tune: {
      /**
       * Share of a cycle each foot spends ON THE GROUND -- the one number
       * that separates a walk from a run. Expressed as a stance FRACTION
       * rather than a phase-warp coefficient, which is what makes it safe to
       * change: footPath plants the foot for exactly this share and moves it
       * backward at exactly the body's speed while it is down, so the gait
       * cannot slide whatever this is. Below 50% both feet are off the ground
       * at once, which is the definition of a run. The monster's chase keeps
       * a little more ground than the man's run: a heavy lope, not a sprint.
       * The walk's 0.58 is the player's: with the stride, it sets how far a
       * planted leg must sweep, and 0.60 at the old stride was 1.37 leg.
       */
      duty: P(0.58, 0.58, [0.40, 0.37]),
      /**
       * Stride, x leg. The monster's is a little longer than the man's, so a
       * figure 350 mm taller still walks slower than he does: 1.53 steps/s
       * at the 1.451 m/s search against his 1.97, a heavy, deliberate stalk.
       * It was 2.29 -- 1.27 steps/s -- and that is what forced the crouch
       * the header describes; the reach table in the player's notes is why.
       * The CHASE is longer than the walk and much quicker, 2.3 steps/s at
       * 2.353 m/s: the lurching cadence of a lope.
       */
      stride: P([1.90, 1.74], [1.90, 1.74], [2.05, 1.74]),
      /**
       * Metres the ankle clears the floor at mid-swing. The walk swings low,
       * 110 mm, the way a heavy foot is carried just over the floor and put
       * down; at the old 163 the foot rose behind the body every stride,
       * which with the long legs read as stepping over something.
       */
      lift: M([0.11, 0.11], [0.3375, 0.27]),
      /**
       * x leg: how far the hips drop while moving. NOT DECORATION: without it
       * the leg is asked to reach further than it is long at every heel
       * strike and toe-off, the IK clamps, and the foot lifts off the floor
       * and skates. It, the stance shift and the toe roll are what pay for
       * the stride. The 0.015 standing is soft knees for the breath to rise
       * on: with none, every breath asked a dead-straight leg for 8 mm it did
       * not have, and the IK lifted the feet off the floor to find it.
       *
       * THE MONSTER'S WAS 160 mm WALKING AND CHASING, and it was the cost of
       * the old stride, not a choice: a planted knee bent 56-67 degrees
       * throughout, the creep the header describes. At 75 mm the hips VAULT
       * over the planted leg instead (bob, below), the knee straightens to
       * 26 degrees late in stance, and the drop after each heel strike
       * (impact) is what bends it -- the weight landing, which is what reads
       * as heavy. The chase lost the same 85 mm: 0.16 had it scuttling on
       * knees bent 75-80 degrees at mid-stance, now 52-64. The man's walk
       * came down from 0.075 to 0.055 with it, as shallow as his stride
       * allows. It STANDS bent, 0.05 leg: a predator's loaded knees under the
       * hunch, where a straight-legged stance read as a coat on a hanger.
       */
      hipDrop: P([0.050, 0.015], [0.075, 0.055], [0.075, 0.075]),
      /**
       * x leg, + = behind: where the stance sits under the hip. Shifted back
       * for the reason the player's note gives, and as far back as the
       * player's walk, which is what lets the shallower crouch reach the
       * front of the stride. The chase keeps the 0.10 it was tuned with:
       * under the old 160 mm crouch 0.14 folded its heel kick past
       * horizontal (the ankle 4 mm above the knee), and at 0.10 the top of
       * the kick now clears the knee by 189 mm.
       */
      stanceShift: P([0.14, 0.14], [0.14, 0.14], [0.10, 0.14]),
      /** Swing-path shape: >1 holds the foot back early (heel kick). See footPath. */
      swingLag: K(1),
      liftEarly: K(1.15),
      liftPow: K(1.3),
      /**
       * x leg outward per foot, and the idle's foot-forward stagger (+ puts
       * the left foot forward). The monster STANDS wide and staggered, the
       * bad foot ahead: feet together under a 2.2 m hunched body read as
       * timid, an old man waiting for a bus. Narrower walking, where the
       * hips sway over each foot instead.
       */
      stepWidth: P([0.05, 0], [0.025, 0], [0.02, 0]),
      stagger: P([0.10, 0], 0, 0),
      /**
       * The shoe's roll, relative to the FLOOR: radians toes UP at touchdown
       * and toes DOWN at toe-off, the share of stance by which the sole is
       * flat, and the share at which the heel starts to peel. The rise and
       * travel of the ankle follow from these and the shoe -- see rockAnkle.
       */
      reachToe: K(0.26),
      pushToe: K(0.80),
      flatBy: K(0.18),
      heelOff: K(0.50),
      /** Share of mid-swing the shoe hangs off the shin rather than the floor. */
      swingRelax: K(1),
      /**
       * Metres of hip bob, and where it peaks: at touchdown (0) or mid-stance
       * (1). The monster's peaked at touchdown, which put the hips at their
       * highest exactly when the front leg reaches furthest -- 24 mm of reach
       * it did not have, and one of the reasons its heel hovered. Mid-stance
       * is where a walking body really is highest, vaulting over the leg.
       * The chase bobs the right way up for a run (bobFlip): sinking
       * through each stance and rising in flight, the lope. The monster's
       * walk bobs as hard as its chase now, 68 mm peak to peak: with the
       * crouch halved, that vault is what still pays for the front of the
       * stride, and a big, slow rise and fall is most of what makes a
       * walker look heavy.
       */
      bob: M([0.034, 0.024], [0.034, 0.024]),
      bobMidStance: K(1),
      /** 1 inverts the bob for a run, lowest at mid-stance like a spring. */
      bobFlip: P(0, 0, [1, 0]),
      /** Metres the hips dip onto the bad leg; the man keeps a trace of it. */
      bobLimp: M([0.016, 0.005]),
      /**
       * Metres of breathing at the hips, radians at the chest, radians/s. The
       * monster's chest breath is `heave`, below; this is the man's level one.
       */
      breath: P(0.008, 0, 0),
      breathChest: K(0),
      breathRate: K([1.2, 1.4]),
      /**
       * Metres of hip sway, radians of pelvic roll and twist. LATERAL TILT IS
       * THE EXPENSIVE CHANNEL ON THIS BODY: the monster carries its head
       * 0.84 m above the hip on a neck stretched 1.85x, and that lever turned
       * a believable 0.17 rad roll into 224 mm of head sway -- a stagger, not
       * a stalk. Hence a third of that, and sway cut with it.
       */
      sway: M([0.010, 0.012]),
      /** The standing weight shift, metres -- the idle's slow sway at the hips. */
      idleSway: P([0.010, 0.006], 0, 0),
      drop: M([0.055, 0.045]),
      prot: M([0.05, 0.10]),
      /**
       * Radians of forward trunk lean, extra chest curl, and net head pitch.
       * BOTH, BECAUSE EITHER ALONE IS WRONG: lean is shared from the pelvis up
       * (LEAN_SPLIT) and alone reads as a man bowing; hunch rounds the upper
       * back alone and, at the first try's 0.30 with a 0.16 lean, measured a
       * trunk only 14 degrees off upright -- from the front it did not read
       * as hunched at all. The pelvis tipping costs the legs nothing: the
       * hip joints sit level with the pelvis's pivot, so it turns them in
       * place.
       *
       * MOST OF IT IS HUNCH, NOT LEAN, standing and walking. With 0.30 of
       * lean the standing monster folded at the hips over straight legs and
       * read side on as a man bowing; the curve belongs high in the back,
       * the Doctor's, with the pelvis nearer level. MEASURED, hips-to-neck,
       * in the table in this profile's header.
       *
       * headDown is the net pitch the head keeps: the monster's chin is
       * tucked, so it looks out from under its brow -- at the player's eye
       * height that is a stare, where a level face read as a man walking.
       */
      lean: P([0.16, 0.02], [0.28, 0.03], [0.50, 0.08]),
      hunch: P([0.60, 0.02], [0.60, 0.03], [0.46, 0.04]),
      headDown: P([0.10, 0], [0.12, 0], [0.06, 0]),
      /** Share of the pelvic roll the spine takes back out. */
      rollCounter: K(0),
      /**
       * Shoulder counter-rotation, radians, with ONE coupling deliberately
       * broken: at correction 0 the lag is about pi, which flips the sign, so
       * the monster's shoulders rotate WITH its hips. Every human walks with
       * the opposite arm forward; a body that does not is wrong in a way
       * people feel before they name it.
       */
      srot: M([0.09, 0.12], [0.12, 0.13]),
      torsoLag: K([2.05, 0]),
      /** How much of the shoulder twist the neck undoes: the head hangs still. */
      neckCounter: K([1.15, 0.65]),
      /** Radians the collarbones roll forward: shoulders rounded over the hunch. */
      shoulderRound: P([0.22, 0.02], [0.24, 0.02], [0.30, 0.04]),
      /** Gain on leaning into a turn; see setTurnRate. */
      turnLean: K(0),
      /**
       * Radians of arm swing, forward bias, and A-pose correction (see
       * ARM_DOWN_*). The hunch already carries the shoulders out over the
       * knees, so the arms hang ahead of the body with little bias. The
       * chase swings them wide, reaching forward on alternate strides; a
       * bigger bias held BOTH hands out at chest height, a cartoon zombie,
       * and even 0.16 levelled the leading arm at the shoulder every stride.
       *
       * armDown is 0.06 short of ARM_DOWN_MONSTER, so the arms hang a
       * little out from the coat: the standing fingertips 190 mm either side
       * of the midline rather than 170, a broader shape for a body this
       * thin, and 130 mm clear of the thighs walking where they brushed
       * within 70.
       */
      armSwing: M([0.30, 0.40], [0.56, 0.45]),
      armFwd: P([0.04, 0], [0.06, 0], [0.06, 0.05]),
      armDown: K([ARM_DOWN_MONSTER - 0.06, ARM_DOWN_HUMAN]),
      armInward: K(0),
      /**
       * Elbow FLEXION on the measured hinge, + = forearm forward, and the
       * swing on top of it -- most of the elbow's motion is the forearm
       * trailing (armLag). The monster's forearms angle forward, 26-29
       * degrees standing and walking, so the clawed hands are carried out in
       * front of the thighs, ready -- the Doctor's hands. At 0.25 the arms
       * hung straight and read as a mannequin's. Bent further to reach in
       * the chase.
       */
      elbowBase: P([0.50, 0.22], [0.45, 0.25], [0.95, 0.45]),
      elbowSwing: M([0.08, 0.28], [0.12, 0.35]),
      /**
       * Radians: hem swing, how far it streams back, how much it hangs plumb.
       * coatHang is 0.8 now that the trunk leans; at 0 the hunch held the
       * coat out behind the monster like a tail.
       */
      coatSwing: M(0.10),
      coatTrail: P(0, 0, [0.15, 0.06]),
      coatHang: K(0.8),
      coatDrape: K(0),
      // ----- the killer layers; see MONSTER LAYERS for what each one does -----
      /** Radians of chest heave per breath, ragged; the shoulders shrug with it. */
      heave: P([0.06, 0.012], [0.012, 0.003], [0.02, 0.004]),
      /** Radians of slow upper-body sway, standing. */
      bodySway: P([0.04, 0.012], 0, 0),
      /** Radians of the roll travelling up the spine each stride. */
      wave: M([0.07, 0.008], [0.09, 0.012]),
      /** Metres the hips drop at each heel strike, and radians the trunk folds. */
      impact: M([0.022, 0.006], [0.030, 0.008]),
      impactPitch: M([0.07, 0.01], [0.13, 0.02]),
      /** Radians: neck thrust forward (head counter-pitched), nod per step, cock. */
      neckJut: P([0.36, 0.02], [0.36, 0.02], [0.46, 0.04]),
      headBob: M([0.22, 0.02], [0.24, 0.03]),
      headTilt: K([0.12, 0]),
      /** Radians of head scanning: looking about standing and searching, never chasing. */
      scan: P([0.42, 0.14], [0.24, 0.06], 0),
      /** Radians the swinging arm arcs out, and the forearm trails the upper arm. */
      armOut: M([0.12, 0.01], [0.20, 0.03]),
      armLag: K([0.9, 0.35]),
      /** Radians the hand hangs curled toward the palm, and each finger joint. */
      wristCurl: P([0.22, 0.12], [0.22, 0.12], [0.16, 0.10]),
      fingerCurl: P([0.45, 0.22], [0.45, 0.22], [0.60, 0.28]),
      /**
       * Radians the collarbones hang low (- hunches them UP), and roll
       * forward with their arm. The monster's are drawn up toward its ears
       * over the rounded back -- the vulture's shoulders. Dropped, as they
       * were, they let the hunched chest slope away from the neck and the
       * figure read as weary rather than coiled.
       */
      shoulderDrop: K([-0.06, 0]),
      shoulderSwing: M([0.10, 0.02], [0.16, 0.04]),
      /** Gain on the twitches (twitchAt), and radians the hem kicks per footfall. */
      twitch: K([1, 0]),
      coatJolt: M([0.08, 0.015], [0.12, 0.02])
    }
  },

  /**
   * THE PLAYER'S OWN BODY, modelled on a Dead by Daylight survivor: an upright
   * walk, a hard forward-leaning run with pumping arms, and a deep hunched
   * crouch-walk. Worn at correction 1 only.
   *
   * THE REACH IS WHAT EVERY LEG NUMBER IS SOLVED AGAINST. This rig stands
   * with its knees locked -- the hip is 0.999 leg above the ankle -- so the
   * ankle can only be fore or aft of the hip if the hips come down or the
   * ankle comes up, and the only honest way up is the shoe rolling onto its
   * heel or toe (rockAnkle). At each end of stance the ankle is
   * (0.999 - hipDrop - rise +- bob) leg below the hip and
   * (duty*stride/2 -+ stanceShift - roll travel) leg in front of / behind it,
   * and that has to stay inside about 0.985 of the leg's reach or the knee
   * locks out (solveLeg clamps at 0.999 and the foot leaves the floor).
   * MEASURED on the real rig, worst planted reach and where in stance it
   * happens:
   *
   *   walk   0.989 (mid-stance)   knee 17 deg mid-stance, 75 at most in swing
   *   run    0.973 (toe-off)      knee 41 deg mid-stance, flight 28%
   *   crouch 0.77  (touchdown)    knee 112-133 deg, the deep squat
   *
   * 0.985 of reach is already 20 degrees of knee bend on this leg -- flexion
   * is that sensitive near straight -- which is why none of these sit at the
   * clamp and why even the walk's planted knee never straightens past 17.
   *
   * STANCE IS SHIFTED BACK, which is how a real walk fits a long stride: the
   * heel lands 0.24 m in front of the hip joint and the toe leaves 0.37 m
   * behind it, because the back end of stance is where the shoe is up on its
   * toe and the ankle has room. The runner lands closer still, 0.17 m in
   * front, under the body. Centring it, as the monster used to, needed 67 mm
   * of walking hip drop instead of 34 at the old 1.40 m stride, and doubled
   * the mid-stance knee bend to 42 degrees -- a bent-kneed shuffle.
   *
   * THE STRIDE BLENDS THROUGH STANCE LENGTH, not through stride: duty falls
   * and stride rises across the run blend, and their product -- what the leg
   * must actually reach -- peaks in the middle if each is lerped on its own.
   * See strideNow.
   */
  player: {
    /** Full walk by 0.8 m/s, so the 0.91 m/s crouch-walk is a whole gait. */
    walkFrom: 0.10, walkTo: 0.80,
    /**
     * The 2.015 walk is a pure walk and the 3.53 sprint a pure run, with
     * margin either side -- the body speed main.js feeds in is measured and
     * smoothed, so it wanders a little around both.
     */
    runFrom: 2.40, runTo: 3.30,
    crouches: true,
    /**
     * Elbows bend about a HINGE perpendicular to the upper arm, measured at
     * load. The sagittal axis the monster uses is fine for a 0.3 rad hang and
     * badly wrong for a 90 degree sprinting elbow: on this A-posed rig it has
     * a large component along the upper arm, so a big bend on it twists the
     * forearm out sideways.
     */
    elbowHinge: true,
    /** Collarbones on the chest's own axes, as this body was tuned with. */
    levelCollar: false,
    limp: { step: 1, lift: 1, lag: 0, ankle: 1, arm: 1, impact: 1 },
    tune: {
      // Gait. Cadence = 2 * speed / (stride * leg):
      //   walk   1.52 m stride  2.63 steps/s at 2.0 m/s, 58% stance
      //   run    2.50 m stride  2.80 steps/s at 3.5 m/s, 36% stance (flight)
      //   crouch 1.20 m stride  1.50 steps/s at 0.9 m/s, 60% stance
      // THE WALK WAS 1.40 m AT 2.86 STEPS A SECOND, which on a 1.85 m man is
      // a speed-walker's patter; a person that tall covers 2 m/s in about
      // 1.5-1.7 m strides. The longer one is paid for by the bigger bob below
      // rather than by more crouch, so the planted knee is no more bent.
      duty: P(0.58, 0.58, 0.36, 0.60),
      stride: P(1.80, 1.80, 2.96, 1.42),
      lift: M(0.09, 0.28, 0.07),
      // The crouch's 0.473 leg is 400 mm of hip drop at correction 1. The
      // 7 mm standing is unlocked knees, and it is what lets the breath lift
      // the hips without asking a straight leg to grow (see the idle sweep).
      hipDrop: P(0.008, 0.048, 0.075, 0.473),
      // Walk and run shifted back (see above); the crouch's stance sits
      // FORWARD, so the hips settle back over the heels the way a real squat
      // balances a hunched trunk -- they end up 0.37 m behind the shoulders,
      // and the shoe lands 0.44 m out in front and leaves from under them.
      // Centred, the back foot left the floor with that knee 170 mm off it,
      // a kneeling lunge at every step; here it stays above 250 mm.
      stanceShift: P(0.14, 0.14, 0.22, -0.20),
      // The run's swing holds the foot back and up early -- the heel kicks
      // toward the seat, folding the knee to 119 degrees -- then drives it
      // through under a knee lifted to 0.71 m. Measured to keep the shin
      // 32 mm short of horizontal at the top of the kick, so the sweep's
      // ankle-above-knee rule has margin rather than a coin toss.
      swingLag: P(1, 1, 1.35, 1),
      liftEarly: P(1.15, 1.15, 1.15, 1.1),
      liftPow: P(1.3, 1.3, 1.0, 1.3),
      stepWidth: P(0, 0, -0.02, 0.05, 0.06),
      stagger: P(0, 0, 0, 0, 0.08),
      // Heel-to-toe: the walk lands on its heel 17 degrees toes-up and
      // leaves 34 degrees toes-down; the run lands nearly flat, midfoot, and
      // drives off a steep toe; the crouch barely rolls at all.
      reachToe: P(0.30, 0.30, 0.12, 0.10),
      pushToe: P(0.60, 0.60, 0.90, 0.30),
      flatBy: P(0.18, 0.18, 0.20, 0.20),
      heelOff: P(0.45, 0.45, 0.50, 0.55),
      // The crouch keeps its shoes near level through swing: its shin pitches
      // so far that a shoe hanging off it drove the toe 26 mm into the floor.
      swingRelax: P(1, 1, 1, 0.15),
      // Pelvis. Bob is amplitude: 40 mm peak-to-peak walking, 46 running.
      // Highest at mid-stance walking, lowest there running. The walk's is
      // what pays for its stride: the hips vault 20 mm higher over the
      // planted leg and sit 20 mm lower in double support, where the legs
      // are spread furthest. 28 mm with more hip drop reached as far, but
      // walked on a knee bent 26 degrees at mid-stance instead of 17.
      bob: M(0.020, 0.023, 0.010),
      bobMidStance: K(1),
      bobFlip: P(0, 0, 1, 0),
      bobLimp: K(0),
      breath: P(0.004, 0, 0, 0, 0.008),
      breathChest: P(0.012, 0, 0, 0, 0.016),
      breathRate: P(1.6, 1.6, 1.6, 1.9),
      sway: M(0.015, 0.010, 0.030),
      idleSway: P(0.012, 0, 0, 0, 0.010),
      drop: M(0.05, 0.06, 0.03),
      prot: M(0.08, 0.12, 0.06),
      // Trunk, split across pelvis, spine and chest (LEAN_SPLIT) so it bends
      // rather than hinges. MEASURED as the hips-to-neck line, which is what
      // reads: 3.8 degrees forward walking, 19 running, 48 crouch-walking
      // (46 crouched still), against 1.3 BACK in the rig's own rest pose. The
      // radians are bigger than the degrees they buy because only the pelvis
      // tips the whole trunk -- the spine and chest bends act on shorter
      // levers -- and the upper back rounds to 67 degrees in the crouch.
      //
      // THE CROUCH LEANS THAT FAR SO THE ARMS CAN HANG. At the first try's 37
      // degrees the shoulders sat right over the knees, and a hanging arm
      // would have gone through a thigh -- so the hands were held out in
      // front at knee height, forearms level, palms up: a figure carrying an
      // invisible tray. Pitched to 48 the shoulders clear the knees and the
      // arms can drop, the low, folded sneak of a survivor in the grass.
      lean: P(0.04, 0.14, 0.48, 1.05, 1.0),
      hunch: P(0, 0, 0.03, 0.20),
      headDown: P(0, 0.03, 0.10, -0.02),
      rollCounter: K(0.7),
      // The run's shoulders twist harder than they did (0.15): the
      // third-person camera sits behind the body, and from there a sprint is
      // read off the shoulders turning and the elbows driving back past the
      // ribs -- the lean and the knees are edge-on to it.
      srot: M(0.10, 0.22, 0.05),
      torsoLag: K(0),
      neckCounter: P(0.6, 0.6, 0.7, 0.5),
      // Barely rounded crouched: on the chest's own axes (levelCollar false)
      // the 0.20 this used to be rolled both arms inward over the hunch and
      // brought the hands together in front of the groin -- the monster's
      // old problem, see poseCollar.
      shoulderRound: P(0, 0.02, 0.08, 0.06),
      turnLean: P(0, 0.3, 1, 0.2),
      // Arms, in WORLD terms: armFwd and armSwing are angles from plumb,
      // whatever the trunk is doing, so a hunched body still hangs its arms.
      // Measured at the upper arm:
      //
      //   walk    19 forward, 23 back; elbow 7-30 deg, a loose hang
      //   run     29 forward, 49 back; elbow 71-97 deg, the pump
      //   crouch  0-12 forward;        elbow 30-41 deg, hands hanging
      //
      // THE RUN SWINGS FURTHER BACK THAN FORWARD (armFwd < 0), the way a
      // runner drives the elbow back and lets the hand come through. Swung
      // evenly, 40 degrees each way at 83-97 of elbow, the front forearm
      // pointed 47 degrees UP and both hands spent the stride in front of the
      // chest, the back one never getting behind the hip. Now the fist rises
      // to 1.29 m, chest height, and the back elbow shows past the trunk from
      // behind -- which is where the third-person camera is.
      //
      // Crouched, the wrists hang 0.50-0.55 m off the floor, 0.08-0.19 m in
      // front of the leading knee and 0.20-0.27 m out from the midline: low
      // and loose, never touching a leg (168 mm from the nearest leg bone).
      //
      // armDown is the A-pose correction, so LESS of it is elbows further
      // out: the run's 0.50 carries them a little wide of the ribs, where the
      // camera behind can see them pump, and the fists still never cross the
      // midline (0.13-0.24 m out from it).
      armSwing: M(0.36, 0.66, 0.12),
      armFwd: P(0, -0.02, -0.20, 0.08, 0.10),
      armDown: P(0.62, 0.62, 0.50, 0.56),
      armInward: P(0, 0, 0.12, 0.08),
      // Elbow FLEXION on the measured hinge, + = forearm forward.
      elbowBase: P(0.20, 0.30, 1.45, 0.60, 0.65),
      elbowSwing: M(0.20, 0.22, 0.10),
      // HANDS, radians toward the palm (see the monster's notes and
      // FINGER_SEG): relaxed and a little curled standing and walking, loose
      // fists running, half-closed crouched. At zero these were the rig's
      // flat, spread modelling hands, and on a pumping arm they read as
      // jazz hands -- the single most wrong-looking thing in the run.
      wristCurl: P(0.10, 0.10, 0.05, 0.20, 0.20),
      fingerCurl: P(0.30, 0.35, 1.05, 0.55, 0.45),
      coatSwing: M(0.08, 0.14, 0.05),
      // The crouch's 0.22 lifts the side panels' hems off the floor, which
      // they went 12 mm through with the hips 400 mm down; and 0.85 of drape
      // (see coatDrape in animate) lays the top of the coat along the bent
      // back before it falls, so from the side it reads as a coat over a
      // crouched body rather than a sheet hung from the shoulders. Together
      // the hem clears the floor by 58 mm at worst, trailing behind the heels.
      coatTrail: P(0, 0.04, 0.30, 0.22),
      coatHang: K(0.8),
      coatDrape: P(0, 0, 0, 0.85),
      // The monster's killer layers, all off: a survivor does not twitch.
      heave: K(0),
      bodySway: K(0),
      wave: K(0),
      impact: K(0),
      impactPitch: K(0),
      neckJut: K(0),
      headBob: K(0),
      headTilt: K(0),
      scan: K(0),
      armOut: K(0),
      armLag: K(0),
      shoulderDrop: K(0),
      shoulderSwing: K(0),
      twitch: K(0),
      coatJolt: K(0)
    }
  }
};

/**
 * Both tables must name the same parameters. A key one of them forgot reads
 * as undefined, and undefined in this file's arithmetic is NaN on every bone
 * below it -- see applyCorrection for what that looked like the last time.
 */
const TUNE_KEYS = Object.keys(GAITS.monster.tune);
for (const [name, prof] of Object.entries(GAITS)) {
  const keys = Object.keys(prof.tune);
  const missing = TUNE_KEYS.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !TUNE_KEYS.includes(k));
  if (missing.length || extra.length) {
    console.error(`OkabeCreature: gait "${name}" is missing [${missing.join(', ')}] `
      + `and has unknown [${extra.join(', ')}].`);
  }
}

/** The entries that fade in with the stride rather than the gait; see resolveGait. */
const LEG_KEYS = new Set(['hipDrop', 'lift', 'bob']);

/** One column's number: a [monster, man] pair follows the dial. */
function colValue(v, corr) {
  return typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * corr;
}

/**
 * The five columns of one entry, for this moment.
 *
 * Bilinear in the three dials, which is what keeps every change of gait a
 * blend: running only ever mixes walk with run, crouching only ever mixes the
 * standing result with the crouched one, and `walking` fades each from its
 * still column. Nothing anywhere picks a column.
 */
function blendColumns(idle, walk, run, crouch, crouchIdle, w, r, c) {
  const stand = lerp(idle, lerp(walk, run, r), w);
  return c > 0 ? lerp(stand, lerp(crouchIdle, crouch, w), c) : stand;
}

function blendEntry(e, corr, w, r, c) {
  return blendColumns(colValue(e.idle, corr), colValue(e.walk, corr), colValue(e.run, corr),
    colValue(e.crouch, corr), colValue(e.crouchIdle, corr), w, r, c);
}

/** x leg: how far stance carries the foot, duty * stride, blended as one number. */
function blendStance(d, s, corr, w, r, c) {
  return blendColumns(
    colValue(d.idle, corr) * colValue(s.idle, corr),
    colValue(d.walk, corr) * colValue(s.walk, corr),
    colValue(d.run, corr) * colValue(s.run, corr),
    colValue(d.crouch, corr) * colValue(s.crouch, corr),
    colValue(d.crouchIdle, corr) * colValue(s.crouchIdle, corr), w, r, c);
}

/**
 * How the forward lean is shared between pelvis, spine and chest.
 *
 * Spread, for the same reason the peek is: a body that bends at one joint
 * reads as a hinge. Led from the hips because that is where a runner's lean
 * comes from -- the pelvis tips, and the legs are solved against it.
 */
const LEAN_SPLIT = { hips: 0.40, spine: 0.25, chest: 0.35 };

/** How the run's backward stream is shared down each three-bone coat chain. */
const COAT_TRAIL_SPLIT = [0.5, 0.3, 0.2];

/**
 * Seconds to settle into or out of a crouch, and to follow a change of turn.
 *
 * Short, because the caller is already easing both -- PointerLockPlayer
 * blends its own crouch over 0.12 s -- and two long smoothings in series
 * read as the body lagging the camera. Long enough that a raw 0/1 still
 * animates down and up rather than popping.
 */
const CROUCH_TAU = 0.10;
const TURN_TAU = 0.12;

/** Most it will lean into a turn, radians (8 degrees), and the turn rate it trusts. */
const TURN_LEAN_MAX = 0.14;
const TURN_RATE_MAX = 8;
/**
 * Metres the hips move toward the inside of a turn per radian of lean: 63 mm
 * at the cap. The feet stay on their lines (solveLeg tips the legs to hold
 * them), so the legs slant in under the body and the WHOLE figure banks --
 * the lean alone bent only the spine, and from behind a runner rounding a
 * corner read as a man tilting his head. Inside the reach, measured at
 * 2 rad/s: the run's worst planted leg goes from 0.973 to 0.978, the walk's
 * from 0.989 to 0.992. Swept at boot (GAIT_CHECKS).
 */
const TURN_HIP_SHIFT = 0.45;

/** Radians per second of the idle weight shift, deliberately off the breath. */
const IDLE_SHIFT_RATE = 0.55;

/**
 * Hip-to-ankle reach as a share of the leg's full reach, past which solveLeg
 * clamps and the foot hangs short of the floor. The gait tables stay inside
 * about 0.985 of it (see the player profile's reach table), so the knee never
 * locks; the boot sweep fails at the clamp itself.
 */
const IK_CLAMP = 0.999;

/**
 * What the boot sweep calls PLANTED: the heel or the toe within this many
 * metres of the floor while the foot is down. And how far any part of the
 * sole may dip below the floor before it counts as wading through it -- the
 * toe cap is allowed its 11 mm (see FOOT_TOE).
 */
const PLANT_HEIGHT = 0.005;
const SINK_LIMIT = 0.012;
/**
 * The boot sweep's per-sample slip allowance for a planted shoe, as a share of
 * body speed: "slipping at under a fifth of body speed". It was referenced
 * but never declared, and the
 * ReferenceError it threw inside attach() stopped the GLB from loading at all
 * -- every Okabe figure in the game, monster and player body alike.
 */
const PLANT_SLIP = 0.2;
/**
 * The speeds each profile is actually asked for, swept at boot.
 *
 * Monster: CreatureAI's patrol 0.85, block 2.35 and flee 4.0;
 * BackroomsHunter's search 1.451 and chase 2.353; at both readings, since the
 * visor turns the house creature into the man at any of them. Plus the
 * backrooms shadow, which walks at up to 2.015 at correction 0.35, and the
 * middle of the dial.
 * Player: walk, sprint and crouch-walk; the middle of the run blend, which is
 * where stride and duty disagree most (see strideNow); a slow walk, where the
 * stride is still shortening (strideFade); halfway into a crouch; and a hard
 * turn at a walk and a sprint, for the bank.
 */
/** And standing still, which a cycle at 0 m/s can never finish -- see the sweep. */
const IDLE_CHECKS = [
  { gait: 'monster', corr: 0, crouch: 0 },
  { gait: 'monster', corr: 1, crouch: 0 },
  { gait: 'player', corr: 1, crouch: 0 },
  { gait: 'player', corr: 1, crouch: 1 }
];

const GAIT_CHECKS = [
  ...[0, 1].flatMap((corr) => [0.85, 1.451, 2.353, 4.0].map((speed) =>
    ({ gait: 'monster', corr, speed, crouch: 0 }))),
  { gait: 'monster', corr: 0.35, speed: 2.015, crouch: 0 },
  // Half-way through the dial AND the run blend, where every [monster, man]
  // pair and every walk/run column is mid-lerp at once.
  { gait: 'monster', corr: 0.5, speed: 1.9, crouch: 0 },
  { gait: 'player', corr: 1, speed: 2.0, crouch: 0 },
  { gait: 'player', corr: 1, speed: 3.5, crouch: 0 },
  { gait: 'player', corr: 1, speed: 0.9, crouch: 1 },
  { gait: 'player', corr: 1, speed: 2.85, crouch: 0 },
  { gait: 'player', corr: 1, speed: 0.5, crouch: 0 },
  { gait: 'player', corr: 1, speed: 1.4, crouch: 0.5 },
  // Turning hard left at a walk and a sprint: the bank (TURN_HIP_SHIFT) moves
  // the hips sideways off the feet, which costs reach on one leg.
  { gait: 'player', corr: 1, speed: 2.0, crouch: 0, turn: 2 },
  { gait: 'player', corr: 1, speed: 3.5, crouch: 0, turn: 2 }
];

/** Model URLs whose rig the boot sweep has already walked; see attach(). */
const GAIT_SWEPT = new Set();

const SIDES = ['left', 'right'];

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
 * t = 0 is touchdown. z is metres BEHIND the hip, y is metres the ANKLE sits
 * above where it stands flat; `pitch` is the shoe's angle to the floor, + toes
 * down; `flat` is how much of the shin's own pitch the ankle cancels (1 holds
 * the shoe at `pitch` to the floor, 0 lets it hang off the shin); `planted`
 * is stance. Written into `out`, because this runs twice a frame per figure.
 *
 * WHAT IS LINEAR IN STANCE IS THE SHOE, NOT THE ANKLE. F, the floor point
 * under a flat-standing ankle, advances by exactly the body's speed; the
 * ankle is F plus however the shoe has rolled (rockAnkle), so the heel is
 * still at touchdown, the whole sole at mid-stance and the toe at push-off.
 * Any other curve for F is a shoe sliding on the floor.
 *
 * The rest shape the path without touching contact. `shift` slides the whole
 * stance back under the body. `strike` and `push` are the roll at each end,
 * `flatBy` and `heelOff` when the sole lands flat and when the heel peels.
 * `lag` holds the swing foot back before it comes through (a run's heel
 * kick); `liftEarly` and `liftPow` say where the swing peaks and how sharply.
 */
function footPath(t, duty, step, shift, lift, strike, push, flatBy, heelOff,
  lag, liftEarly, liftPow, out) {
  const u = ((t % 1) + 1) % 1;
  if (u < duty) {
    const uu = u / duty;
    const pitch = -strike * (1 - smooth01(uu / flatBy))
      + push * smooth01((uu - heelOff) / (1 - heelOff));
    rockAnkle(pitch);
    out.z = -step / 2 + shift + step * uu + rock.z;
    out.y = rock.y;
    out.pitch = pitch;
    out.flat = 1;
    out.planted = true;
    return out;
  }
  const s = (u - duty) / (1 - duty);
  // From wherever toe-off left the ankle to wherever heel strike wants it, so
  // the path is continuous all the way round the cycle.
  rockAnkle(push);
  const z0 = step / 2 + shift + rock.z;
  const y0 = rock.y;
  rockAnkle(-strike);
  const z1 = -step / 2 + shift + rock.z;
  const y1 = rock.y;
  const span = z1 - z0;
  // Cubic Hermite from back to front with h(0)=0, h(1)=1, h'(0)=0 and a
  // NEGATIVE end slope, so the foot reaches a little past the landing point
  // and is already travelling backward at body speed when it touches down.
  // Without that it lands dead and jumps to speed, which reads as a skid at
  // every step. The slope is in units of `span`, which the roll makes a
  // little shorter than the step.
  //
  // THE LAG WARPS TIME, s -> s^lag, and that multiplies the slope at
  // touchdown by `lag` -- so the end slope is divided by it here, or a
  // lagged swing would land moving backward faster than the body and skid.
  const w = lag === 1 ? s : s ** lag;
  const endSlope = span < -1e-4 ? (1 - duty) * step / (duty * lag * span) : 0;
  const h = (-2 * w ** 3 + 3 * w ** 2) + (w ** 3 - w ** 2) * endSlope;
  out.z = z0 + span * h;
  // The arch is clearance on top of the straight line between the two ends.
  // Skewed early, because a foot clears the ground just after toe-off and is
  // already reaching by mid-swing. max(0) because a fractional power of a
  // sine that rounds to -1e-17 is NaN.
  out.y = y0 + (y1 - y0) * smooth01(s)
    + lift * Math.max(0, Math.sin(Math.PI * Math.min(1, s * liftEarly))) ** liftPow;
  // The toe comes up off the push and the heel goes down to meet the floor;
  // in between the shoe is let go to hang off the shin, so a run's heel kick
  // trails a pointed foot rather than carrying a flat plate.
  out.pitch = push * (1 - smooth01(s / 0.4)) - strike * smooth01((s - 0.55) / 0.45);
  out.flat = 1 - Math.sin(Math.PI * s) ** 2;
  out.planted = false;
  return out;
}

/** rockAnkle's answer: metres the ankle sits behind F, and above flat. */
const rock = { z: 0, y: 0 };

/**
 * Where the ankle is when the shoe stands on one edge, pitched `theta` to the
 * floor (+ toes down, on the toe; - toes up, on the heel), relative to where
 * it is standing flat.
 *
 * A rigid shoe rotating about its own edge -- so it is the SHOE that sets how
 * far the ankle can rise: 12 mm on the heel at the walk's 17 degrees (14 mm
 * at most, so the old 130 mm heel lift was only possible with the heel in
 * the air), 108 mm on the toe at the walk's push and 136 at the run's. The
 * ankle also TRAVELS: 31 mm back rolling onto the heel and 92 to 158 mm
 * forward rolling over the toe, which is most of how a long stride is
 * reached at both ends without a deep crouch.
 */
function rockAnkle(theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (theta >= 0) {
    rock.z = -FOOT_TOE + FOOT_TOE * c - FOOT_SOLE * s;
    rock.y = FOOT_TOE * s + FOOT_SOLE * c - FOOT_SOLE;
  } else {
    rock.z = FOOT_HEEL - FOOT_HEEL * c - FOOT_SOLE * s;
    rock.y = -FOOT_HEEL * s + FOOT_SOLE * c - FOOT_SOLE;
  }
}

/** Wrap an angle into (-pi, pi]. */
function wrapPi(a) {
  return a - TAU * Math.round(a / TAU);
}

/**
 * Two-bone IK, EXACT in three dimensions on this rig's own measured knee: how
 * must the thigh turn and the knee bend to put the ankle at (dx, dy, dz) from
 * the hip, in root space? Written into `out`: `alpha` turns the thigh about
 * root X, `beta` then tips the leg about the forward axis, `flex` bends the
 * knee about its measured hinge (0 = the rest pose), and `reach` is how much
 * of the leg's full reach was asked for.
 *
 * WHY EXACT, AND WHY THIS WAS A SKATING BUG. The solve this replaced was a
 * planar triangle with the bones' 3D lengths -- but this leg is not planar:
 * the knee sits 11 mm outside the hip and the ankle 14 mm back inside it, and
 * the rest knee is already bent 5 degrees. The flat triangle therefore put
 * the ankle 3 to 12 mm away from where it was aimed (measured on the man's
 * leg), by an amount that changed with every pose, and a planted foot whose
 * error changes from frame to frame is a foot sliding. Solved on the real
 * geometry the ankle lands where it was sent: 0.0002 mm, measured.
 *
 * The knee: |k + R(a, f) s| = D, with k and s the thigh and shin as they sit
 * at rest and a the knee's measured hinge, is A cos f + B sin f + C = E by
 * Rodrigues, solved for f on the branch that bends the knee FORWARD. The
 * thigh: that leg is then turned about root X until its fore/aft matches,
 * with the foot below the hip, and tipped about the forward axis to match the
 * rest -- the two rotations that keep the knee pointing where the body faces.
 */
function solveLeg(L, dx, dy, dz, out) {
  let D = Math.hypot(dx, dy, dz);
  out.reach = D / L.maxReach;
  const Dmax = L.maxReach * IK_CLAMP;
  if (D > Dmax) {
    const k = Dmax / D;
    dx *= k; dy *= k; dz *= k;
    D = Dmax;
  }
  const E = (D * D - L.kk) / 2 - L.C;
  const f = L.phi0 + L.bend * Math.acos(THREE.MathUtils.clamp(E / L.Rm, -1, 1));
  const c = Math.cos(f);
  const sn = Math.sin(f);
  const oc = (1 - c) * L.sa;
  const vx = L.k.x + L.s.x * c + L.axs.x * sn + L.a.x * oc;
  const vy = L.k.y + L.s.y * c + L.axs.y * sn + L.a.y * oc;
  const vz = L.k.z + L.s.z * c + L.axs.z * sn + L.a.z * oc;
  // R(X, alpha) maps (vy, vz) to r(cos, sin)(alpha + g); we want its z to be
  // dz and its y to be negative -- the foot under the hip, not over it.
  const r = Math.max(1e-6, Math.hypot(vy, vz));
  const g = Math.atan2(vz, vy);
  out.alpha = wrapPi(Math.PI - Math.asin(THREE.MathUtils.clamp(dz / r, -1, 1)) - g);
  const vyTurned = -Math.sqrt(Math.max(0, r * r - dz * dz));
  out.beta = wrapPi(Math.atan2(dy, dx) - Math.atan2(vyTurned, vx));
  out.flex = f;
  return out;
}

/** Radians each joint trails the one before it, so the body is a chain. */
const LAG = { knee: 0.14, ankle: 0.30, spine: 0.16, chest: 0.26, neck: 0.44, arm: 0.30, elbow: 0.62 };

/**
 * MONSTER LAYERS: the killer's upper body, built on top of the legs.
 *
 * NONE OF THIS TOUCHES WHERE A FOOT IS. The legs are solved to the foot path
 * after the pelvis is placed, so the only layers the boot sweep has to see are
 * the two that move the hips -- the footfall drop and the idle weight shift --
 * and both are on clocks it already steps (the gait phase, and the idle
 * shift's two extremes). Everything else is free to be as strange as it likes.
 *
 * EVERY GAIN IS A TUNE KEY, ZERO IN THE PLAYER'S TABLE, so the survivor's body
 * computes the same quaternions it did before these existed: each layer is an
 * added term, and adding a zero is exact. Two exceptions, both hands: the
 * survivor borrows wristCurl and fingerCurl for its own relaxed hands and
 * running fists.
 *
 * THE FOOTFALL: each heel strike sends one pulse up the body, arriving later
 * at each link -- hips, then spine, chest, neck and head. It is what makes the
 * steps heavy, and the growing delay is what makes the head nod a beat behind
 * the foot rather than with it. Seconds, not phase: how long a body takes to
 * absorb a blow is a property of the body, not of how fast it is walking.
 * Measured on the walk at 1.451 m/s, correction 0: the hips bottom out 142 ms
 * after the strike -- the bob's low point and the drop arriving together --
 * and travel 92 mm peak to peak over the stride; the brow (the FrontHair
 * bone) bottoms out at 208 ms and travels 88 mm.
 */
const IMPACT_DELAY = { hips: 0.07, spine: 0.11, chest: 0.15, neck: 0.24, head: 0.32, coat: 0.18 };
/**
 * How much of the nod the neck first spends holding the head UP against the
 * hips' drop: the inertia of a heavy head on a long neck. Measured at
 * correction 0 walking, on the brow: 0 had it bottom out 37 ms after the
 * hips; at 0.6 it is 208 ms after the strike against the hips' 142, and 96 ms
 * behind them at the 0.85 m/s patrol.
 */
const HEAD_INERTIA = 0.6;

/**
 * Most of a cycle a pulse may take to peak. At the 4 m/s flee the cadence is
 * 2 cycles a second and the head's 0.32 s would be two-thirds of a cycle,
 * smearing one footfall into the next; capped, every step still lands on its
 * own. NOT LOWER: at 0.15 the chase's 0.87 s cycle capped the chest, neck and
 * head at the same 0.13 s, and the wave up the body collapsed into one jolt.
 */
const IMPACT_CAP = 0.22;

/**
 * Radians of phase each link of the spine wave trails the one below it. The
 * pelvis rolls; the spine and chest roll the OTHER way, onto the planted leg
 * -- the heavy, shouldering gait of something carrying weight -- and the neck
 * and head right themselves last. 0.55 rad a link puts the head over a
 * quarter-cycle behind the pelvis, which is what reads as undulation rather
 * than a rigid rock -- and the neck rolling back against the chest keeps the
 * long lever from turning it into a stagger (see `sway` in GAITS). Measured
 * at correction 0: the base of the skull sways 113 mm side to side walking
 * and 149 mm in the chase, over hips that move 20; the man's, 32.
 */
const WAVE_LAG = 0.55;

/**
 * How much of the arm's swing the forearm and hand carry: the elbow and wrist
 * follow the arm's own swing `armLag` and 2*armLag late, which is what a
 * limb that is only hanging does. The wrist takes half, because a hand whose
 * palm faces the thigh swings sideways at the wrist and has little range there.
 */
const WRIST_FOLLOW = 0.5;

/** How far the shoulders shrug per radian of chest heave. */
const HEAVE_SHRUG = 1.6;

/**
 * Curl shared down each finger, base to tip, and the thumb's (from Thumb0,
 * the metacarpal, which barely moves in a relaxed hand).
 */
const FINGER_SEG = [0.85, 1.0, 0.7];
const THUMB_SEG = [0.25, 0.45, 0.35];

/**
 * THE TWITCHES: brief, sharp, irregular, and on their own clock.
 *
 * DETERMINISTIC FROM `elapsed`, NOT RANDOM. At most one twitch per slot, at
 * a hashed moment inside it, lasting 0.08 to 0.20 s; neighbours are 1.5 to
 * 3.5 s apart, and three slots in ten are empty, so now and then it holds
 * still for 4 to 6 s. The skipping is what makes it irregular: with every
 * slot filled the first version twitched every 2.9 +- 0.1 s, a rhythm you
 * could count. And reset() puts elapsed back to 0, so a beat that shows
 * the figure always shows the same one. The first is at least 0.4 s in: a
 * reveal posed by reset() and never updated (the hallway strike) must not be
 * caught mid-spasm. Seeded per figure, so the house creature and the
 * backrooms one never twitch together; and time-based, so never in step with
 * the gait, which is the point -- a motion that keeps the body's rhythm reads
 * as part of the walk, one that breaks it reads as something wrong inside.
 *
 * Three kinds: the head snaps round and cocks; a shoulder hitches up and its
 * arm jerks; a hand clenches or splays. Radians at full strength.
 */
const TWITCH_SLOT = 2.5;
const TWITCH_FIRST = 0.4;
const TWITCH_SPREAD = 1.0;
const TWITCH_SKIP = 0.3;
const TWITCH_MIN = 0.08;
const TWITCH_MAX = 0.20;
const TW_HEAD_TURN = 0.50;
const TW_HEAD_TILT = 0.32;
const TW_SHRUG = 0.38;
const TW_ARM = 0.18;
const TW_FINGERS = 0.8;
const TW_WRIST = 0.45;
/**
 * And the forearm jerks with a hand twitch. Fingers and a wrist alone were
 * invisible past a few metres -- a 90 mm hand moving 0.8 rad -- so a third
 * of all twitches never read at all; the whole forearm flicking up is seen
 * across a room.
 */
const TW_ELBOW = 0.35;

/**
 * THE SCAN: the head turns to a new bearing, holds it, turns again -- the
 * way an animal looks about, rather than a sine's endless sweep. Seconds per
 * bearing, and the share of each spent turning. The first two bearings are
 * straight ahead, so a figure placed facing the player STARES for a whole
 * bearing before it looks anywhere else.
 */
const SCAN_SEG = 2.6;
const SCAN_MOVE = 0.35;

/** Figures made so far, which seeds each one's twitches and scan. */
let figureCount = 0;

/** A repeatable number in [0, 1) for slot n, channel k, figure `seed`. */
function hash01(n, k, seed) {
  const s = Math.sin(n * 12.9898 + k * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** x - floor(x): the phase within its cycle. */
function frac(x) {
  return x - Math.floor(x);
}

/**
 * One footfall's pulse, x cycles after the strike: 0 at the strike, 1 at `a`,
 * and gone (under 1e-4) by about 6a. Squared at the start, so it begins
 * smoothly -- a pulse with a corner at the strike reads as a tick, not a weight.
 */
function impactPulse(x, a) {
  const r = x / a;
  return r * r * Math.exp(2 - 2 * r);
}

/**
 * Both feet's pulses for one link of the body, `delay` seconds behind the
 * strike, with the bad foot's weighted by `bad`. `cyc` is cycles per second;
 * the floor on `a` keeps a standing figure (cyc 0) at 0 rather than NaN.
 */
function footfall(xL, xR, bad, delay, cyc) {
  const a = Math.min(IMPACT_CAP, Math.max(1e-3, delay * cyc));
  return impactPulse(xL, a) * bad + impactPulse(xR, a);
}

/**
 * The man keeps this much of the monster's limp at correction 1: he is the
 * same body, hurt. Enough to read as favouring the left leg -- the bad foot's
 * stance 92% of the good one's -- and not enough to read as the monster.
 */
const LIMP_MAN = 0.3;

/**
 * @param clean {boolean} load the UNBEFOULED body -- the man, not the monster.
 *
 * The two files are the same mesh, the same skeleton, the same Monster shape
 * key and the same UVs; only the textures differ. blender/import_okabe.py
 * writes the clean one before befoul() is allowed near the images, which is
 * the only way to have both: a glTF material carries ONE base colour texture,
 * so the blood cannot be on a dial the way the proportions are.
 *
 * @param restCorrection {number} what reset() puts the dial back to. 1, the
 * man, for the backrooms figure and the player's body. The house creature
 * passes 0: every beat that shows it calls reset() and expects the monster,
 * which is the contract the procedural Creature.js had before this replaced it.
 *
 * @param gait {'monster'|'player'} which table in GAITS drives the body. The
 * monster's is tuned at the speeds every AI and beat asks for (GAIT_CHECKS);
 * the player's is a survivor's walk, sprint and crouch for the third-person
 * body. Anything else
 * falls back to the monster, loudly.
 */
/**
 * @param personProportions  chair reveal only: retain adult segment lengths and
 *   a restrained 20% of the monster morph. Mirror/chase actors keep their own shape.
 * @param scale  the whole figure, uniformly. The monster wears 1.15 (main.js).
 *   Applied to `root`, so the IK and every boot check still run in the rig's
 *   own unscaled space; the only thing that has to know is the gait clock,
 *   because a bigger body covers scale x the ground per stride -- see
 *   worldStride().
 */
export function createOkabeCreature({ clean = false, restCorrection = 1, gait = 'monster', scale = 1, personProportions = false } = {}) {
  if (!GAITS[gait]) {
    console.error(`OkabeCreature: unknown gait "${gait}", using "monster".`);
    gait = 'monster';
  }
  const group = new THREE.Group();
  group.name = 'okabe';

  const root = new THREE.Group();
  root.scale.setScalar(scale);
  group.add(root);

  let skin = null;              // the SkinnedMeshes (one per material)
  let bones = null;             // name -> Bone
  let restPos = null;           // name -> original bone.position
  let restQuat = null;          // name -> original bone.quaternion
  let swingAxis = null;         // name -> sagittal axis, MEASURED; see measureAxes
  let twistAxis = null;
  let leanAxis = null;
  let flexAxis = null;          // elbow -> true hinge axis, MEASURED; see measureAxes
  let legRig = null;            // side -> the leg as measured for solveLeg; see measureLegs
  let morphMeshes = [];         // meshes carrying the Monster target
  let headMeshes = [];          // hair, face, eyes, mouth -- see setHeadVisible()
  let headVisible = true;
  let baseColors = null;        // material -> original colour, for silhouette

  let preservePersonProportions=personProportions;
  let correction = restCorrection;  // 1 = the man, 0 = the monster
  let speed = 0;
  let gaitPhase = 0;
  let reflectionSample=false;
  let elapsed = 0;
  let silhouette = false;
  /** 0..1 on the rig's own twitches: a jump scare drives the head itself. */
  let twitchGain = 1;
  /**
   * setGrip(): curl added to each hand's fingers on top of the gait's, per
   * side, radians at the finger's middle joint. A catch's hands clenching on
   * Mark; negative splays them, reaching.
   */
  const grip = { l: 0, r: 0 };
  /** setBackwards(): -1 runs the stride in reverse, a figure stepping backwards. */
  let stepSign = 1;
  /** setCeiling(): the height to stay under, or null; and how far it is stooping for it. */
  let ceilingY = null;
  let ceilingCurl = 0;
  let peekTarget = 0;           // -1 leans to its left, +1 to its right
  let peekNow = 0;              // what the body is actually doing, smoothed
  let visible = true;
  let height = 1.849;           // measured by import_okabe.py; updated on load
  let hipLift = 0;              // metres the hips rise at correction 0; see attach()
  let gaitName = gait;          // which GAITS table; the boot sweep borrows it
  let crouchTarget = 0;         // setCrouch(); 0 standing, 1 crouched
  let crouchNow = 0;            // what the body is doing, smoothed
  let turnTarget = 0;           // setTurnRate(), radians/s, + = turning left
  let turnNow = 0;
  let breathPhase = 0;          // accumulated, so the rate can blend without jumping
  let fingerAxis = null;        // finger bone -> curl axis, MEASURED; see measureAxes
  const seed = ++figureCount;   // this figure's twitches and scan; see TWITCH_SLOT
  /** twitchAt()'s answer for this frame: strength 0..1, kind, side, clench or splay. */
  const tw = { amt: 0, kind: 0, side: 1, clench: 1 };

  /**
   * The tuning for this frame, resolved once -- see resolveGait. One object,
   * rewritten in place, because animate() runs for three figures every frame.
   */
  const G = {};
  /** Per-leg facts from the last animate(), read by the boot sweep. */
  const diag = {
    left: { duty: 0, reach: 0, stance: false },
    right: { duty: 0, reach: 0, stance: false }
  };
  /** footPath's and solveLeg's answers, reused every frame. */
  const foot = { z: 0, y: 0, pitch: 0, flat: 1, planted: false };
  const ik = { alpha: 0, beta: 0, flex: 0, reach: 0 };

  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _qHipsInv = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();

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
    flexAxis = new Map();
    fingerAxis = new Map();
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
          if (!clean && m?.emissive && m.name?.includes(EYE_TEXTURE)) {
            m.emissive.setHex(EYE_GLINT_COLOUR);
            m.emissiveIntensity = EYE_GLINT_INTENSITY;
          }
          if (!clean && m?.specularColor) m.specularColor.setScalar(MONSTER_SPECULAR);
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

    // THE HEAD'S MESHES, for a first-person view of this body (setHeadVisible).
    // The model is one mesh per material, and the head's materials -- hair,
    // face, eyes, mouth -- are the only ones that start above the shoulders:
    // in the bind pose every other part reaches down below 1.1 m of a 1.85 m
    // figure, and these all begin above 80% of its height.
    let topY = -Infinity;
    for (const mesh of skin) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      topY = Math.max(topY, mesh.geometry.boundingBox.max.y);
    }
    headMeshes = skin.filter((mesh) => mesh.geometry.boundingBox.min.y > topY * 0.8);
    for (const mesh of headMeshes) mesh.visible = headVisible;

    measureAxes(scene);
    listBones();

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

    // Measured at unit scale: `height` is the rig's own, and the getter
    // applies the figure's scale once.
    root.scale.setScalar(1);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    height = box.max.y - box.min.y;
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    unbakeChainOffset();
    applyCorrection();
    // Once per FILE, not once per figure: the sweep runs every profile
    // whichever one this instance wears, so the second and third figures
    // built from the same GLB would only repeat it.
    if (!GAIT_SWEPT.has(url)) {
      GAIT_SWEPT.add(url);
      assertGaitIsPossible();
    }
  }

  /**
   * TAKE THE SKELETON'S SHARE BACK OUT OF THE MONSTER KEY, once, at load.
   *
   * THE KEY COUNTED THE BONES' MOVE TWICE. blender/import_okabe.py bakes each
   * vertex to `stretched in its segment + chain_offset(its bone)` -- the
   * monster's static silhouette, joints moved and all -- and applyCorrection
   * then moves every joint by that same chain offset, which skinning adds to
   * every vertex a second time. MEASURED at correction 0 before this existed:
   * the mesh's lowest point 156 mm under the floor (the shoes buried to the
   * ankle while the skeleton's feet stood exactly on it), the mesh knee 85 mm
   * off the bone knee, and every vertex a whole chain offset from the bone
   * that turns it. That last one is invisible at rest and wrecks anything
   * that ROTATES: curling a finger swung its flesh on a lever as long as the
   * forearm's growth, and the fingers came out as 200 mm sticks pointing at
   * the shoulder.
   *
   * THE FIX IS EXACT, NOT A FUDGE. At the rest pose the bones differ between
   * the readings only by translation, so bone j moves every vertex bound to it
   * by the same delta_j, and skinning at correction 0 adds sum(w_j delta_j) to
   * the key. Subtracting exactly that from the key leaves the rest pose at the
   * silhouette the script baked, and puts each vertex where its own bone
   * expects it, so it rotates about the right joint. Measured after: the mesh
   * stands on the floor (lowest point 0 mm) and is 2.20 m tall, which is
   * MONSTER_HEIGHT, the number import_okabe.py measured off its own key.
   *
   * The hips' lift is NOT subtracted: the key grows the legs downward from a
   * hip that stays put (its feet are 156 mm under the floor in Blender too),
   * and lifting the whole body by hipLift is how they reach the floor.
   *
   * Run before the first render, while the morph is still only an attribute
   * -- the renderer packs it into a texture on first draw and never re-reads
   * it -- and flagged on the geometry so it can never be applied twice.
   */
  function unbakeChainOffset() {
    if (!morphMeshes.length || !bones) return;
    const savedCorrection = correction;
    const savedLift = hipLift;
    // Unbake the authored monster key using its authored bone lengths, even
    // when this one actor will subsequently use restrained human proportions.
    const savedProportions=preservePersonProportions;preservePersonProportions=false;
    const m = new THREE.Matrix4();
    const sample = () => {
      root.updateMatrixWorld(true);
      const out = new Map();
      for (const { mesh } of morphMeshes) {
        mesh.updateMatrixWorld(true);     // refreshes an attached bindMatrixInverse
        const sk = mesh.skeleton;
        if (!sk) continue;
        const t = new Float64Array(sk.bones.length * 3);
        for (let j = 0; j < sk.bones.length; j++) {
          // Bone j's skinning matrix, in the geometry's own space.
          m.multiplyMatrices(mesh.bindMatrixInverse, sk.bones[j].matrixWorld)
            .multiply(sk.boneInverses[j]).multiply(mesh.bindMatrix);
          t[3 * j] = m.elements[12];
          t[3 * j + 1] = m.elements[13];
          t[3 * j + 2] = m.elements[14];
        }
        out.set(mesh, t);
      }
      return out;
    };
    correction = 1;
    applyCorrection();
    const human = sample();
    hipLift = 0;
    correction = 0;
    applyCorrection();
    const monster = sample();
    hipLift = savedLift;
    correction = savedCorrection;preservePersonProportions=savedProportions;
    // ONLY IF THE KEY REALLY CARRIES IT. The right fix is in the import
    // script, and once that lands this must not subtract the offset from a
    // key that no longer has it. The tell is the shoe: STRETCH.ankle is 1,
    // so a vertex bound to an ankle has no stretch of its own in the key and
    // moves exactly as far as the ankle's chain offset if that was baked in
    // (share 1), and not at all if it was not (share 0).
    let along = 0;
    let norm = 0;
    for (const { mesh, idx } of morphMeshes) {
      const geo = mesh.geometry;
      const key = geo.morphAttributes.position && geo.morphAttributes.position[idx];
      const si = geo.attributes.skinIndex;
      const sw = geo.attributes.skinWeight;
      const a = human.get(mesh);
      const b = monster.get(mesh);
      if (!key || !si || !sw || !a || !b) continue;
      const ankles = mesh.skeleton.bones.flatMap((bone, j) => (kindOf(bone.name) === 'ankle' ? [j] : []));
      for (let v = 0; v < key.count; v++) {
        let top = 0;
        for (let k = 1; k < 4; k++) if (sw.getComponent(v, k) > sw.getComponent(v, top)) top = k;
        if (sw.getComponent(v, top) < 0.95 || !ankles.includes(si.getComponent(v, top))) continue;
        const j = 3 * si.getComponent(v, top);
        const dx = b[j] - a[j];
        const dy = b[j + 1] - a[j + 1];
        const dz = b[j + 2] - a[j + 2];
        along += key.getX(v) * dx + key.getY(v) * dy + key.getZ(v) * dz;
        norm += dx * dx + dy * dy + dz * dz;
      }
    }
    if (norm > 0 && along / norm < 0.5) return;
    let fixed = 0;
    for (const { mesh, idx } of morphMeshes) {
      const geo = mesh.geometry;
      const key = geo.morphAttributes.position && geo.morphAttributes.position[idx];
      const si = geo.attributes.skinIndex;
      const sw = geo.attributes.skinWeight;
      const a = human.get(mesh);
      const b = monster.get(mesh);
      if (geo.userData.okabeChainUnbaked || !key || !si || !sw || !a || !b) continue;
      if (!geo.morphTargetsRelative) {
        console.error('OkabeCreature: the Monster morph is not relative; '
          + 'cannot take the chain offset out of it.');
        continue;
      }
      for (let v = 0; v < key.count; v++) {
        let dx = 0;
        let dy = 0;
        let dz = 0;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(v, k);
          if (!w) continue;
          const j = 3 * si.getComponent(v, k);
          dx += w * (b[j] - a[j]);
          dy += w * (b[j + 1] - a[j + 1]);
          dz += w * (b[j + 2] - a[j + 2]);
        }
        key.setXYZ(v, key.getX(v) - dx, key.getY(v) - dy, key.getZ(v) - dz);
      }
      key.needsUpdate = true;
      geo.userData.okabeChainUnbaked = true;
      fixed++;
    }
    if (fixed && fixed !== morphMeshes.length) {
      console.error(`OkabeCreature: took the chain offset out of ${fixed} of `
        + `${morphMeshes.length} morph meshes -- the rest will float off their bones.`);
    }
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
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = wrong * (preservePersonProportions ? .2 : 1);
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
      const stretch = preservePersonProportions ? 1 : STRETCH[k] ?? 1;
      const s = 1 + (stretch - 1) * wrong;
      bone.position.copy(rest).multiplyScalar(s);
      // The hips carry the lift, not a scale -- they have no parent bone to
      // lengthen, and the legs below them grew downward.
      if (name === canon('Hips')) bone.position.y = rest.y + hipLift * wrong * (preservePersonProportions ? 0 : 1);
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
    // AND RELATIVE TO ROOT, NOT TO THE WORLD -- which is the bug behind the
    // boot assertion's "foot is only planted at body speed for 2-6% of a
    // cycle -- it is skating", logged at both corrections on every boot. That
    // message was TRUE. This used to read each bone's WORLD quaternion, which
    // includes whatever yaw root (and anything above it) had at the moment the
    // GLB finished loading. The monsters load at yaw 0 and were fine; the
    // player's body is set to the player's yaw every frame from boot, so it
    // loaded facing the spawn direction and every "sagittal" axis came out
    // rotated by it. At a yaw near pi the legs swung backwards -- the knees
    // bent the wrong way round and the planted foot ran forward at body speed
    // -- and at pi/2 they swung sideways. REPRODUCED, not inferred: the old
    // file, loaded with root at yaw pi, logs exactly 6/2/2/2% planted; at
    // pi/2, 0%; at yaw 0 it passes. Levels spawn the player at yaw pi (the
    // basement hallway does), so any load that finished after a spawn hit it.
    // Undoing root's world rotation makes the axes a property of the rig alone.
    root.updateWorldMatrix(true, false);
    scene.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const wq = new THREE.Quaternion();
    for (const [key, b] of bones) {
      b.getWorldQuaternion(wq).premultiply(rootInv);
      const inv = wq.clone().invert();
      swingAxis.set(key, new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize());
      twistAxis.set(key, new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize());
      leanAxis.set(key, new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize());
    }
    // THE ELBOW'S REAL HINGE: perpendicular to the upper arm and to the
    // direction the body faces (+Z in this frame), so a bend on it brings the
    // forearm straight forward whatever the arm is doing. Measured in the
    // A-pose and stored in the elbow's own frame, so it travels with the upper
    // arm when that is brought down and swung -- which is what a hinge does.
    // d x forward, in that order, is the sign that makes + flex FORWARD.
    for (const side of SIDES) {
      const arm = bones.get(side + ' arm');
      const elbow = bones.get(side + ' elbow');
      if (!arm || !elbow) continue;
      const d = root.worldToLocal(elbow.getWorldPosition(new THREE.Vector3()))
        .sub(root.worldToLocal(arm.getWorldPosition(new THREE.Vector3())));
      const hinge = d.normalize().cross(new THREE.Vector3(0, 0, 1));
      if (hinge.lengthSq() < 1e-8) continue;
      elbow.getWorldQuaternion(wq).premultiply(rootInv).invert();
      flexAxis.set(side + ' elbow', hinge.normalize().applyQuaternion(wq));
    }
    // THE FINGERS' CURL AXES, from the hand's own geometry: a finger curls
    // about the line of the knuckles. `across` runs index knuckle to little
    // knuckle and `along` down the middle finger; the palm faces across x along
    // on the left hand and along x across on the right -- a right hand held up
    // palm-out has its thumb, and so its index finger, on the outside. Each
    // digit then curls about (its own direction) x palm, the axis that turns
    // it toward the palm with a + angle, which takes the thumb in too. Stored
    // in each bone's own frame like every other axis here. MEASURED, not
    // trusted: + 0.5 rad moves the middle fingertip toward the body's midline
    // on both hands (the palms face the thighs), and the check below says so
    // if it ever does not.
    for (const side of SIDES) {
      const s = side === 'left' ? ' l' : ' r';
      const at = (n) => {
        const b = bones.get(n + s);
        return b ? root.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null;
      };
      const idx = at('indexfinger1');
      const lit = at('littlefinger1');
      const mid1 = at('middlefinger1');
      const mid3 = at('middlefinger3');
      if (!idx || !lit || !mid1 || !mid3) continue;
      const along = mid3.sub(mid1).normalize();
      const across = lit.sub(idx);
      const palm = side === 'left' ? across.cross(along) : along.clone().cross(across);
      if (palm.lengthSq() < 1e-10) continue;
      palm.normalize();
      for (const digit of ['thumb', 'indexfinger', 'middlefinger', 'ringfinger', 'littlefinger']) {
        const first = digit === 'thumb' ? 0 : 1;
        const a = at(digit + first);
        const b = at(digit + (first + 2));
        if (!a || !b) continue;
        const curl = b.sub(a).normalize().cross(palm);
        if (curl.lengthSq() < 1e-10) continue;
        curl.normalize();
        for (let i = 0; i < 3; i++) {
          const key = digit + (first + i) + s;
          const bone = bones.get(key);
          if (!bone) continue;
          bone.getWorldQuaternion(wq).premultiply(rootInv).invert();
          fingerAxis.set(key, curl.clone().applyQuaternion(wq));
        }
      }
      // The check: curl the middle finger and see which way its tip went.
      const m1 = bones.get('middlefinger1' + s);
      const m2 = bones.get('middlefinger2' + s);
      const m3 = bones.get('middlefinger3' + s);
      if (!m1 || !m2 || !m3 || !fingerAxis.has('middlefinger1' + s)) continue;
      const inward = () => Math.abs(root.worldToLocal(m3.getWorldPosition(new THREE.Vector3())).x);
      const before = inward();
      const q1 = m1.quaternion.clone();
      const q2 = m2.quaternion.clone();
      m1.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(fingerAxis.get('middlefinger1' + s), 0.5));
      m2.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(fingerAxis.get('middlefinger2' + s), 0.5));
      const after = inward();
      m1.quaternion.copy(q1);
      m2.quaternion.copy(q2);
      m1.updateMatrixWorld(true);
      if (!(after < before)) {
        console.error(`OkabeCreature: the ${side} fingers curl away from the palm -- `
          + 'the curl axis sign is wrong, and the monster will splay its hands.');
        fingerAxis.clear();
      }
    }
    scene.rotation.y = saved;
    scene.updateMatrixWorld(true);
  }

  /**
   * The leg as it actually is: thigh and shin as VECTORS, the knee's hinge,
   * and everything solveLeg needs to bend it exactly.
   *
   * Re-measured whenever the dial moves, because STRETCH rewrites both bone
   * offsets: the monster's leg is 0.998 m against the man's 0.845, and solving
   * against the wrong length puts the foot through the floor or leaves it
   * hanging. Measuring beats reading STRETCH here -- the table says what the
   * bones were multiplied BY, this says what they now ARE.
   */
  function measureLegs() {
    legRig = null;
    if (!bones || !restQuat || !swingAxis) return;
    const out = {};
    // THE PELVIS GOES BACK TO REST TOO. This is called from setCorrection at
    // any moment, with the hips still pitched, twisted and rolled by the last
    // animate(), and the leg's rest angles below would quietly absorb that
    // frame's pelvis into every frame after it. animate() rewrites the hips
    // before anything draws, so this costs nothing to see.
    const hipsBone = bones.get(canon('Hips'));
    const hipsRest = restQuat.get(canon('Hips'));
    if (hipsBone && hipsRest) hipsBone.quaternion.copy(hipsRest);
    root.updateWorldMatrix(true, false);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const back = new THREE.Vector3(-1, 0, 0);   // + about this swings a limb BACK
    for (const side of SIDES) {
      const names = [side + ' leg', side + ' knee', side + ' ankle'];
      const parts = names.map((n) => bones.get(n));
      if (parts.some((b) => !b)) return;
      const [thigh, shin, foot] = parts;
      // Measure off the REST pose, not whatever animate() left behind.
      for (let i = 0; i < 3; i++) {
        const r = restQuat.get(names[i]);
        if (r) parts[i].quaternion.copy(r);
      }
      const hip = root.worldToLocal(thigh.getWorldPosition(new THREE.Vector3()));
      const kneeP = root.worldToLocal(shin.getWorldPosition(new THREE.Vector3()));
      const ank = root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      const k = kneeP.clone().sub(hip);
      const s = ank.clone().sub(kneeP);
      // The hinges, in root space. Every leg bone's measured swing axis comes
      // out as root -X on this rig (the model faces -Z here), which is what
      // lets the thigh be turned about root X and the shoe's pitch be summed
      // down the chain; the dot products keep the signs honest if it ever
      // does not.
      const rootQ = (b) => b.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
      const a = swingAxis.get(names[1]).clone().applyQuaternion(rootQ(shin)).normalize();
      const ankleAxis = swingAxis.get(names[2]).clone().applyQuaternion(rootQ(foot)).normalize();
      const kneeDot = a.dot(back);
      const ankleDot = ankleAxis.dot(back);
      if (Math.abs(kneeDot) < 0.98 || Math.abs(ankleDot) < 0.98) {
        console.error(`OkabeCreature: the ${side} knee or ankle does not hinge in the `
          + 'sagittal plane -- the shoe will not stay flat on the floor.');
      }
      // |k + R(a, f) s|^2 = kk + 2 (A cos f + B sin f + C), by Rodrigues.
      const axs = a.clone().cross(s);
      const sa = s.dot(a);
      const ka = k.dot(a);
      const A = k.dot(s) - ka * sa;
      const B = k.dot(axs);
      const C = ka * sa;
      const kk = k.lengthSq() + s.lengthSq();
      const Rm = Math.max(1e-9, Math.hypot(A, B));
      const phi0 = Math.atan2(B, A);    // the knee's straightest, longest angle
      // Which way from straight is a knee BENDING: the way that swings the
      // shin back. The rest pose is 5 degrees bent, so this is also the branch
      // that gives f = 0 at rest.
      const bend = Math.sign(kneeDot) || 1;
      // The thigh's rest orientation IN ROOT SPACE, so animate() can set the
      // thigh absolutely rather than on top of whatever the pelvis is doing --
      // see the leg loop.
      const restRootQ = rootQ(thigh);
      // The two edges of the sole, in the ANKLE'S own frame, so the boot sweep
      // can ask where the shoe really is after the whole chain has posed it.
      const toAnkle = (dz) => foot.worldToLocal(root.localToWorld(
        new THREE.Vector3(ank.x, ank.y - FOOT_SOLE, ank.z + dz)));
      out[side] = {
        len: k.length() + s.length(),
        maxReach: Math.sqrt(kk + 2 * (Rm + C)),
        k, s, a, axs, sa, C, kk, Rm, phi0, bend, kneeDot, ankleDot, restRootQ,
        // Where the ankle sits when the figure simply stands. The foot path's
        // y = 0 means HERE, not the world origin -- the ankle joint is 95 mm
        // up inside the foot and aiming it at the floor buries the shoe.
        groundY: ank.y,
        // Where the foot stands across the body and along it at rest.
        footX: ank.x,
        footZ: ank.z,
        // Where the sole is when it stands flat: the floor, to half a mm.
        floorY: ank.y - FOOT_SOLE,
        heel: toAnkle(FOOT_HEEL),
        toe: toAnkle(-FOOT_TOE)
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
   *   1. The ankle is never at or above its own knee. The inverted knee sign
   *      put it 497 mm above at correction 0 and this is what it fails on. A
   *      heel kick folding the shin past horizontal trips it too, which is
   *      why the run is tuned to stay 32 mm short of that.
   *   2. While a foot is down it does not move across the floor. Anything
   *      else is the figure skating, which is what driving joints with
   *      sinusoids did -- fore/aft foot speed swung between -2.1 and +3.8 m/s
   *      under a body doing a steady 1.45.
   *   3. The knee is never behind the line from hip to ankle. That is a leg
   *      bending backwards, which a mirrored swing axis produces without ever
   *      lifting the ankle above the knee -- so rule 1 cannot see it.
   *   4. A planted leg is never asked to reach past solveLeg's clamp. Past
   *      it the foot hangs short of its target, off the floor; rule 2 usually
   *      catches the slide that follows, and this says why.
   *   5. No part of the sole goes more than SINK_LIMIT into the floor, in
   *      stance or swing -- the toe scuffing through it on the way forward.
   *
   * RULE 2 WATCHES THE SHOE, NOT THE ANKLE. It used to time the ankle, and
   * that was measuring the wrong thing twice over: an ankle held still while
   * the shoe rolls about it means the toe sliding, and a shoe that really
   * rolls about its heel and toe moves its ankle by design. So it reads the
   * heel and the toe off the posed ankle bone, and a sample counts as planted
   * when one of them is on the floor (PLANT_HEIGHT) and slipping across it at
   * under PLANT_SLIP of body speed, sideways included.
   *
   * EVERY PROFILE AT EVERY SPEED IT IS ASKED FOR (GAIT_CHECKS), whichever this
   * instance wears: the rig is the same, and a table nobody happens to be
   * wearing yet is still one bad edit from shipping. 60 samples per cycle,
   * two cycles per check, eighteen checks, then four standing ones -- about
   * 2,200 frames of animation, measured at 0.08-0.16 s, once per GLB at load
   * (see attach).
   *
   * THE PLANTED FLOOR IS 85% OF THAT LEG'S OWN STANCE. The old floor was a
   * flat 36% of the cycle, which a run (37% stance) or the monster's bad leg
   * could not have met even planted perfectly.
   *
   * console.error, never throw, like every other assertion in this file.
   */
  function assertGaitIsPossible() {
    if (!bones || !legRig) return;
    const saved = { gaitName, correction, speed, gaitPhase, crouchNow, turnNow, peekNow,
      breathPhase, elapsed };
    const report = [];
    const N = 60;
    const heel = new THREE.Vector3();
    const toe = new THREE.Vector3();
    for (const check of GAIT_CHECKS) {
      gaitName = check.gait;
      if (correction !== check.corr) {
        correction = check.corr;
        applyCorrection();
      }
      crouchNow = check.crouch;
      // The body does not yaw here, so a turn is only its bank: a steady
      // sideways shift the planted feet must still be reached across.
      turnNow = check.turn || 0;
      peekNow = 0;
      speed = check.speed;
      const stride = strideNow();
      const dt = (stride / speed) / N;
      const label = `${check.gait} at ${check.speed} m/s${check.crouch ? ` crouched ${check.crouch}` : ''}`
        + `${check.turn ? ` turning ${check.turn} rad/s` : ''} (correction ${check.corr})`;
      let worstAbove = -Infinity;
      let worstBehind = -Infinity;
      let worstReach = 0;
      let worstSink = 0;
      let finite = true;
      const bestRun = { left: 0, right: 0 };
      const run = { left: 0, right: 0 };
      const prev = { left: [0, 0, 0, 0], right: [0, 0, 0, 0] };
      const legDuty = { left: 1, right: 1 };
      gaitPhase = 0;
      // TWO CYCLES, and the planted run carries across the seam. A stance
      // that straddles the start of the window -- the right foot's always
      // does, it lands half a cycle in, and so does the monster's lagged bad
      // foot -- was being cut in two and scored as its longer half: the
      // monster's bad foot read 36% planted against a 37% floor while it was
      // in fact planted for all 43% of its stance. A good part of the
      // "skating" this sweep reported was that.
      for (let i = 0; i <= 2 * N; i++) {
        gaitPhase += (speed / stride) * TAU * dt;
        animate();
        root.updateWorldMatrix(true, false);
        for (const side of SIDES) {
          const L = legRig[side];
          const ankB = bones.get(side + ' ankle');
          const ank = root.worldToLocal(ankB.getWorldPosition(_v));
          const kne = root.worldToLocal(bones.get(side + ' knee').getWorldPosition(_v2));
          const hip = root.worldToLocal(bones.get(side + ' leg').getWorldPosition(_v3));
          if (!Number.isFinite(ank.x + ank.y + ank.z + kne.x + kne.y + kne.z)) finite = false;
          worstAbove = Math.max(worstAbove, ank.y - kne.y);
          // Forward is -z, so a knee whose z is GREATER than the hip-ankle
          // line's at the same height is behind it.
          const f = (kne.y - hip.y) / Math.min(-1e-6, ank.y - hip.y);
          worstBehind = Math.max(worstBehind, kne.z - (hip.z + (ank.z - hip.z) * f));
          legDuty[side] = diag[side].duty;
          if (diag[side].stance) worstReach = Math.max(worstReach, diag[side].reach);
          // getWorldPosition above refreshed the ankle's matrixWorld.
          root.worldToLocal(ankB.localToWorld(heel.copy(L.heel)));
          root.worldToLocal(ankB.localToWorld(toe.copy(L.toe)));
          const hy = heel.y - L.floorY;
          const ty = toe.y - L.floorY;
          worstSink = Math.max(worstSink, -hy, -ty);
          const p = prev[side];
          if (i > 0) {
            // The floor runs backward under the body at `speed` (+z); a shoe
            // planted on it does exactly the same and nothing sideways.
            const slipH = Math.hypot((heel.z - p[1]) / dt - speed, (heel.x - p[0]) / dt);
            const slipT = Math.hypot((toe.z - p[3]) / dt - speed, (toe.x - p[2]) / dt);
            const planted = (hy < PLANT_HEIGHT && slipH <= PLANT_SLIP * speed)
              || (ty < PLANT_HEIGHT && slipT <= PLANT_SLIP * speed);
            run[side] = planted ? run[side] + 1 : 0;
            bestRun[side] = Math.max(bestRun[side], run[side]);
          }
          p[0] = heel.x; p[1] = heel.z; p[2] = toe.x; p[3] = toe.z;
        }
      }
      if (!finite) report.push(label + ' put a leg joint at NaN');
      if (worstAbove >= 0) {
        report.push(label + ' raised an ankle ' + (worstAbove * 1000).toFixed(0)
          + ' mm ABOVE its own knee -- the flexion sign is inverted, or a heel kick is folding'
          + ' the shin past horizontal');
      }
      if (worstBehind > 0.01) {
        report.push(label + ' put a knee ' + (worstBehind * 1000).toFixed(0)
          + ' mm BEHIND the hip-ankle line -- the leg is bending backwards');
      }
      if (worstReach > IK_CLAMP) {
        report.push(label + ' asks a planted leg for ' + (100 * worstReach).toFixed(1)
          + '% of its reach -- the IK clamps and the foot leaves the floor');
      }
      if (worstSink > SINK_LIMIT) {
        report.push(label + ' puts a shoe ' + (worstSink * 1000).toFixed(0)
          + ' mm into the floor');
      }
      for (const side of SIDES) {
        const floor = 0.85 * legDuty[side] * N;
        if (bestRun[side] < floor) {
          report.push(label + ': the ' + side + ' shoe is only planted for '
            + (100 * bestRun[side] / N).toFixed(0) + '% of a cycle (want at least '
            + (100 * floor / N).toFixed(0) + '%) -- it is skating');
        }
      }
    }
    // STANDING STILL: every profile, upright and crouched, through a whole
    // breath and out to both ends of the idle weight shift. Rule 4 and the
    // sole: a standing figure whose breath outgrows its legs hovers.
    for (const check of IDLE_CHECKS) {
      gaitName = check.gait;
      if (correction !== check.corr) {
        correction = check.corr;
        applyCorrection();
      }
      crouchNow = check.crouch;
      speed = 0;
      gaitPhase = 0;
      let worstReach = 0;
      let worstGap = 0;
      for (let i = 0; i < 24; i++) {
        breathPhase = (i / 24) * TAU;
        elapsed = ((i % 2) ? 1.5 : 0.5) * Math.PI / IDLE_SHIFT_RATE;
        animate();
        for (const side of SIDES) {
          const L = legRig[side];
          const ankB = bones.get(side + ' ankle');
          ankB.updateWorldMatrix(true, false);
          root.worldToLocal(ankB.localToWorld(heel.copy(L.heel)));
          root.worldToLocal(ankB.localToWorld(toe.copy(L.toe)));
          worstReach = Math.max(worstReach, diag[side].reach);
          worstGap = Math.max(worstGap, Math.abs(Math.min(heel.y, toe.y) - L.floorY));
        }
      }
      const label = `${check.gait} standing${check.crouch ? ' crouched' : ''} (correction ${check.corr})`;
      if (worstReach > IK_CLAMP) {
        report.push(label + ' asks a leg for ' + (100 * worstReach).toFixed(1)
          + '% of its reach -- the breath is lifting the feet off the floor');
      }
      if (worstGap > PLANT_HEIGHT) {
        report.push(label + ' stands ' + (worstGap * 1000).toFixed(0) + ' mm off the floor');
      }
    }
    if (report.length) console.error('OkabeCreature gait: ' + report.join('; ') + '.');
    gaitName = saved.gaitName;
    correction = saved.correction;
    speed = saved.speed;
    gaitPhase = saved.gaitPhase;
    crouchNow = saved.crouchNow;
    turnNow = saved.turnNow;
    peekNow = saved.peekNow;
    breathPhase = saved.breathPhase;
    elapsed = saved.elapsed;
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
  /** Metres of FLOOR per stride: strideNow() is in the rig's own (unscaled) space. */
  function worldStride() {
    return strideNow() * scale;
  }

  function strideNow() {
    if (!legRig) return STRIDE;
    const prof = GAITS[gaitName];
    const t = prof.tune;
    const w = THREE.MathUtils.smoothstep(speed, prof.walkFrom, prof.walkTo);
    const r = THREE.MathUtils.smoothstep(speed, prof.runFrom, prof.runTo);
    // BLENDED AS STANCE LENGTH, then divided back out. Lerping stride and duty
    // separately across the run blend multiplies two lines together, and the
    // product -- how far the planted foot must travel, which is what the leg
    // has to reach -- bulges past both ends in the middle: 1.08 leg at the
    // player's mid-blend against 0.96 walking and 1.07 running. For a table
    // whose stride is the same in every column, as the monster's is, this is
    // exactly the plain stride.
    const duty = blendEntry(t.duty, correction, w, r, crouchNow);
    const stance = blendStance(t.duty, t.stride, correction, w, r, crouchNow);
    const perLeg = duty > 1e-3 ? stance / duty : colValue(t.stride.walk, correction);
    // Floored so update()'s speed / stride is 0, not NaN, standing still.
    return Math.max(1e-3, legRig.left.len * perLeg * strideFade());
  }

  /**
   * How much of its full stride the body takes at this speed: in proportion
   * to speed at a crawl, easing into the full stride by the profile's walkTo.
   *
   * THIS REPLACED SQUEEZING THE FOOT PATH, which was a skate. The fade-in
   * used to scale the planted foot's travel by `walking` while the phase still
   * advanced at the full stride, so below walkTo every planted foot moved
   * slower than the floor under it -- 4% at the monster's 0.85 m/s patrol, 100%
   * at a shuffle. Shortening the stride itself, in the one number update() and
   * animate() both read, keeps the foot on the floor at every speed: a slow
   * walk is short steps, which is also what a slow walk looks like. x(2 - x)
   * rather than x so the cadence never runs to zero or infinity at a crawl.
   */
  function strideFade() {
    const x = THREE.MathUtils.clamp(speed / GAITS[gaitName].walkTo, 0, 1);
    return x * (2 - x);
  }

  /**
   * Fill G with every tuning number for this frame.
   *
   * The few numbers that pay for the stride's REACH fade in with the stride
   * (wLeg, strideFade) rather than with the rest of the gait (w): faded on
   * the slower smoothstep, the hips came up and the roll went flat faster
   * than the stride shortened, and at 0.5 m/s the player's planted leg was
   * asked for 100.8% of its reach. Faded together, the geometry shrinks as a
   * whole and the reach can only fall.
   */
  function resolveGait(prof, w, r, wLeg) {
    const t = prof.tune;
    for (const k of TUNE_KEYS) {
      G[k] = blendEntry(t[k], correction, LEG_KEYS.has(k) ? wLeg : w, r, crouchNow);
    }
    return G;
  }

  /**
   * rest * swing * twist * lean, composed in a fixed order so it is stable.
   *
   * `k` is the bone's CANONICAL name (see canon) -- written that way at every
   * call site rather than canonicalised here, because canon() builds two new
   * strings and this runs a dozen times a frame for three figures.
   */
  function pose3(k, sw, tw, ln) {
    const b = bones && bones.get(k);
    const r = restQuat && restQuat.get(k);
    if (!b || !r) return;
    b.quaternion.copy(r);
    if (sw) b.quaternion.multiply(_q.setFromAxisAngle(swingAxis.get(k), sw));
    if (tw) b.quaternion.multiply(_q2.setFromAxisAngle(twistAxis.get(k), tw));
    if (ln) b.quaternion.multiply(_q2.setFromAxisAngle(leanAxis.get(k), ln));
  }

  /**
   * A collarbone turned about the WORLD's vertical and forward axes rather
   * than the chest's: the twist and lift are conjugated by the trunk's pitch
   * (`carried`), so they act as if the chest were upright.
   *
   * WHY. pose3's twist is about the bone's own rest vertical, which on a
   * chest pitched 43 degrees forward is an axis tipped 43 degrees toward the
   * face -- and a rotation about THAT rolls a hanging arm inward as well as
   * bringing the shoulder forward. MEASURED on the hunched monster: its
   * rounded shoulders swung both hands across the midline, the right
   * fingertip 98 mm onto the LEFT side of the body walking and 186 mm in the
   * chase, so the hands met in front of the groin. Levelled, the round brings
   * the shoulders forward and the arms still hang outside the thighs.
   */
  function poseCollar(k, pitch, tw, ln) {
    const b = bones && bones.get(k);
    const r = restQuat && restQuat.get(k);
    if (!b || !r) return;
    const sw = swingAxis.get(k);
    b.quaternion.copy(r).multiply(_q.setFromAxisAngle(sw, -pitch));
    if (tw) b.quaternion.multiply(_q2.setFromAxisAngle(twistAxis.get(k), tw));
    if (ln) b.quaternion.multiply(_q2.setFromAxisAngle(leanAxis.get(k), ln));
    b.quaternion.multiply(_q.setFromAxisAngle(sw, pitch));
  }

  function pose(k, axis, angle) {
    const b = bones && bones.get(k);
    const r = restQuat && restQuat.get(k);
    if (!b || !r || !angle) return;
    b.quaternion.copy(r).multiply(_q.setFromAxisAngle(axis, angle));
  }

  /** An elbow, on its true hinge or on the sagittal axis -- see elbowHinge. */
  function bendElbow(k, angle, hinge) {
    const axis = hinge && flexAxis.get(k);
    if (axis) pose(k, axis, angle);
    else pose3(k, angle, 0, 0);
  }

  /** Each joint's phase, trailing the one before it (LAG). */
  function at(k) {
    return gaitWarp(gaitPhase - (LAG[k] || 0));
  }

  /** How much of the limp this reading has: all of it at 0, LIMP_MAN at 1. */
  function limpShare() {
    return 1 - correction + LIMP_MAN * correction;
  }

  /**
   * The bad side under-steps; eased toward the man's trace of a limp as
   * correction rises. A no-op for a profile whose limp entries are 1.
   */
  function g(v) {
    return 1 + (v - 1) * limpShare();
  }

  /**
   * Fill `tw` with the twitch happening at time t, if one is: see
   * TWITCH_SLOT. Fast in and slower out -- 20% of it rising, the rest letting
   * go -- because a spasm is a snap and then a release.
   */
  /** See setCeiling(). Runs after animate(), so the curl sits on this frame's gait. */
  function stoopUnderCeiling(dt) {
    const head = bones && bones.get(canon('Head'));
    if (!head) return;
    for (const [name, share] of Object.entries(CEILING_SHARE)) {
      const bone = bones.get(canon(name));
      if (bone) bone.rotation.x += ceilingCurl * share;
    }
    group.updateMatrixWorld(true);
    head.getWorldPosition(_crown);
    const over = _crown.y + CROWN_ABOVE_HEAD_BONE * scale - (ceilingY - CEILING_MARGIN);
    if (over > 0) ceilingCurl = Math.min(CEILING_CURL_MAX, ceilingCurl + over * CEILING_GAIN * dt);
    else ceilingCurl = Math.max(0, ceilingCurl - CEILING_RELAX * dt * Math.min(1, -over * 10));
  }

  function twitchAt(t) {
    tw.amt = 0;
    if (!(t > 0)) return;
    const n = Math.floor(t / TWITCH_SLOT);
    if (hash01(n, 7, seed) < TWITCH_SKIP) return;
    const start = n * TWITCH_SLOT + TWITCH_FIRST + TWITCH_SPREAD * hash01(n, 1, seed);
    const x = (t - start) / (TWITCH_MIN + (TWITCH_MAX - TWITCH_MIN) * hash01(n, 2, seed));
    if (x <= 0 || x >= 1) return;
    tw.amt = (x < 0.2 ? smooth01(x / 0.2) : 1 - smooth01((x - 0.2) / 0.8))
      * (0.7 + 0.3 * hash01(n, 5, seed));
    tw.kind = Math.floor(hash01(n, 3, seed) * 3);
    tw.side = hash01(n, 4, seed) < 0.5 ? -1 : 1;
    tw.clench = hash01(n, 6, seed) < 0.6 ? 1 : -0.6;
  }

  /**
   * Where the scanning head is looking at time t, -1..1, on channel k (0 the
   * bearing, 1 the pitch): see SCAN_SEG. Each bearing is turned to over the
   * first SCAN_MOVE of its segment and held for the rest.
   */
  function scanAt(t, k) {
    const u = Math.max(0, t) / SCAN_SEG;
    const n = Math.floor(u);
    const from = n < 2 ? 0 : 2 * hash01(n, 10 + k, seed) - 1;
    const to = n + 1 < 2 ? 0 : 2 * hash01(n + 1, 10 + k, seed) - 1;
    return lerp(from, to, smooth01((u - n) / SCAN_MOVE));
  }

  /**
   * The bones animate() touches every frame, listed once at load: rest
   * quaternions paired with their bones, and the coat's chains with their
   * depth already parsed -- so the frame loop iterates plain arrays instead
   * of Map entries and regexes, and allocates nothing.
   */
  let restList = [];
  let coatList = [];
  let fingerList = [];
  function listBones() {
    restList = [];
    coatList = [];
    fingerList = [];
    for (const [name, bone] of bones) {
      const rest = restQuat.get(name);
      if (!rest) continue;
      restList.push({ bone, rest });
      if (name.startsWith('white clothes')) {
        const seg = /(\d)/.exec(name);
        coatList.push({ bone, rest, depth: seg ? Number(seg[1]) : 1, axis: swingAxis.get(name) });
      }
      const axis = fingerAxis && fingerAxis.get(name);
      if (axis) {
        const thumb = name.startsWith('thumb');
        const n = Number(/(\d) [lr]$/.exec(name)?.[1] ?? 1) - (thumb ? 0 : 1);
        fingerList.push({ bone, rest, axis, left: name.endsWith(' l'),
          share: (thumb ? THUMB_SEG : FINGER_SEG)[n] ?? 0 });
      }
    }
  }

  /** Canonical bone names per side, so the leg loop builds no strings. */
  const LEG = {
    left: { leg: 'left leg', knee: 'left knee', ankle: 'left ankle' },
    right: { leg: 'right leg', knee: 'right knee', ankle: 'right ankle' }
  };

  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  function animate() {
    if (!bones) return;
    const prof = GAITS[gaitName];
    // Smoothstep rather than a linear ramp: a gait that fades in linearly
    // spends its first half-second barely moving, which reads as a stutter.
    const walking = THREE.MathUtils.smoothstep(speed, prof.walkFrom, prof.walkTo);
    // ONE PARAMETER MAKES THE RUN. Below runFrom the foot is down for most of
    // the cycle and at least one foot is always planted; above runTo it is
    // down for barely a third and there is a flight phase. Because the path
    // plants the foot at the body's own speed whatever the duty is, the run
    // cannot slide any more than the walk can.
    const running = THREE.MathUtils.smoothstep(speed, prof.runFrom, prof.runTo);
    const fade = strideFade();
    resolveGait(prof, walking, running, fade);
    if(reflectionSample){
      G.armSwing=Math.min(G.armSwing,.22);G.bob=Math.min(G.bob,.009);
      G.lift=Math.min(G.lift,.025);G.hipDrop=Math.min(G.hipDrop,.012);
      G.srot=Math.min(G.srot,.035);G.lean=Math.min(G.lean,.06);G.hunch=Math.min(G.hunch,.03);
    }
    const wrong = 1 - correction;
    const limp = prof.limp;

    // Reset every driven bone to rest, then add. Without this a frame that
    // skips a joint leaves last frame's pose on it forever.
    for (let i = 0; i < restList.length; i++) restList[i].bone.quaternion.copy(restList[i].rest);

    const gp = gaitWarp(gaitPhase);
    const duty = G.duty;
    const lift = G.lift;
    const phase = gaitPhase / TAU;
    const stride = strideNow()*(reflectionSample?.55:1);
    const limpAmt = limpShare();

    // THE FOOTFALLS (see MONSTER LAYERS): cycles since each heel strike --
    // the bad foot lands limp.lag late, the good one half a cycle on, exactly
    // as the leg loop below places them -- and the pulse each link of the
    // body feels, later the higher it is. Faded with the gait, so a standing
    // figure feels none.
    const xL = frac(phase - limp.lag * limpAmt);
    const xR = frac(phase + 0.5);
    const cyc = speed / (stride * scale);
    const badHit = g(limp.impact);
    const hitHips = walking * footfall(xL, xR, badHit, IMPACT_DELAY.hips, cyc);
    const hitSpine = walking * footfall(xL, xR, badHit, IMPACT_DELAY.spine, cyc);
    const hitChest = walking * footfall(xL, xR, badHit, IMPACT_DELAY.chest, cyc);
    const hitNeck = walking * footfall(xL, xR, badHit, IMPACT_DELAY.neck, cyc);
    const hitHead = walking * footfall(xL, xR, badHit, IMPACT_DELAY.head, cyc);
    const hitCoat = walking * footfall(xL, xR, badHit, IMPACT_DELAY.coat, cyc);

    // THE TWITCH, if one is happening now; each kind reads its own share.
    twitchAt(elapsed);
    const twAmt = tw.amt * G.twitch * twitchGain;
    const twHead = tw.kind === 0 ? twAmt * tw.side : 0;
    const twShrug = tw.kind === 1 ? twAmt : 0;
    const twHand = tw.kind === 2 ? twAmt * tw.clench : 0;

    // THE MONSTER'S BREATH: a heave of the chest and a shrug of the
    // shoulders, ragged -- a second harmonic gives every breath a catch, so
    // it reads as laboured rather than as a metronome. Lifting the chest is
    // a BACKWARD pitch, hence the minus below.
    const heave = G.heave * (Math.sin(breathPhase) + 0.35 * Math.sin(2 * breathPhase + 1.3));
    // And the slow standing sway of the upper body: side to side on 15 and
    // 37 s periods, fore and aft on 22, none a multiple of another or of the
    // breath, and offset per figure.
    const swayT = elapsed + seed * 7.3;
    const bodySway = G.bodySway * (0.7 * Math.sin(swayT * 0.41) + 0.3 * Math.sin(swayT * 0.17 + 1.9));
    const bodyRock = G.bodySway * 0.6 * Math.sin(swayT * 0.29 + 0.7);
    // The trunk FOLDS at each landing, a little at the spine and then more at
    // the chest -- the weight arriving and being caught. This is the lope's
    // lurch at a run.
    const foldS = G.impactPitch * 0.4 * hitSpine;
    const foldC = G.impactPitch * 0.6 * hitChest;

    // THE FORWARD LEAN, and what the upper body inherits from it. Everything
    // hanging off the chest -- arms, head, coat -- is posed in WORLD terms by
    // taking `carried` back out, so a hunched body still hangs its arms
    // plumb and still looks where it is going.
    const hipsPitch = G.lean * LEAN_SPLIT.hips;
    const spinePitch = G.lean * LEAN_SPLIT.spine + foldS + bodyRock * 0.5;
    const chestPitch = G.lean * LEAN_SPLIT.chest + G.hunch
      + G.breathChest * Math.sin(breathPhase + 0.5) + foldC - heave + bodyRock * 0.5;
    const carried = hipsPitch + spinePitch + chestPitch;

    // --- pelvis FIRST -------------------------------------------------------
    // Ordering is load-bearing now: the legs are solved against where the hip
    // ACTUALLY is this frame, and the pelvis is what moves it. Solve the legs
    // first and every bob and sway becomes a few centimetres of foot slide.
    // Lateral tilt is cheap on a normal body and expensive on the monster's --
    // see `sway` in GAITS.
    // LEANING INTO A TURN, which a runner does and a walker barely does: the
    // angle a body needs to balance a turn at this speed, atan(v * w / g),
    // scaled by the profile and capped. Positive turn rate is yaw increasing,
    // which is turning LEFT; + lean on the spine's axes is toward the right,
    // hence the minus. Worked out here, before the pelvis, because the hips
    // move into the turn too (TURN_HIP_SHIFT).
    const turnLean = -THREE.MathUtils.clamp(
      Math.atan(speed * turnNow / 9.81) * G.turnLean, -TURN_LEAN_MAX, TURN_LEAN_MAX);
    const drop = G.drop * Math.sin(gp + 0.4);
    const prot = G.prot * Math.sin(gp - 0.20);
    const hipsKey = 'hips';
    const hips = bones.get(hipsKey);
    if (hips) {
      // Pitch on the MEASURED axis, then twist and roll as they always were;
      // a zero pitch is skipped.
      hips.quaternion.copy(restQuat.get(hipsKey));
      if (hipsPitch) hips.quaternion.multiply(_q.setFromAxisAngle(swingAxis.get(hipsKey), hipsPitch));
      hips.quaternion
        .multiply(_q.setFromAxisAngle(Y, prot))
        .multiply(_q2.setFromAxisAngle(Z, drop));
      // Two peaks per stride and no cusp: abs(sin) has a corner at every
      // footfall which shows on a silhouette as a tick.
      //
      // WHERE IT PEAKS IS A PROFILE CHOICE. cos(2 * phase) alone is highest at
      // TOUCHDOWN -- the body at its tallest exactly when the front leg is
      // reaching furthest, which cost the monster 24 mm of reach it did not
      // have. bobMidStance shifts the wave by the duty so it peaks at
      // mid-stance, where a walking body really is highest -- vaulting over
      // the planted leg -- and a run flips that (bobFlip): lowest at
      // mid-stance, highest in flight, the spring a runner is.
      const bob = G.bob * Math.cos(2 * gaitPhase - G.bobMidStance * TAU * duty + G.bobFlip * Math.PI)
        - G.bobLimp * Math.max(0, -Math.sin(gp));
      const breath = Math.sin(breathPhase) * G.breath;
      // Hip translation side to side, plus the slow shift of weight from foot
      // to foot that keeps a standing body from looking switched off, plus
      // the bank into a turn. The feet stay put through all three -- solveLeg
      // tips the leg to hold them. MEASURED SIGN: the hips' local +x is the
      // figure's LEFT, since the loaded scene is turned half a turn
      // (MODEL_FACES_PLUS_Z), and turnLean is negative leaning left.
      const sway = G.sway * Math.sin(gp + 0.25) + G.idleSway * Math.sin(elapsed * IDLE_SHIFT_RATE)
        - TURN_HIP_SHIFT * turnLean;
      // hipDrop is a posture: a few millimetres of soft knee standing still,
      // the stride's worth moving, 400 mm crouched.
      const hipDrop = legRig ? G.hipDrop * legRig.left.len : 0;
      const rest = restPos.get(hipsKey);
      // And the footfall: the hips drop as the weight lands. The legs are
      // solved after this, so it bends the knees rather than lifting a foot.
      const absorb = G.impact * hitHips;
      if (rest) {
        hips.position.set(rest.x + sway,
          rest.y + hipLift * wrong * (preservePersonProportions ? 0 : 1) + bob + breath - hipDrop - absorb, rest.z);
      }
    }

    // --- legs: the FOOT is driven and the joints are solved ------------------
    if (legRig && hips) {
      root.updateWorldMatrix(true, false);
      // The pelvis's orientation in ROOT space, inverted, so each thigh can be
      // set where the gait wants it in root space and converted to local
      // here. Posing the thigh on top of the pelvis instead -- as this file
      // did -- swings the whole leg with every pelvic twist and roll: the
      // planted foot slid sideways by up to 50 mm a step at the monster's
      // 0.10 rad twist, and the player's forward lean would have tipped both
      // feet backward off their marks.
      _qHipsInv.copy(root.getWorldQuaternion(_q2)).invert()
        .multiply(hips.getWorldQuaternion(_q)).invert();
      // The stance's offset under the hip and the roll shrink with the stride
      // (`fade`), so a body slowing to a stop brings its feet back under
      // itself and puts them down flat.
      for (const side of SIDES) {
        const L = legRig[side];
        const keys = LEG[side];
        const bad = side === 'left';          // the monster favours one side
        const out = bad ? -1 : 1;             // root +x is the figure's right
        // The bad foot lands LATE -- `lag` was being ADDED, which landed it
        // early, and with its stance cut to 43% that left both feet off the
        // floor for 13% of every walking cycle: the monster hopped. Landing
        // it 0.08 of a cycle late puts its short stance where the good leg's
        // ends, so one foot is always down, as a walk must have.
        const t = phase + (bad ? -limp.lag * limpAmt : 0.5);
        // A LIMP IS LESS TIME ON THE GROUND, NOT A SHORTER STRIDE AT THE SAME
        // CADENCE. Scaling only the step was the first thing I tried and it
        // reintroduced exactly the slide this rewrite removed: the bad foot
        // was planted for 60% of the cycle but only travelled 72% as far, so
        // it skated at 1.31 m/s under a body doing 2.35. Deriving the step
        // FROM the duty keeps planted speed equal to the body's on both legs,
        // whatever the limp is set to.
        const legDuty = duty * (bad ? g(limp.step) : 1);
        const legLen = L.len;
        // The rocker follows whatever angle it is given, so a half-faded roll
        // is still a shoe on the floor.
        const roll = fade * (bad ? g(limp.ankle) : 1);
        footPath(t, legDuty, legDuty * stride, G.stanceShift * legLen * fade,
          lift * (bad ? g(limp.lift) : 1), G.reachToe * roll, G.pushToe * roll,
          G.flatBy, G.heelOff, G.swingLag, G.liftEarly, G.liftPow, foot);
        const thigh = bones.get(keys.leg);
        const hip = root.worldToLocal(thigh.getWorldPosition(_v));
        // The stagger is the crouched idle's one foot forward, one back (+z is
        // behind). The foot keeps its line across the body however the hips
        // sway -- solveLeg's beta tips the leg to hold it there.
        solveLeg(L,
          L.footX + out * G.stepWidth * legLen - hip.x,
          L.groundY + foot.y - hip.y,
          L.footZ + foot.z + out * G.stagger * legLen - hip.z, ik);
        diag[side].duty = legDuty;
        diag[side].reach = ik.reach;
        diag[side].stance = foot.planted;
        // Root space: the turn about X, then the tip, on the rest orientation.
        _q.setFromAxisAngle(X, ik.alpha).premultiply(_q2.setFromAxisAngle(Z, ik.beta))
          .multiply(L.restRootQ);
        thigh.quaternion.copy(_qHipsInv).multiply(_q);
        pose3(keys.knee, ik.flex, 0, 0);
        // THE SHOE IS POSED RELATIVE TO THE FLOOR, not to the shin. `shin` is
        // how far the shin has pitched back from rest -- root X is the leg's
        // hinge, so the thigh's turn and the knee's bend simply add -- and a
        // shoe fixed to it would inherit all of it: standing on its toes in
        // the crouch, where the shin pitches up to 75 degrees forward, and
        // rocking like a chair through every stance. Cancelling it leaves the
        // shoe at exactly the pitch the rocker assumed, which is what keeps the
        // heel and toe on the floor. In swing `flat` lets it go back to the shin,
        // by as much as the profile's swingRelax allows -- and by nothing at
        // a standstill (`fade`): the phase freezes wherever the figure
        // stopped, often mid-swing, and a released shoe on a bent standing
        // leg tipped 7 mm into the floor.
        const shin = -ik.alpha + ik.flex * L.kneeDot;
        const hold = 1 - (1 - foot.flat) * G.swingRelax * fade;
        pose3(keys.ankle, (foot.pitch - hold * shin) * L.ankleDot, 0, 0);
      }
    }
    // Counter-rotation; see `srot` in GAITS for why the monster's is broken.
    const srot = -G.srot * Math.sin(at('chest') - 0.20 + G.torsoLag);
    // ON MEASURED AXES, and composed with the peek rather than overwritten.
    // pose3 writes rest * swing * twist * lean in one go, so the lean of a
    // body leaning out from a corner and the twist of its own walk cannot
    // clobber one another the way two separate pose() calls would.
    const pk = peekNow;
    // NOTE THE SIGN: measured, + swing on the spine and chest moves the head
    // FORWARD, so this negative crane leans the peek slightly back, not
    // forward as its name says. Left as shipped -- the peek was tuned by eye
    // with it -- and recorded here so nobody copies the sign for a forward lean.
    const crane = -PEEK_CRANE * Math.abs(pk);
    // turnLean (worked out above, with the pelvis) bends the spine and chest
    // into the turn and the neck back out of it, so the head stays nearer level.
    // The trunk rights itself against the pelvis's roll, so the hips can
    // carry weight from side to side without the shoulders rocking with them.
    // Hips local Z and the spine's measured lean move the head the same way.
    const steady = -drop * G.rollCounter;
    // THE SPINE WAVE (see WAVE_LAG): the pelvis's roll travels up the body,
    // the trunk rolling onto the planted leg and the neck and head righting
    // themselves after it, each link a little later than the one below.
    const wp = gp + 0.4;
    const waveS = -G.wave * 0.6 * Math.sin(wp - WAVE_LAG);
    const waveC = -G.wave * Math.sin(wp - 2 * WAVE_LAG);
    const waveN = G.wave * 0.8 * Math.sin(wp - 3 * WAVE_LAG);
    const waveH = G.wave * 0.5 * Math.sin(wp - 4 * WAVE_LAG);
    // A shoulder hitch tips the chest toward the other side, which is what
    // lifts the hitched shoulder from underneath as well as at the collarbone.
    const twTip = tw.kind === 1 ? -0.06 * twAmt * tw.side : 0;
    pose3('spine', crane * 0.40 + spinePitch, srot * 0.35,
      pk * PEEK_SPINE + turnLean * 0.5 + steady + waveS + bodySway * 0.5);
    pose3('chest', crane + chestPitch, srot,
      pk * PEEK_CHEST + turnLean * 0.5 + waveC + bodySway * 0.5 + twTip);
    // The head hangs almost still while the body works underneath it -- and
    // takes the trunk's lean back out, so a running or crouching body still
    // looks where it is going. headDown is what is left on purpose.
    //
    // The landing's fold is NOT taken back out: the head goes down with the
    // trunk, and then nods on its own, later still (headBob) -- the heavy
    // head on a long neck arriving a beat after the foot.
    const look = G.headDown - carried + foldS + foldC;
    // THE JUT: the neck thrust forward along the hunch and the head pitched
    // back by the same amount, so the face still looks ahead from a head
    // carried out in front of the chest -- a vulture's neck, not a bowed one.
    // With the hunch it puts the base of the skull 0.39 m ahead of the hips.
    //
    // THE NOD IS A WHIP, not a dip: as the hips take the weight the neck
    // first lifts the head against it (HEAD_INERTIA), so the head hangs back
    // while the body drops beneath it, and only then nods down, late and
    // deep. A plain late nod was not enough -- the head rode the hips down
    // and bottomed out with them, 46 ms behind; see HEAD_INERTIA.
    const nod = G.headBob * (hitNeck - HEAD_INERTIA * hitHips);
    const nodBack = -0.55 * G.headBob * hitHead;
    // THE SCAN, standing and searching: never while leaning out to look at
    // the player, which has its own head turn.
    const scanW = G.scan * (1 - Math.abs(pk));
    const scanYaw = scanW * scanAt(elapsed, 0);
    const scanPitch = 0.35 * scanW * scanAt(elapsed, 1);
    pose3('neck', look * 0.5 + G.neckJut + nod,
      -srot * G.neckCounter + pk * PEEK_HEAD_TURN * 0.35 + scanYaw * 0.35 + twHead * TW_HEAD_TURN * 0.25,
      pk * PEEK_NECK - turnLean * 0.6 + waveN - bodySway * 0.6);
    // AND THEN IT LOOKS AT YOU. The torso leaning out of cover is the motion
    // that catches the eye; the head coming round afterwards is what makes it
    // a thing that has seen you rather than a thing that is swaying. The turn
    // is on TWIST and the counter-tilt on LEAN, both measured, because this
    // neck is stretched 1.85x in the monster reading and a few degrees of
    // error at the base is a long way at the top of it.
    pose3('head', -PEEK_HEAD_DIP * Math.abs(pk) + look * 0.5 - G.neckJut + nodBack + scanPitch,
      pk * PEEK_HEAD_TURN + scanYaw * 0.65 + twHead * TW_HEAD_TURN,
      -pk * PEEK_HEAD_TILT + G.headTilt + waveH + twHead * TW_HEAD_TILT);

    // --- arms ---------------------------------------------------------------
    // Collarbones roll forward for the hunch and the drive of a sprint.
    // Measured: + twist brings the RIGHT shoulder forward and the left back,
    // and + lean lifts the LEFT shoulder and drops the right.
    //
    // The monster's also hang LOW (shoulderDrop), shrug with every breath,
    // hitch in a twitch, and ride forward with their own arm's swing and up a
    // little at each end of it (shoulderSwing) -- the arm is swung from the
    // collarbone as well as the shoulder joint, which is what makes a long
    // arm look heavy rather than hinged.
    const sa = Math.sin(at('arm'));
    const shrug = heave * HEAVE_SHRUG;
    const ride = 0.4 * G.shoulderSwing * sa * sa;
    const liftL = -G.shoulderDrop + shrug + ride + (tw.side < 0 ? TW_SHRUG * twShrug : 0);
    const liftR = -G.shoulderDrop + shrug + ride + (tw.side > 0 ? TW_SHRUG * twShrug : 0);
    if (prof.levelCollar) {
      poseCollar('left shoulder', carried, -G.shoulderRound - G.shoulderSwing * sa, liftL);
      poseCollar('right shoulder', carried, G.shoulderRound - G.shoulderSwing * sa, -liftR);
    } else {
      pose3('left shoulder', 0, -G.shoulderRound - G.shoulderSwing * sa, liftL);
      pose3('right shoulder', 0, G.shoulderRound - G.shoulderSwing * sa, -liftR);
    }
    // ARMS: swing on the MEASURED sagittal axis, and brought DOWN out of the
    // imported A-pose on the lean axis. Before this they rotated about raw
    // local X, which on these bones is 62.5 degrees off sagittal -- so most of
    // the "swing" went sideways and the figure flapped instead of walking.
    //
    // + swing takes an arm BACK, and the trunk's forward lean takes a hanging
    // arm back with it, so `carried` is subtracted to leave armFwd and the
    // swing as angles from plumb. armInward is a small inward roll of the
    // upper arm that brings a bent forearm across toward the midline the way
    // a runner's hands come in; measured, that is - on the left, + right.
    //
    // armOut swings the arm out a little at each end of its arc and back in
    // as it passes the hip -- a long arm clearing the body rather than
    // brushing through the coat. On the lean axis, + out for the left arm.
    const swL = G.armSwing * g(1.00);
    const swR = G.armSwing * g(limp.arm);
    const fwdL = G.armFwd + sa * swL + (tw.side < 0 ? TW_ARM * twShrug : 0);
    const fwdR = G.armFwd - sa * swR + (tw.side > 0 ? TW_ARM * twShrug : 0);
    //
    // The collarbone's lift is taken back out of the arm, which is how a
    // HANGING arm behaves: a shrug, a breath or a hitch raises the shoulder
    // and the arm rides up with it, still plumb. Left in, it rolled the
    // whole 1.2 m arm about the collarbone and the breath alone swung the
    // standing monster's hands 150 mm in toward each other, until they met.
    // Only for levelled collarbones, whose lift is about the same world axis
    // as the arm's own lean (exact at the bottom of the swing, a few
    // hundredths of a radian off at its ends) -- and only those have any.
    const out = G.armOut * sa * sa * ARM_DOWN_SIGN;
    const keepL = prof.levelCollar ? liftL : 0;
    const keepR = prof.levelCollar ? liftR : 0;
    pose3('left arm', -fwdL - carried, -G.armInward, -G.armDown * ARM_DOWN_SIGN + out - keepL);
    pose3('right arm', -fwdR - carried, G.armInward, G.armDown * ARM_DOWN_SIGN - out + keepR);
    // The elbow flexes more as its arm comes forward and opens as it goes
    // back. On the sagittal axis + is the forearm going BACK, so the swing
    // term's sign flips with the axis.
    //
    // DEAD WEIGHT: the forearm follows the arm's own swing armLag late, so
    // the elbow carries the difference between where the arm WAS and where it
    // is -- the forearm trails it forward, then keeps going as the arm turns
    // back. Zero lag is zero difference, exactly, which is the player.
    const elb = Math.sin(at('elbow'));
    const es = prof.elbowHinge ? 1 : -1;
    const saLag = Math.sin(gaitWarp(gaitPhase - LAG.arm - G.armLag));
    const saLag2 = Math.sin(gaitWarp(gaitPhase - LAG.arm - 2 * G.armLag));
    // A hand twitch flicks its forearm up (TW_ELBOW), clench or splay.
    const jerk = TW_ELBOW * Math.abs(twHand);
    bendElbow('left elbow', G.elbowBase + es * G.elbowSwing * elb * g(1.00)
      + es * swL * (saLag - sa) + (tw.side < 0 ? jerk : 0), prof.elbowHinge);
    bendElbow('right elbow', G.elbowBase - es * G.elbowSwing * elb * g(limp.arm)
      - es * swR * (saLag - sa) + (tw.side > 0 ? jerk : 0), prof.elbowHinge);
    // And the hand trails the forearm the same way, at the wrist's swing (+
    // takes a hanging hand back), curled toward the palm on its lean -- the
    // palms face the thighs, and measured, palm-ward is - lean on the left
    // hand and + on the right. A twitch clenches it or flicks it open.
    const curlL = G.wristCurl + (tw.side < 0 ? TW_WRIST * twHand : 0);
    const curlR = G.wristCurl + (tw.side > 0 ? TW_WRIST * twHand : 0);
    pose3('left wrist', -WRIST_FOLLOW * swL * (saLag2 - saLag), 0, -curlL);
    pose3('right wrist', WRIST_FOLLOW * swR * (saLag2 - saLag), 0, curlR);
    // FINGERS, relaxed into a loose curl -- a claw on the monster, a fist on
    // the running survivor -- and clenched or splayed by a hand twitch. Left
    // at rest when there is nothing to add.
    const fingL = G.fingerCurl + grip.l + (tw.side < 0 ? TW_FINGERS * twHand : 0);
    const fingR = G.fingerCurl + grip.r + (tw.side > 0 ? TW_FINGERS * twHand : 0);
    if (fingL || fingR) {
      for (let i = 0; i < fingerList.length; i++) {
        const f = fingerList[i];
        const c = (f.left ? fingL : fingR) * f.share;
        if (c) f.bone.quaternion.copy(f.rest).multiply(_q.setFromAxisAngle(f.axis, c));
      }
    }

    // --- the coat -----------------------------------------------------------
    // THIS RIG CAME WITH ITS COAT ALREADY BONED -- twenty-one bones in Back,
    // BackB and Side chains of three segments each. Motion survives fog long
    // after value contrast has gone, so a hem that swings is the long-range
    // read, and each segment trails the one above it so the panel ripples
    // rather than swinging as a board.
    //
    // The coat hangs from the chest, so it inherits the trunk's lean: a
    // crouching body would hold its coat out behind it like a tail. coatHang
    // gives most of that back to gravity, and coatTrail streams it back down
    // the chain at a run. Both are on the MEASURED swing axis, where + takes
    // a hanging chain back.
    //
    // coatDrape holds part of the hang back to the SECOND segment. Given all
    // at the top, the crouch's coat fell plumb from the shoulder blades while
    // the seat, pushed back 0.3 m by the squat, came out through the vent in
    // the back of it. Held back, the top of the coat follows the back over
    // the seat and only then falls.
    //
    // coatJolt is the footfall reaching the hem: the body brakes as the heel
    // lands and the hem, which was not told, carries on forward (- on the
    // measured axis) and then falls back -- most at the hem, least at the top.
    // It is what makes the coat look like heavy, wet cloth rather than a cape.
    const swingPh = Math.sin(gaitWarp(gaitPhase - 1.25)) * G.coatSwing;
    const coatHang = -carried * G.coatHang;
    const jolt = -G.coatJolt * hitCoat;
    for (let i = 0; i < coatList.length; i++) {
      const { bone, rest, depth, axis } = coatList[i];
      bone.quaternion.copy(rest).multiply(
        _q.setFromAxisAngle(X, swingPh * (0.5 + 0.35 * depth))
      );
      const hang = depth === 1 ? coatHang * (1 - G.coatDrape)
        : depth === 2 ? coatHang * G.coatDrape : 0;
      const extra = hang + G.coatTrail * (COAT_TRAIL_SPLIT[depth - 1] ?? 0)
        + jolt * (0.3 + 0.35 * depth);
      if (extra) bone.quaternion.multiply(_q2.setFromAxisAngle(axis, extra));
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
    /**
     * Adds rotations, in radians, on top of THIS FRAME's pose -- for acting in
     * a cutscene: a head that tilts, a chest that leans. Keyed by bone name as
     * the rig names them ('Head', 'Neck', 'Chest', 'Spine', 'Hips'...).
     *
     * Call it AFTER update(), every frame you want it held. update() puts every
     * bone back to its rest pose before it adds the gait, so an offset written
     * before it is wiped and one written once is gone the next frame. That is
     * also what makes it safe: there is nothing to undo when the scene ends.
     */
    /** A bone by the rig's name ('Left arm', 'right wrist'...), or null before the model is in. */
    bone(name) {
      return (bones && bones.get(canon(name))) ?? null;
    },
    /**
     * Each hand's fingers curled (positive: a fist round a shoulder or an
     * ankle) or splayed (negative) on top of the gait, held until changed.
     * reset() lets go.
     */
    setGrip(left = 0, right = left) {
      grip.l = Number.isFinite(left) ? left : 0;
      grip.r = Number.isFinite(right) ? right : 0;
    },
    offsetBones(offsets, weight = 1) {
      if (!bones || !(weight > 0)) return;
      for (const [name, rotation] of Object.entries(offsets)) {
        const bone = bones.get(canon(name));
        if (!bone || !rotation) continue;
        bone.rotation.x += (rotation[0] ?? 0) * weight;
        bone.rotation.y += (rotation[1] ?? 0) * weight;
        bone.rotation.z += (rotation[2] ?? 0) * weight;
      }
    },
    /**
     * Hides the head -- hair, face, eyes, mouth -- or shows it again. For
     * looking down at this body from its own eyes: the lens sits inside the
     * head, and the hair and the inside of the mouth are the parts that would
     * otherwise hang in front of it. Safe before the model has loaded.
     */
    setHeadVisible(visible) {
      headVisible = !!visible;
      for (const mesh of headMeshes) mesh.visible = headVisible;
    },
    /**
     * Between the two eye bones, world space -- where a lens goes to see from
     * this body's own eyes. Falls back to the head bone, then the root, so a
     * model without eye bones still gives somewhere sensible.
     */
    getEyePosition(out = new THREE.Vector3()) {
      const left = bones && bones.get(canon('Eye_L'));
      const right = bones && bones.get(canon('Eye_R'));
      if (left && right) {
        left.getWorldPosition(out);
        return out.add(right.getWorldPosition(_eyeOther)).multiplyScalar(0.5);
      }
      const head = bones && bones.get(canon('Head'));
      return head ? head.getWorldPosition(out) : out.copy(root.position);
    },
    setPosition(x, z) { root.position.set(x, 0, z); },
    get position() { return root.position; },
    setYaw(yaw) { root.rotation.y = yaw; },
    get yaw() { return root.rotation.y; },
    // Every setter below drops a non-finite value rather than storing it:
    // Math.max(0, NaN) and clamp(NaN) are both NaN, and one NaN here is NaN
    // on every bone by the next frame.
    setSpeed(v) { speed = Number.isFinite(v) ? Math.max(0, v) : 0; },
    /** A visual-only sample of the existing gait; never advances the owning actor's clock. */
    sampleReflectionPose({speed:visualSpeed=0,phase=0,time=0,visorLift=0}={}) {
      const saved={speed,gaitPhase,gaitName,crouchNow,turnNow,peekNow,twitchGain,elapsed,breathPhase,reflectionSample};
      try {
        reflectionSample=true;
        speed=Math.min(2.1,Math.max(0,visualSpeed));gaitPhase=phase;gaitName='player';
        crouchNow=turnNow=peekNow=0;twitchGain=0;elapsed=time;breathPhase=time*1.6;
        animate();
        if(visorLift>0&&bones){
          const arm=bones.get('right arm'),elbow=bones.get('right elbow');
          if(arm&&elbow){
            const upper=arm.quaternion.clone(),lower=elbow.quaternion.clone();
            const pose=correction>.5?[-1.9,2,1.1]:[-1.9,2.15,1.1];
            pose3('right arm',pose[0],0,pose[2]);bendElbow('right elbow',pose[1],true);
            arm.quaternion.slerpQuaternions(upper,arm.quaternion.clone(),visorLift);
            elbow.quaternion.slerpQuaternions(lower,elbow.quaternion.clone(),visorLift);
          }
        }
      } finally {
        ({speed,gaitPhase,gaitName,crouchNow,turnNow,peekNow,twitchGain,elapsed,breathPhase,reflectionSample}=saved);
      }
    },
    getRigBone(name) {return bones?.get(canon(name))||null;},

    /**
     * Stepping backwards (true) or forwards. The stride is the forward one
     * played in reverse, which is what walking backwards is: the planted foot
     * slides FORWARD under a body moving back over it, and the swing foot
     * reaches back. A catch's haul (jumpScares/dragged.js). reset() faces it
     * forwards again.
     */
    setBackwards(on) { stepSign = on ? -1 : 1; },
    /**
     * 0 standing, 1 crouched. Set it and leave it: the body eases between the
     * two itself, so a raw key state still animates down and up.
     *
     * Only the player profile has a crouch. The monster's table has no
     * crouched columns to blend into, so there this is stored and ignored.
     */
    setCrouch(v) { crouchTarget = Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0; },
    get crouch() { return crouchNow; },
    /**
     * How fast the body is turning, radians per second of yaw -- positive is
     * yaw increasing, which in this game is turning LEFT. Drives the lean into
     * a turn, smoothed and capped (TURN_RATE_MAX, TURN_LEAN_MAX) because a
     * mouse flick is a turn rate nobody's body follows. Inert in the monster
     * profile, whose turnLean is zero.
     */
    setTurnRate(w) {
      turnTarget = Number.isFinite(w) ? THREE.MathUtils.clamp(w, -TURN_RATE_MAX, TURN_RATE_MAX) : 0;
    },
    /** Which GAITS table drives this body. */
    get gait() { return gaitName; },
    setCorrection(value) {
      if (!Number.isFinite(value)) return;
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
     * The rig's own twitches on (true) or off. A jump scare turns them off: it
     * twitches the head itself, and two twitch layers on one neck read as a
     * broken rig rather than a living thing.
     */
    setTwitches(on) { twitchGain = on ? 1 : 0; },
    get twitchesEnabled() { return twitchGain > 0; },
    /**
     * Keep the crown under a ceiling `height` metres up (null for none): it
     * stoops for it, a little more each frame it is over and less once it is
     * clear. The backrooms set this; the house's ceilings are high enough.
     */
    setCeiling(height) {
      ceilingY = Number.isFinite(height) ? height : null;
      ceilingCurl = 0;
    },
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
    setPeek(v) { peekTarget = Number.isFinite(v) ? THREE.MathUtils.clamp(v, -1, 1) : 0; },
    get peek() { return peekNow; },
    /** Settles when the GLB is in, or has failed to be. Never rejects. */
    get ready() { return ready; },
    /**
     * Metres, and it MOVES WITH THE DIAL. The monster is 353 mm taller than
     * the man (2.202 against 1.849, measured by import_okabe.py), so anything
     * placing a light, a sightline or a camera off this has to be told which
     * reading it is looking at.
     *
     * THIS IS THE UPRIGHT HEIGHT AND THE THING NEVER STANDS UPRIGHT. The
     * monster hunches and bends its knees even standing still, and its
     * crouch takes more off the hips while it walks: measured at the head
     * bone (the base of the skull) at correction 0, 1.75-1.80 m standing,
     * 1.62-1.70 m at its 1.451 m/s walk and 1.48-1.67 m in the chase -- see
     * the table in GAITS.monster -- and the player profile's setCrouch()
     * takes 400 mm off the hips. Nothing reads this getter
     * today, so nothing is wrong yet; whoever hangs a sightline off it should
     * either accept that or ask the hips where they actually are.
     */
    get height() { return THREE.MathUtils.lerp(MONSTER_HEIGHT, height, correction) * scale; },
    get visible() { return visible; },
    set visible(v) { visible = v; group.visible = v; },
    update(dt) {
      if (!(dt > 0)) dt = 0;       // also catches NaN, which compares false
      elapsed += dt;
      const prof = GAITS[gaitName];
      // Crouch and turn first: strideNow() below reads the crouch, and so does
      // animate(), and the two must see the same number in the same frame.
      const crouchWant = prof.crouches ? crouchTarget : 0;
      crouchNow += (crouchWant - crouchNow) * (1 - Math.exp(-dt / CROUCH_TAU));
      turnNow += (turnTarget - turnNow) * (1 - Math.exp(-dt / TURN_TAU));
      // Breathing integrates its rate rather than multiplying elapsed by it:
      // the rate blends with the crouch, and elapsed * a changing rate jumps
      // the phase by however long the figure has existed.
      const w = THREE.MathUtils.smoothstep(speed, prof.walkFrom, prof.walkTo);
      const r = THREE.MathUtils.smoothstep(speed, prof.runFrom, prof.runTo);
      breathPhase = (breathPhase + blendEntry(prof.tune.breathRate, correction, w, r, crouchNow) * dt) % TAU;
      // Driven by DISTANCE, not by time, so the feet keep up with the body.
      // Wrapped, because every use of it is periodic in TAU and an hour of
      // walking is otherwise a phase in the tens of thousands.
      gaitPhase = (gaitPhase + stepSign * (speed / worldStride()) * TAU * dt) % TAU;
      // Exponential rather than linear, and framerate-independent: a linear
      // approach crosses the target and jitters on it at small dt.
      const tau = Math.abs(peekTarget) > Math.abs(peekNow) ? PEEK_OUT_TAU : PEEK_BACK_TAU;
      peekNow += (peekTarget - peekNow) * (1 - Math.exp(-dt / tau));
      animate();
      if (ceilingY !== null) stoopUnderCeiling(dt);
    },
    reset() {
      gaitPhase = 0;
      elapsed = 0;
      breathPhase = 0;
      grip.l = grip.r = 0;
      stepSign = 1;
      speed = 0;
      peekTarget = 0;
      peekNow = 0;
      crouchTarget = 0;
      crouchNow = 0;
      turnTarget = 0;
      turnNow = 0;
      correction = restCorrection;
      applyCorrection();
      // Pose NOW, not on the next update(). Some beats show the figure for a
      // fraction of a second and never tick it -- the Level 2 hallway strike
      // does exactly that -- and an un-animated rig is in its bind pose, arms
      // straight out. Creature.js's reset() ended the same way, for the same
      // reason, and the swap to this file lost it.
      animate();
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
